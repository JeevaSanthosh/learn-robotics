// Executes the learner's Blockly workspace by walking the block tree directly.
// No eval, no new Function — so the site's CSP can stay `script-src 'self'`.
// The generated-JS/Python text in the code bridge is DISPLAY ONLY.
//
// Supported blocks are exactly the ones in blocks.js toolboxes. Adding a new
// block = add a case here + a display generator there. verify.mjs C2 keeps
// anyone from quietly reintroducing eval.

const MAX_OPS = 5000; // hard budget: protects the tab from infinite loops

export class BlockRunner {
  constructor(workspace, robot) {
    this.ws = workspace;
    this.robot = robot;
    this.vars = new Map();
    this.ops = 0;
  }

  /** Run the program. If any "when Run pressed" hat blocks exist, run only
   *  those stacks (that's the event-model lesson); otherwise run all stacks. */
  async run() {
    const tops = this.ws.getTopBlocks(true);
    const hats = tops.filter((b) => b.type === 'robot_start');
    const stacks = hats.length ? hats : tops;
    for (const b of stacks) await this.execChain(b.type === 'robot_start' ? b.getNextBlock() : b);
  }

  async execChain(block) {
    while (block) {
      if (this.robot.stopped) return;
      await this.exec(block);
      block = block.getNextBlock();
    }
  }

  budget() {
    if (++this.ops > MAX_OPS) throw new Error('That program runs forever! Add a way for it to stop.');
  }

  async exec(b) {
    this.budget();
    const f = (name) => b.getFieldValue(name);
    const input = (name) => this.value(b.getInputTargetBlock(name));
    const stmt = (name) => this.execChain(b.getInputTargetBlock(name));

    switch (b.type) {
      case 'robot_move':   return this.robot.moveForward(Number(f('DIST')));
      case 'robot_turn':   return this.robot.turn(f('DIR') === 'LEFT' ? -90 : 90);
      case 'robot_led':    return this.robot.setLed(f('STATE') === 'ON');
      case 'robot_wait':   return this.robot.wait(Number(f('SECS')));
      case 'robot_set_speed': {
        const v = await input('SPEED');
        return this.robot.setSpeed(Number(v));
      }
      case 'controls_repeat_ext': {
        const times = Math.min(Number(await input('TIMES')) || 0, 200);
        for (let i = 0; i < times && !this.robot.stopped; i++) {
          this.budget();
          await stmt('DO');
        }
        return;
      }
      case 'controls_whileUntil': {
        const until = f('MODE') === 'UNTIL';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          this.budget();
          if (this.robot.stopped) return;
          const cond = Boolean(await input('BOOL'));
          if (until ? cond : !cond) return;
          await stmt('DO');
        }
      }
      case 'controls_if': {
        // handles if / else-if / else mutations (IF0..IFn, DO0..DOn, ELSE)
        let n = 0;
        while (b.getInput('IF' + n)) {
          if (await input('IF' + n)) return stmt('DO' + n);
          n++;
        }
        if (b.getInput('ELSE')) return stmt('ELSE');
        return;
      }
      case 'variables_set': {
        const id = b.getField('VAR').getValue();
        this.vars.set(id, await input('VALUE'));
        return;
      }
      case 'math_change': {
        const id = b.getField('VAR').getValue();
        this.vars.set(id, (Number(this.vars.get(id)) || 0) + Number(await input('DELTA')));
        return;
      }
      default:
        throw new Error(`I don't know the block "${b.type}" yet.`);
    }
  }

  async value(b) {
    if (!b) return 0;
    this.budget();
    const input = (name) => this.value(b.getInputTargetBlock(name));

    switch (b.type) {
      case 'math_number':    return Number(b.getFieldValue('NUM'));
      case 'robot_distance': return this.robot.readDistance();
      case 'logic_boolean':  return b.getFieldValue('BOOL') === 'TRUE';
      case 'logic_negate':   return !(await input('BOOL'));
      case 'variables_get':  return this.vars.get(b.getField('VAR').getValue()) ?? 0;
      case 'logic_compare': {
        const a = await input('A');
        const c = await input('B');
        switch (b.getFieldValue('OP')) {
          case 'EQ':  return a === c;
          case 'NEQ': return a !== c;
          case 'LT':  return a < c;
          case 'LTE': return a <= c;
          case 'GT':  return a > c;
          case 'GTE': return a >= c;
        }
        return false;
      }
      case 'math_arithmetic': {
        const a = Number(await input('A'));
        const c = Number(await input('B'));
        switch (b.getFieldValue('OP')) {
          case 'ADD':      return a + c;
          case 'MINUS':    return a - c;
          case 'MULTIPLY': return a * c;
          case 'DIVIDE':   return c === 0 ? 0 : a / c;
          case 'POWER':    return a ** c;
        }
        return 0;
      }
      default:
        throw new Error(`I don't know the value block "${b.type}" yet.`);
    }
  }
}
