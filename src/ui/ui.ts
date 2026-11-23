import { heroPortraitUrl } from '../art/heroSheet';
import { iconImg } from '../art/icons';
import { HAIR } from '../art/palette';
import { BALANCE, UPGRADE_KINDS, type UpgradeKind } from '../config/balance';
import { isBossStage, monstersInStage, upgradeCost, estimateGoldPerSec } from '../core/economy';
import type { Game } from '../core/game';
import { geneScore, type Genes } from '../core/genetics';
import { canRetire, mustRetire, previewFame, type Candidate } from '../core/lineage';
import { fameMultiplier, lifeStage, upgradeMultiplier } from '../core/stats';
import { MUTATION_RARITY_TABLE, RARITY_LABEL, getTrait, traitsOfRarity, type Rarity } from '../core/traits';
import { fmt, fmtDuration, fmtPct } from './format';

type Tab = 'grow' | 'family' | 'shop';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const spriteUrl = (genes: Genes) => heroPortraitUrl(genes);

function traitChips(ids: readonly string[], mutation?: string | null): string {
  if (!ids.length) return '<span class="chip common">특성 없음</span>';
  return ids
    .map((id) => {
      const t = getTrait(id);
      const mut = id === mutation ? ' <b>★돌연변이</b>' : '';
      return `<span class="chip ${t.rarity}" title="${esc(t.desc)}">${esc(t.name)} · ${esc(t.desc)}${mut}</span>`;
    })
    .join('');
}

function geneBars(g: Genes): string {
  const row = (label: string, v: number, color: string) =>
    `<span>${label}</span><div class="gbar"><div style="width:${v}%;background:${color}"></div></div><span>${v}</span>`;
  return `<div class="genes">${row('힘', g.str, '#ff8a6a')}${row('체력', g.vit, '#7cd67c')}${row('민첩', g.agi, '#6fd3ff')}</div>`;
}

const UPG_INFO: Record<UpgradeKind, { name: string; icon: 'atk' | 'hp' | 'spd'; stat: string }> = {
  atk: { name: '검술 수련', icon: 'atk', stat: '공격력' },
  hp: { name: '체력 단련', icon: 'hp', stat: '체력' },
  spd: { name: '발놀림', icon: 'spd', stat: '공격 속도' },
};

export class UI {
  private tab: Tab = 'grow';
  private panel = $('#panel');
  private modalOpen = false;
  private modalQueue: (() => void)[] = [];
  private lastGen = -1;

  constructor(private core: Game) {}

  mount(): void {
    this.renderHud();
    this.renderTabs();
    this.renderPanel();
    this.core.on('retirementDue', () => this.queueModal(() => this.openRetirement()));
    this.core.on('battle', (evs) => {
      if (evs.some((e) => e.type === 'kill')) this.pulse('.cur.gold');
    });
    this.core.on('newGeneration', () => this.renderPanel());
    setInterval(() => this.refresh(), 200);
    if (this.core.offline) this.queueModal(() => this.openOffline());
    this.refresh();
  }

