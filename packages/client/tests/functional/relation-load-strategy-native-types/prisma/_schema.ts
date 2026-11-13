import { Providers } from '../../_utils/providers'
import testMatrix from '../_matrix'

export default testMatrix.setupSchema(({ provider }) => {
  const isMySql = provider === Providers.MYSQL || provider === Providers.KINGBASE_MYSQL
  const floatType = isMySql ? 'Float' : provider === Providers.KINGBASE_ORACLE ? 'BinaryFloat' : 'Real'
  const bigintType = provider === Providers.KINGBASE_ORACLE ? 'Number(19, 0)' : 'BigInt'
  const bytesType = isMySql ? 'VarBinary(8)' : provider === Providers.KINGBASE_ORACLE ? 'Blob' : 'ByteA'
  const blobType = isMySql ? 'LongBlob' : provider === Providers.KINGBASE_ORACLE ? 'Blob' : 'ByteA'

  return /* Prisma */ `
    generator client {
      provider = "prisma-client-js"
      previewFeatures = ["relationJoins"]
    }

    datasource db {
      provider = "${provider}"
    }

    model Parent {
      id       Int @id
      children Child[]
    }

    model Child {
      id         Int @id
      parentId   Int
      parent     Parent @relation(fields: [parentId], references: [id])
      floatValue Float? @db.${floatType}
      bigValue   BigInt? @db.${bigintType}
      bytesValue Bytes? @db.${bytesType}
      blobValue  Bytes? @db.${blobType}
      ${
        isMySql
          ? `
      bit7       Bytes? @db.Bit(7)
      bit8       Bytes? @db.Bit(8)
      bit9       Bytes? @db.Bit(9)
      bit17      Bytes? @db.Bit(17)
      bit64      Bytes? @db.Bit(64)
      `
          : ''
      }
    }
  `
})
