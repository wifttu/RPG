import { describe, expect, it } from 'vitest';
import { BALANCE, UPGRADE_KINDS } from '../src/config/balance';
import { BattleSim } from '../src/core/battle';
import { buyUpgrade, computeOffline, fameForRetirement, upgradeCost } from '../src/core/economy';
import { makeChildCandidates, makeSpouseCandidates, retire } from '../src/core/lineage';
import { Rng } from '../src/core/rng';
import { createNewGame } from '../src/core/state';
import { ageMultiplier, computeStats } from '../src/core/stats';

describe('stats & economy', () => {
  it('age curve peaks in prime and declines in old age', () => {
    const life = 60;
    const young = ageMultiplier(18, life);
    const prime = ageMultiplier(30, life);
    const old = ageMultiplier(58, life);
    expect(prime).toBeGreaterThan(young);
    expect(prime).toBeGreaterThan(old);
  });

  it('upgrade costs grow and purchase spends gold', () => {
    const s = createNewGame(1, 0);
    expect(upgradeCost('atk', 10)).toBeGreaterThan(upgradeCost('atk', 9));
    s.gold = 1000;
    const before = computeStats(s, 0).atk;
    expect(buyUpgrade(s, 'atk')).toBe(true);
    expect(s.gold).toBe(1000 - upgradeCost('atk', 0));
    expect(computeStats(s, 0).atk).toBeGreaterThan(before);
  });

  it('fame grows with max stage', () => {
    expect(fameForRetirement(80)).toBeGreaterThan(fameForRetirement(40));
    expect(fameForRetirement(1)).toBe(0);
  });
});

describe('offline', () => {
  it('caps offline time and stops aging at lifespan', () => {
    const s = createNewGame(2, 0);
    s.stage = 5;
    const now = 100 * 3600 * 1000; // 100시간 후
    const off = computeOffline(s, now);
    expect(off.seconds).toBe(BALANCE.time.offlineCapSec);
    expect(s.hero.age + off.years).toBeLessThanOrEqual(computeStats(s, now).lifespan + 1e-9);
    expect(off.reachedLifespan).toBe(true);
    expect(off.gold).toBeGreaterThan(0);
  });
});

describe('battle sim + generations (balance smoke test)', () => {
  /** 자동으로 가장 싼 업그레이드를 사면서 한 세대를 끝까지 돌려본다 */
  function playGeneration(seed: number, fame: number) {
    const s = createNewGame(seed, 0);
    s.fame = fame;
    const rng = new Rng(seed);
    const sim = new BattleSim(s, rng);
    const life = computeStats(s, 0).lifespan;
    const dt = 0.05;
    let t = 0;
    while (s.hero.age < life) {
      sim.tick(dt, 0);
      s.hero.age += dt / BALANCE.time.secondsPerYear;
      t += dt;
      if (Math.round(t / dt) % 20 === 0) {
        for (;;) {
          const k = [...UPGRADE_KINDS].sort((a, b) => upgradeCost(a, s.upgrades[a]) - upgradeCost(b, s.upgrades[b]))[0];
          if (!buyUpgrade(s, k)) break;
        }
      }
    }
    return { s, rng };
  }

  it('first generation makes meaningful progress, fame boosts the next', () => {
    const g1 = playGeneration(1, 0);
    expect(g1.s.hero.maxStage).toBeGreaterThan(15);
    const fame = fameForRetirement(g1.s.hero.maxStage);
    expect(fame).toBeGreaterThan(0);
    const g2 = playGeneration(11, fame);
    expect(g2.s.hero.maxStage).toBeGreaterThan(g1.s.hero.maxStage);
    console.log(`[balance] gen1 maxStage=${g1.s.hero.maxStage} fame=${fame} -> gen2 maxStage=${g2.s.hero.maxStage}`);
  });

  it('retire resets progress and creates next generation', () => {
    const s = createNewGame(3, 0);
    const rng = new Rng(3);
    s.hero.maxStage = 40;
    s.gold = 9999;
    s.upgrades.atk = 10;
    const spouse = makeSpouseCandidates(s, rng)[0];
    const child = makeChildCandidates(s, spouse, rng)[0];
    const fame = retire(s, spouse, child, rng);
    expect(fame).toBeGreaterThan(0);
    expect(s.fame).toBe(fame);
    expect(s.hero.generation).toBe(2);
    expect(s.hero.parents?.[1]).toBe(spouse.name);
    expect(s.gold).toBe(0);
    expect(s.upgrades.atk).toBe(0);
    expect(s.lineage).toHaveLength(1);
  });
});
