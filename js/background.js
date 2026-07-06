// ============================================
// Snacky Dash — Parallax Background
// 4-layer: sky+clouds, mountains, city silhouette, ground
// All procedurally generated on canvas.
// 5 theme palettes with smooth transitions.
// ============================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y, randomBetween } from './utils.js';

// ── Theme Palettes ──

const THEMES = [
    { // 0: Night (default)
        sky: ['#0B0B2B', '#141452', '#1A2466', '#2C3E6E'],
        stars: true,
        cloudColor: 'rgba(180, 200, 255, 0.1)',
        buildingHue: 220, buildingSat: 20, buildingLight: 14,
        windowLitColor: '#FFE66D',
        groundColor: '#3A3A4A', groundColor2: '#2A2A35',
        sidewalkColor: '#8E8E8E', sidewalkEdge: '#A0A0A0',
        roadLineColor: '#DAA520',
        name: '🌙 Éjszaka'
    },
    { // 1: Dawn
        sky: ['#2D1B4E', '#6B3FA0', '#E87D5F', '#F2A65A'],
        stars: false,
        cloudColor: 'rgba(255, 200, 150, 0.2)',
        buildingHue: 270, buildingSat: 15, buildingLight: 20,
        windowLitColor: '#FFC078',
        groundColor: '#4A3A3A', groundColor2: '#3A2A2A',
        sidewalkColor: '#9E8E7E', sidewalkEdge: '#B0A090',
        roadLineColor: '#E8A030',
        name: '🌅 Hajnal'
    },
    { // 2: Day
        sky: ['#4A90D9', '#6BB3F0', '#87CEEB', '#B0E0F0'],
        stars: false,
        cloudColor: 'rgba(255, 255, 255, 0.5)',
        buildingHue: 200, buildingSat: 10, buildingLight: 40,
        windowLitColor: '#CCE8FF',
        groundColor: '#5A5A5A', groundColor2: '#4A4A4A',
        sidewalkColor: '#B0B0B0', sidewalkEdge: '#C8C8C8',
        roadLineColor: '#FFFFFF',
        name: '☀️ Nappal'
    },
    { // 3: Sunset
        sky: ['#1A0A2E', '#8B2252', '#D4553A', '#F4A460'],
        stars: false,
        cloudColor: 'rgba(255, 100, 50, 0.25)',
        buildingHue: 15, buildingSat: 15, buildingLight: 15,
        windowLitColor: '#FF8C42',
        groundColor: '#3A2A2A', groundColor2: '#2A1A1A',
        sidewalkColor: '#8E7E6E', sidewalkEdge: '#A09080',
        roadLineColor: '#FF8C00',
        name: '🌆 Naplemente'
    },
    { // 4: Neon City
        sky: ['#0A0015', '#1A0030', '#2D0050', '#0A0015'],
        stars: true,
        cloudColor: 'rgba(180, 0, 255, 0.1)',
        buildingHue: 280, buildingSat: 40, buildingLight: 12,
        windowLitColor: '#FF00FF',
        groundColor: '#1A1A2E', groundColor2: '#0A0A1E',
        sidewalkColor: '#4A4A6E', sidewalkEdge: '#6A6A8E',
        roadLineColor: '#FF00FF',
        name: '🌃 Neon Város'
    }
];

export class ParallaxBackground {
    constructor() {
        this.width = CANVAS_WIDTH;
        this.height = CANVAS_HEIGHT;

        // Layer offsets
        this.skyOffset = 0;
        this.mountainOffset = 0;
        this.cityOffset = 0;
        this.groundOffset = 0;

        // Pre-generate elements
        this.stars = this._genStars(60);
        this.clouds = this._genClouds(7);
        this.mountains = this._genMountains();
        this.buildings = this._genBuildings();
        this.flyingObjects = this._genFlyingObjects();

        // ── Theme system ──
        this.currentThemeIndex = 0;
        this.targetThemeIndex = 0;
        this.themeTransition = 1; // 0=transitioning, 1=complete
        this.themeTransitionSpeed = 0.008; // smooth ~2sec transition

        // Neon city animation timer
        this.neonTimer = 0;
    }

