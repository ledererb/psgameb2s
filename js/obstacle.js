// ============================================
// Snacky Dash — Obstacles
// Six types: crate, barrel, tall_crate,
//   barrier, rolling_barrel, flying_bird
// 3D: each obstacle owns a mesh (createObstacleMesh)
// synced from logical state via syncMesh().
// ============================================

import { GROUND_Y, LANES, worldHeightY, logicalToWorldZ } from './utils.js';
import { createObstacleMesh } from './models.js';

const OBSTACLE_DEFS = {
    crate:          { width: 50,  height: 50 },
    barrel:         { width: 44,  height: 62 },
    tall_crate:     { width: 50,  height: 95 },
    barrier:        { width: 180, height: 18, isElevated: true },
    rolling_barrel: { width: 44,  height: 50 },
    flying_bird:    { width: 40,  height: 30 }
};

export class Obstacle {
    constructor(x, type, lane, span = 1) {
        const def = OBSTACLE_DEFS[type] || OBSTACLE_DEFS.crate;
        this.type = type;
        this.width = def.width;
        this.height = def.height;
        this.x = x;
        this.passed = false;

        // ── Lane assignment (span=2 only for barrier; lane is then 0 or 1) ──
        this.lane = lane;
        this.lanes = span === 2 ? [lane, lane + 1] : [lane];

        // ── 3D mesh ──
        this.mesh = createObstacleMesh(type);
        if (type === 'barrier' && span === 2) {
            // Widen the bar to cover both lanes; posts move to the outer edges
            const bar = this.mesh.getObjectByName('bar');
            if (bar) bar.scale.x = span;
            const postL = this.mesh.getObjectByName('postL');
            const postR = this.mesh.getObjectByName('postR');
            const edge = span * 2.2 / 2 - 0.05;
            if (postL) postL.position.x = -edge;
            if (postR) postR.position.x = edge;
        }

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

    /** Map logical state -> 3D mesh position/rotation. Called once per frame. */
    syncMesh() {
        const laneCenter = this.lanes.reduce((a, l) => a + LANES[l], 0) / this.lanes.length;
        this.mesh.position.set(laneCenter, worldHeightY(this.y, this.height), logicalToWorldZ(this.x));
        if (this.type === 'rolling_barrel') {
            const roller = this.mesh.getObjectByName('roller');
            if (roller) roller.rotation.y = this.rotation;
        }
        if (this.type === 'flying_bird') {
            const flap = Math.sin(this.wingFrame) * 0.7;
            this.mesh.getObjectByName('wingL').rotation.z = flap;
            this.mesh.getObjectByName('wingR').rotation.z = -flap;
        }
    }
}
