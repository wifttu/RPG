import { iconImg } from '../art/icons';
import { itemIconUrl } from '../art/itemIcons';
import { audio } from '../audio/audio';
import { combatPower, previewEquip } from '../core/equip';
import type { Game } from '../core/game';
import { TALENT_LABEL } from '../core/genetics';
import {
  CLASSES,
  GACHA_COST,
  MERGE_COUNT,
  PITY,
  RARITIES,
  SLOT_LABEL,
  SLOTS,
  SKILLS,
  TALENT_ATK_BONUS,
  canMerge,
  heroClass,
  itemEffect,
  itemName,
  ownedKeys,
  parseKey,
  rarityOf,
  spareCount,
  tierLabel,
  type ItemKey,
  type Slot,
  type WeaponKind,
} from '../core/gear';
import { fmt, josa } from './format';

/** 장비 탭: 직업·전투력, 장착 칸, 장비 뽑기, 무기고(합성·장착) */

export interface GearCtx {
  core: Game;
  openModal(html: string): { root: HTMLElement; close: () => void };
  toast(msg: string, ms?: number): void;
  showAd(placement: string, onReward: () => void): void;
  openOdds(): void;
  rerender(): void;
}

const pctText = (m: number) => (m >= 11 ? `x${fmt(m)}` : `+${Math.round((m - 1) * 100).toLocaleString('ko-KR')}%`);

export function effectText(key: ItemKey): string {
  const { kind } = parseKey(key);
  const e = itemEffect(key);
  const base =
    e.atkMul !== undefined
      ? `공격력 ${pctText(e.atkMul)}`
      : e.hpMul !== undefined
        ? `체력 ${pctText(e.hpMul)}`
        : e.critAdd !== undefined
          ? `치명타 +${(e.critAdd * 100).toFixed(1)}%p`
          : `골드 ${pctText(e.goldMul ?? 1)}`;
  if (kind === 'sword' || kind === 'bow' || kind === 'staff') return `${base} · ${CLASSES[kind].name}`;
  return base;
}

function cell(core: Game, key: ItemKey, compact = false): string {
  const { kind, tier, slot } = parseKey(key);
  const r = RARITIES[rarityOf(tier)];
  const equipped = core.state.gear.equipped[slot] === key;
  const spare = Math.max(0, spareCount(core.state, key));
  const n = core.state.gear.inv[key] ?? 0;
  // 장착 칸 안에 들어갈 때(compact)는 버튼 안에 버튼이 생기지 않도록 div 로 만든다
  const tag = compact ? 'div' : 'button';
  return `
    <${tag} class="item r${rarityOf(tier)} ${equipped ? 'eq' : ''}" ${compact ? '' : `data-item="${key}"`} style="--rc:${r.color}" aria-label="${itemName(key)} ${tierLabel(tier)}">
      ${equipped ? '<span class="eq-badge">E</span>' : ''}
      ${canMerge(core.state, key) ? '<span class="up-badge">▲</span>' : ''}
      <img src="${itemIconUrl(kind)}" alt="" />
      <span class="tl">${r.name}${'★'.repeat((tier % 4) + 1)}</span>
      ${
        compact
          ? ''
          : `<span class="cnt"><i style="width:${Math.min(100, (spare / MERGE_COUNT) * 100)}%"></i><b>${n}</b></span>`
      }
    </${tag}>`;
}

