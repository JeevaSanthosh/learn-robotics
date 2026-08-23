// Two drivers over one core (PRD §8.1). Both expose the same imperative,
// awaitable API the interpreter calls (moveForward/turn/setLed/setPen/wait/
// setSpeed/readDistance/readLine + a `stopped` flag), so the same learner
// program runs identically whether it is being watched or graded.
//
//  - animated: paced by the caller's onTick (which renders + waits a frame),
//    so the learner sees each sub-step.
//  - headless: drains every generator as fast as the CPU allows — no DOM, no
//    time — which is what makes 10-seed grading finish in milliseconds
//    (C-SIM-PERF) and run in a Web Worker.

function driverBase(core) {
  return {
    core,
    get stopped() { return core.stopped; },
    setSpeed: (v) => core.setSpeed(v),
    readDistance: () => core.readDistance(),
    readLine: () => core.readLine(),
    stop: () => core.stop(),
    reset: () => core.reset(),
  };
}

/**
 * @param {SimCore} core
 * @param {(core:SimCore)=>Promise<void>} onTick  called once per sub-step
 */
export function animatedDriver(core, onTick) {
  const drain = async (gen) => { for (const _ of gen) await onTick(core); };
  return {
    ...driverBase(core),
    moveForward: (u) => drain(core.moveGen(u)),
    turn: (d) => drain(core.turnGen(d)),
    setPen: (down) => drain(core.penGen(down)),
    setLed: (on) => drain(core.ledGen(on)),
    wait: (s) => drain(core.waitGen(s)),
  };
}

export function headlessDriver(core) {
  const drain = (gen) => { for (const _ of gen) { /* advance as fast as possible */ } };
  return {
    ...driverBase(core),
    moveForward: (u) => { drain(core.moveGen(u)); return Promise.resolve(); },
    turn: (d) => { drain(core.turnGen(d)); return Promise.resolve(); },
    setPen: (down) => { drain(core.penGen(down)); return Promise.resolve(); },
    setLed: (on) => { drain(core.ledGen(on)); return Promise.resolve(); },
    wait: (s) => { drain(core.waitGen(s)); return Promise.resolve(); },
  };
}
