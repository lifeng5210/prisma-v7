import { idForProvider } from '../../../_utils/idForProvider'
import { Providers } from '../../../_utils/providers'
import testMatrix from '../_matrix'

export default testMatrix.setupSchema(({ provider, precision, scale }) => {
  return /* Prisma */ `
  generator client {
    provider = "prisma-client-js"
  }
  
  datasource db {
    provider = "${provider}"
  }
  
  model TestModel {
    id ${idForProvider(provider)}
    decimal Decimal @db.${provider === Providers.KINGBASE_ORACLE ? 'Number' : 'Decimal'}(${precision},${scale})
  }
  `
})
