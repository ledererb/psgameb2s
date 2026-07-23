# Snacky Dash 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Snacky Dash átírása 3 sávos, Three.js-alapú 3D endless runnerré a meglévő játéklogika megőrzésével.

**Architecture:** „2.5D mag, 3D héj" — a játéklogika absztrakt `(sáv, x, y)` térben marad (a mostani koordinátarendszerrel számszerint azonosan), a Three.js tiszta megjelenítő. A HUD egy átlátszó 2D overlay canvas-on marad, a világtérbeli események pozíciói 3D→2D vetítéssel kerülnek rá. Spec: `docs/superpowers/specs/2026-07-23-snacky-dash-3d-design.md`.

**Tech Stack:** Vanilla JS (ES modulok), Three.js 0.170.0 (import map, jsdelivr CDN), nincs build-lépés. Helyi futtatás: `python3 -m http.server 8000` a repo gyökerében, böngésző: `http://localhost:8000`.

## Global Constraints

- Three.js verzió: pontosan `0.170.0`, jsdelivr import map-pel; külső asset (textúra, modellfájl) TILOS — minden geometria és szín kódból.
- Nincs teszt-keretrendszer: minden task végpontja manuális böngészős verifikáció a megadott checklist alapján + commit.
- A meglévő logikai konstansok (`GRAVITY`, `JUMP_FORCE`, `INITIAL_SPEED=5`, `MAX_SPEED=15`, gap-ek, `GROUND_Y=320`, `PLAYER_X=100`) NEM változnak — csak a megjelenítés transzformál.
- UI-szövegek magyarul maradnak; `leaderboard.js` és `audio.js` egy sora sem módosul.
- Commit-üzenetek a repó stílusában: emoji + rövid magyar leírás.
- **Tudatos eltérés a spec §5-től:** a pickup/hit particle-ök nem 3D `THREE.Points`, hanem a meglévő 2D overlay-particle rendszer marad, 3D→2D vetített pozícióval. Indok: képernyőtérben pixel-azonos eredmény, a meglévő kód 100%-ban újrahasznosul. Az időjárás és a trail ettől függetlenül 3D-ben készül (világhorgonyzottak).

---

### Task 1: Three.js scaffold + overlay canvas

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Create: `js/scene.js`
- Modify: `js/main.js`

**Interfaces:**
- Produces: `SceneManager` osztály (`js/scene.js`): `constructor(canvas)`, `.scene` (THREE.Scene), `.camera`, `.renderer`, `.hemi`, `.sun`, `updateCamera(speedNorm /*0..1*/, playerWorldX)`, `setShake(sx, sy)`, `projectToScreen(v3, out /*{x,y}*/)`, `render()`.
- Produces: DOM `#overlayCanvas` (800×400 logikai, átlátszó, `pointer-events: none`), amire a HUD kerül.

- [ ] **Step 1: index.html — import map + overlay canvas**

A `<canvas id="gameCanvas" ...>` sor után add hozzá az overlay canvast, és a `</body>` előtti script tag elé az import mapet:

```html
        <canvas id="overlayCanvas" width="800" height="400"></canvas>
```

```html
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"
        }
    }
    </script>
    <script type="module" src="js/main.js"></script>
```

- [ ] **Step 2: css/style.css — rétegezés**

A `#game-container` legyen `position: relative`, a két canvas egymáson:

```css
#game-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #08081A;
}

#gameCanvas, #overlayCanvas {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

#overlayCanvas {
    pointer-events: none;
    z-index: 2;
}

#gameCanvas {
    z-index: 1;
}
```

(A régi `#gameCanvas`-re vonatkozó ütköző szabályokat — pl. margin/border — távolítsd el.)

- [ ] **Step 3: js/scene.js — SceneManager**

```js
// ============================================
// Snacky Dash 3D — Scene Manager
// WebGL renderer, camera rig, lights, fog.
// Pure view layer: reads logical game state.
// ============================================

import * as THREE from 'three';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './utils.js';

export class SceneManager {
    constructor(canvas) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#0B0B2B');
        this.scene.fog = new THREE.Fog('#0B0B2B', 30, 90);

        this.baseFov = 60;
        this.camera = new THREE.PerspectiveCamera(
            this.baseFov, CANVAS_WIDTH / CANVAS_HEIGHT, 0.1, 200
        );
        this.camera.position.set(0, 4.5, 8);

        this.hemi = new THREE.HemisphereLight('#8899FF', '#332222', 0.9);
        this.scene.add(this.hemi);

        this.sun = new THREE.DirectionalLight('#AABBFF', 0.8);
        this.sun.position.set(-6, 12, 4);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        this.sun.shadow.camera.left = -12;
        this.sun.shadow.camera.right = 12;
        this.sun.shadow.camera.top = 12;
        this.sun.shadow.camera.bottom = -12;
        this.sun.shadow.camera.far = 40;
        this.scene.add(this.sun);

        this.shakeX = 0;
        this.shakeY = 0;
        this.camLagX = 0;

        this._projTmp = new THREE.Vector3();
    }

    updateCamera(speedNorm, playerWorldX) {
        // FOV kick with speed
        this.camera.fov = this.baseFov + speedNorm * 15;
        this.camera.updateProjectionMatrix();

        // Smooth lateral follow with lag
        this.camLagX += (playerWorldX * 0.5 - this.camLagX) * 0.08;

        this.camera.position.set(
            this.camLagX + this.shakeX,
            4.5 + this.shakeY,
            8
        );
        this.camera.lookAt(this.camLagX * 1.4, 1.0, -10);
    }

    setShake(sx, sy) {
        this.shakeX = sx * 0.06;
        this.shakeY = sy * 0.06;
    }

    /** Project a world position to overlay-canvas (800x400 logical) coords. */
    projectToScreen(v3, out) {
        this._projTmp.copy(v3).project(this.camera);
        out.x = (this._projTmp.x * 0.5 + 0.5) * CANVAS_WIDTH;
        out.y = (-this._projTmp.y * 0.5 + 0.5) * CANVAS_HEIGHT;
        return out;
    }

    setSky(fogColor, near, far) {
        this.scene.background.set(fogColor);
        this.scene.fog.color.set(fogColor);
        this.scene.fog.near = near;
        this.scene.fog.far = far;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
```

- [ ] **Step 4: js/utils.js — világ-koordináta segédek**

A fájl végére:

```js
// ── 3D world mapping ──
export const LANE_WIDTH = 2.2;            // world units between lane centers
export const LANES = [-LANE_WIDTH, 0, LANE_WIDTH]; // lane 0,1,2 -> world x
export const WORLD_SCALE = 0.1;           // logical px -> world units

/** Logical obstacle x (canvas-style, decreasing) -> world z. */
export function logicalToWorldZ(x) {
    return (PLAYER_X - x) * WORLD_SCALE;
}

/** Height above ground (world units) for an entity whose logical top is y. */
export function worldY(logicalYTop, logicalHeight) {
    return (GROUND_Y - logicalYTop - logicalHeight) * WORLD_SCALE;
}
```

