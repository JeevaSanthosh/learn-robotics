// Acceptance-condition verifier. Run: node scripts/verify.mjs
// Exits non-zero if ANY condition fails. Used as the fix-verify loop gate
// and wired into CI so regressions can't merge.
//
// C1 (build passes) runs separately via `npm run build`.
// External link LIVENESS is delegated to the lychee step in the freshness
// workflow (this sandbox can't reach arbitrary domains); format, allowlist,
// and placeholder checks happen here.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emptyRecord, migrate, validate, serialize, deserialize,
  applySkillEvent, decayDue,
} from '../src/lib/record.js';
import { SimCore } from '../src/lib/sim/core.js';
import { headlessDriver } from '../src/lib/sim/runner.js';
import { grade, evaluateGoal } from '../src/lib/sim/grade.js';
import { validateWorld, variant } from '../src/lib/sim/world.js';
import { SEED_MISSIONS } from '../src/content/references.mjs';
import { ENTRY_HEADINGS, buildEntryMarkdown } from '../src/lib/portfolio.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fails = [];
const passes = [];
const ok = (id, msg) => passes.push(`  PASS ${id}: ${msg}`);
const bad = (id, msg) => fails.push(`  FAIL ${id}: ${msg}`);

// ---------- load sources ----------------------------------------------------
const mdxDir = path.join(ROOT, 'src/content/modules');
const mdxFiles = (await readdir(mdxDir)).filter((f) => f.endsWith('.mdx'));
const lessons = await Promise.all(
  mdxFiles.map(async (f) => {
    const raw = await readFile(path.join(mdxDir, f), 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim();
    return {
      slug: f.replace(/\.mdx$/, ''),
      raw,
      module: Number(get('module')),
      order: Number(get('order')),
      duration: Number(get('duration')),
      checkpoint: get('checkpoint') === 'true',
      title: get('title'),
    };
  })
);
const progressSrc = await readFile(path.join(ROOT, 'src/lib/progress.js'), 'utf8');
const robotlabSrc = await readFile(path.join(ROOT, 'src/components/RobotLab.astro'), 'utf8');
const headers = await readFile(path.join(ROOT, 'public/_headers'), 'utf8');
const glossary = JSON.parse(await readFile(path.join(ROOT, 'public/glossary.json'), 'utf8'));
const resources = JSON.parse(await readFile(path.join(ROOT, 'public/resources.json'), 'utf8'));

// ---------- C2: runs under strict CSP (no eval anywhere client-side) --------
{
  const clientDirs = ['src/lib', 'src/components', 'src/pages', 'src/layouts'];
  let evalHits = [];
  for (const dir of clientDirs) {
    for (const f of await readdir(path.join(ROOT, dir), { recursive: true })) {
      if (!/\.(js|astro|ts)$/.test(f)) continue;
      let src = await readFile(path.join(ROOT, dir, f), 'utf8');
      src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // ignore comments
      if (/\beval\s*\(|new\s+Function\s*\(|AsyncFunction/.test(src)) evalHits.push(`${dir}/${f}`);
    }
  }
  evalHits.length
    ? bad('C2', `eval/Function found in: ${evalHits.join(', ')}`)
    : ok('C2', 'no eval/new Function in client code');
  /unsafe-eval/.test(headers)
    ? bad('C2', "_headers contains 'unsafe-eval' — CSP should not need it")
    : ok('C2', "CSP has no 'unsafe-eval'");
  /script-src 'self'/.test(headers)
    ? ok('C2', "CSP script-src is 'self'")
    : bad('C2', 'CSP script-src missing/loosened');
}

// ---------- C3: curriculum covers the doc's scope ---------------------------
{
  const mods = new Set(lessons.map((l) => l.module));
  [1, 2, 3, 4, 5].every((m) => mods.has(m))
    ? ok('C3', 'modules 1–5 all present')
    : bad('C3', `missing modules: ${[1, 2, 3, 4, 5].filter((m) => !mods.has(m))}`);
  for (const m of [1, 2, 3, 4, 5]) {
    const n = lessons.filter((l) => l.module === m).length;
    n >= 2 ? ok('C3', `module ${m} has ${n} lessons`) : bad('C3', `module ${m} has only ${n} lesson`);
  }
  // concept coverage by block/term usage across lesson bodies
  const all = lessons.map((l) => l.raw).join('\n');
  const concepts = {
    loops: /controls_repeat|repeat block|loop/i,
    conditionals: /controls_if|if.?block|conditional/i,
    variables: /variables_set|variable/i,
    events: /robot_start|event/i,
    electronics: /circuit/i,
    mechanics: /gear|torque/i,
    sensing: /robot_distance|sensor/i,
  };
  for (const [name, re] of Object.entries(concepts))
    re.test(all) ? ok('C3', `concept covered: ${name}`) : bad('C3', `concept missing: ${name}`);
  // bite-sized sessions per the doc
  const tooLong = lessons.filter((l) => !(l.duration >= 5 && l.duration <= 20));
  tooLong.length
    ? bad('C3', `lessons outside 5–20 min: ${tooLong.map((l) => l.slug)}`)
    : ok('C3', 'all lessons are 5–20 min');
}

// ---------- C4: every lesson is genuinely completable -----------------------
{
  for (const l of lessons) {
    const hasVerifiableLab = /<RobotLab[\s\S]*?goal="(?!free)/.test(l.raw);
    const hasQuiz = /<Quiz/.test(l.raw);
    const hasMarkDone = /<MarkDone/.test(l.raw);
    if (l.checkpoint) {
      hasVerifiableLab || hasQuiz
        ? ok('C4', `${l.slug} (checkpoint) has verifiable completion`)
        : bad('C4', `${l.slug} is a checkpoint but has no verifiable goal/quiz`);
      if (hasMarkDone) bad('C4', `${l.slug} is a checkpoint but offers self-report MarkDone (cheat path)`);
    } else {
      hasVerifiableLab || hasQuiz || hasMarkDone
        ? ok('C4', `${l.slug} completable`)
        : bad('C4', `${l.slug} has NO completion path (progress dead-end)`);
    }
  }
}

// ---------- C5: gate integrity ----------------------------------------------
{
  const gate = progressSrc.match(/requiredCheckpoints:\s*\[([^\]]*)\]/)?.[1] ?? '';
  const gateSlugs = [...gate.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const gateQuiz = progressSrc.match(/gateQuiz:\s*'([^']+)'/)?.[1] || progressSrc.match(/quiz:\s*'([^']+)'/)?.[1];
  const slugset = new Map(lessons.map((l) => [l.slug, l]));
  for (const s of gateSlugs) {
    const l = slugset.get(s);
    if (!l) bad('C5', `GATE references missing lesson: ${s}`);
    else if (!l.checkpoint) bad('C5', `GATE lesson ${s} not marked checkpoint:true`);
    else ok('C5', `gate checkpoint ok: ${s}`);
  }
  const orphans = lessons.filter((l) => l.checkpoint && !gateSlugs.includes(l.slug) && l.slug !== gateQuiz);
  orphans.length
    ? bad('C5', `checkpoint lessons not counted by GATE: ${orphans.map((l) => l.slug)}`)
    : ok('C5', 'every checkpoint counts toward the gate');
  const quizLesson = slugset.get(gateQuiz);
  if (!quizLesson) bad('C5', `gate quiz lesson missing: ${gateQuiz}`);
  else {
    const qcount = (quizLesson.raw.match(/"q":/g) || []).length;
    qcount >= 8
      ? ok('C5', `gate quiz has ${qcount} questions (80% threshold meaningful)`)
      : bad('C5', `gate quiz has only ${qcount} questions`);
  }
  gateSlugs.length >= 4
    ? ok('C5', `gate requires ${gateSlugs.length} checkpoints`)
    : bad('C5', 'gate requires too few checkpoints to mean "confident"');
}

// ---------- C6: anti-cheat goal verification --------------------------------
{
  ['blink:', 'reach-target', 'near-wall', 'required'].every((k) => robotlabSrc.includes(k))
    ? ok('C6', 'RobotLab implements outcome goals + required-block verification')
    : bad('C6', 'RobotLab missing goal/required-block verification');
  // sensor lessons must require the sensor block; loop lesson must require a loop
  const must = {
    'm3-wall-stop': 'robot_distance',
    'm5-obstacle-course': 'robot_distance',
    'm2-loops': 'controls_repeat_ext',
    'm5-events': 'robot_start',
  };
  for (const [slug, block] of Object.entries(must)) {
    const l = lessons.find((x) => x.slug === slug);
    if (!l) { bad('C6', `expected lesson missing: ${slug}`); continue; }
    new RegExp(`required="[^"]*${block}`).test(l.raw)
      ? ok('C6', `${slug} requires ${block} (concept can't be skipped)`)
      : bad('C6', `${slug} does not require ${block} — cheatable`);
  }
}

// ---------- C7: resources are real, per-module, allowlisted -----------------
{
  const raw = JSON.stringify(resources);
  /REPLACE_ME|PLACEHOLDER/i.test(raw)
    ? bad('C7', 'resources.json still contains placeholders')
    : ok('C7', 'no placeholder resources');
  for (const m of ['m1', 'm2', 'm3', 'm4', 'm5', 'go-physical']) {
    (resources.modules[m]?.length ?? 0) >= 1
      ? ok('C7', `resources exist for ${m}`)
      : bad('C7', `no resources for ${m}`);
  }
  const allowed = resources.allowedDomains;
  for (const items of Object.values(resources.modules))
    for (const r of items) {
      const host = new URL(r.url).hostname;
      allowed.some((d) => host === d || host.endsWith('.' + d))
        ? ok('C7', `allowlisted: ${host}`)
        : bad('C7', `resource domain not in allowlist: ${host}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.published || '')) bad('C7', `bad published date: ${r.url}`);
    }
}

// ---------- C8: every <Term id> exists in the glossary ----------------------
{
  const used = new Set();
  for (const l of lessons)
    for (const m of l.raw.matchAll(/<Term id="([^"]+)"/g)) used.add(m[1]);
  const missing = [...used].filter((t) => !glossary[t]);
  missing.length
    ? bad('C8', `terms used but undefined: ${missing.join(', ')}`)
    : ok('C8', `${used.size} glossary terms all defined`);
}

// ---------- C-INLINE: no inline <script> survives into the build -----------
// This is the regression guard for the bug that silently killed the chat
// widget and the glossary filter for every visitor. Our CSP is
// `script-src 'self'` with no 'unsafe-inline', but Astro inlines small
// hoisted scripts by default, and the browser then blocks them with no
// visible error anywhere except the console. Nothing in the source code
// looks wrong — which is exactly why it needs a machine check.
// Requires `npm run build` first (CI runs build before verify).
{
  const distDir = path.join(ROOT, 'dist');
  let htmlFiles = [];
  try {
    htmlFiles = (await readdir(distDir, { recursive: true })).filter((f) => f.endsWith('.html'));
  } catch {
    htmlFiles = null;
  }

  if (htmlFiles === null) {
    bad('C-INLINE', 'dist/ not found — run `npm run build` before verify');
  } else {
    const offenders = [];
    for (const f of htmlFiles) {
      const html = await readFile(path.join(distDir, f), 'utf8');
      for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/\btype=["']application\/(ld\+json|json)["']/.test(m[1])) continue; // data, not code
        if (m[2].trim()) offenders.push(`${f} (${m[2].trim().length} bytes)`);
      }
    }
    offenders.length
      ? bad(
          'C-INLINE',
          `inline <script> in built HTML — CSP 'script-src self' will block these at runtime: ${offenders
            .slice(0, 5)
            .join(', ')}${offenders.length > 5 ? ` +${offenders.length - 5} more` : ''}. ` +
            'Keep vite.build.assetsInlineLimit at 0 in astro.config.mjs.'
        )
      : ok('C-INLINE', `no inline scripts in ${htmlFiles.length} built pages (CSP-safe)`);
  }
}

// ---------- C-HIDDEN: nothing may out-rank the `hidden` attribute ----------
// Browsers ship `[hidden] { display: none }` in the USER-AGENT stylesheet, and
// EVERY author rule beats the user-agent origin regardless of specificity. So a
// component writing `.panel { display: flex }` silently defeats
// `el.hidden = true` — the element never hides, no error is raised, and the
// source looks perfectly correct. This killed the chat panel's close button and
// MarkDone's button. Two guards, both required:
//   1. `[hidden] { display: none !important }` in global.css (the fix)
//   2. this check (stops a component reintroducing the pattern)
{
  const globalCss = await readFile(path.join(ROOT, 'src/styles/global.css'), 'utf8');
  /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(globalCss)
    ? ok('C-HIDDEN', 'global.css forces [hidden] to win over author display rules')
    : bad('C-HIDDEN', 'global.css must contain `[hidden] { display: none !important; }`');

  // Collect every class whose element is toggled via the hidden attribute,
  // then flag any rule that sets `display` on that class without excluding
  // [hidden]. Includes classes shared with the element (e.g. `.btn`).
  const compDirs = ['src/components', 'src/pages', 'src/layouts'];
  const sources = [];
  for (const dir of compDirs) {
    for (const f of await readdir(path.join(ROOT, dir), { recursive: true })) {
      if (!/\.astro$/.test(f)) continue;
      sources.push({ name: `${dir}/${f}`, src: await readFile(path.join(ROOT, dir, f), 'utf8') });
    }
  }

  const risky = new Set();
  for (const { src } of sources) {
    // markup: <tag class="a b" ... hidden>
    for (const m of src.matchAll(/<[a-zA-Z][^>]*\bclass=["']([^"']+)["'][^>]*\shidden(?=[\s/>])/g))
      for (const c of m[1].split(/\s+/)) if (c) risky.add('.' + c);
    // script: someEl.hidden = ...  where someEl was found by class
    if (/\b\w+\.hidden\s*=/.test(src)) {
      for (const m of src.matchAll(/querySelector(?:All)?\(\s*['"`]\.([\w-]+)['"`]\s*\)/g))
        risky.add('.' + m[1]);
    }
  }

  // Only ever parse <style> blocks as CSS — running the rule-matcher over an
  // entire .astro file treats script bodies as selectors and reports nonsense.
  const styleBlocks = [{ name: 'src/styles/global.css', css: globalCss }];
  for (const { name, src } of sources)
    for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
      styleBlocks.push({ name, css: m[1] });

  const offenders = [];
  for (const { name, css } of styleBlocks) {
    for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const body = m[2];
      const decl = body.match(/(?:^|[\s;])display\s*:[^;]*/)?.[0];
      if (!decl) continue;
      const display = decl.match(/display\s*:\s*([^;!]+)/)?.[1]?.trim();
      if (!display || display === 'none' || /!important/.test(decl)) continue;
      for (const sel of m[1].split(',')) {
        const part = sel.trim();
        if (!part || /\[hidden\]/.test(part)) continue;
        for (const cls of risky) {
          if (part === cls || part.endsWith(' ' + cls) || part.endsWith('>' + cls)) {
            offenders.push(`${name}: "${part} { display: ${display} }" would defeat [hidden] on ${cls}`);
          }
        }
      }
    }
  }

  // The global !important rule neutralises these, so they are a warning-level
  // smell rather than a hard failure — but they are reported so nobody relies
  // on the safety net by accident.
  offenders.length
    ? ok('C-HIDDEN', `noted ${offenders.length} display-vs-hidden collision(s), neutralised by the global rule: ${offenders[0]}`)
    : ok('C-HIDDEN', 'no component CSS sets display on a hidden-toggled element');
}

// ---------- C-LABELS: lesson instructions must match real UI labels --------
// Lessons say things like 'Tap **Show real code**'. Renaming that button in a
// component leaves the instruction pointing at a control that no longer
// exists — the build still passes, the tests still pass, and only the learner
// notices. (This happened: the button was shortened to "Real code" while two
// lessons still said "Show real code".)
{
  const compSrc = (
    await Promise.all(
      (await readdir(path.join(ROOT, 'src/components'), { recursive: true }))
        .filter((f) => f.endsWith('.astro'))
        .map((f) => readFile(path.join(ROOT, 'src/components', f), 'utf8'))
    )
  )
    .join('\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  const referenced = new Set();
  for (const l of lessons)
    for (const m of l.raw.matchAll(/\b(?:Tap|Press|Click|Hit|Choose)\s+\*\*([^*]{2,40})\*\*/g))
      referenced.add(m[1].trim());

  const dangling = [...referenced].filter((label) => !compSrc.includes(label));
  dangling.length
    ? bad('C-LABELS', `lesson text points at UI labels that no component renders: ${dangling.map((d) => `"${d}"`).join(', ')}`)
    : ok('C-LABELS', `${referenced.size} UI label(s) referenced in lessons all exist in components`);
}

// ---------- C-LABIDS: lab ids must be unique and checkpoints self-marking --
// Two RobotLabs sharing a lessonId share a localStorage workspace key, so they
// silently overwrite each other's saved blocks. And a checkpoint whose
// verified lab uses some OTHER id completes a lesson that doesn't exist —
// the gate then waits forever on a lesson the learner has actually finished.
{
  const ids = [];
  for (const l of lessons)
    for (const m of l.raw.matchAll(/<RobotLab[\s\S]*?lessonId=["']([^"']+)["']/g))
      ids.push({ slug: l.slug, id: m[1], checkpoint: l.checkpoint, raw: l.raw });

  const dupes = ids.map((i) => i.id).filter((id, i, a) => a.indexOf(id) !== i);
  dupes.length
    ? bad('C-LABIDS', `duplicate RobotLab lessonId (shared workspace storage): ${[...new Set(dupes)].join(', ')}`)
    : ok('C-LABIDS', `${ids.length} RobotLab ids are unique`);

  for (const l of lessons) {
    if (!l.checkpoint) continue;
    const labIds = [...l.raw.matchAll(/<RobotLab[\s\S]*?lessonId=["']([^"']+)["']/g)].map((m) => m[1]);
    const quizIds = [...l.raw.matchAll(/quizId=["']([^"']+)["']/g)].map((m) => m[1]);
    // Something in the lesson must be able to complete the lesson's own slug.
    const nonFreeLab = labIds.includes(l.slug) && !new RegExp(`lessonId=["']${l.slug}["'][\\s\\S]{0,300}?goal=["']free["']`).test(l.raw);
    nonFreeLab || quizIds.includes(l.slug)
      ? ok('C-LABIDS', `${l.slug} has a completion path bound to its own slug`)
      : bad('C-LABIDS', `${l.slug} is a checkpoint but nothing completes the slug "${l.slug}" (lab ids: ${labIds.join(', ') || 'none'})`);
  }
}

// ---------- C-MIGRATE: v1 -> v2 is idempotent and lossless -----------------
// The record holds a whole year of work; an upgrade that drops or corrupts it
// is the worst bug the product can ship (PRD §11.6, R9). The pure record layer
// is exercised directly here over a synthetic v1 corpus. The full matrix lives
// in scripts/test-migrate.mjs; this is the CI gate.
{
  const corpus = [
    null,
    {},
    { completed: [], quizScores: {}, activeDays: [], badges: [], assessments: [], topicStats: {}, daily: {} },
    {
      completed: ['m1-blink', 'm1-turn', 'm2-loops'],
      quizScores: { 'm5-gate-quiz': { score: 9, total: 10 } },
      activeDays: ['2026-09-01'], badges: ['first-spark'],
      assessments: [{ at: '2026-09-02T10:00:00Z', difficulty: 'easy', score: 5, total: 5 }],
      topicStats: { loops: { right: 6, wrong: 2 }, sensing: { right: 3, wrong: 3 } },
      daily: { '2026-09-01': { lessons: 1, exercises: 0, runs: 4, assessments: 0, best: 0 } },
      exercises: ['ex-a'],
    },
  ];
  let idem = true, lossless = true, valid = true;
  for (const v1 of corpus) {
    const once = migrate(v1);
    if (JSON.stringify(once) !== JSON.stringify(migrate(once))) idem = false;
    if (!validate(once).ok) valid = false;
    if (v1 && Array.isArray(v1.completed))
      for (const slug of v1.completed) if (!(slug in once.lessons)) lossless = false;
    if (v1 && v1.badges) for (const b of v1.badges) if (!once.badges.includes(b)) lossless = false;
  }
  idem ? ok('C-MIGRATE', 'v1→v2 migration is idempotent over the corpus') : bad('C-MIGRATE', 'migration is not idempotent');
  lossless ? ok('C-MIGRATE', 'no completed lessons or badges lost on migrate') : bad('C-MIGRATE', 'migration drops v1 data');
  valid ? ok('C-MIGRATE', 'every migrated record validates') : bad('C-MIGRATE', 'a migrated record fails validation');
}

// ---------- C-SCHEMA: record stays valid after every public mutation --------
// validate() is the schema. Here we prove it holds after the pure mutations the
// library performs — a fresh record, a migrated one, skill events, and decay.
{
  let stayed = true;
  const r = emptyRecord();
  if (!validate(r).ok) stayed = false;
  applySkillEvent(r, 'sense.range', true);
  applySkillEvent(r, 'sense.range', false);
  applySkillEvent(r, 'act.led', true);
  if (!validate(r).ok) stayed = false;
  decayDue(r, new Date(Date.now() + 400 * 86400000));
  if (!validate(r).ok) stayed = false;
  // validate must actually reject a broken record, or it proves nothing
  const broken = emptyRecord(); broken.version = 1;
  stayed && !validate(broken).ok
    ? ok('C-SCHEMA', 'record validates after mutations; validate rejects a broken record')
    : bad('C-SCHEMA', stayed ? 'validate accepts a broken record' : 'a mutation produced an invalid record');
}

// ---------- C-BACKUP: export -> import restores byte-identically ------------
{
  const r = migrate({
    completed: ['m1-blink'], quizScores: { 'm5-gate-quiz': { score: 8, total: 10 } },
    activeDays: ['2026-09-01'], badges: ['first-spark'], assessments: [], topicStats: {}, daily: {},
  });
  const text = serialize(r);
  const restored = deserialize(text);
  const byteIdentical = serialize(deserialize(text)) === text;
  JSON.stringify(restored) === JSON.stringify(r) && byteIdentical
    ? ok('C-BACKUP', 'export/import round-trips byte-identically')
    : bad('C-BACKUP', 'export/import is not a faithful round-trip');
}

// ---------- C-SKILLMAP: the skill graph is sound and referenced ids exist ---
// The skill graph (src/content/skills.json) is the spine of mastery, review and
// coverage. Phase 0 enforces its structural integrity and that no lesson
// references a skill that does not exist. Full taught/assessed/used closure over
// all ~60 skills lands with the content in Phases 5–6; here we additionally
// REPORT how much of the shipped modules is already covered, without failing on
// lessons that do not exist yet.
{
  let graph;
  try {
    graph = JSON.parse(await readFile(path.join(ROOT, 'src/content/skills.json'), 'utf8'));
  } catch (e) {
    graph = null;
    bad('C-SKILLMAP', 'src/content/skills.json missing or invalid JSON');
  }
  if (graph) {
    const skills = graph.skills || [];
    const byId = new Map(skills.map((s) => [s.id, s]));

    const dupes = skills.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
    dupes.length ? bad('C-SKILLMAP', `duplicate skill ids: ${[...new Set(dupes)].join(', ')}`)
      : ok('C-SKILLMAP', `${skills.length} skill ids are unique`);

    const badArea = skills.filter((s) => s.area !== String(s.id).split('.')[0] || !graph.areas?.[s.area]);
    badArea.length ? bad('C-SKILLMAP', `skills with an unknown/mismatched area: ${badArea.map((s) => s.id).slice(0, 5).join(', ')}`)
      : ok('C-SKILLMAP', 'every skill area matches its id prefix and is declared');

    const missingReq = skills.flatMap((s) => (s.requires || []).filter((r) => !byId.has(r)).map((r) => `${s.id}->${r}`));
    missingReq.length ? bad('C-SKILLMAP', `prerequisite ids that do not exist: ${missingReq.slice(0, 5).join(', ')}`)
      : ok('C-SKILLMAP', 'every prerequisite id exists');

    const lateReq = skills.flatMap((s) => (s.requires || [])
      .filter((r) => byId.get(r) && byId.get(r).module > s.module).map((r) => `${s.id}<-${r}`));
    lateReq.length ? bad('C-SKILLMAP', `prerequisite taught in a later module: ${lateReq.slice(0, 5).join(', ')}`)
      : ok('C-SKILLMAP', 'no prerequisite is introduced after the skill that needs it');

    // Extract teaches/requires ids from lesson frontmatter (inline YAML arrays).
    const idsIn = (raw, key) => {
      const m = raw.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'));
      return m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : [];
    };
    const referenced = new Set();
    for (const l of lessons)
      for (const key of ['teaches', 'requires'])
        for (const id of idsIn(l.raw, key)) referenced.add(id);
    const dangling = [...referenced].filter((id) => !byId.has(id));
    dangling.length ? bad('C-SKILLMAP', `lessons teach/require skills not in the graph: ${dangling.join(', ')}`)
      : ok('C-SKILLMAP', `${referenced.size} skill ids referenced by lessons all exist in the graph`);

    // Coverage over shipped modules — informational, not a gate (content phases
    // add the remaining lessons). Reported so the gap is visible, never hidden.
    const shippedMax = Math.max(...lessons.map((l) => l.module));
    const taught = new Set([...referenced]);
    const uncoveredShipped = skills.filter((s) => s.module <= shippedMax && !taught.has(s.id));
    ok('C-SKILLMAP', `coverage: ${taught.size} skills taught so far; ${uncoveredShipped.length} in shipped modules (≤M${shippedMax}) await content in later phases`);
  }
}

// ---------- C-SIM-HEADLESS: the core imports nothing DOM-related ------------
// The whole point of the split (PRD §8.1) is a core that can grade in a Worker.
// If a DOM reference or requestAnimationFrame creeps back into core/sensors/
// noise, multi-seed grading silently breaks. Guard the three headless files.
{
  const headlessFiles = ['src/lib/sim/core.js', 'src/lib/sim/sensors.js', 'src/lib/sim/noise.js'];
  const banned = /\brequestAnimationFrame\b|\bdocument\b|\bwindow\b|\bgetComputedStyle\b|\bgetContext\b|\bperformance\.now\b|\bcanvas\b/;
  const offenders = [];
  for (const f of headlessFiles) {
    let src = await readFile(path.join(ROOT, f), 'utf8');
    src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // strip comments
    const hit = src.match(banned);
    if (hit) offenders.push(`${f} (${hit[0]})`);
  }
  offenders.length
    ? bad('C-SIM-HEADLESS', `DOM/timing reference in headless core: ${offenders.join(', ')}`)
    : ok('C-SIM-HEADLESS', 'core/sensors/noise reference no DOM, rAF or wall-clock');
}

// ---------- C-SIM-DET: determinism is the contract --------------------------
// Same program + same seed => identical metrics. This is what makes grading
// fair, replays exact, and the seed-chip debugging affordance trustworthy.
{
  const world = { id: 't', size: { w: 360, h: 300 }, start: { x: 60, y: 240, heading: -90 }, target: { x: 300, y: 60, r: 26 } };
  const prog = async (r) => { await r.moveForward(3); await r.turn(90); await r.moveForward(4); };
  const run = async () => {
    const core = new SimCore(variant(world, 12345));
    await prog(headlessDriver(core));
    return JSON.stringify(evaluateGoal(core, 'reach-target').metrics);
  };
  const first = await run();
  let same = true;
  for (let i = 0; i < 100; i++) if ((await run()) !== first) same = false;
  same ? ok('C-SIM-DET', 'identical metrics across 100 runs of the same program+seed')
    : bad('C-SIM-DET', 'the core is not deterministic — grading would be unfair');
}

// ---------- C-SIM-PERF: 10 seeds × ~60 simulated seconds < 3s ---------------
{
  const world = { id: 'p', size: { w: 360, h: 300 }, start: { x: 180, y: 150, heading: -90 } };
  // ~60 simulated seconds of activity (60 ticks/s): a small repeated square.
  const prog = async (r) => { for (let i = 0; i < 40; i++) { await r.moveForward(2); await r.turn(90); } };
  const t0 = Date.now();
  await grade(prog, world, { seeds: 10, goal: 'free' });
  const ms = Date.now() - t0;
  ms < 3000 ? ok('C-SIM-PERF', `10-seed headless grading ran in ${ms}ms (< 3000ms budget)`)
    : bad('C-SIM-PERF', `10-seed grading took ${ms}ms, over the 3s budget`);
}

// ---------- C-WORLDS: world JSON validates; referenced worlds exist ---------
{
  const worldsDir = path.join(ROOT, 'src/content/worlds');
  let files = [];
  try { files = (await readdir(worldsDir)).filter((f) => f.endsWith('.json')); } catch { files = []; }
  const ids = new Set();
  let allValid = true;
  for (const f of files) {
    let w;
    try { w = JSON.parse(await readFile(path.join(worldsDir, f), 'utf8')); }
    catch { bad('C-WORLDS', `${f} is not valid JSON`); allValid = false; continue; }
    const { ok: good, errors } = validateWorld(w);
    if (!good) { bad('C-WORLDS', `${f}: ${errors.join('; ')}`); allValid = false; }
    if (w.id !== f.replace(/\.json$/, '')) { bad('C-WORLDS', `${f} id "${w.id}" must match filename`); allValid = false; }
    ids.add(w.id);
  }
  if (files.length && allValid) ok('C-WORLDS', `${files.length} world file(s) validate and ids match filenames`);
  if (!files.length) ok('C-WORLDS', 'no world files yet (lessons still inline arenas) — nothing to validate');

  // Any world a lesson references by id must exist.
  const missing = [];
  for (const l of lessons)
    for (const m of l.raw.matchAll(/\bdata-world=["']([^"']+)["']|\bworld=["']([^"']+)["']/g)) {
      const id = m[1] || m[2];
      if (id && !ids.has(id)) missing.push(`${l.slug}→${id}`);
    }
  missing.length ? bad('C-WORLDS', `lessons reference worlds that do not exist: ${missing.join(', ')}`)
    : ok('C-WORLDS', 'every world referenced by a lesson exists');
}

// ---------- C-PREDICT: every R2+ graded lab commits a prediction ------------
// Predict-then-run is required from rigor 2 (PRD §6.1 L3, §7.1). A graded lab
// (a RobotLab whose goal isn't 'free') in an R2+ lesson must carry predict +
// predictPrompt, or the reasoning layer has nothing to measure.
{
  let checked = 0;
  for (const l of lessons) {
    const rigor = Number(l.raw.match(/^rigor:\s*(\d+)/m)?.[1] || 0);
    if (rigor < 2) continue;
    for (const m of l.raw.matchAll(/<RobotLab\b[\s\S]*?\/>/g)) {
      const lab = m[0];
      const g = lab.match(/goal=["']([^"']+)["']/)?.[1] || 'free';
      if (g === 'free') continue;
      checked++;
      const hasPredict = /predict=["'](choice|number)["']/.test(lab) && /predictPrompt=/.test(lab);
      hasPredict
        ? ok('C-PREDICT', `${l.slug} (R${rigor}, goal ${g}) commits a prediction before Run`)
        : bad('C-PREDICT', `${l.slug} is R${rigor} with a graded lab (goal ${g}) but has no predict/predictPrompt`);
    }
  }
  if (!checked) ok('C-PREDICT', 'no R2+ graded labs to check');
}

// ---------- C-DEBUG: the debug-challenge corpus is real and referenced ------
// Phase 2 requires >= 20 debug challenges (PRD §17 Phase 2 exit). Validate the
// corpus and that any challenge a lesson embeds actually exists.
{
  let corpus = null;
  try { corpus = JSON.parse(await readFile(path.join(ROOT, 'src/content/debug-challenges.json'), 'utf8')); }
  catch { bad('C-DEBUG', 'src/content/debug-challenges.json missing or invalid JSON'); }
  if (corpus) {
    const ch = corpus.challenges || [];
    const skillIds = new Set((JSON.parse(await readFile(path.join(ROOT, 'src/content/skills.json'), 'utf8')).skills || []).map((s) => s.id));
    ch.length >= 20 ? ok('C-DEBUG', `${ch.length} debug challenges (>= 20 required)`) : bad('C-DEBUG', `only ${ch.length} debug challenges, need >= 20`);
    const dupes = ch.map((c) => c.id).filter((id, i, a) => a.indexOf(id) !== i);
    dupes.length ? bad('C-DEBUG', `duplicate challenge ids: ${[...new Set(dupes)].join(', ')}`) : ok('C-DEBUG', 'challenge ids are unique');
    const badLine = ch.filter((c) => !Array.isArray(c.lines) || c.lines.length < 3 || !(c.buggyLine >= 1 && c.buggyLine <= c.lines.length));
    badLine.length ? bad('C-DEBUG', `challenges with an out-of-range buggyLine: ${badLine.map((c) => c.id).slice(0, 5).join(', ')}`) : ok('C-DEBUG', 'every buggyLine indexes a real line');
    const badSkill = ch.flatMap((c) => (c.skills || []).filter((s) => !skillIds.has(s)).map((s) => `${c.id}:${s}`));
    badSkill.length ? bad('C-DEBUG', `challenges reference unknown skills: ${badSkill.slice(0, 5).join(', ')}`) : ok('C-DEBUG', 'every challenge skill id exists in the graph');

    const ids = new Set(ch.map((c) => c.id));
    const missing = [];
    for (const l of lessons)
      for (const m of l.raw.matchAll(/<DebugChallenge\b[^>]*\bid=["']([^"']+)["']/g))
        if (!ids.has(m[1])) missing.push(`${l.slug}→${m[1]}`);
    missing.length ? bad('C-DEBUG', `lessons embed challenges that do not exist: ${missing.join(', ')}`) : ok('C-DEBUG', 'every embedded debug challenge exists in the corpus');
  }
}

// ---------- Rigor ladder (PRD §6, §16) --------------------------------------
// Rigor is not vibes: the seed count, prediction requirement and world-variance
// are PROPS on the lab, and these conditions are what the code actually checks
// (R-RULE-3). A lesson can't claim R3 while grading one fixed world in silence.
{
  const rigorOf = (l) => Number(l.raw.match(/^rigor:\s*(\d+)/m)?.[1] || 0);

  // C-RIGOR-DECL: every lesson declares a rigor in 1..5.
  {
    const bad2 = lessons.filter((l) => { const r = rigorOf(l); return !(r >= 1 && r <= 5); });
    bad2.length
      ? bad('C-RIGOR-DECL', `lessons missing a valid rigor: ${bad2.map((l) => l.slug).join(', ')}`)
      : ok('C-RIGOR-DECL', `all ${lessons.length} lessons declare a rigor (1–5)`);
  }

  // C-RIGOR-MONO: module rigor (the max over its lessons) never decreases.
  {
    const modRigor = new Map();
    for (const l of lessons) modRigor.set(l.module, Math.max(modRigor.get(l.module) || 0, rigorOf(l)));
    const mods = [...modRigor.keys()].sort((a, b) => a - b);
    let monotonic = true, detail = '';
    for (let i = 1; i < mods.length; i++)
      if (modRigor.get(mods[i]) < modRigor.get(mods[i - 1])) { monotonic = false; detail = `M${mods[i]}(${modRigor.get(mods[i])}) < M${mods[i - 1]}(${modRigor.get(mods[i - 1])})`; }
    monotonic ? ok('C-RIGOR-MONO', `module rigor is non-decreasing: ${mods.map((m) => `M${m}:R${modRigor.get(m)}`).join(' ')}`)
      : bad('C-RIGOR-MONO', `module rigor decreases: ${detail}`);
  }

  // C-RIGOR-IMPL: a graded lab's props satisfy its lesson's rigor.
  //   R2+ ⇒ seeds>=5 (a seeded world) OR an explicit fixedWorld declaration
  //   R3+ ⇒ predict configured
  //   R4+ ⇒ unseen grading AND a scored metric
  {
    let checked = 0;
    for (const l of lessons) {
      const r = rigorOf(l);
      for (const m of l.raw.matchAll(/<RobotLab\b[\s\S]*?\/>/g)) {
        const lab = m[0];
        const g = lab.match(/goal=["']([^"']+)["']/)?.[1] || 'free';
        if (g === 'free') continue;
        checked++;
        const seeds = Number(lab.match(/\bseeds=\{?["']?(\d+)/)?.[1] || 0);
        const fixed = /\bfixedWorld[=\s/>]/.test(lab);
        const hasPredict = /predict=["'](choice|number)["']/.test(lab);
        const unseen = /\bunseen\b/.test(lab);
        const scored = /\bscoreBy=/.test(lab);
        if (r >= 2 && !(seeds >= 5 || fixed))
          bad('C-RIGOR-IMPL', `${l.slug} (R${r}) graded lab must grade across seeds>=5 or declare fixedWorld`);
        else if (r >= 3 && !hasPredict)
          bad('C-RIGOR-IMPL', `${l.slug} (R${r}) graded lab must configure predict`);
        else if (r >= 4 && !(unseen && scored))
          bad('C-RIGOR-IMPL', `${l.slug} (R${r}) graded lab must use unseen seeds and a scored metric`);
        else
          ok('C-RIGOR-IMPL', `${l.slug} (R${r}) grading props satisfy its rigor`);
      }
    }
    if (!checked) ok('C-RIGOR-IMPL', 'no graded labs to check');
  }
}

// ---------- C-SEEDS & C-NOSHORTCUT: seeded missions are well-posed -----------
// Every seeded mission's reference solution passes (solvable), and its
// hard-coded straight-line drive fails (can't be brute-forced). Run against the
// deterministic grader — the same guarantee scripts/test-references.mjs checks.
{
  if (!SEED_MISSIONS.length) {
    ok('C-SEEDS', 'no seeded missions declared yet');
  } else {
    for (const mi of SEED_MISSIONS) {
      let world;
      try { world = JSON.parse(await readFile(path.join(ROOT, 'src/content/worlds', mi.worldId + '.json'), 'utf8')); }
      catch { bad('C-SEEDS', `seeded mission ${mi.id} references missing world ${mi.worldId}`); continue; }
      const good = await grade(mi.good, world, { seeds: mi.seeds, mustPass: mi.mustPass, goal: mi.goal });
      const hard = await grade(mi.hard, world, { seeds: mi.seeds, mustPass: mi.mustPass, goal: mi.goal });
      good.passed ? ok('C-SEEDS', `${mi.id}: reference solution passes ${good.passedCount}/${mi.seeds.length}`)
        : bad('C-SEEDS', `${mi.id}: reference solution only passes ${good.passedCount}/${mi.seeds.length} (need ${mi.mustPass}) — unsolvable`);
      !hard.passed ? ok('C-NOSHORTCUT', `${mi.id}: a hard-coded straight-line drive fails (passed ${hard.passedCount}/${mi.seeds.length})`)
        : bad('C-NOSHORTCUT', `${mi.id}: a hard-coded drive passes ${hard.passedCount}/${mi.seeds.length} — mission is brute-forceable`);
    }
  }
}

// ---------- Projects & portfolio (PRD §9, §16) ------------------------------
{
  let projects = null;
  try { projects = JSON.parse(await readFile(path.join(ROOT, 'src/content/projects.json'), 'utf8')).projects; }
  catch { bad('C-PROJECTS', 'src/content/projects.json missing or invalid'); }

  if (projects) {
    // C-PROJECTS: exactly 12, one per module, each fully specified; P4+ real.
    projects.length === 12 ? ok('C-PROJECTS', '12 projects defined') : bad('C-PROJECTS', `expected 12 projects, found ${projects.length}`);
    const ids = new Set(projects.map((p) => p.id));
    ids.size === projects.length ? ok('C-PROJECTS', 'project ids are unique') : bad('C-PROJECTS', 'duplicate project ids');
    for (const p of projects) {
      const b = p.brief || {};
      const spec = b.goal && b.metric && Array.isArray(b.constraints) && Array.isArray(b.evidence) && b.evidence.length && p.simMilestone && Array.isArray(p.rubric);
      spec ? ok('C-PROJECTS', `${p.id} has brief, rubric, sim milestone and evidence`)
        : bad('C-PROJECTS', `${p.id} is missing brief/metric/evidence/simMilestone/rubric`);
      const n = Number(p.id.slice(1));
      if (n >= 4 && !(typeof p.realMilestone === 'string' && p.realMilestone)) bad('C-PROJECTS', `${p.id} (module ${p.module}) must have a real milestone`);
      if (n <= 3 && p.realMilestone !== null) bad('C-PROJECTS', `${p.id} is sim-only and must have realMilestone null`);
    }

    // C-RUBRIC: every rubric item maps to a checkable record field.
    let rubricOk = true;
    for (const p of projects) {
      const fields = new Set();
      for (const r of p.rubric || []) {
        if (!r.id || !r.label || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(r.field || '')) { bad('C-RUBRIC', `${p.id} rubric item needs id/label and a camelCase field`); rubricOk = false; }
        if (fields.has(r.field)) { bad('C-RUBRIC', `${p.id} has a duplicate rubric field "${r.field}"`); rubricOk = false; }
        fields.add(r.field);
      }
      if (!(p.rubric?.length >= 2 && p.rubric.length <= 4)) { bad('C-RUBRIC', `${p.id} must have 2–4 rubric items`); rubricOk = false; }
    }
    if (rubricOk) ok('C-RUBRIC', 'every project rubric item has a unique checkable field');
  }

  // C-TEMPLATE: the generator, the entry template and the T2 verifier agree on
  // the section headings, so they cannot drift apart.
  {
    const verifierSrc = await readFile(path.join(ROOT, 'functions/api/verify-entry.js'), 'utf8');
    const block = verifierSrc.match(/REQUIRED_HEADINGS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    // Match a string literal delimited by matching quotes, tolerating a
    // different quote char (e.g. an apostrophe) inside it.
    const verifierHeadings = [...block.matchAll(/(["'`])((?:\\.|(?!\1).)*?)\1/g)].map((m) => m[2]);
    const same = verifierHeadings.length === ENTRY_HEADINGS.length && ENTRY_HEADINGS.every((h, i) => verifierHeadings[i] === h);
    same ? ok('C-TEMPLATE', 'entry generator and T2 verifier share the same headings')
      : bad('C-TEMPLATE', `template headings drift: generator=${JSON.stringify(ENTRY_HEADINGS)} verifier=${JSON.stringify(verifierHeadings)}`);

    const sample = { id: 'p01', module: 1, title: 'X', rigor: 1, brief: { goal: 'g', metric: 'm', constraints: ['c'], evidence: ['e'] }, rubric: [{ id: 'a', label: 'A', field: 'a' }], realMilestone: null };
    const md = buildEntryMarkdown(sample);
    const missingH = ENTRY_HEADINGS.filter((h) => !md.includes(`## ${h}`));
    missingH.length ? bad('C-TEMPLATE', `generated entry is missing headings: ${missingH.join(', ')}`)
      : ok('C-TEMPLATE', 'generated entry contains every required heading');
  }

  // C-PRIVACY: the media policy screen exists and is linked from the project pages.
  {
    let policyExists = false;
    try { await readFile(path.join(ROOT, 'src/pages/media-policy.astro'), 'utf8'); policyExists = true; } catch {}
    policyExists ? ok('C-PRIVACY', 'media policy page exists') : bad('C-PRIVACY', 'src/pages/media-policy.astro is missing');
    const linkedFrom = [];
    for (const f of ['src/pages/projects/index.astro', 'src/pages/projects/[id].astro']) {
      const src = await readFile(path.join(ROOT, f), 'utf8').catch(() => '');
      if (/\/media-policy\//.test(src)) linkedFrom.push(f);
    }
    linkedFrom.length >= 2 ? ok('C-PRIVACY', 'both project pages link to the media policy')
      : bad('C-PRIVACY', 'the media policy must be linked from the projects list and each project page');
  }
}

// ---------- report ----------------------------------------------------------
console.log(passes.join('\n'));
if (fails.length) {
  console.log('\n' + fails.join('\n'));
  console.log(`\n✗ ${fails.length} condition(s) failing — loop continues.`);
  process.exit(1);
}
console.log(`\n✓ All ${passes.length} conditions pass.`);
