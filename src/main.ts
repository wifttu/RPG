import Phaser from 'phaser';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import galmuri11b from 'galmuri/dist/Galmuri11-Bold.woff2?url';
import galmuri9 from 'galmuri/dist/Galmuri9.woff2?url';
import { loadHeroSheet } from './art/heroSheet';
import { Game } from './core/game';
import { clearSave } from './core/save';
import { BattleScene, VIEW_H, VIEW_W } from './scenes/BattleScene';
import { UI } from './ui/ui';
import './ui/styles.css';

async function loadFonts(): Promise<void> {
  const fonts = [
    new FontFace('Galmuri11', `url(${galmuri11})`),
    new FontFace('Galmuri11', `url(${galmuri11b})`, { weight: '700' }),
    new FontFace('Galmuri9', `url(${galmuri9})`),
  ];
  await Promise.all(
    fonts.map(async (f) => {
      try {
        document.fonts.add(await f.load());
      } catch {
        /* 폰트 실패 시 기본 폰트로 진행 */
      }
    }),
  );
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.has('gallery')) {
    const { renderGallery } = await import('./gallery');
    renderGallery();
    return;
  }
  if (params.has('reset')) clearSave();

  await Promise.all([loadFonts(), loadHeroSheet()]);

  const core = new Game();
  const speed = Number(params.get('speed'));
  if (speed > 0) core.timeScale = speed;

  new UI(core).mount();

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    backgroundColor: '#14101e',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [new BattleScene(core)],
    banner: false,
  });

  // 앱이 백그라운드로 가거나 닫힐 때 저장 (오프라인 보상 계산 기준 시각)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) core.save();
  });
  window.addEventListener('pagehide', () => core.save());
}

boot();
