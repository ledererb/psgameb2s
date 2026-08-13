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
-- Kis-játékosok: 2000 (a terv 20000-e Emese 15000-je FÖLÉ került volna, így a
-- verify 5-ös assertje — rank 3, felette csak Optout+Géza — sosem ment volna át;
-- a küszöb-tesztet a 2000 is ugyanúgy kielégíti: 4 fő < 5)
insert into scores (player_id, score, counts_for_team)
  select id, 2000, true from players where nickname like 'Kis%';
insert into scores (player_id, score) values
  ((select id from players where nickname='Egyéni Géza'), 50000);
