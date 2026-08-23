// Reference solvers for seeded missions (PRD §16 C-SEEDS, C-NOSHORTCUT).
//
// Each seeded mission ships two fixture programs, expressed as plain driver
// functions so they run headless in Node (no Blockly):
//   good — a real, sensor-driven strategy. It MUST pass >= mustPass seeds, which
//          proves the mission is actually solvable (C-SEEDS).
//   hard — a hard-coded straight-line drive with no sensing. It MUST FAIL, which
//          proves the mission cannot be brute-forced the way a single fixed
//          arena can (C-NOSHORTCUT). This is the machine-checkable version of
//          "the bar rises": a memorised path stops counting.
//
// Pure and DOM-free — imported by verify.mjs and scripts/test-references.mjs.

export const SEED_MISSIONS = [
  {
    id: 'm3-dont-crash',
    worldId: 'm3-dont-crash',
    goal: 'survive:5',
    seeds: [1000, 1001, 1002, 1003, 1004, 1005],
    mustPass: 5,
    // Creep forward one square at a time; stop once the wall is close. Works
    // whatever distance the wall is placed at, because it senses instead of
    // counting.
    good: async (r) => {
      for (let i = 0; i < 40; i++) {
        if (r.readDistance() < 1.5) break;
        await r.moveForward(1);
      }
    },
    // Drive a fixed five squares, no sensing. Crashes on every seed where the
    // wall is closer than five squares — which, with the jitter, is most of them.
    hard: async (r) => {
      for (let i = 0; i < 5; i++) await r.moveForward(1);
    },
  },
];
