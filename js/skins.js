// ============================================
// Snacky Dash B2S — Dorko-póló skinek (spec: 2026-08-14-dorko-polo-skinek-design.md)
// Kozmetikai unlock-rendszer: pontküszöbök, valódi termékprint-textúrák
// (assets/skins/*.png — a DRK x VATES fotókból kivágott hátprintek),
// localStorage-persistencia (player-store). Nincs szerveroldali része.
// ============================================

import * as THREE from 'three';
import { playerStore } from './player-store.js';

export const SKINS = [
    { id: 'langos',  name: 'DRK x VATES LÁNGOS',     short: 'LÁNGOS',     threshold: 1000,  base: '#EAE3CE' },
    { id: 'froccs',  name: 'DRK x VATES FRÖCCS',     short: 'FRÖCCS',     threshold: 2500,  base: '#1B1B1B' },
    { id: 'liget',   name: 'DRK x VATES LIGET',      short: 'LIGET',      threshold: 5000,  base: '#FFFFFF' },
    { id: 'koviubi', name: 'DRK x VATES KOVIUBI',    short: 'KOVIUBI',    threshold: 10000, base: '#D6DAC6' },
    { id: 'lanchid', name: 'DRK x VATES LÁNCHÍD',    short: 'LÁNCHÍD',    threshold: 20000, base: '#FFFFFF' },
    { id: 'hosok',   name: 'DRK x VATES HŐSÖK TERE', short: 'HŐSÖK TERE', threshold: 40000, base: '#FFFFFF' },
];

export function getSkin(id) {
    return SKINS.find((s) => s.id === id) ?? null;
}

// ── Unlock-logika ──

/** A pontszám alapján feloldandó skinek; visszaadja az ÚJONNAN feloldottakat (és persistál). */
export function unlockByScore(score) {
    const state = playerStore.loadSkins();
    const newly = SKINS.filter((s) => score >= s.threshold && !state.unlocked.includes(s.id));
    if (newly.length) {
        state.unlocked = [...state.unlocked, ...newly.map((s) => s.id)];
        playerStore.saveSkins(state);
    }
    return newly;
}

export function isUnlocked(id) {
    return playerStore.loadSkins().unlocked.includes(id);
}

export function getSelectedSkin() {
    const { unlocked, selected } = playerStore.loadSkins();
    return selected && unlocked.includes(selected) ? getSkin(selected) : null;
}

export function selectSkin(id) {
    const state = playerStore.loadSkins();
    // null = alap Snacky; zárolt skin nem választható
    state.selected = id && state.unlocked.includes(id) ? id : null;
    playerStore.saveSkins(state);
    return state.selected;
}

// ── Textúra-töltés ──
// assets/skins/<id>.png: 1024×512, alapszín + a valódi hátprint kivágat
// elöl (u≈0.75) és hátul (u≈0.25, tükrözve) — a gömbhéj UV-leképezéséhez.

const loader = new THREE.TextureLoader();

export function makeShirtTexture(skin) {
    const texture = loader.load(`assets/skins/${skin.id}.png`);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
