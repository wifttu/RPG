/**
 * 보상형 광고 연결 지점.
 * 웹(브라우저·미리보기)에서는 null → UI가 3초 테스트 화면을 띄운다.
 * 안드로이드 앱에서는 src/platform/native.ts 가 AdMob 구현을 등록한다.
 */
export interface RewardedAds {
  showRewarded(placement: string): Promise<boolean>;
}

let impl: RewardedAds | null = null;

export function registerAds(a: RewardedAds): void {
  impl = a;
}

export function nativeAds(): RewardedAds | null {
  return impl;
}
