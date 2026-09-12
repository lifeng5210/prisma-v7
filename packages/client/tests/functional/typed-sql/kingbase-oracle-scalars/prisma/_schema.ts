import testMatrix from '../_matrix'

export default testMatrix.setupSchema(({ provider }) => {
  return /* Prisma */ `
    generator client {
      provider        = "prisma-client-js"
      previewFeatures = ["typedSql"]
    }

    datasource db {
      provider = "${provider}"
    }

    model TestModel {
      id                    String   @id @db.VarChar2(36)
      tinyIntValue          Int      @db.TinyInt
      intValue              Int      @db.Number(10)
      bigIntValue           BigInt   @db.Number(19)
      floatValue            Float    @db.BinaryDouble
      decimalValue          Decimal  @db.Number(12, 2)
      stringValue           String   @db.VarChar2(100)
      clobValue             String   @db.Clob
      nclobValue            String   @db.NClob
      boolValue             Boolean  @db.Boolean
      bytesValue            Bytes    @db.Blob
      jsonValue             Json     @db.Json
      uuidValue             String   @db.Uuid
      xmlValue              String   @db.Xml
      dateValue             DateTime @db.Date
      timestampValue        DateTime @db.Timestamp(3)
      timestampTzValue      DateTime @db.TimestampTz(3)
      timestampLocalTzValue DateTime @db.TimestampLocalTz(3)
    }
  `
})
