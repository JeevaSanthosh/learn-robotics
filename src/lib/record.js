// The learner record — v2 schema, migration, validation, and skill mastery.
//
// WHY THIS MODULE EXISTS SEPARATELY FROM progress.js
// progress.js is the browser layer: it touches localStorage, dispatches DOM
// events, and triggers file downloads. None of that can run — or be tested —
// under Node. Everything here is PURE: it takes a plain object and returns a
// plain object, references no `window`/`localStorage`/`document`, and is
// therefore importable by `scripts/verify.mjs` and the test suites. That split
// is what makes C-MIGRATE, C-SCHEMA and C-BACKUP machine-checkable (PRD §16).

// Storage keys. v1 is the shipped format; v2 is this one. The v1 blob is copied
// to BACKUP_KEY before it is ever replaced, so an upgrade can never be the
// thing that loses a year of records (PRD §11.6, R9).
export const PROGRESS_KEY = 'lr-progress-v2';
export const LEGACY_KEY = 'lr-progress-v1';
export const BACKUP_KEY = 'lr-progress-v1-backup';

export const SCHEMA_VERSION = 2;

// --- Mastery and spaced review (PRD §11.5) ---------------------------------
// Level 0–5 per skill. After being answered correctly at level L, the skill is
// not due for review for REVIEW_INTERVALS[L] days. A skill left past its due
// date decays one level — which is what makes month-11 revisit month-2 material
// without anyone scheduling it by hand.
export const REVIEW_INTERVALS = [1, 3, 7, 16, 35, 90]; // days, indexed by level
export const MAX_LEVEL = 5;

const DAY_MS = 86400000;

// v1 stored per-topic hit rates; v2 stores per-skill mastery. This maps each of
// the eight assessment topics onto the canonical skill ids they exercise, so a
// year of v1 assessment history is not thrown away on upgrade (PRD §11.6). The
// ids must all exist in src/content/skills.json — C-SKILLMAP guards that.
export const TOPIC_TO_SKILLS = {
  loops: ['logic.loop.counted', 'logic.loop.nested'],
  sensing: ['sense.range', 'sense.threshold', 'sense.blindspot'],
  actuators: ['act.led', 'act.drive'],
  electricity: ['elec.voltage', 'elec.current', 'elec.ohm'],
  events: ['logic.event', 'logic.interrupt'],
  tracing: ['core.sequence', 'logic.order'],
  motors: ['act.gear-ratio', 'act.torque'],
  debugging: ['debug.trace', 'debug.isolate'],
};

// --- The empty v2 record ----------------------------------------------------
// Every top-level key present from the start so callers never guard against
// `undefined`, migration has a complete target to fill, and validate() has a
// fixed shape to check. Scaffold sections (missions, projects, reasoning) are
// wired by later phases; they exist now so the schema is stable from day one.
export function emptyRecord(now = new Date()) {
  const iso = typeof now === 'string' ? now : now.toISOString();
  const day = iso.slice(0, 10);
  return {
    version: SCHEMA_VERSION,
    createdAt: iso,
    // First-launch date. Kept ONLY as the anchor for the activity heatmap — no
    // progress value is derived from it any more (PRD-UX §5.2, C-NOCAL): pacing
    // comes from modules completed (`currentStage`), never from the calendar.
    yearStart: day,
    pace: 'standard', // standard | relaxed | intense

    lessons: {}, // slug -> { completedAt, attempts, timeMs }
    quizzes: {}, // slug -> { best: { score, total }, attempts: [] }
    missions: {}, // labId -> grading record (Phase 1/3)

    skills: {}, // id -> { right, wrong, level, lastSeen, nextReview }

    reasoning: {
      predictions: { total: 0, correct: 0, byStage: {} },
      debug: { attempted: 0, firstTry: 0, hintsUsed: 0 },
      constraints: { solved: [] },
      unassisted: { missions: 0, withTutor: 0 },
      explanations: { asked: 0, answered: 0, probesAnswered: 0 },
    },

    projects: {}, // pNN -> project record (Phase 4)

    assessments: [], // { at, difficulty, score, total, skills? }
    topicStats: {}, // topic -> { right, wrong } — kept for the existing page

    gates: { A: { openedAt: null }, B: { openedAt: null } },
    hardware: { microbit: false, chassis: false, esp32: false, camera: false, notes: '' },

    logbook: [], // { at, kind, moduleId?, text }
    daily: {}, // 'YYYY-MM-DD' -> { lessons, exercises, runs, assessments, best }
    activeDays: [],
    exercises: [], // ids of ticked-off in-lesson exercises (carried from v1)
    badges: [],

    settings: {
      theme: 'auto', autoRun: true, telemetry: false,
      noiseDefault: true, reducedMotion: false,
    },
  };
}