- [ ] **Step 5: js/main.js — overlay ctx + SceneManager bekötése (átmeneti állapot)**

Változások:
- `init()`-ben: `overlayCanvas = document.getElementById('overlayCanvas'); overlayCtx = overlayCanvas.getContext('2d');` — DPR-skálázás ugyanúgy, mint a `canvas`-nál.
- `handleResize()`: mindkét canvasra alkalmazd (ugyanaz a CSS-méret és DPR backing store).
- A `Game` példányosítás egyelőre marad `new Game(audio)`; a `loop()`-ban `game.draw(ctx)` helyett ideiglenesen: `game.draw(overlayCtx)` (a játék 2D-ben rajzol az overlay-re, amíg a 3D réteg felépül — a következő taszkok cserélik le).
- A `SceneManager`-t még ne példányosítsd (Task 2 köti be).

- [ ] **Step 6: Verifikáció**

Run: `python3 -m http.server 8000`, böngésző: `http://localhost:8000`.
Expected: a játék hiba nélkül indul, a 2D játék az overlay-en játszható, a konzol hibamentes (a háttérben a WebGL canvas még fekete/üres — a menü animáció az overlay-re rajzol).

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css js/scene.js js/main.js js/utils.js
git commit -m "🏗️ Three.js scaffold: import map, SceneManager, overlay canvas"
```

---

### Task 2: Végtelen út + kamera-rig

**Files:**
- Create: `js/world.js`
- Create: `js/models.js` (első rész: út + épület gyárak)
- Modify: `js/main.js`
- Delete: `js/background.js`

**Interfaces:**
- Consumes: `SceneManager` (Task 1), `logicalToWorldZ`, `WORLD_SCALE` (Task 1).
- Produces: `World3D` (`js/world.js`): `constructor(sceneMgr)`, `update(gameSpeed)`, `setTheme(index)` (Task 7 tölti ki a témákat, most night-alap), `reset()`.
- Produces: `models.js`-ből: `createRoadSegment() -> THREE.Group`, `createBuilding() -> THREE.Mesh` (egyelőre egyszínű, ablakok nélkül).

- [ ] **Step 1: js/models.js — út és épület gyárak**

```js
// ============================================
// Snacky Dash 3D — Procedural Mesh Factories
// All models built from primitives. No assets.
// ============================================

import * as THREE from 'three';

const ROAD_LEN = 20; // world units per segment

export function createRoadSegment() {
    const g = new THREE.Group();

    // Asphalt
    const road = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.2, ROAD_LEN),
        new THREE.MeshStandardMaterial({ color: 0x2A2A35, roughness: 0.95 })
    );
    road.position.y = -0.1;
    road.receiveShadow = true;
    g.add(road);

    // Sidewalks
    for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.3, ROAD_LEN),
            new THREE.MeshStandardMaterial({ color: 0x8E8E8E, roughness: 0.9 })
        );
        walk.position.set(side * 4.8, -0.05, 0);
        walk.receiveShadow = true;
        g.add(walk);
    }

    // Lane divider dashes (between the 3 lanes)
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xF1C40F });
    for (const lx of [-1.1, 1.1]) {
        for (let z = -ROAD_LEN / 2 + 1; z < ROAD_LEN / 2; z += 4) {
            const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 1.6), dashMat);
            dash.position.set(lx, 0.01, z);
            g.add(dash);
        }
    }

    return g;
}

export function createBuilding() {
    const h = 3 + Math.random() * 9;
    const w = 2.5 + Math.random() * 2;
    const d = 2.5 + Math.random() * 2;
    const shade = 0x1A1A2E + Math.floor(Math.random() * 0x202020);
    const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: shade, roughness: 0.9 })
    );
    b.position.y = h / 2;
    return b;
}
```

- [ ] **Step 2: js/world.js — szegmens-újrahasznosítás**

```js
// ============================================
// Snacky Dash 3D — Endless World
// Recycled road segments + city. Theme system.
// ============================================

import { WORLD_SCALE } from './utils.js';
import { createRoadSegment, createBuilding } from './models.js';

const SEGMENT_COUNT = 8;
const SEGMENT_LEN = 20; // must match models.js ROAD_LEN

export class World3D {
    constructor(sceneMgr) {
        this.sceneMgr = sceneMgr;
        this.segments = [];
        this.buildings = [];

        for (let i = 0; i < SEGMENT_COUNT; i++) {
            const seg = createRoadSegment();
            seg.position.z = 10 - i * SEGMENT_LEN; // from behind camera into distance
            sceneMgr.scene.add(seg);
            this.segments.push(seg);

            // Buildings on both sides per segment
            for (const side of [-1, 1]) {
                const b = createBuilding();
                b.position.x = side * (7.5 + Math.random() * 2.5);
                b.position.z = seg.position.z;
                sceneMgr.scene.add(b);
                this.buildings.push({ mesh: b, side, segIndex: i });
            }
        }
    }

    update(gameSpeed) {
        const dz = gameSpeed * WORLD_SCALE;
        for (const seg of this.segments) {
            seg.position.z += dz;
            if (seg.position.z - SEGMENT_LEN / 2 > 12) {
                seg.position.z -= SEGMENT_COUNT * SEGMENT_LEN;
            }
        }
        for (const b of this.buildings) {
            b.mesh.position.z += dz;
            if (b.mesh.position.z > 12) {
                b.mesh.position.z -= SEGMENT_COUNT * SEGMENT_LEN;
                // Re-randomize on recycle
                const nb = createBuilding();
                b.mesh.geometry.dispose();
                b.mesh.geometry = nb.geometry;
                b.mesh.material = nb.material;
                b.mesh.scale.set(1, 1, 1);
                b.mesh.position.y = nb.position.y;
            }
        }
    }

    setTheme() { /* Task 7 */ }

