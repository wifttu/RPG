import { BALANCE } from '../config/balance';
import type { Rng } from './rng';
import type { GameState } from './state';

/**
 * 장비: 뽑기로 얻고, 같은 장비 4개를 합성해 등급을 올린다.
 * 장비는 가문의 무기고에 쌓여서 세대가 바뀌어도 유지된다.
 *
 * 등급(tier) 0~19 = 희귀도 5단계 × 별 4단계
 *   일반★1 … 일반★4, 고급★1 … 전설★4
 */

export type Slot = 'weapon' | 'helmet' | 'armor' | 'necklace' | 'ring';
export type WeaponKind = 'sword' | 'bow' | 'staff';
export type ItemKind = WeaponKind | 'helmet' | 'armor' | 'necklace' | 'ring';

export const SLOTS: Slot[] = ['weapon', 'helmet', 'armor', 'necklace', 'ring'];
export const SLOT_LABEL: Record<Slot, string> = {
  weapon: '무기',
  helmet: '투구',
  armor: '갑옷',
  necklace: '목걸이',
  ring: '반지',
};
export const WEAPON_KINDS: WeaponKind[] = ['sword', 'bow', 'staff'];

export const RARITIES = [
  { id: 'common', name: '일반', color: '#b8b4c8' },
  { id: 'uncommon', name: '고급', color: '#6ad06a' },
  { id: 'rare', name: '희귀', color: '#6fb6ff' },
  { id: 'epic', name: '영웅', color: '#c98ae2' },
  { id: 'legend', name: '전설', color: '#ffb84a' },
] as const;
export const STARS = 4;
export const MAX_TIER = RARITIES.length * STARS - 1;
export const MERGE_COUNT = 4;

export const rarityOf = (tier: number) => Math.floor(tier / STARS);
export const starOf = (tier: number) => (tier % STARS) + 1;

export function tierLabel(tier: number): string {
  return `${RARITIES[rarityOf(tier)].name} ${'★'.repeat(starOf(tier))}`;
}

const NAMES: Record<ItemKind, string[]> = {
  sword: ['녹슨 검', '기사의 검', '푸른 강철검', '영웅의 대검', '전설의 성검'],
  bow: ['사냥꾼의 활', '숲지기 장궁', '바람의 활', '영웅의 복합궁', '전설의 성궁'],
  staff: ['나무 지팡이', '견습 마법봉', '비전 지팡이', '영웅의 마법봉', '전설의 현자 지팡이'],
  helmet: ['가죽 두건', '철 투구', '기사 투구', '영웅의 투구', '전설의 왕관 투구'],
  armor: ['누비 갑옷', '사슬 갑옷', '판금 갑옷', '영웅의 갑주', '전설의 용린 갑옷'],
  necklace: ['구리 목걸이', '은 목걸이', '청옥 목걸이', '영웅의 부적', '전설의 성배 목걸이'],
  ring: ['구리 반지', '은 반지', '청옥 반지', '영웅의 인장', '전설의 가문 인장'],
};

export const KIND_LABEL: Record<ItemKind, string> = {
  sword: '검',
  bow: '활',
  staff: '지팡이',
  helmet: '투구',
  armor: '갑옷',
  necklace: '목걸이',
  ring: '반지',
};

export function slotOfKind(kind: ItemKind): Slot {
  return (WEAPON_KINDS as string[]).includes(kind) ? 'weapon' : (kind as Slot);
}

// ───────────────────────── 아이템 키 ─────────────────────────
/** 같은 종류·같은 등급의 장비는 하나로 묶어 개수만 센다 (예: "bow:5") */
export type ItemKey = string;
export const itemKey = (kind: ItemKind, tier: number): ItemKey => `${kind}:${tier}`;
export function parseKey(key: ItemKey): { kind: ItemKind; tier: number; slot: Slot } {
  const [kind, t] = key.split(':') as [ItemKind, string];
  return { kind, tier: Number(t), slot: slotOfKind(kind) };
}
export function itemName(key: ItemKey): string {
  const { kind, tier } = parseKey(key);
  return NAMES[kind][rarityOf(tier)];
}

