// KIR/OH export → schools_import.sql
// Futtatás: node normalize-schools.mjs raw/<fájl>.xlsx   (cwd: scripts/)
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const file = process.argv[2];
if (!file) { console.error('Használat: node normalize-schools.mjs <xlsx>'); process.exit(1); }

const wb = XLSX.readFile(resolve(here, file));
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

// Fejléc-diagnosztika (első futáskor: tényleges oszlopnevek)
console.log('Sorok:', rows.length);
console.log('Fejlécek:', JSON.stringify(Object.keys(rows[0] ?? {})));

// Oszlop-felismerés (a KIR-export fejlécei változhatnak — első futáskor ellenőrizni!)
const pick = (r, keys) => keys.map((k) => r[k]).find((v) => v && String(v).trim()) ?? '';

// ── Task 10 kiegészítés: a KIR-export tényleges fejlécei + típus-oszlopok ──
const COL_NAME = ['Intézmény megnevezése', 'Intézmény neve', 'Név', 'name', 'INTÉZMÉNY NEVE'];
const COL_CITY = ['Intézmény székhelyének települése', 'Település', 'Székhely település', 'city', 'TELEPÜLÉS'];

// Csak iskolai nevelés-oktatást végző intézmények (óvoda/bölcsőde/konyha, kollégium,
// önálló AMI és szakszolgálat NEM kell — a verseny osztályokra épül).
const COLS_ALT = ['általános iskolai nevelés-oktatás'];
const COLS_GIM = ['gimnáziumi nevelés-oktatás'];
const COLS_SZAK = ['szakgimnáziumi nevelés-oktatás', 'szakközépiskolai nevelés-oktatás',
    'szakiskolai nevelés-oktatás', 'technikum', 'szakképző iskola'];
const COLS_SEN = ['készségfejlesztő iskolai nevelés-oktatás', 'fejlesztő nevelés-oktatás'];
const has = (r, cols) => cols.some((c) => String(r[c]).trim() !== '');
const isSchool = (r) => has(r, COLS_ALT) || has(r, COLS_GIM) || has(r, COLS_SZAK) || has(r, COLS_SEN);

function guessType(name, r) {
    // Elsődleges: a KIR típus-oszlopai (megbízhatóbb, mint a név-heurisztika)
    if (r) {
        if (has(r, COLS_ALT)) return 'altalanos';
        if (has(r, COLS_GIM)) return 'gimnazium';
        if (has(r, COLS_SZAK)) return 'szakkozep';
    }
    // Fallback: név-alapú (brief szerinti verbatim)
    const n = name.toLowerCase();
    if (n.includes('általános iskola') || n.includes('altalanos iskola')) return 'altalanos';
    if (n.includes('gimnázium') || n.includes('gimnazium')) return 'gimnazium';
    if (n.includes('szakközép') || n.includes('technikum') || n.includes('szakgimnázium')) return 'szakkozep';
    return 'egyeb';
}

const esc = (s) => String(s).replace(/'/g, "''");
const seen = new Set();
const out = [];
const stat = { total: rows.length, suspended: 0, nonSchool: 0, tooShort: 0, dup: 0, types: {} };

for (const r of rows) {
    if (String(r['Intézmény státusza']).trim() !== 'aktív') { stat.suspended++; continue; }
    if (!isSchool(r)) { stat.nonSchool++; continue; }
    const name = pick(r, COL_NAME).trim();
    const city = pick(r, COL_CITY).trim();
    if (name.length < 4 || city.length < 2) { stat.tooShort++; continue; }
    const key = `${name.toLowerCase()}|${city.toLowerCase()}`;
    if (seen.has(key)) { stat.dup++; continue; }
    seen.add(key);
    const type = guessType(name, r);
    stat.types[type] = (stat.types[type] ?? 0) + 1;
    out.push(`('${esc(name)}', '${esc(city)}', '${type}', true)`);
}

const chunks = [];
for (let i = 0; i < out.length; i += 500) {
    chunks.push(`insert into schools (name, city, type, is_verified) values\n${out.slice(i, i + 500).join(',\n')}\non conflict (name, city) do nothing;`);
}
writeFileSync(resolve(here, '../supabase/seed/schools_import.sql'),
    `-- ══ B2S iskola-import (KIR/OH) — ${out.length} rekord, generált ══\n` + chunks.join('\n\n'));
console.log('Stat:', JSON.stringify(stat));
console.log(`OK: ${out.length} iskola → supabase/seed/schools_import.sql`);
