import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const modules = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/modules' }),
  schema: z.object({
    title: z.string(),
    module: z.number(), // 1, 2, 3...
    moduleTitle: z.string(),
    order: z.number(), // lesson order inside the module
    duration: z.number(), // minutes, keep 10-20
    checkpoint: z.boolean().default(false), // counts toward the confidence gate
    summary: z.string(),
    rigor: z.number().min(1).max(5).optional(),          // R1-R5 rigor level (§6)
    kind: z.enum(['concept', 'lab', 'challenge', 'quiz']).optional(),
    teaches: z.array(z.string()).default([]),            // skill ids taught (see skills.json)
    requires: z.array(z.string()).default([]),           // skill ids assumed as prerequisites
  }),
});

export const collections = { modules };
