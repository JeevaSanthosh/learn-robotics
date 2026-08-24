// Circuit bench — the reference implementation of the ConceptDemo contract
// (PRD-UX §7.1, catalogue row 2). Written for m4-circuits, which is today
// 674 unbroken words of prose about Ohm's law with nothing to touch.
//
// THE CONTRACT. A demo module exports:
//
//   id        string
//   title     string
//   controls  [{ key, label, min, max, step, value, unit, format? }]
//   readouts  [{ key, label, unit? }]          — what compute() returns
//   compute(state) -> { [key]: number|string } — PURE. No DOM, no Date,
//                                                no Math.random. Same state
//                                                in, same numbers out.
//   draw(ctx, { state, computed, w, h, ink })  — canvas painting only.
//
// compute() is separated from draw() so the physics is unit-testable in node
// with no canvas, exactly as sim/core.js is. If a demo's numbers cannot be
// asserted in a test, the demo is wrong.
//
// The teaching target: a learner should be able to burn out the LED, and
// should discover that the resistor is not decoration. So the interesting
// states are reachable by dragging, not described in a caption.

/** Forward voltage of a red LED — below this it simply does not conduct. */
const V_FORWARD = 2.0;

/** Rough series resistance of the wire when the resistor is pulled out (Ω). */
const R_WIRE = 1;

/** Comfortable operating current for a 5 mm LED (mA). */
const I_NOMINAL = 20;

/** Above this the die overheats — in a real circuit, in about a second (mA). */
const I_DESTRUCTIVE = 30;

export const id = 'circuit';
export const title = 'Circuit bench';

export const controls = [
  { key: 'volts', label: 'Battery', min: 1.5, max: 9, step: 0.5, value: 4.5, unit: 'V' },
  { key: 'ohms', label: 'Resistor', min: 47, max: 1000, step: 1, value: 220, unit: 'Ω' },
  { key: 'resistorFitted', label: 'Resistor fitted', type: 'toggle', value: true },
];

export const readouts = [
  { key: 'currentMa', label: 'Current', unit: 'mA' },
  { key: 'verdict', label: 'The LED' },
];

/**
 * Ohm's law across an LED in series with a resistor.
 * I = (V − Vf) ÷ R, which is the one equation the lesson teaches.
 * @param {{volts:number, ohms:number, resistorFitted:boolean}} state
 */
export function compute(state) {
  const volts = Number(state.volts);
  const ohms = Number(state.ohms);
  const r = state.resistorFitted ? Math.max(ohms, 1) : R_WIRE;

  // Below the forward voltage the LED does not conduct at all — this is why
  // a single AA cell lights nothing, which surprises every beginner.
  const headroom = volts - V_FORWARD;
  const currentA = headroom <= 0 ? 0 : headroom / r;
  const currentMa = currentA * 1000;

  const burnt = currentMa > I_DESTRUCTIVE;
  const brightness = burnt ? 0 : Math.min(currentMa / I_NOMINAL, 1);

  let verdict;
  if (burnt) verdict = 'burnt out 💥';
  else if (currentMa === 0) verdict = 'dark — not enough push';
  else if (currentMa < 2) verdict = 'barely glowing';
  else if (currentMa < I_NOMINAL * 0.9) verdict = 'lit';
  else verdict = 'bright';

  return {
    currentMa: Math.round(currentMa * 10) / 10,
    verdict,
    brightness: Math.round(brightness * 100) / 100,
    burnt,
    resistance: r,
  };
}

/** Explanation shown under the readouts — the demo says WHY, not just what. */
export function explain(state, computed) {
  if (!state.resistorFitted) {
    return 'Nothing is limiting the flow but the wire itself, so the current runs away. This is what the resistor was doing.';
  }
  if (computed.burnt) {
    return `${computed.currentMa} mA is past what the LED can survive. Raise the resistance or drop the voltage.`;
  }
  if (computed.currentMa === 0) {
    return `Under ${V_FORWARD} V the LED does not conduct at all — voltage is the push, and there isn't enough of it.`;
  }
  return `(${state.volts} − ${V_FORWARD}) ÷ ${computed.resistance} = ${(computed.currentMa / 1000).toFixed(4)} A, or about ${computed.currentMa} mA.`;
}

