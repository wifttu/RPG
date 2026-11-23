/**
 * 플레이 기록(분석). 지금은 기기 안에만 쌓는다.
 * 출시할 때 addSink() 로 Firebase Analytics / GA4 같은 서비스에 보내는 함수를 연결하면 된다.
 * 개인 식별 정보는 넣지 않는다 (게임 안의 행동만).
 */
export interface AnalyticsEvent {
  t: number;
  name: string;
  props?: Record<string, string | number | boolean>;
}

type Sink = (e: AnalyticsEvent) => void;

const KEY = 'heirs.events';
const MAX = 400;
const sinks: Sink[] = [];
let buffer: AnalyticsEvent[] | null = null;

function load(): AnalyticsEvent[] {
  if (buffer) return buffer;
  try {
    buffer = JSON.parse(localStorage.getItem(KEY) ?? '[]') as AnalyticsEvent[];
  } catch {
    buffer = [];
  }
  return buffer;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(load().slice(-MAX)));
    } catch {
      /* 저장 못 해도 게임은 계속 */
    }
  }, 1000);
}

export function track(name: string, props?: AnalyticsEvent['props']): void {
  const e: AnalyticsEvent = { t: Date.now(), name, props };
  const b = load();
  b.push(e);
  if (b.length > MAX * 1.5) b.splice(0, b.length - MAX);
  persist();
  for (const s of sinks) {
    try {
      s(e);
    } catch {
      /* 분석 실패가 게임을 멈추면 안 된다 */
    }
  }
}

export function addSink(s: Sink): void {
  sinks.push(s);
}

export function recentEvents(): AnalyticsEvent[] {
  return [...load()];
}

/** 이벤트 이름별 횟수 (개발용 화면) */
export function eventCounts(): [string, number][] {
  const m = new Map<string, number>();
  for (const e of load()) m.set(e.name, (m.get(e.name) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
