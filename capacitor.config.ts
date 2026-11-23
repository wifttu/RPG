import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 안드로이드/iOS 앱 설정.
 * appId 는 스토어에 한 번 올리면 바꿀 수 없다 → 출시 전에 본인 도메인/이름으로 정할 것 (docs/RELEASE.md).
 */
const config: CapacitorConfig = {
  appId: 'com.heirs.idlerpg',
  appName: '계승자들',
  webDir: 'dist',
  android: {
    backgroundColor: '#14101e',
  },
};

export default config;
