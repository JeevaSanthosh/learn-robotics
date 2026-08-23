// Tests for the learner record: v1 -> v2 migration, schema validity, the
// export/import round-trip, and skill mastery/decay. The record is the one
// artefact a year of work lives in, so an upgrade that silently drops or
// corrupts it is the worst bug in the product (PRD §11, R9). These are the
// machine-checkable backing for C-MIGRATE, C-SCHEMA and C-BACKUP.
import {
  emptyRecord, migrate, validate, serialize, deserialize,
  applySkillEvent, decayDue, dueSkills, REVIEW_INTERVALS, TOPIC_TO_SKILLS,
} from '../src/lib/record.js';

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A representative v1 blob — the shipped shape (see the old progress.js EMPTY).
const v1 = {
  completed: ['m1-blink', 'm1-turn', 'm2-loops'],
  quizScores: { 'm5-gate-quiz': { score: 9, total: 10 } },
  activeDays: ['2026-09-01', '2026-09-02'],
  badges: ['first-spark'],
  assessments: [{ at: '2026-09-02T10:00:00Z', difficulty: 'easy', score: 5, total: 5 }],
  topicStats: { loops: { right: 6, wrong: 2 }, sensing: { right: 3, wrong: 3 } },
  daily: { '2026-09-01': { lessons: 1, exercises: 0, runs: 4, assessments: 0, best: 0 } },
  exercises: ['ex-a'],
};

// ---------------------------------------------------------------- migration
{
  const v2 = migrate(v1);
  t('M1 migrates to version 2', v2.version === 2);
  t('M2 every completed lesson survives as a key',
    v1.completed.every((s) => s in v2.lessons));
  t('M3 quiz best score is preserved',
    v2.quizzes['m5-gate-quiz'].best.score === 9 && v2.quizzes['m5-gate-quiz'].best.total === 10);
  t('M4 badges carried unchanged', eq(v2.badges, v1.badges));
  t('M5 activeDays carried unchanged', eq(v2.activeDays, v1.activeDays));
  t('M6 daily carried unchanged', eq(v2.daily, v1.daily));
  t('M7 exercises carried unchanged', eq(v2.exercises, v1.exercises));
  t('M8 assessment history carried', v2.assessments.length === 1 && v2.assessments[0].score === 5);
  t('M9 topicStats preserved for the existing page', eq(v2.topicStats, v1.topicStats));

  // topicStats -> skills: counts split evenly (floored) across mapped skills.
  const loopsIds = TOPIC_TO_SKILLS.loops; // 2 skills; right 6 -> 3 each, wrong 2 -> 1 each
  t('M10 topic hit-rate maps into per-skill mastery',
    loopsIds.every((id) => v2.skills[id] && v2.skills[id].right === 3 && v2.skills[id].wrong === 1),
    JSON.stringify(v2.skills[loopsIds[0]]));
  t('M11 every migrated skill id is one the schema knows',
    Object.keys(v2.skills).every((id) => Object.values(TOPIC_TO_SKILLS).flat().includes(id)));
}

// ---------------------------------------------------------------- idempotent
{
  const once = migrate(v1);
  const twice = migrate(once);
  t('M12 migration is idempotent (v2 in -> identical v2 out)', eq(once, twice));
  // and stable regardless of "now", since createdAt comes from the v1 blob path
  const a = migrate(structuredClone(v1)), b = migrate(structuredClone(v1));
  t('M13 migration is deterministic for the same input', eq(a, b));
}

// ---------------------------------------------------------------- losslessness
{
  // Nothing in v1 with a v2 home may be silently dropped.
  const v2 = migrate(v1);
  const lostLessons = v1.completed.filter((s) => !(s in v2.lessons));
  const lostBadges = v1.badges.filter((b) => !v2.badges.includes(b));
  t('M14 no completed lesson is lost', lostLessons.length === 0, lostLessons.join());
  t('M15 no badge is lost', lostBadges.length === 0, lostBadges.join());
}

// ---------------------------------------------------------------- schema
{
  t('M16 an empty record validates', validate(emptyRecord()).ok);
  t('M17 a migrated record validates', validate(migrate(v1)).ok);
  t('M18 null/garbage migrates to a valid empty record',
    validate(migrate(null)).ok && validate(migrate('nonsense')).ok && validate(migrate(42)).ok);
  // validate actually rejects a broken record (it isn't a rubber stamp)
  const broken = emptyRecord(); broken.skills = [];
  t('M19 validate rejects a malformed record', !validate(broken).ok);
  const badLevel = emptyRecord(); badLevel.skills = { 'x.y': { right: 0, wrong: 0, level: 9, lastSeen: null, nextReview: null } };
  t('M20 validate rejects an out-of-range skill level', !validate(badLevel).ok);
}

// ---------------------------------------------------------------- backup round-trip
{
  const v2 = migrate(v1);
  const text = serialize(v2);
  const back = deserialize(text);
  t('M21 export/import restores an equal record', eq(v2, back));
  t('M22 round-trip is byte-identical', serialize(deserialize(text)) === text);
  // a v1 file dropped into import still restores (via migrate)
  const fromV1File = deserialize(JSON.stringify(v1));
  t('M23 a v1 export file still imports', validate(fromV1File).ok && 'm1-blink' in fromV1File.lessons);
}

// ---------------------------------------------------------------- mastery & review
{
  const r = emptyRecord();
  const now = new Date('2026-09-01T00:00:00Z');
  applySkillEvent(r, 'sense.range', true, now);
  t('M24 a correct answer raises the level to 1', r.skills['sense.range'].level === 1);
  t('M25 nextReview is scheduled by the level interval',
    r.skills['sense.range'].nextReview ===
      new Date(now.getTime() + REVIEW_INTERVALS[1] * 86400000).toISOString());

  applySkillEvent(r, 'sense.range', false, now);
  t('M26 a wrong answer drops the level', r.skills['sense.range'].level === 0);

  // due + decay
  const r2 = emptyRecord();
  applySkillEvent(r2, 'act.led', true, now); // level 1, due in 3 days
  const soon = new Date(now.getTime() + 1 * 86400000);
  const later = new Date(now.getTime() + 10 * 86400000);
  t('M27 a skill is not due before its interval', dueSkills(r2, soon).length === 0);
  t('M28 a skill is due after its interval', dueSkills(r2, later).some((s) => s.id === 'act.led'));
  const { changed } = decayDue(r2, later);
  t('M29 an overdue skill decays one level', changed && r2.skills['act.led'].level === 0);
  const again = decayDue(r2, later);
  t('M30 decay does not cascade below the rescheduled date', !again.changed);
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} record test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} record (migration/schema/backup/mastery) tests pass`);
