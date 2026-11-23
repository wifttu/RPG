declare const process: { env: Record<string, string | undefined> };
import { describe, it } from 'vitest';
import { autoplay, formatReport } from '../src/core/autoplay';

/** BALANCE_REPORT=1 npx vitest run tests/balance.report.test.ts 로 세대별 표를 본다 */
describe.runIf(process.env.BALANCE_REPORT)('balance report', () => {
  it('prints generations', () => {
    const gens = Number(process.env.GENS ?? 10);
    for (const seed of (process.env.SEEDS ?? '1,2').split(',').map(Number)) {
      const t0 = Date.now();
      const rows = autoplay({ generations: gens, seed });
      console.log(`\n[seed ${seed}] (${Date.now() - t0}ms)\n${formatReport(rows)}`);
    }
  }, 600_000);
});
