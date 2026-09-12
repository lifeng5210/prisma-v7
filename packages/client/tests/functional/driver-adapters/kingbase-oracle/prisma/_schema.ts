import testMatrix from '../_matrix'

export default testMatrix.setupSchema(({ provider }) => {
  return /* Prisma */ `
  generator client {
    provider = "prisma-client-js"
  }

  datasource db {
    provider = "${provider}"
  }

  model User {
    id      Int    @id
    name    String
    payload Bytes?
    roles   Role[]
  }

  model Role {
    id    Int    @id
    name  String
    users User[]
  }

  model OracleTemporal {
    id                    Int      @id
    dateValue             DateTime @db.Date
    timestampValue        DateTime @db.Timestamp(3)
    timestampTzValue      DateTime @db.TimestampTz(3)
    timestampLocalTzValue DateTime @db.TimestampLocalTz(3)
  }

  model OracleTinyInt {
    id    Int @id
    value Int @db.TinyInt
  }
  `
})
