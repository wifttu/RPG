import { iconImg } from '../art/icons';
import { ACHIEVEMENTS, claimable, isDone } from '../core/achievements';
import { clock } from '../core/clock';
import {
  ALL_CLEAR,
  ATTENDANCE,
  MISSIONS,
  MONTHLY_DAILY_GEMS,
  canClaimAllClear,
  canClaimAttendance,
  canClaimMission,
  canClaimMonthly,
  missionProgress,
  monthlyActive,
  rewardText,
} from '../core/daily';
import type { Game } from '../core/game';
import type { GameState } from '../core/state';
import { fmt } from './format';

/** 임무 탭: 출석, 일일 임무, 업적 */

export function questBadge(s: GameState, now = clock.now()): boolean {
  return (
    canClaimAttendance(s, now) ||
    MISSIONS.some((m) => canClaimMission(s, m)) ||
    canClaimAllClear(s) ||
    canClaimMonthly(s, now) ||
    claimable(s).length > 0
  );
}

export function questHtml(core: Game): string {
  const s = core.state;
  const now = clock.now();
  const cycle = s.attendance.count % ATTENDANCE.length;
  const todayDone = !canClaimAttendance(s, now);
  const days = ATTENDANCE.map((r, i) => {
    const got = i < cycle || (todayDone && i === cycle - 1);
    const next = i === cycle && !todayDone;
    return `<div class="day ${got ? 'got' : ''} ${next ? 'next' : ''}">
        <span class="d">${i + 1}일</span><span class="r">${rewardText(r)}</span>
      </div>`;
  }).join('');
  const achievements = [...ACHIEVEMENTS]
    .sort((a, b) => Number(s.achievements.includes(a.id)) - Number(s.achievements.includes(b.id)))
    .map((a) => {
      const [cur, goal] = a.progress(s);
      const got = s.achievements.includes(a.id);
      return `<div class="quest ${got ? 'done' : ''}">
          <div class="meta">
            <b>${a.name}</b> <span class="small muted">${a.desc}</span>
            <div class="qbar"><div style="width:${Math.min(100, (cur / goal) * 100)}%"></div></div>
            <div class="small muted">${fmt(Math.min(cur, goal))} / ${fmt(goal)} · ${rewardText(a.reward)}</div>
          </div>
          <button class="btn ${got ? 'ghost' : 'gold'}" data-claim="ach:${a.id}" ${got || !isDone(s, a) ? 'disabled' : ''}>${got ? '완료' : '받기'}</button>
        </div>`;
    })
    .join('');

  return `
    <div class="card">
      <h3>${iconImg('crown')} 출석 <small>빠진 날이 있어도 이어서 받아요</small></h3>
      <div class="days">${days}</div>
      <button class="btn wide gold" data-claim="attend" style="margin-top:8px"><span data-b="attendLabel"></span></button>
    </div>
    ${
      monthlyActive(s, now)
        ? `<div class="card">
      <h3>${iconImg('gem')} 명문가 월정액 <small data-b="monthlyLeft"></small></h3>
      <button class="btn wide blue" data-claim="monthly">오늘의 보석 ${MONTHLY_DAILY_GEMS} 받기</button>
    </div>`
        : ''
    }
    <div class="card">
      <h3>${iconImg('fame')} 일일 임무 <small>매일 자정에 새로 시작</small></h3>
      ${MISSIONS.map(
        (m) => `
        <div class="quest">
          <div class="meta">
            <b>${m.label}</b>
            <div class="qbar"><div data-q="${m.id}"></div></div>
            <div class="small muted"><span data-b="q-${m.id}"></span> · ${rewardText(m.reward)}</div>
          </div>
          <button class="btn gold" data-claim="m:${m.id}">받기</button>
        </div>`,
      ).join('')}
      <div class="quest all">
        <div class="meta"><b>모두 완료 보너스</b><div class="small muted">${rewardText(ALL_CLEAR)}</div></div>
        <button class="btn gold" data-claim="m:all">받기</button>
      </div>
    </div>
    <div class="card">
      <h3>${iconImg('fame')} 업적 <small>${s.achievements.length} / ${ACHIEVEMENTS.length}</small></h3>
      ${achievements}
    </div>`;
}

/** 진행도와 버튼 상태만 갱신 (화면을 다시 그리지 않아서 버튼 누름이 끊기지 않는다) */
export function refreshQuest(root: HTMLElement, core: Game): void {
  const s = core.state;
  const now = clock.now();
  for (const m of MISSIONS) {
    const p = missionProgress(s, m);
    const bar = root.querySelector<HTMLElement>(`[data-q="${m.id}"]`);
    if (bar) bar.style.width = `${(p / m.target) * 100}%`;
    const label = root.querySelector(`[data-b="q-${m.id}"]`);
    if (label) label.textContent = `${fmt(p)} / ${fmt(m.target)}`;
    const btn = root.querySelector<HTMLButtonElement>(`[data-claim="m:${m.id}"]`);
    if (btn) {
      const got = s.daily.claimed.includes(m.id);
      btn.disabled = !canClaimMission(s, m);
      btn.textContent = got ? '완료' : '받기';
    }
  }
  const all = root.querySelector<HTMLButtonElement>('[data-claim="m:all"]');
  if (all) {
    all.disabled = !canClaimAllClear(s);
    all.textContent = s.daily.claimed.includes('all') ? '완료' : '받기';
  }
  const at = root.querySelector<HTMLButtonElement>('[data-claim="attend"]');
  if (at) {
    const can = canClaimAttendance(s, now);
    at.disabled = !can;
    const label = root.querySelector('[data-b="attendLabel"]');
    const txt = can
      ? `${(s.attendance.count % ATTENDANCE.length) + 1}일차 출석 보상 받기`
      : '오늘 출석 완료 · 내일 또 만나요';
    if (label && label.textContent !== txt) label.textContent = txt;
  }
  const mo = root.querySelector<HTMLButtonElement>('[data-claim="monthly"]');
  if (mo) mo.disabled = !canClaimMonthly(s, now);
  const left = root.querySelector('[data-b="monthlyLeft"]');
  if (left) left.textContent = `${Math.ceil((s.entitlements.monthlyUntil - now) / 86_400_000)}일 남음`;
}
