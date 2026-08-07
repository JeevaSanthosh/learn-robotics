// Worker entry for the Workers-with-static-assets deploy path (npx wrangler deploy).
// Reuses the exact same handler that Pages would auto-mount from functions/.
// Static files are served by the assets binding; only /api/* reaches this code
// (see run_worker_first in wrangler.jsonc).
import { onRequestPost } from '../functions/api/chat.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return onRequestPost({ request, env });
    }
    if (url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request); // fallback: serve the static site
  },
};
