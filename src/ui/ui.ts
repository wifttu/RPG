import { heroPortraitUrl } from '../art/heroSheet';
import { iconImg } from '../art/icons';
import { HAIR } from '../art/palette';
import { BALANCE, UPGRADE_KINDS, type UpgradeKind } from '../config/balance';
import { houseBest, isBossStage, isMarchStage, monstersInStage, upgradeCost, estimateGoldPerSec } from '../core/economy';
import type { Game } from '../core/game';
import { geneScore, type Genes } from '../core/genetics';
import { canRetire, mustRetire, previewFame, type Candidate } from '../core/lineage';
import { computeStats, fameMultiplier, lifeStage } from '../core/stats';
import { MUTATION_RARITY_TABLE, RARITY_LABEL, getTrait, traitsOfRarity, type Rarity } from '../core/traits';
import { fmt, fmtDuration, fmtMul, fmtPct, josa } from './format';
import { audio } from '../audio/audio';
import { Tutorial } from './tutorial';
import { track, eventCounts } from '../core/analytics';
import { clock } from '../core/clock';
import { adFree, rewardText, type Mission, type Reward } from '../core/daily';
import { HEIRLOOMS, heirloomCost, heirloomTitle } from '../core/heirloom';
import { PRODUCTS, canBuy, formatKrw } from '../core/products';
import { importSaveCode } from '../core/save';
import { createNewGame } from '../core/state';
import { nativeAds } from '../platform/ads';
import type { HeirloomKind } from '../core/state';
import { questBadge, questHtml, refreshQuest } from './questPanel';
import { bindGear, gearHtml, refreshGear } from './gearPanel';
import { itemIconUrl } from '../art/itemIcons';
import { GACHA_RARITY, GACHA_SLOT, PITY, RARITIES, heroClass, type Slot } from '../core/gear';
import { TALENT_LABEL } from '../core/genetics';

type Tab = 'grow' | 'gear' | 'family' | 'quest' | 'shop';

/** 출시 빌드(npm run build:release)에서는 개발용 버튼을 숨긴다 */
const RELEASE = import.meta.env.VITE_RELEASE === 'true';

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

