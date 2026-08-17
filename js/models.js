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
    const dark   = new THREE.MeshStandardMaterial({ color: 0x2A1A12, roughness: 0.6 });
    const pink   = new THREE.MeshStandardMaterial({ color: 0xC0392B, roughness: 0.6 });

    // Body — tojásdad lathe-profil a hivatalos karakterlap alapján
    const profile = [
        [0.001, 0.42], [0.30, 0.44], [0.46, 0.52], [0.52, 0.68],
        [0.52, 0.82], [0.47, 1.00], [0.38, 1.16], [0.26, 1.28],
        [0.12, 1.36], [0.001, 1.40],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), orange);
    body.castShadow = true;
    group.add(body);

    // Fülek — kis dudorok a fejtetőn, kifelé billentve
    for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 4, 8), black);
        ear.position.set(side * 0.17, 1.36, 0);
        ear.rotation.z = -side * 0.55;
        group.add(ear);
    }

    // Arc — a test -z oldalán; a group runs toward -z, a 0.55-ös fordítás
    // miatt a futókamera felől is látszik
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.05, -0.30);
    headGroup.rotation.y = 0.55;
    group.add(headGroup);

    // Szemek: nagy fehér gömbök + mozgó pupilla (fényfolt a pupilla gyermeke)
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), black);
    const pupilR = pupilL.clone();
    for (const [side, pupil] of [[-1, pupilL], [1, pupilR]]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), white);
        eye.scale.set(1, 1.1, 0.55);
        eye.position.set(side * 0.15, 0.08, -0.14);
        pupil.position.set(side * 0.15, 0.08, -0.225);
        const shine = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), white);
        shine.position.set(0.025, 0.03, -0.05);
        pupil.add(shine);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.028, 0.03), black);
        brow.position.set(side * 0.16, 0.25, -0.155);
        brow.rotation.z = side * 0.18;
        headGroup.add(eye, pupil, brow);
    }

    // Orr + vigyor (sötét szájüreg, fogsor, nyelv)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), black);
    nose.scale.set(1.3, 0.85, 0.6);
    nose.position.set(0, -0.03, -0.20);
    headGroup.add(nose);
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), dark);
    mouth.scale.set(1.55, 0.95, 0.45);
    mouth.position.set(0, -0.17, -0.155);
    headGroup.add(mouth);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.03), white);
    teeth.position.set(0, -0.125, -0.20);
    headGroup.add(teeth);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), pink);
    tongue.scale.set(1.5, 0.7, 0.5);
    tongue.position.set(0, -0.205, -0.185);
    headGroup.add(tongue);

    // Karok — hosszú spagetti + ököl; a pivot a VÁLLON van (a run-cycle így
    // onnan lengteti), a player.js csak rotation.x-et állít
    const armGeo = new THREE.CapsuleGeometry(0.05, 0.38, 4, 8);
    const mkArm = (side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.50, 1.05, 0);
        pivot.rotation.z = -side * 0.16; // enyhén kifelé, a pólóhéjon kívül lógjon
        const arm = new THREE.Mesh(armGeo, black);
        arm.position.y = -0.23;
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), black);
        fist.position.y = -0.49;
        pivot.add(arm, fist);
        return pivot;
    };
    const armL = mkArm(-1);
    const armR = mkArm(1);
    group.add(armL, armR);

    // Lábak — hosszú vékony + lapos cipő; pivot a csípőn
    const legGeo = new THREE.CapsuleGeometry(0.055, 0.30, 4, 8);
    const mkLeg = (side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.18, 0.50, 0);
        const leg = new THREE.Mesh(legGeo, black);
        leg.position.y = -0.19;
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.38), black);
        shoe.position.set(0, -0.435, -0.06);
        pivot.add(leg, shoe);
        return pivot;
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);
    group.add(legL, legR);

    return { group, parts: { body, headGroup, armL, armR, legL, legR, pupilL, pupilR } };
}

/**
 * Póló-héj a Snacky body fölé: a test lathe-profiljának torzó-szelete
 * (+0,03 ráhagyás) + két ujj a karok tövénél. phiStart=-π/2, hogy az UV
 * a gömb-konvencióval egyezzen (hát: u≈0.25, elöl: u≈0.75) — így a
 * assets/skins/*.png textúrák változatlanul jók. A group részeként a
 * squash/stretch animációk automatikusan viszik.
 */
export function createShirtMesh(texture) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });

    const shirtProfile = [
        [0.48, 0.45], [0.545, 0.58], [0.555, 0.72], [0.535, 0.84], [0.50, 0.90],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const shell = new THREE.Mesh(
        new THREE.LatheGeometry(shirtProfile, 28, -Math.PI / 2, Math.PI * 2), mat);
    group.add(shell);

    for (const side of [-1, 1]) {
        const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), mat);
        sleeve.scale.set(1, 0.9, 0.9);
        sleeve.position.set(side * 0.47, 0.97, 0);
        group.add(sleeve);
    }
    return group;
}

