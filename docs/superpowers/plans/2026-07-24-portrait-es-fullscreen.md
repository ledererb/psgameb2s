# Portrait (mobil) nézet + fullscreen/PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Snacky Dash 3D portrait képernyőn is teljes képernyős, jól játszható legyen (Subway Surfers-szerű hátulnézet, adaptív kamera + HUD), a START-ra fullscreen nyíljon, PWA-manifesttel pedig chromeless „Főképernyőhöz adás" indulás is működjön.

**Architecture:** Fix logikai világ (800×400 logikai px — spawn, ütközés, nehézség változatlan) + adaptív nézetréteg. A `SceneManager` és a `Game` egy `setViewport(w, h)` hívással tanulja meg a valós CSS-pixel viewportot; a kamera portraitban FOV-t nyit, az overlay-HUD a valós mérethez anchorol. Spec: `docs/superpowers/specs/2026-07-24-portrait-es-fullscreen-design.md`.

**Tech Stack:** Vanilla JS (ES modulok), Three.js 0.170.0 (import map, jsdelivr CDN), nincs build-lépés. Helyi futtatás: `python3 -m http.server <port>` a repo gyökerében. Verifikáció: Playwright (MCP), friss port taskonként.

## Global Constraints

- A logikai konstansok (`CANVAS_WIDTH=800`, `CANVAS_HEIGHT=400`, `GROUND_Y=320`, `PLAYER_X=100`, `LANE_WIDTH=2.2`, sebesség/gravitáció/gap-ek/kombó/mérföldkő-küszöbök) **fagyasztva** — a spawn/ütközés/játéklogika-kód egy sora sem változik (kivétel: az overlay-térben élő floating text/particle spawn-pozíciók, ld. Task 2).
- `leaderboard.js`, `audio.js` nem módosul.
- Nincs teszt-keretrendszer: minden task végpontja manuális böngészős verifikáció a megadott checklist alapján + commit.
- UI-szövegek magyarul; commit-üzenetek: emoji + rövid magyar leírás.
- Screenshot-ellenőrzések fájlnevei `task<N>-*.png` legyenek (a `.gitignore` `task*.png` mintája fedi).

---

### Task 1: Viewport-mag — SceneManager.setViewport + portrait FOV + handleResize átírás

**Files:**
- Modify: `js/scene.js` (constructor, +`setViewport`, +`_baseFov`, `updateCamera`, `projectToScreen`)
- Modify: `js/game.js` (constructor + `setViewport` — CSAK állapot, rajzolás még nem)
- Modify: `js/main.js` (init, handleResize, loop, drawMenuBackground)

**Interfaces:**
- Produces: `SceneManager.setViewport(w /*css px*/, h /*css px*/)` — renderer-méret, kamera aspect, portrait-jelző beállítása; `this.vw`, `this.vh` tárolása.
- Produces: `SceneManager._baseFov()` — portraitban a sávlefedő vertikális FOV, fekvőben `this.baseFov` (60).
- Produces: `projectToScreen(v3, out)` — ezentúl `this.vw/this.vh`-re vetít (aláírás változatlan).
- Produces: `Game.setViewport(w, h)` — `this.viewW/this.viewH` tárolása (default 800/400).
- Produces: `main.js` modul-szintű `viewW, viewH` (CSS px), amit a `loop` és `drawMenuBackground` használ.
- Consumes: meglévő `CANVAS_WIDTH/CANVAS_HEIGHT` (utils.js) — logikai konstansként él tovább.

- [ ] **Step 1: scene.js — viewport-állapot + setViewport + portrait FOV**

A constructorban az `this.baseFov = 60;` sor után:

```js
        this.vw = CANVAS_WIDTH;
        this.vh = CANVAS_HEIGHT;
        this.portrait = false;
```

Új metódusok az `updateCamera` elé:

```js
    /**
     * Valós CSS-pixel viewport beállítása (DPR-t a renderer kezeli).
     * Portraitban (w<=h) a kamera aspect a valós arány; a FOV-t _baseFov számolja.
     */
    setViewport(w, h) {
        this.vw = w;
        this.vh = h;
        this.portrait = w <= h;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Portraitban annyi vertikális FOV, hogy a játékos síkjában (kamera-táv 8)
     * a 3 sáv + 0.6 margó (±2.8 világegység) mindig beleférjen. Fekvőben 60°.
     */
    _baseFov() {
        if (!this.portrait) return this.baseFov;
        const hHalf = Math.atan(2.8 / 8);
        const aspect = this.vw / this.vh;
        return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / aspect));
    }
```

