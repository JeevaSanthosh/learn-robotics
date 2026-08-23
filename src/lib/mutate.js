// Mutation catalogue — the engine behind "Broken Robot" debug challenges
// (PRD §7.2) and, longer term, the assessment generator.
//
// The idea: take a known-good serialised Blockly program and inject exactly ONE
// deliberate, plausible defect from a fixed catalogue. The result is a program
// that is *almost* right — the kind of bug a real learner makes — so they can
// practise the skill that matters most and is taught least: finding the fault.
//
// Design rules, so this stays trustworthy:
//   * Pure. No DOM, no time, no Math.random, no eval/new Function. The only
//     source of variation is the integer seed, so the same (program, type, seed)
//     is byte-identical every time — same determinism contract as the simulator
//     (C-SIM-DET) and the assessment generator.
//   * Non-destructive. Every mutation works on a structuredClone; the caller's
//     program is never touched.
//   * Honest about failure. A mutation only fires when the program actually
//     contains a target it can act on. "Flip a turn" on a program with no turns
//     returns { applied: false } rather than lying or throwing.
//   * Each mutation returns a human description naming the specific change, in
//     the same spirit as review.js — "changed repeat 4 → repeat 5", not
//     "mutated a loop".
//
// The serialised shape is exactly what review.js flatten() consumes: a nested
// tree of { type, fields, inputs, next }. See review.js for the traversal.

import { mulberry32 } from './sim/noise.js';

// ------------------------------------------------------------------ traversal
//
// Mutations need to *find* candidate blocks anywhere in the tree, and know a
// little context (is this block inside a loop?). We collect every block into a
// flat list of "handles" — each holds a direct reference to the live block
// object in the (already-cloned) tree, so mutating handle.block mutates the
// tree in place.

/**
 * Walk a serialised workspace, yielding a handle for every block.
 * @returns {Array<{ block: object, parent: object|null, inputName: string|null,
 *                   inStatementStack: boolean, inLoop: boolean, depth: number }>}
 */
export function collectBlocks(program) {
  const out = [];
  const roots = program?.blocks?.blocks ?? [];

  function walkStack(block, parentOfHead, inputName, ctx) {
    let b = block;
    let prev = null; // previous block in this statement stack
    while (b) {
      out.push({
        block: b,
        // For the head of a stack, the parent is the input owner; deeper in the
        // stack, the parent is the previous block (linked via .next).
        parent: prev || parentOfHead,
        viaNext: !!prev,
        inputName: prev ? null : inputName,
        inLoop: ctx.inLoop,
        depth: ctx.depth,
      });

      const isLoop = /repeat|while|for/i.test(b.type);

      for (const [name, input] of Object.entries(b.inputs || {})) {
        const child = input.block || input.shadow;
        if (!child) continue;
        const body = /^(DO|SUBSTACK|STACK|ELSE)/.test(name);
        walkStack(child, b, name, {
          inLoop: ctx.inLoop || (isLoop && body),
          depth: ctx.depth + (body ? 1 : 0),
        });
      }
      prev = b;
      b = b.next?.block || null;
    }
  }

  roots.forEach((root) => walkStack(root, null, null, { inLoop: false, depth: 0 }));
  return out;
}

// A seeded pick: deterministic choice of one element from a non-empty list.
function pick(list, seed) {
  const rng = mulberry32(seed >>> 0);
  return list[Math.floor(rng() * list.length) % list.length];
}

// A seeded coin: deterministic +1 / -1 etc. Uses a different constant so it does
// not correlate with pick() on the same seed.
function coin(seed) {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  return rng() < 0.5;
}

// Shallow helpers for the value slot feeding an input (block first, then shadow).
const inputChild = (block, name) => block?.inputs?.[name]?.block || block?.inputs?.[name]?.shadow || null;

// ------------------------------------------------------------------ catalogue
//
// Each entry: { type, label, describe } plus a `find(program)` returning the
// list of applicable targets, and an `apply(target, seed)` mutating in place and
// returning a description string. The engine below handles cloning, seeded
// selection, and the applied/not-applied contract, so each entry stays tiny.