  // ───────────────────────── HUD ─────────────────────────
  private renderHud(): void {
    $('#hud-top').innerHTML = `
      <div class="hud-row">
        <div class="house">
          <div class="crest">${iconImg('crown')}</div>
          <div class="names">
            <div class="title" data-b="title"></div>
            <div class="sub" data-b="heroLine"></div>
          </div>
        </div>
        <div class="currencies">
          <div class="cur gold">${iconImg('coin')}<b data-b="gold">0</b></div>
          <div class="cur gem">${iconImg('gem')}<b data-b="gems">0</b></div>
          <div class="cur fame">${iconImg('fame')}<b data-b="fame">0</b></div>
        </div>
      </div>
      <div class="lifebar">
        <span data-b="lifeStage"></span>
        <div class="bar"><div class="rest" data-b="lifeRest"></div><div class="mark" data-b="retireMark"></div></div>
        <span class="age" data-b="age"></span>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `.lifebar .bar{background:linear-gradient(90deg,#f4a988,#78acf2 18%,#78acf2 55%,#ffbc72 75%,#ff7c5c 90%,#40326e)}
      .lifebar .rest{position:absolute;top:0;bottom:0;right:0;background:#0b0812e0}`;
    document.head.appendChild(style);

    $('#battle-overlay').innerHTML = `
      <div>
        <div class="stage-chip" data-b="stage"></div>
        <div class="pips" data-b="pips"></div>
        <div class="boss-timer" data-b="bossTimer" hidden><div></div></div>
      </div>
      <div style="display:grid;gap:4px;justify-items:end">
        <div class="boost-chip" data-b="boost" hidden></div>
        <div class="boost-chip" data-b="speed" hidden></div>
      </div>`;
  }

  private pulse(sel: string): void {
    const n = $(sel);
    if (!n) return;
    n.classList.remove('pulse');
    void n.offsetWidth;
    n.classList.add('pulse');
  }

  private set(name: string, text: string): void {
    document.querySelectorAll<HTMLElement>(`[data-b="${name}"]`).forEach((n) => {
      if (n.textContent !== text) n.textContent = text;
    });
  }

  private refresh(): void {
    const { state, stats } = this.core;
    const hero = state.hero;
    const now = Date.now();

    this.set('title', `${state.houseName} 가문 · ${hero.generation}대`);
    this.set('heroLine', `가주 ${hero.name} · ${lifeStage(hero.age, stats.lifespan)}`);
    this.set('gold', fmt(state.gold));
    this.set('gems', fmt(state.gems));
    this.set('fame', fmt(state.fame));
    this.set('lifeStage', `${Math.floor(hero.age)}세`);
    this.set('age', `수명 ${stats.lifespan}세`);
    const start = BALANCE.time.startAge;
    const p = (hero.age - start) / (stats.lifespan - start);
    $('[data-b="lifeRest"]').style.width = `${Math.max(0, 100 - p * 100)}%`;
    $('[data-b="retireMark"]').style.left = `${((BALANCE.time.retireMinAge - start) / (stats.lifespan - start)) * 100}%`;

    // 전투 오버레이
    const boss = isBossStage(state.stage);
    $('[data-b="stage"]').innerHTML = boss
      ? `<span class="boss">BOSS</span> 스테이지 ${state.stage}`
      : `스테이지 ${state.stage}`;
    const pips = $('[data-b="pips"]');
    const total = monstersInStage(state.stage);
    const html = boss ? '' : Array.from({ length: total }, (_, i) => `<i class="${i < this.core.sim.killsInStage ? 'on' : ''}"></i>`).join('');
    if (pips.innerHTML !== html) pips.innerHTML = html;
    const bt = $('[data-b="bossTimer"]');
    bt.hidden = !(boss && this.core.sim.monster);
    if (!bt.hidden) (bt.firstElementChild as HTMLElement).style.width = `${(this.core.sim.bossTimeLeft / BALANCE.monster.bossTimeLimit) * 100}%`;
    const boostLeft = state.boostUntil - now;
    const boostEl = $('[data-b="boost"]');
    boostEl.hidden = boostLeft <= 0;
    if (boostLeft > 0) boostEl.textContent = `골드 x2 · ${fmtDuration(boostLeft / 1000)}`;
    const sp = $('[data-b="speed"]');
    sp.hidden = this.core.timeScale === 1;
    sp.textContent = `테스트 배속 x${this.core.timeScale}`;

    if (hero.generation !== this.lastGen) {
      this.lastGen = hero.generation;
      this.renderPanel();
    }
    this.refreshPanel();
  }

  // ───────────────────────── 탭 ─────────────────────────
  private renderTabs(): void {
    const tabs: [Tab, string, Parameters<typeof iconImg>[0]][] = [
      ['grow', '성장', 'atk'],
      ['family', '가문', 'crown'],
      ['shop', '상점', 'gem'],
    ];
    const nav = $('#tabs');
    nav.innerHTML = tabs
      .map(([id, label, icon]) => `<button data-tab="${id}" class="${id === this.tab ? 'on' : ''}">${iconImg(icon, '')}<span>${label}</span></button>`)
      .join('');
    nav.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        nav.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        this.renderPanel();
        this.panel.scrollTop = 0;
      }),
    );
  }

