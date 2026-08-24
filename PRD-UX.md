# PRD — Learn Robotics: UX, interactivity, and structure for a teenager

**Status:** Draft for review · **Version:** 1.1
**Scope:** The *experience* layer. Complements `PRD.md` v2 (which specifies curriculum, simulator, rigor, and records). Where the two disagree, this document wins on presentation and information architecture; `PRD.md` wins on pedagogy and data.
**Date:** 2026-08-23 · **Baseline audited:** `phase5a-pyparse` @ `55c8630`, running dev server measured at 375×812 and 1280×800.

**Changes in v1.1** — two product-owner decisions, both of which change the spine rather than the paint:

1. **Calendar pacing is removed** (§5.2). The year, the month, and the quarter stop being units of progress. A learner who is going fast should be allowed to go fast. This is not a copy change — `currentQuarter()` derives from wall-clock months, so today an eager learner's reasoning data all lands in one bucket and a learner who pauses advances a quarter having learned nothing.
2. **Projects gain a design-and-proof workbench** (§5.6–§5.12): plan the approach, list the parts with sizes and units, lay out the connections, build it, photograph it, and see the plan beside the result. §5.12 evaluates the idea honestly, including the one part of it that cannot be built as stated.

---

## 0. Reader's guide

| If you want… | Read |
|---|---|
| The measured evidence that something is wrong | §1 |
| What "interactive for teens" means as rules, not vibes | §2 |
| The visual system upgrade | §3 |
| The navigation and IA restructure | §4 |
| **The alignment fix** — roadmap ↔ modules ↔ projects ↔ gates | §5.1, §5.3–§5.5 |
| **Pacing without a calendar** — finish early if you're ready | §5.2 |
| **The project workbench** — design, parts, wiring, build, photo | §5.6–§5.11 |
| Does the workbench idea actually work? An honest evaluation | §5.12 |
| The lesson page rebuilt around *what is it / what's expected / here's an example* | §6 |
| Visual and video concept explainers | §7 |
| Resources, rebuilt as contextual shelves | §8 |
| Assessment → drills that change what you do next | §9 |
| Badges → milestones with a home | §10 |
| Accessibility, performance, privacy, offline | §11 |
| Machine-checkable acceptance conditions | §12 |
| Build order | §13 |
| Risks, decisions reversed, open questions, scope | §14–§17 |

**Five complaints this document answers**, as the product owner stated them:

1. The UI is not interactive enough for a teenager.
2. Projects, modules, and the roadmap are unclear, unattractive, and not aligned.
3. Concept explanation should be visual — with video — and should say *what this is*, *what's expected*, and *show a worked example*.
4. Resources are "completely way out".
5. Assessment isn't useful, and badges are just hanging around.

All five are correct. §1 measures them.

---

## 1. Audit — measured, not asserted

Everything below was read out of the running site or the source tree, not estimated.

### 1.1 The site has no pictures. Any pictures.

Counted in the rendered `<main>` of every page:

| Page | Words | `<img>` | `<svg>` | `<canvas>` | `.card` |
|---|---|---|---|---|---|
| `/` (Roadmap) | ~700 | **0** | **0** | 0 | 8 |
| `/projects/` | 546 | **0** | **0** | 0 | 12 |
| `/modules/m4-circuits/` | 519 | **0** | **0** | **0** | 1 |
| `/resources/` | 281 | **0** | **0** | 0 | 6 |
| `/assessment/` | 141 | **0** | **0** | 0 | 4 |
| `/progress/` | 220 | **0** | **0** | 0 | 13 |

`public/` contains no image assets of any kind — only JSON, `sw.js`, `theme.js`, `_headers`, and the manifest. The only non-text visual in the entire product is the simulator `<canvas>` inside `RobotLab`, and every visual affordance in the chrome is an emoji glyph in a text node: `▶ ↺ 🔍 ⛶ 🔗 🔒 🎉 🤖 📷 ⚙ ◐ ⬇ ⬆`.

This is the root cause of "not attractive". It is not a taste problem — the token system in `src/styles/global.css` is genuinely well designed (blueprint grid, LED-amber accent, PCB-trace progress bar, a real second dark theme). It is an **under-built** problem: a good palette applied to unbroken columns of text in identical white boxes.

### 1.2 Two lessons have zero interactive elements — including lesson one

Per-lesson audit of `src/content/modules/*.mdx`:

| Lesson | `kind` | RobotLab | Quiz | Debug | Words |
|---|---|---|---|---|---|
| **m1-meet** | concept | **0** | **0** | **0** | 110 |
| m1-blink | lab | 1 | 0 | 0 | 109 |
| m1-turn | lab | 1 | 0 | 0 | 76 |
| m2-loops | lab | 1 | 0 | 0 | 142 |
| m2-light-show | lab | 1 | 0 | 0 | 108 |
| m3-sensing | concept | 1 | 1 | 0 | 205 |
| m3-wall-stop | lab | 2 | 0 | 1 | 627 |
| **m4-circuits** | concept | **0** | 1 | 0 | **674** |
| m4-motors-gears | concept | 2 | 1 | 0 | 787 |
| m5-events | concept | 1 | 0 | 0 | 401 |
| m5-obstacle-course | challenge | 1 | 0 | 0 | 237 |
| m5-gate-quiz | quiz | 0 | 1 | 0 | 369 |

**`m1-meet` is the first thing a teenager ever sees**, and it is 110 words of prose followed by a "Mark done" button. **`m4-circuits` is 674 words of prose** — voltage, current, resistance, Ohm's law, a markdown table of consequences — with no widget, and its answer to "want to see it for real?" is a sentence pointing at *another website*.

`PRD.md` §10 already legislates against exactly this (IR-1: no prose-only lesson; IR-2: every concept lesson has a widget you can break). The rule is aspirational — nothing enforces it, and two lessons violate it today.

### 1.3 The mobile header eats a fifth of the screen, permanently

Measured at 375×812:

- `.site-head` height: **173 px** = **21% of the viewport**, `position: sticky`, on every page.
- Cause: seven equal-weight nav links (`Roadmap · Projects · Progress · Assessment · Glossary · Resources · Go physical`) plus logo plus theme toggle in one `flex-wrap: wrap` row, wrapping to **two rows of links** at that width.

Seven flat destinations of identical weight is also an IA failure independent of its height: nothing in the navigation answers a teenager's only real question — **"what do I do right now?"** There is no resume affordance anywhere in the product. No "continue", no "next up", no memory of where you stopped. The roadmap is the closest thing, and it is a 3,640 px scroll of nested lists.

### 1.4 Roadmap, modules, and projects are three unaligned structures

This is the most damaging finding, and it is structural, not cosmetic.

| Structure | Source | Spans |
|---|---|---|
| Lessons / modules | `src/content/modules/*.mdx` | Modules **1–5**, 12 lessons |
| Projects | `src/content/projects.json` | Modules **1–12**, 12 projects (`p01`–`p12`) |
| Gates | `GATES[]` in `src/lib/progress.js` | Gate **A** only (after module 5) |
| Curriculum promise | `PRD.md` §5 | **12 modules**, 12 months |

`/projects/` renders **twelve cards**, of which **nine belong to modules that do not exist**. Project `p07 · Module 7 · Race the line` is a live, clickable card whose detail page instructs the learner to *"build it in the simulator on the module page first"* — there is no Module 7 page. Nine of twelve project cards are dead ends dressed as available work.

Worse, even for the modules that *do* exist there is **not one cross-link between the three structures**:

- The roadmap (`src/pages/index.astro`) lists lessons. It never mentions that Module 1 has a project, or which one.
- `/projects/index.astro` prints `Module 3` as plain text — not a link to Module 3.
- `/projects/[id].astro` says "build it on the module page" without linking to a module page.
- No lesson links to its project.
- The gate appears on the roadmap as a card and again at `/go-physical/`, but not in the module sequence where it actually sits.

A teenager cannot answer "what is a module, what is a project, and how do they relate?" from this UI, because the UI does not encode a relationship. That is precisely the reported "not aligned properly".

Two further clarity failures on the same surface: `/projects/` labels every card with a bare **`R3`** and **`Proof tier T1+`**. The rigor ladder and proof tiers are specified in `PRD.md` §6 and §9, but in the UI they are unexplained codes with no legend, no tooltip, and no link.

### 1.5 Resources are thin, off-target, and disconnected

`public/resources.json` holds **nine links total** for what is meant to be a twelve-month course:

| Module | Count | Contents |
|---|---|---|
| m1 | 2 | 1 video (2020), 1 tool |
| m2 | 1 | 1 tool |
| m3 | 1 | 1 tool |
| m4 | 3 | 2 articles (one from **2013**), 1 video |
| m5 | 1 | 1 tool |
| go-physical | 1 | 1 tool |
| **m6–m12** | **0** | — |

Four of nine are the *same class of thing* — third-party playgrounds (Blockly Games ×2, Wokwi ×2) that pull the learner **out of the product into a competing one**, offered mid-flow rather than as optional extras. Only **two** entries are video, in a product whose owner is asking for video-led explanation.

The presentation compounds it. `/resources/` is six cards of `<ul>` with monospace metadata reading `tool · published 2024-01-01 · last checked 2026-08-07`. The dates were added to signal freshness; on a page whose headline entry is stamped **2013**, they signal decay instead. There are no thumbnails, no durations, no indication of *when in your learning* to open a given link, and — critically — **no link in either direction between a resource and the lesson it supports**. Lessons refer to the resources page in prose ("the resources page links SparkFun's…"); the resources page does not know lessons exist.

"Completely way out" is a fair summary: wrong quantity, wrong mix, wrong placement, wrong framing.

### 1.6 Assessment has no consequences

`/assessment/` generates 5 multiple-choice questions at one of three difficulties from `src/lib/assessment.js`. The generator is good work — computed answer keys, trace questions that literally simulate the robot, zero cost, offline. The *product around it* does nothing:

- **It doesn't know what you've learned.** A learner on day one can pick **Hard** and be asked about gears and Ohm's law from Module 4. Nothing scopes the pool to skills the lessons have actually taught — even though every lesson declares `teaches: [...]` in frontmatter and `src/content/skills.json` exists.
- **It doesn't change what you do next.** You get `3/5`, a paragraph of explanations, and two buttons: retry, or go look at `/progress/`. No wrong answer links back to the lesson that teaches it. No wrong answer schedules a revisit — despite `record.js` already exporting `applySkillEvent` and `decayDue`, the spaced-review primitives, unused by this page.
- **It isn't the gate.** The confidence gate uses a separate quiz (`m5-gate-quiz`). So the page called "Assessment" is the one assessment that gates nothing.
- **It talks to the wrong reader.** A full card of body copy explains *why the questions are procedurally generated rather than AI-written*. That is design rationale for an engineer reviewing the repo, printed on the page a teenager is supposed to use.

A quiz that can't be failed into anything and can't be passed into anything is decoration. "No useful" is accurate.

### 1.7 Badges have no home, no locked state, and no shelf

Seven badges exist in `BADGE_LABELS` (`src/lib/progress.js:487`). They render in exactly two places, both as unstyled paragraphs:

```js
// src/pages/index.astro
host.innerHTML = badges.length
  ? '<p class="eyebrow">Badges</p>' + badges.map((b) => `<p>${BADGE_LABELS[b] || b}</p>`).join('')
  : '';
```

Consequences:

- **Invisible until earned.** The homepage renders an *empty string* when you have none — so on day one a new learner has no idea badges exist, what they are for, or how to get one. A reward you cannot see is not a reward.
- **No criteria, no progress.** `circuit-cadet` is "five lessons down"; nothing shows "3 of 5".
- **No home.** They appear as a trailing fragment at the bottom of the roadmap, and again as the ninth of thirteen cards on `/progress/`.
- **No moment.** Earning one produces no acknowledgement at all; the label simply appears in a list the next time something repaints.
- **Not aligned to what the product values.** `PRD.md` §7 and §13 make *reasoning* the core bet — predictions, first-try debugging, constraint solves — and `progress.js` already records all three. No badge rewards any of them. Four of the seven are for clicking (lessons finished, days active); three are for perfect assessment scores.

"Hanging around" is exactly right: they are attached to the product, not part of it.

### 1.8 Card soup

