// ══ B2S — dashboard-stats: jelszavas aggregált kampány-statisztika ══
// A dashboard.html hívja; az x-dashboard-key headernek a DASHBOARD_PASSWORD
// secrettel kell egyeznie. A adatokat a zárt fn_dashboard_stats() SQL-fv adja,
// a Meta hirdetési insightokat a Marketing API-ból gyűjti össze (act + campaign szint).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const META_TOKEN = Deno.env.get('META_ACCESS_TOKEN') ?? '';
const META_ACCOUNT = Deno.env.get('META_AD_ACCOUNT_ID') ?? '';
// A kampány-felelős által kijelölt 5 B2S hirdetés (2026-09-04):
const B2S_CAMPAIGNS = [
  { id: '120250792694830010', label: 'B2S — Forgalom' },
  { id: '120250852149220010', label: '#reklám Amikor apaként…' },
  { id: '120250818122580010', label: '👀 Te hány Hot-Dog (FB)' },
  { id: '120250818114570010', label: '👀 Te hány Hot-Dog (IG)' },
  { id: '120250693278470010', label: 'HOT-DOG VADÁSZAT INDUL!' },
];

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('ALLOWED_ORIGIN') ?? '*')
  .split(',').map((s) => s.trim());

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin':
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'content-type,x-dashboard-key',
});

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });

async function metaInsights(url: string): Promise<{ spend: number; impressions: number; reach: number; clicks: number; ctr: number; cpc: number } | null> {
  try {
    const r = await fetch(url);
    const d = await r.json();
    const row = d?.data?.[0];
    if (!row) return null;
    return {
      spend: parseFloat(row.spend ?? 0),
      impressions: parseInt(row.impressions ?? 0),
      reach: parseInt(row.reach ?? 0),
      clicks: parseInt(row.clicks ?? 0),
      ctr: parseFloat(row.ctr ?? 0),
      cpc: parseFloat(row.cpc ?? 0),
    };
  } catch { return null; }
}

async function metaAdData() {
  if (!META_TOKEN || !META_ACCOUNT) return null;
  const base = 'https://graph.facebook.com/v21.0';
  const fields = 'spend,impressions,reach,clicks,ctr,cpc';
  const token = `access_token=${META_TOKEN}`;

  const [b2s7, acct30] = await Promise.all([
    metaInsights(`${base}/act_${META_ACCOUNT}/insights?fields=${fields}&date_preset=last_7d&${token}`),
    metaInsights(`${base}/act_${META_ACCOUNT}/insights?fields=${fields}&date_preset=last_30d&${token}`),
  ]);

  const campaigns = await Promise.all(
    B2S_CAMPAIGNS.map(async (c) => ({
      id: c.id, label: c.label,
      ...(await metaInsights(`${base}/${c.id}/insights?fields=${fields}&date_preset=last_7d&${token}`)) ?? {},
    }))
  );

  return {
    b2s_traffic_7d: b2s7,
    account_30d: acct30,
    campaigns,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, origin);

  const key = req.headers.get('x-dashboard-key');
  const expected = Deno.env.get('DASHBOARD_PASSWORD');
  if (!expected || !key || key !== expected) {
    return json({ error: 'unauthorized' }, 401, origin);
  }

  const [dbRes, metaRes] = await Promise.all([
    sb.rpc('fn_dashboard_stats').then(
      (r) => r.data,
      (e) => { throw new Error('query_failed: ' + e.message); }
    ),
    metaAdData(),
  ]);

  return json({ generated_at: new Date().toISOString(), stats: dbRes, meta: metaRes }, 200, origin);
});
