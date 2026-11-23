import sheetUrl from '../assets/hero/hero_b.png';
import type { Genes } from '../core/genetics';
import { HAIR, SKIN, hexToRgb } from './palette';

/**
 * PixelLab으로 만든 영웅 B의 스프라이트 시트 (76x76 칸 19프레임).
 * 유전자에 따라 머리색·피부색을 바꿔 칠해서 자녀가 부모를 닮게 한다.
 */
export const FRAME = 76;
export const FEET_Y = 61; // 칸 안에서 발바닥 위치
export const ANIMS = {
  idle: { start: 0, end: 3, frameRate: 4, repeat: -1 },
  walk: { start: 4, end: 9, frameRate: 10, repeat: -1 },
  slash: { start: 10, end: 18, frameRate: 24, repeat: 0 },
} as const;
const FRAME_COUNT = 19;

/** 원본 그림의 머리카락 색 (어두운 보라빛 갈색) */
const SRC_HAIR = ['150f11', '1d161b', '291619', '2a1925', '2f1d28', '3b2933', '422735', '442d3a'];
/** 원본 그림의 피부색 */
const SRC_SKIN = ['d58072', 'ea9a8b', 'e7b6ae', 'f5b3a0', 'fbc6b8'];
/** 머리카락은 머리 부분에만 칠한다 (같은 색이 옷 그림자에도 쓰여서) */
const HEAD_ROWS = 24;

let base: HTMLImageElement | null = null;

export function loadHeroSheet(): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      base = img;
      resolve();
    };
    img.onerror = reject;
    img.src = sheetUrl;
  });
}

const lum = (hex: string) => {
  const [r, g, b] = hexToRgb('#' + hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** 원본 색들을 밝기 순으로 목표 색 띠(어두움→밝음)에 대응시킨다 */
function rampMap(src: string[], stops: string[]): Map<number, [number, number, number]> {
  const ls = src.map(lum);
  const lo = Math.min(...ls);
  const hi = Math.max(...ls);
  const cols = stops.map((s) => hexToRgb(s));
  const m = new Map<number, [number, number, number]>();
  src.forEach((h, i) => {
    const t = hi === lo ? 0.5 : (ls[i] - lo) / (hi - lo);
    const f = t * (cols.length - 1);
    const k = Math.min(cols.length - 2, Math.floor(f));
    const u = f - k;
    const c = cols[k].map((v, j) => Math.round(v + (cols[k + 1][j] - v) * u)) as [number, number, number];
    m.set(parseInt(h, 16), c);
  });
  return m;
}

function darker(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  return '#' + [r, g, b].map((v) => Math.round(v * f).toString(16).padStart(2, '0')).join('');
}

const cache = new Map<string, HTMLCanvasElement>();

/** 유전자에 맞게 색을 바꾼 전체 시트 */
export function heroSheetCanvas(genes: Genes): HTMLCanvasElement {
  const key = `${genes.hairColor}-${genes.skinTone}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!base) throw new Error('hero sheet not loaded');

  const c = document.createElement('canvas');
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(base, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;

  const hr = HAIR[genes.hairColor % HAIR.length].ramp;
  const hairMap = rampMap(SRC_HAIR, [darker(hr[0], 0.6), hr[0], hr[1], hr[2]]);
  const sk = SKIN[genes.skinTone % SKIN.length];
  const skinMap = rampMap(SRC_SKIN, [darker(sk[0], 0.85), sk[0], sk[1], sk[2]]);

  for (let f = 0; f < FRAME_COUNT; f++) {
    // 프레임마다 머리 꼭대기를 찾아서 머리 영역만 머리색을 바꾼다
    let top = FRAME;
    for (let y = 0; y < FRAME && top === FRAME; y++)
      for (let x = 0; x < FRAME; x++)
        if (d[(y * c.width + f * FRAME + x) * 4 + 3] > 0) {
          top = y;
          break;
        }
    for (let y = 0; y < FRAME; y++)
      for (let x = 0; x < FRAME; x++) {
        const p = (y * c.width + f * FRAME + x) * 4;
        if (d[p + 3] === 0) continue;
        const rgb = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2];
        const to = (y - top <= HEAD_ROWS && hairMap.get(rgb)) || skinMap.get(rgb);
        if (to) [d[p], d[p + 1], d[p + 2]] = to;
      }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

const portraitCache = new Map<string, string>();

/** UI용 초상화 (대기 첫 프레임, 여백을 잘라 낸 이미지 URL) */
export function heroPortraitUrl(genes: Genes): string {
  const key = `${genes.hairColor}-${genes.skinTone}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const sheet = heroSheetCanvas(genes);
  const c = document.createElement('canvas');
  // 캐릭터가 차지하는 영역 (칸 가운데, 발 y=61)
  const w = 40;
  const h = 56;
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(sheet, (FRAME - w) / 2, FEET_Y - h + 1, w, h, 0, 0, w, h);
  const url = c.toDataURL();
  portraitCache.set(key, url);
  return url;
}