    reset() {
        this.segments.forEach((seg, i) => { seg.position.z = 10 - i * SEGMENT_LEN; });
        for (const b of this.buildings) {
            b.mesh.position.z = this.segments[b.segIndex].position.z;
        }
    }
}
```

- [ ] **Step 3: js/main.js — 3D loop bekötése**

- `init()`-ben: `sceneMgr = new SceneManager(canvas); world = new World3D(sceneMgr);`
- A `loop()` így néz ki (a 2D játék overlay-je egyelőre marad):

```js
function loop() {
    if (state === 'playing') {
        game.update();
        game.draw(overlayCtx);
        world.update(game.getSpeed());
        sceneMgr.updateCamera(
            (game.getSpeed() - 5) / 10, // speedNorm 0..1 (INITIAL..MAX)
            0                            // playerWorldX: Task 3-ig 0
        );
        sceneMgr.render();
    } else if (state === 'menu') {
        drawMenuBackground();
        world.update(1.5); // lassú csúszás menüben is
        sceneMgr.updateCamera(0, 0);
        sceneMgr.render();
    } else if (state === 'gameover') {
        game.draw(overlayCtx);
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        overlayCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        sceneMgr.render();
    }
    requestAnimationFrame(loop);
}
```

(A `drawMenuBackground()` továbbra is az overlay-re rajzol — változatlan.)

- [ ] **Step 4: Régi háttér leválasztása**

`js/game.js`-ből: a `background` mező és a `this.background.update()/draw()` hívások törlése (a `ParallaxBackground` import is). `js/background.js` törlése. A `reset()`-ben a `this.background = new ParallaxBackground()` sor helyett: `if (this.world) this.world.reset();` — ehhez a `Game` konstruktor kapjon `world` paramétert: `new Game(audio, world)`, `this.world = world`.

- [ ] **Step 5: Verifikáció**

Reload. Expected: a 2D játék tovább játszik az overlay-en; mögötte a WebGL-rétegben végtelen út és épületek csúsznak (menüben lassan, játékban a gameSpeed szerint); konzol hibamentes.

- [ ] **Step 6: Commit**

```bash
git add js/world.js js/models.js js/main.js js/game.js
git rm js/background.js
git commit -m "🛣️ Végtelen út + város + kamera-rig (3D réteg él)"
```

---

### Task 3: Snacky 3D + sávváltás + fizika

**Files:**
- Modify: `js/models.js` (Snacky gyár hozzáadása)
- Modify: `js/player.js` (nagy átírás: fizika marad, canvas-rajzolás törlődik)
- Modify: `js/game.js` (input-átadás, scene sync)
- Modify: `js/main.js` (bal/jobb input)

**Interfaces:**
- Consumes: `SceneManager`, `LANES`, `worldY` (Task 1), `World3D` (Task 2).
- Produces: `createSnackyModel() -> { group, parts: { body, headGroup, armL, armR, legL, legR, scarf, pupilL, pupilR } }` (`models.js`).
- Produces: `Player` új mezők/metódusok: `.lane` (0|1|2, default 1), `.worldX`, `changeLane(dir /*-1|+1*/) -> bool`, `syncMesh()`; meglévő: `jump()`, `slide()`, `cancelSlide()`, `groundPound()`, `hit()`, `addLife()`, `update()`, `reset()`, `getHitbox()`, `isOnGround`, `lives`, `isInvincible` — változatlan viselkedés.
- Produces: `game.handleLaneChange(dir)` és `game.player.worldX` a kamerának.

- [ ] **Step 1: models.js — createSnackyModel()**

A `models.js` végére:

```js
export function createSnackyModel() {
    const group = new THREE.Group();
    const orange = new THREE.MeshStandardMaterial({ color: 0xE8862E, roughness: 0.55 });
    const black  = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.5 });
    const white  = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 });
    const red    = new THREE.MeshStandardMaterial({ color: 0xD63031, roughness: 0.7 });

    // Body (upright blob)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), orange);
    body.scale.set(1, 1.15, 0.9);
    body.position.y = 0.72;
    body.castShadow = true;
    group.add(body);

    // Head group holds face; runs toward -z, turned slightly so face is visible
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.05;
    headGroup.rotation.y = 0.55; // ~30° toward camera so the eyes are visible
    group.add(headGroup);

    // Ears
    for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), black);
        ear.scale.set(1, 1.5, 0.7);
        ear.position.set(side * 0.28, 0.42, 0.05);
        headGroup.add(ear);
    }

    // Eyes on the -z facing side of the head group
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), black);
    const pupilR = pupilL.clone();
    for (const [side, pupil] of [[-1, pupilL], [1, pupilR]]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), white);
        eye.position.set(side * 0.2, 0.12, -0.42);
        pupil.position.set(side * 0.2, 0.12, -0.52);
        headGroup.add(eye, pupil);
    }

    // Arms & legs (black capsules) — pivots at shoulder/hip
    const limbGeo = new THREE.CapsuleGeometry(0.07, 0.3, 4, 8);
    const armL = new THREE.Mesh(limbGeo, black);
    const armR = new THREE.Mesh(limbGeo, black);
    armL.position.set(-0.58, 0.85, 0);
    armR.position.set(0.58, 0.85, 0);
    const legL = new THREE.Mesh(limbGeo, black);
    const legR = new THREE.Mesh(limbGeo, black);
    legL.position.set(-0.22, 0.2, 0);
    legR.position.set(0.22, 0.2, 0);
    group.add(armL, armR, legL, legR);

    // Scarf (red band + trailing tail toward +z)
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 16), red);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.12;
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.55), red);
    scarf.position.set(0.25, 1.08, 0.42);
    group.add(band, scarf);

    return { group, parts: { body, headGroup, armL, armR, legL, legR, scarf, pupilL, pupilR } };
}
```

- [ ] **Step 2: player.js — fizika megtartása, rajzolás törlése**

`js/player.js` átalakítása:
- **Törlendő:** minden `draw*()` metódus és a canvas-specifikus segédek (a fájl ~200 sorra karcsúsodik). A `slideDustParticles` helyett az overlay-particle rendszer dolgozik (Task 10), a mező és a `getSlideDust()` hívások törölhetők.
- **Marad változatlanul:** `constructor` fizikás mezői, `jump()`, `slide()`, `cancelSlide()`, `groundPound()`, `hit()`, `addLife()`, `update()` fizika-része (gravitáció, ugrás, slide-timerek, invincibility), `reset()`, `getHitbox()`.
- **Új a constructorban:**

```js
// Lane system (0=left, 1=middle, 2=right)
this.lane = 1;
this.worldX = 0;

// 3D model
const model = createSnackyModel();
this.mesh = model.group;
this.parts = model.parts;
this.animTime = 0;
```

(import: `import { createSnackyModel } from './models.js';` és `import { LANES, worldY } from './utils.js';` — a `LANES`-t a meglévő utils importba olvasztva.)

- **Új metódusok:**

```js
changeLane(dir) {
    const next = Math.max(0, Math.min(2, this.lane + dir));
    if (next === this.lane) return false;
    this.lane = next;
    return true;
}

