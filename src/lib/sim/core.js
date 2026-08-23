// The deterministic simulation core (PRD §8.1). No DOM, no canvas, no
// requestAnimationFrame, no wall-clock time — given a world (and a seed) it
// produces byte-identical state for the same commands every run (C-SIM-DET),
// which is what makes grading fair, replays exact, and multi-seed grading
// possible in a Web Worker.
//
// Motion is expressed as fixed sub-steps: each command is a GENERATOR that
// yields once per tick. The animated driver renders + waits a frame between
// yields; the headless driver drains them as fast as the CPU allows. The maths
// is a faithful port of the original sim.js so the 26 behavioural tests hold.

import { makeNoise } from './noise.js';
import { readDistance as senseDistance, readLine as senseLine, distanceToLine, hitsWall, PX_PER_UNIT } from './sensors.js';

export const TICKS_PER_SEC = 60; // simulated, not real; only used to size wait()
const MOVE_PX_PER_TICK = 2;      // at speed 1 (matches the original step of 2*speed)

/** Border walls for an arena of the given size (8px frame, as the original). */
export function borderWalls({ w, h }) {
  return [
    { x: 0, y: 0, w, h: 8 },
    { x: 0, y: h - 8, w, h: 8 },
    { x: 0, y: 0, w: 8, h },
    { x: w - 8, y: 0, w: 8, h },
  ];
}

export class SimCore {
  /**
   * @param {object} world { size:{w,h}, walls?, target?, waypoints?, line?, start?, impairments?, seed? }
   */
  constructor(world = {}) {
    this.size = world.size || { w: 360, h: 300 };
    this.extraWalls = world.walls || [];
    this.walls = [...borderWalls(this.size), ...this.extraWalls];
    this.target = world.target || null;         // {x,y,r}
    this.waypoints = world.waypoints || [];     // [{x,y,r}]
    this.line = world.line || [];               // [{x1,y1,x2,y2}]
    this.start = world.start || null;           // {x,y,heading(deg)}
    this.impairments = world.impairments || {}; // {sensorNoiseSigma, sensorDropout, sensorCone, ...}
    this.seed = world.seed ?? 1;
    // When on, one lightweight sample is recorded per tick, for the run-trace
    // failure explainer (§8.8). Off by default so grading stays fast.
    this.captureTrace = !!world.captureTrace;
    // The world object is what sensors.js reads; keep a normalised handle.
    this.world = { walls: this.walls, line: this.line };
    this.reset();
  }

  reset() {
    this.noise = makeNoise(this.seed); // fresh stream so a re-run of a seed matches
    this.x = this.start?.x ?? 60;
    this.y = this.start?.y ?? this.size.h - 60;
    this.heading = this.start ? (this.start.heading * Math.PI) / 180 : -Math.PI / 2;
    this.led = false;
    this.blinkCount = 0;
    this.reachedTarget = false;
    this.bumped = false;
    this.speed = 1;
    this.stopped = false;

    this.pen = false;
    this.trail = [];
    this.visited = new Set();
    this.steps = 0;
    this.offLineTicks = 0;
    this.onLineTicks = 0;
    this.ticks = 0;
    this.trace = [];
    this.startX = this.x;
    this.startY = this.y;
  }

  setSpeed(v) { this.speed = Math.min(3, Math.max(0.5, Number(v) || 1)); }
  stop() { this.stopped = true; }

  /** One lightweight trace sample; only called when captureTrace is on. */
  _sample() {
    this.trace.push({ tick: this.ticks, x: this.x, y: this.y, heading: this.heading, distance: this.readDistance() });
  }

