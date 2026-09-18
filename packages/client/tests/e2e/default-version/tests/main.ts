import { Prisma } from '@prisma-kb/client'

test('example', () => {
  expect(Prisma.prismaVersion.client).toMatch(/^\d+\.\d+\.\d+/)
  expect(Prisma.prismaVersion.engine).toMatch(/^[a-f0-9]{40}/)
})
