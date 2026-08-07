// Assessment question generator.
//
// WHY PROCEDURAL AND NOT AI-GENERATED
// The obvious way to get "a unique question every time" is to ask the LLM.
// We deliberately don't, for three reasons:
//   1. Correctness. An assessment that grades you is the one place a
//      hallucinated answer key does real damage — it would teach the wrong
//      thing with authority. Here the generator COMPUTES the answer, so the
//      key is right by construction.
//   2. Cost. Workers AI has a 10,000 Neuron/day free allocation shared with
//      the tutor. A 10-question quiz per attempt would eat it fast.
//   3. Offline. The service worker makes lessons work on a plane; questions
//      generated in-browser keep working there too.
//
// Uniqueness comes from parameterisation instead: each template draws random
// numbers, names, and orderings, and several templates SIMULATE the robot to
// derive both the answer and the distractors. The practical question space is
// in the tens of thousands, and `pickQuestions` additionally avoids repeating
// a template within an attempt.
//
// Difficulty ladder (deliberate, not decoration):
//   easy   — recall: does the learner know what a term means?
//   medium — apply: given a rule, predict one step.
//   hard   — trace/debug: run several steps in your head, or find the fault.

// ---------------------------------------------------------------- utilities
export function makeRng(seed) {
  // mulberry32 — small, fast, and seedable so an attempt is reproducible
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build a question with the correct option shuffled into place. */
function mc({ q, correct, wrong, why, topic, difficulty, rng }) {
  const options = shuffle(rng, [correct, ...wrong]);
  return { q, options, answer: options.indexOf(correct), why, topic, difficulty };
}

// Distinct distractors: drops duplicates and anything equal to the answer.
function distinct(correct, candidates, n) {
  const out = [];
  for (const c of candidates) {
    if (c === correct || out.includes(c)) continue;
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

// ------------------------------------------------------- robot mini-simulator
// Mirrors src/lib/sim.js semantics at grid resolution: heading in 90° steps,
// "move N" advances N cells, turns rotate in place. Used to derive answers for
// the trace questions so they cannot disagree with the real simulator.
const DIRS = ['north', 'east', 'south', 'west'];
const STEP = { north: [0, 1], east: [1, 0], south: [0, -1], west: [-1, 0] };

export function traceProgram(start, program) {
  let { x, y, dir } = start;
  for (const step of program) {
    if (step.op === 'move') {
      const [dx, dy] = STEP[dir];
      x += dx * step.n;
      y += dy * step.n;
    } else if (step.op === 'turn') {
      const i = DIRS.indexOf(dir);
      dir = step.dir === 'right' ? DIRS[(i + 1) % 4] : DIRS[(i + 3) % 4];
    }
  }
  return { x, y, dir };
}

const fmt = (p) => `(${p.x}, ${p.y}) facing ${p.dir}`;

// ------------------------------------------------------------------ templates
// Each returns a question object. `id` lets pickQuestions avoid repeats.

const TEMPLATES = [
  // ---------------------------------------------------------------- EASY
  {
    id: 'def-loop', topic: 'loops', difficulty: 'easy',
    make: (rng) => mc({
      rng, topic: 'loops', difficulty: 'easy',
      q: 'What is a loop for?',
      correct: 'Repeating the same steps without dragging them out again and again',
      wrong: ['Making the robot move faster', 'Storing a number for later', 'Stopping the program'],
      why: 'A loop says "do this pattern N times" — one block instead of eight.',
    }),
  },
  {
    id: 'def-sensor', topic: 'sensing', difficulty: 'easy',
    make: (rng) => mc({
      rng, topic: 'sensing', difficulty: 'easy',
      q: 'A sensor lets a robot…',
      correct: 'measure something about the world, like distance to a wall',
      wrong: ['move its wheels', 'store a program', 'increase its battery voltage'],
      why: 'Sensors are input; actuators (motors, LEDs) are output.',
    }),
  },
  {
    id: 'def-actuator', topic: 'actuators', difficulty: 'easy',
    make: (rng) => {
      const thing = pick(rng, [
        { name: 'a motor', kind: 'actuator' },
        { name: 'an LED', kind: 'actuator' },
        { name: 'a distance sensor', kind: 'sensor' },
      ]);
      return mc({
        rng, topic: 'actuators', difficulty: 'easy',
        q: `Is ${thing.name} an input or an output?`,
        correct: thing.kind === 'sensor' ? 'Input — it measures the world' : 'Output — it changes the world',
        wrong: thing.kind === 'sensor'
          ? ['Output — it changes the world', 'Neither — it only stores data']
          : ['Input — it measures the world', 'Neither — it only stores data'],
        why: 'Sensors measure (in). Actuators act (out). Everything a robot does is one or the other.',
      });
    },
  },
  {
    id: 'def-voltage', topic: 'electricity', difficulty: 'easy',
    make: (rng) => mc({
      rng, topic: 'electricity', difficulty: 'easy',
      q: 'In the water analogy, voltage is…',
      correct: 'the push (pressure) behind the flow',
      wrong: ['the amount of water flowing', 'the width of the hose', 'the temperature of the water'],
      why: 'Voltage pushes; current is what gets pushed.',
    }),
  },
  {
    id: 'def-circuit', topic: 'electricity', difficulty: 'easy',
    make: (rng) => mc({
      rng, topic: 'electricity', difficulty: 'easy',
      q: 'What happens if you break a circuit anywhere?',
      correct: 'Everything on that loop stops',
      wrong: ['Only the part after the break stops', 'The current doubles', 'Nothing — electricity finds a way'],
      why: 'No complete loop, no flow. That is exactly what a switch does on purpose.',
    }),
  },
  {
    id: 'def-event', topic: 'events', difficulty: 'easy',
    make: (rng) => mc({
      rng, topic: 'events', difficulty: 'easy',
      q: 'An event block ("when ▶ Run is pressed") means the code below it…',
      correct: 'waits until that thing happens, then runs',
      wrong: ['runs immediately when the page loads', 'runs once per second forever', 'never runs unless you copy it'],
      why: 'Events are how real robots start: a button, a timer, a signal.',
    }),
  },

  // -------------------------------------------------------------- MEDIUM
  {
    id: 'loop-count', topic: 'loops', difficulty: 'medium',
    make: (rng) => {
      const times = int(rng, 3, 8);
      const per = int(rng, 2, 4);
      const total = times * per;
      return mc({
        rng, topic: 'loops', difficulty: 'medium',
        q: `A repeat loop runs ${times} times. Inside it are ${per} "move forward 1 square" blocks. How many squares does the robot travel in total?`,
        correct: `${total}`,
        wrong: distinct(`${total}`, [`${times + per}`, `${times}`, `${per}`, `${total - per}`], 3),
        why: `Each pass moves ${per}, and there are ${times} passes: ${times} × ${per} = ${total}.`,
      });
    },
  },
  {
    id: 'trace-2', topic: 'tracing', difficulty: 'medium',
    make: (rng) => {
      const start = { x: 0, y: 0, dir: 'north' };
      const n1 = int(rng, 1, 4);
      const turn = pick(rng, ['right', 'left']);
      const n2 = int(rng, 1, 4);
      const program = [{ op: 'move', n: n1 }, { op: 'turn', dir: turn }, { op: 'move', n: n2 }];
      const end = traceProgram(start, program);
      const wrongTurn = traceProgram(start, [{ op: 'move', n: n1 }, { op: 'turn', dir: turn === 'right' ? 'left' : 'right' }, { op: 'move', n: n2 }]);
      const swapped = traceProgram(start, [{ op: 'move', n: n2 }, { op: 'turn', dir: turn }, { op: 'move', n: n1 }]);
      return mc({
        rng, topic: 'tracing', difficulty: 'medium',
        q: `The robot starts at (0, 0) facing north. It runs: move ${n1}, turn ${turn}, move ${n2}. Where does it end up?`,
        correct: fmt(end),
        wrong: distinct(fmt(end), [fmt(wrongTurn), fmt(swapped), fmt({ x: end.x, y: end.y, dir: start.dir })], 3),
        why: `Move ${n1} north → (0, ${n1}). Turning ${turn} from north faces ${end.dir}. Then move ${n2} → ${fmt(end)}.`,
      });
    },
  },
  {
    id: 'sensor-threshold', topic: 'sensing', difficulty: 'medium',
    make: (rng) => {
      const stopAt = int(rng, 2, 6);
      const reading = int(rng, 1, 10);
      const stops = reading < stopAt;
      return mc({
        rng, topic: 'sensing', difficulty: 'medium',
        q: `Your program says: repeat "move forward 1" UNTIL distance < ${stopAt} squares. The sensor currently reads ${reading}. Does the robot move on this pass?`,
        correct: stops ? 'No — the until-condition is already true, so the loop stops' : 'Yes — the condition is not met yet, so it keeps going',
        wrong: [
          stops ? 'Yes — the condition is not met yet, so it keeps going' : 'No — the until-condition is already true, so the loop stops',
          'It depends on the battery level',
        ],
        why: `The loop ends when distance < ${stopAt}. Reading ${reading} is ${stops ? 'less than' : 'not less than'} ${stopAt}.`,
      });
    },
  },
  {
    id: 'gear-ratio', topic: 'motors', difficulty: 'medium',
    make: (rng) => {
      const driver = pick(rng, [8, 10, 12]);
      const driven = pick(rng, [24, 30, 36, 40]);
      const ratio = driven / driver;
      const faster = ratio < 1;
      return mc({
        rng, topic: 'motors', difficulty: 'medium',
        q: `A ${driver}-tooth gear drives a ${driven}-tooth gear. Compared with the motor, the output turns…`,
        correct: `${ratio.toFixed(ratio % 1 ? 1 : 0)}× slower, with more torque`,
        wrong: distinct(`${ratio.toFixed(ratio % 1 ? 1 : 0)}× slower, with more torque`, [
          `${ratio.toFixed(ratio % 1 ? 1 : 0)}× faster, with less torque`,
          'at the same speed, with more torque',
          `${(driven - driver)}× slower, with less torque`,
        ], 3),
        why: `Big driven by small = slower and stronger. ${driven} ÷ ${driver} = ${ratio}. Gears trade speed for torque; they never create free power.`,
      });
    },
  },
  {
    id: 'ohm-intuition', topic: 'electricity', difficulty: 'medium',
    make: (rng) => {
      const v = pick(rng, [3, 5, 9, 12]);
      const r = pick(rng, [100, 220, 470, 1000]);
      const mA = Math.round((v / r) * 1000);
      return mc({
        rng, topic: 'electricity', difficulty: 'medium',
        q: `Ohm's law is I = V ÷ R. With a ${v}V supply and a ${r}Ω resistor, roughly how much current flows?`,
        correct: `about ${mA} mA`,
        wrong: distinct(`about ${mA} mA`, [`about ${mA * 2} mA`, `about ${Math.max(1, Math.round(mA / 2))} mA`, `about ${v * r} mA`], 3),
        why: `${v} ÷ ${r} = ${(v / r).toFixed(4)} A ≈ ${mA} mA. More resistance means less current for the same push.`,
      });
    },
  },

  // ---------------------------------------------------------------- HARD
  {
    id: 'trace-loop', topic: 'tracing', difficulty: 'hard',
    make: (rng) => {
      const times = int(rng, 2, 4);
      const n = int(rng, 1, 3);
      const turn = pick(rng, ['right', 'left']);
      const start = { x: 0, y: 0, dir: 'north' };
      const body = [{ op: 'move', n }, { op: 'turn', dir: turn }];
      const program = Array.from({ length: times }, () => body).flat();
      const end = traceProgram(start, program);
      const offByOne = traceProgram(start, Array.from({ length: times - 1 }, () => body).flat());
      const noTurns = traceProgram(start, [{ op: 'move', n: n * times }]);
      return mc({
        rng, topic: 'tracing', difficulty: 'hard',
        q: `Start at (0, 0) facing north. Repeat ${times} times: [ move ${n}, turn ${turn} ]. Where does the robot finish?`,
        correct: fmt(end),
        wrong: distinct(fmt(end), [fmt(offByOne), fmt(noTurns), fmt({ ...end, dir: start.dir })], 3),
        why: `Each pass moves ${n} then rotates 90° ${turn}. After ${times} passes the heading has turned ${times * 90}° — remember the LAST turn still happens, even though nothing moves after it.`,
      });
    },
  },
  {
    id: 'debug-order', topic: 'debugging', difficulty: 'hard',
    make: (rng) => {
      const stopAt = int(rng, 2, 5);
      return mc({
        rng, topic: 'debugging', difficulty: 'hard',
        q: `A robot is meant to stop before a wall, but it always crashes. The program is: repeat forever [ move forward 1 ] and separately, if distance < ${stopAt} then stop. Why does it crash?`,
        correct: 'The check never runs — it sits outside the loop, so it is only evaluated once (or not at all) while the loop drives forever',
        wrong: [
          `The threshold ${stopAt} is too small for any robot`,
          'The distance sensor cannot see walls that are straight ahead',
          'Motors are always faster than sensors, so stopping is impossible',
        ],
        why: 'A condition only protects you if it is checked on every pass. Move the if INSIDE the loop — this is the single most common beginner bug in sensing code.',
      });
    },
  },
  {
    id: 'debug-blink', topic: 'debugging', difficulty: 'hard',
    make: (rng) => {
      const n = int(rng, 3, 6);
      return mc({
        rng, topic: 'debugging', difficulty: 'hard',
        q: `You want the LED to blink ${n} times. Your loop repeats ${n} times and contains only "LED on". The LED lights once and stays lit. What is missing?`,
        correct: 'An "LED off" (and a short wait) inside the loop — a blink is on THEN off',
        wrong: [
          `The loop should repeat ${n * 2} times instead`,
          'The LED needs more voltage to blink',
          'Blinking requires an event block',
        ],
        why: 'Turning something on that is already on changes nothing. A blink is a state CHANGE: on, pause, off, pause.',
      });
    },
  },
  {
    id: 'torque-tradeoff', topic: 'motors', difficulty: 'hard',
    make: (rng) => {
      const ratio = pick(rng, [3, 4, 5]);
      return mc({
        rng, topic: 'motors', difficulty: 'hard',
        q: `You gear a robot down ${ratio}:1 so it can climb a ramp. What happens to its top speed on flat ground, and why?`,
        correct: `It drops to about 1/${ratio} of before — gearing trades speed for torque, it does not add power`,
        wrong: [
          `It stays the same — gearing only affects torque`,
          `It also increases ${ratio}× — stronger means faster`,
          'It becomes unpredictable because torque and speed are unrelated',
        ],
        why: 'Power ≈ torque × speed. Gears move the balance between the two; the motor still supplies the same power.',
      });
    },
  },
  {
    id: 'event-vs-loop', topic: 'events', difficulty: 'hard',
    make: (rng) => mc({
      rng, topic: 'events', difficulty: 'hard',
      q: 'Why do real robots use events rather than one giant loop that checks everything?',
      correct: 'Events let separate things react independently, without one slow check delaying all the others',
      wrong: [
        'Events run faster than loops on every processor',
        'Loops are not supported by microcontrollers',
        'Events use less electricity than loops in all cases',
      ],
      why: 'A single loop couples everything to its slowest step. Events decouple: a bump sensor can react while a navigation routine is still thinking.',
    }),
  },
  {
    id: 'sensor-blindspot', topic: 'sensing', difficulty: 'hard',
    make: (rng) => {
      const d = int(rng, 2, 5);
      return mc({
        rng, topic: 'sensing', difficulty: 'hard',
        q: `Your robot stops correctly at ${d} squares from a flat wall, but drives straight into a wall approached at a sharp angle. What is the most likely reason?`,
        correct: 'A distance sensor measures along one narrow line — an angled surface reflects the signal away instead of back',
        wrong: [
          'Angled walls are further away, so the reading is always larger',
          'The motors turn faster when approaching at an angle',
          'The threshold value changes automatically on turns',
        ],
        why: 'Real sensors have a field of view and depend on reflection. Knowing what a sensor CANNOT see is as important as reading its value.',
      });
    },
  },
];

export const TOPICS = [...new Set(TEMPLATES.map((t) => t.topic))];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export function templateCount(difficulty) {
  return TEMPLATES.filter((t) => t.difficulty === difficulty).length;
}

/**
 * Build a fresh set of questions.
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {number} count
 * @param {number} [seed]  omit for a genuinely new set each attempt
 */
export function pickQuestions(difficulty, count = 5, seed = Date.now() ^ Math.floor(Math.random() * 1e9)) {
  const rng = makeRng(seed);
  const pool = TEMPLATES.filter((t) => t.difficulty === difficulty);
  if (!pool.length) return [];

  // Prefer not to repeat a template within one attempt; only reuse if the
  // learner asked for more questions than there are templates.
  const order = shuffle(rng, pool);
  const chosen = [];
  for (let i = 0; i < count; i++) chosen.push(order[i % order.length]);

  return chosen.map((tpl, i) => ({ id: `${tpl.id}#${i}`, templateId: tpl.id, ...tpl.make(rng) }));
}
