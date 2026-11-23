import type { Rng } from './rng';

const HEAD = ['레', '아', '카', '세', '루', '테', '엘', '리', '미', '하', '로', '유', '시', '에', '이', '다', '벨', '노', '키', '라'];
const TAIL = ['온', '린', '엘', '나', '오', '라', '안', '아', '스', '델', '르', '벨', '니', '우', '렌', '시', '란', '드'];

export function generateName(rng: Rng): string {
  const len = rng.chance(0.3) ? 3 : 2;
  let name = rng.pick(HEAD);
  for (let i = 1; i < len; i++) name += rng.pick(TAIL);
  return name;
}

export const HOUSE_NAMES = ['하르트', '벨모어', '루시엔', '아스테', '그레이브', '로웰', '카시안', '노르딘'];
