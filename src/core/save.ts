import { SAVE_VERSION, type GameState } from './state';

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
    return data;
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