const NUM = (v) => (typeof v === 'number' ? v : Number(v));

/** A math_number's numeric value, or null if the slot isn't a plain number. */
function numberValue(child) {
  if (!child || child.type !== 'math_number') return null;
  const n = child.fields?.NUM;
  return typeof n === 'number' ? n : (typeof n === 'string' && n.trim() !== '' ? Number(n) : null);
}

const COMPARE_FLIP = { LT: 'GT', GT: 'LT', LTE: 'GTE', GTE: 'LTE', EQ: 'NEQ', NEQ: 'EQ' };
// swap-comparison only swaps the ordering operators; equality flips live under
// invert-condition, so keep them separate for clean descriptions.
const ORDER_SWAP = { LT: 'GT', GT: 'LT', LTE: 'GTE', GTE: 'LTE' };
const OP_TEXT = { LT: '<', LTE: '≤', GT: '>', GTE: '≥', EQ: '=', NEQ: '≠' };

const catalogue = [
  // ------------------------------------------------------------- off-by-one
  {
    type: 'off-by-one',
    label: 'Off-by-one loop count',
    find: (program) =>
      collectBlocks(program)
        .filter((h) => h.block.type === 'controls_repeat_ext')
        .filter((h) => numberValue(inputChild(h.block, 'TIMES')) !== null),
    apply: (target, seed) => {
      const times = inputChild(target.block, 'TIMES');
      const before = numberValue(times);
      // Prefer -1 (the more common real bug: a loop that stops one short), but
      // never below 1; go +1 when subtracting would underflow.
      const down = before > 1 ? !coin(seed) : false;
      const after = down ? before - 1 : before + 1;
      times.fields.NUM = after;
      return `Changed the loop count from repeat ${before} to repeat ${after} (off by one).`;
    },
  },

  // -------------------------------------------------------- swap-comparison
  {
    type: 'swap-comparison',
    label: 'Swapped comparison operator',
    find: (program) =>
      collectBlocks(program)
        .filter((h) => h.block.type === 'logic_compare')
        .filter((h) => ORDER_SWAP[h.block.fields?.OP]),
    apply: (target) => {
      const op = target.block.fields.OP;
      const next = ORDER_SWAP[op];
      target.block.fields.OP = next;
      return `Swapped the comparison ${OP_TEXT[op]} for ${OP_TEXT[next]}.`;
    },
  },

  // --------------------------------------------------------- sensor-hoisted
  //
  // Move a robot_distance / robot_line read from inside a loop to just before
  // it. This is the single most instructive robotics bug: the robot checks once
  // and then drives blind. Only applicable when such a read lives inside a loop.
  {
    type: 'sensor-hoisted',
    label: 'Sensor read hoisted out of the loop',
    find: (program) => {
      // Find loops that directly contain a sensor read in their body stack, as
      // an assignment/expression statement is uncommon here — the read blocks are
      // statement blocks (robot_distance/robot_line) sitting in the DO stack.
      const loops = collectBlocks(program).filter((h) => /repeat|while/i.test(h.block.type));
      const targets = [];
      for (const h of loops) {
        const bodyName = h.block.type === 'controls_repeat_ext' ? 'DO'
          : (h.block.inputs?.DO ? 'DO' : null);
        if (!bodyName) continue;
        const head = h.block.inputs?.[bodyName]?.block;
        if (!head) continue;
        // Walk the body stack; find the first sensor read and its predecessor.
        let prev = null;
        let b = head;
        while (b) {
          if (/robot_distance|robot_line/.test(b.type)) {
            targets.push({ loop: h.block, bodyName, sensor: b, prev, head });
            break;
          }
          prev = b;
          b = b.next?.block || null;
        }
      }
      return targets;
    },
    apply: (target) => {
      const { loop, bodyName, sensor, prev } = target.detail;
      const sensorType = sensor.type;
      // Detach the sensor block from the body stack, stitching the gap closed.
      const after = sensor.next?.block || null;
      if (prev) {
        prev.next = after ? { block: after } : undefined;
        if (!after) delete prev.next;
      } else {
        // Sensor was the head of the body; body now starts at `after`.
        if (after) loop.inputs[bodyName] = { ...loop.inputs[bodyName], block: after };
        else {
          // Removing the only body block: keep an empty body input.
          const keepShadow = loop.inputs[bodyName]?.shadow;
          loop.inputs[bodyName] = keepShadow ? { shadow: keepShadow } : {};
        }
      }
      // Re-parent the sensor read to sit immediately BEFORE the loop. We do this
      // by finding the loop in the tree and inserting the sensor ahead of it.
      hoistBefore(target.program, loop, sensor);
      const label = sensorType === 'robot_line' ? 'line' : 'distance';
      return `Moved the ${label} sensor read out of the loop, so it is now read once before the loop instead of every pass.`;
    },
  },

  // -------------------------------------------------------- wrong-turn-sign
  {
    type: 'wrong-turn-sign',
    label: 'Wrong turn direction',
    find: (program) =>
      collectBlocks(program)
        .filter((h) => h.block.type === 'robot_turn')
        .filter((h) => h.block.fields?.DIR === 'LEFT' || h.block.fields?.DIR === 'RIGHT'),
    apply: (target) => {
      const dir = target.block.fields.DIR;
      const next = dir === 'LEFT' ? 'RIGHT' : 'LEFT';
      target.block.fields.DIR = next;
      return `Flipped a turn from ${dir} to ${next}.`;
    },
  },

  // ---------------------------------------------------------- threshold-off
  //
  // Nudge a numeric threshold that feeds a comparison by ±1. Distinct from
  // off-by-one, which targets loop counts: this targets the compared-against
  // value in a condition, e.g. "distance < 3" becomes "distance < 4".
  {
    type: 'threshold-off',
    label: 'Threshold off by one',
    find: (program) => {
      const out = [];
      for (const h of collectBlocks(program)) {
        if (h.block.type !== 'logic_compare') continue;
        for (const slot of ['A', 'B']) {
          const child = inputChild(h.block, slot);
          if (numberValue(child) !== null) out.push({ compare: h.block, slot, child });
        }
      }
      return out;
    },
    apply: (target, seed) => {
      const { child, slot } = target.detail;
      const before = numberValue(child);
      const up = coin(seed);
      const after = up ? before + 1 : before - 1;
      child.fields.NUM = after;
      return `Changed a comparison threshold from ${before} to ${after} (off by one).`;
    },
  },

  // ------------------------------------------------------------- swap-blocks
  //
  // Swap two adjacent statement blocks in a stack. Order bugs are subtle and
  // common: "turn then move" vs "move then turn" ends somewhere quite different.
  {
    type: 'swap-blocks',
    label: 'Two adjacent blocks swapped',
    find: (program) => {
      // Find any block whose .next is a block AND which itself follows something
      // we can re-link (its parent via .next, or an input owner). We swap `block`
      // with `block.next.block`.
      const out = [];
      for (const h of collectBlocks(program)) {
        const first = h.block;
        const second = first.next?.block;
        if (!second) continue;
        // Skip swapping the start block itself with its first real block only if
        // start — robot_start must stay first. Everything else is fair game.
        if (first.type === 'robot_start') continue;
        out.push(h);
      }
      return out;
    },
    apply: (target) => {
      const first = target.block; // A
      const second = first.next.block; // B
      const tail = second.next?.block || null; // C (may be null)
      // Rewire A → B → C  into  B → A → C.
      // The parent currently points at A; make it point at B.
      relinkParentTo(target, second);
      second.next = { block: first };
      if (tail) first.next = { block: tail };
      else delete first.next;
      return `Swapped the order of two adjacent blocks (${friendly(first.type)} and ${friendly(second.type)}).`;
    },
  },

  // ------------------------------------------------------- invert-condition
  //
  // Replace a condition with its logical negation. Two shapes handled:
  //   * controls_whileUntil MODE flips WHILE <-> UNTIL (loop runs on the
  //     opposite truth of its condition), and
  //   * a logic_compare EQ<->NEQ (negating an equality test).
  {
    type: 'invert-condition',
    label: 'Condition inverted',
    find: (program) => {
      const out = [];
      for (const h of collectBlocks(program)) {
        if (h.block.type === 'controls_whileUntil' &&
            (h.block.fields?.MODE === 'WHILE' || h.block.fields?.MODE === 'UNTIL')) {
          out.push({ kind: 'mode', block: h.block });
        }
        if (h.block.type === 'logic_compare' &&
            (h.block.fields?.OP === 'EQ' || h.block.fields?.OP === 'NEQ')) {
          out.push({ kind: 'eq', block: h.block });
        }
      }
      return out;
    },
    apply: (target) => {
      const d = target.detail;
      if (d.kind === 'mode') {
        const before = d.block.fields.MODE;
        const after = before === 'WHILE' ? 'UNTIL' : 'WHILE';
        d.block.fields.MODE = after;
        return `Inverted a loop condition: repeat ${before.toLowerCase()} → repeat ${after.toLowerCase()}.`;
      }
      const before = d.block.fields.OP;
      const after = before === 'EQ' ? 'NEQ' : 'EQ';
      d.block.fields.OP = after;
      return `Inverted a condition: ${OP_TEXT[before]} → ${OP_TEXT[after]}.`;
    },
  },

  // --------------------------------------------------------- missing-reset
  //
  // Remove a block that resets state at the start: a variables_set, or an
  // "LED off" / "pen up". Forgetting to reset is a classic — the second run
  // inherits the first run's leftover state.
  {
    type: 'missing-reset',
    label: 'Missing reset',
    find: (program) => {
      const out = [];
      for (const h of collectBlocks(program)) {
        const b = h.block;
        if (b.type === 'variables_set') out.push(h);
        else if (b.type === 'robot_led' && b.fields?.STATE === 'OFF') out.push(h);
        else if (b.type === 'robot_pen' && b.fields?.STATE === 'UP') out.push(h);
      }
      // Only removable statement blocks (must have something to relink to, i.e.
      // a parent). robot_start-attached blocks always have a parent.
      return out.filter((h) => h.parent);
    },
    apply: (target) => {
      const b = target.block;
      const after = b.next?.block || null;
      // Unlink b, closing the gap.
      if (target.viaNext) {
        if (after) target.parent.next = { block: after };
        else delete target.parent.next;
      } else if (target.inputName) {
        if (after) target.parent.inputs[target.inputName] = {
          ...target.parent.inputs[target.inputName], block: after,
        };
        else {
          const keepShadow = target.parent.inputs[target.inputName]?.shadow;
          target.parent.inputs[target.inputName] = keepShadow ? { shadow: keepShadow } : {};
        }
      }
      const what = b.type === 'variables_set' ? 'a variable reset'
        : b.type === 'robot_led' ? 'the "LED off" reset'
        : 'the "pen up" reset';
      return `Removed ${what}, so state left over from a previous run is never cleared.`;
    },
  },
];

