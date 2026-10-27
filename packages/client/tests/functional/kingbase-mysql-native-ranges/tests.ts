import { Providers } from '../_utils/providers'
import testMatrix from './_matrix'
// @ts-ignore
import type { PrismaClient } from './generated/prisma/client'

declare let prisma: PrismaClient

testMatrix.setupTestSuite(
  () => {
    test('keeps explicit auto-increment IDs after generated IDs, including nested and transactional creates', async () => {
      const generated = await prisma.autoParent.create({ data: {} })
      expect(generated.id).toBeGreaterThan(0)
      expect(await prisma.autoParent.create({ data: { id: 100 } })).toEqual({ id: 100 })
      const nested = await prisma.autoParent.create({
        data: { id: 200, children: { create: {} } },
        include: { children: true },
      })
      expect(nested.id).toBe(200)
      expect(nested.children).toEqual([{ id: expect.any(Number), parentId: 200 }])

      await prisma.$transaction(async (tx) => {
        const auto = await tx.autoParent.create({ data: {} })
        expect(auto.id).toBeGreaterThan(200)
        const explicit = await tx.autoParent.create({
          data: { id: 300, children: { create: {} } },
          include: { children: true },
        })
        expect(explicit.id).toBe(300)
        expect(explicit.children[0].parentId).toBe(300)
      })
      expect(await prisma.autoParent.findUnique({ where: { id: 300 } })).toEqual({ id: 300 })
      const largeId = 9007199254740993n
      expect(await prisma.autoBigInt.create({ data: { id: largeId } })).toEqual({ id: largeId })
      expect(await prisma.autoBigInt.findUnique({ where: { id: largeId } })).toEqual({ id: largeId })
      const zero = await prisma.autoParent.create({ data: { id: 0 } })
      expect(zero.id).toBeGreaterThan(300)
      expect(await prisma.autoParent.findUnique({ where: { id: zero.id } })).toEqual(zero)
      expect(await prisma.autoParent.create({ data: { id: -1 } })).toEqual({ id: -1 })

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL sql_mode = 'NO_AUTO_VALUE_ON_ZERO'")
        expect(await tx.autoParent.create({ data: { id: 0 } })).toEqual({ id: 0 })
        expect(await tx.autoParent.findUnique({ where: { id: 0 } })).toEqual({ id: 0 })
      })
    })

    test('binds bounded unsigned values, booleans and escaped mapped identifiers', async () => {
      const input = { tiny: 255, small: 65535, medium: 16777215, enabled: true, value: 'kept' }
      const created = await prisma.rangeValue.create({ data: input })
      expect(created).toEqual({ id: 1, ...input })
      expect(await prisma.rangeValue.findUnique({ where: { id: 1 } })).toEqual(created)
      const updated = await prisma.rangeValue.update({ where: { id: 1 }, data: { enabled: false } })
      expect(updated.enabled).toBe(false)
      await prisma.otherValue.create({ data: { id: 1, value: 'other' } })
      expect(await prisma.otherValue.count()).toBe(1)
    })

    test('rejects domain and auto-increment overflows without changing stored rows', async () => {
      await expect(prisma.rangeValue.update({ where: { id: 1 }, data: { tiny: 256 } })).rejects.toThrow()
      await expect(prisma.rangeValue.update({ where: { id: 1 }, data: { small: 65536 } })).rejects.toThrow()
      await expect(prisma.rangeValue.update({ where: { id: 1 }, data: { medium: 16777216 } })).rejects.toThrow()
      await expect(prisma.rangeValue.update({ where: { id: 1 }, data: { id: 256 } })).rejects.toThrow()
      expect(await prisma.rangeValue.findUnique({ where: { id: 1 } })).toEqual({
        id: 1,
        tiny: 255,
        small: 65535,
        medium: 16777215,
        enabled: false,
        value: 'kept',
      })
      expect(await prisma.rangeValue.count()).toBe(1)
    })
  },
  {
    optOut: {
      from: Object.values(Providers).filter((provider) => provider !== Providers.KINGBASE_MYSQL),
      reason: 'Kingbase MySQL bounded unsigned domains and auto-increment guards',
    },
  },
)
