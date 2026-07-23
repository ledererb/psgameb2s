// ============================================
// Snacky Dash — Player Character (SNACKY!)
// Physics + lane system + 3D mesh sync.
// All canvas drawing removed — the procedural
// 3D model (createSnackyModel) is the visual.
// ============================================

import {
    GROUND_Y, GRAVITY, JUMP_FORCE, DOUBLE_JUMP_FORCE,
    PLAYER_X, INVINCIBILITY_DURATION, INITIAL_LIVES, MAX_LIVES,
    LANES, worldHeightY
} from './utils.js';
import { createSnackyModel } from './models.js';

// Base pupil positions inside the head group (from createSnackyModel)
const PUPIL_BASE = { x: 0.2, y: 0.12, z: -0.52 };

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

        // Lane system (0=left, 1=middle, 2=right)
        this.lane = 1;
        this.worldX = 0;

        // 3D model
        const model = createSnackyModel();
        this.mesh = model.group;
        this.parts = model.parts;
        this.animTime = 0;

        // Visual effects
        this.squash = 1;
        this.stretch = 1;

        // Eye look-target tracking
        this.lookTargetX = 0;
        this.lookTargetY = 0;
        this.currentLookX = 0;
        this.currentLookY = 0;

        // Ground pound
        this.isGroundPounding = false;

        // Speed level (set by game.js; visual sweat drop is gone with 2D)
        this.speedLevel = 0;

        // Happy timer (set by game.js on collect; kept for API compatibility)
        this.happyTimer = 0;
    }

    get isInvincible() {
        return this.invincibleTimer > 0;
    }

    // ── Lane system ──

    changeLane(dir) {
        const next = Math.max(0, Math.min(2, this.lane + dir));
        if (next === this.lane) return false;
        this.lane = next;
        return true;
    }

    // ── Look-target for eye tracking ──

    setLookTarget(targetX, targetY) {
        this.lookTargetX = targetX;
        this.lookTargetY = targetY;
    }

    // ── Speed level (setter kept; visual removed) ──

    setSpeedLevel(normalizedSpeed) {
        this.speedLevel = Math.max(0, Math.min(1, normalizedSpeed));
    }

    // ── Happy face trigger (visual removed; kept for API compatibility) ──

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

    // ── Ground pound mechanic ──

    groundPound() {
        if (this.isOnGround || this.isSliding) return null;
        this.velocityY = 18;
        this.isGroundPounding = true;
        return 'groundPound';
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

            if (this.y >= GROUND_Y - this.height) {
                this.y = GROUND_Y - this.height;
                this.velocityY = 0;
                this.isOnGround = true;
                this.canDoubleJump = true;

                if (this.isGroundPounding) {
                    this.isGroundPounding = false;
                    this.squash = 0.4;
                    this.stretch = 1.6;
                } else {
                    this.squash = 0.7;
                    this.stretch = 1.3;
                }
            }
        }

        if (this.isSliding) {
            if (this.slideTimer > 0) this.slideTimer--;
        }

        if (this.slideCooldown > 0) this.slideCooldown--;

        this.squash += (1 - this.squash) * 0.15;
        this.stretch += (1 - this.stretch) * 0.15;

        if (this.invincibleTimer > 0) this.invincibleTimer--;

        // Lerp eye look toward target
        this.currentLookX += (this.lookTargetX - this.currentLookX) * 0.1;
        this.currentLookY += (this.lookTargetY - this.currentLookY) * 0.1;

        // Decrement happy timer
        if (this.happyTimer > 0) this.happyTimer--;
    }

    /** Map logical state -> 3D mesh position/rotation/scale. Called once per frame. */
    syncMesh() {
        const m = this.mesh;

        // Smooth lane movement
        this.worldX += (LANES[this.lane] - this.worldX) * 0.25;

        // Height above ground (standing height is 60 logical px).
        // NOTE: raw WORLD_SCALE maps screen px to world DEPTH — applied to
        // height, the 130px jump apex becomes 13 world units (~9 body
        // heights) and Snacky leaves the camera frame. worldHeightY()
        // applies HEIGHT_SCALE (0.25): apex ≈ 2 body heights.
        const y = worldHeightY(this.y, this.height);

        m.position.set(this.worldX, y, 0);

        // Run animation
        this.animTime += 0.18;
        const runCycle = Math.sin(this.animTime);
        if (this.isOnGround && !this.isSliding) {
            m.position.y += Math.abs(runCycle) * 0.08;
            this.parts.legL.rotation.x = runCycle * 0.9;
            this.parts.legR.rotation.x = -runCycle * 0.9;
            this.parts.armL.rotation.x = -runCycle * 0.7;
            this.parts.armR.rotation.x = runCycle * 0.7;
        } else if (this.isSliding) {
            this.parts.legL.rotation.x = 0.4;
            this.parts.legR.rotation.x = 0.4;
        }

        // Squash & stretch (existing this.squash / this.stretch values)
        m.scale.set(this.squash, this.stretch, this.squash);

        // Lane-change tilt + air tilt
        const laneVel = LANES[this.lane] - this.worldX;
        m.rotation.z = -laneVel * 0.9;
        m.rotation.x = this.isSliding ? -0.9 : (this.isGroundPounding ? 0.4 : 0);

        // Scarf flutter
        this.parts.scarf.rotation.x = Math.sin(this.animTime * 1.7) * 0.4;

        // Pupil shift toward look target (clamped to ±0.03 world units)
        const lookX = Math.max(-0.03, Math.min(0.03, this.currentLookX * 0.01));
        const lookY = Math.max(-0.03, Math.min(0.03, -this.currentLookY * 0.01));
        this.parts.pupilL.position.set(-PUPIL_BASE.x + lookX, PUPIL_BASE.y + lookY, PUPIL_BASE.z);
        this.parts.pupilR.position.set(PUPIL_BASE.x + lookX, PUPIL_BASE.y + lookY, PUPIL_BASE.z);

        // Invincibility blink
        m.visible = this.invincibleTimer <= 0 || Math.floor(this.invincibleTimer / 6) % 2 === 0;
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
        this.squash = 1;
        this.stretch = 1;

        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldown = 0;
        this.isGroundPounding = false;

        this.lane = 1;
        this.worldX = 0;
        this.mesh.visible = true;

        this.lookTargetX = 0;
        this.lookTargetY = 0;
        this.currentLookX = 0;
        this.currentLookY = 0;
        this.speedLevel = 0;
        this.happyTimer = 0;
    }
}
