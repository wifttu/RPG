import { ownedKeys, SLOTS, type ItemKey, type Slot } from './gear';
import type { GameState } from './state';
import { computeStats, expectedDps } from './stats';

/** 전투력: 초당 피해 × 체력의 제곱근 (장비 비교·화면 표시용) */
export function combatPower(state: GameState): number {
  const s = computeStats(state);
  return Math.round(expectedDps(s) * Math.sqrt(s.maxHp));
}

function withEquipped(state: GameState, slot: Slot, key: ItemKey | undefined): GameState {
  return { ...state, gear: { ...state.gear, equipped: { ...state.gear.equipped, [slot]: key } } };
}

/** 이 장비를 끼면 어떻게 되는지 (화면의 "장착 시 공격력 980 → 1,230") */
export function previewEquip(state: GameState, key: ItemKey, slot: Slot) {
  const before = computeStats(state);
  const after = computeStats(withEquipped(state, slot, key));
  return { before, after, power: combatPower(withEquipped(state, slot, key)) };
}

/**
 * 추천 장착: 부위마다 가진 장비를 하나씩 껴 보고 전투력이 가장 높은 것을 고른다.
 * (무기는 직업 보너스·재능까지 계산되므로 '재능이 활인 가주에게는 활'이 추천될 수 있다)
 * 반지는 전투력과 무관하므로 골드 배율이 가장 높은 것.
 */
export function autoEquip(state: GameState): number {
  let changed = 0;
  for (const slot of SLOTS) {
    const keys = ownedKeys(state, slot);
    if (!keys.length) continue;
    let best = state.gear.equipped[slot];
    let bestScore = -1;
    for (const k of [...keys, undefined]) {
      const trial = withEquipped(state, slot, k);
      const score = slot === 'ring' ? computeStats(trial).goldMul : combatPower(trial);
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = k;
      }
    }
    if (best && best !== state.gear.equipped[slot]) {
      state.gear.equipped[slot] = best;
      changed++;
    }
  }
  return changed;
}