// The public catalogue descriptor list (no functions leaked; just metadata).
export const MUTATIONS = catalogue.map((c) => ({ type: c.type, label: c.label }));

const byType = Object.fromEntries(catalogue.map((c) => [c.type, c]));

// ---------------------------------------------------------------- utilities

const FRIENDLY = {
  robot_move: 'move forward', robot_turn: 'turn', robot_led: 'LED on/off',
  robot_wait: 'wait', robot_pen: 'pen up/down', robot_distance: 'read distance',
  robot_line: 'read line', robot_set_speed: 'set speed', robot_start: 'when Run pressed',
  controls_repeat_ext: 'repeat', controls_whileUntil: 'repeat while/until',
  controls_if: 'if', variables_set: 'set variable', math_change: 'change variable',
};
const friendly = (t) => FRIENDLY[t] || t;

/**
 * Re-point whatever refers to a handle's block so it refers to `replacement`
 * instead. Used when swapping the head of a stack or an input's block.
 */
function relinkParentTo(handle, replacement) {
  if (handle.viaNext) {
    handle.parent.next = { block: replacement };
  } else if (handle.inputName) {
    handle.parent.inputs[handle.inputName] = {
      ...handle.parent.inputs[handle.inputName], block: replacement,
    };
  } else {
    // Top-level root: replace the entry in blocks.blocks.
    handle.rootReplace?.(replacement);
  }
}

