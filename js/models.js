// ============================================
// Snacky Dash 3D — Procedural Mesh Factories
// All models built from primitives. No assets.
// ============================================

import * as THREE from 'three';

const ROAD_LEN = 20; // world units per segment

// Procedural lit-window texture for buildings (Task 7)
export function createBuildingTexture(litRatio = 0.35, litColor = '#FFE66D') {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#12121F';
    ctx.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 122; y += 12) {
        for (let x = 6; x < 58; x += 12) {
            ctx.fillStyle = Math.random() < litRatio ? litColor : '#0A0A14';
            ctx.fillRect(x, y, 7, 8);
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    return tex;
}

// One shared texture for ALL buildings: created once, never disposed
// (per-building dispose would kill it for every other building).
let _sharedBuildingTex = null;
function getBuildingTexture() {
    if (!_sharedBuildingTex) _sharedBuildingTex = createBuildingTexture();
    return _sharedBuildingTex;
}

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
        new THREE.MeshStandardMaterial({
            color: shade,
            roughness: 0.9,
            emissiveMap: getBuildingTexture(), // shared module-level texture
            emissive: 0xFFFFFF,
            emissiveIntensity: 1.0,
        })
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

export function createCollectibleMesh(type) {
    const g = new THREE.Group();
    if (type === 'hotdog') {
        const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 10),
            new THREE.MeshStandardMaterial({ color: 0xE8B96F, roughness: 0.7 }));
        bun.rotation.z = Math.PI / 2;
        const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.42, 4, 10),
            new THREE.MeshStandardMaterial({ color: 0xC0392B, roughness: 0.6 }));
        sausage.rotation.z = Math.PI / 2;
        sausage.position.y = 0.08;
        g.add(bun, sausage);
    } else {
        const donut = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.12, 10, 18),
            new THREE.MeshStandardMaterial({ color: 0xFF69B4, roughness: 0.5 }));
        g.add(donut);
    }
    return g;
}

export function createPowerUpMesh(type) {
    const g = new THREE.Group();
    if (type === 'magnet') {
        const mat = new THREE.MeshStandardMaterial({ color: 0xE74C3C, roughness: 0.4 });
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.1, 8, 14, Math.PI), mat);
        arc.rotation.z = Math.PI;
        g.add(arc);
    } else {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28),
            new THREE.MeshStandardMaterial({ color: 0x9B59B6, roughness: 0.2, metalness: 0.6 }));
        g.add(gem);
    }
    return g;
}

export function createPitMesh(span) {
    // Flat dark hole decal stretched across the pit's lanes
    const w = span === 3 ? 6.6 : 2.0;
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 1),
        new THREE.MeshStandardMaterial({ color: 0x05050A, roughness: 1 }));
    hole.position.y = 0.02;
    g.add(hole);
    return g;
}

// Entitás-mesh GPU-erőforrásainak felszabadítása.
// A gyártófüggvények minden híváskor FRIS geometriát és anyagot
// hoznak létre, így a dispose biztonságos (nincs megosztott erőforrás).
// Kezeli a Group-okat (rekurzívan) és a tömbös anyagokat is.
export function disposeMesh(root) {
    root.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
            if (m) m.dispose();
        }
    });
}

export function createObstacleMesh(type) {
    const g = new THREE.Group();
    const wood  = new THREE.MeshStandardMaterial({ color: 0xB0793C, roughness: 0.8 });
    const dark  = new THREE.MeshStandardMaterial({ color: 0x7A4F24, roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xE74C3C, roughness: 0.5 });
    const blue  = new THREE.MeshStandardMaterial({ color: 0x4A69BD, roughness: 0.7 });

    switch (type) {
        case 'crate': {
            const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), wood);
            c.position.y = 0.5; c.castShadow = true;
            const frame = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.12, 1.06), dark);
            frame.position.y = 0.5;
            g.add(c, frame);
            break;
        }
        case 'tall_crate': {
            for (let i = 0; i < 2; i++) {
                const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.95, 1.0), i ? dark : wood);
                c.position.y = 0.5 + i * 0.95; c.castShadow = true;
                g.add(c);
            }
            break;
        }
        case 'barrel': {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 14), blue);
            b.position.y = 0.6; b.castShadow = true;
            g.add(b);
            break;
        }
        case 'rolling_barrel': {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 14), blue);
            b.rotation.x = Math.PI / 2; // lies sideways, rolls
            b.position.y = 0.5; b.castShadow = true;
            b.name = 'roller';
            g.add(b);
            break;
        }
        case 'barrier': {
            // Overhead striped bar on two posts (per-lane width 2.2 * span)
            const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.35), metal);
            bar.position.y = 1.5; bar.castShadow = true;
            bar.name = 'bar';
            g.add(bar);
            for (const side of [-1, 1]) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.15), dark);
                post.position.set(side * 1.05, 0.75, 0);
                post.name = 'post' + (side < 0 ? 'L' : 'R');
                g.add(post);
            }
            break;
        }
        case 'flying_bird': {
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10),
                new THREE.MeshStandardMaterial({ color: 0x8E44AD, roughness: 0.6 }));
            body.scale.set(1.3, 1, 1);
            const wingGeo = new THREE.BoxGeometry(0.6, 0.06, 0.3);
            const wingL = new THREE.Mesh(wingGeo, metal);
            const wingR = new THREE.Mesh(wingGeo, metal);
            wingL.position.set(-0.5, 0.1, 0);
            wingR.position.set(0.5, 0.1, 0);
            wingL.name = 'wingL'; wingR.name = 'wingR';
            g.add(body, wingL, wingR);
            break;
        }
    }
    return g;
}
