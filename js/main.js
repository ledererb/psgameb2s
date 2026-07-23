// ============================================
// Snacky Dash — Main Entry Point
// Screen management, canvas setup, input
// handling, and game orchestration.
// Now includes slide/duck input handling.
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, INITIAL_SPEED, MAX_SPEED, formatScore } from './utils.js';
import { Game } from './game.js';
import { AudioManager } from './audio.js';
import { Leaderboard } from './leaderboard.js';
import { SceneManager } from './scene.js';
import { World3D } from './world.js';

// ── State ──

let state = 'menu'; // 'menu' | 'playing' | 'gameover'
let canvas;
let overlayCanvas, overlayCtx;
let game, audio, leaderboard;
let sceneMgr, world;

// Slide key tracking
let slideKeyDown = false;

// Touch tracking for swipe detection
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchIsSliding = false;

// DOM elements (cached)
let menuScreen, gameOverScreen;
let startBtn, restartBtn, submitBtn;
let emailInput, finalScoreEl, leaderboardContainer;
let highScoreEl;

// ── Initialization ──

function init() {
    canvas = document.getElementById('gameCanvas');
    overlayCanvas = document.getElementById('overlayCanvas');
    overlayCtx = overlayCanvas.getContext('2d');

    // HiDPI/Retina support: scale overlay backing store
    // (the main canvas is managed by SceneManager's WebGL renderer)
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width = CANVAS_WIDTH * dpr;
    overlayCanvas.height = CANVAS_HEIGHT * dpr;
    overlayCtx.scale(dpr, dpr);

    // Cache DOM
    menuScreen = document.getElementById('menu-screen');
    gameOverScreen = document.getElementById('gameover-screen');
    startBtn = document.getElementById('start-btn');
    restartBtn = document.getElementById('restart-btn');
    submitBtn = document.getElementById('submit-score-btn');
    emailInput = document.getElementById('email-input');
    finalScoreEl = document.getElementById('final-score');
    leaderboardContainer = document.getElementById('leaderboard-list');
    highScoreEl = document.getElementById('high-score');

    // Create managers
    audio = new AudioManager();
    leaderboard = new Leaderboard();
    sceneMgr = new SceneManager(canvas);
    world = new World3D(sceneMgr);
    game = new Game(audio, world, sceneMgr);

    // Game over callback
    game.onGameOver = (score) => {
        state = 'gameover';
        showGameOverScreen(score);
    };

    // Show high score on menu
    updateHighScore();

    // ── Event Listeners ──

    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);
    submitBtn.addEventListener('click', submitScore);

    // ── Keyboard input ──

    document.addEventListener('keydown', (e) => {
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
    });

    document.addEventListener('keyup', (e) => {
        // Release slide on ArrowDown up
        if (e.code === 'ArrowDown') {
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

    // Email input: submit on Enter
    emailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitScore();
    });

    // Handle window resize for responsive canvas
    handleResize();
    window.addEventListener('resize', handleResize);

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

function startGame() {
    audio.init();
    audio.resume();
    state = 'playing';
    menuScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    // Reset input states
    slideKeyDown = false;
    touchIsSliding = false;

    game.start();
}

function showGameOverScreen(score) {
    gameOverScreen.classList.remove('hidden');
    finalScoreEl.textContent = formatScore(score);
    emailInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Pontszám mentése';

    // Show leaderboard
    leaderboard.renderInto(leaderboardContainer);

    // Focus email input after short delay
    setTimeout(() => emailInput.focus(), 300);
}

function submitScore() {
    const email = emailInput.value.trim();
    if (!Leaderboard.isValidEmail(email)) {
        emailInput.classList.add('error');
        emailInput.placeholder = 'Kérlek adj meg egy érvényes e-mailt!';
        setTimeout(() => {
            emailInput.classList.remove('error');
            emailInput.placeholder = 'te@email.com';
        }, 2000);
        return;
    }

    const rank = leaderboard.addScore(email, game.getScore());
    submitBtn.disabled = true;
    submitBtn.textContent = `#${rank} helyen vagy! 🎉`;

    // Refresh leaderboard display
    leaderboard.renderInto(leaderboardContainer);
}

function updateHighScore() {
    const hs = leaderboard.getHighScore();
    const daily = leaderboard.getDailyHighScore();
    if (highScoreEl) {
        let text = '';
        if (hs > 0) {
            text = `🏆 Legjobb: ${formatScore(hs)}`;
            if (daily > 0) {
                text += ` | 📅 Mai rekord: ${formatScore(daily)}`;
            }
        }
        highScoreEl.textContent = text;
    }
}

// ── Responsive canvas ──

function handleResize() {
    const container = document.getElementById('game-container');
    if (!container) return;

    const maxW = window.innerWidth;
    const maxH = window.innerHeight;
    const aspect = CANVAS_WIDTH / CANVAS_HEIGHT; // 2:1
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
        h = maxH;
        w = h * aspect;
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    overlayCanvas.style.width = `${w}px`;
    overlayCanvas.style.height = `${h}px`;

    // Update overlay backing store for current DPR (handles display changes)
    const dpr = window.devicePixelRatio || 1;
    if (overlayCanvas.width !== CANVAS_WIDTH * dpr) {
        overlayCanvas.width = CANVAS_WIDTH * dpr;
        overlayCanvas.height = CANVAS_HEIGHT * dpr;
        overlayCtx.scale(dpr, dpr);
    }
}

// ── Main render loop ──

function loop() {
    if (state === 'playing') {
        game.update();
        game.draw(overlayCtx);
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
        game.draw(overlayCtx);
        // Dark overlay on canvas
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        overlayCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        sceneMgr.render();
    }

    requestAnimationFrame(loop);
}

// ── Menu background animation ──

let menuBgOffset = 0;

function drawMenuBackground() {
    // Animate background slowly even on menu
    menuBgOffset += 0.02;

    overlayCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Sky gradient
    const grad = overlayCtx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, '#0B0B2B');
    grad.addColorStop(0.5, '#141452');
    grad.addColorStop(0.8, '#1A2466');
    grad.addColorStop(1, '#2C3E50');
    overlayCtx.fillStyle = grad;
    overlayCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stars
    overlayCtx.fillStyle = 'rgba(255,255,230,0.4)';
    for (let i = 0; i < 40; i++) {
        const sx = (i * 97 + menuBgOffset * 10) % CANVAS_WIDTH;
        const sy = (i * 53) % (CANVAS_HEIGHT * 0.6);
        const size = 0.5 + (i % 3) * 0.5;
        overlayCtx.beginPath();
        overlayCtx.arc(sx, sy, size, 0, Math.PI * 2);
        overlayCtx.fill();
    }

    // Simple ground
    overlayCtx.fillStyle = '#2c3e50';
    overlayCtx.fillRect(0, 320, CANVAS_WIDTH, 80);
    overlayCtx.fillStyle = '#8E8E8E';
    overlayCtx.fillRect(0, 320, CANVAS_WIDTH, 4);
}

// ── Boot ──

document.addEventListener('DOMContentLoaded', init);
