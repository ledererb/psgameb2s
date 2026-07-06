// ============================================
// Hotdog Dash — Game Constants & Utilities
// ============================================

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 400;
export const GROUND_Y = 320;

// Physics
export const GRAVITY = 0.65;
export const JUMP_FORCE = -13;
export const DOUBLE_JUMP_FORCE = -11;

// Speed progression
export const INITIAL_SPEED = 5;
export const MAX_SPEED = 15;
export const SPEED_INCREMENT = 0.001;

// Player
export const PLAYER_X = 100;
export const INVINCIBILITY_DURATION = 120; // frames (~2 sec)
export const INITIAL_LIVES = 3;
export const MAX_LIVES = 5;

// Scoring
export const HOTDOG_POINTS = 100;
export const DISTANCE_POINT_INTERVAL = 1; // score +1 per frame

// Spawning
export const MIN_OBSTACLE_GAP = 90;
export const MAX_OBSTACLE_GAP = 200;
export const MIN_COLLECTIBLE_GAP = 35;
export const MAX_COLLECTIBLE_GAP = 90;
export const DONUT_CHANCE = 0.15;

/**
 * AABB collision detection between two rectangles.
 */
export function checkCollision(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

/**
 * Random integer between min and max (inclusive).
 */
export function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random float between min and max.
 */
export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Draw a rounded rectangle path.
 */
export function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Format a number with commas (1000 -> "1,000").
 */
export function formatScore(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
