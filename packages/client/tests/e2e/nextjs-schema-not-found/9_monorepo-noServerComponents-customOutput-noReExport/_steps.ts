import { $, cd } from 'zx'

import { executeSteps } from '../../_utils/executeSteps'
import { testNonServerComponents } from '../_shared/test'

void executeSteps({
  setup: async () => {
    await $`pnpm install`
    cd('packages/service')
    await $`pnpm prisma-kb generate`
    await $`pnpm exec prisma-kb db push --force-reset`
  },
  test: async () => {
    await testNonServerComponents()
  },
  finish: async () => {},
})
