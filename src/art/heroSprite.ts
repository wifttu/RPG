import type { Genes } from '../core/genetics';
import { compose, parse, toCanvas, type Grid } from './pixel';
import { BLADE, EYES, GOLD, HAIR, HOUSE_CLOTH, LEATHER, OUTLINE, SKIN, STEEL } from './palette';

/**
 * 종이인형(paper-doll) 방식 영웅 스프라이트 32x32, 오른쪽을 본다.
 * 유전자(머리색·피부·눈·머리모양)에 따라 조합되므로 자녀가 부모를 닮는다.
 * 나중에 이미지 AI로 그린 레이어(PNG)로 교체해도 같은 구조를 유지한다. (docs/ART_GUIDE.md)
 */
export const HERO_W = 32;
export const HERO_H = 32;

const CAPE = [
  '9:oCCo',
  '8:oCCCo',
  '8:oCCCo',
  '7:oCCCCo',
  '7:oCCCCo',
  '7:oCCkCo',
  '6:oCCCkCo',
  '6:oCCCCCo',
  '6:oCCCCCo',
  '6:oooCCoo',
  '9:oo',
];

const BODY = [
  '',
  '',
  '',
  '',
  '',
  '12:oooooooo',
  '10:oossssssssoo',
  '9:osssssssssssso',
  '8:osssssssssssssso',
  '8:osssssssssssssso',
  '8:ossssssssssseWsso',
  '8:ossssssssssseesso',
  '8:oSsssssssssseesso',
  '8:oSssssssssssssrro',
  '9:oSSssssssssssso',
  '10:oSSssssssssso',
  '12:ooooooooooo',
  '11:oAaajjaaAo',
  '11:oAajJjaaAo',
  '11:oAajjaaaAo',
  '11:oAaaaaaAAo',
  '11:oAAaaaaAAo',
  '11:oBbbgbbbBo',
  '11:oCckkcccCo',
  '11:oCccccCCCo',
  '12:obbooobbo',
  '12:obbo.obbo',
  '12:oBbo.oBbo',
  '11:oBBbo.oBBbo',
  '11:oBBBBooBBBBo',
  '11:oooooo.oooooo',
];

const ARM = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '17:ojjjo',
  '17:ojJjAo',
  '17:oAjAAo',
  '18:oAAAo',
  '19:osso',
  '19:oSSo',
  '20:oo',
];

/** 머리 모양 4종. 머리 위·뒤쪽을 덮는다. */
const HAIR_STYLES: string[][] = [
  // 0: 짧은 머리
  [
    '',
    '',
    '11:oooooooo',
    '9:oohhhhiihhoo',
    '8:ohhhhhhiiihhho',
    '7:ohhhhhhhhhhhhhho',
    '7:ohhhhhhhhhhhhhhho',
    '7:ohhhhhhhhhhHhhhHo',
    '7:ohhhhhhHho.oHo.o',
    '7:ohhhhhhho',
    '7:oHhhhhhHo',
    '7:oHhhhhHo',
    '8:oHHHHo',
    '9:oooo',
  ],
  // 1: 긴 머리 (뒤로 흘러내림)
  [
    '',
    '',
    '11:oooooooo',
    '9:oohhhhiihhoo',
    '8:ohhhhhhiiihhho',
    '7:ohhhhhhhhhhhhhho',
    '7:ohhhhhhhhhhhhhhho',
    '7:ohhhhhhhhhhhhhhHo',
    '7:ohhhhhhhHhho.oHo',
    '7:ohhhhhhhho',
    '6:ohhhhhhhho',
    '6:ohhhhhhhHo',
    '6:ohhhhhhHo',
    '6:oHhhhhhHo',
    '6:oHhhhhHo',
    '6:oHhHhhHo',
    '6:oHHHhHo',
    '6:oHHoHHo',
    '7:oo.oo',
  ],
  // 2: 삐죽 머리
  [
    '10:o...o',
    '9:oho.oio..o',
    '8:ohhhoihho.oio',
    '7:ohhhhhhiihhohho',
    '6:ohhhhhhhhiihhhho',
    '7:ohhhhhhhhhhhhhhho',
    '6:ohhhhhhhhhhhhhhhho',
    '7:ohhhhhhhhhHhhHhHo',
    '7:ohhhhhhHho.oHo.o',
    '6:ohhhhhhho',
    '7:oHhhhhho',
    '7:oHHhhHo',
    '8:oHHHo',
    '9:ooo',
  ],
  // 3: 포니테일
  [
    '',
    '',
    '11:oooooooo',
    '9:oohhhhiihhoo',
    '8:ohhhhhhiiihhho',
    '5:oo.ohhhhhhhhhhhhhho',
    '4:ohhoohhhhhhhhhhhhhho',
    '4:ohhhhhhhhhhhhhhhHhho',
    '4:oHhhhhhhhhHhhho.oHo',
    '4:oHhhhhhhhho',
    '4:oHhHohhhHo',
    '4:oHHo.oHHo',
    '4:oHHo.ooo',
    '4:oHo',
    '5:oo',
  ],
];

