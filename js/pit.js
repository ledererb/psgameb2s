// ============================================
// Snacky Dash — Pit (Ground Gap)
// A dangerous gap in the road the player must
// jump over. Falls in = damage.
// 3D: each pit owns a mesh (createPitMesh)
// synced from logical state via syncMesh().
// ============================================

import { GROUND_Y, CANVAS_HEIGHT, LANES, WORLD_SCALE, logicalToWorldZ } from './utils.js';
import { createPitMesh } from './models.js';

export class Pit {
    /**
     * @param {number} x logical spawn x
     * @param {number} gapWidth logical gap width (70–130px)
     * @param {number} lane 0|1|2 for a single-lane pit, -1 = full-width (all lanes)
     */
    constructor(x, gapWidth, lane) {
        this.x = x;
        this.gapWidth = gapWidth; // 70–130px
        this.passed = false;

        // ── Lane assignment (-1 = full-width covers all three lanes) ──
        this.lanes = lane === -1 ? [0, 1, 2] : [lane];

        // ── 3D mesh: dark hole stretched to the gap's logical width ──
        this.mesh = createPitMesh(this.lanes.length);
        this.mesh.scale.z = gapWidth * WORLD_SCALE;
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
     * Starts 8px ABOVE ground level: the player hitbox bottom sits
     * 6px above GROUND_Y, so a hitbox starting exactly at GROUND_Y
     * could never overlap a standing player (latent 2D bug).
     */
    getHitbox() {
        return {
            x: (this.x + 10) | 0,
            y: GROUND_Y - 8,
            width: (this.gapWidth - 20) | 0,
            height: CANVAS_HEIGHT - GROUND_Y + 8
        };
    }

    /** Map logical state -> 3D mesh position + animációk. Called once per frame. */
    syncMesh(time = 0) {
        const laneCenter = this.lanes.reduce((a, l) => a + LANES[l], 0) / this.lanes.length;
        this.mesh.position.set(laneCenter, 0, logicalToWorldZ(this.x + this.gapWidth / 2));

        // Perem-pulzálás (~2 s periódus 60 fps-en)
        const rimMat = this.mesh.userData.rimMat;
        if (rimMat) {
            rimMat.emissiveIntensity = 1.8 + Math.sin(time * 0.05) * 0.7;
        }

        // Gőz: körkörös emelkedés a lyukból, emelkedve összezsugorodva
        for (const s of this.mesh.userData.steam || []) {
            const t = (time * 0.006 + s.userData.phase) % 1;
            s.position.set(s.userData.x, 0.05 + t * 1.15, s.userData.z);
            s.scale.setScalar(1 - t * 0.7);
        }
    }
}