`updateCamera` első sora helyett:

```js
        this.camera.fov = this._baseFov() + speedNorm * 15;
```

(`this.baseFov + speedNorm * 15` helyett.)

`projectToScreen` törzse helyett:

```js
        this._projTmp.copy(v3).project(this.camera);
        out.x = (this._projTmp.x * 0.5 + 0.5) * this.vw;
        out.y = (-this._projTmp.y * 0.5 + 0.5) * this.vh;
        return out;
```

A constructorban a `renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false)` és a kamera `aspect: CANVAS_WIDTH / CANVAS_HEIGHT` MARAD (induláskori default; az első `handleResize` úgyis felülírja).

- [ ] **Step 2: game.js — Game.setViewport**

A constructor végén (a `bossPatterns` inicializálás utáni blokkban, bárhol a constructorban):

```js
        // Valós overlay-viewport (CSS px); a handleResize írja felül
        this.viewW = CANVAS_WIDTH;
        this.viewH = CANVAS_HEIGHT;
```

Új metódus a `getScore()` getterek mellé:

```js
    setViewport(w, h) { this.viewW = w; this.viewH = h; }
```

- [ ] **Step 3: main.js — handleResize átírása + init takarítás**

Modul-szintű állapot a `let sceneMgr, world;` sor után:

```js
let viewW = CANVAS_WIDTH, viewH = CANVAS_HEIGHT; // valós CSS-px viewport
```

Az `init()`-ben TÖRÖLD a HiDPI blokkot (a `// HiDPI/Retina support` kommenttől az `overlayCtx.scale(dpr, dpr);` sorig) — a `handleResize` mostantól ezért is felel:

```js
    overlayCtx = overlayCanvas.getContext('2d');
```

(a `const dpr ... overlayCtx.scale(dpr, dpr);` sorok törlendők).

A `handleResize` teljes új törzse:

```js
function handleResize() {
    const maxW = window.innerWidth;
    const maxH = window.innerHeight;
    const portrait = maxW <= maxH;
    let w, h;
    if (portrait) {
        // Portrait: teljes képernyő — a kamera FOV oldja meg a sávlefedést
        w = maxW; h = maxH;
    } else {
        // Fekvő: a megszokott 2:1 letterbox
        const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
        w = maxW; h = w / aspect;
        if (h > maxH) { h = maxH; w = h * aspect; }
    }
    viewW = w; viewH = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    overlayCanvas.style.width = `${w}px`;
    overlayCanvas.style.height = `${h}px`;

    // Overlay backing store a valós méretre (DPR-kezelve)
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width = Math.round(w * dpr);
    overlayCanvas.height = Math.round(h * dpr);
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    sceneMgr.setViewport(w, h);
    game.setViewport(w, h);
}
```

Az eseményfigyelők (`init()` vége felé):

```js
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 100));
    document.addEventListener('fullscreenchange', () => setTimeout(handleResize, 60));
```

A `loop` gameover-ága és a `drawMenuBackground` használja `viewW/viewH`-t a `CANVAS_WIDTH/CANVAS_HEIGHT` helyett (a `loop`-ban az `overlayCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);` sor; a `drawMenuBackground`-ban az összes `CANVAS_WIDTH/CANVAS_HEIGHT` előfordulás — a csillagok `sx`-e `% viewW`, `sy`-a `% (viewH * 0.6)`, a talaj `fillRect(0, viewH - 80, viewW, 80)`).

- [ ] **Step 4: Verifikáció (Playwright, friss port 8150)**

`python3 -m http.server 8150` a repo gyökeréből, majd Playwrighttal:

