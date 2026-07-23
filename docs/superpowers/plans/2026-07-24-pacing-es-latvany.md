# Pacing + gödör-látvány + játékmenet-extrák Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A témaváltás-pacing lassítása, a gödrök látványosabbá tétele (mély 3D lyuk + effektek), arany hotdog és futam-statisztika a Snacky Dash 3D-ben.

**Architecture:** A "2.5D mag, 3D héj" elv változatlan: logika logikai térben, Three.js nézetréteg. A gödör-effektek a pit mesh részei (nem overlay-particle). A statisztika session-only számlálók a game.js-ben, DOM-megjelenítés a main.js-ben.

**Tech Stack:** Vanilla JS ES modulok, Three.js 0.170.0 (import map), HTML/CSS DOM overlay. Nincs build, nincs test framework.

Spec: `docs/superpowers/specs/2026-07-24-pacing-es-latvany-design.md`

## Global Constraints

- **Branch:** az implementáció a `feature/pacing-es-latvany` branchen történik (main-ből, a plan-commit után).
- Three.js pontosan **0.170.0** (jsdelivr import map); **nincs külső asset** — minden geometria/anyag kódból.
- **Nincs test framework** — minden task böngészős manuális checklistet futtat (Playwright, FRISS PORT taskonként; a Playwright modul-cache miatt új port kell).
- Logikai konstansok (sebesség, gravitáció, gap-ek, kombómax, HOTDOG_POINTS) **fagyasztva** — kivétel: `milestoneThresholds` (Task 1, spec szerint jóváhagyott).
- `leaderboard.js`, `audio.js` **nem módosul**.
- UI-szövegek **magyarul**; commitüzenetek: emoji + rövid magyar leírás.
- Verifikációs debug-hook (`window.__game`) megengedett, de commit ELŐTT eltávolítandó — ezt minden jelentésben igazolni kell.

---

### Task 1: Téma-küszöbök feljebb (pacing)

**Files:**
- Modify: `js/game.js:178` (milestoneThresholds), `js/game.js:604` (komment)

**Interfaces:**
- Produces: új küszöbök `[2000, 6000, 12000, 20000]` — a `world.setTheme()` mapping (milestone index + 1) változatlan.

- [ ] **Step 1: Küszöbök cseréje**

`js/game.js`-ben:

```js
// ELŐTTE:
this.milestoneThresholds = [1000, 3000, 5000, 8000];
// UTÁNA:
this.milestoneThresholds = [2000, 6000, 12000, 20000];
```

és a milestone-check kommentje:

```js
// ELŐTTE:
// Trigger theme change: 1000→dawn(1), 3000→day(2), 5000→sunset(3), 8000→neon(4)
// UTÁNA:
// Trigger theme change: 2000→dawn(1), 6000→day(2), 12000→sunset(3), 20000→neon(4)
```

- [ ] **Step 2: Verifikáció**

