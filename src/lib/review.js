// Program review — "how could I have done this better?"
//
// Runs over the Blockly workspace's serialised JSON (a plain nested object, so
// this file has no Blockly dependency and is testable in node). Produces
// concrete, teachable suggestions rather than a score.
//
// Design rules, learned the hard way from tools that do this badly:
//   * Never fire on an empty or barely-started program. Nagging someone who
//     has dragged two blocks teaches them to close the panel forever.
//   * Every suggestion names the specific thing and says what to do instead.
//     "Consider refactoring" is noise; "your move-turn pair repeats 4 times —
//     wrap it in a repeat 4" is a lesson.
//   * Correctness issues outrank tidiness. A learner with a real bug should
//     not be told about naming conventions first.
//   * At most a handful at a time. A wall of criticism reads as failure.

export const LEVELS = { logic: 0, efficiency: 1, style: 2 };

// ---------------------------------------------------------------- traversal

/** Flatten a serialised workspace into [{ type, depth, inLoop, inIf, index }]. */
export function flatten(workspaceJson) {
  const out = [];
  const roots = workspaceJson?.blocks?.blocks ?? [];

  function walkStack(block, depth, ctx, stack) {
    let b = block;
    while (b) {
      const entry = { type: b.type, depth, inLoop: ctx.inLoop, inIf: ctx.inIf, fields: b.fields || {} };
      out.push(entry);
      stack.push(entry);

      const isLoop = /repeat|while|for/i.test(b.type);
      const isIf = /controls_if/i.test(b.type);

      for (const [name, input] of Object.entries(b.inputs || {})) {
        const child = input.block || input.shadow;
        if (!child) continue;
        const childCtx = {
          inLoop: ctx.inLoop || isLoop,
          inIf: ctx.inIf || isIf,
        };
        // DO/SUBSTACK inputs are statement bodies; others are value slots
        const body = /^(DO|SUBSTACK|STACK|ELSE)/.test(name);
        walkStack(child, depth + (body ? 1 : 0), childCtx, body ? [] : stack);
        if (body) entry.bodyCount = (entry.bodyCount || 0) + countStack(child);
      }
      b = b.next?.block || null;
    }
  }

  function countStack(block) {
    let n = 0;
    let b = block;
    while (b) { n++; b = b.next?.block || null; }
    return n;
  }

  roots.forEach((root) => walkStack(root, 0, { inLoop: false, inIf: false }, []));
  return out;
}

/** Top-level stacks — more than one usually means orphaned/dead blocks. */
function topLevelStacks(workspaceJson) {
  return (workspaceJson?.blocks?.blocks ?? []).map((root) => {
    let n = 0;
    let b = root;
    while (b) { n++; b = b.next?.block || null; }
    return { type: root.type, length: n };
  });
}

/** The main statement sequence, as a list of type strings, for pattern search. */
function mainSequence(workspaceJson) {
  const roots = workspaceJson?.blocks?.blocks ?? [];
  if (!roots.length) return [];
  const root = roots.reduce((a, b) => (stackLength(b) >= stackLength(a) ? b : a));
  const seq = [];
  let b = /robot_start/.test(root.type) ? root.next?.block : root;
  while (b) { seq.push(b.type); b = b.next?.block || null; }
  return seq;
}

function stackLength(root) {
  let n = 0;
  let b = root;
  while (b) { n++; b = b.next?.block || null; }
  return n;
}

/**
 * Find the shortest sequence of blocks that repeats back-to-back at least
 * `minReps` times. This is what turns "you dragged eight blocks" into
 * "your two-block pattern repeats four times — that's a loop".
 */
export function findRepeatedPattern(seq, minReps = 3) {
  for (let len = 1; len <= Math.floor(seq.length / minReps); len++) {
    for (let start = 0; start + len * minReps <= seq.length; start++) {
      const pattern = seq.slice(start, start + len);
      let reps = 1;
      while (
        seq.slice(start + reps * len, start + (reps + 1) * len).join() === pattern.join()
      ) reps++;
      if (reps >= minReps) return { pattern, reps, start, length: len };
    }
  }
  return null;
}

// ------------------------------------------------------------------- naming
const FRIENDLY = {
  robot_move: 'move forward',
  robot_turn: 'turn',
  robot_led: 'LED on/off',
  robot_wait: 'wait',
  robot_distance: 'read distance',
  robot_set_speed: 'set speed',
  robot_pen: 'pen up/down',
  robot_line: 'read line',
  robot_start: 'when ▶ Run pressed',
  controls_repeat_ext: 'repeat',
  controls_whileUntil: 'repeat while/until',
  controls_if: 'if',
};
const name = (t) => FRIENDLY[t] || t;

