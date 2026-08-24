# PRD — Learn Robotics: the one-teen, one-year robotics course

**Status:** Draft for review · **Version:** 2.0 (supersedes the implicit product in `README.md`)
**Author:** Claude (Cowork session) · **Date:** 2026-08-23
**Repo:** `C:\Repo\learn-robotics` · **Baseline analysed:** working tree as of this date

---

## 0. Reader's guide

This document is long on purpose. It is meant to be buildable from, not skimmed.

| If you want… | Read |
|---|---|
| What exists today and what's actually wrong with it | §1 |
| What we're building and why | §2–§4 |
| The 12-month curriculum, module by module | §5 |
| How "standards increase" is made concrete | §6 |
| The logical-thinking / improvisation engine (the core bet) | §7 |
| Simulator v2 spec | §8 |
| Projects, real builds, and proof | §9 |
| Interactivity requirements | §10 |
| Data model and record keeping | §11 |
| Gates, motivation, tutor, non-functionals | §12–§15 |
| Machine-checkable acceptance conditions | §16 |
| Build order and phase exit criteria | §17 |
| Risks, deferrals, open questions | §18–§20 |

**Decisions locked by the product owner before drafting:**

1. Hardware track: **micro:bit → ESP32/Arduino** across the year.
2. Proof of real builds: **a GitHub portfolio repo owned by the learner.**
3. Single user, no accounts. Records are the learner's, kept locally + in their repo.
4. Curriculum ceiling: **delegated to this document.** §5 sets it at *mechatronics + perception + introductory machine learning*, with ROS 2 taught as vocabulary and architecture in month 12 but never as a required install. Rationale in §5.1.

---

## 1. Current state — an honest audit

### 1.1 What is built, and it is genuinely good

The repository is not a prototype. It is a small, disciplined product with a real engineering culture, and the PRD's job is to extend it rather than replace it.

| Subsystem | File(s) | State |
|---|---|---|
| Lesson content | `src/content/modules/*.mdx` | 12 lessons, 5 modules, MDX + typed frontmatter |
| Simulator | `src/lib/sim.js` | Differential-drive robot, raycast distance sensor, LED, pen trails, waypoints, line track, collision, corner counting |
| Block language | `src/lib/blocks.js` | 9 robot blocks (`robot_start`, `move`, `turn`, `set_speed`, `led`, `wait`, `distance`, `pen`, `line`) + Blockly stock control/logic/math |
| Program execution | `src/lib/interpreter.js` | Block-tree interpreter — **no `eval`**, which keeps CSP at `script-src 'self'` |
| Progress | `src/lib/progress.js` | localStorage, lessons/quizzes/badges/streaks/daily log/assessment history/topic stats |
| Assessment | `src/lib/assessment.js` | Procedural generator, 3 difficulty levels, computed answer keys, 8 topics |
| Code review | `src/lib/review.js` | Post-run critique: logic → efficiency → style, max 4 suggestions |
| AI tutor | `functions/api/chat.js`, `src/lib/tutor.js` | Socratic-by-default, streaming, sees the learner's program, server-side clamps |
| Gate | `GATE` in `progress.js` → `/go-physical` | 6 checkpoints + 80% gate quiz unlocks the kit page |
| Verification | `scripts/verify.mjs` + 6 test scripts | ~72 acceptance conditions, ~112 runtime tests, CI-enforced |

Three cultural properties are worth naming because the rest of this PRD depends on them:

- **Machine-checked pedagogy.** `verify.mjs` enforces things like "every lesson is completable", "no checkpoint without a completion path", "no lesson references a UI label that doesn't exist". New curriculum rules in this PRD are written to be *conditions*, not prose.
- **No `eval`, ever.** C2 forbids `eval`/`new Function` in client code. This constrains §8's text-code work and is treated as a hard requirement, not a preference.
- **Cost-structurally-zero.** Workers Free, small model, token caps, client-side generation. Everything proposed here holds that line.

### 1.2 What blocks a year-long course

These are the gaps, ordered by how much they matter.

**G1 — There is roughly three hours of content.** 12 lessons at 10–20 minutes. A year at two or three short sessions a week is 100–150 sessions. The content is ~4% of a year. This is the dominant gap and everything else is secondary to it.

**G2 — Difficulty does not systematically increase.** Module 5 is harder than Module 1 because its mission is harder, not because the *standard* changed. There is no ladder of autonomy, tolerance, verification strictness, or required justification. A learner can finish the whole course being told what to do each time.

**G3 — Missions are single-world and therefore memorisable.** `RobotLab` verifies one arena. A hard-coded sequence of `move`/`turn` passes almost everything except `m5-obstacle-course`, which patches the hole by requiring the `robot_distance` block be *present* — not that it be *used meaningfully*. There is no notion of "does your program still work when the world changes", which is the definition of robotics.

**G4 — Reasoning is never measured.** The learner is scored on outcomes (did the robot arrive) and recall (assessment). Nothing captures whether they *predicted* correctly, whether they *found the bug* before asking, or whether they can *explain why* their threshold is 3 and not 5. The stated priority — logical thinking — is currently invisible in the data model.

**G5 — There is no project layer.** Lessons end in a mission. There is no artefact the learner owns, keeps, shows anyone, or looks back on in month 11 and thinks "I made that in month 2". The confidence gate opens onto a shopping list, not a build.

**G6 — "Real work" is a one-way door with no return.** `/go-physical` explains a kit and stops. There is no mechanism to (a) take a program that worked in sim and run it on hardware, (b) record that it worked, (c) compare sim to reality, which is the single most valuable lesson in physical robotics.

**G7 — The simulator can't grade at scale.** `sim.js` awaits `requestAnimationFrame` per step. Running one program across ten randomised worlds would take minutes of wall-clock and can't run in a Worker. Multi-seed grading (§8.6) is impossible without a headless core.

**G8 — No sensor model beyond ideal.** Distance is an exact raycast; the line sensor is an exact geometric test. Real sensors are noisy, laggy, and lie at angles. `m3-wall-stop` *teaches* that an angled wall defeats a single sensor but the simulator can't demonstrate it.

**G9 — Records are shallow and version-1-shaped.** `progress.js` tracks lesson slugs and topic hit-rates. It has no concept of skills, projects, evidence, predictions, a year plan, a review schedule, or hardware ownership. It also has no migration story, so growing it is a breaking change waiting to happen.

**G10 — Blocks only.** There is no path from Blockly to text, which means there is no path to ESP32/Arduino, which means the second half of the year has no vehicle. The README correctly identifies this as deferred; this PRD un-defers it because the hardware decision forces it.

**G11 — Topic coverage is ~25% of robotics.** Covered: outputs, loops, distance sensing, basic circuits, gears, events. Absent: closed-loop control, kinematics, odometry, path planning, perception, machine learning, communications, power budgeting, arms/manipulators, systems architecture, testing methodology, safety, ethics.

**G12 — Provenance risk in the working tree.** `CHANGES.md` records three occasions where uncommitted changes appeared that the author did not write, one of which broke the build. This is a process risk that a year-long project will amplify. §18 treats it as a first-class risk.

### 1.3 What we keep unchanged

Explicitly: Astro + MDX + Blockly, the canvas simulator's rendering approach, the no-`eval` interpreter, procedural assessment, localStorage-first records, the `verify.mjs` condition culture, the strict CSP, the Socratic tutor, and free-tier-by-construction hosting. **None of the gaps above require a rewrite.** Every one is an extension.

---

## 2. Product summary

**Learn Robotics** is a single-learner, twelve-month robotics education product for one motivated teenager. It teaches robotics the way robotics is actually practised: form a hypothesis, build the smallest thing that tests it, watch it fail, work out *why*, change one variable, try again — first in a browser simulator that costs nothing to crash, then on real hardware, with the results kept as a portfolio the learner owns.

The year has three promises:

1. **You will never be stuck with nothing to try.** Every lesson ends in something runnable, and the simulator is always one click away.
2. **The bar rises.** What counted as "done" in month 2 will not count in month 8, and the product says so out loud.
3. **At the end you will have built real things, and be able to prove it.** Twelve projects, each with evidence, in a repository with your name on it.

### 2.1 What is new in v2, in one paragraph

Twelve modules instead of five (§5). An explicit rigor ladder that raises the standard every module and is enforced by CI (§6). A reasoning layer — predict-before-run, deliberate broken programs, constraint budgets, and worlds that mutate mid-run — that is *measured* and appears in the learner's record (§7). A simulator with a deterministic headless core, noisy sensors, encoders, IMU, a camera, and multi-seed grading (§8). A monthly project pipeline that carries a design from simulator to real hardware and ends in a GitHub portfolio entry with evidence (§9). A records model built around skills and spaced review rather than lesson checkboxes (§11).

---

## 3. Learner, context, constraints

### 3.1 Primary (and only) user

| Attribute | Assumption |
|---|---|
| Age | 13–17 |
| Prior knowledge | Can use a computer; may have seen Scratch; no electronics, no algebra beyond ratio and rearranging one equation |
| Supervision | Largely self-directed. An adult may be nearby for purchases, soldering, and encouragement, but is **not** a teacher and must not be a dependency |
| Time | 2–3 sessions/week, 20–40 minutes each. ~120 sessions in a year, with ~10 weeks of slack built in for holidays, illness, and losing interest for a fortnight |
| Money | ~£100–150 across the year, spent in two instalments at two gates, not upfront |
| Devices | One laptop/desktop (Chrome/Firefox/Safari, ≥2020). Possibly a phone camera. No guaranteed 3D printer, oscilloscope, or lab |
| Network | Usually online; must survive offline for lesson + sim + assessment work |

### 3.2 Non-users (explicit)

Classrooms, cohorts, teachers, multiple learners on one browser, competition teams. If any of those become real, that is a different product with an account system and this PRD's data model is not it.

### 3.3 Hard constraints

| # | Constraint | Source |
|---|---|---|
| HC1 | No `eval`, no `new Function`, no `unsafe-eval` in CSP | `verify.mjs` C2, `public/_headers` |
| HC2 | No inline `<script>` in built output | `verify.mjs` C-INLINE, `astro.config.mjs` |
| HC3 | Must remain free to run on Workers Free / Pages / GitHub Actions | README "Cost" |
| HC4 | Must work offline for lessons, simulator and assessment | `public/sw.js` |
| HC5 | No accounts, no PII collection, no learner media on our servers | Privacy of a minor; §15.3 |
| HC6 | Every new pedagogical rule must be machine-checkable in `verify.mjs` | Project culture; §16 |
| HC7 | The simulator must stay dependency-light — no physics engine, no ML framework over ~150 kB gzipped | Performance, offline, build simplicity |

---

## 4. Goals and success measures

### 4.1 Product goals