1. Fekvő 1280×720: a játék a megszokott letterboxban indul, console hibátlan (favicon 404 OK).
2. Portrait 390×844: a canvas a TELJES ablakot kitölti (nincs letterbox-sáv), START után a játék fut.
3. Hook-ellenőrzés portraitban (ideiglenes `window.__game = game;` sor a main.js `init()`-be, a Task 6 végéig maradhat): mindhárom sávközéppont vetített x-e a `[0, 390]` intervallumon belül van:
   ```js
   // konzolban: [-2.2, 0, 2.2].map(lx => { const o = {}; window.__game.sceneMgr.projectToScreen(new THREE.Vector3(lx, 1, 0), o); return o.x; })
   // vagy THREE nélkül: a player mesh worldX-értékei mellett a mesh.position.project hasonlóan
   ```
   Elvárt: bal sáv ≥ 0, jobb sáv ≤ 390 (a FOV-számítás ezt garantálja).
4. A játékos dupla ugrásnál sem megy ki a kép tetején (screenshot).
5. Fekvő 1280×720-on a HUD pontosan a régi helyen (a `Game.viewW/viewH` még default/letterbox-érték — vizuálisan azonos a mainnel).

Várt eredmény: minden pont teljesül; ha a sávok kilógnának, a `2.8` margó-konstans finomítható (max 3.2-ig) — ezt jegyezd fel a commitüzenetbe.

- [ ] **Step 5: Commit**

```bash
git add js/scene.js js/game.js js/main.js
git commit -m "📱 Adaptív viewport: portrait teljes képernyő + FOV-nyitás"
```

---

### Task 2: HUD/overlay viewport-anchorolás (game.js rajzolóréteg)

**Files:**
- Modify: `js/game.js` (`drawOverlay`, `_drawHUD`, `_drawComboHUD`, `_drawActivePowerUps`, `_drawBossWarning`, `_drawMilestoneBanner`, `_drawMissionHUD`, speed-line spawn, mission/boss floating textek)

**Interfaces:**
- Consumes: `Game.viewW/viewH` (Task 1) — az overlay-logika koordinátái.
- Produces: `Game._hudScale()` — `this.viewH > this.viewW ? 1.4 : 1` (portrait fontskála).

**Fontos határvonal:** a `CANVAS_WIDTH`-et csak az OVERLAY-TÉRBEN rajzolt dolgoknál cseréld `this.viewW`-re (HUD, bannerek, effektek, floating textek). A SPAWN/LOGIKA (`CANVAS_WIDTH + 60`, `+40`, `randomBetween` gap-ek, `bossPatterns`) MARAD — az a 800×400-as logikai tér.

- [ ] **Step 1: _hudScale helper + drawOverlay-effektek**

A getterekhez:

```js
    /** Portrait nagyított HUD-skála (1.4), fekvőben 1. */
    _hudScale() { return this.viewH > this.viewW ? 1.4 : 1; }
```

`drawOverlay`-ben: a `clearRect`, a screen-flash `fillRect` és a vignette sugarai/középpontja `this.viewW/this.viewH`-t használjon (`CANVAS_WIDTH/HEIGHT` helyett). A speed-line spawnban (update): `x: this.viewW`, `y: randomBetween(10, this.viewH - 10)`.

- [ ] **Step 2: HUD-elemek**

- `_drawHUD`: hearts `x = this.viewW - 15`; speedText `x = this.viewW / 2`; betűméretek `Math.round(px * this._hudScale())`-tel (20, 18, 13 alapok).
- `_drawComboHUD`: `x = this.viewW / 2`; `fontSize = Math.round(16 * pulse * this._hudScale())`.
- `_drawActivePowerUps`: `iconX = this.viewW - 20` kiindulás.
- `_drawBossWarning`: tint `fillRect(0, 0, this.viewW, this.viewH)`; szöveg `(this.viewW / 2, this.viewH / 2 - 20)`; font `28 → Math.round(28 * this._hudScale())`.
- `_drawMilestoneBanner`: `cx = this.viewW / 2`, `cy = this.viewH / 2 - 50`; font 22 skálázva.
- `_drawMissionHUD`: `y = this.viewH - 16` (a pill-szélességek maradnak).

- [ ] **Step 3: Overlay-térbeli floating textek / particle-középpontok**

A játéklogikában spawnoló, de OVERLAY-koordinátás szövegek középpontjai:
- boss-bónusz (`'+500 BOSS BÓNUSZ!'`): `(this.viewW / 2, this.viewH / 2 - 40)`
- mission complete/fail/announce szövegek és a complete particle (`_updateMissions`, `_startNewMission`, `_failMission`): `CANVAS_WIDTH / 2 → this.viewW / 2` (az `y = 70/60` marad).