// -------------------------------------------------------------------- rules

/**
 * @param {object} workspaceJson  Blockly.serialization.workspaces.save(ws)
 * @param {object} ctx  { goal, par, bumped, reachedTarget, ran }
 * @returns {Array<{level, title, detail}>}
 */
export function reviewProgram(workspaceJson, ctx = {}) {
  const blocks = flatten(workspaceJson);
  const stacks = topLevelStacks(workspaceJson);
  const seq = mainSequence(workspaceJson);
  const types = blocks.map((b) => b.type);
  const has = (re) => types.some((t) => re.test(t));
  const count = (re) => types.filter((t) => re.test(t)).length;
  const out = [];

  // Say nothing until there is actually a program to talk about.
  if (blocks.length < 3) return out;

  // --- LOGIC ---------------------------------------------------------------

  // The classic: a sensor read that isn't inside any loop. The robot checks
  // once and then drives blind. This is the single most common beginner bug.
  const sensorReads = blocks.filter((b) => /robot_distance|robot_line/.test(b.type));
  if (sensorReads.length && sensorReads.every((b) => !b.inLoop)) {
    out.push({
      level: 'logic',
      title: 'Your sensor is only checked once',
      detail:
        `The ${name(sensorReads[0].type)} block sits outside any loop, so it is read a single time and never again. ` +
        'The robot then drives blind. Move the check inside the loop so it runs on every pass.',
    });
  }

  // A loop with nothing in it does nothing, loudly.
  const emptyLoops = blocks.filter((b) => /repeat|while/i.test(b.type) && !b.bodyCount);
  if (emptyLoops.length) {
    out.push({
      level: 'logic',
      title: 'One of your loops is empty',
      detail: 'A repeat block with nothing inside runs nothing, many times. Drag the blocks you want repeated into its mouth.',
    });
  }

  // Orphaned stacks: blocks sitting off to the side, never run.
  const orphans = stacks.filter((s) => !/robot_start/.test(s.type));
  if (stacks.length > 1 && orphans.length && has(/robot_start/)) {
    out.push({
      level: 'logic',
      title: 'Some blocks are never run',
      detail:
        `You have ${stacks.length} separate stacks, but only the one under "${name('robot_start')}" runs. ` +
        'The others are floating loose — attach them, or drag them to the bin so they stop confusing you.',
    });
  }

  // Blinking without turning the LED off again.
  if (ctx.goal && String(ctx.goal).startsWith('blink') && count(/robot_led/) === 1) {
    out.push({
      level: 'logic',
      title: 'A blink needs two LED blocks',
      detail: 'Turning the LED on when it is already on changes nothing. A blink is a change: on, wait, off, wait.',
    });
  }

  // Crashed into a wall while a sensor was available.
  if (ctx.bumped && !has(/robot_distance/)) {
    out.push({
      level: 'logic',
      title: 'You crashed, and nothing was watching',
      detail:
        'The robot hit a wall and your program has no distance check. Counting squares works until something moves; ' +
        'a sensor works every time. Try "repeat until distance < 2".',
    });
  }

  // --- EFFICIENCY ----------------------------------------------------------

  // Repeated pattern that should be a loop.
  const rep = findRepeatedPattern(seq, 3);
  if (rep && !has(/repeat|while/i)) {
    const label = rep.pattern.map(name).join(' → ');
    out.push({
      level: 'efficiency',
      title: `That pattern repeats ${rep.reps} times`,
      detail:
        `Your "${label}" sequence appears ${rep.reps} times in a row — ${rep.reps * rep.length} blocks doing the work of ` +
        `${rep.length + 1}. Wrap one copy in "repeat ${rep.reps}" and delete the rest. Same result, far less to read (and to fix).`,
    });
  }

  // Longer than par.
  if (ctx.par && blocks.length > ctx.par * 1.6) {
    out.push({
      level: 'efficiency',
      title: `This can be done in about ${ctx.par} blocks`,
      detail:
        `You used ${blocks.length}. It works — that counts. But shorter programs have fewer places to hide a bug. ` +
        'Look for anything you have written out more than twice.',
    });
  }

  // The same number typed over and over → variable.
  const numbers = blocks.flatMap((b) => Object.values(b.fields || {})).filter((v) => typeof v === 'number');
  const freq = {};
  for (const n of numbers) freq[n] = (freq[n] || 0) + 1;
  const magic = Object.entries(freq).find(([, c]) => c >= 4);
  if (magic && !has(/variables_set/)) {
    out.push({
      level: 'style',
      title: `The number ${magic[0]} appears ${magic[1]} times`,
      detail:
        `If you ever want to change it, you have to find all ${magic[1]}. Put it in a variable once and use the variable ` +
        'instead — that is exactly what variables are for.',
    });
  }

  // --- STYLE ---------------------------------------------------------------

  if (!has(/robot_start/) && blocks.length >= 4) {
    out.push({
      level: 'style',
      title: 'No start block',
      detail:
        `Real robots wait for something before acting. Putting your program under "${name('robot_start')}" makes the trigger ` +
        'explicit — and it is how every event-driven robot is written.',
    });
  }

  const deep = blocks.filter((b) => b.depth >= 3);
  if (deep.length) {
    out.push({
      level: 'style',
      title: 'Nesting is getting deep',
      detail:
        'You have blocks three levels in. Deeply nested code is hard to hold in your head. See whether an inner section ' +
        'could be its own loop with a clear condition, rather than another layer.',
    });
  }

  // Correctness first, tidiness last; cap the list so it reads as help.
  return out.sort((a, b) => LEVELS[a.level] - LEVELS[b.level]).slice(0, 4);
}

