# Snacky Dash 3D — Boss-nevek, éra-ritkítás, 3D háttér

Dátum: 2026-08-07
Állapot: jóváhagyva (brainstorming után)
Előzmény: `2026-07-24-portrait-es-fullscreen-design.md` (portrait + PWA, lezárva)

## 1. Cél és háttér

Három igény egy csomagban:

1. **A boss-részek névtelenek.** Minden boss-alkalom ugyanaz a szöveg (`⚠️ BOSS KÖZELEG!`, `+500 BOSS BÓNUSZ!`), pedig a 3 különböző akadály-minta megérdemelne egy-egy felismerhető, minta-leíró nevet. Mivel a boss-threshold 5000-enként végtelenül ismétlődik, a 3 meglévő minta mellé +3 új, kézzel verifikált minta is készül, hogy ritkább legyen az ismétlődés (6-os körforgás).
2. **Túl sűrűn váltanak az érák.** A `[2000, 6000, 12000, 20000]` küszöbök a kombó-snowball miatt gyakorlatban ~15-40 mp-énként váltanak. A kérés: nagyobb, ~3× időbeli szünetek.
3. **A futó figura mögött üres a háttér.** Játék közben a horizont egy sík színtömb (`scene.background` + köd), az út két oldalán épületek, de a távolban semmi. A kérés: látványos, jól kinéző háttér — a brainstorming során a **teljes csomag** választva (gradiens égbolt + égitest + csillagok + távoli város-sziluettek).

## 2. Boss-nevek — 6 mintás körforgás

### 2.1 Adatstruktúra

A `js/game.js` `bossPatterns` mezője csupasz tömbökből `{ name, entries }` objektumok tömbjévé alakul. A minta-lépések formátuma változatlan (`{ lane, type, span? }`), a spawn-logika (65 frame-es ritmus, `bossPatternIndex`-ciklus) változatlan — csak `% 3` helyett `% 6`.

### 2.2 A hat minta

A meglévő 3 minta változatlan (sorrendjük is), mögéjük 3 új kerül. Jelölés: b/k/j = bal/közép/jobbra sáv (0/1/2).

| # | Név | Lépések | Fő készség |
|---|-----|---------|------------|
| 1 | **CIKÁZÓ CSAPDA** | láda(b) → láda(j) → hordó(b) → hordó(j) → kordon(k) → láda(b) | oldalzás |
| 2 | **GÖDÖRMEZŐ** | gödör(k) → hordó(b) → gödör(j) → hordó(k) → guruló hordó(b) → láda(j) | ugrás-időzítés |
| 3 | **KORDON KÁOSZ** | kordon×2(b) → láda(k) → kordon(j) → láda(b) → kordon×2(k) → hordó(j) | csúszás |
| 4 | **MADÁRRAJ** *(új)* | madár(b) → madár(j) → láda(k) → madár(k) → hordó(b) → madár(j) | oszcilláló levegő-akadály olvasása |
| 5 | **TORONYZÓNA** *(új)* | torony(k) → láda(b) → torony(j) → hordó(k) → torony(b) → hordó(j) | dupla ugrás, könnyű pihentető lépésekkel |
| 6 | **HORDÓHÖMPÖLY** *(új)* | guruló(b) → guruló(j) → hordó(k) → guruló(k) → hordó(b) → guruló(j) | 40%-kal gyorsabb guruló hordók ritmusa |

Új minta-lépések konkrétumai:

- **MADÁRRAJ:** `[{0,flying_bird},{2,flying_bird},{1,crate},{1,flying_bird},{0,barrel},{2,flying_bird}]`
- **TORONYZÓNA:** `[{1,tall_crate},{0,crate},{2,tall_crate},{1,barrel},{0,tall_crate},{2,barrel}]`
- **HORDÓHÖMPÖLY:** `[{0,rolling_barrel},{2,rolling_barrel},{1,barrel},{1,rolling_barrel},{0,barrel},{2,rolling_barrel}]`

### 2.3 Megoldhatósági szabályok (az új mintákra is)

- Minden lépés egysávos, vagy garantáltan marad szabad sáv (kivétel: a meglévő `span:2`-es kordon-lépések, amelyeknél a szabad sáv a harmadik).
- Torony (`tall_crate`) után sosem jön kordon; guruló hordó után nincs kordon — konzisztens a `_spawnObstacle()` „smart spawn” szabályaival.
- A 65 frame-es spawn-ritmus változatlan → a meglévő 3 mintával azonos reakcióablak.

### 2.4 Megjelenés

