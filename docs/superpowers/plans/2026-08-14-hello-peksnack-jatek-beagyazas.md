# hello.peksnack.hu `/jatek/` proxy-beágyazás — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Snacky Dash játék same-originben elérhető legyen `https://hello.peksnack.hu/jatek/` alatt (Vercel path-proxy), a landingen CTA-szekcióval, és a Supabase Edge Functions CORS-a allowlistára álljon (mindkét origin működjön).

**Architecture:** A landing Vercel-projekt `vercel.json` rewrite-tal proxyzza `/jatek/:path*` → `https://snackydash.vercel.app/:path*` útvonalat (`/jatek` → 307 → `/jatek/`). A 4 Edge Function statikus CORS-headere helyett per-request origin-reflecting allowlist kap. A játék frontend-kódja nem változik.

**Tech Stack:** Vercel (statikus hosting + vercel.json redirects/rewrites), Supabase Edge Functions (Deno, `--no-verify-jwt`), vanilla HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-08-14-hello-peksnack-jatek-beagyazas-design.md`

## Global Constraints

- Edge Function deploy MINDIG `--no-verify-jwt`-tel (nincs Supabase Auth; a functionök belül validálnak).
- Supabase CLI: `~/bin/supabase`; minden supabase-parancs előtt: `set -a; source .supabase-env; set +a` (a `psgameb2s` repo gyökerében).
- A játékmag (`js/game.js`, `world.js`, `player.js`, `scene.js`, `models.js`, `effects.js`, `audio.js`, `collectible.js`, `obstacle.js`, `powerup.js`, `pit.js`) ÉRINTETLEN.
- A `.supabase-env` SOSEM commitolódik (gitignored).
- Commit-stílus: emoji + magyar imperatív (pl. `🔧 Edge Functions: ...`).
- Register rate-limit: 5 perc/IP — tesztelésnél egyszerre max. 1–2 regisztráció.
- A landingnek (`/Users/balazslederer/Desktop/Dev/peksnack-landing/`) NINCS git repoja — módosítás előtt backup-másolat készül (Task 3, Step 1).

---

### Task 1: CORS-allowlist a 4 Edge Functionben + tesztscript

**Files:**
- Modify: `psgameb2s/supabase/functions/register/index.ts` (8–13. sor + `Deno.serve` nyitás)
- Modify: `psgameb2s/supabase/functions/submit-score/index.ts` (8–13. sor + `Deno.serve` nyitás)
- Modify: `psgameb2s/supabase/functions/update-affiliation/index.ts` (7–12. sor + `Deno.serve` nyitás)
- Modify: `psgameb2s/supabase/functions/delete-my-data/index.ts` (7–12. sor + `Deno.serve` nyitás)
- Create: `psgameb2s/supabase/tests/test_cors_origins.sh`

**Interfaces:**
- Consumes: meglévő `Deno.serve(async (req) => ...)` handler; a handler-törzsben levő összes `json(...)`/`CORS` hivatkozás változatlan marad.
- Produces: `corsHeaders(origin: string | null)` modul-szintű helper mind a 4 functionben; `ALLOWED_ORIGINS` env (vesszőlista, fallback: `ALLOWED_ORIGIN`, fallback: `'*'`); tesztscript env: `BASE` (default `$SUPABASE_URL/functions/v1`).

- [ ] **Step 1: Írd meg a CORS-tesztscriptet**

`psgameb2s/supabase/tests/test_cors_origins.sh`:

```bash
#!/usr/bin/env bash
# CORS-allowlist smoke: az allowlistelt origint reflecteli, mást nem.
# Használat: BASE="$SUPABASE_URL/functions/v1" bash supabase/tests/test_cors_origins.sh [function ...]
set -uo pipefail

