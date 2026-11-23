import { BALANCE } from '../config/balance';
import { upgradeCost } from '../core/economy';
import type { Game } from '../core/game';
import { canRetire } from '../core/lineage';
import { audio } from '../audio/audio';
import { josa } from './format';
import { track } from '../core/analytics';

export type TutorialTab = 'grow' | 'gear' | 'family' | 'quest' | 'shop';

interface Step {
  id: string;
  /** 이 조건이 참이 되면 말풍선을 띄운다 */
  when: (g: Game) => boolean;
  /** 밝게 비출 화면 요소 (없으면 가운데 카드) */
  target?: string;
  /** 띄울 때 이 탭으로 이동 */
  tab?: TutorialTab;
  title: string;
  text: (g: Game) => string;
  /** 버튼 글자 (없으면 행동을 해야 넘어감) */
  button?: string;
  /** 이 조건이 참이 되면 자동으로 완료 */
  doneWhen?: (g: Game, tab: TutorialTab) => boolean;
}

const STEPS: Step[] = [
  {
    id: 'intro',
    when: () => true,
    title: '가문의 이야기가 시작돼요',
    text: (g) =>
      `${g.state.houseName} 가문의 1대 가주 <b>${josa(g.state.hero.name, '이', '가')}</b> 가문의 검을 들고 첫 모험을 떠나요.<br><br>` +
      '가주는 <b>자동으로 싸우고</b>, 앱을 꺼 둬도 모험은 계속돼요.<br>' +
      '하지만 가주도 <b>나이를 먹어요</b>. 언젠가 검을 자녀에게 물려줘야 하죠.',
    button: '모험 시작',
  },
  {
    id: 'upgrade',
    when: (g) => g.state.gold >= upgradeCost('atk', 0),
    target: '[data-upg="atk"]',
    tab: 'grow',
    title: '수련으로 강해지기',
    text: () => '골드가 모였어요! <b>검술 수련</b>을 눌러 공격력을 올리세요.<br>길게 누르면 연속으로 살 수 있어요.',
    doneWhen: (g) => g.state.upgrades.atk + g.state.upgrades.hp + g.state.upgrades.spd >= 2,
  },
  {
    id: 'boss',
    when: (g) => g.sim.gaugeFull || g.state.hero.maxStage >= 2,
    target: '.boss-ctl',
    title: '보스 도전',
    text: () =>
      `잡몹을 ${BALANCE.monster.perStage}마리 잡으면 <b>보스 도전</b>을 할 수 있어요. 제한 시간 안에 보스를 쓰러뜨리면 다음 스테이지로!<br>` +
      '<b>자동 도전</b>을 끄면 보스에 도전하지 않고 잡몹만 계속 잡아요 (골드 모으기). 10스테이지마다 강한 <b>지역 보스</b>가 나와요.',
    button: '확인',
  },
  {
    id: 'age',
    when: (g) => g.state.hero.age >= 23,
    target: '.lifebar',
    title: '가주의 일생',
    text: () =>
      '이 막대는 가주의 <b>일생</b>이에요. 하늘도 새벽에서 밤으로 바뀌어요.<br>' +
      '<b>전성기</b>에 가장 강하고, 나이가 들면 점점 약해져요.',
    button: '확인',
  },
  {
    id: 'quest',
    when: (g) => g.state.hero.maxStage >= 15,
    target: '[data-tab="quest"]',
    title: '매일 할 일',
    text: () => '<b>임무</b> 탭에서 출석 보상과 일일 임무 보상을 받을 수 있어요. 받을 게 있으면 빨간 점이 떠요.',
    button: '확인',
    doneWhen: (_g, tab) => tab === 'quest',
  },
  {
    id: 'heirloom',
    when: (g) => g.state.legacy >= 2,
    target: '[data-hl="sword"]',
    tab: 'grow',
    title: '가보',
    text: () => '보스가 <b>유산석</b>을 떨어뜨렸어요! 가보는 은퇴해도 사라지지 않고 대대로 물려줘요. 가문의 검을 강화해 보세요.',
    button: '확인',
    doneWhen: (g) => g.state.heirlooms.sword + g.state.heirlooms.shield + g.state.heirlooms.ring > 0,
  },
  {
    id: 'gear',
    when: (g) => g.state.hero.maxStage >= 20,
    target: '[data-tab="gear"]',
    title: '장비',
    text: () =>
      '<b>장비</b> 탭에서 보석으로 장비를 뽑을 수 있어요 (하루 한 번 무료). 무기에 따라 <b>전사·궁수·마법사</b>가 되고, 가주의 재능과 같은 무기를 들면 더 강해져요.',
    button: '확인',
    doneWhen: (_g, tab) => tab === 'gear',
  },
  {
    id: 'retire',
    when: (g) => canRetire(g.state),
    target: '[data-act="retire"]',
    tab: 'grow',
    title: '은퇴할 수 있어요',
    text: () =>
      `${BALANCE.time.retireMinAge}세가 되었어요! 은퇴하면 <b>명성</b>을 얻고, 결혼해서 낳은 아이가 다음 가주가 돼요.<br>` +
      '명성은 다음 세대를 <b>영원히</b> 강하게 만들어요. 지금 해도 되고, 더 키워도 돼요.',
    button: '알겠어요',
    doneWhen: (g) => g.state.hero.generation >= 2,
  },
  {
    id: 'family',
    when: (g) => g.state.hero.generation >= 2,
    target: '[data-tab="family"]',
    title: '새 가주 탄생',
    text: (g) =>
      `${g.state.hero.generation}대 가주가 탄생했어요! 부모를 닮은 외모와 특성을 물려받았어요.<br><b>가문</b> 탭에서 가계도를 확인해 보세요.`,
    button: '확인',
    doneWhen: (_g, tab) => tab === 'family',
  },
];

