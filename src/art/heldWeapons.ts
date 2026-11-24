import type { WeaponKind } from '../core/gear';
import { OUTLINE } from './palette';

/**
 * 영웅이 손에 드는 무기 그림 (코드로 그린 픽셀 아트, 영웅 시트와 같은 1:1 크기).
 * 영웅 시트(PixelLab)에는 무기가 없어서, 장착한 무기를 손 위치에 따로 붙인다.
 * 희귀도 색이 무기 장식(보석·손잡이·화살 깃)에 들어간다.
 *
 * 모두 '오른쪽을 보는' 기준. pivot = 손으로 쥐는 점 (텍스처 안 픽셀 좌표).
 */
export interface HeldWeaponArt {
  canvas: HTMLCanvasElement;
  pivotX: number;
  pivotY: number;
  /** 끝(검 끝·활 가운데 앞·지팡이 보석)까지, pivot 기준 (회전 전) */
  tipX: number;
  tipY: number;
}

type Px = string | null;

class Grid {
  px: Px[][];
  constructor(
    public w: number,
    public h: number,
  ) {
    this.px = Array.from({ length: h }, () => Array<Px>(w).fill(null));
  }
  set(x: number, y: number, c: string): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  toCanvas(outline = true): HTMLCanvasElement {
    const out = this.px.map((r) => [...r]);
    if (outline)
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          if (this.px[y][x]) continue;
          const near = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => {
            const c = this.px[y + dy]?.[x + dx];
            return c && c !== STRING; // 활시위는 외곽선 없이 가늘게
          });
          if (near) out[y][x] = OUTLINE;
        }
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d')!;
    out.forEach((row, y) =>
      row.forEach((col, x) => {
        if (!col) return;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    return c;
  }
}

const METAL = { hi: '#f4f6ff', mid: '#b9c0d8', lo: '#7a82a6' };
const WOOD = { hi: '#b47a46', mid: '#8a5530', lo: '#5e3a26' };
const GOLD = { hi: '#ffe08a', lo: '#c4862a' };
const STRING = '#efe6d0';
/** 활대는 밝은 나무색 (붉은 망토 위에서 잘 보이게) */
const BOW_WOOD = { hi: '#f0c27a', mid: '#c98e4e', lo: '#8a5530' };

/** 희귀도별 장식 색 (일반·고급·희귀·영웅·전설) */
const ACCENT = ['#b8b4c8', '#6ad06a', '#6fb6ff', '#c98ae2', '#ffb84a'];
const ACCENT_HI = ['#e6e3f0', '#b6f5a8', '#c8e6ff', '#f0c8ff', '#fff0b0'];

/** 검: 가로로 그린 뒤 화면에서 손목 각도로 돌린다. 길이 24 */
function sword(r: number): HeldWeaponArt {
  const g = new Grid(26, 9);
  const cy = 4;
  const fancy = r >= 3;
  // 칼날
  for (let x = 7; x <= 22; x++) {
    g.set(x, cy - 1, METAL.hi);
    g.set(x, cy, METAL.mid);
    g.set(x, cy + 1, METAL.lo);
  }
  g.set(23, cy, METAL.mid);
  g.set(23, cy - 1, METAL.hi);
  g.set(24, cy, METAL.hi);
  // 희귀 이상: 칼날 가운데 홈에 희귀도 색
  if (r >= 2) for (let x = 8; x <= 18; x++) g.set(x, cy, ACCENT[r]);
  // 코등이
  const guard = fancy ? GOLD : { hi: METAL.hi, lo: METAL.lo };
  g.line(6, cy - 3, 6, cy + 3, guard.lo);
  g.line(5, cy - 2, 5, cy + 2, guard.hi);
  if (fancy) {
    g.set(6, cy - 4, GOLD.hi);
    g.set(6, cy + 4, GOLD.hi);
  }
  // 손잡이
  g.line(1, cy, 4, cy, WOOD.lo);
  g.set(2, cy, WOOD.mid);
  // 폼멜 = 희귀도 보석
  g.set(0, cy, ACCENT[r]);
  g.set(0, cy - 1, ACCENT_HI[r]);
  return { canvas: g.toCanvas(), pivotX: 3, pivotY: cy + 0.5, tipX: 21, tipY: 0 };
}

/** 활: 세로. 몸통이 앞(오른쪽)으로 휘고 시위는 몸 쪽. drawn=true 면 시위를 당긴 모습 */
function bow(r: number, drawn: boolean): HeldWeaponArt {
  const H = 26;
  const g = new Grid(12, H);
  const sx = drawn ? 1 : 4; // 시위 가운데 x
  const mid = (H - 1) / 2;
  // 활대 (2px 두께)
  for (let y = 1; y < H - 1; y++) {
    const t = (y - 1) / (H - 3);
    const x = 5 + Math.round(4 * Math.sin(Math.PI * t));
    g.set(x, y, y < mid ? BOW_WOOD.hi : BOW_WOOD.mid);
    g.set(x - 1, y, y < mid ? BOW_WOOD.mid : BOW_WOOD.lo);
  }
  // 활 끝 장식 (희귀도 색)
  g.set(5, 0, ACCENT[r]);
  g.set(5, H - 1, ACCENT[r]);
  if (r >= 3) {
    g.set(6, 1, ACCENT_HI[r]);
    g.set(6, H - 2, ACCENT_HI[r]);
  }
  // 손잡이 감개
  for (let y = Math.floor(mid) - 2; y <= Math.ceil(mid) + 2; y++) g.set(9, y, ACCENT[r]);
  g.set(8, Math.round(mid), ACCENT_HI[r]);
  // 시위
  g.line(5, 1, sx, mid, STRING);
  g.line(sx, mid, 5, H - 2, STRING);
  // 당긴 상태: 화살을 걸어 둔다
  if (drawn) {
    g.line(sx, Math.round(mid), 11, Math.round(mid), METAL.mid);
    g.set(11, Math.round(mid), METAL.hi);
    g.set(sx + 1, Math.round(mid) - 1, ACCENT[r]);
    g.set(sx + 1, Math.round(mid) + 1, ACCENT[r]);
  }
  return { canvas: g.toCanvas(), pivotX: 9, pivotY: mid + 0.5, tipX: 2, tipY: 0 };
}

/** 지팡이: 세로. 손은 아래쪽, 머리에 희귀도 색 보석 */
function staff(r: number): HeldWeaponArt {
  const g = new Grid(11, 38);
  const cx = 5;
  // 자루
  for (let y = 10; y <= 37; y++) {
    g.set(cx, y, WOOD.mid);
    g.set(cx + 1, y, WOOD.lo);
  }
  g.set(cx, 37, GOLD.lo);
  g.set(cx + 1, 37, GOLD.lo);
  // 머리 장식 (갈래)
  const claw = r >= 3 ? GOLD : { hi: WOOD.hi, lo: WOOD.lo };
  g.line(cx - 3, 2, cx - 2, 9, claw.lo);
  g.line(cx + 4, 2, cx + 3, 9, claw.lo);
  g.line(cx - 2, 9, cx + 3, 9, claw.hi);
  // 보석
  for (let y = 2; y <= 7; y++)
    for (let x = cx - 2; x <= cx + 3; x++) {
      const d = Math.hypot(x - (cx + 0.5), y - 4.5);
      if (d <= 2.8) g.set(x, y, ACCENT[r]);
    }
  g.set(cx - 1, 3, ACCENT_HI[r]);
  g.set(cx, 3, '#ffffff');
  // 손잡이 감개
  for (let y = 23; y <= 26; y++) g.set(cx, y, ACCENT[r]);
  return { canvas: g.toCanvas(), pivotX: cx + 1, pivotY: 25, tipX: 0, tipY: -20.5 };
}

const cache = new Map<string, HeldWeaponArt>();

export function heldWeaponKey(kind: WeaponKind, rarity: number, drawn = false): string {
  return `held-${kind}-${rarity}${drawn ? '-drawn' : ''}`;
}

export function heldWeaponArt(kind: WeaponKind, rarity: number, drawn = false): HeldWeaponArt {
  const key = heldWeaponKey(kind, rarity, drawn);
  let a = cache.get(key);
  if (!a) {
    a = kind === 'sword' ? sword(rarity) : kind === 'bow' ? bow(rarity, drawn) : staff(rarity);
    cache.set(key, a);
  }
  return a;
}

/**
 * 영웅 시트 프레임별 '앞손' 위치 (76x76 칸 안 픽셀 좌표)와 팔 흔들림 각도.
 * 세 시트(머리 모양만 다름)는 몸이 같아서 하나로 쓴다.
 * 0~3 숨쉬기, 4~9 걷기, 10~18 베기(전사는 시트에 검이 그려져 있어 숨김).
 */
export const HAND: { x: number; y: number; swing: number }[] = [
  { x: 39, y: 46, swing: 0 },
  { x: 39, y: 46, swing: 0 },
  { x: 39, y: 45, swing: 0 },
  { x: 39, y: 46, swing: 0 },
  { x: 40, y: 46, swing: -4 },
  { x: 42, y: 45, swing: -10 },
  { x: 40, y: 45, swing: -4 },
  { x: 38, y: 47, swing: 6 },
  { x: 36, y: 46, swing: 10 },
  { x: 37, y: 47, swing: 6 },
];

/** 무기 종류별 손 위치 보정 (몸 앞으로 내밀어 몸통과 겹치지 않게) */
export const GRIP_OFFSET: Record<WeaponKind, { x: number; y: number }> = {
  sword: { x: 0, y: 0 },
  bow: { x: 5, y: -3 },
  staff: { x: 3, y: 0 },
};

/** 무기 종류별 기본 쥐는 각도 (도, 시계 방향 +) */
export const GRIP_ANGLE: Record<WeaponKind, number> = {
  sword: 38, // 칼끝이 앞-아래
  bow: -12,
  staff: -8, // 위쪽이 살짝 앞으로
};

/** 초상화(성장 탭·가문 탭의 현 가주)에도 든 무기를 그려 넣는다 */
const portraitCache = new Map<string, string>();
export function portraitWithWeapon(base: HTMLCanvasElement | HTMLImageElement, lookKey: string, kind: WeaponKind, rarity: number, crop: { x: number; y: number; w: number; h: number }): string {
  const key = `${lookKey}|${kind}|${rarity}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = crop.w;
  c.height = crop.h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  const art = heldWeaponArt(kind, rarity);
  const h = HAND[0];
  const o = GRIP_OFFSET[kind];
  ctx.save();
  ctx.translate(Math.round(h.x + o.x - crop.x), Math.round(h.y + o.y - crop.y));
  ctx.rotate((GRIP_ANGLE[kind] * Math.PI) / 180);
  ctx.drawImage(art.canvas, -Math.round(art.pivotX), -Math.round(art.pivotY));
  ctx.restore();
  const url = c.toDataURL();
  portraitCache.set(key, url);
  return url;
}
