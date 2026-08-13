# Back to School versenyplatform — Implementációs terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Snacky Dash játék iskolai versenyplatformmá bővítése: opcionális regisztráció (becenév + iskola/osztály), háromszintű verseny (egyéni sorsolás / osztály-összpont / iskola-átlag), Supabase backend Edge Function validációval, GDPR-csomaggal.

**Architecture:** Vanilla JS frontend (build step nélkül) → vékony `js/api.js` fetch-wrapper → Supabase PostgREST (olvasás: view-k) + Edge Functions (írás: register, submit-score, update-affiliation, delete-my-data). A `players`/`scores` táblák RLS-sel teljesen zártak anon szereplő felé; minden írás service role-os Edge Functionön át fut. A játékmechanika (`game.js`, `world.js`, `player.js`…) érintetlen.

**Tech Stack:** vanilla JS (ES modules), Three.js CDN (meglévő), Supabase (Postgres + PostgREST + Edge Functions / Deno), plain `fetch` (NINCS supabase-js kliens a frontendben).

**Spec:** `docs/superpowers/specs/2026-08-07-back-to-school-versenyplatform-design.md`

## Global Constraints

- Nincs build step, nincs bundler, nincs npm-függőség a **frontendben**; a Supabase-elérés plain `fetch`-csel történik.
- A játékmag fájljai (`js/game.js`, `js/world.js`, `js/player.js`, `js/scene.js`, `js/models.js`, `js/effects.js`, `js/audio.js`, `js/collectible.js`, `js/obstacle.js`, `js/powerup.js`, `js/pit.js`) **nem módosulnak**.
- Minden UI-szöveg magyar; a becenév NEM valós név, email/telefonszám gyűjtése tiltott (GDPR adattakarékosság).
- Az anon kulcs sosem ír táblába: INSERT/UPDATE/DELETE kizárólag Edge Functionből, service role kulccsal (az Edge Runtime `SUPABASE_SERVICE_ROLE_KEY` env-jéből, ez sosem kerül a frontendbe).
- Versenyszabályok: egyéni = sorsolás (ranglista csak megjelenítés); osztály = tagok legjobbjainak összege (`counts_for_team` futamokból), iskolán belül; iskola = tagok legjobbjainak átlaga, `>= 5` játékos küszöb.
- Commit-stílus a repo meglévő mintája: emoji + magyar imperatív (pl. `🗄️ B2S séma: schools/classes/players/scores`).
- Minden migrációs SQL a Supabase dashboard **SQL Editorában** futtatandó (emberi lépés); az Edge Functionök CLI-vel (`supabase functions deploy`) vagy dashboard-paste-szel kerülnek ki.
- Tesztelés: nincs unit-teszt framework; SQL-verifikáció (DO-blokkos assertek) + curl-scenariók + Playwright GUI-verifikáció (spec §10).

---

### Task 1: Supabase projekt + adatbázis séma

**Files:**
- Create: `supabase/migrations/001_schema.sql`
- Create: `js/config.js`

**Interfaces:**
- Produces: `schools(id,name,city,type,is_verified)`, `classes(id,school_id,name)`, `players(id,nickname,school_id,class_id,secret,consent_is_parent)`, `scores(id,player_id,score,distance_m,duration_ms,counts_for_team,client_run_id,created_at)` táblák; `CONFIG.SUPABASE_URL`, `CONFIG.SUPABASE_ANON_KEY`, `CONFIG.EDGE_BASE`.

- [ ] **Step 1: Feature-branch**

```bash
cd /Users/balazslederer/Desktop/Dev/snackydash/psgameb2s
git checkout -b feature/b2s-versenyplatform
```

- [ ] **Step 2: Migrációs SQL megírása**

`supabase/migrations/001_schema.sql`:

```sql
-- ══ B2S versenyplatform — séma (spec §4) ══
create extension if not exists pg_trgm;

create table schools (
  id bigint generated always as identity primary key,
  name text not null,
  city text not null,
  type text not null check (type in ('altalanos','gimnazium','szakkozep','egyeb')),
  is_verified boolean not null default false,  -- KIR-import: true; játékos felvétel: false
  created_at timestamptz not null default now(),
  unique (name, city)
);

create table classes (
  id bigint generated always as identity primary key,
  school_id bigint not null references schools(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  school_id bigint references schools(id),      -- NULL = egyéni játékos
  class_id bigint references classes(id),       -- NULL = nincs osztály
  secret uuid not null default gen_random_uuid(),
  consent_at timestamptz not null default now(),
  consent_is_parent bool not null,              -- 16 év alatt: szülői hozzájárulás
  created_at timestamptz not null default now(),
  check (class_id is null or school_id is not null)
);

create table scores (
  id bigint generated always as identity primary key,
  player_id uuid not null references players(id) on delete cascade,
  score int not null check (score >= 0),
  distance_m int not null default 0,
  duration_ms int not null default 0,
  counts_for_team bool not null default true,   -- beküldéskori csapat-opt-in
  client_run_id uuid,                           -- idempotencia-kulcs
  created_at timestamptz not null default now()
);

create unique index scores_client_run_id_uq on scores(client_run_id) where client_run_id is not null;
create index scores_player_idx on scores(player_id);
create index players_school_idx on players(school_id);
create index players_class_idx on players(class_id);
create index schools_name_trgm on schools using gin (name gin_trgm_ops);
create index schools_city_idx on schools(city);
```

- [ ] **Step 3: Supabase projekt létrehozása (EMBERI LÉPÉS)**

A felhasználó a <https://supabase.com/dashboard>-on: **New project** → név: `snacky-dash-b2s`, régió: Frankfurt (eu-central-1), ingyenes csomag. Létrehozás után **Project Settings → API**: projekt URL + `anon public` kulcs másolása.

- [ ] **Step 4: `js/config.js` kitöltése a valós értékekkel**

```js
// B2S — Supabase projektkonfiguráció (egyetlen hely, átadáskor ezt cseréljük)
export const CONFIG = {
  SUPABASE_URL: 'https://PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'ANON_PUBLIC_KEY',
  EDGE_BASE: 'https://PROJECT_REF.supabase.co/functions/v1',
};
```

`.gitignore`-ba: nem kell (az anon kulcs nyilvános adat, RLS védi az adatokat).

- [ ] **Step 5: Migráció futtatása (EMBERI LÉPÉS)**

Supabase dashboard → **SQL Editor** → New query → `001_schema.sql` tartalma → Run.

- [ ] **Step 6: Verifikáció (SQL Editor)**

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Expected: `classes, players, schools, scores` sorok.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/001_schema.sql js/config.js
git commit -m "🗄️ B2S séma: schools/classes/players/scores + projektkonfig"
```

---

### Task 2: RLS + ranglista-view-k + stats-függvény + seed-verifikáció

**Files:**
- Create: `supabase/migrations/002_rls.sql`
- Create: `supabase/migrations/003_views.sql`
- Create: `supabase/migrations/004_functions.sql`
- Create: `supabase/seed/seed_test.sql`
- Create: `supabase/verify/verify_backend.sql`

**Interfaces:**
- Produces: view `leaderboard_individual(player_id,nickname,school_name,class_name,best_score,run_count)`; view `leaderboard_schools(school_id,name,city,avg_score,player_count)`; view `leaderboard_classes(class_id,school_id,name,total_score,player_count)`; függvény `fn_player_stats(p_player_id uuid) returns json` — kimenet: `{rank_individual, best_score, school: {rank,avg,players,below_threshold}|null, class: {rank,total,players}|null}` (a Task 4 Edge Function és a Task 6 `api.getStats` ezt hívja).

- [ ] **Step 1: Verifikációs SQL megírása ELŐSZÖR (teszt-first)**

`supabase/verify/verify_backend.sql` — determinisztikus assertek a seed-adatokra (a seed: „Teszt Gimi" 5 játékos, „Kis Suli" 4 játékos küszöb alatt, osztály-összeg, opt-out futam, iskola nélküli játékos):

```sql
-- ══ B2S backend verifikáció — Futtatás: SQL Editor, 002–004 + seed után ══
do $$
declare
  v_avg int; v_cnt int; v_total int; v_best int; v_rank int;
  v_stats json; v_p1 uuid; v_dummy int;
begin
  -- 1. Iskola-átlag: Teszt Gimi = (15000+12000+10000+9000+8000)/5 = 10800, 5 fő
  select avg_score, player_count into v_avg, v_cnt
    from leaderboard_schools where name = 'Teszt Gimi';
  if v_avg is distinct from 10800 or v_cnt is distinct from 5 then
    raise exception 'FAIL: Teszt Gimi avg=% players=% (várt: 10800/5)', v_avg, v_cnt; end if;

  -- 2. Küszöb: Kis Suli (4 fő) NEM szerepel
  select count(*) into v_dummy from leaderboard_schools where name = 'Kis Suli';
  if v_dummy <> 0 then raise exception 'FAIL: Kis Suli a küszöb ellenére listázva'; end if;

  -- 3. Osztály-összeg: Teszt Gimi 11.A = 15000+12000 = 27000, küszöb nélkül
  select total_score into v_total from leaderboard_classes where name = '11.A';
  if v_total is distinct from 27000 then
    raise exception 'FAIL: 11.A total=% (várt: 27000)', v_total; end if;

  -- 4. Egyéni: az opt-out futam (99999) számít, a csapatlistában nem
  select best_score into v_best from leaderboard_individual where nickname = 'Optout Pisti';
  if v_best is distinct from 99999 then
    raise exception 'FAIL: Optout Pisti egyéni best=% (várt: 99999)', v_best; end if;

  -- 5. fn_player_stats: Első Emese (best 15000, Gimi, 11.A)
  select id into v_p1 from players where nickname = 'Első Emese';
  v_stats := fn_player_stats(v_p1);
  if (v_stats->>'rank_individual')::int <> 3 then
    raise exception 'FAIL: Emese rank=% (várt: 3 — mögötte Optout 99999, Egyéni Géza 50000)', v_stats; end if;
  if (v_stats->'school'->>'avg')::int <> 10800 then
    raise exception 'FAIL: Emese school stats hibás: %', v_stats; end if;
  if (v_stats->'class'->>'total')::int <> 27000 then
    raise exception 'FAIL: Emese class stats hibás: %', v_stats; end if;

  raise notice 'OK: minden assert átment';
end $$;

-- 6. RLS-zár ellenőrzése: a REVOKE miatt anon NEM éri el a players/scores táblát
set role anon;
select count(*) from players;   -- Expected: ERROR 42501 (permission denied)
select count(*) from scores;    -- Expected: ERROR 42501
select count(*) from schools;   -- Expected: sorok száma (SELECT engedélyezett)
reset role;
```

- [ ] **Step 2: Verifikáció futtatása most — láthatóan bukik**

SQL Editor: a `do $$ … $$` blokk (a `set role` rész nélkül).
Expected: `ERROR: relation "leaderboard_schools" does not exist`.

- [ ] **Step 3: `002_rls.sql`**

```sql
-- ══ B2S — Row Level Security (spec §4.2) ══
alter table schools enable row level security;
alter table classes enable row level security;
alter table players enable row level security;
alter table scores enable row level security;

-- Anon csak OLVASHAT iskolát/osztályt (keresőhöz). Írás: sosem.
create policy schools_read on schools for select to anon using (true);
create policy classes_read on classes for select to anon using (true);

-- players/scores: grant-visszavonás anon + authenticated felé (a Supabase
-- alap-grantjei miatt a puszta policy-hiány csak 0 sort adna, nem hibát;
-- a REVOKE teszi a zárat légmentessé: API-hívás → 42501).
revoke all on players from anon, authenticated;
revoke all on scores from anon, authenticated;
-- service_role érintetlen → az Edge Functions tovább írhat/olvas.
```

- [ ] **Step 4: `003_views.sql`**

```sql
-- ══ B2S — ranglista-view-k (spec §4.1, D2 versenymodell) ══

-- Egyéni: játékosonkénti legjobb (MINDEN futam számít) — csak megjelenítés, a nyeremény sorsolásos
create view leaderboard_individual as
select p.id as player_id, p.nickname,
       s.name as school_name, c.name as class_name,
       max(sc.score) as best_score, count(sc.id)::int as run_count
