# Improvements pass

Based on `main` @ `a7655f8` (includes the Workers-native rate limiting from PR #5).

Verified: `npm run build` ✓ · `npm run verify` → 60/60 conditions ✓ · `npm test` → 17 tests ✓

---

## 1. The bug: "Ask the tutor" did nothing

**Root cause.** `public/_headers` sets `script-src 'self'` with no `'unsafe-inline'`.
Astro inlines hoisted `<script>` blocks below a size threshold straight into the
HTML. The ChatWidget's compiled script was 1,189 bytes — under that threshold — so
it shipped as a bare inline `<script type="module">` on all 16 pages and the browser
blocked it. The click handler was never attached, so no fetch was ever attempted.
The glossary search filter (247 bytes) was dead for the same reason.

Nothing in the source looked wrong, and it only failed in production: `npm run dev`
doesn't apply `_headers`, so the button worked locally.

**Fix.** `vite.build.assetsInlineLimit: 0` in `astro.config.mjs` forces every script
external. Built pages went from 17 blocked inline scripts to 0.

**Regression guard.** New `C-INLINE` condition in `scripts/verify.mjs` scans built
HTML and fails CI if any inline script reappears. This needed a machine check
precisely because it was invisible in source.

---

## 2. AI tutor

| Change | File |
|---|---|
| Sends the learner's current block program, blocks used, mission, and last simulator result | `RobotLab.astro`, `ChatWidget.astro` |
| Streaming responses (SSE), with JSON fallback | `lib/tutor.js`, `functions/api/chat.js` |
| Socratic by default — hint first, full explanation only on explicit request | `functions/api/chat.js` |
| Real error messages per failure mode instead of always blaming the network | `lib/tutor.js` |
| Server 429 text shown verbatim (per-IP rate limiter, or free allowance exhausted) | `ChatWidget.astro` |
| Rejected requests refund the daily counter | `lib/tutor.js` |
| Close button, Escape, starter chips, typing indicator, error styling, mobile bottom sheet | `ChatWidget.astro` |

## 3. RobotLab

- Breaks out of the 46rem reading column to 72rem; editor beside arena above 900px
  (`.lab-grid` previously had no breakpoint at all and was locked to one column).
- Auto-runs as you build — debounced 900ms, toggleable.
- Per-block help panel: tooltip plus the generated line for the selected block.
- Selecting a block highlights its line in the JS bridge; copy buttons on both panes.
- Share-by-URL: whole program gzipped into the link. No backend, no account.
- `ResizeObserver` → `Blockly.svgResize`, without which Blockly renders incorrectly
  across the new breakpoint.
- Multiple labs per page register in a list; the tutor reads whichever is on screen.

## 4. UI

- Real dark theme. Loaded flash-free via external `/theme.js` — the usual inline
  bootstrap snippet would have been blocked by this project's own CSP.
- Glossary tooltips are now a real button + popover: tap, click, focus, Escape.
  The old hover-only `::after` was unreachable on touch and clipped when scrolled.
- In-lesson progress trace marking the current lesson.
- Card hierarchy: `.card-do` (act on this) vs `.card-note` (context).
- Skip link, `.visually-hidden` labels, offline service worker, web manifest.

## 5. Docs

`README.md` and `SETUP.md` were updated, including fixes to things that were
already wrong before this pass:

- `RobotLab` goals were documented as `blink3` / `free` "completes on any successful
  run". Actual values are `blink:N`, `reach-target`, `near-wall`, and `free` — which
  deliberately *never* auto-completes. Now a table, with the `required` prop explained.
- Verify count said "60 conditions"; `main` was actually emitting 59, and the number
  drifts as resources are added. Now described as approximate, with pass/fail as the
  contract, plus a note that `verify` requires `build` to have run first.
- SETUP's troubleshooting entry for "Run button does nothing in production" blamed a
  hand-edited CSP — the wrong diagnosis for the bug we actually hit. Rewritten to name
  the inline-script cause and the two guards that prevent it.
- SETUP Part F (WAF rate limiting) didn't mention that the `wrangler deploy` path
  already rate-limits in code via `CHAT_LIMITER` and doesn't need the rule.
- Security notes now state exactly what the browser sends (question, ≤6 turns, lesson
  id, mode, and the program-context summary) rather than the old, now-incomplete list.
- New: a prominent inline-script warning, a Cost section, and repo-map entries for
  `tutor.js`, `share.js`, `theme.js`, `sw.js`, `worker/index.js`.

---

## Cost

Designed to be structurally unable to bill you.

**The actual guarantee is the plan, not the code:** stay on **Workers Free**. The free
allocation is 10,000 Neurons/day, and exceeding it requires opting in to Workers Paid.
On the free plan, going over makes requests fail — it cannot spill into charges. No
card required.

On top of that:

- `@cf/meta/llama-3.1-8b-instruct` (small model), `max_tokens: 300`
- History, and the new learner-context blob, both clamped server-side
- 40 questions/day per browser (`lib/tutor.js`), refunded on failure
- Upstream per-IP rate limiting (10/min) still applies
- When the allowance runs out the tutor says so plainly instead of erroring

Everything else is free tier by construction: Astro, Blockly, Cloudflare Pages/Workers,
GitHub Actions on a public repo. Share links and offline mode add zero backend cost.

---

## Known gaps

**Two-way blocks ↔ text is not implemented.** Running edited JS needs an interpreter
bundle, because the CSP correctly forbids `eval` and `verify.mjs` C2 enforces that.
The click-to-highlight bridge is the honest 90%. Full round-trip is a separate project.

**Blockly interaction paths are logic-verified, not click-tested** — auto-run, block
help, and resize were built without a headless browser available. Worth ten minutes in
a real browser before merging.

**The Pages Functions deploy path has no rate limiter.** Upstream added `CHAT_LIMITER`
in `worker/index.js` only, so it applies to `wrangler deploy`, not classic Pages. Left
as-is deliberately — that's an upstream design decision, not mine to change.

---

# Bug-fix pass 2

Reported: the chat panel's **close button did nothing**. Root cause found, plus
four more bugs in the same audit.

## B1 — `hidden` was being silently overridden (the reported bug)

`.chat-panel { display: flex }` in `ChatWidget.astro` defeated the browser's
`[hidden] { display: none }`. This is not a specificity tie: `[hidden]` lives in
the **user-agent** stylesheet, and *every* author rule outranks the user-agent
origin. So the panel never hid, and the close button appeared dead.

Same bug in `MarkDone.astro`: `.btn { display: inline-block }` meant
`btn.hidden = true` never hid the button after "I read this".

- **Fix:** `[hidden] { display: none !important; }` in `global.css`.
- **Guard:** condition `C-HIDDEN` fails CI if that rule is removed, and reports
  any component CSS that sets `display` on a hidden-toggled element.

## B2 — tapping a glossary term did nothing

`click` toggled on current visibility, but a pointer press fires `focus`
**before** `click`. Focus opened the tooltip, click immediately closed it. Worst
on touch — the exact platform this tooltip was rewritten to support.
Fixed by tracking intent (`pinned`) instead of inferring it from visibility.
Hovering away no longer dismisses a deliberately-opened tooltip.

## B3 — opening a share link destroyed your own work

Loading a workspace fires Blockly change events, and the change listener
persists to `localStorage`. So merely *visiting* someone's share link
overwrote your saved program for that lesson before you touched anything.
Fixed with a `restoring` flag around the initial load.

## B4 — lesson text pointed at a button that no longer existed

Two lessons say `Tap **Show real code**`; the improvements pass had shortened
that button to "Real code". Build passed, tests passed, only the learner
noticed. Button label restored, and condition `C-LABELS` now fails CI when
lesson instructions reference a UI label no component renders.

## B5 — the test suite couldn't see B1

Added `scripts/test-dom.mjs`: loads the **built** pages into jsdom with the
**built** CSS, runs the **built** bundles, and drives them by clicking.
18 tests covering the chat panel, glossary filter, MarkDone, and tooltips.

**Important caveat, verified experimentally:** jsdom does not model the
user-agent stylesheet origin, so it reports `display: none` for
`<div class="x" hidden>` even when `.x { display: flex }` would win in a real
browser. jsdom therefore gives a **false pass** on B1. `C-HIDDEN` is the real
detector; the DOM tests cover event wiring, not cascade.

Verified: 63 conditions ✓ · 6 interpreter + 11 share/stream + 18 DOM tests ✓

---

# Feature pass: progress, assessment, module depth

## Progress tracking — new `/progress` dashboard

Progress data existed but had no home: badges sat at the bottom of the roadmap
and everything else was invisible. The dashboard now shows overall completion,
active days, gate status, per-module lesson state, checkpoint quiz scores,
badges, assessment history, and **topic mastery** — accuracy per topic across
every assessment answer, sorted weakest-first, so it tells the learner what to
revisit rather than just what they scored.

`src/lib/progress.js` gains `recordAssessment`, `topicMastery`,
`bestAssessment`, and three assessment badges. State shape is additive; existing
saved progress loads unchanged.

## Assessment — new `/assessment` page

Three levels, five questions, **a fresh paper every attempt**.

| Level | Tests |
|---|---|
| Easy | recall — do you know what the words mean |
| Medium | apply — given a rule, predict one step |
| Hard | trace & debug — run it in your head, then find the fault |

**Questions are procedurally generated, not AI-generated** — a deliberate call:

- *Correctness.* An assessment is the one place a hallucinated answer key does
  real damage. Every template computes its own answer; trace questions run the
  same walk as the simulator.
- *Cost.* Workers AI's free allocation is shared with the tutor; a generated
  paper per attempt would drain it. This costs nothing.
- *Offline.* Works with the service worker, on a plane.

Uniqueness is parameterisation: numbers, programs, option order and template
choice all randomised, no template repeated within a paper.

`scripts/test-assessment.mjs` (13 tests) checks 6,000 generated questions for
well-formedness, verifies trace answers against an **independent**
implementation of the robot walk, re-derives every arithmetic key, and asserts
the correct answer's position is uniformly distributed — a learner who always
picks B must not beat chance.

## Module depth

Building the assessment exposed that it tested things no lesson taught. Rule
adopted: **if the assessment tests it, a lesson must teach it.**

- **m4-circuits** — Ohm's law (`I = V ÷ R`) with worked numbers, a
  what-changes-if table, and why every LED needs a series resistor. +3 quiz questions.
- **m4-motors-gears** — gear ratio as division with a worked drivetrain example,
  `power ≈ torque × speed` as the reason there is no free lunch, and how
  "set speed" becomes PWM duty cycle on real hardware. +3 quiz questions.
  **Now a checkpoint** with a verified `robot_set_speed` mission — Module 4 was
  previously the only module a learner could pass through without demonstrating
  anything. Added to `GATE.requiredCheckpoints`.
- **m3-wall-stop** — threshold choice, polling blindness between checks, and why
  an angled wall defeats a single distance sensor.
- **m5-events** — polling vs interrupts, with a comparison table and the design
  rule for choosing between them.

Glossary grew 15 → 23 terms (resistance, ohms-law, gear-ratio, power, polling,
interrupt, threshold, pwm).

## Bugs found and fixed during this pass

- **Lab id collision.** The new Module 4 checkpoint initially reused
  `m4-motors-gears` alongside the existing sandbox lab — two labs sharing one
  `localStorage` workspace key, silently overwriting each other. Worse, the
  checkpoint's completion would have marked a slug the gate never checks.
  New condition `C-LABIDS` fails CI on duplicate lab ids, and on any checkpoint
  lesson with no completion path bound to its own slug.
- **Missing MDX imports** in two lessons — caught by the build, not by review.

Verified: 72 conditions ✓ · 6 interpreter + 11 share/stream + 13 assessment +
32 DOM tests ✓

---

# Feedback pass: editor size, daily tracking, program review

## ⚠️ Provenance note — please read before merging

While working on this pass I found **461 lines of uncommitted changes in the
working tree that I did not write** and cannot account for (`sim.js`,
`blocks.js`, `interpreter.js`, `progress.js`, `RobotLab.astro`, `global.css`).
This is the third such occurrence in this project. They implement roughly the
requested features — waypoint/line/pen simulation, new goal types, an expandable
editor, daily-log functions — but **they shipped broken**: a duplicate `today()`
declaration in `progress.js` meant the project did not build at all.

I repaired the breakage and then wrote 26 behavioural tests against the
simulator code so its behaviour is at least verified even though its authorship
is not. **Review `git diff` on those six files yourself before merging.** I can
vouch that the code passes the tests below; I cannot vouch that I wrote it.

Authored in this pass and fully mine: `src/lib/review.js`,
`scripts/test-review.mjs`, `scripts/test-sim.mjs`, the daily heatmap UI on
`/progress`, and the review panel wiring in `RobotLab.astro`.

## Program review — "how could I have done this better?"

New `src/lib/review.js`. After each run, the lab offers up to four concrete
suggestions, ranked correctness-first:

| Level | Catches |
|---|---|
| logic | sensor read outside the loop; empty loop; orphaned stacks that never run; a blink with one LED block; crashing with no sensor in the program |
| efficiency | an unrolled pattern that should be a loop (names the actual blocks and the repeat count);programs far over par |
| style | a magic number repeated four times; missing start block; nesting three deep |

Design rules, enforced by tests: it stays silent below three blocks, never fires
on a clean looped program, names the specific blocks rather than saying
"consider refactoring", and caps at four items so it reads as help rather than
failure. 24 tests in `scripts/test-review.mjs`.

## Daily progress

`/progress` gains a 12-week heatmap (one square per day, tooltipped with what
was done), plus current and longest streak. This is a single-learner site with
no account, so the browser is the only honest record — shown plainly, not
gamified. A blank day is explicitly framed as not a failure.

## Simulator test coverage

`scripts/test-sim.mjs` — 26 tests covering movement, wall collision, waypoint
visiting, line-following accuracy, pen trails and corner counting, speed
clamping, blink counting and reset. Notably asserts that an empty waypoint list
does **not** count as "all visited", which would otherwise let every visit-all
exercise pass with an empty program.

Verified: 72 conditions ✓ · 6 interpreter + 11 share/stream + 13 assessment +
26 simulator + 24 review + 32 DOM tests ✓
