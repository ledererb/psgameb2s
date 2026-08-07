// ============================================
// Snacky Dash 3D — Background
// Ég-dóm (gradiens), csillagmező, égitest,
// távoli város-sziluettek. Tiszta nézetréteg:
// a World3D téma-gépezete hajtja (spec §4).
// Session-életű: szándékosan nincs dispose
// (a shared building-textúra mintája szerint).
// ============================================

import * as THREE from 'three';

const DOME_RADIUS = 170;        // kamera far = 200; a dóm távoli pereme ~178
const STAR_COUNT = 350;
const STAR_RADIUS = 150;
const CELESTIAL_DISTANCE = 140;
const SKYLINE_SPAN = 240;       // x ∈ [-240, 240] — a fekvő hFOV-t is fedi

// Sziluett-sávok: mélység, toronyszám, tint-szorzó (horizont-színből),
// magasság-tartomány. A spawn-zóna (z ≥ -76) MÖGÖTT — sosem takarnak
// akadályt. fog: false → a tint hordja az atmoszférikus mélységet.
const SKYLINE_BANDS = [
    { z: -125, count: 26, tintMul: 0.35, minH: 6, maxH: 22 },
    { z: -145, count: 28, tintMul: 0.6,  minH: 6, maxH: 22 },
    { z: -160, count: 30, tintMul: 0.85, minH: 6, maxH: 22 },
];

// Megosztott lágykorong-textúra az égitesthez (korong + glow ugyanaz,
// modul-szinten egyszer hozva — sosem dispose-oljuk; building-tex minta).
let _circleTex = null;
function getCircleTexture() {
    if (_circleTex) return _circleTex;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,1)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    _circleTex = new THREE.CanvasTexture(c);
    return _circleTex;
}

export class Background3D {
    /**
     * @param {THREE.Scene} scene
     * @param {object} theme parseTheme()-elt kezdő témaállapot (world.js)
     */
    constructor(scene, theme) {
        this._t = 0;
        this._starBase = 0;
        this._celTmp = new THREE.Vector3();

        // ── a) Ég-dóm: gradiens horizont→zenit ──
        this.domeMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                topColor: { value: new THREE.Color('#030312') },
                horizonColor: { value: new THREE.Color('#0B0B2B') },
            },
            vertexShader: `
                varying vec3 vPos;
                void main() {
                    vPos = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                varying vec3 vPos;
                void main() {
                    float t = smoothstep(0.0, 0.5, normalize(vPos).y);
                    gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
                }
            `,
        });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 24, 12), this.domeMat);
        dome.renderOrder = -1; // mindig hátul
        scene.add(dome);

        // ── b) Csillagmező a felső félgömbön ──
        const pos = new Float32Array(STAR_COUNT * 3);
        for (let i = 0; i < STAR_COUNT; i++) {
            // Terület-egyenletes eloszlás a felső félgömbön (y = cos polárszög)
            const theta = Math.random() * Math.PI * 2;
            const y = 0.05 + Math.random() * 0.95;
            const r = Math.sqrt(1 - y * y);
            pos[i * 3] = Math.cos(theta) * r * STAR_RADIUS;
            pos[i * 3 + 1] = y * STAR_RADIUS;
            pos[i * 3 + 2] = Math.sin(theta) * r * STAR_RADIUS;
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.starMat = new THREE.PointsMaterial({
            color: 0xFFFFEE, size: 1.6, sizeAttenuation: false,
            transparent: true, opacity: 1, depthWrite: false, fog: false,
        });
        scene.add(new THREE.Points(starGeo, this.starMat));

        // ── c) Égitest: korong + glow (megosztott textúra, tintelve) ──
        this.celDisc = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getCircleTexture(), transparent: true, depthWrite: false, fog: false,
        }));
        this.celGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getCircleTexture(), transparent: true, opacity: 0.2,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }));
        scene.add(this.celDisc, this.celGlow);

        // ── d) Sziluett-sávok: sávonként egy InstancedMesh (1 draw call/sáv) ──
        this.skylineMats = [];
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const m = new THREE.Matrix4();
        for (const band of SKYLINE_BANDS) {
            const mat = new THREE.MeshBasicMaterial({ fog: false });
            this.skylineMats.push(mat);
            const inst = new THREE.InstancedMesh(boxGeo, mat, band.count);
            for (let i = 0; i < band.count; i++) {
                const w = 6 + Math.random() * 6;
                const h = band.minH + Math.random() * (band.maxH - band.minH);
                const d = 6 + Math.random() * 6;
                const x = -SKYLINE_SPAN + (i + 0.5) * (2 * SKYLINE_SPAN / band.count)
                    + (Math.random() - 0.5) * 6;
                m.makeScale(w, h, d);
                m.setPosition(x, h / 2, band.z + (Math.random() - 0.5) * 6);
                inst.setMatrixAt(i, m);
            }
            inst.instanceMatrix.needsUpdate = true;
            inst.frustumCulled = false; // szétszórt instance-ok; mindig látszódjon
            scene.add(inst);
        }

        this.applyTheme(theme);
    }

    /** Témaállapot alkalmazása (a World3D lerp-blokkja hívja átmenet közben). */
    applyTheme(cur) {
        this.domeMat.uniforms.topColor.value.copy(cur.skyTop);
        this.domeMat.uniforms.horizonColor.value.copy(cur.sky);

        this._starBase = cur.starI;

        this.celDisc.material.color.copy(cur.celColor);
        this.celGlow.material.color.copy(cur.celColor);
        this.celGlow.material.opacity = cur.glowI * 0.35;
        this.celDisc.scale.set(cur.celSize, cur.celSize, 1);
        this.celGlow.scale.set(cur.celSize * 2.5, cur.celSize * 2.5, 1);
        // A lerpelt (nem-normalizált) irányt normalizáljuk → fix távolság
        this._celTmp.copy(cur.celPos).normalize().multiplyScalar(CELESTIAL_DISTANCE);
        this.celDisc.position.copy(this._celTmp);
        this.celGlow.position.copy(this._celTmp);

        for (let i = 0; i < this.skylineMats.length; i++) {
            this.skylineMats[i].color.copy(cur.sky).multiplyScalar(SKYLINE_BANDS[i].tintMul);
        }
    }

    /** Frame-frissítés: csillag-twinkle (egy szinusz per frame). */
    update() {
        this._t++;
        this.starMat.opacity = this._starBase * (0.85 + 0.15 * Math.sin(this._t * 0.03));
    }
}
