// Headless runtime test of the block interpreter against a mock workspace.
// Proves: loops iterate, conditions branch, sensor loop stops before wall,
// variables work, and the infinite-loop guard fires. Run: node scripts/test-interpreter.mjs
import { BlockRunner } from '../src/lib/interpreter.js';

// --- minimal Blockly mocks --------------------------------------------------
let uid = 0;
function block(type, { fields = {}, inputs = {}, next = null } = {}) {
  return {
    id: ++uid, type,
    isEnabled: () => true,
    getFieldValue: (n) => fields[n],
    getField: (n) => ({ getValue: () => fields[n] }),
    getInputTargetBlock: (n) => inputs[n] ?? null,
    getInput: (n) => (n in inputs ? {} : null),
    getNextBlock: () => next,
  };
}
const ws = (tops) => ({ getTopBlocks: () => tops, getAllBlocks: () => [] });

// --- mock robot mirroring sim.js API ---------------------------------------
function mockRobot(wallAt = 5) {
  return {
    pos: 0, led: false, blinkCount: 0, bumped: false, speed: 1, stopped: false,
    async moveForward(u) {
      for (let i = 0; i < u; i++) {
        if (this.pos + 1 > wallAt) { this.bumped = true; return; }
        this.pos += 1;
      }
    },
    async turn() {},
    async setLed(on) { if (on && !this.led) this.blinkCount++; this.led = on; },
    async wait() {},
    setSpeed(v) { this.speed = v; },
    readDistance() { return wallAt - this.pos; },
  };
}

let failures = 0;
const assert = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' — ' + detail}`);
  if (!cond) failures++;
};

// T1: repeat 3 [ led on, led off ] → blinkCount 3
{
  const body = block('robot_led', { fields: { STATE: 'ON' }, next: block('robot_led', { fields: { STATE: 'OFF' } }) });
  const rep = block('controls_repeat_ext', { inputs: { TIMES: block('math_number', { fields: { NUM: 3 } }), DO: body } });
  const r = mockRobot();
  await new BlockRunner(ws([rep]), r).run();
  assert('T1 repeat loop blinks 3x', r.blinkCount === 3, `got ${r.blinkCount}`);
}

// T2: repeat UNTIL distance <= 1 [ move 1 ] → stops at pos 4, no bump (wall-stop mission)
{
  const cond = block('logic_compare', { fields: { OP: 'LTE' }, inputs: { A: block('robot_distance'), B: block('math_number', { fields: { NUM: 1 } }) } });
  const loop = block('controls_whileUntil', { fields: { MODE: 'UNTIL' }, inputs: { BOOL: cond, DO: block('robot_move', { fields: { DIST: 1 } }) } });
  const r = mockRobot(5);
  await new BlockRunner(ws([loop]), r).run();
  assert('T2 sensor loop stops before wall', r.readDistance() === 1 && !r.bumped, `dist ${r.readDistance()} bumped ${r.bumped}`);
}

// T3: if (distance > 2) move else led on — else branch when close
{
  const mk = (robot) => block('controls_if', {
    inputs: {
      IF0: block('logic_compare', { fields: { OP: 'GT' }, inputs: { A: block('robot_distance'), B: block('math_number', { fields: { NUM: 2 } }) } }),
      DO0: block('robot_move', { fields: { DIST: 1 } }),
      ELSE: block('robot_led', { fields: { STATE: 'ON' } }),
    },
  });
  const far = mockRobot(9);
  await new BlockRunner(ws([mk(far)]), far).run();
  const near = mockRobot(1);
  await new BlockRunner(ws([mk(near)]), near).run();
  assert('T3 if/else branches correctly', far.pos === 1 && !far.led && near.pos === 0 && near.led,
    `far pos ${far.pos} led ${far.led}; near pos ${near.pos} led ${near.led}`);
}

// T4: variables: set count=2, set speed to count → robot.speed 2
{
  const setv = block('variables_set', {
    fields: { VAR: 'v1' },
    inputs: { VALUE: block('math_number', { fields: { NUM: 2 } }) },
    next: block('robot_set_speed', { inputs: { SPEED: block('variables_get', { fields: { VAR: 'v1' } }) } }),
  });
  const r = mockRobot();
  await new BlockRunner(ws([setv]), r).run();
  assert('T4 variable feeds set-speed', r.speed === 2, `speed ${r.speed}`);
}

// T5: infinite loop → friendly guard error, tab survives
{
  const forever = block('controls_whileUntil', { fields: { MODE: 'WHILE' }, inputs: { BOOL: block('logic_boolean', { fields: { BOOL: 'TRUE' } }), DO: block('robot_led', { fields: { STATE: 'ON' } }) } });
  const r = mockRobot();
  let msg = '';
  try { await new BlockRunner(ws([forever]), r).run(); } catch (e) { msg = e.message; }
  assert('T5 infinite-loop guard fires', /forever/.test(msg), `got "${msg}"`);
}

// T6: hat present → only hat stacks run
{
  const hat = block('robot_start', { next: block('robot_led', { fields: { STATE: 'ON' } }) });
  const stray = block('robot_move', { fields: { DIST: 3 } });
  const r = mockRobot();
  await new BlockRunner(ws([hat, stray]), r).run();
  assert('T6 event hat gates execution', r.led === true && r.pos === 0, `pos ${r.pos}`);
}

console.log(failures ? `\n✗ ${failures} interpreter test(s) failing` : '\n✓ interpreter runtime tests pass');
process.exit(failures ? 1 : 0);
