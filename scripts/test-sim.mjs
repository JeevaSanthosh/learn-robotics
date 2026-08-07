// Behavioural tests for the simulator's goal-critical capabilities:
// waypoints, line following, pen drawing / corner counting, wall collision,
// and step counting. These decide whether a lesson is passed, so a silent
// error here means the site tells a learner they succeeded when they didn't.
//
// sim.js needs a canvas and rAF; both are stubbed rather than pulled in via a
// full DOM, because the maths is what's under test, not the rendering.
const calls = [];
const ctxStub = new Proxy({}, {
  get: (_, k) => (k === 'canvas' ? null : (...a) => calls.push([k, ...a])),
  set: () => true,
});
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.document = { documentElement: {} };

const { RobotSim } = await import('../src/lib/sim.js');

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

function makeSim(opts = {}) {
  const canvas = { width: 360, height: 300, getContext: () => ctxStub };
  return new RobotSim(canvas, opts);
}

// --------------------------------------------------------------- movement
{
  const sim = makeSim();
  sim.reset();
  const x0 = sim.x, y0 = sim.y;
  await sim.moveForward(2);
  t('S1 moving forward changes position', sim.x !== x0 || sim.y !== y0);
  t('S2 default heading is "up" (y decreases)', sim.y < y0, `y went ${y0} -> ${sim.y}`);
  t('S3 steps are counted for efficiency goals', sim.steps > 0);

  const sim2 = makeSim();
  sim2.reset();
  await sim2.turn(90);
  const before = { x: sim2.x, y: sim2.y };
  await sim2.moveForward(1);
  t('S4 turning 90° then moving changes the other axis',
    Math.abs(sim2.x - before.x) > Math.abs(sim2.y - before.y));
}

// -------------------------------------------------------------- collision
{
  // wall directly above the start position
  const sim = makeSim({ walls: [{ x: 0, y: 100, w: 360, h: 16 }] });
  sim.reset();
  await sim.moveForward(10);
  t('S5 the robot stops at a wall instead of passing through', sim.bumped);
  t('S6 a bump leaves the robot outside the wall', sim.y > 116 - 30);
}

// -------------------------------------------------------------- waypoints
{
  const sim = makeSim({ waypoints: [{ x: 60, y: 180, r: 30 }, { x: 60, y: 60, r: 30 }] });
  sim.reset();
  t('S7 allVisited is false at the start', sim.allVisited === false);
  await sim.moveForward(1);
  t('S8 passing through a pad marks it visited', sim.visited.size >= 1, `visited ${sim.visited.size}`);
  await sim.moveForward(3);
  t('S9 visiting every pad sets allVisited', sim.allVisited === true, `visited ${sim.visited.size}/2`);

  // an empty waypoint list must NOT count as "all visited" — otherwise every
  // visit-all lesson would pass instantly with an empty program
  const none = makeSim({ waypoints: [] });
  none.reset();
  t('S10 no waypoints does not count as complete', none.allVisited === false);
}

// ------------------------------------------------------------------- line
{
  const sim = makeSim({ line: [{ x1: 60, y1: 240, x2: 60, y2: 60 }] });
  sim.reset();
  t('S11 robot starts on the line track', sim.readLine() === true);
  t('S12 accuracy is 0 before moving', sim.lineAccuracy === 0);
  await sim.moveForward(2);
  t('S13 staying on the line gives high accuracy', sim.lineAccuracy > 0.9, `got ${sim.lineAccuracy.toFixed(2)}`);

  const off = makeSim({ line: [{ x1: 300, y1: 240, x2: 300, y2: 60 }] });
  off.reset();
  t('S14 robot away from the track reads off-line', off.readLine() === false);
  await off.moveForward(2);
  t('S15 driving off-track gives low accuracy', off.lineAccuracy < 0.2, `got ${off.lineAccuracy.toFixed(2)}`);
}

// --------------------------------------------------------------- pen/shape
{
  const sim = makeSim();
  sim.reset();
  await sim.setPen(true);
  for (let i = 0; i < 4; i++) { await sim.moveForward(2); await sim.turn(90); }
  const corners = sim.trailCorners();
  t('S16 pen down records a trail', sim.trail.flat().length > 0);
  t('S17 a square is detected as roughly 4 corners', corners >= 3 && corners <= 5, `counted ${corners}`);
  t('S18 a closed shape ends near where it started', sim.distanceFromStart < 0.6,
    `off by ${sim.distanceFromStart.toFixed(2)}`);

  const straight = makeSim();
  straight.reset();
  await straight.setPen(true);
  await straight.moveForward(3);
  t('S19 a straight line has no corners', straight.trailCorners() === 0);

  const penUp = makeSim();
  penUp.reset();
  await penUp.moveForward(3);
  t('S20 pen up draws nothing', penUp.trail.flat().length === 0);
}

// ------------------------------------------------------------------ misc
{
  const sim = makeSim();
  sim.reset();
  sim.setSpeed(99);
  t('S21 speed is clamped to a sane range', sim.speed <= 3 && sim.speed >= 0.5, `got ${sim.speed}`);
  sim.setSpeed('nonsense');
  t('S22 a bad speed value does not produce NaN', Number.isFinite(sim.speed));

  await sim.setLed(true);
  await sim.setLed(false);
  await sim.setLed(true);
  t('S23 blinks are counted on state change', sim.blinkCount >= 2, `counted ${sim.blinkCount}`);

  sim.reset();
  t('S24 reset clears blink count', sim.blinkCount === 0);
  t('S25 reset clears the bump flag', sim.bumped === false);
  t('S26 reset clears visited pads', sim.visited.size === 0);
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} simulator test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} simulator tests pass`);
