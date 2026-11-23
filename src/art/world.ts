import { hexToRgb, mix, rgbToHex } from './palette';

/**
 * 절차적 배경. 모든 레이어는 가로 192px 단위로 이어 붙일 수 있게(tileable) 만든다.
 * 레이어는 '낮' 색으로 그리고, 장면에서 나이(=하루 시간대)에 따라 색조(tint)를 곱한다.
 */
export const WORLD_W = 192;

export interface Biome {
  name: string;
  far: [string, string];
  mid: [string, string, string];
  ground: { top: string; topLight: string; dirt: string; dirtDark: string; stone: string };
  midKind: 'hills' | 'pines' | 'ruins';
}

export const BIOMES: Biome[] = [
  {
    name: '초록 들판',
    far: ['#7f9bd0', '#a7bfe6'],
    mid: ['#2f6e4a', '#4a9a5a', '#7cc46a'],
    ground: { top: '#5cae4a', topLight: '#9be06a', dirt: '#7a5236', dirtDark: '#5a3a26', stone: '#9a8a7a' },
    midKind: 'hills',
  },
  {
    name: '안개 숲',
    far: ['#6a6aa8', '#8f8fc8'],
    mid: ['#1e3a3a', '#2e5a4a', '#4a8062'],
    ground: { top: '#3e7a52', topLight: '#6aae6a', dirt: '#4e3a3a', dirtDark: '#3a2a2e', stone: '#7a7a8a' },
    midKind: 'pines',
  },
  {
    name: '잿빛 유적',
    far: ['#8a6a7a', '#b08a8a'],
    mid: ['#4a3a4a', '#6a5462', '#927a82'],
    ground: { top: '#8a7a5a', topLight: '#c0aa7a', dirt: '#5a4436', dirtDark: '#3e2e26', stone: '#a0948a' },
    midKind: 'ruins',
  },
  {
    name: '얼어붙은 설원',
    far: ['#a8c4e0', '#d8e8f4'],
    mid: ['#2a4a5a', '#3e6a7a', '#7ab0c0'],
    ground: { top: '#e6f0f8', topLight: '#ffffff', dirt: '#9ab4cc', dirtDark: '#7c96b2', stone: '#c8d8e8' },
    midKind: 'pines',
  },
  {
    name: '불타는 화산',
    far: ['#3a2232', '#5a2e3a'],
    mid: ['#1e1424', '#2e1e30', '#4a2a3a'],
    ground: { top: '#3a2a30', topLight: '#ff8a3a', dirt: '#2a1c22', dirtDark: '#1a1016', stone: '#5a3a3a' },
    midKind: 'ruins',
  },
];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** 주기 함수 합으로 만든 이어지는 능선 */
function ridge(x: number, seeds: [number, number, number][]): number {
  let v = 0;
  for (const [amp, freq, phase] of seeds) v += amp * Math.sin((x / WORLD_W) * Math.PI * 2 * freq + phase);
  return v;
}

export function farLayer(b: Biome): HTMLCanvasElement {
  const H = 70;
  const [c, ctx] = canvas(WORLD_W, H);
  const draw = (color: string, base: number, seeds: [number, number, number][]) => {
    ctx.fillStyle = color;
    for (let x = 0; x < WORLD_W; x++) {
      const y = Math.round(base + ridge(x, seeds));
      ctx.fillRect(x, y, 1, H - y);
    }
  };
  draw(b.far[1], 30, [
    [9, 2, 0.3],
    [5, 5, 1.7],
    [2, 11, 0.2],
  ]);
  draw(b.far[0], 44, [
    [7, 3, 2.1],
    [4, 7, 0.9],
    [1.5, 13, 2.2],
  ]);
  // 눈 덮인 봉우리 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 0; x < WORLD_W; x++) {
    const y = Math.round(30 + ridge(x, [[9, 2, 0.3], [5, 5, 1.7], [2, 11, 0.2]]));
    if (y < 26) ctx.fillRect(x, y, 1, 2);
  }
  return c;
}

