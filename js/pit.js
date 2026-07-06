// ============================================
// Snacky Dash — Pit (Ground Gap)
// A dangerous gap in the road the player must
// jump over. Falls in = damage.
// ============================================

import { GROUND_Y, CANVAS_HEIGHT } from './utils.js';

export class Pit {
    constructor(x, gapWidth) {
        this.x = x;
        this.gapWidth = gapWidth; // 70–130px
        this.passed = false;

        // Pre-generate jagged edge offsets for visual interest
        this.jaggedLeft = [];
        this.jaggedRight = [];
        const edgeSteps = 6;
        for (let i = 0; i < edgeSteps; i++) {
            this.jaggedLeft.push((Math.random() * 6 - 3) | 0);
            this.jaggedRight.push((Math.random() * 6 - 3) | 0);
        }
    }

    update(gameSpeed) {
        this.x -= gameSpeed;
    }

    isOffScreen() {
        return this.x + this.gapWidth < -20;
    }

    /**
     * The dangerous zone: the interior of the gap at ground level.
     * Shrunk horizontally by 10px on each side for fairness.
     */
    getHitbox() {
        return {
            x: (this.x + 10) | 0,
            y: GROUND_Y,
            width: (this.gapWidth - 20) | 0,
            height: CANVAS_HEIGHT - GROUND_Y
        };
    }

    draw(ctx) {
        const x = this.x | 0;
        const gw = this.gapWidth | 0;
        const pitTop = GROUND_Y;
        const pitBottom = CANVAS_HEIGHT;
        const pitHeight = pitBottom - pitTop;

        // ── 1. Dark pit interior with depth gradient ──
        const depthGrad = ctx.createLinearGradient(x, pitTop, x, pitBottom);
        depthGrad.addColorStop(0, '#1a1a2e');
        depthGrad.addColorStop(0.4, '#0d0d1a');
        depthGrad.addColorStop(1, '#000000');
        ctx.fillStyle = depthGrad;
        ctx.fillRect(x, pitTop, gw, pitHeight);

        // ── 2. Jagged / rough edges for visual interest ──
        // Left edge
        ctx.fillStyle = '#3a3a4a';
        const edgeSteps = this.jaggedLeft.length;
        const stepH = (pitHeight / edgeSteps) | 0;
        for (let i = 0; i < edgeSteps; i++) {
            const ey = pitTop + i * stepH;
            const offset = this.jaggedLeft[i];
            ctx.fillRect(x + offset - 2, ey, 5, stepH + 1);
        }
        // Right edge
        for (let i = 0; i < edgeSteps; i++) {
            const ey = pitTop + i * stepH;
            const offset = this.jaggedRight[i];
            ctx.fillRect(x + gw - 3 + offset, ey, 5, stepH + 1);
        }

        // ── 3. Inner shadow at the top of the pit ──
        const shadowGrad = ctx.createLinearGradient(x, pitTop, x, pitTop + 20);
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.fillRect(x + 3, pitTop, gw - 6, 20);

        // ── 4. Hazard stripes on left edge ──
        this._drawHazardStripe(ctx, x - 6, pitTop - 4, 8, pitHeight + 4);

        // ── 5. Hazard stripes on right edge ──
        this._drawHazardStripe(ctx, x + gw - 2, pitTop - 4, 8, pitHeight + 4);

        // ── 6. Warning indicators (small triangles above pit) ──
        this._drawWarningTriangle(ctx, x + (gw / 2) | 0, pitTop - 10);

        // ── 7. Ground crack lines radiating from edges ──
        ctx.strokeStyle = 'rgba(60, 60, 70, 0.6)';
        ctx.lineWidth = 1;
        // Left cracks
        ctx.beginPath();
        ctx.moveTo(x - 2, pitTop);
        ctx.lineTo(x - 12, pitTop - 3);
        ctx.moveTo(x - 1, pitTop + 2);
        ctx.lineTo(x - 8, pitTop + 6);
        ctx.stroke();
        // Right cracks
        ctx.beginPath();
        ctx.moveTo(x + gw + 2, pitTop);
        ctx.lineTo(x + gw + 12, pitTop - 3);
        ctx.moveTo(x + gw + 1, pitTop + 2);
        ctx.lineTo(x + gw + 8, pitTop + 6);
        ctx.stroke();
    }

    /**
     * Draw yellow/black hazard stripes in a vertical strip.
     */
    _drawHazardStripe(ctx, x, y, w, h) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        const stripeSize = 8;
        const numStripes = Math.ceil((h + w) / stripeSize) + 2;
        for (let i = 0; i < numStripes; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#F1C40F' : '#2C2C2C';
            ctx.beginPath();
            const sy = y + i * stripeSize - w;
            ctx.moveTo(x, sy);
            ctx.lineTo(x + w, sy + w);
            ctx.lineTo(x + w, sy + w + stripeSize);
            ctx.lineTo(x, sy + stripeSize);
            ctx.closePath();
            ctx.fill();
        }

        // Darken slightly for depth
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(x, y, w, h);
        ctx.restore();
    }

    /**
     * Small warning triangle icon above the pit.
     */
    _drawWarningTriangle(ctx, cx, cy) {
        const size = 6;
        ctx.fillStyle = '#F1C40F';
        ctx.beginPath();
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx - size, cy + size);
        ctx.lineTo(cx + size, cy + size);
        ctx.closePath();
        ctx.fill();

        // Exclamation mark
        ctx.fillStyle = '#2C2C2C';
        ctx.fillRect(cx - 1, cy - 3, 2, 5);
        ctx.fillRect(cx - 1, cy + 3, 2, 2);
    }
}
