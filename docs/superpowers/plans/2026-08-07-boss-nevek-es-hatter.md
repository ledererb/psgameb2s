# Boss-elnevezés + éra-ritkítás + 3D háttér Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A boss-részek generikus nevet kapnak (DANGER ZONE — warning + bónusz szöveg), az éra-küszöbök ~3× ritkábbak lesznek (6000/16000/32000/55000), és a futó figura mögé teljes 3D háttér épül (gradiens ég-dóm + csillagok + égitest + sziluett-sávok), az éra-átmenetekkel szinkronban.

**Architecture:** A „2.5D mag, 3D héj" elv változatlan. A boss/éra-változások tiszta adat- és szöveg-módosítások a `js/game.js`-ben (a bossPatterns struktúra változatlan). A háttér új `js/background.js` modul (`Background3D`), amelyet a `World3D` meglévő téma-lerp gépezete hajt kibővített téma-mezőkkel. Nincs asset-fájl; minden primitív geometria vagy runtime canvas-textúra.

**Tech Stack:** Vanilla JS ES modulok, Three.js 0.170.0 (import map), HTML/CSS DOM overlay. Nincs build, nincs test framework.

Spec: `docs/superpowers/specs/2026-08-07-boss-nevek-es-hatter-design.md`

## Global Constraints

- **Branch:** az implementáció a `feature/boss-nevek-es-hatter` branchen történik (main-ből, a plan-commit után).
- Three.js pontosan **0.170.0** (jsdelivr import map); **nincs külső asset** — minden geometria/anyag/textúra kódból.
- **Nincs test framework** — minden task böngészős manuális checklistet futtat (Playwright, FRISS PORT taskonként; a Playwright modul-cache miatt új port kell).
- Logikai konstansok (sebesség, gravitáció, gap-ek, kombómax, HOTDOG_POINTS) **fagyasztva** — kivétel: `milestoneThresholds` (Task 1), spec szerint jóváhagyott. A `bossPatterns` és a teljes boss-mechanika **változatlan** (Task 2 tiszta szövegcsere, spec §2 scope-korrekció 2026-08-07).
- `leaderboard.js`, `audio.js`, `player.js`, `utils.js` **nem módosul**.
- UI-szövegek **magyarul**; commitüzenetek: emoji + rövid magyar leírás.
- A `window.__snacky = { game, world }` debug-handle **szándékolt, tartós** része a kódnak (spec §5) — commit előtt NEM törlendő (szakítás a korábbi ideiglenes-hook gyakorlattal).

---

### Task 1: Éra-küszöbök ritkítása + tartós debug-handle

**Files:**
- Modify: `js/game.js:182` (milestoneThresholds), `js/game.js:628` (komment)
- Modify: `js/main.js` (debug-handle az `init()`-ben)

**Interfaces:**
- Produces: új küszöbök `[6000, 16000, 32000, 55000]` — a `world.setTheme(currentMilestone + 1)` mapping változatlan; `window.__snacky = { game, world }` (a későbbi taskok verifikációja ezt használja).

- [x] **Step 1: Küszöbök cseréje (js/game.js)**

A konstruktorban:

```js
// ELŐTTE:
        this.milestoneThresholds = [2000, 6000, 12000, 20000];
// UTÁNA:
        this.milestoneThresholds = [6000, 16000, 32000, 55000];
```

és a milestone-check kommentje:

```js
// ELŐTTE:
            // Trigger theme change: 2000→dawn(1), 6000→day(2), 12000→sunset(3), 20000→neon(4)
// UTÁNA:
            // Trigger theme change: 6000→dawn(1), 16000→day(2), 32000→sunset(3), 55000→neon(4)
```

- [x] **Step 2: Tartós debug-handle (js/main.js)**

Az `init()`-ben, a `game = new Game(...)` sor utáni blokkba (az `onGameOver` callback környékén):

```js
    // Szándékolt, TARTÓS debug-handle a vizuális verifikációkhoz (spec §5).
    window.__snacky = { game, world };
```

- [x] **Step 3: Verifikáció** ✅ KÉSZ (commit e127f2a, review clean)

- [x] **Step 4: Commit** ✅ `🐌 Éra-küszöbök 6000/16000/32000/55000 + tartós __snacky debug-handle`

---

### Task 2: Boss-szövegek — DANGER ZONE

