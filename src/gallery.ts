import { heroCanvas, swordCanvas } from './art/heroSprite';
import type { Genes } from './core/genetics';
import { coinCanvas, monsterCanvases } from './art/monsters';
import { itemIconCanvas } from './art/itemIcons';

/** ?gallery 로 열면 스프라이트를 크게 확대해서 확인하는 개발용 화면 */
export function renderGallery(extra: (() => HTMLCanvasElement)[] = []): void {
  document.body.innerHTML = '';
  document.body.style.cssText = 'background:#3a3350;display:flex;flex-wrap:wrap;gap:8px;padding:8px;margin:0';
  const add = (c: HTMLCanvasElement, s = 6) => {
    c.style.width = `${c.width * s}px`;
    c.style.height = `${c.height * s}px`;
    c.style.imageRendering = 'pixelated';
    c.style.background = '#5b5478';
    document.body.appendChild(c);
  };
  for (let style = 0; style < 4; style++) {
    const g: Genes = { str: 1, vit: 1, agi: 1, hairColor: style * 2, skinTone: style, eyeColor: style, hairStyle: style, traits: [], talent: 'sword' };
    add(heroCanvas(g));
  }
  add(swordCanvas());
  for (let b = 0; b < 3; b++)
    for (const k of ['slime', 'mushroom', 'bat', 'beetle', 'golem'] as const) for (const c of monsterCanvases(k, b)) add(c, 4);
  add(coinCanvas(), 4);
  for (const k of ['sword', 'bow', 'staff', 'helmet', 'armor', 'necklace', 'ring'] as const) add(itemIconCanvas(k), 8);
  for (const fn of extra) add(fn(), 4);
}
