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
