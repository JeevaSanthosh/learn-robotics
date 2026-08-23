// Tree-walking interpreter for the MicroPython subset (PRD §8.7). Runs the AST
// from pyparse.js against the SAME robot driver the block interpreter drives, so
// a program typed in text moves the simulated robot exactly like its block form.
//
// HARD REQUIREMENT (HC1 / verify C2): no eval, no new Function. Everything here
// is an explicit switch over AST node types.

import { PyError } from './pyparse.js';

const MAX_OPS = 20000; // guards the tab against an infinite loop

class ReturnSignal { constructor(value) { this.value = value; } }

class RuntimeError extends Error {
  constructor(message, line) { super(message); this.name = 'RuntimeError'; this.line = line; }
}

// Maps the Python robot API (what the code panel shows) onto the driver the
// simulator/interpreter already expose.
function robotCall(driver, method, args, line) {
  switch (method) {
    case 'move_forward': return driver.moveForward(num(args[0], 1));
    case 'turn_left': return driver.turn(-90);
    case 'turn_right': return driver.turn(90);
    case 'set_speed': return driver.setSpeed(num(args[0], 1));
    case 'led_on': return driver.setLed(true);
    case 'led_off': return driver.setLed(false);
    case 'pen': return driver.setPen(!!args[0]);
    case 'read_distance': return driver.readDistance();
    case 'on_line': return driver.readLine();
    default: throw new RuntimeError(`the robot has no '${method}' — did you mean move_forward, turn_left/right, led_on/off, set_speed, pen, read_distance or on_line?`, line);
  }
}
const num = (v, d = 0) => (typeof v === 'number' ? v : (v == null ? d : Number(v) || 0));

/**
 * @param {object} ast    parse() output
 * @param {object} driver the robot driver (moveForward/turn/setLed/… + `stopped`)
 * @returns {Promise<void>}
 */