**Files:**
- Modify: `js/game.js:462-464` (bónusz floating text), `js/game.js:997` (warning-banner szöveg)

**Interfaces:**
- Consumes: meglévő boss-mechanika — teljesen változatlan (`bossPatterns` csupasz tömbök tömbje, `bossPatternIndex % 3` ciklus, spawn 65 frame, `nextBossScore += 5000`).
- Produces: warning-banner `⚠️ DANGER ZONE!`; bónusz floating text `DANGER ZONE LEGYŐZVE! +500`.

> **Scope-megjegyzés (2026-08-07, user-döntés):** az eredeti Task 2 hat nevesített
> mintát és +3 új mintát tartalmazott; a user a névrendszert generikus
> DANGER ZONE-ra egyszerűsítette, az új mintákat elvetve (spec §2
> scope-korrekció). Ez a revidált, kötelező változat: tiszta szövegcsere.

- [x] **Step 1: Warning-szöveg (js/game.js)**

A `_drawBossWarning(ctx)`-ben (js/game.js:997):

```js
// ELŐTTE:
        const text = '⚠️ BOSS KÖZELEG!';
// UTÁNA:
        const text = '⚠️ DANGER ZONE!';
```

- [x] **Step 2: Bónusz-szöveg (js/game.js)**

A boss rest-timer végén (js/game.js:462-464):

```js
// ELŐTTE:
                this.floatingTexts.push(
                    new FloatingText(this.viewW / 2, this.viewH / 2 - 40, '+500 BOSS BÓNUSZ!', '#F1C40F')
                );
// UTÁNA:
                this.floatingTexts.push(
                    new FloatingText(this.viewW / 2, this.viewH / 2 - 40, 'DANGER ZONE LEGYŐZVE! +500', '#F1C40F')
                );
```

- [x] **Step 3: Verifikáció**

`python3 -m http.server 8151` (háttérben), Playwright, START gomb (`#start-btn`). A `window.__snacky` handle tartós, használd.

**Fontos:** headless Chromiumban a rAF uncapped (~500 fps) — a frame-alapú timerek (180-frame warning, 200-frame rest, 50-frame floating text) ~0,3 s wall-clock alatt lejárnak. Ne wall-clock várakozással dolgozz, hanem frame-enkénti pollinggal egyetlen `browser_evaluate` async függvényben (`await new Promise(requestAnimationFrame)` lépésenként), és a figyelés alatt tartsd a játékos életét 99-en (`game.player.lives = 99`).

1. **Warning:** `page.evaluate(() => { window.__snacky.game.score = 4950; })` → poll-old, amíg `window.__snacky.game.bossWarning === true` → a banner szövege „⚠️ DANGER ZONE!” (villog — több frame-en screenshotolj, legalább egyiken látszik). Screenshot: `task2-danger-warning.png`.
2. **Bónusz:** amikor `bossActive === true`: `page.evaluate(() => { const g = window.__snacky.game; g.bossPatternStep = g.bossCurrentPattern.length; })` → a minta azonnal „befejeződik”, rest 200 frame → poll-old, amíg `window.__snacky.game.floatingTexts.some(ft => ft.text === 'DANGER ZONE LEGYŐZVE! +500')` true nem lesz (max ~2 s); screenshot `task2-danger-bonus.png`.
3. **Regresszió:** a boss-minták változatlanul spawnolnak (a warning után akadályok/gödrök érkeznek — `game.obstacles.length + game.pits.length > 0` a boss alatt), ütközés működik; console hibátlan.

- [x] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "⚠️ Boss-szövegek: DANGER ZONE"
```

---

### Task 3: Háttér-modul — `js/background.js` (éjszakai állapottal bekötve)

**Files:**
- Create: `js/background.js`
- Modify: `js/world.js` (import, THEMES_3D új mezők, parseTheme, konstruktor-bekötés, `update()`-hívás)

**Interfaces:**
- Consumes: `World3D.sceneMgr.scene`; `parseTheme(THEMES_3D[0])` eredménye mint kezdő témaállapot.
- Produces: `Background3D` osztály: `constructor(scene, theme)`, `applyTheme(cur)`, `update()`. A `cur` objektum mezői (a Task 4 ezeket lerpolja): `sky` (Color = horizont), `skyTop` (Color), `starI` (0..1), `celColor` (Color), `celPos` (Vector3, normalizált irány), `celSize` (világegység), `glowI` (0..1).

- [x] **Step 1: `js/background.js` létrehozása (teljes fájl)**

```js
// ============================================
// Snacky Dash 3D — Background
// Ég-dóm (gradiens), csillagmező, égitest,
// távoli város-sziluettek. Tiszta nézetréteg:
// a World3D téma-gépezete hajtja (spec §4).
// Session-életű: szándékosan nincs dispose
// (a shared building-textúra mintája szerint).
// ============================================

