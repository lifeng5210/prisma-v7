import { defineMatrix } from '../_utils/defineMatrix'
import { Providers } from '../_utils/providers'

export default defineMatrix(() => [
  [
    {
      provider: Providers.POSTGRESQL,
    },

    {
      provider: Providers.SQLSERVER,
    },
    {
      provider: Providers.KINGBASE_ORACLE,
    },
  ],
  [
    {
      mapTable: 'IDENTICAL_NAMES',
    },
    {
      mapTable: 'DIFFERENT_NAMES',
    },
    {
      mapTable: false,
    },
  ],
])
