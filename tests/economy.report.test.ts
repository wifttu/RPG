declare const process: { env: Record<string, string | undefined> };
import { describe, expect, it } from 'vitest';
import { simulateFreeEconomy } from '../src/core/economySim';

describe('보석 수급 (무과금 30일)', () => {
  const days = simulateFreeEconomy(30, 1);

  it('하루 보석과 뽑기 횟수가 목표 범위 (하루 150~260 보석, 5~10회)', () => {
    const steady = days.slice(7); // 첫 주 업적 몰림 제외
    const avgGems = steady.reduce((a, d) => a + d.gemsEarned, 0) / steady.length;
    const avgDraws = steady.reduce((a, d) => a + d.draws, 0) / steady.length;
    expect(avgGems).toBeGreaterThan(150);
    expect(avgGems).toBeLessThan(260);
    expect(avgDraws).toBeGreaterThan(5);
    expect(avgDraws).toBeLessThan(10);
  });

  it('무과금도 한 달이면 영웅 장비를 몇 개 모은다 (천장 덕분)', () => {
    expect(days[29].epicCount).toBeGreaterThanOrEqual(3);
  });

  it.runIf(process.env.ECON_REPORT)('표 출력', () => {
    console.log('일 | 얻은 보석 | 뽑기 | 누적 | 최고 등급 | 무기 공격 배율 | 영웅+ 보유');
    for (const d of days)
      console.log([d.day, d.gemsEarned, d.draws, d.totalDraws, d.bestTier, `x${d.weaponAtk.toFixed(2)}`, d.epicCount].join(' | '));
  });
});