function colorsFor(genes: Genes): Record<string, string> {
  const hair = HAIR[genes.hairColor % HAIR.length].ramp;
  const skin = SKIN[genes.skinTone % SKIN.length];
  return {
    o: OUTLINE,
    s: skin[1],
    S: skin[0],
    L: skin[2],
    e: EYES[genes.eyeColor % EYES.length],
    W: '#ffffff',
    r: '#ef8a8a',
    h: hair[1],
    H: hair[0],
    i: hair[2],
    a: STEEL.base,
    A: STEEL.dark,
    j: STEEL.light,
    J: STEEL.hi,
    c: HOUSE_CLOTH[1],
    C: HOUSE_CLOTH[0],
    k: HOUSE_CLOTH[2],
    b: LEATHER.base,
    B: LEATHER.dark,
    n: LEATHER.light,
    g: GOLD.base,
    G: GOLD.dark,
  };
}

export function heroGrid(genes: Genes): Grid {
  const style = HAIR_STYLES[genes.hairStyle % HAIR_STYLES.length];
  return compose(
    HERO_W,
    HERO_H,
    parse(CAPE, HERO_W, HERO_H, 17),
    parse(BODY, HERO_W, HERO_H),
    parse(style, HERO_W, HERO_H),
    parse(ARM, HERO_W, HERO_H),
  );
}

const cache = new Map<string, HTMLCanvasElement>();

export function geneLookKey(g: Genes): string {
  return `${g.hairColor}-${g.skinTone}-${g.eyeColor}-${g.hairStyle}`;
}

export function heroCanvas(genes: Genes, scale = 1): HTMLCanvasElement {
  const key = `${geneLookKey(genes)}@${scale}`;
  let c = cache.get(key);
  if (!c) {
    c = toCanvas(heroGrid(genes), colorsFor(genes), scale);
    cache.set(key, c);
  }
  return c;
}

/** 검: 손잡이 끝이 원점. 회전시켜 휘두른다. 16x16, 칼끝이 위를 향함. */
const SWORD = [
  '7:oo',
  '6:omMo',
  '6:omMo',
  '6:omMo',
  '6:omMo',
  '6:omMo',
  '6:omMo',
  '6:omMo',
  '6:omMo',
  '4:ooGggGoo',
  '4:oGgggggo',
  '5:ooBBoo',
  '6:oBBo',
  '6:oggo',
  '7:oo',
];

export const SWORD_ORIGIN = { x: 8 / 16, y: 12 / 16 };

export function swordCanvas(): HTMLCanvasElement {
  return toCanvas(parse(SWORD, 16, 16), {
    o: OUTLINE,
    m: BLADE.hi,
    M: BLADE.base,
    g: GOLD.base,
    G: GOLD.dark,
    B: LEATHER.dark,
  });
}
