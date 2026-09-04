// ============================================
// Snacky Dash — Main Entry Point
// Screen management, canvas setup, input
// handling, and game orchestration.
// Now includes slide/duck input handling.
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, INITIAL_SPEED, MAX_SPEED, formatScore } from './utils.js';
import { Game } from './game.js';
import { AudioManager } from './audio.js';
import { api } from './api.js';
import { playerStore } from './player-store.js';
import { initRegistration } from './registration.js';
import { LeaderboardUI } from './leaderboard.js';
import { SceneManager } from './scene.js';
import { World3D } from './world.js';
import { SKINS, getSelectedSkin, selectSkin, unlockByScore, makeShirtTexture } from './skins.js';
import { SkinPreview } from './skin-preview.js';
import { initInstallHint } from './install-hint.js';

// crypto.randomUUID régebbi böngészőkben nem létezik — RFC4122 v4 fallback
function newRunId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

// ── State ──

let state = 'menu'; // 'menu' | 'playing' | 'gameover'
let canvas;
let overlayCanvas, overlayCtx;
let game, audio;
let sceneMgr, world;
let viewW = CANVAS_WIDTH, viewH = CANVAS_HEIGHT; // valós CSS-px viewport

// Szerver-/user-adat HTML-escape innerHTML-interpolációhoz (XSS-védelem)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Slide key tracking
let slideKeyDown = false;

let runStartTime = 0;         // futamidő-mérés (submit-score duration_ms)
let pendingScore = null;      // beküldésre váró futam
let submitTimer = null;       // visszatérő játékos auto-submit késleltetése
let skinPreview = null;       // ruhatára 3D preview (menü)
const shirtTextures = {};     // skin.id → CanvasTexture cache
let leaderboardGameover, leaderboardOverlay; // LeaderboardUI példányok

// Touch tracking for swipe detection
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchIsSliding = false;

// DOM elements (cached)
let menuScreen, gameOverScreen;
let startBtn, restartBtn;
let finalScoreEl;
let highScoreEl;
let saveResultEl, teamOptRow, teamOptCb, teamOptLabel, playerBadge;

// ── Initialization ──

