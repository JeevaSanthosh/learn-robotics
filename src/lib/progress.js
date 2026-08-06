// Single-user, per-browser progress tracking (locked decision: localStorage only).
// Everything here is a pedagogical gate, not a security one — it is fine that
// it can be bypassed via devtools.

const KEY = 'lr-progress-v1';

const EMPTY = {
  completed: [],        // lesson slugs
  quizScores: {},       // slug -> { score, total }
  activeDays: [],       // 'YYYY-MM-DD' with any completed activity (friendly streaks)
  badges: [],
};

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

function today() {
  return new Date().toISOString().slice(0, 10);
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

// --- Confidence gate (locked decision made concrete) ---------------------
// "Ready for hardware" means: every checkpoint lesson in modules 1-2 is
// complete AND the gate quiz scored >= 80%. Adjust GATE below as the
// curriculum grows; keep the definition in one place.
export const GATE = {
  requiredCheckpoints: ['m1-blink', 'm1-turn', 'm2-loops', 'm3-wall-stop', 'm5-obstacle-course'],
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
