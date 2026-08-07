// Tiny top-down robot simulator. No physics library needed at this level:
// a differential-drive robot, rectangular walls, a raycast distance sensor,
// and an LED. Speeds are tuned for "watchable" animation, not realism.

export class RobotSim {
  constructor(canvas, { walls = [], target = null, waypoints = [], line = [], start = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.walls = [
      // arena border
      { x: 0, y: 0, w: canvas.width, h: 8 },
      { x: 0, y: canvas.height - 8, w: canvas.width, h: 8 },
      { x: 0, y: 0, w: 8, h: canvas.height },
      { x: canvas.width - 8, y: 0, w: 8, h: canvas.height },
      ...walls,
    ];
    this.target = target;          // {x, y, r}
    this.waypoints = waypoints;    // [{x, y, r}] — "visit all of these"
    this.line = line;              // [{x1,y1,x2,y2}] — track for line following
    this.start = start;            // {x, y, heading(deg)} — defaults to bottom-left
    this.reset();
  }

  reset() {
    this.x = this.start?.x ?? 60;
    this.y = this.start?.y ?? this.canvas.height - 60;
    this.heading = this.start ? (this.start.heading * Math.PI) / 180 : -Math.PI / 2;
    this.led = false;
    this.blinkCount = 0;
    this.reachedTarget = false;
    this.bumped = false; // true if the robot ever hit a wall (goals can require "no crashing")
    this.speed = 1;
    this.stopped = false;

    // --- extensions -------------------------------------------------------
    this.pen = false;
    this.trail = [];              // [[{x,y}...]] one array per pen-down stroke
    this.visited = new Set();     // indices of waypoints reached
    this.steps = 0;               // move/turn commands issued — used for efficiency goals
    this.offLineTicks = 0;        // frames spent off the line while following it
    this.onLineTicks = 0;
    this.startX = this.x;
    this.startY = this.y;

    this.draw();
  }

  setSpeed(v) {
    this.speed = Math.min(3, Math.max(0.5, Number(v) || 1));
  }

  stop() { this.stopped = true; }

  // --- API exposed to learner block code (all awaitable) -----------------
  async moveForward(units = 1) {
    this.steps++;
    const dist = units * 60;
    const step = 2 * this.speed;
    if (this.pen) this.trail.push([{ x: this.x, y: this.y }]);
    for (let d = 0; d < dist && !this.stopped; d += step) {
      const nx = this.x + Math.cos(this.heading) * step;
      const ny = this.y + Math.sin(this.heading) * step;
      if (this.hitsWall(nx, ny)) { this.bumped = true; break; } // bump and stop, no drama
      this.x = nx;
      this.y = ny;
      if (this.pen) this.trail[this.trail.length - 1].push({ x: nx, y: ny });
      this.checkTarget();
      this.checkWaypoints();
      this.sampleLine();
      this.draw();
      await frame();
    }
  }

  async turn(deg) {
    this.steps++;
    const rad = (deg * Math.PI) / 180;
    const steps = Math.max(1, Math.round(Math.abs(deg) / 4));
    for (let i = 0; i < steps && !this.stopped; i++) {
      this.heading += rad / steps;
      this.draw();
      await frame();
    }
  }

  // --- extensions exposed to blocks --------------------------------------
  async setPen(down) {
    this.pen = !!down;
    if (down) this.trail.push([{ x: this.x, y: this.y }]);
    this.draw();
    await frame();
  }

  /** true when the robot is sitting over the line track */
  readLine() {
    if (!this.line.length) return false;
    return this.distanceToLine(this.x, this.y) < 14;
  }

  async setLed(on) {
    if (on && !this.led) this.blinkCount++;
    this.led = on;
    this.draw();
    await frame();
  }

  async wait(seconds) {
    const until = performance.now() + seconds * 1000;
    while (performance.now() < until && !this.stopped) await frame();
  }

  readDistance() {
    // raycast from robot nose along heading; returns "units" (60px = 1 unit)
    for (let d = 0; d < 800; d += 2) {
      const px = this.x + Math.cos(this.heading) * (16 + d);
      const py = this.y + Math.sin(this.heading) * (16 + d);
      if (this.hitsWall(px, py)) return +(d / 60).toFixed(2);
    }
    return 99;
  }

  // --- internals ---------------------------------------------------------
  hitsWall(px, py) {
    const r = 14;
    return this.walls.some(
      (w) => px + r > w.x && px - r < w.x + w.w && py + r > w.y && py - r < w.y + w.h
    );
  }

  checkTarget() {
    if (!this.target) return;
    const dx = this.x - this.target.x;
    const dy = this.y - this.target.y;
    if (Math.hypot(dx, dy) < this.target.r) this.reachedTarget = true;
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

  /** fraction of travelled time spent on the line (1 = never strayed) */
  get lineAccuracy() {
    const total = this.onLineTicks + this.offLineTicks;
    return total ? this.onLineTicks / total : 0;
  }

  distanceToLine(px, py) {
    let best = Infinity;
    for (const seg of this.line) {
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

  /**
   * Corner count of the drawn trail, used by draw-a-shape goals.
   * Walks the stroke and counts direction changes larger than 30°.
   */
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

  /** distance in units between where the robot started and where it stopped */
  get distanceFromStart() {
    return Math.hypot(this.x - this.startX, this.y - this.startY) / 60;
  }

  draw() {
    const { ctx, canvas } = this;
    const css = getComputedStyle(document.documentElement);
    const c = (v, fallback) => css.getPropertyValue(v).trim() || fallback;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // line track (drawn under everything else)
    if (this.line.length) {
      ctx.strokeStyle = c('--ink-soft', '#4a5d74');
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      for (const seg of this.line) {
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

    // pen trail
    if (this.trail.length) {
      ctx.strokeStyle = c('--led', '#ffb93b');
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      for (const stroke of this.trail) {
        if (stroke.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }

    // waypoints
    this.waypoints.forEach((wp, i) => {
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, wp.r, 0, Math.PI * 2);
      ctx.fillStyle = this.visited.has(i) ? c('--go', '#2fa36b') : c('--grid', '#d9e4ee');
      ctx.fill();
      ctx.strokeStyle = c('--ink-soft', '#4a5d74');
      ctx.stroke();
      ctx.fillStyle = this.visited.has(i) ? '#ffffff' : c('--ink-soft', '#4a5d74');
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), wp.x, wp.y);
    });

    // target
    if (this.target) {
      ctx.beginPath();
      ctx.arc(this.target.x, this.target.y, this.target.r, 0, Math.PI * 2);
      ctx.fillStyle = this.reachedTarget ? c('--go', '#2fa36b') : c('--grid', '#d9e4ee');
      ctx.fill();
      ctx.strokeStyle = c('--ink-soft', '#4a5d74');
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // walls
    ctx.fillStyle = c('--ink', '#17293e');
    for (const w of this.walls) ctx.fillRect(w.x, w.y, w.w, w.h);

    // sensor ray (subtle)
    const d = this.readDistance();
    ctx.strokeStyle = 'rgba(62,108,158,0.45)';
    ctx.beginPath();
    ctx.moveTo(this.x + Math.cos(this.heading) * 16, this.y + Math.sin(this.heading) * 16);
    ctx.lineTo(
      this.x + Math.cos(this.heading) * (16 + d * 60),
      this.y + Math.sin(this.heading) * (16 + d * 60)
    );
    ctx.stroke();

    // robot body
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading + Math.PI / 2);
    ctx.fillStyle = c('--wire', '#3e6c9e');
    roundRect(ctx, -14, -16, 28, 32, 7);
    ctx.fill();
    // wheels
    ctx.fillStyle = c('--ink', '#17293e');
    ctx.fillRect(-18, -10, 5, 20);
    ctx.fillRect(13, -10, 5, 20);
    // LED
    ctx.beginPath();
    ctx.arc(0, -6, 5, 0, Math.PI * 2);
    ctx.fillStyle = this.led ? c('--led', '#ffb93b') : '#ffffff';
    ctx.fill();
    if (this.led) {
      ctx.shadowColor = c('--led', '#ffb93b');
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const frame = () => new Promise((r) => requestAnimationFrame(r));
