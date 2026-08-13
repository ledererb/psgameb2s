import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
const SCHOOL_TYPES = ['altalanos', 'gimnazium', 'szakkozep', 'egyeb'];

Deno.serve(async (req) => {
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

  // school: number | null (megadva) | undefined (nincs mező → ne változzon)
  let schoolId: number | null | undefined = undefined;
  if ('school_id' in b || 'new_school' in b) {
    if (b.school_id && b.new_school) return json({ error: 'school_conflict' }, 400);
    schoolId = (b.school_id as number) ?? null;
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
        if (error) return json({ error: 'school_create_failed' }, 500);
        schoolId = data.id;
      }
    }
  }

  let classId: number | null | undefined = undefined;
  if ('class_id' in b || 'new_class_name' in b) {
    if (b.class_id && b.new_class_name) return json({ error: 'class_conflict' }, 400);
    classId = (b.class_id as number) ?? null;
    // class↔school kereszt-validáció: közvetlen class_id-nál a classnak a
    // ténylegesen beállítandó (vagy változatlan) iskolához kell tartoznia
    if (classId) {
      let effSchool: number | null;
      if (schoolId !== undefined) {
        effSchool = schoolId;
      } else {
        const { data: cur } = await sb.from('players').select('school_id').eq('id', player_id).single();
        effSchool = cur?.school_id ?? null;
      }
      if (!effSchool) return json({ error: 'class_requires_school' }, 400);
      const { data: cls } = await sb.from('classes').select('school_id').eq('id', classId).limit(1);
      if (!cls?.length || cls[0].school_id !== effSchool) {
        return json({ error: 'class_school_mismatch' }, 400);
      }
    }
    if (!classId && b.new_class_name) {
      const effectiveSchool = schoolId !== undefined ? schoolId : undefined;
      if (effectiveSchool === null || effectiveSchool === undefined) {
        // ha a school nem változik, a meglévő school_id kell
        const { data: cur } = await sb.from('players').select('school_id').eq('id', player_id).single();
        if (!cur?.school_id) return json({ error: 'class_requires_school' }, 400);
      }
      const cname = norm(String(b.new_class_name)).toUpperCase();
      if (cname.length < 1 || cname.length > 10) return json({ error: 'class_invalid' }, 400);
      if (/[<>]/.test(cname)) return json({ error: 'class_invalid' }, 400);
      const sid = effectiveSchool ?? (await sb.from('players').select('school_id').eq('id', player_id).single()).data!.school_id;
      const { data: ex } = await sb.from('classes').select('id')
        .eq('school_id', sid).ilike('name', cname).limit(1);
      classId = ex?.[0]?.id ?? null;
      if (!classId) {
        const { data, error } = await sb.from('classes')
          .insert({ school_id: sid, name: cname }).select('id').single();
        if (error) return json({ error: 'class_create_failed' }, 500);
        classId = data.id;
      }
    }
  }

  // szabály: school null esetén a class is null
  const update: Record<string, unknown> = {};
  if (schoolId !== undefined) update.school_id = schoolId;
  if (classId !== undefined) update.class_id = classId;
  if (schoolId === null && classId === undefined) update.class_id = null;
  if (schoolId !== undefined && schoolId !== null && classId === undefined) update.class_id = null; // iskolaváltás → osztály reset

  if (Object.keys(update).length) {
    const { error } = await sb.from('players').update(update).eq('id', player_id);
    if (error) return json({ error: 'update_failed' }, 500);
  }

  const { data: cur } = await sb.from('players')
    .select('school_id, class_id').eq('id', player_id).single();
  let school = null, klass = null;
  if (cur?.school_id) {
    const { data } = await sb.from('schools').select('id, name').eq('id', cur.school_id).single();
    school = data;
  }
  if (cur?.class_id) {
    const { data } = await sb.from('classes').select('id, name').eq('id', cur.class_id).single();
    klass = data;
  }
  return json({ school, class: klass });
});
