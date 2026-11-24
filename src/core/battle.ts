import { BALANCE } from '../config/balance';
import {
  bossRank,
  bossTimeLimit,
  houseBest,
  isBossStage,
  isMarchStage,
  monsterAtk,
  monsterGold,
  monsterHp,
  monstersInStage,
  type Rank,
} from './economy';
import { heroClass, SKILLS, type WeaponKind } from './gear';
import { legacyForBoss } from './heirloom';
import { canTrial, MAX_RANK, RANKS, trialFoe } from './rank';
import type { Rng } from './rng';
import type { GameState } from './state';
import { computeStats, type HeroStats } from './stats';

export type MonsterKind = 'slime' | 'mushroom' | 'bat' | 'beetle' | 'golem' | 'yeti' | 'dragon' | 'shadow';

export interface Monster {
  id: number;
  kind: MonsterKind;
  /** 스테이지 보스(정예) 또는 지역 보스 */
  boss: boolean;
  rank: Rank;
  hp: number;
  maxHp: number;
  atk: number;
  gold: number;
}

export type BattleEvent =
  | { type: 'spawn'; monster: Monster }
  | { type: 'heroAttack'; damage: number; crit: boolean; killed: boolean }
  | { type: 'monsterAttack'; damage: number }
  | { type: 'kill'; monster: Monster; gold: number; legacy: number }
  | { type: 'stageChange'; stage: number; boss: boolean; reason: 'clear' | 'death' | 'timeout' }
  | { type: 'heroDeath' }
  | { type: 'respawn' }
  /** 직업 스킬 */
  | { type: 'skill'; kind: WeaponKind; hits: { damage: number; crit: boolean }[]; killed: boolean }
  /** 보너스 게이지가 차서 상자를 열었다 */
  | { type: 'bonusChest'; gold: number }
  /** 보스 도전 시작 */
  | { type: 'bossStart'; stage: number; rank: Rank }
  /** 보스 도전 실패 → 같은 스테이지에서 계속 사냥 */
  | { type: 'bossFail'; stage: number; reason: 'death' | 'timeout' }
  /** 승급 시련 시작 (rank: 도전하는 칭호) */
  | { type: 'trialStart'; rank: number }
  /** 승급 시련 통과: 칭호 상승 (gems: 가문 첫 달성 보상) */
  | { type: 'trialWin'; rank: number; gems: number }
  | { type: 'trialFail'; rank: number; reason: 'death' | 'timeout' };

export const BIOME_COUNT = 5;
export const STAGES_PER_BIOME = 20;
export function biomeOf(stage: number): number {
  return Math.floor((stage - 1) / STAGES_PER_BIOME) % BIOME_COUNT;
}

const BIOME_MONSTERS: MonsterKind[][] = [
  ['slime', 'mushroom'],
  ['mushroom', 'bat', 'slime'],
  ['bat', 'beetle', 'slime'],
  ['slime', 'bat', 'beetle'],
  ['bat', 'beetle', 'mushroom', 'slime'],
];

/** 지역별 보스: 들판·숲·유적은 골렘(색만 다름), 설원은 설인, 화산은 화염 용 */
export const BIOME_BOSS: MonsterKind[] = ['golem', 'golem', 'golem', 'yeti', 'dragon'];

/**
 * 전투 시뮬레이션. 화면(Phaser)과 분리되어 있어서 테스트·오프라인 계산·서버 검증에 그대로 쓸 수 있다.
 * 화면은 tick()이 돌려주는 이벤트를 받아서 연출만 한다.
 *
 * 진행 방식 (방치형 표준: 잡몹은 끝없이 나오고, 보스는 버튼으로 부른다)
 * - '보스 도전'(challenge)은 언제든 누를 수 있다. 누르면 싸우던 잡몹 대신 바로 보스가 나온다.
 * - 자동 도전이 켜져 있으면 그 스테이지에서 잡몹을 5마리 잡은 뒤 스스로 보스를 부른다.
 * - 보스(매 스테이지 정예, 10스테이지마다 지역 보스)를 제한 시간 안에 잡으면 다음 스테이지.
 * - 지면 스테이지는 그대로 잡몹 사냥을 계속한다. 자동 도전은 전투력이 1.15배 오른 뒤 다시 시도.
 * - 이와 별개로 잡몹을 잡을 때마다 보너스 게이지가 차고, 가득 차면 골드 상자가 열린다.
 * - 잡몹에게 쓰러지면(너무 강한 곳) 한 스테이지 아래로.
 */
