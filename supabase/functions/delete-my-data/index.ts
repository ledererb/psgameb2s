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

  const { data: player } = await sb.from('players').select('id')
    .eq('id', player_id).eq('secret', secret).limit(1);
  if (!player?.length) return json({ error: 'forbidden' }, 403);

  // scores cascade-dzsel törlődik a player-rel
  const { error } = await sb.from('players').delete().eq('id', player_id);
  if (error) return json({ error: 'delete_failed' }, 500);
  return json({ deleted: true });
});
