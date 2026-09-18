import { $ } from 'zx'

import { executeSteps } from '../_utils/executeSteps'

void executeSteps({
  setup: async () => {
    await $`pnpm install`
    await $`pnpm prisma-kb version`
    await $`pnpm prisma-kb generate`
    await $`pnpm prisma-kb db push --force-reset`
  },
  test: async () => {
    // Skipped until MongoDB support is added to Prisma 7
    // await $`pnpm jest`
  },
  finish: async () => {
    await $`echo "done"`
  },
  // keep: true, // keep docker open to debug it
})
