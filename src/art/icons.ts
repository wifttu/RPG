import { coinCanvas } from './monsters';
import { parse, toCanvas } from './pixel';
import { OUTLINE } from './palette';

const ICONS: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  gem: {
    rows: ['..ooooo..', '.ohhbbbo.', 'ohhbbbbbo', 'obbbbbbdo', '.obbbbdo.', '..obbdo..', '...odo...', '....o....'],
    colors: { o: OUTLINE, h: '#e6fbff', b: '#6fd3ff', d: '#2f86c0' },
  },
  fame: {
    rows: ['....o....', '...oyo...', 'ooooyyooo', 'oyyyyyyyo', '.oyyyyyo.', '..oyyyo..', '.oyyoyyo.', '.oyo.oyo.', '.oo...oo.'],
    colors: { o: OUTLINE, y: '#ff9d5c' },
  },
  atk: {
    rows: ['......oo', '.....omo', '....omo.', 'o..omo..', 'ogomo...', '.ogo....', '.ogog...', 'oo..o...'],
    colors: { o: OUTLINE, m: '#e2e7f6', g: '#d39a36' },
  },
  hp: {
    rows: ['.oo.oo.', 'ohhoreo', 'ohrrrro', 'orrrrro', '.orrro.', '..oro..', '...o...'],
    colors: { o: OUTLINE, h: '#ffc0c8', r: '#ff5c6c', e: '#c0304a' },
  },
  spd: {
    rows: ['...ooo..', '..oyyyo.', '.oyyyo..', 'oyyyyooo', 'ooooyyo.', '...oyo..', '..oyo...', '..oo....'],
    colors: { o: OUTLINE, y: '#ffd84a' },
  },
  crown: {
    rows: ['o..o..o', 'oyoyoyo', 'oyyyyyo', 'oyrygyo', 'ooooooo'],
    colors: { o: OUTLINE, y: '#f4c64e', r: '#ff5c6c', g: '#6fd3ff' },
  },
  ad: {
    rows: ['ooooooooo', 'obbbbbbbo', 'obbwbbbbo', 'obbwwbbbo', 'obbwwwbbo', 'obbwwbbbo', 'obbwbbbbo', 'ooooooooo'],
    colors: { o: OUTLINE, b: '#4a9a5a', w: '#ffffff' },
  },
};

const urlCache = new Map<string, string>();

export function iconUrl(name: keyof typeof ICONS | 'coin'): string {
  let u = urlCache.get(name);
  if (u) return u;
  if (name === 'coin') u = coinCanvas().toDataURL();
  else {
    const def = ICONS[name];
    const w = Math.max(...def.rows.map((r) => r.length));
    u = toCanvas(parse(def.rows, w, def.rows.length), def.colors).toDataURL();
  }
  urlCache.set(name, u);
  return u;
}

export function iconImg(name: Parameters<typeof iconUrl>[0], cls = 'ico'): string {
  return `<img class="${cls}" src="${iconUrl(name)}" alt="" />`;
}