function init() {
    canvas = document.getElementById('gameCanvas');
    overlayCanvas = document.getElementById('overlayCanvas');
    overlayCtx = overlayCanvas.getContext('2d');

    // Cache DOM
    menuScreen = document.getElementById('menu-screen');
    gameOverScreen = document.getElementById('gameover-screen');
    startBtn = document.getElementById('start-btn');
    restartBtn = document.getElementById('restart-btn');
    finalScoreEl = document.getElementById('final-score');
    highScoreEl = document.getElementById('high-score');
    saveResultEl = document.getElementById('save-result');
    teamOptRow = document.getElementById('team-opt-row');
    teamOptCb = document.getElementById('team-opt');
    teamOptLabel = document.getElementById('team-opt-label');
    playerBadge = document.getElementById('player-badge');

    // Create managers
    audio = new AudioManager();
    sceneMgr = new SceneManager(canvas);
    world = new World3D(sceneMgr);
    game = new Game(audio, world, sceneMgr);

    // Debug-handle a vizuális verifikációkhoz (spec §5) — csak ?debug=1 mellett,
    // élőben ne legyen elérhető (csalásvédelem: onGameOver tetszőleges ponttal)
    if (new URLSearchParams(location.search).has('debug')) {
        window.__snacky = { game, world, playerStore, api };
    }

    leaderboardGameover = new LeaderboardUI(
        document.getElementById('leaderboard-list'),
        document.getElementById('lb-note'));
    leaderboardOverlay = new LeaderboardUI(
        document.getElementById('lb-overlay-list'),
        document.getElementById('lb-overlay-note'));

    // Tab-váltás mindkét példányban
    document.querySelectorAll('.lb-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            btn.closest('.lb-tabs').querySelectorAll('.lb-tab')
                .forEach((b) => b.classList.toggle('active', b === btn));
            const ui = btn.closest('#lb-overlay') ? leaderboardOverlay : leaderboardGameover;
            ui.show(btn.dataset.tab);
        });
    });

    document.getElementById('leaderboard-btn').addEventListener('click', () => {
        document.getElementById('lb-overlay').classList.remove('hidden');
        leaderboardOverlay.show('individual');
    });
    document.getElementById('lb-overlay-close').addEventListener('click', () => {
        document.getElementById('lb-overlay').classList.add('hidden');
    });

    teamOptCb.addEventListener('change', () => {
        // opt-in változás → újraütemezett beküldés az új értékkel
        if (pendingScore && state === 'gameover') scheduleSubmit();
    });

    renderPlayerBadge();
    flushOutbox();

    // Game over callback
    game.onGameOver = (score, stats) => {
        state = 'gameover';
        pendingScore = {
            score: Math.floor(score),
            distance_m: Math.round(stats?.distance ?? 0),
            duration_ms: Math.max(3000, Math.round(performance.now() - runStartTime)),
            client_run_id: newRunId(),
        };
        showGameOverScreen(score, stats);
        const newlyUnlocked = unlockByScore(pendingScore.score);
        if (newlyUnlocked.length) showSkinUnlockBanner(newlyUnlocked);
        handlePostGame();
    };

    // Show high score on menu
    updateHighScore();

    // Dorko-póló skinek: visszamenőleges feloldás + selector + preview
    initSkins();

    // PWA: telepítési hint + service worker (telepíthetőség/offline shell)
    initInstallHint(document.getElementById('start-btn'));
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => { /* SW opcionális */ });
    }

    // ── Event Listeners ──

    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);

    // ── Keyboard input ──

    document.addEventListener('keydown', (e) => {
        // Űrlapmezőbe gépelés ne triggerelje a játékvezérlést
        // (a KeyA/KeyD/Space preventDefault különben elnyeli a gépelést)
        if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;

        // Jump: Space or ArrowUp
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            handleAction();
        }

        // Slide / Ground Pound: ArrowDown
        if (e.code === 'ArrowDown') {
            e.preventDefault();
            if (state === 'playing') {
                if (!game.player.isOnGround) {
                    game.handleGroundPound();
                } else {
                    slideKeyDown = true;
                    game.handleSlide();
                }
            }
        }

        // Lane switch left
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
            e.preventDefault();
            if (state === 'playing') game.handleLaneChange(-1);
        }

        // Lane switch right
        if (e.code === 'ArrowRight' || e.code === 'KeyD') {
            e.preventDefault();
            if (state === 'playing') game.handleLaneChange(1);
        }

        // WASD alternatív vezérlés: W = ugrás, S = csúszás
        if (e.code === 'KeyW') {
            e.preventDefault();
            handleAction();
        }
        if (e.code === 'KeyS') {
            e.preventDefault();
            if (state === 'playing') {
                if (!game.player.isOnGround) {
                    game.handleGroundPound();
                } else {
                    slideKeyDown = true;
                    game.handleSlide();
                }
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        // Release slide on ArrowDown or KeyS up
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
            slideKeyDown = false;
            if (state === 'playing') {
                game.handleSlideRelease();
            }
        }
    });

    // ── Touch input (mobile) ──
    // Supports: tap = jump, swipe down = slide, release = end slide

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
        touchIsSliding = false;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (state !== 'playing') return;

        const touch = e.touches[0];
        const deltaY = touch.clientY - touchStartY;
        const deltaX = touch.clientX - touchStartX;

        // Swipe down detected — ground pound (in air) or slide (on ground)
        if (deltaY > 30 && !touchIsSliding) {
            touchIsSliding = true;
            if (!game.player.isOnGround) {
                game.handleGroundPound();
            } else {
                game.handleSlide();
            }
        }

        // Horizontal swipe — lane switch
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) && !touchIsSliding) {
            game.handleLaneChange(deltaX > 0 ? 1 : -1);
            touchStartX = touch.clientX; // re-arm for multi-lane swipes
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();

        if (touchIsSliding) {
            // End the slide
            touchIsSliding = false;
            if (state === 'playing') {
                game.handleSlideRelease();
            }
            return;
        }

        // If it was a tap (not a swipe), treat as jump
        const deltaY = Math.abs((e.changedTouches[0]?.clientY || touchStartY) - touchStartY);
        if (deltaY < 10) {
            handleAction();
        }
    }, { passive: false });

    // Click on canvas (also works as fallback)
    canvas.addEventListener('click', (e) => {
        handleAction();
    });

    // Handle window resize for responsive canvas
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 100));
    document.addEventListener('fullscreenchange', () => setTimeout(handleResize, 60));

    // Start render loop
    showMenu();
    requestAnimationFrame(loop);
}

// ── Action handler ──

function handleAction() {
    if (state === 'menu') {
        startGame();
    } else if (state === 'playing') {
        game.handleJump();
    }
    // gameover state: buttons handle actions
}

// ── Screen transitions ──

function showMenu() {
    state = 'menu';
    menuScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden');
    updateHighScore();

    // Reset slide state on menu
    slideKeyDown = false;
    touchIsSliding = false;
}

