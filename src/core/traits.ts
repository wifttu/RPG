export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Effects {
  atkMul: number;
  hpMul: number;
  spdMul: number;
  critAdd: number;
  goldMul: number;
  fameMul: number;
  lifespanAdd: number;
}

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  effect: Partial<Effects>;
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '일반',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
};

/** 돌연변이로 새 특성이 생길 때 등급 확률. 확률형 아이템 표시 의무 대응을 위해 UI에 그대로 노출한다. */
export const MUTATION_RARITY_TABLE: Record<Rarity, number> = {
  common: 0.6,
  rare: 0.28,
  epic: 0.1,
  legendary: 0.02,
};

export const TRAITS: readonly TraitDef[] = [
  { id: 'strong', name: '억센 팔', desc: '공격력 +10%', rarity: 'common', effect: { atkMul: 0.1 } },
  { id: 'sturdy', name: '튼튼한 몸', desc: '체력 +15%', rarity: 'common', effect: { hpMul: 0.15 } },
  { id: 'quick', name: '날랜 발', desc: '공격 속도 +8%', rarity: 'common', effect: { spdMul: 0.08 } },
  { id: 'thrifty', name: '알뜰함', desc: '골드 획득 +10%', rarity: 'common', effect: { goldMul: 0.1 } },
  { id: 'swordsoul', name: '검의 혼', desc: '공격력 +25%', rarity: 'rare', effect: { atkMul: 0.25 } },
  { id: 'giantblood', name: '거인의 피', desc: '체력 +35%', rarity: 'rare', effect: { hpMul: 0.35 } },
  { id: 'gale', name: '질풍', desc: '공격 속도 +18%', rarity: 'rare', effect: { spdMul: 0.18 } },
  { id: 'keen', name: '매의 눈', desc: '치명타 확률 +8%p', rarity: 'rare', effect: { critAdd: 0.08 } },
  { id: 'longevity', name: '장수', desc: '수명 +10년', rarity: 'rare', effect: { lifespanAdd: 10 } },
  { id: 'goldhand', name: '황금손', desc: '골드 획득 +40%', rarity: 'epic', effect: { goldMul: 0.4 } },
  { id: 'berserker', name: '광전사', desc: '공격력 +45%, 체력 -10%', rarity: 'epic', effect: { atkMul: 0.45, hpMul: -0.1 } },
  { id: 'sage', name: '현자의 핏줄', desc: '은퇴 시 명성 +30%', rarity: 'epic', effect: { fameMul: 0.3 } },
  {
    id: 'dragonblood',
    name: '용의 혈통',
    desc: '공격력·체력·공속 +30%',
    rarity: 'legendary',
    effect: { atkMul: 0.3, hpMul: 0.3, spdMul: 0.3 },
  },
  { id: 'phoenix', name: '불사조', desc: '수명 +20년, 체력 +25%', rarity: 'legendary', effect: { lifespanAdd: 20, hpMul: 0.25 } },
];

const BY_ID = new Map(TRAITS.map((t) => [t.id, t]));

export function getTrait(id: string): TraitDef {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`unknown trait: ${id}`);
  return t;
}

export function traitsOfRarity(r: Rarity): TraitDef[] {
  return TRAITS.filter((t) => t.rarity === r);
}

export const RARITY_ORDER: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export function sumEffects(traitIds: readonly string[]): Effects {
  const e: Effects = { atkMul: 0, hpMul: 0, spdMul: 0, critAdd: 0, goldMul: 0, fameMul: 0, lifespanAdd: 0 };
  for (const id of traitIds) {
    const t = getTrait(id);
    for (const [k, v] of Object.entries(t.effect) as [keyof Effects, number][]) e[k] += v;
  }
  return e;
}
