// ============================================
// Snacky Dash — Audio Manager (Web Audio API)
// Synthesized sound effects, no external files.
// ============================================

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.initialized = false;
    }

    /** Must be called from a user gesture (click/tap). */
    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not available');
            this.enabled = false;
        }
    }

    /** Resume audio context if suspended (required by browsers). */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // ── Internal helpers ──

    _tone(freq, duration, type = 'sine', vol = 0.25, delay = 0) {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.start(t);
        osc.stop(t + duration);
    }

    _noise(duration, vol = 0.1, delay = 0) {
        if (!this.enabled || !this.ctx) return;
        const t = this.ctx.currentTime + delay;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        source.connect(gain);
        gain.connect(this.ctx.destination);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        source.start(t);
        source.stop(t + duration);
    }

    // ── Public sound effects ──

    playJump() {
        this._tone(350, 0.12, 'sine', 0.2);
        this._tone(550, 0.1, 'sine', 0.15, 0.04);
    }

    playDoubleJump() {
        this._tone(500, 0.08, 'sine', 0.2);
        this._tone(700, 0.08, 'sine', 0.18, 0.04);
        this._tone(950, 0.12, 'sine', 0.12, 0.08);
    }

    playCollect() {
        this._tone(880, 0.08, 'sine', 0.2);
        this._tone(1320, 0.12, 'sine', 0.15, 0.06);
    }

    playExtraLife() {
        this._tone(523, 0.1, 'sine', 0.2);
        this._tone(659, 0.1, 'sine', 0.2, 0.08);
        this._tone(784, 0.1, 'sine', 0.2, 0.16);
        this._tone(1047, 0.2, 'sine', 0.18, 0.24);
    }

    playHit() {
        this._tone(180, 0.25, 'sawtooth', 0.2);
        this._noise(0.15, 0.12);
    }

    playGameOver() {
        this._tone(440, 0.25, 'sine', 0.25);
        this._tone(370, 0.25, 'sine', 0.22, 0.2);
        this._tone(330, 0.25, 'sine', 0.2, 0.4);
        this._tone(220, 0.5, 'sine', 0.25, 0.6);
    }
}