import * as THREE from 'three';

const DOME_RADIUS = 170;        // kamera far = 200; a dóm távoli pereme ~178
const STAR_COUNT = 350;
const STAR_RADIUS = 150;
const CELESTIAL_DISTANCE = 140;
const SKYLINE_SPAN = 240;       // x ∈ [-240, 240] — a fekvő hFOV-t is fedi

// Sziluett-sávok: mélység, toronyszám, tint-szorzó (horizont-színből),
// magasság-tartomány. A spawn-zóna (z ≥ -76) MÖGÖTT — sosem takarnak
// akadályt. fog: false → a tint hordja az atmoszférikus mélységet.
const SKYLINE_BANDS = [
    { z: -125, count: 26, tintMul: 0.35, minH: 6, maxH: 22 },
    { z: -145, count: 28, tintMul: 0.6,  minH: 6, maxH: 22 },
    { z: -160, count: 30, tintMul: 0.85, minH: 6, maxH: 22 },
];

// Megosztott lágykorong-textúra az égitesthez (korong + glow ugyanaz,
// modul-szinten egyszer hozva — sosem dispose-oljuk; building-tex minta).
let _circleTex = null;
function getCircleTexture() {
    if (_circleTex) return _circleTex;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,1)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    _circleTex = new THREE.CanvasTexture(c);
    return _circleTex;
}

