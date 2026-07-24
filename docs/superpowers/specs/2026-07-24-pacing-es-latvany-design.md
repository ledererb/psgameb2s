# Snacky Dash 3D — Pacing-javítás, gödör-látvány, játékmenet-extrák

Dátum: 2026-07-24
Állapot: jóváhagyva (brainstorming után)
Előzmény: `2026-07-23-snacky-dash-3d-design.md` (2D→3D migráció, lezárva)

## 1. Cél és háttér

A 3D migráció utáni játékteszt három problémát/igényt tárt fel:

1. **Túl hamar váltanak a témák.** A kombó-snowball (×20 szorzónál egy hotdog 2000 pont) miatt az `[1000, 3000, 5000, 8000]` mérföldkő-küszöbök másodpercek alatt teljesülnek; a neonváros "ingyen" jön.
2. **A gödrök nem elég látványosak.** Jelenleg egy lapos, sötét decal az úton — távolról alig észrevehető, nem kommunikálja a veszélyt.
3. **Játékmenet-extrák** kérése: az alábbi kettő választva (a többi jelölt — pajzs power-up, near-miss lánc — tudatosan kimarad, YAGNI).

## 2. Téma-küszöbök feljebb (pacing)

- `js/game.js` `milestoneThresholds`: `[1000, 3000, 5000, 8000]` → **`[2000, 6000, 12000, 20000]`**.
- A boss-ritmus (5000 pontonként), a `milestoneNames`, a banner-rendszer és a `world.setTheme()` hívás változatlan.
- Ezzel az éjszakai téma ~2× tovább tart, és a kombó-snowball sem repít át azonnal az összes érán.
- **Nem cél** a kombórendszer átszabása (a snowball a 2D-s eredeti design; a küszöbhangolás elegendő fék).

## 3. Mély 3D gödör + effektek

A `js/models.js` `createPitMesh(span)` teljes újraépítése — a lapos decal helyett mélyedés-illúzió:

> **Implementációs korrekció (2026-07-24, final review után):** az eredeti terv
> szerinti "void alj az útszint alatt + belső oldalfalak" megoldás **láthatatlan**,
> mert az út aszfaltja egy folytonos doboz, amelynek teteje `y=0`-nál van — minden
> `y<0` geometria beépül és takarásba kerül. Az implementált megoldás ezért az
> **útszint FÖLÖTT** építi fel a mélység-illúziót (a spec célja — látványos,
> jól olvasható gödör — így teljesül):

- **Sötét nyílás-fedő:** közel-fekete (`#05050C`, `MeshBasicMaterial`) doboz az útszinten (y≈0.02), amely takarja az aszfaltot a gödör területén — ez a "lyuk".
- **Belső mélyítő lépcső:** kisebb, még feketébb (`#010103`) doboz középen, kicsit magasabban (y≈0.045) — a fix, alacsony kameraállásból "lesüllyedő" hatást ad.
- **Világító perem:** 4 emissive narancs (`#FF6B1A`) csík a nyílás szélein (y≈0.07, vastagabb: 0.14), lassú pulzálással (emissiveIntensity szinusz, ~1.1–2.5, ~2 s periódus). Mind az 5 témán kontrasztos; távolról is ez hordozza az olvashatóságot.
- **Felszálló gőz:** 8 apró fényképtelen narancs kocka, amelyek körkörösen felfelé lebegnek a lyukból (a pit group része, `Pit.syncMesh(time)` animálja; NEM overlay-particle — a 3D-s világ része). Közelről látványos; távolról a perem viszi a jelzést.
- **Változatlan:** hitbox (`GROUND_Y-8`), sávlogika, near-miss, spawn-szabályok. Csak vizuális réteg.

## 4. Arany hotdog 🌟

