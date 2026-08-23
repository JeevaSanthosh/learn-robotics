// Tests for deterministic multi-seed grading (PRD §8.1, §8.6). These are the
// runtime backing for C-SIM-DET (same program + seed => identical metrics) and
// the aggregation logic that turns a row of seed results into a pass/fail.
import { grade, evaluateGoal } from '../src/lib/sim/grade.js';
import { SimCore } from '../src/lib/sim/core.js';
import { headlessDriver } from '../src/lib/sim/runner.js';
import { variant } from '../src/lib/sim/world.js';

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

const openWorld = { id: 'm1-open', size: { w: 360, h: 300 }, start: { x: 60, y: 240, heading: -90 }, target: { x: 300, y: 60, r: 26 } };
const jitterWorld = { ...openWorld, id: 'jit', walls: [{ x: 120, y: 120, w: 120, h: 16 }], variation: { wallJitter: 20, targetJitter: 24 } };

// A program that drives up, turns right, and crosses to the target.
const reachProgram = async (r) => { await r.moveForward(3); await r.turn(90); await r.moveForward(4); };
const idleProgram = async () => {};
// A long-running program for the performance budget (~60 simulated seconds).
const longProgram = async (r) => { for (let i = 0; i < 30; i++) { await r.moveForward(2); await r.turn(90); } };

// ---------------------------------------------------------- determinism (C-SIM-DET)
{
  const metricsOf = () => {
    const core = new SimCore(variant(openWorld, 42));
    return reachProgram(headlessDriver(core)).then(() => JSON.stringify(evaluateGoal(core, 'reach-target').metrics));
  };
  const first = await metricsOf();
  let identical = true;
  for (let i = 0; i < 100; i++) if (await metricsOf() !== first) identical = false;
  t('G1 same program + same seed gives identical metrics across 100 runs', identical);
}

// ---------------------------------------------------------- aggregation
{
  const good = await grade(reachProgram, openWorld, { seeds: 5, goal: 'reach-target' });
  t('G2 a solving program passes every seed', good.passed && good.passedCount === 5, JSON.stringify(good.score));
  t('G3 results carry one entry per seed with the expected shape',
    good.results.length === 5 && good.results.every((r) => typeof r.passed === 'boolean' && 'metrics' in r && 'seed' in r));

  const bad = await grade(idleProgram, openWorld, { seeds: 5, goal: 'reach-target' });
  t('G4 a program that does nothing fails every seed', !bad.passed && bad.passedCount === 0);

  const partial = await grade(reachProgram, openWorld, { seeds: 5, mustPass: 3, goal: 'reach-target' });
  t('G5 passed reflects the mustPass threshold', partial.passed === (partial.passedCount >= 3));
}

// ---------------------------------------------------------- seeds really vary
{
  // A path that crosses the jittered wall row, so where it bumps depends on the
  // seed — the whole point of seeded variants (a fixed open-loop path that never
  // touches the variation would, correctly, look identical across seeds).
  const crosser = async (r) => { await r.moveForward(2); await r.turn(90); await r.moveForward(6); };
  const a = new SimCore(variant(jitterWorld, 1));
  const b = new SimCore(variant(jitterWorld, 2));
  await crosser(headlessDriver(a));
  await crosser(headlessDriver(b));
  const ma = JSON.stringify(evaluateGoal(a, 'free').metrics);
  const mb = JSON.stringify(evaluateGoal(b, 'free').metrics);
  t('G6 different seeds of a varying world produce different runs', ma !== mb, `${ma} vs ${mb}`);
}

// ---------------------------------------------------------- goal types
{
  const core = new SimCore(openWorld);
  await reachProgram(headlessDriver(core));
  t('G7 return-to-start fails for a one-way trip', !evaluateGoal(core, 'return-to-start:0.5').passed);
  t('G8 metric goal parses and compares', evaluateGoal(core, 'metric:steps:>=:1').passed);
  t('G9 survive goal passes when no collision occurred', evaluateGoal(core, 'survive:5').passed === !core.bumped);
}

// ---------------------------------------------------------- performance (C-SIM-PERF sanity)
{
  const start = Date.now();
  await grade(longProgram, openWorld, { seeds: 10, goal: 'free' });
  const ms = Date.now() - start;
  t('G10 10 seeds of a long program finish well under the 3s budget', ms < 3000, `${ms}ms`);
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} grade test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} grading tests pass`);
