/**
 * 프로젝트 공식 팔레트. 이미지 AI 결과물도 tools/pixelize.py 로 이 팔레트에 맞춘다.
 * (docs/ART_GUIDE.md 와 tools/palette.hex 에 같은 값이 있다)
 */
export const OUTLINE = '#1a1426';

/** [그림자, 기본, 밝음] */
export type Ramp3 = [string, string, string];

export const HAIR: { name: string; ramp: Ramp3 }[] = [
  { name: '흑발', ramp: ['#1d1a2b', '#35304f', '#5a5280'] },
  { name: '갈색', ramp: ['#3b2218', '#6b3e26', '#a0673a'] },
  { name: '금발', ramp: ['#8a5a1c', '#d9a03f', '#f6dc8a'] },
  { name: '적발', ramp: ['#5c1a1b', '#a63126', '#e0663e'] },
  { name: '은발', ramp: ['#5f6580', '#a9b0c8', '#eef1fa'] },
  { name: '청발', ramp: ['#1d2f6b', '#3561c1', '#78acf2'] },
  { name: '녹발', ramp: ['#1f4d2e', '#3f8a4a', '#86ca6e'] },
  { name: '자주', ramp: ['#4a1e5c', '#8a3fa6', '#c98ae2'] },
];

export const SKIN: Ramp3[] = [
  ['#d69a78', '#f6cba6', '#ffe6cf'],
  ['#c07e58', '#e2aa82', '#f6caa4'],
  ['#94593a', '#c08256', '#dea777'],
  ['#653a26', '#93603d', '#b98458'],
  ['#3f2619', '#6a4029', '#8f5d3c'],
];

export const EYES = ['#27264f', '#2f6e3c', '#6b3f1f', '#7a2456', '#b9801f'];

export const STEEL = { dark: '#3d4260', base: '#6a7398', light: '#a3adcf', hi: '#e2e7f6' };
export const LEATHER = { dark: '#33201a', base: '#5e3a26', light: '#86573a' };
export const GOLD = { dark: '#80501a', base: '#d39a36', light: '#f7d77e' };
export const BLADE = { dark: '#8b95b5', base: '#c9d2ea', hi: '#ffffff' };

/** 가문 문장 색 (튜닉/망토). 세대마다 바뀌지 않고 가문에 고정. */
export const HOUSE_CLOTH: Ramp3 = ['#6e1f35', '#b3394f', '#e8687c'];

export const UI = {
  bg: '#14101e',
  gold: '#f4c64e',
  gem: '#6fd3ff',
  fame: '#ff9d5c',
  text: '#f3ecff',
  crit: '#ffd84a',
  heal: '#7cd67c',
  hurt: '#ff5c6c',
};

export function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = hexToNum(hex);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
