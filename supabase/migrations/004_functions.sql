-- ══ B2S — játékos-statisztika (game over eredménysor + „még N játékos kell") ══
create or replace function fn_player_stats(p_player_id uuid)
returns json language plpgsql security definer stable
set search_path = '' as $$
declare
  v_school_id bigint; v_class_id bigint;
  v_best int; v_rank int;
  v_avg numeric; v_cnt int; v_srank int;
  v_total numeric; v_ccnt int; v_crank int;
begin
  select school_id, class_id into v_school_id, v_class_id
    from public.players where id = p_player_id;
  if not found then return json_build_object('error', 'not_found'); end if;

  select coalesce(max(score), 0) into v_best from public.scores where player_id = p_player_id;

  select count(*) + 1 into v_rank from (
    select player_id from public.scores group by player_id having max(score) > v_best
  ) t;

  v_avg := null; v_cnt := 0; v_srank := null;
  if v_school_id is not null then
    with bests as (
      select p.id pid, max(s.score) best
      from public.players p join public.scores s on s.player_id = p.id and s.counts_for_team
      where p.school_id = v_school_id group by p.id
    )
    select count(*), coalesce(avg(best), 0) into v_cnt, v_avg from bests;

    if v_cnt >= 5 then
      with bests as (
        select p.school_id sid, p.id pid, max(s.score) best
        from public.players p join public.scores s on s.player_id = p.id and s.counts_for_team
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
      from public.players p join public.scores s on s.player_id = p.id and s.counts_for_team
      where p.class_id = v_class_id group by p.id
    )
    select count(*), coalesce(sum(best), 0) into v_ccnt, v_total from bests;

    with bests as (
      select p.class_id cid, p.id pid, max(s.score) best
      from public.players p join public.scores s on s.player_id = p.id and s.counts_for_team
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
