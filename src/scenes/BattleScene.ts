import Phaser from 'phaser';
import { ANIMS, FEET_Y as SHEET_FEET, FRAME, heroLookKey, heroSheetCanvas } from '../art/heroSheet';
import { monsterArtCanvas } from '../art/monsterArt';
import { coinCanvas } from '../art/monsters';
import { OUTLINE, UI } from '../art/palette';
import { BIOMES, cloudCanvas, groundLayer, paintSky, skyAt, toTint } from '../art/world';
import far0 from '../assets/bg/far0.png';
import far1 from '../assets/bg/far1.png';
import far2 from '../assets/bg/far2.png';
import far3 from '../assets/bg/far3.png';
import far4 from '../assets/bg/far4.png';
import mid0 from '../assets/bg/mid0.png';
import mid1 from '../assets/bg/mid1.png';
import mid2 from '../assets/bg/mid2.png';
import mid3 from '../assets/bg/mid3.png';
import mid4 from '../assets/bg/mid4.png';

/** PixelLab으로 만든 배경 (지역별 먼 산 + 중경). 좌우 거울 복사로 끊김 없이 이어진다. */
const BG_URLS = { far: [far0, far1, far2, far3, far4], mid: [mid0, mid1, mid2, mid3, mid4] };
import { BALANCE } from '../config/balance';
import { biomeOf, type BattleEvent, type Monster, type MonsterKind } from '../core/battle';
import type { Game } from '../core/game';
import { mix } from '../art/palette';
import { fmt } from '../ui/format';
import { audio } from '../audio/audio';
import { heroClass, type WeaponKind } from '../core/gear';
import { settings } from '../core/settings';

export const VIEW_W = 160;
export const VIEW_H = 144;
const GROUND_Y = 108;
const HERO_X = 50;
const MON_X = 98;
const FEET_Y = GROUND_Y + 5;
const FONT = 'Galmuri11, monospace';

/** 스킬이 '맞는 순간'까지 걸리는 시간 (처치 연출을 그때까지 미룬다) */
const SKILL_IMPACT_MS: Record<WeaponKind, number> = { sword: 260, bow: 520, staff: 640 };