export function midLayer(b: Biome): HTMLCanvasElement {
  const H = 70;
  const [c, ctx] = canvas(WORLD_W, H);
  const [dark, base, light] = b.mid;
  if (b.midKind === 'hills') {
    ctx.fillStyle = base;
    for (let x = 0; x < WORLD_W; x++) {
      const y = Math.round(40 + ridge(x, [[6, 2, 1], [3, 5, 0.4]]));
      ctx.fillRect(x, y, 1, H - y);
      ctx.fillStyle = light;
      ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = base;
    }
    // 둥근 나무들
    for (let i = 0; i < 7; i++) {
      const tx = (i * 29 + 7) % WORLD_W;
      const ty = 36 + ((i * 13) % 9);
      const r = 6 + (i % 3);
      ctx.fillStyle = '#3a2a1e';
      ctx.fillRect(tx - 1, ty, 2, 10);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const lit = dx + dy < -r * 0.5;
          const shade = dx + dy > r * 0.6;
          ctx.fillStyle = lit ? light : shade ? dark : base;
          const px = (tx + dx + WORLD_W) % WORLD_W;
          ctx.fillRect(px, ty - r + dy, 1, 1);
        }
    }
  } else if (b.midKind === 'pines') {
    ctx.fillStyle = dark;
    ctx.fillRect(0, 56, WORLD_W, H - 56);
    for (let i = 0; i < 12; i++) {
      const tx = (i * 16 + ((i * 7) % 5)) % WORLD_W;
      const hgt = 26 + ((i * 11) % 14);
      const top = 60 - hgt;
      for (let y = 0; y < hgt; y++) {
        const half = Math.floor((y / hgt) * 7) + 1 - (y % 6 === 5 ? 1 : 0);
        for (let dx = -half; dx <= half; dx++) {
          ctx.fillStyle = dx < -half / 2 ? light : dx > half / 3 ? dark : base;
          ctx.fillRect((tx + dx + WORLD_W) % WORLD_W, top + y, 1, 1);
        }
      }
    }
  } else {
    ctx.fillStyle = base;
    for (let x = 0; x < WORLD_W; x++) {
      const y = Math.round(52 + ridge(x, [[3, 3, 0.5]]));
      ctx.fillRect(x, y, 1, H - y);
    }
    // 무너진 기둥과 아치
    const pillars = [12, 44, 58, 110, 150, 166];
    pillars.forEach((px, i) => {
      const hgt = 18 + ((i * 17) % 22);
      const top = 56 - hgt;
      ctx.fillStyle = base;
      ctx.fillRect(px, top, 8, hgt);
      ctx.fillStyle = light;
      ctx.fillRect(px, top, 2, hgt);
      ctx.fillStyle = dark;
      ctx.fillRect(px + 6, top, 2, hgt);
      ctx.fillRect(px - 1, top, 10, 2);
      for (let y = top + 5; y < 56; y += 6) ctx.fillRect(px + 2, y, 4, 1);
    });
    ctx.fillStyle = base;
    ctx.fillRect(44, 24, 22, 4);
    ctx.fillStyle = light;
    ctx.fillRect(44, 24, 22, 1);
  }
  return c;
}

