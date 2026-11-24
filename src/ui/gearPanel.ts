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
  claimableSummonLevel,
  heroClass,
  MAX_SUMMON_LEVEL,
  SUMMON_LEVELS,
  summonLevel,
  summonProgress,
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
import { houseBest } from '../core/economy';
import { ART_COST, ART_IDS, ART_MAX_LEVEL, ARTS, artPower, cardsToLevel, SLOT_UNLOCK, slotOpen, type ArtId } from '../core/skills';

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

    ${artsHtml(core)}

    <div class="card gacha">
      <h3>${iconImg('gem')} 장비 뽑기 <small>영웅 등급 확정까지 <b data-b="pityLeft"></b>회</small></h3>
      <div class="gacha-btns">
        <button class="btn green" data-gacha="ad" ${freeUsed ? 'disabled' : ''}>${iconImg('ad')} ${freeUsed ? '내일 다시' : '무료 1회'}</button>
        <button class="btn blue" data-gacha="1">${iconImg('gem')} ${GACHA_COST.one} · 1회</button>
        <button class="btn gold" data-gacha="10">${iconImg('gem')} ${GACHA_COST.ten} · 10회</button>
      </div>
      <div class="summon">
        <span class="slv">소환 Lv.<b data-b="sumLv"></b></span>
        <i class="sbar"><b data-b="sumFill"></b></i>
        <span class="small muted" data-b="sumTxt"></span>
        <button class="btn gold sbox" data-act-gear="summon" hidden>🎁 보상</button>
      </div>
      <p class="small muted" style="margin:0 0 4px" data-b="sumNext"></p>
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

// ───────────────────────── 가문 비기 ─────────────────────────
function artsHtml(core: Game): string {
  const s = core.state;
  const best = houseBest(s);
  const cls = heroClass(s);
  const owned = ART_IDS.filter((id) => s.skills.owned[id]);
  const slot = (i: number) => {
    if (!slotOpen(s, i, best)) {
      const u = SLOT_UNLOCK[i];
      const first = [0, 1, 2].find((k) => !slotOpen(s, k, best)) === i;
      return `<button class="aslot locked" data-art-slot="${i}" ${first ? '' : 'disabled'}>🔒<small>스테이지 ${u.stage}<br />또는 💎${u.gems}</small></button>`;
    }
    const id = s.skills.slots[i];
    return id
      ? `<button class="aslot" data-art-slot="${i}" style="--ac:${ARTS[id].color}"><b>${ARTS[id].name}</b><small>Lv.${s.skills.owned[id]?.lv ?? 1}</small></button>`
      : `<button class="aslot empty" data-art-slot="${i}">＋<small>빈 칸</small></button>`;
  };
  return `
    <div class="card arts">
      <h3>${iconImg('atk')} 스킬 칸 <small>가문 비기는 대대로 이어져요</small></h3>
      <div class="aslots">
        <div class="aslot fixed"><b>${SKILLS[cls.kind].name}</b><small>직업 스킬</small></div>
        ${[0, 1, 2].map(slot).join('')}
      </div>
      ${
        owned.length
          ? `<div class="alist">${owned
              .map((id) => {
                const o = s.skills.owned[id]!;
                const a = ARTS[id];
                const need = cardsToLevel(o.lv);
                return `<div class="arow"><b style="color:${a.color}">${a.name}</b> <span class="lv">Lv.${o.lv}</span>
                  <span class="small muted">${o.lv >= ART_MAX_LEVEL ? 'MAX' : `비기서 ${o.cards}/${need}`}</span>
                  <div class="small muted">${a.desc}${o.lv > 1 ? ` · 위력 x${artPower(o.lv).toFixed(1)}` : ''}</div></div>`;
              })
              .join('')}</div>`
          : '<p class="small muted" style="margin:6px 0">아직 배운 비기가 없어요. 비기서를 펼쳐 보세요!</p>'
      }
      <div class="gacha-btns" style="grid-template-columns:1fr 1fr">
        <button class="btn blue" data-art-draw="1">${iconImg('gem')} ${ART_COST.one} · 비기서 1권</button>
        <button class="btn gold" data-art-draw="10">${iconImg('gem')} ${ART_COST.ten} · 10권</button>
      </div>
      <p class="small muted" style="margin:6px 0 0">같은 비기서를 또 얻으면 레벨이 올라요 (위력 +20%/레벨). <button class="linkish" data-act-gear="odds">확률 보기</button></p>
    </div>`;
}

