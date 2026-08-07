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
    const fm = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
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
  const gateQuiz = progressSrc.match(/gateQuiz:\s*'([^']+)'/)?.[1];
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

// ---------- report ----------------------------------------------------------
console.log(passes.join('\n'));
if (fails.length) {
  console.log('\n' + fails.join('\n'));
  console.log(`\n✗ ${fails.length} condition(s) failing — loop continues.`);
  process.exit(1);
}
console.log(`\n✓ All ${passes.length} conditions pass.`);
