// Worker entry for the Workers-with-static-assets deploy path (npx wrangler deploy).
// Reuses the exact same handler that Pages would auto-mount from functions/.
// Static files are served by the assets binding; only /api/* reaches this code
// (see run_worker_first in wrangler.jsonc).
import { onRequestPost } from '../functions/api/chat.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      // rate limit per client IP before doing any AI work
      if (env.CHAT_LIMITER) {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const { success } = await env.CHAT_LIMITER.limit({ key: ip });
        if (!success) {
          return new Response(
            JSON.stringify({ error: 'Whoa, lots of questions! Give me a minute to catch up.' }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
          );
        }
      }
      return onRequestPost({ request, env });
    }
    if (url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request); // fallback: serve the static site
  },
};