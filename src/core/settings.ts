/**
 * 기기 설정 (소리 크기, 화면 흔들림, 알림). 게임 진행과 별개로 이 기기에만 저장된다.
 */
export interface Settings {
  music: number;
  sfx: number;
  shake: boolean;
  notify: { retire: boolean; offline: boolean; daily: boolean };
}

const KEY = 'heirs.settings';
const DEFAULTS: Settings = { music: 0.7, sfx: 0.9, shake: true, notify: { retire: true, offline: true, daily: true } };

type Listener = (s: Settings) => void;
const listeners: Listener[] = [];

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULTS, ...s, notify: { ...DEFAULTS.notify, ...(s.notify ?? {}) } };
    }
  } catch {
    /* 기본값 */
  }
  return structuredClone(DEFAULTS);
}

export const settings: Settings = load();

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* 저장 못 해도 이번 실행에는 적용 */
  }
  for (const l of listeners) l(settings);
}

export function onSettings(l: Listener): void {
  listeners.push(l);
}
