# Snacky Dash — Back to School versenyplatform — Design

Dátum: 2026-08-07
Forrás: „Snacky Dash — Back to School kampány — Technikai megvalósítási terv" (Think AI Kft., 2026-07-17)
Státusz: jóváhagyott design (brainstorming után), implementációs terv készül

---

## 1. Cél és háttér

A kész, működő Snacky Dash 3D endless runner játék (`psgameb2s/`) iskolai
versenyplatformmá bővül a Pek-Snack Back to School kampányhoz. A játékmechanika
és a vizuális világ **érintetlen marad**; a fejlesztés a regisztrációs folyamatra,
a háromszintű ranglistára és a GDPR-megfelelőségre koncentrálódik.

## 2. Rögzített döntések (brainstorming során)

| # | Kérdés | Döntés |
|---|--------|--------|
| D1 | Regisztráció pozíciója | **Game over képernyőn**, a pont mentéséhez. A játék regisztráció nélkül azonnal játszható. Visszatérő játékosnál a pont automatikusan mentődik. |
| D2 | Verseny-modell (**javított**) | Három szint, három mechanika. **Egyéni:** a kampány végén **sorsolás** minden résztvevő között — az egyéni ranglista csak megjelenítés. **Osztály:** **opt-in** — beküldésenként a játékos eldönti, hogy a pont számítson-e az osztályának; osztálypont = tagok legjobbjainak **összege**, iskolán belüli verseny, küszöb nélkül. **Iskola:** tagok (csapatpontként jelölt) legjobbjainak **átlaga**, min. 5 fő küszöb — a legmagasabb átlag nyer. Iskolához/osztályhoz tartozás **nem kötelező** — nem iskoláskorúak is részt vehetnek. |
| D3 | Iskola-adatbázis | A fejlesztő szerzi össze nyilvános KIR/OH forrásokból (~3500–4000 rekord: név, település, típus). Firecrawl opció, ha a letöltés blokkolva van. |
| D4 | Csalásvédelem | Pontbeküldés **Edge Functionön** át, szerveroldali validációval + rate limittel. |
| D5 | Stack | Supabase + vanilla JS, build step nélkül (a terv rögzíti). |
| D6 | Megközelítés | Rétegzett, API-modulos felépítés: összes szerverhívás `js/api.js`-ben, kulcsok `js/config.js`-ben. |

## 3. Architektúra

```
┌───────────────────────── BÖNGÉSZŐ ─────────────────────────┐
│  index.html          privacy.html                          │
│  ├─ menu screen      (adatkezelési tájékoztató + törlés)   │
│  ├─ game (3D, VÁLTOZATLAN játékmechanika)                  │
│  └─ gameover screen                                        │
│      ├─ registration form (új játékos)                     │
│      └─ 3-tab ranglista                                    │
│                                                            │
│  js/main.js        ─ flow-orchestráció (bővül)             │
│  js/registration.js─ regisztrációs form logika    [ÚJ]     │
│  js/leaderboard.js ─ 3-tab ranglista (ÚJRAÍRT)             │
│  js/player-store.js─ localStorage: player_id+secret [ÚJ]   │
│  js/api.js         ─ összes szerverhívás egy helyen [ÚJ]   │
│  js/config.js      ─ Supabase URL + anon key      [ÚJ]     │
│  js/game.js, world.js, player.js… ─ JÁTÉKMAG: érintetlen   │
└──────────────┬───────────────────────┬─────────────────────┘
               │ olvasás (views)       │ írás (Edge Functions)
               ▼                       ▼
┌──────────────────────── SUPABASE ──────────────────────────┐
│  Postgres: schools, classes, players, scores               │
│  Views: leaderboard_individual / _schools / _classes       │
│  RLS: anon csak SELECT a view-kra és schools/classes-ra    │
│  Edge Functions: register · submit-score ·                 │
│                  update-affiliation · delete-my-data       │
└────────────────────────────────────────────────────────────┘
```

Kulcselv: **az anon kulcs sosem ír táblába közvetlenül** — minden írás Edge
Functionön át történik (validáció + RLS-zár); olvasás csak a ranglista-view-kra
és az iskola/osztály listákra engedélyezett. A `players` és `scores` táblák az
anon szereplő számára teljesen zártak.

## 4. Adatbázis séma

