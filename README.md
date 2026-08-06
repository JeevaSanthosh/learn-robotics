# Learn Robotics — a one-teen robotics course

A static, single-learner robotics course: Scratch-like blocks first, an in-browser
robot simulator, a real-code bridge, a gated hardware module, an AI tutor, and a
monthly self-refreshing resource list.

## Stack

| Concern | Tool | Why |
|---|---|---|
| Site | [Astro](https://astro.build) + MDX | Lessons are `.mdx` files; interactive bits load only where used |
| Blocks | [Blockly](https://developers.google.com/blockly) (zelos renderer) | Scratch-like feel; **one block program → JS (simulator) + Python (bridge)** |
| Simulator | Custom canvas (`src/lib/sim.js`) | Differential-drive robot, distance raycast, LED — no heavy deps |
| Hosting | **Cloudflare Pages** | Free, static, and `/functions` gives us a same-origin AI proxy |
| AI tutor | Pages Function → Workers AI (or Groq) | System prompt + limits live server-side; key (if any) never ships to the browser |
| Freshness | GitHub Actions monthly cron → PR | LLM proposes, zod + domain allowlist validates, a human merges |

## Repository map

```
src/content/modules/   ← lessons (MDX + frontmatter). Add a file = add a lesson.
src/pages/             ← roadmap (index), glossary, resources, go-physical, lesson route
src/components/        ← RobotLab, Quiz, Term, ProgressTrace, ChatWidget
src/lib/               ← sim.js (robot), blocks.js (Blockly defs + generators), progress.js
functions/api/chat.js  ← Cloudflare Pages Function (AI tutor proxy)
public/glossary.json   ← single source of truth for term definitions
public/resources.json  ← curated links; edited monthly by the freshness PR
public/_headers        ← CSP + security headers (Cloudflare Pages format)
scripts/freshness.mjs  ← verify → discover → judge → validate pipeline
.github/workflows/freshness.yml
```

## Local development

```bash
npm install
npm run dev            # site at localhost:4321 (chat widget will say it can't reach the tutor — expected)
npx wrangler pages dev dist   # after `npm run build`, to test the chat function locally
```

## Deploying (Cloudflare Pages)

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
   - Build command: `npm run build`  ·  Output directory: `dist`
3. In the Pages project settings:
   - **Functions → Bindings**: add a Workers AI binding named `AI` (zero-key setup), **or**
   - **Environment variables**: add `GROQ_API_KEY` (encrypt it) to use Groq instead.
4. Recommended: add a rate-limiting rule on `/api/chat` (e.g. 10 req/min per IP)
   under Security → WAF → Rate limiting rules.

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

`RobotLab` goals: `blink3` (LED blinks ≥3), `reach-target` (needs a `target`
prop), `free` (completes on any successful run). Extra arena walls via the
`walls` prop (JSON array of `{x,y,w,h}`).

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

`npm run verify` checks 60 acceptance conditions (curriculum coverage, every
lesson completable, gate integrity, anti-cheat goal rules, resource allowlist,
glossary completeness, no eval in client code). `npm test` runtime-tests the
block interpreter headlessly. Both run in CI on every push — the project is
only "done" when all conditions pass, by construction.

## Security notes

Learner programs are executed by a block-tree interpreter (`src/lib/interpreter.js`),
never by `eval`/`new Function` — so the CSP stays `script-src 'self'` with no
`unsafe-eval`. The generated JS/Python in the code bridge is display-only text.

- The AI system prompt, model choice, token caps, and history limits live only
  in `functions/api/chat.js`. The browser sends the question, ≤6 history turns,
  and the lesson id.
- `public/_headers` sets a strict CSP (`script-src 'self'` — everything is
  bundled, no CDNs), frame-src limited to youtube-nocookie + Wokwi embeds.
- The freshness workflow has minimal permissions, pinned action SHAs, and
  treats LLM output as untrusted (zod schema + domain allowlist, reject-on-fail).

## Deliberately deferred (see project doc)

- Original explainer videos: recommended pipeline is Excalidraw + OBS (or
  Motion Canvas), hosted as unlisted YouTube via `youtube-nocookie.com` embeds
  — the CSP already allows that frame source.
- Wokwi-embedded MicroPython lessons for module 3+ (CSP already allows it).
- Pagefind search across lessons once content volume justifies it.
