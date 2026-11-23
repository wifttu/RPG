import type { Rng } from './rng';

const HEAD = ['레', '아', '카', '세', '루', '테', '엘', '리', '미', '하', '로', '유', '시', '에', '이', '다', '벨', '노', '키', '라', '소', '제', '헤', '마', '나', '비', '도', '가', '오', '브', '클', '프'];
const TAIL = ['온', '린', '엘', '나', '오', '라', '안', '아', '스', '델', '르', '벨', '니', '우', '렌', '시', '란', '드', '리', '이', '엔', '야', '빈', '셀', '론', '미', '카', '샤'];

export function generateName(rng: Rng, taken?: ReadonlySet<string>): string {
  // 이미 쓰인 이름(가문 사람들, 같은 후보 목록)과 겹치지 않게 몇 번 다시 뽑는다
  for (let attempt = 0; attempt < 40; attempt++) {
    const len = rng.chance(0.3) ? 3 : 2;
    let name = rng.pick(HEAD);
    for (let i = 1; i < len; i++) name += rng.pick(TAIL);
    if (!taken?.has(name)) return name;
  }
  // 거의 일어나지 않지만, 그래도 겹치면 2세·3세처럼 붙인다
  const base = rng.pick(HEAD) + rng.pick(TAIL);
  for (let n = 2; ; n++) if (!taken?.has(`${base} ${n}세`)) return `${base} ${n}세`;
}

export const HOUSE_NAMES = ['하르트', '벨모어', '루시엔', '아스테', '그레이브', '로웰', '카시안', '노르딘'];
