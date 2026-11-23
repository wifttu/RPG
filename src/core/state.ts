import { BALANCE, type UpgradeKind } from '../config/balance';
import { randomGenes, type Genes } from './genetics';
import { generateName, HOUSE_NAMES } from './names';
import { Rng } from './rng';

export interface Hero {
  id: string;
  name: string;
  generation: number;
  genes: Genes;
  age: number;
  maxStage: number;
  /** 부모 이름 (1세대는 null) */
  parents: [string, string] | null;
}

export interface LineageEntry {
  id: string;
  name: string;
  generation: number;
  genes: Genes;
  spouse: { name: string; genes: Genes } | null;
  retiredAge: number;
  maxStage: number;
  fameEarned: number;
}

export interface GameState {
  version: number;
  houseName: string;
  gold: number;
  gems: number;
  fame: number;
  hero: Hero;
  upgrades: Record<UpgradeKind, number>;
  stage: number;
  lineage: LineageEntry[];
  /** 광고 골드 부스트 종료 시각 (epoch ms) */
  boostUntil: number;
  lastSeen: number;
  rngSeed: number;
  totalKills: number;
  createdAt: number;
  /** 은퇴 절차 중 뽑아둔 후보. 저장해 두어야 재접속으로 공짜 리롤을 못 한다. */
  pendingSpouses?: PendingCandidate[];
  pendingChildren?: Record<string, PendingCandidate[]>;
  /** 끝낸 튜토리얼 단계 id */
  tutorial?: string[];
}

export interface PendingCandidate {
  id: string;
  name: string;
  genes: Genes;
  mutation?: string | null;
}

export const SAVE_VERSION = 1;

let idCounter = 0;
export function newId(rng: Rng): string {
  idCounter++;
  return `${Date.now().toString(36)}-${rng.int(0, 1e9).toString(36)}-${idCounter}`;
}

export function createHero(rng: Rng, genes: Genes, generation: number, parents: [string, string] | null): Hero {
  return {
    id: newId(rng),
    name: generateName(rng),
    generation,
    genes,
    age: BALANCE.time.startAge,
    maxStage: 1,
    parents,
  };
}

export function createNewGame(seed = Date.now(), now = Date.now()): GameState {
  const rng = new Rng(seed);
  // 1세대는 평범하게 시작: 특성 1개 보장 (첫 인상에서 '특성' 개념을 보여주기 위해)
  const genes = randomGenes(rng, 0.1);
  if (genes.traits.length === 0) genes.traits.push('strong');
  return {
    version: SAVE_VERSION,
    houseName: rng.pick(HOUSE_NAMES),
    gold: 0,
    gems: BALANCE.gems.start,
    fame: 0,
    hero: createHero(rng, genes, 1, null),
    upgrades: { atk: 0, hp: 0, spd: 0 },
    stage: 1,
    lineage: [],
    boostUntil: 0,
    lastSeen: now,
    rngSeed: rng.int(1, 2 ** 31),
    totalKills: 0,
    createdAt: now,
  };
}
