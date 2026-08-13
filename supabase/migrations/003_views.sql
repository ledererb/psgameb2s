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
