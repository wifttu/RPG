import { describe, expect, it } from 'vitest';
import { autoplay } from '../src/core/autoplay';
import { fameForRetirement } from '../src/core/economy';
import { secondsPerYear } from '../src/core/stats';
import { fmtMul } from '../src/ui/format';

/**
 * 밸런스 목표 (docs/GDD.md 6장). 수치를 바꿨을 때 이 테스트가 깨지면 목표에서 벗어난 것.
 * 자세한 표: BALANCE_REPORT=1 npx vitest run tests/balance.report.test.ts --silent=false
 */
describe('balance targets (autoplay, 6 generations)', () => {
  for (const seed of [1, 2, 3]) {
    const rows = autoplay({ generations: 6, seed });

    it(`seed ${seed}: 1대는 첫 세션 안에 30~45스테이지`, () => {
      expect(rows[0].maxStage).toBeGreaterThanOrEqual(30);
      expect(rows[0].maxStage).toBeLessThanOrEqual(45);
      expect(rows[0].minutes).toBeLessThan(20);
    });

    it(`seed ${seed}: 세대마다 확실히 더 멀리 간다 (2대 +6 이상, 3대부터 +10 이상)`, () => {
      expect(rows[1].maxStage - rows[0].maxStage).toBeGreaterThanOrEqual(6);
      for (let i = 2; i < rows.length; i++) expect(rows[i].maxStage - rows[i - 1].maxStage).toBeGreaterThanOrEqual(10);
    });

    it(`seed ${seed}: 선대 기록을 빠르게 따라잡는다 (세대 시간의 40% 이내)`, () => {
      for (const r of rows.slice(1)) {
        expect(r.catchUpMinutes).not.toBeNull();
        expect(r.catchUpMinutes!).toBeLessThan(r.minutes * 0.4);
      }
    });
  }

  it('세대가 거듭될수록 1년이 길어지고 상한이 있다', () => {
    expect(secondsPerYear(2)).toBeGreaterThan(secondsPerYear(1));
    expect(secondsPerYear(50)).toBe(240);
  });

  it('명성은 스테이지에 따라 기하급수로 늘어난다', () => {
    expect(fameForRetirement(10)).toBe(0);
    expect(fameForRetirement(60) / fameForRetirement(50)).toBeGreaterThan(2);
  });

  it('배율 표기', () => {
    expect(fmtMul(1.5)).toBe('x1.5');
    expect(fmtMul(87527)).toBe('x8.75만');
  });
});
