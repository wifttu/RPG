import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, claimable } from '../src/core/achievements';
import { BattleSim, type BattleEvent } from '../src/core/battle';
import { dayKey, effectiveNow, isRollback, markSeen } from '../src/core/clock';
import {
  ATTENDANCE,
  MISSIONS,
  adFree,
  canClaimAttendance,
  claimAttendance,
  claimMission,
  rolloverDaily,
} from '../src/core/daily';
import { buyUpgrade, upgradeCost } from '../src/core/economy';
import { buyHeirloom, heirloomCost, heirloomMultiplier, heirloomTitle } from '../src/core/heirloom';
import { canBuy, grantProduct } from '../src/core/products';
import { Rng } from '../src/core/rng';
import { exportSaveCode, importSaveCode } from '../src/core/save';
import { createNewGame, normalizeState, type GameState } from '../src/core/state';
import { computeStats } from '../src/core/stats';

const DAY = 86_400_000;
const T0 = new Date(2026, 10, 23, 12).getTime();

describe('벽과 머물기', () => {
  it('같은 스테이지에서 3번 실패하면 머물기, 강해지면 자동으로 다시 도전', () => {
    const s = createNewGame(7, 0);
    s.stage = 10; // 1대 맨손으로는 못 넘는 보스
    s.hero.maxStage = 10;
    const sim = new BattleSim(s, new Rng(7));
    const ev: BattleEvent[] = [];
    for (let t = 0; t < 600 && !s.stayMode; t += 0.05) ev.push(...sim.tick(0.05, 0));
    expect(s.stayMode).toBe(true);
    expect(ev.some((e) => e.type === 'wall')).toBe(true);
    const stayStage = s.stage;
    // 머무는 동안은 앞으로 가지 않는다
    for (let t = 0; t < 30; t += 0.05) sim.tick(0.05, 0);
    expect(s.stage).toBeLessThanOrEqual(stayStage);
    // 크게 강해지면 다시 도전
    s.gold = 1e9;
    for (let i = 0; i < 60; i++) buyUpgrade(s, 'atk'), buyUpgrade(s, 'hp');
    const ev2: BattleEvent[] = [];
    for (let t = 0; t < 120; t += 0.05) ev2.push(...sim.tick(0.05, 0));
    expect(ev2.some((e) => e.type === 'retry')).toBe(true);
    expect(s.hero.maxStage).toBeGreaterThan(10);
  });

  it('쓰러지면 잠시 부상 (공격력 감소)', () => {
    const s = createNewGame(8, 0);
    s.stage = 30;
    const sim = new BattleSim(s, new Rng(8));
    let died = false;
    for (let t = 0; t < 120 && !died; t += 0.05) died = sim.tick(0.05, 0).some((e) => e.type === 'heroDeath');
    expect(died).toBe(true);
    for (let t = 0; t < 2.2; t += 0.05) sim.tick(0.05, 0); // 부활
    expect(sim.injured).toBe(true);
  });
});

describe('가보', () => {
  it('유산석으로 강화하고 은퇴해도 남는다', () => {
    const s = createNewGame(1, 0);
    const base = computeStats(s, 0).atk;
    s.legacy = 100;
    expect(buyHeirloom(s, 'sword')).toBe(true);
    expect(s.legacy).toBe(100 - heirloomCost(0));
    expect(computeStats(s, 0).atk).toBeGreaterThan(base);
    expect(heirloomMultiplier('sword', 10)).toBeGreaterThan(heirloomMultiplier('sword', 9) * 1.2);
    expect(heirloomTitle('sword', 0)).toBe('낡은 가문의 검');
    expect(heirloomTitle('sword', 20)).toBe('전설의 가문의 검');
    s.legacy = 0;
    expect(buyHeirloom(s, 'ring')).toBe(false);
  });

  it('보스를 잡으면 유산석이 나온다', () => {
    const s = createNewGame(2, 0);
    s.stage = 10;
    s.gold = 1e9;
    for (let i = 0; i < 40; i++) buyUpgrade(s, 'atk'), buyUpgrade(s, 'hp');
    const sim = new BattleSim(s, new Rng(2));
    for (let t = 0; t < 60 && s.legacy === 0; t += 0.05) sim.tick(0.05, 0);
    expect(s.legacy).toBeGreaterThan(0);
    expect(s.progress.bossKills).toBe(1);
    expect(s.daily.bosses).toBe(1);
  });
});

