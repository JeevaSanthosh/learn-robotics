// Monthly resource freshness pipeline. Runs in GitHub Actions (see
// .github/workflows/freshness.yml) but can also run locally: `npm run freshness`.
//
// Design principle: the LLM only *ranks and proposes*. Deterministic code
// verifies links, fetches metadata, and validates the LLM's output against a
// schema AND a domain allowlist before anything reaches the PR. Treat model
// output as untrusted input, always.

import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

const RESOURCES_PATH = new URL('../public/resources.json', import.meta.url);
const TODAY = new Date().toISOString().slice(0, 10);

const { GROQ_API_KEY, BRAVE_API_KEY, YOUTUBE_API_KEY } = process.env;

const WHEN = ['before', 'during', 'after', 'stuck', 'further'];

const ResourceSchema = z
  .object({
    title: z.string().min(3).max(140),
    // null is only legal for an entry a human still has to source — see the
    // status refinement below. Never let the LLM invent a URL to fill a gap.
    url: z.string().url().nullable(),
    status: z.literal('needs-url').optional(),
    type: z.enum(['video', 'docs', 'tool', 'article']),
    // Contextual schema v2: a resource is attached to a lesson and a moment.
    lesson: z.string().min(2).nullable(),
    when: z.enum(WHEN),
    minutes: z.number().int().positive().max(600),
    published: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    why: z.string().min(10).max(300),
    adds: z.string().min(10).max(300),
    // Forward declaration of a local asset; remote images are never allowed.
    thumb: z
      .string()
      .regex(/^\/thumbs\/[a-z0-9-]+\.webp$/)
      .nullable(),
  })
  .refine((r) => r.url !== null || r.status === 'needs-url', {
    message: 'a null url is only allowed on an entry marked "status": "needs-url"',
    path: ['url'],
  })
  .refine((r) => (r.type === 'video' && r.url !== null ? r.thumb !== null : r.thumb === null), {
    message:
      'a video with a url requires a local thumb path; every other entry must have thumb: null',
    path: ['thumb'],
  });

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function main() {
  const data = JSON.parse(await readFile(RESOURCES_PATH, 'utf8'));
  const allowed = data.allowedDomains ?? [];
  let changed = false;

  // --- 0. VALIDATE what is already on disk ----------------------------
  // The file is hand-edited as well as machine-edited, so check the whole
  // thing against the schema before touching anything. 'needsUrl' holds
  // fully-specified entries whose link a human still has to supply.
  validateOnDisk(data, allowed);

  for (const [moduleId, items] of Object.entries(data.modules)) {
    console.log(`\n## Module ${moduleId}`);

    // --- 1. VERIFY: deterministic liveness checks ----------------------
    for (const item of items) {
      if (item.url === null) {
        // Not dead — pending. Nothing to fetch, and nothing to report as broken.
        item._alive = true;
        console.log(`  --   (needs-url) ${item.title}`);
        continue;
      }
      const alive = await checkAlive(item.url);
      item._alive = alive;
      item.checked = TODAY;
      changed = true; // 'checked' dates always update
      console.log(`${alive ? '  ok ' : ' DEAD'} ${item.url}`);
    }

    // --- 2. DISCOVER: search API candidates (skip gracefully w/o key) --
    let candidates = [];
    if (BRAVE_API_KEY) {
      candidates = await braveSearch(`beginner robotics tutorial ${moduleId} for teens`, 6);
      candidates = candidates.filter((c) => domainAllowed(c.url, allowed));
    }

    // --- 3. JUDGE: LLM proposes swaps only when it can add value -------
    const needsJudging = items.some((i) => !i._alive) || candidates.length > 0;
    if (GROQ_API_KEY && needsJudging) {
      const proposal = await judgeWithLLM(moduleId, items, candidates);
      if (proposal) {
        // --- 4. VALIDATE: schema + allowlist, or reject wholesale ------
        const parsed = z.array(ResourceSchema).safeParse(proposal);
        // A null url is allowed only on a needs-url entry (the schema already
        // enforces that pairing); everything else must clear the allowlist.
        const linksOk = (r) => r.url === null || domainAllowed(r.url, allowed);
        if (parsed.success && parsed.data.every(linksOk)) {
          data.modules[moduleId] = parsed.data.map((r) => ({ ...r, checked: TODAY }));
          changed = true;
          console.log(`  -> LLM proposed ${parsed.data.length} resources (validated)`);
        } else {
          console.log('  -> LLM proposal rejected by validation; keeping current list');
        }
      }
    }

    for (const item of data.modules[moduleId]) delete item._alive;
  }

  if (changed) {
    await writeFile(RESOURCES_PATH, JSON.stringify(data, null, 2) + '\n');
    console.log('\nresources.json updated — the workflow will open a PR if the diff is non-empty.');
  } else {
    console.log('\nNo changes.');
  }
}

