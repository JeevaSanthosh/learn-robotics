// The dedicated test suite for the MicroPython-subset parser + runner (PRD §8.7,
// Phase 5 exit). It checks two things a learner depends on: that valid programs
// parse and RUN the robot correctly, and that broken programs report a line and
// column (M6.4 teaches reading exactly those errors). No eval anywhere.
import { parse, tokenize, PyError } from '../src/lib/pyparse.js';
import { runPython, RuntimeError } from '../src/lib/pyrun.js';

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

// A mock driver that records calls; distance/line are settable.
function mock({ distances = [], line = false } = {}) {
  const calls = [];
  let di = 0;
  return {
    calls, stopped: false,
    moveForward: (n) => { calls.push(['move', n]); return Promise.resolve(); },
    turn: (d) => { calls.push(['turn', d]); return Promise.resolve(); },
    setLed: (b) => { calls.push(['led', b]); return Promise.resolve(); },
    setPen: (b) => { calls.push(['pen', b]); return Promise.resolve(); },
    setSpeed: (v) => { calls.push(['speed', v]); return Promise.resolve(); },
    wait: (s) => { calls.push(['wait', s]); return Promise.resolve(); },
    readDistance: () => (di < distances.length ? distances[di++] : 99),
    readLine: () => line,
  };
}
const run = async (src, opts) => { const d = mock(opts); await runPython(parse(src), d); return d.calls; };
const moves = (calls) => calls.filter((c) => c[0] === 'move').map((c) => c[1]);

// ---------------------------------------------------------------- basics
{
  const c = await run('robot.move_forward(3)\nrobot.turn_right()\n');
  t('PY1 a statement drives the robot', c[0][0] === 'move' && c[0][1] === 3);
  t('PY2 turn_right maps to +90', c[1][0] === 'turn' && c[1][1] === 90);
  t('PY3 turn_left maps to -90', (await run('robot.turn_left()'))[0][1] === -90);
  t('PY4 led + pen + speed + sleep map through',
    JSON.stringify(await run('robot.led_on()\nrobot.pen(True)\nrobot.set_speed(2)\ntime.sleep(1)')) ===
    JSON.stringify([['led', true], ['pen', true], ['speed', 2], ['wait', 1]]));
}

// ---------------------------------------------------------------- loops
{
  t('PY5 for-range repeats the body', moves(await run('for i in range(4):\n    robot.move_forward(1)\n')).length === 4);
  t('PY6 for binds the loop variable', JSON.stringify(moves(await run('for i in range(3):\n    robot.move_forward(i)\n'))) === '[0,1,2]');
  t('PY7 range(a, b) works', JSON.stringify(moves(await run('for i in range(2, 5):\n    robot.move_forward(i)\n'))) === '[2,3,4]');
  const w = await run('while robot.read_distance() > 2:\n    robot.move_forward(1)\n', { distances: [5, 4, 3, 2] });
  t('PY8 while loops until the sensor condition flips', moves(w).length === 3, `${moves(w).length}`);
}

// ---------------------------------------------------------------- decisions
{
  const prog = 'if robot.read_distance() < 2:\n    robot.led_on()\nelse:\n    robot.move_forward(1)\n';
  t('PY9 if-branch taken', (await run(prog, { distances: [1] }))[0][0] === 'led');
  t('PY10 else-branch taken', (await run(prog, { distances: [9] }))[0][0] === 'move');
  const el = 'x = 2\nif x == 1:\n    robot.move_forward(1)\nelif x == 2:\n    robot.move_forward(2)\nelse:\n    robot.move_forward(3)\n';
  t('PY11 elif chain', moves(await run(el))[0] === 2);
}

// ---------------------------------------------------------------- vars, math, lists
{
  t('PY12 variables + arithmetic', moves(await run('n = 2 + 3 * 2\nrobot.move_forward(n)'))[0] === 8);
  t('PY13 lists and indexing', moves(await run('xs = [3, 5, 7]\nrobot.move_forward(xs[1])'))[0] === 5);
  t('PY14 negative index', moves(await run('xs = [3, 5, 7]\nrobot.move_forward(xs[-1])'))[0] === 7);
  t('PY15 comparison + boolean', moves(await run('if 3 > 2 and not 1 > 5:\n    robot.move_forward(1)')).length === 1);
}

// ---------------------------------------------------------------- functions
{
  const fn = 'def square(x):\n    return x * x\nrobot.move_forward(square(3))\n';
  t('PY16 def with a positional arg + return', moves(await run(fn))[0] === 9);
  const two = 'def add(a, b):\n    return a + b\nrobot.move_forward(add(2, 5))\n';
  t('PY17 multiple args', moves(await run(two))[0] === 7);
  const noret = 'def wiggle():\n    robot.turn_left()\n    robot.turn_right()\nwiggle()\nwiggle()\n';
  t('PY18 calling a no-arg helper twice', (await run(noret)).filter((c) => c[0] === 'turn').length === 4);
}

// ---------------------------------------------------------------- comments & blanks
{
  t('PY19 comments and blank lines are ignored',
    moves(await run('# drive up\n\nrobot.move_forward(2)   # go\n\n')).length === 1);
}

// ---------------------------------------------------------------- error reporting
{
  const err = (src) => { try { parse(src); return null; } catch (e) { return e; } };
  const e1 = err('robot.move_forward(\n');
  t('PY20 unclosed call is a SyntaxError with a line', e1 instanceof PyError && e1.line >= 1);
  const e2 = err('if x > 1\n    robot.move_forward(1)\n'); // missing colon
  t('PY21 missing colon reports a column', e2 instanceof PyError && e2.col >= 1, e2 && `${e2.line}:${e2.col}`);
  const e3 = err('robot.move_forward(1)\n   robot.turn_left()\n'); // bad indent
  t('PY22 inconsistent indentation is caught', e3 instanceof PyError);
  // runtime: undefined name
  let rte = null;
  try { await run('robot.move_forward(nope)\n'); } catch (e) { rte = e; }
  t('PY23 an undefined variable is a runtime error with a line', rte instanceof RuntimeError && rte.line >= 1);
  // runtime: infinite loop hits the op budget
  let inf = null;
  try { await run('while 1 == 1:\n    x = 1\n'); } catch (e) { inf = e; }
  t('PY24 an infinite loop is stopped by the op budget', inf instanceof RuntimeError);
}

// ---------------------------------------------------------------- no eval
{
  const src = (await import('node:fs/promises')).readFile;
  const p = await src(new URL('../src/lib/pyparse.js', import.meta.url), 'utf8');
  const r = await src(new URL('../src/lib/pyrun.js', import.meta.url), 'utf8');
  const clean = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  t('PY25 the parser/runner contain no eval or new Function',
    !/\beval\s*\(|new\s+Function\s*\(/.test(clean(p) + clean(r)));
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} pyparse test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} MicroPython parser/runner tests pass`);