/**
 * Fullscreen-kérés a START user-gesture-ben. iPhone Safari nem támogatja —
 * ott a promise elutasítás csendesen elnyelődik, a játék ettől függetlenül indul.
 * Sikeres fullscreen után mobilon megpróbáljuk portraitba lockolni.
 */
function tryFullscreen() {
    const el = document.documentElement;
    if (!el.requestFullscreen) return;
    el.requestFullscreen().then(() => {
        if (screen.orientation && screen.orientation.lock &&
            window.innerWidth <= window.innerHeight) {
            screen.orientation.lock('portrait').catch(() => {});
        }
    }).catch(() => {});
}

function startGame() {
    runStartTime = performance.now();
    tryFullscreen();
    audio.init();
    audio.resume();
    state = 'playing';
    menuScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    document.getElementById('skin-unlock-banner').classList.add('hidden');
    skinPreview?.setActive(false);

    // Reset input states
    slideKeyDown = false;
    touchIsSliding = false;

    game.start();
}

function showGameOverScreen(score, stats) {
    gameOverScreen.classList.remove('hidden');
    finalScoreEl.textContent = formatScore(score);
    saveResultEl.classList.add('hidden');
    document.getElementById('reg-overlay').classList.add('hidden');

    // Run stats
    if (stats) {
        document.getElementById('stat-distance').textContent = `${formatScore(stats.distance)} m`;
        document.getElementById('stat-combo').textContent = `×${stats.maxCombo}`;
        document.getElementById('stat-nearmiss').textContent = stats.nearMisses;
        document.getElementById('stat-bosses').textContent = stats.bosses;
    }

    // Tab-active reset: az egyéni tab legyen aktív — az előző game overen
    // történt tab-váltás ne ragadjon bele a gombok állapotába
    gameOverScreen.querySelectorAll('.lb-tab').forEach((b) =>
        b.classList.toggle('active', b.dataset.tab === 'individual'));
    leaderboardGameover.show('individual');
}

// ── Dorko-póló skinek (kozmetika; spec: 2026-08-14-dorko-polo-skinek-design.md) ──

function shirtTextureFor(skin) {
    if (!shirtTextures[skin.id]) shirtTextures[skin.id] = makeShirtTexture(skin);
    return shirtTextures[skin.id];
}

function applySelectedSkin() {
    const skin = getSelectedSkin();
    const texture = skin ? shirtTextureFor(skin) : null;
    game.player.setSkin(texture);
    skinPreview?.setSkin(texture);
}

function buildSkinRow() {
    const row = document.getElementById('skin-row');
    row.innerHTML = '';
    const { unlocked, selected } = playerStore.loadSkins();

    const addBtn = (id, content, { locked = false, active = false, color = null, title = '', skin = null } = {}) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'skin-btn' + (locked ? ' locked' : '') + (active ? ' active' : '');
        if (color) b.style.setProperty('--skin-color', color);
        b.title = title;
        b.textContent = content;
        b.addEventListener('click', () => {
            if (locked) {
                // zárolt póló is megnézhető a preview-ban (kiválasztani nem)
                if (skin) skinPreview?.setSkin(shirtTextureFor(skin));
                return;
            }
            selectSkin(id);
            applySelectedSkin();
            buildSkinRow();
        });
        row.appendChild(b);
    };

    addBtn(null, '🌭', { title: 'Alap Snacky (póló nélkül)', active: !selected });
    for (const s of SKINS) {
        const isOpen = unlocked.includes(s.id);
        addBtn(s.id, isOpen ? s.short : `🔒 ${s.threshold.toLocaleString('hu-HU')}`, {
            locked: !isOpen,
            active: selected === s.id,
            color: s.base,
            skin: s,
            title: isOpen ? s.name : `${s.name} — ${s.threshold.toLocaleString('hu-HU')} ponttól (kattints a megnézéséhez)`,
        });
    }
}

function showSkinUnlockBanner(newly) {
    const banner = document.getElementById('skin-unlock-banner');
    banner.innerHTML = `🎉 ÚJ PÓLÓ FELOLDVA: <strong>${esc(newly.map((s) => s.short).join(', '))}</strong>`
        + '<br><span class="skin-unlock-sub">A menüben, Snacky ruhatárában tudod felvenni!</span>';
    banner.classList.remove('hidden');
    buildSkinRow();
}

function initSkins() {
    unlockByScore(playerStore.getBest()); // visszamenőleges, csendes feloldás a legjobb alapján
    skinPreview = new SkinPreview(document.getElementById('skin-preview'));
    applySelectedSkin();
    buildSkinRow();
}

