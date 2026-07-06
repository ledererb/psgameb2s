// ============================================
// Snacky Dash — Player Character (SNACKY!)
// Procedurally drawn canvas character matching
// the Snacky design: orange blob body, black
// ears, arms, legs, white eyes.
// ============================================

import {
    GROUND_Y, GRAVITY, JUMP_FORCE, DOUBLE_JUMP_FORCE,
    PLAYER_X, INVINCIBILITY_DURATION, INITIAL_LIVES, MAX_LIVES,
    roundRect
} from './utils.js';

export class Player {
    constructor() {
        this.x = PLAYER_X;
        this.width = 44;
        this.height = 60;
        this.y = GROUND_Y - this.height;

        // Physics
        this.velocityY = 0;
        this.isOnGround = true;
        this.canDoubleJump = true;

        // State
        this.lives = INITIAL_LIVES;
        this.invincibleTimer = 0;

        // Slide / duck
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideMinDuration = 25;
        this.slideCooldown = 0;

        // Slide dust particles
        this.slideDustParticles = [];

        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 6;
        this.rotation = 0;

        // Visual effects
        this.squash = 1;
        this.stretch = 1;

        // Eye look-target tracking
        this.lookTargetX = 0;
        this.lookTargetY = 0;
        this.currentLookX = 0;
        this.currentLookY = 0;

        // Speed-based sweat
        this.speedLevel = 0;

        // Happy timer (frames remaining for excited face after collecting)
        this.happyTimer = 0;
    }

    get isInvincible() {
        return this.invincibleTimer > 0;
    }

    // ── Look-target for eye tracking ──

    setLookTarget(targetX, targetY) {
        this.lookTargetX = targetX;
        this.lookTargetY = targetY;
    }

    // ── Speed level for sweat effect ──

    setSpeedLevel(normalizedSpeed) {
        this.speedLevel = Math.max(0, Math.min(1, normalizedSpeed));
    }

    // ── Happy face trigger ──

    triggerHappy() {
        this.happyTimer = 30;
    }

    // ── Slide mechanic ──

    slide() {
        if (!this.isOnGround || this.isSliding || this.slideCooldown > 0) return;
        this.isSliding = true;
        this.slideTimer = this.slideMinDuration;
        this.squash = 0.5;
        this.stretch = 1.4;
    }

    cancelSlide() {
        if (!this.isSliding) return;
        if (this.slideTimer > 0) return;
        this.isSliding = false;
        this.slideCooldown = 8;
        this.squash = 1.2;
        this.stretch = 0.85;
    }

    jump() {
        if (this.isSliding) {
            this.isSliding = false;
            this.slideCooldown = 8;
            this.squash = 1.2;
            this.stretch = 0.85;
            return null;
        }

        if (this.isOnGround) {
            this.velocityY = JUMP_FORCE;
            this.isOnGround = false;
            this.canDoubleJump = true;
            this.squash = 1.3;
            this.stretch = 0.7;
            return 'jump';
        } else if (this.canDoubleJump) {
            this.velocityY = DOUBLE_JUMP_FORCE;
            this.canDoubleJump = false;
            this.rotation = 0;
            this.squash = 1.2;
            this.stretch = 0.8;
            return 'doubleJump';
        }
        return null;
    }

    hit() {
        if (this.isInvincible) return false;
        this.lives = Math.max(0, this.lives - 1);
        this.invincibleTimer = INVINCIBILITY_DURATION;
        return true;
    }

    addLife() {
        if (this.lives < MAX_LIVES) this.lives++;
    }

    // ── Update ──

