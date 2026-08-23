// Tests for the skill graph (src/content/skills.json). It is the spine of the
// v2 records model and of C-SKILLMAP: mastery, spaced review and coverage
// checks all key off these ids, so the graph itself has to be well-formed
// before anything can rely on it (PRD §11.4).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPIC_TO_SKILLS } from '../src/lib/record.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

const graph = JSON.parse(await readFile(path.join(ROOT, 'src/content/skills.json'), 'utf8'));
const skills = graph.skills;
const byId = new Map(skills.map((s) => [s.id, s]));

t('S1 has a version and an areas map',
  typeof graph.version === 'number' && graph.areas && typeof graph.areas === 'object');
t('S2 has a healthy number of skills (~60+)', skills.length >= 60, String(skills.length));

// unique ids
{
  const dupes = skills.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
  t('S3 all skill ids are unique', dupes.length === 0, [...new Set(dupes)].join());
}

// every field present and area matches the id prefix
{
  const bad = skills.filter((s) =>
    !s.id || !s.label || !s.def || !Number.isInteger(s.module) ||
    !Array.isArray(s.requires) || s.area !== s.id.split('.')[0] || !graph.areas[s.area]);
  t('S4 every skill has id/label/def/module/requires and a known area matching its prefix',
    bad.length === 0, bad.map((s) => s.id).join());
}

// every requires id exists
{
  const dangling = skills.flatMap((s) => s.requires.filter((r) => !byId.has(r)).map((r) => `${s.id}->${r}`));
  t('S5 every prerequisite id exists', dangling.length === 0, dangling.join());
}

// prerequisite module <= skill module (a prereq is never introduced later)
{
  const late = skills.flatMap((s) =>
    s.requires.filter((r) => byId.get(r) && byId.get(r).module > s.module).map((r) => `${s.id}(M${s.module})<-${r}(M${byId.get(r).module})`));
  t('S6 no prerequisite is introduced in a later module than the skill', late.length === 0, late.join());
}

// no cycles in requires (DFS colouring)
{
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map(skills.map((s) => [s.id, WHITE]));
  let cycle = null;
  const visit = (id, stack) => {
    if (cycle) return;
    colour.set(id, GREY);
    for (const r of byId.get(id)?.requires || []) {
      if (!byId.has(r)) continue;
      if (colour.get(r) === GREY) { cycle = [...stack, id, r].join(' -> '); return; }
      if (colour.get(r) === WHITE) visit(r, [...stack, id]);
    }
    colour.set(id, BLACK);
  };
  for (const s of skills) if (colour.get(s.id) === WHITE) visit(s.id, []);
  t('S7 the requires graph is acyclic', cycle === null, cycle || '');
}

// the migration map only references real skills (keeps record.js and the graph in step)
{
  const unknown = Object.values(TOPIC_TO_SKILLS).flat().filter((id) => !byId.has(id));
  t('S8 TOPIC_TO_SKILLS only references skills that exist in the graph', unknown.length === 0, unknown.join());
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} skill-graph test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} skill-graph tests pass`);