describe('출석·일일 임무·업적', () => {
  it('출석은 하루 한 번, 7일 주기', () => {
    const s = createNewGame(3, T0);
    expect(canClaimAttendance(s, T0)).toBe(true);
    expect(claimAttendance(s, T0)).toEqual(ATTENDANCE[0]);
    expect(claimAttendance(s, T0 + 1000)).toBeNull();
    for (let d = 1; d < 8; d++) claimAttendance(s, T0 + d * DAY);
    expect(s.attendance.count).toBe(8);
  });

  it('일일 임무는 목표를 채워야 받고, 날짜가 바뀌면 초기화', () => {
    const s = createNewGame(4, T0);
    rolloverDaily(s, T0);
    expect(claimMission(s, 'kills', T0)).toBeNull();
    s.daily.kills = MISSIONS[0].target;
    const gems = s.gems;
    expect(claimMission(s, 'kills', T0)).not.toBeNull();
    expect(s.gems).toBe(gems + 20);
    expect(claimMission(s, 'kills', T0)).toBeNull();
    expect(rolloverDaily(s, T0 + DAY)).toBe(true);
    expect(s.daily.kills).toBe(0);
  });

  it('업적은 조건을 채우면 받을 수 있다', () => {
    const s = createNewGame(5, 0);
    expect(claimable(s)).toHaveLength(0);
    s.totalKills = 1000;
    expect(claimable(s).map((a) => a.id)).toContain('kill1000');
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(15);
  });
});

describe('시간 조작 방지', () => {
  it('시계를 뒤로 돌리면 감지', () => {
    const s = createNewGame(6, T0);
    markSeen(s, T0 + 10 * DAY);
    expect(isRollback(s, T0)).toBe(true);
    expect(isRollback(s, T0 + 10 * DAY)).toBe(false);
  });

  it('미래 날짜로 출석을 받으면 실제 날짜가 따라잡을 때까지 다음 출석이 막힌다', () => {
    const s = createNewGame(9, T0);
    // 시계를 3일 뒤로 돌려 출석
    markSeen(s, T0 + 3 * DAY);
    claimAttendance(s, T0 + 3 * DAY);
    // 실제 날짜로 돌아오면 날짜 계산은 본 적 있는 가장 늦은 시각 기준
    expect(dayKey(effectiveNow(s, T0))).toBe(dayKey(T0 + 3 * DAY));
    expect(canClaimAttendance(s, T0 + DAY)).toBe(false);
  });
});

describe('상품 (결제 후 지급)', () => {
  it('스타터 팩은 한 번만, 광고 제거·월정액은 광고 없이 보상', () => {
    const s = createNewGame(10, T0);
    expect(grantProduct(s, 'starter', T0)).toBe(true);
    expect(canBuy(s, 'starter')).toBe(false);
    expect(grantProduct(s, 'starter', T0)).toBe(false);
    expect(adFree(s, T0)).toBe(false);
    const before = s.gems;
    grantProduct(s, 'monthly', T0);
    expect(s.gems).toBe(before + 300); // 월정액은 즉시 보석 300
    const g2 = s.gems;
    grantProduct(s, 'gems550', T0);
    expect(s.gems).toBe(g2 + 550);
    expect(adFree(s, T0 + 29 * DAY)).toBe(true);
    expect(adFree(s, T0 + 31 * DAY)).toBe(false);
    grantProduct(s, 'noads', T0);
    expect(adFree(s, T0 + 400 * DAY)).toBe(true);
  });
});

describe('기기 이전 코드', () => {
  it('내보낸 코드를 그대로 불러오고, 바뀐 코드는 거부', () => {
    const s = createNewGame(11, T0);
    s.gold = 12345;
    s.hero.name = '레온';
    const code = exportSaveCode(s);
    const r = importSaveCode(code);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.gold).toBe(12345);
      expect(r.state.hero.name).toBe('레온');
    }
    const broken = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
    expect(importSaveCode(broken).ok).toBe(false);
    expect(importSaveCode('hello').ok).toBe(false);
  });

  it('예전 저장 데이터도 빈 항목을 채워서 읽는다', () => {
    const old = createNewGame(12, 0) as Partial<GameState>;
    delete old.heirlooms;
    delete old.daily;
    delete old.progress;
    const s = normalizeState(old as GameState);
    expect(s.heirlooms.sword).toBe(0);
    expect(s.daily.claimed).toEqual([]);
    expect(s.progress.bossKills).toBe(0);
  });
});

describe('경제 기본', () => {
  it('수련 비용은 계속 오른다', () => {
    expect(upgradeCost('hp', 30)).toBeGreaterThan(upgradeCost('hp', 29));
  });
});

describe('이름', () => {
  it('후보끼리, 그리고 가문 사람과 이름이 겹치지 않는다', async () => {
    const { makeChildCandidates, makeSpouseCandidates, takenNames } = await import('../src/core/lineage');
    const s = createNewGame(21, 0);
    const rng = new Rng(21);
    for (let i = 0; i < 300; i++) {
      const sp = makeSpouseCandidates(s, rng);
      const ch = makeChildCandidates(s, sp[0], rng);
      const names = [...sp, ...ch].map((c) => c.name);
      const kids = ch.map((c) => c.name);
      expect(new Set(sp.map((c) => c.name)).size).toBe(sp.length);
      expect(new Set(kids).size).toBe(kids.length);
      const taken = takenNames(s);
      for (const n of names) expect(taken.has(n)).toBe(false);
      expect(kids).not.toContain(sp[0].name);
    }
  });
});
