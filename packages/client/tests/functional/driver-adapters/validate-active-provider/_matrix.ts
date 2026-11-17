import { defineMatrix } from '../../_utils/defineMatrix'
import { Providers } from '../../_utils/providers'

export default defineMatrix(() => [
  [
    { driverAdapter: 'js_kb_mysql', provider: Providers.KINGBASE_MYSQL },
    { driverAdapter: 'js_kb_oracle', provider: Providers.KINGBASE_ORACLE },
    {
      driverAdapter: 'js_pg',
      provider: Providers.MYSQL,
    },
    {
      driverAdapter: 'js_planetscale',
      provider: Providers.SQLITE,
    },
    {
      driverAdapter: 'js_d1',
      provider: Providers.POSTGRESQL,
    },
  ],
])
