// A hand-written tokeniser + recursive-descent parser for a MicroPython subset
// (PRD §8.7). This is the bridge from blocks to real code and, from there, to
// the ESP32 — so it is deliberately small, and it accepts EXACTLY the flavour
// the code panel already shows (robot.move_forward(3), time.sleep(1), …).
//
// HARD REQUIREMENT (HC1 / verify C2): NO eval, NO new Function. This is a
// tree-walking interpreter over a plain AST (see pyrun.js), nothing more.
//
// Supported: assignment, arithmetic (+ - * / // %), comparison (< <= > >= == !=),
// boolean (and/or/not), if/elif/else, while, for i in range(...), def with
// positional args + return, function calls, True/False/None, lists with index
// access, comments. Syntax errors report line and column, MicroPython-style,
// because M6.4 teaches reading exactly those messages.

export class PyError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'SyntaxError';
    this.line = line;
    this.col = col;
  }
}

const KEYWORDS = new Set([
  'if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'pass',
  'True', 'False', 'None', 'and', 'or', 'not',
]);

// ------------------------------------------------------------------ tokeniser
// Python is indentation-sensitive, so the tokeniser tracks an indent stack and
// emits INDENT / DEDENT / NEWLINE tokens the parser can lean on.
export function tokenize(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const tokens = [];
  const indents = [0];
  let depth = 0; // bracket depth — newlines inside (...)/[...] are ignored

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    let i = 0;

    if (depth === 0) {
      // measure indentation (spaces/tabs), skip blank and comment-only lines
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
      const rest = line.slice(i);
      if (rest === '' || rest.startsWith('#')) continue;
      const indent = i;
      if (indent > indents[indents.length - 1]) {
        indents.push(indent);
        tokens.push({ type: 'INDENT', value: '', line: ln + 1, col: 1 });
      } else {
        while (indent < indents[indents.length - 1]) {
          indents.pop();
          tokens.push({ type: 'DEDENT', value: '', line: ln + 1, col: 1 });
        }
        if (indent !== indents[indents.length - 1])
          throw new PyError('inconsistent indentation', ln + 1, i + 1);
      }
    }

    while (i < line.length) {
      const ch = line[i];
      const col = i + 1;
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (ch === '#') break; // comment to end of line
      // numbers
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(line[i + 1] || ''))) {
        let j = i + 1;
        while (j < line.length && /[0-9.]/.test(line[j])) j++;
        const raw = line.slice(i, j);
        if ((raw.match(/\./g) || []).length > 1) throw new PyError('malformed number', ln + 1, col);
        tokens.push({ type: 'NUMBER', value: Number(raw), line: ln + 1, col });
        i = j; continue;
      }
      // strings
      if (ch === '"' || ch === "'") {
        let j = i + 1, str = '';
        while (j < line.length && line[j] !== ch) {
          if (line[j] === '\\' && j + 1 < line.length) { str += unescape(line[j + 1]); j += 2; }
          else { str += line[j]; j++; }
        }
        if (j >= line.length) throw new PyError('unterminated string', ln + 1, col);
        tokens.push({ type: 'STRING', value: str, line: ln + 1, col });
        i = j + 1; continue;
      }
      // names / keywords
      if (/[A-Za-z_]/.test(ch)) {
        let j = i + 1;
        while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
        const name = line.slice(i, j);
        tokens.push({ type: KEYWORDS.has(name) ? 'KEYWORD' : 'NAME', value: name, line: ln + 1, col });
        i = j; continue;
      }
      // brackets (track depth for implicit line joins)
      if (ch === '(' || ch === '[') { depth++; tokens.push({ type: 'OP', value: ch, line: ln + 1, col }); i++; continue; }
      if (ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); tokens.push({ type: 'OP', value: ch, line: ln + 1, col }); i++; continue; }
      // multi-char operators
      const two = line.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '//'].includes(two)) { tokens.push({ type: 'OP', value: two, line: ln + 1, col }); i += 2; continue; }
      if ('+-*/%<>=:,.'.includes(ch)) { tokens.push({ type: 'OP', value: ch, line: ln + 1, col }); i++; continue; }
      throw new PyError(`unexpected character '${ch}'`, ln + 1, col);
    }

    if (depth === 0) tokens.push({ type: 'NEWLINE', value: '', line: ln + 1, col: line.length + 1 });
  }

  while (indents.length > 1) { indents.pop(); tokens.push({ type: 'DEDENT', value: '', line: lines.length, col: 1 }); }
  tokens.push({ type: 'EOF', value: '', line: lines.length + 1, col: 1 });
  return tokens;
}

