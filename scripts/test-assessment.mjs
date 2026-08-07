// The assessment generator makes two strong promises — every answer key is
// correct, and questions don't repeat. Both are testable, so they're tested.
import { pickQuestions, traceProgram, makeRng, DIFFICULTIES, templateCount, TOPICS } from '../src/lib/assessment.js';

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

// --- structural integrity, across a lot of generated questions -------------
{
  let bad = [];
  for (const d of DIFFICULTIES) {
    for (let i = 0; i < 400; i++) {
      for (const q of pickQuestions(d, 5)) {
        if (typeof q.q !== 'string' || !q.q.trim()) bad.push(`${q.templateId}: empty prompt`);
        if (!Array.isArray(q.options) || q.options.length < 3) bad.push(`${q.templateId}: <3 options`);
        if (new Set(q.options).size !== q.options.length) bad.push(`${q.templateId}: duplicate options (${q.options.join(' | ')})`);
        if (!(q.answer >= 0 && q.answer < q.options.length)) bad.push(`${q.templateId}: answer index out of range`);
        if (!q.why || !q.why.trim()) bad.push(`${q.templateId}: no explanation`);
        if (q.difficulty !== d) bad.push(`${q.templateId}: difficulty mismatch`);
        if (!TOPICS.includes(q.topic)) bad.push(`${q.templateId}: unknown topic`);
        if (q.options.some((o) => o == null || String(o).includes('undefined') || String(o).includes('NaN')))
          bad.push(`${q.templateId}: bad option text (${q.options.join(' | ')})`);
      }
    }
  }
  t('A1 6000 generated questions are all well-formed', bad.length === 0, [...new Set(bad)].slice(0, 3).join(' ; '));
}

// --- the answer key must be computed, not asserted -------------------------
{
  // independent re-implementation of the walk, to catch a generator that
  // agrees with itself but not with reality
  const step = { north: [0, 1], east: [1, 0], south: [0, -1], west: [-1, 0] };
  const dirs = ['north', 'east', 'south', 'west'];
  function walk(prog) {
    let x = 0, y = 0, d = 'north';
    for (const s of prog) {
      if (s.op === 'move') { x += step[d][0] * s.n; y += step[d][1] * s.n; }
      else d = s.dir === 'right' ? dirs[(dirs.indexOf(d) + 1) % 4] : dirs[(dirs.indexOf(d) + 3) % 4];
    }
    return `(${x}, ${y}) facing ${d}`;
  }
  const cases = [
    [[{ op: 'move', n: 3 }], '(0, 3) facing north'],
    [[{ op: 'turn', dir: 'right' }, { op: 'move', n: 2 }], '(2, 0) facing east'],
    [[{ op: 'turn', dir: 'left' }, { op: 'move', n: 2 }], '(-2, 0) facing west'],
    [[{ op: 'move', n: 1 }, { op: 'turn', dir: 'right' }, { op: 'move', n: 1 }], '(1, 1) facing east'],
    [[{ op: 'turn', dir: 'right' }, { op: 'turn', dir: 'right' }, { op: 'move', n: 4 }], '(0, -4) facing south'],
  ];
  let ok = true;
  for (const [prog, expected] of cases) {
    const got = traceProgram({ x: 0, y: 0, dir: 'north' }, prog);
    const s = `(${got.x}, ${got.y}) facing ${got.dir}`;
    if (s !== expected || walk(prog) !== expected) ok = false;
  }
  t('A2 the robot trace matches an independent implementation', ok);

  // and the trace questions' stated answer must equal the traced result
  let mismatches = 0;
  for (let i = 0; i < 500; i++) {
    for (const q of pickQuestions('medium', 5).concat(pickQuestions('hard', 5))) {
      if (q.templateId !== 'trace-2' && q.templateId !== 'trace-loop') continue;
      const m = q.q.match(/move (\d+), turn (right|left), move (\d+)/);
      if (m) {
        const expect = walk([{ op: 'move', n: +m[1] }, { op: 'turn', dir: m[2] }, { op: 'move', n: +m[3] }]);
        if (q.options[q.answer] !== expect) mismatches++;
      }
      const l = q.q.match(/Repeat (\d+) times: \[ move (\d+), turn (right|left) \]/);
      if (l) {
        const body = [{ op: 'move', n: +l[2] }, { op: 'turn', dir: l[3] }];
        const expect = walk(Array.from({ length: +l[1] }, () => body).flat());
        if (q.options[q.answer] !== expect) mismatches++;
      }
    }
  }
  t('A3 every trace question\'s key equals the simulated outcome', mismatches === 0, `${mismatches} mismatched`);
}

