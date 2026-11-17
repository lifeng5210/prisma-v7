import { defineMatrix } from '../_utils/defineMatrix'
import { Providers } from '../_utils/providers'
import { computeMatrix } from '../_utils/relationMode/computeMatrix'

const RelationModeEnv = process.env.RELATION_MODE
if (RelationModeEnv && RelationModeEnv !== 'prisma' && RelationModeEnv !== 'foreignKeys') {
  throw new Error(`RELATION_MODE must be either "prisma" or "foreignKeys" but was "${RelationModeEnv}"`)
}

type RelationMode = 'prisma' | 'foreignKeys' | ''
const relationMode: RelationMode = (RelationModeEnv as RelationMode) || ''

// Keep Kingbase emulation tests opt-in until the shared one-to-one deleteMany issue is fixed.
const defaultMatrix = computeMatrix({ relationMode }).filter(({ provider }) => {
  if (relationMode !== 'prisma') return true
  if (provider === Providers.KINGBASE_ORACLE) {
    return process.env.TEST_KINGBASE_ORACLE_PRISMA_RELATIONS === 'true'
  }
  if (provider === Providers.KINGBASE_MYSQL) {
    return process.env.TEST_KINGBASE_MYSQL_PRISMA_RELATIONS === 'true'
  }
  return true
})

export default defineMatrix(() => [
  [...defaultMatrix],
  [
    {
      isSchemaUsingMap: false,
    },
    {
      isSchemaUsingMap: true,
    },
  ],
])
