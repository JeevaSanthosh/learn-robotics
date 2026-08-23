// Tests for the world layer: schema validation and deterministic seeded
// variants. Worlds decide what arena a mission is graded in, so a malformed
// world or a non-deterministic variant would make grading unfair or unrepeatable
// (PRD §8.2). Backs C-WORLDS.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorld, variant } from '../src/lib/sim/world.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const dir = path.join(ROOT, 'src/content/worlds');
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
const worlds = await Promise.all(files.map(async (f) => ({ file: f, w: JSON.parse(await readFile(path.join(dir, f), 'utf8')) })));

t('W1 there is at least one world to grade against', worlds.length >= 1, String(worlds.length));

for (const { file, w } of worlds) {
  const { ok, errors } = validateWorld(w);
  t(`W2 ${file} validates against the schema`, ok, errors.join('; '));
  t(`W3 ${file} id matches its filename`, w.id === file.replace(/\.json$/, ''), `${w.id} vs ${file}`);
}

// determinism: the same seed yields the same arena, twice
{
  const w = worlds.find(({ w }) => w.variation)?.w || worlds[0].w;
  t('W4 variant(seed) is deterministic', eq(variant(w, 7), variant(w, 7)));
  t('W5 different seeds give different arenas when variation is set',
    !w.variation || !eq(variant(w, 7), variant(w, 8)));
  t('W6 a variant still validates', validateWorld(variant(w, 7)).ok);
}

// validateWorld actually rejects bad input (not a rubber stamp)
{
  t('W7 rejects a world with no id', !validateWorld({ size: { w: 1, h: 1 } }).ok);
  t('W8 rejects a malformed wall', !validateWorld({ id: 'x', size: { w: 1, h: 1 }, walls: [{ x: 0 }] }).ok);
  t('W9 rejects a non-object', !validateWorld(null).ok);
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} world test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} world tests pass`);