`/progress/` renders **13** `.card` elements; `/` renders **8**; `/projects/` renders **12**. The stylesheet defines a real hierarchy — `.card-do` (hard-edged, offset shadow, for *the thing you act on*) and `.card-note` (a quiet left-rule aside) — and the comment above them names the intent exactly: *"not everything should be the same card"*. In practice `.card-do` is used on four surfaces total, and every other page is a uniform stack of white rounded rectangles with no visual ranking. Nothing on the roadmap tells the eye where to start.

### 1.9 What is genuinely good, and must survive

Named explicitly so the rebuild doesn't discard it:

- The **token system and dual theme** — `--paper/--grid/--ink/--wire/--led/--go`, the graph-paper background, and a dark mode that is a real second design rather than an inversion.
- The **PCB-trace progress bar** (`.trace-progress`) — the one piece of signature visual identity in the product, and a good one.
- **`RobotLab`** — block editor, live sim, block help, code bridge, seed chips, share, expand. The strongest surface in the product by a wide margin.
- **Accessibility groundwork** — skip link, Atkinson Hyperlegible body face, `:focus-visible` rings, `prefers-reduced-motion` handling, `[hidden]` enforcement with a documented CI condition.
- **The `verify.mjs` condition culture** — 23 named `C-*` conditions gating CI. Every rule in this document is written to join it.
- **Offline + privacy posture** — service worker, no accounts, no PII, strict CSP with no `unsafe-inline`.

---

## 2. Design goals, and what "interactive for teens" means as rules

### 2.1 Principles

**P1 — Show it before you say it.** Every idea gets a thing that moves before it gets a paragraph. Prose explains the demo; the demo does not illustrate the prose.

**P2 — One obvious next action, from anywhere.** At most one primary action per screen, always visible, always resumable. The learner should never have to plan.

**P3 — Manipulable beats animated; animated beats static; static beats nothing.** Prefer a slider they can break. Fall back to a loop they can scrub. Fall back to a diagram. Never fall back to a wall of text.

**P4 — Say what "done" looks like before they start.** Every task states its definition of done in the learner's language, up front, and shows one worked example of a *different* instance of the same task.

**P5 — Everything visible connects to everything else.** A lesson knows its module, its project, its gate, its skills, and its resources — and links to all of them. No orphan surfaces.

**P6 — Reward thinking, not clicking.** Recognition attaches to predictions, debugging, and constraint solves, never to attendance.

**P7 — Never guilt, never nag, never compare.** There is one learner. Overdue work rolls forward silently. (Inherited from `PRD.md` §13, already honoured in the streak copy — keep it.)

**P8 — Nothing here costs money or breaks offline.** Every visual is code, a local asset, or a click-to-load facade. (HC3, HC4.)

### 2.2 The rules that make it checkable

| # | Rule | Enforced by |
|---|---|---|
| **IX-1** | No lesson may be prose-only. Every lesson contains ≥1 lab, demo, quiz, prediction, or debug challenge. | `C-INTERACTIVE` |
| **IX-2** | Every `kind: concept` lesson contains ≥1 `<ConceptDemo>` the learner can manipulate. | `C-CONCEPT-VISUAL` |
| **IX-3** | No run of ≥150 words of prose without an intervening visual or interactive element. | `C-PROSE-BREAK` |
| **IX-4** | Every lab states its definition of done in an `<Expect>` block before the editor. | `C-EXPECT` |
| **IX-5** | Every lesson that introduces a new skill shows one `<WorkedExample>` of that skill on a *different* instance than the mission. | `C-EXAMPLE` |
| **IX-6** | Every page has exactly one primary action, and ≤2 `.card-do`. | `C-HIER` |
| **IX-7** | Resume is reachable in one tap from every page. | `C-RESUME` |
| **IX-8** | Every module, lesson, project, gate, skill, and resource links to its neighbours in the spine (§5.1). | `C-ALIGN` |

### 2.3 Success measures, honestly bounded

There is one learner, no accounts, and no analytics (HC5). So success cannot be measured by funnels. It is measured **structurally, in CI**, plus one qualitative check.

| # | Measure | Today | Target |
|---|---|---|---|
| M1 | Sticky header height at 375 px | 173 px (21% of viewport) | **≤ 72 px** (≤9%) |
| M2 | Taps from any page to "the next thing I should do" | ∞ (no such affordance) | **1** |
| M3 | Lessons with zero interactive elements | 2 of 12 | **0** |
| M4 | Concept lessons with a manipulable demo | 2 of 5 | **5 of 5** |
| M5 | Longest unbroken prose run in any lesson | 674 words (m4-circuits) | **≤ 150 words** |
| M6 | Non-text visual elements outside the sim | 0 | **≥1 per lesson, ≥1 per module card** |
| M7 | Project cards pointing at a module that doesn't exist | 9 of 12 | **0** (planned modules render as an explicit `planned` state) |
| M8 | Cross-link edge types present in the spine | 0 of 6 | **6 of 6** |
| M9 | Shipped modules with ≥1 video and ≥1 read resource, each tagged with *when* to use it | 0 of 5 | **5 of 5** |
| M10 | Assessment questions scoped to skills already taught | No | **Yes** |
| M11 | Wrong answers that route to the lesson teaching them | 0% | **100%** |
| M12 | Badges visible before they are earned, with criteria and progress | 0 of 7 | **all** |
| M13 | Largest `.card` count on any page | 13 | **≤ 6** |
| M14 | Places where progress is computed from wall-clock time | 3 (`quarter:` frontmatter, `currentQuarter()`, `byQuarter`) | **0** |
| M15 | Projects with a design stage before the build | 0 of 12 | **12 of 12**, tiered by sim vs hardware |
| M16 | Hardware projects whose parts list carries a spec **and** a unit | n/a — no parts list exists | **all rows prompted; unspecced rows flagged** |
| M17 | Time to complete the design stage for a typical project | n/a | **≤ 5 min** (design budget, §5.12.5) |

The qualitative check: **the ten-second test.** Hand the roadmap to a teenager who has never seen it. In ten seconds they should be able to point at (a) where they are, (b) what they do next, and (c) the thing they will have built by the end. Today none of the three is answerable.

---

## 3. The visual system, upgraded

The direction — *engineer's graph-paper notebook, navy ink, one LED-amber accent* — is kept. It is distinctive and age-appropriate without being childish. What it lacks is **differentiation, imagery, hierarchy, and motion**. This section adds exactly those four things and nothing else.

### 3.1 Module identity: twelve accents from one ramp

Today every module card is identical white. A teenager scanning a year of work needs modules to be **places**, not rows.

Add one derived hue per module — twelve stops around the existing navy/amber axis, all contrast-checked against `--ink` and `--paper` in both themes:

```css
/* src/styles/modules.css — one accent per module, both themes */
:root {
  --m1: #3e6c9e;  /* First Sparks      — blueprint blue  */
  --m2: #5b7fb8;  /* Loops & Patterns                    */
  --m3: #2fa36b;  /* Sense & Decide    — sensor green    */
  --m4: #c8873c;  /* Electricity & Muscle — copper       */
  --m5: #8a5fb0;  /* Robot Brain                         */
  /* …m6–m12 declared with the modules that introduce them */
}
```

Usage rules, so this stays a system and not decoration:

- The accent colours **the module's trace bar, its card rule, and its glyph** — never body text, never a large fill.
- Every accent ships a `--mN-ink` companion that passes **4.5:1** against the module card background in light *and* dark (`C-CONTRAST`).
- Colour is never the only signal. Every module also carries a **glyph** (§3.3) and a number.

### 3.2 Card hierarchy, enforced

Three levels exist in CSS already. The fix is to *use* them and cap the count.