BASE="${BASE:-${SUPABASE_URL:-}/functions/v1}"
FNS=("$@")
if [ ${#FNS[@]} -eq 0 ]; then
  FNS=(register submit-score update-affiliation delete-my-data)
fi

fail=0
check() {
  local fn="$1" origin="$2" expect="$3"
  local got
  got=$(curl -s -o /dev/null -D - -X OPTIONS "$BASE/$fn" -H "Origin: $origin" \
    | tr -d '\r' | awk 'tolower($1)=="access-control-allow-origin:"{print $2}')
  if [ "$got" = "$expect" ]; then
    echo "PASS  $fn  $origin -> $got"
  else
    echo "FAIL  $fn  $origin -> got '$got', want '$expect'"
    fail=1
  fi
}

for fn in "${FNS[@]}"; do
  check "$fn" "https://hello.peksnack.hu"      "https://hello.peksnack.hu"
  check "$fn" "https://snackydash.vercel.app"  "https://snackydash.vercel.app"
  # Ismeretlen originre a lista első elemét kapja vissza (a böngésző blokkol):
  check "$fn" "https://evil.example"           "https://snackydash.vercel.app"
done

exit $fail
```

- [ ] **Step 2: Red-run a scripttel a jelenlegi éles functionökön (elvárt: részleges FAIL)**

```bash
cd /Users/balazslederer/Desktop/Dev/snackydash/psgameb2s
set -a; source .supabase-env; set +a
BASE="$SUPABASE_URL/functions/v1" bash supabase/tests/test_cors_origins.sh
```

Expected: minden functionnél a `hello.peksnack.hu` sor FAIL (a jelenlegi statikus header `https://snackydash.vercel.app`-ot ad mindenre), a másik kettő PASS. Exit-kód: 1.

- [ ] **Step 3: `register/index.ts` átírása**

A 8–13. sorban — régi:

```ts
const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
```

új:

```ts
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',').map((s) => s.trim());

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin':
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'content-type',
  'Vary': 'Origin',
});
```

A `Deno.serve` nyitása — régi:

```ts
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
```

új:

```ts
Deno.serve(async (req) => {
  const CORS = corsHeaders(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
```

A handler többi része (összes `json(...)` hívás) változatlan marad.

- [ ] **Step 4: `submit-score/index.ts` átírása** — ugyanaz a két csere, mint Step 3 (a fájl 8–13. sorában és a `Deno.serve` nyitásában; a környező kód — plauzibilitási komment — marad).

- [ ] **Step 5: `update-affiliation/index.ts` átírása** — ugyanaz a két csere, mint Step 3 (a fájl 7–12. sorában; figyelem: itt a `const CORS` blokk közvetlenül a `createClient` után jön, üres sor nélkül, és utána a `const norm = ...` sor következik).

- [ ] **Step 6: `delete-my-data/index.ts` átírása** — ugyanaz a két csere, mint Step 3 (a fájl 7–12. sorában).

- [ ] **Step 7: Szintaxis-ellenőrzés (opcionális, ha van deno a gépen)**

```bash
command -v deno >/dev/null && deno check supabase/functions/register/index.ts supabase/functions/submit-score/index.ts supabase/functions/update-affiliation/index.ts supabase/functions/delete-my-data/index.ts || echo "deno nincs telepítve — a deploy (Task 2) validál"
```

- [ ] **Step 8: Commit**

```bash
cd /Users/balazslederer/Desktop/Dev/snackydash/psgameb2s
git add supabase/functions/*/index.ts supabase/tests/test_cors_origins.sh
git commit -m "🔧 Edge Functions: CORS origin-allowlist (ALLOWED_ORIGINS, per-request reflect)"
```

---

### Task 2: Backend deploy + CORS-verifikáció

**Files:** (nincs fájlmódosítás — csak deploy és teszt)

**Interfaces:**
- Consumes: Task 1 kódváltozásai + `supabase/tests/test_cors_origins.sh`.
- Produces: éles, allowlistás CORS mind a 4 functionön; a Task 5 GUI-tesztjei erre támaszkodnak.

- [ ] **Step 1: Új secret beállítása (a régi `ALLOWED_ORIGIN` megmarad fallbacknek)**

```bash
cd /Users/balazslederer/Desktop/Dev/snackydash/psgameb2s
set -a; source .supabase-env; set +a
~/bin/supabase secrets set ALLOWED_ORIGINS="https://snackydash.vercel.app,https://hello.peksnack.hu" --project-ref "$SUPABASE_PROJECT_REF"
```

Expected: `Finished supabase secrets set.` (a lista első eleme a snackydash — a tesztscript evil-origin elvárása erre támaszkodik).

- [ ] **Step 2: Mind a 4 function redeploy (`--no-verify-jwt`!)**

```bash
for fn in register submit-score update-affiliation delete-my-data; do
  ~/bin/supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
done
```

Expected: 4× `Deployed Function ...` hiba nélkül.

- [ ] **Step 3: Green-run a tesztscripttel**

```bash
BASE="$SUPABASE_URL/functions/v1" bash supabase/tests/test_cors_origins.sh
```

Expected: 12 sor, mindegyik `PASS`, exit-kód 0. Ha FAIL: a secret/deploy sorrend ellenőrzése, majd ismételt futtatás (a secrets-propagáció néha 10–20 mp).

---

### Task 3: Landing — backup, `vercel.json`, Snacky Dash szekció, navbar, CSS

**Files:**
- Create: `peksnack-landing/vercel.json`
- Modify: `peksnack-landing/index.html` (navbar + új szekció a 122–124. sor között)
- Modify: `peksnack-landing/index.css` (végére fűzés)
- Create: `peksnack-landing-backup-2026-08-14/` (backup, nem deploy-artifact)

**Interfaces:**
- Consumes: —
- Produces: `/jatek/` proxy-útvonal (Task 4 deployolja és verifikálja); `#snackydash` szekció + navbar-link.

- [ ] **Step 1: Backup a landing jelenlegi állapotáról (nincs git!)**

```bash
cp -R /Users/balazslederer/Desktop/Dev/peksnack-landing /Users/balazslederer/Desktop/Dev/peksnack-landing-backup-2026-08-14
ls /Users/balazslederer/Desktop/Dev/peksnack-landing-backup-2026-08-14/index.html
```

Expected: a backup `index.html` létezik.

- [ ] **Step 2: `vercel.json` létrehozása**

`/Users/balazslederer/Desktop/Dev/peksnack-landing/vercel.json`:

```json
{
  "redirects": [
    { "source": "/jatek", "destination": "/jatek/", "permanent": false }
  ],
  "rewrites": [
    { "source": "/jatek/", "destination": "https://snackydash.vercel.app/" },
    { "source": "/jatek/:path*", "destination": "https://snackydash.vercel.app/:path*" }
  ]
}
```

(Megjegyzés az implementációból: a `/jatek/:path*` egyedül NEM elég — a Vercel
path-to-regexpje az üres path-es `/jatek/`-t nem matchali, külön rewrite-sor kell
neki. E nélkül a gyökér 404, a restek (`/jatek/js/main.js` stb.) működnek.)

- [ ] **Step 3: Navbar-link beszúrása**

`index.html`-ben — régi:

```html
      <ul class="navbar-nav" id="navMenu">
        <!-- <li><a href="#nyeremenyjatekok">Nyereményjátékok</a></li> -->
```

új:

```html
      <ul class="navbar-nav" id="navMenu">
        <li><a href="#snackydash">Snacky Dash</a></li>
        <!-- <li><a href="#nyeremenyjatekok">Nyereményjátékok</a></li> -->
```

- [ ] **Step 4: A Snacky Dash szekció beszúrása**

Az elrejtett `#nyeremenyjatekok` comment-blokk vége (`  ===== -->`) és a VIDEO REELS comment közé — régi:

```html
  ===== -->

  <!-- ===== VIDEO REELS (Pek-Snack az interneten) ===== -->
```

új:

```html
  ===== -->

  <!-- ===== SNACKY DASH – BACK TO SCHOOL ===== -->
  <section id="snackydash">
    <div class="container">
      <header class="section-header fade-in-up">
        <span class="section-badge">Játék</span>
        <h2 class="section-title">Snacky Dash — Back to School Kihívás</h2>
        <p class="section-subtitle">
          Száguldj Snacky-val, gyűjtsd a hotdogokat, és versenyezz az iskoláddal és az osztályoddal!
          A kampány végén értékes nyeremények várnak.
        </p>
      </header>
      <div class="snackydash-cta fade-in-up">
        <a href="/jatek/" class="btn btn-accent">Játék indítása</a>
      </div>
    </div>
  </section>

  <!-- ===== VIDEO REELS (Pek-Snack az interneten) ===== -->
```

(A `fade-in-up` osztályt a meglévő `index.js` IntersectionObserver automatikusan kezeli — `index.js:221` —, JS-módosítás nem kell.)

- [ ] **Step 5: CSS hozzáfűzése az `index.css` végéhez**

```bash
cat >> /Users/balazslederer/Desktop/Dev/peksnack-landing/index.css <<'EOF'

/* ===== SNACKY DASH CTA SECTION ===== */
#snackydash {
  padding: 5rem 0;
}

.snackydash-cta {
  text-align: center;
  margin-top: 2.5rem;
}
EOF
```

- [ ] **Step 6: Lokális sanity-check (a rewrite NEM tesztelhető lokálisan — csak a markup)**

```bash
cd /Users/balazslederer/Desktop/Dev/peksnack-landing
python3 -m http.server 8091 & sleep 1
curl -s http://localhost:8091/ | grep -c 'id="snackydash"'   # elvárt: 1
curl -s http://localhost:8091/ | grep -c 'href="/jatek/"'    # elvárt: 1
kill %1
```

Expected: mindkét grep `1`. (A `/jatek/` link localhoston 404 — ez rendben van, a proxy csak Vercelen él.)

---

### Task 4: Landing deploy + curl-verifikáció

**Files:** (nincs fájlmódosítás — csak deploy és teszt)

**Interfaces:**
- Consumes: Task 3 fájljai; Task 2 éles CORS-állapota.
- Produces: éles `https://hello.peksnack.hu/jatek/`.

- [ ] **Step 1: Vercel CLI-login ellenőrzése / elvégzése (USER-AKCIÓ lehet!)**

```bash
vercel whoami || vercel login
```

Expected: bejelentkezett user a `team_Uc6yyG0YDmfHYj4sYF6BA9hP` csapat tagjaként (a `.vercel/project.json` szerinti org). Ha a `vercel login` böngészős/e-mailes flow-t kér, azt a felhasználó végzi el.

- [ ] **Step 2: Production deploy**

```bash
cd /Users/balazslederer/Desktop/Dev/peksnack-landing
vercel deploy --prod --yes
```

Expected: `Production: https://hello.peksnack.hu ...` (a `.vercel/project.json` linkelt projekt miatt a `peksnack-landing` projektbe kerül).

- [ ] **Step 3: Proxy- és regresszió-ellenőrzések**

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://hello.peksnack.hu/jatek        # 307 -> /jatek/
curl -s https://hello.peksnack.hu/jatek/ | grep -o "<title>[^<]*</title>"                          # a játék <title>-e
curl -s -o /dev/null -w "%{http_code}\n" https://hello.peksnack.hu/jatek/js/main.js               # 200
curl -s -o /dev/null -w "%{http_code}\n" https://hello.peksnack.hu/jatek/manifest.json            # 200
curl -s -o /dev/null -w "%{http_code}\n" https://hello.peksnack.hu/jatek/privacy.html             # 200
curl -s -o /dev/null -w "%{http_code}\n" "https://hello.peksnack.hu/jatek/docs/x"                 # 404 (dist-whitelist)
curl -s -o /dev/null -w "%{http_code}\n" https://hello.peksnack.hu/                               # 200 (landing érintetlen)
```

Expected: `307 -> /jatek/`; `<title>` sor a Snacky Dash címmel; `200`, `200`, `200`, `404`, `200`.

---

### Task 5: E2E GUI-verifikáció + HANDOFF-frissítés + push

**Files:**
- Modify: `psgameb2s/HANDOFF.md` (§2 táblázat + §8 troubleshooting CORS-sor)

**Interfaces:**
- Consumes: Task 2 + Task 4 éles állapota.
- Produces: verifikált éles rendszer; naprakész HANDOFF; a `main` branch tartalmazza a CORS-kódot és a specet.

- [ ] **Step 1: Playwright GUI-teszt az élő proxyn (controller-sessionből — subagentben stall-olhat, HANDOFF §9)**

Nyisd meg: `https://hello.peksnack.hu/jatek/`. Ellenőrizd:
1. A játék menüje renderelődik (canvas + START gomb), konzol-hiba nélkül.
2. Ranglista-overlay megnyitható és betölt (PostgREST view-k anon olvashatók).
3. START → a játék fut néhány másodpercig (billentyű-input működik).
4. `window.__snacky.game.onGameOver(12345, {distance:800,maxCombo:3,nearMisses:1,bosses:0})` → a game over + regisztrációs űrlap megjelenik.
5. Regisztráció egy teszt-becenévvel (pl. `ProxyTeszt<dátum>`) → pontbeküldés sikeres (hello-originről, CORS green). **Csak 1 regisztráció** (rate-limit!).
6. Utána a `delete-my-data` flow-val a tesztjátékos törölhető (badge „módosítás" → törlés), vagy SQL-ből takarítás.

- [ ] **Step 2: Regresszió — régi URL**

`https://snackydash.vercel.app` betölt, ranglista működik (GUI gyors-ellenőrzés; az OPTIONS-CORS-t a Task 2 scriptje már bizonyította).

- [ ] **Step 3: HANDOFF.md frissítése**

§2 táblázat — régi sor:

```markdown
| Játék (frontend) | **https://snackydash.vercel.app** (Vercel, GitHub `main` branch push-trigger) |
```

új sor:

```markdown
| Játék (frontend) | **https://hello.peksnack.hu/jatek/** (kanonikus) = a landing Vercel-projekt `/jatek/:path*` proxyja → **https://snackydash.vercel.app** (Vercel, GitHub `main` branch push-trigger) |
```

§8 troubleshooting — régi sor:

```markdown
| Frontend „Nem érhető el a szerver" | CORS: ALLOWED_ORIGIN nem egyezik az originnal → secrets set + redeploy |
```

új sor:

```markdown
| Frontend „Nem érhető el a szerver" | CORS: az origin nincs az ALLOWED_ORIGINS allowlistban (vesszőlista: snackydash.vercel.app, hello.peksnack.hu) → secrets set + redeploy |
```

- [ ] **Step 4: Commit + push**

```bash
cd /Users/balazslederer/Desktop/Dev/snackydash/psgameb2s
git add HANDOFF.md
git commit -m "📄 HANDOFF: kanonikus URL hello.peksnack.hu/jatek, ALLOWED_ORIGINS allowlist"
git push origin main   # no-op Vercel-rebuild: a dist-whitelist nem érinti a supabase/-t és a docs/-t
```

Expected: a push sikeres; a Vercel-build tartalma változatlan (ugyanaz a dist).

---

## Self-Review (kitöltve)

- **Spec-lefedettség:** §3 arch → Task 3–4; §4 landing → Task 3, 4; §5 backend → Task 1, 2; §6 megjegyzések → kódteendő nincs, HANDOFF Task 5; §7 edge case-ek → Task 4 Step 3 curl-checks; §8 verifikáció → Task 2 Step 3, Task 4 Step 3, Task 5 Step 1–2; §9 deploy-sorrend → a task-sorrend (1→5) követi; §10 out of scope → nincs implementálva. ✅
- **Placeholder-scan:** minden lépés konkrét kódot/parancsot tartalmaz. ✅
- **Típus-konzisztencia:** `corsHeaders(origin)` és `ALLOWED_ORIGINS` minden functionben azonos; a tesztscript evil-origin elvárása a Task 2 Step 1 secret-sorrendjére támaszkodik (snackydash első). ✅
