// Seeded randomness for the simulator. Determinism is a hard requirement
// (PRD §8.1, C-SIM-DET): the same program + same seed must produce
// byte-identical metrics, so grading is fair, replays are exact, and tests are
// strong. That rules out Math.random anywhere in the simulation path — every
// stochastic effect (sensor noise, world variation, dropout) draws from a
// seeded stream instead.
//
// No DOM, no time, no rAF — this file is on the headless path (C-SIM-HEADLESS).

/** mulberry32 — tiny, fast, seedable PRNG. Same generator the assessment uses. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A noise source bundling the common draws, all off one seeded stream. */
export function makeNoise(seed = 1) {
  const rng = mulberry32(seed);
  let spare = null; // Box–Muller produces pairs; cache the second value
  return {
    rng,
    /** uniform in [lo, hi) */
    uniform(lo = 0, hi = 1) { return lo + rng() * (hi - lo); },
    /** true with probability p */
    chance(p) { return rng() < p; },
    /** Gaussian with mean/sigma via Box–Muller (deterministic given the seed) */
    gaussian(mean = 0, sigma = 1) {
      if (spare !== null) { const v = spare; spare = null; return mean + sigma * v; }
      let u = 0, v = 0, s = 0;
      do {
        u = rng() * 2 - 1;
        v = rng() * 2 - 1;
        s = u * u + v * v;
      } while (s === 0 || s >= 1);
      const mul = Math.sqrt((-2 * Math.log(s)) / s);
      spare = v * mul;
      return mean + sigma * (u * mul);
    },
  };
}