`python3 -m http.server 8140` (háttérben), Playwright. Ideiglenes `window.__game = game` hook a main.js-ben (commit előtt TÖRÖLNI). `__game.score = 1990`-re állítva a következő frame-eken: „🌅 HAJNAL ÉRA!" banner + témaátmenet indul. Ugyanígy 5990-nél „☀️ NAPPALI ÉRA!". Ellenőrizd, hogy 1000/3000/5000-nél NEM vált (pl. `__game.score = 4990` → nincs banner). Console hibátlan (favicon 404 OK).

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "🐌 Téma-küszöbök feljebb: 2000/6000/12000/20000"
```

---

### Task 2: Mély 3D gödör + világító perem + gőz

**Files:**
- Modify: `js/models.js` (`createPitMesh` teljes csere, js/models.js:186-195)
- Modify: `js/pit.js` (`syncMesh` animációval)
- Modify: `js/game.js:559` (syncMesh hívás time-paraméterrel)

**Interfaces:**
- Consumes: `this.score` mint time-forrás (a collectibles/powerups már így kapják, js/game.js:570,581).
- Produces: `createPitMesh(span)` → Group, `userData.rimMat` (MeshStandardMaterial), `userData.steam` (Mesh[] tömb, minden Mesh `userData.phase/x/z`-vel); `Pit.syncMesh(time = 0)`.

- [ ] **Step 1: `createPitMesh` újraépítése (js/models.js)**

A teljes függvény cseréje:

```js
export function createPitMesh(span) {
    // Mély lyuk-illúzió: "void" alj + belső falak + világító perem + gőz.
    // A Group z-mérete a Pit-ben scale.z-vel nyúlik a gap logikai szélességére.
    const w = span === 3 ? 6.6 : 2.0;
    const g = new THREE.Group();

    // "Void" alj — fényképtelen, közel-fekete
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 1),
        new THREE.MeshBasicMaterial({ color: 0x020208 }));
    bottom.position.y = -0.6;
    g.add(bottom);

    // Belső oldalfalak (4), útszinttől az aljig
    const wallMat = new THREE.MeshBasicMaterial({ color: 0x0A0A14 });
    const wallH = 0.6, wallT = 0.06;
    const front = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallT), wallMat);
    front.position.set(0, -wallH / 2, 0.5 - wallT / 2);
    const back = front.clone();
    back.position.z = -0.5 + wallT / 2;
    const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 1), wallMat);
    left.position.set(-w / 2 + wallT / 2, -wallH / 2, 0);
    const right = left.clone();
    right.position.x = w / 2 - wallT / 2;
    g.add(front, back, left, right);

    // Világító perem (4 emissive csík az útszinten) — EGY megosztott anyag,
    // így a pulzálás egy helyen állítható (userData.rimMat)
    const rimMat = new THREE.MeshStandardMaterial({
        color: 0xFF6B1A, emissive: 0xFF6B1A, emissiveIntensity: 2, roughness: 0.4
    });
    const rimW = 0.1;
    const rimFront = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, rimW), rimMat);
    rimFront.position.set(0, 0.03, 0.5 - rimW / 2);
    const rimBack = rimFront.clone();
    rimBack.position.z = -0.5 + rimW / 2;
    const rimLeft = new THREE.Mesh(new THREE.BoxGeometry(rimW, 0.04, 1), rimMat);
    rimLeft.position.set(-w / 2 + rimW / 2, 0.03, 0);
    const rimRight = rimLeft.clone();
    rimRight.position.x = w / 2 - rimW / 2;
    g.add(rimFront, rimBack, rimLeft, rimRight);

    // Felszálló gőz: 6 apró fényképtelen kocka, fázisban eltolt körkörös emelkedés.
    // Megosztott anyag — a "kifakulás" méretezéssel oldott (nem opacity-vel).
    const steamMat = new THREE.MeshBasicMaterial({ color: 0xCC5522, transparent: true, opacity: 0.5 });
    const steam = [];
    for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), steamMat);
        s.userData.phase = i / 6;
        s.userData.x = (Math.random() - 0.5) * (w - 0.4);
        s.userData.z = (Math.random() - 0.5) * 0.5;
        steam.push(s);
        g.add(s);
    }

    g.userData.rimMat = rimMat;
    g.userData.steam = steam;
    return g;
}
```

- [ ] **Step 2: `Pit.syncMesh` animáció (js/pit.js)**

```js
    /** Map logical state -> 3D mesh position + animációk. Called once per frame. */
    syncMesh(time = 0) {
        const laneCenter = this.lanes.reduce((a, l) => a + LANES[l], 0) / this.lanes.length;
        this.mesh.position.set(laneCenter, 0, logicalToWorldZ(this.x + this.gapWidth / 2));

        // Perem-pulzálás (~2 s periódus 60 fps-en)
        const rimMat = this.mesh.userData.rimMat;
        if (rimMat) {
            rimMat.emissiveIntensity = 1.8 + Math.sin(time * 0.05) * 0.7;
        }

        // Gőz: körkörös emelkedés a lyukból, emelkedve összezsugorodva
        for (const s of this.mesh.userData.steam || []) {
            const t = (time * 0.006 + s.userData.phase) % 1;
            s.position.set(s.userData.x, -0.55 + t * 0.85, s.userData.z);
            s.scale.setScalar(1 - t * 0.7);
        }
    }