from players p
join scores sc on sc.player_id = p.id
left join schools s on s.id = p.school_id
left join classes c on c.id = p.class_id
group by p.id, p.nickname, s.name, c.name
order by best_score desc
limit 100;

-- Iskola: tagok csapatjelölt legjobbjainak ÁTLAGA, min. 5 fő
create view leaderboard_schools as
with bests as (
  select p.school_id, p.id as pid, max(sc.score) as best
  from players p
  join scores sc on sc.player_id = p.id and sc.counts_for_team
  where p.school_id is not null
  group by p.school_id, p.id
)
select s.id as school_id, s.name, s.city,
       round(avg(b.best))::int as avg_score,
       count(*)::int as player_count
from bests b
join schools s on s.id = b.school_id
group by s.id, s.name, s.city
having count(*) >= 5
order by avg_score desc;

-- Osztály: tagok csapatjelölt legjobbjainak ÖSSZEGE, küszöb nélkül
create view leaderboard_classes as
with bests as (
  select p.class_id, p.id as pid, max(sc.score) as best
  from players p
  join scores sc on sc.player_id = p.id and sc.counts_for_team
  where p.class_id is not null
  group by p.class_id, p.id
)
select c.id as class_id, c.school_id, c.name,
       sum(b.best)::int as total_score,
       count(*)::int as player_count
from bests b
join classes c on c.id = b.class_id
group by c.id, c.school_id, c.name
order by total_score desc;

grant select on leaderboard_individual to anon;
grant select on leaderboard_schools to anon;
grant select on leaderboard_classes to anon;
```

- [ ] **Step 5: `004_functions.sql`**

```sql
-- ══ B2S — játékos-statisztika (game over eredménysor + „még N játékos kell") ══
create or replace function fn_player_stats(p_player_id uuid)
returns json language plpgsql security definer stable as $$
declare
  v_school_id bigint; v_class_id bigint;
  v_best int; v_rank int;
  v_avg numeric; v_cnt int; v_srank int;
  v_total numeric; v_ccnt int; v_crank int;
begin
  select school_id, class_id into v_school_id, v_class_id
    from players where id = p_player_id;
  if not found then return json_build_object('error', 'not_found'); end if;

  select coalesce(max(score), 0) into v_best from scores where player_id = p_player_id;

  select count(*) + 1 into v_rank from (
    select player_id from scores group by player_id having max(score) > v_best
  ) t;

  v_avg := null; v_cnt := 0; v_srank := null;
  if v_school_id is not null then
    with bests as (
      select p.id pid, max(s.score) best
      from players p join scores s on s.player_id = p.id and s.counts_for_team
      where p.school_id = v_school_id group by p.id
    )
    select count(*), coalesce(avg(best), 0) into v_cnt, v_avg from bests;

    if v_cnt >= 5 then
      with bests as (
        select p.school_id sid, p.id pid, max(s.score) best
        from players p join scores s on s.player_id = p.id and s.counts_for_team
        where p.school_id is not null group by p.school_id, p.id
      ), avgs as (
        select sid, avg(best) a from bests group by sid having count(*) >= 5
      )
      select count(*) + 1 into v_srank from avgs where a > v_avg;
    end if;
  end if;

  v_total := null; v_ccnt := 0; v_crank := null;
  if v_class_id is not null then
    with bests as (
      select p.id pid, max(s.score) best
      from players p join scores s on s.player_id = p.id and s.counts_for_team
      where p.class_id = v_class_id group by p.id
    )
    select count(*), coalesce(sum(best), 0) into v_ccnt, v_total from bests;

    with bests as (
      select p.class_id cid, p.id pid, max(s.score) best
      from players p join scores s on s.player_id = p.id and s.counts_for_team
      where p.class_id is not null and p.school_id = v_school_id
      group by p.class_id, p.id
    ), sums as (
      select cid, sum(best) t from bests group by cid
    )
    select count(*) + 1 into v_crank from sums where t > v_total;
  end if;

  return json_build_object(
    'rank_individual', v_rank,
    'best_score', v_best,
    'school', case when v_school_id is null then null else json_build_object(
      'rank', v_srank, 'avg', round(coalesce(v_avg, 0))::int, 'players', v_cnt,
      'below_threshold', v_cnt < 5) end,
    'class', case when v_class_id is null then null else json_build_object(
      'rank', v_crank, 'total', v_total::int, 'players', v_ccnt) end
  );
end $$;

grant execute on function fn_player_stats(uuid) to anon;
```

- [ ] **Step 6: `seed_test.sql`**

```sql
-- ══ B2S teszt-seed (csak fejlesztéshez! Élesben: truncate-gyel törlendő) ══
insert into schools (name, city, type, is_verified) values
  ('Teszt Gimi', 'Budapest', 'gimnazium', true),
  ('Kis Suli', 'Pécs', 'altalanos', true);

insert into classes (school_id, name)
  select id, '11.A' from schools where name = 'Teszt Gimi';

-- Teszt Gimi: 5 játékos (Emese+Balázs az 11.A-ban)
insert into players (nickname, school_id, class_id, consent_is_parent)
  select 'Első Emese', s.id, c.id, false from schools s, classes c
   where s.name='Teszt Gimi' and c.name='11.A' and c.school_id=s.id;
insert into players (nickname, school_id, class_id, consent_is_parent)
  select 'Második Balázs', s.id, c.id, false from schools s, classes c
   where s.name='Teszt Gimi' and c.name='11.A' and c.school_id=s.id;
insert into players (nickname, school_id, consent_is_parent)
  select 'Harmadik Kata', s.id, false from schools s where s.name='Teszt Gimi';
insert into players (nickname, school_id, consent_is_parent)
  select 'Negyedik Dániel', s.id, false from schools s where s.name='Teszt Gimi';
insert into players (nickname, school_id, consent_is_parent)
  select 'Optout Pisti', s.id, true from schools s where s.name='Teszt Gimi';

-- Kis Suli: 4 játékos (küszöb alatt)
insert into players (nickname, school_id, consent_is_parent)
  select 'Kis' || g, s.id, false from schools s, generate_series(1,4) g
   where s.name='Kis Suli';

-- Egyéni játékos, iskola nélkül
insert into players (nickname, consent_is_parent) values ('Egyéni Géza', false);

-- Pontok
insert into scores (player_id, score, counts_for_team)
  select id, 15000, true from players where nickname='Első Emese';
insert into scores (player_id, score, counts_for_team)
  select id, 12000, true from players where nickname='Második Balázs';
insert into scores (player_id, score, counts_for_team)
  select id, 10000, true from players where nickname='Harmadik Kata';
insert into scores (player_id, score, counts_for_team)
  select id, 9000, true from players where nickname='Negyedik Dániel';
-- Optout Pisti: csapatba számító 8000 + NEM csapatba számító 99999
insert into scores (player_id, score, counts_for_team)
  select id, 8000, true from players where nickname='Optout Pisti';
insert into scores (player_id, score, counts_for_team)
  select id, 99999, false from players where nickname='Optout Pisti';
insert into scores (player_id, score, counts_for_team)
  select id, 2000, true from players where nickname like 'Kis%';
insert into scores (player_id, score) values
  ((select id from players where nickname='Egyéni Géza'), 50000);
```

- [ ] **Step 7: SQL-ek futtatása sorban (EMBERI LÉPÉS, SQL Editor)**

Sorrend: `002_rls.sql` → `003_views.sql` → `004_functions.sql` → `seed_test.sql` → `verify_backend.sql`.

- [ ] **Step 8: Verifikáció — assertek átmennek, RLS-zár tart**

Expected: `NOTICE: OK: minden assert átment`; a `set role anon` szekcióban két `ERROR 42501` (players, scores), a `schools` count visszaad értéket.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/00*.sql supabase/seed/ supabase/verify/
git commit -m "🔒 B2S: RLS + ranglista-view-k + fn_player_stats, seed-verifikációval"
```

---

### Task 3: `register` Edge Function

**Files:**
- Create: `supabase/functions/register/index.ts`
- Create: `supabase/tests/test_register.sh`

**Interfaces:**
- Consumes: Task 1 táblák (`schools`, `classes`, `players`).
- Produces: `POST {EDGE_BASE}/register` — input `{nickname, school_id?, new_school?:{name,city,type}, class_id?, new_class_name?, consent_is_parent}` → output `201 {player_id, secret, nickname, school:{id,name}|null, class:{id,name}|null}`; hibakódok: `nickname_length|nickname_chars|nickname_blocked|consent_required|school_conflict|school_invalid|school_type|class_requires_school|class_conflict|class_invalid|rate_limited`. A Task 6 `api.register` ezeket a kódokat használja.

- [ ] **Step 1: Curl-teszt megírása ELŐSZÖR**

`supabase/tests/test_register.sh`:

```bash
#!/usr/bin/env bash
# Használat: BASE=https://PROJECT_REF.supabase.co/functions/v1 ./test_register.sh
set -u
BASE="${BASE:?add meg a BASE-t}"
pass=0; fail=0
check() { # $1=leírás $2=várt $3=kapott
  if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1));
  else echo "✘ $1 — várt:$2 kapott:$3"; fail=$((fail+1)); fi
}

# 1. Valid regisztráció iskolával + új osztállyal → 201
SID=$(psql_school_id_placeholder) # lásd Step 6: a seed 'Teszt Gimi' id-je
R1=$(curl -s -o /tmp/reg1.json -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d "{\"nickname\":\"Teszt Béla\",\"school_id\":$SID,\"new_class_name\":\"9.B\",\"consent_is_parent\":false}")
check "valid regisztráció 201" "201" "$R1"
grep -q '"player_id"' /tmp/reg1.json && check "player_id a válaszban" "ok" "ok" || check "player_id a válaszban" "ok" "missing"
grep -q '"secret"' /tmp/reg1.json && check "secret a válaszban" "ok" "ok" || check "secret a válaszban" "ok" "missing"

# 2. Egyéni játékos (iskola nélkül) → 201
R2=$(curl -s -o /tmp/reg2.json -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Solo Zsófi","consent_is_parent":false}')
check "egyéni regisztráció 201" "201" "$R2"

# 3. Tiltott becenév → 400 nickname_blocked
R3=$(curl -s -o /tmp/reg3.json -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"kurva jóska","consent_is_parent":false}')
check "tiltott becenév 400" "400" "$R3"
check "hiba=blocked" "nickname_blocked" "$(grep -o 'nickname_blocked' /tmp/reg3.json || echo hiányzik)"

# 4. Osztály iskola nélkül → 400 class_requires_school
R4=$(curl -s -o /tmp/reg4.json -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Osztály Ottó","new_class_name":"1.A","consent_is_parent":false}')
check "osztály iskola nélkül 400" "400" "$R4"

# 5. Rate limit: 6. regisztráció 1 percen belül → 429
for i in 1 2 3 4; do curl -s -o /dev/null -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d "{\"nickname\":\"Flood $i\",\"consent_is_parent\":false}"; done
R5=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/register" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Flood 5","consent_is_parent":false}')
check "rate limit 429" "429" "$R5"

echo "── $pass OK, $fail FAIL ──"; [ "$fail" = 0 ]
```

(Megjegyzés: a rate-limit teszt miatt ezt a scriptet a deploy UTÁN, egyszer futtassuk; a 429-es assert lokális isolate-állapotra támaszkodik.)

- [ ] **Step 2: Teszt futtatása deploy előtt — láthatóan bukik**

```bash
BASE=$(grep SUPABASE_URL js/config.js | cut -d"'" -f2)/functions/v1 bash supabase/tests/test_register.sh
```
Expected: minden curl `404`/`Failed to fetch` → FAIL-ek.

- [ ] **Step 3: `supabase/functions/register/index.ts`**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Tiltólista — kompakt, bővíthető (spec §5.1)
const BLOCKLIST = [
  'fasz', 'picsa', 'picsá', 'kurva', 'geci', 'bazmeg', 'bazdmeg', 'buzi',
  'ribanc', 'csicska', 'anyád', 'fosz', 'segg', 'fuck', 'shit', 'bitch',
  'cunt', 'nigga', 'nigger', 'whore',
];

const rate = new Map<string, { n: number; t: number }>();
function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const e = rate.get(key);
  if (!e || now - e.t > windowMs) { rate.set(key, { n: 1, t: now }); return true; }
  if (e.n >= max) return false;
  e.n++; return true;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
const SCHOOL_TYPES = ['altalanos', 'gimnazium', 'szakkozep', 'egyeb'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!rateLimit(`reg:${ip}`, 5, 60_000)) return json({ error: 'rate_limited' }, 429);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  // ── Becenév ──
  const nickname = norm(String(b.nickname ?? ''));
  if (nickname.length < 2 || nickname.length > 20) return json({ error: 'nickname_length' }, 400);
  if (!/^[\p{L}\p{N} ._-]+$/u.test(nickname)) return json({ error: 'nickname_chars' }, 400);
  const lower = nickname.toLowerCase();
  if (BLOCKLIST.some((w) => lower.includes(w))) return json({ error: 'nickname_blocked' }, 400);
  if (typeof b.consent_is_parent !== 'boolean') return json({ error: 'consent_required' }, 400);

  // ── Iskola feloldás (opcionális) ──
  let schoolId: number | null = (b.school_id as number) ?? null;
  if (schoolId && b.new_school) return json({ error: 'school_conflict' }, 400);
  if (!schoolId && b.new_school) {
    const ns = b.new_school as { name?: string; city?: string; type?: string };
    const name = norm(String(ns.name ?? ''));
    const city = norm(String(ns.city ?? ''));
    const type = String(ns.type ?? 'egyeb');
    if (name.length < 4 || city.length < 2) return json({ error: 'school_invalid' }, 400);
    if (!SCHOOL_TYPES.includes(type)) return json({ error: 'school_type' }, 400);
    const { data: ex } = await sb.from('schools').select('id')
      .ilike('name', name).ilike('city', city).limit(1);
    schoolId = ex?.[0]?.id ?? null;
    if (!schoolId) {
      const { data, error } = await sb.from('schools')
        .insert({ name, city, type, is_verified: false }).select('id').single();
      if (error) {
        const { data: retry } = await sb.from('schools').select('id')
          .ilike('name', name).ilike('city', city).limit(1);
        schoolId = retry?.[0]?.id ?? null;
        if (!schoolId) return json({ error: 'school_create_failed' }, 500);
      } else schoolId = data.id;
    }
  }

  // ── Osztály feloldás (opcionális, iskolához kötve) ──
  let classId: number | null = (b.class_id as number) ?? null;
  if ((classId || b.new_class_name) && !schoolId) return json({ error: 'class_requires_school' }, 400);
  if (classId && b.new_class_name) return json({ error: 'class_conflict' }, 400);
  if (!classId && b.new_class_name) {
    const cname = norm(String(b.new_class_name)).toUpperCase();
    if (cname.length < 1 || cname.length > 10) return json({ error: 'class_invalid' }, 400);
    const { data: ex } = await sb.from('classes').select('id')
      .eq('school_id', schoolId).ilike('name', cname).limit(1);
    classId = ex?.[0]?.id ?? null;
    if (!classId) {
      const { data, error } = await sb.from('classes')
        .insert({ school_id: schoolId, name: cname }).select('id').single();
      if (error) {
        const { data: retry } = await sb.from('classes').select('id')
          .eq('school_id', schoolId).ilike('name', cname).limit(1);
        classId = retry?.[0]?.id ?? null;
        if (!classId) return json({ error: 'class_create_failed' }, 500);
      } else classId = data.id;
    }
  }

  // ── Player ──
  const { data: player, error } = await sb.from('players').insert({
    nickname, school_id: schoolId, class_id: classId,
    consent_is_parent: b.consent_is_parent,
  }).select('id, secret').single();
  if (error) return json({ error: 'player_create_failed' }, 500);

  let school = null, klass = null;
  if (schoolId) {
    const { data } = await sb.from('schools').select('id, name').eq('id', schoolId).single();
    school = data;
  }
  if (classId) {
    const { data } = await sb.from('classes').select('id, name').eq('id', classId).single();
    klass = data;
  }
  return json({ player_id: player.id, secret: player.secret, nickname, school, class: klass }, 201);
});
```

- [ ] **Step 4: Deploy (EMBERI LÉPÉS)**

```bash
# egyszeri: brew install supabase/tap/supabase && supabase login
supabase link --project-ref PROJECT_REF
supabase functions deploy register
```

(Dashboard-alternatíva: Edge Functions → New function → `index.ts` tartalma beillesztve.)

- [ ] **Step 5: Seed school id lekérdezése a teszthez (SQL Editor)**

```sql
select id from schools where name = 'Teszt Gimi';
```

A `test_register.sh`-ban a `psql_school_id_placeholder` cseréje erre a számra.

- [ ] **Step 6: Curl-teszt futtatása — assertek átmennek**

```bash
BASE=$(grep SUPABASE_URL js/config.js | cut -d"'" -f2)/functions/v1 bash supabase/tests/test_register.sh
```
Expected: `── 8 OK, 0 FAIL ──`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/register/ supabase/tests/test_register.sh
git commit -m "⚡ register Edge Function: validáció, tiltólista, rate limit + curl-teszt"
```

