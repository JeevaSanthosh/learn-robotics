// Single-user, per-browser progress tracking (locked decision: localStorage
// only). Everything here is a pedagogical gate, not a security one — it is fine
// that it can be bypassed via devtools.
//
// This is the BROWSER layer. The record's shape, migration, validation and
// skill-mastery maths live in ./record.js, which is pure and Node-importable so
// verify.mjs and the test suites can check them (PRD §11, §16). This file adds
// the things that only exist in a browser: localStorage, the change event, and
// file download/upload.

import {
  PROGRESS_KEY, LEGACY_KEY, BACKUP_KEY,
  emptyRecord, emptyProjectRecord, migrate, validate, decayDue,
  applySkillEvent, dueSkills, serialize, deserialize,
  TOPIC_TO_SKILLS,
} from './record.js';

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// --- load / save ------------------------------------------------------------
// load() is the one place the v1 -> v2 upgrade happens. The v1 blob is copied to
// a backup key BEFORE the v2 key is written, so the upgrade can never be the
// step that loses a year of records (PRD §11.6, R9). Skill decay is applied on
// every load so time passing lowers mastery even with no activity, and is
// persisted when it changes.
export function load() {
  let record;
  try {
    const rawV2 = localStorage.getItem(PROGRESS_KEY);
    if (rawV2) {
      record = migrate(JSON.parse(rawV2));
    } else {
      const rawV1 = localStorage.getItem(LEGACY_KEY);
      if (rawV1) {
        if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, rawV1);
        record = migrate(JSON.parse(rawV1));
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(record));
      } else {
        record = emptyRecord();
      }
    }
  } catch {
    return emptyRecord();
  }
  const { changed } = decayDue(record);
  if (changed) localStorage.setItem(PROGRESS_KEY, JSON.stringify(record));
  return record;
}

function save(state) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('lr-progress', { detail: state }));
}

function markActive(s) {
  if (!s.activeDays.includes(today())) s.activeDays.push(today());
}

function bumpDaily(s, field, by = 1) {
  const d = (s.daily[today()] = s.daily[today()] || {
    lessons: 0, exercises: 0, runs: 0, assessments: 0, best: 0,
  });
  d[field] = (d[field] || 0) + by;
  return d;
}

// --- activity ---------------------------------------------------------------
/** Called whenever the learner presses Run — the truest signal of activity. */
export function recordRun(lessonId) {
  const s = load();
  bumpDaily(s, 'runs');
  markActive(s);
  save(s);
}

/** A practical exercise ticked off inside a lesson. */
export function recordExercise(exerciseId) {
  const s = load();
  if (!s.exercises.includes(exerciseId)) {
    s.exercises.push(exerciseId);
    bumpDaily(s, 'exercises');
  }
  markActive(s);
  awardBadges(s);
  save(s);
  return s;
}

export function isExerciseDone(exerciseId) {
  return load().exercises.includes(exerciseId);
}

// --- streaks & heatmap ------------------------------------------------------
/** Consecutive days up to and including today (or yesterday, so a day in
 *  progress doesn't look like a broken streak). */
