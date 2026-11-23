/**
 * 문자 격자 기반 픽셀 스프라이트 유틸.
 * 템플릿 한 줄은 "x:문자열" (x부터 그리기) 또는 전체 문자열. '.' 은 투명.
 */
export type Grid = string[][];

export function blank(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
}

export function parse(rows: readonly string[], w: number, h: number, yOffset = 0): Grid {
  const g = blank(w, h);
  rows.forEach((row, i) => {
    const y = i + yOffset;
    if (y < 0 || y >= h) return;
    let x0 = 0;
    let body = row;
    const m = /^(\d+):(.*)$/.exec(row);
    if (m) {
      x0 = Number(m[1]);
      body = m[2];
    }
    for (let i2 = 0; i2 < body.length; i2++) {
      const x = x0 + i2;
      if (x >= 0 && x < w && body[i2] !== '.' && body[i2] !== ' ') g[y][x] = body[i2];
    }
  });
  return g;
}

/** 뒤 레이어부터 순서대로 겹친다 */
export function compose(w: number, h: number, ...layers: Grid[]): Grid {
  const out = blank(w, h);
  for (const l of layers)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (l[y]?.[x] && l[y][x] !== '.') out[y][x] = l[y][x];
  return out;
}

export function mirror(g: Grid): Grid {
  return g.map((r) => [...r].reverse());
}

export function toCanvas(g: Grid, colors: Record<string, string>, scale = 1): HTMLCanvasElement {
  const h = g.length;
  const w = g[0]?.length ?? 0;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      const col = colors[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  return c;
}

/**
 * 마스크(채워진 칸)를 받아서 자동으로 외곽선 + 명암을 넣는다. 광원은 왼쪽 위.
 * 결과 문자: o(외곽선) d(그림자) b(기본) l(밝음) h(하이라이트)
 */
export function autoShade(mask: boolean[][], opts: { rimLight?: boolean } = {}): Grid {
  const h = mask.length;
  const w = mask[0].length;
  const filled = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && mask[y][x];
  const g = blank(w, h);
  // 바운딩 박스 (아래쪽 그림자 비율 계산용)
  let minY = h,
    maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y][x]) ((minY = Math.min(minY, y)), (maxY = Math.max(maxY, y)));
  const span = Math.max(1, maxY - minY);

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue;
      const edge = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
      if (edge) {
        g[y][x] = 'o';
        continue;
      }
      const ny = (y - minY) / span;
      const nearTL = !filled(x - 2, y) || !filled(x, y - 2) || !filled(x - 1, y - 1);
      const nearBR = !filled(x + 2, y) || !filled(x, y + 2) || !filled(x + 1, y + 1);
      if (nearTL && ny < 0.6) g[y][x] = 'l';
      else if (nearBR || ny > 0.78) g[y][x] = 'd';
      else g[y][x] = 'b';
      if (opts.rimLight && nearBR && !filled(x + 2, y) && ny < 0.5) g[y][x] = 'l';
    }
  return g;
}

export function maskFrom(w: number, h: number, fn: (x: number, y: number) => boolean): boolean[][] {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => fn(x + 0.5, y + 0.5)));
}

/** 그리드에 점 찍기 (범위 체크) */
export function put(g: Grid, x: number, y: number, ch: string): void {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch;
}
