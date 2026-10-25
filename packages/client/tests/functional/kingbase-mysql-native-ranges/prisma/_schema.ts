import testMatrix from '../_matrix'

export default testMatrix.setupSchema(
  ({ provider }) => `
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "${provider}"
}
model RangeValue {
  id Int @id @default(autoincrement()) @db.UnsignedTinyInt
  tiny Int @db.UnsignedTinyInt
  small Int @db.UnsignedSmallInt
  medium Int @db.UnsignedMediumInt
  enabled Boolean @db.UnsignedTinyInt
  value String @map("value\`name")
  @@index([value], map: "shared")
  @@map("range\`values")
}
model OtherValue {
  id Int @id
  value String
  @@index([value], map: "shared")
}
`,
)
