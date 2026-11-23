import { BALANCE } from '../config/balance';
import { fameForRetirement } from './economy';
import { inherit, randomGenes, spouseQuality } from './genetics';
import { generateName } from './names';
import type { Rng } from './rng';
import { createHero, newId, type GameState } from './state';
import { computeStats } from './stats';
import { getTrait } from './traits';

import type { PendingCandidate } from './state';

export type Candidate = PendingCandidate;

export function canRetire(state: GameState): boolean {
  return state.hero.age >= BALANCE.time.retireMinAge;
}

export function mustRetire(state: GameState): boolean {
  return state.hero.age >= computeStats(state).lifespan;
}

export function previewFame(state: GameState): number {
  return fameForRetirement(state.hero.maxStage, computeStats(state).fameMul);
}

export function makeSpouseCandidates(state: GameState, rng: Rng): Candidate[] {
  const q = spouseQuality(state.fame);
  return Array.from({ length: BALANCE.genetics.spouseCandidates }, () => ({
    id: newId(rng),
    name: generateName(rng),
    genes: randomGenes(rng, q),
  }));
}

export function makeChildCandidates(state: GameState, spouse: Candidate, rng: Rng): Candidate[] {
  return Array.from({ length: BALANCE.genetics.childrenPerGeneration }, () => {
    const { genes, mutation } = inherit(state.hero.genes, spouse.genes, rng);
    return { id: newId(rng), name: generateName(rng), genes, mutation };
  });
}

/** 은퇴 처리: 가계도에 기록, 명성 지급, 진행도 초기화, 자녀가 새 가주가 된다. */
export function retire(state: GameState, spouse: Candidate, child: Candidate, rng: Rng): number {
  const fameEarned = previewFame(state);
  const old = state.hero;
  state.lineage.push({
    id: old.id,
    name: old.name,
    generation: old.generation,
    genes: old.genes,
    spouse: { name: spouse.name, genes: spouse.genes },
    retiredAge: Math.floor(old.age),
    maxStage: old.maxStage,
    fameEarned,
  });
  state.fame += fameEarned;
  const heir = createHero(rng, child.genes, old.generation + 1, [old.name, spouse.name]);
  heir.name = child.name;
  state.hero = heir;
  state.gold = 0;
  state.upgrades = { atk: 0, hp: 0, spd: 0 };
  state.stage = 1;
  // 골드 부스트(광고·출석·구매로 얻은 것)는 세대가 바뀌어도 유지
  state.stayMode = false;
  state.progress.retirements++;
  if (child.mutation) state.progress.mutations++;
  if (child.genes.traits.some((id) => getTrait(id).rarity === 'legendary')) state.progress.legendaryBorn++;
  delete state.pendingSpouses;
  delete state.pendingChildren;
  return fameEarned;
}