- Új collectible-típus: `'golden_hotdog'` a `createCollectibleMesh`-ben — a normál hotdog modell arany emissive anyaggal + lassú skála-pulzálás (csillogás).
- **Spawn:** a formáció-generálásnál minden hotdog ~6% eséllyel aranyra upgradelődik (a donut-logika mintájára, de attól független).
- **Pont:** 500 alappont, a kombószorzó ugyanúgy vonatkozik rá (×20-nál 10 000 — tudatos jackpot).
- **Visszajelzés:** arany (`#FFD700`) `+{pont}` floating text (a meglévő vetített helperrel); hang: a meglévő collect hang — `audio.js` nem változik.
- A mágnes ugyanúgy húzza, mint a normál hotdogot.
- `HOTDOG_POINTS` konstans marad; az arany pontérték a game.js-ben lokális konstans (`GOLDEN_HOTDOG_POINTS = 500`).

## 5. Futam-statisztika a game over képernyőn

- **Mérés (js/game.js):** 4 számláló a futás alatt:
  - `runDistance` — frame-enként `gameSpeed` hozzáadva; megjelenítés méterben (`Math.round(runDistance / 50)`, a 50 px ≈ 1 m konverzió a játék skálájához illő olvasás)
  - `maxCombo` — a `comboMultiplier` futás közbeni maximuma
  - `nearMissCount` — a meglévő near-miss ágakban inkrementálva
  - `bossesDefeated` — a boss-bónusz ágban inkrementálva
  - Mindegyik `reset()`-ben nullázódik.
- **Átadás:** az `onGameOver(score)` callback kibővül: `onGameOver(score, stats)` — a `main.js` a `stats` objektumot kapja.
- **Megjelenítés (index.html + main.js + css):** a végső pont alatt egy kis statisztika-blokk a meglévő game over képernyő stílusában:
  - 🏃 távolság (m), 🔥 max kombó (×N), 😅 near-miss (db), 👹 legyőzött boss (db)
- **Session-only:** nem kerül localStorage-ba, a ranglista változatlan (leaderboard.js nem módosul).

## 6. Tesztelés

Nincs test framework — manuális böngésző-checklist taskonként (a migrációs gyakorlat szerint, Playwrighttal, friss porton):

- **Témák:** debug-hookkal a 2000/6000/12000/20000 küszöbökön a bannerek és témaátmenetek helyesek; a sorrend nem törik meg.
- **Gödör:** a mély lyuk minden témán jól látható; a perem pulzál; a gőz mozog; hit és near-miss továbbra is működik; teljes-szélességű (lane −1) gödör is helyes.
- **Arany hotdog:** spawnol (hookkal kikényszerítve is), 500×kombó pontot ad, arany floating text, mágnes húzza, collect hang szól.
- **Statisztika:** game over után mind a 4 érték helyes (hookkal ellenőrizhető); restart után nullázódik; a ranglista-flow érintetlen.
- **Regresszió:** console hibátlan; a teljes játékmenet-loop (start → boss → game over → restart) működik.

## 7. Architektúra-megkötések (örökölt)

- A "2.5D mag, 3D héj" elv változatlan: a logika logikai térben, a Three.js tiszta nézetréteg.
- Logikai konstansok (sebesség, gravitáció, gap-ek, kombómax) **fagyasztva** — kivétel: a `milestoneThresholds` lista (§2, kifejezetten jóváhagyott).
- `leaderboard.js`, `audio.js` nem módosul.
- Nincs külső asset; minden geometria/anyag kódból.
- UI-szövegek magyarul; commitüzenetek: emoji + rövid magyar leírás.

## 8. YAGNI — tudatosan kimarad

- Pajzs power-up, near-miss lánc (a brainstormban elvetve).
- Kombó-snowball átszabása (a küszöbhangolás az elfogadott megoldás).
- Új hangok az arany hotdoghoz (meglévő collect hang).
- Statisztika-persistencia / ranglista-bővítés.
- Boss pacing módosítása (nem volt rá panasz).
