-- ══ 006 — opcionális e-mail a nyertes-értesítéshez (D4-módosítás, 2026-08-19) ══
-- A korábbi „sehol e-mail" elv feloldva üzleti döntéssel: a mező OPCIONÁLIS,
-- csak a nyertesek elérésére szolgál; a claim-igazolás továbbra is a
-- player_id+secret (eszközön tárolt titok).
alter table players add column if not exists email text;
