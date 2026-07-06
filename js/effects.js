// ============================================
// Snacky Dash — Visual Effects
// TrailEffect: speed-based particle trail
// WeatherSystem: random rain/snow/fog events
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y, randomBetween } from './utils.js';

// ── Trail Effect ──
// Spawns warm-colored particle streaks behind the player at high speeds.

export class TrailEffect {
    constructor() {
        this.particles = [];
    }

    /**
     * Update trail particles. Only spawns when gameSpeed > 8.
     * Higher speed = more particles and brighter colors.
     */
    update(playerX, playerY, playerW, playerH, gameSpeed) {
        // Only trail at higher speeds
        if (gameSpeed > 8) {
            // More particles at higher speeds (1-4 per frame)
            const spawnCount = Math.min(4, Math.floor((gameSpeed - 8) * 0.6) + 1);
            for (let i = 0; i < spawnCount; i++) {
                const px = (playerX + Math.random() * 8) | 0;
                const py = (playerY + playerH * 0.3 + Math.random() * playerH * 0.5) | 0;
                const speedFactor = (gameSpeed - 8) / 7; // 0..1 range (8..15)
                this.particles.push({
                    x: px,
                    y: py,
                    alpha: 0.3 + speedFactor * 0.5,
                    size: 2 + Math.random() * 3,
                    life: 15 + Math.random() * 10,
                    maxLife: 25,
                    vx: -(1 + Math.random() * 2),
                    vy: (Math.random() - 0.5) * 0.8,
                    speedFactor: speedFactor
                });
            }
        }

        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            p.alpha *= 0.94;
            p.size *= 0.96;
            if (p.life <= 0 || p.alpha < 0.01) {
                this.particles.splice(i, 1);
            }
        }
    }

    /**
     * Draw semi-transparent colored streaks behind the player.
     * Warm orange/red at high speed, cool blue at medium speed.
     */
    draw(ctx) {
        if (this.particles.length === 0) return;

        ctx.save();
        for (const p of this.particles) {
            // Interpolate color: blue (medium speed) → orange → red (max speed)
            let r, g, b;
            if (p.speedFactor < 0.5) {
                // Blue → Orange
                const t = p.speedFactor * 2;
                r = Math.floor(80 + t * 175);
                g = Math.floor(150 - t * 50);
                b = Math.floor(255 - t * 200);
            } else {
                // Orange → Red
                const t = (p.speedFactor - 0.5) * 2;
                r = Math.floor(255);
                g = Math.floor(100 - t * 80);
                b = Math.floor(55 - t * 55);
            }

            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

            // Draw as small elongated streak
            ctx.beginPath();
            ctx.ellipse(
                p.x | 0, p.y | 0,
                Math.max(0.5, p.size * 1.5), Math.max(0.5, p.size * 0.6),
                0, 0, Math.PI * 2
            );
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

// ── Weather System ──
// Random weather events: rain, snow, fog with smooth fade transitions.

export class WeatherSystem {
    constructor(canvasWidth, canvasHeight) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.currentWeather = null; // null | 'rain' | 'snow' | 'fog'
        this.particles = [];
        this.weatherTimer = randomBetween(900, 1800); // frames until first weather
        this.weatherDuration = 0;                       // how long current weather lasts
        this.transitionAlpha = 0;                       // 0→1 fade in, 1→0 fade out
        this.fadingOut = false;
    }

    update() {
        if (!this.currentWeather) {
            // ── No weather: countdown to next event ──
            this.weatherTimer--;
            if (this.weatherTimer <= 0) {
                // Start a random weather event
                const types = ['rain', 'snow', 'fog'];
                this.currentWeather = types[randomBetween(0, 2)];
                this.weatherDuration = randomBetween(300, 600);
                this.transitionAlpha = 0;
                this.fadingOut = false;
                this.particles = [];
            }
            return;
        }

        // ── Weather active ──

        // Fade in
        if (!this.fadingOut && this.transitionAlpha < 1) {
            this.transitionAlpha = Math.min(1, this.transitionAlpha + 0.02);
        }

        // Duration countdown
        this.weatherDuration--;
        if (this.weatherDuration <= 0 && !this.fadingOut) {
            this.fadingOut = true;
        }

        // Fade out
        if (this.fadingOut) {
            this.transitionAlpha -= 0.015;
            if (this.transitionAlpha <= 0) {
                this.transitionAlpha = 0;
                this.currentWeather = null;
                this.particles = [];
                this.weatherTimer = randomBetween(900, 1800);
                this.fadingOut = false;
                return;
            }
        }

        // Spawn & update particles based on weather type
        switch (this.currentWeather) {
            case 'rain':
                this._updateRain();
                break;
            case 'snow':
                this._updateSnow();
                break;
            // Fog has no particles, just overlay
        }
    }

    // ── Rain ──

    _updateRain() {
        // Spawn rain drops to maintain ~120 particles
        while (this.particles.length < 120) {
            this.particles.push({
                x: Math.random() * (this.width + 100),
                y: -10 - Math.random() * 40,
                speed: 8 + Math.random() * 6,
                length: 8 + Math.random() * 12
            });
        }

        // Update
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x -= p.speed * 0.3; // slight diagonal
            p.y += p.speed;
            if (p.y > this.height + 10) {
                // Recycle
                p.x = Math.random() * (this.width + 100);
                p.y = -10 - Math.random() * 20;
            }
        }
    }

    // ── Snow ──

    _updateSnow() {
        // Maintain ~60 snowflakes
        while (this.particles.length < 60) {
            this.particles.push({
                x: Math.random() * this.width,
                y: -5 - Math.random() * 30,
                speed: 0.5 + Math.random() * 1.5,
                size: 1.5 + Math.random() * 3,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.02 + Math.random() * 0.03
            });
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.wobble += p.wobbleSpeed;
            p.x += Math.sin(p.wobble) * 0.8;
            p.y += p.speed;
            if (p.y > this.height + 10) {
                p.x = Math.random() * this.width;
                p.y = -5 - Math.random() * 10;
            }
        }
    }

    // ── Draw ──

    draw(ctx) {
        if (!this.currentWeather) return;
        const alpha = this.transitionAlpha;
        if (alpha <= 0) return;

        ctx.save();

        switch (this.currentWeather) {
            case 'rain':
                this._drawRain(ctx, alpha);
                break;
            case 'snow':
                this._drawSnow(ctx, alpha);
                break;
            case 'fog':
                this._drawFog(ctx, alpha);
                break;
        }

        ctx.restore();
    }

    _drawRain(ctx, alpha) {
        // Slight blue tint overlay
        ctx.fillStyle = `rgba(50, 80, 160, ${0.06 * alpha})`;
        ctx.fillRect(0, 0, this.width, this.height);

        // Rain streaks
        ctx.strokeStyle = `rgba(180, 200, 255, ${0.4 * alpha})`;
        ctx.lineWidth = 1;
        for (const p of this.particles) {
            ctx.beginPath();
            ctx.moveTo(p.x | 0, p.y | 0);
            ctx.lineTo((p.x - p.length * 0.3) | 0, (p.y + p.length) | 0);
            ctx.stroke();
        }
    }

    _drawSnow(ctx, alpha) {
        // Slight white tint
        ctx.fillStyle = `rgba(200, 210, 230, ${0.04 * alpha})`;
        ctx.fillRect(0, 0, this.width, this.height);

        // Snowflakes
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * alpha})`;
        for (const p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.x | 0, p.y | 0, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawFog(ctx, alpha) {
        // Animated fog density using time
        const density = 0.12 + Math.sin(Date.now() * 0.001) * 0.03;

        // Gradient overlay — thicker at edges, lighter in center
        const fogGrad = ctx.createRadialGradient(
            (this.width / 2) | 0, (this.height / 2) | 0, 50,
            (this.width / 2) | 0, (this.height / 2) | 0, this.width * 0.7
        );
        fogGrad.addColorStop(0, `rgba(200, 200, 210, ${density * alpha * 0.3})`);
        fogGrad.addColorStop(0.5, `rgba(180, 185, 195, ${density * alpha * 0.6})`);
        fogGrad.addColorStop(1, `rgba(160, 165, 180, ${density * alpha})`);
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, 0, this.width, this.height);

        // Additional horizontal fog bands for depth
        for (let i = 0; i < 3; i++) {
            const bandY = (GROUND_Y * 0.3) + i * 60;
            const bandAlpha = (0.05 + Math.sin(Date.now() * 0.0008 + i * 1.5) * 0.03) * alpha;
            ctx.fillStyle = `rgba(190, 195, 210, ${bandAlpha})`;
            ctx.fillRect(0, bandY | 0, this.width, 40);
        }
    }
}
