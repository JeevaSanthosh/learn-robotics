// Single-user, per-browser progress tracking (locked decision: localStorage only).
// Everything here is a pedagogical gate, not a security one — it is fine that
// it can be bypassed via devtools.

const KEY = 'lr-progress-v1';

const EMPTY = {
  completed: [],        // lesson slugs
  quizScores: {},       // slug -> { score, total }
  activeDays: [],       // 'YYYY-MM-DD' with any completed activity (friendly streaks)
  badges: [],
  assessments: [],      // { at, difficulty, score, total } — newest last, capped
  topicStats: {},       // topic -> { right, wrong } across all assessment answers
  daily: {},            // 'YYYY-MM-DD' -> { lessons, exercises, runs, assessments, best }
};

// Per-day activity log. This is a single-learner site with no account, so the
// only honest record of "did I show up today" is local. Keeping a per-day
// bucket (rather than just a list of dates) is what makes streaks, the
// calendar heatmap, and "you did four exercises on Tuesday" possible.
export function today() {
  return new Date().toISOString().slice(0, 10);
}

function bumpDaily(s, field, by = 1) {
  const d = (s.daily[today()] = s.daily[today()] || {
    lessons: 0, exercises: 0, runs: 0, assessments: 0, best: 0,
  });
  d[field] += by;
  return d;
}

/** Called whenever the learner presses Run — the truest signal of activity. */
export function recordRun(lessonId) {
  const s = load();
  bumpDaily(s, 'runs');
  if (!s.activeDays.includes(today())) s.activeDays.push(today());
  save(s);
}

/** A practical exercise ticked off inside a lesson. */
export function recordExercise(exerciseId) {
  const s = load();
  s.exercises = s.exercises || [];
  if (!s.exercises.includes(exerciseId)) {
    s.exercises.push(exerciseId);
    bumpDaily(s, 'exercises');
  }
  if (!s.activeDays.includes(today())) s.activeDays.push(today());
  awardBadges(s);
  save(s);
  return s;
}

export function isExerciseDone(exerciseId) {
  return (load().exercises || []).includes(exerciseId);
}

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

const MAX_ASSESSMENT_HISTORY = 50;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    return { ...structuredClone(EMPTY), ...JSON.parse(raw) };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('lr-progress', { detail: state }));
}



export function completeLesson(slug) {
  const s = load();
  if (!s.completed.includes(slug)) s.completed.push(slug);
  if (!s.activeDays.includes(today())) s.activeDays.push(today());
  awardBadges(s);
  save(s);
  return s;
}

export function recordQuiz(slug, score, total) {
  const s = load();
  const prev = s.quizScores[slug];
  if (!prev || score > prev.score) s.quizScores[slug] = { score, total };
  if (!s.activeDays.includes(today())) s.activeDays.push(today());
  awardBadges(s);
  save(s);
  return s;
}

export function isComplete(slug) {
  return load().completed.includes(slug);
}

// --- Assessment tracking --------------------------------------------------
// The assessment page generates fresh questions every attempt, so there is no
// per-question id worth storing. What IS worth storing is the shape of the
// learner's understanding: score history (are they improving?) and per-topic
// hit rate (what should they revisit?).

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
  }

  if (!s.activeDays.includes(today())) s.activeDays.push(today());
  awardBadges(s);
  save(s);
  return s;
}

/** Topics sorted worst-first, so the UI can say what to revisit. */
export function topicMastery() {
  const stats = load().topicStats;
  return Object.entries(stats)
    .map(([topic, { right, wrong }]) => ({
      topic,
      right,
      wrong,
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

// --- Confidence gate (locked decision made concrete) ---------------------
// "Ready for hardware" means: every checkpoint lesson in modules 1-2 is
// complete AND the gate quiz scored >= 80%. Adjust GATE below as the
// curriculum grows; keep the definition in one place.
export const GATE = {
  requiredCheckpoints: ['m1-blink', 'm1-turn', 'm2-loops', 'm3-wall-stop', 'm4-motors-gears', 'm5-obstacle-course'],
  gateQuiz: 'm5-gate-quiz',
  minRatio: 0.8,
};

export function gateStatus() {
  const s = load();
  const missing = GATE.requiredCheckpoints.filter((c) => !s.completed.includes(c));
  const quiz = s.quizScores[GATE.gateQuiz];
  const quizOk = !!quiz && quiz.score / quiz.total >= GATE.minRatio;
  return { open: missing.length === 0 && quizOk, missing, quizOk, quiz };
}

// --- Light gamification ---------------------------------------------------
function awardBadges(s) {
  const has = (b) => s.badges.includes(b);
  if (s.completed.length >= 1 && !has('first-spark')) s.badges.push('first-spark');
  if (s.completed.length >= 5 && !has('circuit-cadet')) s.badges.push('circuit-cadet');
  if (s.activeDays.length >= 3 && !has('three-day-streak')) s.badges.push('three-day-streak');
  if (gateStatusFrom(s).open && !has('hardware-ready')) s.badges.push('hardware-ready');

  const perfect = (d) => (s.assessments || []).some((a) => a.difficulty === d && a.score === a.total && a.total >= 5);
  if (perfect('easy') && !has('quick-study')) s.badges.push('quick-study');
  if (perfect('medium') && !has('systems-thinker')) s.badges.push('systems-thinker');
  if (perfect('hard') && !has('debugger')) s.badges.push('debugger');
}
function gateStatusFrom(s) {
  const missing = GATE.requiredCheckpoints.filter((c) => !s.completed.includes(c));
  const quiz = s.quizScores[GATE.gateQuiz];
  const quizOk = !!quiz && quiz.score / quiz.total >= GATE.minRatio;
  return { open: missing.length === 0 && quizOk };
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

// --- Export / import (localStorage is fragile; give the user a backup) ----
export function exportProgress() {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'learn-robotics-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importProgress(file) {
  return file.text().then((txt) => {
    const data = JSON.parse(txt);
    if (!Array.isArray(data.completed)) throw new Error('Not a progress file');
    save({ ...structuredClone(EMPTY), ...data });
  });
}