export function gearHtml(core: Game, filter: Slot): string {
  const s = core.state;
  const cls = heroClass(s);
  const talent = s.hero.genes.talent;
  const match = s.gear.equipped.weapon && talent === cls.kind;
  const freeUsed = s.daily.claimed.includes('gacha_ad');
  const owned = ownedKeys(s, filter);

  return `
    <div class="card">
      <h3>${iconImg('atk')} ${cls.name} <small>전투력 <b data-b="power" style="color:var(--gold)"></b></small></h3>
      <p class="small muted" style="margin:0 0 6px">${cls.desc}</p>
      <p class="small" style="margin:0 0 6px">스킬 <b style="color:var(--gold)">${SKILLS[cls.kind].name}</b> <span class="muted">— ${SKILLS[cls.kind].desc}</span></p>
      <p class="small" style="margin:0">재능: <b>${TALENT_LABEL[talent]}</b> ${
        match
          ? `<span class="rec">재능 일치 · 공격력 +${Math.round((TALENT_ATK_BONUS - 1) * 100)}%</span>`
          : `<span class="muted">— ${josa(TALENT_LABEL[talent], '을', '를')} 들면 공격력 +${Math.round((TALENT_ATK_BONUS - 1) * 100)}%</span>`
      }</p>
      <div class="slots">
        ${SLOTS.map((slot) => {
          const k = s.gear.equipped[slot];
          return `<button class="slot ${filter === slot ? 'on' : ''}" data-slot="${slot}" ${k ? `data-eq="${k}"` : ''} aria-label="${SLOT_LABEL[slot]}">
              ${k ? cell(core, k, true) : `<span class="empty">${SLOT_LABEL[slot]}<br />없음</span>`}
            </button>`;
        }).join('')}
      </div>
    </div>

    <div class="card gacha">
      <h3>${iconImg('gem')} 장비 뽑기 <small>영웅 등급 확정까지 <b data-b="pityLeft"></b>회</small></h3>
      <div class="gacha-btns">
        <button class="btn green" data-gacha="ad" ${freeUsed ? 'disabled' : ''}>${iconImg('ad')} ${freeUsed ? '내일 다시' : '무료 1회'}</button>
        <button class="btn blue" data-gacha="1">${iconImg('gem')} ${GACHA_COST.one} · 1회</button>
        <button class="btn gold" data-gacha="10">${iconImg('gem')} ${GACHA_COST.ten} · 10회</button>
      </div>
      <p class="small muted" style="margin:6px 0 0">뽑은 장비는 ★1. 같은 장비 ${MERGE_COUNT}개를 합성하면 한 단계 올라가요 (★4 다음은 위 등급 ★1). <button class="linkish" data-act-gear="odds">확률 보기</button></p>
    </div>

    <div class="card">
      <h3>무기고 <small>${SLOT_LABEL[filter]} ${owned.length}종</small></h3>
      <div class="filters">
        ${SLOTS.map((slot) => `<button class="fchip ${filter === slot ? 'on' : ''}" data-slot="${slot}">${SLOT_LABEL[slot]}</button>`).join('')}
      </div>
      <div class="inv">
        ${owned.length ? owned.map((k) => cell(core, k)).join('') : '<p class="small muted">아직 없어요. 장비를 뽑아 보세요!</p>'}
      </div>
      <div class="actions" style="margin-top:8px;display:flex;gap:6px">
        <button class="btn ghost" data-act-gear="auto" style="flex:1">추천 장착</button>
        <button class="btn ghost" data-act-gear="mergeAll" style="flex:1">일괄 합성</button>
      </div>
    </div>`;
}

export function refreshGear(root: HTMLElement, core: Game): void {
  const p = root.querySelector('[data-b="power"]');
  if (p) p.textContent = fmt(combatPower(core.state));
  const pl = root.querySelector('[data-b="pityLeft"]');
  if (pl) pl.textContent = String(PITY - core.state.gear.pity);
  const one = root.querySelector<HTMLButtonElement>('[data-gacha="1"]');
  if (one) one.disabled = core.state.gems < GACHA_COST.one;
  const ten = root.querySelector<HTMLButtonElement>('[data-gacha="10"]');
  if (ten) ten.disabled = core.state.gems < GACHA_COST.ten;
}

export function bindGear(root: HTMLElement, ctx: GearCtx, setFilter: (s: Slot) => void): void {
  const { core } = ctx;
  root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) =>
    b.addEventListener('click', () => {
      audio.play('click');
      // 장비가 낀 칸은 그 장비 상세, 빈 칸은 무기고를 그 부위로
      if (b.dataset.eq) openItem(ctx, b.dataset.eq);
      else setFilter(b.dataset.slot as Slot);
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.play('click');
      openItem(ctx, b.dataset.item!);
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-gacha]').forEach((b) =>
    b.addEventListener('click', () => {
      const what = b.dataset.gacha!;
      if (what === 'ad') {
        ctx.showAd('gacha_free', () => {
          if (core.state.daily.claimed.includes('gacha_ad')) return;
          core.state.daily.claimed.push('gacha_ad');
          const r = core.gacha(1, true);
          if (r) showResults(ctx, r.map((x) => x.key));
        });
        return;
      }
      const n = what === '10' ? 10 : 1;
      const r = core.gacha(n);
      if (!r) return ctx.toast('보석이 부족해요');
      showResults(ctx, r.map((x) => x.key));
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-act-gear]').forEach((b) =>
    b.addEventListener('click', () => {
      const act = b.dataset.actGear;
      if (act === 'odds') return ctx.openOdds();
      if (act === 'auto') {
        const n = core.autoEquip();
        audio.play(n ? 'upgrade' : 'click', 0.6);
        ctx.toast(n ? `${n}곳을 더 좋은 장비로 바꿨어요` : '이미 가장 좋은 장비를 끼고 있어요');
      }
      if (act === 'mergeAll') {
        const n = core.mergeAll();
        if (n) audio.play('reward');
        ctx.toast(n ? `${n}번 합성했어요` : `합성할 장비가 없어요 (같은 장비 ${MERGE_COUNT}개 필요)`);
      }
      ctx.rerender();
    }),
  );
}

