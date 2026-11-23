import { grantReward, type Reward } from './daily';
import type { GameState } from './state';

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
  { id: 'monthly', name: '명문가 월정액 (30일)', desc: '매일 보석 100 · 광고 없이 모든 광고 보상', priceKrw: 5500, tag: '추천' },
  { id: 'noads', name: '광고 제거', desc: '광고 없이 모든 광고 보상 즉시 획득 (영구)', priceKrw: 6500, once: true },
  { id: 'gems1200', name: '보석 한 상자', desc: '보석 1,200', priceKrw: 12000 },
];

export function canBuy(state: GameState, id: string): boolean {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return false;
  if (id === 'starter') return !state.entitlements.starterBought;
  if (id === 'noads') return !state.entitlements.noAds;
  return true;
}

/** 결제가 확인된 뒤 호출 (스토어 영수증 검증 후) */
export function grantProduct(state: GameState, id: string, now: number): boolean {
  if (!canBuy(state, id)) return false;
  const r: Reward = {};
  switch (id) {
    case 'starter':
      state.entitlements.starterBought = true;
      Object.assign(r, { gems: 300, legacy: 10, boostMinutes: 120 });
      break;
    case 'monthly':
      state.entitlements.monthlyUntil = Math.max(now, state.entitlements.monthlyUntil) + 30 * 86_400_000;
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
