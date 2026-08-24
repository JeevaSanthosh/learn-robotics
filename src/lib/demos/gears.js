// Gear dial — the second ConceptDemo, written against the contract documented
// at the top of circuit.js (PRD-UX §7.1, catalogue row 3). It exists for
// m4-motors-gears, whose gear-ratio section was 281 unbroken words of prose
// about a trade-off the learner never got to make.
//
// The teaching target: robots trade speed for strength. So the trade has to be
// something the learner DOES, not something a caption asserts. Gearing down
// gets the robot up the hill and makes it crawl on the flat; gearing up makes
// it quick and leaves it stalled at the bottom of the slope. The "can it climb
// the hill?" verdict flips while they drag, which is the whole lesson.
//
// Like circuit.js: compute() is pure so the arithmetic is asserted in node
// (scripts/test-demos.mjs, G1-G14), and draw() paints only what compute()
// already decided. Nothing animates on its own — every frame is a response to
// the learner's own input, which is why there is no reduced-motion handling.

/** Torque the bare motor makes at its own shaft (N·m). A small hobby gearmotor. */
const MOTOR_TORQUE = 0.05;

/** Torque needed AT THE WHEEL to drag this robot up the test ramp (N·m). */
const HILL_TORQUE = 0.18;

/** Wheel diameter (cm) — turns rpm into a speed a human can picture. */
const WHEEL_DIAMETER_CM = 6.5;

/** Below this the robot is technically moving and practically parked (cm/s). */
const CRAWL_CMS = 5;

/** 4.62 → "4.62", 4.00 → "4". Keeps the ratio label readable. */
const trim = (n) => String(Math.round(n * 100) / 100);

export const id = 'gears';
export const title = 'Gear dial';

export const controls = [
  { key: 'driverTeeth', label: 'Motor gear (teeth)', min: 8, max: 60, step: 1, value: 10, unit: 'T' },
  { key: 'drivenTeeth', label: 'Wheel gear (teeth)', min: 8, max: 60, step: 1, value: 40, unit: 'T' },
  { key: 'motorRpm', label: 'Motor speed', min: 30, max: 600, step: 10, value: 200, unit: ' rpm' },
];

export const readouts = [
  { key: 'ratioLabel', label: 'Gear ratio' },
  { key: 'outputRpm', label: 'Wheel speed', unit: 'rpm' },
  { key: 'torqueMult', label: 'Torque', unit: '×' },
  { key: 'verdict', label: 'Climbs the hill?' },
];

/**
 * One division, and everything that follows from it.
 *   ratio  = teeth on driven gear ÷ teeth on driving gear
 *   speed  = motor rpm ÷ ratio          (you lose exactly what you gain)
 *   torque = motor torque × ratio
 * @param {{driverTeeth:number, drivenTeeth:number, motorRpm:number}} state
 */
export function compute(state) {
  const driverTeeth = Math.max(1, Number(state.driverTeeth));
  const drivenTeeth = Math.max(1, Number(state.drivenTeeth));
  const motorRpm = Number(state.motorRpm);

  const ratio = drivenTeeth / driverTeeth;
  const outputRpm = motorRpm / ratio;

  // Ideal gears: the torque multiplier IS the ratio. Real ones lose a few
  // percent to friction, which is a detail the lesson deliberately skips.
  const torqueMult = ratio;
  const wheelTorque = MOTOR_TORQUE * ratio;

  const wheelSpeedCms = (outputRpm * Math.PI * WHEEL_DIAMETER_CM) / 60;

  const climbs = wheelTorque >= HILL_TORQUE;
  const crawls = wheelSpeedCms < CRAWL_CMS;

  let verdict;
  if (climbs && crawls) verdict = 'yes — but it crawls 🐌';
  else if (climbs) verdict = 'yes — it climbs 💪';
  else verdict = 'no — it stalls on the slope';

  // The point of the demo, as a number: gears move the balance, never the
  // product. speed × torque comes out the same however you gear it.
  const power = outputRpm * torqueMult;

  return {
    ratio: Math.round(ratio * 1000) / 1000,
    ratioLabel: ratio >= 1 ? `${trim(ratio)}:1` : `1:${trim(1 / ratio)}`,
    outputRpm: Math.round(outputRpm * 10) / 10,
    torqueMult: Math.round(torqueMult * 100) / 100,
    wheelTorque: Math.round(wheelTorque * 1000) / 1000,
    wheelSpeedCms: Math.round(wheelSpeedCms * 10) / 10,
    power: Math.round(power * 100) / 100,
    climbs,
    crawls,
    verdict,
  };
}