  // --- generator commands (one yield per tick) ---------------------------
  *moveGen(units = 1) {
    this.steps++;
    const dist = units * PX_PER_UNIT;
    const step = MOVE_PX_PER_TICK * this.speed;
    if (this.pen) this.trail.push([{ x: this.x, y: this.y }]);
    for (let d = 0; d < dist && !this.stopped; d += step) {
      const nx = this.x + Math.cos(this.heading) * step;
      const ny = this.y + Math.sin(this.heading) * step;
      if (hitsWall(nx, ny, this.walls)) { this.bumped = true; break; }
      this.x = nx;
      this.y = ny;
      if (this.pen) this.trail[this.trail.length - 1].push({ x: nx, y: ny });
      this.checkTarget();
      this.checkWaypoints();
      this.sampleLine();
      this.ticks++;
      if (this.captureTrace) this._sample();
      yield;
    }
  }

  *turnGen(deg) {
    this.steps++;
    const rad = (deg * Math.PI) / 180;
    const steps = Math.max(1, Math.round(Math.abs(deg) / 4));
    for (let i = 0; i < steps && !this.stopped; i++) {
      this.heading += rad / steps;
      this.ticks++;
      if (this.captureTrace) this._sample();
      yield;
    }
  }

  *penGen(down) {
    this.pen = !!down;
    if (down) this.trail.push([{ x: this.x, y: this.y }]);
    yield;
  }

  *ledGen(on) {
    if (on && !this.led) this.blinkCount++;
    this.led = on;
    yield;
  }

  *waitGen(seconds) {
    const ticks = Math.max(0, Math.round(seconds * TICKS_PER_SEC));
    for (let i = 0; i < ticks && !this.stopped; i++) { this.ticks++; if (this.captureTrace) this._sample(); yield; }
  }

  // --- sensors (sync) ----------------------------------------------------
  readDistance() {
    const imp = this.impairments;
    return senseDistance({ x: this.x, y: this.y, heading: this.heading }, this.world, {
      cone: !!imp.sensorCone,
      coneDeg: imp.sensorConeDeg ?? 10,
      sigma: imp.sensorNoiseSigma ?? 0,
      dropout: imp.sensorDropout ?? 0,
      noise: (imp.sensorNoiseSigma || imp.sensorDropout) ? this.noise : null,
    });
  }

  readLine() { return senseLine({ x: this.x, y: this.y }, this.world); }

  // --- metrics -----------------------------------------------------------
  checkTarget() {
    if (!this.target) return;
    if (Math.hypot(this.x - this.target.x, this.y - this.target.y) < this.target.r) this.reachedTarget = true;
  }

  checkWaypoints() {
    this.waypoints.forEach((wp, i) => {
      if (Math.hypot(this.x - wp.x, this.y - wp.y) < wp.r) this.visited.add(i);
    });
  }

  get allVisited() {
    return this.waypoints.length > 0 && this.visited.size === this.waypoints.length;
  }

  sampleLine() {
    if (!this.line.length) return;
    this.readLine() ? this.onLineTicks++ : this.offLineTicks++;
  }

  get lineAccuracy() {
    const total = this.onLineTicks + this.offLineTicks;
    return total ? this.onLineTicks / total : 0;
  }

  trailCorners() {
    const pts = this.trail.flat();
    if (pts.length < 3) return 0;
    let corners = 0;
    let prevAngle = null;
    const SAMPLE = 6;
    for (let i = SAMPLE; i < pts.length; i += SAMPLE) {
      const a = Math.atan2(pts[i].y - pts[i - SAMPLE].y, pts[i].x - pts[i - SAMPLE].x);
      if (prevAngle !== null) {
        let diff = Math.abs(a - prevAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff > (30 * Math.PI) / 180) corners++;
      }
      prevAngle = a;
    }
    return corners;
  }

  get distanceFromStart() {
    return Math.hypot(this.x - this.startX, this.y - this.startY) / PX_PER_UNIT;
  }

  /** A plain snapshot for render.js and replay — a pure function of state. */
  snapshot() {
    return {
      size: this.size, walls: this.walls, target: this.target,
      waypoints: this.waypoints, line: this.line,
      x: this.x, y: this.y, heading: this.heading, led: this.led,
      pen: this.pen, trail: this.trail, visited: this.visited,
      reachedTarget: this.reachedTarget, distance: this.readDistance(),
    };
  }
}