/**
 * 처음 하는 사람을 위한 안내. 게임을 멈추지 않고, 해당 화면 요소를 밝게 비추며 말풍선을 띄운다.
 * 진행 상황은 저장 데이터(state.tutorial)에 남는다.
 */
export class Tutorial {
  private ring = document.createElement('div');
  private bubble = document.createElement('div');
  private dim = document.createElement('div');
  private shownId: string | null = null;
  /** 이 단계에서 탭을 이미 한 번 옮겨 줬는지 (사용자가 다른 탭으로 가면 다시 끌고 오지 않는다) */
  private tabMoved = new Set<string>();

  constructor(
    private core: Game,
    private hooks: { modalOpen: () => boolean; showTab: (t: TutorialTab) => void; currentTab: () => TutorialTab },
  ) {
    this.ring.className = 'tut-ring';
    this.bubble.className = 'tut-bubble';
    this.dim.className = 'tut-dim';
    for (const n of [this.dim, this.ring, this.bubble]) {
      n.hidden = true;
      document.body.appendChild(n);
    }
    window.addEventListener('resize', () => this.position());
    document.querySelector('#panel')?.addEventListener('scroll', () => this.position(), { passive: true });
  }

  private get done(): string[] {
    return (this.core.state.tutorial ??= []);
  }

  private current(): Step | undefined {
    return STEPS.find((s) => !this.done.includes(s.id));
  }

  private complete(id: string): void {
    track('tutorial_step', { id });
    if (!this.done.includes(id)) this.done.push(id);
    this.core.save();
    this.hide();
  }

  skipAll(): void {
    track('tutorial_skip', { at: this.current()?.id ?? 'none' });
    for (const s of STEPS) if (!this.done.includes(s.id)) this.done.push(s.id);
    this.core.save();
    this.hide();
  }

  private hide(): void {
    this.shownId = null;
    this.ring.hidden = this.bubble.hidden = this.dim.hidden = true;
  }

  /** UI 새로고침마다 호출 */
  update(): void {
    const step = this.current();
    if (!step) return this.hide();
    if (step.doneWhen?.(this.core, this.hooks.currentTab())) return this.complete(step.id);
    if (this.hooks.modalOpen() || !step.when(this.core)) return this.hide();

    if (step.tab && !this.tabMoved.has(step.id)) {
      this.tabMoved.add(step.id);
      if (this.hooks.currentTab() !== step.tab) this.hooks.showTab(step.tab);
    }
    // 가리킬 대상이 지금 화면에 없으면 (다른 탭으로 갔을 때) 숨겼다가, 돌아오면 다시 보여 준다
    if (step.target && !this.visibleTarget(step.target)) return this.hide();

    if (this.shownId !== step.id) {
      this.shownId = step.id;
      this.render(step);
      audio.play('click');
      // 패널 안의 대상은 보이도록 스크롤
      requestAnimationFrame(() => {
        const t = step.target ? document.querySelector<HTMLElement>(step.target) : null;
        if (t && t.closest('#panel')) t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
    this.position();
  }

  private visibleTarget(sel: string): HTMLElement | null {
    const t = document.querySelector<HTMLElement>(sel);
    if (!t || !t.isConnected) return null;
    const r = t.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? t : null;
  }

  private render(step: Step): void {
    const idx = STEPS.indexOf(step) + 1;
    this.bubble.innerHTML = `
      <div class="tut-head"><b>${step.title}</b><span>${idx}/${STEPS.length}</span></div>
      <p>${step.text(this.core)}</p>
      <div class="tut-actions">
        <button class="tut-skip" data-t="skip">튜토리얼 건너뛰기</button>
        ${step.button ? `<button class="btn" data-t="ok">${step.button}</button>` : '<span class="tut-hint">빛나는 곳을 눌러 보세요</span>'}
      </div>`;
    this.bubble.querySelector('[data-t="ok"]')?.addEventListener('click', () => this.complete(step.id));
    this.bubble.querySelector('[data-t="skip"]')?.addEventListener('click', () => this.skipAll());
    this.bubble.classList.toggle('center', !step.target);
    this.dim.hidden = !!step.target;
    this.ring.hidden = !step.target;
    this.bubble.hidden = false;
  }

  private position(): void {
    const step = this.current();
    if (!step || this.shownId !== step.id) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = Math.min(340, vw - 24);
    this.bubble.style.width = `${bw}px`;
    if (!step.target) {
      this.bubble.style.left = `${(vw - bw) / 2}px`;
      this.bubble.style.top = `${Math.max(16, vh / 2 - this.bubble.offsetHeight / 2)}px`;
      return;
    }
    const t = this.visibleTarget(step.target);
    if (!t) return this.hide();
    const r = t.getBoundingClientRect();
    const pad = 4;
    Object.assign(this.ring.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    const bh = this.bubble.offsetHeight;
    const below = r.top + r.height / 2 < vh / 2;
    let top = below ? r.bottom + 12 : r.top - bh - 12;
    top = Math.max(8, Math.min(vh - bh - 8, top));
    const left = Math.max(12, Math.min(vw - bw - 12, r.left + r.width / 2 - bw / 2));
    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${top}px`;
    this.bubble.dataset.arrow = below ? 'up' : 'down';
  }
}
