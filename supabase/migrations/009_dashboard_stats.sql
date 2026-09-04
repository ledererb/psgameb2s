-- ══ 009 — dashboard-statisztika függvény (jelszavas dashboard-hoz) ══
-- Zárt aggregátum-JSON; az élő adatokon kívül semmit nem árul el.
create or replace function fn_dashboard_stats()
returns json language sql security definer stable
set search_path = '' as $$
  select json_build_object(
    'totals', (select json_build_object(
      'players', (select count(*) from public.players),
      'with_email', (select count(*) from public.players where email is not null),
      'runs', (select count(*) from public.scores),
      'scorers', (select count(distinct player_id) from public.scores),
      'schools_active', (select count(distinct school_id) from public.players where school_id is not null),
      'classes_active', (select count(distinct class_id) from public.players where class_id is not null),
      'schools_total', (select count(*) from public.schools),
      'avg_best', (select coalesce(round(avg(best)),0) from (
        select player_id, max(score) as best from public.scores group by player_id) t),
      'new_today', (select count(*) from public.players where created_at::date = current_date),
      'new_7d', (select count(*) from public.players where created_at > now() - interval '7 days')
    )),
    'daily', (select json_agg(x) from (
      select d::date as day,
        (select count(*) from public.players p where p.created_at::date = d) as registrations,
        (select count(*) from public.scores s where s.created_at::date = d) as runs
      from generate_series(current_date - interval '29 days', current_date, interval '1 day') d
      order by d) x),
    'top_players', (select json_agg(x) from (
      select player_id, nickname, school_name, best_score, run_count
      from public.leaderboard_individual limit 10) x),
    'top_schools', (select json_agg(x) from (
      select name, city, avg_score, player_count
      from public.leaderboard_schools order by avg_score desc limit 10) x),
    'top_classes', (select json_agg(x) from (
      select name, school_name, avg_score, player_count
      from public.leaderboard_classes order by avg_score desc limit 10) x)
  );
$$;

-- csak a service role hívhatja (az Edge Function); anon NEM
revoke execute on function fn_dashboard_stats() from anon, authenticated;
