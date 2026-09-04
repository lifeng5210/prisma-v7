import { defineMatrix } from '../../_utils/defineMatrix'
import { Providers } from '../../_utils/providers'

export default defineMatrix(() => [[{ provider: Providers.MYSQL }, { provider: Providers.KINGBASE_MYSQL }]])