    // ── Theme API ──

    /**
     * Smoothly transition to a new theme by index.
     */
    setTheme(index) {
        if (index < 0 || index >= THEMES.length) return;
        if (index === this.currentThemeIndex && this.themeTransition >= 1) return;
        this.targetThemeIndex = index;
        this.themeTransition = 0;
    }

    // ── Color interpolation helpers ──

    /**
     * Parse a hex color (#RRGGBB) into [r, g, b].
     */
    _parseHex(hex) {
        const h = hex.replace('#', '');
        return [
            parseInt(h.substring(0, 2), 16),
            parseInt(h.substring(2, 4), 16),
            parseInt(h.substring(4, 6), 16)
        ];
    }

    /**
     * Convert [r, g, b] back to hex string.
     */
    _toHex(r, g, b) {
        const rr = Math.max(0, Math.min(255, r | 0)).toString(16).padStart(2, '0');
        const gg = Math.max(0, Math.min(255, g | 0)).toString(16).padStart(2, '0');
        const bb = Math.max(0, Math.min(255, b | 0)).toString(16).padStart(2, '0');
        return `#${rr}${gg}${bb}`;
    }

    /**
     * Linearly interpolate between two hex colors.
     */
    _lerpColor(color1, color2, t) {
        const [r1, g1, b1] = this._parseHex(color1);
        const [r2, g2, b2] = this._parseHex(color2);
        return this._toHex(
            r1 + (r2 - r1) * t,
            g1 + (g2 - g1) * t,
            b1 + (b2 - b1) * t
        );
    }