export function currentStreak() {
  const days = new Set(load().activeDays);
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function longestStreak() {
  const days = [...new Set(load().activeDays)].sort();
  let best = 0, run = 0, prev = null;
  for (const day of days) {
    const cur = new Date(day);
    run = prev && (cur - prev) / 86400000 === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return best;
}

/** Last `days` days, oldest first — for the calendar heatmap. */
export function dailyHistory(days = 35) {
  const s = load();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const rec = s.daily[key];
    const activity = rec ? rec.lessons * 3 + rec.exercises * 2 + rec.assessments * 2 + Math.min(rec.runs, 6) : 0;
    out.push({ date: key, activity, ...(rec || { lessons: 0, exercises: 0, runs: 0, assessments: 0 }) });
  }
  return out;
}

// --- lessons & quizzes ------------------------------------------------------
export function completeLesson(slug) {
  const s = load();
  const prev = s.lessons[slug];
  s.lessons[slug] = {
    completedAt: prev?.completedAt || new Date().toISOString(),
    attempts: (prev?.attempts || 0) + 1,
    timeMs: prev?.timeMs || 0,
  };
  if (!prev) bumpDaily(s, 'lessons');
  markActive(s);
  awardBadges(s);
  save(s);
  return s;
}

export function recordQuiz(slug, score, total) {
  const s = load();
  const entry = (s.quizzes[slug] = s.quizzes[slug] || { best: null, attempts: [] });
  entry.attempts.push({ at: new Date().toISOString(), score, total });
  if (!entry.best || score > entry.best.score) entry.best = { score, total };
  markActive(s);
  awardBadges(s);
  save(s);
  return s;
}

export function isComplete(slug) {
  return slug in load().lessons;
}

/** The completed lesson slugs, as an array — for callers that want a list. */
export function completedSlugs(state = load()) {
  return Object.keys(state.lessons);
}

// --- assessments ------------------------------------------------------------
// The assessment page generates fresh questions every attempt, so there is no
// per-question id worth storing. What IS worth storing is the shape of the
// learner's understanding: score history (are they improving?), per-topic hit
// rate (the existing page), and — new in v2 — per-skill mastery, so the same
// answer also feeds spaced review (§11.5).
const MAX_ASSESSMENT_HISTORY = 50;

/**
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {Array<{topic: string, correct: boolean}>} answers
 */
export function recordAssessment(difficulty, answers) {
  const s = load();
  const score = answers.filter((a) => a.correct).length;

  s.assessments.push({ at: new Date().toISOString(), difficulty, score, total: answers.length });
  if (s.assessments.length > MAX_ASSESSMENT_HISTORY)
    s.assessments = s.assessments.slice(-MAX_ASSESSMENT_HISTORY);

  for (const a of answers) {
    const t = (s.topicStats[a.topic] = s.topicStats[a.topic] || { right: 0, wrong: 0 });
    a.correct ? t.right++ : t.wrong++;
    for (const id of TOPIC_TO_SKILLS[a.topic] || []) applySkillEvent(s, id, a.correct);
  }

  bumpDaily(s, 'assessments');
  markActive(s);
  awardBadges(s);
  save(s);
  return s;
}

/** Topics sorted worst-first, so the UI can say what to revisit. */
export function topicMastery() {
  const stats = load().topicStats;
  return Object.entries(stats)
    .map(([topic, { right, wrong }]) => ({
      topic, right, wrong,
      asked: right + wrong,
      ratio: right + wrong ? right / (right + wrong) : 0,
    }))
    .sort((a, b) => a.ratio - b.ratio || b.asked - a.asked);
}

export function bestAssessment(difficulty) {
  const runs = load().assessments.filter((a) => a.difficulty === difficulty);
  if (!runs.length) return null;
  return runs.reduce((best, r) => (r.score / r.total > best.score / best.total ? r : best));
}

// --- skill mastery & spaced review (v2) ------------------------------------
/** Record one graded skill answer (from a lesson mission or drill) and persist. */
export function recordSkill(id, correct) {
  const s = load();
  applySkillEvent(s, id, correct);
  markActive(s);
  save(s);
  return s;
}

/** Skills due for a review drill, soonest first — feeds the this-week card. */
export function reviewQueue() {
  return dueSkills(load());
}

/** All skills the learner has touched, weakest first — for /progress. */
export function skillMastery() {
  return Object.entries(load().skills)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => a.level - b.level || (b.right + b.wrong) - (a.right + a.wrong));
}

// --- the reasoning engine (v2, PRD §7) -------------------------------------
// The product's stated priority is logical thinking, so the record measures it:
// did the learner PREDICT correctly, FIND the bug first try, solve under a
// CONSTRAINT, pass WITHOUT the tutor. These are shown on /progress as trends
// about how you think, never as a score (§7.7). All feed the same `reasoning`
// block the record has carried since v2.

// Stages replace quarters (PRD-UX §5.2, C-NOCAL). A stage is a position in the
// CURRICULUM, not in the calendar: three modules each, S1 = m1–m3, S2 = m4–m6,
// S3 = m7–m9, S4 = m10–m12. The old currentQuarter() read wall-clock months
// since yearStart, so a learner who finished five modules in three weeks filed
// every prediction under Q1 (one bar on a panel whose whole point is movement),
// and a learner who paused four months advanced a stage having learned nothing.
export const MODULES_PER_STAGE = 3;
export const STAGE_COUNT = 4;

/**
 * The learner's stage, 'S1'–'S4'. PURE: no Date arithmetic, no clock — it is a
 * function of completed lessons only. The stage is the one containing the
 * HIGHEST module the learner has any completed lesson in; 'S1' when nothing is
 * complete. Lesson ids carry their module in the slug (`m3-sensing` -> 3).
 */
