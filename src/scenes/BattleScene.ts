import Phaser from 'phaser';
import { ANIMS, FEET_Y as SHEET_FEET, FRAME, heroLookKey, heroSheetCanvas } from '../art/heroSheet';
import { GRIP_ANGLE, GRIP_OFFSET, HAND, heldWeaponArt, heldWeaponKey } from '../art/heldWeapons';
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
import { heroClass, parseKey, rarityOf, type WeaponKind } from '../core/gear';
import { rankName } from '../core/rank';
import { ARTS, type ArtId } from '../core/skills';
import { settings } from '../core/settings';

export const VIEW_W = 160;
export const VIEW_H = 144;
const GROUND_Y = 108;
const HERO_X = 50;
const MON_X = 98;
const FEET_Y = GROUND_Y + 5;
const FONT = 'Galmuri11, monospace';

const SHADOW_TINT = 0x6a4aa8;

/** 스킬이 '맞는 순간'까지 걸리는 시간 (처치 연출을 그때까지 미룬다) */
const SKILL_IMPACT_MS: Record<WeaponKind, number> = { sword: 260, bow: 520, staff: 640 };

const MONSTER_KINDS: Exclude<MonsterKind, 'shadow'>[] = ['slime', 'mushroom', 'bat', 'beetle', 'golem', 'yeti', 'dragon'];

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
  /** 손에 든 무기 */
  private weapon!: Phaser.GameObjects.Image;
  private weaponKind: WeaponKind = 'sword';
  private weaponRarity = 0;
  /** 공격·스킬 때 무기를 드는 각도 (도) */
  private pose = { a: 0, dx: 0, dy: 0 };
  /** 비기·스킬용 추가 입자 (빛나게 더하기 합성) */
  private fx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rise!: Phaser.GameObjects.Particles.ParticleEmitter;
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
    this.weapon = this.add.image(0, 0, '__DEFAULT');
    this.hero = this.add.container(HERO_X, FEET_Y, [shadow, this.heroSprite, this.weapon]);
    this.playHero('idle');
    this.refreshWeapon();
    this.core.on('change', () => this.refreshWeapon());

    this.bars = this.add.graphics();

    this.fx = this.add.particles(0, 0, 'px3', {
      speed: { min: 40, max: 150 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250, max: 650 },
      scale: { start: 1, end: 0 },
      gravityY: 140,
      blendMode: 'ADD',
      emitting: false,
    });
    this.fx.setDepth(5);
    this.rise = this.add.particles(0, 0, 'px', {
      speedX: { min: -14, max: 14 },
      speedY: { min: -70, max: -25 },
      lifespan: { min: 500, max: 1000 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      emitting: false,
    });
    this.rise.setDepth(5);
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

  // ───────────────────────── 손에 든 무기 ─────────────────────────
  /** 무기 텍스처를 (없으면) 만들어 등록 */
  private weaponTex(kind: WeaponKind, rarity: number, drawn = false): string {
    const key = heldWeaponKey(kind, rarity, drawn);
    if (!this.textures.exists(key)) this.textures.addCanvas(key, heldWeaponArt(kind, rarity, drawn).canvas);
    return key;
  }

  /** 장착한 무기(종류·희귀도)를 손에 쥐여 준다. 장비가 바뀔 때마다 */
  private refreshWeapon(): void {
    const k = this.core.state.gear?.equipped.weapon;
    const kind = heroClass(this.core.state).kind;
    const rarity = k ? rarityOf(parseKey(k).tier) : 0;
    const key = heldWeaponKey(kind, rarity);
    if (this.weapon.texture.key === key) return;
    this.weaponKind = kind;
    this.weaponRarity = rarity;
    const art = heldWeaponArt(kind, rarity);
    this.weapon.setTexture(this.weaponTex(kind, rarity));
    this.weapon.setOrigin(art.pivotX / art.canvas.width, art.pivotY / art.canvas.height);
    this.weapon.setTint(this.charTint());
    this.placeWeapon();
  }

  /** 프레임마다 손 위치에 무기를 붙인다 */
  private placeWeapon(): void {
    const hs = this.heroSprite;
    const w = this.weapon;
    const f = Number(hs.frame.name) || 0;
    // 전사의 베기 프레임에는 시트에 검이 그려져 있다
    if (f >= HAND.length) {
      w.setVisible(this.weaponKind !== 'sword');
      if (this.weaponKind === 'sword') return;
    } else w.setVisible(true);
    const h = HAND[Math.min(f, HAND.length - 1)];
    const o = GRIP_OFFSET[this.weaponKind];
    w.x = hs.x + (h.x + o.x - FRAME / 2) * hs.scaleX + this.pose.dx;
    w.y = hs.y + (h.y + o.y - SHEET_FEET) * hs.scaleY + this.pose.dy;
    w.angle = GRIP_ANGLE[this.weaponKind] + h.swing * (this.weaponKind === 'sword' ? 1 : 0.5) + this.pose.a;
    w.alpha = hs.alpha;
  }

  /** 무기 끝(화살·마법이 나가는 곳)의 화면 좌표 */
  private weaponTip(): { x: number; y: number } {
    this.placeWeapon();
    const art = heldWeaponArt(this.weaponKind, this.weaponRarity);
    const r = this.weapon.rotation;
    const c = Math.cos(r);
    const sn = Math.sin(r);
    return {
      x: this.hero.x + this.weapon.x + art.tipX * c - art.tipY * sn,
      y: this.hero.y + this.weapon.y + art.tipX * sn + art.tipY * c,
    };
  }

  /** 활시위를 당겼다 놓는다 */
  private drawBow(holdMs = 90): void {
    if (this.weaponKind !== 'bow') return;
    this.weapon.setTexture(this.weaponTex('bow', this.weaponRarity, true));
    this.time.delayedCall(holdMs, () => {
      if (this.weaponKind === 'bow') this.weapon.setTexture(this.weaponTex('bow', this.weaponRarity));
    });
  }

  /** 무기를 휘두르듯 각도를 잠깐 바꾼다 */
  private posePunch(a: number, ms: number, dx = 0, dy = 0): void {
    this.tweens.killTweensOf(this.pose);
    this.tweens.add({ targets: this.pose, a, dx, dy, duration: ms, yoyo: true, ease: 'Quad.out' });
  }

  /** 무기 끝이 반짝 */
  private tipFlash(color: number, r = 4): void {
    const t = this.weaponTip();
    const c = this.add.circle(t.x, t.y, r, color, 0.9).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 200, onComplete: () => c.destroy() });
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
    const px3 = document.createElement('canvas');
    px3.width = px3.height = 3;
    const p3 = px3.getContext('2d')!;
    p3.fillStyle = '#fff';
    p3.fillRect(0, 1, 3, 1);
    p3.fillRect(1, 0, 1, 3);
    t.addCanvas('px3', px3);
    // 반짝이 (5x5 십자)
    const st5 = document.createElement('canvas');
    st5.width = st5.height = 5;
    const s5 = st5.getContext('2d')!;
    s5.fillStyle = '#fff';
    s5.fillRect(0, 2, 5, 1);
    s5.fillRect(2, 0, 1, 5);
    s5.fillRect(1, 1, 3, 3);
    t.addCanvas('star5', st5);

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
    // 보너스 상자 (닫힘 / 열림) 12x10
    const chest = (open: boolean) => {
      const c = document.createElement('canvas');
      c.width = 12;
      c.height = 10;
      const x = c.getContext('2d')!;
      x.fillStyle = '#2a1608';
      x.fillRect(0, open ? 4 : 2, 12, open ? 6 : 8);
      x.fillStyle = '#9a5a26';
      x.fillRect(1, 5, 10, 4);
      x.fillStyle = '#c47a34';
      x.fillRect(1, 5, 10, 1);
      if (open) {
        x.fillStyle = '#ffe08a';
        x.fillRect(2, 4, 8, 1);
        x.fillStyle = '#2a1608';
        x.fillRect(0, 0, 12, 3);
        x.fillStyle = '#c47a34';
        x.fillRect(1, 1, 10, 1);
      } else {
        x.fillStyle = '#c47a34';
        x.fillRect(1, 3, 10, 2);
      }
      x.fillStyle = '#ffd84a';
      x.fillRect(5, open ? 5 : 4, 2, 2);
      x.fillRect(0, 7, 12, 1);
      return c;
    };
    t.addCanvas('chest', chest(false));
    t.addCanvas('chest-open', chest(true));
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
    this.weapon?.setTint(charTint);
    if (this.monsterData?.kind !== 'shadow') this.monsterSprite?.setTint(charTint);

    // 해/달: 왼쪽에서 떠서 오른쪽으로 진다
    const arcT = Math.min(1, t / 0.95);
    this.sun.setPosition(14 + arcT * (VIEW_W - 28), 76 - Math.sin(arcT * Math.PI) * 60);
    const night = Phaser.Math.Clamp((t - 0.88) / 0.12, 0, 1);
    this.sun.setFillStyle(night > 0.5 ? 0xe8ecff : t > 0.7 ? 0xffb066 : 0xfff1b0);
    this.stars.setAlpha(night);
  }

  /** 몬스터 원래 색 (선조의 그림자는 어두운 보랏빛) */
  private monTint(): number {
    return this.monsterData?.kind === 'shadow' ? SHADOW_TINT : this.charTint();
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

    this.placeWeapon();
    // 영웅·전설 무기는 끝에서 반짝인다
    if (this.weaponRarity >= 3 && this.weapon.visible && !this.heroDown && Math.random() < dt * (this.weaponRarity === 4 ? 6 : 3)) {
      const t = this.weaponTip();
      this.rise.setParticleTint(this.weaponRarity === 4 ? 0xffd27a : 0xd9a8ff);
      this.rise.emitParticleAt(t.x + Phaser.Math.Between(-2, 2), t.y + Phaser.Math.Between(-2, 2), 1);
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
      if (e.type === 'skill' || e.type === 'art') {
        const ms = e.type === 'skill' ? (this.castSkill(e.kind, e.hits), SKILL_IMPACT_MS[e.kind]) : this.castArt(e.id, e.hits, e.heal);
        if (ms <= 0) continue;
        this.holding = true;
        this.time.delayedCall(ms, () => {
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
      case 'trialStart':
        this.banner(`승급 시련 · ${rankName(e.rank)}`, '#c9a8ff');
        audio.play('boss');
        break;
      case 'trialWin':
        this.time.delayedCall(300, () => {
          this.banner(`칭호 획득! ${rankName(e.rank)}`, '#ffe08a');
          this.punch(1.06, 0xfff4c0, 140);
          this.shockwave(HERO_X, FEET_Y - 16, 0xffe08a, 40, 500);
          this.sparks.setParticleTint(0xffe08a);
          this.sparks.explode(30, HERO_X, FEET_Y - 20);
          audio.play('fanfare');
        });
        break;
      case 'trialFail':
        this.banner(e.reason === 'timeout' ? '시련 시간 초과' : '시련 실패', '#ffb36b');
        this.clearMonster();
        break;
      case 'bonusChest':
        this.bonusChest(e.gold);
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
    const shadow = m.kind === 'shadow';
    // 선조의 그림자: 지금 가주의 모습을 뒤집어 어둡게 (자기 자신과 싸우는 시련)
    const spr = shadow
      ? this.add.sprite(0, 0, this.heroSprite.texture.key, 0).setOrigin(0.5, SHEET_FEET / FRAME).setFlipX(true)
      : this.add.sprite(0, 0, `mon-${m.kind}-${b}`).setOrigin(0.5, 1);
    if (shadow) {
      this.monsterData = m;
      spr.play(`${this.heroAnimBase}-idle`);
      this.tweens.add({ targets: spr, alpha: 0.8, duration: 500, yoyo: true, repeat: -1 });
    }
    spr.setTint(shadow ? SHADOW_TINT : this.charTint());
    if (m.kind === 'bat') {
      // 날갯짓: 위아래로 떠다니며 살짝 눌렸다 펴진다
      spr.y = -12;
      this.tweens.add({ targets: spr, y: -18, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: spr, scaleY: 0.88, duration: 160, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    if (m.kind === 'mushroom' || m.kind === 'beetle') this.tweens.add({ targets: spr, scaleY: 0.95, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (m.kind === 'slime') this.tweens.add({ targets: spr, scaleY: 0.9, scaleX: 1.06, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (m.rank === 'elite') this.tweens.add({ targets: spr, alpha: 0.85, duration: 400, yoyo: true, repeat: -1 });
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (shadow) {
      // 그림자도 같은 무기를 든다 (좌우 반전)
      const h = HAND[0];
      const o = GRIP_OFFSET[this.weaponKind];
      const art = heldWeaponArt(this.weaponKind, this.weaponRarity);
      const w = this.add
        .image(-(h.x + o.x - FRAME / 2), h.y + o.y - SHEET_FEET, this.weaponTex(this.weaponKind, this.weaponRarity))
        .setOrigin(1 - art.pivotX / art.canvas.width, art.pivotY / art.canvas.height)
        .setFlipX(true)
        .setAngle(-GRIP_ANGLE[this.weaponKind])
        .setTint(SHADOW_TINT);
      parts.push(w);
    }
    const ell = this.add.ellipse(0, 0, m.rank === 'trial' ? 22 : m.boss ? 46 : 28, 6, m.rank === 'elite' ? 0x7a0010 : m.rank === 'trial' ? 0x3a1a6a : 0x000000, m.rank === 'mob' ? 0.28 : 0.45);
    const c = this.add.container(VIEW_W + 20, FEET_Y, [ell, spr, ...parts]);
    // 스테이지 보스(정예): 같은 몬스터를 크게, 붉은 그림자
    if (m.rank === 'elite') c.setScale(1.35);
    this.tweens.add({ targets: c, x: MON_X + (m.boss && !shadow ? 8 : 0), duration: 220, ease: 'Quad.out' });
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
        // 지팡이를 앞으로 내밀며 보석이 번쩍
        this.posePunch(24, 70, 3, -2);
        this.tipFlash(0xc9a8ff, 3);
      } else {
        // 시위를 당겼다 놓는다
        this.drawBow(Math.min(110, interval * 0.5));
        this.posePunch(-4, 60, -2, 0);
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
      this.time.delayedCall(70, () => spr.active && spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.monTint()));
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
  private skillTitle(name: string, color: string, y = 58): void {
    const t = this.add
      .text(VIEW_W / 2 + 10, y, name, { fontFamily: FONT, fontSize: '12px', color, resolution: 1 })
      .setOrigin(0.5)
      .setShadow(1, 1, OUTLINE, 0, false, true)
      .setScale(1.8);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: y - 6, delay: 650, duration: 300, onComplete: () => t.destroy() });
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
    this.time.delayedCall(110, () => spr.active && spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.monTint()));
    const base = MON_X + (this.monsterData?.boss && this.monsterData.kind !== 'shadow' ? 8 : 0);
    this.tweens.add({ targets: c, x: base + push, duration: 70, yoyo: true, hold: 60, ease: 'Quad.out' });
    const sx = spr.scaleX;
    const sy = spr.scaleY;
    this.tweens.add({ targets: spr, scaleX: sx * 1.18, scaleY: sy * 0.82, duration: 60, yoyo: true });
  }

  // ───────────────────────── 가문 비기 연출 ─────────────────────────
  /** 마법진: 두 겹 고리 + 돌아가는 룬 점 */
  private magicCircle(x: number, y: number, color: number, r: number, ms: number, flat = 0.45): void {
    const g = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    const st = { t: 0, s: 0.2, a: 1 };
    this.tweens.add({ targets: st, s: 1, duration: 160, ease: 'Back.out' });
    this.tweens.add({ targets: st, a: 0, delay: ms - 200, duration: 200 });
    this.tweens.add({
      targets: st,
      t: 1,
      duration: ms,
      onUpdate: () => {
        g.clear();
        const R = r * st.s;
        g.lineStyle(1, color, st.a).strokeEllipse(x, y, R * 2, R * 2 * flat);
        g.lineStyle(1, color, st.a * 0.7).strokeEllipse(x, y, R * 1.4, R * 1.4 * flat);
        for (let i = 0; i < 8; i++) {
          const ang = st.t * Math.PI * 2 + (i / 8) * Math.PI * 2;
          g.fillStyle(0xffffff, st.a).fillRect(Math.round(x + Math.cos(ang) * R * 0.85), Math.round(y + Math.sin(ang) * R * 0.85 * flat), 1, 1);
        }
      },
      onComplete: () => g.destroy(),
    });
  }

  /** 색 번쩍임 (화면 흔들림 끔 설정에서도 약하게는 보여 준다) */
  private colorFlash(color: number, ms = 90): void {
    this.cameras.main.flash(ms, (color >> 16) & 255, (color >> 8) & 255, color & 255);
  }

  /** 빛나는 입자 폭발 */
  private burst(x: number, y: number, color: number, n: number): void {
    this.fx.setParticleTint(color);
    this.fx.explode(n, x, y);
  }

  /** 지그재그 번개 한 줄기 (굵은 겉 + 흰 속, 가지 1~2개) */
  private bolt(x: number, y1: number, color: number, thick: number): void {
    const g = this.add.graphics().setDepth(4);
    const pts: [number, number][] = [[x + Phaser.Math.Between(-4, 4), -4]];
    let cx = pts[0][0];
    for (let y = 8; y < y1; y += 8) {
      cx += Phaser.Math.Between(-6, 6);
      pts.push([cx, y]);
    }
    pts.push([x, y1]);
    const stroke = (w: number, c: number, list: [number, number][]) => {
      g.lineStyle(w, c, 1).beginPath();
      g.moveTo(list[0][0], list[0][1]);
      for (const p of list.slice(1)) g.lineTo(p[0], p[1]);
      g.strokePath();
    };
    stroke(thick + 2, color, pts);
    stroke(1, 0xffffff, pts);
    // 가지
    for (let k = 0; k < 2; k++) {
      const i = Phaser.Math.Between(1, Math.max(1, pts.length - 3));
      const [bx, by] = pts[i];
      const br: [number, number][] = [[bx, by], [bx + Phaser.Math.Between(-12, 12), by + 7], [bx + Phaser.Math.Between(-16, 16), by + 14]];
      stroke(1, color, br);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 220, delay: 40, onComplete: () => g.destroy() });
  }

  /** 비기 연출. 돌려주는 값 = 맞는 순간까지 걸리는 시간(ms) — 그동안 처치 연출을 미룬다 */
  private castArt(id: ArtId, hits: { damage: number; crit: boolean }[], heal: number): number {
    const a = ARTS[id];
    const col = Phaser.Display.Color.HexStringToColor(a.color).color;
    const tx = this.monster ? this.monster.x : MON_X;
    const ty = FEET_Y - (this.monsterSprite ? this.monsterSprite.displayHeight / 2 : 14);
    const total = hits.reduce((x, h) => x + h.damage, 0);
    const anyCrit = hits.some((h) => h.crit);
    const num = () => total > 0 && this.bigNumber(`${fmt(total)}${anyCrit ? '!' : ''}`, tx, ty - 10, anyCrit ? UI.crit : a.color);
    const hs = this.heroSprite;
    this.skillTitle(a.name, a.color, 46);
    // 공통 준비 동작: 무기를 치켜들고 발밑에서 빛
    this.posePunch(this.weaponKind === 'sword' ? -70 : 25, 120, 0, -2);
    this.burst(HERO_X, FEET_Y - 2, col, 8);

    if (id === 'flame') {
      // 무기 끝에 불꽃이 모였다가 → 불덩이 → 폭발
      audio.play('whirl', 0.6);
      const tip = this.weaponTip();
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const p = this.add.image(tip.x + Math.cos(ang) * 14, tip.y + Math.sin(ang) * 10, 'px3').setTint(col).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: p, x: tip.x, y: tip.y, duration: 110, ease: 'Quad.in', onComplete: () => p.destroy() });
      }
      this.time.delayedCall(110, () => {
        audio.play('crit');
        const from = this.weaponTip();
        const ball = this.add.image(from.x, from.y, 'orb').setScale(2.4).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
        const core = this.add.circle(from.x, from.y, 3, 0xfff1b0).setDepth(4);
        this.tweens.add({ targets: ball, angle: 540, duration: 190 });
        this.tweens.add({
          targets: [ball, core],
          x: tx - 2,
          y: ty,
          duration: 190,
          ease: 'Quad.in',
          onUpdate: () => {
            this.rise.setParticleTint(Math.random() < 0.5 ? col : 0xffe08a);
            this.rise.emitParticleAt(ball.x, ball.y, 2);
          },
          onComplete: () => {
            ball.destroy();
            core.destroy();
            this.hitStop(70);
            this.punch(1.07, 0xffc080, 90);
            this.shockwave(tx - 2, ty, 0xff8a3a, 34, 380);
            this.shockwave(tx - 2, ty, 0xfff1b0, 20, 260);
            this.burst(tx - 2, ty, 0xff8a3a, 26);
            this.burst(tx - 2, ty, 0xffe08a, 14);
            this.rise.setParticleTint(0xff8a3a);
            this.rise.explode(16, tx, FEET_Y - 4);
            this.monsterImpact(10);
            this.shake(160, 0.009);
            // 불타는 깜빡임
            const spr = this.monsterSprite;
            for (let k = 0; k < 3; k++)
              this.time.delayedCall(140 + k * 120, () => {
                if (!spr?.active) return;
                spr.setTintMode(Phaser.TintModes.FILL).setTint(0xff8a3a);
                this.time.delayedCall(50, () => spr.active && spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.monTint()));
              });
            num();
          },
        });
      });
      return 300;
    }

    if (id === 'frost') {
      // 적 발밑 마법진 → 하늘에서 얼음 창이 꽂히고 → 산산조각 + 얼어붙음
      audio.play('volley', 0.6);
      this.magicCircle(tx, FEET_Y, col, 22, 700);
      const spear = (i: number) => {
        const g = this.add.graphics().setDepth(4);
        g.fillStyle(col, 1).fillTriangle(0, -10, 3, 0, -3, 0).fillTriangle(0, 9, 3, 0, -3, 0);
        g.fillStyle(0xffffff, 1).fillTriangle(0, -8, 1, 0, -1, 0);
        const sx = tx + 34 + i * 10;
        g.setPosition(sx, -14).setAngle(-140);
        const trail = this.time.addEvent({
          delay: 20,
          repeat: 8,
          callback: () => {
            const p = this.add.image(g.x, g.y, 'px3').setTint(0xdff6ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
            this.tweens.add({ targets: p, alpha: 0, scale: 0.3, duration: 220, onComplete: () => p.destroy() });
          },
        });
        this.tweens.add({
          targets: g,
          x: tx - 2 + i * 4,
          y: ty,
          duration: 150,
          delay: i * 150,
          ease: 'Quad.in',
          onComplete: () => {
            trail.remove();
            g.destroy();
            audio.play('hit');
            this.hitStop(40);
            this.colorFlash(0xbfe8ff, 60);
            this.burst(tx - 2, ty, 0xffffff, 12);
            this.burst(tx - 2, ty, col, 16);
            this.shockwave(tx, ty, col, 22 + i * 8, 300);
            this.monsterImpact(5);
            const spr = this.monsterSprite;
            if (spr?.active) {
              spr.setTintMode(Phaser.TintModes.FILL).setTint(0xbfe8ff);
              this.time.delayedCall(260, () => spr.active && spr.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.monTint()));
            }
            if (i === hits.length - 1) {
              num();
              this.rise.setParticleTint(0xdff6ff);
              this.rise.explode(14, tx, ty);
            }
          },
        });
      };
      hits.forEach((_, i) => spear(i));
      return 150 * hits.length + 80;
    }

    if (id === 'quake') {
      // 높이 뛰어올라 → 땅을 내리찍으면 → 갈라진 땅이 적까지 → 바위가 솟구친다
      audio.play('whirl', 0.5);
      this.tweens.add({ targets: hs, y: -14, duration: 140, ease: 'Quad.out' });
      this.time.delayedCall(140, () =>
        this.tweens.add({
          targets: hs,
          y: 0,
          duration: 80,
          ease: 'Quad.in',
          onComplete: () => {
            audio.play('boss', 0.4);
            this.hitStop(70);
            this.punch(1.06, 0xd8a860, 80);
            this.shake(320, 0.016);
            this.shockwave(HERO_X, FEET_Y, col, 30, 360);
            this.dust.emitParticleAt(HERO_X - 6, FEET_Y - 1, 12);
            // 땅이 갈라지는 금
            const g = this.add.graphics().setDepth(3);
            const st = { t: 0 };
            this.tweens.add({
              targets: st,
              t: 1,
              duration: 120,
              onUpdate: () => {
                g.clear();
                g.lineStyle(2, 0xffb36b, 1).beginPath();
                let x = HERO_X + 6;
                g.moveTo(x, FEET_Y);
                const end = HERO_X + 6 + (tx - HERO_X - 6) * st.t;
                let k = 0;
                while (x < end) {
                  x = Math.min(end, x + 6);
                  g.lineTo(x, FEET_Y + (k++ % 2 ? 1 : -1));
                }
                g.strokePath();
              },
            });
            this.tweens.add({ targets: g, alpha: 0, delay: 360, duration: 300, onComplete: () => g.destroy() });
            this.time.delayedCall(120, () => {
              // 바위 기둥 + 파편
              for (let i = 0; i < 3; i++) {
                const rock = this.add
                  .triangle(tx - 10 + i * 10, FEET_Y + 3, 0, 14 + i * 4, 4, 0, 8, 14 + i * 4, 0x9a7a52)
                  .setOrigin(0.5, 1)
                  .setStrokeStyle(1, 0x2a1a10)
                  .setDepth(3)
                  .setScale(1, 0);
                this.tweens.add({ targets: rock, scaleY: 1, duration: 90, delay: i * 40, yoyo: true, hold: 200, ease: 'Back.out', onComplete: () => rock.destroy() });
              }
              this.burst(tx, FEET_Y - 4, 0xd8a860, 22);
              this.dust.emitParticleAt(tx, FEET_Y - 1, 14);
              const m = this.monster;
              if (m) this.tweens.add({ targets: m, y: FEET_Y - 12, duration: 120, yoyo: true, ease: 'Quad.out' });
              this.monsterImpact(4);
              num();
            });
          },
        }),
      );
      return 340;
    }

    if (id === 'thunder') {
      // 하늘이 어두워지고 → 마법진 → 번개 세 줄기 (마지막이 가장 굵다)
      audio.play('meteor', 0.5);
      const dark = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0a0a20, 0).setOrigin(0).setDepth(2);
      this.tweens.add({ targets: dark, fillAlpha: 0.5, duration: 120 });
      this.magicCircle(tx, 18, col, 20, 600, 0.35);
      hits.forEach((_, i) =>
        this.time.delayedCall(100 + i * 120, () => {
          const last = i === hits.length - 1;
          this.bolt(tx + (last ? 0 : (i - 1) * 6), ty, col, last ? 3 : 1);
          audio.play('crit');
          this.colorFlash(0xffffff, last ? 110 : 50);
          this.hitStop(last ? 70 : 30);
          this.burst(tx, ty, col, last ? 26 : 12);
          this.monsterImpact(3 + i);
          if (last) {
            this.shockwave(tx, ty, col, 30, 320);
            this.shake(200, 0.01);
            num();
            this.tweens.add({ targets: dark, fillAlpha: 0, delay: 120, duration: 300, onComplete: () => dark.destroy() });
          }
        }),
      );
      return 100 + 120 * hits.length;
    }

    if (id === 'heal') {
      // 발밑 초록 마법진 + 빛기둥 + 반짝이가 올라간다
      audio.play('reward', 0.8);
      this.magicCircle(HERO_X, FEET_Y, col, 18, 900);
      const pillar = this.add.rectangle(HERO_X, FEET_Y, 16, FEET_Y + 4, col, 0.4).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(4).setScale(0.3, 0);
      const core = this.add.rectangle(HERO_X, FEET_Y, 4, FEET_Y + 4, 0xffffff, 0.7).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(4).setScale(1, 0);
      this.tweens.add({ targets: pillar, scaleY: 1, scaleX: 1, duration: 200, ease: 'Quad.out' });
      this.tweens.add({ targets: core, scaleY: 1, duration: 160, ease: 'Quad.out' });
      this.tweens.add({ targets: [pillar, core], alpha: 0, delay: 420, duration: 300, onComplete: () => (pillar.destroy(), core.destroy()) });
      for (let i = 0; i < 14; i++) {
        const p = this.add
          .image(HERO_X + Phaser.Math.Between(-12, 12), FEET_Y - Phaser.Math.Between(0, 8), i % 3 ? 'px3' : 'star5')
          .setTint(i % 2 ? col : 0xffffff)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(4);
        this.tweens.add({ targets: p, y: p.y - Phaser.Math.Between(26, 44), alpha: 0, duration: 700, delay: i * 35, ease: 'Sine.out', onComplete: () => p.destroy() });
      }
      hs.setTintMode(Phaser.TintModes.FILL).setTint(col);
      this.time.delayedCall(90, () => hs.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.charTint()));
      this.colorFlash(0x7ce68a, 80);
      if (heal > 0) this.bigNumber(`+${fmt(heal)}`, HERO_X + 26, FEET_Y - 26, '#7ce68a');
      return 0;
    }

    // fury: 포효 → 붉은 충격파 → 광폭이 끝날 때까지 몸에서 불꽃 + 속도선
    audio.play('boss', 0.5);
    this.punch(1.05, 0xff8a8a, 80);
    this.shockwave(HERO_X, FEET_Y - 16, col, 30, 360);
    this.time.delayedCall(100, () => this.shockwave(HERO_X, FEET_Y - 16, 0xffb36b, 20, 300));
    this.bigNumber('광폭!', HERO_X + 26, FEET_Y - 28, a.color);
    hs.setTintMode(Phaser.TintModes.FILL).setTint(col);
    this.time.delayedCall(110, () => hs.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.charTint()));
    const aura = this.time.addEvent({
      delay: 60,
      loop: true,
      callback: () => {
        if (!this.core.sim.hasted) {
          aura.remove();
          return;
        }
        this.rise.setParticleTint(Math.random() < 0.6 ? col : 0xffb36b);
        this.rise.emitParticleAt(HERO_X + Phaser.Math.Between(-7, 7), FEET_Y - Phaser.Math.Between(2, 30), 1);
        if (Math.random() < 0.35) {
          const ln = this.add.rectangle(HERO_X - 10, FEET_Y - Phaser.Math.Between(6, 34), Phaser.Math.Between(6, 14), 1, 0xffffff, 0.7).setOrigin(1, 0.5);
          this.tweens.add({ targets: ln, x: ln.x - 18, alpha: 0, duration: 200, onComplete: () => ln.destroy() });
        }
      },
    });
    return 0;
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
      // 검을 뒤로 젖혀 힘을 모은다 (베기 프레임부터는 시트의 검)
      this.tweens.add({ targets: this.pose, a: -150, dx: -4, dy: -4, duration: 140, ease: 'Quad.out', onComplete: () => Object.assign(this.pose, { a: 0, dx: 0, dy: 0 }) });
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
          this.drawBow(50);
          this.tipFlash(0xbfe8ff, 2);
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
      // 지팡이를 하늘로 치켜든다
      this.tweens.killTweensOf(this.pose);
      this.tweens.add({ targets: this.pose, a: 30, dx: 2, dy: -6, duration: 220, ease: 'Back.out' });
      this.time.delayedCall(120, () => this.tipFlash(0xffb36b, 5));
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
            this.tweens.add({ targets: this.pose, a: 0, dx: 0, dy: 0, duration: 220 });
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
    const tip = this.weaponTip();
    const sx = tip.x;
    const sy = tip.y;
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

  /** 보너스 게이지가 차면: 상자가 떨어져 튀고 → 열리며 → 코인이 쏟아져 골드 쪽으로 */
  private bonusChest(gold: number): void {
    const x = HERO_X + 22;
    const c = this.add.image(x, 30, 'chest').setOrigin(0.5, 1).setScale(1.6);
    audio.play('boss');
    this.tweens.chain({
      targets: c,
      tweens: [
        { y: FEET_Y, duration: 320, ease: 'Bounce.out' },
        { scaleX: 1.9, scaleY: 1.3, duration: 90, yoyo: true },
      ],
      onComplete: () => {
        c.setTexture('chest-open');
        audio.play('coin');
        this.sparks.setParticleTint(0xffe08a);
        this.sparks.explode(18, x, FEET_Y - 10);
        for (let i = 0; i < 10; i++) {
          const coin = this.add.image(x, FEET_Y - 10, 'coin');
          this.tweens.chain({
            targets: coin,
            tweens: [
              { x: x + Phaser.Math.Between(-26, 26), y: FEET_Y - Phaser.Math.Between(26, 48), duration: 280, ease: 'Quad.out' },
              { x: 14, y: -6, duration: 460, delay: i * 35, ease: 'Quad.in' },
            ],
            onComplete: () => coin.destroy(),
          });
        }
        this.bigNumber(`보너스 +${fmt(gold)}`, x, FEET_Y - 50, UI.gold);
        this.tweens.add({ targets: c, alpha: 0, delay: 700, duration: 300, onComplete: () => c.destroy() });
      },
    });
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
