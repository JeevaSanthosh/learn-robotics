// Cloudflare Pages Function — T2 "structurally verified" proof (PRD §9.4).
// POST /api/verify-entry  { url }  -> { ok, tier, checks, missing }
//
// What this is, stated plainly (and the product says so too): T2 checks that the
// learner WROTE an entry — the required sections are present, at least one piece
// of media is linked, and the rubric checklist has been filled — NOT that any of
// it is true. It is a pedagogical instrument, not an examination board (§9.4).
//
// Privacy & safety: we fetch only a raw URL the learner chose to publish, over
// https, from a small allowlist of code hosts (SSRF guard). We never store the
// content — this is a liveness+structure read, then the bytes are discarded.
// No AI, no key, no cost.

// MUST stay in lockstep with ENTRY_HEADINGS in src/lib/portfolio.js — the
// generator writes these, the learner fills them, and this checks them.
// C-TEMPLATE fails the build if they drift apart.
const REQUIRED_HEADINGS = [
  'Brief',
  'Rubric',
  'Results',
  'Why does this work?',
  "What did you try that didn't?",
  'What would break it?',
  'Evidence',
];

const ALLOWED_HOSTS = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'gitlab.com',
  'codeberg.org',
  'bitbucket.org',
];

function allowed(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });

export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }
  const url = (body && body.url || '').trim();

  if (!allowed(url)) {
    return json({
      ok: false,
      error: 'That URL is not a raw file on a supported host. Paste the RAW link to your entry’s README (e.g. raw.githubusercontent.com/…/README.md).',
    }, 422);
  }

  let text;
  try {
    const res = await fetch(url, { redirect: 'follow', cf: { cacheTtl: 300 } });
    if (!res.ok) return json({ ok: false, error: `The URL returned ${res.status}. Is the repo public and the path correct?` }, 200);
    text = (await res.text()).slice(0, 200000); // cap
  } catch {
    return json({ ok: false, error: 'Could not reach that URL.' }, 200);
  }

  const missing = REQUIRED_HEADINGS.filter((h) => !new RegExp(`^#{1,6}\\s+${escapeRe(h)}\\s*$`, 'mi').test(text));
  const hasMedia = /!\[[^\]]*\]\([^)]+\)/.test(text) || /\]\(https?:\/\/[^)]+\.(png|jpe?g|gif|webp|mp4|mov|webm)\b/i.test(text) || /\bhttps?:\/\/(youtu\.be|www\.youtube\.com|vimeo\.com)\//i.test(text);
  const rubricTicked = /^\s*[-*]\s*\[x\]/mi.test(text);

  const checks = { headings: missing.length === 0, media: hasMedia, rubric: rubricTicked };
  const ok = checks.headings && checks.media && checks.rubric;

  return json({
    ok,
    tier: ok ? 'T2' : null,
    checks,
    missing,
    note: 'T2 confirms you wrote an entry, not that it is true — that honesty is for you.',
  });
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
