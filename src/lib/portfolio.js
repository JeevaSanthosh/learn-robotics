// Portfolio entry generation (PRD §9.3). Turns a project + the learner's sim
// result into a ready-to-commit entry: a README.md skeleton pre-filled with the
// brief, rubric checklist and results, plus the program export — as a copyable
// markdown block and a downloadable zip. The learner commits it to their own
// GitHub repo; we never store any of it (§9.3 privacy).
//
// The section headings are the CONTRACT between three things that must never
// drift apart (C-TEMPLATE): what the generator writes, what the learner fills
// in, and what the T2 verifier (functions/api/verify-entry.js) checks for.

/** The `## ` sections every entry must contain. T2 verification looks for these. */
export const ENTRY_HEADINGS = [
  'Brief',
  'Rubric',
  'Results',
  'Why does this work?',
  "What did you try that didn't?",
  'What would break it?',
  'Evidence',
];

/** Extra heading required once a project has a real-hardware milestone (§9.5). */
export const SIM_VS_REAL_HEADING = 'Sim vs real';

/**
 * Build the entry README markdown for a project.
 * @param {object} project  one entry from projects.json
 * @param {object} data     { results?, generatedAt? }
 */
export function buildEntryMarkdown(project, data = {}) {
  const rubric = project.rubric.map((r) => `- [ ] ${r.label}`).join('\n');
  const constraints = (project.brief.constraints || []).map((c) => `- ${c}`).join('\n');
  const evidence = (project.brief.evidence || []).map((e) => `- ${e}`).join('\n');
  const results = data.results
    ? '```json\n' + JSON.stringify(data.results, null, 2) + '\n```'
    : '_Paste your simulator result here (the site generates `results.json` for you)._';

  const lines = [
    `# ${project.title}`,
    '',
    `_Learn Robotics — Project ${project.id.toUpperCase()}, Module ${project.module}_`,
    '',
    '## Brief',
    project.brief.goal,
    '',
    `**Success metric:** ${project.brief.metric}`,
    '',
    constraints ? `**Constraints:**\n${constraints}\n` : '',
    '## Rubric',
    rubric,
    '',
    '## Results',
    results,
    '',
    '## Why does this work?',
    '_Explain the mechanism, not the steps._',
    '',
    "## What did you try that didn't?",
    '_Name at least one specific approach that failed, and why._',
    '',
    '## What would break it?',
    '_Name a condition under which your solution stops working._',
    '',
    '## Evidence',
    evidence ? `What to capture:\n${evidence}\n` : '',
    '_Add photos or video links here. **Strip EXIF/location first** — see the media policy._',
    '',
  ];

  if (project.realMilestone) {
    lines.push(
      `## ${SIM_VS_REAL_HEADING}`,
      `**Real milestone:** ${project.realMilestone}`,
      '',
      '_What did the simulator predict, what actually happened, and what accounts for the difference? (friction, battery sag, sensor cone, motor deadband, latency, wheel slip, floor surface…)_',
      ''
    );
  }

  return lines.filter((l) => l !== '').join('\n') + '\n';
}

/**
 * Two probing questions for the T3 design review (PRD §14.3). These are the
 * offline/always-free fallback — pointed, answerable by the learner, tied to
 * THIS project's goal and failure modes (never rhetorical). When online the
 * tutor can generate sharper ones from the actual writeup, but these always
 * work and cost nothing.
 */
export function designReviewQuestions(project) {
  return [
    `You aimed for: "${project.brief.metric}". What is the single observation that convinced you it worked — and how would you know if you were fooling yourself?`,
    `Name the one condition most likely to break "${project.title}". Why that one, and what would you change so it survives it?`,
  ];
}

/** The set of files that make up an entry folder, keyed by relative path. */
export function entryFiles(project, data = {}) {
  const files = {
    'README.md': buildEntryMarkdown(project, data),
  };
  if (data.results) files['results.json'] = JSON.stringify(data.results, null, 2) + '\n';
  if (data.program) files['program.blocks.json'] = JSON.stringify(data.program, null, 2) + '\n';
  return files;
}

// --- a tiny dependency-free ZIP writer (store, no compression) --------------
// A real zip so "Download entry" works offline (HC4), without pulling in a
// library (HC7). Store-only is fine for a few small text files.
function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/** @param {Record<string,string>} files  path -> text content @returns {Blob} */
export function buildZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const push = (arr) => { const b = Uint8Array.from(arr); chunks.push(b); offset += b.length; };
  const pushBytes = (b) => { chunks.push(b); offset += b.length; };

  const central = []; // { nameBytes, crc, len, localOffset }
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const localOffset = offset;
    // local file header + name + data (store, no compression)
    push([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)]);
    pushBytes(nameBytes);
    pushBytes(data);
    central.push({ nameBytes, crc, len: data.length, localOffset });
  }

  // central directory
  const cdOffset = offset;
  for (const c of central) {
    push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(c.crc), ...u32(c.len), ...u32(c.len), ...u16(c.nameBytes.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.localOffset)]);
    pushBytes(c.nameBytes);
  }
  const cdSize = offset - cdOffset;
  // end of central directory
  push([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(cdSize), ...u32(cdOffset), ...u16(0)]);

  return new Blob(chunks, { type: 'application/zip' });
}