function handlePostGame() {
    const player = playerStore.load();
    if (player) {
        // Visszatérő játékos: csapat-opt-in + auto-submit 1,5 mp múlva
        const teamName = player.class
            ? `${player.school?.name ?? ''} ${player.class.name}`.trim()
            : player.school?.name ?? null;
        teamOptRow.classList.toggle('hidden', !teamName);
        if (teamName) teamOptLabel.textContent = `Ez a pont számítson ide: ${teamName}`;
        scheduleSubmit();
    } else {
        // Új játékos: regisztrációs űrlap
        initRegistration({
            mode: 'register',
            onRegistered: () => scheduleSubmit(),
            onSkip: () => { pendingScore = null; },
        });
    }
    // a ranglista-megjelenítés a showGameOverScreen-ben már lefutott — itt nem kell újra
}

function scheduleSubmit() {
    clearTimeout(submitTimer);
    submitTimer = setTimeout(submitPendingScore, 1500);
}

async function submitPendingScore() {
    if (!pendingScore) return;
    const player = playerStore.load();
    if (!player) return; // regisztráció közben megszakítva
    const payload = {
        player_id: player.player_id, secret: player.secret,
        ...pendingScore,
        counts_for_team: teamOptCb.checked,
    };
    saveResultEl.classList.remove('hidden');
    saveResultEl.innerHTML = 'Mentés…';
    try {
        const stats = await api.submitScore(payload);
        playerStore.setBest(stats.best_score ?? pendingScore.score);
        playerStore.outboxRemove(pendingScore.client_run_id);
        pendingScore = null;
        renderSaveResult(stats);
        // sikeres beküldés után a sorban várakozó korábbi futamok is menjenek fel (spec §6.6)
        flushOutbox().catch(() => {});
    } catch (e) {
        // Csak az újrapróbálható hibák kerülnek outboxba: rate_limited, network, 5xx.
        // A 4xx szerver-elutasítások (score_implausible, duration_invalid, score_invalid,
        // forbidden, missing_credentials) újrapróbálva sem mennének át — nem mentjük el.
        const retriable = e.code === 'rate_limited' || e.code === 'network' || (e.status ?? 0) >= 500;
        if (retriable) {
            playerStore.outboxAdd(payload);
            saveResultEl.innerHTML = e.code === 'rate_limited'
                ? '<span class="sr-warn">Túl gyors egymásután — a pontod később megy fel automatikusan.</span>'
                : '<span class="sr-warn">Nincs kapcsolat — a pontod az eszközödön van, később feltöltjük. ✓</span>';
        } else if (e.code === 'score_implausible' || e.code === 'duration_invalid' || e.code === 'score_invalid') {
            saveResultEl.innerHTML =
                '<span class="sr-warn">Ezt a futamot a szerver nem fogadta el (szokatlan adat).</span>';
        } else {
            // forbidden / missing_credentials / egyéb 4xx
            saveResultEl.innerHTML =
                '<span class="sr-warn">A mentés nem sikerült — regisztrálj újra a „nem te vagy?" linkkel.</span>';
        }
        pendingScore = null;
    }
}

function renderSaveResult(stats) {
    const parts = [`<span class="sr-good">Pont mentve! ✓</span>`];
    parts.push(`🧑 Egyéni lista: <strong>#${stats.rank_individual}</strong>`);
    if (stats.school) {
        parts.push(stats.school.below_threshold
            ? `🏫 Az iskolád még nincs ranglistán — még <strong>${5 - stats.school.players}</strong> játékos kell!`
            : `🏫 Iskolád: <strong>#${stats.school.rank}</strong> (átlag ${formatScore(stats.school.avg)})`);
    }
    if (stats.class) {
        parts.push(`👥 Osztályod: <strong>#${stats.class.rank}</strong> (${formatScore(stats.class.total)} pont)`);
    }
    saveResultEl.innerHTML = parts.join('<br>');
    leaderboardGameover.show(leaderboardGameover.tab); // frissítés
}

async function flushOutbox() {
    for (const entry of playerStore.outboxList()) {
        try {
            await api.submitScore(entry);
            playerStore.outboxRemove(entry.client_run_id);
        } catch (e) {
            // Csak network / rate_limited / 5xx esetén állunk meg (offline vagy
            // ideiglenes szerverhiba → sorban visszajövünk). A 4xx elutasítások
            // újrapróbálva sem mennének át → kidobjuk az entry-t és folytatjuk.
            if (e.code === 'rate_limited' || e.code === 'network' || (e.status ?? 0) >= 500) break;
            playerStore.outboxRemove(entry.client_run_id);
        }
    }
}