  private renderPanel(): void {
    if (this.tab === 'grow') this.panel.innerHTML = this.growHtml();
    else if (this.tab === 'family') this.panel.innerHTML = this.familyHtml();
    else this.panel.innerHTML = this.shopHtml();
    this.bindPanel();
    this.refreshPanel();
  }

  // 성장 탭 ─────────────────────────
  private growHtml(): string {
    const h = this.core.state.hero;
    return `
      <div class="card">
        <h3>${iconImg('atk')} 수련 <small>길게 누르면 연속 구매</small></h3>
        ${UPGRADE_KINDS.map(
          (k) => `
          <div class="upg">
            <div class="ico-box">${iconImg(UPG_INFO[k].icon)}</div>
            <div class="meta">
              <b>${UPG_INFO[k].name}</b><span class="lv" data-b="lv-${k}"></span>
              <div class="eff" data-b="eff-${k}"></div>
            </div>
            <button class="btn gold" data-upg="${k}">${iconImg('coin')}<span data-b="cost-${k}"></span></button>
          </div>`,
        ).join('')}
      </div>
      <div class="card">
        <h3>${iconImg('crown')} 은퇴와 계승</h3>
        <p class="small muted" style="margin:0 0 8px">
          가주는 해마다 나이를 먹어요. 전성기가 지나면 힘이 약해지니, 적당한 때에 은퇴하고 후계자를 정하세요.
          은퇴하면 <b style="color:var(--fame)">명성</b>을 얻어 다음 세대가 영원히 강해집니다.
        </p>
        <button class="btn wide" data-act="retire"><span data-b="retireLabel"></span></button>
      </div>
      <div class="card">
        <div class="hero-card">
          <div class="portrait"><img src="${spriteUrl(h.genes)}" alt="" /></div>
          <div class="hero-info">
            <div class="name">${esc(h.name)} <span class="muted small">${h.generation}대 가주 · ${esc(HAIR[h.genes.hairColor].name)}</span></div>
            <div class="chips">${traitChips(h.genes.traits)}</div>
            ${geneBars(h.genes)}
          </div>
        </div>
        <div class="stats">
          <div class="stat"><span>공격력</span><b data-b="sAtk"></b></div>
          <div class="stat"><span>체력</span><b data-b="sHp"></b></div>
          <div class="stat"><span>공격 속도</span><b data-b="sSpd"></b></div>
          <div class="stat"><span>치명타</span><b data-b="sCrit"></b></div>
          <div class="stat"><span>초당 골드</span><b data-b="sGps" style="color:var(--gold)"></b></div>
          <div class="stat"><span>나이 보정</span><b data-b="sAge"></b></div>
        </div>
      </div>`;
  }

