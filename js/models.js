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

export function createSnackyModel() {
    const group = new THREE.Group();
    const orange = new THREE.MeshStandardMaterial({ color: 0xE8862E, roughness: 0.55 });
    const black  = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.5 });
    const white  = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 });
    const red    = new THREE.MeshStandardMaterial({ color: 0xD63031, roughness: 0.7 });

    // Body (upright blob)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), orange);
    body.scale.set(1, 1.15, 0.9);
    body.position.y = 0.72;
    body.castShadow = true;
    group.add(body);

    // Head group holds face; runs toward -z, turned slightly so face is visible
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.05;
    headGroup.rotation.y = 0.55; // ~30° toward camera so the eyes are visible
    group.add(headGroup);

    // Ears
    for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), black);
        ear.scale.set(1, 1.5, 0.7);
        ear.position.set(side * 0.28, 0.42, 0.05);
        headGroup.add(ear);
    }

    // Eyes on the -z facing side of the head group
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), black);
    const pupilR = pupilL.clone();
    for (const [side, pupil] of [[-1, pupilL], [1, pupilR]]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), white);
        eye.position.set(side * 0.2, 0.12, -0.42);
        pupil.position.set(side * 0.2, 0.12, -0.52);
        headGroup.add(eye, pupil);
    }

    // Arms & legs (black capsules) — pivots at shoulder/hip
    const limbGeo = new THREE.CapsuleGeometry(0.07, 0.3, 4, 8);
    const armL = new THREE.Mesh(limbGeo, black);
    const armR = new THREE.Mesh(limbGeo, black);
    armL.position.set(-0.58, 0.85, 0);
    armR.position.set(0.58, 0.85, 0);
    const legL = new THREE.Mesh(limbGeo, black);
    const legR = new THREE.Mesh(limbGeo, black);
    legL.position.set(-0.22, 0.2, 0);
    legR.position.set(0.22, 0.2, 0);
    group.add(armL, armR, legL, legR);

    // Scarf (red band + trailing tail toward +z)
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 16), red);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.12;
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.55), red);
    scarf.position.set(0.25, 1.08, 0.42);
    group.add(band, scarf);

    return { group, parts: { body, headGroup, armL, armR, legL, legR, scarf, pupilL, pupilR } };
}
