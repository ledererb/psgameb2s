# Dorko-póló skinek (unlockable) — Design

Dátum: 2026-08-14
Kontextus: HANDOFF.md (2026-08-13) + hello.peksnack.hu beágyazás (2026-08-14)
Státusz: jóváhagyott design (brainstorming után); a felhasználó manuálisan tesztel

---

## 1. Cél

Sikeres futamok után Dorko-pólók oldódnak fel, amelyeket a játékos a következő
runokban „ráadhat" Snackyre. A feature **tisztán kliensoldali kozmetika**: nincs
szerver-, adatbázis- vagy versenylogika-változás. A 6 póló a DRK x VATES
kollaboráció darabjai: LÁNGOS, FRÖCCS, LIGET, KOVIUBI, LÁNCHÍD, HŐSÖK TERE.

## 2. Rögzített döntések

| # | Kérdés | Döntés |
|---|--------|--------|
| D1 | Feloldás | Progresszív pontküszöbök; futam eléri → végleg feloldódik az eszközön. LÁNGOS 1.000 · FRÖCCS 2.500 · LIGET 5.000 · KOVIUBI 10.000 · LÁNCHÍD 20.000 · HŐSÖK TERE 40.000. Feature bevezetésekor a meglévő személyes legjobb alapján visszamenőleg is feloldódik (csendben). |
| D2 | Tárolás | localStorage (`player-store` bővül: `unlocked[]`, `selected`). Nem kerül szerverre; a GDPR-törlést nem érinti. |
| D3 | Megjelenés | Stilizált, procedurálisan generált póló-minták (eredeti artwork nincs): alapszín + tematikus print. A print **előre és hátra** is kerül: futás közben a hátát látja a játékos, a menü-preview **szemből** mutatja (kifejezett kérés). |
| D4 | Technika | Külön póló-mesh a body fölé (torzó-héj + ujjak), `THREE.CanvasTexture`; a squash/stretch a group szintjén működik, így a póló automatikusan követi. A body és a játékmag sértetlen. |
| D5 | UI | Menüben „Snacky ruhatára" szekció: élő 3D **front-nézet preview** + választógombok (zárolt: 🔒 + küszöb). Game over: „🎉 ÚJ PÓLÓ FELOLDVA" banner. |

## 3. Komponensek

- **`js/skins.js` (új)**: skin-definíciók (id, név, küszöb, színek, ikon-spec),
  canvas-textúra generátor (`makeShirtTexture(skin)`), unlock-logika
  (`unlockByScore(score)` → újonnan feloldottak).
- **`js/models.js`**: `createShirtMesh(texture)` — torzó-héj (részleges gömb,
  a body transzformját követve) + két ujj a karok tövénél.
- **`js/player.js`**: `setSkin(texture|null)` — régi póló levétel/dispose, új hozzáadás.
- **`js/skin-preview.js` (új)**: kis önálló Three.js renderer a menüben; frissen
  gyártott Snacky-modell, kamera a -z oldalon (szemből), enyhe lengés.
- **`js/main.js`**: selector felépítése/frissítése, váltás → store + `setSkin` +
  preview; game over → `unlockByScore` → banner.
- **`js/player-store.js`**: `loadSkins()/saveSkins()`.
- **`index.html`**: ruhatára-szekció a menüben + banner a game over képernyőn.
- **`css/style.css`**: selector/preview/banner stílusok.

A `vercel.json` whitelist nem változik (a `js/` és `css/` mappák egésze kimegy).

## 4. Hibakezelés, edge case-ek

- WebGL-preview hiba esetén a preview-canvas elrejtésre kerül, a választó attól
  működik (try/catch).
- Több küszöb egyszerre: mindegyik feloldódik, a banner felsorolja.
- Alap-skin („póló nélkül") mindig választható.
- Új játékosnál (best=0) minden zárolt, séma-kompatibilis üres állapot.

## 5. Teszt

A felhasználó manuálisan tesztel. A fejlesztés része egy lokális smoke-check:
oldal betölt hiba nélkül, a ruhatára renderelődik, a preview szemből mutatja a
kiválasztott pólót (lokálisan seedelt localStorage-szel), screenshot-bizonylattal.
