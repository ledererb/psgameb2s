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
