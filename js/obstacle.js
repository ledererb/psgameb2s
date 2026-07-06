// ============================================
// Snacky Dash — Obstacles
// Six types: crate, barrel, tall_crate,
//   barrier, rolling_barrel, flying_bird
// ============================================

import { GROUND_Y, roundRect } from './utils.js';

const OBSTACLE_DEFS = {
    crate:          { width: 50,  height: 50 },
    barrel:         { width: 44,  height: 62 },
    tall_crate:     { width: 50,  height: 95 },
    barrier:        { width: 180, height: 18, isElevated: true },
    rolling_barrel: { width: 44,  height: 50 },
    flying_bird:    { width: 40,  height: 30 }
};

export class Obstacle {
    constructor(x, type) {
        const def = OBSTACLE_DEFS[type] || OBSTACLE_DEFS.crate;
        this.type = type;
        this.width = def.width;
        this.height = def.height;
        this.x = x;
        this.passed = false;

        // ── Type-specific setup ──
        if (type === 'barrier') {
            // Barrier floats above ground — player must slide under
            this.y = GROUND_Y - 50;
        } else if (type === 'flying_bird') {
            // Bird flies at a random altitude and oscillates
            this.baseY = GROUND_Y - 60 - Math.floor(Math.random() * 60); // -60 to -120
            this.y = this.baseY;
            this.flyTimer = Math.floor(Math.random() * 100); // random phase
            this.wingFrame = 0;
        } else if (type === 'rolling_barrel') {
            // Rolling barrel sits on ground but has rotation
            this.y = GROUND_Y - this.height;
            this.rotation = 0;
        } else {
            this.y = GROUND_Y - this.height;
        }
    }

    update(gameSpeed) {
        switch (this.type) {
            case 'rolling_barrel':
                // 40% faster than normal game speed
                this.x -= gameSpeed * 1.4;
                this.rotation += 0.15;
                break;

            case 'flying_bird':
                this.x -= gameSpeed;
                this.flyTimer++;
                this.y = (this.baseY + Math.sin(this.flyTimer * 0.06) * 25) | 0;
                this.wingFrame = (this.wingFrame + 0.12);
                break;

            default:
                this.x -= gameSpeed;
                break;
        }
    }

    isOffScreen() {
        return this.x + this.width < -20;
    }

    getHitbox() {
        if (this.type === 'barrier') {
            // Extends from top of screen to bottom of bar — cannot jump over!
            // Only sliding (hitbox at GROUND_Y-22, 18px tall) fits under
            const barBottom = this.y + this.height;
            return {
                x: (this.x + 8) | 0,
                y: 0,
                width: this.width - 16,
                height: barBottom
            };
        }
        if (this.type === 'flying_bird') {
            return {
                x: (this.x + 4) | 0,
                y: (this.y + 4) | 0,
                width: this.width - 8,
                height: this.height - 8
            };
        }
        return {
            x: (this.x + 4) | 0,
            y: (this.y + 4) | 0,
            width: this.width - 8,
            height: this.height - 4
        };
    }

    draw(ctx) {
        // Draw ground shadow for ground-level obstacles
        // Skip flying_bird (airborne shadow handled separately) and barrier (elevated)
        if (this.type !== 'flying_bird' && this.type !== 'barrier') {
            this._drawGroundShadow(ctx);
        }

        switch (this.type) {
            case 'crate':
            case 'tall_crate':
                this._drawCrate(ctx);
                break;
            case 'barrel':
                this._drawBarrel(ctx);
                break;
            case 'barrier':
                this._drawBarrier(ctx);
                break;
            case 'rolling_barrel':
                this._drawRollingBarrel(ctx);
                break;
            case 'flying_bird':
                this._drawFlyingBird(ctx);
                break;
        }
    }

    // ── Ground Shadow ──

    _drawGroundShadow(ctx) {
        const shadowW = this.width * 0.5;
        const shadowH = 5;
        const shadowX = this.x + this.width / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(shadowX, GROUND_Y, shadowW, shadowH, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Crate ──

    _drawCrate(ctx) {
        const { x, y, width: w, height: h } = this;

        // Body
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, '#B8860B');
        grad.addColorStop(0.5, '#DAA520');
        grad.addColorStop(1, '#8B6914');
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, w, h, 3);
        ctx.fill();

        // Inner face
        ctx.fillStyle = '#C49A1A';
        roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 2);
        ctx.fill();