export class Background3D {
    /**
     * @param {THREE.Scene} scene
     * @param {object} theme parseTheme()-elt kezdő témaállapot (world.js)
     */
    constructor(scene, theme) {
        this._t = 0;
        this._starBase = 0;
        this._celTmp = new THREE.Vector3();

        // ── a) Ég-dóm: gradiens horizont→zenit ──
        this.domeMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                topColor: { value: new THREE.Color('#030312') },
                horizonColor: { value: new THREE.Color('#0B0B2B') },
            },
            vertexShader: `
                varying vec3 vPos;
                void main() {
                    vPos = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                varying vec3 vPos;
                void main() {
                    float t = smoothstep(0.0, 0.5, normalize(vPos).y);
                    gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
                }
            `,
        });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 24, 12), this.domeMat);
        dome.renderOrder = -1; // mindig hátul
        scene.add(dome);

        // ── b) Csillagmező a felső félgömbön ──
        const pos = new Float32Array(STAR_COUNT * 3);
        for (let i = 0; i < STAR_COUNT; i++) {
            // Terület-egyenletes eloszlás a felső félgömbön (y = cos polárszög)
            const theta = Math.random() * Math.PI * 2;
            const y = 0.05 + Math.random() * 0.95;
            const r = Math.sqrt(1 - y * y);
            pos[i * 3] = Math.cos(theta) * r * STAR_RADIUS;
            pos[i * 3 + 1] = y * STAR_RADIUS;
            pos[i * 3 + 2] = Math.sin(theta) * r * STAR_RADIUS;
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.starMat = new THREE.PointsMaterial({
            color: 0xFFFFEE, size: 1.6, sizeAttenuation: false,
            transparent: true, opacity: 1, depthWrite: false, fog: false,
        });
        scene.add(new THREE.Points(starGeo, this.starMat));

        // ── c) Égitest: korong + glow (megosztott textúra, tintelve) ──
        this.celDisc = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getCircleTexture(), transparent: true, depthWrite: false, fog: false,
        }));
        this.celGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getCircleTexture(), transparent: true, opacity: 0.2,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }));
        scene.add(this.celDisc, this.celGlow);

        // ── d) Sziluett-sávok: sávonként egy InstancedMesh (1 draw call/sáv) ──
        this.skylineMats = [];
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const m = new THREE.Matrix4();
        for (const band of SKYLINE_BANDS) {
            const mat = new THREE.MeshBasicMaterial({ fog: false });
            this.skylineMats.push(mat);
            const inst = new THREE.InstancedMesh(boxGeo, mat, band.count);
            for (let i = 0; i < band.count; i++) {
                const w = 6 + Math.random() * 6;
                const h = band.minH + Math.random() * (band.maxH - band.minH);
                const d = 6 + Math.random() * 6;
                const x = -SKYLINE_SPAN + (i + 0.5) * (2 * SKYLINE_SPAN / band.count)
                    + (Math.random() - 0.5) * 6;
                m.makeScale(w, h, d);
                m.setPosition(x, h / 2, band.z + (Math.random() - 0.5) * 6);
                inst.setMatrixAt(i, m);
            }
            inst.instanceMatrix.needsUpdate = true;
            inst.frustumCulled = false; // szétszórt instance-ok; mindig látszódjon
            scene.add(inst);
        }

        this.applyTheme(theme);
    }

    /** Témaállapot alkalmazása (a World3D lerp-blokkja hívja átmenet közben). */
    applyTheme(cur) {
        this.domeMat.uniforms.topColor.value.copy(cur.skyTop);
        this.domeMat.uniforms.horizonColor.value.copy(cur.sky);

        this._starBase = cur.starI;

        this.celDisc.material.color.copy(cur.celColor);
        this.celGlow.material.color.copy(cur.celColor);
        this.celGlow.material.opacity = cur.glowI * 0.35;
        this.celDisc.scale.set(cur.celSize, cur.celSize, 1);
        this.celGlow.scale.set(cur.celSize * 2.5, cur.celSize * 2.5, 1);
        // A lerpelt (nem-normalizált) irányt normalizáljuk → fix távolság
        this._celTmp.copy(cur.celPos).normalize().multiplyScalar(CELESTIAL_DISTANCE);
        this.celDisc.position.copy(this._celTmp);
        this.celGlow.position.copy(this._celTmp);

        for (let i = 0; i < this.skylineMats.length; i++) {
            this.skylineMats[i].color.copy(cur.sky).multiplyScalar(SKYLINE_BANDS[i].tintMul);
        }
    }

    /** Frame-frissítés: csillag-twinkle (egy szinusz per frame). */
    update() {
        this._t++;
        this.starMat.opacity = this._starBase * (0.85 + 0.15 * Math.sin(this._t * 0.03));
    }
}
```

- [x] **Step 2: world.js — import + THEMES_3D új mezők**

Az import-blokk bővítése (js/world.js:6-8 után):

```js
import { Background3D } from './background.js';
```

A `THEMES_3D` tömb teljes cseréje (js/world.js:16-22) — a meglévő mezők változatlanok, az újak: `skyTop`, `starI`, `celColor`, `celPos`, `celSize`, `glowI`:

```js
const THEMES_3D = [
    { sky: '#0B0B2B', fogNear: 45, fogFar: 110, hemiSky: '#8899FF', hemiGround: '#332222', sun: '#AABBFF', sunI: 0.8, windowI: 1.0,
      skyTop: '#030312', starI: 1.0,  celColor: '#E8ECFF', celPos: [-0.45, 0.55, -1], celSize: 10, glowI: 0.5 }, // night
    { sky: '#3D2B52', fogNear: 50, fogFar: 120, hemiSky: '#FFB347', hemiGround: '#443333', sun: '#FF9F5A', sunI: 0.9, windowI: 0.7,
      skyTop: '#1B1032', starI: 0.25, celColor: '#FFB347', celPos: [0.5, 0.14, -1],   celSize: 12, glowI: 0.8 }, // dawn
    { sky: '#4A90D9', fogNear: 60, fogFar: 140, hemiSky: '#BBDDFF', hemiGround: '#556644', sun: '#FFF4D6', sunI: 1.3, windowI: 0.1,
      skyTop: '#2356A8', starI: 0.0,  celColor: '#FFF4D6', celPos: [0.3, 0.7, -0.8],  celSize: 9,  glowI: 0.6 }, // day
    { sky: '#D96A3B', fogNear: 50, fogFar: 115, hemiSky: '#FFAA66', hemiGround: '#553333', sun: '#FF7733', sunI: 1.0, windowI: 0.8,
      skyTop: '#46183F', starI: 0.15, celColor: '#FF7733', celPos: [0.05, 0.09, -1],  celSize: 16, glowI: 1.0 }, // sunset
    { sky: '#12082B', fogNear: 45, fogFar: 110, hemiSky: '#FF44CC', hemiGround: '#220033', sun: '#44FFEE', sunI: 0.9, windowI: 1.2,
      skyTop: '#05020F', starI: 0.8,  celColor: '#FF44CC', celPos: [-0.4, 0.5, -1],   celSize: 10, glowI: 0.9 }, // neon
];
```

- [x] **Step 3: world.js — parseTheme bővítése**

A teljes függvény cseréje (js/world.js:26-37):

```js
function parseTheme(t) {
    return {
        sky: new THREE.Color(t.sky),
        skyTop: new THREE.Color(t.skyTop),
        hemiSky: new THREE.Color(t.hemiSky),
        hemiGround: new THREE.Color(t.hemiGround),
        sun: new THREE.Color(t.sun),
        fogNear: t.fogNear,
        fogFar: t.fogFar,
        sunI: t.sunI,
        windowI: t.windowI,
        starI: t.starI,
        celColor: new THREE.Color(t.celColor),
        celPos: new THREE.Vector3(...t.celPos).normalize(),
        celSize: t.celSize,
        glowI: t.glowI,
    };
}
```

- [x] **Step 4: world.js — konstruktor-bekötés + update-hívás**

A konstruktor végére (a buildings for-ciklus után, js/world.js:69 körül):

```js
        // Háttér (ég-dóm, csillagok, égitest, sziluett-sávok) — a téma-gép hajtja.
        // Kezdőállapot: a settle-elt éjszakai téma (this._cur).
        this.background = new Background3D(sceneMgr.scene, this._cur);
