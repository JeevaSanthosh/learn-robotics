// Tests for the mutation catalogue engine and the hand-authored debug-challenge
// corpus. Two failure modes matter most and are both tested:
//   * a mutation that isn't deterministic (breaks fair grading and exact replay)
//   * a mutation that quietly corrupts the tree (breaks the renderer / simulator)
// plus the corpus invariants the UI relies on (valid buggyLine, known skills).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MUTATIONS, applyMutation, mutate, applicableTypes } from '../src/lib/mutate.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

// ---- helpers to build serialised workspaces without Blockly ----------------
const chain = (...types) => {
  let head = null;
  for (const spec of [...types].reverse()) {
    const s = typeof spec === 'string' ? { type: spec } : spec;
    head = { ...s, ...(head ? { next: { block: head } } : {}) };
  }
  return head;
};
const ws = (...roots) => ({ blocks: { languageVersion: 0, blocks: roots.filter(Boolean) } });
const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const loop = (body, times = 4) => ({
  type: 'controls_repeat_ext',
  inputs: { TIMES: num(times), DO: { block: body } },
});
const compare = (op, a, b) => ({
  type: 'logic_compare', fields: { OP: op },
  inputs: { A: { block: a }, B: num(b) },
});
const whileUntil = (mode, cond, body) => ({
  type: 'controls_whileUntil', fields: { MODE: mode },
  inputs: { BOOL: { block: cond }, DO: { block: body } },
});

// A rich sample program that exercises most mutation targets at once.
const sample = () => ws(chain('robot_start',
  { type: 'variables_set', fields: { VAR: 'count' } },
  { type: 'robot_led', fields: { STATE: 'OFF' } },
  loop(chain(
    { type: 'robot_distance' },
    { type: 'robot_move', fields: { DIST: 1 } },
    { type: 'robot_turn', fields: { DIR: 'LEFT' } },
    { type: 'controls_if', inputs: { IF0: { block: compare('LT', { type: 'robot_distance' }, 3) } } },
  ), 4),
));

const isValidTree = (p) => Array.isArray(p?.blocks?.blocks);
const json = (x) => JSON.stringify(x);

// ------------------------------------------------------ catalogue coverage
const EXPECTED = ['off-by-one', 'swap-comparison', 'sensor-hoisted', 'wrong-turn-sign',
  'threshold-off', 'swap-blocks', 'invert-condition', 'missing-reset'];

t('M1 MUTATIONS is non-empty', MUTATIONS.length > 0, `${MUTATIONS.length}`);
{
  const types = MUTATIONS.map((m) => m.type);
  const missing = EXPECTED.filter((e) => !types.includes(e));
  t('M2 MUTATIONS covers all 8 catalogue types', missing.length === 0, `missing: ${missing.join(', ')}`);
  t('M3 every catalogue entry has a type and label',
    MUTATIONS.every((m) => typeof m.type === 'string' && typeof m.label === 'string'));
}

// ------------------------------------------------------ determinism
{
  let allDet = true, detail = '';
  for (const type of EXPECTED) {
    const a = applyMutation(sample(), type, 7);
    const b = applyMutation(sample(), type, 7);
    if (json(a) !== json(b)) { allDet = false; detail = type; break; }
  }
  t('M4 applyMutation is deterministic for the same (program, type, seed)', allDet, `diverged on ${detail}`);
}
{
  // Different seeds on a program with several targets should be *able* to differ,
  // but must never be nondeterministic within a seed. Check a couple explicitly.
  const p = ws(chain('robot_start',
    { type: 'robot_turn', fields: { DIR: 'LEFT' } },
    loop(chain({ type: 'robot_move' }, { type: 'robot_turn', fields: { DIR: 'RIGHT' } }), 4)));
  const s1a = applyMutation(p, 'wrong-turn-sign', 1);
  const s1b = applyMutation(p, 'wrong-turn-sign', 1);
  t('M5 repeated apply with one seed is byte-identical', json(s1a) === json(s1b));
}

