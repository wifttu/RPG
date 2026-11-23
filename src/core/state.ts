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

  // ── v0.2 추가 (loadGame 의 normalizeState 가 빈 값을 채운다) ──
  /** 가보 레벨 (세대를 넘어 유지) */
  heirlooms: Record<HeirloomKind, number>;
  /** 유산석: 보스가 떨어뜨림, 가보 강화에 사용 (세대를 넘어 유지) */
  legacy: number;
  /** 벽에 막히면 이 스테이지에 머물며 골드를 모은다 */
  stayMode: boolean;
  progress: Progress;
  daily: DailyState;
  attendance: { count: number; lastDay: string | null };
  /** 받은 업적 보상 id */
  achievements: string[];
  entitlements: Entitlements;
  timeGuard: { maxSeen: number; tamperCount: number };
}

export type HeirloomKind = 'sword' | 'shield' | 'ring';

/** 누적 기록 (업적·분석용) */
export interface Progress {
  bossKills: number;
  deaths: number;
  upgradesBought: number;
  retirements: number;
  mutations: number;
  legendaryBorn: number;
  adsWatched: number;
}

export interface DailyState {
  /** 로컬 날짜 YYYY-MM-DD */
  day: string;
  kills: number;
  upgrades: number;
  bosses: number;
  /** 받은 일일 보상 id */
  claimed: string[];
}

/** 결제로 얻은 권리 */
export interface Entitlements {
  noAds: boolean;
  /** 명문가 월정액 만료 시각 (epoch ms) */
  monthlyUntil: number;
  starterBought: boolean;
}

export interface PendingCandidate {
  id: string;
  name: string;
  genes: Genes;
  mutation?: string | null;
}

export const SAVE_VERSION = 1;

/** 예전 저장 데이터나 새 게임에 빠진 항목을 기본값으로 채운다 */
export function normalizeState(s: GameState, now = Date.now()): GameState {
  s.heirlooms ??= { sword: 0, shield: 0, ring: 0 };
  s.legacy ??= 0;
  s.stayMode ??= false;
  const base: Progress = {
    bossKills: 0,
    deaths: 0,
    upgradesBought: 0,
    retirements: s.lineage?.length ?? 0,
    mutations: 0,
    legendaryBorn: 0,
    adsWatched: 0,
  };
  s.progress = Object.assign(base, s.progress ?? {});
  s.daily ??= { day: '', kills: 0, upgrades: 0, bosses: 0, claimed: [] };
  s.attendance ??= { count: 0, lastDay: null };
  s.achievements ??= [];
  s.entitlements ??= { noAds: false, monthlyUntil: 0, starterBought: false };
  s.timeGuard ??= { maxSeen: now, tamperCount: 0 };
  return s;
}

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
  return normalizeState({
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
  } as unknown as GameState, now);
}
