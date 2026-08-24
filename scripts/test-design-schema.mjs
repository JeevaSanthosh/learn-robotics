// Tests for the project design schema (Phase 6, task A2). Two honesty rules are
// enforced here because both were real bugs: a project whose module has no
// lessons must not advertise itself as startable (`state: "planned"`), and the
// design stage must be TIERED — a simulator-only project must not ask for a
// bill of materials for parts that do not exist. Photo prompts must be written
// for the project they belong to, which is why hardware projects are required
// to carry two of them.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyProjectRecord, emptyRecord, validate, migrate, serialize, deserialize } from '../src/lib/record.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

const projects = JSON.parse(await readFile(path.join(ROOT, 'src/content/projects.json'), 'utf8')).projects;

// Which modules actually have at least one lesson file on disk.
const modulesWithLessons = new Set();
for (const f of await readdir(path.join(ROOT, 'src/content/modules')))
  if (/^m(\d+)-.+\.mdx$/.test(f)) modulesWithLessons.add(Number(/^m(\d+)-/.exec(f)[1]));

// ---- (a) every project declares a state and a design stage ----
{
  const STATES = ['available', 'planned'];
  const DESIGN_KEYS = ['required', 'bom', 'connections', 'kit', 'photoPrompts'];
  for (const p of projects) {
    t(`D ${p.id} has a valid state`, STATES.includes(p.state), JSON.stringify(p.state));
    const d = p.design;
    const shaped = d && typeof d === 'object' && !Array.isArray(d)
      && DESIGN_KEYS.every((k) => k in d)
      && typeof d.required === 'boolean' && typeof d.bom === 'boolean' && typeof d.connections === 'boolean'
      && (d.kit === null || typeof d.kit === 'string')
      && Array.isArray(d.photoPrompts);
    t(`D ${p.id} has a well-formed design object`, shaped, JSON.stringify(d));
  }
}

// ---- (b) tiering: no parts list for a project with no parts ----
{
  const KITS = ['kit1', 'kit2'];
  for (const p of projects) {
    const d = p.design || {};
    if (p.realMilestone === null) {
      t(`D ${p.id} is sim-only, so it asks for no bill of materials`, d.bom !== true);
      t(`D ${p.id} is sim-only, so it asks for no connections`, d.connections !== true);
      t(`D ${p.id} is sim-only, so it needs no kit`, d.kit === null, String(d.kit));
      t(`D ${p.id} is sim-only, so it prompts for no photos`, Array.isArray(d.photoPrompts) && d.photoPrompts.length === 0);
    } else {
      t(`D ${p.id} is a real build, so bom and connections are required`, d.bom === true && d.connections === true);
      t(`D ${p.id} is a real build, so it names a kit`, KITS.includes(d.kit), String(d.kit));
      // Gate A unlocks Kit 1 after module 5; Gate B unlocks Kit 2 after module 8.
      const expected = p.module >= 9 ? 'kit2' : 'kit1';
      t(`D ${p.id} (module ${p.module}) uses ${expected}`, d.kit === expected, String(d.kit));
    }
  }
}

// ---- (c) a project whose module has no lessons cannot claim to be startable ----
{
  for (const p of projects) {
    const buildable = modulesWithLessons.has(p.module);
    t(`D ${p.id} state matches whether module ${p.module} has lessons`,
      p.state === (buildable ? 'available' : 'planned'),
      `state=${p.state} lessons=${buildable}`);
  }
  t('D at least one project is available and at least one is planned',
    projects.some((p) => p.state === 'available') && projects.some((p) => p.state === 'planned'));
}

// ---- (d) hardware projects carry two concrete photo prompts ----
{
  const seen = new Map();
  for (const p of projects.filter((x) => x.realMilestone !== null)) {
    const prompts = p.design?.photoPrompts || [];
    t(`D ${p.id} has at least 2 photo prompts`, prompts.length >= 2, `found ${prompts.length}`);
    t(`D ${p.id} photo prompts are non-empty strings`,
      prompts.every((s) => typeof s === 'string' && s.trim().length >= 12));
    for (const s of prompts) seen.set(s, (seen.get(s) || 0) + 1);
  }
  const reused = [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s);
  t('D no photo prompt is copy-pasted between projects', reused.length === 0, reused.join(' | '));
}

// ---- the record side: the design/build stage has somewhere to be stored ----
{
  const r = emptyProjectRecord();
  t('D the project record has a design stage',
    r.design && r.design.lockedAt === null && Array.isArray(r.design.bom) && Array.isArray(r.design.connections)
    && typeof r.design.approach === 'string' && typeof r.design.unsureAbout === 'string');
  t('D the project record has a build stage',
    r.build && ['photos', 'matches', 'changes'].every((k) => Array.isArray(r.build[k])));

  // A photo entry is a REFERENCE. Inlining image bytes would blow the ~5 MB
  // localStorage budget and make save() throw mid-write, so validate() rejects it.
  const good = emptyRecord();
  good.projects.p04 = emptyProjectRecord();
  good.projects.p04.build.photos.push({ id: 'ph_ab12', w: 1600, h: 1200, addedAt: '2026-09-01T00:00:00Z' });
  t('D a record with a photo reference validates', validate(good).ok, validate(good).errors.join('; '));

  const inlined = emptyRecord();
  inlined.projects.p04 = emptyProjectRecord();
  inlined.projects.p04.build.photos.push({ id: 'ph_ab12', w: 4, h: 4, addedAt: null, dataUrl: 'data:image/jpeg;base64,AAAA' });
  t('D validate rejects image bytes stored in the record', !validate(inlined).ok);

  // Old project records (written before the design stage existed) are back-filled.
  const legacy = emptyRecord();
  legacy.projects.p01 = { status: 'sim-passed', rubric: {}, probes: [], attestation: null };
  const filled = migrate(legacy);
  t('D migration back-fills design/build onto an older project record',
    !!filled.projects.p01.design && !!filled.projects.p01.build && filled.projects.p01.status === 'sim-passed');
  const text = serialize(filled);
  t('D a record carrying a project round-trips byte-identically', serialize(deserialize(text)) === text);
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} design-schema test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} design-schema tests pass`);
