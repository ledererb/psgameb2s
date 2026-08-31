import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',').map((s) => s.trim());

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin':
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'content-type',
  'Vary': 'Origin',
});

// Konzervatív plauzibilitás (game.js: ~60 p/mp alap, de a kombó-szorzó és a
// 2× pontszorzó együtt elit futamban 2000 p/mp fölé viheti — 4000 a biztonságos határ)
const MAX_SCORE_PER_SEC = 1500;  // éles top ~1000/mp + headroom (korábban 4000)
const MAX_SCORE_PER_METER = 150; // éles max ~70/m, 2× margin — pont↔táv keresztellenőrzés
const BASE_ALLOWANCE = 5000;
const MIN_DURATION_MS = 3_000;
const MAX_DURATION_MS = 3_600_000; // 1 óra
const RATE_LIMIT_MS = 10_000;      // 1 beküldés / 10 mp / játékos (isolate-memória)

const lastSubmit = new Map<string, number>();

Deno.serve(async (req) => {
  const CORS = corsHeaders(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const player_id = String(b.player_id ?? '');
  const secret = String(b.secret ?? '');
  if (!player_id || !secret) return json({ error: 'missing_credentials' }, 400);

  const score = Math.floor(Number(b.score));
  const distance = Math.max(0, Math.floor(Number(b.distance_m ?? 0)));
  const duration = Math.floor(Number(b.duration_ms ?? 0));
  if (!Number.isFinite(score) || score < 0) return json({ error: 'score_invalid' }, 400);
  if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
    return json({ error: 'duration_invalid' }, 422);
  }
  if (score > MAX_SCORE_PER_SEC * (duration / 1000) + BASE_ALLOWANCE) {
    return json({ error: 'score_implausible' }, 422);
  }
  // pont↔táv keresztellenőrzés: a távolság is kliens-adat, de együtt nehezebb hazudni
  if (score > MAX_SCORE_PER_METER * distance + BASE_ALLOWANCE) {
    return json({ error: 'score_implausible' }, 422);
  }

  const now = Date.now();
  if (now - (lastSubmit.get(player_id) ?? 0) < RATE_LIMIT_MS) {
    return json({ error: 'rate_limited' }, 429);
  }

  const { data: player } = await sb.from('players').select('id')
    .eq('id', player_id).eq('secret', secret).limit(1);
  if (!player?.length) return json({ error: 'forbidden' }, 403);

  const runId = typeof b.client_run_id === 'string' ? b.client_run_id : null;
  if (runId) {
    const { data: dup } = await sb.from('scores').select('id')
      .eq('client_run_id', runId).limit(1);
    if (dup?.length) {
      const { data: stats } = await sb.rpc('fn_player_stats', { p_player_id: player_id });
      return json({ duplicate: true, ...stats });
    }
  }

  const { error } = await sb.from('scores').insert({
    player_id, score, distance_m: distance, duration_ms: duration,
    counts_for_team: b.counts_for_team !== false,
    client_run_id: runId,
  });
  if (error) {
    if (error.code === '23505') { // unique race → duplikátum
      const { data: stats } = await sb.rpc('fn_player_stats', { p_player_id: player_id });
      return json({ duplicate: true, ...stats });
    }
    return json({ error: 'insert_failed' }, 500);
  }
  lastSubmit.set(player_id, now);

  const { data: stats } = await sb.rpc('fn_player_stats', { p_player_id: player_id });
  return json(stats);
});
