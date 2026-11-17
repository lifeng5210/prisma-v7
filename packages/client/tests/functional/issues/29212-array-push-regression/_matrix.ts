import { defineMatrix } from '../../_utils/defineMatrix'
import { allProviders, Providers } from '../../_utils/providers'

export default defineMatrix(() => [
  allProviders.filter(
    ({ provider }) =>
      provider !== Providers.MYSQL &&
      provider !== Providers.KINGBASE_MYSQL &&
      provider !== Providers.KINGBASE_ORACLE &&
      provider !== Providers.SQLITE &&
      provider !== Providers.SQLSERVER,
  ),
])
