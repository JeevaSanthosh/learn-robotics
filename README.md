# Learn Robotics — a one-teen robotics course

A static, single-learner robotics course: Scratch-like blocks first, an in-browser
robot simulator, a real-code bridge, a gated hardware module, an AI tutor, and a
monthly self-refreshing resource list.

The lab auto-runs as you build, every program can be shared as a plain link, the
tutor streams answers and can see the program you're stuck on, and the whole site
works offline and in dark mode. No accounts, no install, no parts to buy — and
nothing here costs money to run (see **Cost** below).

## Stack

| Concern | Tool | Why |
|---|---|---|
| Site | [Astro](https://astro.build) + MDX | Lessons are `.mdx` files; interactive bits load only where used |
| Blocks | [Blockly](https://developers.google.com/blockly) (zelos renderer) | Scratch-like feel; **one block program → JS (simulator) + Python (bridge)** |
| Simulator | Custom canvas (`src/lib/sim.js`) | Differential-drive robot, distance raycast, LED — no heavy deps |
| Hosting | **Cloudflare Pages** | Free, static, and `/functions` gives us a same-origin AI proxy |
| AI tutor | Pages Function → Workers AI (or Groq) | Streams answers; sees the learner's current program; system prompt + limits live server-side; key (if any) never ships to the browser |
| Offline | Service worker (`public/sw.js`) + web manifest | Lessons and the simulator keep working on a plane; `/api/*` is never cached |
| Freshness | GitHub Actions monthly cron → PR | LLM proposes, zod + domain allowlist validates, a human merges |

## Repository map

```
src/content/modules/   ← lessons (MDX + frontmatter). Add a file = add a lesson.
src/pages/             ← roadmap (index), glossary, resources, go-physical, lesson route
src/components/        ← RobotLab, Quiz, Term, ProgressTrace, ChatWidget
src/lib/               ← sim.js (robot), blocks.js (Blockly defs + generators), progress.js,
                         interpreter.js (block-tree runner), tutor.js (chat transport),
                         share.js (program-in-a-URL encoding)
functions/api/chat.js  ← AI tutor proxy (Pages Function; also imported by worker/index.js)
worker/index.js        ← entry for the `wrangler deploy` path; adds per-IP rate limiting
public/theme.js        ← render-blocking dark/light bootstrap (external on purpose — see CSP note)
public/sw.js           ← offline cache
public/manifest.webmanifest
public/glossary.json   ← single source of truth for term definitions
public/resources.json  ← curated links; edited monthly by the freshness PR
public/_headers        ← CSP + security headers (Cloudflare Pages format)
scripts/freshness.mjs  ← verify → discover → judge → validate pipeline
scripts/verify.mjs     ← acceptance conditions (run in CI)
scripts/test-*.mjs     ← interpreter + share/stream runtime tests
.github/workflows/freshness.yml
```

## Local development

```bash
npm install
npm run dev            # site at localhost:4321 (the tutor says "no tutor in astro dev" — expected)
npm run build && npm run verify && npm test   # the full acceptance loop
npx wrangler pages dev dist   # after `npm run build`, to test the chat function locally
```

> ### ⚠️ Never let a `<script>` get inlined into the HTML
>
> `public/_headers` sets `script-src 'self'` with **no** `'unsafe-inline'`. Astro
> inlines hoisted `<script>` blocks below a size threshold straight into the page,
> and the browser then silently blocks them — the component simply never wires up,
> with no error outside the console. This shipped once and killed the chat widget
> and the glossary filter on every page for weeks.
>
> Two things prevent a repeat, and **both must stay**:
> - `vite.build.assetsInlineLimit: 0` in `astro.config.mjs` (forces every script external)
> - condition `C-INLINE` in `scripts/verify.mjs` (fails CI if inline scripts reappear)
>
> It only breaks in production: `npm run dev` doesn't apply `_headers`. Anything that
> genuinely must run before paint goes in `public/` and is referenced with
> `<script is:inline src="/file.js">` — see `public/theme.js`.

## Deploying (Cloudflare Pages)

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
   - Build command: `npm run build`  ·  Output directory: `dist`
3. In the Pages project settings:
   - **Functions → Bindings**: add a Workers AI binding named `AI` (zero-key setup), **or**
   - **Environment variables**: add `GROQ_API_KEY` (encrypt it) to use Groq instead.
4. Recommended: add a rate-limiting rule on `/api/chat` (e.g. 10 req/min per IP)
   under Security → WAF → Rate limiting rules.

### The other deploy path (`wrangler deploy`)

`wrangler.jsonc` + `worker/index.js` deploy the same site as a Worker with static
assets instead of classic Pages. That path declares the `AI` binding in code (no
dashboard step) and applies **Workers-native rate limiting** via the `CHAT_LIMITER`
binding — roughly 10 requests/minute per IP, no WAF rule needed.

Pick one path. The WAF rule in step 4 is only needed on the classic Pages path,
because `CHAT_LIMITER` lives in `worker/index.js`, which Pages does not use.

Every push to `main` redeploys. Every PR gets a preview URL automatically —
which is how you review the monthly freshness PR.

### Freshness workflow secrets (GitHub → Settings → Secrets → Actions)

| Secret | Used for | Required? |
|---|---|---|
| `GROQ_API_KEY` | LLM judging of resource swaps | yes, for judging |
| `BRAVE_API_KEY` | discovering new candidate resources | optional |
| `YOUTUBE_API_KEY` | reliable video liveness + dates | optional |

Without the optional keys the script still runs — it just verifies links and
updates `checked` dates. The workflow **always opens a PR, never commits to
main**: review checklist is in the PR body.

## Adding a lesson

Create `src/content/modules/<slug>.mdx`:

```mdx
---
title: "Gears and torque"
module: 3
moduleTitle: "Making Things Move"
order: 1
duration: 15
checkpoint: false
summary: "Why robot wheels use gears: trading speed for strength."
---
import Term from '../../components/Term.astro';
import RobotLab from '../../components/RobotLab.astro';

A <Term id="gear">gear</Term> trades speed for strength...

<RobotLab lessonId="<slug>" goal="free" goalText="Try it yourself." />
```

The roadmap, progress trace, and prev/next navigation pick it up automatically
from the frontmatter. Add new terms to `public/glossary.json`; `<Term>` tooltips
and the glossary page both read from it.

`RobotLab` goals:

| `goal` | Completes when |
|---|---|
| `blink:N` | the LED blinked at least N times (e.g. `blink:3`) |
| `reach-target` | the robot ends on the target pad (needs a `target` prop) |
| `near-wall` | the robot stops within ~1 square of a wall **without** touching it |
| `free` | never — sandbox mode, deliberately not auto-completed |

Extra arena walls via the `walls` prop (JSON array of `{x,y,w,h}`). The `required`
prop (comma-separated block types) additionally demands the lesson's *concept* was
used, so a goal can't be brute-forced past the idea it exists to teach.

## The confidence gate

Defined in **one place**: `GATE` in `src/lib/progress.js`.

> Hardware unlocks when every checkpoint lesson in `GATE.requiredCheckpoints`
> is complete **and** the gate quiz (`m5-gate-quiz`) best score ≥ 80%. The exact list lives in `GATE` in `src/lib/progress.js`; `scripts/verify.mjs` fails if it drifts from the lesson files.

`/go-physical/` reads this and shows either a checklist of what's missing or
the kit + build-steps content. It's a pedagogical gate, not security — a
determined teen can bypass it in devtools, and that's fine.

Progress is localStorage-only by design (single user, no accounts). The
roadmap page has **Export/Import progress** buttons because browsers do clear
localStorage; encourage an export before switching devices.

## Verification loop

`npm run verify` checks ~60 acceptance conditions (curriculum coverage, every
lesson completable, gate integrity, anti-cheat goal rules, resource allowlist,
glossary completeness, no eval in client code, and `C-INLINE` — no CSP-blocked
inline scripts in the build). The exact count moves as resources are added, so
treat the number as informational and the pass/fail as the contract.

`npm run verify` reads `dist/`, so **run `npm run build` first** (CI already does).

`npm test` runtime-tests the block interpreter and the share-link/stream parsing
headlessly. All of it runs in CI on every push — the project is only "done" when
all conditions pass, by construction.

## Security notes

Learner programs are executed by a block-tree interpreter (`src/lib/interpreter.js`),
never by `eval`/`new Function` — so the CSP stays `script-src 'self'` with no
`unsafe-eval`. The generated JS/Python in the code bridge is display-only text.

- The AI system prompt, model choice, token caps, and history limits live only
  in `functions/api/chat.js`. The browser sends the question, ≤6 history turns,
  the lesson id, the answer mode (`hint`/`explain`), and a summary of the
  learner's current block program — generated code, block types used, the
  mission, and the simulator's last status line. That context is what lets the
  tutor answer "why doesn't *my* robot stop?"; it is re-clamped server-side
  (`describeContext`) rather than trusted to arrive terse. No personal data is
  collected, and progress never leaves localStorage.
- `public/_headers` sets a strict CSP (`script-src 'self'` — everything is
  bundled, no CDNs; plus `worker-src`/`manifest-src 'self'` for the service
  worker and manifest), frame-src limited to youtube-nocookie + Wokwi embeds.
  See the inline-script warning under **Local development** before touching it.
- The freshness workflow has minimal permissions, pinned action SHAs, and
  treats LLM output as untrusted (zod schema + domain allowlist, reject-on-fail).

## Cost

The site is designed to be structurally unable to bill you.

**The real guarantee is the plan, not the code: stay on Workers Free.** The free
Workers AI allocation is 10,000 Neurons/day, and exceeding it requires opting in to
Workers Paid. On the free plan, going over makes requests *fail* — it cannot spill
into charges. No card required.

Layered on top of that:

| Guard | Where |
|---|---|
| Small model (`@cf/meta/llama-3.1-8b-instruct`), `max_tokens: 300` | `functions/api/chat.js` |
| History ≤6 turns; learner-context blob clamped to 700 chars | `functions/api/chat.js` |
| 40 tutor questions/day per browser, refunded when a request is rejected | `src/lib/tutor.js` |
| ~10 requests/minute per IP | `worker/index.js` (`CHAT_LIMITER`) |

When the daily allowance does run out, the tutor says so in plain language instead
of throwing an error. Everything else is free tier by construction: Astro, Blockly,
Cloudflare Pages/Workers, and GitHub Actions on a public repo. Share links and
offline mode add **zero** backend cost — the program lives in the URL fragment and
the cache lives in the browser.

## Deliberately deferred (see project doc)

- Original explainer videos: recommended pipeline is Excalidraw + OBS (or
  Motion Canvas), hosted as unlisted YouTube via `youtube-nocookie.com` embeds
  — the CSP already allows that frame source.
- Wokwi-embedded MicroPython lessons for module 3+ (CSP already allows it).
- Pagefind search across lessons once content volume justifies it.
- **Two-way blocks ↔ text.** The code bridge is currently one-way plus
  click-a-block-to-highlight-its-line. Running *edited* text would need a
  JS interpreter bundle, because the CSP forbids `eval` and `verify.mjs` C2
  enforces that. Worth doing only if the read-only bridge proves it earns attention.
