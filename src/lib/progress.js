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
  emptyRecord, migrate, validate, decayDue,
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

/** Which quarter of the learner's year today falls in (1–4), from yearStart. */
export function currentQuarter(state = load()) {
  const start = new Date(state.yearStart + 'T00:00:00Z');
  const now = new Date();
  const months = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  return Math.max(1, Math.min(4, Math.floor(months / 3) + 1));
}

/** Predict-then-run: record whether the committed prediction matched (§7.1). */
export function recordPrediction(correct) {
  const s = load();
  const p = s.reasoning.predictions;
  p.total++;
  if (correct) p.correct++;
  const q = 'Q' + currentQuarter(s);
  const bucket = (p.byQuarter[q] = p.byQuarter[q] || { total: 0, correct: 0 });
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
    predictionByQuarter: Object.fromEntries(
      Object.entries(r.predictions.byQuarter).map(([q, v]) => [q, rate(v.correct, v.total)])
    ),
    debugFirstTryRate: rate(r.debug.firstTry, r.debug.attempted),
    debugAttempts: r.debug.attempted,
    constraintSolves: r.constraints.solved.length,
    unassistedRate: rate(r.unassisted.missions, r.unassisted.missions + r.unassisted.withTutor),
    unassistedMissions: r.unassisted.missions,
  };
}

// --- Confidence gate (locked decision made concrete) -----------------------
// "Ready for hardware" means: every checkpoint lesson is complete AND the gate
// quiz scored >= 80%. GATES[] and per-kit unlocks arrive in a later phase; the
// single GATE stays the source of truth for now so verify.mjs C5 is unchanged.
export const GATE = {
  requiredCheckpoints: ['m1-blink', 'm1-turn', 'm2-loops', 'm3-wall-stop', 'm4-motors-gears', 'm5-obstacle-course'],
  gateQuiz: 'm5-gate-quiz',
  minRatio: 0.8,
};

function gateStatusFrom(s) {
  const missing = GATE.requiredCheckpoints.filter((c) => !(c in s.lessons));
  const quiz = s.quizzes[GATE.gateQuiz]?.best;
  const quizOk = !!quiz && quiz.score / quiz.total >= GATE.minRatio;
  return { open: missing.length === 0 && quizOk, missing, quizOk, quiz };
}

export function gateStatus() {
  return gateStatusFrom(load());
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