```sql
schools   id bigint generated always as identity primary key,
          name text not null,
          city text not null,
          type text not null check (type in
            ('altalanos','gimnazium','szakkozep','egyeb')),
          is_verified boolean not null default false, -- KIR-import: true
          created_at timestamptz not null default now(),
          unique (name, city)

classes   id bigint generated always as identity primary key,
          school_id bigint not null references schools(id) on delete cascade,
          name text not null,                         -- pl. "10.A", "7.B"
          created_at timestamptz not null default now(),
          unique (school_id, name)

players   id uuid primary key default gen_random_uuid(),
          nickname text not null,                     -- NEM valós név
          school_id bigint references schools(id),    -- NULL = egyéni játékos
          class_id bigint references classes(id),     -- NULL = nincs osztály
          secret uuid not null default gen_random_uuid(),  -- "jelszó" szerep
          consent_at timestamptz not null default now(),
          consent_is_parent bool not null,            -- 16 év alatt: szülő
          created_at timestamptz not null default now()
          -- szabály (app-szint + check): class_id csak school_id-val együtt

scores    id bigint generated always as identity primary key,
          player_id uuid not null references players(id) on delete cascade,
          score int not null check (score >= 0),
          distance_m int not null default 0,
          duration_ms int not null default 0,
          counts_for_team bool not null default true, -- beküldéskori opt-in
          created_at timestamptz not null default now()
```

Indexek: `scores(player_id)`, `scores(score desc)`, `players(school_id)`,
`players(class_id)`, `schools(name)` (trigram `pg_trgm` a keresőhöz).

### 4.1 Ranglista-view-k (security definer)

| View | Logika |
|---|---|
| `leaderboard_individual` | játékosonkénti `max(score)`, becenév (+ iskola/osztály, ha van), top 100 — **csak megjelenítés**: a nyereményt sorsolás dönti, nem a helyezés |
| `leaderboard_schools` | iskolánként a csapatpontként jelölt (`counts_for_team`) futamokból számolt játékosonkénti legjobbak **átlaga** + játékosszám, `having count(distinct player) >= 5` — **a legmagasabb átlag nyer** |
| `leaderboard_classes` | osztályonként a jelölt futamokból a tagok legjobbjainak **összege** + tagszám, az adott iskolán belüli verseny, küszöb nélkül |

**Sorsolás-export (admin):** a kampány végén az összes regisztrált játékos
listája (nickname + iskola/osztály, ha van), akiknek ≥1 érvényes beküldött
futamuk van. Nem publikus — SQL-lekérdezés service role-lal. A sorsolás
menete (1 játékos = 1 sorsjegy, vagy futamonkénti sorsjegy) a játékszabályzat
része → Pek-Snack/jogi döntés (lásd §12).

