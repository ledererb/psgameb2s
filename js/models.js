// ============================================
// Snacky Dash 3D — Procedural Mesh Factories
// All models built from primitives. No assets.
// ============================================

import * as THREE from 'three';

const ROAD_LEN = 20; // world units per segment

export function createRoadSegment() {
    const g = new THREE.Group();

    // Asphalt
    const road = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.2, ROAD_LEN),
        new THREE.MeshStandardMaterial({ color: 0x2A2A35, roughness: 0.95 })
    );
    road.position.y = -0.1;
    road.receiveShadow = true;
    g.add(road);

    // Sidewalks
    for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.3, ROAD_LEN),
            new THREE.MeshStandardMaterial({ color: 0x8E8E8E, roughness: 0.9 })
        );
        walk.position.set(side * 4.8, -0.05, 0);
        walk.receiveShadow = true;
        g.add(walk);
    }

    // Lane divider dashes (between the 3 lanes)
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xF1C40F });
    for (const lx of [-1.1, 1.1]) {
        for (let z = -ROAD_LEN / 2 + 1; z < ROAD_LEN / 2; z += 4) {
            const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 1.6), dashMat);
            dash.position.set(lx, 0.01, z);
            g.add(dash);
        }
    }

    return g;
}

export function createBuilding() {
    const h = 3 + Math.random() * 9;
    const w = 2.5 + Math.random() * 2;
    const d = 2.5 + Math.random() * 2;
    const shade = 0x1A1A2E + Math.floor(Math.random() * 0x202020);
    const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: shade, roughness: 0.9 })
    );
    b.position.y = h / 2;
    return b;
}
