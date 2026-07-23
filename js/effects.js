// ============================================
// Snacky Dash — 3D Visual Effects
// TrailEffect3D: speed-based particle trail (THREE.Mesh pool)
// WeatherSystem3D: random rain/snow events (THREE.Points)
// ============================================

import * as THREE from 'three';

export class TrailEffect3D {
    constructor(scene) {
        this.scene = scene;
        this.pool = [];
        this.active = [];
        const geo = new THREE.SphereGeometry(0.06, 6, 5);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFFB347, transparent: true });
        for (let i = 0; i < 40; i++) {
            const m = new THREE.Mesh(geo, mat.clone());
            m.visible = false;
            scene.add(m);
            this.pool.push(m);
        }
    }

    update(px, py, pz, speed) {
        if (speed > 8 && Math.random() < 0.5) {
            const m = this.pool.pop();
            if (m) {
                m.position.set(px + (Math.random() - 0.5) * 0.3, py + 0.3 + Math.random() * 0.5, pz + 0.3);
                m.material.opacity = 0.8;
                m.visible = true;
                m.userData.life = 20;
                this.active.push(m);
            }
        }
        for (let i = this.active.length - 1; i >= 0; i--) {
            const m = this.active[i];
            m.userData.life--;
            m.position.z += 0.15;
            m.material.opacity *= 0.92;
            if (m.userData.life <= 0) {
                m.visible = false;
                this.active.splice(i, 1);
                this.pool.push(m);
            }
        }
    }

    reset() {
        for (const m of this.active) { m.visible = false; this.pool.push(m); }
        this.active = [];
    }
}

// ── Weather System (3D) ──
// Random rain/snow events with smooth fade in/out via material opacity.

export class WeatherSystem3D {
    constructor(scene) {
        this.scene = scene;
        this.mode = 'none'; // 'none' | 'rain' | 'snow'
        this.timer = 600 + Math.random() * 600;
        const N = 400;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 24;
            pos[i * 3 + 1] = Math.random() * 12;
            pos[i * 3 + 2] = 8 - Math.random() * 80;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.points = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xAACCFF, size: 0.08, transparent: true, opacity: 0
        }));
        scene.add(this.points);
        this.count = N;
    }

    update() {
        this.timer--;
        if (this.timer <= 0) {
            const modes = ['rain', 'snow', 'none'];
            this.mode = modes[Math.floor(Math.random() * modes.length)];
            this.timer = 600 + Math.random() * 900;
        }
        const target = this.mode === 'none' ? 0 : 0.7;
        this.points.material.opacity += (target - this.points.material.opacity) * 0.02;

        if (this.points.material.opacity > 0.02) {
            const pos = this.points.geometry.attributes.position.array;
            const fall = this.mode === 'rain' ? 0.35 : 0.08;
            for (let i = 0; i < this.count; i++) {
                pos[i * 3 + 1] -= fall;
                if (this.mode === 'snow') pos[i * 3] += Math.sin(pos[i * 3 + 1]) * 0.01;
                if (pos[i * 3 + 1] < 0) {
                    pos[i * 3 + 1] = 12;
                    pos[i * 3 + 2] = 8 - Math.random() * 80;
                }
            }
            this.points.geometry.attributes.position.needsUpdate = true;
        }
    }

    reset() {
        this.mode = 'none';
        this.timer = 600 + Math.random() * 600;
        this.points.material.opacity = 0;
    }
}
