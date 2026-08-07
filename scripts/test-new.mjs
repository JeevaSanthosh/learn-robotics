// Runtime tests for the pieces added in the improvements pass.
import { encodeProgram, decodeProgram } from '../src/lib/share.js';

const pass = [], fail = [];
const t = (name, cond) => (cond ? pass : fail).push(`  ${cond ? 'PASS' : 'FAIL'} ${name}`);

// --- share links round-trip ------------------------------------------------
const program = {
  blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', x: 10, y: 10, next: { block: { type: 'robot_move', fields: { DIST: 3 } } } }] },
};
const hash = await encodeProgram(program);
t('S1 share hash is a URL fragment', hash.startsWith('#p='));
t('S2 tagged with an encoding', hash[3] === 'g' || hash[3] === 'r');
t('S3 base64url is URL-safe', !/[+/=]/.test(hash.slice(3)));
const back = await decodeProgram(hash);
t('S4 round-trips exactly', JSON.stringify(back) === JSON.stringify(program));
t('S5 ignores unrelated hashes', (await decodeProgram('#section-2')) === null);
t('S6 survives corrupt payload', (await decodeProgram('#p=gNOTVALID')) === null);
// A big program must actually compress; a tiny one is allowed to stay raw.
const big = { blocks: { languageVersion: 0, blocks: Array.from({ length: 60 }, (_, i) => ({ type: 'robot_move', x: i, y: i, fields: { DIST: 2 } })) } };
const bigHash = await encodeProgram(big);
t('S7 large programs compress', bigHash[3] === 'g' && bigHash.length < JSON.stringify(big).length);
t('S10 large programs round-trip', JSON.stringify(await decodeProgram(bigHash)) === JSON.stringify(big));
const rawLen = 4 + Buffer.from(JSON.stringify(program)).toString('base64').replace(/=+$/, '').length;
t('S11 encoder never picks the longer form', hash.length <= rawLen);

// --- SSE frame parsing (mirrors the loop in lib/tutor.js) ------------------
function parseSSE(raw) {
  let out = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const d = line.slice(5).trim();
    if (!d || d === '[DONE]') continue;
    try { out += JSON.parse(d).response ?? ''; } catch {}
  }
  return out;
}
t('S8 assembles streamed chunks',
  parseSSE('data: {"response":"Try "}\ndata: {"response":"the sensor."}\ndata: [DONE]\n') === 'Try the sensor.');
t('S9 tolerates keepalive/blank frames',
  parseSSE('\ndata: {"response":"ok"}\n\n: ping\ndata: [DONE]\n') === 'ok');

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); process.exit(1); }
console.log(`\n✓ ${pass.length} share/stream tests pass`);
