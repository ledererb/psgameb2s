# Snacky Dash 3D — Portrait (mobil) nézet + fullscreen/PWA

Dátum: 2026-07-24
Állapot: jóváhagyva (brainstorming után)
Előzmény: `2026-07-24-pacing-es-latvany-design.md` (lezárva)

## 1. Cél és háttér

A játék jelenleg fix 2:1 (800×400) letterbox canvas-szal renderel — portrait (álló) telefonos
képernyőn egy keskeny sávra zsugorodik, a HUD olvashatatlanul kicsi lesz. Kérés:

1. **Subway Surfers-szerű portrait élmény:** a hátulnézetes 3D nézet marad, de álló
   képernyőn is töltse ki azt, mindhárom sáv látszódjon, a HUD olvasható legyen.
   Desktopon a fekvő viselkedés marad; keskeny (portrait arányú) desktop ablakban
   ugyanaz a portrait mód lépjen életbe.
2. **Címsor elrejtése játék közben** amennyire a platform engedi: Fullscreen API a
   START-gombra (Android/desktop) + PWA-manifest a „Főképernyőhöz adás" útján
   chromeless induláshoz (iOS is).

Elvetve a brainstormban: a játéklogika radikális átfordítása (felfelé futás — nagy
regressziós kockázat, a hátulnézet eleve jól illik a portrait arányhoz), dinamikus
logikai canvas-méret (a spawn/nehézség képernyőfüggővé válna), kényszerített fekvő mód.

## 2. Alapelv: fix logikai világ, adaptív viewport

A játéklogika koordinátarendszere (**800×400 logikai px**, spawn-távolságok, ütközések,
boss-minták, megoldhatósági konstansok, `CANVAS_WIDTH/HEIGHT` mint LOGIKAI konstans)
**változatlan**. Csak a nézetréteg (renderer, kamera, overlay-HUD, CSS) alkalmazkodik
a tényleges képernyőmérethez. A 2.5D-mag/3D-héj architektúra sérülésmentes.

## 3. Viewport-modul (`js/main.js` `handleResize` átírása)

- A canvas CSS-mérete: **portraitban** (`window.innerWidth <= window.innerHeight`, a CSS
  `max-aspect-ratio: 1/1` törésponttal konzisztensen) a teljes ablakot kitölti;
  **fekvőben** a mai 2:1 letterbox marad.
- A WebGL renderer és az overlay canvas **backing store-a a valós CSS-méretet** követi
  (DPR-rel szorozva, `setPixelRatio(min(dpr,2))` marad).
- Újrafutás: `resize`, `orientationchange`, `fullscreenchange` eseményekre.
- CSS: `#game-container` magassága `100dvh` (fallback `100vh`), hogy a mobil címsor
  megjelenése/elrejtése ne rántsa meg a layoutot; a canvas-centering marad.
- A `SceneManager` kap egy `setViewport(w, h)` metódust, amely beállítja a renderer
  méretét, a kamera `aspect`-ét, és eltárolja a viewportot a vetítéshez (§5).

## 4. Kamera (`js/scene.js`)

- Fekvő mód: minden marad (`baseFov 60` + sebesség-kick).
- Portrait mód: a vertikális FOV-t úgy számoljuk, hogy a játékos síkjában (kamera-
  távolság ≈ 8 világegység) a teljes játéktér-szélesség beleférjen:
  - szükséges vízszintes félnyílásszög: `hHalf = atan((LANE_WIDTH + margó) / 8)`,
    ahol a margó ≈ 0.6 világegység (fél játékostest + kis levegő) → `hHalf ≈ 19°`;
  - `vFov = 2 · atan(tan(hHalf) / aspect)`, tipikusan **~70–75°** telefonos arányoknál;
  - a sebesség-FOV-kick (`+15 · speedNorm`) portraitban is érvényesül, a számított
    alapra téve.
- A kamera pozíciója/lookAt-ja változatlan; az oldalsó épületek portraitban képszélen
  kívülre kerülhetnek — ez természetes, a játéktér mindig teljesen látható.

## 5. Overlay-HUD (`js/game.js` `drawOverlay` + `scene.js` `projectToScreen`)

A legérzékenyebb, de jól körülhatárolt változás — **csak rajzolás, logika nem**:

- `projectToScreen` a `SceneManager`-en tárolt valós viewportot használja a
  `CANVAS_WIDTH/HEIGHT` helyett → floating textek, részecskék, feliratok pontosak
  maradnak minden képaránynál.
- `drawOverlay(ctx)` a `ctx.canvas` logikai méretét (backing store / DPR) használja:
  - teljes-képernyős effektek (flash, vignette, sebesség-csíkok): valós szélesség/magasság;
  - HUD-anchorok: pont bal fent, életek jobb fent, sebesség/kombó felül középen —
    fix px-pozíciók helyett a valós mérethez relatívan;
  - banner/boss-warning/game-over feliratok: valós középpont;
  - portraitban nagyobb HUD-betűméret (min. ~28 logikai px), hogy telefonon is olvasható legyen.