/** Map logical state -> 3D mesh position/rotation/scale. Called once per frame. */
syncMesh() {
    const m = this.mesh;

    // Smooth lane movement
    this.worldX += (LANES[this.lane] - this.worldX) * 0.25;

    // Height above ground (standing height is 60 logical px)
    const y = worldY(this.y, 60);

    m.position.set(this.worldX, y, 0);

    // Run animation
    this.animTime += 0.18;
    const runCycle = Math.sin(this.animTime);
    if (this.isOnGround && !this.isSliding) {
        m.position.y += Math.abs(runCycle) * 0.08;
        this.parts.legL.rotation.x = runCycle * 0.9;
        this.parts.legR.rotation.x = -runCycle * 0.9;
        this.parts.armL.rotation.x = -runCycle * 0.7;
        this.parts.armR.rotation.x = runCycle * 0.7;
    } else if (this.isSliding) {
        this.parts.legL.rotation.x = 0.4;
        this.parts.legR.rotation.x = 0.4;
    }

    // Squash & stretch (existing this.squash / this.stretch values)
    m.scale.set(this.squash, this.stretch, this.squash);

    // Lane-change tilt + air tilt
    const laneVel = LANES[this.lane] - this.worldX;
    m.rotation.z = -laneVel * 0.9;
    m.rotation.x = this.isSliding ? -0.9 : (this.isGroundPounding ? 0.4 : 0);

    // Scarf flutter
    this.parts.scarf.rotation.x = Math.sin(this.animTime * 1.7) * 0.4;

    // Invincibility blink
    m.visible = this.invincibleTimer <= 0 || Math.floor(this.invincibleTimer / 6) % 2 === 0;
}
```

- **A `reset()`-be:** `this.lane = 1; this.worldX = 0;` és `this.mesh.visible = true;`

- [ ] **Step 3: game.js bekötés**

- `Game` konstruktor: `new Game(audio, world, sceneMgr)` — `this.sceneMgr = sceneMgr;` és `sceneMgr.scene.add(this.player.mesh);`
- `update()` végén: `this.player.syncMesh();`
- Új input-metódus:

```js
handleLaneChange(dir) {
    if (!this.isRunning) return;
    if (this.player.changeLane(dir)) {
        this.audio.playJump(); // short whoosh placeholder; fine for now
    }
}
```

- [ ] **Step 4: main.js — bal/jobb input + kamera worldX**

A `keydown` handlerbe:

```js
if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    e.preventDefault();
    if (state === 'playing') game.handleLaneChange(-1);
}
if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    e.preventDefault();
    if (state === 'playing') game.handleLaneChange(1);
}
```

Touch: a `touchmove`-ban vízszintes swipe detektálás (a meglévő lefelé-swipe mellé):

```js
const deltaX = touch.clientX - touchStartX;
if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) && !touchIsSliding) {
    game.handleLaneChange(deltaX > 0 ? 1 : -1);
    touchStartX = touch.clientX; // re-arm for multi-lane swipes
}
```

A `loop()`-ban: `sceneMgr.updateCamera(norm, game.player.worldX)` (a korábbi `0` helyett).

- [ ] **Step 5: Verifikáció**

Reload, START. Expected: Snacky 3D-ben fut az út közepén (bob-animáció, lengő végtagok); `←/→` sávot vált dőléssel; ugrás/dupla ugrás, csúszás (lapul + hátradől), ground pound működik; az overlay-en a régi HUD látszik (az akadályok még 2D-ben az overlay-en — következő taszkig).

- [ ] **Step 6: Commit**

```bash
git add js/models.js js/player.js js/game.js js/main.js
git commit -m "🦊 Snacky 3D modell + sávváltás + animációk"
```

---

### Task 4: Akadályok 3D-ben + ütközés + megoldhatóság

**Files:**
- Modify: `js/models.js` (akadály-gyárak)
- Modify: `js/obstacle.js`
- Modify: `js/game.js`

**Interfaces:**
- Consumes: `createSnackyModel`-minta (Task 3), `logicalToWorldZ`, `worldY` (Task 1).
- Produces: `createObstacleMesh(type) -> THREE.Object3D` (types: `crate | barrel | tall_crate | barrier | rolling_barrel | flying_bird`).
- Produces: `Obstacle` új: `.lanes` (number[]), `.mesh`, `syncMesh()`; a konstruktor szignatúra: `new Obstacle(x, type, lane, span = 1)`.
- Produces: `game._pickSafeLane(type, spawnX) -> number|null`.

- [ ] **Step 1: models.js — createObstacleMesh()**

```js
export function createObstacleMesh(type) {
    const g = new THREE.Group();
    const wood  = new THREE.MeshStandardMaterial({ color: 0xB0793C, roughness: 0.8 });
    const dark  = new THREE.MeshStandardMaterial({ color: 0x7A4F24, roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xE74C3C, roughness: 0.5 });
    const blue  = new THREE.MeshStandardMaterial({ color: 0x4A69BD, roughness: 0.7 });

    switch (type) {
        case 'crate': {
            const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), wood);
            c.position.y = 0.5; c.castShadow = true;
            const frame = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.12, 1.06), dark);
            frame.position.y = 0.5;
            g.add(c, frame);
            break;
        }
        case 'tall_crate': {
            for (let i = 0; i < 2; i++) {
                const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.95, 1.0), i ? dark : wood);
                c.position.y = 0.5 + i * 0.95; c.castShadow = true;
                g.add(c);
            }
            break;
        }
        case 'barrel': {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 14), blue);
            b.position.y = 0.6; b.castShadow = true;
            g.add(b);
            break;
        }
        case 'rolling_barrel': {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 14), blue);
            b.rotation.x = Math.PI / 2; // lies sideways, rolls
            b.position.y = 0.5; b.castShadow = true;
            b.name = 'roller';
            g.add(b);
            break;
        }
        case 'barrier': {
            // Overhead striped bar on two posts (per-lane width 2.2 * span)
            const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.35), metal);
            bar.position.y = 1.5; bar.castShadow = true;
            g.add(bar);
            for (const side of [-1, 1]) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.15), dark);
                post.position.set(side * 1.05, 0.75, 0);
                g.add(post);
            }
            break;
        }
        case 'flying_bird': {
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10),
                new THREE.MeshStandardMaterial({ color: 0x8E44AD, roughness: 0.6 }));
            body.scale.set(1.3, 1, 1);
            const wingGeo = new THREE.BoxGeometry(0.6, 0.06, 0.3);
            const wingL = new THREE.Mesh(wingGeo, metal);
            const wingR = new THREE.Mesh(wingGeo, metal);
            wingL.position.set(-0.5, 0.1, 0);
            wingR.position.set(0.5, 0.1, 0);
            wingL.name = 'wingL'; wingR.name = 'wingR';
            g.add(body, wingL, wingR);
            break;
        }
    }
    return g;
}
```

- [ ] **Step 2: obstacle.js — lane + mesh**

- Konstruktor: `constructor(x, type, lane, span = 1)` — a meglévő típus-logika marad; új: `this.lane = lane; this.lanes = span === 2 ? [lane, lane + 1] : [lane]; this.mesh = createObstacleMesh(type);` (span=2 csak `barrier`-nél, `lane` ilyenkor 0 vagy 1).
- A `getHitbox()` logika változatlan (x/y alapú); a sáv-ellenőrzés a `game.js`-ben történik.
- Új metódus:

```js
syncMesh() {
    const laneCenter = this.lanes.reduce((a, l) => a + LANES[l], 0) / this.lanes.length;
    this.mesh.position.set(laneCenter, worldY(this.y, this.height), logicalToWorldZ(this.x));
    if (this.type === 'rolling_barrel') {
        const roller = this.mesh.getObjectByName('roller');
        if (roller) roller.rotation.y = this.rotation;
    }
    if (this.type === 'flying_bird') {
        const flap = Math.sin(this.wingFrame) * 0.7;
        this.mesh.getObjectByName('wingL').rotation.z = flap;
        this.mesh.getObjectByName('wingR').rotation.z = -flap;
    }
}
```

(A `barrier` 2 sávos esetén a `bar` mesh szélességét a konstruktorban skálázd: `bar.scale.x = span`.)

- [ ] **Step 3: game.js — spawnolás sávval + megoldhatóság**

Az `_spawnObstacle()` végén a `new Obstacle(CANVAS_WIDTH + 60, type)` helyett:

```js
const span = (type === 'barrier' && Math.random() < 0.4) ? 2 : 1;
const lane = this._pickSafeLane(type, CANVAS_WIDTH + 60, span);
if (lane === null) {
    this.obstacleTimer = 30; // try again shortly
    return;
}
const obs = new Obstacle(CANVAS_WIDTH + 60, type, lane, span);
this.sceneMgr.scene.add(obs.mesh);
this.obstacles.push(obs);
```

Új metódus:

```js
/**
 * Pick a lane that keeps at least one lane passable in the spawn window.
 * Returns null if every lane would be blocked (spawn deferred).
 */
