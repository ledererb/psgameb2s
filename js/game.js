// ============================================
// Snacky Dash — Game Engine
// Core game loop, entity management, collision,
// spawning, particles, screen shake, HUD.
// Enhanced with: combo system, power-ups, pits,
// boss encounters, milestones, trail + weather.
// ============================================

import {
    CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y,
    INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT,
    HOTDOG_POINTS, DONUT_CHANCE,
    MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP,
    MIN_COLLECTIBLE_GAP, MAX_COLLECTIBLE_GAP,
    checkCollision, randomBetween, formatScore
} from './utils.js';

import { Player } from './player.js';
import { Obstacle } from './obstacle.js';
import { Collectible } from './collectible.js';
import { ParallaxBackground } from './background.js';
import { Pit } from './pit.js';
import { PowerUp } from './powerup.js';
import { TrailEffect, WeatherSystem } from './effects.js';

// ── Particle class for collect/hit effects ──

class Particle {
    constructor(x, y, color, speed = 1) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 5 * speed;
        this.vy = (Math.random() - 0.5) * 5 * speed - 2;
        this.life = 25 + Math.random() * 15;
        this.maxLife = this.life;
        this.color = color;
        this.size = 2 + Math.random() * 3;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.08;
        this.life--;
        this.size *= 0.97;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x | 0, this.y | 0, Math.max(0.5, this.size), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    isDead() {
        return this.life <= 0;
    }
}

