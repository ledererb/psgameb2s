# Snacky Dash beágyazása a hello.peksnack.hu-ba — Design

Dátum: 2026-08-14
Kontextus: HANDOFF.md (2026-08-13) — az élő versenyplatform továbbfejlesztése
Státusz: jóváhagyott design (brainstorming után), implementációs terv készül

---

## 1. Cél és háttér

A Snacky Dash Back to School versenyplatform (jelenleg `https://snackydash.vercel.app`)
jelenjen meg a Pek-Snack kampányoldal (`https://hello.peksnack.hu`) alatt, a
**`https://hello.peksnack.hu/jatek/`** útvonalon, same-originben. A landingen egy
kirívó CTA-szekció visz a játékra. Inline iframe-előzetes **nem** készül.

A két érintett rendszer:

| Rendszer | Hol él | Deploy |
|---|---|---|
| Landing (`peksnack-landing/`, statikus: index.html/css/js + images) | Vercel `peksnack-landing` projekt | `vercel deploy --prod` (CLI, NINCS git repo) |
| Játék (`psgameb2s/`, statikus + Supabase) | Vercel, GitHub `main` push-trigger | `git push origin main` |

## 2. Rögzített döntések (brainstorming során)

| # | Kérdés | Döntés |
|---|--------|--------|
| D1 | Beágyazás módja | **Path-proxy**: a landing Vercel-projektje `/jatek/:path*` útvonalon átproxyzza a játékot (`https://snackydash.vercel.app/:path*`). Same-origin → nincs iframe/localStorage probléma, egy kanonikus URL. |
| D2 | Landing-en mi jelenik meg | Csak **CTA-szekció** („Snacky Dash" blokk + „Játék indítása" gomb → `/jatek/`). Inline iframe-teaser NEM készül (YAGNI). |
| D3 | „Headless" (böngészőkeret nélküli) mód | **Már létezik, nem fejlesztünk rá**: `js/main.js:290` `tryFullscreen()` a START-gesture-ben; PWA `display: standalone` + `apple-mobile-web-app-capable` a főképernyőre-mentéshez. A proxyn keresztül minden relatív útvonal változatlanul működik. |
| D4 | CORS | A 4 Edge Function **allowlistára** áll át: `https://snackydash.vercel.app` + `https://hello.peksnack.hu` — a régi URL **nem romlik el**. |
| D5 | Kanonikus URL | A kampányban a `https://hello.peksnack.hu/jatek/` a kommunikált cím. A `snackydash.vercel.app` technikai URL-ként él tovább (lásd §6 localStorage-megjegyzés). |

## 3. Architektúra

```
hello.peksnack.hu (Vercel: peksnack-landing, statikus)
  /, /index.css, ...           → landing fájlok (változatlan)
  /jatek                       → 307 redirect → /jatek/
  /jatek/:path*                → REWRITE (proxy) → snackydash.vercel.app/:path*
        │
        ▼  (böngésző: origin = https://hello.peksnack.hu)
Supabase Edge Functions (dhfuqznsjetcgafwgkuq)
  CORS allowlist: snackydash.vercel.app + hello.peksnack.hu
  register · submit-score · update-affiliation · delete-my-data
```

A játék frontend-kódja **nem változik** (a `js/config.js` abszolút Supabase URL-t
használ, az assetek relatívak). A játékmag továbbra is ÉRINTETLEN (HANDOFF §3).

## 4. Landing-módosítások (`peksnack-landing/`)

1. **Új `vercel.json`** (eddig nem volt):
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
   (Implementációs korrektúra: a `/jatek/:path*` NEM matcha az üres path-ra —
   a `/jatek/` csupasz gyökérhez külön rewrite-sor kell.)
   A redirect a Vercelen a rewrite ELŐTT fut → a perjel nélküli `/jatek` 307-tel
   `/jatek/`-re visz (a relatív assetek miatt a perjel kötelező).
2. **Új szekció az `index.html`-ben** a `#nyeremenyjatekok` után: `id="snackydash"`,
   cím + 1–2 mondatos pitch + „Játék indítása" gomb (`/jatek/`), a meglévő
   `section-title` / `btn btn-accent` osztályokkal; minimális CSS az `index.css`-ben.
3. **Navbar-link** a szekcióra.
4. Deploy: `vercel login` (ha kell) + `vercel deploy --prod` a mappából.
   Rollback: a `vercel.json` törlése + újra-deploy (a landing jelenlegi állapota
   a `main`-nélküli CLI-flow miatt a lokális mappa — deploy előtt másolat a
   jelenlegi fájlokról).

## 5. Backend-módosítások (`psgameb2s/supabase/functions/`)

A 4 function (`register`, `submit-score`, `update-affiliation`, `delete-my-data`)
mindegyikében a modul-szintű statikus `CORS` objektum helyett per-request
origin-reflecting allowlist:

