// Demo registry. ConceptDemo.astro looks demos up by id here.
//
// Static imports, not dynamic ones: the CSP is `script-src 'self'` with no
// 'unsafe-inline' and the build inlines nothing (assetsInlineLimit: 0), so
// every demo must be a real module the bundler can see at build time.
//
// Adding a demo: write it against the contract documented at the top of
// circuit.js, register it here, and add its compute() cases to
// scripts/test-demos.mjs. A demo whose numbers are not asserted is not done.

import * as circuit from './circuit.js';
import * as gears from './gears.js';
import * as loop from './loop.js';
import * as polling from './polling.js';

export const DEMOS = {
  [circuit.id]: circuit,
  [gears.id]: gears,
  [loop.id]: loop,
  [polling.id]: polling,
};

export function getDemo(id) {
  const demo = DEMOS[id];
  if (!demo) {
    throw new Error(`ConceptDemo: unknown demo "${id}". Registered: ${Object.keys(DEMOS).join(', ')}`);
  }
  return demo;
}
