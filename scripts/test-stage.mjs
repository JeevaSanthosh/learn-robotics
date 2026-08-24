// Tests for calendar-free pacing (PRD-UX §5.2, C-NOCAL / C-STAGE). Progress is
// a position in the CURRICULUM, never in the calendar: the stage comes from the
// modules the learner has completed, and the old wall-clock `byQuarter` buckets
// are carried forward into `byStage`. The defect this replaces was live — a
// learner who finished five modules in three weeks had every prediction filed
// under Q1, so the "how you think" trends panel rendered a single bar, and a
// learner who paused four months advanced a quarter having learned nothing.
import { emptyRecord, migrate, validate, serialize, deserialize } from '../src/lib/record.js';
import { currentStage, reasoningSummary, MODULES_PER_STAGE, STAGE_COUNT } from '../src/lib/progress.js';

const pass = [], fail = [];
const t = (n, c, extra = '') => (c ? pass : fail).push(`  ${c ? 'PASS' : 'FAIL'} ${n}${c || !extra ? '' : ` — ${extra}`}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A record whose completed lessons are exactly `slugs`. */
const withLessons = (slugs, patch = {}) => {
  const r = emptyRecord(new Date('2026-09-01T00:00:00Z'));
  for (const s of slugs) r.lessons[s] = { completedAt: null, attempts: 1, timeMs: 0 };
  return Object.assign(r, patch);
};

// --------------------------------------------------- the stage ladder itself
{
  t('S1 the ladder is 4 stages of 3 modules', MODULES_PER_STAGE === 3 && STAGE_COUNT === 4);
  t('S2 nothing completed is S1', currentStage(emptyRecord()) === 'S1');
  t('S3 m1–m3 are S1',
    ['m1-blink', 'm2-loops', 'm3-sensing'].every((s) => currentStage(withLessons([s])) === 'S1'));
  t('S4 m4–m6 are S2',
    ['m4-circuits', 'm5-events', 'm6-x'].every((s) => currentStage(withLessons([s])) === 'S2'));
  t('S5 m7–m9 are S3',
    ['m7-a', 'm8-b', 'm9-c'].every((s) => currentStage(withLessons([s])) === 'S3'));
  t('S6 m10–m12 are S4',
    ['m10-a', 'm11-b', 'm12-c'].every((s) => currentStage(withLessons([s])) === 'S4'));
  t('S7 the stage follows the HIGHEST module, not the count or the order',
    currentStage(withLessons(['m7-planning', 'm1-blink', 'm2-loops'])) === 'S3',
    currentStage(withLessons(['m7-planning', 'm1-blink', 'm2-loops'])));
  t('S8 a module past the ladder still clamps to S4', currentStage(withLessons(['m40-future'])) === 'S4');
  t('S9 a slug with no module prefix does not move the stage',
    currentStage(withLessons(['freeplay', 'intro'])) === 'S1');
}

// ------------------------------------------------------- purity: no calendar
{
  const r = withLessons(['m1-blink', 'm4-circuits', 'm5-events']);
  t('S10 currentStage is pure — same record in, same stage out',
    currentStage(r) === 'S2' && currentStage(r) === currentStage(r));

  // The heart of the fix. yearStart used to drive the bucket via wall-clock
  // months; an ancient yearStart must now change nothing at all.
  const ancient = withLessons(['m1-blink', 'm4-circuits', 'm5-events'], { yearStart: '2019-01-01' });
  const fresh = withLessons(['m1-blink', 'm4-circuits', 'm5-events'], { yearStart: '2026-08-23' });
  t('S11 an ancient yearStart does not advance the stage', currentStage(ancient) === 'S2', currentStage(ancient));
  t('S12 yearStart has no effect on the stage at all', currentStage(ancient) === currentStage(fresh));

  // A learner who raced ahead in three weeks: many modules, brand-new record.
  const sprinter = withLessons(
    ['m1-blink', 'm2-loops', 'm3-sensing', 'm4-circuits', 'm5-events'],
    { yearStart: '2026-08-23', createdAt: '2026-08-23T00:00:00.000Z' },
  );
  t('S13 a fast learner is judged by modules, not by weeks elapsed', currentStage(sprinter) === 'S2');

  // A learner who paused: one module done, a year-old record. Time alone must
  // not promote them.
  const idler = withLessons(['m1-blink'], { yearStart: '2019-01-01' });
  t('S14 a long pause does not promote a learner who did nothing', currentStage(idler) === 'S1');

  // No Date arithmetic in the implementation, and no clock dependence: mutating
  // every date-ish field leaves the answer untouched.
  const shifted = withLessons(['m1-blink', 'm4-circuits', 'm5-events'], {
    yearStart: '1999-12-31', createdAt: '1999-12-31T00:00:00.000Z',
    activeDays: ['1999-12-31'], daily: { '1999-12-31': { lessons: 9, exercises: 0, runs: 0, assessments: 0, best: 0 } },
  });
  t('S15 no date field anywhere changes the stage', currentStage(shifted) === currentStage(r));
}

// ----------------------------------------------- Q -> S forward migration
{
  const v2WithQuarters = emptyRecord(new Date('2026-09-01T00:00:00Z'));
  v2WithQuarters.reasoning.predictions = {
    total: 20, correct: 13,
    byQuarter: {
      Q1: { total: 8, correct: 5 },
      Q2: { total: 6, correct: 4 },
      Q3: { total: 4, correct: 3 },
      Q4: { total: 2, correct: 1 },
    },
  };
  const out = migrate(structuredClone(v2WithQuarters));
  const p = out.reasoning.predictions;

  t('S16 byQuarter is gone after migration', !('byQuarter' in p), JSON.stringify(Object.keys(p)));
  t('S17 Q1..Q4 map onto S1..S4', eq(Object.keys(p.byStage), ['S1', 'S2', 'S3', 'S4']), JSON.stringify(p.byStage));
  t('S18 each bucket keeps its total and correct', eq(p.byStage, {
    S1: { total: 8, correct: 5 }, S2: { total: 6, correct: 4 },
    S3: { total: 4, correct: 3 }, S4: { total: 2, correct: 1 },
  }), JSON.stringify(p.byStage));
  t('S19 the headline totals survive untouched', p.total === 20 && p.correct === 13);
  t('S20 no prediction is lost in the move',
    Object.values(p.byStage).reduce((n, b) => n + b.total, 0) === 8 + 6 + 4 + 2);
  t('S21 a migrated record still validates', validate(out).ok, validate(out).errors.join());

  // The summary reads the new key and nothing reads the old one.
  const sum = reasoningSummary(out);
  t('S22 reasoningSummary exposes predictionByStage',
    'predictionByStage' in sum && !('predictionByQuarter' in sum), JSON.stringify(Object.keys(sum)));
  t('S23 per-stage accuracy is computed from the migrated buckets',
    Math.abs(sum.predictionByStage.S1 - 5 / 8) < 1e-9 && Math.abs(sum.predictionByStage.S4 - 1 / 2) < 1e-9,
    JSON.stringify(sum.predictionByStage));

  // Junk keys are dropped rather than smuggled through.
  const odd = emptyRecord(new Date('2026-09-01T00:00:00Z'));
  odd.reasoning.predictions = { total: 1, correct: 1, byQuarter: { Q9: { total: 5, correct: 5 }, Q2: { total: 1, correct: 1 } } };
  const oddOut = migrate(odd).reasoning.predictions;
  t('S24 an out-of-range quarter key is not carried over',
    eq(oddOut.byStage, { S2: { total: 1, correct: 1 } }), JSON.stringify(oddOut.byStage));
}

// ----------------------------------------------------------- idempotence
{
  const src = emptyRecord(new Date('2026-09-01T00:00:00Z'));
  src.reasoning.predictions = {
    total: 9, correct: 6,
    byQuarter: { Q1: { total: 5, correct: 3 }, Q3: { total: 4, correct: 3 } },
  };
  const once = migrate(structuredClone(src));
  const twice = migrate(structuredClone(once));
  const thrice = migrate(structuredClone(twice));
  t('S25 the Q→S migration is idempotent', eq(once, twice) && eq(twice, thrice), serialize(twice));
  t('S26 running it twice does not double-count',
    eq(twice.reasoning.predictions.byStage, { S1: { total: 5, correct: 3 }, S3: { total: 4, correct: 3 } }),
    JSON.stringify(twice.reasoning.predictions.byStage));

  // Both shapes at once (a half-written record): the counts merge, once.
  const both = emptyRecord(new Date('2026-09-01T00:00:00Z'));
  both.reasoning.predictions = {
    total: 4, correct: 2,
    byStage: { S1: { total: 1, correct: 1 } }, byQuarter: { Q1: { total: 3, correct: 1 } },
  };
  const merged = migrate(structuredClone(both));
  t('S27 an existing byStage bucket merges with its quarter twin',
    eq(merged.reasoning.predictions.byStage, { S1: { total: 4, correct: 2 } }),
    JSON.stringify(merged.reasoning.predictions.byStage));
  t('S28 the merge does not repeat on a second pass',
    eq(migrate(structuredClone(merged)), merged));

  // C-BACKUP still holds for a record that came through the Q→S move.
  const text = serialize(once);
  t('S29 a migrated record round-trips byte-identically', serialize(deserialize(text)) === text);
  t('S30 an empty record carries byStage, never byQuarter',
    'byStage' in emptyRecord().reasoning.predictions && !('byQuarter' in emptyRecord().reasoning.predictions));
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} stage/pacing test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} stage (calendar-free pacing + Q→S migration) tests pass`);
