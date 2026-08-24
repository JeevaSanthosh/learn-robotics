// Polling vs interrupt (PRD-UX §7.1). Written for m5-events, whose central
// claim is: "poll for things that change smoothly, use events for things that
// *happen*."
//
// That claim is easy to state and impossible to feel from a table, because the
// failure it describes is a TIMING failure — the robot was looking the other
// way for four hundredths of a second. So the demo lets the learner set the
// check interval and the robot's speed, then watch a knock get missed
// entirely. Missing it is the lesson; the table only names it afterwards.

/** How long a knock on a bump switch actually lasts (ms). Short, on purpose. */
const KNOCK_MS = 40;

/** An interrupt is not instant, but it is close enough that this is honest. */
const INTERRUPT_LATENCY_MS = 1;

export const id = 'polling';
export const title = 'Polling vs interrupt';

export const controls = [
  { key: 'speed', label: 'Robot speed', min: 5, max: 60, step: 5, value: 30, unit: ' cm/s' },
  { key: 'checkEvery', label: 'Check the switch every', min: 5, max: 200, step: 5, value: 50, unit: ' ms' },
  { key: 'useInterrupt', label: 'Use an interrupt instead', type: 'toggle', value: false },
];

export const readouts = [
  { key: 'verdict', label: 'The knock was' },
  { key: 'costLabel', label: 'Checks per second' },
];

export function compute(state) {
  const speed = Number(state.speed);
  const checkEvery = Number(state.checkEvery);
  const useInterrupt = !!state.useInterrupt;

  // The whole point: between two polls the robot is blind. If the gap is
  // longer than the knock, the knock can land entirely inside it.
  const missed = !useInterrupt && checkEvery > KNOCK_MS;

  const latencyMs = useInterrupt ? INTERRUPT_LATENCY_MS : checkEvery;
  // Worst-case travel before the robot even notices.
  const overshootCm = missed ? Infinity : (speed * latencyMs) / 1000;

  // Polling costs CPU whether or not anything happens; an interrupt costs
  // nothing until it fires. This is the other half of the trade.
  const checksPerSecond = useInterrupt ? 0 : Math.round(1000 / checkEvery);

  let verdict;
  if (missed) verdict = 'missed completely 😬';
  else if (useInterrupt) verdict = 'caught instantly';
  else verdict = `caught ${overshootCm.toFixed(1)} cm late`;

  return {
    missed,
    useInterrupt,
    latencyMs,
    overshootCm: missed ? -1 : Math.round(overshootCm * 10) / 10,
    checksPerSecond,
    costLabel: useInterrupt ? 'none — it waits' : String(checksPerSecond),
    verdict,
    blindGapMs: useInterrupt ? 0 : checkEvery,
  };
}

export function explain(state, computed) {
  if (computed.missed) {
    return `The knock lasts ${KNOCK_MS} ms and you only look every ${computed.blindGapMs} ms. It started and finished while the robot was busy — no amount of careful code finds it afterwards.`;
  }
  if (computed.useInterrupt) {
    return 'The hardware watches the pin itself and taps the processor on the shoulder. Nothing is spent asking, and nothing can be missed.';
  }
  return `Checking every ${computed.blindGapMs} ms catches the knock, but the robot still travels ${computed.overshootCm} cm before it reacts — and it pays ${computed.checksPerSecond} checks a second for the privilege.`;
}

export function draw(ctx, { computed, w, h, ink }) {
  ctx.clearRect(0, 0, w, h);
  ctx.font = `11px ${ink.mono}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const trackY = h * 0.5;
  const left = 30;
  const right = w - 30;
  const span = right - left;

  // --- the timeline --------------------------------------------------------
  ctx.strokeStyle = ink.soft;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, trackY);
  ctx.lineTo(right, trackY);
  ctx.stroke();

  // 250 ms of time across the width, so the check marks are countable.
  const WINDOW_MS = 250;
  const xAt = (ms) => left + (ms / WINDOW_MS) * span;

  // --- the knock, as a band ------------------------------------------------
  const knockStart = 96; // deliberately lands inside a slow poller's blind gap
  ctx.fillStyle = ink.led;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(xAt(knockStart), trackY - 30, Math.max(2, (KNOCK_MS / WINDOW_MS) * span), 24);
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink.ink;
  ctx.fillText(`knock (${KNOCK_MS} ms)`, xAt(knockStart + KNOCK_MS / 2), trackY - 42);

  // --- when the robot actually looks ---------------------------------------
  if (computed.useInterrupt) {
    ctx.strokeStyle = ink.go ?? ink.ink;
    ctx.fillStyle = ink.ink;
    const x = xAt(knockStart);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, trackY);
    ctx.lineTo(x, trackY + 22);
    ctx.stroke();
    ctx.fillText('the hardware tells it, here', Math.min(x + 6, right - 70), trackY + 34);
  } else {
    ctx.strokeStyle = ink.soft;
    ctx.lineWidth = 1.5;
    for (let t = 0; t <= WINDOW_MS; t += computed.blindGapMs) {
      const x = xAt(t);
      const insideKnock = t >= knockStart && t <= knockStart + KNOCK_MS;
      ctx.strokeStyle = insideKnock ? ink.ink : ink.soft;
      ctx.lineWidth = insideKnock ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, trackY - 6);
      ctx.lineTo(x, trackY + 14);
      ctx.stroke();
    }
    ctx.fillStyle = ink.soft;
    ctx.fillText(`looks every ${computed.blindGapMs} ms`, w / 2, trackY + 34);
  }

  // --- the verdict ---------------------------------------------------------
  ctx.fillStyle = computed.missed ? ink.danger : ink.ink;
  ctx.font = `bold 13px ${ink.mono}`;
  ctx.fillText(computed.verdict, w / 2, h - 22);
}
