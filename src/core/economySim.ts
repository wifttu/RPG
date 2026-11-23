import { BALANCE } from '../config/balance';
import { ACHIEVEMENTS, isDone } from './achievements';
import { ALL_CLEAR, ATTENDANCE, MISSIONS, grantReward } from './daily';
import { autoEquip } from './equip';
import { GACHA_COST, RARITIES, drawGacha, gearEffects, mergeAll, parseKey, rarityOf, tierLabel } from './gear';
import { Rng } from './rng';
import { createNewGame } from './state';

/**
 * 무과금 유저의 보석 수급 시뮬레이션 (밸런스 확인용).
 * 가정: 매일 출석·일일 임무 3개·모두 완료, 보석 광고 한도까지, 무료 뽑기 1회, 이야기 사건 하루 2번(평균 보석 8),
 * 업적은 진행에 맞춰 날짜별로 조금씩 달성. 보석은 모두 장비 뽑기에 쓰고(10회 우선), 하루 끝에 일괄 합성·추천 장착.
 */
export interface EconDay {
  day: number;
  gemsEarned: number;
  draws: number;
  totalDraws: number;
  bestTier: string;
  weaponAtk: number;
  epicCount: number;
}

export function simulateFreeEconomy(days = 30, seed = 1, extraGemsPerDay = 0): EconDay[] {
  const s = createNewGame(seed, 0);
  const rng = new Rng(seed);
  const out: EconDay[] = [];
  // 업적이 언제쯤 달성되는지 대략 (세대·스테이지는 밸런스 시뮬 기준 하루 1.5세대)
  const progressAt = (d: number) => {
    s.hero.generation = Math.min(12, 1 + Math.floor(d * 1.5));
    s.hero.maxStage = Math.min(260, 35 + d * 18);
    s.totalKills = d * 2500;
    s.progress.bossKills = d * 25;
  };
  for (let d = 1; d <= days; d++) {
    const before = s.gems;
    progressAt(d);
    grantReward(s, ATTENDANCE[s.attendance.count % ATTENDANCE.length], 0);
    s.attendance.count++;
    for (const m of MISSIONS) grantReward(s, m.reward, 0);
    grantReward(s, ALL_CLEAR, 0);
    s.gems += BALANCE.gems.adReward * BALANCE.ads.dailyCap.gems;
    s.gems += 16 + extraGemsPerDay; // 이야기 사건
    for (const a of ACHIEVEMENTS)
      if (!s.achievements.includes(a.id) && isDone(s, a)) {
        s.achievements.push(a.id);
        grantReward(s, a.reward, 0);
      }
    const earned = s.gems - before;
    const drawsBefore = s.gear.draws;
    drawGacha(s, rng, 1, true); // 무료 뽑기
    while (s.gems >= GACHA_COST.ten) drawGacha(s, rng, 10);
    while (s.gems >= GACHA_COST.one) drawGacha(s, rng, 1);
    mergeAll(s);
    autoEquip(s);
    const best = Math.max(...Object.keys(s.gear.inv).map((k) => parseKey(k).tier));
    out.push({
      day: d,
      gemsEarned: earned,
      draws: s.gear.draws - drawsBefore,
      totalDraws: s.gear.draws,
      bestTier: best >= 0 ? tierLabel(best) : '-',
      weaponAtk: gearEffects(s).atkMul,
      epicCount: Object.entries(s.gear.inv)
        .filter(([k]) => rarityOf(parseKey(k).tier) >= 3)
        .reduce((a, [, n]) => a + n, 0),
    });
  }
  return out;
}

export const RARITY_NAMES = RARITIES.map((r) => r.name);
