-- ══ 008 — globális osztálylista iskolanévvel + iskolai küszöb levéve (2026-08-31) ══
-- leaderboard_classes: + school_name, school_city (a UI globálisan listázza,
--   iskolanév-oszloppal); leaderboard_schools: min-5 küszöb LEVÉVE (007-tel
--   szimmetrikus döntés — minden iskola látszik, 5 fő alatt az összes tag átlaga).

-- a névjegyzék bővítése (school_name/school_city) miatt drop+recreate kell
drop view if exists leaderboard_classes;

create view leaderboard_classes as
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
       s.name as school_name, s.city as school_city,
       round(avg(r.best) filter (where r.rn <= 5))::int as avg_score,
       max(r.cnt)::int as player_count
from ranked r
join classes c on c.id = r.class_id
join schools s on s.id = c.school_id
group by c.id, c.school_id, c.name, s.name, s.city
order by avg_score desc;

grant select on leaderboard_classes to anon;

create or replace view leaderboard_schools as
with bests as (
  select p.school_id, p.id as pid, max(sc.score) as best
  from players p
  join scores sc on sc.player_id = p.id and sc.counts_for_team
  where p.school_id is not null
  group by p.school_id, p.id
), ranked as (
  select school_id, best,
         row_number() over (partition by school_id order by best desc) as rn,
         count(*) over (partition by school_id) as cnt
  from bests
)
select s.id as school_id, s.name, s.city,
       round(avg(r.best) filter (where r.rn <= 5))::int as avg_score,
       max(r.cnt)::int as player_count
from ranked r
join schools s on s.id = r.school_id
group by s.id, s.name, s.city
order by avg_score desc;

grant select on leaderboard_schools to anon;
