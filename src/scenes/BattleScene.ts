import Phaser from 'phaser';
import { ANIMS, FEET_Y as SHEET_FEET, FRAME, heroLookKey, heroSheetCanvas } from '../art/heroSheet';
import { monsterArtCanvas } from '../art/monsterArt';
import { coinCanvas } from '../art/monsters';
import { OUTLINE, UI } from '../art/palette';
import { BIOMES, cloudCanvas, groundLayer, paintSky, skyAt, toTint } from '../art/world';
import far0 from '../assets/bg/far0.png';
import far1 from '../assets/bg/far1.png';
import far2 from '../assets/bg/far2.png';
import mid0 from '../assets/bg/mid0.png';
import mid1 from '../assets/bg/mid1.png';
import mid2 from '../assets/bg/mid2.png';

/** PixelLab으로 만든 배경 (지역별 먼 산 + 중경). 좌우 거울 복사로 끊김 없이 이어진다. */
const BG_URLS = { far: [far0, far1, far2], mid: [mid0, mid1, mid2] };
import { BALANCE } from '../config/balance';
import { biomeOf, type BattleEvent, type Monster, type MonsterKind } from '../core/battle';
import type { Game } from '../core/game';
import { mix } from '../art/palette';
import { fmt } from '../ui/format';

export const VIEW_W = 160;
export const VIEW_H = 144;
const GROUND_Y = 108;
const HERO_X = 50;
const MON_X = 98;
const FEET_Y = GROUND_Y + 5;
const FONT = 'Galmuri11, monospace';

const MONSTER_KINDS: MonsterKind[] = ['slime', 'mushroom', 'bat', 'beetle', 'golem'];

export class BattleScene extends Phaser.Scene {
  private core: Game;
  private skyCanvas!: Phaser.Textures.CanvasTexture;
  private stars!: Phaser.GameObjects.Image;
  private sun!: Phaser.GameObjects.Arc;
  private clouds: Phaser.GameObjects.Image[] = [];
  private far!: Phaser.GameObjects.TileSprite;
  private mid!: Phaser.GameObjects.TileSprite;
  private ground!: Phaser.GameObjects.TileSprite;
  private hero!: Phaser.GameObjects.Container;
  private heroSprite!: Phaser.GameObjects.Sprite;
  private attacking = false;
  private heroAnimBase = '';
  private monster: Phaser.GameObjects.Container | null = null;
  private monsterSprite: Phaser.GameObjects.Sprite | null = null;
  private monsterData: Monster | null = null;
  private bars!: Phaser.GameObjects.Graphics;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private biome = -1;
  private skyTimer = 0;
  private lastSkyT = -1;
  private heroDown = false;

  constructor(core: Game) {
    super({ key: 'battle' });
    this.core = core;
  }

  preload(): void {
    BG_URLS.far.forEach((u, i) => this.load.image(`far-${i}`, u));
    BG_URLS.mid.forEach((u, i) => this.load.image(`mid-${i}`, u));
  }