```ts
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',').map((s) => s.trim());

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin':
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'content-type',
  'Vary': 'Origin',
});
```

- A `json()` helper és az OPTIONS-handler is a `req.headers.get('origin')`-nel hívja.
- Ismeretlen origin → a válasz az első allowlistelt origint tartalmazza (a böngésző
  blokkol — azonos a mai „rossz origin" viselkedéssel).
- A `'*'` fallback megmarad → a HANDOFFbeli lokális-teszt trükk
  (`ALLOWED_ORIGIN='*'`) tovább működik.
- Secret: `ALLOWED_ORIGINS=https://snackydash.vercel.app,https://hello.peksnack.hu`;
  a régi `ALLOWED_ORIGIN` secrethez nem nyúlunk (fallbackként ártalmatlan).
- Redeploy mind a 4-re, **mindig `--no-verify-jwt`** (HANDOFF §4).

## 6. Adat- és session-megfontolások

- A localStorage **origin-scoped**: aki korábban `snackydash.vercel.app`-on
  regisztrált, az a `/jatek/` alatt „új" játékosnak számít (új player_id).
  Kampány-indítás előtt ez nem probléma; a kommunikációban egyetlen kanonikus
  URL-t használunk (D5). A régi URL későbbi redirecte külön döntés (out of scope).
- A PWA-manifest `start_url: "."`/`scope: "."` a `/jatek/` alatt is helyes —
  a főképernyőre mentett app a proxys címre mutat. Nincs teendő.
- Fullscreen API: a proxy nem érinti (ugyanaz a dokumentum). iPhone Safari továbbra
  sem támogatja — a standalone PWA az iOS-es fullscreen út (változatlan).

## 7. Hibakezelés, edge case-ek

| Eset | Viselkedés |
|---|---|
| `/jatek` (perjel nélkül) | 307 → `/jatek/` |
| `/jatek/privacy.html`, `/jatek/icons/...`, `/jatek/manifest.json` | proxyzva, relatív hivatkozások miatt automatikusan helyes |
| Hello-originről API-hívás allowlist-állítás ELŐTT | CORS-blokk → ezért a deploy-sorrend: **backend először** (§9) |
| Régi `snackydash.vercel.app` használata | változatlanul működik (allowlist tag) |
| Landing egyéb útvonalai | a rewrite csak `/jatek/:path*`-ra illeszkedik, minden más érintetlen |

## 8. Tesztelés / verifikáció

1. **Backend (deploy után azonnal, curl):**
   - `curl -i -X OPTIONS $SUPABASE_URL/functions/v1/register -H "Origin: https://hello.peksnack.hu"` → `Access-Control-Allow-Origin: https://hello.peksnack.hu`
   - Ugyanez `Origin: https://snackydash.vercel.app`-kal → reflectelve (regresszió).
   - `Origin: https://evil.example` → NEM reflectelve.
2. **E2E (landing deploy után):**
   - `https://hello.peksnack.hu/jatek` → 307 → `/jatek/` → a játék betölt.
   - Android/desktop: START → fullscreen + portrait lock; iPhone: normál indul.
   - Regisztráció + pontbeküldés hello-originről (game over flow, valós GUI, Playwright).
   - Ranglista betölt hello-originről.
   - `https://hello.peksnack.hu/` többi része változatlan.
   - Regresszió: `snackydash.vercel.app` reg + submit tovább működik.
   - `https://hello.peksnack.hu/jatek/docs/...` → 404 (dist-whitelist változatlan).

## 9. Deploy-sorrend és visszaállítás

1. `psgameb2s`: CORS-kódmódosítás a 4 functionben → commit → push (frontend-build
   változatlan, a dist-whitelist nem érinti a supabase/ mappát).
2. Supabase: `secrets set ALLOWED_ORIGINS=...` + 4 function redeploy (`--no-verify-jwt`).
3. Backend-verifikáció curl-lel (§8.1).
4. `peksnack-landing`: `vercel.json` + szekció + navbar → `vercel deploy --prod`.
5. E2E-verifikáció (§8.2).

Rollback: landing = `vercel.json` törlése + redeploy; backend = `ALLOWED_ORIGINS`
secret visszaállítása egyetlen originre + redeploy.

## 10. Out of scope (tudatosan)

- Inline iframe-teaser a landingen (D2)
- Service worker / Android „Telepítés" prompt
- `jatek.peksnack.hu` aldomain (HANDOFF §6.1 nyitott tétel marad — DNS-függő)
- A landing git repo-ba szervezése (ajánlott, de nem scope)
- `snackydash.vercel.app` → `/jatek/` redirect (kampányzárás körüli döntés)
- privacy.html helyőrzők és játékszabályzat (HANDOFF §6 launch-blokkolók — változatlanul nyitottak)
