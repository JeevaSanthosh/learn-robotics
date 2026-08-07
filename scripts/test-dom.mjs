// Real-DOM integration tests. Loads the BUILT pages into jsdom, applies the
// BUILT stylesheets, runs the BUILT component bundles, and drives them the way
// a person would (click, type, Escape). This is the layer that catches bugs
// invisible to source review — notably CSS beating the `hidden` attribute on
// specificity, which is how the chat panel's close button died.
import { JSDOM } from 'jsdom';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const pass = [], fail = [];
const t = (name, cond, extra = '') =>
  (cond ? pass : fail).push(`  ${cond ? 'PASS' : 'FAIL'} ${name}${cond || !extra ? '' : ` — ${extra}`}`);

/** Build a jsdom window for a built page, with real CSS inlined and bundles run. */
async function loadPage(rel, bundles) {
  let html = await readFile(path.join(DIST, rel), 'utf8');

  // jsdom won't fetch <link rel=stylesheet>, so inline the real built CSS.
  const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  let css = '';
  for (const h of hrefs) css += await readFile(path.join(DIST, h.replace(/^\//, '')), 'utf8');
  // IMPORTANT: jsdom does NOT model the user-agent stylesheet origin, so it
  // reports display:none for `<div class="x" hidden>` even when `.x{display:flex}`
  // would beat it in a real browser. That makes jsdom blind to exactly the bug
  // that broke the close button, so DO NOT rely on these tests for that class of
  // problem — condition C-HIDDEN in verify.mjs is the real detector.
  // We prepend nothing here; global.css now carries [hidden]{display:none!important},
  // which jsdom honours correctly, so a regression that REMOVED that rule would
  // still be caught by C-HIDDEN.
  html = html.replace('</head>', `<style>${css}</style></head>`);

  const dom = new JSDOM(html, { url: 'https://learn-robotics.pages.dev/', pretendToBeVisual: true });
  const { window } = dom;

  for (const g of ['window', 'document', 'location', 'history', 'CustomEvent', 'Event', 'Node', 'getComputedStyle', 'localStorage']) {
    try { globalThis[g] = g === 'window' ? window : window[g]; }
    catch { Object.defineProperty(globalThis, g, { value: window[g], configurable: true }); }
  }
  // node 22 exposes navigator as a getter-only global
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  window.ResizeObserver = globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  window.scrollTo = () => {};

  for (const b of bundles) await import(pathToFileURL(path.join(DIST, '_astro', b)).href + `?v=${Math.random()}`);
  return window;
}

const files = await readdir(path.join(DIST, '_astro'));
const bundle = (name) => files.find((f) => f.startsWith(name + '.astro_astro_type_script'));
const shown = (win, el) => win.getComputedStyle(el).display !== 'none';

// ------------------------------------------------------------------ chat
{
  const win = await loadPage('index.html', [bundle('ChatWidget')]);
  const doc = win.document;
  const openBtn = doc.querySelector('.chat-open');
  const closeBtn = doc.querySelector('.chat-close');
  const panel = doc.querySelector('.chat-panel');
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  t('D1 panel starts closed', !shown(win, panel), `computed display: ${win.getComputedStyle(panel).display}`);

  click(openBtn);
  t('D2 launcher opens the panel', shown(win, panel));
  t('D3 aria-expanded tracks open', openBtn.getAttribute('aria-expanded') === 'true');

  click(closeBtn);
  t('D4 close button actually closes the panel', !shown(win, panel),
    `still display: ${win.getComputedStyle(panel).display}`);
  t('D5 aria-expanded resets on close', openBtn.getAttribute('aria-expanded') === 'false');

  click(openBtn);
  panel.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  t('D6 Escape closes the panel', !shown(win, panel));

  click(openBtn);
  click(openBtn);
  t('D7 launcher toggles closed again', !shown(win, panel));
}

// --------------------------------------------------------------- glossary
{
  const win = await loadPage('glossary/index.html', [bundle('glossary')]);
  const doc = win.document;
  const filter = doc.getElementById('filter');
  const entries = [...doc.querySelectorAll('#gloss .entry')];
  t('D8 glossary has entries', entries.length > 0);
  filter.value = 'zzzznotaterm';
  filter.dispatchEvent(new win.Event('input', { bubbles: true }));
  t('D9 filter hides non-matches', entries.every((e) => !shown(win, e)));
  filter.value = '';
  filter.dispatchEvent(new win.Event('input', { bubbles: true }));
  t('D10 clearing the filter restores all entries', entries.every((e) => shown(win, e)));
}

// -------------------------------------------------------------- mark done
{
  const win = await loadPage('modules/m1-meet/index.html', [bundle('MarkDone')]);
  const doc = win.document;
  const btn = doc.querySelector('.done-btn');
  const msg = doc.querySelector('.done-msg');
  if (!btn) t('D14 lesson has a MarkDone button', false);
  else {
    t('D14 confirmation starts hidden', !shown(win, msg));
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    t('D15 clicking shows the confirmation', shown(win, msg));
    // `.btn { display: inline-block }` used to defeat `btn.hidden = true`
    t('D16 the button hides itself after use', !shown(win, btn),
      `computed display: ${win.getComputedStyle(btn).display}`);
  }
}

// ------------------------------------------------------------------ term
{
  const win = await loadPage('modules/m1-meet/index.html', [bundle('Term')]);
  const doc = win.document;
  const term = doc.querySelector('.term');
  if (!term) { t('D11 lesson page has a glossary term', false); }
  else {
    const pop = term.querySelector('.term-pop');
    t('D11 tooltip starts hidden', !shown(win, pop));

    // Real pointer sequence: focus fires BEFORE click. The old code toggled on
    // current visibility, so focus opened it and click closed it again —
    // tapping a term on a phone appeared to do nothing.
    term.dispatchEvent(new win.FocusEvent('focus'));
    term.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    t('D12 tap (focus-then-click) leaves the tooltip OPEN', shown(win, pop));

    term.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    t('D13 a second tap closes it', !shown(win, pop));

    term.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    t('D17 Escape dismisses the tooltip', !shown(win, pop));

    // hover must not dismiss a tooltip the user deliberately pinned
    term.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    term.dispatchEvent(new win.MouseEvent('mouseleave', { bubbles: true }));
    t('D18 hovering away keeps a pinned tooltip open', shown(win, pop));
  }
}

console.log(pass.join('\n'));
if (fail.length) { console.log('\n' + fail.join('\n')); console.log(`\n✗ ${fail.length} DOM test(s) failing.`); process.exit(1); }
console.log(`\n✓ ${pass.length} DOM integration tests pass`);