export async function runPython(ast, driver) {
  const globals = new Map();
  const funcs = new Map();
  let ops = 0;
  const budget = (line) => { if (++ops > MAX_OPS) throw new RuntimeError('this program runs forever — give it a way to stop', line); };

  // hoist function definitions so a call can precede its def
  for (const s of ast.body) if (s.type === 'def') funcs.set(s.name, s);

  async function execBlock(stmts, scope) {
    for (const s of stmts) {
      if (driver.stopped) return;
      await exec(s, scope);
    }
  }

  async function exec(node, scope) {
    budget(node.line);
    switch (node.type) {
      case 'def': funcs.set(node.name, node); return;
      case 'pass': return;
      case 'exprstmt': await evalNode(node.expr, scope); return;
      case 'assign': {
        const value = await evalNode(node.value, scope);
        if (node.target.type === 'name') setVar(scope, node.target.name, value);
        else { // index assignment: lst[i] = v
          const arr = await evalNode(node.target.obj, scope);
          const idx = await evalNode(node.target.index, scope);
          if (!Array.isArray(arr)) throw new RuntimeError('can only index into a list', node.line);
          arr[idx] = value;
        }
        return;
      }
      case 'if': {
        for (const t of node.tests) if (truthy(await evalNode(t.cond, scope))) return execBlock(t.body, scope);
        if (node.orelse) return execBlock(node.orelse, scope);
        return;
      }
      case 'while': {
        while (truthy(await evalNode(node.cond, scope))) { budget(node.line); if (driver.stopped) return; await execBlock(node.body, scope); }
        return;
      }
      case 'for': {
        const [a, b] = [await evalNode(node.range[0], scope), node.range[1] ? await evalNode(node.range[1], scope) : null];
        const [start, stop] = b === null ? [0, a] : [a, b];
        for (let i = start; i < stop; i++) { budget(node.line); if (driver.stopped) return; setVar(scope, node.var, i); await execBlock(node.body, scope); }
        return;
      }
      case 'return': throw new ReturnSignal(node.value ? await evalNode(node.value, scope) : null);
      default: throw new RuntimeError(`cannot run a ${node.type} here`, node.line);
    }
  }

  async function evalNode(node, scope) {
    switch (node.type) {
      case 'num': return node.value;
      case 'str': return node.value;
      case 'bool': return node.value;
      case 'none': return null;
      case 'name': return getVar(scope, node);
      case 'list': { const out = []; for (const it of node.items) out.push(await evalNode(it, scope)); return out; }
      case 'neg': return -num(await evalNode(node.operand, scope));
      case 'not': return !truthy(await evalNode(node.operand, scope));
      case 'logic': {
        const l = await evalNode(node.left, scope);
        if (node.op === 'and') return truthy(l) ? await evalNode(node.right, scope) : l;
        return truthy(l) ? l : await evalNode(node.right, scope);
      }
      case 'compare': {
        const l = await evalNode(node.left, scope), r = await evalNode(node.right, scope);
        switch (node.op) {
          case '<': return l < r; case '<=': return l <= r; case '>': return l > r;
          case '>=': return l >= r; case '==': return l === r; case '!=': return l !== r;
        }
        return false;
      }
      case 'binop': {
        const l = num(await evalNode(node.left, scope)), r = num(await evalNode(node.right, scope));
        switch (node.op) {
          case '+': return l + r; case '-': return l - r; case '*': return l * r;
          case '/': return r === 0 ? 0 : l / r; case '//': return r === 0 ? 0 : Math.floor(l / r);
          case '%': return r === 0 ? 0 : l % r;
        }
        return 0;
      }
      case 'index': {
        const arr = await evalNode(node.obj, scope); const idx = await evalNode(node.index, scope);
        if (!Array.isArray(arr) && typeof arr !== 'string') throw new RuntimeError('can only index into a list or string', node.line);
        return arr[idx < 0 ? arr.length + idx : idx];
      }
      case 'attr':
        // a bare attribute (robot.something without a call) isn't meaningful here
        throw new RuntimeError(`'${node.name}' needs to be called, e.g. ${node.name}()`, node.line);
      case 'call': return callExpr(node, scope);
      default: throw new RuntimeError(`cannot evaluate a ${node.type}`, node.line);
    }
  }

  async function callExpr(node, scope) {
    const args = [];
    for (const a of node.args) args.push(await evalNode(a, scope));

    // robot.x(...) / time.sleep(...)
    if (node.func.type === 'attr') {
      const objNode = node.func.obj;
      if (objNode.type === 'name' && objNode.name === 'robot') { budget(node.line); return robotCall(driver, node.func.name, args, node.line); }
      if (objNode.type === 'name' && objNode.name === 'time' && node.func.name === 'sleep') { budget(node.line); return driver.wait(num(args[0], 0)); }
      throw new RuntimeError(`'${objNode.name ?? '?'}.${node.func.name}' is not something I know`, node.line);
    }
    // name(...) — a user function or a small set of builtins
    if (node.func.type === 'name') {
      const name = node.func.name;
      if (funcs.has(name)) return callUser(funcs.get(name), args, node.line);
      switch (name) {
        case 'len': return Array.isArray(args[0]) || typeof args[0] === 'string' ? args[0].length : 0;
        case 'abs': return Math.abs(num(args[0]));
        case 'int': return Math.trunc(num(args[0]));
        case 'min': return Math.min(...args.map(num));
        case 'max': return Math.max(...args.map(num));
        case 'print': return null; // no console on the robot; harmless no-op
        case 'range': throw new RuntimeError('range() can only be used in a for-loop here', node.line);
        default: throw new RuntimeError(`'${name}' is not defined`, node.line);
      }
    }
    throw new RuntimeError('this is not something I can call', node.line);
  }

  async function callUser(def, args, line) {
    if (args.length !== def.params.length)
      throw new RuntimeError(`${def.name}() takes ${def.params.length} argument(s) but got ${args.length}`, line);
    const local = new Map();
    def.params.forEach((p, i) => local.set(p, args[i]));
    try { await execBlock(def.body, { local, parent: scopeOf(globals) }); }
    catch (e) { if (e instanceof ReturnSignal) return e.value; throw e; }
    return null;
  }

  const scopeOf = (m) => ({ local: m, parent: null });
  const rootScope = scopeOf(globals);

  function setVar(scope, name, value) { (scope.local || globals).set(name, value); }
  function getVar(scope, node) {
    let s = scope;
    while (s) { if (s.local && s.local.has(node.name)) return s.local.get(node.name); s = s.parent; }
    if (globals.has(node.name)) return globals.get(node.name);
    throw new RuntimeError(`'${node.name}' is not defined`, node.line);
  }
  function truthy(v) { return Array.isArray(v) ? v.length > 0 : !!v; }

  try {
    await execBlock(ast.body, rootScope);
  } catch (e) {
    if (e instanceof ReturnSignal) return; // return at top level: just stop
    if (e instanceof RuntimeError || e instanceof PyError) throw e;
    throw e;
  }
}

export { RuntimeError };
