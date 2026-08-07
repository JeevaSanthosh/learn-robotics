// Runs render-blocking from <head> so the theme is set before first paint
// (no white flash on a dark-mode device). Deliberately a plain external file
// in /public rather than an Astro <script>: Astro emits those as deferred
// modules, and our CSP (script-src 'self') forbids the usual inline snippet.
(function () {
  try {
    var saved = localStorage.getItem('lr-theme');
    var dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
