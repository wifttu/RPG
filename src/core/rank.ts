import { BALANCE } from '../config/balance';
import { monsterAtk, monsterHp } from './economy';
import type { GameState } from './state';

/**
 * 가주 칭호 (승급 시련).
 * 스테이지 조건을 채우면 '선조의 그림자'와 1대1 시련을 치른다. 이기면 칭호가 오르고 공격·체력 배율이 붙는다.
 * 칭호는 가주마다 새로 따야 한다 (후계자는 견습생부터) — 대신 가문이 처음 오른 칭호에는 보석 보상.
 * 가계도에 각 가주의 최종 칭호가 남는다.
 */
export interface RankInfo {
  name: string;
  /** 시련을 치르려면 이번 가주가 도달해야 하는 스테이지 */
  stage: number;
  /** 공격력·체력 배율 */
  mul: number;
  /** 가문이 처음 이 칭호에 오를 때 주는 보석 */
  gems: number;
}

export const RANKS: RankInfo[] = [
  { name: '견습생', stage: 0, mul: 1, gems: 0 },
  { name: '수련자', stage: 15, mul: 1.15, gems: 30 },
  { name: '정예', stage: 35, mul: 1.3, gems: 50 },
  { name: '용사', stage: 60, mul: 1.5, gems: 80 },
  { name: '영웅', stage: 100, mul: 1.75, gems: 120 },
  { name: '전설', stage: 150, mul: 2, gems: 160 },
  { name: '신화', stage: 210, mul: 2.3, gems: 200 },
  { name: '불멸', stage: 280, mul: 2.6, gems: 300 },
];

export const MAX_RANK = RANKS.length - 1;

export function rankOf(state: Pick<GameState, 'hero'>): number {
  return Math.min(MAX_RANK, state.hero.rank ?? 0);
}

export function rankName(rank: number): string {
  return RANKS[Math.min(MAX_RANK, Math.max(0, rank))].name;
}

export function rankMultiplier(rank: number): number {
  return RANKS[Math.min(MAX_RANK, Math.max(0, rank))].mul;
}

/** 다음 칭호 (없으면 null) */
export function nextRank(state: Pick<GameState, 'hero'>): (RankInfo & { rank: number }) | null {
  const r = rankOf(state) + 1;
  return r > MAX_RANK ? null : { ...RANKS[r], rank: r };
}

/** 지금 승급 시련을 치를 수 있는지 (스테이지 조건) */
export function canTrial(state: Pick<GameState, 'hero'>): boolean {
  const n = nextRank(state);
  return !!n && state.hero.maxStage >= n.stage;
}

/** 시련 상대(선조의 그림자) 능력치: 조건 스테이지의 잡몹 기준 */
export function trialFoe(rank: number): { hp: number; atk: number } {
  const st = RANKS[rank].stage;
  return { hp: monsterHp(st) * BALANCE.rank.hpMul, atk: monsterAtk(st) * BALANCE.rank.atkMul };
}