export class BattleSim {
  heroHp = 1;
  stats!: HeroStats;
  monster: Monster | null = null;
  killsInStage = 0;
  bossTimeLeft = 0;
  private heroCd = 0;
  private monsterCd = 0;
  private spawnTimer = 0.3;
  private respawnTimer = 0;
  private nextId = 1;
  private time = 0;
  private injuredUntil = 0;
  /** 다음에 나올 몬스터가 보스인지 (도전 버튼 또는 자동 도전) */
  private bossQueued = false;
  /** 보스에게 진 뒤, 자동 도전을 다시 시작할 전투력 */
  private retryPower = 0;
  /** 다음에 나올 상대가 승급 시련인지 */
  private trialQueued = false;
  /** 시련에서 진 뒤, 다시 도전을 권할 전투력 */
  trialRetryPower = 0;
  /** 스킬 대기 시간 (처음에는 3초 뒤 바로 보여 준다) */
  skillCd = 3;

  constructor(
    private state: GameState,
    private rng: Rng,
  ) {
    this.refreshStats();
    this.heroHp = this.stats.maxHp;
  }

  get dead(): boolean {
    return this.respawnTimer > 0;
  }

  /** 스킬 준비 정도 0~1 (화면 표시용) */
  get skillReady(): number {
    const cd = SKILLS[heroClass(this.state).kind].cooldown;
    return Math.max(0, Math.min(1, 1 - this.skillCd / cd));
  }

  get injured(): boolean {
    return this.time < this.injuredUntil && !this.dead;
  }

  /** 자동 도전 전에 이 스테이지에서 잡을 잡몹 수 */
  get autoAfter(): number {
    return monstersInStage(this.state.stage, houseBest(this.state));
  }

  /** 자동 도전 준비가 됐는지 (이 스테이지에서 잡몹을 충분히 잡았는지) */
  get autoReady(): boolean {
    return this.killsInStage >= this.autoAfter;
  }

  /** 보너스 상자 게이지 0~1 */
  get bonusProgress(): number {
    return Math.min(1, this.state.bonusKills / BALANCE.bonus.kills);
  }

  /** 보스 도전 버튼을 누를 수 있는지 */
  get canChallenge(): boolean {
    return !this.bossActive && !this.dead;
  }

  /** 지금 보스와 싸우는 중인지 (또는 곧 나오는지) */
  get bossActive(): boolean {
    return !!this.monster?.boss || this.bossQueued || this.trialQueued;
  }

  /** 지금 승급 시련 중인지 */
  get trialActive(): boolean {
    return this.monster?.rank === 'trial' || this.trialQueued;
  }

  /** 지금 싸우는 보스/시련의 제한 시간 */
  get bossTimeMax(): number {
    return this.monster?.rank === 'trial' ? BALANCE.rank.timeLimit : bossTimeLimit(this.state.stage);
  }

  /** 시련을 지금 바로 치를 수 있는지 */
  get trialReady(): boolean {
    return canTrial(this.state) && this.canChallenge;
  }

  /** 시련에서 졌고 아직 충분히 강해지지 않았는지 (안내용) */
  get trialWaiting(): boolean {
    return this.trialRetryPower > 0 && this.power() < this.trialRetryPower;
  }

  /** 승급 시련 시작: 싸우던 잡몹 대신 선조의 그림자가 나온다 */
  startTrial(): boolean {
    if (!this.trialReady) return false;
    this.trialQueued = true;
    if (this.monster && !this.monster.boss) {
      this.monster = null;
      this.spawnTimer = 0.35;
    }
    return true;
  }

  /** 보스에게 졌고, 자동 도전이 강해지기를 기다리는 중 */
  get waitingToRetry(): boolean {
    return this.retryPower > 0 && this.power() < this.retryPower;
  }

  /** 전투력 지표: 초당 피해 × 체력 */
  power(): number {
    return this.stats.atk * this.stats.atkPerSec * this.stats.maxHp;
  }

  /** '보스 도전' 버튼. 언제든 누를 수 있다. 싸우던 잡몹 대신 바로 보스가 나온다. */
  challenge(): boolean {
    if (!this.canChallenge) return false;
    this.retryPower = 0;
    this.bossQueued = true;
    if (this.monster && !this.monster.boss) {
      this.monster = null;
      this.spawnTimer = 0.35;
    }
    return true;
  }

  refreshStats(now = Date.now()): void {
    const prevMax = this.stats?.maxHp ?? 0;
    this.stats = computeStats(this.state, now);
    // 체력 업그레이드/나이 변화 시 비율 유지
    if (prevMax > 0) this.heroHp = Math.min(this.stats.maxHp, (this.heroHp / prevMax) * this.stats.maxHp);
  }

  /** 자동 도전 조건: 켜져 있고, 진 뒤라면 충분히 강해졌을 때. 선대가 정복한 땅의 지역 보스는 항상 자동 */
  private autoChallengeOk(): boolean {
    const march = this.state.stage < Math.floor(houseBest(this.state) * BALANCE.march.ratio);
    if (march) return true;
    return this.state.autoBoss && this.power() >= this.retryPower;
  }

