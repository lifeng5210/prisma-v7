import { PrismaClient } from '@prisma-kb/client'

export function getDbClient() {
  const client = new PrismaClient().$extends({})

  return client
}