---

### Task 4: `submit-score` Edge Function

**Files:**
- Create: `supabase/functions/submit-score/index.ts`
- Create: `supabase/tests/test_submit_score.sh`

**Interfaces:**
- Consumes: Task 1-2 táblák + `fn_player_stats`; Task 3 `register` (tesztjátékos létrehozása).
- Produces: `POST {EDGE_BASE}/submit-score` — input `{player_id, secret, score, distance_m?, duration_ms, counts_for_team?, client_run_id?}` → output `200 fn_player_stats-json` (+`{duplicate:true}` duplikátumnál); hibák: `missing_credentials(400) score_invalid(400) duration_invalid(422) score_implausible(422) forbidden(403) rate_limited(429)`.
- Plauzibilitás-konstansok (a `game.js` pontszabályaiból: ~60 pont/mp alap + szorzók): `MAX_SCORE_PER_SEC = 2000`, `BASE_ALLOWANCE = 5000`.

- [ ] **Step 1: Curl-teszt ELŐSZÖR**

`supabase/tests/test_submit_score.sh`:

```bash
#!/usr/bin/env bash
# Használat: BASE=... PID=<player_id> SECRET=<secret> ./test_submit_score.sh
set -u
BASE="${BASE:?}"; PID="${PID:?}"; SECRET="${SECRET:?}"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1));
  else echo "✘ $1 — várt:$2 kapott:$3"; fail=$((fail+1)); fi; }
post() { curl -s -o "$3" -w '%{http_code}' -X POST "$BASE/submit-score" \
  -H 'Content-Type: application/json' -d "$2"; }

RUN1=$(uuidgen | tr 'A-F' 'a-f')

# 1. Valid beküldés → 200 + rank_individual
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":12345,\"distance_m\":800,\"duration_ms\":120000,\"client_run_id\":\"$RUN1\"}" /tmp/s1.json)
check "valid beküldés 200" "200" "$C"
grep -q 'rank_individual' /tmp/s1.json && check "rank_individual a válaszban" "ok" "ok" || check "rank_individual a válaszban" "ok" "missing"

# 2. Idempotencia: ugyanaz a client_run_id → duplicate:true, NEM új sor
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":12345,\"distance_m\":800,\"duration_ms\":120000,\"client_run_id\":\"$RUN1\"}" /tmp/s2.json)
grep -q '"duplicate":true' /tmp/s2.json && check "duplikátum-felismerés" "ok" "ok" || check "duplikátum-felismerés" "ok" "missing"

# 3. Rossz secret → 403
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$(uuidgen)\",\"score\":1,\"duration_ms\":10000}" /tmp/s3.json)
check "rossz secret 403" "403" "$C"

# 4. Plauzibilitás: 9 999 999 pont 1 perc alatt → 422
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":9999999,\"duration_ms\":60000}" /tmp/s4.json)
check "hihetetlen pont 422" "422" "$C"

# 5. Túl rövid játékidő → 422
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":100,\"duration_ms\":500}" /tmp/s5.json)
check "túl rövid idő 422" "422" "$C"

# 6. Rate limit: azonnali újraküldés → 429 (az 1. lépés óta <10 mp telhetett el)
C=$(post x "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"score\":100,\"duration_ms\":10000,\"client_run_id\":\"$(uuidgen)\"}" /tmp/s6.json)
check "rate limit 429" "429" "$C"

echo "── $pass OK, $fail FAIL ──"; [ "$fail" = 0 ]
```

- [ ] **Step 2: Teszt futtatása deploy előtt — bukik** (mint Task 3 Step 2, 404-ek).

- [ ] **Step 3: `supabase/functions/submit-score/index.ts`**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Konzervatív plauzibilitás (game.js: ~60 p/mp alap + kombó/2× szorzók +500 bónuszok)
const MAX_SCORE_PER_SEC = 2000;
const BASE_ALLOWANCE = 5000;
const MIN_DURATION_MS = 3_000;
const MAX_DURATION_MS = 3_600_000; // 1 óra
const RATE_LIMIT_MS = 10_000;      // 1 beküldés / 10 mp / játékos (isolate-memória)

const lastSubmit = new Map<string, number>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const player_id = String(b.player_id ?? '');
  const secret = String(b.secret ?? '');
  if (!player_id || !secret) return json({ error: 'missing_credentials' }, 400);

  const score = Math.floor(Number(b.score));
  const distance = Math.max(0, Math.floor(Number(b.distance_m ?? 0)));
  const duration = Math.floor(Number(b.duration_ms ?? 0));
  if (!Number.isFinite(score) || score < 0) return json({ error: 'score_invalid' }, 400);
  if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
    return json({ error: 'duration_invalid' }, 422);
  }
  if (score > MAX_SCORE_PER_SEC * (duration / 1000) + BASE_ALLOWANCE) {
    return json({ error: 'score_implausible' }, 422);
  }

  const now = Date.now();
  if (now - (lastSubmit.get(player_id) ?? 0) < RATE_LIMIT_MS) {
    return json({ error: 'rate_limited' }, 429);
  }

  const { data: player } = await sb.from('players').select('id')
    .eq('id', player_id).eq('secret', secret).limit(1);
  if (!player?.length) return json({ error: 'forbidden' }, 403);

  const runId = typeof b.client_run_id === 'string' ? b.client_run_id : null;
  if (runId) {
    const { data: dup } = await sb.from('scores').select('id')
      .eq('client_run_id', runId).limit(1);
    if (dup?.length) {
      const { data: stats } = await sb.rpc('fn_player_stats', { p_player_id: player_id });
      return json({ duplicate: true, ...stats });
    }
  }

  const { error } = await sb.from('scores').insert({
    player_id, score, distance_m: distance, duration_ms: duration,
    counts_for_team: b.counts_for_team !== false,
    client_run_id: runId,
  });
  if (error) {
    if (error.code === '23505') { // unique race → duplikátum
      const { data: stats } = await sb.rpc('fn_player_stats', { p_player_id: player_id });
      return json({ duplicate: true, ...stats });
    }
    return json({ error: 'insert_failed' }, 500);
  }
  lastSubmit.set(player_id, now);

  const { data: stats } = await sb.rpc('fn_player_stats', { p_player_id: player_id });
  return json(stats);
});
```

- [ ] **Step 4: Deploy (EMBERI LÉPÉS)**

```bash
supabase functions deploy submit-score
```

- [ ] **Step 5: Tesztjátékos létrehozása + teszt futtatása**

```bash
BASE=$(grep SUPABASE_URL js/config.js | cut -d"'" -f2)/functions/v1
# register-hívással új játékos (a Task 3 rate limitje miatt várjunk 1 percet, ha kell):
RESP=$(curl -s -X POST "$BASE/register" -H 'Content-Type: application/json' \
  -d '{"nickname":"Score Teszt","consent_is_parent":false}')
PID=$(echo "$RESP" | grep -o '"player_id":"[^"]*"' | cut -d'"' -f4)
SECRET=$(echo "$RESP" | grep -o '"secret":"[^"]*"' | cut -d'"' -f4)
BASE="$BASE" PID="$PID" SECRET="$SECRET" bash supabase/tests/test_submit_score.sh
```
Expected: `── 6 OK, 0 FAIL ──` (a 6. lépésnél `uuidgen` hiányában: `brew install util-linux`? nem — macOS-ben beépített az `uuidgen`).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/submit-score/ supabase/tests/test_submit_score.sh
git commit -m "⚡ submit-score Edge Function: plauzibilitás, rate limit, idempotencia"
```

---