| Level | Class | Means | Budget per page |
|---|---|---|---|
| **Act** | `.card-do` | The thing you do now. Hard border, offset shadow. | **≤ 2** |
| **Content** | `.card` | Grouped information. | ≤ 4 |
| **Aside** | `.card-note` | Context, rationale, "why". | unlimited (it's not a box) |

Plus a fourth level that is **not a card at all**: plain sectioned content on the graph-paper ground. `/progress/` at 13 cards becomes 3 cards and 5 unboxed sections. `C-HIER` fails CI on any page with >2 `.card-do` or >6 `.card`.

### 3.3 An icon set, replacing emoji in the chrome

Emoji is currently doing all the visual work in the UI. It renders differently per platform, can't be themed, can't be sized, and reads as chat rather than as an instrument.

Ship **one inline SVG sprite** (`src/components/Icon.astro` + `public/icons.svg`), ~28 icons at 24px on a 2px stroke grid, all `currentColor`:

`run · reset · why · expand · share · link · lock · unlock · check · cross · concept · lab · challenge · quiz · project · gate · module · skill · video · read · tool · time · sensor · motor · led · circuit · gear · robot`

Rules:

- **Emoji stays in prose voice** (it's warm, and the copy is good). Emoji is **banned from interactive control labels** — those get an icon plus a real accessible name (`C-ICON`).
- Icons are decorative (`aria-hidden`) wherever a text label is present; otherwise the control carries `aria-label`.
- One sprite, cached by the service worker, zero network cost after first load, works offline.

### 3.4 Lesson-type glyphs

Four glyphs so the map is scannable by shape, not just readable by word:

| `kind` | Glyph | Reads as |
|---|---|---|
| `concept` | ◈ open diamond | "learn a thing" |
| `lab` | ▶ filled play-in-square | "build a thing" |
| `challenge` | ◆ filled diamond | "prove a thing" |
| `quiz` | ✓ check-in-circle | "check a thing" |

These appear on the roadmap, in the module card, in the lesson header, and in `/me`. Same glyph, same meaning, four places — that repetition is what makes it learnable.

### 3.5 Typography and rhythm

| Property | Now | Change | Why |
|---|---|---|---|
| Body size | 1rem / 1.6 | **1.0625rem / 1.7** | Long-form reading on a laptop at arm's length |
| Measure | 65ch | **62ch** | Slightly shorter lines survive dense technical prose better |
| Prose block cap | none | **≤150 words between visuals** (`C-PROSE-BREAK`) | The single highest-leverage change in this document |
| Heading rhythm | `1.6em` top margin | keep | Fine |
| Reading column | 46rem | keep | Fine |

### 3.6 Motion, in five places and nowhere else

The product currently has no motion at all except button presses, and the reduced-motion guard is already correct. Add exactly five moments — each one marks a *state change*, none is ambient:

| Moment | Animation | Duration |
|---|---|---|
| Lesson completed | The trace-bar LED lights and glows into place | 420 ms |
| Mission passed | The sim canvas flashes the `--go` ring once; the trace advances | 500 ms |
| Milestone earned | Award card slides in once, dismissible, never modal (§10.4) | 600 ms |
| Gate unlocked | The padlock glyph opens; the locked panel cross-fades to unlocked | 700 ms |
| Concept demo scrub | Continuous, driven by the learner's own input | — |

All five sit behind the existing `prefers-reduced-motion` block, which becomes a hard condition (`C-MOTION`): every keyframe or transition over 150 ms must have a reduced-motion fallback that still communicates the state change *statically*.

### 3.7 Identity: 20 seconds of ownership

One small, cheap thing that changes how a teenager relates to the product: on first visit, ask for **a name and a robot colour**. Two fields, skippable, stored in the same localStorage record.

- The name appears in copy sparingly — completion moments and the milestone shelf, not every heading.
- The colour paints the robot in the simulator and the avatar on `/me`.
- This is the *only* personalisation. No avatars-as-currency, no cosmetics economy. `PRD.md` §13's earned cosmetics (arena skins, trail colours) hang off this system later.

---

## 4. Navigation and information architecture

### 4.1 The problem restated

Seven flat links, 173 px of sticky header on mobile, and no answer to "what now". The nav is a table of contents for a *document*, and this is not a document.

### 4.2 The new shell

**Three destinations, one resume bar, one utility menu.**

```
┌──────────────────────────────────────────────────────────┐
│ ⚙ LearnRobotics    Learn   Build   Me            ⋯   ◐   │  ← ≤ 56px
├──────────────────────────────────────────────────────────┤
│ ▸ Continue: Stop before the wall · Module 3 · 20 min     │  ← ≤ 44px, dismissible
└──────────────────────────────────────────────────────────┘
```

| Destination | Route | Contains | Was |
|---|---|---|---|
| **Learn** | `/` | The Progress Board (§5.3): modules, lessons, projects, gates, all in one spine | Roadmap |
| **Build** | `/build/` | Projects gallery + portfolio + media policy + go-physical kit pages | Projects, Go physical, Media policy |
| **Me** | `/me/` | Progress, milestones, drills, mastery, glossary, backup | Progress, Assessment, Glossary |
| ⋯ menu | — | Glossary search, media policy, about, export/import, reset | scattered |
| — | — | **Resources: no top-level page.** Dissolved into context (§8). | Resources |

**The Continue bar** is the fix for M2. It is a slim, persistent strip under the header showing the single next action, derived from the record: the next incomplete lesson, or an overdue drill, or the current project's next step. One tap. Dismissible per-session, never nagging, and it disappears entirely on the surface it points at.

Header height budget: logo 24 px + 3 links + 2 icon buttons on one row = **≤ 56 px**, plus the Continue bar's 44 px only where relevant. Both together are still **less than 173 px** (`C-NAV-HEIGHT`, asserted at 360 px, 375 px, and 768 px).

### 4.3 Why Resources and Assessment lose their tabs

Both are *services*, not destinations. A teenager does not wake up wanting to visit a resources page; they want help with the thing in front of them. Making them top-level tabs is what produced §1.5 and §1.6 — surfaces disconnected from the moment they're useful.

- **Resources** appear inline at the point of need and aggregated on the module page (§8).
- **Drills** (the rebuilt assessment, §9) are surfaced by the review scheduler in the Continue bar and on `/me/`, sized to the time available.

Neither loses functionality. Both stop being places you have to remember to go.

---

## 5. The spine — modules, projects, and pacing

This is the answer to *"projects, modules, roadmap are not clear and not aligned properly."* The cause is that the product has three parallel structures that were built at different times and never joined. The fix is to declare **one canonical spine** and make every surface a view onto it.

### 5.1 The spine

```
THE TRACK
 └── MODULE  (m1…m12)   ← has: title, accent, glyph, one-line promise
      ├── LESSONS  (concept | lab | challenge | quiz)
      │     └── SKILLS taught     → drills, mastery, review
      │     └── RESOURCES         → shelf, tagged with WHEN
      ├── PROJECT  (exactly one, pNN)   ← designed, built, photographed, kept
      └── GATE?    (0 or 1)             ← Gate A after m5, Gate B after m8
```

There is **no `YEAR` and no `MONTH` node**. That is a deliberate removal, specified in §5.2. The spine is an ordered track with unlocks on it, and the only thing that advances it is finishing work.

**Six invariants**, all machine-checked by `C-ALIGN`:

| # | Invariant |
|---|---|
| A1 | Every module has **exactly one** project. Every project has **exactly one** module. |
| A2 | Every project's module exists in `src/content/modules/`, **or** the project is explicitly `state: "planned"`. |
| A3 | Every lesson links up to its module; every module lists its lessons in order. |
| A4 | Every module page shows its project; every project page links to its module and to the lessons that prepare it. |
| A5 | Every gate declares the module it follows and appears **in the module sequence**, not only on a separate page. |
| A6 | Every skill in `teaches:` exists in `skills.json`, and every skill maps to ≥1 lesson (the existing `C-SKILLMAP` extended both ways). |

A2 is the immediate bug fix for §1.4. Nine project cards currently promise work that cannot be started. They do not get deleted — twelve projects is the product's central promise, and hiding it would make the course look smaller than it is. They get an honest state.

### 5.2 Pacing without a calendar

**Decision: the month is removed as a unit of progress.** If the learner is eager and finishes a module in four days, that is a success, not a scheduling error. Nothing in the product should tell them to wait.

#### 5.2.1 This is not a copy change

Calendar time is wired into four layers, not just the words:

| Layer | Where | What it does today |
|---|---|---|
| Content schema | `quarter: z.number().min(1).max(4)` in `src/content.config.ts` **and** `src/content/config.ts` (declared twice) | Every one of the 12 lessons carries a hand-set `quarter: 1` or `2` |
| Record | `yearStart` in `emptyRecord()`, `pace: 'standard' \| 'relaxed' \| 'intense'` | Anchors a 12-month clock from first launch |
| Derived state | `currentQuarter()` in `progress.js:254` | Computes the quarter from **wall-clock months elapsed** since `yearStart` |
| Analytics | `reasoning.predictions.byQuarter` | Buckets every prediction by that wall-clock quarter |
| Copy | `projects/index.astro`: *"One project a month… take to real hardware (from month 4)"* | Tells the learner the pace |

#### 5.2.2 The wall-clock quarter is already a bug

This is worth stating as a defect rather than a preference, because it is one:

> `currentQuarter()` returns `floor(months_since_yearStart / 3) + 1`.

So a learner who finishes five modules in three weeks has **every prediction they ever made filed under Q1** — and `/progress/`'s "How you think" panel, whose stated purpose is *"trends, not scores — the point is that they move as you grow"*, renders a single bar and no trend. Meanwhile a learner who opens the site once and returns four months later is silently promoted to Q2 having learned nothing.

The bucket is keyed to the wrong axis. **Under mastery pacing it should key on progress, not on dates** — which also happens to make the trend line mean what the panel claims it means.

#### 5.2.3 What replaces it: stages

| Removed | Replaced by | Notes |
|---|---|---|
| `quarter:` frontmatter | **nothing** — derive it | The module number already implies the stage. A hand-maintained field that duplicates `module` is a drift risk, and `C-NOCAL` forbids reintroducing it. |
| `currentQuarter()` | `currentStage(record)` | Derived from **modules completed**, not from dates: S1 = m1–m3, S2 = m4–m6, S3 = m7–m9, S4 = m10–m12 |
| `predictions.byQuarter` | `predictions.byStage` | A migration maps existing `Q1…Q4` keys to `S1…S4` — `migrate()` and `C-MIGRATE` already exist for exactly this |
| `yearStart` | keep, **demote** | Still useful for the activity heatmap ("when did I do things"), which is legitimately about dates. Never used to compute progress or to pace anything. |
| `pace: standard\|relaxed\|intense` | keep, **repurpose** | No longer a schedule. It only sets the review-drill cadence and how chatty the Continue bar is. |
| *"One project a month"* | *"One project per module"* | And *"from month 4"* becomes *"from Module 4"* |

#### 5.2.4 What the learner sees instead

- The roadmap stops being a **year** and becomes a **track** (§5.3). This is a visual upgrade as well as a semantic one: freed from twelve equal calendar slots, the map can be laid out as a board with unlocks on it, which is both more attractive and more on-theme than a timeline.
- **Nothing is ever "due".** No overdue state, no behind-schedule state, no red. The only forward-looking thing in the product is the Continue bar, and it says *what's next*, never *when*.
- **Going fast is celebrated, not throttled.** A learner who clears a module in a sitting gets the module-complete moment immediately.
- **Going slow is invisible.** Returning after six weeks shows the same track in the same place, with one line: *"Welcome back — you were on Stop before the wall."* No streak loss framing, no catch-up plan. (This is already the product's instinct in the streak copy; removing the calendar makes it consistent.)

#### 5.2.5 The one honest brake

Removing every time signal invites the opposite failure: clicking through twelve lessons in an afternoon and retaining none of it. The product already owns the right instrument for this — `dueSkills` / `decayDue` spaced review — and it needs one clear rule:

> **You can finish the course as fast as you like. The only thing that waits is the review drill — and it waits for you, not for a calendar.**

Concretely: lessons, projects, and gates are **never** time-gated. Review drills become available when a skill's `nextReview` comes round, which does require elapsed days. So an eager learner reaches Gate A quickly and legitimately, and *then* finds review drills arriving over the following weeks. The drill is a returning invitation, not a lock. `C-NOCAL` asserts that no lesson, project, or gate has a time-based precondition anywhere in the codebase.

### 5.3 The Progress Board replaces the roadmap

`/` becomes a **board**, not a list. Three zoom levels, one page, no navigation between them.

**Level 1 — the track** (always visible, ~140 px tall)

This is where removing the calendar pays off visually. A twelve-month timeline has to be twelve equal slots in date order — a ruler. A track does not: it can bend, branch at gates, and give a module the width its work deserves.

So Level 1 is a **circuit trace** running across the board, drawn in the language `.trace-progress` already establishes but at full scale: one LED pad per module in that module's accent, copper segments between them, **gate padlocks soldered onto the trace** where they sit, and a lit "you are here" pad. Completed segments are filled copper; the ones ahead are the pale blueprint outline of a trace not yet routed.

```
   m1     m2     m3          GATE A        m4     m5  …
   ●━━━━━━●━━━━━━◉━━━━━━━━━━━━[🔒]━ ─ ─ ─ ─ ○ ─ ─ ─ ○ ─ ─
   done   done   here                      planned
```

It is the ten-second test made visible — where I am, how far it goes, what the checkpoints are — and it is the product's own signature element finally used at the scale it deserves. Nothing on it refers to a date.

**Level 2 — module cards** (the body of the page)

One card per module, in the module's accent, containing:

```
┌─ M3 ─────────────────────────────── Sense & Decide ─┐
│  ●━━━●━━━○           2 of 3 done          [colour]  │   ← trace, accent
│  "Your robot stops deciding by counting steps       │   ← one-line promise
│   and starts deciding by looking."                  │
│                                                     │
│  ◈ Your robot gets eyes          15 min      ✓      │   ← glyph, time, state
│  ▶ Stop before the wall          20 min   ▸ NEXT    │
│  ◆ Don't crash        PROJECT p03 · R2 · sim  →     │   ← project IN the module
└─────────────────────────────────────────────────────┘
```

The project is **inside its module card**, as the last row — because that is what it is: the module's finale. This one layout decision does more for "alignment" than any amount of cross-linking, because it makes the relationship spatial instead of hyperlinked.

**Level 3 — gates, in sequence**

The gate is a card in the module flow between M5 and M6, styled as a barrier rather than a page link:

```
╔═══════════════════════════════════════════════════════╗
║  🔒 GATE A — the confidence gate                      ║
║  6 checkpoints · gate quiz ≥80%  →  unlocks Kit 1     ║
║  ▓▓▓▓▓▓▓▓░░░░  4 of 7                    See what's   ║
║                                            left →     ║
╚═══════════════════════════════════════════════════════╝
```

Progress toward the gate is shown *on the gate*, not hidden behind a click to `/go-physical/`. Today the learner has to navigate to a separate page to discover they are 4 of 7 through.

**Module states.** Every module card carries exactly one:

| State | Rendering | Rule |
|---|---|---|
| `done` | Full accent, LEDs lit, project badge if complete | All lessons + project complete |
| `current` | Full accent, `.card-do` treatment, "NEXT" marker on one lesson | Contains the next incomplete lesson |
| `available` | Full accent, quiet | Prerequisites met |
| `locked` | Desaturated, padlock, shows *what unlocks it* | Behind an unopened gate |
| `planned` | **Blueprint-ghost**: dashed rule, no fill, accent at 30%, "Arriving in Phase N" | Content not yet built (m6–m12 today) |

`planned` is the honest state that fixes M7. It reads as *drawn but not built* — which fits the blueprint metaphor exactly, tells the truth, and still lets the learner see the shape of the whole course. A `planned` module's project card is visible and readable (the brief is genuinely motivating) but its actions are disabled with a plain explanation, never a dead link.

### 5.4 The module page — a new surface

There is currently no module page; modules exist only as groupings on the roadmap. This is why nothing has anywhere to link *to*. Add `/modules/m3/` (distinct from the existing lesson routes `/modules/m3-sensing/`):

| Section | Content |
|---|---|
| Header | Number, title, accent, glyph, one-line promise, trace bar |
| **What you'll be able to do** | The module's skills as plain-language "can do" statements, pulled from `skills.json` |
| Lessons | The sequence with glyphs, times, states |
| **The project** | The full brief card for this module's project |
| **The gate** | If one follows this module |
| **Deep dive shelf** | This module's resources (§8), tagged with *when* |
| Drill | "Test yourself on this module" → scoped drill (§9) |

This is the page that makes "what is a module?" answerable, and it is the missing link in every cross-reference in A3–A5.

### 5.5 The projects gallery, rebuilt

`/build/` keeps a gallery view — twelve projects is a genuinely impressive thing to see laid out — but fixes the four clarity failures from §1.4:

- **Rigor is explained, not encoded.** `R2` becomes a chip reading **`R2 · works in 8 of 10 random worlds`**, with a link to a rigor-ladder explainer. The bare letter-number is meaningless to a teenager; the standard behind it is the entire point of `PRD.md` §6.
- **Proof tier is explained or removed.** `Proof tier T1+` becomes plain language: *"Evidence needed: a sim recording + your program"*.
- **Module is a link**, and the card shows the module accent so the gallery visibly groups by module.
- **State is honest.** `planned` projects are ghosted, briefs readable, actions disabled with a reason.

Cards also gain the one thing that makes a gallery worth having: **a picture**. Each project gets a generated hero — a deterministic canvas render of that project's arena or a still from the learner's own passing run once they have one. A gallery of twelve title-and-paragraph cards is a list with extra spacing; a gallery of twelve images is a portfolio.

---

### 5.6 The project workbench — what's missing today

Here is the entire current project flow, from `src/pages/projects/[id].astro`:

| Step | What it asks |
|---|---|
| 1 | Pass the sim milestone |
| 2 | Generate your portfolio entry |
| 3 | Link and verify it |
| 4 | Tick the rubric |
| 5 | Answer two design-review questions |

**There is no design step.** The learner goes from *"it worked in the simulator"* straight to *"write it up"*. Nothing anywhere in the product asks them, before they build:

- What is your approach going to be?
- What parts do you need, how many, and what size?
- How are those parts going to be connected?

And nothing asks them, after they build, to put a picture of the real thing next to the plan they made.

This is the largest pedagogical hole in the project layer, and it is a strange one for a robotics course to have, because **design-before-build is the discipline**. A brief (`brief.goal`, `brief.metric`, `brief.constraints`) states the problem; the rubric grades the outcome; the middle — the part where engineering actually happens — is absent.

`projects.json` has no field for a bill of materials, no field for connections, and no field for a build photo. The record has `hardware: { microbit, chassis, esp32, camera, notes }` — five booleans and a free-text note — which is inventory, not design.

### 5.7 The five-stage project, replacing the five-step form

```
  ①  DESIGN          ②  SIM           ③  BUILD          ④  PROVE        ⑤  REFLECT
  plan it first      make it work     make it real      show it          what changed?
  ─────────────      ────────────     ────────────      ─────────        ────────────
  · approach         · RobotLab       · assemble        · photo          · plan vs built
  · parts (BOM)      · seeded grade   · flash it        · annotate       · sim vs real
  · connections      · sim milestone  · make it go      · rubric         · portfolio entry
  ↓ LOCKED on submit                                                     ↑ shows ① beside ④
```

Two structural properties make this teach rather than just collect data:

**The plan is locked when you submit it.** Stage ① is committed before stage ③ begins, and after that it is read-only — visibly stamped *"planned before you built"*. You cannot retroactively edit your parts list to match what you ended up using. This is exactly the predict-then-run mechanic (`PRD.md` §7.1) that the product already runs at block level, applied at project scale, and it is what makes stage ⑤ worth anything.

**Stage ⑤ shows ① and ④ side by side.** The plan and the photograph, together, with one prompt: *"What did you plan, what did you actually build, and what accounts for the difference?"* That comparison is the single most valuable artefact the project layer can produce, and it costs nothing to generate because both halves already exist.

### 5.8 Stage ① — Design

Three panels, tiered by whether the project touches hardware.

#### Panel A — Approach *(all projects)*

Free text, 3–5 sentences, with three scaffold prompts so a blank box isn't the ask:

- *In one sentence, how is this going to work?*
- *What's the part you're least sure about?*
- *How will you know it's working — what will you look at?*

The middle question is the valuable one. Naming your own uncertainty before you start is a habit, and it gives the tutor and the design review something specific to probe.

#### Panel B — Parts *(hardware projects only)*

A structured table, not a text box, because the structure is the teaching:

| Field | Type | Example | Why it's a separate field |
|---|---|---|---|
| `part` | text | `Resistor` | — |
| `qty` | number | `2` | Forces "how many", which is where kits get returned to |
| `spec` | text | `220 Ω, ¼ W` | **The point of the exercise.** "A resistor" is not an answer |
| `unit` | enum | `Ω` `V` `mA` `mm` `mAh` `T` (teeth) | Makes the spec checkable, and teaches that quantities have units |
| `have` | checkbox | ☑ | Turns the BOM into a shopping list and a pre-build check |
| `why` | text | `Limits LED current so it survives` | One line. Ties the part back to a lesson |

Three small validations do a lot of work:

1. **A part with no unit is flagged, not blocked.** *"You wrote 'resistor' — which one? Resistors come in ohms."* A hint, never an error.
2. **Parts are checked against the module's kit.** The gate pages already declare the kit contents. If the plan lists a servo and the project's kit has no servo, the workbench asks *"Do you have one of these? It isn't in Kit 1."* This is the check a mentor performs and it is nearly free to implement.
3. **A row can be pulled from a picker** seeded with the kit's parts, so the common case is two taps and the free-text path is there for anything else.

#### Panel C — Connections *(hardware projects only)*

**A structured connection list, not a schematic editor.** This is the most important scoping decision in the workbench and §5.12 explains why.

| from | to | via | note |
|---|---|---|---|
| `micro:bit P0` | `motor driver IN1` | jumper | left motor forward |
| `micro:bit P1` | `motor driver IN2` | jumper | left motor reverse |
| `battery +` | `driver VM` | red wire | 4.5 V from 3×AA |
| `battery −` | `driver GND` | black wire | **common ground with the micro:bit** |

Typeable, checkable, phone-friendly, exportable straight to markdown — and **auto-rendered as a simple node-link SVG** from the rows themselves. The learner types a table and gets a diagram, which is a much better trade than being handed a canvas and a mouse.

Two checks that catch the two mistakes every beginner makes:

- **Every ground referenced at least twice.** A single `GND` row usually means the grounds aren't common, which is the classic first-robot failure.
- **Every pin in the connection list appears in the program**, and vice versa. Wiring P0 and driving P2 is a wiring bug the workbench can spot before a wheel ever turns.

### 5.9 Stage ③–④ — Build and prove

#### The photo

After the build, one prompt: **"Show me the thing."** One or more images of the finished robot or board.

Where the image goes is a hard constraint, not a detail — §5.12.2 works through it. In summary: the image is stripped of metadata **in the browser** by the `stripMetadata()` function that already exists in `src/lib/exif.js`, stored **locally in IndexedDB**, displayed in the workbench, and written into the portfolio zip on export. **It is never uploaded to us.** The media policy page and its rules (no faces, no uniforms, no house numbers, no plates) are shown at the moment of upload rather than as a link the learner is asked to read in advance.

#### Annotation is what turns a photo into evidence

A bare photograph proves a board exists. It does not prove it works, and it does not prove the learner built it. So the photo is never the proof on its own — it is the *subject* of two prompts:

- **Point at one thing that matches your plan.** *"That's the 220 Ω resistor from my parts list."*
- **Point at one thing that changed.** *"I planned 2 AA cells; it browned out under load so I went to 3."*

The second answer is worth more than the photograph. It is a learner noticing that reality disagreed with their plan and saying why — which is the entire subject of the course.

### 5.10 Stage ⑤ — the plan beside the result

```
┌── PLANNED (locked 4 builds ago) ──┬── BUILT ──────────────────────┐
│  Parts                            │  [ photo of the finished board]│
│  2× AA cell            1.5 V      │                                │
│  1× 220 Ω resistor     ¼ W        │  ✓ matches: the 220 Ω resistor │
│  1× micro:bit v2                  │  ✎ changed: 3× AA, not 2       │
│                                   │     "it browned out under load"│
│  Connections                      │                                │
│  P0 → IN1, P1 → IN2, GND common   │  ✎ changed: used P8 not P1     │
└───────────────────────────────────┴────────────────────────────────┘
        "What accounts for the difference?"  →  goes into the entry
```

Everything in this view is already recorded, so it costs one component to render. It flows straight into the portfolio entry: `buildEntryMarkdown()` gains a **`## Plan vs built`** section, alongside the existing `## Sim vs real`, and both are the same lesson at different layers — *the model was not the world*.

### 5.11 Data model additions

Added to `projects.json` per project:

```json
"design": {
  "required": true,              // sim-only projects: false
  "bom": true,                   // false for p01, p02 (no hardware)
  "connections": true,
  "kit": "kit1",                 // which kit's parts the checker validates against
  "photoPrompts": [
    "The whole robot, from the side",
    "The wiring, close enough to see which pin is which"
  ]
}
```

Added to the learner's record per project:

```json
"p04": {
  "status": "built",
  "design": {
    "lockedAt": "2026-09-02T18:41:00Z",     // after this, read-only
    "approach": "…",
    "unsureAbout": "…",
    "bom":         [ { "part": "Resistor", "qty": 2, "spec": "220", "unit": "Ω", "have": true, "why": "…" } ],
    "connections": [ { "from": "micro:bit P0", "to": "driver IN1", "via": "jumper", "note": "…" } ]
  },
  "build": {
    "photos":  [ { "id": "idb:p04-1", "w": 1600, "h": 1200, "addedAt": "…" } ],
    "matches": ["The 220 Ω resistor from my list"],
    "changes": [ { "what": "3× AA not 2", "why": "browned out under load" } ]
  }
}
```

Note what is **not** in the record: the image bytes. Only an IndexedDB key, and the dimensions needed to lay the page out before the blob loads. §5.12.2 explains why that separation is mandatory rather than tidy.

### 5.12 Does this idea work? An honest evaluation

The product owner asked for this to be checked rather than accepted. Verdict: **yes, and it is the strongest single addition proposed in this document — with one part that cannot be built as literally stated, and two scoping decisions that need making now rather than discovering later.**

#### 5.12.1 Why it works

| Reason | Evidence |
|---|---|
| **It fills the actual hole.** | The current flow has no design stage at all (§5.6). This is not an enhancement, it is a missing floor. |
| **It teaches the real workflow.** | BOM → wiring → build → verify is what practising engineers do. Naming the stages teaches the process, not just the outcome. |
| **It makes proof mean something.** | Today's proof is a written entry the learner could compose without building anything. A locked plan plus a photograph plus a list of deviations is *much* harder to fake and much more useful to look back on. |
| **It is checkable in ways prose is not.** | Parts vs kit, pins vs program, grounds counted. Machine-checkable pedagogy is this repository's whole culture, and a writeup offers almost nothing to check — `verify-entry.js` can only confirm the headings exist. |
| **It reuses what's built.** | `stripMetadata()` exists. `portfolio.js` and its heading contract exist. `hardware{}` exists. The media policy page and its EXIF tool exist. Roughly half of this is wiring, not invention. |
| **It extends the product's core bet.** | Lock-then-compare is predict-then-run at project scale, and it plugs into the reasoning metrics `progress.js` already records. |

#### 5.12.2 The part that does not work as stated: where the photo lives

Taking "add the image of the project" literally — storing images with the rest of the learner's progress — **breaks the product in three specific ways.**

The record is `JSON.stringify`'d into a **single localStorage key** (`progress.js:39,48,53`) and exported as one JSON file (`serialize()` in `record.js:258`). Therefore:

| # | What breaks | Detail |
|---|---|---|
| 1 | **Storage quota** | localStorage is ~5 MB per origin, total. One phone photo base64-encoded is 3–8 MB. The second photo doesn't fail loudly — `save()` throws mid-write and progress silently stops persisting. |
| 2 | **`C-BACKUP`** | The condition requires `serialize(deserialize(serialize(r))) === serialize(r)` — byte-identical. Multi-megabyte base64 blobs make export a file the learner cannot reasonably move around, and `validate()` has no shape for them. |
| 3 | **HC5** | *"No accounts, no PII collection, no learner media on our servers."* Any design that uploads is out, and it is out for a good reason: the learner is a minor. |

**So the image must not go in the record, and must not go to a server.** It works — well — done this way instead:

- **IndexedDB**, a separate store keyed `p04-1`, holding the blob. Purpose-built for binary, no practical size ceiling next to localStorage's, and still entirely local.
- **The record holds only the key and the dimensions.** localStorage stays small, `C-BACKUP` stays byte-identical, `validate()` stays simple.
- **EXIF stripped on ingest, automatically** — `stripMetadata(file, { maxSize: 1600 })` already does exactly this and already resizes. The learner does not have to remember to visit the media policy page first; the safe path is the default path.
- **Export becomes a choice of two.** `progress.json` as today (records only, small, unchanged), or `portfolio.zip` (records + images + generated entries), which `portfolio.js` can already build zips for. This is the one real consequence: `exportProgress()` grows a second mode, and `C-BACKUP` needs a sibling condition for the zip path.

That last point is the honest cost of the feature. It is a contained one.

#### 5.12.3 The scoping decision that matters most: no schematic editor

The natural reading of *"how will they be arranged or connected"* is a drag-and-drop wiring diagram. **Don't build one.**

| Schematic editor | Structured connection list |
|---|---|
| Weeks of work; hit-testing, routing, undo, touch support | An editable table |
| Duplicates Wokwi and Fritzing, both free and better | Complements them |
| Barely usable on a phone | Types fine on a phone |
| Produces an image — opaque to every check | Produces **rows** — every check in §5.8 becomes possible |
| Learner spends their time on drawing | Learner spends their time on deciding |

And the list still yields a picture: **auto-render the rows as a node-link SVG.** Deterministic, themeable, offline, on-brand, and about two hundred lines. The learner gets a diagram without either of you building a diagram editor.

If a learner wants a real schematic, the Playgrounds shelf (§8.3) points at Wokwi, and they can link the result in their entry. That is the correct division of labour.

#### 5.12.4 The second scoping decision: tier it, or it becomes busywork

`p01 Signal lamp` and `p02 Polygon plotter` have `realMilestone: null` — they are simulator-only. **A parts list for a project with no parts is a form for its own sake**, and the fastest way to teach a teenager that this product wastes their time.

`projects.json` already carries the field that decides this. So:

| Project type | Stage ① asks for |
|---|---|
| Sim only (`realMilestone: null`) — p01, p02, p03 | Approach + **program plan** (which blocks, in what shape, and why) |
| Hardware (`realMilestone` set) — p04 onward | Approach + **BOM** + **connections** |
| Capstone (p12) | All of the above, plus a written spec the learner sets themselves |

`C-DESIGN-TIER` asserts that no sim-only project requests a BOM and no hardware project omits one.

#### 5.12.5 Three smaller risks worth naming

1. **A photo is not proof, and must not be sold as one.** It shows a board existed. The existing T1/T2/T3 proof tiers are honest about what they verify; the photo joins them at that level of honesty — it is evidence *for the learner's own record*, and the annotations (§5.9) are what carry the learning. Framing a photograph as verification would be proof theatre.
2. **A locked plan can feel punitive if it is framed as a test.** It is not one. The copy has to earn this: *"Locking this in is the whole point — later you get to see what you got right."* A wrong plan that the learner then explains is a **better** outcome than a right one, and the milestone for it (Honest Scientist, §10.1) should say so.
3. **Form fatigue is the real failure mode.** Stage ① sits between the learner and the fun part. Mitigations: BOM rows come from a picker seeded with the kit; a "copy my last project's plan" action; three fields visible at a time, never a wall; and a hard cap of **five minutes** on the design stage for a typical project. If it takes longer than that, it is too heavy and should be cut down.

#### 5.12.6 Verdict

Build it, with the three modifications: **tier by sim vs hardware**, **connection list rather than schematic editor**, and **images in IndexedDB, stripped on ingest, never on a server**. In that form it fits the existing constraints without bending any of them, reuses roughly half of what is already written, and closes the gap between *"the robot arrived at the pad"* and *"I designed a machine, built it, and can explain where my plan was wrong."*

That second sentence is the one the product exists to make true.

---

## 6. The lesson page — *what is it, what's expected, here's an example*

This is the direct answer to the third complaint. Today a lesson opens with prose and ends with a button. The learner is never told what they are about to learn, what "good" looks like, or shown a solved instance.

### 6.1 The five-part scaffold

Every lesson gets the same five parts, in the same order, every time. Predictable structure is not boring for a teenager — it is what lets them relax about *the form* and spend attention on *the content*.

| # | Part | Component | Answers | Required for |
|---|---|---|---|---|
| 1 | **Hook** | `<Hook>` | "why should I care?" — one sentence + one visual | all |
| 2 | **What is it** | `<ConceptDemo>` + `<VideoCard>` | "what actually *is* this?" | `concept`, and any lesson introducing a skill |
| 3 | **Worked example** | `<WorkedExample>` | "show me one that's already done" | any lesson introducing a skill |
| 4 | **Your turn** | `<Expect>` + `<RobotLab>` | "what exactly do I have to make happen?" | `lab`, `challenge` |
| 5 | **Check** | `<Quiz>` / `<Predict>` / `<DebugChallenge>` | "did it land?" | all |

Enforced by `C-LESSON-SHAPE`, which reads each lesson's `kind` and asserts the required parts are present and in order.

### 6.2 `<Expect>` — the definition of done

The single cheapest fix in this document. Before the editor, in a `.card-do`, in the learner's own language:

```mdx
<Expect
  goal="The robot stops on its own before the wall — every time, from any start distance."
  done={[
    "It stops with a gap, not touching the wall",
    "It works when I drag the wall closer or further",
    "The stopping is decided by the sensor, not by counting steps",
  ]}
  notDone={[
    "Moving forward a fixed number of steps that happens to work once",
  ]}
  time="20 min"
  stuck="Try reading the distance out loud before each step — what number should trigger the stop?"
/>
```

Renders as a checklist the learner can tick as they go, with the **`notDone` line** doing real pedagogical work: it names the shortcut in advance. `m5-obstacle-course` currently patches this problem in code by requiring the sensor block be *present*; stating the standard in words is better teaching than detecting the cheat.

`<Expect>`'s `done[]` entries are the same strings the grader reports on, so "what's expected" and "what was graded" are literally the same list — a small thing that builds enormous trust.

### 6.3 `<WorkedExample>` — "here's one I did"

A stepper showing a *complete, correct* solution to a **different instance** of the same skill, with the reasoning visible at each step:

```
  Worked example — a 4-blink SOS, not your 3-blink mission

  ① Start with the repeat block          [blocks render]   ← thumbnail per step
     "I know it repeats, so the loop comes first,
      not the LED."
  ② Put ON, wait, OFF, wait inside       [blocks render]
     "Four blocks, because a blink is two states,
      not one."
  ③ Run it — and watch it run together   [sim plays]
     "No wait after OFF, so blinks merge. This is
      the bug everyone hits."
  ④ Add the trailing wait                [blocks render]
                                          ▸ Load this into my editor
```

Three rules make this teach rather than spoil:

1. **Different instance, never the mission.** `C-EXAMPLE` asserts the worked example's parameters differ from the lesson's mission parameters. Copying it must not pass.
2. **The reasoning is the content.** Each step carries the *why*, and step ③ deliberately shows a failure and its fix — modelling debugging, which is the product's core bet.
3. **Loadable.** "Load this into my editor" puts the example in the lab so it can be poked. Reading code teaches less than breaking it.

### 6.4 Lesson header

Every lesson opens with a compact strip that anchors it in the spine (P5):

```
◈ CONCEPT · 15 min          Module 3 · Sense & Decide  →
Your robot gets eyes
●━━━○━━━○   lesson 1 of 3            Teaches: sense.range
```

Module title links to the module page. Skills link to their mastery view. `Teaches:` in the header is a small thing that makes the year legible: the learner starts noticing that lessons are *made of skills*, which is exactly the mental model the drills and review scheduler depend on.

### 6.5 Retrofit order

Two lessons violate IX-1 today and are the first work:

1. **`m1-meet`** — the first impression. 110 words + a Mark Done button becomes: a hook, a `<ConceptDemo sense-think-act>` where the learner drives the loop one stage at a time and watches the robot's three subsystems light up, a 90-second curated video, and a first no-fail lab ("press Run, watch it go"). A teenager's first two minutes should include something moving.
2. **`m4-circuits`** — 674 unbroken words. Splits into three ≤150-word beats separated by the **circuit bench** demo (`PRD.md` §10.2): V and R sliders, live current readout, LED brightness responding, and a resistor that visibly burns out when you remove it. Ohm's law stops being an equation to remember and becomes a thing the learner has already broken.

Then `m4-motors-gears` (787 words, has labs but no gear demo), `m5-events` (401), `m3-wall-stop` (627).

---

## 7. Visual and video concept explanation

The product owner asked for concept explanation that is visual, uses video, and shows an example. This section specifies the three components that deliver it, and is deliberate about a constraint: **`PRD.md` §19 puts original video production out of scope**, and this document keeps that (§15). Original video is expensive to make and impossible to keep fresh. What replaces it is stronger anyway.

### 7.1 `<ConceptDemo>` — the primary explainer

**Original animation, written as code.** No video files, no bandwidth, works offline, themeable, keyboard-operable, and — the part video can never do — **the learner can break it**.

Contract:

- Canvas or SVG, no dependencies beyond what ships (HC7).
- **Deterministic**: same inputs, same frame. Rendered from a pure function of state, so it can be unit-tested like `SimCore` already is.
- **Manipulable**: at least one control (slider, dial, toggle, drag) that changes the outcome.
- **Instrumented**: shows the *numbers* alongside the picture, so the demo and the lesson's equation are visibly the same thing.
- **Reduced-motion**: static state with a "step" control instead of playback.
- **Keyboard**: every control operable by arrow keys, with a live region announcing the value.

The catalogue is already specified in `PRD.md` §10.2 (circuit bench, gear dial, PWM scope, threshold explorer, noise dial, state-machine builder, control tuner, odometry drift, search animator, classifier scatter). This document adds the four the *current* five modules need, and makes them mandatory rather than aspirational:

| Demo | Lesson | Learner manipulates | Sees |
|---|---|---|---|
| **Sense–think–act loop** | m1-meet | Step the loop; drag the wall | Which subsystem is active; the number the sensor reports |
| **Circuit bench** | m4-circuits | Voltage, resistance sliders; pull the resistor | Current in mA, LED brightness, burnout |
| **Gear dial** | m4-motors-gears | Teeth counts on both gears | Ratio, output speed, torque, a hill it can/can't climb |
| **Threshold explorer** | m3-sensing / m3-wall-stop | The threshold line over a live sensor trace | Where it triggers, where it false-triggers |

### 7.2 `<VideoCard>` — curated video, in context, privacy-safe

Video earns its place for two things a canvas demo cannot do: **showing the real physical world**, and **a human voice**. So video is used for exactly those — a real ultrasonic sensor on a real bench, a real gearbox being taken apart — never for explaining an abstraction that a demo explains better.

**The privacy and CSP mechanism matters and is a design constraint, not an implementation note.** The site sends nothing to third parties today. A naive YouTube `<iframe>` would contact Google on every page load, from a minor's browser, before any interaction. So:

```
┌────────────────────────────────────────────────────┐
│ [ local thumbnail, 16:9 ]        ▶  4:12           │
│                                                    │
│ Gears explained — a real gearbox opened up         │
│ WATCH AFTER the gear dial · adds: real backlash    │
│ youtube.com · 2021 · checked 2026-08-07            │
└────────────────────────────────────────────────────┘
```

- **Facade pattern.** The card is a **local** thumbnail (committed to `public/thumbs/`, ~20 kB WebP). No third-party request is made until the learner clicks.
- On click, it opens `youtube-nocookie.com` in a dialog, requiring `frame-src https://www.youtube-nocookie.com` in `public/_headers`. **`script-src` stays `'self'`** — HC1 and HC2 are untouched, since an iframe is not a script.
- **Offline-safe.** Thumbnail and card render offline; clicking offline shows "you're offline — this one needs a connection", not a broken frame.
- **Every card says *when* and *why*.** `WATCH AFTER the gear dial · adds: real backlash` is the whole difference between a resource and a link. A teenager should never have to guess whether a video is required, optional, before, or after.
- The `published` date stays in the metadata line but is de-emphasised; the **`checked`** date is what carries trust. (See §8.3 — the current presentation inverts this.)

### 7.3 Where each explainer form is used

Not everything needs the full treatment. The decision rule:

| The idea is… | Use | Example |
|---|---|---|
| A relationship between quantities | `<ConceptDemo>` with sliders | Ohm's law, gear ratio, PWM duty |
| A process with stages | `<ConceptDemo>` with a stepper | Sense–think–act, flood fill |
| A physical object or phenomenon | `<VideoCard>` | A real gearbox, a real sensor cone |
| A procedure the learner will repeat | `<WorkedExample>` | Building a blink, wiring a motor driver |
| A definition | `<Term>` (exists, works) + one line | "actuator" |
| A caution | `.card-note` | "the resistor is not decoration" |

`C-CONCEPT-VISUAL` enforces row 1 and 2 for `kind: concept`. Nothing enforces the video row — video is *permitted and encouraged*, never required, because requiring it would make the course depend on third-party content staying alive.

---

## 8. Resources, rebuilt

### 8.1 Diagnosis restated

The resources page is not underbuilt — it is **misplaced**. Nine links on a standalone tab, undated in usefulness, unconnected to any lesson, is a bookmarks folder. The fix is not "add more links"; it is to change what a resource *is* in the data model, and then put each one where the learner is when they need it.

### 8.2 A resource gains four required fields

```json
{
  "title": "Gears explained — a real gearbox opened up",
  "url": "https://www.youtube.com/watch?v=…",
  "type": "video",

  "module": "m4",              // ← existing, now a real foreign key
  "lesson": "m4-motors-gears", // ← NEW: which lesson it attaches to
  "when": "after",             // ← NEW: before | during | after | stuck | further
  "minutes": 4,                // ← NEW: how long it takes
  "adds": "Real backlash and the noise a loaded gearbox makes — things the dial can't show",
                               // ← NEW: what it adds BEYOND the lesson
  "thumb": "/thumbs/gears-explained.webp",  // ← NEW: local, for VideoCard

  "why": "…", "published": "2021-07-17", "checked": "2026-08-07"
}
```

`when` is the field that does the most work:

| `when` | Placement | Framing to the learner |
|---|---|---|
| `before` | Top of the lesson | "Warm up with this" |
| `during` | Inline at the relevant beat | "See this for real" |
| `after` | End of the lesson | "Now that you've built it…" |
| `stuck` | Inside the lab's help affordance, revealed after 2 failed runs | "Try this if it's not clicking" |
| `further` | Module page, Deep Dive shelf | "If you want to go further" |

`stuck` is new and valuable: the moment a learner most needs a different explanation is the moment they have failed twice, and today the product's only response is the tutor chat. A second explanation in another voice, offered exactly then, is worth more than ten links on a tab they will never open.

### 8.3 Presentation

- **Thumbnails, always.** Local WebP for video; a generated type-glyph tile for articles and tools. This alone is most of "way out" → "attractive".
- **Duration is prominent; publication date is not.** `4 min · video` in the primary line; `2021 · checked Aug 2026` in a de-emphasised metadata line. Today's presentation leads with a 2013 date, which reads as rot even though the *content* (what a circuit is) has not changed since 1827. Where a source is old but canonical, the card says so explicitly: **"Old but definitive"** — the `why` field already carries this language for the SparkFun entry; make it a rendered badge rather than buried prose.
- **Type is a glyph, not a monospace word.** `video · read · tool · datasheet · build`.

### 8.4 Third-party playgrounds get their own shelf

Blockly Games and Wokwi are good, but they are **competing products offered mid-lesson**. Sending a teenager from your block editor to another block editor at the moment they are building momentum is a self-inflicted wound.

They move to a single **"Playgrounds"** shelf on the module page, framed as *extra reps once you're done here*, never inline in a lesson, never with `when: during`.

### 8.5 Coverage requirements

| Rule | Condition |
|---|---|
| Every shipped module has **≥1 `video`** and **≥1 `read`** | `C-RES-COVER` |
| Every resource declares `module`, `when`, `minutes`, `adds` | `C-RES-FIELDS` |
| Every `lesson` value refers to a lesson that exists | `C-RES-FIELDS` |
| Every video has a **local** thumbnail; no remote asset loads before interaction | `C-RES-LOCAL` |
| Every module has ≥1 `stuck` resource for its hardest lesson | `C-RES-STUCK` |

Current coverage against these: **0 of 5 modules pass.** Closing this is a content task of roughly 25–30 curated entries for modules 1–5, which the existing monthly freshness workflow (`scripts/freshness.mjs` + lychee + human approval) already has the machinery to maintain.

### 8.6 The standalone page

`/resources/` is retired as a nav destination. The aggregate view survives at `/me/library`, ordered by module, as a place to browse everything you've been shown — which is a legitimate thing to want, and a very different thing from being the primary way resources reach the learner.

---

## 9. Assessment → Drills

### 9.1 The reframe

An assessment tells you where you stand. A **drill** changes what you do next. The generator is kept exactly as it is — it is good — and the product around it is rebuilt so that every question has a consequence.

### 9.2 Entry: time, not difficulty

The difficulty picker goes away as the entry point. A teenager choosing "Hard" on day one and getting asked about Ohm's law is a design failure, not a learner failure.

```
        How long have you got?

   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  2 min   │  │  5 min   │  │  10 min  │
   │ 3 quick  │  │ 5 mixed  │  │ 10 + one │
   │ recalls  │  │          │  │  trace   │
   └──────────┘  └──────────┘  └──────────┘

   ▸ Or: Boss drill — everything from Module 3   [locked until M3 done]
```

Difficulty is chosen **for** the learner by the rigor ladder (`PRD.md` §6) and their own mastery record: recall for skills they've just met, apply for skills they've practised, trace-and-debug for skills they've used in a mission. The manual override survives as the **Boss drill** — deliberately hard, module-scoped, opt-in, and a genuinely satisfying thing to choose.

### 9.3 Scope: only what you've been taught

The pool is filtered to skills the learner has actually met.

```
taught_skills = ⋃ { lesson.teaches | lesson ∈ completed_lessons }
pool          = { q ∈ templates | q.skills ⊆ taught_skills }
```

Every lesson already declares `teaches: [...]`; `skills.json` already exists; `C-SKILLMAP` already checks the mapping. This is wiring that is nearly free and fixes the single most damaging thing about the current page (`C-DRILL-SCOPE`).

If the pool is too small (fewer than the requested question count), the drill says so honestly — *"You've met 4 skills so far, so here are 4 questions"* — rather than reaching for material the learner has never seen.

### 9.4 Consequence: every wrong answer routes somewhere

This is the fix for "no useful". Today a wrong answer produces an explanation paragraph and nothing else. New behaviour, per wrong answer:

1. **The explanation** (exists, keep it — it is the best part of the current page).
2. **A link to the exact lesson section** that teaches the skill, deep-linked to the heading, e.g. *"This is from **Muscle: motors, gears, and torque** → Under the hood"*. (`C-DRILL-ROUTE`)
3. **A scheduled revisit.** Call `applySkillEvent(skill, { correct: false })` — already exported by `record.js`, already tested, currently unused by this page. `decayDue()` then surfaces that skill in the Continue bar in a few days.
4. **An offer to re-do the thing, not re-read it.** If the skill has a lab, the primary action is *"Rebuild the wall-stop"*, not *"Read it again"*.

And the result screen ends with **one** primary action, chosen by the record — not the current pair of equal-weight "retry" and "go look at progress".

### 9.5 What connects to what

| Surface | Relationship to drills |
|---|---|
| Continue bar | Surfaces a due drill when one is due, sized to ≤5 min |
| Module page | "Test yourself on Module 3" → module-scoped drill |
| `/me/` | Mastery view, weakest-first (exists), now with a drill button per weak skill |
| Gate | The gate quiz stays separate and stays the gate — but the gate card now shows *"your drill history suggests you're ready"* or *"three skills still shaky"* |
| Lesson | After a failed mission twice, offers the relevant recall drill as a `stuck` path |

### 9.6 Copy

Delete the "why the questions are generated, not written by an AI" card from the learner-facing page. It is a good argument and it belongs in `README.md`, `PRD.md` §16, and an `/about` page — not on the surface a teenager uses. Replace it, if anything, with one line in the results footer: *"Fresh questions every time — there's nothing to memorise."*

---

## 10. Badges → Milestones

### 10.1 The reframe

The word "badge" invites the failure mode: a sticker on the outside. **Milestone** describes what these should be — markers of a journey that is visible before you reach them.

### 10.2 Three tracks, all visible from day one

| Track | Rewards | Examples |
|---|---|---|
| **Craft** | *Thinking* — the product's core bet | Predictor (5 correct predictions in a row) · First-Try Debugger · Minimalist (passed under a block budget) · Tuner · Honest Scientist (recorded a failure) |
| **Journey** | Persistence, never attendance | First Spark · Circuit Cadet · Module Complete ×12 · Year One |
| **Build** | Real things that exist | Hardware Ready · First Real Robot · Sim-to-Real (same program, both worlds) · Portfolio Published |

Today's seven badges are 4 clicking + 3 quiz scores, and **zero** for the reasoning metrics `progress.js` already records (`recordPrediction`, `recordMissionOutcome`, `recordConstraintSolve`). The Craft track spends data the product is already collecting and currently only shows as four grey numbers on `/progress/`.

### 10.3 Locked state is the whole point

Every milestone renders in all three states, always:

```
┌───────────┐  ┌───────────┐  ┌───────────┐
│    ⚡     │  │    🔌     │  │    🔮     │
│  EARNED   │  │  ▓▓▓░░    │  │  LOCKED   │
│First Spark│  │ 3 of 5    │  │ Predictor │
│  Aug 12   │  │ lessons   │  │ 5 in a row│
└───────────┘  └───────────┘  └───────────┘
   earned        in progress      locked
```

- **Locked shows the criterion**, in plain language. A goal you can see is motivating; a surprise sticker is not.
- **In-progress shows a count.** `circuit-cadet` is "five lessons down" — so show `3 of 5`. This requires each milestone to declare a `progress(record) → {have, need}` function alongside its label (`C-BADGE-VISIBLE`).
- Locked milestones are **never** greyed into illegibility — blueprint-ghost treatment, same as `planned` modules, so the whole set reads as a plan.

### 10.4 The moment

Earning a milestone today produces nothing. It should produce a small, good moment:

- An **award card** slides in at the bottom of the current page — never a modal, never blocking, auto-dismissing after ~6 s or on any interaction.
- It shows the milestone, its name, and **one line of specific praise tied to what actually happened**: *"You predicted the crash before you ran it. That's the whole job."*
- Reduced-motion: it appears without sliding, and stays until dismissed.
- Milestones are **never** announced on page load for things earned in a previous session — only at the instant of earning. A stale celebration is worse than none.

### 10.5 One home

The trophy shelf lives at `/me/` as a real grid — the third section, not the ninth card. The homepage's orphan `<p>` list is deleted outright. The Continue bar may occasionally surface a near-miss (*"one more lesson for Circuit Cadet"*) but **at most once per session**, and never for anything more than one step away.

### 10.6 Anti-gamification guardrails

Inherited verbatim from `PRD.md` §13 and restated because this section is where they would be violated: no XP, no currency, no lives, no daily-login pressure, no leaderboard (there is one learner), no milestone that gates content, no notification that guilts. Cosmetics unlocked by Craft milestones are permitted and are the *only* thing milestones unlock.

---

## 11. Non-functional requirements

Almost all of these are inherited and must simply not be broken by this work.

### 11.1 Accessibility

| Requirement | Status | This document adds |
|---|---|---|
| Skip link, focus rings, `[hidden]` enforcement | Done, well done | — |
| Atkinson Hyperlegible body face | Done | — |
| `prefers-reduced-motion` | Done | `C-MOTION`: every new animation has a static fallback that still conveys the state change |
| Keyboard operability | Partial | **Every `<ConceptDemo>` control must be keyboard-driven** with a live region for its value |
| Colour is never the only signal | Mostly | Module accents always pair with a number + glyph (`C-CONTRAST` for the ratios) |
| Contrast ≥4.5:1 | Assumed | Asserted for all 12 module accents in both themes |
| Target size ≥44 px | Unverified | Asserted for the Continue bar, nav, and milestone tiles |

### 11.2 Performance

- Icon sprite: one file, cached, replaces zero network requests today (emoji) with one small one. Net neutral after first load.
- Thumbnails: ~20 kB WebP each; ~30 across the course ≈ **600 kB total**, service-worker cached, lazy-loaded below the fold.
- `<ConceptDemo>`: canvas/SVG, no new dependencies. HC7's 150 kB gzipped budget is unaffected — these are hundreds of lines each, not a framework.
- **No third-party request before an explicit click.** Ever. (`C-RES-LOCAL`)

### 11.3 Offline

Every part of the new UI works offline except the *inside* of a `<VideoCard>`. Cards, thumbnails, demos, worked examples, drills, milestones, and the Progress Board are all local. An offline `<VideoCard>` click shows a plain "needs a connection" state — never a broken frame, never a spinner.

### 11.4 Privacy

- The facade pattern means Google is contacted **only** if the learner clicks a video, and then via `youtube-nocookie.com`.
- `frame-src https://www.youtube-nocookie.com` is the **only** CSP relaxation this document proposes. `script-src` stays `'self'`; `unsafe-inline` and `unsafe-eval` remain forbidden (HC1, HC2 untouched).
- The name and robot colour from §3.7 stay in localStorage with the rest of the record and are included in the existing export/import. They are never sent anywhere. The onboarding explicitly says "just for this browser — nobody else sees it", and is skippable.

---

## 12. Acceptance conditions

Written to join the 23 existing `C-*` conditions in `scripts/verify.mjs`, in the same style: each one fails CI, each one is checkable without a browser except where noted.

### 12.1 Structure and alignment

| ID | Condition |
|---|---|
| `C-ALIGN` | Invariants A1–A6 (§5.1) hold across `modules/*.mdx`, `projects.json`, `GATES[]`, `skills.json`, `resources.json` |
| `C-PLANNED` | Every project whose module has no lessons declares `state: "planned"`; no `planned` entity renders an enabled action |
| `C-NOCAL` | No lesson, project, or gate has a time-based precondition. `quarter:` does not appear in any frontmatter or content schema; no progress value is derived from `Date` arithmetic except the activity heatmap and review scheduling (§5.2) |
| `C-STAGE` | `currentStage()` is a pure function of modules completed; `predictions.byStage` has no wall-clock input; `migrate()` maps legacy `Q1…Q4` keys forward and `C-MIGRATE` covers the round-trip |
| `C-MODULE-PAGE` | Every module with ≥1 lesson has a `/modules/mN/` page listing its lessons, project, gate, and shelf |
| `C-NOORPHAN` | Every page is reachable from Learn, Build, or Me within two clicks |

### 12.2 Interactivity

| ID | Condition |
|---|---|
| `C-INTERACTIVE` | No lesson is prose-only (IX-1). *Fixes m1-meet.* |
| `C-CONCEPT-VISUAL` | Every `kind: concept` lesson has ≥1 `<ConceptDemo>` (IX-2). *Fixes m1-meet, m4-circuits.* |
| `C-PROSE-BREAK` | No lesson has ≥150 words between interactive/visual elements (IX-3). *Fixes m4-circuits (674), m4-motors-gears (787), m3-wall-stop (627), m5-events (401).* |
| `C-EXPECT` | Every lesson containing a `<RobotLab>` with a non-`free` goal has an `<Expect>` before it, and its `done[]` entries match the grader's reported criteria |
| `C-EXAMPLE` | Every lesson introducing a skill has a `<WorkedExample>` whose parameters differ from the mission's |
| `C-LESSON-SHAPE` | The five parts (§6.1) required for the lesson's `kind` are present and in order |
| `C-DEMO-A11Y` | Every `<ConceptDemo>` exposes keyboard controls and a live region; every animation >150 ms has a reduced-motion fallback |

### 12.3 The project workbench

| ID | Condition |
|---|---|
| `C-DESIGN-TIER` | No project with `realMilestone: null` requests a BOM; every project with a `realMilestone` requires both a BOM and a connection list (§5.12.4) |
| `C-PLAN-LOCK` | Once `design.lockedAt` is set, no code path mutates `design`; the UI renders it read-only and stamped |
| `C-BOM-UNIT` | Every BOM row carries `part`, `qty`, and `spec`; a row whose `spec` has no `unit` renders a hint and is never blocked |
| `C-CONN-SANE` | The connection checks run: ground referenced ≥2×, and every pin in the list appears in the program (and vice versa) |
| `C-MEDIA-LOCAL` | Build photos are stored in IndexedDB, never in the record and never in a network request. The record holds only a key and dimensions. `stripMetadata()` runs on every image before it is stored (§5.12.2) |
| `C-BACKUP-ZIP` | `portfolio.zip` export round-trips records + images; `progress.json` export stays byte-identical as `C-BACKUP` already requires |
| `C-PLANVSBUILT` | `buildEntryMarkdown()` emits a `## Plan vs built` section whenever a design was locked; `ENTRY_HEADINGS` and `verify-entry.js` stay in lockstep as `C-TEMPLATE` already requires |

### 12.4 Shell and visual system

| ID | Condition |
|---|---|
| `C-NAV-HEIGHT` | Sticky header ≤72 px at 360, 375, and 768 px (measured in the existing jsdom/DOM test harness or a headless pass) |
| `C-RESUME` | A resume affordance is present on every page except the one it points to |
| `C-HIER` | ≤2 `.card-do` and ≤6 `.card` per page |
| `C-ICON` | No emoji inside an interactive control's accessible name; every icon-only control has an `aria-label` |
| `C-CONTRAST` | All module accent pairs ≥4.5:1 in both themes |
| `C-MOTION` | Every keyframe/transition >150 ms is inside or paired with a `prefers-reduced-motion` fallback |

### 12.5 Resources

| ID | Condition |
|---|---|
| `C-RES-FIELDS` | Every resource declares `module`, `when`, `minutes`, `adds`; `lesson` (if set) exists |
| `C-RES-COVER` | Every shipped module has ≥1 `video` and ≥1 `read` |
| `C-RES-STUCK` | Every module has ≥1 `when: "stuck"` resource |
| `C-RES-LOCAL` | Every video resource has a local thumbnail; no remote asset is referenced in initial page load |
| `C-RES-CSP` | `public/_headers` allows exactly one added `frame-src` origin and no change to `script-src` |

### 12.6 Drills and milestones

| ID | Condition |
|---|---|
| `C-DRILL-SCOPE` | For any record state, generated questions only reference skills in the taught set |
| `C-DRILL-ROUTE` | Every question template declares a `skill` that maps to a lesson anchor that exists |
| `C-DRILL-REVIEW` | A wrong answer calls `applySkillEvent` and produces a future `decayDue` entry (unit-tested) |
| `C-BADGE-VISIBLE` | Every milestone declares `label`, `criterion`, `track`, and `progress(record)`; none renders empty when unearned |
| `C-BADGE-CRAFT` | ≥4 milestones are awarded from reasoning metrics (predictions, debug, constraint solves) |

---

## 13. Build order

### 13.0 Sequencing against the content backlog — the decision

`PRD.md` plans **60 lessons; ~46 are unwritten**, and names content volume as its own High/High risk R1, whose stated mitigation is *"lesson templates per `kind`"*. That mitigation **is** the §6.1 scaffold. This document's work is therefore not in competition with the content work — it is the prerequisite `PRD.md` already identified for it.

**The sorting rule:** *does this change what a lesson or project **file** looks like?*

| Answer | When | Why |
|---|---|---|
| **Yes** — schema and scaffold | **Before authoring at volume** | Retrofitting 12 lessons costs 12 file edits. Retrofitting after M12 costs 60. **5×.** And the 46 new lessons would be authored in the shape that produced `m4-circuits` — 674 words, no widget — because that is the default when nothing enforces otherwise. |
| **No** — shell and read-side | **After** | Nav, board visuals, drills, milestones, workbench UI, video curation. None of these gets cheaper or dearer with more content. |

**Resolved conflict (blocking, done first).** `PRD.md` §16 `C-MODULES` required `quarter` on every lesson; this document's `C-NOCAL` forbids it. Both could not pass. **Resolution: `quarter` is dropped** — it is fully derivable from `module`, and the wall-clock quarter is a live defect (§5.2.2), not merely redundant. `PRD.md` §5.3 and `C-MODULES` were amended accordingly on 2026-08-23.

**The pilot gate.** Designing a template against 12 lessons and then writing 46 to it risks baking in a bad template. So: retrofit `m1-meet` + `m4-circuits`, then author **one** new module — **M6 (blocks → text)**, the hardest transition in the course — against the scaffold. If M6 fights the template, fix the template *before* M7–M12. Cost of learning the template is wrong: 3 lessons, not 46.

**Learner status (2026-08-23): has not started.** So there is no pressure to front-load the shell; the order below runs as written. Had they been mid-Module-5, UX-0 would move first — it is independent of everything and never changes price.

| Order | Work | Rationale |
|---|---|---|
| 0 | Resolve `C-MODULES` / `C-NOCAL` | Blocking — everything downstream authors against one rule or the other |
| A | Schema: drop `quarter`; project spine keys + `planned` + `design{}`; resource schema v2 | Disjoint files, parallelisable |
| B | Scaffold components + `<ConceptDemo>` contract | The template all 46 lessons are written into |
| C | Conditions into `verify.mjs` | Written **before** the retrofit, so the retrofit is verified rather than asserted |
| D | Pilot: retrofit ×2, author M6 | The gate on committing to M7–M12 |
| E | Author M7–M12 | The bulk of the work, now in a fixed shape |
| F | UX-0, Progress Board, drills, milestones, workbench UI | Read-side; price is flat |

### 13.1 Phases

Sequenced so each phase ships something the learner can feel, and so the highest-leverage fixes land first. Phases are independent enough to reorder except that UX-0 precedes everything.

| Phase | Delivers | Exit criteria |
|---|---|---|
| **UX-0 · Foundations** | Icon sprite; module accents; card hierarchy enforced; typography; new shell (3 destinations + Continue bar); `/me/` and `/build/` routes | `C-NAV-HEIGHT`, `C-HIER`, `C-ICON`, `C-CONTRAST`, `C-RESUME` pass. **M1: 173 px → ≤72 px. M2: ∞ → 1.** |
| **UX-1 · Alignment & pacing** | The spine (§5.1); **calendar removal** — drop `quarter:`, `currentQuarter()` → `currentStage()`, `byQuarter` → `byStage` + migration, copy pass; Progress Board with the circuit-trace track; module pages; `planned` state; projects gallery with hero images and plain-language rigor | `C-ALIGN`, `C-PLANNED`, `C-NOCAL`, `C-STAGE`, `C-MODULE-PAGE` pass. **M7: 9 → 0. M8: 0 → 6. M14: 3 → 0.** The ten-second test passes. |
| **UX-2 · Concepts** | `<ConceptDemo>` (4 demos), `<WorkedExample>`, `<Expect>`, `<Hook>`, lesson scaffold; retrofit m1-meet and m4-circuits first, then the other four long lessons | `C-INTERACTIVE`, `C-CONCEPT-VISUAL`, `C-PROSE-BREAK`, `C-EXPECT`, `C-EXAMPLE`, `C-LESSON-SHAPE`, `C-DEMO-A11Y` pass. **M3: 2 → 0. M4: 2/5 → 5/5. M5: 674 → ≤150.** |
| **UX-3 · Resources** | Resource schema v2; `<VideoCard>` facade; CSP `frame-src`; ~25–30 curated entries for m1–m5; contextual placement; `stuck` path; Playgrounds shelf; retire the tab | `C-RES-*` pass. **M9: 0/5 → 5/5.** |
| **UX-4 · Drills** | Time-based entry; taught-set scoping; routing; spaced review wired to `applySkillEvent`/`decayDue`; module drills; copy cleanup | `C-DRILL-*` pass. **M10, M11 met.** |
| **UX-5 · Milestones** | Three tracks; locked/in-progress/earned states; award moment; trophy shelf on `/me/`; delete the homepage list; onboarding identity | `C-BADGE-*` pass. **M12 met.** |
| **UX-6 · Workbench** | Five-stage project (§5.7); design panels with BOM + connection list + auto-rendered SVG; plan lock; IndexedDB photo store with ingest-time EXIF strip; annotations; plan-vs-built view; `## Plan vs built` in the entry; `portfolio.zip` export | `C-DESIGN-TIER`, `C-PLAN-LOCK`, `C-BOM-UNIT`, `C-CONN-SANE`, `C-MEDIA-LOCAL`, `C-BACKUP-ZIP`, `C-PLANVSBUILT` pass. **M15: 0/12 → 12/12. M16, M17 met.** |

**Sequencing note.** UX-6 is the largest single phase and the one the product owner has flagged as unclear today, but it depends on UX-1 (the spine gives projects their module keys and the `planned` state) and it is most valuable once a real build is reachable — Gate A, after Module 5. Build it after UX-1; it does not need UX-2 through UX-5.

**Recommended first slice if only one phase can be done:** UX-2, restricted to `m1-meet` and `m4-circuits`. It touches the two worst surfaces, proves the three new components, and is the change a teenager would notice within thirty seconds. UX-0 is the better *foundation*, UX-2 is the better *demonstration*, and **UX-6 is the one that changes what the course is worth having done** — but it is also the one that needs a learner with hardware in front of them to be worth anything, so it should not jump the queue.

---

## 14. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **This is presentation work on a product whose dominant gap is content** (`PRD.md` G1: ~3 hours of material for a 12-month course). Polishing five modules does not make twelve. | Explicitly accepted. The `planned` state (§5.2) makes the gap *visible and honest* rather than papered over, and the lesson scaffold (§6.1) is the template every future lesson is written into — so UX-2 accelerates content rather than competing with it. |
| R2 | `<ConceptDemo>` is 10+ bespoke interactive components — a large, easily-underestimated build. | Ship four (§7.1), not ten. Each is a pure render function over state, unit-testable like `SimCore`. Reuse the canvas conventions `sim/render.js` already establishes. |
| R3 | Video embedding introduces the product's first third-party dependency and its first CSP relaxation. | Facade pattern, `youtube-nocookie`, `frame-src` only, local thumbnails, offline fallback, `C-RES-CSP` guards the header file. Video is never *required* for a lesson to teach. |
| R4 | Curated links rot; a 12-month course multiplies the surface. | The freshness workflow already exists (lychee + LLM proposal + human approval). `checked` is promoted over `published` in the UI so trust tracks verification, not age. |
| R5 | Motion and celebration slide toward gamification. | §10.6 guardrails, five animations total (§3.6), milestones never gate content, no currency. |
| R6 | Removing emoji from controls makes the product colder — the current voice is warm and that matters for a teenager. | Emoji stays in *prose*. Only control labels change. Warmth moves into the award moments, the Continue bar's voice, and the identity in §3.7. |
| R7 | Restructuring nav breaks bookmarks and the service worker's cached routes. | Old routes 301 to new homes; `sw.js` version bump; `C-NOORPHAN` guards reachability. |
| R8 | A larger, more visual UI conflicts with HC7 and the offline budget. | §11.2 budgets it: ~600 kB of thumbnails plus one sprite, all cached, all lazy. No new runtime dependency. |
| R9 | **Removing the calendar removes the only external pressure to keep going.** For a self-directed learner, "no deadlines" can mean "no reason to open it today". | The calendar was never real pressure — it was a label. What replaces it is the Continue bar (always one specific next thing), review drills arriving on their own schedule, and module-complete moments that now fire as fast as the learner earns them. If motivation still sags, that is a §10 problem, not a reason to reinstate dates. |
| R10 | **The workbench adds a form between the learner and the fun part**, and forms are where teenagers leave. | Hard 5-minute design budget (M17), pickers seeded from the kit, "copy my last plan", three fields at a time, and sim-only projects never see a BOM at all (`C-DESIGN-TIER`). If the design stage cannot be done in five minutes it gets cut down, not defended. |
| R11 | **Images grow without bound in IndexedDB**, and the learner never sees it until the browser starts evicting. | Ingest-time resize to 1600 px longest edge (`stripMetadata` already takes `maxSize`), a visible per-project photo count, a storage readout on `/me/`, and `navigator.storage.estimate()` surfaced before it becomes a problem. Eviction is also survivable by design: the record and the entries are the durable artefacts, the images are evidence the learner also holds in their own repo. |

---

## 15. Decisions this document changes

Stated plainly, because both reverse a position taken in `PRD.md` v2:

1. **`PRD.md` §19 puts "original video production" out of scope. This document keeps that** — no original video is produced. It adds *curated* video, embedded in context via a privacy-safe facade, plus original **animated explainers written as code**, which are not video and carry none of video's production or freshness cost. The product owner's ask ("concept explain can be visual with videos") is met without taking on a video pipeline.

2. **`/resources/` and `/assessment/` lose their top-level navigation.** `PRD.md` treats both as destinations. This document argues they are services, and that their disconnection from the moment of need is the direct cause of two of the five complaints. No functionality is removed; the aggregate library survives at `/me/library`.

---

## 16. Open questions

| # | Question | Needed by | Default if unanswered |
|---|---|---|---|
| Q1 | Are YouTube embeds acceptable to the guardian at all, or should video always open in a new tab? | UX-3 | Facade + `youtube-nocookie` dialog (proposed) |
| Q2 | Should `planned` modules (m6–m12) be visible from day one, or hidden until built? Visible is honest and motivating; hidden makes the product look finished. | UX-1 | **Visible, blueprint-ghost** |
| Q3 | Does the learner want their name used in copy, or is that patronising to this particular teenager? | UX-5 | Ask once, skippable, default off |
| Q4 | Is the Continue bar always-on, or dismissible per session? | UX-0 | Dismissible per session; returns next visit |
| Q5 | Twelve module accents need naming and contrast-checking — is there a colour preference, or is a generated ramp fine? | UX-0 | Generated ramp off the existing navy/amber axis |
| Q6 | How many curated resources per module is *enough*? 5–6 is the proposal; more becomes a bookmarks folder again. | UX-3 | 5–6, hard-capped |
| Q7 | Should the Boss drill be able to *fail* you back into a module, or is it purely optional bragging rights? | UX-4 | Optional; never blocks |
| Q8 | With the calendar gone, does `PRD.md`'s "twelve-month course" framing stay in the marketing copy, or does the product stop claiming a duration entirely? | UX-1 | **Stop claiming a duration.** "Twelve modules, twelve projects" says the same thing without setting a clock the learner can fall behind |
| Q9 | Can the learner edit a locked plan if they genuinely mis-clicked? A hard lock is honest; an unforgiving one is infuriating. | UX-6 | One "unlock and re-plan" per project, which stamps the entry *"re-planned before building"* rather than hiding it |
| Q10 | Should the auto-rendered wiring SVG go into the portfolio entry, or only the connection table? | UX-6 | Both — table as markdown (diffable, greppable), SVG as a committed file |
| Q11 | Do build photos belong in the learner's GitHub repo as well as IndexedDB? The repo is the durable copy; IndexedDB can be evicted. | UX-6 | Yes, via `portfolio.zip`. The product never pushes; the learner commits |

---
---

## 17. Out of scope

Original video production. Accounts and sync. A design system published as a package. Native app. 3D rendering. Any social feature (there is one learner). Real-time collaboration. Replacing Blockly. Rewriting `RobotLab`, `sim.js`, `interpreter.js`, or `assessment.js` — this document changes what surrounds them, not what they do.

Added in v1.1: **a schematic/wiring diagram editor** (§5.12.3 — the structured connection list replaces it, and Wokwi covers the rest), **any server-side storage or transmission of learner photographs** (§5.12.2), and **automatic pushing to the learner's GitHub repo** — the product generates the commit-ready bundle; the learner commits it.

---

## Appendix A — Repository impact map

| Area | Files | Change |
|---|---|---|
| Shell | `src/layouts/Base.astro` | Nav → 3 destinations + Continue bar + ⋯ menu |
| Tokens | `src/styles/global.css`, **new** `src/styles/modules.css` | Accents, typography, hierarchy budget |
| Icons | **new** `src/components/Icon.astro`, **new** `public/icons.svg` | Sprite |
| Progress Board | `src/pages/index.astro` | List → circuit-trace track + module cards |
| **Pacing** | `src/content.config.ts`, `src/content/config.ts`, all 12 `*.mdx`, `src/lib/progress.js`, `src/lib/record.js` | **Drop `quarter:` (declared in two schema files and 12 lesson headers); `currentQuarter()` → `currentStage()`; `predictions.byQuarter` → `byStage` + migration; demote `yearStart`; repurpose `pace`** |
| Module page | **new** `src/pages/modules/[module].astro` | The missing surface |
| Lesson page | `src/pages/modules/[...slug].astro` | Header strip, scaffold, project/gate links |
| Explainers | **new** `ConceptDemo.astro`, `WorkedExample.astro`, `Expect.astro`, `Hook.astro`, `VideoCard.astro` | §6, §7 |
| Demos | **new** `src/lib/demos/{loop,circuit,gears,threshold}.js` | Pure render functions, unit-tested |
| Projects | `src/pages/projects/*`, `src/content/projects.json` | → `/build/`, spine keys, `planned`, hero images, plain-language rigor, `design{}` block |
| **Workbench** | **new** `src/components/{DesignPanel,BomTable,ConnectionList,BuildPhotos,PlanVsBuilt}.astro`, **new** `src/lib/{design.js,wiring-svg.js,media-store.js}` | §5.7–§5.11. `media-store.js` is the IndexedDB layer; `wiring-svg.js` renders the connection rows |
| **Media** | `src/lib/exif.js` (exists), `src/lib/portfolio.js`, `src/lib/progress.js` | Ingest-time strip + resize; `portfolio.zip` export mode; `## Plan vs built` heading (keep `C-TEMPLATE` lockstep with `functions/api/verify-entry.js`) |
| Resources | `public/resources.json`, `src/pages/resources.astro`, `scripts/freshness.mjs` | Schema v2, contextual placement, retire the tab |
| Drills | `src/pages/assessment.astro` → `/me/drills`, `src/lib/assessment.js` | Scoping, routing, review wiring |
| Milestones | `src/lib/progress.js`, **new** `src/lib/milestones.js`, `/me/` | Tracks, locked state, progress fns, award moment |
| CSP | `public/_headers` | `frame-src` only |
| Verification | `scripts/verify.mjs`, `scripts/test-dom.mjs` | ~34 new `C-*` conditions |

## Appendix B — The complaints, mapped

**v1.0 — the original five**

| Complaint | Evidence | Answered in |
|---|---|---|
| Not interactive enough for teens | §1.1 (0 images site-wide), §1.2 (2 prose-only lessons) | §2.2 rules, §3.6 motion, §6, §7 |
| Projects/modules/roadmap unclear, unattractive, unaligned | §1.4 (3 parallel structures, 0 cross-links, 9 dead cards), §1.8 (card soup) | §5.1, §5.3–§5.5 (one spine, Progress Board, module pages, `planned`) |
| Concepts should be visual, with video, with an example | §1.2 (m4-circuits: 674 words, 0 widgets) | §6.1 scaffold, §6.2 `<Expect>`, §6.3 `<WorkedExample>`, §7 `<ConceptDemo>` + `<VideoCard>` |
| Resources completely way out | §1.5 (9 links, 4 competing playgrounds, 0 for m6–m12, 0 lesson links) | §8 (schema v2, `when`, contextual placement, coverage conditions) |
| Assessment useless, badges hanging around | §1.6 (no scope, no consequence, gates nothing), §1.7 (invisible until earned, no home, no moment) | §9 (drills with consequences), §10 (milestones with a shelf) |

**v1.1 — the two follow-ups**

| Ask | What the code actually showed | Answered in |
|---|---|---|
| Improvise the look and feel; drop the month — finishing early is fine | Calendar time is wired into 4 layers, not just copy. `currentQuarter()` derives from wall-clock months, so an eager learner's whole reasoning history files under Q1 and the "trends as you grow" panel renders one bar — a defect, not a preference | §5.2 (stages replace quarters, `C-NOCAL`, `C-STAGE`), §5.3 (the track that a timeline could not be) |
| Project work and proof isn't clear — give space to design, list parts with sizes/units, plan the connections, then add a photo of the finished build | The current flow has **no design stage at all**: sim-passed → write it up. `projects.json` has no BOM field, no connections field, no photo field | §5.6–§5.11 (the five-stage project), §5.12 (**the evaluation you asked for**) |

**The verdict on the workbench idea, in one line:** it works and it is the strongest addition in this document — provided the photo lives in IndexedDB rather than the record (§5.12.2), the connections are a table rather than a diagram editor (§5.12.3), and sim-only projects never see a parts list (§5.12.4).