export function currentStage(state = load()) {
  let highest = 0;
  for (const slug of Object.keys(state.lessons || {})) {
    const m = /^m(\d+)(?:-|$)/.exec(slug);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  if (highest < 1) return 'S1';
  const stage = Math.ceil(highest / MODULES_PER_STAGE);
  return 'S' + Math.max(1, Math.min(STAGE_COUNT, stage));
}

/** Predict-then-run: record whether the committed prediction matched (§7.1). */
export function recordPrediction(correct) {
  const s = load();
  const p = s.reasoning.predictions;
  p.total++;
  if (correct) p.correct++;
  const stage = currentStage(s);
  const bucket = (p.byStage[stage] = p.byStage[stage] || { total: 0, correct: 0 });
  bucket.total++;
  if (correct) bucket.correct++;
  markActive(s);
  save(s);
  return s;
}

/** Broken-robot debugging: was the bug located on the first guess (§7.2)? */
export function recordDebugAttempt(firstTryCorrect, usedHint = false) {
  const s = load();
  const d = s.reasoning.debug;
  d.attempted++;
  if (firstTryCorrect) d.firstTry++;
  if (usedHint) d.hintsUsed++;
  markActive(s);
  save(s);
  return s;
}

/** A mission passed under a block budget or a banned block (§7.3). */
export function recordConstraintSolve(missionId) {
  const s = load();
  if (!s.reasoning.constraints.solved.includes(missionId)) s.reasoning.constraints.solved.push(missionId);
  save(s);
  return s;
}

/** A graded mission passed — with or without the tutor (§7.7 unassisted rate). */
export function recordMissionOutcome({ tutorUsed = false } = {}) {
  const s = load();
  const u = s.reasoning.unassisted;
  tutorUsed ? u.withTutor++ : u.missions++;
  save(s);
  return s;
}

/** A computed view of the reasoning trends, for /progress and quarterly review. */
export function reasoningSummary(state = load()) {
  const r = state.reasoning;
  const rate = (a, b) => (b ? a / b : null);
  return {
    predictionAccuracy: rate(r.predictions.correct, r.predictions.total),
    predictionsMade: r.predictions.total,
    predictionByStage: Object.fromEntries(
      Object.entries(r.predictions.byStage || {}).map(([stage, v]) => [stage, rate(v.correct, v.total)])
    ),
    debugFirstTryRate: rate(r.debug.firstTry, r.debug.attempted),
    debugAttempts: r.debug.attempted,
    constraintSolves: r.constraints.solved.length,
    unassistedRate: rate(r.unassisted.missions, r.unassisted.missions + r.unassisted.withTutor),
    unassistedMissions: r.unassisted.missions,
  };
}

// --- Gates: money-and-safety unlocks, not security (PRD §12) ---------------
// Gates guard spending real money (and, later, LiPo safety), nothing else. A
// determined teen can bypass them in devtools and that is fine — what matters
// is the default path doesn't spend £70 before the ideas have landed. GATES is
// a list now (was a single GATE); Gate B (ESP32, afterModule 6) and per-kit
// pages arrive with the Kit 2 content, so they are not declared until the
// lessons and quiz they reference exist.
export const GATES = [
  {
    id: 'A',
    afterModule: 5,
    label: 'Kit 1 — micro:bit robot',
    requiredCheckpoints: ['m1-blink', 'm1-turn', 'm2-loops', 'm3-wall-stop', 'm4-motors-gears', 'm5-obstacle-course'],
    requiredProjects: [], // wired to the portfolio in Phase 4
    quiz: 'm5-gate-quiz',
    minRatio: 0.8,
    unlocks: '/go-physical/',
  },
];

// Backward-compatible alias for callers that predate GATES[] (the go-physical
// page). Getters so there is still a single source of truth.
export const GATE = {
  get requiredCheckpoints() { return GATES[0].requiredCheckpoints; },
  get gateQuiz() { return GATES[0].quiz; },
  get minRatio() { return GATES[0].minRatio; },
};

function gateStatusFrom(s, gate = GATES[0]) {
  const missing = gate.requiredCheckpoints.filter((c) => !(c in s.lessons));
  const projectsMissing = (gate.requiredProjects || []).filter(
    (p) => (s.projects?.[p]?.status ?? 'not-started') !== 'complete'
  );
  const quiz = s.quizzes[gate.quiz]?.best;
  const quizOk = !!quiz && quiz.score / quiz.total >= gate.minRatio;
  return {
    id: gate.id, unlocks: gate.unlocks,
    open: missing.length === 0 && projectsMissing.length === 0 && quizOk,
    missing, projectsMissing, quizOk, quiz,
  };
}

/** Status of one gate (default Gate A). */
export function gateStatus(gateId = 'A') {
  const gate = GATES.find((g) => g.id === gateId) || GATES[0];
  return gateStatusFrom(load(), gate);
}

/** Status of every gate — for a multi-gate roadmap view. */
export function allGateStatus() {
  const s = load();
  return GATES.map((g) => gateStatusFrom(s, g));
}

// --- Projects & portfolio (v2, PRD §9) -------------------------------------
// A project moves through: not-started → sim-passed → evidence-linked → probed
// → complete (or → revise). Each step is the learner's own record; the media
// and the entry live in THEIR GitHub repo, never here (§9.3). The rubric object
// holds one boolean per rubric `field` from projects.json (C-RUBRIC).

function ensureProject(s, pid) {
  return (s.projects[pid] = s.projects[pid] || emptyProjectRecord());
}

export function projectRecord(pid) {
  return load().projects[pid] || { status: 'not-started', rubric: {}, probes: [], attestation: null };
}

export function allProjects() {
  return load().projects;
}

/** The sim milestone passed — the first gate; you build in the fake world first. */
export function recordProjectSim(pid, results = null) {
  const s = load();
  const p = ensureProject(s, pid);
  if (p.status === 'not-started') p.status = 'sim-passed';
  p.simPassedAt = p.simPassedAt || new Date().toISOString();
  if (results) p.results = results;
  markActive(s);
  save(s);
  return s;
}

/** The learner pasted their published entry URL (before verification). */
export function linkProjectEntry(pid, url) {
  const s = load();
  const p = ensureProject(s, pid);
  p.entryUrl = url;
  if (p.status === 'sim-passed' || p.status === 'not-started') p.status = 'evidence-linked';
  save(s);
  return s;
}

/** Record the outcome of T2 structural verification (or self-attestation tier). */
export function setProjectVerified(pid, tier) {
  const s = load();
  const p = ensureProject(s, pid);
  p.verifiedAt = new Date().toISOString();
  p.verifyTier = tier;
  save(s);
  return s;
}

/** Tick (or untick) one rubric field. Keys come from projects.json rubric[].field. */
export function setProjectRubric(pid, field, value) {
  const s = load();
  const p = ensureProject(s, pid);
  p.rubric[field] = !!value;
  save(s);
  return s;
}

/** Store the tutor's design-review probes and the learner's answers (T3, §14.3). */
export function recordProjectProbes(pid, probes) {
  const s = load();
  const p = ensureProject(s, pid);
  p.probes = probes;
  if (probes.length && probes.every((x) => x.a && x.a.trim())) {
    if (p.status === 'evidence-linked' || p.status === 'sim-passed') p.status = 'probed';
  }
  save(s);
  return s;
}

/** T4: a human saw it work, or the learner self-attests for a private repo. */
export function setProjectAttestation(pid, attestation) {
  const s = load();
  const p = ensureProject(s, pid);
  p.attestation = attestation;
  save(s);
  return s;
}

/** Mark complete (all rubric items ticked + probes answered), or send back to revise. */
export function setProjectStatus(pid, status) {
  const s = load();
  const p = ensureProject(s, pid);
  p.status = status;
  if (status === 'complete') p.completedAt = new Date().toISOString();
  markActive(s);
  awardBadges(s);
  save(s);
  return s;
}

// --- Light gamification -----------------------------------------------------
function awardBadges(s) {
  const has = (b) => s.badges.includes(b);
  const done = Object.keys(s.lessons).length;
  if (done >= 1 && !has('first-spark')) s.badges.push('first-spark');
  if (done >= 5 && !has('circuit-cadet')) s.badges.push('circuit-cadet');
  if (s.activeDays.length >= 3 && !has('three-day-streak')) s.badges.push('three-day-streak');
  if (gateStatusFrom(s).open && !has('hardware-ready')) s.badges.push('hardware-ready');

  const perfect = (d) => (s.assessments || []).some((a) => a.difficulty === d && a.score === a.total && a.total >= 5);
  if (perfect('easy') && !has('quick-study')) s.badges.push('quick-study');
  if (perfect('medium') && !has('systems-thinker')) s.badges.push('systems-thinker');
  if (perfect('hard') && !has('debugger')) s.badges.push('debugger');
}

export const BADGE_LABELS = {
  'first-spark': '⚡ First Spark — finished your first lesson',
  'circuit-cadet': '🔌 Circuit Cadet — five lessons down',
  'three-day-streak': '📅 Three Active Days',
  'hardware-ready': '🤖 Hardware Ready — confidence gate cleared',
  'quick-study': '📗 Quick Study — perfect score on an easy assessment',
  'systems-thinker': '📘 Systems Thinker — perfect score on a medium assessment',
  'debugger': '📕 Debugger — perfect score on a hard assessment',
};

// --- Export / import (localStorage is fragile; give the user a backup) ------
// Serialisation lives in record.js so the round-trip is testable (C-BACKUP):
// import runs migrate(), so a v1 export still restores, and a v2 export
// restores byte-identically.
export function exportProgress() {
  const blob = new Blob([serialize(load())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'learn-robotics-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importProgress(file) {
  return file.text().then((txt) => {
    const data = deserialize(txt);
    const { ok, errors } = validate(data);
    if (!ok) throw new Error('Not a valid progress file: ' + errors[0]);
    save(data);
  });
}
