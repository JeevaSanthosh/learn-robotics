// Custom robot blocks + two DISPLAY generators from the SAME blocks:
//  - JavaScript & Python text for the "real code" bridge panel.
// Execution happens in interpreter.js (no eval — see verify.mjs C2).
//
// TOOLBOXES are leveled: each lesson exposes only concepts already taught
// (doc requirement: one new idea at a time, never overwhelm).

import * as Blockly from 'blockly';
import { javascriptGenerator, Order as JsOrder } from 'blockly/javascript';
import { pythonGenerator, Order as PyOrder } from 'blockly/python';

export function defineRobotBlocks() {
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'robot_start',
      message0: 'when ▶ Run is pressed',
      nextStatement: null,
      colour: 20,
      hat: 'cap',
      tooltip: 'An event: this stack runs when you press Run. Real robots start the same way — a button, a timer, a signal.',
    },
    {
      type: 'robot_move',
      message0: 'move forward %1 squares',
      args0: [{ type: 'field_number', name: 'DIST', value: 1, min: 1, max: 10 }],
      previousStatement: null,
      nextStatement: null,
      colour: 210,
      tooltip: 'Drive the robot forward. One square = one grid cell.',
    },
    {
      type: 'robot_turn',
      message0: 'turn %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'DIR',
          options: [
            ['left ↺', 'LEFT'],
            ['right ↻', 'RIGHT'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 210,
      tooltip: 'Rotate 90 degrees in place.',
    },
    {
      type: 'robot_set_speed',
      message0: 'set speed to %1',
      args0: [{ type: 'input_value', name: 'SPEED', check: 'Number' }],
      previousStatement: null,
      nextStatement: null,
      colour: 210,
      tooltip: 'How fast the wheels spin: 1 = careful, 3 = zoomy. Like gears: more speed, less control.',
    },
    {
      type: 'robot_led',
      message0: 'turn LED %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'STATE',
          options: [
            ['on 💡', 'ON'],
            ['off', 'OFF'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 40,
      tooltip: 'The little light on the robot.',
    },
    {
      type: 'robot_wait',
      message0: 'wait %1 seconds',
      args0: [{ type: 'field_number', name: 'SECS', value: 1, min: 0.1, max: 10 }],
      previousStatement: null,
      nextStatement: null,
      colour: 40,
      tooltip: 'Pause before the next block runs.',
    },
    {
      type: 'robot_distance',
      message0: 'distance to wall',
      output: 'Number',
      colour: 120,
      tooltip: 'How many squares until the robot would hit something ahead.',
    },
  ]);

  // --- display generators: JavaScript --------------------------------------
  javascriptGenerator.forBlock['robot_start'] = () => '// when Run is pressed:\n';
  javascriptGenerator.forBlock['robot_move'] = (b) =>
    `await robot.moveForward(${b.getFieldValue('DIST')});\n`;
  javascriptGenerator.forBlock['robot_turn'] = (b) =>
    `await robot.turn(${b.getFieldValue('DIR') === 'LEFT' ? -90 : 90});\n`;
  javascriptGenerator.forBlock['robot_set_speed'] = (b) => {
    const v = javascriptGenerator.valueToCode(b, 'SPEED', JsOrder.NONE) || '1';
    return `robot.setSpeed(${v});\n`;
  };
  javascriptGenerator.forBlock['robot_led'] = (b) =>
    `await robot.setLed(${b.getFieldValue('STATE') === 'ON'});\n`;
  javascriptGenerator.forBlock['robot_wait'] = (b) =>
    `await robot.wait(${b.getFieldValue('SECS')});\n`;
  javascriptGenerator.forBlock['robot_distance'] = () => ['robot.readDistance()', JsOrder.FUNCTION_CALL];

  // --- display generators: Python (MicroPython flavour) ---------------------
  pythonGenerator.forBlock['robot_start'] = () => '# when Run is pressed:\n';
  pythonGenerator.forBlock['robot_move'] = (b) =>
    `robot.move_forward(${b.getFieldValue('DIST')})\n`;
  pythonGenerator.forBlock['robot_turn'] = (b) =>
    `robot.turn_${b.getFieldValue('DIR') === 'LEFT' ? 'left' : 'right'}()\n`;
  pythonGenerator.forBlock['robot_set_speed'] = (b) => {
    const v = pythonGenerator.valueToCode(b, 'SPEED', PyOrder.NONE) || '1';
    return `robot.set_speed(${v})\n`;
  };
  pythonGenerator.forBlock['robot_led'] = (b) =>
    `robot.led_${b.getFieldValue('STATE') === 'ON' ? 'on' : 'off'}()\n`;
  pythonGenerator.forBlock['robot_wait'] = (b) =>
    `time.sleep(${b.getFieldValue('SECS')})\n`;
  pythonGenerator.forBlock['robot_distance'] = () => ['robot.read_distance()', PyOrder.FUNCTION_CALL];
}

// --- Leveled toolboxes ------------------------------------------------------
const B = (type, extra = {}) => ({ kind: 'block', type, ...extra });
const REPEAT = B('controls_repeat_ext', {
  inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 3 } } } },
});
const NUM = B('math_number', { fields: { NUM: 2 } });
const VAR_SET = B('variables_set', {
  fields: { VAR: { name: 'count' } },
  inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
});
const VAR_GET = B('variables_get', { fields: { VAR: { name: 'count' } } });

const LEVELS = {
  // m1: motion + light only. Loops appear as a teased extra in m1-blink prose.
  basic: [B('robot_move'), B('robot_turn'), B('robot_led'), B('robot_wait'), REPEAT],
  // m2: loops front and center
  loops: [REPEAT, B('robot_move'), B('robot_turn'), B('robot_led'), B('robot_wait')],
  // m3: sensing + decisions
  sensing: [
    B('robot_distance'),
    B('controls_if'),
    B('controls_whileUntil'),
    B('logic_compare'),
    NUM,
    REPEAT,
    B('robot_move'),
    B('robot_turn'),
    B('robot_led'),
    B('robot_wait'),
  ],
  // m4: variables + speed
  variables: [
    VAR_SET,
    VAR_GET,
    B('math_change', { inputs: { DELTA: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } }),
    B('robot_set_speed', { inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 2 } } } } }),
    B('math_arithmetic'),
    NUM,
    REPEAT,
    B('robot_move'),
    B('robot_turn'),
  ],
  // m5: everything, plus the event hat
  all: [
    B('robot_start'),
    B('robot_move'),
    B('robot_turn'),
    B('robot_set_speed', { inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 2 } } } } }),
    B('robot_led'),
    B('robot_wait'),
    B('robot_distance'),
    REPEAT,
    B('controls_whileUntil'),
    B('controls_if'),
    B('logic_compare'),
    B('logic_negate'),
    NUM,
    VAR_SET,
    VAR_GET,
  ],
};

export function toolboxFor(level = 'basic') {
  return { kind: 'flyoutToolbox', contents: LEVELS[level] ?? LEVELS.all };
}

export { Blockly, javascriptGenerator, pythonGenerator };
