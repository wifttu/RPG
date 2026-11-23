import { BALANCE } from '../config/balance';
import type { Rng } from './rng';
import { MUTATION_RARITY_TABLE, TRAITS, getTrait, traitsOfRarity, type Rarity } from './traits';

export const HAIR_COLOR_COUNT = 8;
export const SKIN_TONE_COUNT = 5;
export const EYE_COLOR_COUNT = 5;
/** 머리 모양 = 영웅 시트 종류 수 (src/art/heroSheet.ts 의 SHEETS) */
export const HAIR_STYLE_COUNT = 3;

/** 영웅 한 명의 유전 정보. 능력치 잠재력 + 외형 + 특성. */
export interface Genes {
  str: number;
  vit: number;
  agi: number;
  hairColor: number;
  skinTone: number;
  eyeColor: number;
  hairStyle: number;
  traits: string[];
}

const clampStat = (v: number) => Math.max(1, Math.min(100, Math.round(v)));

function rollTrait(rng: Rng, exclude: readonly string[]): string {
  // 이미 가진 특성은 제외. 해당 등급이 전부 겹치면 다른 등급에서 찾는다.
  for (let attempt = 0; attempt < 10; attempt++) {
    const rarity = rng.weighted(MUTATION_RARITY_TABLE) as Rarity;
    const pool = traitsOfRarity(rarity).filter((t) => !exclude.includes(t.id));
    if (pool.length) return rng.pick(pool).id;
  }
  const rest = TRAITS.filter((t) => !exclude.includes(t.id));
  return rng.pick(rest).id;
}

/** 첫 세대·배우자 후보 같은 '무작위 출생'. quality(0~1)가 높을수록 능력치·특성이 좋다. */
export function randomGenes(rng: Rng, quality = 0): Genes {
  const mean = 35 + quality * 35;
  const traits: string[] = [];
  if (rng.chance(0.55 + quality * 0.3)) traits.push(rollTrait(rng, traits));
  if (rng.chance(0.1 + quality * 0.2)) traits.push(rollTrait(rng, traits));
  return {
    str: clampStat(rng.normal(mean, 10)),
    vit: clampStat(rng.normal(mean, 10)),
    agi: clampStat(rng.normal(mean, 10)),
    hairColor: rng.int(0, HAIR_COLOR_COUNT - 1),
    skinTone: rng.int(0, SKIN_TONE_COUNT - 1),
    eyeColor: rng.int(0, EYE_COLOR_COUNT - 1),
    hairStyle: rng.int(0, HAIR_STYLE_COUNT - 1),
    traits,
  };
}

export interface InheritResult {
  genes: Genes;
  /** 돌연변이로 새로 생긴 특성 (없으면 null) */
  mutation: string | null;
}

/**
 * 두 부모의 유전자로 자녀 유전자를 만든다.
 * - 능력치: 부모 평균 + 정규분포 노이즈
 * - 특성: 부모 각자의 특성이 50% 확률로 전달. 같은 특성을 둘 다 가지면 75%가 된다.
 * - 돌연변이: 6% 확률로 새 특성 (등급 확률표는 MUTATION_RARITY_TABLE)
 * - 외형: 한쪽 부모에게서 물려받거나, 낮은 확률로 새로 나온다.
 */
export function inherit(a: Genes, b: Genes, rng: Rng): InheritResult {
  const g = BALANCE.genetics;
  const stat = (x: number, y: number) => clampStat((x + y) / 2 + rng.normal(0, g.statNoiseSd));
  const look = (x: number, y: number, count: number) =>
    rng.chance(g.looksMutation) ? rng.int(0, count - 1) : rng.chance(0.5) ? x : y;

  const inherited: string[] = [];
  for (const id of [...a.traits, ...b.traits]) {
    if (!inherited.includes(id) && rng.chance(g.traitInheritChance)) inherited.push(id);
  }

  let mutation: string | null = null;
  let traits: string[];
  if (rng.chance(g.mutationChance)) {
    mutation = rollTrait(rng, inherited);
    // 돌연변이 특성은 반드시 발현, 나머지 칸은 물려받은 것 중 무작위
    traits = [mutation, ...rng.shuffle([...inherited])].slice(0, g.maxTraits);
  } else {
    traits = rng.shuffle([...inherited]).slice(0, g.maxTraits);
  }

  return {
    genes: {
      str: stat(a.str, b.str),
      vit: stat(a.vit, b.vit),
      agi: stat(a.agi, b.agi),
      hairColor: look(a.hairColor, b.hairColor, HAIR_COLOR_COUNT),
      skinTone: look(a.skinTone, b.skinTone, SKIN_TONE_COUNT),
      eyeColor: look(a.eyeColor, b.eyeColor, EYE_COLOR_COUNT),
      hairStyle: look(a.hairStyle, b.hairStyle, HAIR_STYLE_COUNT),
      traits,
    },
    mutation,
  };
}

/** 유전 점수: 후보 비교용 단일 숫자 */
export function geneScore(genes: Genes): number {
  const rarityScore = { common: 8, rare: 18, epic: 32, legendary: 55 } as const;
  return (
    genes.str + genes.vit + genes.agi + genes.traits.reduce((s, id) => s + rarityScore[getTrait(id).rarity], 0)
  );
}

/** 배우자 후보 품질: 명성이 높은 가문일수록 좋은 혼처가 들어온다. */
export function spouseQuality(fame: number): number {
  return Math.min(1, fame / 120);
}
