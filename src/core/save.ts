import { SAVE_VERSION, normalizeState, type GameState } from './state';

const KEY = 'heirs.save.v1';

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadGame(storage: Storage | null = defaultStorage()): GameState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GameState;
    if (typeof data !== 'object' || data === null || data.version !== SAVE_VERSION) return null;
    return normalizeState(data);
  } catch {
    return null;
  }
}

export function saveGame(state: GameState, storage: Storage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장 실패(사생활 보호 모드 등)는 조용히 무시. 앱 버전에서는 Capacitor Preferences로 교체.
  }
}

export function clearSave(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* noop */
  }
}

// ───────────────────────── 기기 이전 코드 ─────────────────────────
// 서버 없이 휴대폰을 바꿀 때 쓰는 방법: 저장 데이터를 글자 코드로 바꿔 복사 → 새 기기에서 붙여넣기.
// 클라우드 저장(Google Play 게임즈 저장 등)을 붙이면 같은 형식을 그대로 올리면 된다.

const CODE_PREFIX = 'HEIRS1';

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function exportSaveCode(state: GameState): string {
  const body = toBase64Url(JSON.stringify(state));
  return `${CODE_PREFIX}.${body}.${fnv1a(body)}`;
}

export type ImportResult = { ok: true; state: GameState } | { ok: false; error: string };

export function importSaveCode(code: string): ImportResult {
  const parts = code.trim().replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) return { ok: false, error: '계승자들 저장 코드가 아니에요. 처음부터 끝까지 그대로 붙여넣어 주세요.' };
  const [, body, sum] = parts;
  if (fnv1a(body) !== sum) return { ok: false, error: '코드 일부가 빠졌거나 바뀌었어요. 다시 복사해 주세요.' };
  try {
    const data = JSON.parse(fromBase64Url(body)) as GameState;
    if (data.version !== SAVE_VERSION || !data.hero) return { ok: false, error: '지원하지 않는 버전의 저장 코드예요.' };
    return { ok: true, state: normalizeState(data) };
  } catch {
    return { ok: false, error: '코드를 읽지 못했어요. 다시 복사해 주세요.' };
  }
}
