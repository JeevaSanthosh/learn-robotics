// Tests for the program-review engine. The risk with an advice feature is
// that it fires on beginners who are doing fine (which teaches them to ignore
// it) or stays silent on the one bug it exists to catch. Both are tested.
import { reviewProgram, flatten, findRepeatedPattern } from '../src/lib/review.js';

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

// helpers to build serialised workspaces without Blockly
const chain = (...types) => {
  let head = null;
  for (const spec of [...types].reverse()) {
    const s = typeof spec === 'string' ? { type: spec } : spec;
    head = { ...s, ...(head ? { next: { block: head } } : {}) };
  }
  return head;
};
const ws = (...roots) => ({ blocks: { languageVersion: 0, blocks: roots.filter(Boolean) } });
const loop = (body, times = 4) => ({
  type: 'controls_repeat_ext',
  inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: times } } }, DO: { block: body } },
});
const titles = (r) => r.map((s) => s.title).join(' | ');

// --------------------------------------------------- silence when appropriate
t('R1 says nothing about an empty workspace', reviewProgram(ws()).length === 0);
t('R2 says nothing about a two-block start',
  reviewProgram(ws(chain('robot_start', 'robot_move'))).length === 0);
{
  // a short, correct, loop-using program deserves no lecture
  const good = ws(chain('robot_start', loop(chain('robot_move', 'robot_turn'), 4)));
  const r = reviewProgram(good, { goal: 'reach-target' });
  t('R3 a clean looped program draws no efficiency/logic complaints',
    !r.some((s) => s.level !== 'style'), titles(r));
}

// ------------------------------------------------------------- logic rules
{
  // sensor read outside any loop — the classic beginner bug
  const bad = ws(chain('robot_start', 'robot_distance', loop(chain('robot_move'), 10)));
  const r = reviewProgram(bad, { goal: 'near-wall' });
  t('R4 catches a sensor checked outside the loop', /only checked once/i.test(titles(r)), titles(r));
  t('R5 that suggestion is ranked as logic, first', r[0]?.level === 'logic');
}
{
  const good = ws(chain('robot_start', loop(chain('robot_distance', 'robot_move'), 10)));
  t('R6 no complaint when the sensor IS inside the loop',
    !/only checked once/i.test(titles(reviewProgram(good, { goal: 'near-wall' }))));
}
{
  const empty = ws(chain('robot_start', { type: 'controls_repeat_ext', inputs: {} }, 'robot_move', 'robot_turn'));
  t('R7 catches an empty loop', /empty/i.test(titles(reviewProgram(empty))));
}
{
  const orphan = ws(chain('robot_start', 'robot_move', 'robot_turn'), chain('robot_led', 'robot_wait'));
  t('R8 catches blocks that never run', /never run/i.test(titles(reviewProgram(orphan))));
}
{
  const oneLed = ws(chain('robot_start', loop(chain('robot_led', 'robot_wait'), 5)));
  t('R9 catches a blink with only one LED block',
    /two LED/i.test(titles(reviewProgram(oneLed, { goal: 'blink:5' }))));
}
{
  const crash = ws(chain('robot_start', 'robot_move', 'robot_move', 'robot_move', 'robot_move'));
  t('R10 links a crash to the missing sensor',
    /nothing was watching/i.test(titles(reviewProgram(crash, { bumped: true }))));
}

// -------------------------------------------------------- efficiency rules
{
  const unrolled = ws(chain('robot_start',
    'robot_move', 'robot_turn', 'robot_move', 'robot_turn',
    'robot_move', 'robot_turn', 'robot_move', 'robot_turn'));
  const r = reviewProgram(unrolled, { goal: 'reach-target' });
  t('R11 spots an unrolled pattern that should be a loop', /repeats 4 times/i.test(titles(r)), titles(r));
  t('R12 the advice names the actual blocks',
    r.some((s) => /move forward → turn/.test(s.detail)));
}
{
  // the same pattern, but already in a loop — must NOT nag
  const looped = ws(chain('robot_start', loop(chain('robot_move', 'robot_turn'), 4)));
  t('R13 no loop advice when a loop is already used',
    !/repeats/i.test(titles(reviewProgram(looped))));
}
{
  const long = ws(chain('robot_start', ...Array(20).fill('robot_move')));
  t('R14 mentions par when the program is far over it',
    /can be done in about/i.test(titles(reviewProgram(long, { par: 5 }))));
  t('R15 stays quiet when the program is near par',
    !/can be done in about/i.test(titles(reviewProgram(ws(chain('robot_start', 'robot_move', 'robot_turn', 'robot_move')), { par: 5 }))));
}
{
  const magic = ws(chain('robot_start',
    ...Array(5).fill({ type: 'robot_move', fields: { DIST: 3 } })));
  t('R16 suggests a variable for a repeated magic number',
    /number 3 appears/i.test(titles(reviewProgram(magic))));
}

// ------------------------------------------------------------- presentation
{
  const messy = ws(
    chain('robot_distance', 'robot_move', 'robot_move', 'robot_move', 'robot_move', 'robot_move', 'robot_move'),
    chain('robot_led')
  );
  const r = reviewProgram(messy, { bumped: true, par: 4 });
  t('R17 never returns an overwhelming wall of advice', r.length <= 4, `${r.length} items`);
  t('R18 logic issues are ranked above style',
    r.every((s, i) => i === 0 || ['logic', 'efficiency', 'style'].indexOf(r[i - 1].level) <= ['logic', 'efficiency', 'style'].indexOf(s.level)));
  t('R19 every suggestion has an actionable detail',
    r.every((s) => s.detail && s.detail.length > 40));
  t('R20 no suggestion is vague filler',
    !r.some((s) => /consider refactoring|best practice/i.test(s.detail)));
}

// ------------------------------------------------------------------ helpers
t('R21 flatten records loop context', flatten(ws(chain('robot_start', loop(chain('robot_move')))))
  .some((b) => b.type === 'robot_move' && b.inLoop));
t('R22 pattern finder returns null when nothing repeats',
  findRepeatedPattern(['a', 'b', 'c', 'd']) === null);
t('R23 pattern finder finds the shortest unit',
  JSON.stringify(findRepeatedPattern(['a', 'b', 'a', 'b', 'a', 'b'])?.pattern) === '["a","b"]');
t('R24 survives malformed input', (() => {
  try { reviewProgram(null); reviewProgram({}); reviewProgram({ blocks: {} }); return true; } catch { return false; }
})());

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} review test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} program-review tests pass`);
