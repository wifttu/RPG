import { BALANCE, type UpgradeKind } from '../config/balance';
import type { GameState, Hero } from './state';
import { gearEffects } from './gear';
import { heirloomMultiplier } from './heirloom';
import { sumEffects } from './traits';

export interface HeroStats {
  atk: number;
  maxHp: number;
  atkPerSec: number;
  crit: number;
  /** 치명타 피해 배율 (마법사는 2.5) */
  critMul: number;
  goldMul: number;
  fameMul: number;
  lifespan: number;
  ageMul: number;
}

/** generation 대 가주에게 게임 속 1년이 실제 몇 초인지 */
export function secondsPerYear(generation: number): number {
  const t = BALANCE.time;
  return Math.min(t.yearSecondsMax, t.yearSecondsBase * t.yearSecondsGrowth ** (generation - 1));
}

export function lifespanOf(hero: Hero): number {
  const e = sumEffects(hero.genes.traits);
  return BALANCE.time.baseLifespan + e.lifespanAdd + Math.floor(hero.genes.vit / 20);
}

/**
 * 나이에 따른 전투력 곡선. 청년기에 성장 → 전성기 → 노년기 하락.
 * '언제 은퇴시킬지'가 이 게임의 핵심 판단이 되도록 만든 곡선.
 */
export function ageMultiplier(age: number, lifespan: number): number {
  const start = BALANCE.time.startAge;
  const t = Math.max(0, Math.min(1, (age - start) / (lifespan - start)));
  const pts: [number, number][] = [
    [0, 0.8],
    [0.15, 1.0],
    [0.35, 1.12],
    [0.6, 1.0],
    [0.85, 0.82],
    [1, 0.65],
  ];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (t <= x1) return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

export type LifeStage = '청년기' | '전성기' | '장년기' | '노년기';
export function lifeStage(age: number, lifespan: number): LifeStage {
  const t = (age - BALANCE.time.startAge) / (lifespan - BALANCE.time.startAge);
  if (t < 0.15) return '청년기';
  if (t < 0.5) return '전성기';
  if (t < 0.75) return '장년기';
  return '노년기';
}

export function upgradeMultiplier(kind: UpgradeKind, level: number): number {
  const u = BALANCE.upgrades[kind];
  const milestones = kind === 'spd' ? 0 : Math.floor(level / BALANCE.upgrades.milestoneEvery);
  return (1 + u.perLevel * level) * 2 ** milestones;
}

export function fameMultiplier(fame: number): number {
  return 1 + fame * BALANCE.fame.bonusPerPoint;
}

export function computeStats(state: GameState, now = Date.now()): HeroStats {
  const h = BALANCE.hero;
  const { genes } = state.hero;
  const e = sumEffects(genes.traits);
  const lifespan = lifespanOf(state.hero);
  const ageMul = ageMultiplier(state.hero.age, lifespan);
  const fameMul = fameMultiplier(state.fame);
  const boost = now < state.boostUntil ? BALANCE.ads.goldBoostMul : 1;
  const hl = state.heirlooms ?? { sword: 0, shield: 0, ring: 0 };
  const gear = gearEffects(state);

  return {
    atk: (h.baseAtk + genes.str * h.atkPerStr) * upgradeMultiplier('atk', state.upgrades.atk) * (1 + e.atkMul) * fameMul * ageMul * heirloomMultiplier('sword', hl.sword) * gear.atkMul,
    maxHp: (h.baseHp + genes.vit * h.hpPerVit) * upgradeMultiplier('hp', state.upgrades.hp) * (1 + e.hpMul) * fameMul * ageMul * heirloomMultiplier('shield', hl.shield) * gear.hpMul,
    atkPerSec: (h.baseAtkSpeed + genes.agi * h.atkSpeedPerAgi) * upgradeMultiplier('spd', state.upgrades.spd) * (1 + e.spdMul) * gear.spdMul,
    crit: Math.min(0.75, h.baseCrit + genes.agi * h.critPerAgi + e.critAdd + gear.critAdd),
    critMul: gear.critMul,
    goldMul: (1 + e.goldMul) * fameMul * boost * heirloomMultiplier('ring', hl.ring) * gear.goldMul,
    fameMul: 1 + e.fameMul,
    lifespan,
    ageMul,
  };
}

/** 기대 DPS (치명타 포함) */
export function expectedDps(s: HeroStats): number {
  return s.atk * s.atkPerSec * (1 + s.crit * (s.critMul - 1));
}
