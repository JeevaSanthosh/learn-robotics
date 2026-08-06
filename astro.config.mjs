import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// Static output — deployable to Cloudflare Pages (recommended) or any static host.
// The /functions directory is picked up automatically by Cloudflare Pages;
// it is ignored by the Astro build itself.
export default defineConfig({
  integrations: [mdx()],
  output: 'static',
  site: 'https://learn-robotics.pages.dev',
});