export function createCollectibleMesh(type) {
    const g = new THREE.Group();
    if (type === 'hotdog' || type === 'golden_hotdog') {
        const golden = type === 'golden_hotdog';
        const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 10),
            new THREE.MeshStandardMaterial({
                color: golden ? 0xFFD700 : 0xE8B96F,
                emissive: golden ? 0xAA8800 : 0x000000,
                emissiveIntensity: golden ? 0.7 : 0,
                metalness: golden ? 0.6 : 0,
                roughness: golden ? 0.3 : 0.7
            }));
        bun.rotation.z = Math.PI / 2;
        const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.42, 4, 10),
            new THREE.MeshStandardMaterial({
                color: golden ? 0xFFEE88 : 0xC0392B,
                emissive: golden ? 0xCC9900 : 0x000000,
                emissiveIntensity: golden ? 0.7 : 0,
                metalness: golden ? 0.5 : 0,
                roughness: golden ? 0.35 : 0.6
            }));
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
    // Mély lyuk-illúzió: MINDEN látható geometria az útszint FELETT van (y > 0),
    // mert az út aszfaltja egy folytonos doboz, amelynek felső lapja y=0-nál van —
    // bármi alatta teljesen takarásba kerül. A mélységet ezért árnyékolási
    // lépcsőkkel hazudjuk: sötét "fedőlap" + még sötétebb emelt középsávon
    // ("lefelé tart") + világító perem + felszálló gőz.
    // A Group z-mérete a Pit-ben scale.z-vel nyúlik a gap logikai szélességére.
    const w = span === 3 ? 6.6 : 2.0;
    const g = new THREE.Group();

    // Nyílás-fedőlap: közel-fekete lap, amely LETAKARJA az aszfaltot a gödör
    // területén (a régi útszintű sötét matrica szerepét tölti be).
    const cover = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 1),
        new THREE.MeshBasicMaterial({ color: 0x05050C }));
    cover.position.y = 0.02;
    g.add(cover);

    // Belső mélység-lépcső: kisebb, még feketébb, enyhén emelt lap a közepén —
    // a kamera alacsony szögéből "lefelé tartó" mélyedésnek olvasható.
    const depthStep = new THREE.Mesh(new THREE.BoxGeometry(w - 0.35, 0.03, 0.8),
        new THREE.MeshBasicMaterial({ color: 0x010103 }));
    depthStep.position.y = 0.045;
    g.add(depthStep);

    // Világító perem (4 emissive csík az útszint felett) — EGY megosztott anyag,
    // így a pulzálás egy helyen állítható (userData.rimMat).
    // Vastagabb és magasabb, hogy távolról is kivehető legyen a gyűrű.
    const rimMat = new THREE.MeshStandardMaterial({
        color: 0xFF6B1A, emissive: 0xFF6B1A, emissiveIntensity: 2, roughness: 0.4
    });
    const rimW = 0.14;
    const rimFront = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, rimW), rimMat);
    rimFront.position.set(0, 0.07, 0.5 - rimW / 2);
    const rimBack = rimFront.clone();
    rimBack.position.z = -0.5 + rimW / 2;
    const rimLeft = new THREE.Mesh(new THREE.BoxGeometry(rimW, 0.04, 1), rimMat);
    rimLeft.position.set(-w / 2 + rimW / 2, 0.07, 0);
    const rimRight = rimLeft.clone();
    rimRight.position.x = w / 2 - rimW / 2;
    g.add(rimFront, rimBack, rimLeft, rimRight);

    // Felszálló gőz: 8 narancs fényképtelen kocka, fázisban eltolt körkörös
    // emelkedés. Megosztott anyag — a "kifakulás" méretezéssel oldott.
    const steamMat = new THREE.MeshBasicMaterial({ color: 0xFF6633, transparent: true, opacity: 0.7 });
    const steam = [];
    for (let i = 0; i < 8; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), steamMat);
        s.userData.phase = i / 8;
        s.userData.x = (Math.random() - 0.5) * (w - 0.5);
        s.userData.z = (Math.random() - 0.5) * 0.6;
        steam.push(s);
        g.add(s);
    }

    g.userData.rimMat = rimMat;
    g.userData.steam = steam;
    return g;
}

// Entitás-mesh GPU-erőforrásainak felszabadítása.
// A gyártófüggvények EGY entitás-csoporton BELÜL megoszthatnak
// erőforrásokat (pl. gödör perem-anyaga, gőz-anyag, klónozott geometria),
// így ugyanaz a geometria/anyag többször is dispose-olódhat. Ez biztonságos,
// mert a THREE dispose() metódusai idempotensek. Entitáson KÍVÜLI
// megosztás továbbra sincs.
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