// --- The empty per-project record -------------------------------------------
// `projects` above starts empty; this is the shape written the first time a
// learner touches project pNN (progress.js `ensureProject`). Keeping it here
// rather than inline in the browser layer means migration and validate() know
// the shape too.
//
// The stages, in order: design (think before you build) -> sim -> build ->
// evidence -> review.
//   design.approach / design.unsureAbout — what you intend to build, and what
//     you are not sure about yet. Written BEFORE building; `lockedAt` stamps
//     the moment it was committed to, so a design cannot be quietly rewritten
//     after the fact to match whatever got built.
//   design.bom — the bill of materials: [{ part, qty, notes }]-ish rows.
//   design.connections — the wiring plan: [{ from, to, notes }]-ish rows.
//   build.photos — evidence photos (see the hard constraint below).
//   build.matches / build.changes — where the real build matched the design,
//     and where it had to change. The gap is the learning.
//
// ⚠ HARD CONSTRAINT — build.photos entries hold ONLY a reference, never image
// bytes. The shape is { id, w, h, addedAt } where `id` is an IndexedDB key
// string; the actual image lives in IndexedDB. The whole record is
// JSON.stringify'd into a SINGLE localStorage key (~5 MB total for the origin)
// and exported as one JSON file. A base64-encoded phone photo is 3–8 MB on its
// own, so inlining even one would make save() throw mid-write and silently stop
// persisting progress from then on — losing the year, not just the photo. Do
// not "helpfully" add a `data`/`dataUrl`/`src`/`bytes` field here; validate()
// rejects those on purpose.
export function emptyProjectRecord() {
  return {
    status: 'not-started', simPassedAt: null, entryUrl: null,
    verifiedAt: null, verifyTier: null, rubric: {}, probes: [], attestation: null,
    design: { lockedAt: null, approach: '', unsureAbout: '', bom: [], connections: [] },
    build: { photos: [], matches: [], changes: [] },
  };
}

// --- Migration (PRD §11.6) --------------------------------------------------
// Pure and idempotent: migrate(migrate(x)) deep-equals migrate(x). A v2 record
// is normalised (missing keys back-filled) rather than rebuilt, so re-running
// on already-migrated data is a no-op. A v1 record is mapped field by field;
// nothing is dropped.
export function migrate(raw, now = new Date()) {
  const base = emptyRecord(now);
  if (raw == null || typeof raw !== 'object') return base;

  if (raw.version === SCHEMA_VERSION) return normalize(raw, base);

  // ---- v1 -> v2 ----
  const out = base;

  for (const slug of raw.completed || [])
    out.lessons[slug] = { completedAt: null, attempts: 1, timeMs: 0 };

  for (const [slug, q] of Object.entries(raw.quizScores || {}))
    out.quizzes[slug] = { best: { score: q.score, total: q.total }, attempts: [] };

  // topicStats -> skills, counts divided evenly across the mapped skills and
  // rounded down (documented as approximate in §11.6).
  for (const [topic, stat] of Object.entries(raw.topicStats || {})) {
    const ids = TOPIC_TO_SKILLS[topic];
    if (!ids) continue;
    const right = Math.floor((stat.right || 0) / ids.length);
    const wrong = Math.floor((stat.wrong || 0) / ids.length);
    for (const id of ids) {
      const s = out.skills[id] || blankSkill();
      s.right += right;
      s.wrong += wrong;
      s.level = levelFromAccuracy(s.right, s.wrong);
      out.skills[id] = s;
    }
  }
  out.topicStats = structuredCloneSafe(raw.topicStats || {});

  out.assessments = (raw.assessments || []).map((a) => ({ ...a }));
  out.daily = structuredCloneSafe(raw.daily || {});
  out.activeDays = [...(raw.activeDays || [])];
  out.exercises = [...(raw.exercises || [])];
  out.badges = [...(raw.badges || [])];
  if (raw.createdAt) out.createdAt = raw.createdAt;

  return out;
}

