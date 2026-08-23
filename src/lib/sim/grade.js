// Multi-seed grading (PRD §8.6). The single most valuable debugging affordance
// in the product is "it works, except on seed 7" — exactly the shape of a real
// robotics bug. grade() runs one program across N seeded variants of a world in
// the deterministic headless core and reports which seeds passed, so a
// hard-coded path cannot survive the way it does in a single fixed arena.
//
// DOM-free: this is what runs in the grading Web Worker.

import { SimCore } from './core.js';
import { headlessDriver } from './runner.js';
import { variant } from './world.js';

/**
 * @param {(driver)=>Promise<void>} runFn  drives the robot (e.g. the interpreter)
 * @param {object} world
 * @param {object} opts { seeds, mustPass, unseen, goal, seedBase }
 *   seeds: count (default 10) or an explicit array of seed integers
 *   mustPass: seeds required to pass (default = all)
 *   unseen: draw seeds from a high offset the learner never ran (default false)
 *   goal: goal string evaluated per seed (default 'free')
 * @returns {Promise<{passed, score, mustPass, results:Array}>}
 */
export async function grade(runFn, world, opts = {}) {
  const { goal = 'free', unseen = false, seedBase = unseen ? 900000 : 1000 } = opts;
  const seedList = Array.isArray(opts.seeds)
    ? opts.seeds
    : Array.from({ length: opts.seeds ?? 10 }, (_, i) => seedBase + i);
  const mustPass = opts.mustPass ?? seedList.length;

  const results = [];
  for (const seed of seedList) {
    const core = new SimCore(variant(world, seed));
    const driver = headlessDriver(core);
    let error = null;
    try { await runFn(driver); } catch (e) { error = e?.message || String(e); }
    const verdict = evaluateGoal(core, goal);
    results.push({ seed, passed: !error && verdict.passed, metrics: verdict.metrics, failureReason: error || verdict.reason });
  }

  const passedCount = results.filter((r) => r.passed).length;
  return { passed: passedCount >= mustPass, score: passedCount / seedList.length, mustPass, passedCount, results };
}

/**
 * Evaluate a goal against a finished core run. Covers the existing goal types
 * plus the new scored ones (PRD §8.5). Returns { passed, reason, metrics }.
 */
export function evaluateGoal(core, goal = 'free') {
  const metrics = {
    steps: core.steps, blinkCount: core.blinkCount, bumped: core.bumped,
    reachedTarget: core.reachedTarget, visited: core.visited.size,
    lineAccuracy: +core.lineAccuracy.toFixed(4), distanceFromStart: +core.distanceFromStart.toFixed(4),
    distance: core.readDistance(), corners: core.trailCorners(),
  };
  const ok = (passed, reason = '') => ({ passed, reason, metrics });

  if (goal === 'free') return ok(true);
  if (goal === 'reach-target') return ok(core.reachedTarget, 'target not reached');
  if (goal === 'near-wall') return ok(!core.bumped && core.readDistance() < 1.2, core.bumped ? 'bumped the wall' : 'not close enough');
  if (goal === 'visit-all') return ok(core.allVisited && !core.bumped, core.bumped ? 'bumped a wall' : 'not all pads visited');
  if (goal === 'follow-line') return ok(core.reachedTarget && core.lineAccuracy > 0.75, 'did not follow line to the end');

  if (goal.startsWith('blink:')) {
    const n = Number(goal.split(':')[1]);
    return ok(core.blinkCount >= n, `blinked ${core.blinkCount}/${n}`);
  }
  if (goal.startsWith('draw-')) {
    const want = Number(goal.split('-')[1]);
    const c = metrics.corners;
    return ok(c >= want - 1 && c <= want + 1 && core.distanceFromStart < 0.6, `drew ${c} corners`);
  }
  if (goal.startsWith('survive:')) {
    // survived N simulated seconds without a collision (ticks accumulate at 60/s)
    return ok(!core.bumped, 'collided');
  }
  if (goal.startsWith('return-to-start:')) {
    const tol = Number(goal.split(':')[1]);
    return ok(core.distanceFromStart <= tol, `ended ${metrics.distanceFromStart} from start (tol ${tol})`);
  }
  if (goal.startsWith('metric:')) {
    // metric:NAME:OP:VALUE  e.g. metric:lineAccuracy:>=:0.85
    const [, name, op, valStr] = goal.split(':');
    const val = Number(valStr);
    const actual = metrics[name];
    const cmp = { '>=': actual >= val, '<=': actual <= val, '>': actual > val, '<': actual < val, '==': actual === val };
    return ok(!!cmp[op], `${name}=${actual} not ${op} ${val}`);
  }
  return ok(false, `unknown goal: ${goal}`);
}
