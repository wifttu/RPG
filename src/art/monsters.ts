import type { MonsterKind } from '../core/battle';
import { autoShade, blank, compose, maskFrom, put, toCanvas, type Grid } from './pixel';
import { OUTLINE } from './palette';

/** [그림자, 기본, 밝음] */
type R = [string, string, string];

/** 지역(바이옴)별 몬스터 색. 같은 모양을 색만 바꿔 재사용 → 그려야 할 그림 수를 줄이는 방치형 표준 기법 */
const BIOME_TINTS: Partial<Record<MonsterKind, R[]>> = {
  slime: [
    ['#2c7a3f', '#5cc35b', '#a8ec8a'],
    ['#4b2a86', '#8a5ad8', '#c7a3f5'],
    ['#8a2a22', '#e0573c', '#ffad7a'],
  ],
  mushroom: [
    ['#8a1f2e', '#d8434f', '#ff8a8a'],
    ['#3a2c7a', '#6a52c8', '#a596f0'],
    ['#5a3a1a', '#b07a3a', '#e8b46a'],
  ],
  bat: [
    ['#3a2a52', '#6a4a8a', '#9a7ac0'],
    ['#2a1e3e', '#4e3672', '#7c5aa8'],
    ['#4a1a22', '#862c3a', '#c04a5a'],
  ],
  beetle: [
    ['#1e4a5a', '#2f86a0', '#6ac8dc'],
    ['#1e3a2a', '#2f7a4a', '#62b67a'],
    ['#4a2a0e', '#a0561e', '#e8964a'],
  ],
  golem: [
    ['#4a4a5e', '#7a7a92', '#b0b0c4'],
    ['#3a3a5a', '#5e5e8a', '#9494c0'],
    ['#4a2e2a', '#7e4e42', '#b8806a'],
  ],
};

const GLOW: Record<number, string> = { 0: '#7cf2ff', 1: '#f27cff', 2: '#ffd04a' };

function relabel(g: Grid, map: Record<string, string>): Grid {
  return g.map((r) => r.map((c) => map[c] ?? c));
}

