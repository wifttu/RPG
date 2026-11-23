/**
 * 8비트 느낌 효과음·음악을 코드로 합성한다 (음원 파일 없음 → 저작권·용량 걱정 없음).
 * 모든 함수는 BaseAudioContext 를 받아서, 실제 재생(AudioContext)과
 * 미리 듣기용 파일 만들기(OfflineAudioContext)에 똑같이 쓴다.
 */
export type Ctx = BaseAudioContext;

interface ToneOpts {
  type?: OscillatorType | 'pulse25';
  freq: number;
  freqEnd?: number;
  dur: number;
  vol?: number;
  attack?: number;
  release?: number;
}

const pulseCache = new WeakMap<Ctx, PeriodicWave>();
/** 25% 펄스파: 패미컴 같은 납작한 음색 */
function pulseWave(ctx: Ctx): PeriodicWave {
  let w = pulseCache.get(ctx);
  if (!w) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const duty = 0.25;
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    w = ctx.createPeriodicWave(real, imag);
    pulseCache.set(ctx, w);
  }
  return w;
}

export function tone(ctx: Ctx, dest: AudioNode, t: number, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  if (o.type === 'pulse25') osc.setPeriodicWave(pulseWave(ctx));
  else osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + o.dur);
  const g = ctx.createGain();
  const vol = o.vol ?? 0.2;
  const a = o.attack ?? 0.004;
  const r = o.release ?? Math.min(0.08, o.dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.setValueAtTime(vol, t + Math.max(a, o.dur - r));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

const noiseCache = new WeakMap<Ctx, AudioBuffer>();
function noiseBuffer(ctx: Ctx): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseCache.set(ctx, b);
  }
  return b;
}

export function noise(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  o: { dur: number; vol?: number; freq?: number; freqEnd?: number; type?: BiquadFilterType },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1500, t);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.02);
}

const N = (semi: number) => 440 * 2 ** (semi / 12); // A4 기준 반음
const NOTE: Record<string, number> = {};
['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => {
  for (let oct = 1; oct <= 7; oct++) NOTE[`${n}${oct}`] = N(i - 9 + (oct - 4) * 12);
});
export const note = (n: string) => NOTE[n];

// ───────────────────────── 효과음 ─────────────────────────
export type SfxName =
  | 'hit'
  | 'crit'
  | 'kill'
  | 'coin'
  | 'hurt'
  | 'death'
  | 'boss'
  | 'upgrade'
  | 'click'
  | 'reward'
  | 'fanfare'
  | 'retire';

type Sfx = (ctx: Ctx, out: AudioNode, t: number, p: number) => void;

