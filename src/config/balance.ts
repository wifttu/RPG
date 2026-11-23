/**
 * 밸런스 수치는 전부 여기에 모은다. 라이브 운영 시 원격 설정(Remote Config)으로 교체할 자리.
 */
export const BALANCE = {
  time: {
    /**
     * 게임 속 1년이 실제 몇 초인지. 세대가 거듭될수록 길어진다 (가문이 커질수록 한 세대의 이야기가 길어짐).
     * 1대는 빠르게 은퇴까지 경험시키고, 후반 세대는 방치 시간을 넉넉히 준다.
     */
    yearSecondsBase: 30,
    yearSecondsGrowth: 1.35,
    yearSecondsMax: 240,
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
    /** 쓰러진 뒤 부상: 이 시간 동안 공격력 감소 */
    injurySec: 6,
    injuryAtkMul: 0.75,
  },
  wall: {
    /** 같은 스테이지에서 이만큼 실패하면 자동으로 '머물기' */
    failsToStay: 3,
    /** 머무는 동안 전투력이 이 배율만큼 오르면 자동으로 다시 도전 */
    retryPowerGain: 1.25,
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
    bossHpMul: 3.5,
    bossAtkMul: 2,
    bossGoldMul: 10,
    bossTimeLimit: 30,
  },
  fame: {
    /**
     * 은퇴 시 명성 = floor(coef × growth^(최고 스테이지 − offset)).
     * 스테이지가 오를수록 명성이 기하급수로 늘어서, 세대마다 꾸준히 더 멀리 가게 된다.
     */
    coef: 3,
    growth: 1.09,
    offset: 10,
    /** 명성 1당 공격/체력/골드 +5% */
    bonusPerPoint: 0.05,
  },
  /** 정복한 땅 빠른 진군: 가문 최고 기록의 이 비율 아래 스테이지는 몬스터 1마리, 짧은 간격 */
  march: {
    ratio: 0.8,
    spawnGap: 0.25,
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