```

- [ ] **Step 3: game.js — time-paraméter átadása**

`js/game.js:559`: `this.pits[i].syncMesh();` → `this.pits[i].syncMesh(this.score);`

- [ ] **Step 4: Verifikáció**

`python3 -m http.server 8141`, Playwright. Ideiglenes `window.__game` hook (commit előtt TÖRÖLNI). Hookkal spawnolj gödröt: `__game.pits.push(new (await import('./js/pit.js')).Pit(700, 100, 1))` — vagy egyszerűbben játssz, amíg gödör jön. Ellenőrizd: a lyuk MÉLYNEK látszik (sötét belső falak), a perem narancsan világít és pulzál, a gőz felfelé száll; ugyanez teljes szélességű gödörnél (lane -1); a hit és a near-miss (`CLOSE! +50`) továbbra működik; téma-váltásnál (hook: `__game.world.setTheme(4)`) a perem neon témán is kontrasztos. Screenshot: `task2-pit.png`. Console hibátlan.

- [ ] **Step 5: Commit**

```bash
git add js/models.js js/pit.js js/game.js
git commit -m "🕳️ Mély 3D gödör: void-alj, világító perem, gőz-effekt"
```

---

### Task 3: Arany hotdog 🌟

**Files:**
- Modify: `js/models.js` (`createCollectibleMesh`, js/models.js:152-169)
- Modify: `js/collectible.js` (type-kezelés + csillogás)
- Modify: `js/game.js` (spawn-upgrade, pontozás, konstansok)

**Interfaces:**
- Consumes: `Collectible.syncMesh(time)` már kap time-ot (js/game.js:581).
- Produces: `'golden_hotdog'` collectible-típus (36×22 logikai méret, mint a hotdog); `GOLDEN_HOTDOG_POINTS = 500`, `GOLDEN_HOTDOG_CHANCE = 0.06` a game.js-ben.

- [ ] **Step 1: Arany modell (js/models.js — `createCollectibleMesh`)**

A `hotdog` ág cseréje:

```js
export function createCollectibleMesh(type) {
    const g = new THREE.Group();
    if (type === 'hotdog' || type === 'golden_hotdog') {
        const golden = type === 'golden_hotdog';
        const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 10),
            new THREE.MeshStandardMaterial({
                color: golden ? 0xFFD700 : 0xE8B96F,
                emissive: golden ? 0xAA8800 : 0x000000,
                emissiveIntensity: golden ? 0.7 : 0,
                metalness: golden ? 0.6 : 0,
                roughness: golden ? 0.3 : 0.7
            }));
        bun.rotation.z = Math.PI / 2;
        const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.42, 4, 10),
            new THREE.MeshStandardMaterial({
                color: golden ? 0xFFEE88 : 0xC0392B,
                emissive: golden ? 0xCC9900 : 0x000000,
                emissiveIntensity: golden ? 0.7 : 0,
                metalness: golden ? 0.5 : 0,
                roughness: golden ? 0.35 : 0.6
            }));
        sausage.rotation.z = Math.PI / 2;
        sausage.position.y = 0.08;
        g.add(bun, sausage);
    } else {
        const donut = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.12, 10, 18),
            new THREE.MeshStandardMaterial({ color: 0xFF69B4, roughness: 0.5 }));
        g.add(donut);
    }
    return g;
}
```

- [ ] **Step 2: Collectible type-kezelés + csillogás (js/collectible.js)**

Konstruktor — a méret-meghatározás bővítése és a komment:

```js
        this.type = type; // 'hotdog' | 'golden_hotdog' | 'donut'
        ...
        this.width = type === 'donut' ? 32 : 36;
        this.height = type === 'donut' ? 32 : 22;
```

`syncMesh` végére (a `rotation.y` sor után):

```js
        // Arany hotdog: csillogó skála-pulzálás
        if (this.type === 'golden_hotdog') {
            this.mesh.scale.setScalar(1 + Math.sin(time * 0.12) * 0.12);
        }
```

- [ ] **Step 3: game.js — konstansok + spawn-upgrade**

A fájl tetejére, a többi modul-konstans mellé (az importok után):

```js
// Arany hotdog: ritka, nagyértékű collectible (spec §4)
const GOLDEN_HOTDOG_POINTS = 500;
const GOLDEN_HOTDOG_CHANCE = 0.06;
```

`_spawnCollectible()`-ben (js/game.js:1100) a létrehozás sora:

```js
// ELŐTTE:
        const col = new Collectible(CANVAS_WIDTH + 40, y, type, lane);
