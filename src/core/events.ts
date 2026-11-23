import { BALANCE } from '../config/balance';
import { grantReward } from './daily';
import { drawOne, itemName } from './gear';
import type { Rng } from './rng';
import type { GameState } from './state';
import { josa } from '../ui/format';

/**
 * 이야기 사건. 모험 중 가끔 일어나고, 고르는 선택에 따라 결과가 달라진다.
 * (출생·혼담 사건은 lineage.ts: 쌍둥이 · 용의 혼약)
 */
export interface EventChoice {
  label: string;
  /** 결과 문장을 돌려준다 */
  apply: (s: GameState, rng: Rng, now: number) => string;
  /** 선택할 수 없으면 이유 */
  disabled?: (s: GameState) => string | null;
}

export interface StoryEvent {
  id: string;
  title: string;
  text: (s: GameState) => string;
  choices: EventChoice[];
}

const fmtGold = (n: number) => Math.floor(n).toLocaleString('ko-KR');

export const FIELD_EVENTS: StoryEvent[] = [
  {
    id: 'merchant',
    title: '떠돌이 상인',
    text: (s) =>
      `낡은 수레를 끄는 상인이 길을 막는다.<br>"가주님, 골드를 조금만 나눠 주시면 귀한 보석을 드리지요."<br><span class="small muted">(골드 30% = ${fmtGold(s.gold * 0.3)})</span>`,
    choices: [
      {
        label: '골드 30%를 주고 보석 20개',
        disabled: (s) => (s.gold < 10 ? '골드가 거의 없어요' : null),
        apply: (s) => {
          s.gold *= 0.7;
          s.gems += 20;
          return '상인이 반짝이는 보석 20개를 건넸다.';
        },
      },
      { label: '정중히 거절한다', apply: () => '상인은 어깨를 으쓱하고 떠났다.' },
    ],
  },
  {
    id: 'chest',
    title: '옛 전장의 상자',
    text: () => '풀숲 사이로 녹슨 상자가 보인다. 오래전 전투에서 남겨진 것 같다.',
    choices: [
      {
        label: '열어 본다',
        apply: (s, rng) => {
          if (rng.chance(0.7)) {
            s.legacy += 2;
            return '선대의 문장이 새겨진 유산석 2개가 들어 있었다!';
          }
          s.gold *= 0.9;
          s.gems += 5;
          return '미믹이었다! 골드 10%를 빼앗겼지만, 도망치며 떨어뜨린 보석 5개를 주웠다.';
        },
      },
      { label: '그냥 지나간다', apply: () => '조심해서 나쁠 건 없다.' },
    ],
  },
  {
    id: 'oldman',
    title: '수상한 노인',
    text: (s) => `지팡이를 짚은 노인이 ${josa(s.hero.name, '을', '를')} 빤히 본다.<br>"젊음을 줄까, 재물을 줄까?"`,
    choices: [
      {
        label: '젊음 (2살 젊어진다)',
        disabled: (s) => (s.hero.age < BALANCE.time.startAge + 2 ? '이미 충분히 젊어요' : null),
        apply: (s) => {
          s.hero.age = Math.max(BALANCE.time.startAge, s.hero.age - 2);
          return '몸이 가벼워졌다. 2살 젊어졌다!';
        },
      },
      {
        label: '재물 (골드 2배 15분)',
        apply: (s, _r, now) => {
          grantReward(s, { boostMinutes: 15 }, now);
          return '주머니가 묵직해지는 기분이다. 15분간 골드 2배!';
        },
      },
    ],
  },
  {
    id: 'child',
    title: '길 잃은 아이',
    text: () => '숲에서 울고 있는 아이를 만났다. 마을까지는 꽤 멀다.',
    choices: [
      {
        label: '마을까지 데려다준다',
        apply: (s) => {
          s.gems += 15;
          return '아이의 부모가 고마움의 표시로 보석 15개를 건넸다. 가문의 이름이 조금 더 알려졌다.';
        },
      },
      { label: '길만 알려 준다', apply: () => '아이는 고개를 끄덕이고 달려갔다.' },
    ],
  },
  {
    id: 'smith',
    title: '떠돌이 대장장이',
    text: () => '모루를 짊어진 대장장이가 쉬고 있다. "남는 쇠가 있는데, 하나 만들어 드릴까요?"',
    choices: [
      {
        label: '부탁한다 (장비 1개)',
        apply: (s, rng) => {
          const r = drawOne(s, rng);
          // 대장장이 선물은 뽑기 횟수·천장에 세지 않는다
          s.gear.draws--;
          s.gear.pity = Math.max(0, s.gear.pity - 1);
          return `대장장이가 ${josa(itemName(r.key), '을', '를')} 만들어 주었다!`;
        },
      },
      { label: '괜찮다고 한다', apply: () => '대장장이는 다시 길을 떠났다.' },
    ],
  },
];

/** 사건 사이 최소 간격, 확인 주기, 그때마다 일어날 확률 */
export const EVENT_RULES = { minGapSec: 6 * 60, checkEverySec: 60, chance: 0.15 };

/** 출생·혼담 사건 확률 (보석으로 다시 뽑을 수 있으므로 확률표에 공개) */
export const LIFE_EVENT_ODDS = { twins: 0.08, dragonSuitor: 0.04 };

export function pickFieldEvent(s: GameState, rng: Rng): StoryEvent {
  // 최근에 본 사건은 덜 나오게
  const seen = s.events.seen;
  const weights = Object.fromEntries(FIELD_EVENTS.map((e) => [e.id, 1 / (1 + (seen[e.id] ?? 0) * 0.5)]));
  const id = rng.weighted(weights);
  return FIELD_EVENTS.find((e) => e.id === id)!;
}

export function resolveEvent(s: GameState, ev: StoryEvent, choice: number, rng: Rng, now: number): string {
  const c = ev.choices[choice];
  if (c.disabled?.(s)) return c.disabled(s)!;
  s.events.seen[ev.id] = (s.events.seen[ev.id] ?? 0) + 1;
  return c.apply(s, rng, now);
}
