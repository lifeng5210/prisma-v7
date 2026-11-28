import { expectTypeOf } from 'expect-type'

import testMatrix from './_matrix'
// @ts-ignore
import type { Prisma, PrismaClient } from './generated/prisma/client'

declare let prisma: PrismaClient

// https://github.com/prisma/prisma/issues/9007
testMatrix.setupTestSuite(
  () => {
    test('should throw an error if using contains filter on uuid type', async () => {
      await prisma.user.create({ data: {} })

      await expect(() =>
        prisma.user.findMany({
          where: {
            // @ts-expect-error
            uuid: { contains: 'foo-bar' },
          },
        }),
      ).rejects.toThrow()
    })

    test('UUID equality, membership, and NULL filters remain supported', async () => {
      const firstUuid = '550e8400-e29b-41d4-a716-446655440000'
      const secondUuid = '660e8400-e29b-41d4-a716-446655440000'
      const first = await prisma.user.create({ data: { uuid: firstUuid, nullableUuid: firstUuid } })
      const second = await prisma.user.create({ data: { uuid: secondUuid } })
      const id = { in: [first.id, second.id] }
      expect(await prisma.user.findMany({ where: { id, uuid: { equals: firstUuid } } })).toEqual([first])
      expect(
        await prisma.user.findMany({ where: { id, uuid: { in: [firstUuid, secondUuid] } }, orderBy: { uuid: 'asc' } }),
      ).toEqual([first, second])
      expect(await prisma.user.findMany({ where: { id, uuid: { notIn: [firstUuid] } } })).toEqual([second])
      expect(await prisma.user.findMany({ where: { id, nullableUuid: firstUuid } })).toEqual([first])
      expect(await prisma.user.findMany({ where: { id, nullableUuid: null } })).toEqual([second])
    })

    test('should reject prefix and suffix filters on UUID fields', async () => {
      await expect(
        prisma.user.findMany({
          where: {
            // @ts-expect-error
            uuid: { startsWith: '550e' },
          },
        }),
      ).rejects.toThrow()
      await expect(
        prisma.user.findMany({
          where: {
            // @ts-expect-error
            nullableUuid: { endsWith: '0000' },
          },
        }),
      ).rejects.toThrow()
    })

    test('ordinary string fields retain substring, prefix, and suffix filters', async () => {
      const row = await prisma.user.create({ data: {} })
      expect(
        await prisma.user.findMany({
          where: { id: row.id, name: { contains: 'middle', startsWith: 'alpha', endsWith: 'tail' } },
        }),
      ).toEqual([row])
    })

    test('UUID filter types exclude prefix and suffix operations for nullable and required fields', () => {
      expectTypeOf<Prisma.UuidFilter>().not.toHaveProperty('startsWith')
      expectTypeOf<Prisma.UuidFilter>().not.toHaveProperty('endsWith')
      expectTypeOf<Prisma.UuidNullableFilter>().not.toHaveProperty('contains')
      expectTypeOf<Prisma.UuidNullableFilter>().not.toHaveProperty('startsWith')
      expectTypeOf<Prisma.UuidNullableFilter>().not.toHaveProperty('endsWith')
      expectTypeOf<Prisma.StringFilter>().toHaveProperty('contains')
      expectTypeOf<Prisma.StringFilter>().toHaveProperty('startsWith')
      expectTypeOf<Prisma.StringFilter>().toHaveProperty('endsWith')
    })

    test('should not generate the contains field on the where type', () => {
      expectTypeOf<Prisma.UuidFilter>().not.toHaveProperty('contains')
    })
  },
  {
    optOut: {
      from: ['mongodb', 'sqlserver', 'mysql', 'sqlite', 'kingbase-mysql'],
      reason: '@db.Uuid not supported here',
    },
  },
)
