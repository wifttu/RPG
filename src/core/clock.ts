import type { GameState } from './state';

/**
 * 시간 조작 방지.
 * 방치형은 기기 시계를 앞으로 돌려 오프라인 보상·출석을 받는 꼼수가 흔하다.
 * - 서버 시간이 있으면(setServerTime) 그 시간을 쓴다. 앱 출시 시 서버/Play 서비스 시간으로 연결.
 * - 서버가 없으면 지금까지 본 가장 늦은 시각(maxSeen)을 기억해서
 *   · 시계를 뒤로 돌리면 감지 → 오프라인 보상 없음
 *   · 시계를 앞으로 돌려 미래 날짜 출석을 받으면, 실제 시간이 그 날짜를 따라잡을 때까지 다음 출석이 막힌다
 */
const ROLLBACK_TOLERANCE_MS = 5 * 60_000;

class Clock {
  private offset = 0;
  trusted = false;

  now(): number {
    return Date.now() + this.offset;
  }

  /** 믿을 수 있는 서버 시각을 받았을 때 호출 */
  setServerTime(serverMs: number): void {
    this.offset = serverMs - Date.now();
    this.trusted = true;
  }
}

export const clock = new Clock();

/** 시계를 뒤로 돌렸는지 */
export function isRollback(state: GameState, now: number): boolean {
  return now < state.timeGuard.maxSeen - ROLLBACK_TOLERANCE_MS;
}

/** 날짜 계산(출석·일일 임무)에 쓰는 시각: 본 적 있는 가장 늦은 시각보다 앞으로 가지 않는다 */
export function effectiveNow(state: GameState, now: number): number {
  return Math.max(now, state.timeGuard.maxSeen);
}

export function markSeen(state: GameState, now: number): void {
  if (now > state.timeGuard.maxSeen) state.timeGuard.maxSeen = now;
}

/** 로컬 날짜 키 YYYY-MM-DD */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
