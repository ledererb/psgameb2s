// ============================================
// Snacky Dash B2S — ruhatára preview (spec D5)
// Kis önálló Three.js renderer a menüben: Snacky SZEMBŐL
// (a karakter eleje -z felé néz → a kamera a -z oldalon áll),
// enyhe lengéssel. A játék renderertől független.
// ============================================

import * as THREE from 'three';
import { createSnackyModel, createShirtMesh } from './models.js';

export class SkinPreview {
    constructor(canvas) {
        this.failed = false;
        try {
            this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        } catch {
            this.failed = true; // WebGL nélkül a választó attól működik
            canvas.classList.add('hidden');
            return;
        }
        const size = canvas.width;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(size, size, false);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
        this.camera.position.set(0, 1.05, -3.4); // a -z oldalon = SZEMBŐL
        this.camera.lookAt(0, 0.78, 0);

        this.scene.add(new THREE.HemisphereLight(0xFFFFFF, 0x2A2A3A, 1.15));
        const key = new THREE.DirectionalLight(0xFFFFFF, 1.3);
        key.position.set(-2, 3, -3);
        this.scene.add(key);

        const model = createSnackyModel();
        this.model = model.group;
        this.parts = model.parts;
        this.parts.headGroup.rotation.y = 0; // egyenesen a kamerába nézzen
        this.scene.add(this.model);

        this.shirt = null;
        this.t = 0;
        this.active = true;

        const loop = () => {
            requestAnimationFrame(loop);
            if (!this.active || document.hidden) return;
            this.t += 0.016;
            this.model.rotation.y = Math.sin(this.t * 0.7) * 0.3;  // enyhe lengés
            this.model.position.y = Math.abs(Math.sin(this.t * 2)) * 0.03; // létezés-jel
            this.renderer.render(this.scene, this.camera);
        };
        loop();
    }

    setActive(on) { this.active = on; }

    setSkin(texture) {
        if (this.shirt) {
            this.model.remove(this.shirt);
            this.shirt.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
            this.shirt = null;
        }
        if (texture) {
            this.shirt = createShirtMesh(texture);
            this.model.add(this.shirt);
        }
    }
}
