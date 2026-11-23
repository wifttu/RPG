import type { GameState, HeirloomKind } from './state';

/**
 * 가보: 대대로 물려주는 장비. 보스가 떨어뜨리는 유산석으로 강화하고, 은퇴해도 사라지지 않는다.
 * 수련(골드)은 세대마다 초기화되지만 가보는 계속 쌓여서 "우리 가문의 검"이 된다.
 */
export interface HeirloomDef {
  kind: HeirloomKind;
  name: string;
  stat: string;
  /** 레벨당 배율 증가 */
  perLevel: number;
}

export const HEIRLOOMS: HeirloomDef[] = [
  { kind: 'sword', name: '가문의 검', stat: '공격력', perLevel: 0.08 },
  { kind: 'shield', name: '가문의 방패', stat: '체력', perLevel: 0.1 },
  { kind: 'ring', name: '가문의 반지', stat: '골드', perLevel: 0.1 },
];

/** 강화 단계에 따라 이름 앞에 붙는 수식어 */
const TIERS: [number, string][] = [
  [0, '낡은'],
  [5, '단단한'],
  [10, '이름난'],
  [20, '전설의'],
  [35, '신화의'],
];

export function heirloomTitle(kind: HeirloomKind, level: number): string {
  const def = HEIRLOOMS.find((h) => h.kind === kind)!;
  let tier = TIERS[0][1];
  for (const [lv, name] of TIERS) if (level >= lv) tier = name;
  return `${tier} ${def.name}`;
}

/** 10레벨마다 x1.25 돌파 */
export function heirloomMultiplier(kind: HeirloomKind, level: number): number {
  const def = HEIRLOOMS.find((h) => h.kind === kind)!;
  return (1 + def.perLevel * level) * 1.25 ** Math.floor(level / 10);
}

export function heirloomCost(level: number): number {
  return Math.ceil(2 * 1.2 ** level);
}

export function buyHeirloom(state: GameState, kind: HeirloomKind): boolean {
  const cost = heirloomCost(state.heirlooms[kind]);
  if (state.legacy < cost) return false;
  state.legacy -= cost;
  state.heirlooms[kind]++;
  return true;
}

/** 보스 처치 시 유산석: 깊이 갈수록 많이 */
export function legacyForBoss(stage: number): number {
  return 1 + Math.floor(stage / 30);
}

export function totalHeirloomLevel(state: GameState): number {
  return state.heirlooms.sword + state.heirlooms.shield + state.heirlooms.ring;
}
