/**
 * 밸런스 수치는 전부 여기에 모은다. 라이브 운영 시 원격 설정(Remote Config)으로 교체할 자리.
 */
export const BALANCE = {
  time: {
    /** 게임 속 1년이 실제 몇 초인지. 프로토타입은 빠르게(30초), 라이브는 수 분 단위로. */
    secondsPerYear: 30,
    startAge: 18,
    /** 이 나이부터 자발적 은퇴 가능 */
    retireMinAge: 30,
    baseLifespan: 58,
    /** 오프라인 보상 최대 누적 시간(초) */
    offlineCapSec: 8 * 3600,
    offlineEfficiency: 0.5,
    /** 접속하지 않은 동안 나이 드는 속도 (1 = 동일). 자고 일어났더니 은퇴해 있는 상황을 줄인다. */
    offlineAgingRate: 0.5,
  },
  hero: {
    baseAtk: 4,
    atkPerStr: 0.25,
    baseHp: 40,
    hpPerVit: 2.5,
    baseAtkSpeed: 0.9,
    atkSpeedPerAgi: 0.012,
    baseCrit: 0.05,
    critPerAgi: 0.001,
    critMultiplier: 2.0,
    respawnSec: 2,
  },
  upgrades: {
    atk: { baseCost: 8, growth: 1.15, perLevel: 0.35, max: Infinity },
    hp: { baseCost: 8, growth: 1.15, perLevel: 0.4, max: Infinity },
    spd: { baseCost: 25, growth: 1.3, perLevel: 0.03, max: 50 },
    /** N레벨마다 배율 x2 (방치형 특유의 '돌파' 쾌감) */
    milestoneEvery: 25,
  },
  monster: {
    baseHp: 18,
    hpGrowth: 1.16,
    baseAtk: 3,
    atkGrowth: 1.15,
    attackInterval: 1.5,
    baseGold: 3,
    goldGrowth: 1.13,
    perStage: 5,
    spawnGap: 0.7,
    bossEvery: 10,
    bossHpMul: 8,
    bossAtkMul: 2,
    bossGoldMul: 10,
    bossTimeLimit: 30,
  },
  fame: {
    /** 은퇴 시 명성 = floor((최고 스테이지 / divisor) ^ exponent) */
    divisor: 8,
    exponent: 1.7,
    /** 명성 1당 공격/체력/골드 +5% */
    bonusPerPoint: 0.05,
  },
  genetics: {
    /** 부모 한 명의 특성이 자녀에게 전해질 확률 */
    traitInheritChance: 0.5,
    /** 새로운 특성이 생길(돌연변이) 확률 */
    mutationChance: 0.06,
    maxTraits: 2,
    statNoiseSd: 8,
    childrenPerGeneration: 3,
    spouseCandidates: 3,
    /** 외형 유전자가 부모와 무관하게 새로 나올 확률 */
    looksMutation: 0.12,
  },
  gems: {
    start: 100,
    spouseReroll: 30,
    childReroll: 50,
    adReward: 10,
  },
  ads: {
    goldBoostMinutes: 30,
    goldBoostMul: 2,
    offlineMul: 2,
  },
} as const;

export type UpgradeKind = keyof Omit<typeof BALANCE.upgrades, 'milestoneEvery'>;
export const UPGRADE_KINDS: UpgradeKind[] = ['atk', 'hp', 'spd'];
