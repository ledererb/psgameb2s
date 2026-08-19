// ============================================
// Snacky Dash B2S — telepítési hint (PWA)
// A) Android/desktop Chrome: beforeinstallprompt → saját „Telepítés" gomb
// B) iOS Safari: útmutató (Megosztás → Főképernyőhöz adás)
// Standalone módban és elutasítás után nem jelenik meg (localStorage).
// ============================================

const DISMISS_KEY = 'snacky_install_hint_dismissed';

const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const isIos = () =>
    /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initInstallHint(anchorEl) {
    if (!anchorEl) return;
    if (isStandalone()) return;                       // már app-ként fut
    if (localStorage.getItem(DISMISS_KEY)) return;    // elutasította korábban

    if (isIos()) {
        render(anchorEl, {
            html: '📲 <strong>Teljes képernyőn játszanál?</strong><br>'
                + '<span class="install-hint-sub">Megosztás (<span class="install-hint-share">□↑</span>) → '
                + '<strong>Főképernyőhöz adás</strong> — és a játék úgy indul, mint egy app!</span>',
            action: null,
        });
        return;
    }

    // Android/desktop Chrome: az esemény csak akkor jön, ha telepíthető (SW+manifest OK)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        render(anchorEl, {
            html: '📲 <strong>Teljes képernyőn játszanál?</strong><br>'
                + '<span class="install-hint-sub">Telepítsd a főképernyődre — app-szerűen, keret nélkül!</span>',
            action: { label: 'Telepítés', prompt: e },
        });
    });
    window.addEventListener('appinstalled', removeHint);
}

function render(anchorEl, { html, action }) {
    removeHint();
    const box = document.createElement('div');
    box.id = 'install-hint';
    box.className = 'install-hint';

    const text = document.createElement('p');
    text.className = 'install-hint-text';
    text.innerHTML = html; // saját, statikus szöveg — nincs user-input
    box.appendChild(text);

    if (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-submit install-hint-btn';
        btn.textContent = action.label;
        btn.addEventListener('click', async () => {
            action.prompt.prompt();
            const { outcome } = await action.prompt.userChoice;
            if (outcome === 'accepted') removeHint();
        });
        box.appendChild(btn);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'install-hint-close';
    close.setAttribute('aria-label', 'Bezárás');
    close.textContent = '×';
    close.addEventListener('click', () => {
        localStorage.setItem(DISMISS_KEY, '1');
        removeHint();
    });
    box.appendChild(close);

    anchorEl.insertAdjacentElement('afterend', box);
}

function removeHint() {
    document.getElementById('install-hint')?.remove();
}
