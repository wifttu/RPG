import { describe, expect, it } from 'vitest';
import { autoEquip, combatPower } from '../src/core/equip';
import {
  GACHA_RARITY,
  GACHA_SLOT,
  MAX_TIER,
  PITY,
  canMerge,
  drawGacha,
  drawOne,
  equip,
  heroClass,
  itemKey,
  merge,
  mergeAll,
  parseKey,
  rarityOf,
  tierLabel,
} from '../src/core/gear';
import { Rng } from '../src/core/rng';
import { createNewGame } from '../src/core/state';
import { computeStats } from '../src/core/stats';

describe('장비 뽑기', () => {
  it('확률표 합계가 1 (확률 공개 수치 검증)', () => {
    expect(Object.values(GACHA_RARITY).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(Object.values(GACHA_SLOT).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('실제 뽑기 결과가 공개한 확률과 비슷하다', () => {
    const s = createNewGame(1, 0);
    const rng = new Rng(1);
    const N = 30000;
    const count = [0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      s.gear.pity = 0; // 천장 영향 제거
      count[rarityOf(parseKey(drawOne(s, rng).key).tier)]++;
    }
    expect(count[0] / N).toBeCloseTo(GACHA_RARITY.common, 1);
    expect(count[1] / N).toBeCloseTo(GACHA_RARITY.uncommon, 1);
    expect(count[2] / N).toBeGreaterThan(0.07);
    expect(count[2] / N).toBeLessThan(0.1);
  });

  it(`${PITY}번 안에 영웅 이상이 반드시 나온다 (천장)`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createNewGame(seed, 0);
      const rng = new Rng(seed);
      let got = false;
      for (let i = 0; i < PITY && !got; i++) got = rarityOf(parseKey(drawOne(s, rng).key).tier) >= 3;
      expect(got).toBe(true);
    }
  });

  it('보석이 모자라면 뽑을 수 없고, 뽑으면 보석이 줄어든다', () => {
    const s = createNewGame(2, 0);
    s.gems = 29;
    expect(drawGacha(s, new Rng(2), 1)).toBeNull();
    s.gems = 300;
    expect(drawGacha(s, new Rng(2), 10)).toHaveLength(10);
    expect(s.gems).toBe(30);
    expect(s.gear.draws).toBe(10);
  });
});

describe('합성·장착', () => {
  it('같은 장비 4개 → 한 단계 위, 장착 중인 1개는 재료로 쓰지 않는다', () => {
    const s = createNewGame(3, 0);
    const k = itemKey('sword', 0);
    s.gear.inv[k] = 4;
    equip(s, k);
    expect(canMerge(s, k)).toBe(false); // 장착 1개 빼면 3개
    s.gear.inv[k] = 9;
    expect(merge(s, k)).toBe(2);
    expect(s.gear.inv[k]).toBe(1);
    expect(s.gear.inv[itemKey('sword', 1)]).toBe(2);
    expect(tierLabel(1)).toBe('일반 ★★');
  });

  it('일괄 합성은 위로 연쇄된다', () => {
    const s = createNewGame(4, 0);
    s.gear.inv[itemKey('ring', 0)] = 16; // 16 → ★2 4개 → ★3 1개
    expect(mergeAll(s)).toBe(5);
    expect(s.gear.inv[itemKey('ring', 2)]).toBe(1);
    s.gear.inv[itemKey('ring', MAX_TIER)] = 8;
    mergeAll(s);
    expect(s.gear.inv[itemKey('ring', MAX_TIER)]).toBe(8); // 최고 등급은 더 못 올림
  });

  it('장비를 끼면 강해지고, 무기에 따라 직업이 바뀐다', () => {
    const s = createNewGame(5, 0);
    const before = computeStats(s, 0).atk;
    expect(heroClass(s).name).toBe('전사');
    s.gear.inv[itemKey('staff', 4)] = 1;
    equip(s, itemKey('staff', 4));
    expect(heroClass(s).name).toBe('마법사');
    expect(computeStats(s, 0).atk).toBeGreaterThan(before);
    expect(computeStats(s, 0).critMul).toBe(2.5);
  });

  it('추천 장착은 재능에 맞는 무기를 고른다 (같은 등급일 때)', () => {
    const s = createNewGame(6, 0);
    s.hero.genes.talent = 'bow';
    for (const k of ['sword', 'bow', 'staff'] as const) s.gear.inv[itemKey(k, 4)] = 1;
    s.gear.inv[itemKey('armor', 2)] = 1;
    const p0 = combatPower(s);
    autoEquip(s);
    expect(s.gear.equipped.weapon).toBe(itemKey('bow', 4));
    expect(s.gear.equipped.armor).toBe(itemKey('armor', 2));
    expect(combatPower(s)).toBeGreaterThan(p0);
  });

  it('예전 저장 데이터에는 재능이 검으로 채워진다', async () => {
    const { normalizeState } = await import('../src/core/state');
    const s = createNewGame(7, 0) as ReturnType<typeof createNewGame>;
    delete (s.hero.genes as Partial<typeof s.hero.genes>).talent;
    delete (s as Partial<typeof s>).gear;
    normalizeState(s);
    expect(s.hero.genes.talent).toBe('sword');
    expect(s.gear.draws).toBe(0);
  });
});
