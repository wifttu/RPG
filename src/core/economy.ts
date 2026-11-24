import { BALANCE, type UpgradeKind } from '../config/balance';
import type { GameState } from './state';
import { computeStats, expectedDps, secondsPerYear } from './stats';

export function upgradeCost(kind: UpgradeKind, level: number): number {
  const u = BALANCE.upgrades[kind];
  return Math.ceil(u.baseCost * u.growth ** level);
}

export function canUpgrade(state: GameState, kind: UpgradeKind): boolean {
  const lv = state.upgrades[kind];
  return lv < BALANCE.upgrades[kind].max && state.gold >= upgradeCost(kind, lv);
}

export function buyUpgrade(state: GameState, kind: UpgradeKind): boolean {
  if (!canUpgrade(state, kind)) return false;
  state.gold -= upgradeCost(kind, state.upgrades[kind]);
  state.upgrades[kind]++;
  return true;
}

/** 몬스터 등급: 잡몹 / 스테이지 보스(정예) / 지역 보스 */
export type Rank = 'mob' | 'elite' | 'region' | 'trial';

/** 지역 보스가 나오는 스테이지 (10, 20, 30 …) */
export function isBossStage(stage: number): boolean {
  return stage % BALANCE.monster.bossEvery === 0;
}

/** 이 스테이지의 보스 등급 */
export function bossRank(stage: number): Rank {
  return isBossStage(stage) ? 'region' : 'elite';
}

const rankMul = (rank: Rank, elite: number, region: number) => (rank === 'region' ? region : rank === 'elite' ? elite : 1);

export function monsterHp(stage: number, rank: Rank = 'mob'): number {
  const m = BALANCE.monster;
  return m.baseHp * m.hpGrowth ** (stage - 1) * rankMul(rank, m.eliteHpMul, m.bossHpMul);
}

export function monsterAtk(stage: number, rank: Rank = 'mob'): number {
  const m = BALANCE.monster;
  return m.baseAtk * m.atkGrowth ** (stage - 1) * rankMul(rank, m.eliteAtkMul, m.bossAtkMul);
}

export function monsterGold(stage: number, rank: Rank = 'mob'): number {
  const m = BALANCE.monster;
  return m.baseGold * m.goldGrowth ** (stage - 1) * rankMul(rank, m.eliteGoldMul, m.bossGoldMul);
}

export function bossTimeLimit(stage: number): number {
  return isBossStage(stage) ? BALANCE.monster.bossTimeLimit : BALANCE.monster.eliteTimeLimit;
}

/** 가문 역대 최고 스테이지 (현재 가주 포함) */
export function houseBest(state: Pick<GameState, 'lineage' | 'hero'>): number {
  return Math.max(state.hero.maxStage, ...state.lineage.map((l) => l.maxStage));
}

/**
 * 선대가 정복한 땅(가문 최고 기록의 80% 아래)은 빠르게 지나간다:
 * 잡몹 1마리만 잡으면 스테이지 보스 없이 다음으로. (지역 보스는 그대로 싸운다)
 */
export function isMarchStage(stage: number, best: number): boolean {
  return !isBossStage(stage) && stage < Math.floor(best * BALANCE.march.ratio);
}

/** 보스 도전에 필요한 처치 수 (게이지 칸 수) */
export function monstersInStage(stage: number, best = 0): number {
  return isMarchStage(stage, best) ? 1 : BALANCE.monster.perStage;
}

export function fameForRetirement(maxStage: number, fameMul = 1): number {
  const f = BALANCE.fame;
  if (maxStage <= f.offset) return 0;
  return Math.floor(f.coef * f.growth ** (maxStage - f.offset) * fameMul);
}

/** 초당 골드 기대값 (오프라인 보상, HUD 표시용) */
export function estimateGoldPerSec(state: GameState, now = Date.now()): number {
  const s = computeStats(state, now);
  const stage = Math.max(1, state.stage);
  const killTime = Math.max(1 / s.atkPerSec, monsterHp(stage) / expectedDps(s)) + BALANCE.monster.spawnGap;
  return (monsterGold(stage) * s.goldMul) / killTime;
}

export interface OfflineResult {
  seconds: number;
  gold: number;
  years: number;
  reachedLifespan: boolean;
}

/** 오프라인 경과분 계산. 나이도 흐르지만 수명에서 멈추고 '은퇴 대기' 상태가 된다. */
export function computeOffline(state: GameState, now: number): OfflineResult {
  const t = BALANCE.time;
  const raw = Math.max(0, (now - state.lastSeen) / 1000);
  const seconds = Math.min(raw, t.offlineCapSec);
  const lifespan = computeStats(state, now).lifespan;
  const yearsLeft = Math.max(0, lifespan - state.hero.age);
  const spy = secondsPerYear(state.hero.generation);
  const years = Math.min((seconds * t.offlineAgingRate) / spy, yearsLeft);
  // 수명에 닿은 뒤로는 사냥하지 않는다
  const activeSec = Math.min(seconds, (years * spy) / t.offlineAgingRate);
  // 부스트는 오프라인에 적용하지 않는다 (광고 2배 버튼과 중복 방지)
  const gps = estimateGoldPerSec({ ...state, boostUntil: 0 }, now);
  return {
    seconds,
    gold: Math.floor(gps * activeSec * t.offlineEfficiency),
    years,
    reachedLifespan: years >= yearsLeft && yearsLeft >= 0 && seconds > 0 && state.hero.age + years >= lifespan,
  };
}
