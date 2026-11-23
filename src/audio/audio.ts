import { onSettings, settings } from '../core/settings';
import { MUSIC_BPM, SFX, scheduleMusicStep, type SfxName } from './synth';

const PREF_KEY = 'heirs.sound';

/** 같은 효과음이 너무 촘촘히 겹치지 않게 하는 최소 간격(초) */
const MIN_GAP: Partial<Record<SfxName, number>> = { hit: 0.06, crit: 0.08, coin: 0.09, kill: 0.08, hurt: 0.1, upgrade: 0.05, click: 0.03 };

/**
 * 소리 관리. 모바일 브라우저는 사용자가 화면을 처음 터치해야 소리를 낼 수 있어서
 * unlock() 을 첫 터치 때 부른다.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private last: Partial<Record<SfxName, number>> = {};
  private musicTimer: number | undefined;
  private nextStepTime = 0;
  private step = 0;
  enabled: boolean;

  constructor() {
    let on = true;
    try {
      on = localStorage.getItem(PREF_KEY) !== 'off';
    } catch {
      /* 저장소를 못 쓰면 기본값 */
    }
    this.enabled = on;
    onSettings(() => this.applyVolumes());
  }

  /** 설정 화면의 배경음악·효과음 크기 */
  applyVolumes(): void {
    if (this.sfxBus) this.sfxBus.gain.value = settings.sfx;
    if (this.musicBus) this.musicBus.gain.value = settings.music * 0.7;
  }

  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const master = this.ctx.createGain();
      master.gain.value = 0.8;
      master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.7;
      this.musicBus.connect(master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.startMusic();
  }

  play(name: SfxName, p = 0): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0;
    if (gap && now - (this.last[name] ?? -1) < gap) return;
    this.last[name] = now;
    SFX[name](ctx, this.sfxBus, now + 0.005, p);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
      /* noop */
    }
    if (on) this.unlock();
    else {
      this.stopMusic();
      void this.ctx?.suspend();
    }
  }

  /** 앱이 백그라운드로 가면 소리를 멈춘다 */
  pause(): void {
    this.stopMusic();
    void this.ctx?.suspend();
  }

  private startMusic(): void {
    if (this.musicTimer !== undefined || !this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    this.nextStepTime = ctx.currentTime + 0.1;
    const eighth = 60 / MUSIC_BPM / 2;
    // 미리 0.2초 앞까지 음표를 예약하는 방식 (타이머가 흔들려도 박자가 정확함)
    this.musicTimer = window.setInterval(() => {
      while (this.nextStepTime < ctx.currentTime + 0.2) {
        scheduleMusicStep(ctx, this.musicBus!, this.nextStepTime, this.step++);
        this.nextStepTime += eighth;
      }
    }, 40);
  }

  private stopMusic(): void {
    clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }
}

export const audio = new AudioEngine();
