#!/usr/bin/env python3
"""
이미지 AI 결과물 → 게임에 바로 쓰는 픽셀 스프라이트로 다듬는 도구.

이미지 AI(특히 범용 AI)는 '픽셀처럼 보이는 그림'을 만든다. 실제로는
  - 픽셀 칸이 고르지 않고 (한 칸이 7.3px, 8.1px …)
  - 색이 수백 가지이며 (가장자리 번짐, 압축 노이즈)
  - 배경이 깔려 있다.
이 도구는 그걸 진짜 픽셀아트로 바꾼다.

  clean   배경 제거 → 픽셀 격자로 축소(칸마다 최빈색) → 프로젝트 팔레트로 색 고정 → 여백 자르기
  pack    여러 프레임 PNG → 스프라이트 시트 + Phaser 아틀라스 JSON
  swatch  팔레트 견본 이미지 만들기 (이미지 AI에 참고 이미지로 넣을 때 사용)

예)
  python3 tools/pixelize.py clean art/raw/slime.png -o art/out --width 32 --preview 8
  python3 tools/pixelize.py clean art/raw/*.png -o art/out --auto
  python3 tools/pixelize.py pack art/out/bat_*.png -o public/assets/bat
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
DEFAULT_PALETTE = HERE / "palette.hex"


# ───────────────────────── 팔레트 ─────────────────────────
def load_palette(path: Path) -> np.ndarray:
    cols = []
    for line in path.read_text().splitlines():
        line = line.strip().lstrip("#")
        if len(line) == 6:
            cols.append([int(line[i : i + 2], 16) for i in (0, 2, 4)])
    if not cols:
        sys.exit(f"팔레트가 비어 있어요: {path}")
    return np.array(cols, dtype=np.float64)


def _srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """사람 눈 기준으로 가까운 색을 고르기 위해 CIELAB으로 변환"""
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def map_to_palette(rgb: np.ndarray, palette: np.ndarray) -> np.ndarray:
    flat = rgb.reshape(-1, 3).astype(np.float64)
    lab = _srgb_to_lab(flat)
    plab = _srgb_to_lab(palette)
    d = ((lab[:, None, :] - plab[None, :, :]) ** 2).sum(-1)
    return palette[d.argmin(1)].reshape(rgb.shape).astype(np.uint8)


# ───────────────────────── 배경 제거 ─────────────────────────
def remove_background(img: np.ndarray, tolerance: float) -> np.ndarray:
    """가장자리에서 시작해 배경색과 비슷한 영역을 투명하게 (flood fill)"""
    h, w, _ = img.shape
    if img[..., 3].min() < 250:  # 이미 투명 배경
        return img
    rgb = img[..., :3].astype(np.int32)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.array(Counter(map(tuple, (border // 8) * 8)).most_common(1)[0][0]) + 4
    close = np.sqrt(((rgb - bg) ** 2).sum(-1)) < tolerance
    seen = np.zeros((h, w), bool)
    stack = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x] or not close[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    out = img.copy()
    out[seen, 3] = 0
    return out


# ───────────────────────── 격자 추정 / 축소 ─────────────────────────
def detect_pixel_size(img: np.ndarray) -> float:
    """한 픽셀이 실제 몇 px인지 추정.
    색 경계는 '픽셀 칸 경계'에서만 생긴다 → 가로/세로로 경계 세기를 모아 1차원 신호를 만들고,
    그 신호가 가장 강하게 반복되는 주기를 푸리에 변환으로 찾는다. (노이즈·번짐에 강함)"""
    from PIL import ImageFilter

    gray = np.array(Image.fromarray(img[..., :3]).convert("L").filter(ImageFilter.MedianFilter(3)), dtype=np.float64)
    a = img[..., 3].astype(np.float64) / 255
    dx = np.abs(np.diff(gray, axis=1))
    dy = np.abs(np.diff(gray, axis=0))
    # 압축 노이즈 수준의 작은 변화는 버린다
    gx = (np.where(dx > 12, dx, 0) * a[:, 1:] * a[:, :-1]).sum(0)
    gy = (np.where(dy > 12, dy, 0) * a[1:] * a[:-1]).sum(1)
    cands = np.arange(3.0, 64.0, 0.05)
    score = np.zeros_like(cands)
    for sig in (gx, gy):
        if sig.sum() == 0:
            continue
        sig = sig - np.convolve(sig, np.ones(9) / 9, mode="same")  # 큰 형태(실루엣) 성분 제거
        sig = np.clip(sig, 0, None)
        x = np.arange(len(sig))
        for i, p in enumerate(cands):
            score[i] += np.abs((sig * np.exp(-2j * np.pi * x / p)).sum()) / (sig.sum() + 1e-9)
    if score.max() <= 0:
        return 1.0
    # p/2, p/3 같은 배음도 점수가 높으므로, 충분히 강한 것 중 가장 큰 주기를 고른다
    strong = cands[score >= score.max() * 0.75]
    return float(strong.max())


def downscale_mode(img: np.ndarray, out_w: int, out_h: int, alpha_cut: float) -> np.ndarray:
    """목표 칸마다 '가장 많이 나온 색'을 고른다. 평균(blur)과 달리 경계가 번지지 않는다."""
    h, w, _ = img.shape
    out = np.zeros((out_h, out_w, 4), np.uint8)
    for oy in range(out_h):
        y0, y1 = int(oy * h / out_h), max(int(oy * h / out_h) + 1, int((oy + 1) * h / out_h))
        for ox in range(out_w):
            x0, x1 = int(ox * w / out_w), max(int(ox * w / out_w) + 1, int((ox + 1) * w / out_w))
            # 칸 가장자리는 이웃 색이 섞이므로 안쪽 60%만 본다
            my, mx = (y1 - y0) // 5, (x1 - x0) // 5
            block = img[y0 + my : y1 - my or y1, x0 + mx : x1 - mx or x1].reshape(-1, 4)
            opaque = block[block[:, 3] > 127]
            if len(opaque) < len(block) * alpha_cut:
                continue
            q = (opaque[:, :3] // 12) * 12
            key, _ = Counter(map(tuple, q)).most_common(1)[0]
            sel = opaque[(q == key).all(1)]
            out[oy, ox, :3] = sel[:, :3].mean(0)
            out[oy, ox, 3] = 255
    return out


def reduce_colors(img: np.ndarray, n: int) -> np.ndarray:
    """경계 번짐에서 생긴 어중간한 색을 정리: 불투명 픽셀만 n색으로 줄인다"""
    mask = img[..., 3] > 0
    if mask.sum() == 0:
        return img
    pix = img[..., :3][mask]
    strip = Image.fromarray(pix[None].astype(np.uint8))
    q = np.array(strip.quantize(n, method=Image.Quantize.MEDIANCUT).convert("RGB"))[0]
    out = img.copy()
    out[..., :3][mask] = q
    return out


def add_outline(img: np.ndarray, color: tuple[int, int, int]) -> np.ndarray:
    a = img[..., 3] > 0
    grown = a.copy()
    grown[1:] |= a[:-1]
    grown[:-1] |= a[1:]
    grown[:, 1:] |= a[:, :-1]
    grown[:, :-1] |= a[:, 1:]
    edge = grown & ~a
    out = img.copy()
    out[edge] = [*color, 255]
    return out


def trim(img: np.ndarray, pad: int) -> np.ndarray:
    ys, xs = np.nonzero(img[..., 3])
    if len(ys) == 0:
        return img
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cut = img[y0:y1, x0:x1]
    return np.pad(cut, ((pad, pad), (pad, pad), (0, 0)))


# ───────────────────────── 명령 ─────────────────────────
def cmd_clean(a: argparse.Namespace) -> None:
    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    palette = None if a.no_palette else load_palette(Path(a.palette))
    for src in a.inputs:
        src = Path(src)
        img = np.array(Image.open(src).convert("RGBA"))
        if a.bg != "none":
            img = remove_background(img, a.tolerance)

        # 내용이 있는 영역만 남기고 격자 계산
        img = trim(img, 0)
        h, w, _ = img.shape
        if a.width:
            out_w = a.width
            out_h = a.height or max(1, round(h * a.width / w))
        else:
            p = detect_pixel_size(img)
            out_w, out_h = max(1, round(w / p)), max(1, round(h / p))
            print(f"  {src.name}: 추정 픽셀 크기 {p:.2f}px → {out_w}x{out_h}")

        small = downscale_mode(img, out_w, out_h, a.alpha_cut)
        if a.max_colors:
            small = reduce_colors(small, a.max_colors)
        if palette is not None:
            mask = small[..., 3] > 0
            small[..., :3][mask] = map_to_palette(small[..., :3][mask][None], palette)[0]
        if a.outline:
            col = a.outline.lstrip("#")
            small = add_outline(small, tuple(int(col[i : i + 2], 16) for i in (0, 2, 4)))
        small = trim(small, a.pad)

        name = out_dir / f"{src.stem}.png"
        Image.fromarray(small).save(name)
        colors = len({tuple(c) for c in small[small[..., 3] > 0][:, :3]})
        print(f"✓ {name}  ({small.shape[1]}x{small.shape[0]}, {colors}색)")
        if a.preview:
            prev = Image.fromarray(small).resize((small.shape[1] * a.preview, small.shape[0] * a.preview), Image.NEAREST)
            prev.save(out_dir / f"{src.stem}@{a.preview}x.png")


def cmd_pack(a: argparse.Namespace) -> None:
    frames = [(Path(p), Image.open(p).convert("RGBA")) for p in sorted(a.inputs)]
    if not frames:
        sys.exit("프레임이 없어요")
    fw = max(f.width for _, f in frames)
    fh = max(f.height for _, f in frames)
    cols = a.columns or math.ceil(math.sqrt(len(frames)))
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGBA", (cols * fw, rows * fh))
    atlas: dict = {"frames": {}, "meta": {"image": "", "size": {"w": cols * fw, "h": rows * fh}, "scale": "1"}}
    for i, (path, f) in enumerate(frames):
        x, y = (i % cols) * fw, (i // cols) * fh
        # 프레임은 바닥 중앙 정렬 (발 위치 고정 → 애니메이션이 흔들리지 않음)
        ox, oy = x + (fw - f.width) // 2, y + (fh - f.height)
        sheet.paste(f, (ox, oy))
        atlas["frames"][path.stem] = {
            "frame": {"x": x, "y": y, "w": fw, "h": fh},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
            "sourceSize": {"w": fw, "h": fh},
        }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out.with_suffix(".png"))
    atlas["meta"]["image"] = out.with_suffix(".png").name
    out.with_suffix(".json").write_text(json.dumps(atlas, indent=2, ensure_ascii=False))
    print(f"✓ {out.with_suffix('.png')} + .json  ({len(frames)}프레임, {fw}x{fh})")


def cmd_swatch(a: argparse.Namespace) -> None:
    pal = load_palette(Path(a.palette)).astype(np.uint8)
    cols = 8
    rows = math.ceil(len(pal) / cols)
    img = np.zeros((rows, cols, 3), np.uint8)
    for i, c in enumerate(pal):
        img[i // cols, i % cols] = c
    Image.fromarray(img).resize((cols * a.cell, rows * a.cell), Image.NEAREST).save(a.out)
    print(f"✓ {a.out} ({len(pal)}색)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("clean", help="AI 이미지 → 픽셀 스프라이트")
    c.add_argument("inputs", nargs="+")
    c.add_argument("-o", "--out", default="art/out")
    c.add_argument("--width", type=int, help="결과 가로 픽셀 수 (예: 32). 없으면 자동 추정")
    c.add_argument("--height", type=int, help="결과 세로 픽셀 수 (기본: 비율 유지)")
    c.add_argument("--palette", default=str(DEFAULT_PALETTE))
    c.add_argument("--no-palette", action="store_true", help="팔레트 고정 끄기")
    c.add_argument("--bg", choices=["auto", "none"], default="auto", help="배경 제거")
    c.add_argument("--tolerance", type=float, default=40, help="배경색 허용 오차 (클수록 많이 지움)")
    c.add_argument("--alpha-cut", type=float, default=0.5, help="칸의 몇 % 이상이 불투명해야 픽셀로 남길지")
    c.add_argument("--max-colors", type=int, default=0, help="팔레트 적용 전 최대 색 수 (예: 12). 번진 중간색 정리")
    c.add_argument("--outline", help="1px 외곽선 색 (예: 1a1426)")
    c.add_argument("--pad", type=int, default=1)
    c.add_argument("--preview", type=int, default=0, help="N배 확대 미리보기도 저장")
    c.set_defaults(fn=cmd_clean)

    p = sub.add_parser("pack", help="프레임들 → 스프라이트 시트 + 아틀라스")
    p.add_argument("inputs", nargs="+")
    p.add_argument("-o", "--out", required=True, help="출력 경로 (확장자 없이)")
    p.add_argument("--columns", type=int)
    p.set_defaults(fn=cmd_pack)

    s = sub.add_parser("swatch", help="팔레트 견본 이미지")
    s.add_argument("-o", "--out", default="art/palette_swatch.png")
    s.add_argument("--palette", default=str(DEFAULT_PALETTE))
    s.add_argument("--cell", type=int, default=32)
    s.set_defaults(fn=cmd_swatch)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
