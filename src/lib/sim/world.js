// World schema, validation, and seeded variant generation (PRD §8.2). Worlds
// live as JSON under src/content/worlds/ so verify.mjs can validate them and
// lessons can reference them by id instead of inlining arena JSON in MDX props.
// Pure and DOM-free — it is on the headless grading path.

import { makeNoise } from './noise.js';

/**
 * Validate a world object against the schema. Returns collected errors rather
 * than throwing, so verify.mjs can report every problem at once.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateWorld(w) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const rectOk = (r) => r && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h);
  const circOk = (c) => c && isNum(c.x) && isNum(c.y) && isNum(c.r);

  req(w && typeof w === 'object', 'world is not an object');
  if (!w || typeof w !== 'object') return { ok: false, errors };

  req(typeof w.id === 'string' && w.id.length > 0, 'world.id must be a non-empty string');
  req(w.size && isNum(w.size.w) && isNum(w.size.h), 'world.size must have numeric w and h');

  if (w.walls !== undefined) {
    req(Array.isArray(w.walls), 'walls must be an array');
    if (Array.isArray(w.walls)) w.walls.forEach((r, i) => req(rectOk(r), `walls[${i}] must be {x,y,w,h}`));
  }
  for (const key of ['target']) if (w[key] != null) req(circOk(w[key]), `${key} must be {x,y,r}`);
  for (const key of ['waypoints', 'targets']) if (w[key] !== undefined) {
    req(Array.isArray(w[key]), `${key} must be an array`);
    if (Array.isArray(w[key])) w[key].forEach((c, i) => req(circOk(c), `${key}[${i}] must be {x,y,r}`));
  }
  if (w.line !== undefined) {
    req(Array.isArray(w.line), 'line must be an array');
    if (Array.isArray(w.line)) w.line.forEach((s, i) =>
      req(s && isNum(s.x1) && isNum(s.y1) && isNum(s.x2) && isNum(s.y2), `line[${i}] must be {x1,y1,x2,y2}`));
  }
  if (w.start != null) req(isNum(w.start.x) && isNum(w.start.y) && isNum(w.start.heading),
    'start must be {x,y,heading}');
  if (w.variation != null) req(typeof w.variation === 'object', 'variation must be an object');
  if (w.impairments != null) req(typeof w.impairments === 'object', 'impairments must be an object');

  return { ok: errors.length === 0, errors };
}

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/**
 * Produce a deterministic variant of a world for a given seed (PRD §8.2, §7.5).
 * With no `variation` block this is just a clone stamped with the seed, so a
 * plain world grades reproducibly. Jitter and alternate start poses are applied
 * from a seeded stream, so seed N is always the same arena. (The maze/BFS
 * generators arrive with the M9 content; the hook is here.)
 */
export function variant(world, seed = 1) {
  const out = clone(world);
  out.seed = seed;
  const v = world.variation;
  if (!v) return out;

  const noise = makeNoise(seed);
  const jitter = (amount) => (amount ? noise.uniform(-amount, amount) : 0);

  if (v.wallJitter && Array.isArray(out.walls))
    out.walls = out.walls.map((wall) => ({ ...wall, x: wall.x + jitter(v.wallJitter), y: wall.y + jitter(v.wallJitter) }));

  if (v.targetJitter && out.target)
    out.target = { ...out.target, x: out.target.x + jitter(v.targetJitter), y: out.target.y + jitter(v.targetJitter) };

  if (Array.isArray(v.startPoses) && v.startPoses.length)
    out.start = clone(v.startPoses[Math.floor(noise.rng() * v.startPoses.length)]);

  return out;
}