// Back-fill any keys a v2 blob is missing (older v2 written before a field was
// added) without disturbing what is there. Deep-merges only the fixed
// sub-objects; user-keyed maps are taken as-is.
function normalize(raw, base) {
  const out = { ...base, ...raw, version: SCHEMA_VERSION };
  out.reasoning = deepDefaults(raw.reasoning, base.reasoning);
  out.reasoning.predictions = stagesFromQuarters(out.reasoning.predictions);
  out.gates = deepDefaults(raw.gates, base.gates);
  out.hardware = { ...base.hardware, ...(raw.hardware || {}) };
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  for (const k of ['lessons', 'quizzes', 'missions', 'skills', 'projects', 'topicStats', 'daily'])
    out[k] = raw[k] && typeof raw[k] === 'object' ? raw[k] : {};
  for (const k of ['assessments', 'activeDays', 'exercises', 'badges', 'logbook'])
    out[k] = Array.isArray(raw[k]) ? raw[k] : [];
  // Project records written before the design/build stages existed get the new
  // sub-objects back-filled, same as any other field added since v2 shipped.
  out.projects = Object.fromEntries(
    Object.entries(out.projects).map(([pid, p]) => [pid, normalizeProjectRecord(p)])
  );
  return out;
}

// Back-fill one project record. Key order comes from emptyProjectRecord(), with
// any extra keys the record already carries (e.g. `results`) kept on the end —
// which is what keeps the export round-trip byte-identical (C-BACKUP).
function normalizeProjectRecord(p) {
  const base = emptyProjectRecord();
  if (!p || typeof p !== 'object' || Array.isArray(p)) return base;
  const out = { ...base, ...p };
  out.design = deepDefaults(p.design, base.design);
  out.build = deepDefaults(p.build, base.build);
  return out;
}

// Forward migration WITHIN v2 (PRD-UX §5.2, C-NOCAL). Predictions used to be
// bucketed by wall-clock quarter (`byQuarter: {Q1..Q4}`); they are now bucketed
// by curriculum stage (`byStage: {S1..S4}`), which is derived from modules
// completed. Q1→S1 … Q4→S4 one-to-one, carrying {total, correct} across; the
// counts are summed in case both shapes are present. Dropping `byQuarter` is
// what makes this idempotent — a second pass finds nothing left to move.
// No SCHEMA_VERSION bump: migrate() has exactly one legacy branch (v1, which is
// version-less), so bumping to 3 would push every stored v2 record down the v1
// path and shred it. Additive/renaming v2 changes are absorbed here, the same
// way every field added since v2 shipped has been.
function stagesFromQuarters(predictions) {
  const old = predictions.byQuarter;
  delete predictions.byQuarter;
  if (!old || typeof old !== 'object') return predictions;
  if (!predictions.byStage || typeof predictions.byStage !== 'object') predictions.byStage = {};
  for (const [key, v] of Object.entries(old)) {
    const m = /^Q([1-4])$/.exec(key);
    if (!m || !v || typeof v !== 'object') continue;
    const prev = predictions.byStage['S' + m[1]] || { total: 0, correct: 0 };
    predictions.byStage['S' + m[1]] = {
      total: (prev.total || 0) + (v.total || 0),
      correct: (prev.correct || 0) + (v.correct || 0),
    };
  }
  return predictions;
}

function deepDefaults(value, defaults) {
  if (!value || typeof value !== 'object') return structuredCloneSafe(defaults);
  const out = Array.isArray(defaults) ? [...value] : { ...defaults, ...value };
  if (!Array.isArray(defaults))
    for (const [k, d] of Object.entries(defaults))
      if (d && typeof d === 'object' && !Array.isArray(d)) out[k] = deepDefaults(value[k], d);
  return out;
}

function blankSkill() {
  return { right: 0, wrong: 0, level: 0, lastSeen: null, nextReview: null };
}

function levelFromAccuracy(right, wrong) {
  const asked = right + wrong;
  if (!asked) return 0;
  return Math.max(0, Math.min(MAX_LEVEL, Math.floor((right / asked) * MAX_LEVEL)));
}