  // 가문 탭 ─────────────────────────
  private familyHtml(): string {
    const s = this.core.state;
    const h = s.hero;
    const best = Math.max(h.maxStage, ...s.lineage.map((l) => l.maxStage));
    const entries = [...s.lineage].reverse();
    return `
      <div class="card">
        <h3>${iconImg('crown')} ${esc(s.houseName)} 가문 <small>${h.generation}대째</small></h3>
        <div class="stats" style="margin-top:0">
          <div class="stat"><span>명성</span><b style="color:var(--fame)">${fmt(s.fame)}</b></div>
          <div class="stat"><span>명성 보너스</span><b style="color:var(--good)">+${fmtPct(fameMultiplier(s.fame) - 1)}</b></div>
          <div class="stat"><span>가문 최고 기록</span><b>${best} 스테이지</b></div>
          <div class="stat"><span>처치한 몬스터</span><b>${fmt(s.totalKills)}</b></div>
        </div>
        <p class="small muted" style="margin:8px 0 0">💡 같은 특성을 가진 배우자를 맞으면 그 특성이 자녀에게 이어질 확률이 50% → 75%로 올라가요.</p>
      </div>
      <div class="card">
        <h3>가계도 <small>최근 세대부터</small></h3>
        <div class="tree">
          <div class="gen current">
            <div class="thumb"><img src="${spriteUrl(h.genes)}" alt="" /></div>
            <div class="info">
              <div class="n">${esc(h.name)} <small>${h.generation}대 · 현 가주</small></div>
              <div class="small muted"><span data-b="famAge"></span> · 최고 <span data-b="famStage"></span> 스테이지</div>
              <div class="chips">${traitChips(h.genes.traits)}</div>
            </div>
          </div>
          ${entries
            .map(
              (l) => `
            <div class="gen">
              <div class="thumb"><img src="${spriteUrl(l.genes)}" alt="" /></div>
              <div class="info">
                <div class="n">${esc(l.name)} <small>${l.generation}대 · ${l.retiredAge}세 은퇴</small></div>
                <div class="small muted">최고 ${l.maxStage} 스테이지 · 명성 +${fmt(l.fameEarned)}${l.spouse ? ` · 배우자 ${esc(l.spouse.name)}` : ''}</div>
                <div class="chips">${traitChips(l.genes.traits)}</div>
              </div>
            </div>`,
            )
            .join('')}
          ${entries.length === 0 ? '<p class="small muted">아직 은퇴한 가주가 없어요. 첫 가주의 이야기가 진행 중이에요.</p>' : ''}
        </div>
      </div>`;
  }

  // 상점 탭 ─────────────────────────
  private shopHtml(): string {
    const g = BALANCE.gems;
    return `
      <div class="card">
        <h3>${iconImg('ad')} 무료 보상 <small>보상형 광고</small></h3>
        <div class="shop-item">
          <div class="meta"><b>골드 2배 · ${BALANCE.ads.goldBoostMinutes}분</b><div class="small muted" data-b="boostInfo"></div></div>
          <button class="btn green" data-act="ad-boost">${iconImg('ad')} 광고 보기</button>
        </div>
        <div class="shop-item">
          <div class="meta"><b>보석 +${g.adReward}</b><div class="small muted">혼담·축복 의식에 사용</div></div>
          <button class="btn green" data-act="ad-gems">${iconImg('ad')} 광고 보기</button>
        </div>
      </div>
      <div class="card">
        <h3>${iconImg('gem')} 상품 <small>결제는 출시 버전에서 연결</small></h3>
        ${[
          ['스타터 팩', '보석 300 + 골드 부스트 2시간', '₩1,200', '첫 구매 한정'],
          ['명문가 월정액', '매일 보석 100 · 광고 없이 보상 · 혼담 하루 1회 무료', '₩5,500', '추천'],
          ['광고 제거', '광고 없이 모든 광고 보상 즉시 획득', '₩6,500', ''],
          ['보석 한 상자', '보석 1,200', '₩12,000', ''],
        ]
          .map(
            ([name, desc, price, tag]) => `
          <div class="shop-item">
            <div class="meta"><b>${name}</b>${tag ? `<span class="tag">${tag}</span>` : ''}<div class="small muted">${desc}</div></div>
            <button class="btn ghost" disabled><span class="price">${price}</span></button>
          </div>`,
          )
          .join('')}
      </div>
      <div class="card">
        <h3>확률 정보 공개</h3>
        <p class="small muted" style="margin:0 0 8px">특성 유전·돌연변이처럼 확률로 결정되는 모든 요소의 확률을 공개합니다. (게임산업법 확률형 아이템 정보 공개 대응)</p>
        <button class="btn ghost wide" data-act="odds">확률표 보기</button>
      </div>
      <div class="card">
        <h3>개발용</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn ghost" data-act="speed">배속 바꾸기</button>
          <button class="btn ghost" data-act="age">+10살</button>
          <button class="btn ghost" data-act="reset">처음부터</button>
        </div>
      </div>`;
  }

