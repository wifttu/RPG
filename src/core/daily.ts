import { dayKey, effectiveNow } from './clock';
import type { GameState } from './state';

export interface Reward {
  gems?: number;
  legacy?: number;
  boostMinutes?: number;
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.gems) parts.push(`보석 ${r.gems}`);
  if (r.legacy) parts.push(`유산석 ${r.legacy}`);
  if (r.boostMinutes) parts.push(`골드 2배 ${r.boostMinutes}분`);
  return parts.join(' + ');
}

export function grantReward(state: GameState, r: Reward, now: number): void {
  if (r.gems) state.gems += r.gems;
  if (r.legacy) state.legacy += r.legacy;
  if (r.boostMinutes) state.boostUntil = Math.max(now, state.boostUntil) + r.boostMinutes * 60_000;
}

// ───────────────────────── 일일 임무 ─────────────────────────
export interface Mission {
  id: 'kills' | 'upgrades' | 'bosses';
  label: string;
  target: number;
  reward: Reward;
}

export const MISSIONS: Mission[] = [
  { id: 'kills', label: '몬스터 300마리 처치', target: 300, reward: { gems: 20 } },
  { id: 'upgrades', label: '수련 30회', target: 30, reward: { gems: 20 } },
  { id: 'bosses', label: '보스 3번 처치', target: 3, reward: { gems: 20 } },
];
export const ALL_CLEAR: Reward = { legacy: 3, gems: 20 };

/** 날짜가 바뀌었으면 일일 임무를 새로 시작 */
export function rolloverDaily(state: GameState, now: number): boolean {
  const today = dayKey(effectiveNow(state, now));
  if (state.daily.day === today) return false;
  state.daily = { day: today, kills: 0, upgrades: 0, bosses: 0, claimed: [] };
  return true;
}

export function missionProgress(state: GameState, m: Mission): number {
  return Math.min(m.target, state.daily[m.id]);
}

export function canClaimMission(state: GameState, m: Mission): boolean {
  return missionProgress(state, m) >= m.target && !state.daily.claimed.includes(m.id);
}

export function canClaimAllClear(state: GameState): boolean {
  return MISSIONS.every((m) => state.daily.claimed.includes(m.id)) && !state.daily.claimed.includes('all');
}

export function claimMission(state: GameState, id: Mission['id'] | 'all', now: number): Reward | null {
  if (id === 'all') {
    if (!canClaimAllClear(state)) return null;
    state.daily.claimed.push('all');
    grantReward(state, ALL_CLEAR, now);
    return ALL_CLEAR;
  }
  const m = MISSIONS.find((x) => x.id === id)!;
  if (!canClaimMission(state, m)) return null;
  state.daily.claimed.push(id);
  grantReward(state, m.reward, now);
  return m.reward;
}

// ───────────────────────── 출석 ─────────────────────────
/** 7일 주기. 하루라도 빠지면 초기화되지 않고 이어서 받는다(부담 없는 출석). */
export const ATTENDANCE: Reward[] = [
  { gems: 30 },
  { boostMinutes: 30 },
  { gems: 50 },
  { legacy: 3 },
  { gems: 80 },
  { boostMinutes: 60 },
  { gems: 150, legacy: 5 },
];

export function canClaimAttendance(state: GameState, now: number): boolean {
  return state.attendance.lastDay !== dayKey(effectiveNow(state, now));
}

export function claimAttendance(state: GameState, now: number): Reward | null {
  if (!canClaimAttendance(state, now)) return null;
  const r = ATTENDANCE[state.attendance.count % ATTENDANCE.length];
  state.attendance.count++;
  state.attendance.lastDay = dayKey(effectiveNow(state, now));
  grantReward(state, r, now);
  return r;
}

// ───────────────────────── 월정액 ─────────────────────────
export const MONTHLY_DAILY_GEMS = 100;

export function monthlyActive(state: GameState, now: number): boolean {
  return state.entitlements.monthlyUntil > now;
}

export function canClaimMonthly(state: GameState, now: number): boolean {
  return monthlyActive(state, now) && !state.daily.claimed.includes('monthly');
}

export function claimMonthly(state: GameState, now: number): boolean {
  if (!canClaimMonthly(state, now)) return false;
  state.daily.claimed.push('monthly');
  state.gems += MONTHLY_DAILY_GEMS;
  return true;
}

/** 오늘 이 광고 보상을 몇 번 더 받을 수 있는지 (한도 없으면 Infinity) */
export function adsLeft(state: GameState, placement: string, caps: Record<string, number>): number {
  const cap = caps[placement];
  if (cap === undefined) return Infinity;
  return Math.max(0, cap - (state.daily.ads?.[placement] ?? 0));
}

export function countAd(state: GameState, placement: string): void {
  state.daily.ads ??= {};
  state.daily.ads[placement] = (state.daily.ads[placement] ?? 0) + 1;
}

/** 광고 없이 보상을 받을 수 있는지 (광고 제거 또는 월정액) */
export function adFree(state: GameState, now: number): boolean {
  return state.entitlements.noAds || monthlyActive(state, now);
}

