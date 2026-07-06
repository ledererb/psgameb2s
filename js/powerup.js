// ============================================
// Snacky Dash — Power-Ups
// Magnet: attracts collectibles for 8 seconds
// Double Score: doubles points for 10 seconds
// ============================================

import { GROUND_Y, randomBetween } from './utils.js';

export class PowerUp {
    /**
     * @param {number} x - Spawn X position
     * @param {number} y - Spawn Y position
     * @param {'magnet'|'double_score'} type
     */
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.baseY = y;
        this.type = type;

        this.width = 36;
        this.height = 36;
        this.collected = false;

        // Animation timers
        this.bobTimer = Math.random() * Math.PI * 2;
        this.glowTimer = 0;
        this.pulseTimer = 0;

        // Sparkle particles
        this.sparkles = [];
        for (let i = 0; i < 5; i++) {
            this.sparkles.push({
                angle: Math.random() * Math.PI * 2,
                dist: randomBetween(18, 28),
                speed: 0.02 + Math.random() * 0.03,
                size: 1 + Math.random() * 1.5,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    update(gameSpeed) {
        this.x -= gameSpeed;
        this.bobTimer += 0.07;
        this.glowTimer += 0.06;
        this.pulseTimer += 0.08;

        // Bobbing up and down
        this.y = (this.baseY + Math.sin(this.bobTimer) * 6) | 0;

        // Animate sparkles
        for (const s of this.sparkles) {
            s.angle += s.speed;
        }
    }

    isOffScreen() {
        return this.x + this.width < -20;
    }

    getHitbox() {
        return {
            x: (this.x + 4) | 0,
            y: (this.y + 4) | 0,
            width: this.width - 8,
            height: this.height - 8
        };
    }

    draw(ctx) {
        const cx = (this.x + this.width / 2) | 0;
        const cy = (this.y + this.height / 2) | 0;

        // ── Pulsing glow aura ──
        const pulseScale = 1 + Math.sin(this.pulseTimer) * 0.3;
        const glowRadius = 24 * pulseScale;
        const glowColor = this.type === 'magnet'
            ? 'rgba(231, 76, 60, 0.25)'   // red glow
            : 'rgba(155, 89, 182, 0.25)';  // purple glow

        const auraGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, glowRadius);
        auraGrad.addColorStop(0, glowColor);
        auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // ── Outer ring pulse ──
        const ringAlpha = 0.15 + Math.sin(this.pulseTimer * 1.5) * 0.1;
        ctx.strokeStyle = this.type === 'magnet'
            ? `rgba(231, 76, 60, ${ringAlpha})`
            : `rgba(155, 89, 182, ${ringAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 20 * pulseScale, 0, Math.PI * 2);
        ctx.stroke();

        // ── Draw the icon ──
        ctx.save();
        if (this.type === 'magnet') {
            this._drawMagnet(ctx, cx, cy);
        } else {
            this._drawDiamond(ctx, cx, cy);
        }
        ctx.restore();

        // ── Sparkle particles ──
        this._drawSparkles(ctx, cx, cy);
    }

    // ── Magnet icon: horseshoe shape with red/blue ends ──

    _drawMagnet(ctx, cx, cy) {
        const x = cx - 14;
        const y = cy - 14;

        // Background circle
        ctx.fillStyle = 'rgba(44, 62, 80, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        ctx.fill();

        // Horseshoe body (U-shape) — draw as arc + two legs
        ctx.lineWidth = 6;
        ctx.lineCap = 'butt';

        // Main arc (gray/silver)
        ctx.strokeStyle = '#95A5A6';
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 9, 0, Math.PI);
        ctx.stroke();

        // Left leg — red end
        ctx.fillStyle = '#E74C3C';
        ctx.fillRect(cx - 15, cy - 3, 6, 14);
        // Red tip highlight
        ctx.fillStyle = '#C0392B';
        ctx.fillRect(cx - 15, cy + 7, 6, 4);

        // Right leg — blue end
        ctx.fillStyle = '#3498DB';
        ctx.fillRect(cx + 9, cy - 3, 6, 14);
        // Blue tip highlight
        ctx.fillStyle = '#2980B9';
        ctx.fillRect(cx + 9, cy + 7, 6, 4);

        // Magnetic field lines (small arcs)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy + 10, 5, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + 10, 9, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.setLineDash([]);

        // Metallic highlight on arc
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 7, 0.3, Math.PI - 0.3);
        ctx.stroke();
    }

    // ── Double Score icon: sparkling diamond/gem ──

    _drawDiamond(ctx, cx, cy) {
        // Outer glow behind gem
        ctx.fillStyle = 'rgba(241, 196, 15, 0.15)';
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        ctx.fill();

        // Diamond shape
        const w = 12;
        const h = 16;

        // Main gem body — gradient from purple to gold
        const gemGrad = ctx.createLinearGradient(cx - w, cy - h, cx + w, cy + h);
        gemGrad.addColorStop(0, '#9B59B6');
        gemGrad.addColorStop(0.3, '#8E44AD');
        gemGrad.addColorStop(0.6, '#F39C12');
        gemGrad.addColorStop(1, '#F1C40F');

        ctx.fillStyle = gemGrad;
        ctx.beginPath();
        ctx.moveTo(cx, cy - h);           // top point
        ctx.lineTo(cx + w, cy - 2);       // top-right
        ctx.lineTo(cx + w - 2, cy);       // mid-right
        ctx.lineTo(cx, cy + h);           // bottom point
        ctx.lineTo(cx - w + 2, cy);       // mid-left
        ctx.lineTo(cx - w, cy - 2);       // top-left
        ctx.closePath();
        ctx.fill();

        // Gem outline
        ctx.strokeStyle = '#7D3C98';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Top facet (lighter)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - h);
        ctx.lineTo(cx + w, cy - 2);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx - w, cy - 2);
        ctx.closePath();
        ctx.fill();

        // Inner facet lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - w, cy - 2);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + w, cy - 2);
        ctx.moveTo(cx, cy - h);
        ctx.lineTo(cx, cy + h);
        ctx.stroke();

        // Shine highlight (top-left facet)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(cx - 2, cy - h + 3);
        ctx.lineTo(cx - w + 3, cy - 3);
        ctx.lineTo(cx - 2, cy - 1);
        ctx.closePath();
        ctx.fill();

        // "2x" text label
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 8px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('2×', cx, cy + 1);
    }

    // ── Sparkle particles around the power-up ──

    _drawSparkles(ctx, cx, cy) {
        const t = this.glowTimer * 3;

        for (const s of this.sparkles) {
            const sx = cx + Math.cos(s.angle) * s.dist;
            const sy = cy + Math.sin(s.angle) * s.dist;
            const alpha = 0.3 + Math.sin(t + s.phase) * 0.3;
            const size = s.size + Math.sin(t * 2 + s.phase) * 0.5;

            if (alpha <= 0) continue;

            const color = this.type === 'magnet'
                ? `rgba(231, 150, 130, ${Math.max(0, alpha)})`
                : `rgba(241, 196, 15, ${Math.max(0, alpha)})`;

            ctx.fillStyle = color;

            // 4-pointed star
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
}