const MONSTER_KINDS: MonsterKind[] = ['slime', 'mushroom', 'bat', 'beetle', 'golem', 'yeti', 'dragon'];

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
  /** 스킬 처치 연출을 기다리는 동안 보류된 전투 이벤트 */
  private held: BattleEvent[] = [];
  private holding = false;
  /** 히트스톱이 끝나는 실제 시각 */
  private stopUntil = 0;

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

    // 화살 (12x3) 과 마법 구슬 (7x7)
    const arrow = document.createElement('canvas');
    arrow.width = 12;
    arrow.height = 3;
    const ac = arrow.getContext('2d')!;
    ac.fillStyle = '#86573a';
    ac.fillRect(2, 1, 8, 1);
    ac.fillStyle = '#e2e7f6';
    ac.fillRect(10, 0, 1, 3);
    ac.fillRect(11, 1, 1, 1);
    ac.fillStyle = '#e8687c';
    ac.fillRect(0, 0, 2, 1);
    ac.fillRect(0, 2, 2, 1);
    t.addCanvas('arrow', arrow);
    const orb = document.createElement('canvas');
    orb.width = orb.height = 7;
    const oc = orb.getContext('2d')!;
    oc.fillStyle = '#7a4ae0';
    oc.fillRect(1, 2, 5, 3);
    oc.fillRect(2, 1, 3, 5);
    oc.fillStyle = '#c9a8ff';
    oc.fillRect(2, 2, 3, 3);
    oc.fillStyle = '#ffffff';
    oc.fillRect(3, 3, 1, 1);
    t.addCanvas('orb', orb);

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
    // 새 지역에 들어서면 이름을 띄운다 (첫 화면 제외)
    if (this.biome !== -1) this.regionTitle(BIOMES[b].name);
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
    // 스킬을 쓰는 동안 들어온 일(일반 공격·처치·다음 몬스터)은 스킬이 '맞는 순간'까지 줄 세워 두었다가
    // 그 뒤에 순서대로 보여 준다. 운석이 떨어지기도 전에 몬스터가 쓰러지는 어색함을 막는다 (손맛).
    for (const e of events) {
      if (this.holding) {
        this.held.push(e);
        continue;
      }
      if (e.type === 'skill') {
        this.castSkill(e.kind, e.hits);
        this.holding = true;
        this.time.delayedCall(SKILL_IMPACT_MS[e.kind], () => {
          const q = this.held;
          this.held = [];
          this.holding = false;
          this.onBattle(q);
        });
        continue;
      }
      this.handle(e);
    }
  }

  private handle(e: BattleEvent): void {
    switch (e.type) {
      case 'spawn':
        this.spawnMonster(e.monster);
        break;
      case 'heroAttack':
        this.heroSwing(e.damage, e.crit);
        audio.play(e.crit ? 'crit' : 'hit');
        break;
      case 'kill':
        this.killMonster(e.gold);
        if (e.legacy > 0) this.time.delayedCall(350, () => this.floatText(`+유산석 ${e.legacy}`, MON_X, FEET_Y - 48, UI.gem, true));
        audio.play('kill');
        this.time.delayedCall(260, () => audio.play('coin'));
        break;
      case 'monsterAttack':
        this.monsterHit(e.damage);
        audio.play('hurt');
        break;
      case 'heroDeath':
        this.heroFall();
        audio.play('death');
        break;
      case 'respawn':
        this.heroRise();
        break;
      case 'bossStart':
        this.banner(e.rank === 'region' ? '지역 보스!' : 'BOSS', '#ff5c6c');
        audio.play('boss');
        break;
      case 'bossFail':
        this.banner(e.reason === 'timeout' ? '시간 초과' : '도전 실패', '#ffb36b');
        this.clearMonster();
        break;
      case 'bossReady':
        this.floatText('보스 도전 가능!', HERO_X + 20, FEET_Y - 70, '#ff9aa8', false);
        break;
      case 'stageChange':
        this.applyBiome(biomeOf(e.stage));
        if (e.reason !== 'clear') this.clearMonster();
        break;
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
    if (m.rank === 'elite') this.tweens.add({ targets: spr, alpha: 0.85, duration: 400, yoyo: true, repeat: -1 });
    const shadow = this.add.ellipse(0, 0, m.boss ? 46 : 28, 6, m.rank === 'elite' ? 0x7a0010 : 0x000000, m.rank === 'elite' ? 0.45 : 0.28);
    const c = this.add.container(VIEW_W + 20, FEET_Y, [shadow, spr]);
    // 스테이지 보스(정예): 같은 몬스터를 크게, 붉은 그림자
    if (m.rank === 'elite') c.setScale(1.35);
    this.tweens.add({ targets: c, x: MON_X + (m.boss ? 8 : 0), duration: 220, ease: 'Quad.out' });
    this.monster = c;
    this.monsterSprite = spr;
    this.monsterData = m;
    if (m.boss) this.shake(200, 0.006);
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
    const cls = heroClass(this.core.state);
    if (cls.ranged) {
      // 궁수·마법사: 베기 대신 반동 + 화살/마법 구슬이 날아간다
      this.tweens.add({ targets: this.heroSprite, x: -2, duration: 60, yoyo: true, ease: 'Quad.out' });
      if (cls.kind === 'staff') {
        this.heroSprite.setTint(0xc9a8ff);
        this.time.delayedCall(80, () => this.heroSprite.setTint(this.charTint()));
      }
      if (this.monster && this.monsterSprite) this.shoot(cls.kind === 'bow' ? 'arrow' : 'orb', crit);
    } else {
      this.attacking = true;
      this.playHero('slash', { duration: Math.min(420, interval * 0.9) });
      this.tweens.add({ targets: this.heroSprite, x: 3, duration: 60, yoyo: true, ease: 'Quad.out' });
    }

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
      if (crit) {
        this.shake(80, 0.004);
        this.hitStop(35);
      }
    }
  }

  // ───────────────────────── 손맛 도구 ─────────────────────────
  /** 히트스톱: 맞는 순간 화면을 아주 잠깐 거의 멈춘다 (실제 시간 기준) */
  private hitStop(ms: number): void {
    if (this.stopUntil > performance.now()) return;
    this.stopUntil = performance.now() + ms;
    this.tweens.timeScale = 0.04;
    this.anims.globalTimeScale = 0.04;
    this.sparks.timeScale = 0.04;
    window.setTimeout(() => {
      this.tweens.timeScale = 1;
      this.anims.globalTimeScale = 1;
      this.sparks.timeScale = 1;
    }, ms);
  }

  /** 카메라 확대 펀치 + 번쩍임 */
  private punch(zoom: number, color = 0xffffff, flashMs = 90): void {
    const cam = this.cameras.main;
    const r = (color >> 16) & 255,
      g = (color >> 8) & 255,
      b = color & 255;
    cam.flash(flashMs, r, g, b);
    if (!settings.shake) return;
    cam.zoomTo(zoom, 60, 'Quad.easeOut', true);
    this.time.delayedCall(70, () => cam.zoomTo(1, 220, 'Quad.easeOut', true));
  }

  /** 잔상: 지금 영웅 모습을 반투명하게 남겼다가 사라지게 */
  private afterimage(tint = 0x9ad8ff): void {
    const hs = this.heroSprite;
    const img = this.add
      .image(this.hero.x + hs.x, this.hero.y + hs.y, hs.texture.key, hs.frame.name)
      .setOrigin(hs.originX, hs.originY)
      .setAlpha(0.55)
      .setTint(tint)
      .setTintMode(Phaser.TintModes.FILL);
    this.children.moveBelow(img, this.hero);
    this.tweens.add({ targets: img, alpha: 0, duration: 220, onComplete: () => img.destroy() });
  }

  /** 초승달 베기 궤적 */
  private slashArc(x: number, y: number, r: number, color: number, rot: number): void {
    const g = this.add.graphics({ x, y }).setRotation(rot);
    g.lineStyle(4, color, 1).beginPath().arc(0, 0, r, -1.1, 1.1).strokePath();
    g.lineStyle(2, 0xffffff, 1).beginPath().arc(1, 0, r - 2, -0.9, 0.9).strokePath();
    g.setScale(0.6);
    this.tweens.add({ targets: g, scale: 1.25, alpha: 0, duration: 260, ease: 'Quad.out', onComplete: () => g.destroy() });
  }

  /** 충격파 고리 */
  private shockwave(x: number, y: number, color: number, maxR: number, ms = 320): void {
    const g = this.add.graphics();
    const st = { r: 4, a: 1 };
    this.tweens.add({
      targets: st,
      r: maxR,
      a: 0,
      duration: ms,
      ease: 'Quad.out',
      onUpdate: () => {
        g.clear();
        g.lineStyle(3, color, st.a).strokeEllipse(x, y, st.r * 2, st.r * 1.2);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** 기를 모으는 입자 (바깥에서 영웅 쪽으로 빨려 들어옴) */
  private charge(color: number, ms: number): void {
    const cx = HERO_X + 4;
    const cy = FEET_Y - 20;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const p = this.add.image(cx + Math.cos(a) * 26, cy + Math.sin(a) * 18, 'px').setTint(color).setScale(1.5);
      this.tweens.add({ targets: p, x: cx, y: cy, alpha: 0.2, duration: ms, delay: i * 8, ease: 'Quad.in', onComplete: () => p.destroy() });
    }
  }

  /** 스킬 이름 팝업 */
  private skillTitle(name: string, color: string): void {
    const t = this.add
      .text(VIEW_W / 2 + 10, 58, name, { fontFamily: FONT, fontSize: '12px', color, resolution: 1 })
      .setOrigin(0.5)
      .setShadow(1, 1, OUTLINE, 0, false, true)
      .setScale(1.8);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: 52, delay: 650, duration: 300, onComplete: () => t.destroy() });
  }

  /** 큰 피해 숫자: 크게 튀어나왔다가 작아진다 (화면 밖으로 넘치지 않게) */
  private bigNumber(text: string, x: number, y: number, color: string): void {
    const t = this.add
      .text(0, Math.round(y), text, { fontFamily: FONT, fontSize: '12px', color, resolution: 1 })
      .setOrigin(0.5, 1)
      .setShadow(1, 1, OUTLINE, 0, false, true);
    const end = Math.min(1.3, (VIEW_W - 8) / t.width);
    const half = (t.width * end) / 2;
    t.setX(Math.round(Math.max(4 + half, Math.min(VIEW_W - 4 - half, x))));
    t.setScale(end * 1.8);
    this.tweens.add({ targets: t, scale: end, duration: 160, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, delay: 500, duration: 400, onComplete: () => t.destroy() });
  }

  /** 맞은 몬스터: 하얗게 번쩍 + 크게 밀려남 + 찌그러짐 */
  private monsterImpact(push: number): void {
    const c = this.monster;
    const spr = this.monsterSprite;
    if (!c || !spr) return;
    spr.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(110, () => spr.active && spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.charTint()));
    const base = MON_X + (this.monsterData?.boss ? 8 : 0);
    this.tweens.add({ targets: c, x: base + push, duration: 70, yoyo: true, hold: 60, ease: 'Quad.out' });
    const sx = spr.scaleX;
    const sy = spr.scaleY;
    this.tweens.add({ targets: spr, scaleX: sx * 1.18, scaleY: sy * 0.82, duration: 60, yoyo: true });
  }

  /** 직업 스킬 연출 (피해 계산은 BattleSim 이 이미 했다). 준비 동작 → 돌진/발사 → 히트스톱 → 충격 */
  private castSkill(kind: WeaponKind, hits: { damage: number; crit: boolean }[]): void {
    const spr = this.monsterSprite;
    const tx = this.monster ? this.monster.x : MON_X;
    const ty = FEET_Y - (spr ? spr.displayHeight / 2 : 14);
    const total = hits.reduce((a, h) => a + h.damage, 0);
    const anyCrit = hits.some((h) => h.crit);
    const hs = this.heroSprite;
    this.tweens.killTweensOf(hs);
    this.tweens.killTweensOf(this.hero);
    this.hero.x = HERO_X;

    if (kind === 'sword') {
      // 회오리 베기: 웅크림 → 잔상 남기며 돌진 → X자 베기 + 히트스톱 → 복귀
      audio.play('whirl');
      this.skillTitle('회오리 베기', '#ffe08a');
      this.charge(0xffe08a, 140);
      this.tweens.add({ targets: hs, scaleX: 1.12, scaleY: 0.86, x: -5, duration: 140, ease: 'Quad.out' });
      this.time.delayedCall(140, () => {
        this.attacking = true;
        this.playHero('slash', { duration: 260 });
        hs.setScale(1);
        const dashX = tx - 22;
        const ghost = this.time.addEvent({ delay: 24, repeat: 4, callback: () => this.afterimage(0xffe08a) });
        this.tweens.add({
          targets: this.hero,
          x: dashX,
          duration: 110,
          ease: 'Quad.in',
          onComplete: () => {
            ghost.remove();
            // 맞는 순간
            this.hitStop(90);
            this.punch(1.08, 0xfff4c0, 80);
            this.slashArc(tx - 4, ty, 16, 0xffd84a, -0.6);
            this.slashArc(tx - 4, ty, 16, 0xffffff, 0.6);
            this.shockwave(tx - 4, ty, 0xffe08a, 26);
            this.sparks.setParticleTint(0xffd84a);
            this.sparks.explode(22, tx - 4, ty);
            this.monsterImpact(14);
            this.bigNumber(`${fmt(total)}!`, tx, ty - 10, anyCrit ? UI.crit : '#fff4c0');
            this.shake(160, 0.01);
            this.tweens.add({ targets: this.hero, x: HERO_X, delay: 140, duration: 220, ease: 'Quad.out' });
          },
        });
      });
    } else if (kind === 'bow') {
      // 연사: 뒤로 물러나 활 당기기 → 반동과 함께 5발 → 마지막 발 히트스톱
      audio.play('volley');
      this.skillTitle('연사', '#bfe8ff');
      this.tweens.add({ targets: this.hero, x: HERO_X - 8, duration: 120, ease: 'Quad.out' });
      hs.setTint(0xbfe8ff);
      hits.forEach((h, i) =>
        this.time.delayedCall(120 + i * 75, () => {
          this.afterimage(0xbfe8ff);
          this.tweens.add({ targets: hs, x: -3, duration: 35, yoyo: true });
          if (this.monster) this.shoot('arrow', h.crit || i === hits.length - 1);
          this.time.delayedCall(90, () => {
            this.floatText(fmt(h.damage), tx + (i - 2) * 5, ty - 6 - i * 5, h.crit ? UI.crit : '#bfe8ff', false);
            this.monsterImpact(4 + i);
            if (i === hits.length - 1) {
              this.hitStop(60);
              this.punch(1.05, 0xbfe8ff, 60);
              this.shockwave(tx - 4, ty, 0xbfe8ff, 18, 220);
              this.bigNumber(`${fmt(total)}!`, tx, ty - 12, anyCrit ? UI.crit : '#bfe8ff');
              this.floatText(`${hits.length}연타!`, tx - 18, ty - 30, '#bfe8ff', true);
              hs.setTint(this.charTint());
              this.tweens.add({ targets: this.hero, x: HERO_X, duration: 180 });
            }
          });
        }),
      );
    } else {
      // 메테오: 떠오르며 기 모으기(주변 어두워짐) → 운석 낙하 → 거대한 충격
      audio.play('meteor');
      this.skillTitle('메테오', '#ffb36b');
      const dark = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1a0a2a, 0).setOrigin(0).setDepth(-0.5);
      this.children.moveBelow(dark, this.hero);
      this.tweens.add({ targets: dark, fillAlpha: 0.45, duration: 200 });
      this.tweens.add({ targets: hs, y: -7, duration: 260, ease: 'Sine.out' });
      hs.setTint(0xc9a8ff);
      this.charge(0xc9a8ff, 260);
      this.shockwave(HERO_X + 2, FEET_Y - 18, 0xc9a8ff, 22, 360);
      this.time.delayedCall(240, () => {
        const m = this.add.image(tx + 40, -16, 'orb').setScale(3.5).setTint(0xff8a3a);
        this.tweens.add({ targets: m, angle: 540, duration: 380 });
        this.tweens.add({
          targets: m,
          x: tx,
          y: ty,
          duration: 380,
          ease: 'Quad.in',
          onUpdate: () => {
            this.dust.emitParticleAt(m.x + 4, m.y - 4, 2);
            if (Math.random() < 0.5) this.afterimageAt(m, 0xffb36b);
          },
          onComplete: () => {
            m.destroy();
            this.hitStop(110);
            this.punch(1.1, 0xffffff, 120);
            this.shockwave(tx, ty + 6, 0xff8a3a, 44, 420);
            this.shockwave(tx, ty + 6, 0xfff1b0, 28, 300);
            this.sparks.setParticleTint(0xff8a3a);
            this.sparks.explode(36, tx, ty);
            this.sparks.setParticleTint(0xffe08a);
            this.sparks.explode(16, tx, ty);
            this.monsterImpact(10);
            this.shake(280, 0.014);
            this.bigNumber(`${fmt(total)}!`, tx, ty - 10, anyCrit ? UI.crit : '#ffb36b');
            this.tweens.add({ targets: dark, fillAlpha: 0, duration: 300, onComplete: () => dark.destroy() });
            this.tweens.add({ targets: hs, y: 0, duration: 200 });
            hs.setTint(this.charTint());
          },
        });
      });
    }
  }

  /** 아무 이미지의 잔상 (운석 꼬리) */
  private afterimageAt(src: Phaser.GameObjects.Image, tint: number): void {
    const g = this.add.image(src.x, src.y, src.texture.key).setScale(src.scale * 0.8).setTint(tint).setAlpha(0.5).setAngle(src.angle);
    this.tweens.add({ targets: g, alpha: 0, scale: src.scale * 0.3, duration: 200, onComplete: () => g.destroy() });
  }

  private shoot(tex: 'arrow' | 'orb', crit: boolean): void {
    if (!this.monster || !this.monsterSprite) return;
    const sx = HERO_X + 10;
    const sy = FEET_Y - 22;
    const tx = this.monster.x - 6;
    const ty = FEET_Y - this.monsterSprite.displayHeight / 2 + (this.monsterSprite.y || 0);
    const p = this.add.image(sx, sy, tex).setScale(crit ? 1.5 : 1);
    p.setRotation(Math.atan2(ty - sy, tx - sx));
    this.tweens.add({
      targets: p,
      x: tx,
      y: ty,
      duration: tex === 'arrow' ? 90 : 140,
      ease: tex === 'arrow' ? 'Linear' : 'Sine.in',
      onComplete: () => {
        if (tex === 'orb') {
          this.sparks.setParticleTint(0xc9a8ff);
          this.sparks.explode(crit ? 14 : 6, tx, ty);
        }
        p.destroy();
      },
    });
    if (tex === 'orb') this.tweens.add({ targets: p, angle: 360, duration: 140 });
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
    audio.play('fanfare');
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

  /** 화면 흔들림 (설정에서 끌 수 있음) */
  private shake(ms: number, amount: number): void {
    if (settings.shake) this.cameras.main.shake(ms, amount);
  }

  private regionTitle(name: string): void {
    const t = this.add
      .text(VIEW_W / 2, 30, name, { fontFamily: FONT, fontSize: '12px', color: '#fff4c0', resolution: 1 })
      .setOrigin(0.5)
      .setShadow(1, 1, OUTLINE, 0, false, true)
      .setAlpha(0);
    this.tweens.chain({
      targets: t,
      tweens: [
        { alpha: 1, y: 26, duration: 400 },
        { alpha: 0, delay: 1600, duration: 500 },
      ],
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
