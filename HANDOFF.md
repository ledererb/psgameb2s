# HANDOFF — Snacky Dash Back to School versenyplatform

> Állapot: **ÉLŐ és verifikált** (2026-08-13). Ebből a doksiból egy friss session minden
> kontextust megkap a továbbfejlesztéshez/üzemeltetéshez. Olvasd végig, mielőtt bármihez nyúlsz.

---

## 1. Mi ez?

A Pek-Snack Back to School kampány játéka: a meglévő Snacky Dash 3D endless runner
(vanilla JS + Three.js, nincs build step) iskolai versenyplatformmal bővült.
Diákok (és bárki más) becenévvel regisztrálnak a game over képernyőn, opcionálisan
iskolához/osztályhoz csatlakoznak, és a pontjaik versenybe számítanak.

**Versenymodell (D2 döntés — NE változtasd meg egyeztetés nélkül):**
- 🧑 **Egyéni:** kampány végén **sorsolás** a résztvevők között — a ranglista csak megjelenítés (top 100, játékosonkénti legjobb)
- 👥 **Osztály:** tagok csapatjelölt legjobbjai közül az **5 legjobb ÁTLAGA**, iskolán belüli verseny — **küszöb NÉLKÜL** (2026-08-31: minden osztály rangosítva, 5 fő alatt az összes tag átlaga)
- 🏫 **Iskola:** tagok csapatjelölt legjobbjai közül az **5 legjobb ÁTLAGA**, min. **5 játékos** küszöb; legmagasabb átlag nyer
- Beküldéskor checkbox (`counts_for_team`): a pont számítson-e a csapatnak (alapból bepipálva)
- Iskola/osztály-tagozódás **nem kötelező** (felnőttek is játszhatnak)

## 2. Élő rendszer

| Mi | Hol |
|---|---|
| Játék (frontend) | kanonikus: **https://hello.peksnack.hu/jatek/** = a landing Vercel-projekt `/jatek` proxyja → **https://snackydash.vercel.app** (Vercel, GitHub `main` branch push-trigger) |
| Landing | **https://hello.peksnack.hu** — statikus, `~/Desktop/Dev/peksnack-landing/` (NINCS git!), `vercel deploy --prod`; backup: `../peksnack-landing-backup-2026-08-14/` |
| Privacy oldal | https://hello.peksnack.hu/jatek/privacy.html |
| Játékszabályzat | https://hello.peksnack.hu/jatek/jatekszabalyzat.html |
| Supabase projekt | ref: `dhfuqznsjetcgafwgkuq` — https://dhfuqznsjetcgafwgkuq.supabase.co |
| GitHub repo | https://github.com/ledererb/psgameb2s (main = éles) |
| Spec | `docs/superpowers/specs/2026-08-07-back-to-school-versenyplatform-design.md` |
| Terv | `docs/superpowers/plans/2026-08-07-back-to-school-versenyplatform.md` |
| Munka-ledger | `.superpowers/sdd/progress-b2s.md` (gitignored) |