| # | Goal | Measure of success |
|---|---|---|
| PG1 | A teen can work through a full year without an instructor | 12 modules completable solo; no lesson requires an adult except purchases and one soldering step |
| PG2 | Reasoning improves measurably, not just recall | Prediction accuracy and debug-first-try rate both trend up across stages (§7.7) |
| PG3 | Simulation converts into real builds | ≥8 of 12 projects have a physical component with evidence by month 12 |
| PG4 | Standards visibly rise | Every module declares a rigor level; month-8 pass criteria are strictly stricter than month-2 (§6) |
| PG5 | Interest survives | ≥26 active weeks out of 52; no module with a >3-week stall |
| PG6 | Coverage is honest | Every topic in the §5.2 matrix is taught, assessed, and used in at least one project |
| PG7 | The learner owns the output | A public (or self-attested private) portfolio repo with 12 entries |

### 4.2 Anti-goals

- **Not** a badge-farming gamified app. Streaks forgive; badges reward reasoning, not clicking.
- **Not** a video course. Video is a supplement; the product is doing.
- **Not** a curriculum that pretends the simulator is reality. The sim→real gap is taught deliberately (§9.5).
- **Not** a certification. There is no credential, and the product should never imply one.

---

## 5. The twelve-month curriculum

### 5.1 Setting the ceiling (the delegated decision)

The ceiling is set at **mechatronics + perception + introductory machine learning**, with ROS 2 present as vocabulary and system architecture in month 12 but never as a required installation.

Reasoning:

- **Against stopping at classic mechatronics (PID + odometry):** it is the correct *depth* but it ends the year on a note that feels like the past. A 15-year-old who has spent eight months on motors and control loops and never once made a robot *see* something will conclude robotics is not the field they read about. Perception is where their motivation lives.
- **Against requiring ROS 2:** it needs Linux, a Raspberry Pi, hours of install pain, and a mental model of distributed systems. Every one of those is a place a solo teen quits, and the hardware decision (micro:bit → ESP32) does not provide the Pi. Teaching ROS *concepts* — nodes, topics, messages, why you'd split a robot into processes — costs one lesson and transfers completely to the real thing later.
- **For including introductory ML:** a k-nearest-neighbour classifier over sensor traces is ~60 lines, runs in the browser, needs no framework (HC7), and teaches the single most important idea in modern robotics: *when rules run out, collect data.* It also carries the ethics lesson, which a robotics course for a teenager should not omit.
- **For a capstone:** the year must end with something they chose, not something we set.

The ceiling therefore is: **by month 12 the learner can specify, build, tune, debug, and demonstrate a sensor-driven autonomous robot on real hardware, explain its control loop and its position estimate in their own words, write text code for it, evaluate a simple learned classifier honestly, and describe how professionals would structure the same system.**

### 5.2 Topic coverage matrix

Every row must be taught (a lesson), assessed (a generator template), and used (a project). Enforced by C-COVERAGE (§16).

| Topic area | Taught in | Assessed | Used in project |
|---|---|---|---|
| What a robot is: sense→decide→act | M1 | actuators, sensing | P1 |
| Sequence, order, off-by-one | M1 | tracing | P1 |
| Iteration, nested loops, parameterisation | M2 | loops, tracing | P2 |
| Variables and state | M2, M5 | tracing, state | P2, P5 |
| Sensors: range, resolution, blind spots, noise | M3, M8, M10 | sensing | P3, P8, P10 |
| Conditionals and thresholds | M3 | sensing, logic | P3 |
| Electricity: voltage, current, resistance, Ohm | M4 | electricity | P4 |
| Power: batteries, capacity, budgets, safety | M4 | electricity, power | P4, P12 |
| Actuators: DC motors, gears, torque, PWM, servos | M4 | motors | P4 |
| Events: polling vs interrupts | M5 | events | P5 |
| State machines | M5 | state | P5 |
| Functions and abstraction | M5, M6 | code-structure | P5, P6 |
| Text programming, syntax, error reading | M6 | code-structure, debugging | P6 |
| Real hardware bring-up and flashing | M6 | — (proof-based) | P6 |
| Open vs closed loop; proportional control | M7 | control | P7 |
| Overshoot, oscillation, damping, tuning method | M7 | control | P7 |
| Coordinate frames, headings | M8 | kinematics | P8 |
| Differential-drive kinematics | M8 | kinematics | P8 |
| Odometry, encoders, drift, error budgets | M8 | kinematics, error | P8 |
| Forward kinematics of a jointed arm | M8 | kinematics | P8 (stretch), P12 |
| Grids, graphs, search (flood fill/BFS), heuristics | M9 | planning | P9 |
| Replanning under change | M9 | planning | P9 |
| Cameras, pixels, brightness, thresholding | M10 | perception | P10 |
| Blob detection, centroid, area | M10 | perception | P10 |
| Failure modes of vision (light, shadow, colour) | M10 | perception | P10 |
| Rules vs learning; data, features, labels | M11 | ml | P11 |
| Train/test split, overfitting, honest evaluation | M11 | ml | P11 |
| Bias, safety, responsibility in robotics | M11, M12 | ethics | P11, P12 |
| System architecture; nodes/topics/messages (ROS 2 vocabulary) | M12 | systems | P12 |
| Communication: serial, Wi-Fi, latency | M12 | systems | P12 |
| Reliability, failure modes, test plans | M12 | systems, debugging | P12 |
| Debugging as a discipline | every module | debugging | every project |
| Version control and documenting your work | M1 onward (portfolio) | — (proof-based) | every project |

### 5.3 Course shape

> **Amended 2026-08-23 (product-owner decision).** Calendar time is no longer a unit of progress. Quarters became **stages**, months and weeks were removed, and a learner who is ready to move on moves on. `PRD-UX.md` §5.2 is the normative specification; this section is its curriculum-side reflection. This amendment *extends* the intent already stated in §12 — *"Quarter boundaries are **not** gates. A learner who wants to run ahead into M7 should be allowed to"* — by removing the clock that made the boundaries look binding in the first place.

| Stage | Modules | Title | Question it answers | Rigor | Hardware |
|---|---|---|---|---|---|
| S1 | M1–M3 | **Make it move** | How do I make a machine do what I say? | R1 → R2 | none (sim only) → **Gate A** |
| S2 | M4–M6 | **Understand the machine** | What is it actually made of, and how do I talk to it in real code? | R2 → R3 | micro:bit + chassis → **Gate B** |
| S3 | M7–M9 | **Make it accurate** | Why is it wobbly, lost, and stupid — and how do I fix each? | R3 → R4 | ESP32/Arduino |
| S4 | M10–M12 | **Make it smart** | How does it perceive, learn, and hold together as a system? | R4 → R5 | ESP32(-CAM) |

Each module is **4–5 lessons plus one project**, and takes exactly as long as it takes. There is no weekly plan, no schedule, and nothing is ever overdue. After each stage there is a **consolidation step** — no new content, a mixed assessment at that stage's rigor level, a stage-review page, and a "show someone" prompt. It is reached by finishing S*n*, not by arriving at week 13.

The only thing in the product that waits on elapsed time is the **review drill**, which becomes due when a skill's `nextReview` comes round. Lessons, projects, and gates are never time-gated (`C-NOCAL`).

### 5.4 Module specifications

Notation: **New sim** = simulator capability first required here. **Teaches** = skill ids (§11.4). Existing lesson files are marked *(exists)*; *(expand)* means the file stays and grows.

---

#### M1 · First Sparks — *"What makes a machine a robot?"*
**Month 1 · Rigor R1 · Sim only**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 1.1 | Meet your robot *(exists)* | concept | 10 | Sense → decide → act; a tour of the simulated robot |
| 1.2 | Say hello: blink *(exists, checkpoint)* | lab | 10 | Outputs; a program is an ordered list |
| 1.3 | Move and turn *(exists, checkpoint)* | lab | 10 | Actuators; heading vs position |
| 1.4 | Order matters | lab | 15 | Same blocks, different order, different robot. First deliberate broken program |
| 1.5 | Draw a square | challenge | 20 | Pen down; 4 × (move, turn 90). Introduces "there is a shorter way" without naming loops |

**New sim:** none (uses existing pen + LED + move/turn).
**Teaches:** `core.robot-loop`, `core.sequence`, `act.led`, `act.drive`, `logic.order`, `debug.read-symptom`.
**Project P1 — "Signal lamp":** design an LED pattern that communicates something (SOS, a countdown, a mood). Sim only. Portfolio entry #1 is created here — the repo is set up in month 1 so that documenting is a habit, not a month-6 chore.
**Standard to pass:** mission verified in one fixed world. Predict-then-run offered but optional.

---

#### M2 · Patterns & Loops — *"How do I stop repeating myself?"*
**Month 2 · Rigor R1→R2 · Sim only**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 2.1 | Loops *(exists, checkpoint)* | lab | 15 | Repeat N; the same square in 3 blocks |
| 2.2 | Light show *(exists)* | lab | 10 | Loops with a body that varies |
| 2.3 | Loops inside loops | lab | 20 | Nested repetition; a grid of squares; predicting total iterations |
| 2.4 | Remembering a number | lab | 20 | Variables; a counter; a side length that grows |
| 2.5 | Fewer blocks, same result | challenge | 25 | **Constraint drill:** solve last week's square-spiral in ≤8 blocks |

**New sim:** block/step budget meter; ghost replay of previous best run.
**Teaches:** `logic.loop.counted`, `logic.loop.nested`, `logic.variable`, `logic.parameterise`, `meta.efficiency`.
**Project P2 — "Polygon plotter":** one program that draws a triangle, square, hexagon and octagon by changing **one number**. Portfolio entry must include the number→shape table and an explanation of the `360 ÷ n` relationship.
**Standard to pass:** predict-then-run becomes **required** from 2.3 onward. Block budget enforced on 2.5 and P2.

---

#### M3 · Sensing & Decisions — *"How does a robot know anything?"*
**Month 3 · Rigor R2 · Ends at Gate A**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 3.1 | Sensing *(exists)* | concept | 15 | What a distance reading *is*; units; range limits |
| 3.2 | Stop before the wall *(exists, checkpoint)* | lab | 20 | if/else; choosing a threshold and defending it |
| 3.3 | When the sensor lies | lab | 25 | **Noise turned on.** Same program, jittery readings. Averaging; hysteresis |
| 3.4 | The blind spot | lab | 20 | Angled walls, narrow gaps, the cone of a real sensor |
| 3.5 | Follow the wall | challenge | 30 | First genuinely open strategy problem; multiple valid solutions |

**New sim:** Gaussian sensor noise (seeded), sensor cone instead of single ray, randomised world variants, multi-seed grading.
**Teaches:** `sense.range`, `sense.threshold`, `sense.noise`, `sense.blindspot`, `logic.conditional`, `logic.hysteresis`, `debug.isolate`.
**Project P3 — "Don't crash":** a program that survives **5 randomised arenas** for 60 simulated seconds without a collision. Must pass ≥4 of 5.
**Standard to pass:** from M3, missions grade across **multiple seeded worlds**. A hard-coded path cannot pass. Written justification of the chosen threshold is required in the portfolio entry.

