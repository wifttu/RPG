import { describe, expect, it } from 'vitest';
import { BattleSim, type BattleEvent } from '../src/core/battle';
import { canTrial, nextRank, RANKS, rankMultiplier } from '../src/core/rank';
import { retire } from '../src/core/lineage';
import { Rng } from '../src/core/rng';
import { createNewGame, normalizeState } from '../src/core/state';
import { computeStats } from '../src/core/stats';

const run = (sim: BattleSim, sec: number) => {
  const ev: BattleEvent[] = [];
  for (let t = 0; t < sec; t += 0.05) ev.push(...sim.tick(0.05, 0));
  return ev;
};

describe('승급 시련', () => {
  it('스테이지 조건을 채워야 시련을 볼 수 있다', () => {
    const s = createNewGame(1, 0);
    expect(canTrial(s)).toBe(false);
    s.hero.maxStage = RANKS[1].stage;
    expect(canTrial(s)).toBe(true);
    expect(nextRank(s)?.name).toBe(RANKS[1].name);
  });

  it('시련을 이기면 칭호가 오르고 능력치 배율, 가문 첫 달성 보석', () => {
    const s = createNewGame(2, 0);
    s.autoBoss = false;
    s.hero.maxStage = RANKS[1].stage;
    s.upgrades = { atk: 60, hp: 60, spd: 5 };
    const atk0 = computeStats(s, 0).atk;
    const gems0 = s.gems;
    const sim = new BattleSim(s, new Rng(2));
    run(sim, 1);
    expect(sim.startTrial()).toBe(true);
    const ev = run(sim, 40);
    expect(ev.some((e) => e.type === 'trialStart')).toBe(true);
    const win = ev.find((e) => e.type === 'trialWin');
    expect(win).toBeTruthy();
    expect(s.hero.rank).toBe(1);
    expect(s.bestRank).toBe(1);
    expect(s.gems).toBe(gems0 + RANKS[1].gems);
    expect(computeStats(s, 0).atk).toBeCloseTo(atk0 * rankMultiplier(1));
  });

  it('지면 칭호도 스테이지도 그대로, 강해지기를 권한다', () => {
    const s = createNewGame(3, 0);
    s.autoBoss = false;
    s.hero.maxStage = RANKS[2].stage;
    s.hero.rank = 1;
    const sim = new BattleSim(s, new Rng(3));
    run(sim, 1);
    expect(sim.startTrial()).toBe(true);
    const ev = run(sim, 45);
    expect(ev.some((e) => e.type === 'trialFail')).toBe(true);
    expect(s.hero.rank).toBe(1);
    expect(sim.trialWaiting).toBe(true);
  });

  it('후계자는 견습생부터, 가계도에 칭호가 남고 첫 달성 보석은 다시 안 준다', () => {
    const s = createNewGame(4, 0);
    s.hero.rank = 3;
    s.bestRank = 3;
    s.hero.age = 40;
    const rng = new Rng(4);
    const spouse = { id: 'a', name: '테스트', genes: structuredClone(s.hero.genes) };
    retire(s, spouse, { id: 'b', name: '후계', genes: structuredClone(s.hero.genes) }, rng);
    expect(s.lineage[0].rank).toBe(3);
    expect(s.hero.rank).toBe(0);
    expect(s.bestRank).toBe(3);
  });

  it('예전 저장에는 칭호 0', () => {
    const s = createNewGame(5, 0) as unknown as Record<string, unknown>;
    delete s.bestRank;
    delete (s.hero as Record<string, unknown>).rank;
    const n = normalizeState(s as never);
    expect(n.bestRank).toBe(0);
    expect(n.hero.rank).toBe(0);
  });
});