/**
 * Insert `node` immediately before `loop` in the tree. Finds whatever points at
 * `loop` (a .next link or an input.block) and splices `node` in front, with
 * node.next pointing at loop.
 */
function hoistBefore(program, loop, node) {
  // Ensure node is a clean single block (drop any trailing next it carried).
  delete node.next;

  const roots = program?.blocks?.blocks ?? [];

  // Case 1: loop is a top-level root.
  const rootIdx = roots.indexOf(loop);
  if (rootIdx !== -1) {
    node.next = { block: loop };
    roots[rootIdx] = node;
    return true;
  }

  // Case 2: search the tree for the reference to `loop`.
  function search(block) {
    let b = block;
    while (b) {
      // .next pointer to loop?
      if (b.next?.block === loop) {
        node.next = { block: loop };
        b.next = { block: node };
        return true;
      }
      // input.block to loop?
      for (const [nm, input] of Object.entries(b.inputs || {})) {
        if (input.block === loop) {
          node.next = { block: loop };
          input.block = node;
          return true;
        }
        const child = input.block || input.shadow;
        if (child && search(child)) return true;
      }
      b = b.next?.block || null;
    }
    return false;
  }
  for (const root of roots) if (search(root)) return true;
  return false;
}

// ------------------------------------------------------------------- engine

