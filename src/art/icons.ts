import adUrl from '../assets/icons/ad.png';
import atkUrl from '../assets/icons/atk.png';
import coinUrl from '../assets/icons/coin.png';
import crownUrl from '../assets/icons/crown.png';
import fameUrl from '../assets/icons/fame.png';
import gemUrl from '../assets/icons/gem.png';
import hpUrl from '../assets/icons/hp.png';
import spdUrl from '../assets/icons/spd.png';

/** PixelLab으로 만든 32x32 아이콘 (art/PROMPT_LOG.md) */
const ART: Record<IconName, string> = {
  coin: coinUrl,
  gem: gemUrl,
  fame: fameUrl,
  atk: atkUrl,
  hp: hpUrl,
  spd: spdUrl,
  crown: crownUrl,
  ad: adUrl,
};

export type IconName = 'coin' | 'gem' | 'fame' | 'atk' | 'hp' | 'spd' | 'crown' | 'ad';

export function iconUrl(name: IconName): string {
  return ART[name];
}

export function iconImg(name: IconName, cls = 'ico'): string {
  return `<img class="${cls}" src="${iconUrl(name)}" alt="" />`;
}
