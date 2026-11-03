import { PrismaClient } from '@prisma-kb/client'

export class MyPrisma {
  prisma: PrismaClient

  constructor() {
    this.prisma = new PrismaClient()
  }
}
