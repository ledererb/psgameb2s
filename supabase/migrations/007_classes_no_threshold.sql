-- ══ 007 — minden osztály jelenjen meg a ranglistán (2026-08-31, üzleti döntés) ══
-- A min-5 küszöb a classes view-ból lekerül (a top-5 átlag marad; 5 fő alatt
-- az összes tag átlaga). Az ISKOLA view küszöbe (min 5) változatlan marad.
-- A fn_player_stats osztály-rangja is küszöb nélkül számolódik (below_threshold
-- információsan megmarad). Megjegyzés: a manipuláció-védelem gyengül kicsit
-- (kis elit-osztályok is rangosíthatók) — a döntés a kampányé.

create or replace view leaderboard_classes as
with bests as (
  select p.class_id, p.id as pid, max(sc.score) as best
  from players p
  join scores sc on sc.player_id = p.id and sc.counts_for_team
  where p.class_id is not null
  group by p.class_id, p.id
), ranked as (
  select class_id, best,
         row_number() over (partition by class_id order by best desc) as rn,
         count(*) over (partition by class_id) as cnt
  from bests
)
select c.id as class_id, c.school_id, c.name,
       round(avg(r.best) filter (where r.rn <= 5))::int as avg_score,
       max(r.cnt)::int as player_count
from ranked r
join classes c on c.id = r.class_id
group by c.id, c.school_id, c.name
order by avg_score desc;

grant select on leaderboard_classes to anon;

create or replace function fn_player_stats(p_player_id uuid)
returns json language plpgsql security definer stable
set search_path = '' as $$
declare
  v_school_id bigint; v_class_id bigint;
  v_best int; v_rank int;
  v_avg numeric; v_cnt int; v_srank int;
  v_cavg numeric; v_ccnt int; v_crank int;
begin
  select school_id, class_id into v_school_id, v_class_id
    from public.players where id = p_player_id;
  if not found then return json_build_object('error', 'not_found'); end if;

  select coalesce(max(score), 0) into v_best from public.scores where player_id = p_player_id;

  select count(*) + 1 into v_rank from (
    select player_id from public.scores group by player_id having max(score) > v_best
  ) t;

  -- iskola: top-5 átlag + globális rang (min 5 küszöb, változatlan)
  v_avg := null; v_cnt := 0; v_srank := null;
  if v_school_id is not null then
    with ranked as (
      select p.id pid, max(s.score) best,
             row_number() over (order by max(s.score) desc) rn
      from public.players p join public.scores s on s.player_id = p.id and s.counts_for_team
      where p.school_id = v_school_id group by p.id
    )
    select count(*), coalesce(avg(best) filter (where rn <= 5), 0) into v_cnt, v_avg from ranked;

    if v_cnt >= 5 then
      with ranked as (
        select p.school_id sid, max(s.score) best,
               row_number() over (partition by p.school_id order by max(s.score) desc) rn,
               count(*) over (partition by p.school_id) cnt
        from public.players p join public.scores s on s.player_id = p.id and s.counts_for_team
        where p.school_id is not null group by p.school_id, p.id
      ), avgs as (
        select sid, avg(best) filter (where rn <= 5) a
        from ranked group by sid having max(cnt) >= 5
      )
      select count(*) + 1 into v_srank from avgs where a > v_avg;
    end if;
  end if;

  -- osztály: top-5 átlag + iskolán belüli rang, KÜSZÖB NÉLKÜL (007)
  v_cavg := null; v_ccnt := 0; v_crank := null;
  if v_class_id is not null then
    with ranked as (
      select p.id pid, max(s.score) best,
             row_number() over (order by max(s.score) desc) rn
      from public.players p join public.scores s on s.player_id = p.id and s.counts_for_team
      where p.class_id = v_class_id group by p.id
    )
    select count(*), coalesce(avg(best) filter (where rn <= 5), 0) into v_ccnt, v_cavg from ranked;

    with ranked as (
      select p.class_id cid, max(s.score) best,
             row_number() over (partition by p.class_id order by max(s.score) desc) rn,
             count(*) over (partition by p.class_id) cnt
      from public.players p join public.scores s on s.player_id = p.id and s.counts_for_team
      where p.class_id is not null and p.school_id = v_school_id
      group by p.class_id, p.id
    ), avgs as (
      select cid, avg(best) filter (where rn <= 5) a from ranked group by cid
    )
    select count(*) + 1 into v_crank from avgs where a > v_cavg;
  end if;

  return json_build_object(
    'rank_individual', v_rank,
    'best_score', v_best,
    'school', case when v_school_id is null then null else json_build_object(
      'rank', v_srank, 'avg', round(coalesce(v_avg, 0))::int, 'players', v_cnt,
      'below_threshold', v_cnt < 5) end,
    'class', case when v_class_id is null then null else json_build_object(
      'rank', v_crank, 'avg', round(coalesce(v_cavg, 0))::int, 'players', v_ccnt) end
  );
end $$;
