import { describe, expect, it } from 'vitest';
import { BattleSim, type BattleEvent } from '../src/core/battle';
import { Rng } from '../src/core/rng';
import { autoSlot, buySlot, drawArts, setSlot, slotOpen, SLOT_UNLOCK } from '../src/core/skills';
import { createNewGame } from '../src/core/state';

describe('가문 비기', () => {
  it('칸은 스테이지로 열리거나 보석으로 연다', () => {
    const s = createNewGame(1, 0);
    expect(slotOpen(s, 0, 1)).toBe(false);
    expect(slotOpen(s, 0, SLOT_UNLOCK[0].stage)).toBe(true);
    s.gems = SLOT_UNLOCK[0].gems;
    expect(buySlot(s, 1)).toBe(true);
    expect(s.gems).toBe(0);
    expect(slotOpen(s, 0, 1)).toBe(true);
    expect(slotOpen(s, 1, 1)).toBe(false);
  });

  it('비기서 뽑기: 같은 비기는 레벨업, 빈 칸에 자동 장착, 전투에서 자동 사용', () => {
    const s = createNewGame(2, 0);
    s.gems = 10000;
    s.hero.maxStage = 130; // 칸 3개 모두 열림
    const rng = new Rng(2);
    for (let i = 0; i < 5; i++) drawArts(s, rng, 10);
    const owned = Object.values(s.skills.owned);
    expect(owned.length).toBeGreaterThan(2);
    expect(owned.some((o) => o!.lv > 1)).toBe(true);
    autoSlot(s, 130);
    expect(s.skills.slots.filter(Boolean).length).toBe(3);
    // 같은 비기를 다른 칸에 끼우면 옮겨진다
    const id = s.skills.slots[0]!;
    expect(setSlot(s, 1, id, 130)).toBe(true);
    expect(s.skills.slots[0]).toBe(null);
    s.upgrades = { atk: 30, hp: 40, spd: 0 };
    const sim = new BattleSim(s, new Rng(3));
    const ev: BattleEvent[] = [];
    for (let t = 0; t < 30; t += 0.05) ev.push(...sim.tick(0.05, 0));
    expect(ev.some((e) => e.type === 'art')).toBe(true);
  });
});