// ------------------------------------------------------ mutations actually change the tree
{
  const changed = [];
  const unchangedButApplied = [];
  for (const type of EXPECTED) {
    const before = sample();
    const res = applyMutation(before, type, 3);
    if (!res.applied) continue;
    t(`M6.${type} result is still a valid tree`, isValidTree(res.program), 'no blocks.blocks array');
    if (json(res.program) !== json(before)) changed.push(type);
    else unchangedButApplied.push(type);
    t(`M7.${type} an applied mutation carries a description`,
      typeof res.description === 'string' && res.description.length > 10, res.description || '(none)');
  }
  t('M8 several mutation types apply and change the sample program',
    changed.length >= 5, `only ${changed.length} changed: ${changed.join(', ')}`);
  t('M9 no mutation reports applied while leaving the program identical',
    unchangedButApplied.length === 0, `no-op applies: ${unchangedButApplied.join(', ')}`);
}

// ------------------------------------------------------ not-applicable contract
{
  const bare = ws(chain('robot_start', 'robot_move'));
  const res = applyMutation(bare, 'wrong-turn-sign', 1);
  t('M10 applyMutation returns applied:false when no target exists', res.applied === false);
  t('M11 a not-applicable mutation returns the original program untouched', res.program === bare);
}
{
  let threw = false;
  try { applyMutation(sample(), 'no-such-type', 1); } catch { threw = true; }
  t('M12 an unknown mutation type throws', threw);
}

// ------------------------------------------------------ specific behaviours
{
  const p = ws(chain('robot_start', loop(chain('robot_move'), 4)));
  const r = applyMutation(p, 'off-by-one', 2);
  const times = r.program.blocks.blocks[0].next.block.inputs.TIMES.shadow.fields.NUM;
  t('M13 off-by-one changes the loop count by exactly one', Math.abs(times - 4) === 1, `now ${times}`);
}
{
  const p = ws(chain('robot_start', { type: 'robot_turn', fields: { DIR: 'LEFT' } }));
  const r = applyMutation(p, 'wrong-turn-sign', 1);
  t('M14 wrong-turn-sign flips LEFT to RIGHT',
    r.program.blocks.blocks[0].next.block.fields.DIR === 'RIGHT');
}
{
  const p = ws(chain('robot_start', whileUntil('WHILE', compare('GT', { type: 'robot_distance' }, 10), chain('robot_move'))));
  const r = applyMutation(p, 'invert-condition', 1);
  t('M15 invert-condition flips WHILE to UNTIL',
    r.program.blocks.blocks[0].next.block.fields.MODE === 'UNTIL');
}
{
  // sensor-hoisted: distance read starts inside the loop, ends before it.
  const p = ws(chain('robot_start', loop(chain({ type: 'robot_distance' }, { type: 'robot_move' }), 5)));
  const r = applyMutation(p, 'sensor-hoisted', 1);
  t('M16 sensor-hoisted applies', r.applied === true);
  // After hoisting, the block sitting between start and the loop should be the read.
  const afterStart = r.program.blocks.blocks[0].next?.block;
  t('M17 the hoisted sensor now sits before the loop',
    afterStart?.type === 'robot_distance' && afterStart?.next?.block?.type === 'controls_repeat_ext',
    afterStart?.type);
  // And the loop body no longer begins with the read.
  const body = afterStart?.next?.block?.inputs?.DO?.block;
  t('M18 the loop body no longer starts with the sensor read', body?.type === 'robot_move', body?.type);
}
{
  const p = ws(chain('robot_start', { type: 'robot_move', fields: { DIST: 1 } }, { type: 'robot_turn', fields: { DIR: 'RIGHT' } }));
  const r = applyMutation(p, 'swap-blocks', 1);
  const first = r.program.blocks.blocks[0].next.block;
  t('M19 swap-blocks reorders the two statements',
    first.type === 'robot_turn' && first.next.block.type === 'robot_move', `${first.type} first`);
}
{
  const p = ws(chain('robot_start', { type: 'robot_led', fields: { STATE: 'OFF' } }, 'robot_move'));
  const r = applyMutation(p, 'missing-reset', 1);
  const kinds = [];
  let b = r.program.blocks.blocks[0].next?.block;
  while (b) { kinds.push(b.type); b = b.next?.block; }
  t('M20 missing-reset removes the LED-off reset block', !kinds.includes('robot_led'), kinds.join(','));
}
{
  const p = ws(chain('robot_start', loop(chain('robot_move', { type: 'controls_if',
    inputs: { IF0: { block: compare('LT', { type: 'robot_distance' }, 3) } } }), 4)));
  const before = json(p);
  const r = applyMutation(p, 'threshold-off', 5);
  t('M21 threshold-off changes a compared number', r.applied && json(r.program) !== before);
}