function bindArts(root: HTMLElement, ctx: GearCtx): void {
  const { core } = ctx;
  root.querySelectorAll<HTMLButtonElement>('[data-art-draw]').forEach((b) =>
    b.addEventListener('click', () => {
      const n = b.dataset.artDraw === '10' ? 10 : 1;
      const r = core.drawArts(n);
      if (!r) return ctx.toast('보석이 부족해요');
      audio.play('reward');
      const { root: m, close } = ctx.openModal(`
        <h2>비기서 ${r.length}권</h2>
        <div class="results">${r
          .map((id, i) => `<div class="res" style="--rc:${ARTS[id].color};animation-delay:${i * 0.06}s"><span>${ARTS[id].name}</span><b>Lv.${core.state.skills.owned[id]!.lv}</b></div>`)
          .join('')}</div>
        <div class="actions"><button class="btn ghost" data-a="x">확인</button></div>`);
      m.querySelector('[data-a="x"]')!.addEventListener('click', () => {
        close();
        ctx.rerender();
      });
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-art-slot]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.artSlot);
      const s = core.state;
      if (!slotOpen(s, i, houseBest(s))) {
        const u = SLOT_UNLOCK[i];
        const { root: m, close } = ctx.openModal(`
          <h2>${i + 2}번 스킬 칸 열기</h2>
          <p class="lead">가문 최고 스테이지 ${u.stage}에 닿으면 무료로 열려요. 지금 바로 열 수도 있어요.</p>
          <div class="actions"><button class="btn ghost" data-a="x">닫기</button>
          <button class="btn gold" data-a="buy" ${s.gems < u.gems ? 'disabled' : ''}>${iconImg('gem')} ${u.gems} · 지금 열기</button></div>`);
        m.querySelector('[data-a="x"]')!.addEventListener('click', close);
        m.querySelector('[data-a="buy"]')!.addEventListener('click', () => {
          close();
          if (core.buyArtSlot()) {
            audio.play('reward');
            ctx.toast(`${i + 2}번 스킬 칸이 열렸어요`);
          }
          ctx.rerender();
        });
        return;
      }
      const owned = ART_IDS.filter((id) => s.skills.owned[id]);
      if (!owned.length) return ctx.toast('먼저 비기서를 펼쳐 비기를 배우세요');
      const { root: m, close } = ctx.openModal(`
        <h2>${i + 2}번 칸에 끼울 비기</h2>
        <div class="alist pick">${owned
          .map(
            (id) => `<button class="arow" data-pick="${id}"><b style="color:${ARTS[id].color}">${ARTS[id].name}</b> <span class="lv">Lv.${s.skills.owned[id]!.lv}</span>
            ${s.skills.slots.includes(id) ? `<span class="small muted">(${s.skills.slots.indexOf(id) + 2}번 칸)</span>` : ''}<div class="small muted">${ARTS[id].desc}</div></button>`,
          )
          .join('')}</div>
        <div class="actions"><button class="btn ghost" data-a="clear">비우기</button><button class="btn ghost" data-a="x">닫기</button></div>`);
      m.querySelector('[data-a="x"]')!.addEventListener('click', close);
      m.querySelector('[data-a="clear"]')!.addEventListener('click', () => {
        core.setArtSlot(i, null);
        close();
        ctx.rerender();
      });
      m.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((p) =>
        p.addEventListener('click', () => {
          core.setArtSlot(i, p.dataset.pick as ArtId);
          audio.play('upgrade', 0.6);
          close();
          ctx.rerender();
        }),
      );
    }),
  );
}

export function refreshGear(root: HTMLElement, core: Game): void {
  root.querySelectorAll<HTMLButtonElement>('[data-art-draw]').forEach((b) => {
    b.disabled = core.state.gems < (b.dataset.artDraw === '10' ? ART_COST.ten : ART_COST.one);
  });
  const p = root.querySelector('[data-b="power"]');
  if (p) p.textContent = fmt(combatPower(core.state));
  const pl = root.querySelector('[data-b="pityLeft"]');
  if (pl) pl.textContent = String(PITY - core.state.gear.pity);
  // 소환 레벨
  const g = core.state.gear;
  const lv = summonLevel(g.draws);
  const prog = summonProgress(g.draws);
  const setT = (b: string, t: string) => {
    const el = root.querySelector(`[data-b="${b}"]`);
    if (el && el.textContent !== t) el.textContent = t;
  };
  setT('sumLv', String(lv));
  setT('sumTxt', prog ? `${prog.cur}/${prog.need}` : 'MAX');
  const fill = root.querySelector<HTMLElement>('[data-b="sumFill"]');
  if (fill) fill.style.width = `${prog ? (prog.cur / prog.need) * 100 : 100}%`;
  const claim = claimableSummonLevel(core.state);
  const box = root.querySelector<HTMLButtonElement>('[data-act-gear="summon"]');
  if (box) box.hidden = !claim;
  const nextLv = claim || (lv < MAX_SUMMON_LEVEL ? lv + 1 : 0);
  if (nextLv) {
    const r = SUMMON_LEVELS[nextLv - 1];
    setT('sumNext', `${claim ? `Lv.${claim} 보상 받을 수 있어요` : `Lv.${nextLv} 보상`}: ${RARITIES[r.rarity].name} 장비 ${r.count}개 + 보석 ${r.gems}`);
  } else setT('sumNext', '소환 레벨 최고! 모든 보상을 받았어요');
  const one = root.querySelector<HTMLButtonElement>('[data-gacha="1"]');
  if (one) one.disabled = core.state.gems < GACHA_COST.one;
  const ten = root.querySelector<HTMLButtonElement>('[data-gacha="10"]');
  if (ten) ten.disabled = core.state.gems < GACHA_COST.ten;
}

export function bindGear(root: HTMLElement, ctx: GearCtx, setFilter: (s: Slot) => void): void {
  const { core } = ctx;
  bindArts(root, ctx);
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
      if (act === 'summon') {
        const r = core.claimSummon();
        if (r) showResults(ctx, r.keys, `소환 Lv.${r.level} 보상! 보석 +${r.gems}`);
        return;
      }
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

function showResults(ctx: GearCtx, keys: ItemKey[], title?: string): void {
  const { core } = ctx;
  const best = Math.max(...keys.map((k) => rarityOf(parseKey(k).tier)));
  audio.play(best >= 3 ? 'fanfare' : 'reward');
  const { root, close } = ctx.openModal(`
    <h2>${title ?? (keys.length === 1 ? '장비 획득!' : `장비 ${keys.length}개 획득!`)}</h2>
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
