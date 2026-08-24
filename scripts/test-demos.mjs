// Tests the ConceptDemo contract (PRD-UX §7.1, C-DEMO-A11Y / C-CONCEPT-VISUAL).
//
// The whole point of splitting compute() from draw() is that the PHYSICS is
// testable without a canvas. A demo whose numbers cannot be asserted here is a
// toy, not an explainer — so this file is the gate on adding one.
import { DEMOS } from '../src/lib/demos/index.js';

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);
const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

const ids = Object.keys(DEMOS);
t('D0 at least one demo is registered', ids.length >= 1);

// ---------------------------------------------------------------- contract --
for (const id of ids) {
  const d = DEMOS[id];
  const n = (s) => `D:${id} ${s}`;

  t(n('exports id/title'), typeof d.id === 'string' && typeof d.title === 'string');
  t(n('id matches its registry key'), d.id === id, `registered as "${id}" but exports id "${d.id}"`);
  t(n('has at least one control (manipulable)'), Array.isArray(d.controls) && d.controls.length >= 1);
  t(n('has at least one readout (instrumented)'), Array.isArray(d.readouts) && d.readouts.length >= 1);
  t(n('exports compute() and draw()'), typeof d.compute === 'function' && typeof d.draw === 'function');

  const defaults = Object.fromEntries(d.controls.map((c) => [c.key, c.value]));

  for (const c of d.controls) {
    t(n(`control "${c.key}" has a label and a default`), !!c.label && c.value !== undefined);
    if (c.type !== 'toggle') {
      const ranged = [c.min, c.max, c.step].every((v) => typeof v === 'number');
      t(n(`control "${c.key}" declares min/max/step`), ranged);
      t(n(`control "${c.key}" default is inside its range`), c.value >= c.min && c.value <= c.max,
        `${c.value} not in [${c.min}, ${c.max}]`);
    }
  }

  // Every declared readout must actually be produced, or the panel renders "—".
  const out = d.compute(defaults);
  for (const r of d.readouts) {
    t(n(`compute() returns declared readout "${r.key}"`), out[r.key] !== undefined);
  }

  // PURITY. Determinism is the property that makes the demo trustworthy: the
  // same state must always draw the same frame, with no Date or Math.random.
  const a = JSON.stringify(d.compute(defaults));
  const b = JSON.stringify(d.compute(defaults));
  t(n('compute() is deterministic across calls'), a === b);

  const frozen = { ...defaults };
  d.compute(frozen);
  t(n('compute() does not mutate its input state'), JSON.stringify(frozen) === JSON.stringify(defaults));

  // draw() must survive being called — a stub ctx catches typos and missing
  // guards without needing a real canvas.
  const stubCtx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return { width: 420, height: 260 };
      return () => ({ addColorStop() {} });
    },
    set: () => true,
  });
  let drew = true;
  try {
    d.draw(stubCtx, { state: defaults, computed: out, w: 420, h: 260, ink: {
      ink: '#000', soft: '#666', card: '#fff', led: '#fb3', danger: '#c33', mono: 'monospace',
    } });
  } catch (e) { drew = false; t(n('draw() threw'), false, e.message); }
  t(n('draw() completes against a stub context'), drew);
}

