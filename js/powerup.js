// ============================================
// Snacky Dash — Power-Ups
// Magnet: attracts collectibles for 8 seconds
// Double Score: doubles points for 10 seconds
// 3D: each power-up owns a mesh (createPowerUpMesh)
// synced from logical state via syncMesh().
// ============================================

import { LANE_WIDTH, worldHeightY, logicalToWorldZ } from './utils.js';
import { createPowerUpMesh } from './models.js';

export class PowerUp {
    /**
     * @param {number} x - Spawn X position
     * @param {number} y - Spawn Y position
     * @param {'magnet'|'double_score'} type
     * @param {number} lane - Lane index (0..2)
     */
    constructor(x, y, type, lane) {
        this.x = x;
        this.y = y;
        this.baseY = y;
        this.type = type;
        this.lane = lane;

        this.width = 36;
        this.height = 36;
        this.collected = false;

        // Animation timers
        this.bobTimer = Math.random() * Math.PI * 2;
        this.glowTimer = 0;
        this.pulseTimer = 0;

        // ── 3D mesh ──
        this.mesh = createPowerUpMesh(type);
    }

    update(gameSpeed) {
        this.x -= gameSpeed;
        this.bobTimer += 0.07;
        this.glowTimer += 0.06;
        this.pulseTimer += 0.08;

        // Bobbing up and down
        this.y = (this.baseY + Math.sin(this.bobTimer) * 6) | 0;
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

    /** Map logical state -> 3D mesh position/rotation. Called once per frame. */
    syncMesh(time = 0) {
        const lane = Math.max(0, Math.min(2, this.lane));
        this.mesh.position.set((lane - 1) * LANE_WIDTH, worldHeightY(this.y, this.height), logicalToWorldZ(this.x));
        this.mesh.rotation.y = time * 0.05; // gentle spin
    }
}