    /**
     * Linearly interpolate between two numbers.
     */
    _lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Parse an rgba string and interpolate alpha, or lerp between
     * two rgba strings. Returns rgba string.
     */
    _lerpRgba(rgba1, rgba2, t) {
        // Quick parse: extract numbers from "rgba(r, g, b, a)" or "rgba(r, g, b, a)"
        const parse = (s) => {
            const m = s.match(/[\d.]+/g);
            return m ? m.map(Number) : [0, 0, 0, 0];
        };
        const [r1, g1, b1, a1] = parse(rgba1);
        const [r2, g2, b2, a2] = parse(rgba2);
        const r = (r1 + (r2 - r1) * t) | 0;
        const g = (g1 + (g2 - g1) * t) | 0;
        const b = (b1 + (b2 - b1) * t) | 0;
        const a = (a1 + (a2 - a1) * t).toFixed(3);
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    /**
     * Get interpolated colors for the current transition state.
     * Returns a theme-like object with interpolated values.
     */
    _getCurrentColors() {
        const from = THEMES[this.currentThemeIndex];
        const to = THEMES[this.targetThemeIndex];
        const t = this.themeTransition;

        // If transition is complete, just return target theme
        if (t >= 1) return to;

        // Interpolate all color properties
        return {
            sky: from.sky.map((c, i) => this._lerpColor(c, to.sky[i], t)),
            stars: t < 0.5 ? from.stars : to.stars,
            cloudColor: this._lerpRgba(from.cloudColor, to.cloudColor, t),
            buildingHue: this._lerp(from.buildingHue, to.buildingHue, t),
            buildingSat: this._lerp(from.buildingSat, to.buildingSat, t),
            buildingLight: this._lerp(from.buildingLight, to.buildingLight, t),
            windowLitColor: this._lerpColor(from.windowLitColor, to.windowLitColor, t),
            groundColor: this._lerpColor(from.groundColor, to.groundColor, t),
            groundColor2: this._lerpColor(from.groundColor2, to.groundColor2, t),
            sidewalkColor: this._lerpColor(from.sidewalkColor, to.sidewalkColor, t),
            sidewalkEdge: this._lerpColor(from.sidewalkEdge, to.sidewalkEdge, t),
            roadLineColor: this._lerpColor(from.roadLineColor, to.roadLineColor, t),
            name: to.name
        };
    }

    /**
     * Check if the current (or transitioning-to) theme is Neon City.
     */
    _isNeonTheme() {
        return this.targetThemeIndex === 4 && this.themeTransition > 0.5;
    }

    // ── Generators ──

    _genStars(count) {
        const stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random() * this.width,
                y: Math.random() * (GROUND_Y * 0.5),
                size: 0.5 + Math.random() * 1.5,
                twinkle: Math.random() * Math.PI * 2
            });
        }
        return stars;
    }

    _genClouds(count) {
        const clouds = [];
        for (let i = 0; i < count; i++) {
            clouds.push({
                x: Math.random() * this.width * 2,
                y: 30 + Math.random() * 80,
                w: 60 + Math.random() * 80,
                h: 20 + Math.random() * 20,
                opacity: 0.08 + Math.random() * 0.12
            });
        }
        return clouds;
    }

    _genMountains() {
        // Generate height points for a procedural mountain/hill silhouette
        const points = [];
        const totalWidth = this.width * 2;
        const step = 8; // horizontal resolution
        for (let x = 0; x <= totalWidth + step; x += step) {
            // Layer multiple sine waves for natural-looking hills
            const h = Math.sin(x * 0.005) * 30
                     + Math.sin(x * 0.012 + 1.5) * 20
                     + Math.sin(x * 0.025 + 3.0) * 10
                     + Math.sin(x * 0.06 + 0.8) * 5;
            points.push({ x, h });
        }
        return points;
    }

    _genBuildings() {
        const buildings = [];
        let x = 0;
        const totalWidth = this.width * 2;
        while (x < totalWidth) {
            const w = 35 + Math.random() * 85;
            const h = 50 + Math.random() * 160;
            buildings.push({
                x, w, h,
                roofType: Math.random() > 0.6 ? 'pointed' : 'flat',
                windows: this._genWindows(w, h),
                // Neon sign (random per building, visible only in Neon theme)
                hasNeonSign: Math.random() > 0.65,
                neonSignY: 0.2 + Math.random() * 0.3,
                neonColor: ['#FF00FF', '#00FFFF', '#FF3366', '#66FF33', '#FFFF00'][randomBetween(0, 4)],
                // Antenna/tower on rooftop (random)
                hasAntenna: Math.random() > 0.55,
                antennaHeight: 10 + Math.random() * 25,
                antennaType: Math.random() > 0.5 ? 'thin' : 'tower' // thin pole or wider tower
            });
            x += w + 2 + Math.random() * 10;
        }
        return buildings;
    }

    _genFlyingObjects() {
        // Generate 1-2 background flying objects (airplane or helicopter)
        const count = 1 + Math.floor(Math.random() * 2);
        const objects = [];
        for (let i = 0; i < count; i++) {
            objects.push({
                x: Math.random() * this.width * 2,
                y: 15 + Math.random() * 60, // high in the sky
                speed: 0.15 + Math.random() * 0.25, // very slow
                type: Math.random() > 0.5 ? 'airplane' : 'helicopter',
                blinkPhase: Math.random() * Math.PI * 2
            });
        }
        return objects;
    }

    _genWindows(bw, bh) {
        const windows = [];
        const cols = Math.floor((bw - 10) / 14);
        const rows = Math.floor((bh - 15) / 18);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() > 0.25) {
                    windows.push({
                        ox: 6 + c * 14,
                        oy: 8 + r * 18,
                        lit: Math.random() > 0.45,
                        warmth: Math.random(),
                        // Neon window colors for Neon City theme
                        neonColor: ['#FF00FF', '#00FFFF', '#AA00FF', '#FF3399', '#00FF88'][randomBetween(0, 4)]
                    });
                }
            }
        }
        return windows;
    }

    // ── Update ──

    update(gameSpeed) {
        this.skyOffset += gameSpeed * 0.05;
        this.mountainOffset += gameSpeed * 0.1;
        this.cityOffset += gameSpeed * 0.3;
        this.groundOffset += gameSpeed;

        // Update flying objects position
        for (const fo of this.flyingObjects) {
            fo.x += fo.speed;
            // Wrap around when off-screen to the right
            if (fo.x > this.width + 60) {
                fo.x = -60;
                fo.y = 15 + Math.random() * 60;
            }
        }

        // Advance theme transition
        if (this.themeTransition < 1) {
            this.themeTransition = Math.min(1, this.themeTransition + this.themeTransitionSpeed);
            if (this.themeTransition >= 1) {
                this.currentThemeIndex = this.targetThemeIndex;
            }
        }

        // Neon animation timer
        this.neonTimer += 0.03;
    }

    // ── Draw ──

    draw(ctx) {
        const colors = this._getCurrentColors();
        this._drawSky(ctx, colors);
        this._drawStars(ctx, colors);
        this._drawClouds(ctx, colors);
        this._drawFlyingObjects(ctx, colors);
        this._drawMountains(ctx, colors);
        this._drawCity(ctx, colors);
        this._drawGround(ctx, colors);
    }

    _drawSky(ctx, colors) {
        const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        grad.addColorStop(0, colors.sky[0]);
        grad.addColorStop(0.4, colors.sky[1]);
        grad.addColorStop(0.75, colors.sky[2]);
        grad.addColorStop(1, colors.sky[3]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, GROUND_Y);
    }

    _drawStars(ctx, colors) {
        if (!colors.stars) return;

        for (const star of this.stars) {
            star.twinkle += 0.02;
            const alpha = 0.3 + Math.sin(star.twinkle) * 0.3;
            ctx.fillStyle = `rgba(255, 255, 230, ${Math.max(0.05, alpha)})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawClouds(ctx, colors) {
        for (const cloud of this.clouds) {
            const x = ((cloud.x - this.skyOffset) % (this.width + cloud.w + 100)) - cloud.w;
            ctx.fillStyle = colors.cloudColor;
            ctx.beginPath();
            // Multi-circle cloud
            ctx.ellipse(x + cloud.w * 0.3, cloud.y, cloud.w * 0.25, cloud.h * 0.5, 0, 0, Math.PI * 2);
            ctx.ellipse(x + cloud.w * 0.55, cloud.y - cloud.h * 0.2, cloud.w * 0.3, cloud.h * 0.6, 0, 0, Math.PI * 2);
            ctx.ellipse(x + cloud.w * 0.75, cloud.y, cloud.w * 0.2, cloud.h * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawMountains(ctx, colors) {
        const totalWidth = this.width * 2;
        // Mountain color: darker than sky, lighter than buildings
        // Interpolate between the bottom sky color and the building body color
        const skyBottom = colors.sky[3];
        const buildingCol = this._toHex(
            ...this._parseHex(skyBottom).map((c, i) => {
                const darker = c * 0.55; // push toward darker
                return (darker + (colors.buildingLight * 1.2)) | 0;
            })
        );
        const mountainColor = this._lerpColor(skyBottom, buildingCol, 0.5);

        // Horizon baseline — where mountains sit
        const baselineY = GROUND_Y - 10;

        ctx.fillStyle = mountainColor;
        ctx.beginPath();
        ctx.moveTo(0, baselineY);

        for (const pt of this.mountains) {
            let px = ((pt.x - this.mountainOffset) % totalWidth);
            if (px < 0) px += totalWidth;
            if (px > this.width + 20) continue;
            ctx.lineTo(px, baselineY - 30 - pt.h);
        }

        ctx.lineTo(this.width, baselineY);
        ctx.closePath();
        ctx.fill();
    }

    _drawFlyingObjects(ctx, colors) {
        for (const fo of this.flyingObjects) {
            if (fo.x < -60 || fo.x > this.width + 60) continue;

            ctx.save();
            // Silhouette color: slightly lighter than top sky
            const [sr, sg, sb] = this._parseHex(colors.sky[0]);
            ctx.fillStyle = `rgba(${Math.min(255, sr + 40)}, ${Math.min(255, sg + 40)}, ${Math.min(255, sb + 40)}, 0.7)`;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1;

            if (fo.type === 'airplane') {
                // Simple airplane silhouette
                // Fuselage
                ctx.beginPath();
                ctx.ellipse(fo.x, fo.y, 12, 2, 0, 0, Math.PI * 2);
                ctx.fill();
                // Wings
                ctx.beginPath();
                ctx.moveTo(fo.x - 3, fo.y);
                ctx.lineTo(fo.x - 1, fo.y - 6);
                ctx.lineTo(fo.x + 3, fo.y - 5);
                ctx.lineTo(fo.x + 2, fo.y);
                ctx.fill();
                // Tail fin
                ctx.beginPath();
                ctx.moveTo(fo.x - 10, fo.y);
                ctx.lineTo(fo.x - 11, fo.y - 4);
                ctx.lineTo(fo.x - 8, fo.y);
                ctx.fill();
            } else {
                // Simple helicopter silhouette
                // Body
                ctx.beginPath();
                ctx.ellipse(fo.x, fo.y, 8, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                // Rotor line
                ctx.beginPath();
                ctx.moveTo(fo.x - 10, fo.y - 4);
                ctx.lineTo(fo.x + 10, fo.y - 4);
                ctx.stroke();
                // Tail boom
                ctx.beginPath();
                ctx.moveTo(fo.x - 8, fo.y);
                ctx.lineTo(fo.x - 14, fo.y - 2);
                ctx.stroke();
                // Tail rotor
                ctx.beginPath();
                ctx.moveTo(fo.x - 14, fo.y - 5);
                ctx.lineTo(fo.x - 14, fo.y + 1);
                ctx.stroke();
            }

            // Blinking light
            fo.blinkPhase += 0.04;
            const blinkAlpha = Math.sin(fo.blinkPhase) > 0.6 ? 0.9 : 0.1;
            ctx.fillStyle = `rgba(255, 30, 30, ${blinkAlpha})`;
            ctx.beginPath();
            ctx.arc(fo.x, fo.y - (fo.type === 'airplane' ? 3 : 5), 1.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    _drawCity(ctx, colors) {
        const totalWidth = this.width * 2;
        const isNeon = this._isNeonTheme();

        for (const b of this.buildings) {
            let bx = ((b.x - this.cityOffset) % totalWidth);
            if (bx < 0) bx += totalWidth;
            bx -= b.w;

            if (bx > this.width + 10 || bx + b.w < -10) continue;

            const by = GROUND_Y - b.h;

            // Building body — use theme-interpolated hue/sat/light
            const hue = colors.buildingHue | 0;
            const sat = colors.buildingSat | 0;
            const light = colors.buildingLight | 0;
            const bodyColor = `hsl(${hue}, ${sat}%, ${light}%)`;
            ctx.fillStyle = bodyColor;
            ctx.fillRect(bx, by, b.w, b.h);

            // Roof
            if (b.roofType === 'pointed') {
                ctx.fillStyle = bodyColor;
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + b.w / 2, by - 12);
                ctx.lineTo(bx + b.w, by);
                ctx.closePath();
                ctx.fill();
            }

            // ── Neon City: neon edge glow ──
            if (isNeon) {
                const edgeAlpha = 0.15 + Math.sin(this.neonTimer * 2 + b.x * 0.01) * 0.1;
                ctx.strokeStyle = `rgba(180, 0, 255, ${edgeAlpha})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(bx, by, b.w, b.h);

                // Neon sign on some buildings
                if (b.hasNeonSign) {
                    const signY = by + b.h * b.neonSignY;
                    const signPulse = 0.6 + Math.sin(this.neonTimer * 3 + b.x * 0.05) * 0.4;
                    ctx.save();
                    ctx.shadowColor = b.neonColor;
                    ctx.shadowBlur = 8 * signPulse;
                    ctx.fillStyle = b.neonColor;
                    ctx.globalAlpha = 0.5 + signPulse * 0.5;
                    ctx.fillRect(bx + 4, signY | 0, b.w - 8, 6);
                    ctx.globalAlpha = 1;
                    ctx.restore();
                }
            }

            // Antenna/tower on rooftop
            if (b.hasAntenna) {
                const antX = bx + b.w * 0.5;
                let antBaseY = by;
                if (b.roofType === 'pointed') antBaseY = by - 12;

                const hue = colors.buildingHue | 0;
                const sat = colors.buildingSat | 0;
                const light = (colors.buildingLight + 5) | 0;

                if (b.antennaType === 'tower') {
                    // Wider tower base tapering to top
                    ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
                    ctx.beginPath();
                    ctx.moveTo(antX - 3, antBaseY);
                    ctx.lineTo(antX - 1, antBaseY - b.antennaHeight);
                    ctx.lineTo(antX + 1, antBaseY - b.antennaHeight);
                    ctx.lineTo(antX + 3, antBaseY);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    // Thin pole
                    ctx.strokeStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(antX, antBaseY);
                    ctx.lineTo(antX, antBaseY - b.antennaHeight);
                    ctx.stroke();
                    // Small horizontal crossbar near top
                    const crossY = antBaseY - b.antennaHeight + 4;
                    ctx.beginPath();
                    ctx.moveTo(antX - 3, crossY);
                    ctx.lineTo(antX + 3, crossY);
                    ctx.stroke();
                }

                // Blinking red light at antenna top
                const blinkVal = Math.sin(this.neonTimer * 2.5 + b.x * 0.02);
                const lightAlpha = blinkVal > 0.3 ? 0.9 : 0.15;
                ctx.fillStyle = `rgba(255, 20, 20, ${lightAlpha})`;
                ctx.beginPath();
                ctx.arc(antX, antBaseY - b.antennaHeight, 1.5, 0, Math.PI * 2);
                ctx.fill();
                // Subtle glow around the light when bright
                if (lightAlpha > 0.5) {
                    ctx.fillStyle = `rgba(255, 20, 20, 0.15)`;
                    ctx.beginPath();
                    ctx.arc(antX, antBaseY - b.antennaHeight, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Windows
            for (const win of b.windows) {
                if (win.lit) {
                    if (isNeon) {
                        // Neon City: colorful windows (pink, cyan, purple)
                        ctx.fillStyle = win.neonColor;
                        ctx.shadowColor = win.neonColor;
                        ctx.shadowBlur = 6;
                    } else {
                        // Normal lit window with theme color
                        const [wr, wg, wb] = this._parseHex(colors.windowLitColor);
                        const warmR = wr;
                        const warmG = (wg + win.warmth * 20) | 0;
                        const warmB = (wb + win.warmth * 20) | 0;
                        ctx.fillStyle = `rgba(${warmR}, ${warmG}, ${warmB}, 0.85)`;
                        ctx.shadowColor = `rgb(${warmR}, ${warmG}, ${warmB})`;
                        ctx.shadowBlur = 4;
                    }
                } else {
                    ctx.fillStyle = 'rgba(100, 120, 160, 0.15)';
                    ctx.shadowBlur = 0;
                }
                ctx.fillRect(bx + win.ox, by + win.oy, 8, 10);
            }
            ctx.shadowBlur = 0;
        }
    }

    _drawGround(ctx, colors) {
        const gY = GROUND_Y;
        const gH = this.height - GROUND_Y;

        // Sidewalk
        const sGrad = ctx.createLinearGradient(0, gY, 0, gY + 8);
        sGrad.addColorStop(0, colors.sidewalkColor);
        sGrad.addColorStop(1, this._lerpColor(colors.sidewalkColor, '#000000', 0.3));
        ctx.fillStyle = sGrad;
        ctx.fillRect(0, gY, this.width, 8);

        // Sidewalk edge
        ctx.fillStyle = colors.sidewalkEdge;
        ctx.fillRect(0, gY, this.width, 2);

        // Road
        const rGrad = ctx.createLinearGradient(0, gY + 8, 0, gY + gH);
        rGrad.addColorStop(0, colors.groundColor);
        rGrad.addColorStop(1, colors.groundColor2);
        ctx.fillStyle = rGrad;
        ctx.fillRect(0, gY + 8, this.width, gH - 8);

        // Center line (dashed)
        ctx.strokeStyle = colors.roadLineColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([25, 18]);
        ctx.lineDashOffset = -(this.groundOffset % 43) * 2;
        ctx.beginPath();
        ctx.moveTo(0, gY + gH / 2 + 4);
        ctx.lineTo(this.width, gY + gH / 2 + 4);
        ctx.stroke();
        ctx.setLineDash([]);

        // Road edge lines
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, gY + 9);
        ctx.lineTo(this.width, gY + 9);
        ctx.stroke();

        // ── Ground details: cracks, gutters, grass tufts ──

        // Cracks / imperfections on road (subtle dark lines)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;
        const crackSpacing = 130;
        for (let i = 0; i < 8; i++) {
            let cx = ((i * crackSpacing) - (this.groundOffset * 0.98) % (crackSpacing * 8));
            if (cx < 0) cx += crackSpacing * 8;
            if (cx > this.width + 10) continue;
            const cy = gY + 14 + (i % 3) * 12;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + 6 + (i % 4) * 3, cy + 3 + (i % 2) * 2);
            ctx.lineTo(cx + 10 + (i % 3) * 4, cy - 1);
            ctx.stroke();
        }

        // Gutter / drain marks every ~200px (scrolling with ground)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        const gutterSpacing = 200;
        const gutterCount = Math.ceil(this.width / gutterSpacing) + 2;
        for (let i = 0; i < gutterCount; i++) {
            let gx = ((i * gutterSpacing) - (this.groundOffset % (gutterSpacing * gutterCount)));
            if (gx < 0) gx += gutterSpacing * gutterCount;
            if (gx > this.width + 10) continue;
            // Small rectangular drain grate
            ctx.fillRect(gx, gY + 9, 12, 3);
            // Grate lines
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.lineWidth = 0.5;
            for (let j = 0; j < 3; j++) {
                ctx.beginPath();
                ctx.moveTo(gx + 2 + j * 4, gY + 9);
                ctx.lineTo(gx + 2 + j * 4, gY + 12);
                ctx.stroke();
            }
        }

        // Grass tufts at sidewalk edge (small green triangles)
        const grassSpacing = 35;
        const grassCount = Math.ceil(this.width / grassSpacing) + 2;
        for (let i = 0; i < grassCount; i++) {
            let gxGrass = ((i * grassSpacing + 12) - (this.groundOffset * 0.95) % (grassSpacing * grassCount));
            if (gxGrass < 0) gxGrass += grassSpacing * grassCount;
            if (gxGrass > this.width + 10) continue;
            // Small triangle tuft
            const tuftH = 3 + (i % 3);
            ctx.fillStyle = `rgba(60, ${110 + (i % 4) * 15}, 40, 0.35)`;
            ctx.beginPath();
            ctx.moveTo(gxGrass, gY);
            ctx.lineTo(gxGrass - 2, gY + 1);
            ctx.lineTo(gxGrass + 1, gY - tuftH);
            ctx.fill();
            // Second blade slightly offset
            ctx.beginPath();
            ctx.moveTo(gxGrass + 3, gY);
            ctx.lineTo(gxGrass + 5, gY + 1);
            ctx.lineTo(gxGrass + 2, gY - tuftH + 1);
            ctx.fill();
        }

        // ── Neon City: glowing road lines ──
        if (this._isNeonTheme()) {
            const neonAlpha = 0.15 + Math.sin(this.neonTimer * 1.5) * 0.08;
            ctx.strokeStyle = `rgba(255, 0, 255, ${neonAlpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, gY + 9);
            ctx.lineTo(this.width, gY + 9);
            ctx.stroke();
        }
    }
}