function unescape(c) {
  return { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' }[c] ?? c;
}

// ------------------------------------------------------------------ parser
export function parse(src) {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = (k = 0) => tokens[pos + k];
  const at = (type, value) => peek().type === type && (value === undefined || peek().value === value);
  const next = () => tokens[pos++];
  const eat = (type, value) => {
    if (!at(type, value)) {
      const t = peek();
      throw new PyError(`expected ${value ?? type}, got '${t.value || t.type}'`, t.line, t.col);
    }
    return next();
  };
  const skipNewlines = () => { while (at('NEWLINE')) next(); };

  function parseProgram() {
    const body = [];
    skipNewlines();
    while (!at('EOF')) { body.push(parseStatement()); skipNewlines(); }
    return { type: 'program', body };
  }

  function parseBlock() {
    eat('OP', ':');
    eat('NEWLINE');
    eat('INDENT');
    const body = [];
    skipNewlines();
    while (!at('DEDENT') && !at('EOF')) { body.push(parseStatement()); skipNewlines(); }
    if (at('DEDENT')) next();
    return body;
  }

  function parseStatement() {
    // `import time` / `from microbit import *` — tolerated and ignored, so code
    // copied straight from the panel (which starts with an import) still runs.
    if (at('NAME', 'import') || at('NAME', 'from')) {
      const t = next();
      while (!at('NEWLINE') && !at('EOF')) next();
      if (at('NEWLINE')) next();
      return { type: 'pass', line: t.line };
    }
    if (at('KEYWORD', 'if')) return parseIf();
    if (at('KEYWORD', 'while')) return parseWhile();
    if (at('KEYWORD', 'for')) return parseFor();
    if (at('KEYWORD', 'def')) return parseDef();
    if (at('KEYWORD', 'return')) return parseReturn();
    if (at('KEYWORD', 'pass')) { const t = next(); eat('NEWLINE'); return { type: 'pass', line: t.line }; }
    return parseSimple();
  }

  function parseIf() {
    const t = eat('KEYWORD', 'if');
    const tests = [{ cond: parseExpr(), body: parseBlock() }];
    while (at('KEYWORD', 'elif')) { next(); tests.push({ cond: parseExpr(), body: parseBlock() }); }
    let orelse = null;
    if (at('KEYWORD', 'else')) { next(); orelse = parseBlock(); }
    return { type: 'if', tests, orelse, line: t.line };
  }

  function parseWhile() {
    const t = eat('KEYWORD', 'while');
    const cond = parseExpr();
    return { type: 'while', cond, body: parseBlock(), line: t.line };
  }

  function parseFor() {
    const t = eat('KEYWORD', 'for');
    const varName = eat('NAME').value;
    eat('KEYWORD', 'in');
    // only `range(...)` is supported as the iterable in this subset
    const fn = eat('NAME');
    if (fn.value !== 'range') throw new PyError("for-loops must iterate over range(...)", fn.line, fn.col);
    eat('OP', '(');
    const args = [parseExpr()];
    while (at('OP', ',')) { next(); args.push(parseExpr()); }
    eat('OP', ')');
    return { type: 'for', var: varName, range: args, body: parseBlock(), line: t.line };
  }

  function parseDef() {
    const t = eat('KEYWORD', 'def');
    const name = eat('NAME').value;
    eat('OP', '(');
    const params = [];
    if (!at('OP', ')')) {
      params.push(eat('NAME').value);
      while (at('OP', ',')) { next(); params.push(eat('NAME').value); }
    }
    eat('OP', ')');
    return { type: 'def', name, params, body: parseBlock(), line: t.line };
  }

  function parseReturn() {
    const t = eat('KEYWORD', 'return');
    const value = at('NEWLINE') ? null : parseExpr();
    eat('NEWLINE');
    return { type: 'return', value, line: t.line };
  }

  // assignment or bare expression statement
  function parseSimple() {
    const target = parseExpr();
    if (at('OP', '=')) {
      const eq = next();
      const value = parseExpr();
      eat('NEWLINE');
      if (target.type !== 'name' && target.type !== 'index')
        throw new PyError('cannot assign to this', eq.line, eq.col);
      return { type: 'assign', target, value, line: eq.line };
    }
    eat('NEWLINE');
    return { type: 'exprstmt', expr: target, line: target.line };
  }

  // --- expressions (precedence climbing) ---
  function parseExpr() { return parseOr(); }
  function parseOr() { let l = parseAnd(); while (at('KEYWORD', 'or')) { const t = next(); l = { type: 'logic', op: 'or', left: l, right: parseAnd(), line: t.line }; } return l; }
  function parseAnd() { let l = parseNot(); while (at('KEYWORD', 'and')) { const t = next(); l = { type: 'logic', op: 'and', left: l, right: parseNot(), line: t.line }; } return l; }
  function parseNot() { if (at('KEYWORD', 'not')) { const t = next(); return { type: 'not', operand: parseNot(), line: t.line }; } return parseCompare(); }
  function parseCompare() {
    let l = parseAdd();
    while (at('OP') && ['<', '<=', '>', '>=', '==', '!='].includes(peek().value)) {
      const op = next(); l = { type: 'compare', op: op.value, left: l, right: parseAdd(), line: op.line };
    }
    return l;
  }
  function parseAdd() {
    let l = parseMul();
    while (at('OP') && ['+', '-'].includes(peek().value)) { const op = next(); l = { type: 'binop', op: op.value, left: l, right: parseMul(), line: op.line }; }
    return l;
  }
  function parseMul() {
    let l = parseUnary();
    while (at('OP') && ['*', '/', '//', '%'].includes(peek().value)) { const op = next(); l = { type: 'binop', op: op.value, left: l, right: parseUnary(), line: op.line }; }
    return l;
  }
  function parseUnary() {
    if (at('OP', '-')) { const t = next(); return { type: 'neg', operand: parseUnary(), line: t.line }; }
    if (at('OP', '+')) { next(); return parseUnary(); }
    return parsePostfix();
  }
  // attribute access, calls, indexing
  function parsePostfix() {
    let node = parseAtom();
    for (;;) {
      if (at('OP', '.')) { next(); const nm = eat('NAME'); node = { type: 'attr', obj: node, name: nm.value, line: nm.line }; }
      else if (at('OP', '(')) {
        const p = next(); const args = [];
        if (!at('OP', ')')) { args.push(parseExpr()); while (at('OP', ',')) { next(); args.push(parseExpr()); } }
        eat('OP', ')');
        node = { type: 'call', func: node, args, line: p.line };
      } else if (at('OP', '[')) {
        next(); const idx = parseExpr(); eat('OP', ']');
        node = { type: 'index', obj: node, index: idx, line: node.line };
      } else break;
    }
    return node;
  }
  function parseAtom() {
    const t = peek();
    if (at('NUMBER')) { next(); return { type: 'num', value: t.value, line: t.line }; }
    if (at('STRING')) { next(); return { type: 'str', value: t.value, line: t.line }; }
    if (at('KEYWORD', 'True')) { next(); return { type: 'bool', value: true, line: t.line }; }
    if (at('KEYWORD', 'False')) { next(); return { type: 'bool', value: false, line: t.line }; }
    if (at('KEYWORD', 'None')) { next(); return { type: 'none', line: t.line }; }
    if (at('NAME')) { next(); return { type: 'name', name: t.value, line: t.line }; }
    if (at('OP', '(')) { next(); const e = parseExpr(); eat('OP', ')'); return e; }
    if (at('OP', '[')) {
      next(); const items = [];
      if (!at('OP', ']')) { items.push(parseExpr()); while (at('OP', ',')) { next(); items.push(parseExpr()); } }
      eat('OP', ']');
      return { type: 'list', items, line: t.line };
    }
    throw new PyError(`unexpected '${t.value || t.type}'`, t.line, t.col);
  }

  const program = parseProgram();
  return program;
}