export function groundLayer(b: Biome): HTMLCanvasElement {
  const H = 40;
  const [c, ctx] = canvas(WORLD_W, H);
  const g = b.ground;
  ctx.fillStyle = g.dirt;
  ctx.fillRect(0, 0, WORLD_W, H);
  // 흙 디더링 (픽셀아트 질감)
  ctx.fillStyle = g.dirtDark;
  for (let y = 6; y < H; y++)
    for (let x = 0; x < WORLD_W; x++) {
      const n = (x * 73 + y * 151 + ((x * y) % 7)) % 23;
      if (n === 0 || (y > 24 && n < 3) || (y > 32 && (x + y) % 2 === 0)) ctx.fillRect(x, y, 1, 1);
    }
  // 돌
  for (let i = 0; i < 9; i++) {
    const sx = (i * 23 + 5) % WORLD_W;
    const sy = 12 + ((i * 7) % 20);
    ctx.fillStyle = g.stone;
    ctx.fillRect(sx, sy, 3, 2);
    ctx.fillStyle = '#ffffff33';
    ctx.fillRect(sx, sy, 1, 1);
    ctx.fillStyle = g.dirtDark;
    ctx.fillRect(sx, sy + 2, 3, 1);
  }
  // 잔디 윗면
  ctx.fillStyle = g.top;
  ctx.fillRect(0, 0, WORLD_W, 5);
  for (let x = 0; x < WORLD_W; x++) {
    const hang = (x * 37) % 5 === 0 ? 3 : (x * 17) % 3 === 0 ? 1 : 0;
    ctx.fillRect(x, 5, 1, hang + 1);
  }
  ctx.fillStyle = g.topLight;
  for (let x = 0; x < WORLD_W; x++) {
    if ((x * 29) % 7 < 2) ctx.fillRect(x, 0, 1, 1);
    // 풀잎
    if ((x * 53) % 11 === 0) {
      ctx.fillRect(x, -0, 1, 2);
    }
  }
  return c;
}

/** 하늘 키프레임: 인생 진행도(0=청년 새벽 → 1=노년 밤) */
const SKY_KEYS: { t: number; top: string; bottom: string; ambient: string }[] = [
  { t: 0, top: '#3d4a92', bottom: '#f4a988', ambient: '#e6c8dc' },
  { t: 0.18, top: '#4a8ce0', bottom: '#b4e2f6', ambient: '#ffffff' },
  { t: 0.55, top: '#4382d8', bottom: '#a8dcf2', ambient: '#ffffff' },
  { t: 0.75, top: '#5a5cae', bottom: '#ffbc72', ambient: '#ffe2bc' },
  { t: 0.9, top: '#3a2a70', bottom: '#ff7c5c', ambient: '#e8a8a4' },
  { t: 1, top: '#10123a', bottom: '#40326e', ambient: '#7a78b4' },
];

export function skyAt(t: number): { top: string; bottom: string; ambient: string } {
  const k = SKY_KEYS;
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i].t) {
      const u = (t - k[i - 1].t) / (k[i].t - k[i - 1].t);
      return {
        top: mix(k[i - 1].top, k[i].top, u),
        bottom: mix(k[i - 1].bottom, k[i].bottom, u),
        ambient: mix(k[i - 1].ambient, k[i].ambient, u),
      };
    }
  }
  return k[k.length - 1];
}

/** 하늘을 띠 + 4x4 베이어 디더링으로 그린다 (픽셀아트 그라데이션) */
export function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string): void {
  const bands = 8;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cols: string[] = [];
  for (let i = 0; i <= bands; i++) cols.push(mix(top, bottom, i / bands));
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const f = (y / (h - 1)) * bands;
    const i0 = Math.floor(f);
    const frac = f - i0;
    for (let x = 0; x < w; x++) {
      const threshold = (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      const col = hexToRgb(cols[Math.min(bands, frac > threshold ? i0 + 1 : i0)]);
      const p = (y * w + x) * 4;
      img.data[p] = col[0];
      img.data[p + 1] = col[1];
      img.data[p + 2] = col[2];
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function cloudCanvas(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(40, 14);
  const blobs = [
    [10, 9, 6],
    [18, 7, 7],
    [27, 9, 5],
    [33, 10, 4],
  ].map(([x, y, r]) => [x + (seed % 3), y, r]);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 40; x++) {
      let inside = false,
        lit = false;
      for (const [bx, by, r] of blobs) {
        const d = (x - bx) ** 2 + (y - by) ** 2;
        if (d <= r * r) inside = true;
        if ((x - bx + 2) ** 2 + (y - by + 2) ** 2 <= r * r) lit = true;
      }
      if (!inside || y > 12) continue;
      ctx.fillStyle = lit ? '#ffffff' : '#dfe6f6';
      ctx.fillRect(x, y, 1, 1);
    }
  return c;
}

export function toTint(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r << 16) | (g << 8) | b;
}

export { rgbToHex };