- [ ] **Step 4: Verifikáció (Playwright, port 8150)**

1. Portrait 390×844, START: screenshot — a pont bal fent, szívek jobb fent, sebesség középen NAGY (1.4×) olvasható; nincs levágott HUD-elem.
2. Hookkal: `window.__game.score = 2000` → milestone banner a képernyő KÖZEPÉN (nem a logikai 400-as x-en); `window.__game.score = 5000` → boss-warning középen.
3. Kombó ×2+ állapotban a combo-HUD felül középen látszik (hook: spawnolj hotdogot a játékosra kétszer a Task-5-ös staging-mintával).
4. Fekvő 1280×720: HUD pixel-azonos elrendezés a main branchhez képest (összevető screenshot).
5. Mission-HUD (bal alsó pill) portraitban a képernyő alján, nem a logikai 400-as vonalon.

- [ ] **Step 5: Commit**

```bash
git add js/game.js
git commit -m "🎯 HUD/overlay a valós viewportra anchorolva (portrait nagyítás)"
```

---

### Task 3: Menü + game over portrait CSS

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: meglévő osztályok (`.screen`, `.screen-content`, `.game-title`, `.subtitle`, `.game-desc`, `.controls-info`, `.control-item`, `.game-tips`, `.btn-primary`, `.run-stats`, `.stat-item`, `.input-group`, `.leaderboard-section`).

- [ ] **Step 1: dinamikus viewport-magasság**

A `#game-container` szabályban:

```css
#game-container {
    position: relative;
    width: 100vw;
    height: 100vh;   /* fallback */
    height: 100dvh;  /* mobil címsor-független */
    overflow: hidden;
    background: #08081A;
}
```

- [ ] **Step 2: portrait media query**

A fájl végére (a scrollbar-szekció elé):

```css
/* ── Portrait (mobil, álló) ── */

@media (max-aspect-ratio: 1/1) {
    .screen-content {
        padding: 20px 16px;
        max-height: 96dvh;
        overflow-y: auto;
    }

    .game-title {
        font-size: 2.2rem;
    }

    .game-desc {
        font-size: 0.85rem;
    }

    .controls-info {
        align-items: flex-start;
        gap: 10px;
    }

    .control-item {
        justify-content: flex-start;
    }

    .game-tips {
        flex-wrap: wrap;
        gap: 8px;
    }

    .btn-primary {
        width: 100%;
        max-width: 320px;
        font-size: 1.3rem;
        padding: 16px 24px;
        touch-action: manipulation;
    }

    .stat-item {
        flex: 1 1 40%;
        min-width: 0;
    }

    .leaderboard-section {
        max-height: 30dvh;
        overflow-y: auto;
    }
}
```

(A `.controls-info` eleve oszlopos flex — portraitban csak balra igazítjuk; a `.run-stats` flex-wrap, ezért a 2×2-es rácsot a `.stat-item { flex: 1 1 40% }` adja.)

- [ ] **Step 3: Verifikáció (Playwright, port 8150)**

1. iPhone SE (375×667): a menü minden eleme látszik görgetés nélkül (cím, leírás, high score, START, kontrollok, tippek) — screenshot.
2. Game over képernyő portraitban: stat-grid 2×2, email-mező teljes szélesség, ranglista görgethető, „Újra!" gomb elérhető — screenshot.
3. Fekvő 1280×720: a menü/game over vizuálisan változatlan.
4. `100dvh` ellenőrzés: böngésző-toolbar megjelenítésével/elrejtésével (DevTools device toolbar magasság-váltás) a layout nem ugrik.

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "📐 Portrait CSS: dinamikus vh, oszlopos kontrollok, 2×2 stat-grid"
```

---

### Task 4: Fullscreen a START-ra (+ opcionális orientation lock)

**Files:**
- Modify: `js/main.js` (`startGame`, +`tryFullscreen`)

**Interfaces:**
- Consumes: `handleResize` (Task 1) — a `fullscreenchange` listener már Task 1-ben bekerült.
- Produces: `tryFullscreen()` — belső helper, hibatűrő.

- [ ] **Step 1: tryFullscreen helper + startGame hívás**

A `startGame` függvény elé:

```js
/**
 * Fullscreen-kérés a START user-gesture-ben. iPhone Safari nem támogatja —
 * ott a promise elutasítás csendesen elnyelődik, a játék ettől függetlenül indul.
 * Sikeres fullscreen után mobilon megpróbáljuk portraitba lockolni.
 */