// ───────────────────────── 능력치 ─────────────────────────
export interface GearEffects {
  atkMul: number;
  hpMul: number;
  spdMul: number;
  critAdd: number;
  critMul: number;
  goldMul: number;
}

const NEUTRAL: GearEffects = { atkMul: 1, hpMul: 1, spdMul: 1, critAdd: 0, critMul: BALANCE.hero.critMultiplier, goldMul: 1 };

/** 장비 하나의 효과 (장착 시) */
export function itemEffect(key: ItemKey): Partial<GearEffects> {
  const { kind, tier } = parseKey(key);
  switch (kind) {
    case 'sword':
    case 'bow':
    case 'staff':
      return { atkMul: 1 + 0.25 * 1.32 ** tier };
    case 'helmet':
      return { hpMul: 1 + 0.15 * 1.32 ** tier };
    case 'armor':
      return { hpMul: 1 + 0.25 * 1.32 ** tier };
    case 'necklace':
      return { critAdd: 0.01 + 0.005 * tier };
    case 'ring':
      return { goldMul: 1 + 0.15 * 1.3 ** tier };
  }
}

/** 직업: 장착한 무기 종류로 정해진다. 무기가 없으면 전사. */
export interface ClassDef {
  kind: WeaponKind;
  name: string;
  desc: string;
  ranged: boolean;
  effect: Partial<GearEffects>;
}

export const CLASSES: Record<WeaponKind, ClassDef> = {
  sword: { kind: 'sword', name: '전사', desc: '체력 +30%, 공격력 +10% · 근접', ranged: false, effect: { hpMul: 1.3, atkMul: 1.1 } },
  bow: { kind: 'bow', name: '궁수', desc: '공격 속도 +30%, 치명타 +8%p · 원거리', ranged: true, effect: { spdMul: 1.3, critAdd: 0.08 } },
  staff: {
    kind: 'staff',
    name: '마법사',
    desc: '공격력 +30%, 공격 속도 -15%, 치명타 피해 2.5배 · 원거리',
    ranged: true,
    effect: { atkMul: 1.3, spdMul: 0.85, critMul: 2.5 },
  },
};

/** 재능(유전)과 같은 무기를 들면 */
export const TALENT_ATK_BONUS = 1.25;

export function heroClass(state: GameState): ClassDef {
  const w = state.gear?.equipped.weapon;
  return CLASSES[w ? (parseKey(w).kind as WeaponKind) : 'sword'];
}

export function gearEffects(state: GameState, equipped = state.gear?.equipped ?? {}): GearEffects {
  const e = { ...NEUTRAL };
  const apply = (p: Partial<GearEffects>) => {
    if (p.atkMul) e.atkMul *= p.atkMul;
    if (p.hpMul) e.hpMul *= p.hpMul;
    if (p.spdMul) e.spdMul *= p.spdMul;
    if (p.goldMul) e.goldMul *= p.goldMul;
    if (p.critAdd) e.critAdd += p.critAdd;
    if (p.critMul) e.critMul = Math.max(e.critMul, p.critMul);
  };
  for (const slot of SLOTS) {
    const k = equipped[slot];
    if (k) apply(itemEffect(k));
  }
  const w = equipped.weapon;
  const cls = CLASSES[w ? (parseKey(w).kind as WeaponKind) : 'sword'];
  apply(cls.effect);
  if (w && state.hero.genes.talent === cls.kind) e.atkMul *= TALENT_ATK_BONUS;
  return e;
}

// ───────────────────────── 뽑기 ─────────────────────────
/** 희귀도 확률 (뽑기는 항상 ★1). UI 확률표와 테스트가 이 값을 그대로 쓴다. */
export const GACHA_RARITY: Record<string, number> = {
  common: 0.62,
  uncommon: 0.27,
  rare: 0.085,
  epic: 0.022,
  legend: 0.003,
};
/** 부위 확률. 무기는 검·활·지팡이가 같은 확률로 나뉜다. */
export const GACHA_SLOT: Record<Slot, number> = {
  weapon: 0.34,
  helmet: 0.165,
  armor: 0.165,
  necklace: 0.165,
  ring: 0.165,
};
/** 영웅 이상이 안 나오고 이만큼 뽑으면 다음 한 번은 영웅 확정 (천장) */
export const PITY = 50;
export const GACHA_COST = { one: 30, ten: 270 };