> **🔓 Gate A — hardware unlock (~£70).** Opens on: all M1–M3 checkpoints complete, P1–P3 submitted, and the Gate A quiz ≥80%. Unlocks the micro:bit + Maqueen-class chassis page (the current `/go-physical` content, rewritten as *Kit 1*).

---

#### M4 · Electricity & Muscle — *"What actually moves it?"*
**Month 4 · Rigor R2 · Kit 1 in hand**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 4.1 | Circuits and Ohm's law *(exists, expand)* | concept | 20 | V, I, R; why an LED needs a resistor; **interactive circuit slider** |
| 4.2 | Motors, gears, torque *(exists, checkpoint)* | concept | 20 | Ratio as division; power ≈ torque × speed |
| 4.3 | Power budgets and battery safety | concept | 20 | mAh, current draw, brownouts; LiPo safety rules; what not to short |
| 4.4 | Servos and a simple arm | lab | 25 | Position control vs speed control; angle limits; **first manipulator** |
| 4.5 | PWM: how "half speed" is a lie | lab | 20 | Duty cycle; why the motor buzzes; deadband |

**New sim:** per-wheel speed, battery voltage droop under load, motor deadband, 2-joint arm mode.
**Teaches:** `elec.voltage`, `elec.current`, `elec.ohm`, `elec.power-budget`, `safety.battery`, `act.gear-ratio`, `act.torque`, `act.servo`, `act.pwm`.
**Project P4 — "Strong or fast":** on the real chassis, measure how long it takes to cross 1 m at three speed settings, and how steep an incline it can climb. Predict first, measure second, explain the gap. **First project requiring physical evidence:** photo of the setup + a measurement table.
**Standard to pass:** prediction must be recorded *before* the measurement; the writeup must explain any prediction error rather than hiding it.

---

#### M5 · The Robot Brain — *"How does it decide over time?"*
**Month 5 · Rigor R3**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 5.1 | Events: polling vs interrupts *(exists)* | concept | 20 | When to check vs when to be told; the cost of missing an event |
| 5.2 | Memory: what the robot knows | lab | 20 | Variables that persist across the loop; counters and flags |
| 5.3 | States and transitions | concept+lab | 30 | **State machines.** Draw the diagram, then build it |
| 5.4 | Naming an idea: functions | lab | 25 | Abstraction; a named block you can reuse and test alone |
| 5.5 | The obstacle course *(exists, checkpoint)* | challenge | 30 | Everything at once, now graded across seeds |

**New sim:** bumper sensor, event triggers, live state overlay showing the current state name.
**Teaches:** `logic.event`, `logic.interrupt`, `logic.state-machine`, `logic.function`, `logic.abstraction`, `debug.trace`.
**Project P5 — "Two-mode robot":** patrol until something is detected, then chase; return to patrol when lost. Must be built as an explicit state machine. **Portfolio entry must contain a hand-drawn or Mermaid state diagram** that matches the built program.
**Standard to pass:** from M5, the mission statement gives the *goal* but not the *strategy*. Diagram-to-program correspondence is checked by the learner against a rubric and probed by the tutor.

---

#### M6 · Real Code — *"Blocks were the training wheels."*
**Month 6 · Rigor R3 · Ends at Gate B**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 6.1 | Reading the code you already wrote | concept | 20 | The generated Python beside the blocks; click a block, see its line |
| 6.2 | Writing it yourself | lab | 30 | Same mission, typed. Indentation, colons, the shape of a loop |
| 6.3 | Functions with arguments | lab | 25 | Parameters and return values in text |
| 6.4 | Read the error | lab | 25 | Tracebacks, line numbers, the four errors you'll hit forever |
| 6.5 | Flash it | lab | 40 | MicroPython onto the real micro:bit; the same program, real wheels |

**New sim:** **text mode** — a MicroPython-subset editor with a hand-written parser + AST interpreter driving the same robot API (no `eval`; see §8.7). Blocks↔text toggle with a one-way "blocks → text, then you're on your own" handoff.
**Teaches:** `code.syntax`, `code.function-args`, `code.error-reading`, `code.text-transfer`, `hw.flash`, `hw.sim-real-gap`.
**Project P6 — "Port it":** take P3 ("Don't crash") and make it run on the real robot, in text. Video proof of the real robot avoiding a real obstacle, plus a written comparison of what behaved differently from the simulator and why.
**Standard to pass:** blocks are no longer accepted for graded missions from 6.2 onward (they remain available for sketching).

> **🔓 Gate B — second hardware unlock (~£40–60).** Opens on: M4–M6 checkpoints, P4–P6 submitted with evidence, Gate B quiz ≥80%, and a completed **safety checklist** (battery handling, soldering supervision, no mains). Unlocks *Kit 2*: ESP32 dev board (ESP32-CAM variant recommended for month 10), motor driver, jumpers, breadboard, ultrasonic + IR line sensors.

---

#### M7 · Feedback & Control — *"Why is it wobbling?"*
**Month 7 · Rigor R3→R4**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 7.1 | Open loop vs closed loop | concept | 20 | "Drive 2 seconds" vs "drive until"; why open loop drifts |
| 7.2 | Error, and doing something proportional to it | lab | 30 | `correction = Kp × error`. The single most useful equation of the year |
| 7.3 | Following a line properly | lab | 30 | Scored on accuracy %, not pass/fail |
| 7.4 | Overshoot, oscillation, and the D term | lab | 30 | Why more gain is not more better; damping; a first look at I |
| 7.5 | How to tune anything | concept | 25 | Change one knob, record, repeat. The method generalises beyond robots |

**New sim:** actuator latency, live error/output plot, tuning sliders, accuracy scoring, per-run tuning log.
**Teaches:** `ctrl.open-loop`, `ctrl.closed-loop`, `ctrl.error`, `ctrl.proportional`, `ctrl.derivative`, `ctrl.tuning-method`, `meta.one-variable`.
**Project P7 — "Race the line":** hit a target line-accuracy **and** a time target on the real robot. Portfolio entry must include the **tuning log** — every gain tried, what happened, what was changed next. The log is the deliverable as much as the result.
**Standard to pass:** graded on a continuous metric with a threshold, not a boolean. Retries allowed and encouraged; the log must show them.

---

#### M8 · Where Am I? — *"Position without magic."*
**Month 8 · Rigor R4**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 8.1 | Coordinates and headings | concept | 20 | x, y, θ; world frame vs robot frame |
| 8.2 | Two wheels, one path | concept+lab | 30 | Differential-drive kinematics; how wheel speeds become a curve |
| 8.3 | Counting turns: encoders and odometry | lab | 30 | Ticks → distance → position |
| 8.4 | Why it gets lost | lab | 30 | Drift, slip, accumulating error; error budgets; why a heading sensor helps |
| 8.5 | Arms: angles instead of wheels | concept+lab | 30 | Forward kinematics of a 2-joint arm; the same maths, different body |

**New sim:** wheel encoders with tick quantisation and slip, IMU heading with drift, coordinate overlay + estimated-vs-true pose display, arm workspace visualiser.
**Teaches:** `kin.frames`, `kin.diff-drive`, `kin.odometry`, `kin.drift`, `kin.error-budget`, `kin.forward-arm`, `sense.encoder`, `sense.imu`.
**Project P8 — "Return to base":** drive an out-and-back route and return within a stated tolerance, on the real robot, three times. Report **measured** end-position error for each run, and an estimated error budget explaining where it came from.
**Standard to pass:** tolerance is numeric and stated in advance; the learner must state their own tolerance target, justify it, and then meet it.

---

#### M9 · Planning & Algorithms — *"Think before you move."*
**Month 9 · Rigor R4**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 9.1 | Reacting vs planning | concept | 20 | Wall-following always works and is often terrible |
| 9.2 | The world as a grid | concept | 25 | Discretisation; what you gain and lose |
| 9.3 | Flood fill, by hand then by robot | lab | 35 | BFS on paper first, then in code. **The paper step is mandatory** |
| 9.4 | Cost, heuristics, and why A* exists | concept | 30 | Not implementing A*; understanding what it buys |
| 9.5 | When the world changes mid-run | challenge | 35 | **Replanning.** Walls move while the program runs |

**New sim:** grid overlay, seeded maze generator, path visualisation, **mutating worlds** (a wall appears/moves at a scripted or random tick).
**Teaches:** `plan.reactive`, `plan.grid`, `plan.bfs`, `plan.cost`, `plan.heuristic`, `plan.replan`, `meta.complexity`.
**Project P9 — "Maze solver":** one program, ten unseen maze seeds, must solve ≥8. Scored on path efficiency against the optimal path length. A physical variant (tape maze on the floor) is a stretch goal with video proof.
**Standard to pass:** unseen seeds only. The learner never sees the mazes they are graded on before submitting.

---

#### M10 · Seeing — *"Turning light into meaning."*
**Month 10 · Rigor R4**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 10.1 | What a camera gives you | concept | 25 | Pixels, brightness, resolution, framerate, bandwidth |
| 10.2 | Thresholding: from pixels to a mask | lab | 30 | One number splits the world into "interesting" and "not" |
| 10.3 | Finding the thing: centroid and area | lab | 35 | Blob detection; where it is, how big, how confident |
| 10.4 | A line, seen instead of felt | lab | 30 | Line following from the camera; compare with M7's IR approach |
| 10.5 | Why vision breaks | concept | 25 | Light, shadow, colour constancy, motion blur, the demo-day problem |

**New sim:** camera sensor — a 1D strip first, then a small 2D pixel grid rendered from the arena, with adjustable lighting, shadow and blur; a pipeline pane showing raw → mask → detection.
**Teaches:** `perc.pixels`, `perc.threshold`, `perc.blob`, `perc.centroid`, `perc.line-vision`, `perc.failure-modes`.
**Hardware:** ESP32-CAM if bought at Gate B; otherwise a phone camera + still images for the offline exercises, with the sim carrying the loop.
**Project P10 — "Follow the colour":** track a coloured target and keep it centred. Deliverable includes a **failure catalogue**: five conditions under which it fails, with photos.
**Standard to pass:** the failure catalogue is graded as heavily as the success. Working once in good light is not passing.

---

#### M11 · Learning Machines — *"When rules run out."*
**Month 11 · Rigor R4**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 11.1 | Rules vs learning | concept | 25 | Where if/else stops scaling; what "learning" actually means here |
| 11.2 | Data, features, labels | lab | 30 | Recording sensor traces from the sim and the real robot; what a feature is |
| 11.3 | Train a tiny classifier | lab | 35 | k-NN over 2–3 features, in the browser, no framework |
| 11.4 | The test set, and lying to yourself | lab | 30 | Train/test split; overfitting; why 100% on training data is a warning |
| 11.5 | Robots, bias, and responsibility | concept | 30 | Where training data comes from; who gets hurt when it's wrong; safety rules for autonomous machines |

