import type { Rng } from './rng';
import type { GameState } from './state';

/**
 * 가문 비기 (추가 스킬 칸).
 * 1번 칸은 직업 스킬. 2~4번 칸에 비기서로 배운 비기를 끼운다.
 * 비기는 가문이 배우는 것이라 세대를 넘어 유지된다. 같은 비기서를 또 얻으면 레벨이 오른다.
 */
export type ArtId = 'flame' | 'frost' | 'quake' | 'thunder' | 'heal' | 'fury';

export interface ArtDef {
  id: ArtId;
  name: string;
  /** 레벨 1 기준 설명 */
  desc: string;
  cooldown: number;
  /** 피해 비기: 타수와 한 대 배율 (공격력 기준) */
  hits?: number;
  perHit?: number;
  /** 회복 비기: 최대 체력의 비율 */
  heal?: number;
  /** 광폭: 공격 속도 배율과 지속 시간 */
  haste?: number;
  hasteSec?: number;
  color: string;
}

export const ARTS: Record<ArtId, ArtDef> = {
  flame: { id: 'flame', name: '화염 일격', desc: '7초마다 공격력 300% 불꽃', cooldown: 7, hits: 1, perHit: 3, color: '#ff8a3a' },
  frost: { id: 'frost', name: '서리 창', desc: '9초마다 얼음 창 2개 (발당 200%)', cooldown: 9, hits: 2, perHit: 2, color: '#8fd8ff' },
  quake: { id: 'quake', name: '대지 진동', desc: '11초마다 땅을 울려 2번 (발당 250%)', cooldown: 11, hits: 2, perHit: 2.5, color: '#d8a860' },
  thunder: { id: 'thunder', name: '낙뢰', desc: '12초마다 번개 3번 (발당 220%)', cooldown: 12, hits: 3, perHit: 2.2, color: '#fff27a' },
  heal: { id: 'heal', name: '가문의 가호', desc: '15초마다 체력 30% 회복', cooldown: 15, heal: 0.3, color: '#7ce68a' },
  fury: { id: 'fury', name: '광폭', desc: '20초마다 6초간 공격 속도 +50%', cooldown: 20, haste: 1.5, hasteSec: 6, color: '#ff5c6c' },
};
export const ART_IDS = Object.keys(ARTS) as ArtId[];

/** 비기서 뽑기 확률 (확률표에 공개) */
export const ART_ODDS: Record<ArtId, number> = { flame: 0.25, frost: 0.25, quake: 0.2, heal: 0.12, thunder: 0.12, fury: 0.06 };
export const ART_COST = { one: 50, ten: 450 };
/** 레벨당 효과 +20% */
export const ART_PER_LEVEL = 0.2;
export const ART_MAX_LEVEL = 10;

/** 추가 칸(2·3·4번)을 여는 조건: 가문 최고 스테이지, 또는 보석 */
export const SLOT_UNLOCK = [
  { stage: 20, gems: 100 },
  { stage: 60, gems: 300 },
  { stage: 120, gems: 800 },
];

export interface SkillState {
  owned: Partial<Record<ArtId, { lv: number; cards: number }>>;
  /** 2~4번 칸에 끼운 비기 */
  slots: (ArtId | null)[];
  /** 보석으로 연 칸 수 */
  bought: number;
  draws: number;
}

export function emptySkills(): SkillState {
  return { owned: {}, slots: [null, null, null], bought: 0, draws: 0 };
}

/** 다음 레벨에 필요한 비기서 장수 (Lv.n → n+1 은 n장) */
export function cardsToLevel(lv: number): number {
  return lv;
}

export function artPower(lv: number): number {
  return 1 + ART_PER_LEVEL * (lv - 1);
}

/** i번째 추가 칸이 열렸는지 */
export function slotOpen(state: GameState, i: number, best: number): boolean {
  return i < state.skills.bought || best >= SLOT_UNLOCK[i].stage;
}

/** 보석으로 다음 칸 열기 (앞 칸부터) */
export function buySlot(state: GameState, best: number): boolean {
  const i = [0, 1, 2].find((k) => !slotOpen(state, k, best));
  if (i === undefined) return false;
  const cost = SLOT_UNLOCK[i].gems;
  if (state.gems < cost) return false;
  state.gems -= cost;
  state.skills.bought = Math.max(state.skills.bought, i + 1);
  return true;
}

function addCard(state: GameState, id: ArtId): void {
  const o = (state.skills.owned[id] ??= { lv: 1, cards: -1 });
  o.cards++;
  while (o.lv < ART_MAX_LEVEL && o.cards >= cardsToLevel(o.lv)) {
    o.cards -= cardsToLevel(o.lv);
    o.lv++;
  }
}

/** 비기서 뽑기. 보석 부족이면 null */
export function drawArts(state: GameState, rng: Rng, n: 1 | 10): ArtId[] | null {
  const cost = n === 10 ? ART_COST.ten : ART_COST.one;
  if (state.gems < cost) return null;
  state.gems -= cost;
  const out: ArtId[] = [];
  for (let i = 0; i < n; i++) {
    const id = rng.weighted(ART_ODDS) as ArtId;
    addCard(state, id);
    out.push(id);
  }
  state.skills.draws += n;
  return out;
}

/** 칸에 비기 끼우기 (다른 칸에 있으면 옮긴다). id=null 이면 비우기 */
export function setSlot(state: GameState, i: number, id: ArtId | null, best: number): boolean {
  if (!slotOpen(state, i, best)) return false;
  if (id && !state.skills.owned[id]) return false;
  const slots = state.skills.slots;
  if (id) for (let k = 0; k < slots.length; k++) if (slots[k] === id) slots[k] = null;
  slots[i] = id;
  return true;
}

/** 빈 칸에 아직 안 낀 비기를 자동으로 (높은 레벨 우선) */
export function autoSlot(state: GameState, best: number): void {
  const owned = ART_IDS.filter((id) => state.skills.owned[id] && !state.skills.slots.includes(id)).sort(
    (a, b) => state.skills.owned[b]!.lv - state.skills.owned[a]!.lv,
  );
  for (let i = 0; i < 3; i++) if (slotOpen(state, i, best) && !state.skills.slots[i] && owned.length) state.skills.slots[i] = owned.shift()!;
}
