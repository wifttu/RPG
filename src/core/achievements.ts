import type { Reward } from './daily';
import { houseBest } from './economy';
import { totalHeirloomLevel } from './heirloom';
import type { GameState } from './state';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  reward: Reward;
  /** [현재값, 목표값] */
  progress: (s: GameState) => [number, number];
}

const gen = (n: number, name: string, gems: number): Achievement => ({
  id: `gen${n}`,
  name,
  desc: `${n}대 가주 탄생`,
  reward: { gems },
  progress: (s) => [s.hero.generation, n],
});
const stage = (n: number, name: string, gems: number, legacy = 0): Achievement => ({
  id: `stage${n}`,
  name,
  desc: `가문 최고 ${n}스테이지 도달`,
  reward: { gems, legacy },
  progress: (s) => [houseBest(s), n],
});

export const ACHIEVEMENTS: Achievement[] = [
  gen(2, '첫 계승', 50),
  gen(5, '명문가의 시작', 100),
  gen(10, '천년 가문', 300),
  stage(25, '들판을 넘어', 30),
  stage(50, '숲의 정복자', 80, 2),
  stage(100, '유적의 주인', 200, 5),
  stage(150, '전설의 원정', 400, 10),
  { id: 'boss10', name: '보스 사냥꾼', desc: '보스 10번 처치', reward: { gems: 50 }, progress: (s) => [s.progress.bossKills, 10] },
  { id: 'boss100', name: '보스 학살자', desc: '보스 100번 처치', reward: { gems: 150, legacy: 5 }, progress: (s) => [s.progress.bossKills, 100] },
  { id: 'kill1000', name: '천 번의 칼질', desc: '몬스터 1,000마리 처치', reward: { gems: 30 }, progress: (s) => [s.totalKills, 1000] },
  { id: 'kill20000', name: '만인의 적', desc: '몬스터 20,000마리 처치', reward: { gems: 120 }, progress: (s) => [s.totalKills, 20000] },
  { id: 'mutation', name: '특별한 아이', desc: '돌연변이 특성을 가진 아이를 후계자로', reward: { gems: 50 }, progress: (s) => [s.progress.mutations, 1] },
  { id: 'legendary', name: '전설의 핏줄', desc: '전설 특성을 가진 가주 탄생', reward: { gems: 200 }, progress: (s) => [s.progress.legendaryBorn, 1] },
  { id: 'heirloom10', name: '가보 장인', desc: '가보 레벨 합계 10', reward: { gems: 80 }, progress: (s) => [totalHeirloomLevel(s), 10] },
  { id: 'heirloom30', name: '가문의 보물', desc: '가보 레벨 합계 30', reward: { gems: 200, legacy: 5 }, progress: (s) => [totalHeirloomLevel(s), 30] },
  { id: 'attend7', name: '꾸준한 가주', desc: '7일 출석', reward: { gems: 100 }, progress: (s) => [s.attendance.count, 7] },
];

export function isDone(s: GameState, a: Achievement): boolean {
  const [cur, goal] = a.progress(s);
  return cur >= goal;
}

export function claimable(s: GameState): Achievement[] {
  return ACHIEVEMENTS.filter((a) => isDone(s, a) && !s.achievements.includes(a.id));
}
