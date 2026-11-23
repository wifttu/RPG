# 이미지 AI 프롬프트 모음

이미지 AI는 대부분 **영어 프롬프트**를 더 잘 알아들어요. 아래 영어 문장을 그대로 복사해서 쓰고, `{ }` 부분만 바꾸세요.
결과물은 `art/raw/` 에 저장한 뒤 `tools/pixelize.py` 로 다듬어요. (`docs/ART_GUIDE.md` 참고)

---

## 0. 스타일 고정 문구 (모든 게임 안 그림 앞에 붙이기)

```
pixel art, crisp 1px dark purple outline, limited palette, top-left lighting,
3-tone cel shading with hue-shifted shadows, cute chibi proportions (2.5 heads tall),
side view, clean readable silhouette, no anti-aliasing, transparent background
```

**피해야 할 것 (네거티브 프롬프트를 지원하면 넣기):**
```
blurry, anti-aliasing, soft gradient, 3d render, photorealistic, text, watermark, signature,
extra limbs, cropped, multiple characters, background scenery, noise, jpeg artifacts
```

---

## 1. 영웅 (종이인형 레이어)

> PixelLab 권장 설정: 크기 32×32, 방향 east(오른쪽), 배경 투명. 첫 결과가 마음에 들면 그걸 **스타일 참고 이미지**로 고정하세요.

### 1-1. 기준 몸통 (머리카락 없이)
```
{스타일 고정 문구}, 32x32 sprite, young knight heir standing in idle pose facing right,
bald head with no hair (hair will be a separate layer), big expressive eyes,
steel breastplate with shoulder pauldron, crimson cape flowing behind,
brown leather belt with gold buckle, crimson tunic skirt, brown leather boots,
right hand empty and slightly forward (a sword will be attached separately)
```

### 1-2. 머리 모양 레이어 (회색조로 → 코드가 머리색을 칠함)
같은 기준 몸통 이미지를 참고 이미지로 넣고, **인페인팅(부분 수정)** 으로 머리 부분만 생성하는 게 가장 정확해요.
```
{스타일 고정 문구}, hair only layer for the reference character, grayscale hair
using exactly three shades (dark gray, mid gray, light gray), {hairstyle},
same 32x32 canvas and same head position as the reference
```
`{hairstyle}` 예시:
- `short tousled hair with bangs`
- `long straight hair flowing down the back`
- `spiky wild hair`
- `high ponytail tied at the back`
- `braided crown hair` / `curly bob hair` / `side-swept undercut` / `twin buns` (추가 4종)

### 1-3. 무기 (가보 단계별)
```
{스타일 고정 문구}, 16x16 icon of a {weapon} pointing straight up, handle at the bottom center
```
`{weapon}` 예시: `simple iron sword` → `steel longsword with gold crossguard` → `runed knight sword glowing faintly blue` → `crimson family heirloom greatsword with a crest on the guard` → `legendary dragon-bone sword with ember glow`

### 1-4. 애니메이션 (선택)
PixelLab의 애니메이션 기능으로 기준 몸통에서 생성:
- `walk cycle, 4 frames`
- `sword slash attack, 3 frames: wind-up, swing, follow-through`
- `hurt recoil, 1 frame`

---

## 2. 몬스터 (왼쪽을 보도록, 회색조 또는 단색 → 지역 색은 코드가 입힘)

```
{스타일 고정 문구}, {size} sprite, {monster} facing left, idle pose, cute but slightly menacing
```

| 파일 이름 | {size} | {monster} |
|---|---|---|
| slime.png | 24x24 | `round jelly slime monster with a shiny highlight and two small dot eyes` |
| mushroom.png | 24x24 | `walking mushroom monster with a spotted cap and a tiny face on the stem` |
| bat_fly_1~2.png | 26x18 | `small cave bat with big ears and glowing red eyes, wings {up / down}` |
| beetle.png | 26x20 | `armored beetle monster with a glossy split shell and short legs` |
| golem.png (보스) | 48x48 | `massive stone golem boss with glowing cracks and glowing eyes, heavy fists` |

추가 보스 아이디어 (지역별):
- 초록 들판: `giant king slime wearing a tiny crown`
- 안개 숲: `ancient treant boss with moss and glowing sap`
- 잿빛 유적: `cursed armor knight boss with a broken greatsword and purple flames`

---

## 3. 배경 레이어 (좌우로 이어지게)

```
pixel art background layer, side-scrolling game, seamless horizontally tileable,
{width}x{height}, {layer}, {biome}, limited palette, no characters, no text
```

| 지역 | 먼 산 (192x70) | 중경 (192x70) | 땅 (192x40) |
|---|---|---|---|
| 초록 들판 | `distant blue mountain silhouettes with snowy peaks` | `rolling green hills with round trees` | `grass top edge over brown dirt with small stones` |
| 안개 숲 | `misty purple mountains` | `dense dark pine forest silhouettes` | `mossy ground with roots` |
| 잿빛 유적 | `dusty rose desert cliffs` | `ruined stone pillars and broken arches` | `cracked sandstone floor` |

> 배경은 **낮 시간대 색**으로 만들어 주세요. 새벽·노을·밤 색은 게임이 영웅의 나이에 따라 자동으로 입혀요.

---

## 4. 아이콘 (16x16)

```
{스타일 고정 문구}, 16x16 game UI icon of {item}, centered, bold readable shape
```
`{item}` 예시: `a gold coin`, `a blue gem`, `an orange star medal (fame)`, `a crossed sword (attack)`, `a red heart (health)`, `a lightning boot (speed)`, `a royal crown (house)`, `a family tree scroll`, `a wedding ring (marriage)`, `a baby cradle (heir)`

---

## 5. 키아트 · 스토어 이미지 (범용 AI: ChatGPT 이미지 / Gemini / Midjourney)

### 대표 이미지
```
Key art for a mobile pixel-art idle RPG called "Heirs".
A noble family of knights across generations: an elderly grandfather knight in the back passing
a glowing heirloom sword forward to his adult child, who passes it to a young heir in the front.
Sunset sky turning into night stars on one side and dawn on the other, symbolizing a lifetime.
Detailed high-resolution pixel art style, warm and emotional, vertical 9:16 composition,
empty space at the top for the logo. No text.
```

### 앱 아이콘
```
Mobile game app icon, 1024x1024, pixel art, a crimson family crest shield with a sword and a crown,
a small chibi knight heir peeking from behind it, bold silhouette, bright rim light,
readable at small size, no text, rounded-square safe area
```

### 스토어 스크린샷 문구 (한국어, 이미지 위에 직접 얹기)
1. "영웅은 늙고, 피는 이어진다"
2. "결혼하고, 후계자를 고르세요 — 특성이 유전돼요"
3. "1대 시조부터 이어지는 우리 가문 가계도"
4. "꺼 두어도 성장하는 방치형 RPG"
5. "새벽에서 밤까지, 한 영웅의 일생"

---

## 6. 기록 남기기

생성할 때마다 `art/PROMPT_LOG.md` 에 한 줄씩:
```
| 날짜 | 서비스 | 파일 | 프롬프트 요약 | 시드/설정 |
```
