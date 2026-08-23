// Tests for portfolio entry generation (PRD §9.3). The generator, the template
// the learner fills in, and the T2 verifier must agree on the section headings
// (C-TEMPLATE); and the zip must be a real, openable archive (offline, no deps).
import { ENTRY_HEADINGS, SIM_VS_REAL_HEADING, buildEntryMarkdown, entryFiles, buildZip } from '../src/lib/portfolio.js';

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);

const simProject = {
  id: 'p01', module: 1, title: 'Signal lamp', rigor: 1,
  brief: { goal: 'Design an LED pattern.', metric: 'It is recognisable.', constraints: ['Sim only.'], evidence: ['sim result', 'meaning'] },
  rubric: [{ id: 'runs', label: 'It runs', field: 'runs' }, { id: 'meaning', label: 'You explained it', field: 'meaning' }],
  simMilestone: 'LED pattern verified', realMilestone: null, proofTier: 'T1',
};
const realProject = { ...simProject, id: 'p04', module: 4, title: 'Strong or fast', realMilestone: 'Timed 1 m runs on the real chassis.', proofTier: 'T2' };

// ---- headings ----
{
  const md = buildEntryMarkdown(simProject, { results: { passed: true, seeds: 5 } });
  for (const h of ENTRY_HEADINGS) t(`P headings: entry contains "## ${h}"`, md.includes(`## ${h}`));
  t('P sim-only entry omits Sim vs real', !md.includes(`## ${SIM_VS_REAL_HEADING}`));
  t('P results are embedded when provided', md.includes('"seeds": 5') || md.includes('"passed": true'));
  t('P rubric renders as an unticked checklist', md.includes('- [ ] It runs'));

  const rmd = buildEntryMarkdown(realProject);
  t('P real-milestone entry includes Sim vs real', rmd.includes(`## ${SIM_VS_REAL_HEADING}`));
}

// ---- entry files ----
{
  const f1 = entryFiles(simProject, {});
  t('P README.md is always produced', typeof f1['README.md'] === 'string' && f1['README.md'].length > 0);
  t('P results/program files omitted when absent', !f1['results.json'] && !f1['program.blocks.json']);
  const f2 = entryFiles(simProject, { results: { ok: true }, program: { blocks: {} } });
  t('P results.json + program.blocks.json produced when provided', !!f2['results.json'] && !!f2['program.blocks.json']);
}

// ---- zip is a real archive ----
{
  const blob = buildZip({ 'README.md': '# Hello\n', 'results.json': '{"ok":true}\n' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sig = (i) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
  t('P zip starts with a local file header signature', (sig(0) >>> 0) === 0x04034b50);
  // find end-of-central-directory signature near the tail
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) if ((sig(i) >>> 0) === 0x06054b50) { eocd = i; break; }
  t('P zip ends with an end-of-central-directory record', eocd >= 0);
  const total = bytes[eocd + 10] | (bytes[eocd + 11] << 8);
  t('P zip records both files', total === 2, `counted ${total}`);
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} portfolio test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} portfolio tests pass`);
