// ============================================
// Snacky Dash B2S — helyi játékos-tároló (spec §6.3)
// localStorage: profil, outbox (nem küldött pontok),
// személyes legjobb, ranglista-cache.
// ============================================

const KEY = 'snacky_player';
const OUTBOX = 'snacky_outbox';
const BEST = 'snacky_personal_best';
const LB_CACHE = 'snacky_lb_cache';
const SKINS = 'snacky_skins';

function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
}

export const playerStore = {
    // ── Profil ──
    load: () => readJson(KEY, null),
    save: (player) => localStorage.setItem(KEY, JSON.stringify(player)),
    clear: () => localStorage.removeItem(KEY),

    // ── Outbox (offline pontmentés) ──
    outboxList: () => readJson(OUTBOX, []),
    outboxAdd(entry) {
        const list = playerStore.outboxList();
        list.push(entry);
        localStorage.setItem(OUTBOX, JSON.stringify(list));
    },
    outboxRemove(clientRunId) {
        localStorage.setItem(OUTBOX,
            JSON.stringify(playerStore.outboxList().filter((e) => e.client_run_id !== clientRunId)));
    },

    // ── Személyes legjobb (menü „Legjobb" sor) ──
    getBest: () => Number(localStorage.getItem(BEST) ?? 0),
    setBest(score) {
        if (score > playerStore.getBest()) localStorage.setItem(BEST, String(score));
    },

    // ── Ranglista-cache (offline fallback) ──
    cacheLb(tab, data) {
        const cache = readJson(LB_CACHE, {});
        cache[tab] = { at: Date.now(), data };
        try { localStorage.setItem(LB_CACHE, JSON.stringify(cache)); } catch { /* túlcsordulás: nem kritikus */ }
    },
    readLbCache: (tab) => readJson(LB_CACHE, {})[tab] ?? null,

    // ── Skinek (kozmetika, kliensoldali) ──
    loadSkins: () => ({ unlocked: [], selected: null, ...readJson(SKINS, {}) }),
    saveSkins(state) {
        try { localStorage.setItem(SKINS, JSON.stringify(state)); } catch { /* nem kritikus */ }
    },
};