**New sim:** dataset recorder (label a run, capture feature vectors), train/test split UI, decision-boundary scatter plot, "let the classifier drive" mode.
**Teaches:** `ml.rules-vs-learning`, `ml.features`, `ml.labels`, `ml.classifier`, `ml.train-test`, `ml.overfit`, `ethics.data`, `ethics.autonomy`, `safety.autonomous`.
**Project P11 — "Teach it something":** collect data for a 2–3 class problem (surface type from motor current, gesture from IMU, obstacle type from distance profile), train, and report **held-out** accuracy plus a confusion matrix. Reporting a low honest number scores higher than a high dishonest one, and the rubric says so.
**Standard to pass:** any result reported without a test split is an automatic revise-and-resubmit.

---

#### M12 · Systems & Capstone — *"Make something that survives a demo."*
**Month 12 · Rigor R5**

| # | Lesson | Kind | Min | Core idea |
|---|---|---|---|---|
| 12.1 | How professionals split a robot up | concept | 30 | Nodes, topics, messages — **ROS 2 vocabulary and architecture, no install.** Why processes talk instead of one giant loop |
| 12.2 | Making things talk | lab | 30 | Serial and Wi-Fi from the ESP32; message formats; latency and what it ruins |
| 12.3 | Reliability | concept | 30 | Failure modes, watchdogs, power budgets, what fails at a demo and why |
| 12.4 | Capstone build | project | — | 2–3 weeks, learner-chosen |
| 12.5 | Demo, write-up, and what's next | project | — | Paths onward: ROS 2, VEX/FRC, university, open-source robotics |

**New sim:** none required; sim serves as the capstone prototyping bench.
**Teaches:** `sys.architecture`, `sys.messaging`, `sys.latency`, `sys.reliability`, `sys.test-plan`, `meta.engineering-process`.
**Project P12 — Capstone:** the learner writes their own brief against a template (goal, success metric, constraints, test plan) and it must be accepted against a rubric before building. Deliverables: sim prototype, real build, 2-minute demo video, design document, and a reflection on the whole year.
**Standard to pass:** R5 — the learner sets the standard and is held to the one they set.

### 5.5 Consolidation weeks (13, 26, 39, 52)

No new content. Each consolidation week contains:

- A **mixed assessment** drawing on every skill from the quarter, at the quarter's rigor level.
- **Spaced review**: the 5 weakest skills by mastery decay (§11.5), each with a 5-minute drill.
- A **quarterly review page**: what you built, your reasoning metrics trending, your best and worst runs, side-by-side.
- A **"show someone" prompt**: demo one project to a real human and record their one question you couldn't answer. That question becomes a logbook entry.

---

## 6. The rigor ladder

This section is the concrete answer to *"increase the standards from each module"*. Rigor is not vibes; it is five levers, each of which moves on a defined schedule.

### 6.1 The five levers

| Lever | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| **L1 Autonomy** — how much of the *how* we give | Step-by-step instructions | Goal + strategy hint | Goal only | Brief with a success *metric*, no method | Learner writes the brief |
| **L2 Verification** — what counts as done | 1 fixed world | ≥4 of 5 seeded worlds | ≥4 of 5 seeded + no collisions | ≥8 of 10 **unseen** seeds + a scored metric threshold | Learner's own test plan, executed and reported |
| **L3 Reasoning demand** | Predict optional | Predict required (multiple choice) | Predict + state the loop invariant | Predict a **number** with an error bound | Predict, measure, explain the gap, revise |
| **L4 Constraint** | None | Block budget | Block budget + a banned block | Efficiency scored (steps/time/path length vs optimal) | Learner-declared constraints, held to |
| **L5 Proof** | Sim result only | Sim + photo + measurement table | Sim + video + diagram + written rationale | Measured results table + failure analysis + tuning/error log | Full design doc + demo video + reflection |

### 6.2 Module → rigor assignment

| Module | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 | M12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rigor | R1 | R1→R2 | R2 | R2 | R3 | R3 | R3→R4 | R4 | R4 | R4 | R4 | R5 |

### 6.3 Rules that make this real

- **R-RULE-1 — Monotonic.** A module's rigor level is never lower than the previous module's. (C-RIGOR-MONO)
- **R-RULE-2 — Declared.** Every lesson's frontmatter carries `rigor`, and every `RobotLab` graded mission carries a `rigor` attribute consistent with its lesson. (C-RIGOR-DECL)
- **R-RULE-3 — Enforced by the grader, not by prose.** The seed count, unseen-seed requirement, block budget, and metric threshold are props on the lab component and are what the code actually checks. A lesson claiming R4 while grading one fixed world fails CI. (C-RIGOR-IMPL)
- **R-RULE-4 — Visible to the learner.** Every mission shows a rigor chip: *"R4 · 10 unseen worlds · efficiency scored"*. The learner should feel the bar rise and know why.
- **R-RULE-5 — Retries are free and logged.** Rising standards must not become punishment. Unlimited attempts; the record stores attempts and best, and the *narrative* is "it took nine tries, here's what changed each time" — which is what the P7 tuning log formalises.
- **R-RULE-6 — Never retroactive.** Passing a module at R2 stays passed when R4 arrives. We do not invalidate old work.

---

## 7. The reasoning engine (logical thinking & improvisation)

This is the differentiating bet of the product and the direct answer to *"concentrate more on logical thinking and improvise based on it"*. Six mechanisms, all measured.

### 7.1 Predict-Then-Run

Before the Run button is available on a graded mission (R2+), the learner must commit a prediction.

- **Form:** multiple choice at R2 (*where does it end up?*), a numeric field with tolerance at R4 (*how many cm short?*), a numeric field with a **stated error bound** at R4+.
- **After the run:** the simulator shows prediction vs actual side by side. A wrong prediction is framed as the *most informative* outcome — "you learned something you didn't know 30 seconds ago" — and offers a one-click "why?" that routes to the tutor with the specific mismatch as context.
- **Never blocking.** A wrong prediction does not fail the mission. It is recorded.
- **Component:** `<Predict>` — a new component; `RobotLab` gains `predict="choice|number"` + `predictPrompt` + `predictTolerance`.

### 7.2 Broken Robot (deliberate debugging)

A library of programs that are almost right, presented as "this robot's owner says it should X, but it does Y."

- **Two sources:** hand-authored per module (~4 each, 48 total) and **procedurally mutated** — take a known-good reference program for a mission and apply one seeded mutation from a catalogue: off-by-one loop count, swapped `<`/`>`, sensor read hoisted out of the loop, wrong turn sign, threshold off by 1 unit, two blocks swapped, condition inverted, missing reset.
- **The learner must first predict *where*** (which line/block) before revealing. Then fix, then re-run.
- **Metric:** `debug.firstTry` — proportion of challenges where the first identified location was correct. Tracked per module and reported in the quarterly review.
- **Reuses:** the mutation catalogue is the same idea the assessment generator already uses; `review.js` already knows how to name specific blocks.

### 7.3 Constraint budgets

- **Block budget:** "solve it in ≤N blocks". N is set to a value that makes the naive unrolled solution impossible and the intended abstraction necessary.
- **Banned block:** "solve it without `repeat`" (forces recursion-by-hand or a different decomposition) or "without `robot_distance`" (forces dead reckoning, teaching *why* the sensor matters).
- **Efficiency scoring (R4+):** steps taken vs a reference optimum, shown as a ratio. Not pass/fail — a number that improves.
- **Rule:** a constraint is only used where it *teaches*. Never a difficulty tax for its own sake.

### 7.4 Invariants and traces

- **Trace ledger (R3+):** before running, the learner fills a small table — after iteration 1, 2, 3, what is `x`, what is the heading, what does the sensor read? The simulator then fills the true values. Same framing as prediction: mismatches are the lesson.
- **Invariant prompt (R3+):** a one-line free-text answer to "what must be true every time round this loop?" Stored in the logbook, and used as tutor context so the tutor can ask a follow-up rather than mark it.

### 7.5 Improvise mode — the world moves

This is the mechanism that most directly makes the learner *improvise*, and the one that most changes what "a working program" means.

| Mutation | Introduced | Effect |
|---|---|---|
| **Seeded variants** | M3 | Wall positions, target position, start pose vary per seed |
| **Sensor noise** | M3 | Gaussian noise + occasional dropout on distance readings |
| **Unseen seeds** | M9 (grading), available M4+ | Learner is graded on worlds they have never run |
| **Mid-run mutation** | M9 | A wall appears, a target moves, at a scripted or random tick |
| **Degraded hardware** | M7 | Motor deadband, one wheel 10% slower, battery droop, actuator latency |
| **Chaos die (opt-in, any module M4+)** | M4 | A button that rolls one random impairment and re-runs. Purely for play; not graded. This is the fun one |

**Design rule:** every mutation type is *taught in a lesson before it is graded*. The learner is never ambushed by a mechanic they haven't met.

### 7.6 Explain-back

At R3+, submitting a project requires answering three prompts in the portfolio entry:

1. **Why does this work?** (mechanism, not narration)
2. **What did you try that didn't?** (at least one specific failed approach)
3. **What would break it?** (name a condition under which your solution fails)

The tutor reads these and asks **two probing questions** (§14). Answers are stored. This is not graded by AI — the AI only probes; the rubric is self-applied against explicit criteria.

### 7.7 The reasoning record

A `reasoning` block in the learner record (§11.3), surfaced on `/progress` and in each quarterly review:

| Metric | Definition | Target trend |
|---|---|---|
| Prediction accuracy | correct predictions ÷ predictions made, by stage | Rising, or holding as difficulty rises |
| Debug first-try rate | debug challenges located correctly on first guess | Rising |
| Constraint solves | missions passed under a block budget or ban | Accumulating |
| Unassisted rate | missions passed with zero tutor messages | Rising |
| Revision depth | attempts before pass on R4+ missions, with the log | Not a target — shown as evidence of persistence |
| Explanation completeness | explain-back prompts answered, and probed follow-ups answered | Near 100% |

**Framing rule (important):** these are shown as *trends about how you think*, never as a score out of ten, and never in a way that makes a bad week look like a verdict on the learner.

---

## 8. Simulator v2

### 8.1 The central architectural change: split core from renderer

Today `sim.js` couples simulation to `requestAnimationFrame` (`await frame()` inside `moveForward`). This makes multi-seed grading (§6.1 L2) impossible.

**Required refactor:**

```
src/lib/sim/
  core.js        deterministic, fixed-timestep, no DOM, no rAF, no time
  sensors.js     distance/cone, line, encoder, IMU, bumper, camera, battery
  noise.js       seeded RNG (mulberry32) + noise models
  world.js       world schema, seeded variant generation, mutation scripts
  render.js      canvas drawing of a core state snapshot
  runner.js      two drivers: `animated` (rAF-paced) and `headless` (as fast as possible)
  grade.js       run a program across N seeds, collect metrics, decide pass
```