_pickSafeLane(type, spawnX, span) {
    const WINDOW = 60; // logical px — obstacles this close arrive simultaneously
    const blocked = new Set();
    for (const o of this.obstacles) {
        if (Math.abs(o.x - spawnX) < WINDOW) {
            for (const l of o.lanes) blocked.add(l);
        }
    }
    const free = [0, 1, 2].filter(l => !blocked.has(l) && (span === 1 || !blocked.has(l + 1)) && (span === 1 || l + 1 <= 2));
    if (free.length === 0) return null;
    // If barrier spans 2, the third lane must stay free of tall obstacles nearby
    const pick = free[randomBetween(0, free.length - 1)];
    return pick;
}
```

Az akadályok törlésénél (isOffScreen splice) a mesht is: `this.sceneMgr.scene.remove(this.obstacles[i].mesh);` — ugyanez a `reset()`-ben az összesre.

- [ ] **Step 4: game.js — ütközés sávra szűkítve**

A `_checkCollisions()` akadály-ciklusban a `checkCollision(ph, oh)` feltétel elé:

```js
if (!obs.lanes.includes(this.player.lane)) continue;
```

(A `passed`-logika és a near-miss marad; near-misshez szintén kell a sáv-egyezés.)

Az `update()`-ben az akadály-update ciklus után: `this.obstacles[i].syncMesh()` (splice előtt ill. külön ciklusban minden élő akadályra).

- [ ] **Step 5: Verifikáció**

Reload, START. Expected: akadályok 3D-ben jönnek a 3 sávban; ütközés csak azonos sávban sebez (más sávban elhalad melletted); guruló hordó forog, madár repked; sosem jön mindhárom sávban egyszerre áthatolhatatlan akadály; game over működik.

- [ ] **Step 6: Commit**

```bash
git add js/models.js js/obstacle.js js/game.js
git commit -m "🚧 Akadályok 3D-ben, sáv-szűrt ütközés, megoldhatóság-ellenőrző"
```

---

### Task 5: Collectible-ök + power-upok 3D-ben

**Files:**
- Modify: `js/models.js`
- Modify: `js/collectible.js`, `js/powerup.js`
- Modify: `js/game.js`

**Interfaces:**
- Consumes: `LANES`, `logicalToWorldZ`, `worldY`; `sceneMgr` (Task 4).
- Produces: `createCollectibleMesh('hotdog'|'donut')`, `createPowerUpMesh('magnet'|'double_score')`.
- Produces: `Collectible`/`PowerUp` konstruktor: `(x, y, type, lane)`; új `.mesh`, `syncMesh()`; meglévő `update()`, `getHitbox()`, `isOffScreen()`, `collected` változatlan.

- [ ] **Step 1: models.js — hotdog, fánk, power-upok**

```js
export function createCollectibleMesh(type) {
    const g = new THREE.Group();
    if (type === 'hotdog') {
        const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 10),
            new THREE.MeshStandardMaterial({ color: 0xE8B96F, roughness: 0.7 }));
        bun.rotation.z = Math.PI / 2;
        const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.42, 4, 10),
            new THREE.MeshStandardMaterial({ color: 0xC0392B, roughness: 0.6 }));
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

