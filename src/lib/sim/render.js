// The ONLY place the simulator touches a canvas. render() is a pure function of
// a core snapshot (PRD §8.1), which is what lets the replay scrubber and the
// ghost-run overlay fall out almost for free later. Everything stateful lives
// in core.js; this file just draws what it is given.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} snap  SimCore.snapshot()
 * @param {(name:string, fallback:string)=>string} css  theme colour accessor
 */
export function render(ctx, snap, css) {
  const { size } = snap;
  ctx.clearRect(0, 0, size.w, size.h);

  // line track (under everything)
  if (snap.line.length) {
    ctx.strokeStyle = css('--ink-soft', '#4a5d74');
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    for (const seg of snap.line) { ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  // pen trail
  if (snap.trail.length) {
    ctx.strokeStyle = css('--led', '#ffb93b');
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (const stroke of snap.trail) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // waypoints
  snap.waypoints.forEach((wp, i) => {
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, wp.r, 0, Math.PI * 2);
    ctx.fillStyle = snap.visited.has(i) ? css('--go', '#2fa36b') : css('--grid', '#d9e4ee');
    ctx.fill();
    ctx.strokeStyle = css('--ink-soft', '#4a5d74');
    ctx.stroke();
    ctx.fillStyle = snap.visited.has(i) ? '#ffffff' : css('--ink-soft', '#4a5d74');
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), wp.x, wp.y);
  });

  // target
  if (snap.target) {
    ctx.beginPath();
    ctx.arc(snap.target.x, snap.target.y, snap.target.r, 0, Math.PI * 2);
    ctx.fillStyle = snap.reachedTarget ? css('--go', '#2fa36b') : css('--grid', '#d9e4ee');
    ctx.fill();
    ctx.strokeStyle = css('--ink-soft', '#4a5d74');
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // walls
  ctx.fillStyle = css('--ink', '#17293e');
  for (const w of snap.walls) ctx.fillRect(w.x, w.y, w.w, w.h);

  // sensor ray (subtle)
  const d = snap.distance;
  ctx.strokeStyle = 'rgba(62,108,158,0.45)';
  ctx.beginPath();
  ctx.moveTo(snap.x + Math.cos(snap.heading) * 16, snap.y + Math.sin(snap.heading) * 16);
  ctx.lineTo(snap.x + Math.cos(snap.heading) * (16 + d * 60), snap.y + Math.sin(snap.heading) * (16 + d * 60));
  ctx.stroke();

  // robot body
  ctx.save();
  ctx.translate(snap.x, snap.y);
  ctx.rotate(snap.heading + Math.PI / 2);
  ctx.fillStyle = css('--wire', '#3e6c9e');
  roundRect(ctx, -14, -16, 28, 32, 7);
  ctx.fill();
  ctx.fillStyle = css('--ink', '#17293e');
  ctx.fillRect(-18, -10, 5, 20);
  ctx.fillRect(13, -10, 5, 20);
  ctx.beginPath();
  ctx.arc(0, -6, 5, 0, Math.PI * 2);
  ctx.fillStyle = snap.led ? css('--led', '#ffb93b') : '#ffffff';
  ctx.fill();
  if (snap.led) {
    ctx.shadowColor = css('--led', '#ffb93b');
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
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
