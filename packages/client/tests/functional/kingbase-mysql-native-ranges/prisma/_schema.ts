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
  id Int @id @default(autoincrement())
  unsignedInt Int @db.UnsignedInt
  unsignedBigInt BigInt @db.UnsignedBigInt
  enabled Boolean
  value String @map("value\`name")
  @@index([value], map: "shared")
  @@map("range\`values")
}
model OtherValue {
  id Int @id
  value String
  @@index([value], map: "shared")
}
model AutoParent {
  id Int @id @default(autoincrement()) @map("parent_key")
  children AutoChild[]
}
model AutoChild {
  id Int @id @default(autoincrement())
  parentId Int
  parent AutoParent @relation(fields: [parentId], references: [id])
}
model AutoBigInt {
  id BigInt @id @default(autoincrement())
}
`,
)
