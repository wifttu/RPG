import { describe, expect, it } from 'vitest';
import { BattleSim, type BattleEvent } from '../src/core/battle';
import { adsLeft, countAd } from '../src/core/daily';
import { FIELD_EVENTS, LIFE_EVENT_ODDS, pickFieldEvent, resolveEvent } from '../src/core/events';
import { SKILLS, itemKey } from '../src/core/gear';
import { makeChildCandidates, makeSpouseCandidates } from '../src/core/lineage';
import { Rng } from '../src/core/rng';
import { createNewGame } from '../src/core/state';
import { BALANCE } from '../src/config/balance';
import { plannedNotifications } from '../src/platform/notify';

describe('직업 스킬', () => {
  for (const kind of ['sword', 'bow', 'staff'] as const) {
    it(`${SKILLS[kind].name}: 쿨타임마다 자동 사용`, () => {
      const s = createNewGame(3, 0);
      s.stage = 40; // 오래 버티는 몬스터
      s.upgrades = { atk: 0, hp: 150, spd: 0 }; // 쓰러지지 않게 체력만 높게
      s.gear.inv[itemKey(kind, 0)] = 1;
      s.gear.equipped.weapon = itemKey(kind, 0);
      const sim = new BattleSim(s, new Rng(3));
      const ev: BattleEvent[] = [];
      for (let t = 0; t < 3 + SKILLS[kind].cooldown + 0.5; t += 0.05) ev.push(...sim.tick(0.05, 0));
      const skills = ev.filter((e) => e.type === 'skill');
      expect(skills.length).toBeGreaterThanOrEqual(1);
      const first = skills[0];
      if (first.type === 'skill') {
        expect(first.kind).toBe(kind);
        expect(first.hits).toHaveLength(SKILLS[kind].hits);
      }
    });
  }
});

describe('이야기 사건', () => {
  it('선택하면 결과가 반영되고, 조건이 안 되면 고를 수 없다', () => {
    const s = createNewGame(4, 0);
    const rng = new Rng(4);
    const merchant = FIELD_EVENTS.find((e) => e.id === 'merchant')!;
    s.gold = 0;
    expect(merchant.choices[0].disabled?.(s)).toBeTruthy();
    s.gold = 1000;
    const gems = s.gems;
    resolveEvent(s, merchant, 0, rng, 0);
    expect(s.gold).toBeCloseTo(700);
    expect(s.gems).toBe(gems + 20);
    expect(s.events.seen.merchant).toBe(1);
    const oldman = FIELD_EVENTS.find((e) => e.id === 'oldman')!;
    s.hero.age = 40;
    resolveEvent(s, oldman, 0, rng, 0);
    expect(s.hero.age).toBe(38);
  });

  it('대장장이 선물은 뽑기 횟수·천장에 세지 않는다', () => {
    const s = createNewGame(5, 0);
    const smith = FIELD_EVENTS.find((e) => e.id === 'smith')!;
    resolveEvent(s, smith, 0, new Rng(5), 0);
    expect(Object.values(s.gear.inv).reduce((a, b) => a + b, 0)).toBe(1);
    expect(s.gear.draws).toBe(0);
  });

  it('여러 사건이 골고루 나온다', () => {
    const s = createNewGame(6, 0);
    const rng = new Rng(6);
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const e = pickFieldEvent(s, rng);
      ids.add(e.id);
      s.events.seen[e.id] = (s.events.seen[e.id] ?? 0) + 1;
    }
    expect(ids.size).toBe(FIELD_EVENTS.length);
  });

  it('쌍둥이·용의 혼약 확률이 공개한 값과 비슷하다', () => {
    const s = createNewGame(7, 0);
    const rng = new Rng(7);
    let twins = 0;
    let dragons = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const sp = makeSpouseCandidates(s, rng);
      if (sp.some((c) => c.special)) dragons++;
      const ch = makeChildCandidates(s, sp[0], rng);
      if (ch.some((c) => c.twin)) {
        twins++;
        const t = ch.filter((c) => c.twin);
        expect(t).toHaveLength(2);
        expect(t[0].genes).toEqual(t[1].genes);
        expect(t[0].name).not.toBe(t[1].name);
      }
    }
    expect(twins / N).toBeCloseTo(LIFE_EVENT_ODDS.twins, 1);
    expect(dragons / N).toBeCloseTo(LIFE_EVENT_ODDS.dragonSuitor, 1);
  });
});

describe('광고 하루 한도', () => {
  it('보석 광고는 하루 5번까지', () => {
    const s = createNewGame(8, 0);
    const cap = BALANCE.ads.dailyCap;
    expect(adsLeft(s, 'gems', cap)).toBe(5);
    for (let i = 0; i < 5; i++) countAd(s, 'gems');
    expect(adsLeft(s, 'gems', cap)).toBe(0);
    expect(adsLeft(s, 'offline_x2', cap)).toBe(Infinity);
  });
});

describe('알림 예약', () => {
  it('은퇴·오프라인·다음 날 알림 시각', () => {
    const now = new Date(2026, 10, 23, 15, 0).getTime();
    const s = createNewGame(9, now);
    s.hero.age = 40;
    const list = plannedNotifications(s, now);
    expect(list.map((n) => n.id).sort()).toEqual([101, 102, 103]);
    const retire = list.find((n) => n.id === 101)!;
    expect(retire.at).toBeGreaterThan(now);
    expect(list.find((n) => n.id === 102)!.at - now).toBe(BALANCE.time.offlineCapSec * 1000);
    const daily = new Date(list.find((n) => n.id === 103)!.at);
    expect(daily.getDate()).toBe(24);
    expect(daily.getHours()).toBe(12);
  });
});