### Task 5: `update-affiliation` + `delete-my-data` Edge Functions

**Files:**
- Create: `supabase/functions/update-affiliation/index.ts`
- Create: `supabase/functions/delete-my-data/index.ts`
- Create: `supabase/tests/test_affiliation_delete.sh`

**Interfaces:**
- Produces: `POST {EDGE_BASE}/update-affiliation` — input `{player_id, secret, school_id?|new_school?|null, class_id?|new_class_name?|null}` → `{school:{id,name}|null, class:{id,name}|null}`; `POST {EDGE_BASE}/delete-my-data` — input `{player_id, secret}` → `{deleted:true}`; mindkettőnél `forbidden(403)` rossz secretre.

- [ ] **Step 1: Curl-teszt ELŐSZÖR**

`supabase/tests/test_affiliation_delete.sh`:

```bash
#!/usr/bin/env bash
# Használat: BASE=... SID=<Teszt Gimi id> ./test_affiliation_delete.sh
set -u
BASE="${BASE:?}"; SID="${SID:?}"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "✔ $1"; pass=$((pass+1));
  else echo "✘ $1 — várt:$2 kapott:$3"; fail=$((fail+1)); fi; }

# Játékos létrehozása (egyéni)
RESP=$(curl -s -X POST "$BASE/register" -H 'Content-Type: application/json' \
  -d '{"nickname":"Váltó Viki","consent_is_parent":false}')
PID=$(echo "$RESP" | grep -o '"player_id":"[^"]*"' | cut -d'"' -f4)
SECRET=$(echo "$RESP" | grep -o '"secret":"[^"]*"' | cut -d'"' -f4)

# 1. Csatlakozás iskolához + új osztály → 200, school nem null
C=$(curl -s -o /tmp/a1.json -w '%{http_code}' -X POST "$BASE/update-affiliation" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\",\"school_id\":$SID,\"new_class_name\":\"10.C\"}")
check "csatlakozás 200" "200" "$C"
grep -q '"10.C"' /tmp/a1.json && check "osztály a válaszban" "ok" "ok" || check "osztály a válaszban" "ok" "missing"

# 2. Rossz secret → 403
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/update-affiliation" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$(uuidgen)\",\"school_id\":$SID}")
check "rossz secret 403" "403" "$C"

# 3. Törlés rossz secrettel → 403
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/delete-my-data" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$(uuidgen)\"}")
check "törlés rossz secret 403" "403" "$C"

# 4. Törlés jó secrettel → 200 deleted:true
C=$(curl -s -o /tmp/a4.json -w '%{http_code}' -X POST "$BASE/delete-my-data" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\"}")
check "törlés 200" "200" "$C"
grep -q '"deleted":true' /tmp/a4.json && check "deleted:true" "ok" "ok" || check "deleted:true" "ok" "missing"

# 5. Törölt játékos újabb törlése → 403 (már nem létezik)
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/delete-my-data" \
  -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$PID\",\"secret\":\"$SECRET\"}")
check "törölt játékos 403" "403" "$C"

echo "── $pass OK, $fail FAIL ──"; [ "$fail" = 0 ]
```

- [ ] **Step 2: `supabase/functions/update-affiliation/index.ts`**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
const SCHOOL_TYPES = ['altalanos', 'gimnazium', 'szakkozep', 'egyeb'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const player_id = String(b.player_id ?? '');
  const secret = String(b.secret ?? '');
  if (!player_id || !secret) return json({ error: 'missing_credentials' }, 400);

  const { data: player } = await sb.from('players').select('id')
    .eq('id', player_id).eq('secret', secret).limit(1);
  if (!player?.length) return json({ error: 'forbidden' }, 403);

  // school: number | null (megadva) | undefined (nincs mező → ne változzon)
  let schoolId: number | null | undefined = undefined;
  if ('school_id' in b || 'new_school' in b) {
    if (b.school_id && b.new_school) return json({ error: 'school_conflict' }, 400);
    schoolId = (b.school_id as number) ?? null;
    if (!schoolId && b.new_school) {
      const ns = b.new_school as { name?: string; city?: string; type?: string };
      const name = norm(String(ns.name ?? ''));
      const city = norm(String(ns.city ?? ''));
      const type = String(ns.type ?? 'egyeb');
      if (name.length < 4 || city.length < 2) return json({ error: 'school_invalid' }, 400);
      if (!SCHOOL_TYPES.includes(type)) return json({ error: 'school_type' }, 400);
      const { data: ex } = await sb.from('schools').select('id')
        .ilike('name', name).ilike('city', city).limit(1);
      schoolId = ex?.[0]?.id ?? null;
      if (!schoolId) {
        const { data, error } = await sb.from('schools')
          .insert({ name, city, type, is_verified: false }).select('id').single();
        if (error) return json({ error: 'school_create_failed' }, 500);
        schoolId = data.id;
      }
    }
  }

  let classId: number | null | undefined = undefined;
  if ('class_id' in b || 'new_class_name' in b) {
    if (b.class_id && b.new_class_name) return json({ error: 'class_conflict' }, 400);
    classId = (b.class_id as number) ?? null;
    if (!classId && b.new_class_name) {
      const effectiveSchool = schoolId !== undefined ? schoolId : undefined;
      if (effectiveSchool === null || effectiveSchool === undefined) {
        // ha a school nem változik, a meglévő school_id kell
        const { data: cur } = await sb.from('players').select('school_id').eq('id', player_id).single();
        if (!cur?.school_id) return json({ error: 'class_requires_school' }, 400);
      }
      const cname = norm(String(b.new_class_name)).toUpperCase();
      if (cname.length < 1 || cname.length > 10) return json({ error: 'class_invalid' }, 400);
      const sid = effectiveSchool ?? (await sb.from('players').select('school_id').eq('id', player_id).single()).data!.school_id;
      const { data: ex } = await sb.from('classes').select('id')
        .eq('school_id', sid).ilike('name', cname).limit(1);
      classId = ex?.[0]?.id ?? null;
      if (!classId) {
        const { data, error } = await sb.from('classes')
          .insert({ school_id: sid, name: cname }).select('id').single();
        if (error) return json({ error: 'class_create_failed' }, 500);
        classId = data.id;
      }
    }
  }

  // szabály: school null esetén a class is null
  const update: Record<string, unknown> = {};
  if (schoolId !== undefined) update.school_id = schoolId;
  if (classId !== undefined) update.class_id = classId;
  if (schoolId === null && classId === undefined) update.class_id = null;
  if (schoolId !== undefined && schoolId !== null && classId === undefined) update.class_id = null; // iskolaváltás → osztály reset

  if (Object.keys(update).length) {
    const { error } = await sb.from('players').update(update).eq('id', player_id);
    if (error) return json({ error: 'update_failed' }, 500);
  }

  const { data: cur } = await sb.from('players')
    .select('school_id, class_id').eq('id', player_id).single();
  let school = null, klass = null;
  if (cur?.school_id) {
    const { data } = await sb.from('schools').select('id, name').eq('id', cur.school_id).single();
    school = data;
  }
  if (cur?.class_id) {
    const { data } = await sb.from('classes').select('id, name').eq('id', cur.class_id).single();
    klass = data;
  }
  return json({ school, class: klass });
});
```

- [ ] **Step 3: `supabase/functions/delete-my-data/index.ts`**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const player_id = String(b.player_id ?? '');
  const secret = String(b.secret ?? '');
  if (!player_id || !secret) return json({ error: 'missing_credentials' }, 400);

  const { data: player } = await sb.from('players').select('id')
    .eq('id', player_id).eq('secret', secret).limit(1);
  if (!player?.length) return json({ error: 'forbidden' }, 403);

  // scores cascade-dzsel törlődik a player-rel
  const { error } = await sb.from('players').delete().eq('id', player_id);
  if (error) return json({ error: 'delete_failed' }, 500);
  return json({ deleted: true });
});
```

- [ ] **Step 4: Deploy + teszt (EMBERI LÉPÉS deploy)**

```bash
supabase functions deploy update-affiliation
supabase functions deploy delete-my-data
SID=<Teszt Gimi id> BASE=$(grep SUPABASE_URL js/config.js | cut -d"'" -f2)/functions/v1 \
  bash supabase/tests/test_affiliation_delete.sh
```
Expected: `── 6 OK, 0 FAIL ──`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/update-affiliation/ supabase/functions/delete-my-data/ supabase/tests/test_affiliation_delete.sh
git commit -m "⚡ update-affiliation + delete-my-data Edge Functions"
```

---

### Task 6: Frontend alapok — `api.js` + `player-store.js`

**Files:**
- Create: `js/api.js`
- Create: `js/player-store.js`

**Interfaces:**
- Consumes: `CONFIG` (Task 1); Edge Function-kontraktok (Task 3-5); `fn_player_stats` rpc (Task 2).
- Produces (Task 7-9 fogyasztja):
  - `api.searchSchools(q) → Promise<Array<{id,name,city,type}>>`
  - `api.getClasses(schoolId) → Promise<Array<{id,name}>>`
  - `api.register(payload) / api.submitScore(payload) / api.updateAffiliation(payload) / api.deleteMyData(payload)` → a Task 3-5 kontraktok szerinti válaszok; hiba esetén `Error` `e.code` = szerver-hibakód, `e.status` = HTTP-kód
  - `api.fetchIndividual() / api.fetchSchools() / api.fetchClasses(schoolId)` → view-sorok tömbje
  - `api.getStats(playerId) → fn_player_stats-json`
  - `playerStore.load()/save(player)/clear()` — player = `{player_id, secret, nickname, school, class}`
  - `playerStore.outboxAdd(entry)/outboxList()/outboxRemove(client_run_id)`
  - `playerStore.getBest()/setBest(score)`
  - `playerStore.cacheLb(tab, data)/readLbCache(tab) → {at, data}|null`

- [ ] **Step 1: `js/api.js`**

```js
// ============================================
// Snacky Dash B2S — API-réteg (spec §6.2)
// Minden szerverhívás egy helyen. Olvasás: PostgREST
// view-k + rpc; írás: Edge Functions. Nincs SDK.
// ============================================

import { CONFIG } from './config.js';

const REST = `${CONFIG.SUPABASE_URL}/rest/v1`;
const REST_HEADERS = {
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
};

async function restGet(path) {
    const r = await fetch(`${REST}/${path}`, { headers: REST_HEADERS });
    if (!r.ok) throw Object.assign(new Error(`rest_${r.status}`), { status: r.status });
    return r.json();
}

