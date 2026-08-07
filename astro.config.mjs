import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// Static output — deployable to Cloudflare Pages (recommended) or any static host.
// The /functions directory is picked up automatically by Cloudflare Pages;
// it is ignored by the Astro build itself.
export default defineConfig({
  integrations: [mdx()],
  output: 'static',
  site: 'https://learn-robotics.pages.dev',
  vite: {
    build: {
      // CRITICAL — do not remove.
      // Astro inlines hoisted <script> blocks smaller than this limit straight
      // into the HTML. public/_headers sets `script-src 'self'` with no
      // 'unsafe-inline', so any inlined script is silently blocked by the
      // browser and its component becomes dead (this is what killed the chat
      // widget and the glossary filter). Forcing 0 keeps every script external.
      // scripts/verify.mjs asserts this in CI — see condition C-INLINE.
      assetsInlineLimit: 0,
    },
  },
});