- Warning-banner: `⚠️ {NÉV} KÖZELEG!` (pl. „⚠️ GÖDÖRMEZŐ KÖZELEG!”) — a meglévő villogó piros stílus, a szöveg a `bossCurrentPattern.name`-ből jön. A név már a warning **kezdetekor** rögzül (a minta a warning végén dől el — a kiválasztást át kell hozni a warning-ág elé, hogy a banner a helyes nevet mutassa).
- Legyőzés floating text: `{NÉV} LEGYŐZVE! +500` (a mostani „+500 BOSS BÓNUSZ!” helyett) — ehhez a legyőzött minta nevét a rest-timer indulásakor el kell tárolni (`bossLastName`).
- A game-over stat (👹 Boss számláló) és a reset-logika változatlan.

## 3. Éra-küszöbök ~3× szünetekkel

- `js/game.js` `milestoneThresholds`: `[2000, 6000, 12000, 20000]` → **`[6000, 16000, 32000, 55000]`**.
- A `milestoneNames`, a banner-rendszer, a `world.setTheme(currentMilestone + 1)` leképzés és a boss-ritmus (5000 + n·5000) változatlan → éránként ~2-4 boss jut, az éra-váltás „mérföldkő-élmény” marad.
- **Nem cél** a pontozás/kombó átszabása (örökölt döntés a pacing-spec §2/§7-ből).

## 4. Háttér-modul — `js/background.js` (új fájl)

### 4.1 Áttekintés

Új `Background3D` osztály: `constructor(scene)`, `applyTheme(cur)`, `update()`. A `World3D` példányosítja és hajtja a meglévő téma-lerp gépezetének kibővítésével; a `main.js` loop nem változik. Négy komponens (a-b-c-d), összesen +6 draw call, mind unlit, árnyék-vetés/befogadás nélkül. Nincs asset-fájl: minden primitív geometria vagy runtime canvas-textúra (a `models.js` shared building-textúra mintát követve).

### 4.2 a) Ég-dóm

- `SphereGeometry(170)`, `BackSide` ShaderMaterial két `vec3` uniformmal: `topColor`, `horizonColor`. A fragment shader `normalize(vPos).y` alapján `smoothstep(0.0, 0.5, h)`-val keveri horizont→zenit (horizont alatt tiszta `horizonColor`).
- `fog: false`, `depthWrite: false`, `renderOrder: -1` (mindig hátul, sosem takar).
- A `scene.background` sík szín fallback marad; a köd színe továbbra = horizont-szín → a ködbe távollódó objektumok vizuálisan beleolvadnak az égboltba.
- A dóm statikus (a kamera max ±1.1 egység oldal-lengése a 170-es sugáron észrevehetetlen).

### 4.3 b) Csillagmező

- ~350 `THREE.Points` a dóm felső félgömbjének belső felületén (r≈150, y>0.05), egy `BufferGeometry`-ben.
- `PointsMaterial`: `size ≈ 1.6`, `sizeAttenuation: false` (fix képpont-méret), `transparent: true`, `depthWrite: false`.
- Témánként opacitás (`starI`) + finom twinkle az `update()`-ben: `opacity = starI · (0.85 + 0.15 · sin(t))` — belső óra, egy szinusz per frame.

### 4.4 c) Égitest

- Két `THREE.Sprite`: tömör korong + additív glow (ugyanaz a **egy** megosztott runtime canvas radiális-gradiens textúra, `material.color`-ral témánként tintelve; a glow sprite ~2.5× skála, `AdditiveBlending`).
- Témánként pozíció (`celPos`, normalizált irány × 140), szín (`celColor`), méret (`celSize`), glow-erő (`glowI`) — mindegyik a téma-lerp része (pozíció `Vector3.lerp`-pel).
- `depthWrite: false`, `depthTest: true` → a naplemente-nap a sziluett-sáv mögé lapulhat („a város mögött lemenő nap”), szándékos effekt.

### 4.5 d) Sziluett-sávok

- 3 mélységi sáv: z ≈ −125 / −145 / −160 — **a spawn-zóna (z ≥ −76) és a legtávolabbi köd-far (140) mögött/élén** → sosem takarnak akadályt vagy entitást.
- Sávonként ~25-30 doboz „épülettorony”: magasság 6-22, szélesség 6-12, x-fesztáv ±240 (a fekvő ~114°-os horizontális FOV-t is lefedi a legközelebbi sáv mélységén). Sávonként **egy merge-elt `BufferGeometry` + egy `MeshBasicMaterial`** → 3 draw call.
- `fog: false`; a szín a horizont-színből származtatva: közeli sáv ×0.35, középső ×0.6, távoli ×0.85 (skaláris szorzás, téma-átmenetkor lerpolődik) → ingyenes atmoszférikus mélység.
- Statikus (bootban generált, sosem recycle-ölt); az oldal-parallax a meglévő kamera-lengésből adódik. Session-életű, dispose nélkül (mint a shared building-textúra) — dokumentálva.

