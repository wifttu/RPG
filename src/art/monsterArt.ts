import batUrl from '../assets/monsters/bat.png';
import beetleUrl from '../assets/monsters/beetle.png';
import dragonUrl from '../assets/monsters/dragon.png';
import golemUrl from '../assets/monsters/golem.png';
import yetiUrl from '../assets/monsters/yeti.png';
import mushroomUrl from '../assets/monsters/mushroom.png';
import slimeUrl from '../assets/monsters/slime.png';
import type { MonsterKind } from '../core/battle';

/**
 * PixelLab으로 만든 몬스터 그림. 지역(바이옴)마다 색상(hue)만 돌려서 재사용한다.
 * 같은 그림 1장 → 지역 3곳 = 3종처럼 보임.
 */
const URLS: Record<MonsterKind, string> = {
  slime: slimeUrl,
  mushroom: mushroomUrl,
  bat: batUrl,
  beetle: beetleUrl,
  golem: golemUrl,
  yeti: yetiUrl,
  dragon: dragonUrl,
};

/** 지역별 색상 회전 각도 (0 들판 원본, 1 안개 숲, 2 잿빛 유적, 3 얼어붙은 설원, 4 불타는 화산) */
const BIOME_HUE: Record<MonsterKind, number[]> = {
  slime: [0, 150, 240, 70, 240],
  mushroom: [0, 230, 35, 200, 20],
  bat: [0, 300, 70, 300, 90],
  beetle: [0, 260, 180, 330, 140],
  golem: [0, 80, 200, 0, 0],
  yeti: [0, 0, 0, 0, 0],
  dragon: [0, 0, 0, 0, 0],
};

const images = new Map<MonsterKind, HTMLImageElement>();

export function loadMonsterArt(): Promise<void> {
  return Promise.all(
    (Object.keys(URLS) as MonsterKind[]).map(
      (k) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            images.set(k, img);
            resolve();
          };
          img.onerror = reject;
          img.src = URLS[k];
        }),
    ),
  ).then(() => undefined);
}

function hueRotate(r: number, g: number, b: number, deg: number): [number, number, number] {
  // RGB → HSL → 색상 회전 → RGB (밝기·채도 유지, 외곽선 같은 무채색은 거의 안 바뀜)
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [r * 255, g * 255, b * 255];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h / 6 + deg / 360) % 1;
  if (h < 0) h += 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export function monsterArtCanvas(kind: MonsterKind, biome: number): HTMLCanvasElement {
  const img = images.get(kind);
  if (!img) throw new Error(`monster art not loaded: ${kind}`);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const deg = BIOME_HUE[kind][biome % BIOME_HUE[kind].length];
  if (deg) {
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const [r, g, b] = hueRotate(d[i], d[i + 1], d[i + 2], deg);
      d[i] = Math.round(r);
      d[i + 1] = Math.round(g);
      d[i + 2] = Math.round(b);
    }
    ctx.putImageData(data, 0, 0);
  }
  return c;
}
