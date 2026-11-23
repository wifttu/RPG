import { BALANCE, UPGRADE_KINDS } from '../config/balance';
import { BattleSim } from './battle';
import { buyUpgrade, upgradeCost } from './economy';
import { geneScore } from './genetics';
import { buyHeirloom, heirloomCost } from './heirloom';
import { canRetire, makeChildCandidates, makeSpouseCandidates, previewFame, retire } from './lineage';
import { Rng } from './rng';
import { createNewGame, type GameState } from './state';
import { computeStats, fameMultiplier, secondsPerYear } from './stats';

/**
 * 밸런스 확인용 자동 플레이. 실제 전투 시뮬레이션(BattleSim)을 그대로 돌린다.
 * 정책: 가장 싼 수련을 계속 구매, 30세 이후 최고 기록이 N년 동안 안 오르면 은퇴,
 * 배우자·자녀는 유전 점수가 가장 높은 후보를 고른다.
 */
export interface GenReport {
  gen: number;
  maxStage: number;
  retireAge: number;
  /** 이 세대를 플레이한 실제 시간(분, 접속 상태 기준) */
  minutes: number;
  /** 이전 세대 최고 기록을 다시 따라잡는 데 걸린 시간(분) */
  catchUpMinutes: number | null;
  fameGained: number;
  fameTotal: number;
  fameMul: number;
  geneScore: number;
  traits: string[];
}

export interface AutoplayOptions {
  generations: number;
  seed?: number;
  dt?: number;
  /** 최고 기록이 이 기간(년) 동안 안 오르면 은퇴 */
  stallYears?: number;
  /** 광고 골드 2배를 항상 켠 상태로 가정 */
  adBoost?: boolean;
}

function buyHeirlooms(s: GameState): void {
  for (let i = 0; i < 100; i++) {
    const k = (['sword', 'shield', 'ring'] as const).slice().sort((a, b) => heirloomCost(s.heirlooms[a]) - heirloomCost(s.heirlooms[b]))[0];
    if (!buyHeirloom(s, k)) return;
  }
}

function buyCheapest(s: GameState): void {
  buyHeirlooms(s);
  for (let i = 0; i < 500; i++) {
    const k = [...UPGRADE_KINDS]
      .filter((k) => s.upgrades[k] < BALANCE.upgrades[k].max)
      .sort((a, b) => upgradeCost(a, s.upgrades[a]) - upgradeCost(b, s.upgrades[b]))[0];
    if (!k || !buyUpgrade(s, k)) return;
  }
}

export function autoplay(o: AutoplayOptions): GenReport[] {
  const seed = o.seed ?? 1;
  const dt = o.dt ?? 0.1;
  const stall = o.stallYears ?? 4;
  const s = createNewGame(seed, 0);
  const rng = new Rng(seed);
  const out: GenReport[] = [];
  let prevBest = 0;

  for (let g = 1; g <= o.generations; g++) {
    const sim = new BattleSim(s, rng);
    const spy = secondsPerYear(s.hero.generation);
    let t = 0;
    let lastMax = s.hero.maxStage;
    let lastMaxAge = s.hero.age;
    let catchUp: number | null = prevBest ? null : 0;
    let buyTimer = 0;
    for (;;) {
      if (o.adBoost) s.boostUntil = Number.MAX_SAFE_INTEGER;
      sim.tick(dt, 0);
      s.hero.age += dt / spy;
      t += dt;
      buyTimer += dt;
      if (buyTimer >= 1) {
        buyTimer = 0;
        buyCheapest(s);
      }
      if (s.hero.maxStage > lastMax) {
        lastMax = s.hero.maxStage;
        lastMaxAge = s.hero.age;
        if (catchUp === null && lastMax >= prevBest) catchUp = t / 60;
      }
      const life = computeStats(s, 0).lifespan;
      if (s.hero.age >= life) break;
      if (canRetire(s) && s.hero.age - lastMaxAge >= stall) break;
    }
    const fame = previewFame(s);
    const report: GenReport = {
      gen: s.hero.generation,
      maxStage: s.hero.maxStage,
      retireAge: Math.floor(s.hero.age),
      minutes: t / 60,
      catchUpMinutes: catchUp,
      fameGained: fame,
      fameTotal: s.fame + fame,
      fameMul: fameMultiplier(s.fame + fame),
      geneScore: geneScore(s.hero.genes),
      traits: [...s.hero.genes.traits],
    };
    out.push(report);
    prevBest = Math.max(prevBest, s.hero.maxStage);
    const best = <T extends { genes: Parameters<typeof geneScore>[0] }>(l: T[]) =>
      l.reduce((a, b) => (geneScore(b.genes) > geneScore(a.genes) ? b : a));
    const spouse = best(makeSpouseCandidates(s, rng));
    const child = best(makeChildCandidates(s, spouse, rng));
    retire(s, spouse, child, rng);
  }
  return out;
}

export function formatReport(rows: GenReport[]): string {
  const head = '세대 | 최고 | 은퇴나이 | 시간(분) | 따라잡기(분) | 명성+ | 명성합 | 배율 | 유전점수';
  return [
    head,
    ...rows.map((r) =>
      [
        r.gen,
        r.maxStage,
        r.retireAge,
        r.minutes.toFixed(1),
        r.catchUpMinutes === null ? '-' : r.catchUpMinutes.toFixed(1),
        r.fameGained,
        r.fameTotal,
        `x${r.fameMul.toFixed(2)}`,
        r.geneScore,
      ].join(' | '),
    ),
  ].join('\n');
}
