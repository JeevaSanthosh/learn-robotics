# End-to-end setup guide

Every step from an empty machine to a live, secured site with a working AI
tutor and the monthly freshness workflow. Follow in order; each part ends with
a check so you know it worked before moving on. Total: ~60 minutes.

---

## Part A — Prerequisites (10 min)

1. **Install Git** — https://git-scm.com/downloads. Verify: `git --version`
2. **Install Node.js 20 or 22 (LTS)** — https://nodejs.org. Verify: `node -v` (must print v20.x or v22.x) and `npm -v`
3. **Create a GitHub account** (free) — https://github.com/signup — if you don't have one.
4. **Create a Cloudflare account** (free) — https://dash.cloudflare.com/sign-up. No domain or credit card needed.

## Part B — Run it locally (5 min)

1. Unzip the project (or clone it once it's on GitHub) and open a terminal in the `learn-robotics/` folder.
2. Install dependencies:
   ```
   npm install
   ```
3. Start the dev server:
   ```
   npm run dev
   ```
4. Open the printed URL (usually http://localhost:4321). Click into **Blink the LED**, drag blocks, press **Run**.
5. Run the quality gates (the project's acceptance loop):
   ```
   npm run build     # must end with "Complete!"
   npm run verify    # must end with "All N conditions pass." (N is ~60 and grows with resources)
   npm test          # must end with "share/stream tests pass"
   ```

   Run `npm run build` *before* `npm run verify` — the verifier inspects `dist/`
   to confirm no inline `<script>` slipped into the HTML (see Troubleshooting).

> **Note:** under `npm run dev` the tutor says *"No tutor when running astro dev"*.
> That's expected — the `/api/chat` function only runs on Cloudflare (Part E), or
> locally via `npx wrangler pages dev dist`. Everything else works fully offline,
> including the simulator, dark mode, and share links.

**Check:** simulator runs, progress fills after completing the blink mission, all three commands pass.

## Part C — Put it on GitHub (5 min)

1. On GitHub: **+ → New repository**. Name: `learn-robotics`. Visibility: your choice (Private works fine with Cloudflare Pages). Do **not** initialize with a README. Create.
2. In your project folder:
   ```
   git init
   git add .
   git commit -m "Learn Robotics: initial verified build"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/learn-robotics.git
   git push -u origin main
   ```
3. On the repo's **Actions** tab, the **CI** workflow starts automatically and must finish green (it runs the same build + verify + test loop).

**Check:** CI shows a green check on `main`.

## Part D — Deploy to Cloudflare Pages (10 min)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Authorize GitHub when prompted and select the `learn-robotics` repository.
3. Build settings:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Leave environment variables empty for now.
4. **Save and Deploy**. First build takes ~2 minutes.
5. Open the assigned URL: `https://learn-robotics-XXX.pages.dev`.

Cloudflare automatically: serves the `_headers` security policy (CSP, frame
denial, etc.), deploys `functions/api/chat.js` as the `/api/chat` endpoint,
rebuilds on every push to `main`, and creates a **preview deployment for every
pull request** (used in Part G).

**Check:** site loads; DevTools → Network → click the document → Headers →
`content-security-policy` is present.

## Part E — Turn on the AI tutor (10 min)

Pick ONE backend. Option 1 is recommended: no API key exists anywhere.

### Option 1 — Workers AI binding (recommended, zero keys)

1. In your Pages project: **Settings → Bindings → Add → Workers AI**.
2. **Variable name:** `AI` (exactly — the function looks for `env.AI`). Save.
3. Redeploy so the binding takes effect: **Deployments → ⋯ on latest → Retry deployment** (or push any commit).

### Option 2 — Groq (faster/larger model, needs a key)

1. Create a free key at https://console.groq.com → **API Keys → Create**.
2. Pages project → **Settings → Variables and Secrets → Add**:
   Type **Secret** · Name `GROQ_API_KEY` · Value: your key. Save.
3. Redeploy as above.

### Test it

```
curl -s -X POST https://YOUR-SITE.pages.dev/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is a loop?","lessonId":"m1-blink"}'
```
**Check:** a JSON `{"answer":"..."}` comes back in plain, friendly English.
Then open the site's chat bubble and ask the same thing.

## Part F — Rate-limit the chat endpoint (5 min)

The endpoint URL is public in your site's JS; this stops drive-by quota abuse and
protects the free daily AI allowance.

> **If you deploy with `npx wrangler deploy` instead of classic Pages, skip this
> part.** That path already rate-limits in code: the `CHAT_LIMITER` binding in
> `wrangler.jsonc` and `worker/index.js` allows ~10 requests/minute per IP with no
> dashboard rule. The steps below are only for the classic Pages path, which does
> not run `worker/index.js`.

1. Cloudflare dashboard → your Pages domain → **Security → WAF → Rate limiting rules → Create rule** (the free plan includes one rule).
2. Configure:
   - **Name:** `chat-limit`
   - **If incoming requests match:** URI Path equals `/api/chat`
   - **Rate:** 10 requests per 1 minute, per IP
   - **Action:** Block · **Duration:** 1 minute
3. Deploy the rule.

**Check:** run the Part E curl twelve times quickly; requests 11–12 return HTTP 429.

## Part G — Wire up the monthly freshness workflow (15 min)

The workflow (`.github/workflows/freshness.yml`) runs on the 1st of each month,
verifies every curated link, asks a search API for newer candidates, has the
LLM propose swaps, validates everything against the domain allowlist, and
**opens a PR** — it never edits `main` directly.

1. Get the (all-free) keys:
   - **Groq** (LLM judging): https://console.groq.com → API Keys. *(Needed even if the site chat uses Workers AI — Actions runs outside Cloudflare.)*
   - **Brave Search** (candidate discovery, optional): https://brave.com/search/api → Free plan → API key.
   - **YouTube Data API v3** (video liveness + dates, optional): https://console.cloud.google.com → new project → enable "YouTube Data API v3" → Credentials → API key.
   The script skips any stage whose key is absent, so you can start with Groq only.
2. Add them to GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret** — create `GROQ_API_KEY`, and optionally `BRAVE_API_KEY`, `YOUTUBE_API_KEY`.
3. Allow the workflow to open PRs: repo → **Settings → Actions → General → Workflow permissions** → select **Read and write permissions** and tick **Allow GitHub Actions to create and approve pull requests**. Save.
4. Test now instead of waiting a month: **Actions → Resource freshness check → Run workflow**.
5. If the run proposes changes, a PR appears. Open it, click the **Cloudflare Pages preview link** in the PR checks, eyeball the resources page, and merge (or close). Merging auto-deploys.

**Check:** manual run completes; PR (if any) shows a working preview deployment.

## Part H — Optional: custom domain (10 min)

1. Pages project → **Custom domains → Set up a custom domain** → enter your domain → follow the DNS instructions (automatic if the domain is already on Cloudflare).
2. If the chat ever returns 403 afterward, set the Pages variable `ALLOWED_ORIGIN` to `https://yourdomain.com` — the origin check defaults to same-origin and normally needs nothing.

## Part I — Full end-to-end verification checklist

Run once on a phone and once on a computer:

1. Home page loads; roadmap shows Modules 1–5 with the circuit trace.
2. Complete **Blink the LED** → mission-complete status → that lesson's LED lights on the home page.
3. In **Loops** (m2), reach the target *without* a loop → it politely refuses to count it; redo with a loop → counts.
4. In **Stop before the wall**, bump the wall → run fails with the bump message; stop via the sensor → completes.
5. Refresh the browser → progress persisted. Export progress → JSON file downloads.
6. Glossary page: search works; tap a dotted term in any lesson → definition tooltip.
7. Chat: "explain variables like I'm 12" → scoped, friendly answer; off-topic question → polite redirect.
8. **Go Physical** shows exactly which requirements remain; after all checkpoints + 8/10 on the gate quiz, it unlocks.
9. Repo **Actions**: CI green; freshness workflow runs manually.

## Part J — Ongoing maintenance

- **Adding a lesson:** copy any `.mdx` in `src/content/modules/`, set `module`/`order`/`duration`/`checkpoint` frontmatter, push. Roadmap, pager, and progress trace update automatically. If it's a checkpoint, add its slug to `GATE` in `src/lib/progress.js` — `npm run verify` fails until the gate and lessons agree.
- **Monthly:** review the freshness PR (5 minutes: open preview, confirm links are good and age-appropriate, merge).
- **Adding a block:** define it in `src/lib/blocks.js` (block + both display generators), add a case in `src/lib/interpreter.js`, add a test in `scripts/test-interpreter.mjs`. Give it a `tooltip` — the lab's per-block help panel shows it verbatim when the block is selected.
- **Anything that must run before first paint** (theme, feature flags) goes in `public/` as a plain `.js` file and is referenced with `<script is:inline src="/file.js">`. An inline snippet will be blocked by the CSP. See `public/theme.js`.

## Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| **A button does nothing in production but works in `npm run dev`** | Almost certainly a CSP-blocked inline script. Check the browser console for a Content-Security-Policy violation. Confirm `vite.build.assetsInlineLimit: 0` is still in `astro.config.mjs` and that `npm run verify` passes `C-INLINE`. `npm run dev` doesn't apply `_headers`, which is why it only breaks live. |
| Run button does nothing in production | Also check CSP wasn't edited — restore `script-src 'self'` in `public/_headers`; never add `unsafe-eval` (the interpreter doesn't need it) |
| Chat answers arrive all at once, not streamed | Something between you and Cloudflare is buffering `text/event-stream`. Harmless — the answer is identical. |
| Chat: "the free daily AI allowance is used up" | Workers AI's 10,000 Neurons/day is spent; resets 00:00 UTC. Working as designed — it fails instead of billing you. |
| Chat: "That's the daily tutor limit for this browser" | The 40/day client guard in `src/lib/tutor.js`. Raise `DAILY_CAP` there if you want. |
| Chat: "No AI backend configured" | Part E binding/secret missing, or no redeploy after adding it |
| Chat: HTTP 403 | Custom domain without `ALLOWED_ORIGIN` (Part H) |
| Chat: HTTP 429 | Rate limit working as intended — wait a minute |
| Freshness run: create-pull-request permission error | Part G step 3 (workflow permissions) not enabled |
| Progress vanished | Browser storage cleared — import the exported JSON backup (home page) |
| Build fails on Cloudflare but not locally | Node drift — set Pages env var `NODE_VERSION` to `22` |
