// Tiny top-down robot simulator. No physics library needed at this level:
// a differential-drive robot, rectangular walls, a raycast distance sensor,
// and an LED. Speeds are tuned for "watchable" animation, not realism.

export class RobotSim {
  constructor(canvas, { walls = [], target = null } = {}) {
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
    this.target = target; // {x, y, r}
    this.reset();
  }

  reset() {
    this.x = 60;
    this.y = this.canvas.height - 60;
    this.heading = -Math.PI / 2; // facing up
    this.led = false;
    this.blinkCount = 0;
    this.reachedTarget = false;
    this.bumped = false; // true if the robot ever hit a wall (goals can require "no crashing")
    this.speed = 1;
    this.stopped = false;
    this.draw();
  }

  setSpeed(v) {
    this.speed = Math.min(3, Math.max(0.5, Number(v) || 1));
  }

  stop() { this.stopped = true; }

  // --- API exposed to learner block code (all awaitable) -----------------
  async moveForward(units = 1) {
    const dist = units * 60;
    const step = 2 * this.speed;
    for (let d = 0; d < dist && !this.stopped; d += step) {
      const nx = this.x + Math.cos(this.heading) * step;
      const ny = this.y + Math.sin(this.heading) * step;
      if (this.hitsWall(nx, ny)) { this.bumped = true; break; } // bump and stop, no drama
      this.x = nx;
      this.y = ny;
      this.checkTarget();
      this.draw();
      await frame();
    }
  }

  async turn(deg) {
    const rad = (deg * Math.PI) / 180;
    const steps = Math.max(1, Math.round(Math.abs(deg) / 4));
    for (let i = 0; i < steps && !this.stopped; i++) {
      this.heading += rad / steps;
      this.draw();
      await frame();
    }
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

  draw() {
    const { ctx, canvas } = this;
    const css = getComputedStyle(document.documentElement);
    const c = (v, fallback) => css.getPropertyValue(v).trim() || fallback;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
