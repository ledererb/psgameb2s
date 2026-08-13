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