  tick(dt: number, now = Date.now()): BattleEvent[] {
    const ev: BattleEvent[] = [];
    this.time += dt;
    this.refreshStats(now);

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.heroHp = this.stats.maxHp;
        ev.push({ type: 'respawn' });
      }
      return ev;
    }

    if (!this.monster) {
      // 이 스테이지에서 잡몹을 충분히 잡았으면 자동 도전 확인
      if (!this.bossQueued && this.autoReady && this.autoChallengeOk()) {
        this.bossQueued = true;
        this.retryPower = 0;
      }
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.trialQueued) {
        this.trialQueued = false;
        this.monster = this.makeTrial();
        this.heroHp = this.stats.maxHp;
        this.heroCd = 0.4;
        this.monsterCd = BALANCE.monster.attackInterval * 0.8;
        this.bossTimeLeft = BALANCE.rank.timeLimit;
        ev.push({ type: 'trialStart', rank: (this.state.hero.rank ?? 0) + 1 });
        ev.push({ type: 'spawn', monster: this.monster });
        return ev;
      }
      if (this.spawnTimer <= 0) {
        this.monster = this.makeMonster(this.bossQueued);
        this.bossQueued = false;
        this.heroCd = 0.25;
        this.monsterCd = BALANCE.monster.attackInterval * 0.6;
        if (this.monster.boss) {
          this.bossTimeLeft = bossTimeLimit(this.state.stage);
          ev.push({ type: 'bossStart', stage: this.state.stage, rank: this.monster.rank });
        }
        ev.push({ type: 'spawn', monster: this.monster });
      }
      return ev;
    }

    const m = this.monster;

    // 직업 스킬: 쿨타임이 차면 자동 사용
    this.skillCd -= dt;
    if (this.skillCd <= 0) {
      const kind = heroClass(this.state).kind;
      const sk = SKILLS[kind];
      this.skillCd = sk.cooldown;
      const injury = this.injured ? BALANCE.hero.injuryAtkMul : 1;
      const hits: { damage: number; crit: boolean }[] = [];
      for (let i = 0; i < sk.hits; i++) {
        const crit = this.rng.chance(this.stats.crit);
        const damage = this.stats.atk * sk.perHit * injury * (crit ? this.stats.critMul : 1);
        hits.push({ damage, crit });
        m.hp -= damage;
      }
      const killed = m.hp <= 0;
      ev.push({ type: 'skill', kind, hits, killed });
      if (killed) {
        this.onKill(ev, m);
        return ev;
      }
    }

    if (m.boss) {
      this.bossTimeLeft -= dt;
      if (this.bossTimeLeft <= 0) {
        this.bossFailed(ev, 'timeout');
        return ev;
      }
    }

    this.heroCd -= dt;
    while (this.heroCd <= 0 && this.monster) {
      this.heroCd += 1 / this.stats.atkPerSec;
      const crit = this.rng.chance(this.stats.crit);
      const injury = this.injured ? BALANCE.hero.injuryAtkMul : 1;
      const damage = this.stats.atk * injury * (crit ? this.stats.critMul : 1);
      m.hp -= damage;
      const killed = m.hp <= 0;
      ev.push({ type: 'heroAttack', damage, crit, killed });
      if (killed) this.onKill(ev, m);
    }
    if (!this.monster) return ev;

    this.monsterCd -= dt;
    if (this.monsterCd <= 0) {
      this.monsterCd += BALANCE.monster.attackInterval;
      this.heroHp -= m.atk;
      ev.push({ type: 'monsterAttack', damage: m.atk });
      if (this.heroHp <= 0) {
        this.heroHp = 0;
        ev.push({ type: 'heroDeath' });
        this.state.progress.deaths++;
        this.respawnTimer = BALANCE.hero.respawnSec;
        this.injuredUntil = this.time + BALANCE.hero.respawnSec + BALANCE.hero.injurySec;
        if (m.boss) this.bossFailed(ev, 'death');
        else this.fallBack(ev);
      }
    }
    return ev;
  }

  private onKill(ev: BattleEvent[], m: Monster): void {
    const gold = m.gold * this.stats.goldMul;
    this.state.gold += gold;
    this.monster = null;
    if (m.rank === 'trial') {
      // 시련 통과: 칭호 상승, 체력 회복, 가문 첫 달성이면 보석
      const rank = Math.min(MAX_RANK, (this.state.hero.rank ?? 0) + 1);
      this.state.hero.rank = rank;
      let gems = 0;
      if (rank > this.state.bestRank) {
        this.state.bestRank = rank;
        gems = RANKS[rank].gems;
        this.state.gems += gems;
      }
      this.trialRetryPower = 0;
      this.refreshStats();
      this.heroHp = this.stats.maxHp;
      this.spawnTimer = BALANCE.monster.spawnGap;
      ev.push({ type: 'kill', monster: m, gold: 0, legacy: 0 });
      ev.push({ type: 'trialWin', rank, gems });
      return;
    }
    this.state.totalKills++;
    this.state.daily.kills++;
    let legacy = 0;
    const best = houseBest(this.state);
    if (m.boss) {
      this.state.daily.bosses++;
      this.state.progress.bossKills++;
      if (m.rank === 'region') {
        legacy = legacyForBoss(this.state.stage);
        this.state.legacy += legacy;
      }
    }
    this.spawnTimer = isMarchStage(this.state.stage, best) ? BALANCE.march.spawnGap : BALANCE.monster.spawnGap;
    ev.push({ type: 'kill', monster: m, gold, legacy });

    if (m.boss) {
      // 보스 처치 → 다음 스테이지, 체력 회복
      this.heroHp = this.stats.maxHp;
      this.retryPower = 0;
      this.setStage(this.state.stage + 1, ev, 'clear');
      return;
    }
    // 보너스 상자 게이지
    this.state.bonusKills++;
    if (this.state.bonusKills >= BALANCE.bonus.kills) {
      this.state.bonusKills = 0;
      const chest = monsterGold(this.state.stage) * BALANCE.bonus.goldKills * this.stats.goldMul;
      this.state.gold += chest;
      ev.push({ type: 'bonusChest', gold: chest });
    }
    this.killsInStage = Math.min(this.autoAfter, this.killsInStage + 1);
    if (this.autoReady && isMarchStage(this.state.stage, best)) {
      // 정복한 땅: 스테이지 보스 없이 바로 다음으로
      this.heroHp = this.stats.maxHp;
      this.setStage(this.state.stage + 1, ev, 'clear');
    }
  }

  /** 보스에게 짐: 스테이지는 그대로 사냥을 계속한다 */
  private bossFailed(ev: BattleEvent[], reason: 'death' | 'timeout'): void {
    const trial = this.monster?.rank === 'trial';
    this.monster = null;
    this.bossQueued = false;
    if (trial) {
      this.trialRetryPower = this.power() * BALANCE.rank.retryPowerGain;
      this.heroHp = Math.max(this.heroHp, this.stats.maxHp * 0.5);
      this.spawnTimer = BALANCE.monster.spawnGap + (reason === 'death' ? BALANCE.hero.respawnSec : 0);
      ev.push({ type: 'trialFail', rank: (this.state.hero.rank ?? 0) + 1, reason });
      return;
    }
    this.retryPower = this.power() * BALANCE.monster.retryPowerGain;
    this.spawnTimer = BALANCE.monster.spawnGap + (reason === 'death' ? BALANCE.hero.respawnSec : 0);
    ev.push({ type: 'bossFail', stage: this.state.stage, reason });
  }

  /** 잡몹에게 쓰러짐: 너무 강한 곳이라 한 스테이지 아래로 */
  private fallBack(ev: BattleEvent[]): void {
    this.monster = null;
    this.bossQueued = false;
    this.spawnTimer = BALANCE.monster.spawnGap + BALANCE.hero.respawnSec;
    if (this.state.stage > 1) this.setStage(this.state.stage - 1, ev, 'death');
    else this.killsInStage = 0;
  }

  private setStage(stage: number, ev: BattleEvent[], reason: 'clear' | 'death' | 'timeout'): void {
    this.state.stage = stage;
    this.killsInStage = 0;
    if (stage > this.state.hero.maxStage) this.state.hero.maxStage = stage;
    ev.push({ type: 'stageChange', stage, boss: isBossStage(stage), reason });
  }

  private makeTrial(): Monster {
    const rank = Math.min(MAX_RANK, (this.state.hero.rank ?? 0) + 1);
    const f = trialFoe(rank);
    return { id: this.nextId++, kind: 'shadow', boss: true, rank: 'trial', hp: f.hp, maxHp: f.hp, atk: f.atk, gold: 0 };
  }

  private makeMonster(boss: boolean): Monster {
    const stage = this.state.stage;
    const rank: Rank = boss ? bossRank(stage) : 'mob';
    const kind: MonsterKind = rank === 'region' ? BIOME_BOSS[biomeOf(stage)] : this.rng.pick(BIOME_MONSTERS[biomeOf(stage)]);
    const hp = monsterHp(stage, rank);
    return {
      id: this.nextId++,
      kind,
      boss,
      rank,
      hp,
      maxHp: hp,
      atk: monsterAtk(stage, rank),
      gold: monsterGold(stage, rank),
    };
  }
}
