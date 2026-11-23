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
import { ACHIEVEMENTS, isDone } from './achievements';
import { track } from './analytics';
import { clock, isRollback, markSeen } from './clock';
import { claimAttendance, claimMission, claimMonthly, grantReward, rolloverDaily, type Mission, type Reward } from './daily';
import { buyHeirloom } from './heirloom';
import { autoEquip } from './equip';
import { drawGacha, equip, merge, mergeAll, parseKey, tierLabel, type DrawResult, type ItemKey } from './gear';
import { grantProduct } from './products';
import { Rng } from './rng';
import { exportSaveCode, loadGame, saveGame } from './save';
import { createNewGame, type GameState, type HeirloomKind } from './state';
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

  /** 이번 접속에서 시계를 뒤로 돌린 게 감지됐는지 */
  tampered = false;

  constructor(now = clock.now()) {
    const loaded = loadGame();
    this.state = loaded ?? createNewGame(now, now);
    this.rng = new Rng(this.state.rngSeed);
    if (loaded) {
      if (isRollback(this.state, now)) {
        // 시계를 뒤로 돌림: 오프라인 보상 없음
        this.tampered = true;
        this.state.timeGuard.tamperCount++;
        track('clock_rollback', { count: this.state.timeGuard.tamperCount });
      } else {
        const off = computeOffline(this.state, now);
        if (off.seconds > 60 && off.gold > 0) this.offline = off;
        this.state.hero.age += off.years;
        this.state.gold += off.gold;
      }
    }
    rolloverDaily(this.state, now);
    markSeen(this.state, now);
    this.state.lastSeen = now;
    this.sim = new BattleSim(this.state, this.rng);
    track('session_start', { gen: this.state.hero.generation, best: this.state.hero.maxStage, isNew: !loaded });
    if (!loaded) this.save(now);
  }

  /** 기기 이전 코드로 불러온 데이터로 교체 */
  replaceState(next: GameState): void {
    this.state = next;
    this.rng = new Rng(next.rngSeed);
    this.sim = new BattleSim(this.state, this.rng);
    this.retiring = false;
    this.offline = null;
    this.save(clock.now());
    track('save_import', { gen: next.hero.generation });
    this.emit('newGeneration', { fameEarned: 0 });
    this.emit('change', undefined);
  }

  exportCode(): string {
    this.save();
    track('save_export');
    return exportSaveCode(this.state);
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

  save(now = clock.now()): void {
    this.saveTimer = 0;
    rolloverDaily(this.state, now);
    markSeen(this.state, now);
    this.state.lastSeen = now;
    this.state.rngSeed = this.rng.seed;
    saveGame(this.state);
  }

  upgrade(kind: UpgradeKind): boolean {
    const ok = buyUpgrade(this.state, kind);
    if (ok) {
      this.state.progress.upgradesBought++;
      this.state.daily.upgrades++;
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

  activateGoldBoost(now = clock.now()): void {
    const base = Math.max(now, this.state.boostUntil);
    this.state.boostUntil = base + BALANCE.ads.goldBoostMinutes * 60_000;
    this.sim.refreshStats(now);
    this.emit('change', undefined);
    this.save(now);
  }

  heirloom(kind: HeirloomKind): boolean {
    const ok = buyHeirloom(this.state, kind);
    if (ok) {
      track('heirloom_up', { kind, lv: this.state.heirlooms[kind] });
      this.sim.refreshStats();
      this.emit('change', undefined);
      this.save();
    }
    return ok;
  }

  /** 장비 뽑기 (free: 하루 한 번 광고 무료) */
  gacha(n: 1 | 10, free = false): DrawResult[] | null {
    const r = drawGacha(this.state, this.rng, n, free);
    if (r) {
      this.state.daily.gacha = (this.state.daily.gacha ?? 0) + n;
      const best = Math.max(...r.map((x) => parseKey(x.key).tier));
      track('gacha', { n, free, best: tierLabel(best), total: this.state.gear.draws });
      this.afterGear();
    }
    return r;
  }

  equip(key: ItemKey): boolean {
    const ok = equip(this.state, key);
    if (ok) this.afterGear();
    return ok;
  }

  autoEquip(): number {
    const n = autoEquip(this.state);
    this.afterGear();
    return n;
  }

  merge(key: ItemKey): number {
    const n = merge(this.state, key);
    if (n) this.afterGear();
    return n;
  }

  mergeAll(): number {
    const n = mergeAll(this.state);
    if (n) {
      track('merge_all', { made: n });
      this.afterGear();
    }
    return n;
  }

  private afterGear(): void {
    this.sim.refreshStats();
    this.emit('change', undefined);
    this.save();
  }

  /** 벽 앞에서 머물기/도전 */
  setStay(on: boolean): void {
    this.sim.setStay(on);
    track(on ? 'stay_on' : 'stay_off', { stage: this.state.stage });
    this.emit('change', undefined);
  }

  claimAttendance(now = clock.now()): Reward | null {
    const r = claimAttendance(this.state, now);
    if (r) this.afterReward('attendance', { day: this.state.attendance.count });
    return r;
  }

  claimMission(id: Mission['id'] | 'all', now = clock.now()): Reward | null {
    rolloverDaily(this.state, now);
    const r = claimMission(this.state, id, now);
    if (r) this.afterReward('mission', { id });
    return r;
  }

  claimMonthly(now = clock.now()): boolean {
    const ok = claimMonthly(this.state, now);
    if (ok) this.afterReward('monthly_daily');
    return ok;
  }

  claimAchievement(id: string, now = clock.now()): Reward | null {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a || this.state.achievements.includes(id) || !isDone(this.state, a)) return null;
    this.state.achievements.push(id);
    grantReward(this.state, a.reward, now);
    this.afterReward('achievement', { id });
    return a.reward;
  }

  /** 결제 완료 후 (스토어 검증을 통과한 뒤) 호출 */
  purchase(productId: string, now = clock.now()): boolean {
    const ok = grantProduct(this.state, productId, now);
    if (ok) this.afterReward('purchase', { id: productId });
    return ok;
  }

  private afterReward(kind: string, props?: Record<string, string | number>): void {
    track(`claim_${kind}`, props);
    this.sim.refreshStats();
    this.emit('change', undefined);
    this.save();
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
    track('reroll_spouse');
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
    track('reroll_child');
    if (this.state.pendingChildren) delete this.state.pendingChildren[spouse.id];
    return this.childCandidates(spouse);
  }

  completeRetirement(spouse: Candidate, child: Candidate): number {
    const old = this.state.hero;
    track('retire', { gen: old.generation, age: Math.floor(old.age), best: old.maxStage });
    const fameEarned = retire(this.state, spouse, child, this.rng);
    this.sim = new BattleSim(this.state, this.rng);
    this.retiring = false;
    this.save();
    this.emit('newGeneration', { fameEarned });
    this.emit('change', undefined);
    return fameEarned;
  }
}