### 4.6 Téma-adat bővítés (`js/world.js`)

A `THEMES_3D` bejegyzések új mezői (a meglévő mezők változatlanok; a meglévő `sky` lesz a `horizonColor`):

| Téma | skyTop | starI | celColor | celPos (norm. irány) | celSize | glowI |
|------|--------|-------|----------|----------------------|---------|-------|
| éj | `#030312` | 1.0 | `#E8ECFF` (hold) | (-0.45, 0.55, -1) | 10 | 0.5 |
| hajnal | `#1B1032` | 0.25 | `#FFB347` (nap) | (0.5, 0.14, -1) | 12 | 0.8 |
| nap | `#2356A8` | 0.0 | `#FFF4D6` | (0.3, 0.7, -0.8) | 9 | 0.6 |
| naplemente | `#46183F` | 0.15 | `#FF7733` | (0.05, 0.09, -1) | 16 | 1.0 |
| neon | `#05020F` | 0.8 | `#FF44CC` | (-0.4, 0.5, -1) | 10 | 0.9 |

(A konkrét értékek kiinduló hangolás — a vizuális verifikáció során finomíthatók, a struktúra fix.)

- `parseTheme` az új mezőket is feldolgozza (`skyTop`→Color, `celColor`→Color, `celPos`→Vector3, számok átvéve).
- `_snapshotCurrent()` kiterjesztve az új mezőkre → a mid-transition téma-váltás (snapshot→lerp) továbbra is folytonos.
- A 120 frame-es lerp-blokk az új mezőket is interpolálja; `_applyTheme()` végén `background.applyTheme(cur)`; `world.update()` végén `background.update()`.
- `reset()` → `setTheme(0)` változatlanul visszaállítja az éjt (az új mezők is).

## 5. Debug-handle a verifikációhoz (`js/main.js`)

Egy sor: `window.__snacky = { game, world }` az `init()` végén — a Playwright-os vizuális tesztek ezzel kényszerítenek témát/pontszámot. Nincs hatása a játékra (a korábbi spec-ek „debug-hook” gyakorlatát formalizálja).

## 6. Tesztelés

Nincs test framework — lokális HTTP szerver + Playwright vizuális verifikáció (a migrációs gyakorlat szerint):

- **Háttér, 5 téma:** boot-screenshot (éj), majd `__snacky.world.setTheme(1..4)` + ~2,5 s várakozás képenként → ég-dóm gradiens, csillagok láthatósága, égitest pozíció/szín, sziluett-sávok olvashatósága; fekvő ÉS portrait nézet.
- **Boss-nevek:** `__snacky.game.score = 4950` körül → warning-banner a minta nevével; a 6 minta sorrendje és neve helyes (`bossPatternIndex`-előretekintéssel); a bónusz-szöveg `{NÉV} LEGYŐZVE! +500`.
- **Éra-küszöbök:** score kényszerítés 6000/16000/32000/55000 köré → banner + témaátmenet a helyes küszöbnél, sorrend nem törik meg; 2000-nél már NEM vált.
- **Regresszió:** console hibátlan; akadály-olvashatóság (a sziluett sosem takar spawnolt akadályt); a teljes loop (start → boss → game over → restart); restart után éjszakai háttér.
- A screenshotokat a felhasználó is átnézi a befejezés előtt.

## 7. Architektúra-megkötések (örökölt)

- A „2.5D mag, 3D héj” elv változatlan: a logika logikai térben, a Three.js tiszta nézetréteg; a `Background3D` kizárólag nézet.
- Logikai konstansok (sebesség, gravitáció, gap-ek, kombómax) **fagyasztva** — kivételek: a `milestoneThresholds` lista (§3) és a `bossPatterns` struktúra (§2), kifejezetten jóváhagyva.
- `leaderboard.js`, `audio.js`, `player.js`, `utils.js` nem módosul.
- Nincs külső asset; minden geometria/anyag/textúra kódból.
- UI-szövegek magyarul; commitüzenetek: emoji + rövid magyar leírás.

## 8. YAGNI — tudatosan kimarad

- Boss-nehézség eszkaláció ciklusonként (kör-számláló, „VAD/ŐRÜLT” előtagok) — a brainstormingban a 6 mintás körforgás választva; nehézség-hangolás külön feature lehet később.
- Sziluett-sávok scroll-ozása / animálása (statikus + kamera-parallax elég).
- Csillagok „igazi” twinkle-e csillagonként (az anyag-szintű pulzálás elég).
- Égitest-fázisok (holdfázis, nap pályája futam közben).
- A menü 2D-s hátterének egységesítése a 3D-s háttérrel (a menü overlay amúgy is takarja a WebGL-t).
- Éra-nevek átnevezése (a meglévő nevek jók).