// ── Floating text for score popups ──

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 50;
        this.maxLife = 50;
    }

    update() {
        this.y -= 1.2;
        this.life--;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        const scale = 0.8 + (1 - alpha) * 0.4;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(16 * scale)}px "Outfit", sans-serif`;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.strokeText(this.text, this.x | 0, this.y | 0);
        ctx.fillText(this.text, this.x | 0, this.y | 0);
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

// ── Main Game Class ──

export class Game {
    constructor(audio) {
        this.audio = audio;
        this.player = new Player();
        this.background = new ParallaxBackground();
        this.obstacles = [];
        this.collectibles = [];
        this.particles = [];
        this.floatingTexts = [];

        this.gameSpeed = INITIAL_SPEED;
        this.score = 0;
        this.isRunning = false;

        // Spawn timers
        this.obstacleTimer = 60;
        this.collectibleTimer = 80;

        // Screen shake
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeDuration = 0;

        // Speed lines at high speed
        this.speedLines = [];

        // ── Screen flash system ──
        this.screenFlash = { alpha: 0, color: '#FFFFFF' };

        // ── Animated score display ──
        this.displayedScore = 0;

        // ── Combo system ──
        this.comboMultiplier = 1;
        this.comboTimer = 0;
        this.comboMaxTimer = 180; // 3 sec at 60fps
        this.maxCombo = 10;

        // ── Power-ups ──
        this.powerUps = [];            // spawned power-ups on track
        this.activeMagnet = { active: false, timer: 0, duration: 480 };    // 8 sec
        this.activeDoubleScore = { active: false, timer: 0, duration: 600 }; // 10 sec
        this.powerUpTimer = 300;       // initial delay before first power-up

        // ── Pits ──
        this.pits = [];
        this.pitTimer = 200;

        // ── Boss encounters ──
        this.bossActive = false;
        this.bossWarning = false;
        this.bossWarningTimer = 0;
        this.bossPatternIndex = 0;
        this.bossSpawnTimer = 0;
        this.bossCurrentPattern = null;
        this.bossPatternStep = 0;
        this.nextBossScore = 5000;
        this.bossRestTimer = 0;
        this.bossPatterns = [
            // Pattern 1: Jump-Slide alternating (predictable rhythm)
            ['crate', 'barrier', 'crate', 'barrier', 'crate', 'barrier', 'tall_crate', 'barrier'],
            // Pattern 2: Rolling chaos with slides
            ['rolling_barrel', 'crate', 'rolling_barrel', 'barrier', 'rolling_barrel', 'crate', 'tall_crate', 'crate'],
            // Pattern 3: Mixed with pits
            ['barrier', 'crate', 'pit', 'barrier', 'crate', 'pit', 'barrier', 'tall_crate']
        ];

        // ── Milestones (theme changes) ──
        this.milestoneThresholds = [1000, 3000, 5000, 8000];
        this.currentMilestone = 0;
        this.milestoneBanner = null; // { text, timer }
        this.milestoneNames = ['🌅 HAJNAL ÉRA!', '☀️ NAPPALI ÉRA!', '🌆 NAPLEMENTE ÉRA!', '🌃 NEON VÁROS!'];

        // ── Visual effects ──
        this.trailEffect = new TrailEffect();
        this.weatherSystem = new WeatherSystem(CANVAS_WIDTH, CANVAS_HEIGHT);

        // Callbacks
        this.onGameOver = null;
        this.onScoreChange = null;
    }

    start() {
        this.reset();
        this.isRunning = true;
    }

    reset() {
        this.player.reset();
        this.obstacles = [];
        this.collectibles = [];
        this.particles = [];
        this.floatingTexts = [];
        this.gameSpeed = INITIAL_SPEED;
        this.score = 0;
        this.obstacleTimer = 80;
        this.collectibleTimer = 100;
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeDuration = 0;
        this.speedLines = [];

        // Reset flash + animated score
        this.screenFlash = { alpha: 0, color: '#FFFFFF' };
        this.displayedScore = 0;

        // Reset combo
        this.comboMultiplier = 1;
        this.comboTimer = 0;

        // Reset power-ups
        this.powerUps = [];
        this.activeMagnet = { active: false, timer: 0, duration: 480 };
        this.activeDoubleScore = { active: false, timer: 0, duration: 600 };
        this.powerUpTimer = 300;

        // Reset pits
        this.pits = [];
        this.pitTimer = 200;

        // Reset boss
        this.bossActive = false;
        this.bossWarning = false;
        this.bossWarningTimer = 0;
        this.bossPatternIndex = 0;
        this.bossSpawnTimer = 0;
        this.bossCurrentPattern = null;
        this.bossPatternStep = 0;
        this.nextBossScore = 5000;
        this.bossRestTimer = 0;

        // Reset milestones
        this.currentMilestone = 0;
        this.milestoneBanner = null;

        // Reset effects
        this.trailEffect = new TrailEffect();
        this.weatherSystem = new WeatherSystem(CANVAS_WIDTH, CANVAS_HEIGHT);

        // Reset background theme
        this.background = new ParallaxBackground();
    }

    // ── Input ──

    handleJump() {
        if (!this.isRunning) return;
        const result = this.player.jump();
        if (result === 'jump') {
            this.audio.playJump();
        } else if (result === 'doubleJump') {
            this.audio.playDoubleJump();
            // Double jump particles
            this._spawnParticles(
                this.player.x + this.player.width / 2,
                this.player.y + this.player.height,
                6, '#AED6F1', 0.8
            );
        }
    }

    handleSlide() {
        if (!this.isRunning) return;
        if (this.player.slide) {
            this.player.slide();
        }
    }

    handleSlideRelease() {
        if (!this.isRunning) return;
        if (this.player.cancelSlide) {
            this.player.cancelSlide();
        }
    }

    // ── Update (one frame) ──

    update() {
        if (!this.isRunning) return;

        // Speed up
        if (this.gameSpeed < MAX_SPEED) {
            this.gameSpeed = Math.min(MAX_SPEED, this.gameSpeed + SPEED_INCREMENT);
        }

        // Score (distance)
        this.score++;

        // ── Combo timer ──
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer <= 0) {
                this.comboMultiplier = 1;
            }
        }

        // ── Power-up timers ──
        if (this.activeMagnet.active) {
            this.activeMagnet.timer--;
            if (this.activeMagnet.timer <= 0) {
                this.activeMagnet.active = false;
            }
        }
        if (this.activeDoubleScore.active) {
            this.activeDoubleScore.timer--;
            if (this.activeDoubleScore.timer <= 0) {
                this.activeDoubleScore.active = false;
            }
        }

        // ── Magnet effect: attract collectibles toward player ──
        if (this.activeMagnet.active) {
            const playerCX = (this.player.x + this.player.width / 2) | 0;
            const playerCY = (this.player.y + this.player.height / 2) | 0;
            for (const col of this.collectibles) {
                if (col.collected) continue;
                const colCX = col.x + col.width / 2;
                const colCY = col.y + col.height / 2;
                const dx = playerCX - colCX;
                const dy = playerCY - colCY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150 && dist > 1) {
                    // Pull toward player
                    const force = (150 - dist) / 150 * 3;
                    col.x += (dx / dist) * force;
                    col.baseY += (dy / dist) * force * 0.5;
                }
            }
        }

        // Background
        this.background.update(this.gameSpeed);

        // Player
        this.player.update();

        // ── Boss rest timer ──
        if (this.bossRestTimer > 0) {
            this.bossRestTimer--;
            if (this.bossRestTimer <= 0) {
                // Boss rest over — give bonus
                this.score += 500;
                this.floatingTexts.push(
                    new FloatingText(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40, '+500 BOSS BÓNUSZ!', '#F1C40F')
                );
            }
        }

        // ── Boss warning ──
        if (this.bossWarning) {
            this.bossWarningTimer--;
            if (this.bossWarningTimer <= 0) {
                this.bossWarning = false;
                this.bossActive = true;
                // Pick a pattern
                this.bossCurrentPattern = this.bossPatterns[this.bossPatternIndex % this.bossPatterns.length];
                this.bossPatternIndex++;
                this.bossPatternStep = 0;
                this.bossSpawnTimer = 0;
            }
        }

        // ── Boss active: spawn pattern obstacles ──
        if (this.bossActive && this.bossCurrentPattern) {
            this.bossSpawnTimer--;
            if (this.bossSpawnTimer <= 0) {
                if (this.bossPatternStep < this.bossCurrentPattern.length) {
                    const entry = this.bossCurrentPattern[this.bossPatternStep];
                    if (entry === 'pit') {
                        // Spawn a pit
                        const gapWidth = randomBetween(70, 110);
                        this.pits.push(new Pit(CANVAS_WIDTH + 60, gapWidth));
                    } else {
                        // Spawn obstacle of the given type
                        const type = entry;
                        this.obstacles.push(new Obstacle(CANVAS_WIDTH + 60, type));
                    }
                    this.bossPatternStep++;
                    this.bossSpawnTimer = 40; // 40-frame gap between spawns
                } else {
                    // Pattern complete
                    this.bossActive = false;
                    this.bossCurrentPattern = null;
                    this.bossRestTimer = 200; // rest period
                    this.nextBossScore += 5000; // next boss at +5000
                }
            }
        }

        // ── Boss check: trigger warning when score crosses threshold ──
        if (!this.bossActive && !this.bossWarning && this.bossRestTimer <= 0 &&
            this.score >= this.nextBossScore) {
            this.bossWarning = true;
            this.bossWarningTimer = 180; // 3 second warning
        }

        // ── Spawn obstacles (only when no boss or boss rest) ──
        if (!this.bossActive && this.bossRestTimer <= 0) {
            this.obstacleTimer--;
            if (this.obstacleTimer <= 0) {
                this._spawnObstacle();
                const base = Math.max(MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP - this.gameSpeed * 8);
                this.obstacleTimer = randomBetween(base, base + 50);
            }
        }

        // ── Spawn pits (only when no boss or boss rest) ──
        if (!this.bossActive && this.bossRestTimer <= 0) {
            this.pitTimer--;
            if (this.pitTimer <= 0) {
                const gapWidth = randomBetween(70, 130);
                this.pits.push(new Pit(CANVAS_WIDTH + 60, gapWidth));
                this.pitTimer = randomBetween(250, 400);
            }
        }

        // ── Spawn power-ups ──
        this.powerUpTimer--;
        if (this.powerUpTimer <= 0) {
            const type = Math.random() < 0.5 ? 'magnet' : 'double_score';
            const y = randomBetween(GROUND_Y - 130, GROUND_Y - 50);
            this.powerUps.push(new PowerUp(CANVAS_WIDTH + 40, y, type));
            this.powerUpTimer = randomBetween(400, 700);
        }

        // Spawn collectibles
        this.collectibleTimer--;
        if (this.collectibleTimer <= 0) {
            this._spawnCollectible();
            this.collectibleTimer = randomBetween(MIN_COLLECTIBLE_GAP, MAX_COLLECTIBLE_GAP);
        }

        // ── Update obstacles ──
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            this.obstacles[i].update(this.gameSpeed);
            if (this.obstacles[i].isOffScreen()) {
                this.obstacles.splice(i, 1);
            }
        }

        // ── Update pits ──
        for (let i = this.pits.length - 1; i >= 0; i--) {
            this.pits[i].update(this.gameSpeed);
            if (this.pits[i].isOffScreen()) {
                this.pits.splice(i, 1);
            }
        }

        // ── Update power-ups ──
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            this.powerUps[i].update(this.gameSpeed);
            if (this.powerUps[i].isOffScreen()) {
                this.powerUps.splice(i, 1);
            }
        }

        // Update collectibles
        for (let i = this.collectibles.length - 1; i >= 0; i--) {
            this.collectibles[i].update(this.gameSpeed);
            if (this.collectibles[i].isOffScreen()) {
                this.collectibles.splice(i, 1);
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].isDead()) {
                this.particles.splice(i, 1);
            }
        }

        // Update floating texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].update();
            if (this.floatingTexts[i].isDead()) {
                this.floatingTexts.splice(i, 1);
            }
        }

        // ── Milestone check (theme changes) ──
        if (this.currentMilestone < this.milestoneThresholds.length &&
            this.score >= this.milestoneThresholds[this.currentMilestone]) {
            // Trigger theme change
            this.background.setTheme(this.currentMilestone + 1);
            this.milestoneBanner = {
                text: this.milestoneNames[this.currentMilestone],
                timer: 150 // ~2.5 seconds
            };
            this.currentMilestone++;
        }

        // ── Banner update ──
        if (this.milestoneBanner) {
            this.milestoneBanner.timer--;
            if (this.milestoneBanner.timer <= 0) {
                this.milestoneBanner = null;
            }
        }

        // Screen shake decay
        if (this.shakeDuration > 0) {
            this.shakeDuration--;
            this.shakeX = (Math.random() - 0.5) * this.shakeDuration * 0.5;
            this.shakeY = (Math.random() - 0.5) * this.shakeDuration * 0.3;
        } else {
            this.shakeX = 0;
            this.shakeY = 0;
        }

        // Speed lines at high speed
        if (this.gameSpeed > 9) {
            if (Math.random() < (this.gameSpeed - 9) * 0.05) {
                this.speedLines.push({
                    x: CANVAS_WIDTH,
                    y: randomBetween(10, GROUND_Y - 10),
                    length: randomBetween(30, 80),
                    alpha: 0.1 + Math.random() * 0.15
                });
            }
        }
        for (let i = this.speedLines.length - 1; i >= 0; i--) {
            this.speedLines[i].x -= this.gameSpeed * 3;
            if (this.speedLines[i].x + this.speedLines[i].length < 0) {
                this.speedLines.splice(i, 1);
            }
        }

        // ── Trail effect ──
        this.trailEffect.update(
            this.player.x, this.player.y,
            this.player.width, this.player.height,
            this.gameSpeed
        );

        // ── Weather update ──
        this.weatherSystem.update();

        // Collision detection
        this._checkCollisions();

        // Game over?
        if (this.player.lives <= 0) {
            this.isRunning = false;
            this.audio.playGameOver();
            if (this.onGameOver) this.onGameOver(this.score);
        }

        // ── Screen flash decay ──
        if (this.screenFlash.alpha > 0) {
            this.screenFlash.alpha *= 0.85;
            if (this.screenFlash.alpha < 0.01) this.screenFlash.alpha = 0;
        }

        // ── Animated score display ──
        if (this.displayedScore < this.score) {
            const diff = this.score - this.displayedScore;
            this.displayedScore += Math.max(1, Math.ceil(diff * 0.15));
            if (this.displayedScore > this.score) this.displayedScore = this.score;
        }

        // ── Feed Snacky extra info ──
        // Speed level for sweat drop
        if (this.player.setSpeedLevel) {
            const norm = Math.max(0, Math.min(1, (this.gameSpeed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED)));
            this.player.setSpeedLevel(norm);
        }

        // Look toward nearest obstacle
        if (this.player.setLookTarget) {
            let nearestX = this.player.x + 200;
            let nearestY = this.player.y;
            let minDist = Infinity;
            for (const obs of this.obstacles) {
                if (obs.passed) continue;
                const dx = obs.x - this.player.x;
                if (dx > 0 && dx < minDist) {
                    minDist = dx;
                    nearestX = obs.x + obs.width / 2;
                    nearestY = obs.y + obs.height / 2;
                }
            }
            this.player.setLookTarget(nearestX, nearestY);
        }
    }

    // ── Draw (one frame) ──

    draw(ctx) {
        ctx.save();

        // Apply screen shake
        if (this.shakeDuration > 0) {
            ctx.translate(this.shakeX | 0, this.shakeY | 0);
        }

        // Clear
        ctx.clearRect(-5, -5, CANVAS_WIDTH + 10, CANVAS_HEIGHT + 10);

        // Background
        this.background.draw(ctx);

        // Speed lines
        for (const line of this.speedLines) {
            ctx.strokeStyle = `rgba(255,255,255,${line.alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(line.x | 0, line.y);
            ctx.lineTo((line.x + line.length) | 0, line.y);
            ctx.stroke();
        }

        // ── Pits (ground level, drawn before obstacles) ──
        for (const pit of this.pits) {
            pit.draw(ctx);
        }

        // Collectibles (behind player)
        for (const c of this.collectibles) {
            c.draw(ctx);
        }

        // ── Power-ups ──
        for (const pu of this.powerUps) {
            pu.draw(ctx);
        }

        // Obstacles
        for (const o of this.obstacles) {
            o.draw(ctx);
        }

        // Player
        this.player.draw(ctx);

        // ── Trail effect (after player) ──
        this.trailEffect.draw(ctx);

        // Particles
        for (const p of this.particles) {
            p.draw(ctx);
        }

        // Floating texts
        for (const ft of this.floatingTexts) {
            ft.draw(ctx);
        }

        // ── Weather (on top of everything except HUD) ──
        this.weatherSystem.draw(ctx);

        // ── Screen flash overlay ──
        if (this.screenFlash.alpha > 0.01) {
            ctx.fillStyle = this.screenFlash.color.startsWith('rgba')
                ? this.screenFlash.color
                : this.screenFlash.color;
            ctx.globalAlpha = this.screenFlash.alpha;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.globalAlpha = 1;
        }

        // ── Edge vignette at high speed ──
        if (this.gameSpeed > 10) {
            const vigAlpha = Math.min(0.25, (this.gameSpeed - 10) * 0.04);
            const vigGrad = ctx.createRadialGradient(
                CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.4,
                CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.7
            );
            vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
            vigGrad.addColorStop(1, `rgba(0,0,0,${vigAlpha})`);
            ctx.fillStyle = vigGrad;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        // ── Boss warning overlay ──
        if (this.bossWarning) {
            this._drawBossWarning(ctx);
        }

        // ── Milestone banner ──
        if (this.milestoneBanner) {
            this._drawMilestoneBanner(ctx);
        }

        // HUD
        this._drawHUD(ctx);

        ctx.restore();
    }

    // ── HUD ──

    _drawHUD(ctx) {
        // Score (animated count-up)
        ctx.save();
        ctx.font = 'bold 20px "Outfit", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFF';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        const scoreText = `🌭 ${formatScore(this.displayedScore || this.score)}`;
        ctx.strokeText(scoreText, 15, 30);
        ctx.fillText(scoreText, 15, 30);

        // Lives (hearts)
        ctx.textAlign = 'right';
        let heartsStr = '';
        for (let i = 0; i < this.player.lives; i++) heartsStr += '❤️ ';
        ctx.font = '18px sans-serif';
        ctx.strokeText(heartsStr, CANVAS_WIDTH - 15, 30);
        ctx.fillText(heartsStr, CANVAS_WIDTH - 15, 30);

        // Speed indicator
        const speedMultiplier = (this.gameSpeed / INITIAL_SPEED).toFixed(1);
        ctx.textAlign = 'center';
        ctx.font = '13px "Outfit", sans-serif';
        ctx.fillStyle = this.gameSpeed > 10 ? '#E74C3C' : '#AEB6BF';
        const speedText = `×${speedMultiplier}`;
        ctx.strokeText(speedText, CANVAS_WIDTH / 2, 22);
        ctx.fillText(speedText, CANVAS_WIDTH / 2, 22);

        // ── Combo display ──
        if (this.comboMultiplier > 1) {
            this._drawComboHUD(ctx);
        }

        // ── Active power-up icons ──
        this._drawActivePowerUps(ctx);

        ctx.restore();
    }

    /**
     * Draw combo multiplier display at top center.
     * Color ramps from green (low combo) through yellow, orange, to red (high combo).
     */
    _drawComboHUD(ctx) {
        const x = CANVAS_WIDTH / 2;
        const y = 42;

        // Color based on combo level: green→yellow→orange→red
        let comboColor;
        const level = Math.min(this.comboMultiplier, this.maxCombo);
        if (level <= 3) {
            comboColor = '#2ECC71'; // green
        } else if (level <= 5) {
            comboColor = '#F1C40F'; // yellow
        } else if (level <= 7) {
            comboColor = '#E67E22'; // orange
        } else {
            comboColor = '#E74C3C'; // red
        }

        // Pulse effect based on combo timer
        const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.05;
        const fontSize = Math.round(16 * pulse);

        // Fire emoji for high combo
        const firePrefix = level >= 5 ? '🔥 ' : '';

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `bold ${fontSize}px "Outfit", sans-serif`;
        ctx.fillStyle = comboColor;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        const comboText = `${firePrefix}×${this.comboMultiplier} COMBO!`;
        ctx.strokeText(comboText, x, y);
        ctx.fillText(comboText, x, y);

        // Tiny timer bar under combo text
        const barW = 60;
        const barH = 3;
        const barX = x - barW / 2;
        const barY = y + 4;
        const fillRatio = this.comboTimer / this.comboMaxTimer;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = comboColor;
        ctx.fillRect(barX, barY, (barW * fillRatio) | 0, barH);

        ctx.restore();
    }

    /**
     * Draw active power-up icons with remaining time bars in top-right area.
     */
    _drawActivePowerUps(ctx) {
        let iconX = CANVAS_WIDTH - 20;
        const iconY = 48;
        const iconSize = 22;
        const barW = 26;
        const barH = 4;

        ctx.save();

        // Magnet indicator
        if (this.activeMagnet.active) {
            const ratio = this.activeMagnet.timer / this.activeMagnet.duration;

            // Icon background
            ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconSize / 2, 0, Math.PI * 2);
            ctx.fill();

            // Icon emoji
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFF';
            ctx.fillText('🧲', iconX, iconY);

            // Timer bar
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(iconX - barW / 2, iconY + iconSize / 2 + 2, barW, barH);
            ctx.fillStyle = '#E74C3C';
            ctx.fillRect(iconX - barW / 2, iconY + iconSize / 2 + 2, (barW * ratio) | 0, barH);

            iconX -= 35;
        }

        // Double score indicator
        if (this.activeDoubleScore.active) {
            const ratio = this.activeDoubleScore.timer / this.activeDoubleScore.duration;

            // Icon background
            ctx.fillStyle = 'rgba(155, 89, 182, 0.3)';
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconSize / 2, 0, Math.PI * 2);
            ctx.fill();

            // Icon text
            ctx.font = 'bold 11px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#F1C40F';
            ctx.fillText('×2', iconX, iconY);

            // Timer bar
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(iconX - barW / 2, iconY + iconSize / 2 + 2, barW, barH);
            ctx.fillStyle = '#9B59B6';
            ctx.fillRect(iconX - barW / 2, iconY + iconSize / 2 + 2, (barW * ratio) | 0, barH);
        }

        ctx.restore();
    }

    /**
     * Draw flashing boss warning banner.
     */
    _drawBossWarning(ctx) {
        const flash = Math.floor(this.bossWarningTimer / 10) % 2 === 0;
        if (!flash) return;

        ctx.save();

        // Red overlay tint
        ctx.fillStyle = 'rgba(231, 76, 60, 0.08)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Warning text
        const y = CANVAS_HEIGHT / 2 - 20;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px "Outfit", sans-serif';
        ctx.fillStyle = '#E74C3C';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 4;
        const text = '⚠️ BOSS KÖZELEG!';
        ctx.strokeText(text, CANVAS_WIDTH / 2, y);
        ctx.fillText(text, CANVAS_WIDTH / 2, y);

        ctx.restore();
    }

    /**
     * Draw milestone banner with fade animation.
     */
    _drawMilestoneBanner(ctx) {
        if (!this.milestoneBanner) return;

        const { text, timer } = this.milestoneBanner;
        const maxTimer = 150;

        // Fade in for first 30 frames, fade out for last 30 frames
        let alpha = 1;
        if (timer > maxTimer - 30) {
            alpha = (maxTimer - timer) / 30;
        } else if (timer < 30) {
            alpha = timer / 30;
        }

        // Scale animation (slight bounce)
        let scale = 1;
        const age = maxTimer - timer;
        if (age < 20) {
            scale = 0.5 + (age / 20) * 0.6;
        } else if (age < 30) {
            scale = 1.1 - ((age - 20) / 10) * 0.1;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);

        const cx = CANVAS_WIDTH / 2;
        const cy = CANVAS_HEIGHT / 2 - 50;

        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        // Banner background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        const textWidth = 260;
        const textHeight = 44;
        ctx.fillRect(cx - textWidth / 2, cy - textHeight / 2, textWidth, textHeight);

        // Border
        ctx.strokeStyle = '#F1C40F';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - textWidth / 2, cy - textHeight / 2, textWidth, textHeight);

        // Text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 22px "Outfit", sans-serif';
        ctx.fillStyle = '#F1C40F';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeText(text, cx, cy);
        ctx.fillText(text, cx, cy);

        ctx.restore();
    }

    // ── Spawning ──

    _spawnObstacle() {
        // Weighted obstacle selection — new types appear less often
        // Base types: crate(25%), barrel(20%), tall_crate(15%)
        // New types: barrier(15%), rolling_barrel(15%), flying_bird(10%)
        const roll = Math.random();
        let type;
        if (roll < 0.25) {
            type = 'crate';
        } else if (roll < 0.45) {
            type = 'barrel';
        } else if (roll < 0.60) {
            type = 'tall_crate';
        } else if (roll < 0.75) {
            type = 'barrier';
        } else if (roll < 0.90) {
            type = 'rolling_barrel';
        } else {
            type = 'flying_bird';
        }
        this.obstacles.push(new Obstacle(CANVAS_WIDTH + 60, type));
    }

    _spawnCollectible() {
        const type = Math.random() < DONUT_CHANCE ? 'donut' : 'hotdog';
        const y = randomBetween(GROUND_Y - 130, GROUND_Y - 40);
        this.collectibles.push(new Collectible(CANVAS_WIDTH + 40, y, type));
    }

    // ── Collisions ──

    _checkCollisions() {
        const ph = this.player.getHitbox();

        // Obstacles
        for (const obs of this.obstacles) {
            if (obs.passed) continue;
            const oh = obs.getHitbox();
            if (checkCollision(ph, oh)) {
                if (this.player.hit()) {
                    this.audio.playHit();
                    this.shakeDuration = 12;
                    this._spawnParticles(
                        this.player.x + this.player.width / 2,
                        this.player.y + this.player.height / 2,
                        10, '#E74C3C', 1.2
                    );
                    // Red screen flash on hit
                    this.screenFlash = { alpha: 0.3, color: 'rgba(231, 76, 60, 0.5)' };
                    obs.passed = true;
                    // Reset combo on hit
                    this.comboMultiplier = 1;
                    this.comboTimer = 0;
                    if (this.player.lives <= 0) return;
                }
            }
            // Mark as passed for scoring (if player is past it)
            if (this.player.x > obs.x + obs.width && !obs.passed) {
                obs.passed = true;
            }
        }

        // ── Pit collisions ──
        // Only dangerous when player is on ground and overlaps pit hitbox
        for (const pit of this.pits) {
            if (pit.passed) continue;
            if (this.player.isOnGround) {
                const pitHB = pit.getHitbox();
                if (checkCollision(ph, pitHB)) {
                    if (this.player.hit()) {
                        this.audio.playHit();
                        this.shakeDuration = 15;
                        this._spawnParticles(
                            this.player.x + this.player.width / 2,
                            this.player.y + this.player.height,
                            12, '#8B4513', 1.5
                        );
                        pit.passed = true;
                        // Reset combo on hit
                        this.comboMultiplier = 1;
                        this.comboTimer = 0;
                        if (this.player.lives <= 0) return;
                    }
                }
            }
            // Mark pit as passed
            if (this.player.x > pit.x + pit.gapWidth && !pit.passed) {
                pit.passed = true;
            }
        }

        // ── Power-up collisions ──
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const pu = this.powerUps[i];
            if (pu.collected) continue;
            if (checkCollision(ph, pu.getHitbox())) {
                pu.collected = true;

                const cx = (pu.x + pu.width / 2) | 0;
                const cy = (pu.y + pu.height / 2) | 0;

                // Activate the power-up
                if (pu.type === 'magnet') {
                    this.activeMagnet.active = true;
                    this.activeMagnet.timer = this.activeMagnet.duration;
                    this._spawnParticles(cx, cy, 10, '#E74C3C', 1);
                    this.floatingTexts.push(
                        new FloatingText(cx, cy - 10, '🧲 MÁGNES!', '#E74C3C')
                    );
                } else if (pu.type === 'double_score') {
                    this.activeDoubleScore.active = true;
                    this.activeDoubleScore.timer = this.activeDoubleScore.duration;
                    this._spawnParticles(cx, cy, 10, '#9B59B6', 1);
                    this.floatingTexts.push(
                        new FloatingText(cx, cy - 10, '×2 DUPLA!', '#9B59B6')
                    );
                }

                this.audio.playCollect();
                this.powerUps.splice(i, 1);
            }
        }

        // Collectibles
        for (let i = this.collectibles.length - 1; i >= 0; i--) {
            const col = this.collectibles[i];
            if (col.collected) continue;
            if (checkCollision(ph, col.getHitbox())) {
                col.collected = true;

                const cx = col.x + col.width / 2;
                const cy = col.y + col.height / 2;

                if (col.type === 'hotdog') {
                    // Combo-enhanced scoring with double score power-up
                    const basePoints = HOTDOG_POINTS;
                    const multiplied = basePoints * this.comboMultiplier * (this.activeDoubleScore.active ? 2 : 1);
                    this.score += multiplied;

                    // Advance combo
                    this.comboMultiplier = Math.min(this.maxCombo, this.comboMultiplier + 1);
                    this.comboTimer = this.comboMaxTimer;

                    // Effects
                    this.audio.playCollect();
                    // Mustard + ketchup colored particles
                    this._spawnParticles(cx, cy, 4, '#F1C40F', 1);
                    this._spawnParticles(cx, cy, 3, '#E74C3C', 0.8);
                    this._spawnParticles(cx, cy, 2, '#D4A050', 0.6);
                    this.floatingTexts.push(
                        new FloatingText(cx, cy - 10, `+${multiplied}`, '#F1C40F')
                    );
                    // Gold screen flash
                    this.screenFlash = { alpha: 0.12, color: 'rgba(241, 196, 15, 0.4)' };
                    // Trigger Snacky happy face
                    if (this.player.triggerHappy) this.player.triggerHappy();
                } else if (col.type === 'donut') {
                    this.player.addLife();
                    this.audio.playExtraLife();
                    this._spawnParticles(cx, cy, 12, '#FF69B4', 1.2);
                    this.floatingTexts.push(
                        new FloatingText(cx, cy - 10, '+1 ❤️', '#FF69B4')
                    );
                }

                this.collectibles.splice(i, 1);
            }
        }
    }

    // ── Particles ──

    _spawnParticles(x, y, count, color, speed) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color, speed));
        }
    }

    // ── Getters ──

    getScore() { return this.score; }
    getLives() { return this.player.lives; }
    getSpeed() { return this.gameSpeed; }
}
