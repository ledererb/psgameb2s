// ============================================
// Hotdog Dash — Collectible Items
// Hotdog (+100 pts) and Donut (+1 life)
// Now with magnet attraction support.
// ============================================

import { roundRect } from './utils.js';

export class Collectible {
    constructor(x, y, type) {
        this.type = type; // 'hotdog' | 'donut'
        this.x = x;
        this.baseY = y;
        this.y = y;
        this.width = type === 'hotdog' ? 36 : 32;
        this.height = type === 'hotdog' ? 22 : 32;
        this.collected = false;

        // Bobbing animation
        this.bobTimer = Math.random() * Math.PI * 2;
        this.glowTimer = 0;

        // Magnet attraction
        this.isAttracted = false;
        this.attractTarget = null; // { x, y }
    }

    /**
     * Start attracting this collectible toward a target position.
     * @param {number} targetX
     * @param {number} targetY
     */
    attractTo(targetX, targetY) {
        this.isAttracted = true;
        this.attractTarget = { x: targetX, y: targetY };
    }

    update(gameSpeed) {
        // Normal horizontal movement
        this.x -= gameSpeed;

        // Animation timers
        this.bobTimer += 0.08;
        this.glowTimer += 0.05;

        if (this.isAttracted && this.attractTarget) {
            // Lerp toward target position (magnet pull)
            this.x += (this.attractTarget.x - this.x) * 0.12;
            this.y += (this.attractTarget.y - this.y) * 0.12;
            // Update baseY to match so bobbing doesn't fight attraction
            this.baseY = this.y;
        } else {
            // Normal bobbing
            this.y = (this.baseY + Math.sin(this.bobTimer) * 5) | 0;
        }
    }

    isOffScreen() {
        return this.x + this.width < -20;
    }

    getHitbox() {
        return {
            x: (this.x + 2) | 0,
            y: (this.y + 2) | 0,
            width: this.width - 4,
            height: this.height - 4
        };
    }

    draw(ctx) {
        // Glow effect
        const glowAlpha = 0.15 + Math.sin(this.glowTimer) * 0.1;
        ctx.save();
        ctx.shadowColor = this.type === 'hotdog' ? '#F1C40F' : '#FF69B4';
        ctx.shadowBlur = 12 + Math.sin(this.glowTimer * 2) * 4;

        // Extra glow when being attracted
        if (this.isAttracted) {
            ctx.shadowColor = '#E74C3C';
            ctx.shadowBlur = 18 + Math.sin(this.glowTimer * 4) * 6;
        }

        if (this.type === 'hotdog') {
            this._drawHotdog(ctx);
        } else {
            this._drawDonut(ctx);
        }

        ctx.restore();

        // Sparkle particles
        this._drawSparkles(ctx);

        // Attraction trail effect
        if (this.isAttracted) {
            this._drawAttractionTrail(ctx);
        }
    }

    // ── Hotdog ──

    _drawHotdog(ctx) {
        const x = this.x;
        const y = this.y;
        const cx = x + 18;

        // Bun bottom
        ctx.fillStyle = '#D4A050';
        ctx.beginPath();
        ctx.ellipse(cx, y + 15, 16, 7, 0, 0, Math.PI);
        ctx.fill();

        // Sesame seeds on bun
        ctx.fillStyle = '#F0E0B0';
        ctx.beginPath();
        ctx.ellipse(cx - 6, y + 5, 1.5, 1, -0.3, 0, Math.PI * 2);
        ctx.ellipse(cx + 3, y + 4, 1.5, 1, 0.2, 0, Math.PI * 2);
        ctx.ellipse(cx + 8, y + 6, 1.5, 1, 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Sausage
        ctx.fillStyle = '#C0392B';
        ctx.beginPath();
        ctx.ellipse(cx, y + 11, 14, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#922B21';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Sausage highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx - 2, y + 9, 8, 2, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // Bun top
        ctx.fillStyle = '#E8B86D';
        ctx.beginPath();
        ctx.ellipse(cx, y + 8, 16, 7, 0, Math.PI, Math.PI * 2);
        ctx.fill();

        // Mustard zigzag
        ctx.strokeStyle = '#F1C40F';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 11);
        for (let i = 0; i < 7; i++) {
            ctx.lineTo(x + 6 + i * 4, y + (i % 2 === 0 ? 8 : 14));
        }
        ctx.stroke();

        // Ketchup line
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 12);
        ctx.quadraticCurveTo(cx, y + 9, x + 30, y + 12);
        ctx.stroke();
    }