Kiegészítő lekérdezés (Edge Function vagy RPC): egy adott iskola aktuális
átlaga és a küszöbhöz hiányzó létszám („még 2 játékos kell…") — küszöb alatti
iskolák a ranglistán nem jelennek meg, de a game over képernyőn a játékos látja
a saját közössége állását.

### 4.2 RLS-szabályok

| Tábla / view | anon SELECT | anon INSERT/UPDATE/DELETE |
|---|---|---|
| `schools`, `classes` | ✔ (teljes lista a keresőhöz) | ✖ |
| `leaderboard_*` view-k | ✔ | — |
| `players`, `scores` | ✖ | ✖ (csak service role az Edge Functionökből) |

## 5. Edge Functions (Deno, TypeScript)

Minden function JSON-t fogad/ad, hibák: `{ error: string }` + megfelelő HTTP státusz.
CORS: a kampány domainre korlátozva.

### 5.1 `register`
- Input: `{ nickname, school_id?, new_school?: {name, city, type}, class_id?, new_class_name?, consent_is_parent }`
- **Iskola/osztály opcionális** (egyéni játékosok is regisztrálhatnak). Szabályok: `class_id`/`new_class_name` csak iskola megadásával együtt; `school_id` és `new_school` együtt kizárva; `class_id` és `new_class_name` együtt kizárva.
- Validáció: becenév 2–20 karakter, megengedett karakterkészlet, szerveroldali tiltólista (trágár/diszkriminatív kifejezések); új iskola: név min. 4 karakter, település kötelező; `is_verified=false`-szal jön létre.
- Duplikáció-kezelés: új iskola/osztály felvételnél normalizált (kisbetű, trim) egyezéskeresés; race condition esetén unique-constraint hiba → létező rekord újraolvasása.
- Output: `{ player_id, secret, nickname, school: {id, name} | null, class: {id, name} | null }`
- Rate limit: IP-nként percenként max ~5 regisztráció.

### 5.2 `submit-score`
- Input: `{ player_id, secret, score, distance_m, duration_ms, counts_for_team? = true, client_run_id? }`
- Ellenőrzések sorrendben: (1) `secret` egyezik a player rekorddal → 403; (2) plauzibilitás — `score` nem haladja meg a `duration_ms`-ből és `distance_m`-ből származtatott elméleti maximumot (a játék pontszabályaiból származtatott konzervatív konstansokkal); (3) rate limit — játékosonként max 1 beküldés / 10 mp, napi max ~200.
- `counts_for_team=false` esetén a pont csak az egyéni ranglistára és a sorsolásba kerül (osztály/iskola aggregátumba nem).
- Output: `{ rank_individual, school: {rank, avg, players, below_threshold} | null, class: {rank, total, players} | null }`
- Idempotencia: duplikált `client_run_id` esetén a meglévő eredményt adja vissza.

### 5.3 `update-affiliation`
- Input: `{ player_id, secret, school_id? | new_school? | null, class_id? | new_class_name? | null }`
- Cél: aki egyéniként regisztrált, később csatlakozhat iskolához/osztályhoz (vagy kiléphet). A korábbi `counts_for_team` futamok visszamenőleg NEM módosulnak; az aggregátumok a játékos legjobbja alapján az aktuális tagsággal számolnak.
- Output: `{ school: {...} | null, class: {...} | null }`

### 5.4 `delete-my-data`
- Input: `{ player_id, secret }`
- Secret-ellenőrzés után `scores` majd `players` törlés (cascade).
- Output: `{ deleted: true }`

## 6. Frontend-modulok

### 6.1 `js/config.js` [ÚJ]
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `EDGE_BASE` exportok. Egyetlen hely, amit
a Pek-Snack-projekt átadásakor cserélni kell.

### 6.2 `js/api.js` [ÚJ]
Vékony wrapper (fetch, nincs supabase-js SDK-függőség szükségszerűen — a
view-k PostgREST-en is elérhetők; ha egyszerűbb, a supabase-js CDN-ről,
döntés az implementációs tervben):
- `searchSchools(query)` → `schools` ILIKE keresés (név + település), limit 10
- `getClasses(schoolId)`
- `register(payload)` → Edge Function
- `submitScore(payload)` → Edge Function
- `fetchIndividual()`, `fetchSchools()`, `fetchClasses(schoolId)`
- `getMyCommunityStatus(playerId, secret)` → küszöb alatti státusz + saját helyezés
- `deleteMyData(playerId, secret)`

### 6.3 `js/player-store.js` [ÚJ]
localStorage-kulcs: `snacky_player` = `{ player_id, secret, nickname, school, class }`.
API: `load()`, `save()`, `clear()`. Külön kulcs: `snacky_outbox` (nem küldött
pontok), `snacky_lb_cache` (utolsó ranglista-cache).

### 6.4 `js/registration.js` [ÚJ]
A game over képernyő regisztrációs formja:
- Becenév mező (maxlength 20, kliensoldali előszűrés) — **kötelező**
- Iskolakereső (**opcionális**): debounce (300 ms), találati lista (név + település + típus-badge),
  „Nem találom, felveszem" opció → mini-form (név, település, típus-select).
  Fölötte magyarázó sor: „Ha megadod az iskoládat, a pontjaid az iskolád versenyébe is számítanak.
  Nem vagy diák? Hagyd üresen, egyénileg is nyerhetsz a sorsoláson."
- Osztályválasztó (**opcionális**, iskola választása után jelenik meg): „Új osztály" szövegmező
- Kor-rádió: „16 éves vagy idősebb" / „16 alatti vagyok, szülői hozzájárulásom megvan" (kötelező választás)
- GDPR checkbox: alapértelmezetten **üres**, link a `/privacy`-re
- Submit → `api.register` → player-store mentés → pending pont automatikus beküldése
  (ha adott meg iskolát/osztályt: `counts_for_team=true`)
- „Kihagyom" gomb: pont nem mentődik, a game over képernyő ranglistával marad

### 6.5 `js/leaderboard.js` [ÚJRAÍRT]
Három tab (🧑 Egyéni | 🏫 Iskolák | 👥 Osztályok):
- Egyéni: top 100, saját sor kiemelve (player-store alapján); fejléc-jelzés:
  „A nyereményt a résztvevők között **sorsoljuk** ki a kampány végén"
- Iskolák: átlag + játékosszám oszlopok; 5 fő alatti iskolák nem szerepelnek
- Osztályok: a saját iskolán belüli összesített (tagok legjobbjainak összege)
  lista; iskola nélküli játékosnál az utoljára nézett/keresett iskola listája,
  fölötte iskolaválasztó
- A régi localStorage-os `Leaderboard` osztály megszűnik; a menü „Legjobb"
  sora a személyes legjobbat mutatja (szerverről, offline esetén cache)

### 6.6 `js/main.js` [BŐVÜL]
- `game.onGameOver` → ha van player-store: automatikus `submitScore`,
  eredmény-sor („Pont mentve! ✓ · Egyéni lista: #7 · Iskolád: 3. · Osztályod: 1.")
- Ha a játékosnak van iskolája/osztálya: **„Ez a pont számítson a csapatomnak"
  checkbox** (alapértelmezett: bepipálva) a game over képernyőn → `counts_for_team`
- Ha nincs player-store: regisztrációs form mutatása a ponttal
- Menü: „🏆 Ranglisták" gomb → overlay ugyanazzal a komponenssel;
  „Szia, Becenév!" sor (iskola/osztály, ha van, különben „egyéni játékos")
  + „nem te vagy?" link (player-store clear → újra lehet regisztrálni)
  + „iskola/osztály módosítása" link → `update-affiliation` mini-form
- Outbox-flush induláskor és sikeres mentés után

### 6.7 `privacy.html` [ÚJ]
Statikus oldal, a játék arculatával: adatkezelő, cél, kezelt adatok (becenév,
iskola, osztály, pontszám — kifejezetten NINCS valós név/email), tárolás
időtartama (kampány végéig), jogok, kapcsolat. **A szöveg jogi review-ra vár**
(jelölve a Pek-Snack feladatlistán). Alul: „Adataim törlése" szekció —
megerősítő dialógus → `deleteMyData` → player-store clear.

## 7. Adatfolyamok

**Új játékos:** START → játék → game over → form kitöltés → `register` →
player-store → `submitScore` (pending pont) → helyezések + ranglista megjelenítés.

**Visszatérő játékos:** START → játék → game over → automatikus `submitScore`
→ „Pont mentve! ✓" + helyezések + ranglista.

**Offline/hibás mentés:** a pont `{score, distance, duration, client_run_id, ts}`
a `snacky_outbox`-ba kerül; következő app-induláskor (és minden sikeres hálózati
művelet után) újraküldés, `client_run_id` miatt duplikáció nélkül.

**Ranglista offline:** utolsó sikeres válasz cache-lve (`snacky_lb_cache`),
fejlécben „utolsó frissítés" jelzéssel.

## 8. Hibakezelés

| Hiba | Viselkedés |
|---|---|
| Szerver elérhetetlen | outbox + cache-fallback; ranglista helyén „Nem érhető el a szerver, próbáld később" |
| Tiltott/foglalt becenév | inline hiba a formon, gomb újra engedélyezve |
| Secret-mismatch (másik eszköz/törölt adat) | player-store clear, regisztrációs form újra |
| Dupla-submit | submit gomb disabled állapot + `client_run_id` idempotencia |
| Iskolakereső 0 találat | „Nem találom, felveszem" CTA kiemelve |

## 9. GDPR-csomag

- Adatminimalizálás: csak becenév + (opcionális iskola/osztály) + pontszám; valós név,
  email, IP-tárolás nincs (Edge Function rate limit memória-alapú, nem perzisztens).
  A sorsolás nyertese ezért claim-alapúan értesíthető (lásd §12/6)
- Consent: alapértelmezetten üres checkbox + kor-rádió (16 év felett / szülői hozzájárulás)
- Tájékoztató: `privacy.html`, a regisztrációs formból linkelve
- Törléshez való jog: játékon belül (menü „nem te vagy?" + privacy-oldali törlés)
- Kampány vége: összes adat törlése (SQL script, a terv értelmében)
- Becenév-moderáció: szerveroldali tiltólista + jelentési lehetőség emailben
  (privacy-oldalon), manuális törlés SQL-lel
- ❗ A végső szövegeket jogi szakértő review-zza a kampány indulása előtt.

## 10. Tesztelés

Nincs és nem lesz unit-teszt framework — a projekt meglévő gyakorlatát követve:
1. **SQL-szintű verifikáció:** seedelt tesztadatokkal a 3 view és a küszöb-logika ellenőrzése; RLS-teszt anon kulccsal (íráskísérlet elutasítva).
2. **Edge Function tesztek:** curl-scenariók (valid regisztráció, rossz secret, plauzibilitás-sértés, rate limit, duplikált beküldés).
3. **GUI-verifikáció (Playwright):** teljes regisztrációs flow végigkattintva desktop + mobil viewporton; tab-váltások; offline-fallback; screenshot-dokumentáció (a korábbi task-jelentések mintájára).

## 11. Fázisok (a terv B2S-1…7 bontásához igazítva)

| Fázis | Tartalom | Becslés |
|---|---|---|
| F1 | Új Supabase projekt (Pek-Snack/Think AI fiók) + séma + indexek + RLS + view-k + seed tesztadat | 2–3 h |
| F2 | Iskola-adatforrás felderítése (KIR/OH), letöltés/ scraping, normalizálás, import-SQL | 1–2 h |
| F3 | Edge Functions (register, submit-score, update-affiliation, delete-my-data) + curl-tesztek | 3–4 h |
| F4 | `config.js`, `api.js`, `player-store.js` + regisztrációs UI (`registration.js`, index.html, css) | 3–4 h |
| F5 | Ranglista UI (leaderboard.js újraírás, tabs, menü-integráció) | 2–3 h |
| F6 | GDPR csomag: privacy.html, törlés, validációk, offline-outbox | 1–2 h |
| F7 | Deploy (Netlify/Vercel), domain, éles smoke-teszt | 1–2 h |

Összesen: ~13–20 h (a terv 14–19 órájával konzisztens).

## 12. Nyitott / Pek-Snack-től várt elemek

1. **Új Supabase projekt létrehozása** — a jelenlegi MCP-kapcsolat egy másik
   rendszerhez tartozik; a projektet a tulajdonos hozza létre (2 perc, dashboard),
   a URL + anon kulcs a `config.js`-be kerül. A migrációkat SQL-fájlokként adjuk át.
2. Domain + hosting platform (javaslat: `jatek.peksnack.hu`, Netlify/Vercel ingyenes).
3. GDPR-szövegek jogi review-ja.
4. Kampány kezdő/záró dátum (adattörlés ütemezése).
5. Nyeremények/szabályzat — **kibővült**: a sorsolásos modell miatt hivatalos
   **játékszabályzat** kell (sorsolás menete, sorsjegy-logika: 1 játékos = 1
   sorsjegy, vagy futamonkénti sorsjegy; nyertes-értesítés módja).
6. ❗ **Nyertes-értesítés probléma:** email/telefonszám nélkül a sorsolás
   nyertese NEM értesíthető közvetlenül. Javasolt megoldás: a nyertes
   becenevét (iskolával együtt) közzétesszük az oldalon + kampány csatornákon,
   és a nyertes **jelentkezik** a nyereményért X napon belül (claim-alapú).
   Alternatíva: iskolás nyertesnél az iskolán keresztül. Jogi/ops döntés kell.
7. Osztálypont-modell megerősítése: a design **tagok legjobbjainak összegével**
   számol (beszervezést motivál); ha a Pek-Snack mást szeretne, módosítjuk.

## 13. Kockázatok

| Kockázat | Kezelés |
|---|---|
| KIR/OH lista nem gépiesíthető formában érhető el | Firecrawl scraping; végső esetben kézi kurátor-folyamat + „saját iskola felvétele" funkció (amúgy is megvan) |
| Anon-kulcsos view-lekérdezés terhelés | view-k limitálva (100 sor), PostgREST cache- |
| Tiltólistát kijátszó becenevek | jelentési csatorna + manuális törlés; a becenév nem egyedi, így nincs „foglalási" verseny |
| Kiskorúak hamis szülői consentje | checkbox + tájékoztató; jogi review határozza meg, elfogadható-e a kampányban |
