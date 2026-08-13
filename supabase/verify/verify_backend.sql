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