/** Canvas painting. No state of its own — everything comes from `computed`. */
export function draw(ctx, { state, computed, w, h, ink }) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = ink.soft;
  ctx.font = `12px ${ink.mono}`;
  ctx.textBaseline = 'middle';

  const left = 40;
  const right = w - 40;
  const top = 46;
  const bottom = h - 46;

  // --- the loop ------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.stroke();

  // --- battery (left edge) -------------------------------------------------
  const midY = (top + bottom) / 2;
  ctx.clearRect(left - 12, midY - 22, 24, 44);
  ctx.beginPath();
  ctx.moveTo(left - 11, midY - 14); ctx.lineTo(left + 11, midY - 14);
  ctx.moveTo(left - 6, midY - 5);   ctx.lineTo(left + 6, midY - 5);
  ctx.moveTo(left - 11, midY + 5);  ctx.lineTo(left + 11, midY + 5);
  ctx.moveTo(left - 6, midY + 14);  ctx.lineTo(left + 6, midY + 14);
  ctx.strokeStyle = ink.ink;
  ctx.stroke();
  ctx.fillStyle = ink.soft;
  ctx.textAlign = 'left';
  ctx.fillText(`${state.volts} V`, left + 16, midY);

  // --- resistor (top edge) -------------------------------------------------
  const rx = (left + right) / 2;
  ctx.clearRect(rx - 34, top - 12, 68, 24);
  ctx.strokeStyle = ink.ink;
  ctx.beginPath();
  if (state.resistorFitted) {
    ctx.moveTo(rx - 32, top);
    for (let i = 0; i < 6; i++) {
      ctx.lineTo(rx - 26 + i * 10, top + (i % 2 === 0 ? -9 : 9));
    }
    ctx.lineTo(rx + 32, top);
    ctx.stroke();
    ctx.fillStyle = ink.soft;
    ctx.textAlign = 'center';
    ctx.fillText(`${state.ohms} Ω`, rx, top - 22);
  } else {
    // Pulled out: draw the gap, so "there is nothing there" is visible rather
    // than merely stated.
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = ink.danger;
    ctx.moveTo(rx - 32, top);
    ctx.lineTo(rx + 32, top);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ink.danger;
    ctx.textAlign = 'center';
    ctx.fillText('no resistor', rx, top - 22);
  }

  // --- LED (right edge) ----------------------------------------------------
  const lx = right;
  const ly = midY;
  ctx.clearRect(lx - 20, ly - 20, 40, 40);

  if (computed.brightness > 0) {
    // Glow scales with current, so the slider has a visible consequence.
    const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 10 + computed.brightness * 26);
    glow.addColorStop(0, ink.led);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.25 + computed.brightness * 0.75;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 10 + computed.brightness * 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.arc(lx, ly, 9, 0, Math.PI * 2);
  ctx.fillStyle = computed.burnt
    ? ink.soft
    : computed.brightness > 0
      ? ink.led
      : ink.card;
  ctx.fill();
  ctx.strokeStyle = computed.burnt ? ink.danger : ink.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (computed.burnt) {
    ctx.strokeStyle = ink.danger;
    ctx.beginPath();
    ctx.moveTo(lx - 6, ly - 6); ctx.lineTo(lx + 6, ly + 6);
    ctx.moveTo(lx + 6, ly - 6); ctx.lineTo(lx - 6, ly + 6);
    ctx.stroke();
  }

  // --- current readout on the wire ----------------------------------------
  ctx.fillStyle = computed.burnt ? ink.danger : ink.soft;
  ctx.textAlign = 'center';
  ctx.fillText(`${computed.currentMa} mA`, (left + right) / 2, bottom + 20);
}