function renderPlayerBadge() {
    const player = playerStore.load();
    if (!player) { playerBadge.classList.add('hidden'); return; }
    const where = player.class
        ? `${esc(player.school?.name ?? '')}, ${esc(player.class.name)}`
        : esc(player.school?.name ?? 'egyéni játékos');
    playerBadge.innerHTML =
        `Szia, <strong>${esc(player.nickname)}</strong>! (${where})` +
        `<a id="badge-edit">módosítás</a><a id="badge-reset">nem te vagy?</a>`;
    playerBadge.classList.remove('hidden');
    document.getElementById('badge-reset').addEventListener('click', () => {
        if (confirm('Biztosan kijelentkezel? A regisztrációd a szerveren megmarad.')) {
            playerStore.clear();
            renderPlayerBadge();
        }
    });
    document.getElementById('badge-edit').addEventListener('click', () => {
        initRegistration({
            mode: 'edit', prefill: player,
            onRegistered: renderPlayerBadge, onSkip: () => {},
        });
    });
}

function updateHighScore() {
    const best = playerStore.getBest();
    if (highScoreEl) {
        highScoreEl.textContent = best > 0 ? `🏆 Személyes legjobb: ${formatScore(best)}` : '';
    }
}

// ── Responsive canvas ──

function handleResize() {
    const maxW = window.innerWidth;
    const maxH = window.innerHeight;
    const portrait = maxW <= maxH;
    let w, h;
    if (portrait) {
        // Portrait: teljes képernyő — a kamera FOV oldja meg a sávlefedést
        w = maxW; h = maxH;
    } else {
        // Fekvő: a megszokott 2:1 letterbox
        const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
        w = maxW; h = w / aspect;
        if (h > maxH) { h = maxH; w = h * aspect; }
    }
    viewW = w; viewH = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    overlayCanvas.style.width = `${w}px`;
    overlayCanvas.style.height = `${h}px`;

    // Overlay backing store a valós méretre (DPR-kezelve)
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width = Math.round(w * dpr);
    overlayCanvas.height = Math.round(h * dpr);
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    sceneMgr.setViewport(w, h);
    game.setViewport(w, h);
}

// ── Main render loop ──

function loop() {
    if (state === 'playing') {
        game.update();
        game.drawOverlay(overlayCtx);
        world.update(game.getSpeed());
        sceneMgr.updateCamera(
            (game.getSpeed() - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED), // speedNorm 0..1
            game.player.worldX                                               // camera follows lane
        );
        sceneMgr.render();
    } else if (state === 'menu') {
        drawMenuBackground();
        world.update(1.5); // lassú csúszás menüben is
        sceneMgr.updateCamera(0, 0);
        sceneMgr.render();
    } else if (state === 'gameover') {
        // Draw frozen game state behind overlay
        game.drawOverlay(overlayCtx);
        // Dark overlay on canvas
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        overlayCtx.fillRect(0, 0, viewW, viewH);
        sceneMgr.render();
    }

    requestAnimationFrame(loop);
}

// ── Menu background animation ──

let menuBgOffset = 0;

function drawMenuBackground() {
    // Animate background slowly even on menu
    menuBgOffset += 0.02;

    overlayCtx.clearRect(0, 0, viewW, viewH);

    // Sky gradient
    const grad = overlayCtx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, '#0B0B2B');
    grad.addColorStop(0.5, '#141452');
    grad.addColorStop(0.8, '#1A2466');
    grad.addColorStop(1, '#2C3E50');
    overlayCtx.fillStyle = grad;
    overlayCtx.fillRect(0, 0, viewW, viewH);

    // Stars
    overlayCtx.fillStyle = 'rgba(255,255,230,0.4)';
    for (let i = 0; i < 40; i++) {
        const sx = (i * 97 + menuBgOffset * 10) % viewW;
        const sy = (i * 53) % (viewH * 0.6);
        const size = 0.5 + (i % 3) * 0.5;
        overlayCtx.beginPath();
        overlayCtx.arc(sx, sy, size, 0, Math.PI * 2);
        overlayCtx.fill();
    }

    // Simple ground
    overlayCtx.fillStyle = '#2c3e50';
    overlayCtx.fillRect(0, viewH - 80, viewW, 80);
    overlayCtx.fillStyle = '#8E8E8E';
    overlayCtx.fillRect(0, viewH - 80, viewW, 4);
}

// ── Boot ──

document.addEventListener('DOMContentLoaded', init);
