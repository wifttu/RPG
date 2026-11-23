# 계승자들 (Heirs)

가문의 검을 대대로 물려주는 **픽셀 방치형 RPG** 프로토타입.
영웅은 실제 시간으로 나이를 먹고, 은퇴하고, 결혼해서 낳은 자녀 중 한 명이 다음 가주가 됩니다. 특성과 외형은 유전돼요.

- 기획서: [`docs/GDD.md`](docs/GDD.md)
- 아트 가이드 & 이미지 AI 작업법: [`docs/ART_GUIDE.md`](docs/ART_GUIDE.md)
- 이미지 AI 프롬프트 모음: [`docs/PROMPTS.md`](docs/PROMPTS.md)
- 출시 체크리스트: [`docs/RELEASE.md`](docs/RELEASE.md) · 개인정보처리방침 초안: [`docs/PRIVACY.md`](docs/PRIVACY.md)

## 안드로이드 테스트 APK

브랜치에 올릴 때마다 GitHub Actions 가 테스트용 APK 를 만들어요.
GitHub 저장소 → **Actions** → "Android APK" → 최신 실행 → **Artifacts** 의 `heirs-debug-apk`.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173  (휴대폰 화면 비율로 보세요)
npm test           # 유전·전투·밸런스 테스트
npm run build      # dist/ 에 배포용 빌드
npm run build:single  # dist-single/index.html 한 파일로 합친 빌드 (링크 하나로 공유할 때)
npm run build:release # 출시용 빌드 (개발용 버튼 숨김)
npm run android:sync  # 웹 빌드 → 안드로이드 프로젝트에 복사 (그다음 android:open 으로 Android Studio)
```

주소 뒤에 붙이는 개발용 옵션:

| 옵션 | 설명 |
|---|---|
| `?speed=20` | 게임 시간 20배속 (나이·전투) |
| `?reset` | 저장 데이터 지우고 새로 시작 |
| `?gallery` | 모든 스프라이트를 크게 확대해서 보기 |

상점 탭 맨 아래 **개발용** 버튼으로도 배속·나이 +10·초기화를 할 수 있어요.
전투 화면 오른쪽 위 **♪ 소리** 버튼으로 소리를 켜고 끌 수 있어요 (휴대폰은 화면을 한 번 터치해야 소리가 나요).

## 구조

```
src/
  config/balance.ts   모든 밸런스 수치 (확률 공개 표도 여기 값을 그대로 씀)
  core/               게임 규칙 — 화면과 분리 (테스트·오프라인 계산·서버 이전 용이)
    genetics.ts         유전: 능력치 평균+노이즈, 특성 50/75% 유전, 돌연변이
    traits.ts           특성 14종과 돌연변이 등급 확률
    battle.ts           전투 시뮬레이션 (이벤트를 내보내고 화면은 연출만)
    economy.ts          업그레이드 비용, 몬스터 수치, 명성, 오프라인 보상
    stats.ts            능력치 계산, 나이 곡선
    lineage.ts          은퇴 → 혼인 → 후계자
    heirloom.ts         가보 (유산석으로 강화, 대대로 유지)
    daily.ts            출석·일일 임무·월정액
    achievements.ts     업적
    products.ts         인앱 상품과 지급 로직
    clock.ts            시간 조작 방지
    analytics.ts        플레이 기록
    autoplay.ts         밸런스 확인용 자동 플레이
    game.ts             전체 상태·저장·이벤트
  art/                그림 처리(유전자 색칠·지역별 색 변형)와 남은 코드 아트(땅·하늘·구름)
  scenes/BattleScene  Phaser 전투 화면 (패럴랙스 배경, 나이에 따라 새벽→노을→밤)
  ui/                 HUD, 탭(성장·가문·상점), 은퇴/혼인 모달, 튜토리얼(tutorial.ts)
  audio/              코드로 합성하는 8비트 효과음·배경음악 (음원 파일 없음)
  assets/             PixelLab으로 만든 영웅·몬스터·배경·아이콘 (기록: art/PROMPT_LOG.md)
  platform/           앱 전용 기능 (AdMob 광고 등). 웹에서는 꺼짐
android/              Capacitor 안드로이드 프로젝트
tools/
  pixelize.py         이미지 AI 결과 → 진짜 픽셀 스프라이트 (배경 제거, 격자 맞춤, 팔레트 고정)
  palette.hex         프로젝트 공식 64색 팔레트
tests/                vitest
```

## 기술

TypeScript · Phaser 4 · Vite · vitest. 폰트는 [Galmuri](https://github.com/quiple/galmuri) (SIL OFL 1.1).
앱은 Capacitor 8 안드로이드 프로젝트(`android/`) + AdMob 보상형 광고(지금은 테스트 ID). 인앱 결제는 계정 준비 후 연결 (`docs/RELEASE.md`).
