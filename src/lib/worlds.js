// Browser-side world registry. RobotLab references a world by id (data-world);
// this bundles every src/content/worlds/*.json at build time into a lookup so a
// lesson can grade against a seeded world without inlining arena JSON in MDX.
// (verify.mjs reads the same files from disk for C-WORLDS.)
const modules = import.meta.glob('../content/worlds/*.json', { eager: true });

const WORLDS = {};
for (const mod of Object.values(modules)) {
  const w = mod.default || mod;
  if (w && w.id) WORLDS[w.id] = w;
}

export function getWorld(id) {
  return WORLDS[id] || null;
}

export function allWorlds() {
  return { ...WORLDS };
}