// --- arithmetic templates: check the maths, don't trust it -----------------
{
  let wrong = 0, checked = 0;
  for (let i = 0; i < 800; i++) {
    for (const q of pickQuestions('medium', 5)) {
      if (q.templateId === 'loop-count') {
        const m = q.q.match(/runs (\d+) times.*?are (\d+) "move/);
        checked++;
        if (q.options[q.answer] !== String(+m[1] * +m[2])) wrong++;
      }
      if (q.templateId === 'gear-ratio') {
        const m = q.q.match(/A (\d+)-tooth gear drives a (\d+)-tooth/);
        checked++;
        const r = +m[2] / +m[1];
        if (!q.options[q.answer].startsWith(`${r.toFixed(r % 1 ? 1 : 0)}× slower`)) wrong++;
      }
      if (q.templateId === 'ohm-intuition') {
        const m = q.q.match(/(\d+)V supply and a (\d+)Ω/);
        checked++;
        if (q.options[q.answer] !== `about ${Math.round((+m[1] / +m[2]) * 1000)} mA`) wrong++;
      }
    }
  }
  t('A4 arithmetic answer keys are correct', wrong === 0 && checked > 100, `${wrong}/${checked} wrong`);
}

// --- uniqueness -------------------------------------------------------------
{
  const seen = new Set();
  for (let i = 0; i < 300; i++) for (const q of pickQuestions('medium', 5)) seen.add(q.q);
  t('A5 medium questions vary a lot across attempts', seen.size > 40, `only ${seen.size} distinct prompts`);

  // no template repeated inside a single attempt (while templates allow it)
  let repeats = 0;
  for (let i = 0; i < 300; i++) {
    const ids = pickQuestions('hard', 5).map((q) => q.templateId);
    if (new Set(ids).size !== ids.length && templateCount('hard') >= 5) repeats++;
  }
  t('A6 no template repeats within one attempt', repeats === 0, `${repeats} attempts had repeats`);

  // answer position must not be predictable — a learner who always picks B
  // should not beat chance
  const counts = [0, 0, 0, 0];
  let total = 0;
  for (let i = 0; i < 1200; i++)
    for (const q of pickQuestions('easy', 5)) { counts[q.answer]++; total++; }
  const maxShare = Math.max(...counts.filter((_, i) => i < 4)) / total;
  t('A7 correct answer position is not predictable', maxShare < 0.45, `most common slot holds ${(maxShare * 100).toFixed(1)}%`);
}

// --- determinism when seeded (so an attempt could be replayed) --------------
{
  const a = pickQuestions('hard', 5, 12345).map((q) => q.q + q.answer).join('|');
  const b = pickQuestions('hard', 5, 12345).map((q) => q.q + q.answer).join('|');
  const c = pickQuestions('hard', 5, 999).map((q) => q.q + q.answer).join('|');
  t('A8 same seed reproduces the same paper', a === b);
  t('A9 different seed gives a different paper', a !== c);
  t('A10 rng is a real generator, not a constant', new Set(Array.from({ length: 20 }, makeRng(7))).size > 1);
}

// --- every difficulty is actually populated --------------------------------
for (const d of DIFFICULTIES)
  t(`A11 "${d}" has enough templates for a 5-question paper`, templateCount(d) >= 5, `only ${templateCount(d)}`);

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} assessment test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} assessment generator tests pass`);