// ---------------------------------------------------------- run-trace explainer
// The "Why did that happen?" button (PRD §8.8). Unlike reviewProgram (which
// reads the static program), this reads the RUN — the per-tick trace the core
// records — and states the MECHANICAL cause from what actually happened. It is
// deliberately rules-based, not the LLM: it must always be correct and always
// free, and the tutor is given its output as fact so it never has to guess.
//
// trace: [{ tick, x, y, heading, distance }]   ctx: { goal, bumped, reachedTarget, target, lineAccuracy }
const PX = 60;

export function explainRun(trace, ctx = {}) {
  if (!Array.isArray(trace) || trace.length < 2) return null;

  if (ctx.bumped) {
    // When did the distance reading first drop below one square before impact?
    const warnIdx = trace.findIndex((s) => s.distance < 1);
    const ticksBlind = warnIdx >= 0 ? trace.length - 1 - warnIdx : -1;
    return {
      title: 'Why it crashed',
      detail: warnIdx >= 0
        ? `The distance sensor read below 1 square about ${ticksBlind} step${ticksBlind === 1 ? '' : 's'} before the robot hit the wall — but it kept moving. Either the check isn't inside the loop (so it only runs once), or the threshold is smaller than the distance you actually cover between checks.`
        : `The robot hit a wall with no low distance reading beforehand — it was driving by counting steps, not by sensing. A sensor check inside the loop ("repeat until distance < 2") would have caught it.`,
    };
  }

  if (ctx.goal === 'reach-target' && ctx.target && !ctx.reachedTarget) {
    let best = Infinity, at = 0;
    trace.forEach((s, i) => {
      const d = Math.hypot(s.x - ctx.target.x, s.y - ctx.target.y) / PX;
      if (d < best) { best = d; at = i; }
    });
    const after = trace.length - 1 - at;
    return {
      title: 'Why it missed',
      detail: `Closest you came to the target was ${best.toFixed(1)} squares, and that was ${after} step${after === 1 ? '' : 's'} before the program ended — so the robot reached its nearest point and then carried on past it. Stop when you arrive, or shorten the last move.`,
    };
  }

  if (ctx.goal === 'follow-line' && typeof ctx.lineAccuracy === 'number' && ctx.lineAccuracy <= 0.75) {
    return {
      title: 'Why the line score is low',
      detail: `The robot was over the line ${Math.round(ctx.lineAccuracy * 100)}% of the run. It drifts off between checks — check the line more often by making each move shorter, so a wander is corrected before it grows.`,
    };
  }

  return {
    title: 'What happened',
    detail: `The robot ran for ${trace.length} steps and ended ${(Math.hypot(trace.at(-1).x - trace[0].x, trace.at(-1).y - trace[0].y) / PX).toFixed(1)} squares from where it started. Nothing obviously failed — compare where it finished with where the mission wanted it.`,
  };
}