// UTÁNA:
        const finalType = type === 'hotdog' && Math.random() < GOLDEN_HOTDOG_CHANCE ? 'golden_hotdog' : type;
        const col = new Collectible(CANVAS_WIDTH + 40, y, finalType, lane);
```

`_spawnFormation()`-ban (js/game.js:1147):

```js
// ELŐTTE:
            const col = new Collectible(x, y, 'hotdog', lane);
// UTÁNA:
            const itemType = Math.random() < GOLDEN_HOTDOG_CHANCE ? 'golden_hotdog' : 'hotdog';
            const col = new Collectible(x, y, itemType, lane);
```

- [ ] **Step 4: game.js — pontozás (js/game.js:1291-1316)**

A `col.type === 'hotdog'` ág cseréje:

```js
                if (col.type === 'hotdog' || col.type === 'golden_hotdog') {
                    const golden = col.type === 'golden_hotdog';
                    // Combo-enhanced scoring with double score power-up
                    const basePoints = golden ? GOLDEN_HOTDOG_POINTS : HOTDOG_POINTS;
                    const multiplied = basePoints * this.comboMultiplier * (this.activeDoubleScore.active ? 2 : 1);
                    this.score += multiplied;

                    // Advance combo
                    this.comboMultiplier = Math.min(this.maxCombo, this.comboMultiplier + 1);
                    this.comboTimer = this.comboMaxTimer;

                    // Effects
                    this.audio.playCollect();
                    // Mustard + ketchup colored particles (aranynál extra arany)
                    this._spawnParticlesAt(col.mesh, 4, '#F1C40F', 1);
                    this._spawnParticlesAt(col.mesh, 3, golden ? '#FFD700' : '#E74C3C', 0.8);
                    this._spawnParticlesAt(col.mesh, 2, '#D4A050', 0.6);
                    this._spawnFloatingTextAt(col.mesh, `+${multiplied}`, golden ? '#FFD700' : '#F1C40F');
                    // Gold screen flash (aranynál erősebb)
                    this.screenFlash = { alpha: golden ? 0.22 : 0.12, color: 'rgba(241, 196, 15, 0.4)' };
                    // Trigger Snacky happy face
                    if (this.player.triggerHappy) this.player.triggerHappy();

                    // ── Mission: collect tracking ──
                    if (this.currentMission && this.currentMission.type === 'collect') {
                        this.missionProgress++;
                    }
                } else if (col.type === 'donut') {
```

- [ ] **Step 5: Verifikáció**

`python3 -m http.server 8142`, Playwright, ideiglenes `window.__game` hook (commit előtt TÖRÖLNI). Hookkal: `const { Collectible } = await import('./js/collectible.js'); const c = new Collectible(500, 250, 'golden_hotdog', 1); __game.sceneMgr.scene.add(c.mesh); __game.collectibles.push(c);` — ellenőrizd: arany, csillogó (pulzáló) hotdog; felvételkor `+{500×kombó}` ARANY floating text, erősebb flash; kombó ugyanúgy nő; a mágnes húzza (`__game.activeMagnet.active = true`); a collect-misszió számolja. Screenshot: `task3-golden.png`. Console hibátlan.

- [ ] **Step 6: Commit**

```bash
git add js/models.js js/collectible.js js/game.js
git commit -m "🌟 Arany hotdog: ritka 500-pontos collectible"
```

---

### Task 4: Futam-statisztika a game over képernyőn

**Files:**
- Modify: `js/game.js` (számlálók, reset, onGameOver)
- Modify: `js/main.js` (callback + showGameOverScreen)
- Modify: `index.html` (stats-blokk a gameover-screenbe)
- Modify: `css/style.css` (stats-stílus)

**Interfaces:**
- Consumes: meglévő near-miss ágak (js/game.js:~1194, ~1244), boss-bónusz ág (js/game.js:437), kombó-növelés (js/game.js:1298).
- Produces: `game.onGameOver(score, stats)` ahol `stats = { distance, maxCombo, nearMisses, bosses }`; DOM-id-k: `stat-distance`, `stat-combo`, `stat-nearmiss`, `stat-bosses`.

- [ ] **Step 1: game.js — számlálók**

A konstruktorban (a `this.milestoneThresholds` környékén):

```js
        // ── Futam-statisztika (game over összesítő, session-only) ──
        this.runDistance = 0;
        this.maxComboReached = 1;
        this.nearMissCount = 0;
        this.bossesDefeated = 0;
```

A `reset()`-ben (a milestone-resetek mellé):

```js
        // Reset run stats
        this.runDistance = 0;
        this.maxComboReached = 1;
        this.nearMissCount = 0;
        this.bossesDefeated = 0;
```

- [ ] **Step 2: game.js — mérés 4 helyen**

a) Táv: az `update()` elején, a sebességnövelés után:

```js
        // Futam-statisztika: megtett táv (logikai px; ~50 px = 1 m)
        this.runDistance += this.gameSpeed;
```

b) Max kombó: a kombó-növelés után (js/game.js:1298-1299, a Task 3-as blokkban):

```js
                    this.comboMultiplier = Math.min(this.maxCombo, this.comboMultiplier + 1);
                    this.comboTimer = this.comboMaxTimer;
                    if (this.comboMultiplier > this.maxComboReached) {
                        this.maxComboReached = this.comboMultiplier;
                    }
```

c) Near-miss: mindkét `this.score += nearMissBonus;` sor UTÁN (js/game.js:~1195 és ~1245):

```js
                        this.nearMissCount++;
```
(figyelem: az első helyen 24 szóköz az indent, a másodikon 20 — a környező kódhoz igazítva)

d) Boss: a `this.score += 500;` sor után (js/game.js:437):

```js
                this.bossesDefeated++;
```

- [ ] **Step 3: game.js — onGameOver stats-szel (js/game.js:669)**

```js
// ELŐTTE:
            if (this.onGameOver) this.onGameOver(this.score);
// UTÁNA:
            if (this.onGameOver) {
                this.onGameOver(this.score, {
                    distance: Math.round(this.runDistance / 50),
                    maxCombo: this.maxComboReached,
                    nearMisses: this.nearMissCount,
                    bosses: this.bossesDefeated
                });
            }
```

- [ ] **Step 4: index.html — stats-blokk**

A `.score-display` div UTÁN (index.html:68-69 közé):

```html
                <div class="run-stats">
                    <div class="stat-item">
                        <span class="stat-icon">🏃</span>
                        <span class="stat-value" id="stat-distance">0 m</span>
                        <span class="stat-label">Távolság</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">🔥</span>
                        <span class="stat-value" id="stat-combo">×1</span>
                        <span class="stat-label">Max kombó</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">😅</span>
                        <span class="stat-value" id="stat-nearmiss">0</span>
                        <span class="stat-label">Near-miss</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">👹</span>
                        <span class="stat-value" id="stat-bosses">0</span>
                        <span class="stat-label">Boss</span>
                    </div>
                </div>
```

- [ ] **Step 5: css/style.css — stats-stílus**

A `.score-display` blokk után:

```css
.run-stats {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 8px 12px;
    min-width: 72px;
}

.stat-icon {
    font-size: 1.1rem;
    margin-bottom: 2px;
}

.stat-value {
    font-family: 'Bangers', cursive;
    font-size: 1.2rem;
    color: #F1C40F;
    letter-spacing: 1px;
}

.stat-label {
    font-size: 0.65rem;
    color: #95A5A6;
    text-transform: uppercase;
    letter-spacing: 1px;
}
```

- [ ] **Step 6: main.js — átadás és kitöltés**

Az `onGameOver` callback (js/main.js:71-74):

```js
// ELŐTTE:
    game.onGameOver = (score) => {
        state = 'gameover';
        showGameOverScreen(score);
    };
// UTÁNA:
    game.onGameOver = (score, stats) => {
        state = 'gameover';
        showGameOverScreen(score, stats);
    };
```

A `showGameOverScreen` (js/main.js:243):

```js
function showGameOverScreen(score, stats) {
    gameOverScreen.classList.remove('hidden');
    finalScoreEl.textContent = formatScore(score);
    emailInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Pontszám mentése';

    // Run stats
    if (stats) {
        document.getElementById('stat-distance').textContent = `${formatScore(stats.distance)} m`;
        document.getElementById('stat-combo').textContent = `×${stats.maxCombo}`;
        document.getElementById('stat-nearmiss').textContent = stats.nearMisses;
        document.getElementById('stat-bosses').textContent = stats.bosses;
    }

    // Show leaderboard
    leaderboard.renderInto(leaderboardContainer);

    // Focus email input after short delay
    setTimeout(() => emailInput.focus(), 300);
}
```

- [ ] **Step 7: Verifikáció**

`python3 -m http.server 8143`, Playwright, ideiglenes `window.__game` hook (commit előtt TÖRÖLNI). Játssz rövidet (ugrálj, szedj hotdogot kombóért), aztán `__game.player.lives = 1` + ütközés (vagy `__game.player.lives = 0` közvetlenül nem elég — a game over az update-ben dől el, szóval `lives = 1` + várj ütközésre, VAGY hívd: `__game.player.lives = 0` majd egy frame múlva a game over lefut). Ellenőrizd a game over képernyőn: mind a 4 stat jelenik meg értelmes értékkel (táv > 0 m, max kombó ≥ a futásban látott kombó); e-mail mentés + ranglista tovább működik; „Újra!" után új futás → újabb game over: a státuszok az ÚJ futást tükrözik (nem az előzőt). Screenshot: `task4-stats.png`. Console hibátlan.

- [ ] **Step 8: Commit**

```bash
git add js/game.js js/main.js index.html css/style.css
git commit -m "📊 Futam-statisztika a game over képernyőn"
```

---

### Task 5: Takarítás + teljes regressziós checklist

**Files:**
- Modify: bármely fájl, ha a checklist hibát talál (javítás a hiba scope-jában)

- [ ] **Step 1: Kód-takarítás**

- Grep-ellenőrzés: nincs `window.__game`, `console.log`, `debugger` a commitolt kódban.
- `git status`: csak szándékolt fájlok; screenshotok (`task*.png`) ne kerüljenek be (a `.gitignore` már fedi).

- [ ] **Step 2: Teljes játékmenet-checklist (böngésző, friss port 8144)**

- [ ] billentyű: ←/→/Space/↑/↓, dupla ugrás, ground pound
- [ ] ütközés csak azonos sávban; invincibility-villogás
- [ ] gödör: mélynek látszik, perem pulzál, gőz mozog; hit + near-miss működik
- [ ] arany hotdog spawnol szervesen (hosszabb játék vagy hook), helyes pont
- [ ] kombó ×20-ig, ütközésnél reset; mágnes; ×2 power-up
- [ ] témaváltás CSAK 2000/6000/12000/20000-nél (hookkal ellenőrizve: 1000/3000-nél NINCS)
- [ ] boss 5000-nél; mérföldkő-banner helyes sorrendben
- [ ] game over → 4 stat helyes → e-mail → ranglista → Újra → tiszta állapot, statok nullázódtak
- [ ] DevTools console hibamentes; szűk ablakban akadásmentes

- [ ] **Step 3: Commit (ha volt javítás)**

```bash
git add -A
git commit -m "✨ Pacing/látvány csomag — takarítás és regresszió"
```

---

## Self-Review jegyzetek

- **Spec coverage:** §2 küszöbök → Task 1; §3 mély gödör → Task 2; §4 arany hotdog → Task 3; §5 statisztika → Task 4; §6 tesztelés → minden task verifikációs lépése + Task 5; §7 megkötések → Global Constraints; §8 YAGNI → nincs ellentmondó task.
- **Type-consistency:** `createPitMesh(span)` → `userData.rimMat`/`userData.steam` a Task 2 mindkét fájljában konzisztens; `'golden_hotdog'` string azonos a models.js/collectible.js/game.js-ben; `onGameOver(score, stats)` megegyezik game.js/main.js-ben; DOM-id-k (`stat-distance` stb.) azonosak index.html/main.js-ben.
- **Kockázat:** a `nearMissCount` két beszúrási helye eltérő indenttel — a diff-ellenőrzésnél figyelni.
