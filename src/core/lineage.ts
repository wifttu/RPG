import { BALANCE } from '../config/balance';
import { fameForRetirement } from './economy';
import { inherit, randomGenes, spouseQuality } from './genetics';
import { generateName } from './names';
import type { Rng } from './rng';
import { createHero, newId, type GameState } from './state';
import { computeStats } from './stats';
import { getTrait } from './traits';
import { LIFE_EVENT_ODDS } from './events';

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

/** 가문에서 이미 쓰인 이름 (역대 가주·배우자·현 가주) */
export function takenNames(state: GameState): Set<string> {
  const s = new Set<string>([state.hero.name]);
  for (const l of state.lineage) {
    s.add(l.name);
    if (l.spouse) s.add(l.spouse.name);
  }
  return s;
}

export function makeSpouseCandidates(state: GameState, rng: Rng): Candidate[] {
  const q = spouseQuality(state.fame);
  const taken = takenNames(state);
  const list: Candidate[] = Array.from({ length: BALANCE.genetics.spouseCandidates }, () => {
    const name = generateName(rng, taken);
    taken.add(name);
    return { id: newId(rng), name, genes: randomGenes(rng, q) };
  });
  // 사건: 용의 혼약 — 전설 특성 '용의 혈통'을 가진 혼처가 들어온다
  if (rng.chance(LIFE_EVENT_ODDS.dragonSuitor)) {
    const c = list[list.length - 1];
    c.genes.traits = ['dragonblood', ...c.genes.traits.filter((t) => t !== 'dragonblood')].slice(0, BALANCE.genetics.maxTraits);
    c.special = '용의 혼약';
  }
  return list;
}

export function makeChildCandidates(state: GameState, spouse: Candidate, rng: Rng): Candidate[] {
  const taken = takenNames(state);
  taken.add(spouse.name);
  const list: Candidate[] = Array.from({ length: BALANCE.genetics.childrenPerGeneration }, () => {
    const { genes, mutation } = inherit(state.hero.genes, spouse.genes, rng);
    const name = generateName(rng, taken);
    taken.add(name);
    return { id: newId(rng), name, genes, mutation };
  });
  // 사건: 쌍둥이 — 첫째와 똑같은 유전자를 가진 아이가 한 명 더 (후보 4명)
  if (rng.chance(LIFE_EVENT_ODDS.twins)) {
    const a = list[0];
    const name = generateName(rng, taken);
    a.twin = true;
    list.splice(1, 0, { id: newId(rng), name, genes: structuredClone(a.genes), mutation: a.mutation, twin: true });
  }
  return list;
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
