// ============================================
// Snacky Dash 3D — Endless World
// Recycled road segments + city. Theme system.
// ============================================

import { WORLD_SCALE } from './utils.js';
import { createRoadSegment, createBuilding } from './models.js';

const SEGMENT_COUNT = 8;
const SEGMENT_LEN = 20; // must match models.js ROAD_LEN

export class World3D {
    constructor(sceneMgr) {
        this.sceneMgr = sceneMgr;
        this.segments = [];
        this.buildings = [];

        for (let i = 0; i < SEGMENT_COUNT; i++) {
            const seg = createRoadSegment();
            seg.position.z = 10 - i * SEGMENT_LEN; // from behind camera into distance
            sceneMgr.scene.add(seg);
            this.segments.push(seg);

            // Buildings on both sides per segment
            for (const side of [-1, 1]) {
                const b = createBuilding();
                b.position.x = side * (7.5 + Math.random() * 2.5);
                b.position.z = seg.position.z;
                sceneMgr.scene.add(b);
                this.buildings.push({ mesh: b, side, segIndex: i });
            }
        }
    }

    update(gameSpeed) {
        const dz = gameSpeed * WORLD_SCALE;
        for (const seg of this.segments) {
            seg.position.z += dz;
            if (seg.position.z - SEGMENT_LEN / 2 > 12) {
                seg.position.z -= SEGMENT_COUNT * SEGMENT_LEN;
            }
        }
        for (const b of this.buildings) {
            b.mesh.position.z += dz;
            if (b.mesh.position.z > 12) {
                b.mesh.position.z -= SEGMENT_COUNT * SEGMENT_LEN;
                // Re-randomize on recycle
                const nb = createBuilding();
                b.mesh.geometry.dispose();
                b.mesh.geometry = nb.geometry;
                b.mesh.material = nb.material;
                b.mesh.scale.set(1, 1, 1);
                b.mesh.position.y = nb.position.y;
            }
        }
    }

    setTheme() { /* Task 7 */ }

    reset() {
        this.segments.forEach((seg, i) => { seg.position.z = 10 - i * SEGMENT_LEN; });
        for (const b of this.buildings) {
            b.mesh.position.z = this.segments[b.segIndex].position.z;
        }
    }
}
