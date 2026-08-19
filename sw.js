// ============================================
// Snacky Dash — service worker (PWA-telepíthetőség + offline shell)
// Konzervatív: navigációk network-first (friss deploy számít), statikus
// same-origin GET stale-while-revalidate, cross-origin (Supabase, fontok)
// sosem cache-elve. Verzióbump → régi cache takarítás.
// ============================================

const CACHE = 'snacky-shell-v1';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin) return; // API + CDN fontok: mindig hálózat

    // Navigáció (HTML): network-first, offline fallback a cache-elt shellre
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .then((resp) => {
                    if (resp.ok) {
                        const copy = resp.clone();
                        caches.open(CACHE).then((c) => c.put(e.request, copy));
                    }
                    return resp;
                })
                .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html')))
        );
        return;
    }

    // Statikus same-origin (js/css/png/json): stale-while-revalidate
    e.respondWith(
        caches.match(e.request).then((hit) => {
            const net = fetch(e.request)
                .then((resp) => {
                    if (resp.ok) {
                        const copy = resp.clone();
                        caches.open(CACHE).then((c) => c.put(e.request, copy));
                    }
                    return resp;
                })
                .catch(() => hit);
            return hit || net;
        })
    );
});