// ------------------------------------------------------- circuit bench maths --
// Ohm's law across a red LED (Vf = 2.0 V): I = (V − Vf) ÷ R.
// These are the numbers m4-circuits teaches, so if the lesson and the demo ever
// disagree, this is where it surfaces.
const circuit = DEMOS.circuit;
if (circuit) {
  const C = (volts, ohms, resistorFitted = true) => circuit.compute({ volts, ohms, resistorFitted });

  t('C1 4.5 V through 220 Ω ≈ 11.4 mA', near(C(4.5, 220).currentMa, 11.4, 0.1),
    `got ${C(4.5, 220).currentMa}`);
  t('C2 9 V through 470 Ω ≈ 14.9 mA', near(C(9, 470).currentMa, 14.9, 0.1),
    `got ${C(9, 470).currentMa}`);

  // Below the forward voltage the LED does not conduct at all — the fact that
  // surprises every beginner, and the reason a single cell lights nothing.
  t('C3 1.5 V is under the forward voltage, so no current flows', C(1.5, 220).currentMa === 0);
  t('C4 …and the LED reads as dark, not merely dim', C(1.5, 220).verdict.includes('dark'));

  // Halving resistance roughly doubles current; the lesson's table says so.
  const r470 = C(9, 470).currentMa, r235 = C(9, 235).currentMa;
  t('C5 halving the resistance roughly doubles the current', near(r235 / r470, 2, 0.05),
    `${r470} → ${r235}`);

  // The teaching moment: pull the resistor and the LED dies.
  const pulled = C(4.5, 220, false);
  t('C6 pulling the resistor burns the LED out', pulled.burnt === true);
  t('C7 …and a burnt LED emits nothing', pulled.brightness === 0);
  t('C8 …and the explanation names the resistor as what was missing',
    circuit.explain({ volts: 4.5, ohms: 220, resistorFitted: false }, pulled).toLowerCase().includes('resistor'));

  t('C9 9 V through 47 Ω is destructive', C(9, 47).burnt === true, `${C(9, 47).currentMa} mA`);
  t('C10 a sane 4.5 V / 220 Ω circuit is NOT destructive', C(4.5, 220).burnt === false);
  t('C11 brightness is normalised to 0..1', [C(4.5, 220), C(3, 220), C(9, 1000)]
    .every((c) => c.brightness >= 0 && c.brightness <= 1));

  // Monotonicity: more push must never mean less flow. Cheap property test that
  // catches a sign error no single example would.
  let monotonic = true;
  for (let v = 2.5; v <= 9; v += 0.5) {
    if (C(v, 220).currentMa < C(v - 0.5, 220).currentMa) monotonic = false;
  }
  t('C12 current rises monotonically with voltage', monotonic);
}

// ------------------------------------------------------------ gear dial ----
// The lesson's claim is that gears trade speed for strength. These assertions
// are that claim, written as numbers — if the demo and m4-motors-gears ever
// drift apart, this is where it shows.
const gears = DEMOS.gears;
if (gears) {
  const G = (driverTeeth, drivenTeeth, motorRpm = 200) =>
    gears.compute({ driverTeeth, drivenTeeth, motorRpm });

  const down = G(10, 40); // small driver into big driven = gearing DOWN
  t('G1 10 teeth into 40 teeth is 4:1', down.ratio === 4 && down.ratioLabel === '4:1');
  t('G2 …so the wheel turns 4× slower', down.outputRpm === 50, `got ${down.outputRpm} from 200`);
  t('G3 …with 4× the torque', down.torqueMult === 4);

  const up = G(40, 10); // reversed
  t('G4 reversing the gears gives 1:4', up.ratio === 0.25 && up.ratioLabel === '1:4');
  t('G5 …four times faster', up.outputRpm === 800);
  t('G6 …and a quarter of the strength', up.torqueMult === 0.25);

  const flat = G(20, 20);
  t('G7 equal gears change nothing', flat.ratio === 1 && flat.outputRpm === 200 && flat.torqueMult === 1);

  // THE teaching moment: the same motor either climbs or stalls depending
  // only on how it is geared. If this stops flipping, the demo stops teaching.
  t('G8 geared down, it climbs the hill', down.climbs === true);
  t('G9 geared up, the same motor stalls', up.climbs === false);
  t('G10 the verdict flips between the two', down.verdict !== up.verdict);

  // Gears move the balance; they do not create anything. Ideal-gear power is
  // invariant, which is the honest limit of the metaphor.
  t('G11 speed × torque is unchanged by gearing', near(down.power, up.power, 0.01),
    `${down.power} vs ${up.power}`);

  // The third verdict state: heavy reduction on a SLOW motor climbs anything
  // and gets nowhere. Reduction alone is not enough to crawl — at 200 RPM a
  // 7.5:1 wheel still does ~9 cm/s — which is itself the point worth teaching:
  // the trade-off is set by gearing AND motor speed together, not gearing alone.
  const strongSlow = G(8, 60, 60);
  t('G12 heavy reduction on a slow motor climbs but crawls',
    strongSlow.climbs === true && strongSlow.crawls === true,
    `climbs=${strongSlow.climbs} crawls=${strongSlow.crawls} speed=${strongSlow.wheelSpeedCms}`);
  t('G13 …and the verdict says so', /crawl/i.test(strongSlow.verdict), strongSlow.verdict);
  t('G14 the same gearing on a fast motor does NOT crawl', G(8, 60, 200).crawls === false);
}

