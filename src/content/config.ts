import { defineCollection, z } from 'astro:content';

const modules = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    module: z.number(), // 1, 2, 3...
    moduleTitle: z.string(),
    order: z.number(), // lesson order inside the module
    duration: z.number(), // minutes, keep 10-20
    checkpoint: z.boolean().default(false), // counts toward the confidence gate
    summary: z.string(),
  }),
});

export const collections = { modules };
