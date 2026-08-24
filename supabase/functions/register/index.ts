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

// Tiltólista — kompakt, bővíthető (spec §5.1)
const BLOCKLIST = [
  'fasz', 'picsa', 'picsá', 'kurva', 'geci', 'bazmeg', 'bazdmeg', 'buzi',
  'ribanc', 'csicska', 'anyád', 'fosz', 'segg', 'fuck', 'shit', 'bitch',
  'cunt', 'nigga', 'nigger', 'whore',
];

const rate = new Map<string, { n: number; t: number }>();
function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const e = rate.get(key);
  if (!e || now - e.t > windowMs) { rate.set(key, { n: 1, t: now }); return true; }
  if (e.n >= max) return false;
  e.n++; return true;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').normalize('NFC');
const SCHOOL_TYPES = ['altalanos', 'gimnazium', 'szakkozep', 'egyeb'];

Deno.serve(async (req) => {
  const CORS = corsHeaders(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!rateLimit(`reg:${ip}`, 5, 60_000)) return json({ error: 'rate_limited' }, 429);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  // ── Becenév ──
  const nickname = norm(String(b.nickname ?? ''));
  if (nickname.length < 2 || nickname.length > 20) return json({ error: 'nickname_length' }, 400);
  if (!/^[\p{L}\p{N} ._-]+$/u.test(nickname)) return json({ error: 'nickname_chars' }, 400);
  const lower = nickname.toLowerCase();
  if (BLOCKLIST.some((w) => lower.includes(w))) return json({ error: 'nickname_blocked' }, 400);
  if (typeof b.consent_is_parent !== 'boolean') return json({ error: 'consent_required' }, 400);

  // ── E-mail (opcionális — csak nyertes-értesítéshez; D4-módosítás) ──
  const email = norm(String(b.email ?? '')).toLowerCase();
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return json({ error: 'email_invalid' }, 400);
  }

  // ── Iskola feloldás (opcionális) ──
  let schoolId: number | null = (b.school_id as number) ?? null;
  if (schoolId && b.new_school) return json({ error: 'school_conflict' }, 400);
  if (!schoolId && b.new_school) {
    const ns = b.new_school as { name?: string; city?: string; type?: string };
    const name = norm(String(ns.name ?? ''));
    const city = norm(String(ns.city ?? ''));
    const type = String(ns.type ?? 'egyeb');
    if (name.length < 4 || city.length < 2) return json({ error: 'school_invalid' }, 400);
    if (/[<>]/.test(name) || /[<>]/.test(city)) return json({ error: 'school_invalid' }, 400);
    if (!SCHOOL_TYPES.includes(type)) return json({ error: 'school_type' }, 400);
    const { data: ex } = await sb.from('schools').select('id')
      .ilike('name', name).ilike('city', city).limit(1);
    schoolId = ex?.[0]?.id ?? null;
    if (!schoolId) {
      const { data, error } = await sb.from('schools')
        .insert({ name, city, type, is_verified: false }).select('id').single();
      if (error) {
        const { data: retry } = await sb.from('schools').select('id')
          .ilike('name', name).ilike('city', city).limit(1);
        schoolId = retry?.[0]?.id ?? null;
        if (!schoolId) return json({ error: 'school_create_failed' }, 500);
      } else schoolId = data.id;
    }
  }

  // ── Osztály feloldás (opcionális, iskolához kötve) ──
  let classId: number | null = (b.class_id as number) ?? null;
  if ((classId || b.new_class_name) && !schoolId) return json({ error: 'class_requires_school' }, 400);
  if (classId && b.new_class_name) return json({ error: 'class_conflict' }, 400);
  // class↔school kereszt-validáció: közvetlen class_id-nál a classnak a
  // feloldott iskolához kell tartoznia (különben idegen iskola osztályára lehetne regisztrálni)
  if (classId) {
    const { data: cls } = await sb.from('classes').select('school_id').eq('id', classId).limit(1);
    if (!cls?.length || cls[0].school_id !== schoolId) {
      return json({ error: 'class_school_mismatch' }, 400);
    }
  }
  if (!classId && b.new_class_name) {
    const cname = norm(String(b.new_class_name)).toUpperCase();
    if (cname.length < 1 || cname.length > 10) return json({ error: 'class_invalid' }, 400);
    if (/[<>]/.test(cname)) return json({ error: 'class_invalid' }, 400);
    const { data: ex } = await sb.from('classes').select('id')
      .eq('school_id', schoolId).ilike('name', cname).limit(1);
    classId = ex?.[0]?.id ?? null;
    if (!classId) {
      const { data, error } = await sb.from('classes')
        .insert({ school_id: schoolId, name: cname }).select('id').single();
      if (error) {
        const { data: retry } = await sb.from('classes').select('id')
          .eq('school_id', schoolId).ilike('name', cname).limit(1);
        classId = retry?.[0]?.id ?? null;
        if (!classId) return json({ error: 'class_create_failed' }, 500);
      } else classId = data.id;
    }
  }

  // ── Player ──
  const { data: player, error } = await sb.from('players').insert({
    nickname, school_id: schoolId, class_id: classId,
    consent_is_parent: b.consent_is_parent,
    ...(email ? { email } : {}),
  }).select('id, secret').single();
  if (error) return json({ error: 'player_create_failed' }, 500);

  let school = null, klass = null;
  if (schoolId) {
    const { data } = await sb.from('schools').select('id, name').eq('id', schoolId).single();
    school = data;
  }
  if (classId) {
    const { data } = await sb.from('classes').select('id, name').eq('id', classId).single();
    klass = data;
  }
  return json({ player_id: player.id, secret: player.secret, nickname, school, class: klass }, 201);
});