function tryFullscreen() {
    const el = document.documentElement;
    if (!el.requestFullscreen) return;
    el.requestFullscreen().then(() => {
        if (screen.orientation && screen.orientation.lock &&
            window.innerWidth <= window.innerHeight) {
            screen.orientation.lock('portrait').catch(() => {});
        }
    }).catch(() => {});
}
```

A `startGame()` elején (az `audio.init();` ELÉ):

```js
    tryFullscreen();
```

- [ ] **Step 2: Verifikáció (Playwright, port 8150)**

1. START gomb kattintás desktop Chromiumban: `document.fullscreenElement !== null` (Playwright headed/headless Chromium támogatja a fullscreen API-t felhasználói gesture-rel — `page.click` valódi gesture).
2. Console hibátlan; a `fullscreenchange` után a canvas átméreteződött (`window.__game.viewW` a fullscreen méretet tükrözi).
3. ESC-re kilép a fullscreenből, `handleResize` visszaállítja az ablakméretet.
4. Game over után a fullscreen NEM szűnik meg automatikusan (spec §7).
5. Kódolvasás: iOS-útvonal — `requestFullscreen` hiányában/hiba esetén nincs kivétel, a játék indul.

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "🖥️ Fullscreen a START-ra (portrait lock mobilon, hibatűrő)"
```

---

### Task 5: PWA-manifest + ikonok + favicon

**Files:**
- Create: `manifest.json`
- Create: `icons/icon-512.png`, `icons/icon-512-maskable.png`, `icons/icon-192.png`, `icons/icon-180.png`
- Modify: `index.html` (head-linkek)

**Interfaces:**
- Produces: `/manifest.json` (standalone, portrait), PNG ikonok a repo-ban.

- [ ] **Step 1: Ikonok generálása (Playwright + sips)**

Készíts ideiglenes `icon-gen.html`-t a repo gyökerébe:

```html
<!DOCTYPE html><html><body style="margin:0">
<canvas id="c" width="512" height="512"></canvas>
<script>
const c = document.getElementById('c').getContext('2d');
c.fillStyle = '#08081A';
c.beginPath(); c.roundRect(0, 0, 512, 512, 96); c.fill();
c.font = '360px sans-serif';
c.textAlign = 'center'; c.textBaseline = 'middle';
const pad = new URLSearchParams(location.search).get('pad') === '1';
c.font = pad ? '280px sans-serif' : '360px sans-serif';
c.fillText('🌭', 256, 276);
</script></body></html>
```

Playwrighttal: `http://localhost:8150/icon-gen.html` → screenshot a canvasról `icons/icon-512.png`-be; `?pad=1` → `icons/icon-512-maskable.png` (maskable safe-zone). Utána:

```bash
mkdir -p icons
sips -z 192 192 icons/icon-512.png --out icons/icon-192.png
sips -z 180 180 icons/icon-512.png --out icons/icon-180.png
rm icon-gen.html
```

(A screenshot legyen PONTOSAN a canvas elemről — `page.locator('#c').screenshot()` — hogy 512×512 legyen.)

- [ ] **Step 2: manifest.json**

```json
{
    "name": "Snacky Dash",
    "short_name": "Snacky Dash",
    "description": "Segítsd Snacky-t a hotdogok begyűjtésében! 3D endless runner.",
    "start_url": ".",
    "scope": ".",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#08081A",
    "theme_color": "#08081A",
    "icons": [
        { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
        { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
        { "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
    ]
}
```

- [ ] **Step 3: index.html head-bővítés**

A `<meta name="theme-color" ...>` sor után:

```html
    <link rel="manifest" href="manifest.json">
    <link rel="icon" type="image/png" href="icons/icon-192.png">
    <link rel="apple-touch-icon" href="icons/icon-180.png">
```

- [ ] **Step 4: Verifikáció (Playwright, port 8150)**