  private bindPanel(): void {
    // 길게 누르면 연속 구매
    this.panel.querySelectorAll<HTMLButtonElement>('[data-upg]').forEach((b) => {
      const kind = b.dataset.upg as UpgradeKind;
      let timer: number | undefined;
      let rep: number | undefined;
      const stop = () => {
        clearTimeout(timer);
        clearInterval(rep);
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.core.upgrade(kind)) return;
        this.refreshPanel();
        timer = window.setTimeout(() => {
          rep = window.setInterval(() => {
            if (!this.core.upgrade(kind)) stop();
            this.refreshPanel();
          }, 70);
        }, 380);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') this.core.upgrade(kind);
      });
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => this.action(b.dataset.act!)),
    );
  }

  private action(act: string): void {
    const core = this.core;
    switch (act) {
      case 'retire':
        if (canRetire(core.state)) core.beginRetirement();
        break;
      case 'ad-boost':
        this.showAd(() => {
          core.activateGoldBoost();
          this.toast('골드 2배 부스트 시작!');
        });
        break;
      case 'ad-gems':
        this.showAd(() => {
          core.addGems(BALANCE.gems.adReward);
          this.toast(`보석 +${BALANCE.gems.adReward}`);
        });
        break;
      case 'odds':
        this.openOdds();
        break;
      case 'speed': {
        const order = [1, 5, 20];
        core.timeScale = order[(order.indexOf(core.timeScale) + 1) % order.length];
        this.toast(`테스트 배속 x${core.timeScale}`);
        break;
      }
      case 'age':
        core.state.hero.age = Math.min(core.stats.lifespan, core.state.hero.age + 10);
        break;
      case 'reset':
        if (confirm('저장 데이터를 지우고 처음부터 시작할까요?')) {
          localStorage.clear();
          location.reload();
        }
        break;
    }
  }

  private refreshPanel(): void {
    const { state, stats } = this.core;
    if (this.tab === 'grow') {
      this.set('sAtk', fmt(stats.atk));
      this.set('sHp', fmt(stats.maxHp));
      this.set('sSpd', `${stats.atkPerSec.toFixed(2)}/초`);
      this.set('sCrit', fmtPct(stats.crit, 1));
      this.set('sGps', fmt(estimateGoldPerSec(state)));
      const ageText = `${stats.ageMul >= 1 ? '+' : ''}${fmtPct(stats.ageMul - 1)}`;
      this.set('sAge', ageText);
      const ageEl = $('[data-b="sAge"]', this.panel);
      if (ageEl) ageEl.style.color = stats.ageMul >= 1 ? 'var(--good)' : 'var(--bad)';
      for (const k of UPGRADE_KINDS) {
        const lv = state.upgrades[k];
        const max = BALANCE.upgrades[k].max;
        const maxed = lv >= max;
        const cost = upgradeCost(k, lv);
        this.set(`lv-${k}`, `Lv.${lv}`);
        const cur = upgradeMultiplier(k, lv);
        const next = upgradeMultiplier(k, lv + 1);
        const eff = $(`[data-b="eff-${k}"]`, this.panel);
        const html = maxed
          ? `${UPG_INFO[k].stat} x${cur.toFixed(2)} (최대)`
          : `${UPG_INFO[k].stat} x${cur.toFixed(2)} → <em>x${next.toFixed(2)}</em>${(lv + 1) % BALANCE.upgrades.milestoneEvery === 0 && k !== 'spd' ? ' <em>돌파!</em>' : ''}`;
        if (eff && eff.innerHTML !== html) eff.innerHTML = html;
        this.set(`cost-${k}`, maxed ? 'MAX' : fmt(cost));
        const btn = $<HTMLButtonElement>(`[data-upg="${k}"]`, this.panel);
        if (btn) btn.disabled = maxed || state.gold < cost;
      }
      const rb = $<HTMLButtonElement>('[data-act="retire"]', this.panel);
      if (rb) {
        const ok = canRetire(state);
        rb.disabled = !ok || this.core.retiring;
        this.set(
          'retireLabel',
          ok
            ? `은퇴하고 후계자 정하기 · 명성 +${fmt(previewFame(state))}`
            : `${BALANCE.time.retireMinAge}세부터 은퇴할 수 있어요 (지금 ${Math.floor(state.hero.age)}세)`,
        );
      }
    } else if (this.tab === 'family') {
      this.set('famAge', `${Math.floor(state.hero.age)}세`);
      this.set('famStage', String(state.hero.maxStage));
    } else if (this.tab === 'shop') {
      const left = state.boostUntil - Date.now();
      this.set('boostInfo', left > 0 ? `남은 시간 ${fmtDuration(left / 1000)} (광고 보면 30분 연장)` : '사냥으로 얻는 골드가 2배');
    }
  }

  // ───────────────────────── 모달 ─────────────────────────
  private queueModal(open: () => void): void {
    if (this.modalOpen) this.modalQueue.push(open);
    else open();
  }

  private openModal(html: string): { root: HTMLElement; close: () => void } {
    this.modalOpen = true;
    const back = el(`<div class="backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`);
    $('#modal-root').appendChild(back);
    const close = () => {
      back.remove();
      this.modalOpen = $('#modal-root').children.length > 0;
      if (!this.modalOpen) this.modalQueue.shift()?.();
    };
    return { root: back.querySelector('.modal') as HTMLElement, close };
  }

  private toast(msg: string): void {
    const t = el(`<div class="toast">${esc(msg)}</div>`);
    $('#toast-root').appendChild(t);
    setTimeout(() => t.remove(), 2100);
  }

  /** 테스트용 가짜 광고. 출시 버전에서는 AdMob 보상형 광고(@capacitor-community/admob)로 교체. */
  private showAd(onReward: () => void): void {
    const { root, close } = this.openModal(`
      <div class="ad-screen">
        <div class="small muted">테스트 광고 — 출시 버전에서는 실제 보상형 광고</div>
        <div class="count" data-c>3</div>
        <div class="small muted">광고가 끝나면 보상을 받아요</div>
      </div>`);
    let n = 3;
    const iv = setInterval(() => {
      n--;
      const c = root.querySelector('[data-c]');
      if (c) c.textContent = String(n);
      if (n <= 0) {
        clearInterval(iv);
        close();
        onReward();
      }
    }, 700);
  }

  private openOffline(): void {
    const off = this.core.offline;
    if (!off) return;
    const { root, close } = this.openModal(`
      <h2>다녀오셨어요!</h2>
      <p class="lead">${fmtDuration(off.seconds)} 동안 가주가 홀로 모험했어요</p>
      <div class="big-num">${iconImg('coin')} <b style="color:var(--gold)">+${fmt(off.gold)}</b></div>
      <p class="small muted" style="text-align:center">세월도 흘러 ${off.years.toFixed(1)}살 더 먹었어요${off.reachedLifespan ? ' — <b style="color:var(--fame)">은퇴할 때가 되었어요</b>' : ''}</p>
      <div class="actions">
        <button class="btn ghost" data-a="ok">받기</button>
        <button class="btn green" data-a="ad">${iconImg('ad')} 2배 받기</button>
      </div>`);
    root.querySelector('[data-a="ok"]')!.addEventListener('click', () => {
      this.core.claimOffline(1);
      close();
    });
    root.querySelector('[data-a="ad"]')!.addEventListener('click', () => {
      close();
      this.showAd(() => {
        this.core.claimOffline(BALANCE.ads.offlineMul);
        this.toast(`오프라인 보상 2배! +${fmt(off.gold)}`);
      });
    });
  }

  private openOdds(): void {
    const g = BALANCE.genetics;
    const rows = (Object.keys(MUTATION_RARITY_TABLE) as Rarity[])
      .map((r) => {
        const list = traitsOfRarity(r);
        const pr = MUTATION_RARITY_TABLE[r];
        return list
          .map(
            (t, i) => `<tr>${i === 0 ? `<td rowspan="${list.length}"><span class="chip ${r}">${RARITY_LABEL[r]} ${fmtPct(pr)}</span></td>` : ''}
            <td>${esc(t.name)}</td><td>${(pr / list.length * 100).toFixed(2)}%</td><td>${((g.mutationChance * pr) / list.length * 100).toFixed(3)}%</td></tr>`,
          )
          .join('');
      })
      .join('');
    const { root, close } = this.openModal(`
      <h2>확률 정보</h2>
      <p class="lead small">모든 확률은 실제 게임 로직(src/config/balance.ts)과 같은 값이에요.</p>
      <b>특성 유전</b>
      <table class="odds">
        <tr><th>상황</th><th>자녀에게 이어질 확률</th></tr>
        <tr><td>부모 중 한 명만 보유</td><td>${fmtPct(g.traitInheritChance)}</td></tr>
        <tr><td>부모 둘 다 보유</td><td>${fmtPct(1 - (1 - g.traitInheritChance) ** 2)}</td></tr>
        <tr><td>돌연변이(새 특성) 발생</td><td>${fmtPct(g.mutationChance)}</td></tr>
      </table>
      <p class="small muted">특성은 최대 ${g.maxTraits}개. 더 많이 물려받으면 무작위로 ${g.maxTraits}개가 남고, 돌연변이 특성은 반드시 남아요.</p>
      <b>돌연변이 특성 확률</b>
      <table class="odds">
        <tr><th>등급</th><th>특성</th><th>돌연변이 시</th><th>자녀 1명 기준</th></tr>
        ${rows}
      </table>
      <div class="actions"><button class="btn ghost" data-a="x">닫기</button></div>`);
    root.querySelector('[data-a="x"]')!.addEventListener('click', close);
  }

  // ───────────────────────── 은퇴 → 혼인 → 계승 ─────────────────────────
  private openRetirement(): void {
    const core = this.core;
    const forced = mustRetire(core.state);
    const h = core.state.hero;
    const fame = previewFame(core.state);
    const { root, close } = this.openModal('');
    const steps = (n: number) => `<div class="steps">${[0, 1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;

    const candCard = (c: Candidate, best: boolean) => `
      <button class="cand ${best ? 'best' : ''}" data-id="${c.id}">
        <div class="thumb"><img src="${spriteUrl(c.genes)}" alt="" /></div>
        <div class="info">
          <b>${esc(c.name)}</b> <span class="score">유전 점수 ${geneScore(c.genes)}${best ? ' · 추천' : ''}</span>
          <div class="chips">${traitChips(c.genes.traits, c.mutation)}</div>
          ${geneBars(c.genes)}
        </div>
      </button>`;
    const bestId = (list: Candidate[]) => list.reduce((a, b) => (geneScore(b.genes) > geneScore(a.genes) ? b : a)).id;

    const summary = () => {
      root.innerHTML = `
        ${steps(0)}
        <h2>${esc(h.name)}의 은퇴</h2>
        <p class="lead">${forced ? '수명이 다해 검을 내려놓을 때가 되었어요.' : '지금 은퇴하고 후계자를 정할까요?'}</p>
        <div class="parents"><img src="${spriteUrl(h.genes)}" alt="" /></div>
        <div class="stats" style="margin:0 0 8px">
          <div class="stat"><span>나이</span><b>${Math.floor(h.age)}세</b></div>
          <div class="stat"><span>최고 스테이지</span><b>${h.maxStage}</b></div>
          <div class="stat"><span>얻을 명성</span><b style="color:var(--fame)">+${fmt(fame)}</b></div>
          <div class="stat"><span>명성 보너스</span><b style="color:var(--good)">+${fmtPct(fameMultiplier(core.state.fame) - 1)} → +${fmtPct(fameMultiplier(core.state.fame + fame) - 1)}</b></div>
        </div>
        <p class="small muted">은퇴하면 골드·수련·스테이지는 초기화되고, 명성과 보석, 그리고 피(유전자)가 다음 세대로 이어져요.</p>
        <div class="actions">
          ${forced ? '' : '<button class="btn ghost" data-a="cancel">더 모험하기</button>'}
          <button class="btn" data-a="next">배우자 찾기</button>
        </div>`;
      root.querySelector('[data-a="cancel"]')?.addEventListener('click', () => {
        core.cancelRetirement();
        close();
      });
      root.querySelector('[data-a="next"]')!.addEventListener('click', () => spouses());
    };

    const spouses = () => {
      const list = core.spouseCandidates();
      const best = bestId(list);
      root.innerHTML = `
        ${steps(1)}
        <h2>혼담이 들어왔어요</h2>
        <p class="lead small">배우자의 특성과 능력치가 자녀에게 이어져요. 명성이 높을수록 좋은 혼처가 들어와요.</p>
        <div class="cands">${list.map((c) => candCard(c, c.id === best)).join('')}</div>
        <div class="actions">
          <button class="btn blue" data-a="reroll">${iconImg('gem')} ${BALANCE.gems.spouseReroll} 새 혼담 받기</button>
        </div>`;
      root.querySelectorAll<HTMLButtonElement>('.cand').forEach((b) =>
        b.addEventListener('click', () => children(list.find((c) => c.id === b.dataset.id)!)),
      );
      root.querySelector('[data-a="reroll"]')!.addEventListener('click', () => {
        if (core.rerollSpouses()) spouses();
        else this.toast('보석이 부족해요');
      });
    };

    const children = (spouse: Candidate) => {
      const list = core.childCandidates(spouse);
      const best = bestId(list);
      root.innerHTML = `
        ${steps(2)}
        <h2>후계자를 고르세요</h2>
        <div class="parents">
          <img src="${spriteUrl(h.genes)}" alt="" /><span class="heart">♥</span><img src="${spriteUrl(spouse.genes)}" alt="" style="transform:scaleX(-1)" />
        </div>
        <p class="lead small">${esc(h.name)}와 ${esc(spouse.name)} 사이에서 태어난 아이들이에요.</p>
        <div class="cands">${list.map((c) => candCard(c, c.id === best)).join('')}</div>
        <div class="actions">
          <button class="btn ghost" data-a="back">배우자 다시 고르기</button>
          <button class="btn blue" data-a="reroll">${iconImg('gem')} ${BALANCE.gems.childReroll} 축복 의식</button>
        </div>`;
      root.querySelectorAll<HTMLButtonElement>('.cand').forEach((b) =>
        b.addEventListener('click', () => crown(spouse, list.find((c) => c.id === b.dataset.id)!)),
      );
      root.querySelector('[data-a="back"]')!.addEventListener('click', () => spouses());
      root.querySelector('[data-a="reroll"]')!.addEventListener('click', () => {
        if (core.rerollChildren(spouse)) children(spouse);
        else this.toast('보석이 부족해요');
      });
    };

    const crown = (spouse: Candidate, child: Candidate) => {
      const gained = core.completeRetirement(spouse, child);
      const s = core.state;
      root.innerHTML = `
        ${steps(3)}
        <h2>${s.hero.generation}대 가주 즉위</h2>
        <div class="parents"><img src="${spriteUrl(s.hero.genes)}" alt="" style="height:80px" /></div>
        <p class="lead"><b>${esc(s.hero.name)}</b>이(가) ${esc(s.houseName)} 가문을 이어받았어요</p>
        <div class="chips" style="justify-content:center">${traitChips(s.hero.genes.traits, child.mutation)}</div>
        <div class="big-num">${iconImg('fame')} <b style="color:var(--fame)">명성 +${fmt(gained)}</b></div>
        <p class="small muted" style="text-align:center">모든 능력·골드 +${fmtPct(fameMultiplier(s.fame) - 1)}</p>
        <div class="actions"><button class="btn green" data-a="go">모험 시작</button></div>`;
      root.querySelector('[data-a="go"]')!.addEventListener('click', () => {
        close();
        this.renderPanel();
      });
    };

    summary();
  }
}
