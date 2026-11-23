# 이미지 AI 생성 기록

| 날짜 | 서비스 | 결과 파일 | 내용 | 설정 |
|---|---|---|---|---|
| 2026-11-23 | PixelLab API v2 `create-character-with-4-directions` | 후보 A/B/C | young knight heir, short dark hair, steel breastplate with shoulder pauldron, crimson cape, brown leather belt with gold buckle, crimson tunic, brown leather boots, cute chibi | 48x48, view=side, chibi, medium shading, seed 101/202/303 |
| 2026-11-23 | PixelLab `characters/animations` template `breathing-idle` | hero_b.png 0-3 | 후보 B (character 40dd21e0…) 대기 | east, template |
| 2026-11-23 | PixelLab `characters/animations` template `walking` | hero_b.png 4-9 | 후보 B 걷기 | east, template |
| 2026-11-23 | PixelLab `characters/animations` v3 | hero_b.png 10-18 | "swinging a sword in a fast overhead slash: wind up behind the head, slash down in front, then return to stance" | east, 8 frames (+시작 프레임) |

`src/assets/hero/hero_b.png`: 76×76 칸 19프레임 (대기 4, 걷기 6, 공격 9), 캐릭터는 칸 가운데, 발은 y=60.

## 몬스터 (PixelLab `create-image-pixflux`, 1장당 1회)

공통 설정: view=side, direction=west, single color black outline, medium shading, medium detail, no_background

| 파일 | 크기 | 시드 | 프롬프트 |
|---|---|---|---|
| slime.png | 48 | 11 | cute round green jelly slime monster with a shiny highlight and two small dot eyes, facing left, game enemy sprite |
| mushroom.png | 48 | 12 | walking mushroom monster with a red spotted cap and a small grumpy face on the white stem, tiny feet, facing left, game enemy sprite |
| bat.png | 48 | 13 | small purple cave bat monster with big ears, spread wings and glowing red eyes, flying, facing left, game enemy sprite |
| beetle.png | 48 | 14 | armored blue beetle monster with a glossy split shell, short legs and small horns, facing left, game enemy sprite |
| golem.png | 96 → 64 | 15 | massive stone golem boss with glowing cyan cracks and glowing eyes, heavy rock fists, facing left, game boss sprite (`tools/pixelize.py clean --width 64 --no-palette` 로 축소) |

지역별 색은 `src/art/monsterArt.ts` 의 색상 회전(hue rotate)으로 만든다.

## 배경 (PixelLab `create-image-pixflux`, 192x64, no_background, 1장당 1회)

먼 산(far)은 `detail=low detail, shading=basic shading, outline=lineless`, 중경(mid)은 기본(medium). 결과를 좌우 거울 복사로 이어 붙여 384x64 반복 타일로 만듦.
far2의 해, mid1의 구름 조각은 지웠다 (게임이 해·구름을 따로 그림).

| 파일 | 시드 | 프롬프트 |
|---|---|---|
| far0 | 21 | distant blue mountain range silhouettes with snowy peaks, soft atmospheric blue, wide panorama, no sky |
| mid0 | 22 | rolling green grassy hills with round leafy trees and bushes, bright daytime meadow, wide panorama, empty sky |
| far1 | 23 | distant misty purple mountain range silhouettes, foggy atmosphere, wide panorama, no sky |
| mid1 | 24 | dense dark green pine forest, tall fir trees of different heights, mysterious woods, wide panorama, empty sky |
| far2 | 25 | distant dusty rose desert cliffs and flat-topped mesas, hazy warm atmosphere, wide panorama, no sky |
| mid2 | 26 | ancient ruined sandstone temple, broken stone pillars and crumbling arches, overgrown with a few dry shrubs, wide panorama, empty sky |

(모든 프롬프트 앞에 "side-scrolling game background layer: " 를 붙임)

## 영웅 머리 모양 추가 (시드 202, 영웅 B와 같은 옷 설명에서 머리만 바꿈)

| 파일 | 머리 설명 | 동작 |
|---|---|---|
| hero_long.png | long dark brown hair flowing down the back past the shoulders | breathing-idle, walking, v3 slash (B와 같은 설정) |
| hero_pony.png | dark brown hair tied in a high ponytail | 〃 |

## 아이콘 (PixelLab `create-image-pixflux`, 32x32, no_background, 1장당 1회)

프롬프트 형식: "<대상>, game UI icon, centered, bold readable shape, pixel art"

| 파일 | 시드 | 대상 |
|---|---|---|
| coin.png | 31 | a shiny gold coin with a small embossed crown |
| gem.png | 32 | a sparkling blue diamond gem |
| fame.png | 33 | an orange star medal with a ribbon |
| atk.png | 34 | a steel sword pointing diagonally up to the right |
| hp.png | 35 | a glossy red heart |
| spd.png | 36 | a winged leather boot with a yellow lightning bolt |
| crown.png | 37 | a golden royal crown with red and blue jewels |
| ad.png | 38 | a green play button inside a rounded screen |
