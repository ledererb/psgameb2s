// ══ B2S — dashboard-stats: jelszavas aggregált kampány-statisztika ══
// A dashboard.html hívja; az x-dashboard-key headernek a DASHBOARD_PASSWORD
// secrettel kell egyeznie. A adatokat a zárt fn_dashboard_stats() SQL-fv adja.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',').map((s) => s.trim());

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin':
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'content-type,x-dashboard-key',
});

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, origin);

  const key = req.headers.get('x-dashboard-key');
  const expected = Deno.env.get('DASHBOARD_PASSWORD');
  if (!expected || !key || key !== expected) {
    return json({ error: 'unauthorized' }, 401, origin);
  }

  const { data, error } = await sb.rpc('fn_dashboard_stats');
  if (error) return json({ error: 'query_failed', detail: error.message }, 500, origin);
  return json(data, 200, origin);
});
