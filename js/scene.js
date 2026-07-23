// ============================================
// Snacky Dash 3D — Scene Manager
// WebGL renderer, camera rig, lights, fog.
// Pure view layer: reads logical game state.
// ============================================

import * as THREE from 'three';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './utils.js';

export class SceneManager {
    constructor(canvas) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#0B0B2B');
        this.scene.fog = new THREE.Fog('#0B0B2B', 30, 90);

        this.baseFov = 60;
        this.camera = new THREE.PerspectiveCamera(
            this.baseFov, CANVAS_WIDTH / CANVAS_HEIGHT, 0.1, 200
        );
        this.camera.position.set(0, 4.5, 8);

        this.hemi = new THREE.HemisphereLight('#8899FF', '#332222', 0.9);
        this.scene.add(this.hemi);

        this.sun = new THREE.DirectionalLight('#AABBFF', 0.8);
        this.sun.position.set(-6, 12, 4);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        this.sun.shadow.camera.left = -12;
        this.sun.shadow.camera.right = 12;
        this.sun.shadow.camera.top = 12;
        this.sun.shadow.camera.bottom = -12;
        this.sun.shadow.camera.far = 40;
        this.scene.add(this.sun);

        this.shakeX = 0;
        this.shakeY = 0;
        this.camLagX = 0;

        this._projTmp = new THREE.Vector3();
    }

    updateCamera(speedNorm, playerWorldX) {
        // FOV kick with speed
        this.camera.fov = this.baseFov + speedNorm * 15;
        this.camera.updateProjectionMatrix();

        // Smooth lateral follow with lag
        this.camLagX += (playerWorldX * 0.5 - this.camLagX) * 0.08;

        this.camera.position.set(
            this.camLagX + this.shakeX,
            4.5 + this.shakeY,
            8
        );
        this.camera.lookAt(this.camLagX * 1.4, 1.0, -10);
    }

    setShake(sx, sy) {
        this.shakeX = sx * 0.06;
        this.shakeY = sy * 0.06;
    }

    /** Project a world position to overlay-canvas (800x400 logical) coords. */
    projectToScreen(v3, out) {
        this._projTmp.copy(v3).project(this.camera);
        out.x = (this._projTmp.x * 0.5 + 0.5) * CANVAS_WIDTH;
        out.y = (-this._projTmp.y * 0.5 + 0.5) * CANVAS_HEIGHT;
        return out;
    }

    setSky(fogColor, near, far) {
        this.scene.background.set(fogColor);
        this.scene.fog.color.set(fogColor);
        this.scene.fog.near = near;
        this.scene.fog.far = far;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