async function restRpc(fn, body) {
    const r = await fetch(`${REST}/rpc/${fn}`, {
        method: 'POST',
        headers: { ...REST_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw Object.assign(new Error(`rpc_${r.status}`), { status: r.status });
    return r.json();
}

async function edge(fn, body) {
    let r;
    try {
        r = await fetch(`${CONFIG.EDGE_BASE}/${fn}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        throw Object.assign(new Error('network'), { code: 'network' });
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw Object.assign(new Error(data.error ?? `edge_${r.status}`),
            { code: data.error, status: r.status });
    }
    return data;
}

const enc = encodeURIComponent;

export const api = {
    // ── Olvasás (view-k/rpc) ──
    searchSchools: (q) =>
        restGet(`schools?select=id,name,city,type&or=(name.ilike.*${enc(q)}*,city.ilike.*${enc(q)}*)&order=name&limit=10`),
    getClasses: (schoolId) =>
        restGet(`classes?select=id,name&school_id=eq.${schoolId}&order=name&limit=50`),
    fetchIndividual: () =>
        restGet('leaderboard_individual?select=player_id,nickname,school_name,class_name,best_score&limit=100'),
    fetchSchools: () =>
        restGet('leaderboard_schools?select=school_id,name,city,avg_score,player_count&limit=100'),
    fetchClasses: (schoolId) =>
        restGet(`leaderboard_classes?select=class_id,name,total_score,player_count&school_id=eq.${schoolId}&limit=100`),
    getStats: (playerId) =>
        restRpc('fn_player_stats', { p_player_id: playerId }),

    // ── Írás (Edge Functions) ──
    register: (payload) => edge('register', payload),
    submitScore: (payload) => edge('submit-score', payload),
    updateAffiliation: (payload) => edge('update-affiliation', payload),
    deleteMyData: (payload) => edge('delete-my-data', payload),
};
```

- [ ] **Step 2: `js/player-store.js`**

```js
// ============================================
// Snacky Dash B2S — helyi játékos-tároló (spec §6.3)
// localStorage: profil, outbox (nem küldött pontok),
// személyes legjobb, ranglista-cache.
// ============================================

const KEY = 'snacky_player';
const OUTBOX = 'snacky_outbox';
const BEST = 'snacky_personal_best';
const LB_CACHE = 'snacky_lb_cache';

function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
}

export const playerStore = {
    // ── Profil ──
    load: () => readJson(KEY, null),
    save: (player) => localStorage.setItem(KEY, JSON.stringify(player)),
    clear: () => localStorage.removeItem(KEY),

    // ── Outbox (offline pontmentés) ──
    outboxList: () => readJson(OUTBOX, []),
    outboxAdd(entry) {
        const list = playerStore.outboxList();
        list.push(entry);
        localStorage.setItem(OUTBOX, JSON.stringify(list));
    },
    outboxRemove(clientRunId) {
        localStorage.setItem(OUTBOX,
            JSON.stringify(playerStore.outboxList().filter((e) => e.client_run_id !== clientRunId)));
    },

    // ── Személyes legjobb (menü „Legjobb" sor) ──
    getBest: () => Number(localStorage.getItem(BEST) ?? 0),
    setBest(score) {
        if (score > playerStore.getBest()) localStorage.setItem(BEST, String(score));
    },

    // ── Ranglista-cache (offline fallback) ──
    cacheLb(tab, data) {
        const cache = readJson(LB_CACHE, {});
        cache[tab] = { at: Date.now(), data };
        try { localStorage.setItem(LB_CACHE, JSON.stringify(cache)); } catch { /* túlcsordulás: nem kritikus */ }
    },
    readLbCache: (tab) => readJson(LB_CACHE, {})[tab] ?? null,
};
```

- [ ] **Step 3: Böngészős smoke-verifikáció**

```bash
cd /Users/balazslederer/Desktop/Dev/snackydash/psgameb2s && python3 -m http.server 8080 &
```

Böngésző DevTools konzol (http://localhost:8080):

```js
const { api } = await import('./js/api.js');
await api.searchSchools('Teszt');        // Expected: [{id:…, name:'Teszt Gimi', …}]
await api.fetchSchools();                // Expected: [{name:'Teszt Gimi', avg_score:10800, player_count:5}]
await api.getStats((await api.searchSchools('Teszt'))[0].id); // nem player → not_found json
```

Playwright MCP-vel is ellenőrizhető (`browser_evaluate` a fenti kóddal).

- [ ] **Step 4: Commit**

```bash
git add js/api.js js/player-store.js
git commit -m "🔌 B2S frontend: api.js fetch-wrapper + player-store.js"
```

---

### Task 7: Regisztrációs UI (game over forma + iskolakereső)

**Files:**
- Modify: `index.html:64-121` (gameover-screen átalakítás) + `index.html:25-62` (menü kiegészítés)
- Create: `js/registration.js`
- Modify: `css/style.css` (hozzáfűzés a végéhez)

**Interfaces:**
- Consumes: `api.*`, `playerStore.*` (Task 6).
- Produces: `initRegistration({ mode, prefill, onRegistered, onSkip })` — `mode: 'register'|'edit'`; `onRegistered(player)` a register/updateAffiliation sikerével hívódik. DOM-szerződés (Task 8 használja): `#reg-overlay`, `#reg-nickname`, `#reg-school-input`, `#reg-school-results`, `#reg-school-new*`, `#reg-class-row`, `#reg-class-select`, `#reg-class-new-input`, `input[name="reg-age"]`, `#reg-consent`, `#reg-submit`, `#reg-skip`, `#reg-error`.

- [ ] **Step 1: `index.html` — gameover-screen átalakítása**

A régi `.leaderboard-form` blokk (email-input + submit-score-btn, `index.html:96-109`) helyére:

```html
                <!-- ═══ B2S: mentési eredmény / regisztráció ═══ -->
                <div id="save-result" class="save-result hidden"></div>

                <!-- Visszatérő játékos: csapat-opt-in -->
                <label id="team-opt-row" class="checkbox-row hidden">
                    <input type="checkbox" id="team-opt" checked>
                    <span id="team-opt-label">Ez a pont számítson a csapatomnak</span>
                </label>

                <!-- Új játékos: regisztrációs űrlap -->
                <div id="reg-overlay" class="reg-form hidden">
                    <p class="form-label">Mentsd el a pontod és nyerj!</p>
                    <input type="text" id="reg-nickname" placeholder="Becenév (nem valódi neved!)"
                           maxlength="20" autocomplete="off">
                    <p class="form-hint">Ha megadod az iskoládat (és az osztályodat), a pontjaid
                        az ő versenyükbe is számítanak. Nem vagy diák? Hagyd üresen —
                        egyénileg is részt veszel a sorsoláson.</p>
                    <div class="autocomplete">
                        <input type="text" id="reg-school-input" placeholder="Iskola keresése (nem kötelező)"
                               autocomplete="off">
                        <div id="reg-school-results" class="autocomplete-results hidden"></div>
                    </div>
                    <div id="reg-school-new" class="school-new hidden">
                        <input type="text" id="reg-school-new-name" placeholder="Iskola neve" maxlength="120">
                        <input type="text" id="reg-school-new-city" placeholder="Település" maxlength="60">
                        <select id="reg-school-new-type">
                            <option value="altalanos">Általános iskola</option>
                            <option value="gimnazium">Gimnázium</option>
                            <option value="szakkozep">Szakközépiskola / technikum</option>
                            <option value="egyeb" selected>Egyéb</option>
                        </select>
                    </div>
                    <div id="reg-class-row" class="hidden">
                        <select id="reg-class-select">
                            <option value="">Osztály (nem kötelező)…</option>
                        </select>
                        <input type="text" id="reg-class-new-input" class="hidden"
                               placeholder="Új osztály (pl. 10.A)" maxlength="10">
                    </div>
                    <div class="age-row">
                        <label class="radio-row">
                            <input type="radio" name="reg-age" value="adult">
                            <span>16 éves vagy idősebb vagyok</span>
                        </label>
                        <label class="radio-row">
                            <input type="radio" name="reg-age" value="parent">
                            <span>16 év alatti vagyok, a szülőm hozzájárult</span>
                        </label>
                    </div>
                    <label class="checkbox-row">
                        <input type="checkbox" id="reg-consent">
                        <span>Elolvastam és elfogadom az
                            <a href="privacy.html" target="_blank">adatkezelési tájékoztatót</a></span>
                    </label>
                    <p id="reg-error" class="form-error hidden"></p>
                    <div class="input-group">
                        <button id="reg-submit" class="btn btn-submit">Pont mentése</button>
                        <button id="reg-skip" class="btn btn-ghost">Kihagyom</button>
                    </div>
                </div>

                <div class="leaderboard-section">
                    <h3 class="lb-title">🏆 Ranglista</h3>
                    <div class="lb-tabs">
                        <button class="lb-tab active" data-tab="individual">🧑 Egyéni</button>
                        <button class="lb-tab" data-tab="schools">🏫 Iskolák</button>
                        <button class="lb-tab" data-tab="classes">👥 Osztályok</button>
                    </div>
                    <p id="lb-note" class="lb-note"></p>
                    <div id="leaderboard-list"></div>
                </div>
```

A menü képernyőn (`#high-score` sor után) új elemek:

```html
                <div id="player-badge" class="player-badge hidden"></div>
                <button id="leaderboard-btn" class="btn btn-ghost">🏆 Ranglisták</button>
```

És a `</body>` előtt a ranglista-overlay (menüből nyílik):

```html
        <div id="lb-overlay" class="screen overlay hidden">
            <div class="screen-content">
                <h2 class="lb-title">🏆 Ranglisták</h2>
                <div class="lb-tabs">
                    <button class="lb-tab active" data-tab="individual">🧑 Egyéni</button>
                    <button class="lb-tab" data-tab="schools">🏫 Iskolák</button>
                    <button class="lb-tab" data-tab="classes">👥 Osztályok</button>
                </div>
                <p class="lb-note">A nyereményt a résztvevők között sorsoljuk ki a kampány végén.</p>
                <div id="lb-overlay-list"></div>
                <button id="lb-overlay-close" class="btn btn-primary">Vissza</button>
            </div>
        </div>
```

- [ ] **Step 2: `js/registration.js`**

```js
// ============================================
// Snacky Dash B2S — regisztrációs űrlap (spec §6.4)
// Game over képernyőn jelenik meg új játékosnak;
// 'edit' módban profil-módosítás (update-affiliation).
// ============================================

import { api } from './api.js';
import { playerStore } from './player-store.js';

const ERROR_TEXT = {
    nickname_length: 'A becenév legyen 2–20 karakter.',
    nickname_chars: 'Csak betű, szám, szóköz, pont, kötőjel és alulvonás.',
    nickname_blocked: 'Ez a becenév nem használható, válassz másikat.',
    school_invalid: 'Add meg az iskola nevét és a települést.',
    class_requires_school: 'Osztály csak iskolával együtt adható meg.',
    rate_limited: 'Túl sok próbálkozás, várj egy percet.',
    network: 'Nincs kapcsolat a szerverrel. Próbáld újra!',
};

export function initRegistration({ mode = 'register', prefill = null, onRegistered, onSkip }) {
    const $ = (id) => document.getElementById(id);
    const overlay = $('reg-overlay');
    const nickInput = $('reg-nickname');
    const schoolInput = $('reg-school-input');
    const results = $('reg-school-results');
    const newSchoolBox = $('reg-school-new');
    const classRow = $('reg-class-row');
    const classSelect = $('reg-class-select');
    const classNewInput = $('reg-class-new-input');
    const consent = $('reg-consent');
    const errorEl = $('reg-error');
    const submitBtn = $('reg-submit');
    const skipBtn = $('reg-skip');

    let selectedSchool = null; // {id} | {isNew:true}
    let debounceTimer = null;
    // edit módban CSAK a piszkált (módosított) mezők mennek a payloadba —
    // különben az update-affiliation „iskolaváltás → osztály reset" szabálya
    // törölné a meglévő osztályt egy üres mentésnél is
    let schoolDirty = mode === 'register';
    let classDirty = mode === 'register';

    // edit mód: prefill + consent/age elrejtése (már adott), update-affiliation hívás
    if (mode === 'edit' && prefill) {
        nickInput.value = prefill.nickname ?? '';
        nickInput.disabled = true; // becenév most nem módosítható (YAGNI)
        if (prefill.school) {
            schoolInput.value = prefill.school.name;
            selectedSchool = { id: prefill.school.id };
            classRow.classList.remove('hidden');
            loadClasses(prefill.school.id).then(() => {
                if (prefill.class) classSelect.value = String(prefill.class.id);
            });
        }
        document.querySelector('.age-row').style.display = 'none';
        consent.closest('.checkbox-row').style.display = 'none';
        submitBtn.textContent = 'Mentés';
    }

    function showError(code) {
        errorEl.textContent = ERROR_TEXT[code] ?? 'Valami nem sikerült. Próbáld újra!';
        errorEl.classList.remove('hidden');
    }

    // ── Iskolakereső ──
    schoolInput.addEventListener('input', () => {
        selectedSchool = null;
        schoolDirty = true;
        clearTimeout(debounceTimer);
        const q = schoolInput.value.trim();
        if (q.length < 2) { results.classList.add('hidden'); return; }
        debounceTimer = setTimeout(async () => {
            let hits = [];
            try { hits = await api.searchSchools(q); } catch { /* offline: lista üres */ }
            results.innerHTML = '';
            hits.forEach((s) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'autocomplete-item';
                item.textContent = `${s.name} — ${s.city}`;
                item.addEventListener('click', () => pickSchool(s));
                results.appendChild(item);
            });
            const addNew = document.createElement('button');
            addNew.type = 'button';
            addNew.className = 'autocomplete-item autocomplete-add';
            addNew.textContent = '➕ Nem találom — felveszem';
            addNew.addEventListener('click', () => {
                results.classList.add('hidden');
                newSchoolBox.classList.remove('hidden');
                selectedSchool = { isNew: true };
                schoolDirty = true;
                classRow.classList.remove('hidden');
            });
            results.appendChild(addNew);
            results.classList.remove('hidden');
        }, 300);
    });

    function pickSchool(s) {
        selectedSchool = { id: s.id };
        schoolDirty = true;
        schoolInput.value = `${s.name} — ${s.city}`;
        results.classList.add('hidden');
        newSchoolBox.classList.add('hidden');
        classRow.classList.remove('hidden');
        loadClasses(s.id);
    }

    async function loadClasses(schoolId) {
        classSelect.innerHTML = '<option value="">Osztály (nem kötelező)…</option>';
        try {
            const classes = await api.getClasses(schoolId);
            classes.forEach((c) => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = c.name;
                classSelect.appendChild(opt);
            });
        } catch { /* offline: csak új osztály adható */ }
        const optNew = document.createElement('option');
        optNew.value = '__new'; optNew.textContent = '➕ Új osztály…';
        classSelect.appendChild(optNew);
    }

    classSelect.addEventListener('change', () => {
        classDirty = true;
        classNewInput.classList.toggle('hidden', classSelect.value !== '__new');
    });

    // ── Payload-építés ──
    function buildPayload() {
        const p = {};
        if (mode === 'register') {
            p.nickname = nickInput.value.trim();
            const age = document.querySelector('input[name="reg-age"]:checked');
            p.consent_is_parent = age?.value === 'parent';
        }
        if (mode === 'register' || schoolDirty) {
            if (selectedSchool?.id) p.school_id = selectedSchool.id;
            else if (selectedSchool?.isNew) {
                p.new_school = {
                    name: $('reg-school-new-name').value,
                    city: $('reg-school-new-city').value,
                    type: $('reg-school-new-type').value,
                };
            }
        }
        if (mode === 'register' || classDirty) {
            if (classSelect.value && classSelect.value !== '__new') p.class_id = Number(classSelect.value);
            else if (classSelect.value === '__new' && classNewInput.value.trim()) {
                p.new_class_name = classNewInput.value.trim();
            }
        }
        return p;
    }

    function valid() {
        if (mode === 'register') {
            if (nickInput.value.trim().length < 2) return 'nickname_length';
            if (!document.querySelector('input[name="reg-age"]:checked')) return 'age_required';
            if (!consent.checked) return 'consent_required';
        }
        if (selectedSchool?.isNew) {
            if ($('reg-school-new-name').value.trim().length < 4) return 'school_invalid';
            if ($('reg-school-new-city').value.trim().length < 2) return 'school_invalid';
        }
        return null;
    }

    submitBtn.addEventListener('click', async () => {
        errorEl.classList.add('hidden');
        const err = valid();
        if (err) {
            errorEl.textContent = err === 'age_required' ? 'Válaszd ki a korcsoportot!'
                : err === 'consent_required' ? 'A tájékoztató elfogadása kötelező.'
                : ERROR_TEXT[err];
            errorEl.classList.remove('hidden');
            return;
        }
        submitBtn.disabled = true;
        try {
            let player;
            if (mode === 'register') {
                player = await api.register(buildPayload());
            } else {
                const cur = playerStore.load();
                const res = await api.updateAffiliation({
                    player_id: cur.player_id, secret: cur.secret, ...buildPayload(),
                });
                player = { ...cur, school: res.school, class: res.class };
            }
            playerStore.save(player);
            overlay.classList.add('hidden');
            onRegistered(player);
        } catch (e) {
            showError(e.code);
            submitBtn.disabled = false;
        }
    });

    skipBtn?.addEventListener('click', () => {
        overlay.classList.add('hidden');
        onSkip?.();
    });

    overlay.classList.remove('hidden');
    setTimeout(() => nickInput.focus(), 150);
}
```

- [ ] **Step 3: `css/style.css` végéhez fűzve**

```css
/* ═══════════════ B2S — regisztráció + ranglista ═══════════════ */
.reg-form { margin: 16px 0; text-align: left; }
.reg-form input[type="text"], .reg-form select {
    width: 100%; padding: 10px 14px; margin: 6px 0;
    border: 2px solid rgba(255,255,255,.15); border-radius: 10px;
    background: rgba(255,255,255,.06); color: #fff; font-family: inherit; font-size: 15px;
}
.reg-form input:focus { outline: none; border-color: #ffd23f; }
.form-hint { font-size: 12px; opacity: .7; margin: 6px 0 10px; line-height: 1.4; }
.form-error { color: #ff6b6b; font-size: 13px; margin: 8px 0; }
.autocomplete { position: relative; }
.autocomplete-results {
    position: absolute; z-index: 30; left: 0; right: 0; max-height: 200px; overflow-y: auto;
    background: #1a1a3a; border: 2px solid rgba(255,255,255,.15); border-radius: 10px;
}
.autocomplete-item {
    display: block; width: 100%; padding: 10px 14px; text-align: left;
    background: none; border: none; color: #fff; font-size: 14px; cursor: pointer;
}
.autocomplete-item:hover, .autocomplete-item:focus { background: rgba(255,210,63,.15); }
.autocomplete-add { color: #ffd23f; }
.school-new { padding: 8px; border: 1px dashed rgba(255,210,63,.4); border-radius: 10px; margin: 6px 0; }
.age-row { margin: 10px 0; }
.radio-row, .checkbox-row {
    display: flex; align-items: flex-start; gap: 10px;
    margin: 8px 0; font-size: 14px; cursor: pointer;
}
.radio-row input, .checkbox-row input { margin-top: 3px; accent-color: #ffd23f; }
.checkbox-row a { color: #ffd23f; }
.btn-ghost {
    background: transparent; border: 2px solid rgba(255,255,255,.25);
    color: #fff; padding: 10px 18px; border-radius: 12px; cursor: pointer;
    font-family: inherit; font-size: 14px;
}
.btn-ghost:hover { border-color: #ffd23f; }
.save-result { margin: 12px 0; font-size: 15px; line-height: 1.6; }
.save-result .sr-good { color: #7bed9f; }
.save-result .sr-warn { color: #ffd23f; }
.player-badge { font-size: 14px; opacity: .9; margin: 8px 0; }
.player-badge a { color: #ffd23f; cursor: pointer; margin-left: 8px; font-size: 12px; }
.lb-tabs { display: flex; gap: 6px; justify-content: center; margin: 8px 0; }
.lb-tab {
    background: rgba(255,255,255,.06); border: 2px solid transparent; color: #fff;
    padding: 8px 14px; border-radius: 10px; cursor: pointer; font-family: inherit; font-size: 13px;
}
.lb-tab.active { border-color: #ffd23f; background: rgba(255,210,63,.12); }
.lb-note { font-size: 12px; opacity: .7; margin: 4px 0 8px; }
.lb-own td { color: #ffd23f; font-weight: 700; }
.lb-cache-note { font-size: 11px; opacity: .6; }
```

- [ ] **Step 4: GUI-verifikáció (Playwright MCP)**

```bash
cd /Users/balazslederer/Desktop/Dev/snackydash/psgameb2s && python3 -m http.server 8080
```

Playwright MCP-vel: `browser_navigate` → `http://localhost:8080` → `browser_snapshot` (START látszik) → játék indítása, game over kivárása (vagy konzolból: `__snacky.game.onGameOver(1234, {distance:500, maxCombo:2, nearMisses:0, bosses:0})` a `browser_evaluate`-tel) → a `#reg-overlay` látható, a mezők kitölthetők, az iskolakereső „Teszt"-re találatot ad. (A teljes beküldés-flow-t a Task 8 verifikálja, amikor `main.js` már hívja a modult — itt csak a markup/stílus a lényeg.)

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css js/registration.js
git commit -m "📝 B2S regisztrációs UI: iskolakereső, osztályválasztó, GDPR consent"
```

---

### Task 8: Ranglista-átírás + `main.js` integráció (flow, outbox, menü)

**Files:**
- Create: `js/leaderboard.js` (teljes csere)
- Modify: `js/main.js` (importok, game over flow, menü, outbox)

**Interfaces:**
- Consumes: `api.*`, `playerStore.*` (Task 6), `initRegistration` (Task 7), DOM-szerződés (Task 7).
- Produces: `class LeaderboardUI { constructor(listEl, noteEl); show(tab, {classSchoolId}?) }`; `window.__snacky` debug-handle bővül: `{ game, world, playerStore, api }` (GUI-tesztekhez).

- [ ] **Step 1: `js/leaderboard.js` teljes cseréje**

```js
// ============================================
// Snacky Dash B2S — Ranglista UI (spec §6.5)
// 3 tab: Egyéni (sorsolás!) | Iskolák (átlag) |
// Osztályok (összeg, iskolán belül).
// Szerverről + localStorage cache-fallback.
// ============================================

import { api } from './api.js';
import { playerStore } from './player-store.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const fmt = (n) => Number(n).toLocaleString('hu-HU');

export class LeaderboardUI {
    constructor(listEl, noteEl) {
        this.listEl = listEl;
        this.noteEl = noteEl;
        this.tab = 'individual';
        this.classSchoolId = playerStore.load()?.school?.id ?? null;
    }

    async show(tab = this.tab, { classSchoolId } = {}) {
        this.tab = tab;
        if (classSchoolId !== undefined) this.classSchoolId = classSchoolId;
        const cached = playerStore.readLbCache(this.tab);
        try {
            const data = await this._fetch();
            playerStore.cacheLb(this.tab, data);
            this._render(data, null);
        } catch {
            if (cached) {
                const when = new Date(cached.at).toLocaleString('hu-HU');
                this._render(cached.data, `Offline — utolsó frissítés: ${when}`);
            } else {
                this.listEl.innerHTML =
                    '<p class="lb-empty">Nem érhető el a szerver. Próbáld később!</p>';
            }
        }
    }

    _fetch() {
        if (this.tab === 'individual') return api.fetchIndividual();
        if (this.tab === 'schools') return api.fetchSchools();
        if (!this.classSchoolId) return Promise.resolve([]);
        return api.fetchClasses(this.classSchoolId);
    }

    _render(data, cacheNote) {
        const me = playerStore.load();
        let note = '';
        let html = '<table class="lb-table"><thead><tr>';

        if (this.tab === 'individual') {
            note = 'A nyereményt a résztvevők között <strong>sorsoljuk</strong> ki a kampány végén.';
            html += '<th>#</th><th>Játékos</th><th>Iskola</th><th>Pont</th></tr></thead><tbody>';
            data.forEach((r, i) => {
                html += `<tr class="${i < 3 ? 'lb-top3' : ''} ${r.player_id === me?.player_id ? 'lb-own' : ''}">
                    <td class="lb-rank">${MEDALS[i] ?? i + 1}</td>
                    <td>${r.nickname}</td>
                    <td>${r.school_name ?? '—'}</td>
                    <td class="lb-score">${fmt(r.best_score)}</td></tr>`;
            });
        } else if (this.tab === 'schools') {
            note = 'Az iskolák a játékosaik legjobb eredményeinek <strong>átlagával</strong> versenyeznek (min. 5 játékos).';
            html += '<th>#</th><th>Iskola</th><th>Átlagpont</th><th>Játékos</th></tr></thead><tbody>';
            data.forEach((r, i) => {
                html += `<tr class="${i < 3 ? 'lb-top3' : ''} ${r.school_id === me?.school?.id ? 'lb-own' : ''}">
                    <td class="lb-rank">${MEDALS[i] ?? i + 1}</td>
                    <td>${r.name} <span class="lb-city">${r.city}</span></td>
                    <td class="lb-score">${fmt(r.avg_score)}</td>
                    <td>${r.player_count}</td></tr>`;
            });
        } else {
            note = this.classSchoolId
                ? 'Az osztályok a tagjaik legjobbjainak <strong>összegével</strong> versenyeznek.'
                : 'Válassz iskolát a game over képernyőn, hogy lásd az osztályait!';
            html += '<th>#</th><th>Osztály</th><th>Összpont</th><th>Tag</th></tr></thead><tbody>';
            data.forEach((r, i) => {
                html += `<tr class="${i < 3 ? 'lb-top3' : ''} ${r.class_id === me?.class?.id ? 'lb-own' : ''}">
                    <td class="lb-rank">${MEDALS[i] ?? i + 1}</td>
                    <td>${r.name}</td>
                    <td class="lb-score">${fmt(r.total_score)}</td>
                    <td>${r.player_count}</td></tr>`;
            });
        }

        html += '</tbody></table>';
        if (data.length === 0) html = '<p class="lb-empty">Még nincs eredmény. Legyél az első!</p>';
        this.listEl.innerHTML = html;
        if (this.noteEl) {
            this.noteEl.innerHTML = cacheNote ? `<span class="lb-cache-note">${cacheNote}</span>` : note;
        }
    }
}
```

- [ ] **Step 2: `js/main.js` módosításai**

Importcsere (`js/main.js:8-13`):

```js
import { CANVAS_WIDTH, CANVAS_HEIGHT, INITIAL_SPEED, MAX_SPEED, formatScore } from './utils.js';
import { Game } from './game.js';
import { AudioManager } from './audio.js';
import { api } from './api.js';
import { playerStore } from './player-store.js';
import { initRegistration } from './registration.js';
import { LeaderboardUI } from './leaderboard.js';
import { SceneManager } from './scene.js';
import { World3D } from './world.js';
```

State-kiegészítés (a `let slideKeyDown` körül):

```js
let runStartTime = 0;         // futamidő-mérés (submit-score duration_ms)
let pendingScore = null;      // beküldésre váró futam
let submitTimer = null;       // visszatérő játékos auto-submit késleltetése
let leaderboardGameover, leaderboardOverlay; // LeaderboardUI példányok
```

DOM-cache bővítés az `init()`-ben:

```js
    let saveResultEl, teamOptRow, teamOptCb, teamOptLabel, playerBadge;
    saveResultEl = document.getElementById('save-result');
    teamOptRow = document.getElementById('team-opt-row');
    teamOptCb = document.getElementById('team-opt');
    teamOptLabel = document.getElementById('team-opt-label');
    playerBadge = document.getElementById('player-badge');
```

`init()`-en belül, a managerek után:

```js
    leaderboardGameover = new LeaderboardUI(
        document.getElementById('leaderboard-list'),
        document.getElementById('lb-note'));
    leaderboardOverlay = new LeaderboardUI(
        document.getElementById('lb-overlay-list'), null);

    // Tab-váltás mindkét példányban
    document.querySelectorAll('.lb-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            btn.closest('.lb-tabs').querySelectorAll('.lb-tab')
                .forEach((b) => b.classList.toggle('active', b === btn));
            const ui = btn.closest('#lb-overlay') ? leaderboardOverlay : leaderboardGameover;
            ui.show(btn.dataset.tab);
        });
    });

    document.getElementById('leaderboard-btn').addEventListener('click', () => {
        document.getElementById('lb-overlay').classList.remove('hidden');
        leaderboardOverlay.show('individual');
    });
    document.getElementById('lb-overlay-close').addEventListener('click', () => {
        document.getElementById('lb-overlay').classList.add('hidden');
    });

    teamOptCb.addEventListener('change', () => {
        // opt-in változás → újraütemezett beküldés az új értékkel
        if (pendingScore && state === 'gameover') scheduleSubmit();
    });

    renderPlayerBadge();
    flushOutbox();
```

`game.onGameOver` callback csere:

```js
    game.onGameOver = (score, stats) => {
        state = 'gameover';
        pendingScore = {
            score: Math.floor(score),
            distance_m: Math.round(stats?.distance ?? 0),
            duration_ms: Math.max(3000, Math.round(performance.now() - runStartTime)),
            client_run_id: crypto.randomUUID(),
        };
        showGameOverScreen(score, stats);
        handlePostGame();
    };
```

`startGame()` elejére: `runStartTime = performance.now();`

Régi `submitScore()` függvény és `emailInput` referenciák törlése; helyettük:

```js
function handlePostGame() {
    const player = playerStore.load();
    if (player) {
        // Visszatérő játékos: csapat-opt-in + auto-submit 1,5 mp múlva
        const teamName = player.class
            ? `${player.school?.name ?? ''} ${player.class.name}`.trim()
            : player.school?.name ?? null;
        teamOptRow.classList.toggle('hidden', !teamName);
        if (teamName) teamOptLabel.textContent = `Ez a pont számítson ide: ${teamName}`;
        scheduleSubmit();
    } else {
        // Új játékos: regisztrációs űrlap
        initRegistration({
            mode: 'register',
            onRegistered: () => scheduleSubmit(),
            onSkip: () => { pendingScore = null; },
        });
    }
    leaderboardGameover.show('individual');
}

function scheduleSubmit() {
    clearTimeout(submitTimer);
    submitTimer = setTimeout(submitPendingScore, 1500);
}

async function submitPendingScore() {
    if (!pendingScore) return;
    const player = playerStore.load();
    if (!player) return; // regisztráció közben megszakítva
    const payload = {
        player_id: player.player_id, secret: player.secret,
        ...pendingScore,
        counts_for_team: teamOptCb.checked,
    };
    saveResultEl.classList.remove('hidden');
    saveResultEl.innerHTML = 'Mentés…';
    try {
        const stats = await api.submitScore(payload);
        playerStore.setBest(stats.best_score ?? pendingScore.score);
        playerStore.outboxRemove(pendingScore.client_run_id);
        pendingScore = null;
        renderSaveResult(stats);
    } catch (e) {
        if (e.code === 'rate_limited' || e.code === 'forbidden') {
            saveResultEl.innerHTML = e.code === 'forbidden'
                ? '<span class="sr-warn">A mentés nem sikerült — regisztrálj újra a „nem te vagy?" linkkel.</span>'
                : '<span class="sr-warn">Túl gyors egymásután — a pontod később megy fel automatikusan.</span>';
            if (e.code === 'rate_limited') playerStore.outboxAdd(payload);
        } else {
            playerStore.outboxAdd(payload);
            saveResultEl.innerHTML =
                '<span class="sr-warn">Nincs kapcsolat — a pontod az eszközödön van, később feltöltjük. ✓</span>';
        }
        pendingScore = null;
    }
}

function renderSaveResult(stats) {
    const parts = [`<span class="sr-good">Pont mentve! ✓</span>`];
    parts.push(`🧑 Egyéni lista: <strong>#${stats.rank_individual}</strong>`);
    if (stats.school) {
        parts.push(stats.school.below_threshold
            ? `🏫 Az iskolád még nincs ranglistán — még <strong>${5 - stats.school.players}</strong> játékos kell!`
            : `🏫 Iskolád: <strong>#${stats.school.rank}</strong> (átlag ${formatScore(stats.school.avg)})`);
    }
    if (stats.class) {
        parts.push(`👥 Osztályod: <strong>#${stats.class.rank}</strong> (${formatScore(stats.class.total)} pont)`);
    }
    saveResultEl.innerHTML = parts.join('<br>');
    leaderboardGameover.show(leaderboardGameover.tab); // frissítés
}

async function flushOutbox() {
    for (const entry of playerStore.outboxList()) {
        try {
            await api.submitScore(entry);
            playerStore.outboxRemove(entry.client_run_id);
        } catch { break; } // offline maradunk → megállunk, sorban jövünk vissza
    }
}

function renderPlayerBadge() {
    const player = playerStore.load();
    if (!player) { playerBadge.classList.add('hidden'); return; }
    const where = player.class
        ? `${player.school?.name ?? ''}, ${player.class.name}`
        : player.school?.name ?? 'egyéni játékos';
    playerBadge.innerHTML =
        `Szia, <strong>${player.nickname}</strong>! (${where})` +
        `<a id="badge-edit">módosítás</a><a id="badge-reset">nem te vagy?</a>`;
    playerBadge.classList.remove('hidden');
    document.getElementById('badge-reset').addEventListener('click', () => {
        if (confirm('Biztosan kijelentkezel? A regisztrációd a szerveren megmarad.')) {
            playerStore.clear();
            renderPlayerBadge();
        }
    });
    document.getElementById('badge-edit').addEventListener('click', () => {
        initRegistration({
            mode: 'edit', prefill: player,
            onRegistered: renderPlayerBadge, onSkip: () => {},
        });
    });
}
```

`updateHighScore()` csere (személyes legjobb, offline-képes):

```js
function updateHighScore() {
    const best = playerStore.getBest();
    if (highScoreEl) {
        highScoreEl.textContent = best > 0 ? `🏆 Személyes legjobb: ${formatScore(best)}` : '';
    }
}
```

`showGameOverScreen` egyszerűsítés: az `emailInput`/`submitBtn` sorok törlése, a ranglista-render helyett `leaderboardGameover.show('individual')` (a `handlePostGame` is hívja, de a képernyő-felépítéshez itt is hívjuk), `saveResultEl.classList.add('hidden')`, `#reg-overlay` elrejtése.

`window.__snacky` bővítés: `window.__snacky = { game, world, playerStore, api };`

- [ ] **Step 3: GUI-verifikáció (Playwright MCP) — teljes flow**

`python3 -m http.server 8080` mellett, Playwright MCP-vel:

1. `browser_navigate http://localhost:8080` → START gomb látszik, nincs player-badge.
2. `browser_evaluate`: `__snacky.game.onGameOver(12345, {distance:800, maxCombo:3, nearMisses:1, bosses:0})` → a regisztrációs űrlap látszik.
3. Becenév: „GUI Teszt", iskolakereső: „Teszt" → „Teszt Gimi — Budapest" kiválasztása → osztály: „11.A"; kor-rádió: 16+; consent pipa → „Pont mentése".
4. Várt: „Pont mentve! ✓ 🧑 Egyéni lista: #… · 🏫 Iskolád… · 👥 Osztályod…" sor; localStorage-ban `snacky_player`.
5. Oldal újratöltés → menü: „Szia, GUI Teszt! (Teszt Gimi, 11.A)" badge.
6. Újabb `onGameOver(9000, …)` → 1,5 mp után automatikus mentés, opt-in checkbox látszik.
7. Ranglista-tabok kattintása: Iskolák → „Teszt Gimi" sor átlaggal; Osztályok → „11.A" összeggel; a saját sor sárga.
8. Offline-teszt: `browser_evaluate`-tel `fetch` blokkolása (vagy DevTools Network offline) → mentés után „Nincs kapcsolat…" sor + `snacky_outbox` feltöltődik; online visszakapcs + reload → outbox ürül.
9. Screenshotok a `.superpowers/` jelentéshez.

- [ ] **Step 4: Commit**

```bash
git add js/leaderboard.js js/main.js
git commit -m "🏆 B2S ranglista (3 tab, cache) + main.js flow (auto-submit, outbox, badge)"
```

---

### Task 9: GDPR-csomag — `privacy.html` + adattörlés

**Files:**
- Create: `privacy.html`
- Modify: `js/main.js` (badge-reset már megvan; a privacy-oldali törlés önálló inline scripttel)

**Interfaces:**
- Consumes: `api.deleteMyData`, `playerStore` (Task 6).

- [ ] **Step 1: `privacy.html`**

```html
<!DOCTYPE html>
<html lang="hu">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Adatkezelési tájékoztató — Snacky Dash</title>
    <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/style.css">
    <style>
        body { max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; }
        .privacy h1 { font-family: 'Bangers', cursive; letter-spacing: 2px; }
        .privacy h2 { margin-top: 28px; font-size: 20px; }
        .privacy p, .privacy li { line-height: 1.6; font-size: 15px; }
        .legal-review {
            border: 2px dashed #ffd23f; border-radius: 10px; padding: 12px 16px;
            font-size: 13px; margin: 20px 0;
        }
        #delete-section { margin-top: 40px; border-top: 1px solid rgba(255,255,255,.15); padding-top: 24px; }
    </style>
</head>
<body>
    <div class="privacy">
        <h1>🌭 Snacky Dash — Adatkezelési tájékoztató</h1>

        <div class="legal-review">
            ⚠️ <strong>TERVEZET</strong> — ez a szöveg a kampány indulása előtt
            jogi felülvizsgálatra vár (spec §12/3). A zárójeles részek a
            Pek-Snack által kitöltendők.
        </div>

        <h2>1. Adatkezelő</h2>
        <p>[Pek-Snack Zrt. cím, elérhetőség] — a Back to School kampány szervezője.</p>

        <h2>2. Milyen adatokat gyűjtünk?</h2>
        <ul>
            <li><strong>Becenév</strong> (kérünk, NE valódi neved add meg!)</li>
            <li><strong>Iskola és osztály</strong> — <em>nem kötelező</em>, csak ha szeretnéd,
                hogy a pontjaid az iskolád/osztályod versenyébe számítsanak</li>
            <li><strong>Pontszámaid</strong> a játékban</li>
            <li>A hozzájárulásod ténye és időpontja</li>
        </ul>
        <p><strong>Nem gyűjtünk:</strong> valódi nevet, e-mail címet, telefonszámot,
            pontos tartózkodási helyet.</p>

        <h2>3. Miért?</h2>
        <p>A Back to School játékverseny lebonyolításához: ranglisták készítése és a
            kampány végén <strong>sorsolás</strong> tartása a résztvevők között. Az iskolák
            között a legmagasabb átlagpontot elérő iskola nyer.</p>

        <h2>4. Meddig őrizzük?</h2>
        <p>A kampány végéig ([záródátum]), legkésőbb azután 30 napig — ezután minden
            adatot törlünk.</p>

        <h2>5. 16 év alattiak</h2>
        <p>Ha 16 év alatti vagy, a regisztrációhoz szülő/törvényes képviselő
            hozzájárulása kell.</p>

        <h2>6. Jogaid</h2>
        <p>Bármikor kérheted adataid törlését (lásd lent), tájékoztatást kérhetsz az
            adatkezelésről, és panasszal fordulhatsz a NAIH-hoz (naih.hu).</p>

        <h2>7. Sorsolás és nyertes-értesítés</h2>
        <p>Mivel nem tárolunk elérhetőséget, a nyertes(ek) becenevét az oldalon és a
            kampány csatornáin tesszük közzé; a nyertes [X] napon belül jelentkezhet a
            nyereményéért. Részletek: a játék hivatalos szabályzatában. [link]</p>

        <div id="delete-section">
            <h2>Adataim törlése</h2>
            <p id="delete-info">Ha ezen az eszközön regisztráltál, itt törölheted a
                regisztrációdat és az összes pontszámodat.</p>
            <button id="delete-btn" class="btn btn-submit hidden">Végleges törlés</button>
            <p id="delete-result"></p>
            <p><a href="index.html">← Vissza a játékhoz</a></p>
        </div>
    </div>

    <script type="module">
        import { api } from './js/api.js';
        import { playerStore } from './js/player-store.js';

        const btn = document.getElementById('delete-btn');
        const result = document.getElementById('delete-result');
        const player = playerStore.load();

        if (!player) {
            document.getElementById('delete-info').textContent =
                'Ezen az eszközön nincs regisztrált játékos.';
        } else {
            document.getElementById('delete-info').innerHTML =
                `Bejelentkezve: <strong>${player.nickname}</strong>. ` +
                'A törlés végleges, a pontjaid is törlődnek.';
            btn.classList.remove('hidden');
            btn.addEventListener('click', async () => {
                if (!confirm('Biztosan törlöd a regisztrációdat és minden pontodat?')) return;
                btn.disabled = true;
                try {
                    await api.deleteMyData({ player_id: player.player_id, secret: player.secret });
                    playerStore.clear();
                    result.textContent = '✓ Adataid törölve. Köszönjük a játékot!';
                } catch {
                    result.textContent = 'A törlés nem sikerült. Próbáld újra később.';
                    btn.disabled = false;
                }
            });
        }
    </script>
</body>
</html>
```

- [ ] **Step 2: GUI-verifikáció (Playwright MCP)**

1. `browser_navigate http://localhost:8080/privacy.html` → oldal betölt, a játék stílusával.
2. Regisztrált állapotban (Task 8 után): „Adataim törlése" gomb látszik → kattintás → confirm elfogadása (`browser_handle_dialog accept:true`) → „✓ Adataid törölve".
3. SQL-verifikáció (SQL Editor): `select count(*) from players where nickname = 'GUI Teszt';` → `0`; `select count(*) from scores where player_id not in (select id from players);` → `0` (cascade működött).
4. Oldal újratöltés: „Ezen az eszközön nincs regisztrált játékos."

- [ ] **Step 3: Commit**

```bash
git add privacy.html
git commit -m "🔏 GDPR: privacy.html (jogi tervezet) + adattörlés"
```

---

### Task 10: Iskola-adatbázis import (KIR/OH)

**Files:**
- Create: `scripts/package.json`, `scripts/normalize-schools.mjs`
- Create: `supabase/seed/schools_import.sql` (generált)

**Interfaces:**
- Consumes: nyilvános KIR/OH iskolajegyzék.
- Produces: `schools` tábla feltöltve (~3500–4000 sor, `is_verified=true`).

- [ ] **Step 1: Adatforrás beszerzése**

Sorrend (első működő nyer):
1. **OH közérdekű adatok**: <https://www.oktatas.hu/kozneveles> → „Közérdekű adatok" → „Köznevelési intézmények nyilvántartása" (XLS/XLSX letöltés).
2. **KIR intézménykereső** (<https://www.kir.hu/>): a kereső ajax-végpontjai (DevTools Network-ből kiolvasva) — ha tömeges lekérdezhető, JSON-tömb letölthető.
3. **Firecrawl-fallback** (a felhasználó felajánlotta): a fenti oldalak scrape-elése.

Letöltés a `scripts/raw/` mappába.

- [ ] **Step 2: `scripts/package.json` + telepítés**

```json
{ "name": "b2s-scripts", "private": true, "type": "module",
  "dependencies": { "xlsx": "^0.18.5" } }
```

```bash
cd scripts && npm install
```

(Csak build-time eszköz — a frontend továbbra is függőség-mentes.)

- [ ] **Step 3: `scripts/normalize-schools.mjs`**

```js
// KIR/OH export → schools_import.sql
// Futtatás: node normalize-schools.mjs raw/<fájl>.xlsx
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Használat: node normalize-schools.mjs <xlsx>'); process.exit(1); }

const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

// Oszlop-felismerés (a KIR-export fejlécei változhatnak — első futáskor ellenőrizni!)
const pick = (r, keys) => keys.map((k) => r[k]).find((v) => v && String(v).trim()) ?? '';

function guessType(name) {
    const n = name.toLowerCase();
    if (n.includes('általános iskola') || n.includes('altalanos iskola')) return 'altalanos';
    if (n.includes('gimnázium') || n.includes('gimnazium')) return 'gimnazium';
    if (n.includes('szakközép') || n.includes('technikum') || n.includes('szakgimnázium')) return 'szakkozep';
    return 'egyeb';
}

const esc = (s) => String(s).replace(/'/g, "''");
const seen = new Set();
const out = [];

for (const r of rows) {
    const name = pick(r, ['Intézmény neve', 'Név', 'name', 'INTÉZMÉNY NEVE']).trim();
    const city = pick(r, ['Település', 'Székhely település', 'city', 'TELEPÜLÉS']).trim();
    if (name.length < 4 || city.length < 2) continue;
    const key = `${name.toLowerCase()}|${city.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`('${esc(name)}', '${esc(city)}', '${guessType(name)}', true)`);
}

const chunks = [];
for (let i = 0; i < out.length; i += 500) {
    chunks.push(`insert into schools (name, city, type, is_verified) values\n${out.slice(i, i + 500).join(',\n')}\non conflict (name, city) do nothing;`);
}
writeFileSync('../supabase/seed/schools_import.sql',
    `-- ══ B2S iskola-import (KIR/OH) — ${out.length} rekord, generált ══\n` + chunks.join('\n\n'));
console.log(`OK: ${out.length} iskola → supabase/seed/schools_import.sql`);
```

- [ ] **Step 4: Generálás + import (EMBERI LÉPÉS: SQL Editor)**

```bash
cd scripts && node normalize-schools.mjs raw/kir_intezmenyek.xlsx
```
Expected: `OK: 3xxx iskola → …`. Import: `schools_import.sql` az SQL Editorban.

- [ ] **Step 5: Verifikáció (SQL Editor)**

```sql
select count(*), count(*) filter (where is_verified) from schools;
-- Expected: 3000+ sor, nagyrészt is_verified=true

select name, city, type from schools where name ilike '%petőfi%' limit 5;
select name from schools where city = 'Szeged' order by name limit 5;
-- Expected: ismert valós iskolák

select type, count(*) from schools group by type order by 2 desc;
-- Expected: altalanos a legtöbb; 'egyeb' arány < 15% (ha több: guessType finomítás)
```

- [ ] **Step 6: Kereső végpont-végpont teszt (böngésző konzol)**

```js
const { api } = await import('./js/api.js');
await api.searchSchools('Petőfi');   // Expected: valós találatok
await api.searchSchools('Szeged');   // Expected: szegedi iskolák
```

- [ ] **Step 7: Commit**

```bash
git add scripts/ supabase/seed/schools_import.sql
git commit -m "🏫 Iskola-adatbázis import (KIR/OH normalizáló script + SQL)"
```

---

### Task 11: Deploy + éles smoke-teszt

**Files:**
- Modify: `supabase/functions/*/index.ts` (CORS-szűkítés env-változóval — már beépített: `ALLOWED_ORIGIN`)
- Create: `netlify.toml`

**Interfaces:**
- Consumes: minden korábbi task.

- [ ] **Step 1: `netlify.toml`**

```toml
[build]
  publish = "."
  command = ""

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

- [ ] **Step 2: Netlify-deploy (EMBERI LÉPÉS)**

```bash
npx netlify deploy --prod --dir=.
```

(Netlify-fiók szükséges; a domain a Pek-Snack döntéséig a generált `*.netlify.app`.)

- [ ] **Step 3: CORS-szűkítés (EMBERI LÉPÉS)**

```bash
supabase secrets set ALLOWED_ORIGIN=https://<az-éles-domain>
```

Ezután a 4 function újra-deploy (`supabase functions deploy register` stb.) — a kód az env-t olvassa, változtatás nem kell.

- [ ] **Step 4: Seed-takarítás éles előtt (SQL Editor)**

```sql
-- tesztadatok törlése (az importált iskolák maradnak!)
delete from players where nickname in
  ('Első Emese','Második Balázs','Harmadik Kata','Negyedik Dániel','Optout Pisti',
   'Egyéni Géza','GUI Teszt','Teszt Béla','Solo Zsófi','Score Teszt','Váltó Viki',
   'Flood 1','Flood 2','Flood 3','Flood 4');
delete from schools where name in ('Teszt Gimi','Kis Suli');
```

- [ ] **Step 5: Éles smoke (Playwright MCP az éles URL-en)**

1. Menü betölt, konzol hibamentes.
2. Teljes regisztrációs flow valós iskolával (pl. „Petőfi" keresés).
3. Ranglista-tabok működnek; mentés eredménysor megjelenik.
4. Mobil-viewport (375×812): a flow ugyanígy végigvihető.
5. `privacy.html` elérhető, törlés működik (utána új játékos).

- [ ] **Step 6: Commit**

```bash
git add netlify.toml
git commit -m "🚀 B2S deploy: netlify konfig, CORS-szűkítés, éles smoke"
```

---

## Self-Review jegyzőkönyv

**Spec-lefedettség:** D1 game over reg → Task 7-8 ✔; D2 versenymodell → Task 2 view-k/fn + Task 8 UI ✔; D3 iskola-adat → Task 10 ✔; D4 Edge validáció → Task 4 ✔; D6 api.js/config.js → Task 6 ✔; RLS → Task 2 ✔; GDPR (consent, privacy, törlés, tiltólista) → Task 3+7+9 ✔; offline-outbox/cache → Task 6+8 ✔; update-affiliation → Task 5+8 (edit mód) ✔; deploy → Task 11 ✔. A spec §6.2 `getMyCommunityStatus`-ját az `api.getStats` (fn_player_stats rpc) fedi le.

**Placeholder-scan:** a `PROJECT_REF`/`ANON_PUBLIC_KEY`/domain mezők szándékosan ember által kitöltendők (EMBERI LÉPÉS jelölve); nincs „TODO"/„implement later" lépés.

**Típus-konzisztencia:** `fn_player_stats` kimeneti kulcsai (`rank_individual, best_score, school{rank,avg,players,below_threshold}, class{rank,total,players}`) azonosak a Task 2 SQL-ben, a Task 4 Edge-válaszban és a Task 8 `renderSaveResult`-ban; `playerStore` és `api` szignatúrák a Task 6 „Produces" szerint használva Task 7-9-ben; DOM-id-k (`reg-*`, `lb-*`, `team-opt*`) Task 7 ↔ Task 8 konzisztensek.