function talentChip(g: Genes): string {
  return `<span class="chip talent">재능 · ${TALENT_LABEL[g.talent ?? 'sword']}</span>`;
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
  private tutorial: Tutorial | null = null;
  private gearFilter: Slot = 'weapon';

  constructor(private core: Game) {}

  mount(): void {
    this.renderHud();
    this.renderTabs();
    this.renderPanel();
    this.core.on('retirementDue', () => this.queueModal(() => this.openRetirement()));
    this.core.on('battle', (evs) => {
      for (const e of evs) {
        if (e.type === 'kill') this.pulse('.cur.gold');
        if (e.type === 'wall') {
          this.toast(`${e.stage}스테이지에서 막혔어요. 머물면서 골드를 모아요 — 수련·가보로 강해지면 자동으로 다시 도전해요`, 3600);
          track('wall', { stage: e.stage, gen: this.core.state.hero.generation });
        }
        if (e.type === 'retry') this.toast(`강해졌어요! ${e.stage}스테이지에 다시 도전해요`);
      }
    });
    this.core.on('newGeneration', () => this.renderPanel());
    this.bindSound();
    $('[data-stay]').addEventListener('click', (e) => {
      e.stopPropagation();
      audio.play('click');
      this.core.setStay(false);
      this.toast(`${this.core.sim.wallStage}스테이지에 다시 도전해요`);
    });
    this.tutorial = new Tutorial(this.core, {
      modalOpen: () => this.modalOpen,
      showTab: (t) => this.setTab(t),
      currentTab: () => this.tab,
    });
    setInterval(() => this.refresh(), 200);
    if (this.core.offline) this.queueModal(() => this.openOffline());
    this.refresh();
  }

  /** 첫 터치에 소리를 켜고(모바일 정책), 소리 버튼으로 켜고 끈다 */
  private bindSound(): void {
    const btn = $<HTMLButtonElement>('[data-sound]');
    const paint = () => {
      btn.textContent = audio.enabled ? '♪ 소리 켬' : '♪ 소리 끔';
      btn.classList.toggle('off', !audio.enabled);
    };
    paint();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.setEnabled(!audio.enabled);
      paint();
      if (audio.enabled) audio.play('click');
    });
    window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? audio.pause() : audio.unlock()));
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
        <div class="status-chips">
          <button class="stay-chip" data-stay hidden></button>
          <div class="injury-chip" data-b="injury" hidden>부상 · 공격력 -25%</div>
        </div>
      </div>
      <div style="display:grid;gap:4px;justify-items:end">
        <div class="boost-chip" data-b="boost" hidden></div>
        <div class="boost-chip" data-b="speed" hidden></div>
        <button class="sound-chip" data-sound aria-label="소리 켜기/끄기"></button>
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
    this.set('heroLine', `가주 ${hero.name} · ${heroClass(state).name} · ${lifeStage(hero.age, stats.lifespan)}`);
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
    const best = houseBest(state);
    const stageHtml = boss
      ? `<span class="boss">BOSS</span> 스테이지 ${state.stage}`
      : isMarchStage(state.stage, best)
        ? `스테이지 ${state.stage} <span class="march">빠른 진군</span>`
        : `스테이지 ${state.stage}`;
    const chip = $('[data-b="stage"]');
    if (chip.innerHTML !== stageHtml) chip.innerHTML = stageHtml;
    const pips = $('[data-b="pips"]');
    const total = monstersInStage(state.stage, best);
    const html = boss ? '' : Array.from({ length: total }, (_, i) => `<i class="${i < this.core.sim.killsInStage ? 'on' : ''}"></i>`).join('');
    if (pips.innerHTML !== html) pips.innerHTML = html;
    const bt = $('[data-b="bossTimer"]');
    bt.hidden = !(boss && this.core.sim.monster);
    if (!bt.hidden) (bt.firstElementChild as HTMLElement).style.width = `${(this.core.sim.bossTimeLeft / BALANCE.monster.bossTimeLimit) * 100}%`;
    const boostLeft = state.boostUntil - now;
    const boostEl = $('[data-b="boost"]');
    boostEl.hidden = boostLeft <= 0;
    if (boostLeft > 0) boostEl.textContent = `골드 x2 · ${fmtDuration(boostLeft / 1000)}`;
    // 머물기 / 부상
    const stay = $<HTMLButtonElement>('[data-stay]');
    stay.hidden = !state.stayMode || boss;
    if (state.stayMode) {
      const t = `머무는 중 · ${this.core.sim.wallStage}스테이지 도전 ▶`;
      if (stay.textContent !== t) stay.textContent = t;
    }
    $('[data-b="injury"]').hidden = !this.core.sim.injured;
    // 임무 탭 알림 점
    const dot = $('#tabs [data-tab="quest"] .dot');
    if (dot) dot.hidden = !questBadge(state);
    const sp = $('[data-b="speed"]');
    sp.hidden = this.core.timeScale === 1;
    sp.textContent = `테스트 배속 x${this.core.timeScale}`;

    if (hero.generation !== this.lastGen) {
      this.lastGen = hero.generation;
      this.renderPanel();
    }
    this.refreshPanel();
    this.tutorial?.update();
  }

  // ───────────────────────── 탭 ─────────────────────────
  private renderTabs(): void {
    const tabs: [Tab, string, string][] = [
      ['grow', '성장', iconImg('atk', '')],
      ['gear', '장비', `<img src="${itemIconUrl('helmet')}" alt="" />`],
      ['family', '가문', iconImg('crown', '')],
      ['quest', '임무', iconImg('fame', '')],
      ['shop', '상점', iconImg('gem', '')],
    ];
    const nav = $('#tabs');
    nav.innerHTML = tabs
      .map(
        ([id, label, icon]) =>
          `<button data-tab="${id}" class="${id === this.tab ? 'on' : ''}">${icon}<span>${label}</span>${id === 'quest' ? '<i class="dot" hidden></i>' : ''}</button>`,
      )
      .join('');
    nav.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        audio.play('click');
        this.setTab(b.dataset.tab as Tab);
      }),
    );
  }

  setTab(tab: Tab): void {
    if (tab !== this.tab) track('tab', { tab });
    this.tab = tab;
    $('#tabs')
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    this.renderPanel();
    this.panel.scrollTop = 0;
  }

  private renderPanel(): void {
    if (this.tab === 'grow') this.panel.innerHTML = this.growHtml();
    else if (this.tab === 'family') this.panel.innerHTML = this.familyHtml();
    else if (this.tab === 'quest') this.panel.innerHTML = questHtml(this.core);
    else if (this.tab === 'gear') this.panel.innerHTML = gearHtml(this.core, this.gearFilter);
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
        <h3>${iconImg('atk')} 가보 <small>유산석 <b data-b="legacy" style="color:var(--gem)"></b> · 보스가 떨어뜨려요</small></h3>
        <p class="small muted" style="margin:0 0 4px">은퇴해도 사라지지 않고 대대로 물려줘요.</p>
        ${HEIRLOOMS.map(
          (h) => `
          <div class="upg">
            <div class="ico-box">${iconImg(h.kind === 'sword' ? 'atk' : h.kind === 'shield' ? 'hp' : 'coin')}</div>
            <div class="meta">
              <b data-b="hl-name-${h.kind}"></b><span class="lv" data-b="hl-lv-${h.kind}"></span>
              <div class="eff" data-b="hl-eff-${h.kind}"></div>
            </div>
            <button class="btn blue" data-hl="${h.kind}">유산석 <span data-b="hl-cost-${h.kind}"></span></button>
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
        <p class="small retire-hint" data-b="retireHint"></p>
      </div>
      <div class="card">
        <div class="hero-card">
          <div class="portrait"><img src="${spriteUrl(h.genes)}" alt="" /></div>
          <div class="hero-info">
            <div class="name">${esc(h.name)} <span class="muted small">${h.generation}대 가주 · ${esc(HAIR[h.genes.hairColor].name)}</span></div>
            <div class="chips">${talentChip(h.genes)}${traitChips(h.genes.traits)}</div>
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
          <div class="stat"><span>명성 배율</span><b style="color:var(--good)">${fmtMul(fameMultiplier(s.fame))}</b></div>
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
        <h3>${iconImg('gem')} 상품 <small>지금은 결제 테스트 (실제 결제 없음)</small></h3>
        ${PRODUCTS.map(
          (p) => `
          <div class="shop-item">
            <div class="meta"><b>${p.name}</b>${p.tag ? `<span class="tag">${p.tag}</span>` : ''}<div class="small muted">${p.desc}</div></div>
            <button class="btn ${canBuy(this.core.state, p.id) ? 'gold' : 'ghost'}" data-buy="${p.id}" ${canBuy(this.core.state, p.id) ? '' : 'disabled'}><span>${canBuy(this.core.state, p.id) ? formatKrw(p.priceKrw) : '구매함'}</span></button>
          </div>`,
        ).join('')}
      </div>
      <div class="card">
        <h3>확률 정보 공개</h3>
        <p class="small muted" style="margin:0 0 8px">특성 유전·돌연변이처럼 확률로 결정되는 모든 요소의 확률을 공개합니다. (게임산업법 확률형 아이템 정보 공개 대응)</p>
        <button class="btn ghost wide" data-act="odds">확률표 보기</button>
      </div>
      <div class="card">
        <h3>기기 이전</h3>
        <p class="small muted" style="margin:0 0 8px">휴대폰을 바꿀 때: 지금 기기에서 코드를 복사해서, 새 기기에서 붙여넣으세요.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn ghost" data-act="export">이전 코드 만들기</button>
          <button class="btn ghost" data-act="import">코드로 불러오기</button>
        </div>
      </div>
      ${RELEASE ? '' : `<div class="card">
        <h3>개발용</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn ghost" data-act="speed">배속 바꾸기</button>
          <button class="btn ghost" data-act="age">+10살</button>
          <button class="btn ghost" data-act="events">플레이 기록</button>
          <button class="btn ghost" data-act="reset">처음부터</button>
        </div>
      </div>`}`;
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
        audio.play('upgrade', Math.min(1, (this.core.state.upgrades[kind] % 25) / 25));
        this.refreshPanel();
        timer = window.setTimeout(() => {
          rep = window.setInterval(() => {
            if (!this.core.upgrade(kind)) stop();
            else audio.play('upgrade', Math.min(1, (this.core.state.upgrades[kind] % 25) / 25));
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
    this.panel.querySelectorAll<HTMLButtonElement>('[data-hl]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.core.heirloom(b.dataset.hl as HeirloomKind)) {
          audio.play('upgrade', 0.8);
          this.refreshPanel();
        }
      }),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-claim]').forEach((b) =>
      b.addEventListener('click', () => this.claim(b.dataset.claim!)),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) =>
      b.addEventListener('click', () => this.openPurchase(b.dataset.buy!)),
    );
    if (this.tab === 'gear') {
      const keep = this.panel.scrollTop;
      bindGear(
        this.panel,
        {
          core: this.core,
          openModal: (h) => this.openModal(h),
          toast: (m, ms) => this.toast(m, ms),
          showAd: (p, cb) => this.showAd(p, cb),
          openOdds: () => this.openOdds(),
          rerender: () => {
            const y = this.panel.scrollTop;
            this.renderPanel();
            this.panel.scrollTop = y;
          },
        },
        (slot) => {
          this.gearFilter = slot;
          const y = this.panel.scrollTop;
          this.renderPanel();
          this.panel.scrollTop = y;
        },
      );
      this.panel.scrollTop = keep;
    }
  }

  private claim(what: string): void {
    const core = this.core;
    let r: Reward | null = null;
    if (what === 'attend') r = core.claimAttendance();
    else if (what === 'monthly') r = core.claimMonthly() ? { gems: 100 } : null;
    else if (what.startsWith('m:')) r = core.claimMission(what.slice(2) as Mission['id'] | 'all');
    else if (what.startsWith('ach:')) r = core.claimAchievement(what.slice(4));
    if (r) {
      audio.play('reward');
      this.toast(`${rewardText(r)} 받았어요!`);
      this.renderPanel();
    }
  }

  private action(act: string): void {
    const core = this.core;
    switch (act) {
      case 'retire':
        if (canRetire(core.state)) core.beginRetirement();
        break;
      case 'ad-boost':
        this.showAd('gold_boost', () => {
          core.activateGoldBoost();
          this.toast('골드 2배 부스트 시작!');
        });
        break;
      case 'ad-gems':
        this.showAd('gems', () => {
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
        this.openReset();
        break;
      case 'export':
        this.openExport();
        break;
      case 'import':
        this.openImport();
        break;
      case 'events':
        this.openEvents();
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
        // 배율 대신 실제 능력치 숫자로 보여 준다 (예: 공격력 980 → 1,034)
        const nextStats = computeStats({ ...state, upgrades: { ...state.upgrades, [k]: lv + 1 } });
        const show = (st: typeof stats) => (k === 'atk' ? fmt(st.atk) : k === 'hp' ? fmt(st.maxHp) : `${st.atkPerSec.toFixed(2)}/초`);
        const eff = $(`[data-b="eff-${k}"]`, this.panel);
        const html = maxed
          ? `${UPG_INFO[k].stat} ${show(stats)} (최대)`
          : `${UPG_INFO[k].stat} ${show(stats)} → <em>${show(nextStats)}</em>${(lv + 1) % BALANCE.upgrades.milestoneEvery === 0 && k !== 'spd' ? ' <em>돌파!</em>' : ''}`;
        if (eff && eff.innerHTML !== html) eff.innerHTML = html;
        this.set(`cost-${k}`, maxed ? 'MAX' : fmt(cost));
        const btn = $<HTMLButtonElement>(`[data-upg="${k}"]`, this.panel);
        if (btn) btn.disabled = maxed || state.gold < cost;
      }
      this.set('legacy', fmt(state.legacy));
      for (const h of HEIRLOOMS) {
        const lv = state.heirlooms[h.kind];
        const cost = heirloomCost(lv);
        this.set(`hl-name-${h.kind}`, heirloomTitle(h.kind, lv));
        this.set(`hl-lv-${h.kind}`, `Lv.${lv}`);
        const eff = $(`[data-b="hl-eff-${h.kind}"]`, this.panel);
        const nextState = { ...state, heirlooms: { ...state.heirlooms, [h.kind]: lv + 1 } };
        const nextStats = computeStats(nextState);
        const [label, cur, next] =
          h.kind === 'sword'
            ? ['공격력', fmt(stats.atk), fmt(nextStats.atk)]
            : h.kind === 'shield'
              ? ['체력', fmt(stats.maxHp), fmt(nextStats.maxHp)]
              : ['초당 골드', fmt(estimateGoldPerSec(state)), fmt(estimateGoldPerSec(nextState))];
        const html = `${label} ${cur} → <em>${next}</em>${(lv + 1) % 10 === 0 ? ' <em>돌파!</em>' : ''}`;
        if (eff && eff.innerHTML !== html) eff.innerHTML = html;
        this.set(`hl-cost-${h.kind}`, fmt(cost));
        const btn = $<HTMLButtonElement>(`[data-hl="${h.kind}"]`, this.panel);
        if (btn) btn.disabled = state.legacy < cost;
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
        const hint = this.retireAdvice();
        this.set('retireHint', hint?.text ?? '');
        const hintEl = $('[data-b="retireHint"]', this.panel);
        if (hintEl) hintEl.className = `small retire-hint ${hint?.level ?? ''}`;
      }
    } else if (this.tab === 'family') {
      this.set('famAge', `${Math.floor(state.hero.age)}세`);
      this.set('famStage', String(state.hero.maxStage));
    } else if (this.tab === 'quest') {
      refreshQuest(this.panel, this.core);
    } else if (this.tab === 'gear') {
      refreshGear(this.panel, this.core);
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

  private toast(msg: string, ms = 2100): void {
    const t = el(`<div class="toast" style="animation-delay:0s,${(ms - 400) / 1000}s">${esc(msg)}</div>`);
    $('#toast-root').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  /**
   * 보상형 광고. 광고 제거·월정액이면 바로 보상.
   * 앱(안드로이드)에서는 AdMob 보상형 광고, 웹에서는 3초짜리 테스트 화면.
   */
  private showAd(placement: string, onReward: () => void): void {
    const reward = () => {
      this.core.state.progress.adsWatched++;
      track('ad_reward', { placement });
      audio.play('reward');
      onReward();
    };
    if (adFree(this.core.state, clock.now())) {
      reward();
      return;
    }
    if (nativeAds()) {
      void nativeAds()!
        .showRewarded(placement)
        .then((ok) => (ok ? reward() : this.toast('광고를 끝까지 보면 보상을 받아요')));
      return;
    }
    // 실제 앱에서는 AdMob 이 광고 길이(보통 15~30초)를 정한다. 웹 테스트는 15초로 비슷하게 흉내.
    const AD_SEC = 15;
    const { root, close } = this.openModal(`
      <div class="ad-screen">
        <div class="small muted">테스트 광고 — 앱에서는 실제 보상형 광고 (보통 15~30초)</div>
        <div class="count" data-c>${AD_SEC}</div>
        <div class="small muted">광고를 끝까지 보면 보상을 받아요</div>
        ${RELEASE ? '' : '<button class="btn ghost" data-a="skip" style="margin-top:12px">개발용: 건너뛰기</button>'}
      </div>`);
    let n = AD_SEC;
    const finish = () => {
      clearInterval(iv);
      close();
      reward();
    };
    const iv = setInterval(() => {
      n--;
      const c = root.querySelector('[data-c]');
      if (c) c.textContent = String(n);
      if (n <= 0) finish();
    }, 1000);
    root.querySelector('[data-a="skip"]')?.addEventListener('click', finish);
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
      this.showAd('offline_x2', () => {
        this.core.claimOffline(BALANCE.ads.offlineMul);
        this.toast(`오프라인 보상 2배! +${fmt(off.gold)}`);
      });
    });
  }

  /** 은퇴 시점 조언: 명성이 거의 안 쌓이면 경고 */
  private retireAdvice(): { level: 'bad' | 'warn' | 'good'; text: string } | null {
    const s = this.core.state;
    if (!canRetire(s)) return null;
    const fame = previewFame(s);
    const off = BALANCE.fame.offset;
    if (fame <= 0)
      return { level: 'bad', text: `⚠ 지금 은퇴하면 명성 +0 — 다음 가주가 강해지지 않아요. ${off + 1}스테이지 이상 가야 명성을 얻어요.` };
    const before = fameMultiplier(s.fame);
    const after = fameMultiplier(s.fame + fame);
    if (after / before < 1.3)
      return {
        level: 'warn',
        text: `명성 배율이 ${fmtMul(before)} → ${fmtMul(after)}로 조금만 올라요. 최고 기록을 더 올리면 명성이 크게 늘어요.`,
      };
    return { level: 'good', text: `은퇴하면 다음 가주가 ${fmtMul(after / before)} 강해져요.` };
  }

  private openPurchase(id: string): void {
    const p = PRODUCTS.find((x) => x.id === id);
    if (!p || !canBuy(this.core.state, id)) return;
    track('iap_click', { id });
    const { root, close } = this.openModal(`
      <h2>${p.name}</h2>
      <p class="lead">${p.desc}</p>
      <div class="big-num">${formatKrw(p.priceKrw)}</div>
      <p class="retire-warn warn">결제 테스트예요. 실제로 돈이 나가지 않아요. 출시 버전에서는 Google Play 결제창이 떠요.</p>
      <div class="actions">
        <button class="btn ghost" data-a="x">취소</button>
        <button class="btn gold" data-a="buy">테스트 구매</button>
      </div>`);
    root.querySelector('[data-a="x"]')!.addEventListener('click', close);
    root.querySelector('[data-a="buy"]')!.addEventListener('click', () => {
      close();
      if (this.core.purchase(id)) {
        audio.play('reward');
        this.toast(`${p.name} 구매 완료 (테스트)`);
        this.renderPanel();
      }
    });
  }

  private openExport(): void {
    const code = this.core.exportCode();
    const { root, close } = this.openModal(`
      <h2>기기 이전 코드</h2>
      <p class="lead small">이 코드를 복사해서 새 기기의 상점 → 기기 이전 → 코드로 불러오기에 붙여넣으세요. 다른 사람에게 알려 주지 마세요.</p>
      <textarea class="code" id="export-code" readonly rows="5">${code}</textarea>
      <div class="actions">
        <button class="btn ghost" data-a="x">닫기</button>
        <button class="btn gold" data-a="copy">복사하기</button>
      </div>`);
    const ta = root.querySelector<HTMLTextAreaElement>('textarea')!;
    root.querySelector('[data-a="x"]')!.addEventListener('click', close);
    root.querySelector('[data-a="copy"]')!.addEventListener('click', () => {
      navigator.clipboard
        ?.writeText(code)
        .then(() => this.toast('복사했어요'))
        .catch(() => {
          ta.select();
          this.toast('코드를 길게 눌러 복사해 주세요');
        }) ?? (ta.select(), this.toast('코드를 길게 눌러 복사해 주세요'));
    });
  }

  private openImport(): void {
    const { root, close } = this.openModal(`
      <h2>코드로 불러오기</h2>
      <p class="lead small">다른 기기에서 만든 이전 코드를 붙여넣으세요. <b>지금 기기의 진행 상황은 덮어써져요.</b></p>
      <textarea class="code" id="import-code" rows="5" placeholder="HEIRS1. 으로 시작하는 코드"></textarea>
      <p class="retire-warn bad" data-err hidden></p>
      <div class="actions">
        <button class="btn ghost" data-a="x">취소</button>
        <button class="btn gold" data-a="load">불러오기</button>
      </div>`);
    const ta = root.querySelector<HTMLTextAreaElement>('textarea')!;
    const err = root.querySelector<HTMLElement>('[data-err]')!;
    root.querySelector('[data-a="x"]')!.addEventListener('click', close);
    root.querySelector('[data-a="load"]')!.addEventListener('click', () => {
      const r = importSaveCode(ta.value);
      if (!r.ok) {
        err.textContent = r.error;
        err.hidden = false;
        return;
      }
      close();
      this.core.replaceState(r.state);
      this.lastGen = -1;
      this.renderPanel();
      this.toast(`${r.state.houseName} 가문 ${r.state.hero.generation}대를 불러왔어요`);
    });
  }

  private openReset(): void {
    const { root, close } = this.openModal(`
      <h2>처음부터 시작</h2>
      <p class="lead">저장 데이터를 모두 지우고 1대부터 새로 시작할까요? 되돌릴 수 없어요.</p>
      <div class="actions">
        <button class="btn ghost" data-a="x">취소</button>
        <button class="btn" data-a="ok">지우고 새로 시작</button>
      </div>`);
    root.querySelector('[data-a="x"]')!.addEventListener('click', close);
    root.querySelector('[data-a="ok"]')!.addEventListener('click', () => {
      try {
        localStorage.removeItem('heirs.save.v1');
      } catch {
        /* noop */
      }
      close();
      this.core.replaceState(createNewGame());
      this.lastGen = -1;
      this.renderPanel();
    });
  }

  private openEvents(): void {
    const rows = eventCounts()
      .map(([n, c]) => `<tr><td>${esc(n)}</td><td>${c}</td></tr>`)
      .join('');
    const { root, close } = this.openModal(`
      <h2>플레이 기록</h2>
      <p class="lead small">기기 안에만 저장된 행동 기록이에요 (최근 400개). 출시하면 분석 서비스로 보내서 어디서 그만두는지 확인해요.</p>
      <table class="odds"><tr><th>이벤트</th><th>횟수</th></tr>${rows || '<tr><td colspan="2">아직 없어요</td></tr>'}</table>
      <div class="actions"><button class="btn ghost" data-a="x">닫기</button></div>`);
    root.querySelector('[data-a="x"]')!.addEventListener('click', close);
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
      <b>장비 뽑기 (1회 기준)</b>
      <table class="odds">
        <tr><th>등급</th><th>확률</th></tr>
        ${RARITIES.map((r) => `<tr><td style="color:${r.color}">${r.name} ★</td><td>${fmtPct(GACHA_RARITY[r.id], 1)}</td></tr>`).join('')}
      </table>
      <table class="odds">
        <tr><th>부위</th><th>확률</th></tr>
        <tr><td>무기 (검·활·지팡이 각 1/3)</td><td>${fmtPct(GACHA_SLOT.weapon, 1)} (각 ${fmtPct(GACHA_SLOT.weapon / 3, 2)})</td></tr>
        <tr><td>투구 / 갑옷 / 목걸이 / 반지</td><td>각 ${fmtPct(GACHA_SLOT.helmet, 1)}</td></tr>
      </table>
      <p class="small muted">뽑기로 나오는 장비는 모두 ★1. 영웅 이상이 ${PITY}번 연속으로 안 나오면 ${PITY}번째는 영웅 확정. 희귀도와 부위는 서로 독립이에요. 예) 전설 활 = ${fmtPct(GACHA_RARITY.legend, 1)} × ${fmtPct(GACHA_SLOT.weapon / 3, 2)} = ${((GACHA_RARITY.legend * GACHA_SLOT.weapon) / 3 * 100).toFixed(3)}%</p>
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
      <button class="cand ${best ? 'best' : ''}" data-id="${c.id}" aria-pressed="false">
        <div class="thumb"><img src="${spriteUrl(c.genes)}" alt="" /></div>
        <div class="info">
          <b>${esc(c.name)}</b> <span class="score">유전 점수 ${geneScore(c.genes)}</span>${best ? ' <span class="rec">추천</span>' : ''}
          <div class="chips">${talentChip(c.genes)}${traitChips(c.genes.traits, c.mutation)}</div>
          ${geneBars(c.genes)}
        </div>
      </button>`;
    const bestId = (list: Candidate[]) => list.reduce((a, b) => (geneScore(b.genes) > geneScore(a.genes) ? b : a)).id;

    /**
     * 카드를 누르면 '선택'만 되고, 아래 결정 버튼을 눌러야 확정된다.
     * 화면이 바뀐 직후 0.4초 동안은 누름을 무시한다 (앞 화면 버튼을 누른 손가락이 새 카드를 누르는 것 방지).
     */
    const pickable = (list: Candidate[], confirmSel: string, label: (c: Candidate) => string, onConfirm: (c: Candidate) => void) => {
      const shownAt = performance.now();
      let picked: Candidate | null = null;
      const confirm = root.querySelector<HTMLButtonElement>(confirmSel)!;
      confirm.disabled = true;
      root.querySelectorAll<HTMLButtonElement>('.cand').forEach((b) =>
        b.addEventListener('click', () => {
          if (performance.now() - shownAt < 400) return;
          audio.play('click');
          picked = list.find((c) => c.id === b.dataset.id)!;
          root.querySelectorAll<HTMLButtonElement>('.cand').forEach((x) => {
            x.classList.toggle('sel', x === b);
            x.setAttribute('aria-pressed', String(x === b));
          });
          confirm.disabled = false;
          confirm.textContent = label(picked);
        }),
      );
      confirm.addEventListener('click', () => {
        if (picked && performance.now() - shownAt >= 400) onConfirm(picked);
      });
    };

    audio.play('retire');
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
          <div class="stat"><span>명성 배율</span><b style="color:var(--good)">${fmtMul(fameMultiplier(core.state.fame))} → ${fmtMul(fameMultiplier(core.state.fame + fame))}</b></div>
        </div>
        ${(() => {
          const a = this.retireAdvice();
          return a && !forced ? `<p class="retire-warn ${a.level}">${a.text}</p>` : '';
        })()}
        <p class="small muted">은퇴하면 골드·수련·스테이지는 초기화되고, 명성·보석·가보·유산석, 그리고 피(유전자)가 다음 세대로 이어져요.</p>
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
        <p class="small muted pick-hint">카드를 눌러 고른 뒤, 아래 버튼으로 결정하세요. <span class="rec">추천</span> = 유전 점수가 가장 높은 후보</p>
        <div class="cands">${list.map((c) => candCard(c, c.id === best)).join('')}</div>
        <div class="actions">
          <button class="btn blue" data-a="reroll">${iconImg('gem')} ${BALANCE.gems.spouseReroll} 새 혼담</button>
          <button class="btn" data-a="pick">배우자를 고르세요</button>
        </div>`;
      pickable(list, '[data-a="pick"]', (c) => `${josa(c.name, '과', '와')} 혼인`, (c) => children(c));
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
        <p class="lead small">${esc(josa(h.name, '과', '와'))} ${esc(spouse.name)} 사이에서 태어난 아이들이에요.</p>
        <p class="small muted pick-hint">카드를 눌러 고른 뒤, 아래 버튼으로 결정하세요.</p>
        <div class="cands">${list.map((c) => candCard(c, c.id === best)).join('')}</div>
        <div class="actions">
          <button class="btn ghost" data-a="back">배우자 다시</button>
          <button class="btn blue" data-a="reroll">${iconImg('gem')} ${BALANCE.gems.childReroll} 축복</button>
        </div>
        <button class="btn wide" data-a="pick" style="margin-top:8px">후계자를 고르세요</button>`;
      pickable(list, '[data-a="pick"]', (c) => `${josa(c.name, '을', '를')} 다음 가주로`, (c) => crown(spouse, c));
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
        <p class="lead"><b>${esc(josa(s.hero.name, '이', '가'))}</b> ${esc(s.houseName)} 가문을 이어받았어요</p>
        <div class="chips" style="justify-content:center">${traitChips(s.hero.genes.traits, child.mutation)}</div>
        <div class="big-num">${iconImg('fame')} <b style="color:var(--fame)">명성 +${fmt(gained)}</b></div>
        <p class="small muted" style="text-align:center">공격력·체력·골드 ${fmtMul(fameMultiplier(s.fame))}</p>
        <div class="actions"><button class="btn green" data-a="go">모험 시작</button></div>`;
      root.querySelector('[data-a="go"]')!.addEventListener('click', () => {
        close();
        this.renderPanel();
      });
    };

    summary();
  }
}