```

Az `update(gameSpeed)` végére (a theme-transition blokk után, js/world.js:115 után):

```js
        if (this.background) this.background.update();
```

- [x] **Step 5: Verifikáció**

`python3 -m http.server 8152`, Playwright, START gomb.

1. Boot után az éjszakai háttér látszik játék közben: **nem sík** az ég (gradiens sötétebb felül), csillagok a felső régióban, halvány hold balra-fent, és 2-3 sötétebb épületsor a horizonton a köd fölött. Screenshot: `task3-night.png`.
2. Akadály-olvashatóság: játssz ~15 mp-et → a spawnolt akadályok/gödrök változatlanul jól látszanak (a sziluett nem takar semmit). Screenshot: `task3-gameplay.png`.
3. `window.__snacky.world.setTheme(2)` után a FŐ jelenet (ég/köd/fények) átvált nappalra, de a háttér-komponensek még az éjszakai állapotban maradnak — ez VÁRT viselkedés ebben a taskban (a Task 4 köti be őket). Console hibátlan mindkét állapotban.
4. Console hibátlan boot óta.

- [x] **Step 6: Commit**

```bash
git add js/background.js js/world.js
git commit -m "🌃 3D háttér: ég-dóm, csillagok, égitest, sziluett-sávok (éj-állapot)"
```

---

### Task 4: Téma-lerp kiterjesztése — a háttér is átmenettel vált

**Files:**
- Modify: `js/world.js` (`_snapshotCurrent`, lerp-blokk az `update()`-ben, `_applyTheme`)

**Interfaces:**
- Consumes: `Background3D.applyTheme(cur)` (Task 3); a `cur` mezőlista a Task 3 Interfaces-blokkja szerint.
- Produces: teljes téma-átmenet — a háttér minden komponense (dóm, csillagok, égitest, sziluett) a 120 frame-es lerp-ben vált; `_snapshotCurrent()` az új mezőkkel (mid-transition váltás folytonos marad).

- [x] **Step 1: world.js — `_snapshotCurrent()` bővítése**

A teljes metódus cseréje (js/world.js:132-144):

```js
    /** Snapshot of the currently displayed theme state (handles mid-transition). */
    _snapshotCurrent() {
        const c = this._cur;
        return {
            sky: c.sky.clone(),
            skyTop: c.skyTop.clone(),
            hemiSky: c.hemiSky.clone(),
            hemiGround: c.hemiGround.clone(),
            sun: c.sun.clone(),
            fogNear: c.fogNear,
            fogFar: c.fogFar,
            sunI: c.sunI,
            windowI: c.windowI,
            starI: c.starI,
            celColor: c.celColor.clone(),
            celPos: c.celPos.clone(),
            celSize: c.celSize,
            glowI: c.glowI,
        };
    }