export function createPowerUpMesh(type) {
    const g = new THREE.Group();
    if (type === 'magnet') {
        const mat = new THREE.MeshStandardMaterial({ color: 0xE74C3C, roughness: 0.4 });
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.1, 8, 14, Math.PI), mat);
        arc.rotation.z = Math.PI;
        g.add(arc);
    } else {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28),
            new THREE.MeshStandardMaterial({ color: 0x9B59B6, roughness: 0.2, metalness: 0.6 }));
        g.add(gem);
    }
    return g;
}
```

- [ ] **Step 2: collectible.js / powerup.js — lane + mesh**

Mindkét osztály konstruktora kap `lane` paramétert; `this.mesh = createCollectibleMesh(type)` / `createPowerUpMesh(type)`; új:

```js
syncMesh(time = 0) {
    this.mesh.position.set(LANES[this.lane], worldY(this.y, this.height), logicalToWorldZ(this.x));
    this.mesh.rotation.y = time * 0.05; // gentle spin
}
```

- [ ] **Step 3: game.js — spawn sávval, formációk, mágnes**

- `_spawnCollectible()`: a `y` random marad, plusz `const lane = randomBetween(0, 2)`, `new Collectible(CANVAS_WIDTH + 40, y, type, lane)`, `this.sceneMgr.scene.add(col.mesh)`.
- `_spawnFormation()`: minden tag ugyanabban a random sávban — és új negyedik minta: `'zigzag'`, ahol `lane = i % 3` (sávokon átívelő):

```js
case 'zigzag': {
    lane = i % 3;
    x = baseX + i * spacing;
    y = GROUND_Y - 60;
    break;
}
```

(Ennek megfelelően a ciklusban a `lane`-t tagonként számold; `patterns` tömb: `['arc', 'wave', 'line', 'zigzag']`.)
- Power-up spawn: `new PowerUp(CANVAS_WIDTH + 40, y, type, randomBetween(0, 2))` + `scene.add`.
- Mágnes: a vonzás logikája marad (x/y), **plusz** a sáv irányába is húzza: `col.lane += Math.sign(this.player.lane - col.lane) * 0.08;` és felvételkor `Math.round(col.lane)` — a `col.lane` legyen float; ütközésnél: `Math.round(col.lane) === this.player.lane`.
- Felvétel/törlés mindenhol: `scene.remove(mesh)` a splice mellé; ütközés-feltétel minden collectible/powerup ciklusnál kiegészül sáv-egyezéssel.
- `syncMesh(this.score)` hívása minden élő collectible/powerup framenként.

- [ ] **Step 4: Verifikáció**

Reload. Expected: hotdogok/fánkok forognak a sávokban, formációk (ívek, cikcakk) felvehetők; mágnes áthúzza a hotdogokat más sávból is; kombó és ×2 működik; donut életet ad.

- [ ] **Step 5: Commit**

```bash
git add js/models.js js/collectible.js js/powerup.js js/game.js
git commit -m "🌭 Collectible-ök + power-upok 3D-ben, cikcakk formáció"
```

---

### Task 6: Gödrök + near-miss

**Files:**
- Modify: `js/models.js` (pit mesh)
- Modify: `js/pit.js`
- Modify: `js/game.js`

**Interfaces:**
- Consumes: Task 5 minden.
- Produces: `createPitMesh(span) -> THREE.Object3D`; `Pit` konstruktor: `(x, gapWidth, lane /*0|1|2 vagy -1 = full-width*/)`; `.mesh`, `.lanes`, `syncMesh()`.

- [ ] **Step 1: models.js + pit.js**

```js
export function createPitMesh(span) {
    // Dark jagged hole decal + inner walls illusion
    const w = span === 3 ? 6.6 : 2.0;
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 1),
        new THREE.MeshStandardMaterial({ color: 0x05050A, roughness: 1 }));
    hole.position.y = 0.02;
    g.add(hole);
    return g;
}
```

`pit.js`: konstruktor `(x, gapWidth, lane)`; `this.lanes = lane === -1 ? [0,1,2] : [lane];` `this.mesh = createPitMesh(this.lanes.length);` a mesh `scale.z = gapWidth * WORLD_SCALE`. `syncMesh()`: sávközép + `logicalToWorldZ(this.x + this.gapWidth / 2)` (a mesh közepe a rés közepére kerül).

- [ ] **Step 2: game.js**

- Spawn: 80% eséllyel egy random sáv (`lane = randomBetween(0,2)`), 20% full-width (`lane = -1`); `scene.add/remove` mindenhol.
- Ütközés-feltétel: `pit.lanes.includes(this.player.lane)` + meglévő `isOnGround` + `checkCollision`.
- Near-miss gödörre is: ha a játékos átugorja és a lába `gapWidth` szélétől < 12 logical px-re volt — a meglévő near-miss blokk mintájára, `'+50 CLOSE!'` szöveggel.

- [ ] **Step 3: Verifikáció**

Expected: gödrök látszanak az úton (sötét rés), belelépés sebez, átugrás + near-miss bónusz működik, full-width gödör csak ugrással vehető.

- [ ] **Step 4: Commit**

```bash
git add js/models.js js/pit.js js/game.js
git commit -m "🕳️ Gödrök 3D-ben + near-miss bónusz"
```

---

### Task 7: Város + témák + mérföldkövek

**Files:**
- Modify: `js/world.js`
- Modify: `js/models.js` (ablakos épületek, lámpák)
- Modify: `js/scene.js` (téma-alkalmazás)
- Modify: `js/game.js` (milestone → world.setTheme)

**Interfaces:**
- Produces: `World3D.setTheme(index /*0..4*/)` — smooth ~120 frame-es színátmenettel; `SceneManager.setSky(fogColor, near, far)` már létezik; új: `SceneManager.applyThemeColors({hemiSky, hemiGround, sunColor, sunIntensity})`.

- [ ] **Step 1: scene.js — applyThemeColors**

```js
applyThemeColors({ hemiSky, hemiGround, sunColor, sunIntensity }) {
    this.hemi.color.set(hemiSky);
    this.hemi.groundColor.set(hemiGround);
    this.sun.color.set(sunColor);
    this.sun.intensity = sunIntensity;
}
```

- [ ] **Step 2: models.js — ablakok CanvasTexture-szel (procedurális)**

```js
export function createBuildingTexture(litRatio = 0.35, litColor = '#FFE66D') {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#12121F';
    ctx.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 122; y += 12) {
        for (let x = 6; x < 58; x += 12) {
            ctx.fillStyle = Math.random() < litRatio ? litColor : '#0A0A14';
            ctx.fillRect(x, y, 7, 8);
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    return tex;
}
```

A `createBuilding()`-ban a material: `new THREE.MeshStandardMaterial({ color: shade, roughness: 0.9, emissiveMap: tex, emissive: 0xFFFFFF, emissiveIntensity: 1.0 })`. (Az `emissiveMap` a textúra színeit világítja meg — a sötét ablakok sötétek maradnak.)

- [ ] **Step 3: world.js — THEMES_3D + smooth átmenet**

```js
const THEMES_3D = [
    { sky: '#0B0B2B', fogNear: 30, fogFar: 90,  hemiSky: '#8899FF', hemiGround: '#332222', sun: '#AABBFF', sunI: 0.8, windowI: 1.0 }, // night
    { sky: '#3D2B52', fogNear: 35, fogFar: 100, hemiSky: '#FFB347', hemiGround: '#443333', sun: '#FF9F5A', sunI: 0.9, windowI: 0.7 }, // dawn
    { sky: '#4A90D9', fogNear: 40, fogFar: 110, hemiSky: '#BBDDFF', hemiGround: '#556644', sun: '#FFF4D6', sunI: 1.3, windowI: 0.1 }, // day
    { sky: '#D96A3B', fogNear: 35, fogFar: 95,  hemiSky: '#FFAA66', hemiGround: '#553333', sun: '#FF7733', sunI: 1.0, windowI: 0.8 }, // sunset
    { sky: '#12082B', fogNear: 28, fogFar: 85,  hemiSky: '#FF44CC', hemiGround: '#220033', sun: '#44FFEE', sunI: 0.9, windowI: 1.2 }, // neon
];
```

`World3D`-ben: `setTheme(i)` beállítja `this.themeFrom = <jelenlegi állapot>`, `this.themeTo = THEMES_3D[i]`, `this.themeT = 0`; az `update()`-ben `themeT += 1/120` és minden szín `lerpColors`-sal interpolálva → `sceneMgr.setSky(...)` + `applyThemeColors(...)` + épületek `emissiveIntensity` lerp.

- [ ] **Step 4: game.js — milestone bekötés**

A meglévő milestone-blokkban `this.background.setTheme(...)` helyett: `this.world.setTheme(this.currentMilestone + 1)` — de a `THEMES_3D` csak 5 elemű, ezért: `this.world.setTheme(Math.min(this.currentMilestone + 1, 4))`. Banner-logika marad.

- [ ] **Step 5: Verifikáció**

Expected: induláskor éjszakai város kivilágított ablakokkal; 1000/3000/5000/8000 pontnál a bannerrel együtt az ég, köd, fények folyamatosan átszíneződnek; neon-téma vizuálisan eltérő.

- [ ] **Step 6: Commit**

```bash
git add js/world.js js/models.js js/scene.js js/game.js
git commit -m "🌆 Város + 5 téma smooth átmenetekkel"
```

---

### Task 8: Időjárás + trail + shake + speed lines

**Files:**
- Modify: `js/effects.js` (teljes átírás 3D-re)
- Modify: `js/game.js` (effekt-hookupok)

**Interfaces:**
- Produces: `TrailEffect3D`: `constructor(scene)`, `update(px, py, pz, speed)`, `reset()`; `WeatherSystem3D`: `constructor(scene)`, `update()`, `reset()`.
- Consumes: `sceneMgr.setShake` (Task 1) — a meglévő `shakeX/shakeY` értékeket adja át.

- [ ] **Step 1: effects.js — TrailEffect3D**

```js
import * as THREE from 'three';

export class TrailEffect3D {
    constructor(scene) {
        this.scene = scene;
        this.pool = [];
        this.active = [];
        const geo = new THREE.SphereGeometry(0.06, 6, 5);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFFB347, transparent: true });
        for (let i = 0; i < 40; i++) {
            const m = new THREE.Mesh(geo, mat.clone());
            m.visible = false;
            scene.add(m);
            this.pool.push(m);
        }
    }

    update(px, py, pz, speed) {
        if (speed > 8 && Math.random() < 0.5) {
            const m = this.pool.pop();
            if (m) {
                m.position.set(px + (Math.random() - 0.5) * 0.3, py + 0.3 + Math.random() * 0.5, pz + 0.3);
                m.material.opacity = 0.8;
                m.visible = true;
                m.userData.life = 20;
                this.active.push(m);
            }
        }
        for (let i = this.active.length - 1; i >= 0; i--) {
            const m = this.active[i];
            m.userData.life--;
            m.position.z += 0.15;
            m.material.opacity *= 0.92;
            if (m.userData.life <= 0) {
                m.visible = false;
                this.active.splice(i, 1);
                this.pool.push(m);
            }
        }
    }

    reset() {
        for (const m of this.active) { m.visible = false; this.pool.push(m); }
        this.active = [];
    }
}
```

- [ ] **Step 2: effects.js — WeatherSystem3D**

`THREE.Points`-al, a meglévő `WeatherSystem` állapotgép-logikáját (random esemény: eső/hó/köd, időzítések) megtartva:

```js
export class WeatherSystem3D {
    constructor(scene) {
        this.scene = scene;
        this.mode = 'none'; // 'none' | 'rain' | 'snow'
        this.timer = 600 + Math.random() * 600;
        const N = 400;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 24;
            pos[i * 3 + 1] = Math.random() * 12;
            pos[i * 3 + 2] = 8 - Math.random() * 80;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.points = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xAACCFF, size: 0.08, transparent: true, opacity: 0
        }));
        scene.add(this.points);
        this.count = N;
    }

    update() {
        this.timer--;
        if (this.timer <= 0) {
            const modes = ['rain', 'snow', 'none'];
            this.mode = modes[Math.floor(Math.random() * modes.length)];
            this.timer = 600 + Math.random() * 900;
        }
        const target = this.mode === 'none' ? 0 : 0.7;
        this.points.material.opacity += (target - this.points.material.opacity) * 0.02;

        if (this.points.material.opacity > 0.02) {
            const pos = this.points.geometry.attributes.position.array;
            const fall = this.mode === 'rain' ? 0.35 : 0.08;
            for (let i = 0; i < this.count; i++) {
                pos[i * 3 + 1] -= fall;
                if (this.mode === 'snow') pos[i * 3] += Math.sin(pos[i * 3 + 1]) * 0.01;
                if (pos[i * 3 + 1] < 0) {
                    pos[i * 3 + 1] = 12;
                    pos[i * 3 + 2] = 8 - Math.random() * 80;
                }
            }
            this.points.geometry.attributes.position.needsUpdate = true;
        }
    }

    reset() {
        this.mode = 'none';
        this.timer = 600 + Math.random() * 600;
        this.points.material.opacity = 0;
    }
}
```

- [ ] **Step 3: game.js hookup**

- `this.trailEffect = new TrailEffect3D(sceneMgr.scene)`, `this.weatherSystem = new WeatherSystem3D(sceneMgr.scene)` (a régiek helyett).
- `update()`-ben: `this.trailEffect.update(this.player.worldX, worldY(this.player.y, 60), 0, this.gameSpeed);` és a shake-blokk után: `this.sceneMgr.setShake(this.shakeX, this.shakeY);`
- Speed lines és vignette: az overlay-en marad (a meglévő kód Task 10-ben költözik).

- [ ] **Step 4: Verifikáció**

Expected: nagy sebességnél Snacky mögött fénycsíkok; periódikusan eső/hó hullik a 3D térben; talajcsapásnál/ütésnél a kamera rázkódik.

- [ ] **Step 5: Commit**

```bash
git add js/effects.js js/game.js
git commit -m "🌧️ 3D időjárás + trail + kamera-shake bekötés"
```

---

### Task 9: Boss sáv-koreográfia + küldetések

**Files:**
- Modify: `js/game.js`

**Interfaces:**
- Consumes: `Obstacle(x, type, lane, span)`, `Pit(x, gapWidth, lane)` (Task 4/6).
- A küldetésrendszer logikája változatlan — csak a HUD-jelei Task 10-ben költöznek.

- [ ] **Step 1: Boss-minták sávosítása**

A `bossPatterns` helyett:

```js
this.bossPatterns = [
    // 1: Zigzag — alternating lanes, always one side free
    [{ lane: 0, type: 'crate' }, { lane: 2, type: 'crate' }, { lane: 0, type: 'barrel' },
     { lane: 2, type: 'barrel' }, { lane: 1, type: 'barrier' }, { lane: 0, type: 'crate' }],
    // 2: Pits + barrels
    [{ lane: 1, type: 'pit' }, { lane: 0, type: 'barrel' }, { lane: 2, type: 'pit' },
     { lane: 1, type: 'barrel' }, { lane: 0, type: 'rolling_barrel' }, { lane: 2, type: 'crate' }],
    // 3: Wide barriers — free lane alternates
    [{ lane: 0, type: 'barrier', span: 2 }, { lane: 1, type: 'crate' }, { lane: 2, type: 'barrier' },
     { lane: 0, type: 'crate' }, { lane: 1, type: 'barrier', span: 2 }, { lane: 2, type: 'barrel' }],
];
```

A boss-spawn blokkban:

```js
const entry = this.bossCurrentPattern[this.bossPatternStep];
if (entry.type === 'pit') {
    const gapWidth = randomBetween(70, 110);
    const pit = new Pit(CANVAS_WIDTH + 60, gapWidth, entry.lane);
    this.sceneMgr.scene.add(pit.mesh);
    this.pits.push(pit);
} else {
    const obs = new Obstacle(CANVAS_WIDTH + 60, entry.type, entry.lane, entry.span || 1);
    this.sceneMgr.scene.add(obs.mesh);
    this.obstacles.push(obs);
}
```

- [ ] **Step 2: Verifikáció**

Expected: 5000 pontnál warning, a minta sávokban koreografálva jön, mindig van menekülőút; boss végén +500 bónusz; küldetések (collect/dodge/combo/distance) működnek, fail/reward szövegek megjelennek az overlay-en (egyelőre régi helyen).

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "👹 Boss-minták sáv-koreográfiával"
```

