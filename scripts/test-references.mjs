// Tests that every seeded mission is well-posed (PRD §16 C-SEEDS, C-NOSHORTCUT):
// its reference "good" solver passes, and its hard-coded straight-line drive
// fails. If either flips, a mission is either unsolvable or brute-forceable.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { grade } from '../src/lib/sim/grade.js';
import { SEED_MISSIONS } from '../src/content/references.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

const worldOf = async (id) => JSON.parse(await readFile(path.join(ROOT, 'src/content/worlds', id + '.json'), 'utf8'));

t('SM0 there is at least one seeded mission', SEED_MISSIONS.length >= 1);

for (const m of SEED_MISSIONS) {
  const world = await worldOf(m.worldId);
  const good = await grade(m.good, world, { seeds: m.seeds, mustPass: m.mustPass, goal: m.goal });
  const hard = await grade(m.hard, world, { seeds: m.seeds, mustPass: m.mustPass, goal: m.goal });
  t(`SM ${m.id}: the reference solution passes >= mustPass seeds`, good.passed,
    `passed ${good.passedCount}/${m.seeds.length}, need ${m.mustPass}`);
  t(`SM ${m.id}: a hard-coded straight-line drive FAILS`, !hard.passed,
    `hard-coded passed ${hard.passedCount}/${m.seeds.length} — mission is brute-forceable`);
  t(`SM ${m.id}: at least one seed is genuinely hard for the brute force`, hard.passedCount < m.seeds.length);
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} seed-mission test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} seed-mission tests pass`);