**Hitelesítés:** a repo gyökerében `.supabase-env` (GITIGNORED — sose commitold!):
`SUPABASE_ACCESS_TOKEN` (Management API), `SUPABASE_PROJECT_REF`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`. Ha nincs meg (másik gép/session): a token a user
Supabase dashboardján újragenerálható; a publishable kulcs a `js/config.js`-ben is benne van
(publikus by design). A service_role kulcsot a repó SEMAHOL nem tartalmazza —
az csak az Edge Runtime env-jében él (és kell is így maradjon).

## 3. Architektúra egy pillantásra

```
Böngésző (statikus, Vercel/dist)
  js/config.js       — Supabase URL + publishable kulcs (EGYETLEN hely)
  js/api.js          — MINDEN szerverhívás (plain fetch, nincs SDK)
  js/player-store.js — localStorage: profil, outbox, best, lb-cache
  js/registration.js — reg/edit űrlap (game over + badge „módosítás")
  js/leaderboard.js  — LeaderboardUI (3 tab + cache + esc())
  js/main.js         — flow: auto-submit, outbox-flush, badge, skin-vezérlés
  js/skins.js        — Dorko-póló skinek (küszöbök, unlock, textúra-töltés)
  js/skin-preview.js — menü-ruhatára 3D preview (front-nézet, önálló renderer)
  assets/skins/      — a 6 póló textúrája (valódi DRK x VATES hátprint-kivágatok,
                       blendelve; a forrásfotók lokálisan: ../dorko-ref/)
  index.html, privacy.html
        │ olvasás: PostgREST view-k + rpc (publishable kulcs)
        │ írás:    Edge Functions (secret-validált)
        ▼
Supabase (dhfuqznsjetcgafwgkuq)
  Táblák: schools(2736 KIR), classes, players, scores
  RLS: schools/classes SELECT anon OK; players/scores REVOKE anon+authenticated
       → minden írás/olvasás service role-os Edge Functionből
  View-k: leaderboard_individual / leaderboard_schools / leaderboard_classes (anon olvasható)
  fn_player_stats(uuid) → rank/stats json (anon rpc is hívható, de a kliens nem használja)
  Edge Functions (--no-verify-jwt deployolva!):
    register · submit-score · update-affiliation · delete-my-data
```

**Kulcselvek (ezeket tartsd be):**
1. Anon/publishable kulcs SOSEM ír táblába — csak Edge Function ír (service role env-ből).
2. A játékmag (`js/game.js`, `world.js`, `player.js`, `scene.js`, `models.js`, `effects.js`, `audio.js`, `collectible.js`, `obstacle.js`, `powerup.js`, `pit.js`) ÉRINTETLEN marad.
3. Minden szerver-adat renderelésekor `esc()` (XSS) — lásd leaderboard.js/main.js; új render-pontnál is kötelező.
4. GDPR: valós név/telefonszám gyűjtése tilos. E-mail: **2026-08-19-től OPCIONÁLIS**
   (`players.email`, csak ha a játékos megadja — nyertes-értesítés; üzleti döntés).
   A becenév szerveroldali regexe: `^[\p{L}\p{N} ._-]+$` (2-20 kar), `new_school`/`new_class_name`-nél `<`/`>` tilos.
5. Frontend dependency-free (nincs npm a játékhoz); a `scripts/` mappa build-time eszköz (xlsx).

## 4. Gyakori műveletek (pontos parancsok)

### SQL futtatás (NINCS SQL Editor — Management API megy)
```bash
cd <repo>
set -a; source .supabase-env; set +a
scripts/sb-run-sql.sh supabase/migrations/00X.sql        # fájl
echo "select count(*) from players;" | scripts/sb-run-sql.sh -   # ad-hoc
```
(Cloudflare blokkolja a python urllib-et — a helper curl-t használ. Hívásonként külön session: `set role` NEM perzisztál hívások között.)

### Edge Function deploy
```bash
set -a; source .supabase-env; set +a
~/bin/supabase functions deploy <név> --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
```
**Mindig `--no-verify-jwt`** (nincs Supabase Auth; a functionök belül validálnak secret-tel).
A CLI a `~/bin/supabase`-ban van (GitHub-release bináris; brew az Xcode CLT miatt nem megy).

### Frontend deploy
```bash
git push origin main        # Vercel automatikusan buildel a vercel.json szerint
```
`vercel.json`: csak a whitelistelt fájlok kerülnek ki (`dist/`: index.html, privacy.html,
css, js, assets, icons, manifest.json). Ha új publikus fájl/mappa kell (pl. favicon.ico),
add a cp-listához! Ellenőrzés deploy után: `https://…/docs/...` és `/.supabase-env` → 404.

### Backend-tesztek (curl)
```bash
BASE="$SUPABASE_URL/functions/v1" bash supabase/tests/test_register.sh   # SID=3 beégetve — seed-teszt iskola MÁR NINCS a DB-ben, a scriptet futtatás előtt frissítsd vagy hozz létre teszt-iskolát
```
Teszt-player létrehozása register-hívással, utána: `PID=… SECRET=… BASE=… bash supabase/tests/test_submit_score.sh`.
FIGYELEM: register rate-limit 5 perc/IP → egyszerre csak 1-2 tesztfuttatás.

### Lokális GUI-teszt
```bash
python3 -m http.server 8080   # repo gyökérben
# Playwright MCP: http://localhost:8080 → __snacky.game.onGameOver(12345, {distance:800,maxCombo:3,nearMisses:1,bosses:0})
```
`window.__snacky = { game, world, playerStore, api }` debug-handle — **csak `?debug=1` paraméterrel** (élőben nem elérhető; a konzolos onGameOver-csalás lezárva).
Póló-textúrák gyors ellenőrzése (mind a 6, front-nézet): `http://localhost:8080/dev-skins-preview.html`
(a fájl NINCS a dist-whitelistben, nem deployolódik).
FIGYELEM: az Edge Functionök CORS-a az **ALLOWED_ORIGINS** allowlistből reflectel (jelenleg: `snackydash.vercel.app,hello.peksnack.hu`) — a localhostos oldalról a hívások **CORS-hibát adnak**. Lokális full-flow teszthez ideiglenesen: `~/bin/supabase secrets set ALLOWED_ORIGINS='*'` + redeploy, utána vissza az allowlistára! (A régi `ALLOWED_ORIGIN` secret csak fallback, ha az `ALLOWED_ORIGINS` nincs beállítva.)

## 5. Adatbázis-séma (rövid)

- `schools`: name+city unique, type ∈ {altalanos, gimnazium, szakkozep, egyeb}, is_verified (KIR=true / user-felvett=false). 2736 sor (KIR 2026-08-12 export, tagintézmények nélkül).
- `classes`: (school_id, name) unique.
- `players`: uuid, nickname, school_id/class_id NULLABLE, secret uuid („jelszó"), consent_at, consent_is_parent.
- `scores`: player_id (cascade), score, distance_m, duration_ms, counts_for_team, client_run_id (parciális unique — idempotencia).
- `fn_player_stats(uuid)` → `{rank_individual, best_score, school:{rank,avg,players,below_threshold}|null, class:{rank,avg,players,below_threshold}|null}` (a class is avg + threshold, top-5 modell).

Plauzibilitás (submit-score): `score ≤ 4000·(duration_s) + 5000` **és** `score ≤ 400·(distance_m) + 5000`, duration 3 s–1 óra, — a sapkák a fizikai maximumra (100×20 kombó×2=4000 p/darab) vannak lazítva, durva hamis beküldésekre,
1 beküldés/10 mp/játékos (isolate-memória, best-effort), register 5/perc/IP (szintén isolate).

## 6. Nyitott feladatok (üzleti/launch — NEM kód)

1. **Domain**: a `hello.peksnack.hu/jatek/` **ÉL** (2026-08-14, Vercel path-proxy + CORS-allowlist). Ha mégis külön végleges domain kell (pl. `jatek.peksnack.hu`) → Vercel-ben hozzárendelés + az `ALLOWED_ORIGINS` listához hozzáadás + 4 function redeploy.
2. **privacy.html + jatekszabalyzat.html**: **VÉGLEGESÍTVE 2026-08-19** (a „TERVEZET"-bannerek kiszedve a döntés szerint; tartalom: valós cégadatok, GDPR-jogalap, adatfeldolgozók (Supabase eu-west-1, Vercel, Google, Meta), kampány-időtartam 2026-08-24→10-02, claim 30 nap, top-5 átlag-modell, opcionális e-mail). Független jogi review továbbra is ajánlott launch előtt, de nincs bennük helyőrző.
3. **Kampányzáró admin-scriptek** (még nincsenek, ~20 perc): sorsolás-export (players ≥1 score) + kampányvégi tömeges adattörlés.
4. **Token-higiénia**: `sbp_...` access token revoke a dashboardon, ha nem kell.

## 7. Ismert minor backlog (post-merge triage, egyik sem blokkoló)

- `register`/`update-affiliation`: ismeretlen `school_id` → 500 (4xx kellene; FK-mapping).
- `submit-score` dup-lookup nem player-scoped (UUID-ütközés elméleti).
- `duration_ms` NaN → 500 422 helyett (kliens mindig számot küld).
- Tagintézmények nincsenek az iskola-DB-ben (a „saját iskola felvétele" fedi le).
- Register rate-limit 5/perc/IP: osztálynyi gyerek egy NAT-IP-n 429-be futhat — kampány előtt mérlegelni 10-15/perc emelést.
- `update-affiliation`: `{school_id:null, new_class_name}` ellentmondásos kérés → 500 (DB CHECK védi; UI nem küld ilyet).
- Osztályrang: fn iskolán belül számol, a view globális listát ad — UI mindig iskolára szűr, konzisztens UX.
- `delete-my-data`-nak nincs UI-ja (az `api.js`-ben megvan a wrapper, de egyik képernyő sem hívja) — törlés jelenleg csak szerveroldalról (Edge Function hívás vagy SQL).

## 8. Ha valami nem működik

| Tünet | Ok / megoldás |
|---|---|
| Frontend „Nem érhető el a szerver" | CORS: az origin nincs az `ALLOWED_ORIGINS` allowlistban → `secrets set` (vesszőlista) + 4 function redeploy |
| `/jatek/` (üres path) 404 a proxyn | A Vercel `/jatek/:path*` NEM matcha az üres path-ra — kell a külön `{ "source": "/jatek/", "destination": ".../" }` rewrite-sor (landing `vercel.json`) |
| curl 401 a functionöknél | `verify_jwt` véletlenül bekapcsolva → redeploy `--no-verify-jwt`-tel |
| 42501 a players/scores lekérésnél anon-kulccsal | SZÁNDÉKOS (RLS+REVOKE) — írás/olvasás csak Edge Functionből |
| 429 regisztrációnál | IP rate-limit (isolate-memória) — várj 60 mp-et; tesztadat-növekedés OK |
| SQL „relation already exists" | migrációk nem idempotensek — egyszer futnak; Management API-n nincs CLI migration history |
| Vercelen régi tartalom | push után ~1 mp a build; hard refresh (Cmd+Shift+R) |

## 9. SDD-folyamat meta (ha továbbfejlesztesz)

A repo superpowers workflow-val készült: spec → plan → subagent-taskok → review-kapuk.
Új feature-nél ugyanez: `docs/superpowers/specs/` + `docs/superpowers/plans/`, ledger:
`.superpowers/sdd/progress-b2s.md`. GUI-verifikáció: Playwright MCP (subagentekben
időnként stall-ol; controllerként megbízható). Commit-stílus: emoji + magyar imperatív.