---

### Task 10: Overlay HUD port + floating textek + game over flow

**Files:**
- Modify: `js/game.js` (draw → drawOverlay)
- Modify: `js/main.js`

**Interfaces:**
- Produces: `game.drawOverlay(ctx)` — a meglévő `_drawHUD`, `_drawComboHUD`, `_drawActivePowerUps`, `_drawMissionHUD`, `_drawBossWarning`, `_drawMilestoneBanner`, speed lines, vignette, screen flash, FloatingText és Particle rendszerek mind az overlay-re kerülnek.

- [ ] **Step 1: game.js — draw() szétválasztása**

- A `draw(ctx)` metódust nevezd át `drawOverlay(ctx)`-re, és töröld belőle: `background.draw`, `pit.draw`, `collectible.draw`, `powerUp.draw`, `obstacle.draw`, `player.draw`, `trailEffect.draw`, `weatherSystem.draw` hívások (ezek már 3D-ben élnek). Marad: speed lines, flash, vignette, bannerek, HUD-k, particles, floatingTexts, `ctx.translate(shake)` (overlay-shake maradhat).
- Floating textek és particle-ök világpozíciója vetítve: minden `new FloatingText(x, y, ...)`, ami entitáshoz kötődik (collect, hit, powerup, near-miss) — a `game.js`-ben legyen segéd:

