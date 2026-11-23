import { Capacitor } from '@capacitor/core';
import { track } from '../core/analytics';
import { registerAds } from './ads';

/**
 * 앱(안드로이드/iOS)에서만 켜지는 기능.
 * 웹(브라우저·미리보기 링크)에서는 아무것도 하지 않는다.
 */
export const AD_CONFIG = {
  /** Google 공식 테스트 보상형 광고 ID. 출시 전에 AdMob 콘솔에서 만든 실제 광고 단위 ID로 교체 */
  rewardedAndroid: 'ca-app-pub-3940256099942544/5224354917',
  /** 출시 빌드에서 false 로 */
  isTesting: true,
};

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob');
    await AdMob.initialize({ initializeForTesting: AD_CONFIG.isTesting });
    registerAds({
      async showRewarded(placement: string): Promise<boolean> {
        let rewarded = false;
        const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          rewarded = true;
        });
        try {
          await AdMob.prepareRewardVideoAd({ adId: AD_CONFIG.rewardedAndroid, isTesting: AD_CONFIG.isTesting });
          const item = await AdMob.showRewardVideoAd();
          if (item && item.amount > 0) rewarded = true;
        } catch (e) {
          track('ad_error', { placement, msg: String(e).slice(0, 80) });
          return false;
        } finally {
          await handle.remove();
        }
        return rewarded;
      },
    });
    track('native_ready', { platform: Capacitor.getPlatform() });
  } catch (e) {
    // 광고 SDK 를 못 불러와도 게임은 계속 (웹 테스트 광고로 대체)
    track('native_error', { msg: String(e).slice(0, 80) });
  }
}
