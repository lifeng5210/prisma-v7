import { $, cd } from 'zx'

import { executeSteps } from '../../_utils/executeSteps'
import { testServerComponents } from '../_shared/test'

void executeSteps({
  setup: async () => {
    await $`pnpm install`
    await $`pnpm exec prisma-kb db push --force-reset`
    await $`pnpm prisma-kb generate`
    cd('packages/service')
  },
  test: async () => {
    await testServerComponents()
  },
  finish: async () => {},
})
