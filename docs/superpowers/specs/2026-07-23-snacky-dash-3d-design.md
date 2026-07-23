# Snacky Dash 3D — Design Spec

**Dátum:** 2026-07-23
**Állapot:** Jóváhagyva (brainstorming után)
**Cél:** A meglévő 2D canvas-alapú Snacky Dash endless runner átalakítása 3 sávos, Subway Surfers-stílusú 3D játékká Three.js-szel, low-poly procedurális grafikával.

---

## 1. Alapelvek

- **„2.5D mag, 3D héj" architektúra:** a játéklogika absztrakt pályatérben dolgozik — minden entitásnak `(sáv: 0|1|2, távolság: z, magasság: y)` koordinátája van. A Three.js tiszta megjelenítő: frame-enként kiolvassa a logikai állapotot és úgy pozicionálja a modelleket.
- **A meglévő rendszerek sértetlenül átjönnek:** spawn-logika, AABB ütközés, kombó (max ×20), küldetések, boss, mérföldkövek, power-upok, near-miss, ranglista, hang.
- **Nincs build-lépés:** Three.js import mappel, pinned CDN-verzióról; a projekt „megnyitod és megy" jellege megmarad.
- **Fázisonként játszható állapot:** minden migrációs fázis futtatható, commitolható eredménnyel zárul.

## 2. Képernyő-rétegek

```
┌─────────────────────────────────────┐
│  2D overlay canvas (átlátszó)       │  HUD, kombó, küldetéssáv,
│                                     │  floating textek, particle-ök,
│                                     │  bannerek, speed lines, vignette
├─────────────────────────────────────┤
│  WebGL canvas (Three.js)            │  3D világ: út, város, Snacky,
│                                     │  akadályok, collectible-ök
├─────────────────────────────────────┤
│  DOM: menü, game over, ranglista    │  változatlan
└─────────────────────────────────────┘
```

A meglévő HUD/juice-kód (animált pontszám, kombó-sáv, mission pill, boss warning, milestone banner, floating textek) az overlay-en gyakorlatilag változatlanul megmarad. A világtérbeli effektek pozíciói 3D→2D vetítéssel kerülnek az overlay-re.

## 3. Modultérkép

| Fájl | Sorsa |
|---|---|
| `audio.js`, `leaderboard.js` | változatlan |
| `utils.js` | marad; konstansok átkalibrálva (sávszélesség, sebesség-tartomány); `checkCollision` sáv+z+y hitboxokra |
| `main.js` | átalakul: Three renderer init, bal/jobb input, overlay canvas kezelés; képernyőkezelés (menu/playing/gameover) marad |
| `game.js` | a játéklogika marad; `draw()` helyett „scene sync" (logikai állapot → 3D pozíciók); várhatóan ~40%-kal karcsúbb |
| `player.js` | ugrás/dupla ugrás/csúszás/ground pound/invincibility logika marad + sávváltás (simított lerp + testdőlés); canvas-rajzolás helyett 3D modell-vezérlés |
| `obstacle.js`, `collectible.js`, `pit.js` | hitbox/mozgás-logika marad; rajzolás helyett 3D mesh-gyárakból származó modellek |
| `background.js` → `world.js` | parallax helyett végtelenített útszegmens-újrahasznosítás (object pooling) + low-poly város; az 5 téma és a smooth átmenetek átjönnek (fog/sky/fények színei) |
| `effects.js` | eső/hó `THREE.Points`-szal, köd = `scene.fog`, trail = fénycsík Snacky mögött |
| **új** `scene.js` | WebGLRenderer, kamera-rig, fények, árnyék-beállítások |
| **új** `models.js` | procedurális mesh-gyárak: Snacky, láda, hordó, sorompó, madár, hotdog, fánk, power-up ikonok |

## 4. Játékmenet-leképezés 3 sávra

### Irányítás

- `←/→` vagy `A/D`, illetve swipe oldalra = sávváltás
- `Space/↑/tap` = ugrás, dupla ugrás
- `↓/swipe le` = csúszás (földön) / ground pound (levegőben)

### Akadályok

Minden akadály egy sávhoz kötődik. A meglévő „okos spawnolás" (tiltott kombinációk) kiegészül egy **megoldhatóság-ellenőrzővel**: bármely z-ablakban legalább 1 sávnak járhatónak kell lennie (szabad sáv VAGY ugrálható/csúszható kombináció).

