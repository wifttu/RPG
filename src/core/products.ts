import { grantReward, type Reward } from './daily';
import { summonLevel } from './gear';
import type { GameState } from './state';

/** 월정액 구매 즉시 주는 보석 (매일 주는 100개와 별도) */
export const MONTHLY_INSTANT_GEMS = 300;

/** 인앱 상품. 가격은 Play Console 에 등록할 값과 같게 맞춘다. */
export interface Product {
  id: string;
  name: string;
  desc: string;
  priceKrw: number;
  tag?: string;
  /** 한 번만 살 수 있는 상품 */
  once?: boolean;
}

export const PRODUCTS: Product[] = [
  { id: 'starter', name: '스타터 팩', desc: '보석 300 + 유산석 10 + 골드 2배 2시간', priceKrw: 1200, tag: '첫 구매 한정', once: true },
  {
    id: 'monthly',
    name: '명문가 월정액 (30일)',
    desc: '즉시 보석 300 + 30일간 매일 보석 100 (총 3,300) · 광고 없이 모든 광고 보상',
    priceKrw: 5500,
    tag: '추천',
  },
  { id: 'gems550', name: '보석 주머니', desc: '보석 550 (바로 지급)', priceKrw: 5500 },
  { id: 'noads', name: '광고 제거', desc: '광고 없이 모든 광고 보상 즉시 획득 (영구)', priceKrw: 6500, once: true },
  { id: 'gems1200', name: '보석 한 상자', desc: '보석 1,200 (바로 지급)', priceKrw: 12000 },
];

// ───────────────────────── 기간 한정 성장 기념 패키지 ─────────────────────────
/**
 * 특정 순간(첫 은퇴, 지역 정복, 칭호, 소환 레벨)을 달성하면 나타나서 48시간만 파는 상품.
 * 평소 상품보다 보석 효율이 2배 이상. 놓치면 다시 나오지 않는다.
 */
export interface Offer extends Product {
  /** 나타나는 조건 */
  when: (s: GameState) => boolean;
  reward: Reward;
}

export const OFFER_HOURS = 48;

export const OFFERS: Offer[] = [
  {
    id: 'offer_heir',
    name: '첫 계승 기념 패키지',
    desc: '보석 800 + 유산석 20 · 첫 후계자의 출발을 든든하게',
    priceKrw: 3300,
    tag: '48시간 한정',
    when: (s) => s.progress.retirements >= 1,
    reward: { gems: 800, legacy: 20 },
  },
  {
    id: 'offer_region',
    name: '지역 정복 기념 패키지',
    desc: '보석 1,200 + 골드 2배 3시간 · 30스테이지 돌파 기념',
    priceKrw: 5500,
    tag: '48시간 한정',
    when: (s) => s.hero.maxStage > 30 || s.lineage.some((l) => l.maxStage > 30),
    reward: { gems: 1200, boostMinutes: 180 },
  },
  {
    id: 'offer_rank',
    name: '용사 칭호 기념 패키지',
    desc: '보석 2,500 + 유산석 60 · 가문 첫 「용사」 칭호 기념',
    priceKrw: 11000,
    tag: '48시간 한정',
    when: (s) => s.bestRank >= 3,
    reward: { gems: 2500, legacy: 60 },
  },
  {
    id: 'offer_summon',
    name: '소환 달인 패키지',
    desc: '보석 2,800 · 소환 Lv.5 달성 기념',
    priceKrw: 11000,
    tag: '48시간 한정',
    when: (s) => summonLevel(s.gear.draws) >= 5,
    reward: { gems: 2800 },
  },
];

/** 조건을 막 채운 한정 상품을 열어 둔다. 새로 열린 상품 목록을 돌려준다 */
export function checkOffers(state: GameState, now: number): Offer[] {
  const opened: Offer[] = [];
  for (const o of OFFERS) {
    if (state.offers[o.id] || !o.when(state)) continue;
    state.offers[o.id] = { until: now + OFFER_HOURS * 3_600_000, bought: false };
    opened.push(o);
  }
  return opened;
}

/** 지금 살 수 있는 한정 상품 (남은 시간과 함께) */
export function activeOffers(state: GameState, now: number): { offer: Offer; leftMs: number }[] {
  return OFFERS.flatMap((o) => {
    const st = state.offers[o.id];
    if (!st || st.bought || st.until <= now) return [];
    return [{ offer: o, leftMs: st.until - now }];
  });
}

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((x) => x.id === id) ?? OFFERS.find((x) => x.id === id);
}

export function canBuy(state: GameState, id: string, now = Date.now()): boolean {
  const offer = OFFERS.find((o) => o.id === id);
  if (offer) {
    const st = state.offers[id];
    return !!st && !st.bought && st.until > now;
  }
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return false;
  if (id === 'starter') return !state.entitlements.starterBought;
  if (id === 'noads') return !state.entitlements.noAds;
  return true;
}

/** 결제가 확인된 뒤 호출 (스토어 영수증 검증 후) */
export function grantProduct(state: GameState, id: string, now: number): boolean {
  if (!canBuy(state, id, now)) return false;
  const r: Reward = {};
  const offer = OFFERS.find((o) => o.id === id);
  if (offer) {
    state.offers[id].bought = true;
    grantReward(state, offer.reward, now);
    return true;
  }
  switch (id) {
    case 'starter':
      state.entitlements.starterBought = true;
      Object.assign(r, { gems: 300, legacy: 10, boostMinutes: 120 });
      break;
    case 'monthly':
      state.entitlements.monthlyUntil = Math.max(now, state.entitlements.monthlyUntil) + 30 * 86_400_000;
      r.gems = MONTHLY_INSTANT_GEMS;
      break;
    case 'gems550':
      r.gems = 550;
      break;
    case 'noads':
      state.entitlements.noAds = true;
      break;
    case 'gems1200':
      r.gems = 1200;
      break;
    default:
      return false;
  }
  grantReward(state, r, now);
  return true;
}

export function formatKrw(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}