- `core.step(dt)` advances the world by a fixed `dt` (suggest 1/120 s) and returns a state snapshot.
- **Determinism is a requirement**, not a nicety: the same program + same seed must produce byte-identical metrics. This makes grading fair, replays exact, and tests strong. (C-SIM-DET)
- Headless grading runs in a **Web Worker** so the UI never freezes across 10 seeds. Budget: 10 seeds × 60 simulated seconds must complete in < 3 s wall-clock on a mid-range laptop.
- `render.js` is a pure function of a snapshot — which also lets the replay scrubber and the ghost-run overlay fall out almost free.

### 8.2 World schema

```jsonc
{
  "id": "m9-maze",
  "size": { "w": 400, "h": 300 },
  "start": { "x": 60, "y": 240, "heading": -90 },
  "walls":    [ { "x": 80, "y": 220, "w": 200, "h": 16 } ],
  "targets":  [ { "x": 310, "y": 50, "r": 26 } ],
  "waypoints":[ { "x": 200, "y": 150, "r": 20 } ],
  "line":     [ { "x1": 60, "y1": 240, "x2": 300, "y2": 60 } ],
  "surfaces": [ { "x": 0, "y": 0, "w": 400, "h": 150, "friction": 0.7 } ],
  "lighting": { "level": 1.0, "shadows": [] },

  "variation": {                       // how seeded variants are generated
    "wallJitter": 24,
    "targetJitter": 30,
    "startPoses": [ /* alternatives */ ],
    "generator": "maze",               // or null for jitter-only
    "generatorParams": { "cells": 6 }
  },
  "mutations": [                        // improvise mode
    { "atTick": 600, "type": "moveWall", "index": 0, "dx": 40 },
    { "atTick": "random(400,900)", "type": "spawnWall", "spec": { } }
  ],
  "impairments": {                      // degraded hardware, per rigor level
    "sensorNoiseSigma": 0.08,
    "sensorDropout": 0.02,
    "motorDeadband": 0.12,
    "wheelImbalance": 0.10,
    "actuatorLatencyMs": 60,
    "batteryDroop": true
  }
}
```

Worlds live in `src/content/worlds/*.json` so `verify.mjs` can validate them and lessons can reference them by id rather than inlining JSON in MDX props (which they do today and which does not scale).

### 8.3 Sensors

| Sensor | Module | Model |
|---|---|---|
| Distance (existing) | M1 | Raycast → **cone** of 3 rays at ±10°, min of the three; noise + dropout from M3 |
| Line (existing) | M7 | Geometric proximity → **3-element IR array** with per-element noise from M7 |
| Bumper | M5 | Boolean on collision, with debounce |
| Encoder | M8 | Integer ticks per wheel, quantised, with configurable slip |
| IMU heading | M8 | Heading + Gaussian drift accumulating over time |
| Battery | M4 | Voltage that droops under load and recovers |
| Camera | M10 | 1D strip (32 px) then 2D grid (32×24) rendered from the arena; brightness + colour channels; adjustable lighting, shadow, blur |

**Rule:** every sensor is introduced *ideal* first, then made realistic in a later lesson, so the learner meets the concept before the complication.

### 8.4 Actuators

Per-wheel speed (M4), servo joints for a 2-joint arm (M4/M8), LED (existing), buzzer (M1, for the signal-lamp project), pen (existing).

### 8.5 Goal types

Existing: `blink:N`, `reach-target`, `near-wall`, `visit-all`, `draw-N`, `follow-line`, `free`.

New:

| Goal | Meaning | From |
|---|---|---|
| `survive:SECONDS` | no collision for N simulated seconds | M3 |
| `return-to-start:TOL` | end within TOL units of the start pose | M8 |
| `hold-heading:DEG:TOL` | maintain a heading within tolerance | M7 |
| `track-target:PCT` | keep the camera target within the centre band ≥ PCT of the time | M10 |
| `solve-maze` | reach the exit of a generated maze | M9 |
| `classify:ACC` | learned classifier reaches ACC on held-out data | M11 |
| `metric:NAME:OP:VALUE` | generic scored threshold (e.g. `metric:lineAccuracy:>=:0.85`) | M7 |

Plus grading modifiers on the lab component: `seeds=N`, `mustPass=K`, `unseen=true`, `maxBlocks=N`, `banned="controls_repeat_ext"`, `scoreBy="steps|time|pathRatio"`.

### 8.6 Multi-seed grading

```
grade(program, world, { seeds: 10, mustPass: 8, unseen: true, metric })
  → { passed, results: [{ seed, passed, metrics, failureReason }], score }
```

The learner sees a **row of seed chips** — green/red — and can click a failed seed to replay it animated. This is the single most valuable debugging affordance in the product: "it works, except on seed 7" is exactly the shape of a real robotics bug.

### 8.7 Text mode without `eval` (HC1)

M6 requires running typed code. `eval` and `new Function` are forbidden and CI-enforced. Options considered:

| Option | Verdict |
|---|---|
| Bundle a JS interpreter (e.g. JS-Interpreter) | Works (tree-walking, no `eval`) but ~100 kB, and teaches JavaScript when the hardware target is MicroPython |
| Transpile Python subset → block tree, reuse `interpreter.js` | **Chosen.** Consistent with the hardware target, small, and reuses a tested execution core |
| Full Python-in-WASM (Pyodide) | Rejected: ~6 MB, breaks offline budget and HC7 |

**Spec:** a hand-written tokeniser + recursive-descent parser for a MicroPython subset — assignment, arithmetic, comparison, `if`/`elif`/`else`, `while`, `for i in range()`, `def` with positional args and `return`, function calls, `True`/`False`/`None`, lists with index access, comments. It emits the same AST shape `interpreter.js` already walks. Syntax errors report line and column in the same style MicroPython does, because M6.4 teaches reading exactly those messages.

Estimated size: ~600–900 lines including tests. **This is the largest single engineering item in the plan** and is called out as such in §17 and §18.

### 8.8 Telemetry, replay, and failure explanation

- **Telemetry pane:** live plots of sensor value, motor command, error (M7+), position estimate vs true (M8+). Collapsible; off by default before M7 to avoid overwhelming a beginner.
- **Replay scrubber:** because the core is deterministic, any run can be replayed and scrubbed frame by frame. Ghost overlay of the previous best run.
- **"Why did that happen?" button:** a rules-based explainer (not the LLM) that reads the run trace and states the mechanical cause — *"You hit the wall 0.4 units after the sensor first read below your threshold, because your loop only checks every 200 ms and you were moving at 3 units/s."* This is `review.js`'s design extended from static analysis to run traces, and it must stay rules-based so it is always correct and always free.

---

## 9. Projects, real builds, and proof

### 9.1 The shape of a project

One per module, occupying week 4. Every project has the same five parts, so the shape becomes familiar and the *content* is what gets harder:

1. **Brief** — the goal, the success metric, the constraints, and what evidence is required. At R5 the learner writes this.
2. **Sim milestone** — auto-verified in the simulator against the module's rigor level. Always the first gate; you may not build in the real world until it works in the fake one.
3. **Real milestone** — from P4 onward, the same behaviour on real hardware. (P1–P3 are sim-only; the hardware doesn't exist yet.)
4. **Evidence** — media and measurements, in the learner's own repo.
5. **Write-up + reflection** — the explain-back prompts (§7.6), plus what they'd do differently.

### 9.2 The twelve projects

| # | Module | Project | Sim milestone | Real milestone | Evidence required |
|---|---|---|---|---|---|
| P1 | M1 | Signal lamp | LED pattern verified | — | Sim result, program export, what the pattern means |
| P2 | M2 | Polygon plotter | 4 shapes from one parameter | — | Result table, the `360 ÷ n` explanation |
| P3 | M3 | Don't crash | ≥4/5 seeded arenas, 60 s | — | Seed results, threshold justification |
| P4 | M4 | Strong or fast | Drivetrain sim comparison | Timed 1 m runs at 3 speeds + incline test | **Photo** of setup, measurement table, prediction-vs-actual |
| P5 | M5 | Two-mode robot | State machine passes seeded worlds | Runs on the micro:bit robot | **State diagram** + video |
| P6 | M6 | Port it | P3 rewritten in text, passes | Real robot avoids a real obstacle | **Video** + sim-vs-real comparison writeup |
| P7 | M7 | Race the line | Accuracy ≥ target in sim | Real line course, timed | **Tuning log** + video |
| P8 | M8 | Return to base | Within tolerance across seeds | 3 real out-and-back runs, measured | Measured error per run + **error budget** |
| P9 | M9 | Maze solver | ≥8/10 unseen mazes | Tape maze on the floor *(stretch)* | Seed results, path-efficiency ratio |
| P10 | M10 | Follow the colour | Target tracked ≥ threshold | Real camera tracking | Video + **failure catalogue** (5 conditions, photographed) |
| P11 | M11 | Teach it something | Classifier ≥ threshold on held-out data | Data collected from the real robot | Dataset description, **confusion matrix**, honest test accuracy |
| P12 | M12 | Capstone | Prototype in sim | Full build | **Design doc**, 2-min demo video, test results, year reflection |

### 9.3 The GitHub portfolio (locked decision)

**Repo:** the learner creates one public repository from a template we publish — `learn-robotics-portfolio-template` — in **month 1**, before there is anything impressive to put in it. Doing it early makes documenting a habit and makes the month-1 entry a trivially easy first commit.

**Structure:**

```
my-robotics-year/
  README.md                  ← auto-generated index; the thing they show people
  progress.json              ← periodic backup of the learner record
  projects/
    p01-signal-lamp/
      README.md              ← the entry (generated skeleton, learner completes)
      program.blocks.json    ← program export
      program.py             ← generated or hand-written text code
      results.json           ← sim grading output (seeds, metrics, timestamps)
      media/                 ← photos, video links
    p02-polygon-plotter/
    ...
  logbook/
    2026-09.md               ← monthly logbook entries, appended
```

**Flow, per project:**

1. `/projects/pNN` → **"Generate portfolio entry"**. The site produces a zip (and a copyable markdown block) containing `README.md` pre-filled with the brief, the rubric checklist, the sim `results.json`, the program export, and empty prompts for the writeup and media.
2. The learner commits it to their repo — by hand in month 1 with a walkthrough, and it becomes routine by month 3. (Teaching git is a deliberate secondary objective; it is a genuinely useful skill and costs almost nothing to fold in.)
3. The learner pastes the entry URL back into the site.
4. The site **verifies** (§9.4).
5. The tutor runs a **design review** (§14.3): two probing questions on the writeup.
6. Status becomes `complete`. The project card on `/progress` gains the link.

**Privacy guardrails (a minor is publishing to the open internet — this is not optional):**

- A one-screen media policy shown before the first upload: no faces, no school uniforms, no house numbers, no location metadata, no full name unless a guardian agrees. Strip EXIF before committing (we provide a browser-side EXIF stripper — it runs locally, nothing is uploaded to us).
- **A private repo is fully supported.** Verification then falls back to `self-attested` (§9.4), which is worth exactly as much pedagogically and is stated as such.
- We never store the media, never proxy it beyond a HEAD/GET liveness check, and never require a GitHub login or OAuth token.

### 9.4 Proof verification — four honest tiers

| Tier | What is checked | How |
|---|---|---|
| **T1 Auto-verified** | The sim milestone | Deterministic grading in-browser; `results.json` carries seeds, metrics, program hash, timestamp |
| **T2 Structurally verified** | The portfolio entry exists and is complete | A Pages Function fetches the raw URL, confirms 200, confirms the required section headings are present, confirms ≥1 media reference, confirms the rubric checklist is filled. Cached; ~1 request per project |
| **T3 Probed** | The learner can explain it | Tutor asks two questions generated from their own writeup; answers stored (§14.3) |
| **T4 Attested** | A human saw it work | Optional. Either a guardian/mentor types a short note, or the learner self-attests with an explicit "I am recording this as true" checkbox for private repos |

**We say plainly, in the product:** T2 checks that you *wrote* something, not that it is *true*. This is a pedagogical instrument, not an examination board. The learner is the person the honesty benefits, and the product should say so rather than pretending to a rigour it cannot have.

### 9.5 Sim → real: the conversion, taught explicitly

The most valuable single lesson in physical robotics is *how reality differs from your model*, and the product should teach it as content rather than let it happen as frustration.

- **The bridge is one-directional and honest.** The sim program is the *specification*; the real program is a port. We do not pretend they are the same artefact.
- **Every real milestone from P4 onward requires a `sim-vs-real` section** in the entry: what number did the sim predict, what happened, what accounts for the difference. Candidate causes are taught (friction, battery sag, sensor cone, motor deadband, latency, wheel slip, floor surface) so the learner has vocabulary rather than "it just didn't work".
- **The impairment dial closes the loop the other way.** After a real run, the learner is prompted to tune the sim's impairment settings until it reproduces what they saw. Making the simulation *worse* until it matches reality is a genuinely advanced idea, it is fun, and by month 8 they can do it.
- **Hardware bring-up gets its own checklist** (M6.5): power on, LED test, wheels test, sensor sanity, then the program. Debugging by bisection is taught as a method, not as a hint.

---

## 10. Interactivity requirements

*"Make it so interactive"* is turned into rules, not aspiration.

### 10.1 The rule

**IR-1: No lesson may consist only of prose.** Every lesson contains at least one of: a `RobotLab`, a manipulable widget, a quiz, a trace ledger, a prediction, or a debug challenge. Enforced by C-INTERACTIVE (§16).

**IR-2: Every concept lesson has a widget that lets you break the idea.** Reading that gear ratio trades speed for torque is inert; dragging a gear-teeth slider and watching the wheel speed and climbing ability trade off is not.

### 10.2 The widget catalogue

| Widget | Module | What the learner manipulates |
|---|---|---|
| Circuit bench | M4.1 | V and R sliders → current, LED brightness, and a resistor that visibly burns out |
| Gear dial | M4.2 | Teeth counts → ratio, output speed, torque, and a hill the robot can or can't climb |
| PWM scope | M4.5 | Duty cycle → waveform, average voltage, motor buzz, deadband floor |
| Power budget | M4.3 | Component list → total draw → runtime from a given battery |
| Arm poser | M4.4 / M8.5 | Joint angles → tip position; reachable workspace shaded |
| Threshold explorer | M3.2 | A threshold line over a live noisy sensor trace; shows the false triggers you'd get |
| Noise dial | M3.3 | Noise σ → the same program's success rate over 20 runs |
| State machine builder | M5.3 | Drag states and transitions; it generates the block skeleton |
| Control tuner | M7.2–7.4 | Kp/Kd sliders → live response curve, overshoot, settling time |
| Odometry drift | M8.4 | Slip and tick-error sliders → estimated path diverging from the true path |
| Search animator | M9.3 | Step through flood fill cell by cell; the frontier visible |
| Threshold/mask viewer | M10.2 | Threshold slider over a real image → mask; shows what you lose |
| Classifier scatter | M11.3 | Add points, move the boundary, watch train vs test accuracy diverge |

Each widget is a self-contained Astro component with no dependencies beyond canvas/SVG (HC7), works offline, and is keyboard-operable (§15.4).

### 10.3 Interactivity in the shell

- **Roadmap → Progress Board:** the module track (`PRD-UX.md` §5.3) showing where you are, what's next, and what the gates are. Nothing is dated and nothing is overdue.
- **This-week card:** on every page load — three items maximum, one of which is a review drill.
- **`/progress`:** existing heatmap and mastery, plus the reasoning trends (§7.7), project cards with evidence links, and a quarter-review link.
- **Seed chips** on every graded run (§8.6).
- **Chaos die** (§7.5).
- **The logbook** (`/logbook`): an append-only journal. Auto-entries for milestones ("passed P7 on attempt 9"), manual entries any time, and the invariant/explain-back answers. Exportable to the portfolio repo monthly. This is the thing that will feel most valuable in month 12 and least valuable in month 1, so the product has to make month-1 entries nearly free.

---

## 11. Records and the data model

### 11.1 Principles

- **Local-first.** localStorage remains the source of truth (HC5, no accounts).
- **Backed up in two places.** Manual JSON export (exists) plus `progress.json` committed to the portfolio repo at each project. Browsers do clear localStorage; a year of records lost in month 9 would end the project.
- **Versioned and migrated.** v1 → v2 migration runs on load, is idempotent, and is tested. Never a silent reset. (C-MIGRATE)
- **Skill-shaped, not page-shaped.** What matters is what they can *do*, and it should survive curriculum reshuffling.

### 11.2 Storage layout

| Store | Key | Contents | Why here |
|---|---|---|---|
| localStorage | `lr-progress-v2` | The learner record (§11.3) | Small, synchronous, exportable |
| localStorage | `lr-workspace-<labId>` | Saved block program per lab | Existing behaviour, kept |
| **IndexedDB** | `lr-artifacts` | Run traces, replay data, ML datasets, camera frames | Too large for localStorage; capped with LRU eviction |
| GitHub repo | `progress.json`, `projects/**` | Durable backup + the portfolio itself | Learner-owned, survives device loss |

### 11.3 The learner record (v2)

```jsonc
{
  "version": 2,
  "createdAt": "2026-09-01T09:00:00Z",
  "yearStart": "2026-09-01",           // activity heatmap only — never paces anything
  "pace": "standard",                   // standard | relaxed | intense

  "lessons":  { "m1-meet": { "completedAt": "…", "attempts": 1, "timeMs": 540000 } },
  "quizzes":  { "m5-gate-quiz": { "best": { "score": 9, "total": 10 }, "attempts": [ ] } },

  "missions": {                         // graded labs, keyed by lab id
    "m3-wall-stop": {
      "passed": true, "passedAt": "…",
      "attempts": 7, "bestScore": 0.92,
      "seedsPassed": 5, "seedsTotal": 5, "unseen": false,
      "blocks": 11, "steps": 143,
      "rigor": 2, "programHash": "sha256:…"
    }
  },

  "skills": {                           // §11.4
    "sense.threshold": { "right": 9, "wrong": 2, "level": 3,
                          "lastSeen": "…", "nextReview": "…" }
  },

  "reasoning": {
    "predictions": { "total": 64, "correct": 41, "byStage": { "S1": 0.52, "S2": 0.67 } },
    "debug":       { "attempted": 22, "firstTry": 13, "hintsUsed": 6 },
    "constraints": { "solved": [ "m2-fewer-blocks", "m5-no-repeat" ] },
    "unassisted":  { "missions": 31, "withTutor": 12 },
    "explanations":{ "asked": 8, "answered": 8, "probesAnswered": 14 }
  },

  "projects": {
    "p07": {
      "status": "complete",             // not-started | sim-passed | evidence-linked
                                        // | probed | complete | revise
      "simPassedAt": "…",
      "entryUrl": "https://github.com/…/projects/p07-race-the-line/README.md",
      "verifiedAt": "…", "verifyTier": "T2",
      "rubric": { "tuningLog": true, "video": true, "simVsReal": true },
      "probes": [ { "q": "…", "a": "…" } ],
      "attestation": null
    }
  },

  "assessments": [ { "at": "…", "level": "hard", "score": 4, "total": 5,
                     "skills": [ { "id": "ctrl.proportional", "correct": true } ] } ],

  "gates":    { "A": { "openedAt": "…" }, "B": { "openedAt": null } },
  "hardware": { "microbit": true, "chassis": true, "esp32": false, "camera": false,
                "notes": "left motor is slower" },

  "logbook":  [ { "at": "…", "kind": "auto|manual|invariant|reflection",
                  "moduleId": "m7", "text": "…" } ],

  "daily":    { "2026-09-03": { "lessons": 1, "exercises": 2, "runs": 14,
                                "assessments": 0, "minutes": 32 } },
  "activeDays": [ "2026-09-03" ],
  "badges":     [ "first-spark" ],
  "settings":   { "theme": "auto", "autoRun": true, "telemetry": false,
                  "noiseDefault": true, "reducedMotion": false }
}
```

### 11.4 The skill graph

~60 skills, ids namespaced by area: `core.*`, `logic.*`, `sense.*`, `elec.*`, `act.*`, `code.*`, `ctrl.*`, `kin.*`, `plan.*`, `perc.*`, `ml.*`, `sys.*`, `safety.*`, `ethics.*`, `debug.*`, `meta.*`.

Declared in three places, cross-checked by CI:

- `src/content/skills.json` — id, label, area, one-line definition, prerequisites.
- Lesson frontmatter — `teaches: []`, `requires: []`.
- Assessment templates — `skills: []` on every question template.

**C-SKILLMAP** enforces the closure: every skill is taught by ≥1 lesson, assessed by ≥1 template, and used by ≥1 project; every `requires` is taught in an earlier module; no orphans in any direction. This is the machine-checkable version of the project's existing rule *"if the assessment tests it, a lesson must teach it"*, generalised.

### 11.5 Mastery and spaced review

Level 0–5 per skill, driven by correct/incorrect events from assessments, quizzes, and graded missions. Review interval by level: 1, 3, 7, 16, 35, 90 days. `nextReview` drives the "review drill" slot in the this-week card. A skill not seen past its interval **decays one level**, which is what makes month-11 review of month-2 material happen naturally rather than never.

**Framing rule:** decay is never shown as loss. The UI says "worth a refresher", not "you forgot this".

### 11.6 Migration from v1

```
v1.completed[]        → v2.lessons{ slug: { completedAt: null, attempts: 1 } }
v1.quizScores{}       → v2.quizzes{ slug: { best } }
v1.topicStats{}       → v2.skills{} via a TOPIC_TO_SKILLS map (one topic → several skills,
                        counts divided evenly and rounded down; documented as approximate)
v1.assessments[]      → v2.assessments[] (skills[] absent on historical rows; tolerated)
v1.daily/activeDays/badges/exercises → carried across unchanged
```

Migration is pure, idempotent, tested against a corpus of synthetic v1 blobs, and writes `lr-progress-v1-backup` before replacing anything.

---

## 12. Gates and unlocks

Today `GATE` is a single object. v2 needs a list, and `verify.mjs` already enforces that the gate cannot drift from the lesson files — that property must survive.

```js
export const GATES = [
  { id: 'A', afterModule: 3, label: 'Kit 1 — micro:bit robot',
    requiredCheckpoints: ['m1-blink','m1-turn','m2-loops','m3-wall-stop'],
    requiredProjects: ['p01','p02','p03'],
    quiz: 'gate-a-quiz', minRatio: 0.8, unlocks: '/kit-1/' },
  { id: 'B', afterModule: 6, label: 'Kit 2 — ESP32 and sensors',
    requiredCheckpoints: ['m4-motors-gears','m5-obstacle-course','m6-flash-it'],
    requiredProjects: ['p04','p05','p06'],
    quiz: 'gate-b-quiz', minRatio: 0.8,
    requiredAcknowledgements: ['safety-battery','safety-solder'],
    unlocks: '/kit-2/' },
];
```

**Design notes.**

- Gates are **pedagogical, not security** — the existing framing is correct and stays. A determined teen can bypass them in devtools and that is fine; what matters is that the default path doesn't spend £70 before the ideas have landed.
- Gates guard **money and safety**, nothing else. No content is locked for its own sake.
- Gate B adds a safety acknowledgement step because it is the first module with LiPo batteries and possible soldering. It names an adult explicitly for the soldering step only.
- Quarter boundaries are **not** gates. A learner who wants to run ahead into M7 should be allowed to; the record will show what they skipped.

---

## 13. Motivation over twelve months

The hardest problem in this product is not pedagogy, it is **week 19**.

| Mechanism | What it does | Guard against gamification |
|---|---|---|
| **This-week card** | Three things, one of which is a 5-minute drill. Never a wall of undone work | Overdue items are never counted or shown in red; they roll forward silently |
| **Forgiving streaks** | Existing streak logic, plus a weekly "active week" streak that survives missing days | A blank day is explicitly framed as not a failure (existing copy — keep it) |
| **Boss mission** | Each module ends in a named challenge with a bit of theatre | It is a real mission, not a cutscene |
| **Earned cosmetics** | Arena skins, robot chassis colours, trail colours — unlocked by *reasoning* achievements (a first-try debug, a constraint solve, a perfect prediction streak) | Purely cosmetic; never gates content; never a currency |
| **Quarterly highlight reel** | Auto-generated page: your best run, your worst crash, your biggest prediction miss, what you built | Generated from real data, not from participation |
| **Show someone** | A prompt each quarter to demo to a human, and log their best question | The only social mechanic; there is no leaderboard, because there is one user |
| **Slack weeks** | Four in the year, plus one "pause the year" button that shifts the plan rather than breaking it | Pausing is a first-class action, not a failure state |
| **Badges** | Existing set, extended toward reasoning: *Predictor*, *First-Try Debugger*, *Minimalist*, *Tuner*, *Honest Scientist* (reported a failure), *Year One* | Badges for thinking, not for clicking |

**Explicit anti-pattern list:** no daily login pressure, no lives/hearts, no XP inflation, no artificial waiting, no comparison to other learners (there are none), no notifications that guilt.

---

## 14. The AI tutor, evolved

### 14.1 Keep

Socratic-by-default (hint first, explanation on explicit request), streaming, program-aware context, server-side clamps, daily quota with refunds, plain-language quota exhaustion, `@cf/meta/llama-3.1-8b-instruct`, `max_tokens: 300`.

### 14.2 Extend

- **Rigor-aware.** The system prompt receives the current rigor level. At R1 the tutor may nearly give the answer; at R4 it asks what they've already tried and what they predicted, and declines to hand over a solution.
- **Prediction-aware.** When a prediction was wrong, the tutor gets the mismatch and opens with the discrepancy rather than a generic hint.
- **Trace-aware.** The rules-based failure explainer (§8.8) runs first and its output is given to the tutor as fact, so the tutor never has to guess mechanism — it can go straight to *why did you expect otherwise*.
- **Never writes the program.** Explicit system-prompt rule, enforced by output post-check: if the reply contains more than N lines of code, it is replaced with a hint. Currently implicit; make it a rule.

### 14.3 New: design review (T3 proof)

On project submission, one call generates **exactly two probing questions** from the learner's own writeup. Constraints: ≤60 words each, must reference something the learner actually wrote, must be answerable by the learner (not research questions), never rhetorical.

Cost impact: 12 calls per year. Negligible. Falls back to a fixed question bank per project when the allowance is exhausted or offline.

### 14.4 Cost envelope (unchanged commitment)

Workers Free, 10,000 Neurons/day. Additions: 12 design-review calls/year, and the T2 URL check is a plain `fetch` in a Pages Function (no AI). The daily cap stays at 40 questions. **No change to the "structurally unable to bill you" property.**

---

## 15. Non-functional requirements

### 15.1 Performance

| Budget | Target |
|---|---|
| Animated sim | 60 fps on a 2020 mid-range laptop |
| Headless grading | 10 seeds × 60 simulated seconds < 3 s wall-clock, in a Worker |
| Lesson page JS | < 60 kB gzipped excluding Blockly; Blockly loads only on lab pages |
| Camera sim (M10) | 32×24 grid at ≥20 fps |
| First contentful paint | < 1.5 s on a cold cache, 4G |

### 15.2 Offline

Lessons, simulator, widgets, assessment, records, and the logbook work fully offline. Requires network: tutor, T2 verification, resources page freshness. Each degrades with a plain-language message, never an error. Project entries generated offline are queued and verified on reconnect.

### 15.3 Privacy and safety of a minor

- No accounts, no PII, no analytics, no third-party scripts (CSP already enforces).
- No learner media ever touches our infrastructure; the T2 check is a liveness fetch of a URL the learner chose to publish.
- The media policy screen (§9.3) is shown before the first evidence submission and is re-linked from every project page.
- EXIF stripping runs client-side.
- Private repos are a first-class supported path.
- Physical safety content is mandatory before Gate B: battery handling, no mains voltage, soldering with an adult, eye protection, motors and fingers, and a rule that the robot never runs unattended near stairs or pets.

### 15.4 Accessibility

- Blockly keyboard navigation enabled; every graded mission must also be solvable via the text editor from M6, which is inherently keyboard-accessible.
- Arena rendering must not rely on colour alone (seed chips carry ✓/✗ glyphs; visited waypoints carry a fill *and* a check).
- `prefers-reduced-motion` honoured: sim animation reduced to discrete step frames.
- Atkinson Hyperlegible is already the body face — keep it.
- All widgets operable by keyboard, with visible focus and ARIA labels; every canvas has a text-equivalent status line (the existing sim status line generalises to this).

### 15.5 Browser support

Chrome/Edge ≥100, Firefox ≥100, Safari ≥15.4. Requires: `structuredClone`, IndexedDB, Web Workers, `ResizeObserver`, `OffscreenCanvas` optional with a fallback.

---

## 16. Acceptance conditions

New conditions for `scripts/verify.mjs`, in the project's established style. Existing conditions (C1, C2, C-INLINE, C-HIDDEN, C-LABELS, C-LABIDS, and the curriculum/gate/glossary/resource checks) all remain.

**Curriculum structure**

| ID | Condition |
|---|---|
| C-MODULES | Exactly 12 modules; each has 4–5 lessons plus one project; every lesson has `module`, `order`, `rigor`, `kind`, `teaches`. **`quarter` is NOT required and NOT permitted** — see `C-NOCAL` (§5.3 amendment) |
| C-COVERAGE | Every row of the §5.2 topic matrix maps to ≥1 lesson, ≥1 assessment template, ≥1 project |
| C-SKILLMAP | Every skill in `skills.json` is taught, assessed and used; every `requires` is taught in an earlier module; no orphan skills in any direction |
| C-DURATION | No lesson exceeds 40 minutes; module total ≤ 150 minutes of lessons |
| C-INTERACTIVE | No lesson is prose-only — each contains ≥1 lab, widget, quiz, trace, prediction or debug challenge |

**Rigor**

| ID | Condition |
|---|---|
| C-RIGOR-MONO | Module rigor never decreases with module number |
| C-RIGOR-DECL | Every lesson declares `rigor`; every graded lab's `rigor` matches its lesson |
| C-RIGOR-IMPL | A lab's grading props satisfy its declared rigor (R2+ ⇒ `seeds`≥5; R3+ ⇒ prediction required; R4+ ⇒ `unseen` and a scored metric) |
| C-PREDICT | Every R2+ graded lab has `predict` configured with a prompt |

**Simulator**

| ID | Condition |
|---|---|
| C-SIM-DET | Same program + same seed ⇒ identical metrics across 100 runs (runtime test) |
| C-SIM-HEADLESS | Core imports nothing DOM-related; no `requestAnimationFrame` in `sim/core.js`, `sensors.js`, `noise.js` |
| C-SIM-PERF | 10 seeds × 60 s of simulated time completes under 3 s in CI |
| C-WORLDS | Every world JSON validates against the schema; every `world` referenced by a lesson exists |
| C-SEEDS | Every seeded mission's reference solution passes ≥ `mustPass` seeds; no mission is unpassable |
| C-NOSHORTCUT | For every R2+ mission, a straight-line/hard-coded reference program **fails** — proving the mission cannot be brute-forced |

**Projects and proof**

| ID | Condition |
|---|---|
| C-PROJECTS | Exactly 12 projects; each has brief, rubric, sim milestone, evidence spec; P4+ have a real milestone |
| C-RUBRIC | Every project rubric item maps to a checkable field in the record |
| C-TEMPLATE | The portfolio entry template contains every heading T2 verification looks for (prevents the generator and the checker drifting apart) |
| C-PRIVACY | The media policy screen exists and is linked from every project page |

**Records**

| ID | Condition |
|---|---|
| C-MIGRATE | v1 → v2 migration is idempotent and lossless over a synthetic v1 corpus |
| C-SCHEMA | The record validates against its schema after every public mutation in the library |
| C-BACKUP | Export produces a file that import restores byte-identically |

**Existing invariants to preserve:** C2 (no eval) — the M6 parser must not reintroduce it; C-INLINE; C-HIDDEN; C-LABELS; C-LABIDS extended to cover world ids and project ids.

---

## 17. Delivery plan

Seven phases. Each is independently shippable — the site is never broken between phases — and each has exit criteria that are machine-checkable. Sequencing is by dependency, not by curriculum order: **the platform is built before the content that needs it.**

### Phase 0 — Foundations *(record + skills + migration)*
Record v2 schema, migration with backup, skill graph (`skills.json` ~60 skills), lesson frontmatter extensions, mastery/decay/review scheduling, `/progress` reads v2.
**Exit:** C-MIGRATE, C-SCHEMA, C-BACKUP, C-SKILLMAP pass; the existing 12 lessons still complete end-to-end on migrated data.

### Phase 1 — Simulator core split
`sim/core.js` + `render.js` + `runner.js` + seeded `noise.js`; world JSON schema and loader; deterministic replay; headless Worker grading; multi-seed grading + seed chips.
**Exit:** C-SIM-DET, C-SIM-HEADLESS, C-SIM-PERF, C-WORLDS pass; all 26 existing sim tests still pass against the new core.
**Risk note:** highest-regression phase in the plan. Existing sim tests are the safety net and must be ported first, not last.

### Phase 2 — Reasoning engine
`<Predict>`, trace ledger, invariant prompts, debug-challenge framework + mutation catalogue, constraint budgets and banned blocks, the run-trace failure explainer, `reasoning` metrics on `/progress`.
**Exit:** C-PREDICT passes; ≥20 debug challenges authored or generated; reasoning metrics visible.

### Phase 3 — Rigor + grading enforcement
Rigor declarations across all lessons, `GATES[]` replacing `GATE`, verify conditions C-RIGOR-*, C-NOSHORTCUT, C-SEEDS; existing 12 lessons retro-fitted with rigor and seeds where applicable.
**Exit:** every rigor condition passes; the reference hard-coded program fails every R2+ mission.

### Phase 4 — Projects and portfolio
Project data model, `/projects` and `/projects/pNN`, entry generator (zip + markdown), the portfolio template repo, T2 verification function, T3 design review, T4 attestation, media policy + EXIF stripper, `progress.json` backup flow.
**Exit:** C-PROJECTS, C-RUBRIC, C-TEMPLATE, C-PRIVACY pass; P1–P3 fully walkable end-to-end by a real learner.

### Phase 5 — Content: Q1 and Q2 *(M1–M6)*
Rewrite/expand the existing 12 lessons to the new structure, author the ~18 new ones, build the M4 widget set, build the MicroPython subset parser + text mode, write Gate A/B pages (Kit 1, Kit 2, safety), extend the assessment generator to the new skills.
**Exit:** M1–M6 complete and CI-green; text mode passes a dedicated parser test suite; C-COVERAGE passes for all Q1/Q2 rows.
**Note:** the parser is the long pole. Start it at the beginning of Phase 5, not the end.

### Phase 6 — Content: Q3 and Q4 *(M7–M12)*
The ~28 remaining lessons; new sensors (encoder, IMU, camera, bumper); control/odometry/planning/perception/ML widgets; maze generator; mutating worlds; dataset recorder + k-NN; capstone framework; consolidation weeks; quarterly review pages.
**Exit:** all 12 modules CI-green; C-COVERAGE fully satisfied; a full-year dry run (scripted) completes every mission and project milestone.

### Phase 7 — Motivation, polish, year review
Year calendar and this-week card, cosmetics, quarterly highlight reels, logbook page, badge extension, accessibility audit, performance audit, a real-hardware pass on Kit 1 and Kit 2 instructions.
**Exit:** accessibility and performance budgets met; hardware instructions validated against actual purchased kits.

### Effort shape (indicative, not a commitment)

| Phase | Relative size | Dominant work |
|---|---|---|
| 0 | S | Schema + migration |
| 1 | **L** | Sim refactor, determinism, Worker |
| 2 | M | New components + metrics |
| 3 | S | Declarations + conditions |
| 4 | M | Function, template, generator |
| 5 | **XL** | ~18 lessons + the parser + widgets |
| 6 | **XL** | ~28 lessons + 5 new sensors + 6 widgets |
| 7 | M | Polish |

Content authoring (Phases 5–6) is roughly 60% of total effort. Any schedule that treats it as a rounding error will fail.

---

## 18. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Content volume overwhelms the build.** ~46 new lessons is the bulk of the work | High | High | Lesson templates per `kind`; author a whole module before building its widgets; ship quarter by quarter — a learner only needs M7 in month 7 |
| R2 | **Learner quits around month 4–5** (post-novelty, pre-payoff) | High | High | Gate A lands at month 3 so real hardware arrives exactly when novelty fades; P5's two-mode robot is deliberately the most *fun* project of Q2; slack weeks; pause button |
| R3 | **The MicroPython parser is underestimated** | Medium | High | Scope it explicitly (§8.7), timebox, and keep a fallback: ship M6 with blocks→text reading + real-hardware flashing only, deferring in-browser text *execution* to a later release |
| R4 | **Sim refactor regresses the working simulator** | Medium | High | Port the 26 existing sim tests first; keep the old `sim.js` importable until parity is proven; C-SIM-DET as the contract |
| R5 | **GitHub friction stops proof from happening** | Medium | Medium | Month-1 setup with a walkthrough while stakes are zero; template repo; generated entries so the learner never faces a blank file; self-attestation always available |
| R6 | **Hardware unavailable, wrong, or broken** | Medium | Medium | Name two alternatives per kit component; every project has a sim-only fallback that still teaches the idea; a "my robot is broken" diagnostic flow |
| R7 | **Privacy incident** — a minor publishes identifying media | Low | **High** | Mandatory policy screen, client-side EXIF stripping, private-repo path fully supported, explicit guardian note |
| R8 | **Free-tier drift** — the tutor becomes chargeable | Low | Medium | No new AI surfaces beyond 12 design-review calls; existing caps unchanged; monitor Neurons |
| R9 | **localStorage loss** wipes a year | Medium | High | `progress.json` committed at every project; export prompt at each gate and each consolidation week |
| R10 | **Rigor becomes discouragement** rather than challenge | Medium | High | Retries free and celebrated; R-RULE-6 (never retroactive); trend framing not scores; the tutor gets more helpful, not less, after repeated failures on the same mission |
| R11 | **Unattributed changes in the working tree** (three prior occurrences per `CHANGES.md`, one of which broke the build) | Medium | High | Never merge without reading `git diff`; branch protection; CI green as a precondition; treat any unexplained diff as suspect and revert rather than repair |
| R12 | **Scope creep into a multi-user platform** | Medium | Medium | Single-user is a locked constraint; any feature needing accounts is out of scope by definition (§19) |

---

## 19. Out of scope

Accounts, multi-user, classrooms, teacher dashboards. Cloud storage of learner media. Certification or credentials. Native mobile apps. 3D simulation. Physics-engine dynamics. ROS 2 as a required install. Autonomous purchasing/affiliate links. Real-time collaboration. Two-way blocks↔text round-tripping (one-way blocks→text, then text-only, is the chosen model — §8.7). Original video production (remains deferred per the README).

---

## 20. Open questions

| # | Question | Needed by |
|---|---|---|
| Q1 | Confirm the two kit bills of materials and current prices, with a second-source alternative for each part | Phase 5 (Gate A page) |
| Q2 | Is ESP32-CAM bought at Gate B, or a third small purchase at month 10? Bundling at Gate B is simpler; splitting is cheaper if M10 is never reached | Phase 5 |
| Q3 | Is the portfolio repo public by default, or private by default with public as an opt-in? This is a guardian decision, not a product one | Phase 4 |
| Q4 | Does the learner have a phone camera available for M10's offline exercises? | Phase 6 |
| Q5 | Fixed year start date, or rolling from first launch? Affects whether the calendar shows real dates or week numbers | Phase 0 |
| Q6 | Is there an adult available for the one soldering step at Gate B? If not, Kit 2 must be specified entirely solderless (it can be — screw terminals and Dupont jumpers — at slightly higher cost) | Phase 5 |
| Q7 | Should the capstone brief be approved by a human (guardian/mentor), or only rubric-checked? | Phase 6 |

---

## Appendix A — Repository impact map

| Path | Change |
|---|---|
| `src/lib/sim.js` | **Split** into `src/lib/sim/{core,sensors,noise,world,render,runner,grade}.js`; old module kept as a shim until parity |
| `src/lib/progress.js` | **Rewrite to v2** with migration; `GATE` → `GATES[]`; skills, reasoning, projects, logbook |
| `src/lib/blocks.js` | New blocks: encoder read, IMU heading, bumper, servo angle, camera read, per-wheel drive |
| `src/lib/interpreter.js` | Unchanged core; gains the AST shape emitted by the new Python parser |
| `src/lib/pyparse.js` | **New** — MicroPython-subset tokeniser + parser (§8.7) |
| `src/lib/assessment.js` | Extend to ~14 topics/60 skills; templates gain `skills: []` |
| `src/lib/review.js` | Extend from static analysis to run-trace analysis (§8.8) |
| `src/lib/portfolio.js` | **New** — entry generation, zip, verification client |
| `src/lib/plan.js` | **New** — year plan, this-week card, review scheduling |
| `src/components/RobotLab.astro` | Grading props (`seeds`, `mustPass`, `unseen`, `maxBlocks`, `banned`, `scoreBy`, `rigor`, `predict`), seed chips, telemetry pane, replay scrubber, text mode |
| `src/components/Predict.astro`, `TraceLedger.astro`, `DebugChallenge.astro`, `Widget*.astro` | **New** |
| `src/content/modules/` | 12 existing lessons revised; ~46 new (60 total across 12 modules) |
| `src/content/worlds/`, `src/content/skills.json`, `src/content/projects/` | **New** |
| `src/pages/projects/`, `src/pages/logbook.astro`, `src/pages/plan.astro`, `src/pages/review/[quarter].astro`, `src/pages/kit-1.astro`, `src/pages/kit-2.astro` | **New** |
| `src/pages/go-physical.astro` | Becomes `kit-1.astro`; content largely reused |
| `functions/api/verify-entry.js` | **New** — T2 portfolio URL check |
| `functions/api/chat.js` | Rigor-aware prompt, code-length post-check, design-review mode |
| `scripts/verify.mjs` | ~25 new conditions (§16) |
| `scripts/test-*.mjs` | New suites: `test-worlds`, `test-grade`, `test-pyparse`, `test-migrate`, `test-skills`, `test-plan` |
| `public/glossary.json` | 23 → ~90 terms |

## Appendix B — Glossary of this document

**Rigor level (R1–R5)** — the declared standard a module is graded at (§6).
**Seed** — an integer that deterministically generates one variant of a world.
**Unseen seed** — a seed the learner cannot run before submitting; used for grading from M9.
**Mission** — a graded lab exercise inside a lesson.
**Project** — a month-end deliverable with a portfolio entry.
**Entry** — one project's folder in the learner's GitHub portfolio repo.
**Skill** — an atomic capability (`ctrl.proportional`) tracked with mastery and review scheduling.
**Impairment** — a deliberate simulator degradation (noise, deadband, latency) used to teach robustness.
**Mutation** — a change to the world *during* a run (improvise mode), or a deliberate defect injected into a program (debug challenges).
