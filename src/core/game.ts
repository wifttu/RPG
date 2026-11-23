import { BALANCE, type UpgradeKind } from '../config/balance';
import { BattleSim, type BattleEvent } from './battle';
import { buyUpgrade, computeOffline, type OfflineResult } from './economy';
import {
  makeChildCandidates,
  makeSpouseCandidates,
  mustRetire,
  retire,
  type Candidate,
} from './lineage';
import { Rng } from './rng';
import { loadGame, saveGame } from './save';
import { createNewGame, type GameState } from './state';
import { computeStats, secondsPerYear } from './stats';

type Listener<T> = (payload: T) => void;

interface GameEvents {
  battle: BattleEvent[];
  change: void;
  retirementDue: void;
  newGeneration: { fameEarned: number };
}

/** 게임 전체 상태와 규칙을 가진 루트 객체. 화면/UI는 이벤트를 구독만 한다. */
export class Game {
  state: GameState;
  sim: BattleSim;
  rng: Rng;
  offline: OfflineResult | null = null;
  /** 은퇴 절차가 진행 중이면 전투를 멈춘다 */
  retiring = false;
  private listeners: { [K in keyof GameEvents]?: Listener<GameEvents[K]>[] } = {};
  private saveTimer = 0;
  timeScale = 1;

  constructor(now = Date.now()) {
    const loaded = loadGame();
    this.state = loaded ?? createNewGame(now, now);
    this.rng = new Rng(this.state.rngSeed);
    if (loaded) {
      const off = computeOffline(this.state, now);
      if (off.seconds > 60 && off.gold > 0) this.offline = off;
      this.state.hero.age += off.years;
      this.state.gold += off.gold;
    }
    this.state.lastSeen = now;
    this.sim = new BattleSim(this.state, this.rng);
    if (!loaded) this.save(now);
  }

  on<K extends keyof GameEvents>(k: K, fn: Listener<GameEvents[K]>): void {
    (this.listeners[k] ??= []).push(fn as never);
  }

  private emit<K extends keyof GameEvents>(k: K, payload: GameEvents[K]): void {
    for (const fn of this.listeners[k] ?? []) (fn as Listener<GameEvents[K]>)(payload);
  }

  get stats() {
    return this.sim.stats;
  }

  /** 매 프레임 호출 (dt: 초) */
  update(dtRaw: number, now = Date.now()): void {
    const dt = Math.min(dtRaw, 0.25) * this.timeScale;
    if (this.retiring) return;

    const lifespan = computeStats(this.state, now).lifespan;
    this.state.hero.age = Math.min(lifespan, this.state.hero.age + dt / secondsPerYear(this.state.hero.generation));
    if (mustRetire(this.state)) {
      this.beginRetirement();
      return;
    }

    // 큰 배속에서도 판정이 튀지 않도록 잘게 나눠서 시뮬레이션
    const steps = Math.ceil(dt / 0.05);
    const all: BattleEvent[] = [];
    for (let i = 0; i < steps; i++) all.push(...this.sim.tick(dt / steps, now));
    if (all.length) {
      this.emit('battle', all);
      this.emit('change', undefined);
    }

    this.saveTimer += dtRaw;
    if (this.saveTimer > 5) this.save(now);
  }

  save(now = Date.now()): void {
    this.saveTimer = 0;
    this.state.lastSeen = now;
    this.state.rngSeed = this.rng.seed;
    saveGame(this.state);
  }

  upgrade(kind: UpgradeKind): boolean {
    const ok = buyUpgrade(this.state, kind);
    if (ok) {
      this.sim.refreshStats();
      this.emit('change', undefined);
    }
    return ok;
  }

  claimOffline(multiplier: number): void {
    if (!this.offline) return;
    // 기본분은 생성자에서 이미 지급. 광고 시청 시 추가분만 지급.
    this.state.gold += this.offline.gold * (multiplier - 1);
    this.offline = null;
    this.emit('change', undefined);
    this.save();
  }

  activateGoldBoost(now = Date.now()): void {
    const base = Math.max(now, this.state.boostUntil);
    this.state.boostUntil = base + BALANCE.ads.goldBoostMinutes * 60_000;
    this.sim.refreshStats(now);
    this.emit('change', undefined);
    this.save(now);
  }

  addGems(n: number): void {
    this.state.gems += n;
    this.emit('change', undefined);
  }

  spendGems(n: number): boolean {
    if (this.state.gems < n) return false;
    this.state.gems -= n;
    this.emit('change', undefined);
    return true;
  }

  beginRetirement(): void {
    if (this.retiring) return;
    this.retiring = true;
    this.emit('retirementDue', undefined);
  }

  cancelRetirement(): void {
    if (mustRetire(this.state)) return; // 수명이 다하면 취소 불가
    this.retiring = false;
  }

  spouseCandidates(): Candidate[] {
    if (!this.state.pendingSpouses) {
      this.state.pendingSpouses = makeSpouseCandidates(this.state, this.rng);
      this.save();
    }
    return this.state.pendingSpouses;
  }

  /** 보석을 써서 혼담을 새로 받는다 */
  rerollSpouses(): Candidate[] | null {
    if (!this.spendGems(BALANCE.gems.spouseReroll)) return null;
    delete this.state.pendingSpouses;
    return this.spouseCandidates();
  }

  childCandidates(spouse: Candidate): Candidate[] {
    // 배우자별로 저장: 배우자를 바꿨다 돌아와도 자녀 후보가 바뀌지 않는다 (무료 리롤 방지)
    const p = (this.state.pendingChildren ??= {});
    if (!p[spouse.id]) {
      p[spouse.id] = makeChildCandidates(this.state, spouse, this.rng);
      this.save();
    }
    return p[spouse.id];
  }

  /** 보석을 써서 자녀 후보를 다시 뽑는다 (축복 의식) */
  rerollChildren(spouse: Candidate): Candidate[] | null {
    if (!this.spendGems(BALANCE.gems.childReroll)) return null;
    if (this.state.pendingChildren) delete this.state.pendingChildren[spouse.id];
    return this.childCandidates(spouse);
  }

  completeRetirement(spouse: Candidate, child: Candidate): number {
    const fameEarned = retire(this.state, spouse, child, this.rng);
    this.sim = new BattleSim(this.state, this.rng);
    this.retiring = false;
    this.save();
    this.emit('newGeneration', { fameEarned });
    this.emit('change', undefined);
    return fameEarned;
  }
}