/** Why, not just what — the arithmetic spelled out with the learner's numbers. */
export function explain(state, computed) {
  const sum = `${state.drivenTeeth} ÷ ${state.driverTeeth} = ${trim(computed.ratio)}`;
  if (!computed.climbs) {
    return `${sum}. The wheel gets ${computed.torqueMult}× the motor's twist — not enough to drag it up the ramp. Trade some speed away: put more teeth on the wheel gear.`;
  }
  if (computed.crawls) {
    return `${sum}. Strong enough to climb, but ${computed.wheelSpeedCms} cm/s is a walking-pace robot. That is the price of the torque.`;
  }
  return `${sum}. The wheel turns ${trim(computed.ratio)}× slower than the motor (${state.motorRpm} → ${computed.outputRpm} rpm) and pushes ${computed.torqueMult}× harder.`;
}

/** Canvas painting. Radii follow the teeth counts, so the ratio is visible. */
export function draw(ctx, { state, computed, w, h, ink }) {
  ctx.clearRect(0, 0, w, h);
  ctx.font = `12px ${ink.mono}`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;

  const driverTeeth = Math.max(1, Number(state.driverTeeth));
  const drivenTeeth = Math.max(1, Number(state.drivenTeeth));

  // --- layout: gears on the left, the test hill on the right ----------------
  const gearW = w * 0.6;
  const gearH = h - 56;
  const cy = gearH / 2 + 14;

  // r ∝ teeth, scaled to fit both the width (2×(r1+r2)) and the height.
  const k = Math.min(
    (gearW - 24) / 2 / (driverTeeth + drivenTeeth),
    (gearH - 16) / 2 / Math.max(driverTeeth, drivenTeeth),
  );
  const rDriver = k * driverTeeth;
  const rDriven = k * drivenTeeth;

  const span = 2 * (rDriver + rDriven);
  const x0 = 12 + (gearW - 24 - span) / 2;
  const cxDriver = x0 + rDriver;
  const cxDriven = cxDriver + rDriver + rDriven;

  // Phase comes from the motor slider, not from a clock: the gears turn when
  // the learner turns them, and the same state always draws the same frame.
  const phase = (Number(state.motorRpm) / 600) * Math.PI;

  drawGear(ctx, ink, cxDriver, cy, rDriver, driverTeeth, phase, ink.led, `${driverTeeth}T`);
  drawGear(ctx, ink, cxDriven, cy, rDriven, drivenTeeth, -phase * (driverTeeth / drivenTeeth), ink.card, `${drivenTeeth}T`);

  ctx.fillStyle = ink.soft;
  ctx.textAlign = 'center';
  ctx.fillText('motor', cxDriver, h - 26);
  ctx.fillText('wheel', cxDriven, h - 26);
  ctx.fillStyle = ink.ink;
  ctx.fillText(`${computed.ratioLabel}`, (cxDriver + cxDriven) / 2, h - 8);

  // --- the test hill --------------------------------------------------------
  const hx0 = w * 0.64;
  const hx1 = w - 14;
  const base = h - 34;
  const peak = 34;

  ctx.strokeStyle = ink.soft;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx0, base);
  ctx.lineTo(hx1, base);
  ctx.lineTo(hx1, peak);
  ctx.closePath();
  ctx.stroke();

  // The robot sits partway up when it can climb, and stuck at the foot when it
  // cannot. Same picture, opposite story — that flip is the lesson.
  const t = computed.climbs ? (computed.crawls ? 0.35 : 0.72) : 0.06;
  const rx = hx0 + (hx1 - hx0) * t;
  const ry = base - (base - peak) * t;

  ctx.fillStyle = computed.climbs ? ink.led : ink.card;
  ctx.strokeStyle = computed.climbs ? ink.ink : ink.danger;
  ctx.beginPath();
  ctx.rect(rx - 9, ry - 16, 18, 13);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = computed.climbs ? ink.ink : ink.danger;
  ctx.textAlign = 'center';
  ctx.fillText(computed.climbs ? '↗' : '✕', rx, ry - 26);

  ctx.fillStyle = ink.soft;
  ctx.fillText(`${computed.wheelSpeedCms} cm/s`, (hx0 + hx1) / 2, h - 14);
}

/** One gear: body, teeth, hub. Teeth are drawn, not implied — the learner is
 *  being asked to count them against the slider. */
function drawGear(ctx, ink, cx, cy, r, teeth, phase, fill, label) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cap the drawn teeth so a 60-tooth gear at 30 px does not turn into a blob.
  const drawn = Math.min(teeth, 28);
  const toothLen = Math.max(3, r * 0.16);
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.beginPath();
  for (let i = 0; i < drawn; i++) {
    const a = phase + (i / drawn) * Math.PI * 2;
    ctx.moveTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
    ctx.lineTo(cx + Math.cos(a) * (r + toothLen), cy + Math.sin(a) * (r + toothLen));
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(3, r * 0.18), 0, Math.PI * 2);
  ctx.fillStyle = ink.card;
  ctx.fill();
  ctx.strokeStyle = ink.soft;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = ink.ink;
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, cy + r + toothLen + 12);
}