function openItem(ctx: GearCtx, key: ItemKey): void {
  const { core } = ctx;
  const { kind, tier, slot } = parseKey(key);
  const r = RARITIES[rarityOf(tier)];
  const equipped = core.state.gear.equipped[slot] === key;
  const pv = previewEquip(core.state, key, slot);
  const p0 = combatPower(core.state);
  const line = (label: string, a: number, b: number, f: (n: number) => string = fmt) =>
    `<div class="stat"><span>${label}</span><b>${f(a)}${f(a) === f(b) ? '' : ` → <em class="${b > a ? 'up' : 'down'}">${f(b)}</em>`}</b></div>`;
  const isWeapon = slot === 'weapon';
  const { root, close } = ctx.openModal(`
    <div class="item-detail" style="--rc:${r.color}">
      <div class="big-icon r${rarityOf(tier)}"><img src="${itemIconUrl(kind)}" alt="" /></div>
      <h2>${itemName(key)}</h2>
      <p class="lead" style="color:var(--rc)">${tierLabel(tier)}</p>
      <p class="lead small">${effectText(key)}${isWeapon ? `<br />${CLASSES[kind as WeaponKind].desc}` : ''}</p>
      ${
        equipped
          ? '<p class="retire-warn good">지금 장착 중이에요</p>'
          : `<div class="stats" style="margin:0 0 8px">
          ${line('전투력', p0, pv.power)}
          ${line('공격력', pv.before.atk, pv.after.atk)}
          ${line('체력', pv.before.maxHp, pv.after.maxHp)}
          ${line('공격 속도', pv.before.atkPerSec, pv.after.atkPerSec, (n) => n.toFixed(2))}
        </div>`
      }
      <p class="small muted" style="text-align:center">보유 ${core.state.gear.inv[key] ?? 0}개 · 합성하려면 ${MERGE_COUNT}개 (장착 중인 1개 제외)</p>
      <div class="actions">
        <button class="btn ghost" data-a="x">닫기</button>
        <button class="btn blue" data-a="merge" ${canMerge(core.state, key) ? '' : 'disabled'}>합성</button>
        <button class="btn" data-a="equip" ${equipped ? 'disabled' : ''}>장착</button>
      </div>
    </div>`);
  root.querySelector('[data-a="x"]')!.addEventListener('click', close);
  root.querySelector('[data-a="equip"]')!.addEventListener('click', () => {
    core.equip(key);
    audio.play('upgrade', 0.5);
    close();
    ctx.toast(`${itemName(key)} 장착`);
    ctx.rerender();
  });
  root.querySelector('[data-a="merge"]')!.addEventListener('click', () => {
    const n = core.merge(key);
    close();
    if (n) {
      audio.play('reward');
      ctx.toast(`${n}개 합성 → ${tierLabel(tier + 1)}`);
    }
    ctx.rerender();
  });
}

function showResults(ctx: GearCtx, keys: ItemKey[]): void {
  const { core } = ctx;
  const best = Math.max(...keys.map((k) => rarityOf(parseKey(k).tier)));
  audio.play(best >= 3 ? 'fanfare' : 'reward');
  const { root, close } = ctx.openModal(`
    <h2>${keys.length === 1 ? '장비 획득!' : `장비 ${keys.length}개 획득!`}</h2>
    <p class="lead small">${best >= 3 ? `<b style="color:${RARITIES[best].color}">${RARITIES[best].name} 등급</b>이 나왔어요!` : '같은 장비 4개를 모으면 합성할 수 있어요'}</p>
    <div class="results">
      ${keys
        .map((k, i) => {
          const { kind, tier } = parseKey(k);
          const r = rarityOf(tier);
          return `<div class="res r${r}" style="--rc:${RARITIES[r].color};animation-delay:${i * 0.08}s">
            <img src="${itemIconUrl(kind)}" alt="" /><span>${itemName(k)}</span><b>${RARITIES[r].name}</b></div>`;
        })
        .join('')}
    </div>
    <div class="actions">
      <button class="btn ghost" data-a="x">확인</button>
      <button class="btn gold" data-a="again" ${core.state.gems < GACHA_COST.ten ? 'disabled' : ''}>${iconImg('gem')} ${GACHA_COST.ten} · 10회 더</button>
    </div>`);
  root.querySelector('[data-a="x"]')!.addEventListener('click', () => {
    close();
    ctx.rerender();
  });
  root.querySelector('[data-a="again"]')!.addEventListener('click', () => {
    close();
    const r = core.gacha(10);
    if (r) showResults(ctx, r.map((x) => x.key));
    else ctx.toast('보석이 부족해요');
  });
}