export interface DrawResult {
  key: ItemKey;
  pity: boolean;
}

export function drawOne(state: GameState, rng: Rng): DrawResult {
  const g = state.gear;
  const pityHit = g.pity >= PITY - 1;
  const rolled = rng.weighted(GACHA_RARITY); // 한 번만 굴린다
  let rarity = RARITIES.findIndex((r) => r.id === rolled);
  if (pityHit && rarity < 3) rarity = 3;
  const slot = rng.weighted(GACHA_SLOT) as Slot;
  const kind: ItemKind = slot === 'weapon' ? rng.pick(WEAPON_KINDS) : slot;
  const key = itemKey(kind, rarity * STARS);
  g.inv[key] = (g.inv[key] ?? 0) + 1;
  g.draws++;
  g.pity = rarity >= 3 ? 0 : g.pity + 1;
  g.bestTier = Math.max(g.bestTier, rarity * STARS);
  return { key, pity: pityHit && rarity === 3 };
}

/** 보석을 써서 n회 뽑기. 보석이 모자라면 null */
export function drawGacha(state: GameState, rng: Rng, n: 1 | 10, free = false): DrawResult[] | null {
  const cost = free ? 0 : n === 10 ? GACHA_COST.ten : GACHA_COST.one;
  if (state.gems < cost) return null;
  state.gems -= cost;
  return Array.from({ length: n }, () => drawOne(state, rng));
}

// ───────────────────────── 합성·장착 ─────────────────────────
/** 장착 중인 1개는 합성 재료로 쓰지 않는다 */
export function spareCount(state: GameState, key: ItemKey): number {
  const { slot } = parseKey(key);
  const n = state.gear.inv[key] ?? 0;
  return state.gear.equipped[slot] === key ? n - 1 : n;
}

export function canMerge(state: GameState, key: ItemKey): boolean {
  return parseKey(key).tier < MAX_TIER && spareCount(state, key) >= MERGE_COUNT;
}

/** 4개 → 다음 등급 1개. 가능한 만큼 반복. 만든 개수를 돌려준다 */
export function merge(state: GameState, key: ItemKey): number {
  let made = 0;
  const { kind, tier } = parseKey(key);
  while (canMerge(state, key)) {
    state.gear.inv[key] -= MERGE_COUNT;
    const up = itemKey(kind, tier + 1);
    state.gear.inv[up] = (state.gear.inv[up] ?? 0) + 1;
    state.gear.bestTier = Math.max(state.gear.bestTier, tier + 1);
    made++;
  }
  if (state.gear.inv[key] === 0) delete state.gear.inv[key];
  return made;
}

/** 낮은 등급부터 위로 연쇄 합성 (4개 모이면 올리고, 올린 것도 4개면 또 올림) */
export function mergeAll(state: GameState): number {
  let total = 0;
  for (let t = 0; t < MAX_TIER; t++) {
    for (const key of Object.keys(state.gear.inv)) {
      if (parseKey(key).tier === t) total += merge(state, key);
    }
  }
  return total;
}

export function equip(state: GameState, key: ItemKey): boolean {
  if (!(state.gear.inv[key] > 0)) return false;
  state.gear.equipped[parseKey(key).slot] = key;
  return true;
}

export function ownedKeys(state: GameState, slot?: Slot): ItemKey[] {
  return Object.keys(state.gear.inv)
    .filter((k) => state.gear.inv[k] > 0 && (!slot || parseKey(k).slot === slot))
    .sort((a, b) => parseKey(b).tier - parseKey(a).tier || a.localeCompare(b));
}

export function emptyGear(): GameState['gear'] {
  return { inv: {}, equipped: {}, draws: 0, pity: 0, bestTier: -1 };
}
