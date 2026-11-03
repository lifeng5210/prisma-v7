import { $ } from 'zx'

import { executeSteps } from '../../_utils/executeSteps'

void executeSteps({
  setup: async () => {
    await $`pnpm install`
    await $`pnpm prisma-kb generate`
    await $`pnpm prisma-kb migrate dev`
  },
  test: async () => {
    await $`pnpm run start`
  },
  finish: async () => {
    await $`echo "done"`
  },
})