// ---------------------------------------------------------------------------
// Every entry in the file, from both `modules` and the `needsUrl` holding area,
// as [bucket, moduleId, index, entry].
function allEntries(data) {
  const out = [];
  for (const bucket of ['modules', 'needsUrl'])
    for (const [moduleId, items] of Object.entries(data[bucket] ?? {}))
      items.forEach((item, i) => out.push([bucket, moduleId, i, item]));
  return out;
}

function validateOnDisk(data, allowed) {
  const problems = [];
  for (const [bucket, moduleId, i, item] of allEntries(data)) {
    const where = `${bucket}.${moduleId}[${i}] "${item.title ?? '(untitled)'}"`;
    const parsed = ResourceSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        problems.push(`${where}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
      continue;
    }
    if (item.url !== null && !domainAllowed(item.url, allowed))
      problems.push(`${where}: host not in allowedDomains — ${item.url}`);
  }
  if (problems.length) {
    console.error('resources.json failed schema validation:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`resources.json: ${allEntries(data).length} entries valid.`);
}

function domainAllowed(url, allowed) {
  try {
    const host = new URL(url).hostname;
    return allowed.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

async function checkAlive(url) {
  // YouTube links: HEAD lies (200 for removed videos), use the Data API if we have it
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (yt && YOUTUBE_API_KEY) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${yt[1]}&key=${YOUTUBE_API_KEY}`
    );
    if (!res.ok) return false;
    const j = await res.json();
    return (j.items?.length ?? 0) > 0 && j.items[0].status?.privacyStatus === 'public';
  }
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.ok) return true;
    // some servers reject HEAD; retry GET
    const res2 = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res2.ok;
  } catch {
    return false;
  }
}

async function braveSearch(query, count) {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    { headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' } }
  );
  if (!res.ok) return [];
  const j = await res.json();
  return (j.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description ?? '',
    age: r.page_age ?? '',
  }));
}

async function judgeWithLLM(moduleId, current, candidates) {
  const prompt = `You maintain the resource list for a robotics course aimed at a teenage complete beginner.

Module: ${moduleId}
Current resources (items with "_alive": false are DEAD and must be replaced or removed):
${JSON.stringify(current, null, 2)}

Candidate replacements found by search (may be junk — judge critically):
${JSON.stringify(candidates, null, 2)}

Return the ideal resource list for this module as a JSON array. Rules:
- Prefer keeping current alive resources unless a candidate is clearly better for a beginner teen.
- Remove dead resources; replace them only with a genuinely suitable candidate.
- NEVER invent a URL. If a slot needs filling and you have no real link, emit the entry with "url": null and "status": "needs-url" so a human can source it.
- Third-party block editors and simulators are always "when": "further" — never offered mid-lesson.
- Each item: {"title","url"(string or null),"type"("video"|"docs"|"tool"|"article"),"lesson"(a lesson slug this supports, or null for the whole module),"when"("before"|"during"|"after"|"stuck"|"further"),"minutes"(integer),"published"(YYYY-MM-DD, estimate if unknown),"checked"("${TODAY}"),"why"(one sentence, why it suits a beginner teen),"adds"(one sentence: what this gives that the lesson itself cannot),"thumb"("/thumbs/<slug>.webp" for a video with a url, otherwise null)}.
- Keep the "lesson", "when", "minutes", "adds" and "thumb" values of resources you are keeping unchanged.
- Respond with ONLY the JSON array. No markdown fences, no commentary.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.2,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
