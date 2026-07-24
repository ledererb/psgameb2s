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
    checkCollision, randomBetween, formatScore, worldHeightY
} from './utils.js';

import { Player } from './player.js';
import { Obstacle } from './obstacle.js';
import { Collectible } from './collectible.js';
import { Pit } from './pit.js';
import { PowerUp } from './powerup.js';
import { TrailEffect3D, WeatherSystem3D } from './effects.js';
import { disposeMesh } from './models.js';

// Arany hotdog: ritka, nagyértékű collectible (spec §4)
const GOLDEN_HOTDOG_POINTS = 500;
const GOLDEN_HOTDOG_CHANCE = 0.06;

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
    constructor(audio, world, sceneMgr) {
        this.audio = audio;
        this.world = world;
        this.sceneMgr = sceneMgr;
        this.player = new Player();
        if (this.sceneMgr) this.sceneMgr.scene.add(this.player.mesh);
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

        // Last spawned obstacle type (for compatibility checks)
        this.lastObstacleType = null;

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
        this.maxCombo = 20;

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
            // 1: Zigzag — alternating lanes, always one side free
            [{ lane: 0, type: 'crate' }, { lane: 2, type: 'crate' }, { lane: 0, type: 'barrel' },
             { lane: 2, type: 'barrel' }, { lane: 1, type: 'barrier' }, { lane: 0, type: 'crate' }],
            // 2: Pits + barrels
            [{ lane: 1, type: 'pit' }, { lane: 0, type: 'barrel' }, { lane: 2, type: 'pit' },
             { lane: 1, type: 'barrel' }, { lane: 0, type: 'rolling_barrel' }, { lane: 2, type: 'crate' }],
            // 3: Wide barriers — free lane alternates
            [{ lane: 0, type: 'barrier', span: 2 }, { lane: 1, type: 'crate' }, { lane: 2, type: 'barrier' },
             { lane: 0, type: 'crate' }, { lane: 1, type: 'barrier', span: 2 }, { lane: 2, type: 'barrel' }],
        ];

        // ── Milestones (theme changes) ──
        this.milestoneThresholds = [2000, 6000, 12000, 20000];
        this.currentMilestone = 0;
        this.milestoneBanner = null; // { text, timer }
        this.milestoneNames = ['🌅 HAJNAL ÉRA!', '☀️ NAPPALI ÉRA!', '🌆 NAPLEMENTE ÉRA!', '🌃 NEON VÁROS!'];

        // ── Visual effects (3D) ──
        this.trailEffect = new TrailEffect3D(this.sceneMgr.scene);
        this.weatherSystem = new WeatherSystem3D(this.sceneMgr.scene);

        // ── Near-miss tracking ──
        this.nearMissCooldown = 0;

        // ── Hotdog formation system ──
        this.formationCooldown = 0;

        // ── Mission system ──
        this.currentMission = null;
        this.missionTimer = 300; // start first mission after 5 sec
        this.missionPool = [
            { type: 'collect', target: 5, label: '🌭 Gyűjts {n} hotdogot!', reward: 300 },
            { type: 'collect', target: 8, label: '🌭 Gyűjts {n} hotdogot!', reward: 500 },
            { type: 'dodge', target: 3, label: '🏃 Kerülj el {n} akadályt!', reward: 250 },
            { type: 'dodge', target: 5, label: '🏃 Kerülj el {n} akadályt!', reward: 400 },
            { type: 'combo', target: 5, label: '🔥 Érj el ×{n} kombót!', reward: 350 },
            { type: 'combo', target: 8, label: '🔥 Érj el ×{n} kombót!', reward: 600 },
            { type: 'distance', target: 500, label: '📏 Fuss {n} métert!', reward: 200 },
            { type: 'distance', target: 1000, label: '📏 Fuss {n} métert!', reward: 400 },
        ];
        this.missionProgress = 0;
        this.missionScoreAtStart = 0;
        this.completedMissions = 0;

        // Callbacks
        this.onGameOver = null;
        this.onScoreChange = null;
    }

    start() {
        this.reset();
        this.isRunning = true;
    }

    // Mesh eltávolítása a jelenetből + GPU-erőforrások (geometria/anyag)
    // felszabadítása — az entitás-gyártók példányonként friss erőforrásokat
    // hoznak létre, így a dispose biztonságos.
    _removeMesh(mesh) {
        this.sceneMgr.scene.remove(mesh);
        disposeMesh(mesh);
    }

    reset() {
        this.player.reset();
        this.player.syncMesh();
        // Remove 3D obstacle meshes from the scene before dropping references
        for (const obs of this.obstacles) {
            this._removeMesh(obs.mesh);
        }
        this.obstacles = [];
        // Remove 3D collectible meshes before dropping references
        for (const col of this.collectibles) {
            this._removeMesh(col.mesh);
        }
        this.collectibles = [];
        this.particles = [];
        this.floatingTexts = [];
        this.gameSpeed = INITIAL_SPEED;
        this.score = 0;
        this.obstacleTimer = 80;
        this.collectibleTimer = 100;

        // Reset last obstacle tracking
        this.lastObstacleType = null;
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

        // Reset power-ups (remove 3D meshes first)
        for (const pu of this.powerUps) {
            this._removeMesh(pu.mesh);
        }
        this.powerUps = [];
        this.activeMagnet = { active: false, timer: 0, duration: 480 };
        this.activeDoubleScore = { active: false, timer: 0, duration: 600 };
        this.powerUpTimer = 300;

        // Reset pits (remove 3D meshes first)
        for (const pit of this.pits) {
            this._removeMesh(pit.mesh);
        }
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

        // Reset effects (reuses pooled 3D objects — no re-allocation)
        this.trailEffect.reset();
        this.weatherSystem.reset();

        // Reset near-miss
        this.nearMissCooldown = 0;

        // Reset formations
        this.formationCooldown = 0;

        // Reset missions
        this.currentMission = null;
        this.missionTimer = 300;
        this.missionProgress = 0;
        this.missionScoreAtStart = 0;
        this.completedMissions = 0;

        // Reset 3D world
        if (this.world) this.world.reset();
    }

    // ── Input ──

    handleJump() {
        if (!this.isRunning) return;
        const result = this.player.jump();
        if (result === 'jump') {
            this.audio.playJump();
        } else if (result === 'doubleJump') {
            this.audio.playDoubleJump();
            // Double jump particles (projected from player mesh)
            this._spawnParticlesAt(this.player.mesh, 6, '#AED6F1', 0.8);
        }
    }

    handleLaneChange(dir) {
        if (!this.isRunning) return;
        if (this.player.changeLane(dir)) {
            this.audio.playJump(); // short whoosh placeholder; fine for now
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

    handleGroundPound() {
        if (!this.isRunning) return;
        const result = this.player.groundPound();
        if (result === 'groundPound') {
            this.shakeDuration = 10;
            this._spawnParticlesAt(this.player.mesh, 8, '#FFD700', 1.0);
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

        // ── Near-miss cooldown ──
        if (this.nearMissCooldown > 0) this.nearMissCooldown--;

        // ── Formation cooldown ──
        if (this.formationCooldown > 0) this.formationCooldown--;




        // ── Mission system update ──
        this._updateMissions();

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

        // ── Magnet effect: attract ALL collectibles toward player ──
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
                if (dist > 1) {
                    // Strong pull — all collectibles fly toward player
                    const force = Math.min(12, 8 + (300 - Math.min(dist, 300)) / 300 * 6);
                    col.x += (dx / dist) * force;
                    col.baseY += (dy / dist) * force * 0.7;
                }
                // Lane pull — collectible drifts toward the player's lane (float lane)
                col.lane += Math.sign(this.player.lane - col.lane) * 0.08;
                col.lane = Math.max(0, Math.min(2, col.lane));
            }
        }

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
                    if (entry.type === 'pit') {
                        const gapWidth = randomBetween(70, 110);
                        const pit = new Pit(CANVAS_WIDTH + 60, gapWidth, entry.lane);
                        this.sceneMgr.scene.add(pit.mesh);
                        this.pits.push(pit);
                    } else {
                        const obs = new Obstacle(CANVAS_WIDTH + 60, entry.type, entry.lane, entry.span || 1);
                        this.sceneMgr.scene.add(obs.mesh);
                        this.obstacles.push(obs);
                    }
                    this.bossPatternStep++;
                    this.bossSpawnTimer = 65; // safe gap between boss spawns
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
                // Scale gap with speed, but keep a safe minimum
                const base = Math.max(MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP - this.gameSpeed * 6);
                this.obstacleTimer = randomBetween(base, base + 60);
            }
        }

        // ── Spawn pits (only when no boss or boss rest) ──
        if (!this.bossActive && this.bossRestTimer <= 0) {
            this.pitTimer--;
            if (this.pitTimer <= 0) {
                // Don't spawn a pit if an obstacle just spawned nearby
                const lastObs = this.obstacles[this.obstacles.length - 1];
                const safeToSpawn = !lastObs || (CANVAS_WIDTH + 60 - lastObs.x) > 200;
                if (safeToSpawn) {
                    const gapWidth = randomBetween(70, 110);
                    // 80% single random lane, 20% full-width (lane -1)
                    const lane = Math.random() < 0.8 ? randomBetween(0, 2) : -1;
                    const pit = new Pit(CANVAS_WIDTH + 60, gapWidth, lane);
                    this.sceneMgr.scene.add(pit.mesh);
                    this.pits.push(pit);
                }
                this.pitTimer = randomBetween(300, 500);
            }
        }

        // ── Spawn power-ups ──
        this.powerUpTimer--;
        if (this.powerUpTimer <= 0) {
            const type = Math.random() < 0.5 ? 'magnet' : 'double_score';
            const y = randomBetween(GROUND_Y - 130, GROUND_Y - 50);
            const pu = new PowerUp(CANVAS_WIDTH + 40, y, type, randomBetween(0, 2));
            this.sceneMgr.scene.add(pu.mesh);
            this.powerUps.push(pu);
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
                this._removeMesh(this.obstacles[i].mesh);
                this.obstacles.splice(i, 1);
            } else {
                this.obstacles[i].syncMesh();
            }
        }

        // ── Update pits ──
        for (let i = this.pits.length - 1; i >= 0; i--) {
            this.pits[i].update(this.gameSpeed);
            if (this.pits[i].isOffScreen()) {
                this._removeMesh(this.pits[i].mesh);
                this.pits.splice(i, 1);
            } else {
                this.pits[i].syncMesh(this.score);
            }
        }

        // ── Update power-ups ──
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            this.powerUps[i].update(this.gameSpeed);
            if (this.powerUps[i].isOffScreen()) {
                this._removeMesh(this.powerUps[i].mesh);
                this.powerUps.splice(i, 1);
            } else {
                this.powerUps[i].syncMesh(this.score);
            }
        }

        // Update collectibles
        for (let i = this.collectibles.length - 1; i >= 0; i--) {
            this.collectibles[i].update(this.gameSpeed);
            if (this.collectibles[i].isOffScreen()) {
                this._removeMesh(this.collectibles[i].mesh);
                this.collectibles.splice(i, 1);
            } else {
                this.collectibles[i].syncMesh(this.score);
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
            // Trigger theme change: 2000→dawn(1), 6000→day(2), 12000→sunset(3), 20000→neon(4)
            if (this.world) this.world.setTheme(Math.min(this.currentMilestone + 1, 4));
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
        // Feed shake into the 3D camera
        this.sceneMgr.setShake(this.shakeX, this.shakeY);

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

        // ── Trail effect (3D, behind Snacky) ──
        this.trailEffect.update(
            this.player.worldX,
            worldHeightY(this.player.y, this.player.height),
            0,
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

        // Sync 3D mesh with logical state (end of frame)
        this.player.syncMesh();
    }

    // ── Draw overlay (one frame) — 2D HUD canvas on top of the WebGL layer ──

    drawOverlay(ctx) {
        ctx.save();

        // Apply screen shake
        if (this.shakeDuration > 0) {
            ctx.translate(this.shakeX | 0, this.shakeY | 0);
        }

        // Clear
        ctx.clearRect(-5, -5, CANVAS_WIDTH + 10, CANVAS_HEIGHT + 10);

        // Speed lines
        for (const line of this.speedLines) {
            ctx.strokeStyle = `rgba(255,255,255,${line.alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(line.x | 0, line.y);
            ctx.lineTo((line.x + line.length) | 0, line.y);
            ctx.stroke();
        }

        // Particles
        for (const p of this.particles) {
            p.draw(ctx);
        }

        // Floating texts
        for (const ft of this.floatingTexts) {
            ft.draw(ctx);
        }

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
        this._drawMissionHUD(ctx);

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
        // ── Smart spawning: prevent impossible combinations ──
        // Rules:
        //   After barrier (must slide) → only allow: crate, barrel (easy jump)
        //   After tall_crate (must double-jump) → only allow: crate, barrel, flying_bird
        //   After rolling_barrel (fast, need quick reaction) → no barrier or tall_crate
        //   Otherwise: full random weighted selection

        const last = this.lastObstacleType;
        let type;

        if (last === 'barrier') {
            // After sliding under barrier, player needs time to jump → only easy obstacles
            const options = ['crate', 'crate', 'barrel', 'flying_bird'];
            type = options[randomBetween(0, options.length - 1)];
        } else if (last === 'tall_crate') {
            // After a big double-jump, don't require immediate slide
            const options = ['crate', 'barrel', 'barrel', 'flying_bird', 'rolling_barrel'];
            type = options[randomBetween(0, options.length - 1)];
        } else if (last === 'rolling_barrel') {
            // After fast rolling barrel, give breathing room
            const options = ['crate', 'barrel', 'crate', 'barrel', 'flying_bird'];
            type = options[randomBetween(0, options.length - 1)];
        } else {
            // Normal weighted selection
            const roll = Math.random();
            if (roll < 0.25) {
                type = 'crate';
            } else if (roll < 0.45) {
                type = 'barrel';
            } else if (roll < 0.58) {
                type = 'tall_crate';
            } else if (roll < 0.72) {
                type = 'barrier';
            } else if (roll < 0.87) {
                type = 'rolling_barrel';
            } else {
                type = 'flying_bird';
            }
        }

        this.lastObstacleType = type;

        const span = (type === 'barrier' && Math.random() < 0.4) ? 2 : 1;
        // Megoldhatóság konstrukció szerint: akadályok ≥450px (MIN_OBSTACLE_GAP × min sebesség)
        // távolságra spawnolnak, gödrök ≥200px-re az akadályoktól, boss-minták kézzel
        // verifikálva — mindig van szabad sáv.
        const lane = randomBetween(0, 2);
        const obs = new Obstacle(CANVAS_WIDTH + 60, type, lane, span);
        this.sceneMgr.scene.add(obs.mesh);
        this.obstacles.push(obs);
    }

    _spawnCollectible() {
        const type = Math.random() < DONUT_CHANCE ? 'donut' : 'hotdog';

        // 30% chance for hotdog formation (only hotdogs, not donuts, and cooldown expired)
        if (type === 'hotdog' && this.formationCooldown <= 0 && Math.random() < 0.30) {
            this._spawnFormation();
            this.formationCooldown = 120; // don't spawn another formation too soon
            return;
        }

        const y = randomBetween(GROUND_Y - 130, GROUND_Y - 40);
        const lane = randomBetween(0, 2);
        const finalType = type === 'hotdog' && Math.random() < GOLDEN_HOTDOG_CHANCE ? 'golden_hotdog' : type;
        const col = new Collectible(CANVAS_WIDTH + 40, y, finalType, lane);
        this.sceneMgr.scene.add(col.mesh);
        this.collectibles.push(col);
    }

    /**
     * Spawn hotdogs in a formation pattern (arc, wave, line, or zigzag).
     * arc/wave/line: whole formation shares one random lane.
     * zigzag: each item gets lane = i % 3 (spans across lanes).
     */
    _spawnFormation() {
        const patterns = ['arc', 'wave', 'line', 'zigzag'];
        const pattern = patterns[randomBetween(0, patterns.length - 1)];
        const count = randomBetween(4, 7);
        const baseX = CANVAS_WIDTH + 60;
        const spacing = 38;
        const formationLane = randomBetween(0, 2); // one lane for the whole formation (non-zigzag)

        for (let i = 0; i < count; i++) {
            let x, y, lane = formationLane;
            switch (pattern) {
                case 'arc': {
                    // Arc shape (like jumping over an obstacle)
                    const t = i / (count - 1); // 0 to 1
                    x = baseX + i * spacing;
                    y = GROUND_Y - 50 - Math.sin(t * Math.PI) * 70;
                    break;
                }
                case 'wave': {
                    // Sine wave
                    x = baseX + i * spacing;
                    y = GROUND_Y - 80 + Math.sin(i * 0.8) * 35;
                    break;
                }
                case 'line': {
                    // Diagonal line going up
                    x = baseX + i * spacing;
                    y = GROUND_Y - 40 - i * 14;
                    break;
                }
                case 'zigzag': {
                    lane = i % 3;
                    x = baseX + i * spacing;
                    y = GROUND_Y - 60;
                    break;
                }
            }
            const itemType = Math.random() < GOLDEN_HOTDOG_CHANCE ? 'golden_hotdog' : 'hotdog';
            const col = new Collectible(x, y, itemType, lane);
            this.sceneMgr.scene.add(col.mesh);
            this.collectibles.push(col);
        }
    }

    // ── Collisions ──

    _checkCollisions() {
        const ph = this.player.getHitbox();

        // Obstacles
        for (const obs of this.obstacles) {
            if (obs.passed) continue;
            const sameLane = obs.lanes.includes(this.player.lane);
            const oh = obs.getHitbox();
            // Lane-filtered collision: only same-lane obstacles can hurt
            if (sameLane && checkCollision(ph, oh)) {
                if (this.player.hit()) {
                    this.audio.playHit();
                    this.shakeDuration = 12;
                    this._spawnParticlesAt(this.player.mesh, 10, '#E74C3C', 1.2);
                    // Red screen flash on hit
                    this.screenFlash = { alpha: 0.3, color: 'rgba(231, 76, 60, 0.5)' };
                    obs.passed = true;
                    // Reset combo on hit
                    this.comboMultiplier = 1;
                    this.comboTimer = 0;
                    // Fail current mission
                    this._failMission();
                    if (this.player.lives <= 0) return;
                }
            }
            // Mark as passed for scoring (all lanes count — you dodged by being elsewhere)
            if (this.player.x > obs.x + obs.width && !obs.passed) {
                obs.passed = true;

                // ── Near-miss detection (same lane only) ──
                if (sameLane && this.nearMissCooldown <= 0 && !this.player.isInvincible) {
                    const oh = obs.getHitbox();
                    // Check vertical near-miss (player bottom near obstacle top, or vice versa)
                    const vertGap = Math.min(
                        Math.abs(ph.y + ph.height - oh.y),
                        Math.abs(oh.y + oh.height - ph.y)
                    );
                    const horizGap = Math.abs(ph.x + ph.width - oh.x);
                    if (vertGap < 12 || horizGap < 8) {
                        const nearMissBonus = 50;
                        this.score += nearMissBonus;
                        this._spawnFloatingTextAt(this.player.mesh, 'CLOSE! +50', '#00DDFF');
                        this._spawnParticlesAt(this.player.mesh, 4, '#00DDFF', 0.6);
                        this.nearMissCooldown = 30; // prevent spam
                    }
                }

                // ── Mission: dodge tracking ──
                if (this.currentMission && this.currentMission.type === 'dodge') {
                    this.missionProgress++;
                }
            }
        }

        // ── Pit collisions ──
        // Only dangerous when player is on ground, in the pit's lane,
        // and overlaps the pit hitbox
        for (const pit of this.pits) {
            if (pit.passed) continue;
            const sameLane = pit.lanes.includes(this.player.lane);
            if (sameLane && this.player.isOnGround) {
                const pitHB = pit.getHitbox();
                if (checkCollision(ph, pitHB)) {
                    if (this.player.hit()) {
                        this.audio.playHit();
                        this.shakeDuration = 15;
                        this._spawnParticlesAt(this.player.mesh, 12, '#8B4513', 1.5);
                        pit.passed = true;
                        // Reset combo on hit
                        this.comboMultiplier = 1;
                        this.comboTimer = 0;
                        // Fail current mission
                        this._failMission();
                        if (this.player.lives <= 0) return;
                    }
                }
            }
            // Mark pit as passed
            if (this.player.x > pit.x + pit.gapWidth && !pit.passed) {
                pit.passed = true;

                // ── Near-miss: low jump over a pit in the player's lane ──
                // Triggers only if the player survived the pit (damage sets
                // pit.passed above, so this branch is skipped on a hit).
                // Approximation of "feet skimmed the gap": at the moment of
                // passing, the player is airborne with their bottom less than
                // 30 logical px above the ground.
                if (sameLane && this.nearMissCooldown <= 0 && !this.player.isInvincible &&
                    !this.player.isOnGround && (GROUND_Y - this.player.y - this.player.height) < 30) {
                    const nearMissBonus = 50;
                    this.score += nearMissBonus;
                    this._spawnFloatingTextAt(this.player.mesh, 'CLOSE! +50', '#00DDFF');
                    this._spawnParticlesAt(this.player.mesh, 4, '#00DDFF', 0.6);
                    this.nearMissCooldown = 30; // prevent spam
                }
            }
        }

        // ── Power-up collisions ──
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const pu = this.powerUps[i];
            if (pu.collected) continue;
            // Lane-filtered: only same-lane power-ups can be picked up
            if (pu.lane !== this.player.lane) continue;
            if (checkCollision(ph, pu.getHitbox())) {
                pu.collected = true;

                // Activate the power-up (effects projected from the power-up's 3D mesh)
                if (pu.type === 'magnet') {
                    this.activeMagnet.active = true;
                    this.activeMagnet.timer = this.activeMagnet.duration;
                    this._spawnParticlesAt(pu.mesh, 10, '#E74C3C', 1);
                    this._spawnFloatingTextAt(pu.mesh, '🧲 MÁGNES!', '#E74C3C');
                } else if (pu.type === 'double_score') {
                    this.activeDoubleScore.active = true;
                    this.activeDoubleScore.timer = this.activeDoubleScore.duration;
                    this._spawnParticlesAt(pu.mesh, 10, '#9B59B6', 1);
                    this._spawnFloatingTextAt(pu.mesh, '×2 DUPLA!', '#9B59B6');
                }

                this.audio.playCollect();
                this._removeMesh(pu.mesh);
                this.powerUps.splice(i, 1);
            }
        }

        // Collectibles
        for (let i = this.collectibles.length - 1; i >= 0; i--) {
            const col = this.collectibles[i];
            if (col.collected) continue;
            // Lane-filtered: Math.round because the magnet pulls lanes as floats
            if (Math.round(col.lane) !== this.player.lane) continue;
            if (checkCollision(ph, col.getHitbox())) {
                col.collected = true;

                // Effects are projected from the collectible's 3D mesh position
                if (col.type === 'hotdog' || col.type === 'golden_hotdog') {
                    const golden = col.type === 'golden_hotdog';
                    // Combo-enhanced scoring with double score power-up
                    const basePoints = golden ? GOLDEN_HOTDOG_POINTS : HOTDOG_POINTS;
                    const multiplied = basePoints * this.comboMultiplier * (this.activeDoubleScore.active ? 2 : 1);
                    this.score += multiplied;

                    // Advance combo
                    this.comboMultiplier = Math.min(this.maxCombo, this.comboMultiplier + 1);
                    this.comboTimer = this.comboMaxTimer;

                    // Effects
                    this.audio.playCollect();
                    // Mustard + ketchup colored particles (aranynál extra arany)
                    this._spawnParticlesAt(col.mesh, 4, '#F1C40F', 1);
                    this._spawnParticlesAt(col.mesh, 3, golden ? '#FFD700' : '#E74C3C', 0.8);
                    this._spawnParticlesAt(col.mesh, 2, '#D4A050', 0.6);
                    this._spawnFloatingTextAt(col.mesh, `+${multiplied}`, golden ? '#FFD700' : '#F1C40F');
                    // Gold screen flash (aranynál erősebb)
                    this.screenFlash = { alpha: golden ? 0.22 : 0.12, color: 'rgba(241, 196, 15, 0.4)' };
                    // Trigger Snacky happy face
                    if (this.player.triggerHappy) this.player.triggerHappy();

                    // ── Mission: collect tracking ──
                    if (this.currentMission && this.currentMission.type === 'collect') {
                        this.missionProgress++;
                    }
                } else if (col.type === 'donut') {
                    this.player.addLife();
                    this.audio.playExtraLife();
                    this._spawnParticlesAt(col.mesh, 12, '#FF69B4', 1.2);
                    this._spawnFloatingTextAt(col.mesh, '+1 ❤️', '#FF69B4');
                }

                this._removeMesh(col.mesh);
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

    // ── Projected spawn helpers (3D world position → overlay coords) ──

    _spawnFloatingTextAt(mesh, text, color) {
        const p = this.sceneMgr.projectToScreen(mesh.position, { x: 0, y: 0 });
        this.floatingTexts.push(new FloatingText(p.x, p.y - 10, text, color));
    }

    _spawnParticlesAt(mesh, count, color, speed) {
        const p = this.sceneMgr.projectToScreen(mesh.position, { x: 0, y: 0 });
        this._spawnParticles(p.x, p.y, count, color, speed);
    }

    // ── Getters ──

    getScore() { return this.score; }
    getLives() { return this.player.lives; }
    getSpeed() { return this.gameSpeed; }

    // ── Mission system ──

    _updateMissions() {
        if (!this.currentMission) {
            this.missionTimer--;
            if (this.missionTimer <= 0) {
                this._startNewMission();
            }
            return;
        }

        const m = this.currentMission;

        // Check distance missions
        if (m.type === 'distance') {
            this.missionProgress = this.score - this.missionScoreAtStart;
        }

        // Check combo missions
        if (m.type === 'combo') {
            this.missionProgress = Math.max(this.missionProgress, this.comboMultiplier);
        }

        // Check completion
        if (this.missionProgress >= m.target) {
            // Mission complete!
            this.score += m.reward;
            this.floatingTexts.push(
                new FloatingText(
                    CANVAS_WIDTH / 2, 70,
                    `✅ MISSION! +${m.reward}`, '#2ECC71'
                )
            );
            this._spawnParticles(CANVAS_WIDTH / 2, 60, 10, '#2ECC71', 1.5);
            this.screenFlash = { alpha: 0.15, color: 'rgba(46, 204, 113, 0.4)' };
            this.completedMissions++;
            this.currentMission = null;
            // Next mission after a delay (shorter as game progresses)
            this.missionTimer = Math.max(180, 400 - this.completedMissions * 30);
        }
    }

    _startNewMission() {
        // Pick a random mission from the pool
        const idx = randomBetween(0, this.missionPool.length - 1);
        const template = this.missionPool[idx];
        this.currentMission = { ...template };
        this.missionProgress = 0;
        this.missionScoreAtStart = this.score;

        // Floating text announcement
        const label = template.label.replace('{n}', template.target);
        this.floatingTexts.push(
            new FloatingText(CANVAS_WIDTH / 2, 70, label, '#3498DB')
        );
    }

    _failMission() {
        if (!this.currentMission) return;
        this.floatingTexts.push(
            new FloatingText(
                CANVAS_WIDTH / 2, 70,
                '❌ KÜLDETÉS SIKERTELEN!', '#E74C3C'
            )
        );
        this.currentMission = null;
        this.missionProgress = 0;
        // Longer delay before next mission after failure
        this.missionTimer = Math.max(200, 500 - this.completedMissions * 20);
    }

    _drawMissionHUD(ctx) {
        if (!this.currentMission) return;

        const m = this.currentMission;
        const label = m.label.replace('{n}', m.target);
        const progress = Math.min(this.missionProgress, m.target);
        const ratio = progress / m.target;

        // Position: bottom-left
        const x = 12;
        const y = CANVAS_HEIGHT - 16;

        // Background pill
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.roundRect(x, y - 14, 210, 20, 6);
        ctx.fill();

        // Progress bar background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.roundRect(x + 130, y - 10, 70, 12, 4);
        ctx.fill();

        // Progress bar fill
        const barColor = ratio >= 1 ? '#2ECC71' : '#3498DB';
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(x + 130, y - 10, 70 * ratio, 12, 4);
        ctx.fill();

        // Mission text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 6, y);

        // Progress count
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${progress}/${m.target}`, x + 165, y);

        // Reward
        ctx.fillStyle = '#F1C40F';
        ctx.font = 'bold 9px Outfit, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`+${m.reward}`, x + 206, y);
    }
}
