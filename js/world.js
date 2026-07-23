// ============================================
// Snacky Dash 3D — Endless World
// Recycled road segments + city. Theme system.
// ============================================

import * as THREE from 'three';
import { WORLD_SCALE } from './utils.js';
import { createRoadSegment, createBuilding } from './models.js';

const SEGMENT_COUNT = 8;
const SEGMENT_LEN = 20; // must match models.js ROAD_LEN

// 5 themes: night → dawn → day → sunset → neon.
// Fog distances pushed out (vs. original 28-40/85-110) so obstacles
// spawning at z=-76 are clearly visible by z≈-40 (Task 4 review fix).
const THEMES_3D = [
    { sky: '#0B0B2B', fogNear: 45, fogFar: 110, hemiSky: '#8899FF', hemiGround: '#332222', sun: '#AABBFF', sunI: 0.8, windowI: 1.0 }, // night
    { sky: '#3D2B52', fogNear: 50, fogFar: 120, hemiSky: '#FFB347', hemiGround: '#443333', sun: '#FF9F5A', sunI: 0.9, windowI: 0.7 }, // dawn
    { sky: '#4A90D9', fogNear: 60, fogFar: 140, hemiSky: '#BBDDFF', hemiGround: '#556644', sun: '#FFF4D6', sunI: 1.3, windowI: 0.1 }, // day
    { sky: '#D96A3B', fogNear: 50, fogFar: 115, hemiSky: '#FFAA66', hemiGround: '#553333', sun: '#FF7733', sunI: 1.0, windowI: 0.8 }, // sunset
    { sky: '#12082B', fogNear: 45, fogFar: 110, hemiSky: '#FF44CC', hemiGround: '#220033', sun: '#44FFEE', sunI: 0.9, windowI: 1.2 }, // neon
];

const THEME_TRANSITION_FRAMES = 120; // ~2s at 60fps

function parseTheme(t) {
    return {
        sky: new THREE.Color(t.sky),
        hemiSky: new THREE.Color(t.hemiSky),
        hemiGround: new THREE.Color(t.hemiGround),
        sun: new THREE.Color(t.sun),
        fogNear: t.fogNear,
        fogFar: t.fogFar,
        sunI: t.sunI,
        windowI: t.windowI,
    };
}

const THEMES = THEMES_3D.map(parseTheme);

export class World3D {
    constructor(sceneMgr) {
        this.sceneMgr = sceneMgr;
        this.segments = [];
        this.buildings = [];

        // Theme state: start settled on night (no transition at boot —
        // scene.js initial fog/lights already match THEMES_3D[0]).
        this.themeFrom = parseTheme(THEMES_3D[0]);
        this.themeTo = THEMES[0];
        this.themeT = 1;
        this._cur = parseTheme(THEMES_3D[0]);

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
                b.material.emissiveIntensity = this._cur.windowI;
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
                // Re-randomize on recycle.
                // Dispose the OLD material before replacing (leak fix).
                // The emissiveMap texture is a shared module-level
                // CanvasTexture (models.js) — never disposed here.
                b.mesh.material.dispose();
                const nb = createBuilding();
                b.mesh.geometry.dispose();
                b.mesh.geometry = nb.geometry;
                b.mesh.material = nb.material;
                b.mesh.material.emissiveIntensity = this._cur.windowI;
                b.mesh.scale.set(1, 1, 1);
                b.mesh.position.y = nb.position.y;
            }
        }

        // Smooth theme transition (~120 frames)
        if (this.themeT < 1) {
            this.themeT = Math.min(1, this.themeT + 1 / THEME_TRANSITION_FRAMES);
            const t = this.themeT;
            const cur = this._cur;
            const from = this.themeFrom;
            const to = this.themeTo;
            cur.sky.lerpColors(from.sky, to.sky, t);
            cur.hemiSky.lerpColors(from.hemiSky, to.hemiSky, t);
            cur.hemiGround.lerpColors(from.hemiGround, to.hemiGround, t);
            cur.sun.lerpColors(from.sun, to.sun, t);
            cur.fogNear = from.fogNear + (to.fogNear - from.fogNear) * t;
            cur.fogFar = from.fogFar + (to.fogFar - from.fogFar) * t;
            cur.sunI = from.sunI + (to.sunI - from.sunI) * t;
            cur.windowI = from.windowI + (to.windowI - from.windowI) * t;
            this._applyTheme(cur);
        }
    }

    _applyTheme(cur) {
        this.sceneMgr.setSky(cur.sky, cur.fogNear, cur.fogFar);
        this.sceneMgr.applyThemeColors({
            hemiSky: cur.hemiSky,
            hemiGround: cur.hemiGround,
            sunColor: cur.sun,
            sunIntensity: cur.sunI,
        });
        for (const b of this.buildings) {
            b.mesh.material.emissiveIntensity = cur.windowI;
        }
    }

    /** Snapshot of the currently displayed theme state (handles mid-transition). */
    _snapshotCurrent() {
        const c = this._cur;
        return {
            sky: c.sky.clone(),
            hemiSky: c.hemiSky.clone(),
            hemiGround: c.hemiGround.clone(),
            sun: c.sun.clone(),
            fogNear: c.fogNear,
            fogFar: c.fogFar,
            sunI: c.sunI,
            windowI: c.windowI,
        };
    }

    setTheme(i) {
        const idx = Math.max(0, Math.min(THEMES.length - 1, i | 0));
        this.themeFrom = this._snapshotCurrent();
        this.themeTo = THEMES[idx];
        this.themeT = 0;
    }

    reset() {
        this.segments.forEach((seg, i) => { seg.position.z = 10 - i * SEGMENT_LEN; });
        for (const b of this.buildings) {
            b.mesh.position.z = this.segments[b.segIndex].position.z;
        }
        // Restart always returns to night
        this.setTheme(0);
    }
}
