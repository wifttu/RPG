# 출시 준비 체크리스트

지금 상태: **앱 프로젝트(안드로이드)와 광고 연결 코드까지 준비됨.** 계정·실제 ID·스토어 등록만 남았어요.
아래를 위에서부터 차례대로 하면 됩니다. ✅ 는 이미 된 것, ⬜ 는 직접 하셔야 하는 것이에요.

## 0. 시험용 APK 받기 (계정 없이 지금 가능)

- ✅ 브랜치에 올릴 때마다 GitHub Actions 가 테스트 APK 를 만들어요 (`.github/workflows/android.yml`).
- ⬜ 받는 법: GitHub 저장소 → **Actions** 탭 → "Android APK" → 가장 최근 실행 → 아래 **Artifacts** 의 `heirs-debug-apk` 다운로드 → 압축 풀고 휴대폰에서 설치 ("출처를 알 수 없는 앱 설치" 허용 필요).
- 광고는 Google **테스트 광고**가 나와요 (실제 수익 없음, 계정 정지 위험 없음).

## 1. 이름 정하기 (한 번 정하면 못 바꿈)

- ⬜ **패키지 이름(appId)**: 지금 `com.heirs.idlerpg` (임시). 본인 것으로 정해서 알려 주시면 바꿔 드려요. 예: `com.본인이름.heirs`
  - 바꿀 곳: `capacitor.config.ts`, `android/app/build.gradle` (applicationId, namespace), Java 패키지 폴더
- ⬜ 게임 이름: 「계승자들」 그대로 갈지

## 2. Google Play 개발자 계정

- ⬜ https://play.google.com/console 가입 (1회 등록비 $25)
- ⬜ 개인 계정은 출시 전 **비공개 테스트(테스터 12명 이상, 14일 이상)** 가 필요해요. 가족·친구에게 부탁할 준비.

## 3. 광고 (AdMob)

- ✅ 보상형 광고 연결 코드 (`src/platform/native.ts`), 광고 제거·월정액이면 광고 없이 보상
- ⬜ https://admob.google.com 가입 → 앱 추가 → **보상형 광고 단위** 만들기
- ⬜ 받은 ID 2개를 알려 주시면 교체해 드려요:
  - 앱 ID (`ca-app-pub-...~...`) → `android/app/src/main/AndroidManifest.xml`
  - 보상형 광고 단위 ID (`ca-app-pub-.../...`) → `src/platform/native.ts` 의 `rewardedAndroid`, 그리고 `isTesting: false`
- ⬜ 개인정보 동의(GDPR/UMP) 메시지: 유럽 출시 시 AdMob 콘솔에서 설정

## 4. 인앱 결제

- ✅ 상품 5종과 지급 로직 (`src/core/products.ts`), 테스트 결제 화면
- ⬜ Play Console → 수익 창출 → 상품에 같은 ID로 등록: `starter`, `monthly`(30일 이용권), `gems550`, `noads`, `gems1200`
- ⬜ 결제 연결 방식 정하기 (추천: RevenueCat — 영수증 검증 서버를 대신 해 줌, 무료 구간 있음). 정하면 연결 코드를 만들어 드려요.
- ⚠️ 결제는 **서버 영수증 검증** 없이 열면 안 돼요 (가짜 결제로 보석을 얻는 해킹이 흔함).

## 5. 저장·시간 서버 (권장)

- ✅ 기기 이전 코드 (서버 없이 휴대폰 변경)
- ✅ 시간 조작 방지 (시계 되돌림 감지, 서버 시간 연결 지점 `clock.setServerTime`)
- ⬜ 클라우드 저장: Google Play 게임즈 서비스 저장 기능 또는 Firebase. 정하면 연결해 드려요.

## 5.5 알림

- ✅ 로컬 알림 (`@capacitor/local-notifications`): 서버·계정 없이 동작. 정확한 알람 권한은 제거해 둠(Play 정책).

## 6. 분석

- ✅ 게임 안 행동 기록 (`src/core/analytics.ts`, 상점 → 개발용 → 플레이 기록)
- ⬜ Firebase Analytics 등 연결 (`addSink` 로 보내기) — 어디서 그만두는지(D1/D7) 보려면 필요

## 7. 스토어 등록 자료

- ⬜ 앱 아이콘 512×512: 임시본 `art/app_icon_512.png` (영웅 얼굴 + 왕관). 이미지 AI로 정식 아이콘 권장
- ⬜ 그래픽 이미지 1024×500, 휴대폰 스크린샷 2~8장 (게임 화면 캡처 + 문구는 `docs/PROMPTS.md` 참고)
- ⬜ 짧은 설명(80자) / 자세한 설명
- ⬜ **개인정보처리방침 웹 주소**: `docs/PRIVACY.md` 초안을 채워서 공개 웹페이지로 올리기
- ⬜ 콘텐츠 등급 설문, 데이터 보안 양식 (광고 ID 수집 = "예")

## 8. 한국 출시 시

- ⬜ 게임물관리위원회 등급분류 (Google Play 자체등급분류로 대체 가능한지 확인)
- ✅ 확률형 아이템 확률 공개 (상점 → 확률표 보기)
- ⬜ 청소년 결제 한도·환불 안내 문구

## 9. 출시 빌드 (계정 준비 후)

- ⬜ 서명 키 만들기 (잃어버리면 업데이트 불가 → 안전하게 보관). Play 앱 서명 사용 권장.
- ⬜ `./gradlew bundleRelease` 로 AAB 만들기 → Play Console 업로드
- ✅ 개발용 버튼(배속·+10살·플레이 기록) 숨기기: `npm run build:release` 로 빌드하면 숨겨져요

## 업데이트할 때

- 게임 내용만 바뀌면: 빌드 → 버전 올리기(`versionCode`) → 업로드 (또는 라이브 업데이트 도입 시 심사 없이)
- 밸런스 수치만: 원격 설정 도입 시 즉시 (`src/config/balance.ts` 를 서버에서 받도록)
