import testMatrix from '../_matrix'

export default testMatrix.setupSchema(({ provider }) => {
  return /* Prisma */ `
  generator client {
    provider = "prisma-client-js"
    previewFeatures = ["relationJoins"]
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

  model OraclePrecisionParent {
    id Int @id
    children OraclePrecisionChild[]
    single OraclePrecisionSingle?
  }

  model OraclePrecisionChild {
    id BigInt @id
    parentId Int
    amount Decimal
    optionalAmount Decimal?
    small Int
    measure Float
    payload Bytes?
    stamp DateTime
    meta Json?
    parent OraclePrecisionParent @relation(fields:[parentId],references:[id],onDelete:Cascade)
  }

  model OraclePrecisionSingle {
    id BigInt @id
    parentId Int @unique
    amount Decimal
    parent OraclePrecisionParent @relation(fields:[parentId],references:[id],onDelete:Cascade)
  }

  model OracleJsonPath {
    id Int @id
    payload Json
  }

  model OracleTinyInt {
    id    Int @id
    value Int @db.TinyInt
  }
  `
})
