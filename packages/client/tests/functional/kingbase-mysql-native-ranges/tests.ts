import { Providers } from '../_utils/providers'
import testMatrix from './_matrix'
// @ts-ignore
import type { PrismaClient } from './generated/prisma/client'

declare let prisma: PrismaClient

testMatrix.setupTestSuite(
  () => {
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