/**
 * Return the list of mutation types that have at least one applicable target in
 * `program`. Useful for callers who want to offer only meaningful choices.
 */
export function applicableTypes(program) {
  return catalogue.filter((c) => c.find(program).length > 0).map((c) => c.type);
}

/**
 * Apply one mutation of `type` to a deep clone of `program`, chosen by `seed`.
 *
 * @returns {{ program, description, applied: true, type }}
 *        | {{ program, applied: false, type }}
 */
export function applyMutation(program, type, seed = 1) {
  const entry = byType[type];
  if (!entry) throw new Error(`Unknown mutation type: ${type}`);

  const clone = structuredClone(program);
  const targets = entry.find(clone);
  if (!targets.length) {
    return { program, applied: false, type };
  }

  // Seeded selection of one target. Normalise targets to handle objects that all
  // expose `.block`; sensor-hoisted / threshold-off / invert-condition carry
  // extra detail, which we attach under `.detail` and `.program`.
  const s = seed >>> 0;
  const chosen = pick(targets, s);
  const target = normaliseTarget(chosen, clone);

  const description = entry.apply(target, s);
  return { program: clone, description, applied: true, type };
}

// Some find()s return raw handles ({block,...}); others return descriptor
// objects. Present a uniform target to apply() with .block, .detail, .program.
function normaliseTarget(chosen, program) {
  if (chosen && chosen.block && chosen.parent !== undefined) {
    // A handle from collectBlocks.
    return { ...chosen, detail: chosen, program };
  }
  // A descriptor object (e.g. { compare, slot } or { loop, sensor, ... }).
  return { block: chosen.block || chosen.compare || chosen.loop, detail: chosen, program };
}

/**
 * Pick an applicable mutation type by seed and apply it. If nothing applies,
 * returns { applied: false }.
 */
export function mutate(program, seed = 1) {
  const types = applicableTypes(program);
  if (!types.length) return { program, applied: false, type: null };
  const s = seed >>> 0;
  // Choose a type deterministically, then apply with a derived seed so the type
  // choice and the within-type choice do not collapse to the same stream.
  const type = pick(types, s);
  return applyMutation(program, type, (s ^ 0x85ebca6b) >>> 0);
}
