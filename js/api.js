// ============================================
// Snacky Dash B2S — API-réteg (spec §6.2)
// Minden szerverhívás egy helyen. Olvasás: PostgREST
// view-k + rpc; írás: Edge Functions. Nincs SDK.
// ============================================

import { CONFIG } from './config.js';

const REST = `${CONFIG.SUPABASE_URL}/rest/v1`;
const REST_HEADERS = {
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
};

async function restGet(path) {
    const r = await fetch(`${REST}/${path}`, { headers: REST_HEADERS });
    if (!r.ok) throw Object.assign(new Error(`rest_${r.status}`), { status: r.status });
    return r.json();
}

async function edge(fn, body) {
    let r;
    try {
        r = await fetch(`${CONFIG.EDGE_BASE}/${fn}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        throw Object.assign(new Error('network'), { code: 'network' });
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw Object.assign(new Error(data.error ?? `edge_${r.status}`),
            { code: data.error, status: r.status });
    }
    return data;
}

const enc = encodeURIComponent;

export const api = {
    // ── Olvasás (view-k/rpc) ──
    searchSchools: (q) =>
        restGet(`schools?select=id,name,city,type&or=(name.ilike.*${enc(q)}*,city.ilike.*${enc(q)}*)&order=name&limit=10`),
    getClasses: (schoolId) =>
        restGet(`classes?select=id,name&school_id=eq.${schoolId}&order=name&limit=50`),
    fetchIndividual: () =>
        restGet('leaderboard_individual?select=player_id,nickname,school_name,class_name,best_score&limit=100'),
    fetchSchools: () =>
        restGet('leaderboard_schools?select=school_id,name,city,avg_score,player_count&limit=100'),
    fetchClasses: (schoolId) =>
        restGet(`leaderboard_classes?select=class_id,name,total_score,player_count&school_id=eq.${schoolId}&limit=100`),

    // ── Írás (Edge Functions) ──
    register: (payload) => edge('register', payload),
    submitScore: (payload) => edge('submit-score', payload),
    updateAffiliation: (payload) => edge('update-affiliation', payload),
    deleteMyData: (payload) => edge('delete-my-data', payload),
};