    // ── Donut ──

    _drawDonut(ctx) {
        const cx = this.x + 16;
        const cy = this.y + 16;
        const outerR = 14;
        const innerR = 5;

        // Dough ring
        ctx.fillStyle = '#D4A050';
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
        ctx.fill();

        // Pink frosting (top portion)
        ctx.fillStyle = '#FF69B4';
        ctx.beginPath();
        ctx.arc(cx, cy, outerR - 1, Math.PI * 1.15, Math.PI * 1.85, true);
        ctx.arc(cx, cy, innerR + 1, Math.PI * 1.85, Math.PI * 1.15);
        ctx.closePath();
        ctx.fill();

        // Frosting drip effect
        ctx.fillStyle = '#FF69B4';
        ctx.beginPath();
        ctx.ellipse(cx + 8, cy + 6, 3, 5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - 10, cy + 4, 2.5, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Sprinkles
        const sprinkleColors = ['#FFEB3B', '#00BCD4', '#E040FB', '#FF5722', '#8BC34A', '#FFF'];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + 0.3;
            const r = 9;
            const sx = cx + Math.cos(angle) * r;
            const sy = cy + Math.sin(angle) * r;
            const rot = angle + Math.PI / 4;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(rot);
            ctx.fillStyle = sprinkleColors[i % sprinkleColors.length];
            roundRect(ctx, -1.5, -3, 3, 6, 1.5);
            ctx.fill();
            ctx.restore();
        }

        // Inner shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.stroke();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx - 5, cy - 8, 5, 3, -0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Sparkle effect ──

    _drawSparkles(ctx) {
        const t = this.glowTimer * 3;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        for (let i = 0; i < 3; i++) {
            const angle = t + (i * Math.PI * 2 / 3);
            const dist = 18 + Math.sin(t * 2 + i) * 4;
            const sx = cx + Math.cos(angle) * dist;
            const sy = cy + Math.sin(angle) * dist;
            const size = 1.5 + Math.sin(t * 3 + i * 2) * 1;
            const alpha = 0.4 + Math.sin(t * 2 + i) * 0.3;

            ctx.fillStyle = `rgba(255, 255, 200, ${Math.max(0, alpha)})`;
            // Star shape
            ctx.beginPath();
            ctx.moveTo(sx, sy - size);
            ctx.lineTo(sx + size * 0.3, sy - size * 0.3);
            ctx.lineTo(sx + size, sy);
            ctx.lineTo(sx + size * 0.3, sy + size * 0.3);
            ctx.lineTo(sx, sy + size);
            ctx.lineTo(sx - size * 0.3, sy + size * 0.3);
            ctx.lineTo(sx - size, sy);
            ctx.lineTo(sx - size * 0.3, sy - size * 0.3);
            ctx.closePath();
            ctx.fill();
        }
    }

    // ── Attraction trail (drawn when being pulled by magnet) ──

    _drawAttractionTrail(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const t = this.glowTimer * 5;

        // Small red/orange particles trailing behind
        for (let i = 0; i < 3; i++) {
            const trailX = cx - 6 - i * 5 + Math.sin(t + i * 2) * 3;
            const trailY = cy + Math.cos(t + i * 3) * 4;
            const alpha = 0.3 - i * 0.08;
            const size = 2 - i * 0.4;

            ctx.fillStyle = `rgba(231, 76, 60, ${Math.max(0, alpha)})`;
            ctx.beginPath();
            ctx.arc(trailX | 0, trailY | 0, Math.max(0.5, size), 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
