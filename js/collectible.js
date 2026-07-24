// ============================================
// Snacky Dash — Collectible Items
// Hotdog (+100 pts) and Donut (+1 life)
// Now with magnet attraction support.
// 3D: each collectible owns a mesh (createCollectibleMesh)
// synced from logical state via syncMesh().
// ============================================

import { LANE_WIDTH, worldHeightY, logicalToWorldZ } from './utils.js';
import { createCollectibleMesh } from './models.js';

export class Collectible {
    constructor(x, y, type, lane) {
        this.type = type; // 'hotdog' | 'golden_hotdog' | 'donut'
        this.x = x;
        this.baseY = y;
        this.y = y;
        this.width = type === 'donut' ? 32 : 36;
        this.height = type === 'donut' ? 32 : 22;
        this.collected = false;

        // Lane (float while the magnet pulls it across lanes)
        this.lane = lane;

        // Bobbing animation
        this.bobTimer = Math.random() * Math.PI * 2;
        this.glowTimer = 0;

        // Magnet attraction
        this.isAttracted = false;
        this.attractTarget = null; // { x, y }

        // ── 3D mesh ──
        this.mesh = createCollectibleMesh(type);
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

    /** Map logical state -> 3D mesh position/rotation. Called once per frame. */
    syncMesh(time = 0) {
        // Raw float lane -> world x (LANES is evenly spaced: -LANE_WIDTH, 0, +LANE_WIDTH)
        const lane = Math.max(0, Math.min(2, this.lane));
        this.mesh.position.set((lane - 1) * LANE_WIDTH, worldHeightY(this.y, this.height), logicalToWorldZ(this.x));
        this.mesh.rotation.y = time * 0.05; // gentle spin
        // Arany hotdog: csillogó skála-pulzálás
        if (this.type === 'golden_hotdog') {
            this.mesh.scale.setScalar(1 + Math.sin(time * 0.12) * 0.12);
        }
    }
}