```

- [x] **Step 2: world.js — lerp-blokk bővítése (update(), js/world.js:100-115)**

A `const t = this.themeT;` UTÁNI sorok cseréje/bővítése:

```js
// ELŐTTE:
            cur.sky.lerpColors(from.sky, to.sky, t);
            cur.hemiSky.lerpColors(from.hemiSky, to.hemiSky, t);
            cur.hemiGround.lerpColors(from.hemiGround, to.hemiGround, t);
            cur.sun.lerpColors(from.sun, to.sun, t);
            cur.fogNear = from.fogNear + (to.fogNear - from.fogNear) * t;
            cur.fogFar = from.fogFar + (to.fogFar - from.fogFar) * t;
            cur.sunI = from.sunI + (to.sunI - from.sunI) * t;
            cur.windowI = from.windowI + (to.windowI - from.windowI) * t;
            this._applyTheme(cur);
// UTÁNA:
            cur.sky.lerpColors(from.sky, to.sky, t);
            cur.skyTop.lerpColors(from.skyTop, to.skyTop, t);
            cur.hemiSky.lerpColors(from.hemiSky, to.hemiSky, t);
            cur.hemiGround.lerpColors(from.hemiGround, to.hemiGround, t);
            cur.sun.lerpColors(from.sun, to.sun, t);
            cur.fogNear = from.fogNear + (to.fogNear - from.fogNear) * t;
            cur.fogFar = from.fogFar + (to.fogFar - from.fogFar) * t;
            cur.sunI = from.sunI + (to.sunI - from.sunI) * t;
            cur.windowI = from.windowI + (to.windowI - from.windowI) * t;
            // Háttér-mezők (spec §4.6)
            cur.starI = from.starI + (to.starI - from.starI) * t;
            cur.celColor.lerpColors(from.celColor, to.celColor, t);
            cur.celPos.lerpVectors(from.celPos, to.celPos, t);
            cur.celSize = from.celSize + (to.celSize - from.celSize) * t;
            cur.glowI = from.glowI + (to.glowI - from.glowI) * t;
            this._applyTheme(cur);
```

- [x] **Step 3: world.js — `_applyTheme` hívja a hátteret**

A metódus végére (a buildings for-ciklus után, js/world.js:126-128 körül):

```js
// ELŐTTE:
        for (const b of this.buildings) {
            b.mesh.material.emissiveIntensity = cur.windowI;
        }
    }
// UTÁNA:
        for (const b of this.buildings) {
            b.mesh.material.emissiveIntensity = cur.windowI;
        }
        if (this.background) this.background.applyTheme(cur);
    }
