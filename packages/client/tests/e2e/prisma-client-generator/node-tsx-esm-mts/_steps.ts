import { $ } from 'zx'

import { executeSteps } from '../../_utils/executeSteps'

void executeSteps({
  setup: async () => {
    await $`pnpm install`
    await $`pnpm prisma-kb db push --force-reset`
    await $`pnpm prisma-kb generate`
  },
  test: async () => {
    await $`pnpm exec prisma-kb -v`
    await $`tsx src/test.mts`
    await $`pnpm tsc --noEmit`
  },
  finish: async () => {
    await $`echo "done"`
  },
  // keep: true, // keep docker open to debug it
})
