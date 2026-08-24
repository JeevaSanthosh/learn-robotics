// Sense → decide → act (PRD-UX §7.1, catalogue row 1). Written for m1-meet,
// which is the FIRST thing a learner ever sees and is currently 110 words of
// prose followed by a "Mark done" button.
//
// PRD-UX §7.3 says a process with stages gets a stepper, so `step` is a
// control rather than a playback timeline: the learner drives the loop one
// stage at a time and can sit on any stage for as long as they like. That is
// also why this demo needs no reduced-motion handling — nothing moves unless
// the learner moves it.
//
// The lesson's claim is "that's the whole secret of robotics". This demo has
// to make the claim concrete in about fifteen seconds, so the three stages are
// labelled with what the ROBOT is doing, and the decision visibly flips when
// the learner drags the wall past the threshold.

/** cm of clear floor the sim robot reports at most. */
const MAX_RANGE = 40;

export const id = 'loop';
export const title = 'Sense → decide → act';

export const controls = [
  { key: 'step', label: 'Step through the loop', min: 0, max: 2, step: 1, value: 0 },
  { key: 'gap', label: 'Wall is', min: 3, max: 40, step: 1, value: 22, unit: ' cm away' },
  { key: 'threshold', label: 'Stop closer than', min: 3, max: 30, step: 1, value: 10, unit: ' cm' },
];

export const readouts = [
  { key: 'stageName', label: 'Right now' },
  { key: 'happening', label: 'The robot is' },
];

const STAGES = ['SENSE', 'DECIDE', 'ACT'];

export function compute(state) {
  const step = Math.max(0, Math.min(2, Math.round(Number(state.step))));
  const gap = Math.min(Number(state.gap), MAX_RANGE);
  const threshold = Number(state.threshold);

  // The decision the robot makes. One comparison — this is the entire
  // "decide" stage, and saying so out loud is the point of the lesson.
  const clear = gap > threshold;

  const happening = [
    `reading ${gap} cm from its nose sensor`,
    clear
      ? `asking "is ${gap} bigger than ${threshold}?" — yes`
      : `asking "is ${gap} bigger than ${threshold}?" — no`,
    clear ? 'driving forward' : 'stopping',
  ][step];

  return {
    step,
    stageName: STAGES[step],
    happening,
    clear,
    gap,
    threshold,
    // Which subsystem is lit: sensor, brain, wheels.
    lit: ['sensor', 'brain', 'wheels'][step],
  };
}

export function explain(state, computed) {
  if (computed.step === 0) {
    return 'Sensing turns the world into a number. That is all a robot brain ever gets to work with.';
  }
  if (computed.step === 1) {
    return computed.clear
      ? 'Deciding is one comparison. Nothing has moved yet — the robot has only made up its mind.'
      : 'The same comparison, the other way. Drag the wall further away and watch this flip.';
  }
  return computed.clear
    ? 'Acting is the only stage anyone can see from outside. Then the loop starts again, immediately.'
    : 'It stopped because the number said so — not because you counted steps for it.';
}

export function draw(ctx, { computed, w, h, ink }) {
  ctx.clearRect(0, 0, w, h);
  ctx.font = `11px ${ink.mono}`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;

  const floorY = h * 0.62;
  const robotX = w * 0.22;
  // Map the sensor gap onto the visible floor so dragging it reads as motion.
  const wallX = robotX + 40 + (computed.gap / MAX_RANGE) * (w * 0.55);

  // --- floor ---------------------------------------------------------------
  ctx.strokeStyle = ink.soft;
  ctx.beginPath();
  ctx.moveTo(20, floorY + 18);
  ctx.lineTo(w - 20, floorY + 18);
  ctx.stroke();

  // --- wall ----------------------------------------------------------------
  ctx.fillStyle = ink.soft;
  ctx.fillRect(wallX, floorY - 34, 10, 52);

  // --- sensor ray ----------------------------------------------------------
  // Lit during SENSE, faint otherwise: the ray is the sensing, so it should
  // only be loud on the stage it belongs to.
  ctx.save();
  ctx.strokeStyle = computed.lit === 'sensor' ? ink.led : ink.soft;
  ctx.globalAlpha = computed.lit === 'sensor' ? 1 : 0.3;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(robotX + 24, floorY);
  ctx.lineTo(wallX, floorY);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = computed.lit === 'sensor' ? ink.ink : ink.soft;
  ctx.textAlign = 'center';
  ctx.fillText(`${computed.gap} cm`, (robotX + 24 + wallX) / 2, floorY - 12);

  // --- threshold marker ----------------------------------------------------
  const threshX = robotX + 40 + (computed.threshold / MAX_RANGE) * (w * 0.55);
  ctx.save();
  ctx.strokeStyle = ink.danger;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(threshX, floorY - 30);
  ctx.lineTo(threshX, floorY + 18);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = ink.danger;
  ctx.fillText('stop line', threshX, floorY + 30);

  // --- robot ---------------------------------------------------------------
  ctx.fillStyle = ink.card;
  ctx.strokeStyle = ink.ink;
  ctx.beginPath();
  ctx.roundRect?.(robotX - 22, floorY - 20, 46, 34, 6);
  if (!ctx.roundRect) ctx.rect(robotX - 22, floorY - 20, 46, 34);
  ctx.fill();
  ctx.stroke();

  // wheels light up on ACT
  ctx.fillStyle = computed.lit === 'wheels' ? ink.led : ink.soft;
  ctx.beginPath();
  ctx.arc(robotX - 12, floorY + 16, 6, 0, Math.PI * 2);
  ctx.arc(robotX + 14, floorY + 16, 6, 0, Math.PI * 2);
  ctx.fill();

  // brain lights up on DECIDE
  ctx.fillStyle = computed.lit === 'brain' ? ink.led : ink.card;
  ctx.strokeStyle = ink.ink;
  ctx.beginPath();
  ctx.arc(robotX + 1, floorY - 3, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // --- the three stages, as a strip ---------------------------------------
  const boxW = Math.min(110, (w - 60) / 3);
  const startX = (w - boxW * 3 - 16) / 2;
  STAGES.forEach((name, i) => {
    const x = startX + i * (boxW + 8);
    const active = i === computed.step;
    ctx.fillStyle = active ? ink.led : ink.card;
    ctx.strokeStyle = active ? ink.ink : ink.soft;
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect?.(x, 14, boxW, 26, 6);
    if (!ctx.roundRect) ctx.rect(x, 14, boxW, 26);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? '#17293e' : ink.soft;
    ctx.textAlign = 'center';
    ctx.fillText(name, x + boxW / 2, 27);

    // the arrow that makes it a LOOP rather than a list
    if (i < 2) {
      ctx.strokeStyle = ink.soft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + boxW + 1, 27);
      ctx.lineTo(x + boxW + 6, 27);
      ctx.stroke();
    }
  });

  // "and round again"
  ctx.strokeStyle = ink.soft;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX + boxW * 3 + 16, 27);
  ctx.lineTo(startX + boxW * 3 + 24, 27);
  ctx.lineTo(startX + boxW * 3 + 24, 48);
  ctx.lineTo(startX - 8, 48);
  ctx.lineTo(startX - 8, 27);
  ctx.lineTo(startX - 2, 27);
  ctx.stroke();
}