function ellipse(cx: number, cy: number, rx: number, ry: number) {
  return (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

function triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (x: number, y: number) => {
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
}

const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) =>
  x >= x0 && x < x1 && y >= y0 && y < y1;

function eye(g: Grid, x: number, y: number, tall = 2) {
  for (let i = 0; i < tall; i++) put(g, x, y + i, 'o');
  put(g, x, y, 'W');
}

function slime(): Grid {
  const W = 24,
    H = 20;
  const body = maskFrom(W, H, (x, y) =>
    y <= 12 ? ellipse(12, 12.5, 9.5, 11)(x, y) : y < 19.5 && Math.abs(x - 12) <= 10 - (y - 12) * 0.3,
  );
  const g = relabel(autoShade(body), { d: '1', b: '2', l: '3' });
  eye(g, 6, 10);
  eye(g, 10, 10);
  put(g, 7, 14, 'o');
  put(g, 8, 14, 'o');
  put(g, 5, 7, 'W');
  put(g, 6, 6, 'W');
  put(g, 7, 6, '3');
  return g;
}

function mushroom(): Grid {
  const W = 24,
    H = 24;
  const cap = maskFrom(W, H, (x, y) => y < 12 && ellipse(12, 11, 11.5, 9.5)(x, y));
  const stem = maskFrom(W, H, (x, y) => (rect(7, 11, 17, 23)(x, y) && !(y > 21.5 && (x < 8 || x > 16))) || ellipse(12, 21, 6, 2.5)(x, y));
  const s = relabel(autoShade(stem), { d: '4', b: '5', l: '6' });
  const c = relabel(autoShade(cap), { d: '1', b: '2', l: '3' });
  const g = compose(W, H, s, c);
  // 점박이
  for (const [x, y] of [
    [6, 5], [7, 5], [6, 6], [14, 3], [15, 3], [15, 4], [17, 7], [18, 7], [10, 8], [3, 9],
  ])
    if (g[y][x] !== 'o') put(g, x, y, 'W');
  eye(g, 9, 14);
  eye(g, 12, 14);
  put(g, 10, 18, 'o');
  return g;
}

function bat(frame: 0 | 1): Grid {
  const W = 26,
    H = 18;
  const up = frame === 0;
  const wingL = up ? triangle(10, 8, 0, 1, 4, 12) : triangle(10, 9, 0, 15, 5, 6);
  const wingL2 = up ? triangle(9, 9, 2, 4, 6, 13) : triangle(9, 9, 1, 13, 7, 14);
  const wingR = up ? triangle(16, 8, 26, 1, 22, 12) : triangle(16, 9, 26, 15, 21, 6);
  const wingR2 = up ? triangle(17, 9, 24, 4, 20, 13) : triangle(17, 9, 25, 13, 19, 14);
  const wings = maskFrom(W, H, (x, y) => wingL(x, y) || wingL2(x, y) || wingR(x, y) || wingR2(x, y));
  const body = maskFrom(
    W,
    H,
    (x, y) => ellipse(13, 10, 4.6, 4.6)(x, y) || triangle(9, 7, 10, 2, 12, 6)(x, y) || triangle(14, 6, 16, 2, 17, 7)(x, y),
  );
  const w = relabel(autoShade(wings), { d: '1', b: '1', l: '2' });
  const b = relabel(autoShade(body), { d: '2', b: '2', l: '3' });
  const g = compose(W, H, w, b);
  put(g, 11, 9, 'R');
  put(g, 14, 9, 'R');
  put(g, 12, 12, 'W');
  put(g, 14, 12, 'W');
  return g;
}

function beetle(): Grid {
  const W = 26,
    H = 20;
  const legs = blank(W, H);
  for (const lx of [8, 13, 18]) {
    put(legs, lx, 15, 'o');
    put(legs, lx - 1, 16, 'o');
    put(legs, lx - 1, 17, 'o');
    put(legs, lx - 2, 18, 'o');
  }
  const shell = maskFrom(W, H, (x, y) => y < 15.5 && ellipse(14, 10, 10.5, 7.5)(x, y));
  const head = maskFrom(W, H, (x, y) => ellipse(4.5, 11, 4, 3.6)(x, y) || triangle(1, 9, 3, 3, 4, 8)(x, y));
  const s = relabel(autoShade(shell), { d: '1', b: '2', l: '3' });
  for (let y = 3; y < 15; y++) if (s[y][14] !== '.' && s[y][14] !== 'o') s[y][14] = '1';
  const h = relabel(autoShade(head), { d: '1', b: '1', l: '2' });
  const g = compose(W, H, legs, s, h);
  put(g, 3, 10, 'R');
  put(g, 9, 6, 'W');
  put(g, 10, 5, 'W');
  return g;
}

function golem(): Grid {
  const W = 40,
    H = 40;
  const body = maskFrom(
    W,
    H,
    (x, y) =>
      rect(12, 12, 29, 31)(x, y) ||
      rect(14, 3, 27, 13)(x, y) ||
      rect(5, 13, 13, 29)(x, y) ||
      rect(28, 13, 36, 29)(x, y) ||
      rect(3, 26, 13, 34)(x, y) ||
      rect(29, 26, 38, 34)(x, y) ||
      rect(13, 30, 19, 39)(x, y) ||
      rect(23, 30, 29, 39)(x, y),
  );
  const g = relabel(autoShade(body), { d: '1', b: '2', l: '3' });
  // 팔과 몸통 사이 경계
  for (let y = 14; y < 27; y++) {
    put(g, 12, y, 'o');
    put(g, 28, y, 'o');
  }
  // 돌 틈 + 빛나는 균열
  for (const [x, y] of [
    [17, 7], [18, 7], [22, 7], [23, 7],
  ])
    put(g, x, y, 'E');
  for (const [x, y] of [
    [20, 16], [19, 17], [20, 18], [21, 19], [20, 20], [19, 21], [20, 22], [16, 25], [17, 25], [24, 24], [25, 25], [8, 18], [8, 19], [32, 20], [32, 21],
  ])
    put(g, x, y, 'E');
  for (const [x, y] of [
    [13, 20], [14, 20], [27, 17], [26, 17], [10, 24], [33, 26], [15, 13], [26, 13],
  ])
    put(g, x, y, '1');
  return g;
}

export interface MonsterTex {
  key: string;
  frames: HTMLCanvasElement[];
}

export function monsterCanvases(kind: MonsterKind, biome: number): HTMLCanvasElement[] {
  const tints = BIOME_TINTS[kind] ?? BIOME_TINTS.golem!;
  const [d, b, l] = tints[biome % tints.length];
  const colors = { o: OUTLINE, '1': d, '2': b, '3': l, '4': '#b8a68a', '5': '#efe2c4', '6': '#fffaf0', W: '#ffffff', R: '#ff3b4a', E: GLOW[biome % 3] };
  const grids: Grid[] =
    kind === 'slime' ? [slime()] : kind === 'mushroom' ? [mushroom()] : kind === 'bat' ? [bat(0), bat(1)] : kind === 'beetle' ? [beetle()] : [golem()];
  return grids.map((g) => toCanvas(g, colors));
}

/** 코인 8x8 */
export function coinCanvas(): HTMLCanvasElement {
  const g = [
    '..oooo..',
    '.oggggo.',
    'oghhgGGo',
    'oghgggGo',
    'oggggGGo',
    'oGgggGGo',
    '.oGGGGo.',
    '..oooo..',
  ].map((r) => [...r]);
  return toCanvas(g, { o: '#5a3410', g: '#f4c64e', G: '#c4862a', h: '#fff4c0' });
}
