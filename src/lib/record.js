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
    yearStart: day, // rolling from first launch; drives the week plan (§20 Q5)
    pace: 'standard', // standard | relaxed | intense

    lessons: {}, // slug -> { completedAt, attempts, timeMs }
    quizzes: {}, // slug -> { best: { score, total }, attempts: [] }
    missions: {}, // labId -> grading record (Phase 1/3)

    skills: {}, // id -> { right, wrong, level, lastSeen, nextReview }

    reasoning: {
      predictions: { total: 0, correct: 0, byQuarter: {} },
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
  out.gates = deepDefaults(raw.gates, base.gates);
  out.hardware = { ...base.hardware, ...(raw.hardware || {}) };
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  for (const k of ['lessons', 'quizzes', 'missions', 'skills', 'projects', 'topicStats', 'daily'])
    out[k] = raw[k] && typeof raw[k] === 'object' ? raw[k] : {};
  for (const k of ['assessments', 'activeDays', 'exercises', 'badges', 'logbook'])
    out[k] = Array.isArray(raw[k]) ? raw[k] : [];
  return out;
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