| 2D akadály | 3D-s megfelelő |
|---|---|
| láda, hordó | sávonként, ugrálható |
| magas láda | dupla ugrás VAGY sávváltás |
| sorompó | lebegő sorompó 1–2 sáv felett — alácsúszás vagy sávváltás |
| guruló hordó | egy sávban, 40%-kal gyorsabb |
| repülő madár | alacsonyan szálló madár egy sávban |
| gödör | hiányzó útszakasz egy sávban; ritkán full-széles (csak ugrással) |

### Boss

A 3 meglévő minta sáv-koreográfiává alakul (pl. „bal láda → közép sorompó → jobb gödör"), mindig garantált menekülőúttal. A boss-ütemezés (5000 pontonként, warning, rest, +500 bónusz) változatlan.

### Collectible-formációk

A meglévő ív/hullám/vonal formációk mellé új: **sávokon átívelő cikcakk**, ami sávváltós játékra ösztönöz. A mágnes továbbra is minden hotdogot behúz (3D-ben a sáv irányába is).

## 5. Vizuális irány

### Kamera

- Snacky mögött és felette, enyhe előrenézés
- Sebességfüggő FOV: 60° → 75°
- Meglévő screen shake portolva
- Sávváltáskor a kamera késleltetve („lag"-gal) követ oldalra

### Snacky modell (procedurális low-poly)

A mostani 2D dizájn 3D mása: narancssárga lekerekített test (gömb/kapszula-primitívek), fekete fülek és végtagok, nagy fehér szemek pupillával, piros sál.

Animációk:
- futás: rugózó „bob" + végtaglengés
- sávváltás: testdőlés mozgásirányba, sálbehajlás
- ugrás: squash & stretch
- csúszás: lapulás + hátradőlés; ground pound: gyors zuhanás + landolási porfelhő
- a szemek továbbra is a legközelebbi akadályt követik (`setLookTarget` 3D-ben is)

### Világ

- Végtelenített útszegmensek (út + járda), két oldalt instanced low-poly házak kivilágított ablakokkal, utcai lámpák, távoli skyline
- Az 5 mérföldkő-téma (éjszaka → hajnal → nappal → naplemente → neon város) színátmenetként: fog-szín, égbolt, ablakfények, lámpák, irány-/környezeti fény — a jelenlegi palette-logika 3D material-színekre fordítva, ugyanazzal a smooth-lerp átmenettel

### Effektek

- Eső/hó: `THREE.Points`; köd: natív scene fog
- Trail: meleg fénycsík Snacky mögött
- Hotdog-felvétel: mustár/ketchup színű 3D particle + overlay floating text
- Ground pound: porfelhő
- Speed lines, vignette, screen flash: overlay-en marad

### Teljesítmény

- Instanced geometria: épületek, particle-ök
- Árnyék csak a játékosra és közeli objektumokra
- Object pooling: akadályok, collectible-ök, útszegmensek
- Cél: mobilon is stabil 60 fps

## 6. Migrációs fázisok

Minden fázis játszható állapotban zárul és külön commitot kap:

1. **Scaffold** — import map, `scene.js`, végtelen út + fények + kamera; üres pályán futó játék
2. **Snacky** — modell, sávváltás, ugrás/dupla ugrás, csúszás, ground pound, animációk
3. **Akadályok + ütközés** — 6 típus, megoldhatóság-ellenőrző, élet/invincibility
4. **Collectible-ök + power-upok** — hotdog/fánk/mágnes/×2, formációk, kombó
5. **Gödrök** + near-miss
6. **Világ + témák** — város, mérföldkő-átmenetek
7. **Effektek** — időjárás, trail, shake, FOV-kick, speed lines
8. **Boss + küldetések** — sáv-koreográfiás minták, mission HUD
9. **Overlay HUD port** — pontszám, kombó, mission pill, bannerek, floating textek; menük/ranglista bekötése
10. **Takarítás** — régi canvas draw-kód törlése, konstans-kalibráció, végső játszhatósági pass

## 7. Tesztelés

A projektben nincs teszt-keretrendszer. A verifikáció fázisonkénti **manuális játékteszt** checklist alapján:

- irányítás (mindhárom input-mód: billentyű, tap, swipe)
- ütközés és életvesztés, invincibility
- kombó, power-upok, küldetések, boss, mérföldkövek
- game over → ranglista mentés és megjelenés
- teljesítmény (60 fps mobilon)

## 8. Ami kifejezetten NEM része (YAGNI)

- Szabad 3D mozgás, extra játékmódok
- Külső 3D asset-ek, textúrák, GLTF modellek
- Backend-alapú ranglista (marad localStorage)
- A 2D verzió megtartása fallback-ként (a git history őrzi)
- Unit-teszt keretrendszer bevezetése
