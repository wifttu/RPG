import { Capacitor } from '@capacitor/core';
import { track } from '../core/analytics';
import { BALANCE } from '../config/balance';
import { settings } from '../core/settings';
import type { GameState } from '../core/state';
import { computeStats, secondsPerYear } from '../core/stats';
import { josa } from '../ui/format';

/**
 * 휴대폰 알림 (앱에서만). 서버 없이 앱이 스스로 예약한다.
 * - 앱을 닫을 때(백그라운드로 갈 때) 예약하고, 다시 열면 모두 취소한다.
 * - 정확한 시각 알람 권한은 쓰지 않는다 (몇 분 늦어도 되는 알림, Play 정책상 불필요).
 */
const ID = { retire: 101, offline: 102, daily: 103 } as const;

export const notifySupported = () => Capacitor.isNativePlatform();

async function plugin() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

/** 이미 허락했는지 */
export async function notifyAllowed(): Promise<boolean> {
  if (!notifySupported()) return false;
  try {
    return (await (await plugin()).checkPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/** 알림 허락 요청 (게임 안에서 이유를 설명한 뒤 부른다) */
export async function requestNotify(): Promise<boolean> {
  if (!notifySupported()) return false;
  try {
    const r = await (await plugin()).requestPermissions();
    track('notify_permission', { granted: r.display === 'granted' });
    return r.display === 'granted';
  } catch {
    return false;
  }
}

/** 앱을 떠날 때 예약할 알림 목록 (테스트하기 쉽게 순수 함수로 분리) */
export function plannedNotifications(state: GameState, now: number): { id: number; at: number; title: string; body: string }[] {
  const out: { id: number; at: number; title: string; body: string }[] = [];
  const h = state.hero;
  if (settings.notify.retire) {
    const life = computeStats(state, now).lifespan;
    const yearsLeft = life - h.age;
    if (yearsLeft > 0.1) {
      // 오프라인에서는 절반 속도로 나이를 먹는다
      const sec = (yearsLeft * secondsPerYear(h.generation)) / BALANCE.time.offlineAgingRate;
      out.push({
        id: ID.retire,
        at: now + sec * 1000,
        title: `${state.houseName} 가문`,
        body: `${josa(h.name, '이', '가')} 검을 내려놓을 나이가 되었어요. 후계자를 정해 주세요.`,
      });
    }
  }
  if (settings.notify.offline) {
    out.push({
      id: ID.offline,
      at: now + BALANCE.time.offlineCapSec * 1000,
      title: '오프라인 보상이 가득 찼어요',
      body: `${josa(h.name, '이', '가')} 8시간 동안 모은 골드를 받으러 오세요.`,
    });
  }
  if (settings.notify.daily) {
    // 다음 날 낮 12시 (출석·일일 임무가 새로 열림)
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    out.push({ id: ID.daily, at: d.getTime(), title: '새로운 하루', body: '출석 보상과 일일 임무가 새로 열렸어요.' });
  }
  return out;
}

export async function scheduleOnLeave(state: GameState, now = Date.now()): Promise<void> {
  if (!(await notifyAllowed())) return;
  try {
    const ln = await plugin();
    await ln.cancel({ notifications: Object.values(ID).map((id) => ({ id })) });
    const list = plannedNotifications(state, now);
    if (!list.length) return;
    await ln.schedule({
      notifications: list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: new Date(n.at), allowWhileIdle: true },
        isExactNotification: false,
      })),
    });
  } catch (e) {
    track('notify_error', { msg: String(e).slice(0, 80) });
  }
}

export async function cancelOnReturn(): Promise<void> {
  if (!notifySupported()) return;
  try {
    await (await plugin()).cancel({ notifications: Object.values(ID).map((id) => ({ id })) });
  } catch {
    /* noop */
  }
}