- A logikai játéktér (ütközések!) továbbra is 800×400 — az overlay koordináták, amik
  a játéklogikával érintkeznek (pl. vetített spawn-pontok), a `projectToScreen`-en
  át mennek, így konzisztensek maradnak.

## 6. Menü / game over CSS (`css/style.css`)

- Portrait töréspont (`max-aspect-ratio: 1/1` media query):
  - kontroll-infó felsorolás oszlopba, nagyobb érintési felületek;
  - START/Újra gombok teljes szélességűek (max ~320 px), nagyobb betű;
  - game over: stat-grid 2×2 marad, ranglista görgethető rész max-magassággal;
  - cím/alcím kisebb skála, hogy minden beférjen 667 px magas képernyőre is.

## 7. Fullscreen a START-ra (`js/main.js`)

- A `startGame()` (user gesture) elején: `document.documentElement.requestFullscreen()`
  `.catch(() => {})` fallbackkel — iPhone Safari nem támogatja, ott csendesen
  elmarad, a játék attól még indul.
- Game over-kor **nem** lépünk ki automatikusan (a játékos dönt; a böngésző saját
  kilépési útjai — ESC, húzás — változatlanok).
- Opcionális (ha a fullscreen sikerült és az API létezik): `screen.orientation.lock('portrait')`
  mobilon, `.catch`-elve; desktopon nem értelmezett, ott nem próbálkozunk.

## 8. PWA-manifest

- `manifest.json`: `name`/`short_name` (Snacky Dash), `start_url: "."`,
  `display: "standalone"`, `orientation: "portrait"`, `background_color`/`theme_color:
  #08081A` (a meglévő `theme-color` metával konzisztens), ikonok.
- **Ikon:** egy 512×512-es PNG (hotdog-emoji stílusban, sötét háttérrel), `any` +
  `maskable` célra; `apple-touch-icon` (180×180) link az index.html-be. A repo „minden
  kódból" elve itt feloldódik: a PWA-ikon technikai szükségszerűség (statikus PNG,
  generálva, nem kézzel rajzolt asset-pipeline).
- iOS meták (`apple-mobile-web-app-capable`, status-bar-style) már megvannak — érintetlenek.
- **Nem cél** service worker / offline támogatás (YAGNI — a játék CDN-ről tölti a
  three.js-t, offline úgysem menne).

## 9. Tesztelés

Nincs test framework — manuális böngésző-checklist (Playwright, friss port), a korábbi
gyakorlat szerint:

- **Viewport-mátrix:** iPhone SE (375×667), iPhone 14 (390×844), tablet portrait
  (768×1024), fekvő telefon (844×390), desktop (1280×720), keskeny desktop ablak (500×900).
- **Látómező:** hookkal a három sáv-középpont `projectToScreen`-je minden portrait
  viewporton a képernyőn belül van; a játékos sosem megy ki a képből dupla ugrásnál sem.
- **HUD:** screenshoton olvasható pont/élet/kombó portraitban; bannerek középen.
- **Regresszió-spot-check:** fekvő desktopon a gameplay változatlan (spawn, ütközés,
  kombó, boss — az 5. task checklist rövidített változata); console hibátlan.
- **Fullscreen/PWA:** manuális megjegyzés — Android Chrome-ban a START teljes képernyőt
  ad; iOS-en a „Főképernyőhöz adás" standalone indul (automatikusan nem tesztelhető).
- A `handleResize` resize/orientationchange eseményre újraméretez, layout-ugrás nélkül.

## 10. Architektúra-megkötések (örökölt)

- Logikai konstansok (sebesség, gravitáció, gap-ek, kombómax, mérföldkő-küszöbök,
  spawn-távolságok) **fagyasztva** — a portrait mód a játék nehézségét nem érintheti.
- `leaderboard.js`, `audio.js` nem módosul.
- A játéklogika (`game.js` update/ütközés/spawn része) nem módosul; a `drawOverlay`
  kivételével.
- UI-szövegek magyarul; commitüzenetek: emoji + rövid magyar leírás.

## 11. YAGNI — tudatosan kimarad

- Radikális függőleges játéklogika (felfelé futás) — elvetve (§1).
- Service worker / offline mód / telepítés-ösztönző banner („Install" gomb).
- Dinamikus logikai canvas-méret; fekvő mód tiltása telefonon.
- Tablet-specifikus elrendezés (a viewport-mátrix lefedi, külön design nélkül).
- iOS fullscreen-polyfill (nem létezik; a PWA az iOS-es út).