// structuredClone exists in modern browsers and Node ≥17; fall back for safety.
function structuredCloneSafe(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

// --- Skill mastery mutations (pure) ----------------------------------------
/**
 * Record one graded answer for a skill and reschedule its review.
 * @returns the same record (mutated in place, then returned for chaining)
 */
export function applySkillEvent(record, id, correct, now = new Date()) {
  const iso = typeof now === 'string' ? now : now.toISOString();
  const s = record.skills[id] || blankSkill();
  if (correct) { s.right++; s.level = Math.min(MAX_LEVEL, s.level + 1); }
  else { s.wrong++; s.level = Math.max(0, s.level - 1); }
  s.lastSeen = iso;
  s.nextReview = new Date(Date.parse(iso) + REVIEW_INTERVALS[s.level] * DAY_MS).toISOString();
  record.skills[id] = s;
  return record;
}

/**
 * Decay every skill left past its review date by one level, and reschedule it
 * sooner. Applied on load so time passing has an effect even with no activity.
 * @returns { changed: boolean }
 */
export function decayDue(record, now = new Date()) {
  const nowMs = typeof now === 'number' ? now : Date.parse(typeof now === 'string' ? now : now.toISOString());
  let changed = false;
  for (const s of Object.values(record.skills)) {
    if (!s.nextReview || s.level <= 0) continue;
    if (nowMs > Date.parse(s.nextReview)) {
      s.level = Math.max(0, s.level - 1);
      s.nextReview = new Date(nowMs + REVIEW_INTERVALS[s.level] * DAY_MS).toISOString();
      changed = true;
    }
  }
  return { changed };
}

/** Skills whose review is due (or overdue), soonest first. Drives the drill slot. */
export function dueSkills(record, now = new Date()) {
  const nowMs = typeof now === 'number' ? now : Date.parse(typeof now === 'string' ? now : now.toISOString());
  return Object.entries(record.skills)
    .filter(([, s]) => s.nextReview && Date.parse(s.nextReview) <= nowMs)
    .sort((a, b) => Date.parse(a[1].nextReview) - Date.parse(b[1].nextReview))
    .map(([id, s]) => ({ id, ...s }));
}

// --- Validation (PRD §16 C-SCHEMA) -----------------------------------------
/** @returns {{ ok: boolean, errors: string[] }} */
export function validate(record) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  req(isObj(record), 'record is not an object');
  if (!isObj(record)) return { ok: false, errors };

  req(record.version === SCHEMA_VERSION, `version must be ${SCHEMA_VERSION}`);
  req(typeof record.createdAt === 'string', 'createdAt must be a string');
  req(/^\d{4}-\d{2}-\d{2}$/.test(record.yearStart || ''), 'yearStart must be YYYY-MM-DD');

  for (const k of ['lessons', 'quizzes', 'missions', 'skills', 'projects', 'topicStats', 'daily', 'gates', 'hardware', 'settings', 'reasoning'])
    req(isObj(record[k]), `${k} must be an object`);
  for (const k of ['assessments', 'activeDays', 'exercises', 'badges', 'logbook'])
    req(Array.isArray(record[k]), `${k} must be an array`);

  for (const [id, s] of Object.entries(record.skills || {})) {
    req(isObj(s), `skill ${id} must be an object`);
    if (!isObj(s)) continue;
    req(Number.isInteger(s.level) && s.level >= 0 && s.level <= MAX_LEVEL, `skill ${id} level out of range`);
    req(typeof s.right === 'number' && typeof s.wrong === 'number', `skill ${id} missing right/wrong counts`);
  }

  // Project records: the design and build stages must be present and the right
  // shape, and a build photo must be a REFERENCE — see emptyProjectRecord().
  for (const [pid, p] of Object.entries(record.projects || {})) {
    req(isObj(p), `project ${pid} must be an object`);
    if (!isObj(p)) continue;
    req(isObj(p.design), `project ${pid} design must be an object`);
    req(isObj(p.build), `project ${pid} build must be an object`);
    if (isObj(p.design))
      for (const k of ['bom', 'connections'])
        req(Array.isArray(p.design[k]), `project ${pid} design.${k} must be an array`);
    if (!isObj(p.build)) continue;
    for (const k of ['photos', 'matches', 'changes'])
      req(Array.isArray(p.build[k]), `project ${pid} build.${k} must be an array`);
    for (const ph of Array.isArray(p.build.photos) ? p.build.photos : []) {
      req(isObj(ph) && typeof ph.id === 'string', `project ${pid} build photo must be { id, w, h, addedAt }`);
      req(isObj(ph) && !['data', 'dataUrl', 'src', 'bytes', 'blob'].some((k) => k in ph),
        `project ${pid} build photo must reference IndexedDB by id — image bytes must never be stored in the record`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// --- Serialize / deserialize (PRD §16 C-BACKUP) ----------------------------
// Export writes serialize(); import runs deserialize(), which normalises via
// migrate() so a v1 file still imports. For a normalised v2 record the
// round-trip is byte-identical: serialize(deserialize(serialize(r))) === serialize(r).
export function serialize(record) {
  return JSON.stringify(record, null, 2);
}

export function deserialize(text, now = new Date()) {
  return migrate(JSON.parse(text), now);
}
