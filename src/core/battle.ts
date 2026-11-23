import { BALANCE } from '../config/balance';
import { isBossStage, monsterAtk, monsterGold, monsterHp, monstersInStage } from './economy';
import type { Rng } from './rng';
import type { GameState } from './state';
import { computeStats, type HeroStats } from './stats';

export type MonsterKind = 'slime' | 'mushroom' | 'bat' | 'beetle' | 'golem';

export interface Monster {
  id: number;
  kind: MonsterKind;
  boss: boolean;
  hp: number;
  maxHp: number;
  atk: number;
  gold: number;
}

export type BattleEvent =
  | { type: 'spawn'; monster: Monster }
  | { type: 'heroAttack'; damage: number; crit: boolean; killed: boolean }
  | { type: 'monsterAttack'; damage: number }
  | { type: 'kill'; monster: Monster; gold: number }
  | { type: 'stageChange'; stage: number; boss: boolean; reason: 'clear' | 'death' | 'timeout' }
  | { type: 'heroDeath' }
  | { type: 'respawn' };

export const BIOME_COUNT = 3;
export const STAGES_PER_BIOME = 20;
export function biomeOf(stage: number): number {
  return Math.floor((stage - 1) / STAGES_PER_BIOME) % BIOME_COUNT;
}

const BIOME_MONSTERS: MonsterKind[][] = [
  ['slime', 'mushroom'],
  ['mushroom', 'bat', 'slime'],
  ['bat', 'beetle', 'slime'],
];

/**
 * 전투 시뮬레이션. 화면(Phaser)과 분리되어 있어서 테스트·오프라인 계산·서버 검증에 그대로 쓸 수 있다.
 * 화면은 tick()이 돌려주는 이벤트를 받아서 연출만 한다.
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

  refreshStats(now = Date.now()): void {
    const prevMax = this.stats?.maxHp ?? 0;
    this.stats = computeStats(this.state, now);
    // 체력 업그레이드/나이 변화 시 비율 유지
    if (prevMax > 0) this.heroHp = Math.min(this.stats.maxHp, (this.heroHp / prevMax) * this.stats.maxHp);
  }

  tick(dt: number, now = Date.now()): BattleEvent[] {
    const ev: BattleEvent[] = [];
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
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.monster = this.makeMonster();
        this.heroCd = 0.25;
        this.monsterCd = BALANCE.monster.attackInterval * 0.6;
        if (this.monster.boss) this.bossTimeLeft = BALANCE.monster.bossTimeLimit;
        ev.push({ type: 'spawn', monster: this.monster });
      }
      return ev;
    }

    const m = this.monster;

    if (m.boss) {
      this.bossTimeLeft -= dt;
      if (this.bossTimeLeft <= 0) {
        this.fallBack(ev, 'timeout');
        return ev;
      }
    }

    this.heroCd -= dt;
    while (this.heroCd <= 0 && this.monster) {
      this.heroCd += 1 / this.stats.atkPerSec;
      const crit = this.rng.chance(this.stats.crit);
      const damage = this.stats.atk * (crit ? BALANCE.hero.critMultiplier : 1);
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
        this.respawnTimer = BALANCE.hero.respawnSec;
        this.fallBack(ev, 'death');
      }
    }
    return ev;
  }

  private onKill(ev: BattleEvent[], m: Monster): void {
    const gold = m.gold * this.stats.goldMul;
    this.state.gold += gold;
    this.state.totalKills++;
    this.monster = null;
    this.spawnTimer = BALANCE.monster.spawnGap;
    this.killsInStage++;
    ev.push({ type: 'kill', monster: m, gold });
    if (this.killsInStage >= monstersInStage(this.state.stage)) {
      this.setStage(this.state.stage + 1, ev, 'clear');
      // 스테이지 클리어 보상: 체력 회복
      this.heroHp = this.stats.maxHp;
    }
  }

  private fallBack(ev: BattleEvent[], reason: 'death' | 'timeout'): void {
    this.monster = null;
    this.spawnTimer = BALANCE.monster.spawnGap + (reason === 'death' ? BALANCE.hero.respawnSec : 0);
    this.setStage(Math.max(1, this.state.stage - 1), ev, reason);
  }

  private setStage(stage: number, ev: BattleEvent[], reason: 'clear' | 'death' | 'timeout'): void {
    this.state.stage = stage;
    this.killsInStage = 0;
    if (stage > this.state.hero.maxStage) this.state.hero.maxStage = stage;
    ev.push({ type: 'stageChange', stage, boss: isBossStage(stage), reason });
  }

  private makeMonster(): Monster {
    const stage = this.state.stage;
    const boss = isBossStage(stage);
    const kind: MonsterKind = boss ? 'golem' : this.rng.pick(BIOME_MONSTERS[biomeOf(stage)]);
    const hp = monsterHp(stage);
    return { id: this.nextId++, kind, boss, hp, maxHp: hp, atk: monsterAtk(stage), gold: monsterGold(stage) };
  }
}