```

- [x] **Step 4: Verifikáció**

`python3 -m http.server 8153`, Playwright, START gomb. Minden témára: `page.evaluate(i => window.__snacky.world.setTheme(i), N)` → várj az átmenet végéig (frame-pollinggal: `world.themeT === 1`, ~120 frame + ráhagyás) → screenshot + állapot-ellenőrzés.

1. **Hajnal (1):** ég meleg lilás-narancsos, nap alacsonyan jobbra, csillagok alig látszanak. `task4-dawn.png`.
2. **Nap (2):** kék gradiens-ég, csillagok ELTŰNTEK, fényes nap magasan. `page.evaluate(() => window.__snacky.world.background._starBase)` === `0`. `task4-day.png`.
3. **Naplemente (3):** nagy narancs nap mélyen, a sziluett-sáv mögé lapulhat; ég narancs-lila. `task4-sunset.png`.
4. **Neon (4):** magenta hold, csillagok vissza, sziluett sötét lilás. `task4-neon.png`.
5. **Folytonosság:** átmenet KÖZBEN (`setTheme(3)` után ~1 s) újabb `setTheme(4)` → nincs ugrás/villanás (a `_snapshotCurrent` az új mezőkkel dolgozik). Console hibátlan.
6. **Portrait:** `page.setViewportSize({ width: 390, height: 844 })` → reload → START → éj + nap screenshot (`task4-portrait-night.png`, `task4-portrait-day.png`) — a dóm mindenhol kitakar, a sziluett látszik.
7. Console hibátlan végig.

- [x] **Step 5: Commit**

```bash
git add js/world.js
git commit -m "🌅 Téma-lerp a háttérre: 5 éra teljes átmenettel"
```

---

### Task 5: Takarítás + teljes regresszió + vizuális review

**Files:**
- Modify: bármely fájl, ha a checklist hibát talál (javítás a hiba scope-jában)

- [x] **Step 1: Kód-takarítás**

- Grep-ellenőrzés: nincs `console.log`, `debugger` a commitolt kódban (`window.__snacky` marad — szándékolt, spec §5).
- `git status`: csak szándékolt fájlok; screenshotok (`task*.png`) ne kerüljenek be (a `.gitignore` fedi).

- [x] **Step 2: Teljes játékmenet-checklist (böngésző, friss port 8154)**

- [ ] billentyű: ←/→/Space/↑/↓, dupla ugrás, ground pound, csúszás
- [ ] ütközés csak azonos sávban; invincibility-villogás
- [ ] boss-warning „⚠️ DANGER ZONE!”; bónusz „DANGER ZONE LEGYŐZVE! +500”; a 3 boss-minta változatlanul körbe-körbe
- [ ] éra-banner CSAK 6000/16000/32000/55000-nél (2000/12000/20000-nél NINCS)
- [ ] háttér mind az 5 témán: gradiens ég, csillagok (napközben nincs), égitest helyes helyen, sziluett-sávok; átmenet sima
- [ ] akadályok/gödrök/collectible-k jól olvashatók minden témán (a sziluett nem takar)
- [ ] kombó, mágnes, ×2, küldetés-HUD, near-miss változatlanul működik
- [ ] game over → stat-blokk (👹 boss-számláló nő) → e-mail → ranglista → Újra → éjszakai háttér, tiszta állapot
- [ ] portrait (390×844) és fekvő nézet egyaránt helyes
- [ ] DevTools console hibamentes; szűk ablakban akadásmentes

- [x] **Step 3: Vizuális review a felhasználóval**

Mutasd meg a screenshotokat (5 téma fekvő + portrait, DANGER ZONE warning, DANGER ZONE LEGYŐZVE bónusz) a felhasználónak jóváhagyásra. Hangolási igény (színek, méretek, sűrűség) esetén a `THEMES_3D` új mezői / `SKYLINE_BANDS` konstansok a hangolási felületek — a finomítás a spec §4.6 megjegyzése szerint megengedett, struktúra-változás nélkül.

- [x] **Step 4: Commit (ha volt javítás/hangolás)**

```bash
git add -A
git commit -m "✨ Boss/éra/háttér csomag — takarítás és regresszió"
```

---

## Self-Review jegyzetek

- **Spec coverage:** §2 DANGER ZONE szövegek → Task 2; §3 éra-küszöbök → Task 1; §4 háttér (a-d komponensek, téma-mezők, bekötés) → Task 3 + Task 4; §5 debug-handle → Task 1 Step 2; §6 tesztelés → minden task verifikációs lépése + Task 5; §7 megkötések → Global Constraints; §8 YAGNI → nincs ellentmondó task. (§2 scope-korrekció 2026-08-07: a 6 mintás névrendszer és a +3 új minta user-döntésre kikerült — Task 2 revidálva.)
- **Type-consistency:** `bossPatterns` változatlan (csupasz tömbök tömbje); a Task 2 gyors-forward snippetje ezért `bossCurrentPattern.length`-et használ (NEM `.entries`). `Background3D` API (`constructor(scene, theme)`, `applyTheme(cur)`, `update()`) azonos a Task 3/4-ben; a `cur`-mezők (`skyTop`, `starI`, `celColor`, `celPos` mint Vector3, `celSize`, `glowI`) azonosak a parseTheme/_snapshotCurrent/lerp/applyTheme láncolatban.
- **Sorrend-érzékenység:** a Task 3 parseTheme-bővítése ELŐTT kell a Background3D-konstrukció (ugyanabban a taskban, Step 3 → Step 4), különben `cur.skyTop` undefined lenne. A Task 4 lerp-blokkja a Task 3 mezőire támaszkodik.
- **Kockázat:** nincs strukturális boss-változás (Task 2 tiszta szövegcsere) — a boss-mechanika regressziója kizárt; a verifikáció a szöveghelyességet és a spawn-regressziót fedi.