  create(): void {
    this.makeTextures();

    this.skyCanvas = this.textures.createCanvas('sky', VIEW_W, GROUND_Y)!;
    this.add.image(0, 0, 'sky').setOrigin(0);
    this.stars = this.add.image(0, 0, 'stars').setOrigin(0).setAlpha(0);
    this.sun = this.add.circle(0, 0, 6, 0xfff1b0).setStrokeStyle(2, 0xffd36a, 0.6);

    for (let i = 0; i < 3; i++) {
      this.clouds.push(this.add.image(i * 64 + 12, 10 + i * 11, `cloud-${i}`).setOrigin(0).setAlpha(0.9));
    }
    this.far = this.add.tileSprite(0, GROUND_Y - 72, VIEW_W, 64, 'far-0').setOrigin(0);
    this.mid = this.add.tileSprite(0, GROUND_Y - 60, VIEW_W, 64, 'mid-0').setOrigin(0);
    this.ground = this.add.tileSprite(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y, 'ground-0').setOrigin(0);

    // 영웅: 그림자 + 몸 + 검 (검은 손 위치에서 회전)
    const shadow = this.add.ellipse(0, 0, 22, 5, 0x000000, 0.28);
    this.heroSprite = this.add.sprite(0, 0, this.heroKey(), 0).setOrigin(0.5, SHEET_FEET / FRAME);
    this.heroSprite.on('animationcomplete', (a: Phaser.Animations.Animation) => {
      if (a.key.endsWith('-slash')) {
        this.attacking = false;
        this.playHero(this.isWalking() ? 'walk' : 'idle');
      }
    });
    this.hero = this.add.container(HERO_X, FEET_Y, [shadow, this.heroSprite]);
    this.playHero('idle');

    this.bars = this.add.graphics();

    this.sparks = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 200, max: 450 },
      scale: { start: 1, end: 0 },
      gravityY: 160,
      emitting: false,
    });
    this.dust = this.add.particles(0, 0, 'px', {
      speedX: { min: -25, max: -5 },
      speedY: { min: -12, max: -2 },
      lifespan: 400,
      alpha: { start: 0.7, end: 0 },
      tint: 0xd9c8a8,
      emitting: false,
    });

    this.applyBiome(biomeOf(this.core.state.stage));
    this.updateSky(true);

    this.core.on('battle', (ev) => this.onBattle(ev));
    this.core.on('newGeneration', () => this.onNewGeneration());
  }

  /** 유전자(머리색·피부)별로 색을 바꾼 시트를 텍스처로 등록하고 애니메이션을 만든다 */
  private heroKey(): string {
    const genes = this.core.state.hero.genes;
    const key = `hero-${heroLookKey(genes)}`;
    if (!this.textures.exists(key)) {
      const canvas = heroSheetCanvas(genes);
      const tex = this.textures.addCanvas(key, canvas)!;
      const n = canvas.width / FRAME;
      for (let i = 0; i < n; i++) tex.add(i, 0, i * FRAME, 0, FRAME, FRAME);
      for (const [name, a] of Object.entries(ANIMS)) {
        this.anims.create({
          key: `${key}-${name}`,
          frames: this.anims.generateFrameNumbers(key, { start: a.start, end: a.end }),
          frameRate: a.frameRate,
          repeat: a.repeat,
        });
      }
    }
    this.heroAnimBase = key;
    return key;
  }

  private playHero(name: keyof typeof ANIMS, opts: { duration?: number } = {}): void {
    const key = `${this.heroAnimBase}-${name}`;
    if (name !== 'slash' && this.heroSprite.anims.currentAnim?.key === key) return;
    this.heroSprite.play({ key, ...(opts.duration ? { duration: opts.duration } : {}) });
  }

  private isWalking(): boolean {
    return !this.monster && !this.core.sim.dead && !this.core.retiring;
  }

  private makeTextures(): void {
    const t = this.textures;
    t.addCanvas('coin', coinCanvas());
    BIOMES.forEach((b, i) => {
      t.addCanvas(`ground-${i}`, groundLayer(b));
      for (const k of MONSTER_KINDS) t.addCanvas(`mon-${k}-${i}`, monsterArtCanvas(k, i));
    });
    for (let i = 0; i < 3; i++) t.addCanvas(`cloud-${i}`, cloudCanvas(i));

    const px = document.createElement('canvas');
    px.width = px.height = 2;
    const pctx = px.getContext('2d')!;
    pctx.fillStyle = '#fff';
    pctx.fillRect(0, 0, 2, 2);
    t.addCanvas('px', px);

    const st = document.createElement('canvas');
    st.width = VIEW_W;
    st.height = GROUND_Y;
    const sctx = st.getContext('2d')!;
    for (let i = 0; i < 70; i++) {
      const x = (i * 97 + 13) % VIEW_W;
      const y = (i * 53 + 7) % 80;
      sctx.fillStyle = i % 9 === 0 ? '#fff6c8' : '#cfd4ff';
      sctx.fillRect(x, y, 1, 1);
      if (i % 13 === 0) {
        sctx.fillRect(x - 1, y, 3, 1);
        sctx.fillRect(x, y - 1, 1, 3);
      }
    }
    t.addCanvas('stars', st);
  }

  private applyBiome(b: number): void {
    if (b === this.biome) return;
    this.biome = b;
    this.far.setTexture(`far-${b}`);
    this.mid.setTexture(`mid-${b}`);
    this.ground.setTexture(`ground-${b}`);
  }

  /** 인생 진행도에 따라 하늘·조명이 새벽 → 낮 → 노을 → 밤으로 바뀐다 */
  private lifeProgress(): number {
    const s = this.core.state;
    const life = this.core.stats.lifespan;
    return Phaser.Math.Clamp((s.hero.age - BALANCE.time.startAge) / (life - BALANCE.time.startAge), 0, 1);
  }

  private updateSky(force = false): void {
    const t = this.lifeProgress();
    if (!force && Math.abs(t - this.lastSkyT) < 0.004) return;
    this.lastSkyT = t;
    const { top, bottom, ambient } = skyAt(t);
    paintSky(this.skyCanvas.getContext(), VIEW_W, GROUND_Y, top, bottom);
    this.skyCanvas.refresh();

    const tint = toTint(ambient);
    this.far.setTint(tint);
    this.mid.setTint(tint);
    this.ground.setTint(tint);
    for (const c of this.clouds) c.setTint(toTint(mix(ambient, '#ffffff', 0.2)));
    const charTint = toTint(mix(ambient, '#ffffff', 0.55));
    this.heroSprite.setTint(charTint);
    this.monsterSprite?.setTint(charTint);

    // 해/달: 왼쪽에서 떠서 오른쪽으로 진다
    const arcT = Math.min(1, t / 0.95);
    this.sun.setPosition(14 + arcT * (VIEW_W - 28), 76 - Math.sin(arcT * Math.PI) * 60);
    const night = Phaser.Math.Clamp((t - 0.88) / 0.12, 0, 1);
    this.sun.setFillStyle(night > 0.5 ? 0xe8ecff : t > 0.7 ? 0xffb066 : 0xfff1b0);
    this.stars.setAlpha(night);
  }

  private charTint(): number {
    return toTint(mix(skyAt(this.lifeProgress()).ambient, '#ffffff', 0.55));
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.core.update(dt);

    const walking = this.isWalking();
    if (!this.attacking && !this.heroDown) this.playHero(walking ? 'walk' : 'idle');
    const speed = walking ? 34 : 0;
    this.far.tilePositionX += speed * 0.15 * dt;
    this.mid.tilePositionX += speed * 0.45 * dt;
    this.ground.tilePositionX += speed * dt;
    for (const c of this.clouds) {
      c.x -= (3 + speed * 0.05) * dt;
      if (c.x < -42) c.x = VIEW_W + 4;
    }

    // 숨쉬기 / 걷기 흔들림
    if (walking && Math.random() < dt * 8) this.dust.emitParticleAt(HERO_X - 6, FEET_Y - 1, 1);

    this.skyTimer += dt;
    if (this.skyTimer > 0.5) {
      this.skyTimer = 0;
      this.updateSky();
    }
    this.drawBars();
  }

  private drawBars(): void {
    const g = this.bars;
    g.clear();
    const bar = (x: number, y: number, w: number, ratio: number, color: number) => {
      g.fillStyle(toTint(OUTLINE), 1).fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle(0x3a2e4a, 1).fillRect(x, y, w, 3);
      g.fillStyle(color, 1).fillRect(x, y, Math.max(0, Math.round(w * ratio)), 3);
      g.fillStyle(0xffffff, 0.35).fillRect(x, y, Math.max(0, Math.round(w * ratio)), 1);
    };
    const sim = this.core.sim;
    if (!this.heroDown) bar(HERO_X - 12, FEET_Y - 58, 24, sim.heroHp / sim.stats.maxHp, 0x5fd16a);
    if (this.monster && this.monsterData) {
      const m = this.monsterData;
      const h = this.monsterSprite!.displayHeight;
      const w = m.boss ? 36 : 24;
      bar(this.monster.x - w / 2, FEET_Y - h - 8, w, Math.max(0, m.hp) / m.maxHp, m.boss ? 0xff5c6c : 0xff9a4a);
    }
  }

  private onBattle(events: BattleEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          this.spawnMonster(e.monster);
          break;
        case 'heroAttack':
          this.heroSwing(e.damage, e.crit);
          break;
        case 'kill':
          this.killMonster(e.gold);
          break;
        case 'monsterAttack':
          this.monsterHit(e.damage);
          break;
        case 'heroDeath':
          this.heroFall();
          break;
        case 'respawn':
          this.heroRise();
          break;
        case 'stageChange':
          this.applyBiome(biomeOf(e.stage));
          if (e.reason !== 'clear') this.clearMonster();
          if (e.boss) this.banner('BOSS', '#ff5c6c');
          else if (e.reason === 'timeout') this.banner('시간 초과', '#ffb36b');
          break;
      }
    }
  }

  private spawnMonster(m: Monster): void {
    this.clearMonster();
    const b = biomeOf(this.core.state.stage);
    const spr = this.add.sprite(0, 0, `mon-${m.kind}-${b}`).setOrigin(0.5, 1);
    spr.setTint(this.charTint());
    if (m.kind === 'bat') {
      // 날갯짓: 위아래로 떠다니며 살짝 눌렸다 펴진다
      spr.y = -12;
      this.tweens.add({ targets: spr, y: -18, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: spr, scaleY: 0.88, duration: 160, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    if (m.kind === 'mushroom' || m.kind === 'beetle') this.tweens.add({ targets: spr, scaleY: 0.95, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (m.kind === 'slime') this.tweens.add({ targets: spr, scaleY: 0.9, scaleX: 1.06, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const shadow = this.add.ellipse(0, 0, m.boss ? 46 : 28, 6, 0x000000, 0.28);
    const c = this.add.container(VIEW_W + 20, FEET_Y, [shadow, spr]);
    this.tweens.add({ targets: c, x: MON_X + (m.boss ? 8 : 0), duration: 220, ease: 'Quad.out' });
    this.monster = c;
    this.monsterSprite = spr;
    this.monsterData = m;
    if (m.boss) this.cameras.main.shake(200, 0.006);
  }

  private clearMonster(): void {
    if (!this.monster) return;
    this.tweens.killTweensOf(this.monster);
    if (this.monsterSprite) this.tweens.killTweensOf(this.monsterSprite);
    this.monster.destroy();
    this.monster = null;
    this.monsterSprite = null;
    this.monsterData = null;
  }

  private heroSwing(damage: number, crit: boolean): void {
    // 공격 속도가 빨라지면 애니메이션도 빨라진다 (다음 공격 전에 끝나도록)
    const interval = 1000 / this.core.stats.atkPerSec / Math.max(1, this.core.timeScale);
    this.attacking = true;
    this.playHero('slash', { duration: Math.min(420, interval * 0.9) });
    this.tweens.add({ targets: this.heroSprite, x: 3, duration: 60, yoyo: true, ease: 'Quad.out' });

    if (this.monster && this.monsterSprite) {
      const spr = this.monsterSprite;
      spr.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(70, () => spr.active && spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.charTint()));
      this.tweens.add({ targets: this.monster, x: this.monster.x + (crit ? 5 : 2), duration: 50, yoyo: true });
      const hx = this.monster.x - 6;
      const hy = FEET_Y - spr.displayHeight / 2;
      this.sparks.setParticleTint(crit ? 0xffd84a : 0xffffff);
      this.sparks.explode(crit ? 10 : 4, hx, hy);
      this.floatText(crit ? `${fmt(damage)}!` : fmt(damage), this.monster.x, hy - 8, crit ? UI.crit : UI.text, crit);
      if (crit) this.cameras.main.shake(80, 0.004);
    }
  }

  private killMonster(gold: number): void {
    if (!this.monster || !this.monsterSprite) return;
    const c = this.monster;
    const spr = this.monsterSprite;
    this.monster = null;
    this.monsterSprite = null;
    this.monsterData = null;
    this.tweens.killTweensOf(spr);
    spr.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.tweens.add({ targets: c, alpha: 0, duration: 260, onComplete: () => c.destroy() });
    this.tweens.add({ targets: spr, scaleX: 1.3, scaleY: 0.4, duration: 200, ease: 'Quad.in' });
    this.sparks.setParticleTint(0xffe08a);
    this.sparks.explode(12, c.x, FEET_Y - 8);

    // 코인이 튀어 올랐다가 위쪽(골드 HUD 방향)으로 빨려 들어간다
    const n = Math.min(6, 2 + Math.floor(Math.log10(gold + 1)));
    for (let i = 0; i < n; i++) {
      const coin = this.add.image(c.x, FEET_Y - 10, 'coin');
      const peakX = c.x + Phaser.Math.Between(-18, 14);
      const peakY = FEET_Y - Phaser.Math.Between(24, 40);
      this.tweens.chain({
        targets: coin,
        tweens: [
          { x: peakX, y: peakY, duration: 260, ease: 'Quad.out' },
          { x: 14, y: -6, duration: 420, delay: i * 30, ease: 'Quad.in' },
        ],
        onComplete: () => coin.destroy(),
      });
    }
    this.floatText(`+${fmt(gold)}`, c.x, FEET_Y - 34, UI.gold, false);
  }

  private monsterHit(damage: number): void {
    if (this.monster) this.tweens.add({ targets: this.monster, x: this.monster.x - 8, duration: 80, yoyo: true, ease: 'Quad.out' });
    this.heroSprite.setTint(0xff6a6a);
    this.time.delayedCall(90, () => this.heroSprite.setTint(this.charTint()));
    this.floatText(`-${fmt(damage)}`, HERO_X, FEET_Y - 46, UI.hurt, false);
  }

  private heroFall(): void {
    this.heroDown = true;
    this.tweens.add({ targets: this.hero, angle: -80, alpha: 0.4, duration: 300, ease: 'Quad.in' });
    this.banner('쓰러졌다…', '#ff8a8a');
    this.clearMonster();
  }

  private heroRise(): void {
    this.tweens.add({
      targets: this.hero,
      angle: 0,
      alpha: 1,
      duration: 250,
      onComplete: () => (this.heroDown = false),
    });
  }

  private onNewGeneration(): void {
    this.clearMonster();
    this.heroSprite.setTexture(this.heroKey(), 0);
    this.attacking = false;
    this.heroSprite.anims.stop();
    this.playHero('idle');
    this.applyBiome(biomeOf(this.core.state.stage));
    this.updateSky(true);
    this.heroSprite.setAlpha(0);
    this.tweens.add({ targets: this.heroSprite, alpha: 1, duration: 800 });
    this.sparks.setParticleTint(0xfff1b0);
    this.sparks.explode(30, HERO_X, FEET_Y - 16);
  }

  private floatText(text: string, x: number, y: number, color: string, big: boolean): void {
    const t = this.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: FONT, fontSize: big ? '12px' : '12px', color, resolution: 1 })
      .setOrigin(0.5, 1)
      .setShadow(1, 1, OUTLINE, 0, false, true);
    if (big) t.setScale(1);
    this.tweens.add({
      targets: t,
      y: y - (big ? 18 : 12),
      alpha: { from: 1, to: 0 },
      duration: big ? 800 : 650,
      ease: 'Quad.out',
      onComplete: () => t.destroy(),
    });
  }

  private banner(text: string, color: string): void {
    const t = this.add
      .text(VIEW_W / 2, 52, text, { fontFamily: FONT, fontSize: '12px', color, resolution: 1 })
      .setOrigin(0.5)
      .setShadow(1, 1, OUTLINE, 0, false, true)
      .setScale(2);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 300, onComplete: () => t.destroy() });
  }
}