    update() {
        if (!this.isOnGround) {
            this.velocityY += GRAVITY;
            this.y += this.velocityY;

            if (!this.canDoubleJump) {
                this.rotation += 0.18;
            }

            if (this.y >= GROUND_Y - this.height) {
                this.y = GROUND_Y - this.height;
                this.velocityY = 0;
                this.isOnGround = true;
                this.canDoubleJump = true;
                this.rotation = 0;
                this.squash = 0.7;
                this.stretch = 1.3;
            }
        }

        if (this.isSliding) {
            if (this.slideTimer > 0) this.slideTimer--;
            if (Math.random() < 0.4) {
                this.slideDustParticles.push({
                    x: this.x - 2 + Math.random() * 6,
                    y: GROUND_Y - 4 + Math.random() * 4,
                    vx: -(1 + Math.random() * 2),
                    vy: -(0.5 + Math.random() * 1.5),
                    life: 12 + (Math.random() * 8) | 0,
                    maxLife: 20,
                    size: 2 + Math.random() * 3
                });
            }
        }

        if (this.slideCooldown > 0) this.slideCooldown--;

        for (let i = this.slideDustParticles.length - 1; i >= 0; i--) {
            const p = this.slideDustParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.life--;
            if (p.life <= 0) this.slideDustParticles.splice(i, 1);
        }

        this.squash += (1 - this.squash) * 0.15;
        this.stretch += (1 - this.stretch) * 0.15;

        if (this.invincibleTimer > 0) this.invincibleTimer--;

        // Lerp eye look toward target
        this.currentLookX += (this.lookTargetX - this.currentLookX) * 0.1;
        this.currentLookY += (this.lookTargetY - this.currentLookY) * 0.1;

        // Decrement happy timer
        if (this.happyTimer > 0) this.happyTimer--;

        this.animTimer++;
        if (this.animTimer >= this.animSpeed) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }
    }

    // ── Draw ──

    draw(ctx) {
        if (this.isInvincible && Math.floor(this.invincibleTimer / 4) % 2 === 0) {
            return;
        }

        this._drawDustParticles(ctx);

        ctx.save();

        const cx = this.x + this.width / 2;
        const cy = this.isSliding
            ? GROUND_Y - 11
            : this.y + this.height / 2;

        ctx.translate(cx, cy);
        if (this.rotation > 0) ctx.rotate(this.rotation);
        ctx.scale(this.stretch, this.squash);
        ctx.translate(-cx, -cy);

        if (this.isSliding) {
            this._drawSliding(ctx);
        } else {
            this._drawSnacky(ctx);
        }
        ctx.restore();
    }

    _drawDustParticles(ctx) {
        for (const p of this.slideDustParticles) {
            const alpha = (p.life / p.maxLife) * 0.5;
            ctx.fillStyle = `rgba(180, 160, 130, ${Math.max(0, alpha)})`;
            ctx.beginPath();
            ctx.arc(p.x | 0, p.y | 0, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ══════════════════════════════════════════════
    //  SNACKY — Standing / Running / Jumping
    // ══════════════════════════════════════════════

    _drawSnacky(ctx) {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;
        const jumping = !this.isOnGround;
        const hurt = this.invincibleTimer > INVINCIBILITY_DURATION - 15;

        // Smooth run cycle: sin wave for leg/arm motion
        const runPhase = Math.sin(this.animFrame * Math.PI / 2);

        // Body center
        const bodyCX = x + w / 2;
        const bodyCY = y + h * 0.38;
        const bodyRX = w / 2 + 2; // horizontal radius
        const bodyRY = h * 0.42;  // vertical radius

        // Slight body bob when running
        const bob = jumping ? 0 : Math.abs(runPhase) * 2;

        // ── Shadow ──
        if (this.isOnGround) {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(bodyCX, GROUND_Y, 20, 5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Legs (black sticks with feet) ──
        const legLen = 16;
        const footW = 10;
        const footH = 5;
        const legY = y + h * 0.75;

        if (jumping) {
            // Legs tucked
            this._drawLeg(ctx, bodyCX - 8, legY - 4, -0.3, legLen - 4, footW, footH);
            this._drawLeg(ctx, bodyCX + 8, legY - 4, 0.3, legLen - 4, footW, footH);
        } else {
            // Running stride
            const legSwing = runPhase * 0.5;
            this._drawLeg(ctx, bodyCX - 7, legY + bob, -legSwing, legLen, footW, footH);
            this._drawLeg(ctx, bodyCX + 7, legY + bob, legSwing, legLen, footW, footH);
        }

        // ── Body (orange pear/blob shape) ──
        const bodyGrad = ctx.createRadialGradient(
            bodyCX - 4, bodyCY - 6 + bob, 2,
            bodyCX, bodyCY + bob, bodyRX + 4
        );
        bodyGrad.addColorStop(0, '#FFB830');  // bright highlight
        bodyGrad.addColorStop(0.4, '#F5A623'); // main orange
        bodyGrad.addColorStop(1, '#E8941E');   // darker edge

        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        // Pear shape: narrower top, wider bottom
        ctx.moveTo(bodyCX, y + 2 + bob);
        ctx.bezierCurveTo(
            bodyCX + bodyRX * 0.7, y + 2 + bob,    // top-right control
            bodyCX + bodyRX + 3, bodyCY - 4 + bob,  // right bulge
            bodyCX + bodyRX + 2, bodyCY + 8 + bob    // right side
        );
        ctx.bezierCurveTo(
            bodyCX + bodyRX + 1, y + h * 0.75 + bob, // bottom-right
            bodyCX + 6, y + h * 0.78 + bob,           // bottom center-right
            bodyCX, y + h * 0.78 + bob                 // bottom center
        );
        ctx.bezierCurveTo(
            bodyCX - 6, y + h * 0.78 + bob,           // bottom center-left
            bodyCX - bodyRX - 1, y + h * 0.75 + bob,  // bottom-left
            bodyCX - bodyRX - 2, bodyCY + 8 + bob     // left side
        );
        ctx.bezierCurveTo(
            bodyCX - bodyRX - 3, bodyCY - 4 + bob,    // left bulge
            bodyCX - bodyRX * 0.7, y + 2 + bob,       // top-left control
            bodyCX, y + 2 + bob                        // top center
        );
        ctx.closePath();
        ctx.fill();

        // Subtle body outline
        ctx.strokeStyle = 'rgba(180, 120, 30, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // ── Arms (black, with movement) ──
        if (jumping) {
            // Arms raised!
            this._drawArm(ctx, bodyCX - bodyRX + 2, bodyCY - 2 + bob, -1.1, 18);
            this._drawArm(ctx, bodyCX + bodyRX - 2, bodyCY - 2 + bob, 1.1, 18);
        } else if (hurt) {
            // Arms near face
            this._drawArm(ctx, bodyCX - bodyRX + 2, bodyCY + bob, -0.8, 14);
            this._drawArm(ctx, bodyCX + bodyRX - 2, bodyCY + bob, 0.8, 14);
        } else {
            // Running arm swing (opposite to legs)
            const armSwing = runPhase * 0.45;
            this._drawArm(ctx, bodyCX - bodyRX + 2, bodyCY + 4 + bob, armSwing - 0.3, 16);
            this._drawArm(ctx, bodyCX + bodyRX - 2, bodyCY + 4 + bob, -armSwing - 0.3, 16);
        }

        // ── Ears (black circles on top) ──
        const earY = y + 4 + bob;
        const earR = 5;

        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(bodyCX - 10, earY, earR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bodyCX + 10, earY, earR, 0, Math.PI * 2);
        ctx.fill();

        // ── Scarf / bandana ──
        this._drawScarf(ctx, bodyCX, bodyCY + 14 + bob);

        // ── Face ──
        const faceY = bodyCY - 6 + bob;

        if (hurt) {
            this._drawHurtFace(ctx, bodyCX, faceY);
        } else if (this.happyTimer > 0 || jumping) {
            this._drawExcitedFace(ctx, bodyCX, faceY);
        } else {
            this._drawNormalFace(ctx, bodyCX, faceY);
        }

        // ── Sweat drop at high speed ──
        if (this.speedLevel > 0.6 && !jumping && !hurt) {
            this._drawSweatDrop(ctx, bodyCX + 10, faceY - 10);
        }
    }

    // ── Helper: draw a single leg ──
    _drawLeg(ctx, lx, ly, angle, length, footW, footH) {
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(angle);

        // Leg stick
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, length);
        ctx.stroke();

        // Foot
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.ellipse(1, length + 1, footW / 2, footH / 2, 0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ── Helper: draw a single arm ──
    _drawArm(ctx, ax, ay, angle, length) {
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);

        // Arm
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);

        // Slight curve for natural look
        const midX = length * 0.3 * Math.sign(angle);
        ctx.quadraticCurveTo(midX, length * 0.5, 0, length);
        ctx.stroke();

        // Hand (small circle)
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(0, length, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ── Normal face (running) ──
    _drawNormalFace(ctx, cx, fy) {
        // Eyes (white with black pupils)
        const eyeSpacing = 8;
        const eyeR = 5.5;
        const pupilR = 3;

        // White
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(cx - eyeSpacing, fy, eyeR, eyeR + 1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + eyeSpacing, fy, eyeR, eyeR + 1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupils (looking right + offset toward look target)
        const lookOffX = Math.max(-2, Math.min(2, this.currentLookX));
        const lookOffY = Math.max(-2, Math.min(2, this.currentLookY));
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(cx - eyeSpacing + 1.5 + lookOffX, fy + 0.5 + lookOffY, pupilR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + eyeSpacing + 1.5 + lookOffX, fy + 0.5 + lookOffY, pupilR, 0, Math.PI * 2);
        ctx.fill();

        // Eye highlights
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx - eyeSpacing + 2.5, fy - 1.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + eyeSpacing + 2.5, fy - 1.5, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Nose (small black dot)
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(cx + 1, fy + 7, 2, 0, Math.PI * 2);
        ctx.fill();

        // Mouth (cute smile)
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, fy + 10, 4, 0.1, Math.PI - 0.1);
        ctx.stroke();
    }

    // ── Excited face (jumping) ──
    _drawExcitedFace(ctx, cx, fy) {
        const eyeSpacing = 8;
        const eyeR = 6;
        const pupilR = 3;

        // Big white eyes
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(cx - eyeSpacing, fy - 1, eyeR, eyeR + 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + eyeSpacing, fy - 1, eyeR, eyeR + 1.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Star-struck pupils (with look offset)
        const exLookOffX = Math.max(-2, Math.min(2, this.currentLookX));
        const exLookOffY = Math.max(-2, Math.min(2, this.currentLookY));
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(cx - eyeSpacing + exLookOffX, fy - 0.5 + exLookOffY, pupilR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + eyeSpacing + exLookOffX, fy - 0.5 + exLookOffY, pupilR, 0, Math.PI * 2);
        ctx.fill();

        // Highlights
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx - eyeSpacing + 2, fy - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + eyeSpacing + 2, fy - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(cx, fy + 6, 2, 0, Math.PI * 2);
        ctx.fill();

        // Open mouth (big smile)
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(cx, fy + 11, 5, 0, Math.PI);
        ctx.fill();

        // Tongue
        ctx.fillStyle = '#E86464';
        ctx.beginPath();
        ctx.arc(cx, fy + 12, 3, 0, Math.PI);
        ctx.fill();
    }

    // ── Hurt face ──
    _drawHurtFace(ctx, cx, fy) {
        // Squinted eyes (X shapes)
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        // Left X eye
        ctx.beginPath();
        ctx.moveTo(cx - 12, fy - 3);
        ctx.lineTo(cx - 5, fy + 3);
        ctx.moveTo(cx - 5, fy - 3);
        ctx.lineTo(cx - 12, fy + 3);
        ctx.stroke();

        // Right X eye
        ctx.beginPath();
        ctx.moveTo(cx + 5, fy - 3);
        ctx.lineTo(cx + 12, fy + 3);
        ctx.moveTo(cx + 12, fy - 3);
        ctx.lineTo(cx + 5, fy + 3);
        ctx.stroke();

        // Nose
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(cx, fy + 7, 2, 0, Math.PI * 2);
        ctx.fill();

        // Wobbly mouth
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 5, fy + 12);
        ctx.quadraticCurveTo(cx - 2, fy + 10, cx, fy + 12);
        ctx.quadraticCurveTo(cx + 2, fy + 14, cx + 5, fy + 12);
        ctx.stroke();

        // Stars around head
        const starTime = Date.now() * 0.003;
        for (let i = 0; i < 3; i++) {
            const angle = starTime + i * (Math.PI * 2 / 3);
            const sx = cx + Math.cos(angle) * 20;
            const sy = fy - 14 + Math.sin(angle) * 6;
            this._drawStar(ctx, sx, sy, 3, '#FFD700');
        }
    }

    // ── Mini star helper ──
    _drawStar(ctx, sx, sy, size, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = -Math.PI / 2 + (i * Math.PI * 2 / 5);
            const outerX = sx + Math.cos(angle) * size;
            const outerY = sy + Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(outerX, outerY);
            else ctx.lineTo(outerX, outerY);

            const innerAngle = angle + Math.PI / 5;
            const innerX = sx + Math.cos(innerAngle) * (size * 0.4);
            const innerY = sy + Math.sin(innerAngle) * (size * 0.4);
            ctx.lineTo(innerX, innerY);
        }
        ctx.closePath();
        ctx.fill();
    }

    // ── Sweat drop helper ──
    _drawSweatDrop(ctx, dx, dy) {
        const bobY = Math.sin(this.animFrame * Math.PI / 2) * 1.5;
        const dropX = dx;
        const dropY = dy + bobY;

        ctx.fillStyle = 'rgba(100, 180, 255, 0.7)';
        ctx.beginPath();
        // Teardrop shape
        ctx.moveTo(dropX, dropY - 4);
        ctx.quadraticCurveTo(dropX + 3, dropY, dropX, dropY + 3);
        ctx.quadraticCurveTo(dropX - 3, dropY, dropX, dropY - 4);
        ctx.closePath();
        ctx.fill();

        // Small highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(dropX - 0.5, dropY - 1, 0.8, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Flowing scarf / bandana ──
    _drawScarf(ctx, cx, sy) {
        const scarfColor = '#E74C3C';
        const scarfDark = '#C0392B';

        // Scarf band around neck
        const scarfGrad = ctx.createLinearGradient(cx - 14, sy - 2, cx + 14, sy + 4);
        scarfGrad.addColorStop(0, scarfColor);
        scarfGrad.addColorStop(0.5, '#E95E4F');
        scarfGrad.addColorStop(1, scarfDark);

        ctx.fillStyle = scarfGrad;
        ctx.beginPath();
        ctx.ellipse(cx, sy, 14, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Flowing tail (animated with sin wave)
        const wave1 = Math.sin(this.animFrame * Math.PI / 2) * 3;
        const wave2 = Math.sin(this.animFrame * Math.PI / 2 + 1.5) * 4;

        const tailStartX = cx - 10;
        const tailStartY = sy + 1;

        const tailGrad = ctx.createLinearGradient(tailStartX, tailStartY, tailStartX - 18, tailStartY + 10);
        tailGrad.addColorStop(0, scarfColor);
        tailGrad.addColorStop(1, scarfDark);

        ctx.fillStyle = tailGrad;
        ctx.beginPath();
        ctx.moveTo(tailStartX, tailStartY - 2);
        ctx.quadraticCurveTo(
            tailStartX - 8 + wave1, tailStartY + 2 + wave1 * 0.5,
            tailStartX - 16 + wave2, tailStartY + 8 + wave2 * 0.3
        );
        ctx.lineTo(tailStartX - 18 + wave2, tailStartY + 12 + wave2 * 0.3);
        ctx.quadraticCurveTo(
            tailStartX - 10 + wave1, tailStartY + 6 + wave1 * 0.4,
            tailStartX, tailStartY + 3
        );
        ctx.closePath();
        ctx.fill();

        // Subtle outline on tail
        ctx.strokeStyle = 'rgba(150, 40, 30, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    // ══════════════════════════════════════════════
    //  SNACKY — Sliding pose
    // ══════════════════════════════════════════════

    _drawSliding(ctx) {
        const x = this.x;
        const y = GROUND_Y - 22;
        const w = this.width;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(x + w / 2 + 4, GROUND_Y, 26, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs (stretched forward)
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        // Front leg
        ctx.beginPath();
        ctx.moveTo(x + w + 4, y + 10);
        ctx.lineTo(x + w + 16, y + 14);
        ctx.stroke();
        // Back leg
        ctx.beginPath();
        ctx.moveTo(x - 2, y + 12);
        ctx.lineTo(x - 12, y + 16);
        ctx.stroke();

        // Feet
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.ellipse(x + w + 18, y + 15, 5, 3, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - 13, y + 17, 5, 3, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // Body (horizontal orange blob)
        const bodyCX = x + w / 2 + 2;
        const bodyCY = y + 8;

        const slideGrad = ctx.createRadialGradient(
            bodyCX - 4, bodyCY - 3, 2,
            bodyCX, bodyCY, 24
        );
        slideGrad.addColorStop(0, '#FFB830');
        slideGrad.addColorStop(0.5, '#F5A623');
        slideGrad.addColorStop(1, '#E8941E');

        ctx.fillStyle = slideGrad;
        ctx.beginPath();
        ctx.ellipse(bodyCX, bodyCY, 24, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(180, 120, 30, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Arms (tucked)
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        // Front arm
        ctx.beginPath();
        ctx.moveTo(bodyCX + 14, bodyCY - 2);
        ctx.lineTo(bodyCX + 20, bodyCY + 4);
        ctx.stroke();
        // Back arm
        ctx.beginPath();
        ctx.moveTo(bodyCX - 14, bodyCY);
        ctx.lineTo(bodyCX - 20, bodyCY + 5);
        ctx.stroke();

        // Ears (on the right side since body is horizontal)
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(bodyCX + 16, bodyCY - 8, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bodyCX + 22, bodyCY - 5, 4, 0, Math.PI * 2);
        ctx.fill();

        // Face (right side of horizontal body)
        const faceCX = bodyCX + 14;
        const faceCY = bodyCY - 1;

        // Eye (one visible, determined look)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(faceCX + 2, faceCY - 2, 4, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(faceCX + 3, faceCY - 1.5, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(faceCX + 4, faceCY - 3, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Determined eyebrow
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(faceCX - 1, faceCY - 6);
        ctx.lineTo(faceCX + 5, faceCY - 5);
        ctx.stroke();

        // Nose
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(faceCX + 5, faceCY + 2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Speed lines behind
        ctx.strokeStyle = 'rgba(255, 200, 100, 0.4)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
            const ly = bodyCY - 6 + i * 4;
            const lx = x - 16 - i * 5;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx + 8 + i * 2, ly);
            ctx.stroke();
        }
    }

    // ── Hitbox ──

    getHitbox() {
        if (this.isSliding) {
            return {
                x: (this.x + 4) | 0,
                y: GROUND_Y - 22,
                width: this.width + 10,
                height: 18
            };
        }
        return {
            x: this.x + 8,
            y: this.y + 6,
            width: this.width - 16,
            height: this.height - 12
        };
    }

    // ── Reset ──

    reset() {
        this.y = GROUND_Y - this.height;
        this.velocityY = 0;
        this.isOnGround = true;
        this.canDoubleJump = true;
        this.lives = INITIAL_LIVES;
        this.invincibleTimer = 0;
        this.animFrame = 0;
        this.animTimer = 0;
        this.rotation = 0;
        this.squash = 1;
        this.stretch = 1;

        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldown = 0;
        this.slideDustParticles = [];

        this.lookTargetX = 0;
        this.lookTargetY = 0;
        this.currentLookX = 0;
        this.currentLookY = 0;
        this.speedLevel = 0;
        this.happyTimer = 0;
    }
}