// ------------------------------------------------------- sense-decide-act ---
// m1-meet claims sense→decide→act is "the whole secret of robotics". The demo
// has to make the DECIDE stage visibly flip, or the claim stays words.
const loop = DEMOS.loop;
if (loop) {
  const L = (step, gap, threshold = 10) => loop.compute({ step, gap, threshold });

  t('L1 the three stages are named in order',
    [L(0, 22).stageName, L(1, 22).stageName, L(2, 22).stageName].join(',') === 'SENSE,DECIDE,ACT');
  t('L2 each stage lights a different subsystem',
    new Set([L(0, 22).lit, L(1, 22).lit, L(2, 22).lit]).size === 3);

  // The decision is one comparison, and it must flip around the threshold.
  t('L3 a far wall reads as clear', L(1, 30, 10).clear === true);
  t('L4 a near wall reads as blocked', L(1, 5, 10).clear === false);
  t('L5 exactly at the threshold is NOT clear (> not >=)', L(1, 10, 10).clear === false);
  t('L6 one cm past it is clear', L(1, 11, 10).clear === true);

  // What the robot DOES follows from that one comparison.
  t('L7 clear means it drives', /driving/.test(L(2, 30, 10).happening));
  t('L8 blocked means it stops', /stopping/.test(L(2, 5, 10).happening));
  t('L9 the decide stage shows the actual numbers being compared',
    L(1, 22, 10).happening.includes('22') && L(1, 22, 10).happening.includes('10'));

  // Steps are clamped, so a stray value can never blank the readouts.
  t('L10 step is clamped to 0..2', L(9, 22).step === 2 && L(-3, 22).step === 0);
  t('L11 explain() says something different on each stage',
    new Set([0, 1, 2].map((s) => loop.explain({}, L(s, 22)))).size === 3);
}

// ------------------------------------------------------ polling vs event ---
// m5-events claims you must "poll for things that drift, use events for things
// that happen". The claim is a TIMING claim, so these assert the timing.
const polling = DEMOS.polling;
if (polling) {
  const P = (checkEvery, useInterrupt = false, speed = 30) =>
    polling.compute({ speed, checkEvery, useInterrupt });

  // A knock lasts 40 ms. Look less often than that and it can fall in the gap.
  t('P1 checking every 20 ms catches a 40 ms knock', P(20).missed === false);
  t('P2 checking every 50 ms can miss it entirely', P(50).missed === true);
  t('P3 the boundary is the length of the knock itself', P(40).missed === false && P(45).missed === true);

  // An interrupt cannot miss it, at any polling interval.
  t('P4 an interrupt catches it however slow the loop is', P(200, true).missed === false);
  t('P5 …and reacts in about a millisecond', P(200, true).latencyMs <= 2);

  // The cost side of the trade, which is why you do not just interrupt everything.
  t('P6 polling costs checks every second', P(50).checksPerSecond === 20);
  t('P7 checking twice as often doubles the cost', P(25).checksPerSecond === 40);
  t('P8 an interrupt costs nothing until it fires', P(50, true).checksPerSecond === 0);

  // Latency is distance when the robot is moving — the reason this matters.
  t('P9 a faster robot travels further before it notices',
    P(20, false, 60).overshootCm > P(20, false, 10).overshootCm);
  t('P10 30 cm/s with a 20 ms gap is 0.6 cm of travel', near(P(20).overshootCm, 0.6, 0.05),
    `got ${P(20).overshootCm}`);

  t('P11 a missed knock reports as missed, not as zero overshoot', P(50).verdict.includes('missed'));
  t('P12 explain() differs across missed / polled / interrupt',
    new Set([P(50), P(20), P(20, true)].map((c) => polling.explain({}, c))).size === 3);
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} demo test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} concept-demo tests pass`);