// ------------------------------------------------------ mutate() by seed
{
  const a = mutate(sample(), 42);
  const b = mutate(sample(), 42);
  t('M22 mutate() is deterministic by seed', json(a) === json(b));
  t('M23 mutate() applies something on a rich program', a.applied === true, a.type || '(none)');
  const bare = ws(chain('robot_start', 'robot_move'));
  t('M24 mutate() reports applied:false when nothing is applicable',
    mutate(bare, 1).applied === false || applicableTypes(bare).length > 0);
}

// ------------------------------------------------------ debug-challenges.json
{
  const raw = readFileSync(join(root, 'src/content/debug-challenges.json'), 'utf8');
  let data = null, parsed = true;
  try { data = JSON.parse(raw); } catch { parsed = false; }
  t('C1 debug-challenges.json parses', parsed);

  const skills = JSON.parse(readFileSync(join(root, 'src/content/skills.json'), 'utf8'));
  const skillIds = new Set(skills.skills.map((s) => s.id));
  const knownMutations = new Set(EXPECTED);

  const list = data?.challenges ?? [];
  t('C2 has at least 24 challenges', list.length >= 24, `${list.length}`);

  const ids = list.map((c) => c.id);
  t('C3 every id is unique', new Set(ids).size === ids.length,
    `${ids.length - new Set(ids).size} duplicate(s)`);

  const badLine = list.filter((c) => !Array.isArray(c.lines) || c.lines.length < 3
    || !Number.isInteger(c.buggyLine) || c.buggyLine < 1 || c.buggyLine > c.lines.length);
  t('C4 every buggyLine is a valid 1-based index and lines has >= 3 entries',
    badLine.length === 0, badLine.map((c) => c.id).join(', '));

  const badMut = list.filter((c) => !knownMutations.has(c.mutation));
  t('C5 every mutation value is a known catalogue type', badMut.length === 0,
    badMut.map((c) => `${c.id}:${c.mutation}`).join(', '));

  const badSkill = list.filter((c) => !Array.isArray(c.skills) || c.skills.length < 1
    || c.skills.some((s) => !skillIds.has(s)));
  t('C6 every skill id exists in skills.json', badSkill.length === 0,
    badSkill.map((c) => c.id).join(', '));

  const badModule = list.filter((c) => !Number.isInteger(c.module) || c.module < 1 || c.module > 5);
  t('C7 every module is in 1..5', badModule.length === 0, badModule.map((c) => c.id).join(', '));

  const perModule = {};
  for (const c of list) perModule[c.module] = (perModule[c.module] || 0) + 1;
  const thin = [1, 2, 3, 4, 5].filter((m) => (perModule[m] || 0) < 3);
  t('C8 at least 3 challenges in every module 1..5', thin.length === 0,
    `thin modules: ${thin.map((m) => `${m}(${perModule[m] || 0})`).join(', ')}`);

  const missingType = EXPECTED.filter((e) => !list.some((c) => c.mutation === e));
  t('C9 the corpus illustrates every mutation type at least once',
    missingType.length === 0, `not illustrated: ${missingType.join(', ')}`);

  const badText = list.filter((c) => !c.claim || !c.symptom || !c.fix || !c.why);
  t('C10 every challenge has claim, symptom, fix and why', badText.length === 0,
    badText.map((c) => c.id).join(', '));

  console.log(`\n  (corpus: ${list.length} challenges; per module ` +
    [1, 2, 3, 4, 5].map((m) => `${m}:${perModule[m] || 0}`).join(' ') + ')');
}

console.log('\n' + pass.join('\n'));
if (fail.length) {
  console.log('\n' + fail.join('\n'));
  console.log(`\n✗ ${fail.length} mutate test(s) failing.`);
  process.exit(1);
}
console.log(`\n✓ ${pass.length} mutate + debug-challenge tests pass`);
