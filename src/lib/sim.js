// Animated simulator facade. The simulation itself now lives in the split,
// deterministic core (src/lib/sim/*, PRD §8.1); this file is the thin browser
// wrapper that the lab UI and the interpreter talk to. Its public API is kept
// byte-for-byte compatible with the original RobotSim so every lesson, the
// interpreter, and the 26 behavioural tests keep working unchanged — the
// refactor is invisible from the outside.

import { SimCore } from './sim/core.js';
import { animatedDriver } from './sim/runner.js';
import { render } from './sim/render.js';

const frame = () => new Promise((r) => requestAnimationFrame(r));

export class RobotSim {
  constructor(canvas, { walls = [], target = null, waypoints = [], line = [], start = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.core = new SimCore({
      size: { w: canvas.width, h: canvas.height },
      walls, target, waypoints, line, start,
      captureTrace: true, // single watched runs record a trace for "Why did that happen?"
    });
    // The animated driver renders and waits a frame between sub-steps, so the
    // learner watches the robot move; the core does the actual simulating.
    this.driver = animatedDriver(this.core, async () => { this.draw(); await frame(); });
    this.draw();
  }

  // --- learner/interpreter API (awaitable) -------------------------------
  moveForward(units = 1) { return this.driver.moveForward(units); }
  turn(deg) { return this.driver.turn(deg); }
  setPen(down) { return this.driver.setPen(down); }
  setLed(on) { return this.driver.setLed(on); }
  wait(seconds) { return this.driver.wait(seconds); }
  setSpeed(v) { return this.core.setSpeed(v); }
  stop() { this.core.stop(); }

  reset() { this.core.reset(); this.draw(); }

  readDistance() { return this.core.readDistance(); }
  readLine() { return this.core.readLine(); }
  trailCorners() { return this.core.trailCorners(); }

  // --- state reads (delegated to the core) -------------------------------
  get x() { return this.core.x; }
  get y() { return this.core.y; }
  get heading() { return this.core.heading; }
  get led() { return this.core.led; }
  get blinkCount() { return this.core.blinkCount; }
  get reachedTarget() { return this.core.reachedTarget; }
  get bumped() { return this.core.bumped; }
  get speed() { return this.core.speed; }
  get stopped() { return this.core.stopped; }
  get pen() { return this.core.pen; }
  get trail() { return this.core.trail; }
  get visited() { return this.core.visited; }
  get steps() { return this.core.steps; }
  get waypoints() { return this.core.waypoints; }
  get target() { return this.core.target; }
  get line() { return this.core.line; }
  get walls() { return this.core.walls; }
  get startX() { return this.core.startX; }
  get startY() { return this.core.startY; }
  get allVisited() { return this.core.allVisited; }
  get lineAccuracy() { return this.core.lineAccuracy; }
  get distanceFromStart() { return this.core.distanceFromStart; }
  get trace() { return this.core.trace; }

  // --- rendering ---------------------------------------------------------
  draw() {
    const cs = getComputedStyle(document.documentElement);
    const css = (v, fallback) => cs.getPropertyValue(v).trim() || fallback;
    render(this.ctx, this.core.snapshot(), css);
  }
}
