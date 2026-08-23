// Sensor models — pure functions of the robot pose and the world. Kept out of
// core.js so new sensors (cone, encoder, IMU, camera) can be added without
// touching the motion loop, and so the whole file stays on the headless,
// DOM-free path (C-SIM-HEADLESS).
//
// Every sensor is introduced IDEAL first and made realistic later (PRD §8.3),
// so the noise arguments here all default to "off": the ideal reading is what
// the early lessons see, and a later lesson turns sigma/dropout up.

export const PX_PER_UNIT = 60;
const ROBOT_RADIUS = 14; // collision + nose offset reference

/** Axis-aligned wall hit-test for a point with the robot's radius. */
export function hitsWall(px, py, walls, r = ROBOT_RADIUS) {
  return walls.some((w) => px + r > w.x && px - r < w.x + w.w && py + r > w.y && py - r < w.y + w.h);
}

/**
 * Ideal single-ray distance sensor: cast from the nose along `heading`, return
 * the distance in units (60px = 1 unit) to the first wall, or 99 if clear.
 */
export function rayDistance(x, y, heading, walls) {
  for (let d = 0; d < 800; d += 2) {
    const px = x + Math.cos(heading) * (16 + d);
    const py = y + Math.sin(heading) * (16 + d);
    if (hitsWall(px, py, walls)) return +(d / PX_PER_UNIT).toFixed(2);
  }
  return 99;
}

/**
 * Distance reading with optional realism (PRD §8.3, M3+):
 *  - cone: min of 3 rays at ±`coneDeg`, so an angled wall no longer defeats it
 *  - noise: Gaussian jitter of sigma units
 *  - dropout: with probability `dropout`, the sensor returns its max (a miss)
 * With all options off/zero this equals `rayDistance` exactly, so lessons that
 * predate noise are unaffected.
 */
export function readDistance(state, world, { cone = false, coneDeg = 10, sigma = 0, dropout = 0, noise = null } = {}) {
  const { x, y, heading } = state;
  const walls = world.walls;
  let d;
  if (cone) {
    const rad = (coneDeg * Math.PI) / 180;
    d = Math.min(
      rayDistance(x, y, heading - rad, walls),
      rayDistance(x, y, heading, walls),
      rayDistance(x, y, heading + rad, walls),
    );
  } else {
    d = rayDistance(x, y, heading, walls);
  }
  if (noise) {
    if (dropout && noise.chance(dropout)) return 99;
    if (sigma) d = Math.max(0, +(d + noise.gaussian(0, sigma)).toFixed(2));
  }
  return d;
}

/** Shortest distance from a point to any line segment of the track. */
export function distanceToLine(px, py, line) {
  let best = Infinity;
  for (const seg of line) {
    const { x1, y1, x2, y2 } = seg;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)));
  }
  return best;
}

/** Ideal line sensor: true when the robot sits over the track (within 14px). */
export function readLine(state, world) {
  if (!world.line || !world.line.length) return false;
  return distanceToLine(state.x, state.y, world.line) < 14;
}