export const SFX: Record<SfxName, Sfx> = {
  hit: (c, o, t) => {
    noise(c, o, t, { dur: 0.07, vol: 0.12, freq: 2600, freqEnd: 700 });
    tone(c, o, t, { type: 'square', freq: 240, freqEnd: 110, dur: 0.07, vol: 0.1 });
  },
  crit: (c, o, t) => {
    noise(c, o, t, { dur: 0.1, vol: 0.16, freq: 3500, freqEnd: 900 });
    tone(c, o, t, { type: 'square', freq: 700, freqEnd: 260, dur: 0.1, vol: 0.12 });
    tone(c, o, t + 0.03, { type: 'triangle', freq: 1400, dur: 0.08, vol: 0.12 });
  },
  kill: (c, o, t) => {
    tone(c, o, t, { type: 'pulse25', freq: note('C5'), freqEnd: note('C6'), dur: 0.08, vol: 0.12 });
    noise(c, o, t, { dur: 0.12, vol: 0.08, freq: 900, type: 'lowpass' });
  },
  coin: (c, o, t) => {
    tone(c, o, t, { type: 'square', freq: note('B5'), dur: 0.05, vol: 0.07 });
    tone(c, o, t + 0.05, { type: 'square', freq: note('E6'), dur: 0.14, vol: 0.07 });
  },
  hurt: (c, o, t) => {
    tone(c, o, t, { type: 'sawtooth', freq: 180, freqEnd: 70, dur: 0.12, vol: 0.08 });
    noise(c, o, t, { dur: 0.08, vol: 0.08, freq: 500, type: 'lowpass' });
  },
  death: (c, o, t) => {
    ['E5', 'C5', 'A4', 'E4'].forEach((n, i) => tone(c, o, t + i * 0.12, { type: 'pulse25', freq: note(n), dur: 0.14, vol: 0.12 }));
    tone(c, o, t + 0.48, { type: 'triangle', freq: note('A3'), freqEnd: note('A2'), dur: 0.5, vol: 0.18 });
  },
  boss: (c, o, t) => {
    for (let i = 0; i < 3; i++) {
      tone(c, o, t + i * 0.22, { type: 'square', freq: note('E4'), dur: 0.1, vol: 0.12 });
      tone(c, o, t + i * 0.22 + 0.11, { type: 'square', freq: note('A#3'), dur: 0.1, vol: 0.12 });
    }
  },
  /** p: 0~1 (레벨이 오를수록 음이 올라간다) */
  upgrade: (c, o, t, p) => {
    const base = N(3 + Math.round(p * 12));
    [1, 1.26, 1.5].forEach((m, i) => tone(c, o, t + i * 0.035, { type: 'triangle', freq: base * m, dur: 0.06, vol: 0.13 }));
  },
  click: (c, o, t) => tone(c, o, t, { type: 'square', freq: 880, dur: 0.03, vol: 0.05 }),
  reward: (c, o, t) => {
    ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => tone(c, o, t + i * 0.06, { type: 'triangle', freq: note(n), dur: 0.12, vol: 0.12 }));
  },
  fanfare: (c, o, t) => {
    const mel: [string, number, number][] = [
      ['G4', 0, 0.12],
      ['C5', 0.12, 0.12],
      ['E5', 0.24, 0.12],
      ['G5', 0.36, 0.24],
      ['E5', 0.6, 0.12],
      ['G5', 0.72, 0.6],
    ];
    for (const [n, at, d] of mel) tone(c, o, t + at, { type: 'pulse25', freq: note(n), dur: d, vol: 0.13 });
    for (const [n, at, d] of [
      ['C3', 0, 0.36],
      ['G3', 0.36, 0.36],
      ['C3', 0.72, 0.6],
    ] as [string, number, number][])
      tone(c, o, t + at, { type: 'triangle', freq: note(n), dur: d, vol: 0.2 });
  },
  retire: (c, o, t) => {
    ['E5', 'C5', 'G4', 'C5'].forEach((n, i) =>
      tone(c, o, t + i * 0.22, { type: 'triangle', freq: note(n), dur: 0.3, vol: 0.14, release: 0.2 }),
    );
  },
};

// ───────────────────────── 배경음악 ─────────────────────────
/** 8마디 반복. 코드 진행 Am - F - C - G (두 번째 4마디는 변주). 한 칸 = 8분음표 */
const LEAD = [
  'E5 . C5 D5 E5 . A4 .',
  'F5 . E5 D5 C5 . A4 .',
  'G4 . C5 E5 G5 . E5 .',
  'D5 . B4 C5 D5 . . .',
  'E5 . A5 G5 E5 . C5 .',
  'F5 . A5 G5 F5 . C5 .',
  'E5 . G5 E5 C5 . G4 .',
  'B4 . D5 . G4 . . .',
].map((s) => s.split(' '));
const BASS = ['A2', 'F2', 'C3', 'G2', 'A2', 'F2', 'C3', 'G2'];

export const MUSIC_BPM = 104;
export const STEPS_PER_LOOP = LEAD.length * 8;

/** 음악 한 칸(8분음표)을 t 시각에 예약 */
export function scheduleMusicStep(ctx: Ctx, out: AudioNode, t: number, step: number): void {
  const eighth = 60 / MUSIC_BPM / 2;
  const bar = Math.floor(step / 8) % LEAD.length;
  const i = step % 8;
  const n = LEAD[bar][i];
  if (n !== '.') {
    // 다음 칸이 쉼표면 길게
    const long = LEAD[bar][i + 1] === '.';
    tone(ctx, out, t, { type: 'pulse25', freq: note(n), dur: eighth * (long ? 1.8 : 0.9), vol: 0.06, release: 0.05 });
  }
  const root = note(BASS[bar]);
  tone(ctx, out, t, { type: 'triangle', freq: i % 2 ? root * 2 : root, dur: eighth * 0.85, vol: 0.12, release: 0.04 });
  if (i % 2 === 1) noise(ctx, out, t, { dur: 0.03, vol: 0.025, freq: 8000, type: 'highpass' });
}