1. Oldal újratöltés: a favicon 404 ELTŰNT a console-ból (mostantól 200 az `icons/icon-192.png`).
2. `http://localhost:8150/manifest.json` 200, valid JSON.
3. Mind a 4 ikonfájl 200-ként letölthető.
4. DevTools-szintű ellenőrzés kódolvasással: `display: standalone`, `orientation: portrait` — ezek adják az iOS/Android chromeless indulást (tényleges A2HS manuálisan tesztelendő, jegyzőkönyvezd).

- [ ] **Step 5: Commit**

```bash
git add manifest.json icons/ index.html
git commit -m "📲 PWA-manifest + ikonok (favicon 404 is megszűnt)"
```

---

### Task 6: Viewport-mátrix verifikáció + regresszió + takarítás

**Files:**
- Modify: `js/main.js` (a TEMP `window.__game` hook eltávolítása a végén)

**Interfaces:**
- Consumes: minden korábbi task.

- [ ] **Step 1: Viewport-mátrix (Playwright, friss port 8151)**

Minden viewporton: oldal betölt → START → ~5 s játék → screenshot + console-check:

| Viewport | Elvárt |
|---|---|
| 375×667 (iPhone SE) | teljes képernyő, 3 sáv látszik, HUD olvasható |
| 390×844 (iPhone 14) | ugyanez |
| 768×1024 (tablet) | ugyanez |
| 844×390 (fekvő telefon) | 2:1 letterbox, mai viselkedés |
| 1280×720 (desktop) | 2:1 letterbox, mai viselkedés |
| 500×900 (keskeny desktop) | portrait mód |

Sávlefedés hookkal minden portrait viewporton: a 3 sávközéppont `projectToScreen`-je a `[0, viewW]`-n belül. FPS-minta (180 rAF-delta): avg ≤ 17.5 ms, p95 ≤ 20 ms.

- [ ] **Step 2: Gameplay-regresszió (rövidített Task-5 checklist)**

Hookkal, fekvő 1280×720-n ÉS portrait 390×844-n is:
- billentyű: ←/→/Space/↑/↓ működik (lane/y változik);
- ütközés → életvesztés + kombó-reset; near-miss számláló nő;
- mérföldkő 2000-nél banner KÖZÉPEN; boss-warning 5000-nél KÖZÉPEN;
- game over → statisztikák → Újra → tiszta állapot;
- console hibátlan (favicon immár nem 404).

- [ ] **Step 3: Takarítás + commit**

TEMP hook törlése (`window.__game` sor), grep-check (`window.__game`, `console.log`, `debugger` → 0 találat a `js/`-ben), screenshotok ne legyenek staged (`git status`), majd:

```bash
git add -A
git commit -m "✅ Portrait + fullscreen/PWA — viewport-mátrix és regresszió lezárva"
```

---

## Self-Review jegyzetek

- **Spec coverage:** §3 viewport → Task 1; §4 kamera → Task 1; §5 HUD/overlay → Task 2; §6 CSS → Task 3; §7 fullscreen → Task 4; §8 PWA → Task 5; §9 teszt → Task 6 (+ task-szintű verifikációk); §10 megkötések → Global Constraints; §11 YAGNI → nincs ellentmondó task.
- **Type-consistency:** `setViewport(w, h)` azonos szignatúra a `SceneManager`/`Game` párosban és a `main.js` hívási helyein; `viewW/viewH` (Game) vs `vw/vh` (SceneManager) nevek tudatosan eltérnek, a plan mindenhol konzisztensen használja őket; `_hudScale()` csak a game.js-ben.
- **Kockázat:** Task 1 és Task 2 között a HUD portraitban átmenetileg rossz helyen lehet (a Game.viewW már frissül, de a rajzolás még fix) — ez elfogadott átmeneti állapot, Task 2 zárja; a letterboxos fekvő mód végig sértetlen.
- **Kockázat 2:** a `projectToScreen` viewportváltása a Task 1-ben azonnal érinti a floating texteket (jól), de ha a Task 1-et Task 2 nélkül commitolnánk, a küldetés-szövegek (fix 400-as x) oldalra csúsznának — a Task 1 verifikációja ezért csak a 3D-vetítést és layoutot ellenőrzi, HUD-t nem.
