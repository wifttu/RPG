import type { ItemKind } from '../core/gear';
import { OUTLINE } from './palette';

/**
 * 장비 아이콘 16x16 (코드로 그린 임시 그림).
 * 부품을 칠한 뒤 바깥에 1px 외곽선을 자동으로 두른다.
 * PixelLab 횟수가 생기면 같은 이름의 PNG로 교체하면 된다.
 */
const W = 16;
type Px = string | null;

class Canvas {
  px: Px[][] = Array.from({ length: W }, () => Array<Px>(W).fill(null));
  set(x: number, y: number, c: string): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < W) this.px[y][x] = c;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  disc(cx: number, cy: number, r: number, c: string): void {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  ring(cx: number, cy: number, r0: number, r1: number, c: string, from = 0, to = 360): void {
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - cx, y - cy);
        let a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
        if (a < 0) a += 360;
        if (d >= r0 && d <= r1 && a >= from && a <= to) this.set(x, y, c);
      }
  }
  toCanvas(): HTMLCanvasElement {
    // 외곽선
    const out = this.px.map((r) => [...r]);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        if (this.px[y][x]) continue;
        const near = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => this.px[y + dy]?.[x + dx]);
        if (near) out[y][x] = OUTLINE;
      }
    const c = document.createElement('canvas');
    c.width = c.height = W;
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

const METAL = { hi: '#eef1fa', mid: '#a9b0c8', lo: '#6a7398' };
const WOOD = { hi: '#a0673a', lo: '#5e3a26' };
const GOLD = { hi: '#f7d77e', lo: '#c4862a' };
const GEM = { hi: '#c8f4ff', mid: '#4fb8e8' };
const CLOTH = '#b3394f';

const DRAW: Record<ItemKind, (c: Canvas) => void> = {
  sword: (c) => {
    c.line(5, 10, 13, 2, METAL.mid);
    c.line(6, 10, 13, 3, METAL.lo);
    c.line(5, 9, 12, 2, METAL.hi);
    c.line(3, 8, 7, 12, GOLD.lo);
    c.line(3, 7, 8, 12, GOLD.hi);
    c.line(2, 13, 4, 11, WOOD.lo);
    c.set(1, 14, GOLD.lo);
  },
  bow: (c) => {
    c.ring(12, 8, 7, 8.4, WOOD.hi, 105, 255);
    c.ring(12, 8, 6.2, 7, WOOD.lo, 110, 250);
    c.line(9, 1, 9, 15, '#e2dcf0');
    c.line(3, 8, 13, 8, WOOD.lo);
    c.set(14, 8, METAL.hi);
    c.set(13, 7, METAL.mid);
    c.set(13, 9, METAL.mid);
    c.set(3, 7, CLOTH);
    c.set(3, 9, CLOTH);
  },
  staff: (c) => {
    c.line(3, 14, 10, 5, WOOD.lo);
    c.line(4, 14, 11, 5, WOOD.hi);
    c.ring(11.5, 3.5, 2.5, 3.6, GOLD.lo);
    c.disc(11.5, 3.5, 2.2, GEM.mid);
    c.set(11, 3, GEM.hi);
    c.set(10, 2, '#ffffff');
  },
  helmet: (c) => {
    c.ring(8, 10, 0, 6, METAL.mid, 180, 360);
    c.ring(8, 10, 0, 6, METAL.lo, 290, 360);
    c.rect(2, 10, 14, 11, METAL.lo);
    c.rect(5, 6, 6, 7, METAL.hi);
    c.rect(4, 12, 6, 13, METAL.mid);
    c.rect(10, 12, 12, 13, METAL.mid);
    c.line(8, 3, 8, 9, CLOTH);
  },
  armor: (c) => {
    c.rect(4, 4, 11, 13, METAL.mid);
    c.rect(2, 4, 4, 7, METAL.lo);
    c.rect(11, 4, 13, 7, METAL.lo);
    c.rect(6, 3, 9, 4, METAL.hi);
    c.rect(7, 3, 8, 5, '#1a1426');
    c.rect(5, 6, 6, 9, METAL.hi);
    c.rect(4, 11, 11, 11, GOLD.lo);
    c.rect(7, 11, 8, 11, GOLD.hi);
  },
  necklace: (c) => {
    c.ring(8, 5, 4.6, 5.6, GOLD.lo, 0, 180);
    c.ring(8, 5, 4.6, 5.2, GOLD.hi, 20, 160);
    c.disc(8, 12, 2.6, GEM.mid);
    c.set(7, 11, GEM.hi);
    c.set(8, 9, GOLD.hi);
  },
  ring: (c) => {
    c.ring(8, 9, 3.6, 5.4, GOLD.lo);
    c.ring(8, 9, 4.4, 5.4, GOLD.hi, 180, 300);
    c.disc(8, 3.8, 2, '#e8687c');
    c.set(7, 3, '#ffd0d8');
  },
};

const urlCache = new Map<ItemKind, string>();

export function itemIconUrl(kind: ItemKind): string {
  let u = urlCache.get(kind);
  if (!u) {
    const c = new Canvas();
    DRAW[kind](c);
    u = c.toCanvas().toDataURL();
    urlCache.set(kind, u);
  }
  return u;
}

export function itemIconCanvas(kind: ItemKind): HTMLCanvasElement {
  const c = new Canvas();
  DRAW[kind](c);
  return c.toCanvas();
}
