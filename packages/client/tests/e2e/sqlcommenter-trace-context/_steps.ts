import { $ } from 'zx'

import executeStepsModule from '../_utils/executeSteps'

const { executeSteps } = executeStepsModule

void executeSteps({
  setup: async () => {
    await $`pnpm install`
    await $`pnpm prisma-kb generate`
    await $`pnpm exec prisma-kb db push --force-reset`
  },
  test: async () => {
    await $`pnpm exec prisma-kb -v`
    await $`tsx src/index.ts`
    await $`pnpm exec tsc --noEmit`
  },
  finish: async () => {
    await $`echo "done"`
  },
  // keep: true, // keep docker open to debug it
})