        // Cross boards
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 4);
        ctx.lineTo(x + w - 4, y + h - 4);
        ctx.moveTo(x + w - 4, y + 4);
        ctx.lineTo(x + 4, y + h - 4);
        ctx.stroke();

        // Nails at center
        ctx.fillStyle = '#A0A0A0';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = '#6B4F10';
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, w, h, 3);
        ctx.stroke();

        // Highlight edge
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 1);
        ctx.lineTo(x + w - 3, y + 1);
        ctx.stroke();
    }

    // ── Barrel ──

    _drawBarrel(ctx) {
        const { x, y, width: w, height: h } = this;
        const cx = x + w / 2;

        // Main body
        const grad = ctx.createLinearGradient(x, y, x + w, y);
        grad.addColorStop(0, '#6D3A1F');
        grad.addColorStop(0.3, '#8B4513');
        grad.addColorStop(0.7, '#A0522D');
        grad.addColorStop(1, '#6D3A1F');
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, w, h, 6);
        ctx.fill();

        // Wood plank lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        for (let px = x + 10; px < x + w; px += 12) {
            ctx.beginPath();
            ctx.moveTo(px, y + 6);
            ctx.lineTo(px, y + h - 6);
            ctx.stroke();
        }

        // Metal bands
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = 3;
        const bandPositions = [0.15, 0.5, 0.85];
        for (const p of bandPositions) {
            const by = y + h * p;
            ctx.beginPath();
            ctx.moveTo(x + 2, by);
            ctx.lineTo(x + w - 2, by);
            ctx.stroke();
        }

        // Band rivets
        ctx.fillStyle = '#B0B0B0';
        for (const p of bandPositions) {
            const by = y + h * p;
            ctx.beginPath();
            ctx.arc(x + 5, by, 2, 0, Math.PI * 2);
            ctx.arc(x + w - 5, by, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + w * 0.35, y + 3, w * 0.12, h - 6);

        // Border
        ctx.strokeStyle = '#4A2A10';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, w, h, 6);
        ctx.stroke();
    }

    // ── Barrier (slide-under obstacle) ──

    _drawBarrier(ctx) {
        const { x, y, width: w, height: h } = this;
        const postWidth = 10;
        const postTop = y - 120; // Posts extend 120px above the bar
        const postBottom = GROUND_Y;
        const totalPostH = postBottom - postTop;

        // ── Support posts (extend far above bar → can't jump over) ──
        const postGrad = ctx.createLinearGradient(x, postTop, x + postWidth, postTop);
        postGrad.addColorStop(0, '#7F8C8D');
        postGrad.addColorStop(0.5, '#95A5A6');
        postGrad.addColorStop(1, '#7F8C8D');

        // Left post (tall)
        ctx.fillStyle = postGrad;
        ctx.fillRect(x + 4, postTop, postWidth, totalPostH);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + 6, postTop, 3, totalPostH);

        // Right post (tall)
        ctx.fillStyle = postGrad;
        ctx.fillRect(x + w - postWidth - 4, postTop, postWidth, totalPostH);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + w - postWidth - 2, postTop, 3, totalPostH);

        // Post caps (top)
        ctx.fillStyle = '#BDC3C7';
        ctx.beginPath();
        ctx.arc(x + 4 + postWidth / 2, postTop, postWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + w - postWidth / 2 - 4, postTop, postWidth / 2, 0, Math.PI * 2);
        ctx.fill();

        // Post bases (ground)
        ctx.fillStyle = '#5D6D7E';
        ctx.fillRect(x, GROUND_Y - 6, postWidth + 8, 6);
        ctx.fillRect(x + w - postWidth - 8, GROUND_Y - 6, postWidth + 8, 6);

        // ── Cross-wires above the bar (fence effect) ──
        ctx.strokeStyle = 'rgba(150, 160, 170, 0.6)';
        ctx.lineWidth = 1.5;
        const wireSpacing = 22;
        for (let wy = y - wireSpacing; wy > postTop + 10; wy -= wireSpacing) {
            ctx.beginPath();
            ctx.moveTo(x + 14, wy);
            ctx.lineTo(x + w - 14, wy);
            ctx.stroke();
        }

        // Diagonal cross-wires (X pattern)
        ctx.strokeStyle = 'rgba(150, 160, 170, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 14, postTop + 10);
        ctx.lineTo(x + w - 14, y - 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + w - 14, postTop + 10);
        ctx.lineTo(x + 14, y - 2);
        ctx.stroke();

        // ── "⛔" No jump icon above bar ──
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('⛔', x + w / 2, y - 50);

        // ── Main horizontal bar with warning stripes ──
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 3);
        ctx.clip();

        const stripeW = 14;
        const numStripes = Math.ceil(w / stripeW) + 2;
        for (let i = 0; i < numStripes; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#F1C40F' : '#2C3E50';
            const sx = x - stripeW + i * stripeW;
            ctx.beginPath();
            ctx.moveTo(sx, y + 2);
            ctx.lineTo(sx + stripeW, y + 2);
            ctx.lineTo(sx + stripeW - h, y + h - 2);
            ctx.lineTo(sx - h, y + h - 2);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // Bar border
        ctx.strokeStyle = '#2C3E50';
        ctx.lineWidth = 2;
        roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 3);
        ctx.stroke();

        // Bar top highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 3);
        ctx.lineTo(x + w - 6, y + 3);
        ctx.stroke();

        // ── Electric spark / crackle effects ──
        const now = Date.now();
        // Draw 2 sparks that flash intermittently
        for (let si = 0; si < 2; si++) {
            // Each spark has its own phase offset for independent flashing
            if (((now + si * 137) % 300) < 140) {
                ctx.strokeStyle = '#00DDFF';
                ctx.lineWidth = 1.5;
                ctx.shadowColor = '#00DDFF';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                // Random-ish zigzag near the horizontal bar
                const sparkX = x + 20 + ((now * (si + 1)) % (w - 40 | 1));
                const sparkY = y + h / 2;
                ctx.moveTo(sparkX, sparkY - 6);
                ctx.lineTo(sparkX + 3, sparkY - 2);
                ctx.lineTo(sparkX - 2, sparkY + 1);
                ctx.lineTo(sparkX + 4, sparkY + 5);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }
    }

    // ── Rolling Barrel (faster, rotating) ──

    _drawRollingBarrel(ctx) {
        const { x, y, width: w, height: h } = this;
        const cx = (x + w / 2) | 0;
        const cy = (y + h / 2) | 0;

        ctx.save();
        // Apply rotation around the barrel center
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);
        ctx.translate(-cx, -cy);

        // Main body — redder tone to signal danger
        const grad = ctx.createLinearGradient(x, y, x + w, y);
        grad.addColorStop(0, '#8B2500');
        grad.addColorStop(0.3, '#A52A2A');
        grad.addColorStop(0.7, '#CD3333');
        grad.addColorStop(1, '#8B2500');
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, w, h, 8);
        ctx.fill();

        // Wood plank lines
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        for (let px = x + 10; px < x + w; px += 11) {
            ctx.beginPath();
            ctx.moveTo(px, y + 6);
            ctx.lineTo(px, y + h - 6);
            ctx.stroke();
        }

        // Metal bands (thicker, danger-red tint)
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 3.5;
        const bands = [0.18, 0.5, 0.82];
        for (const p of bands) {
            const by = y + h * p;
            ctx.beginPath();
            ctx.moveTo(x + 2, by);
            ctx.lineTo(x + w - 2, by);
            ctx.stroke();
        }

        // Band rivets
        ctx.fillStyle = '#AAA';
        for (const p of bands) {
            const by = y + h * p;
            ctx.beginPath();
            ctx.arc(x + 6, by, 2, 0, Math.PI * 2);
            ctx.arc(x + w - 6, by, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Danger symbol — small skull/crossbone in center
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☠', cx, cy);

        // Border
        ctx.strokeStyle = '#5A1A00';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, w, h, 8);
        ctx.stroke();

        ctx.restore();

        // Motion blur lines (behind barrel, not rotated)
        ctx.strokeStyle = 'rgba(139, 37, 0, 0.3)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const ly = y + 10 + i * 15;
            ctx.beginPath();
            ctx.moveTo(x + w + 3, ly);
            ctx.lineTo(x + w + 10 + i * 4, ly);
            ctx.stroke();
        }

        // Dust trail particles at ground level behind the barrel
        for (let i = 0; i < 3; i++) {
            const dustX = x + w + 6 + i * 8;
            const dustY = GROUND_Y - 3 - Math.random() * 4;
            const dustR = 3 - i * 0.7;
            const alpha = 0.35 - i * 0.1;
            ctx.fillStyle = `rgba(160, 140, 100, ${alpha})`;
            ctx.beginPath();
            ctx.arc(dustX, dustY, dustR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Flying Bird ──

    _drawFlyingBird(ctx) {
        const { x, y, width: w, height: h } = this;
        const cx = (x + w / 2) | 0;
        const cy = (y + h / 2) | 0;

        // Wing flap cycle
        const wingAngle = Math.sin(this.wingFrame) * 0.6;

        // Shadow on ground
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y, 14, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Body (oval) ──
        const bodyGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
        bodyGrad.addColorStop(0, '#5D4E37');
        bodyGrad.addColorStop(1, '#3E2F1C');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 14, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body outline
        ctx.strokeStyle = '#2C2010';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Belly (lighter underside)
        ctx.fillStyle = '#8B7D6B';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 3, 10, 5, 0, 0, Math.PI);
        ctx.fill();

        // ── Wings (V-shape, animated) ──
        ctx.strokeStyle = '#4A3B28';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';

        // Left wing
        ctx.save();
        ctx.translate(cx - 6, cy - 4);
        ctx.rotate(-wingAngle - 0.3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-10, -12, -18, -6);
        ctx.stroke();
        // Wing feather fill
        ctx.fillStyle = '#6B5B45';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-10, -12, -18, -6);
        ctx.quadraticCurveTo(-8, -4, 0, 0);
        ctx.fill();
        ctx.restore();

        // Right wing
        ctx.save();
        ctx.translate(cx + 6, cy - 4);
        ctx.rotate(wingAngle + 0.3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(10, -12, 18, -6);
        ctx.stroke();
        // Wing feather fill
        ctx.fillStyle = '#6B5B45';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(10, -12, 18, -6);
        ctx.quadraticCurveTo(8, -4, 0, 0);
        ctx.fill();
        ctx.restore();

        // ── Tail feathers ──
        ctx.fillStyle = '#4A3B28';
        ctx.beginPath();
        ctx.moveTo(x - 2, cy);
        ctx.lineTo(x - 8, cy - 4);
        ctx.lineTo(x - 6, cy + 2);
        ctx.lineTo(x - 10, cy + 1);
        ctx.lineTo(x - 4, cy + 4);
        ctx.closePath();
        ctx.fill();

        // ── Head ──
        ctx.fillStyle = '#5D4E37';
        ctx.beginPath();
        ctx.arc(x + w - 6, cy - 4, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2C2010';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Eye (white + pupil)
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x + w - 3, cy - 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(x + w - 2, cy - 5, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Eye highlight
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x + w - 1.5, cy - 6, 0.7, 0, Math.PI * 2);
        ctx.fill();

        // Angry eyebrow
        ctx.strokeStyle = '#2C2010';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + w - 6, cy - 8);
        ctx.lineTo(x + w - 1, cy - 7);
        ctx.stroke();

        // ── Beak ──
        ctx.fillStyle = '#E67E22';
        ctx.beginPath();
        ctx.moveTo(x + w + 1, cy - 5);
        ctx.lineTo(x + w + 8, cy - 3);
        ctx.lineTo(x + w + 1, cy - 1);
        ctx.closePath();
        ctx.fill();
        // Beak line
        ctx.strokeStyle = '#D35400';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + w + 1, cy - 3);
        ctx.lineTo(x + w + 7, cy - 3);
        ctx.stroke();

        // ── Falling feather particles ──
        // Use wingFrame for animation timing; draw 1-2 tiny feathers drifting behind
        const featherPhase = this.wingFrame;
        for (let fi = 0; fi < 2; fi++) {
            const drift = ((featherPhase + fi * 3.7) % 6.28);
            // Feather only visible part of its cycle to feel "occasional"
            if (Math.sin(drift * 1.3 + fi) > 0.2) {
                const fx = x - 4 - fi * 10 + Math.sin(drift * 2) * 4;
                const fy = cy + 8 + ((featherPhase * 1.5 + fi * 20) % 40);
                const fAngle = Math.sin(drift) * 0.5;
                ctx.save();
                ctx.translate(fx, fy);
                ctx.rotate(fAngle);
                ctx.strokeStyle = 'rgba(90, 75, 55, 0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(3, -2, 6, 0);
                ctx.stroke();
                // Tiny barbs
                ctx.strokeStyle = 'rgba(90, 75, 55, 0.3)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(2, -0.5);
                ctx.lineTo(3, -2);
                ctx.moveTo(4, -0.5);
                ctx.lineTo(5, -2);
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}
