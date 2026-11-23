import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { inherit, randomGenes, type Genes } from '../src/core/genetics';
import { Rng } from '../src/core/rng';
import { MUTATION_RARITY_TABLE } from '../src/core/traits';

const base = (traits: string[]): Genes => ({
  str: 50,
  vit: 50,
  agi: 50,
  hairColor: 1,
  skinTone: 2,
  eyeColor: 3,
  hairStyle: 0,
  traits,
  talent: 'sword',
});

describe('genetics', () => {
  it('mutation rarity table sums to 1 (확률 공개 수치 검증)', () => {
    const sum = Object.values(MUTATION_RARITY_TABLE).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('inherits a single-parent trait about 50% of the time', () => {
    const rng = new Rng(42);
    const a = base(['swordsoul']);
    const b = base([]);
    const N = 20000;
    let hits = 0;
    for (let i = 0; i < N; i++) if (inherit(a, b, rng).genes.traits.includes('swordsoul')) hits++;
    // 50% 유전 + 돌연변이로 같은 특성이 나올 소량
    expect(hits / N).toBeGreaterThan(0.47);
    expect(hits / N).toBeLessThan(0.54);
  });

  it('shared trait from both parents is inherited about 75%', () => {
    const rng = new Rng(7);
    const a = base(['gale']);
    const b = base(['gale']);
    const N = 20000;
    let hits = 0;
    for (let i = 0; i < N; i++) if (inherit(a, b, rng).genes.traits.includes('gale')) hits++;
    expect(hits / N).toBeGreaterThan(0.72);
    expect(hits / N).toBeLessThan(0.78);
  });

  it('mutation rate matches config', () => {
    const rng = new Rng(99);
    const N = 20000;
    let m = 0;
    for (let i = 0; i < N; i++) if (inherit(base([]), base([]), rng).mutation) m++;
    expect(m / N).toBeCloseTo(BALANCE.genetics.mutationChance, 1);
  });

  it('never exceeds max traits and never duplicates', () => {
    const rng = new Rng(1);
    const a = base(['strong', 'dragonblood']);
    const b = base(['sturdy', 'phoenix']);
    for (let i = 0; i < 5000; i++) {
      const t = inherit(a, b, rng).genes.traits;
      expect(t.length).toBeLessThanOrEqual(BALANCE.genetics.maxTraits);
      expect(new Set(t).size).toBe(t.length);
    }
  });

  it('child stats stay near parent average', () => {
    const rng = new Rng(3);
    const a = { ...base([]), str: 90 };
    const b = { ...base([]), str: 70 };
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) sum += inherit(a, b, rng).genes.str;
    expect(sum / N).toBeGreaterThan(77);
    expect(sum / N).toBeLessThan(83);
  });

  it('higher quality random genes are stronger on average', () => {
    const rng = new Rng(5);
    const avg = (q: number) => {
      let s = 0;
      for (let i = 0; i < 2000; i++) {
        const g = randomGenes(rng, q);
        s += g.str + g.vit + g.agi;
      }
      return s / 2000;
    };
    expect(avg(1)).toBeGreaterThan(avg(0) + 60);
  });
});
