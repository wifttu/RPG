const UNITS = [
  { v: 1e20, s: '해' },
  { v: 1e16, s: '경' },
  { v: 1e12, s: '조' },
  { v: 1e8, s: '억' },
  { v: 1e4, s: '만' },
];

/** 한국식 큰 수 표기: 12,345 → 1.23만, 4.5e9 → 45억 */
export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1e4) return sign + Math.floor(n).toLocaleString('ko-KR');
  if (n >= 1e24) return sign + n.toExponential(2).replace('+', '');
  for (const u of UNITS) {
    if (n >= u.v) {
      const x = n / u.v;
      const digits = x >= 1000 ? 0 : x >= 100 ? 1 : 2;
      return sign + x.toFixed(digits).replace(/\.?0+$/, '') + u.s;
    }
  }
  return sign + String(Math.floor(n));
}

export function fmtPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtDuration(sec: number): string {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${s}초`;
  return `${s}초`;
}