```js
_spawnFloatingTextAt(mesh, text, color) {
    const p = this.sceneMgr.projectToScreen(mesh.position, { x: 0, y: 0 });
    this.floatingTexts.push(new FloatingText(p.x, p.y - 10, text, color));
}
```

és az érintett helyeken a konkrét `cx, cy` számítás helyett ez. Ugyanígy `_spawnParticlesAt(mesh, count, color, speed)` a `_spawnParticles(cx, cy, ...)` helyett.
- Boss warning / milestone banner / mission HUD / combo HUD: pozícióik képernyőhöz kötöttek — változatlanok.

- [ ] **Step 2: main.js**

- `loop()`: `game.draw(overlayCtx)` → `game.drawOverlay(overlayCtx)` minden ágban.
- `showGameOverScreen`, ranglista, `submitScore` változatlan (már DOM-alapú).

- [ ] **Step 3: Verifikáció**

Expected: pontszám/élet/kombó/mission/power-up ikonok az overlay-en hibátlanul; pickup-nál `+100` a hotdog 3D-pozíciója fölött jelenik meg; near-miss `CLOSE! +50`; game over → ranglista → e-mail mentés működik; újraindítás tiszta állapotot ad (minden mesh eltűnik — `reset()` ellenőrzése!).

- [ ] **Step 4: Commit**

```bash
git add js/game.js js/main.js
git commit -m "🎯 HUD overlay-port + vetített floating textek"
```

---

### Task 11: Takarítás + kalibráció + végső pass

**Files:**
- Modify: `js/utils.js`, `js/game.js`, `js/player.js`, `js/obstacle.js`, `js/collectible.js`, `js/pit.js`, `js/powerup.js`

- [ ] **Step 1: Holt kód törlése**

- Minden entitásból a régi canvas `draw()` metódusok törlése (ha még maradt).
- `index.html` meta description frissítése: „3D endless runner".
- Menü `controls-info` bővítése: `←/→` sávváltás sor hozzáadása.

- [ ] **Step 2: Kalibrációs pass (játszhatóság)**

Játékteszt-sorozat, és ha kell, finomhangolás CSAK a megjelenítési konstansokon (`LANE_WIDTH`, `WORLD_SCALE`, kamera pozíciók, `THEMES_3D` színek) — a logikai konstansok (sebesség, gap-ek, gravitáció) nem módosulnak.

Checklist:
- [ ] billentyű: ←/→/Space/↑/↓ mind működik, dupla ugrás, ground pound
- [ ] touch: tap = ugrás, swipe oldalra = sáv, swipe le = csúszás
- [ ] ütközés csak azonos sávban; invincibility-villogás
- [ ] kombó ×20-ig, ütközésnél reset
- [ ] mágnes áthúz sávok között; ×2 power-up
- [ ] küldetés teljesül/fail; boss 5000-nél; mérföldkő-témaváltás
- [ ] game over → e-mail → ranglista → Újra gomb → tiszta új játék
- [ ] DevTools console hibamentes; mobilon (vagy szűk ablakban) akadásmentes

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "✨ Snacky Dash 3D — végső takarítás és kalibráció"
```

---

## Self-Review jegyzetek

- **Spec coverage:** spec §2 (rétegek) → Task 1+10; §3 (modulok) → Task 1–8; §4 (sáv, akadályok, boss, formációk) → Task 3–6+9; §5 (kamera, Snacky, világ, témák, effektek, teljesítmény) → Task 2–3+7–8 (pooling: Task 8 trail-pool + Task 2 szegmens-újrahasznosítás); §6 (fázissorrend) → Task 1–11; §7 (tesztelés) → minden task verifikációs lépése + Task 11 checklist; §8 (YAGNI) → nincs ellentmondó task.
- **Tudatos eltérés:** particle-ök overlay-en (lásd Global Constraints) — spec §5-től való indokolt eltérés.
- **Type-consistency:** `createSnackyModel`/`createObstacleMesh`/`createCollectibleMesh`/`createPowerUpMesh`/`createPitMesh`, `SceneManager` metódusnevek, `syncMesh()` minden entitáson, `game.drawOverlay(ctx)`, `_pickSafeLane`, `handleLaneChange` — konzisztensek a taskok között.
