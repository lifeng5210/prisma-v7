import { Providers } from '../_utils/providers'
import testMatrix from './_matrix'
// @ts-ignore
import type { PrismaClient } from './generated/prisma/client'

declare let prisma: PrismaClient

testMatrix.setupTestSuite(
  ({ provider }) => {
    const isKingbase = provider === Providers.KINGBASE_MYSQL

    describe('bytes field', () => {
      test.each([
        ['uint7', [1], [1]],
        ['uint9', [0, 1], [0, 1]],
        ['uint17', [1], [0, 0, 1]],
        ['uint64', [0, 0, 0, 0, 0, 6, 107, 58], [0, 0, 0, 0, 0, 6, 107, 58]],
      ] as const)('preserves leading zeros and column width for %s', async (field, input, output) => {
        const result = await prisma.testModel.create({ data: { [field]: Uint8Array.from(input) } })
        expect(result[field]).toEqual(Uint8Array.from(output))
        expect(await prisma.testModel.findUnique({ where: { id: result.id } })).toEqual(result)
        const updated = await prisma.testModel.update({
          where: { id: result.id },
          data: { [field]: Uint8Array.from([0]) },
        })
        expect(updated[field]).toEqual(new Uint8Array(output.length))
      })

      test('all bytes', async () => {
        const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])

        const result = await prisma.testModel.create({
          data: {
            uint64: bytes,
          },
        })

        expect(result.uint64).toEqual(bytes)
      })

      test('empty byte array', async () => {
        const result = await prisma.testModel.create({
          data: {
            uint64: Uint8Array.from([]),
          },
        })

        expect(result.uint64).toEqual(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0]))
      })

      test('too many bytes', async () => {
        await expect(
          async () =>
            await prisma.testModel.create({
              data: {
                uint64: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]),
              },
            }),
        ).rejects.toThrow(
          isKingbase
            ? /The provided value for the column is too long for the column's type. Column: \(not available\)/
            : /Out of range value for column 'uint64'|The provided value for the column is too long for the column's type. Column: uint64/,
        )
      })
    })

    test('boolean fields', async () => {
      const result = await prisma.testModel.create({
        data: {
          bool1: true,
          bool2: false,
        },
      })

      expect(result).toMatchObject({
        bool1: true,
        bool2: false,
      })
    })

    test('boolean filters distinguish false, true, and NULL after updates', async () => {
      const rows = await Promise.all([false, true, null].map((bool1) => prisma.testModel.create({ data: { bool1 } })))
      const ids = rows.map((row) => row.id)
      for (const [index, value] of [false, true, null].entries()) {
        expect(await prisma.testModel.findMany({ where: { id: { in: ids }, bool1: value } })).toEqual([rows[index]])
      }
      expect(await prisma.testModel.findMany({ where: { id: { in: ids }, bool1: { not: false } } })).toEqual([rows[1]])
      expect(
        await prisma.testModel.updateMany({ where: { id: { in: ids }, bool1: false }, data: { bool1: true } }),
      ).toEqual({ count: 1 })
      const updated = await prisma.testModel.findMany({
        where: { id: { in: ids }, bool1: true },
        orderBy: { id: 'asc' },
      })
      expect(updated).toEqual([{ ...rows[0], bool1: true }, rows[1]].sort((a, b) => a.id.localeCompare(b.id)))
    })

    test.each([
      ['uint7', [0x7f]],
      ['uint9', [1, 0xff]],
      ['uint17', [1, 0xff, 0xff]],
      ['uint64', Array(8).fill(0xff)],
    ] as const)('filters %s values with leading zeros and preserves update predicates', async (field, max) => {
      const values = [Uint8Array.from([0]), Uint8Array.from([1]), Uint8Array.from(max)]
      const rows = await Promise.all(values.map((value) => prisma.testModel.create({ data: { [field]: value } })))
      const ids = rows.map((row) => row.id)
      for (const [index, value] of values.entries()) {
        expect(await prisma.testModel.findMany({ where: { id: { in: ids }, [field]: value } })).toEqual([rows[index]])
      }
      expect(
        await prisma.testModel.findMany({
          where: { id: { in: ids }, [field]: { in: [values[0], values[2]] } },
          orderBy: { id: 'asc' },
        }),
      ).toEqual([rows[0], rows[2]].sort((a, b) => a.id.localeCompare(b.id)))
      expect(
        await prisma.testModel.updateMany({
          where: { id: { in: ids }, [field]: values[0] },
          data: { [field]: values[2] },
        }),
      ).toEqual({ count: 1 })
      const updated = await prisma.testModel.findMany({
        where: { id: { in: ids }, [field]: values[2] },
        orderBy: { id: 'asc' },
      })
      expect(updated).toEqual(
        [{ ...rows[0], [field]: rows[2][field] }, rows[2]].sort((a, b) => a.id.localeCompare(b.id)),
      )
    })

    test('BIT(64) filters distinguish adjacent values above the safe integer range', async () => {
      const values = [(1n << 53n) - 1n, 1n << 53n, (1n << 53n) + 1n, (1n << 64n) - 2n, (1n << 64n) - 1n].map(
        (value) => {
          const bytes = Buffer.alloc(8)
          bytes.writeBigUInt64BE(value)
          return new Uint8Array(bytes)
        },
      )
      const rows = await Promise.all(values.map((uint64) => prisma.testModel.create({ data: { uint64 } })))
      const ids = rows.map((row) => row.id)
      for (const [index, uint64] of values.entries()) {
        expect(await prisma.testModel.findMany({ where: { id: { in: ids }, uint64 } })).toEqual([rows[index]])
      }
      expect(
        await prisma.testModel.updateMany({
          where: { id: { in: ids }, uint64: values[2] },
          data: { uint64: values[4] },
        }),
      ).toEqual({ count: 1 })
      expect(
        await prisma.testModel.findMany({ where: { id: { in: ids }, uint64: values[4] }, orderBy: { id: 'asc' } }),
      ).toEqual([{ ...rows[2], uint64: values[4] }, rows[4]].sort((a, b) => a.id.localeCompare(b.id)))
    })

    test('raw query', async () => {
      const result = (await prisma.$queryRaw`SELECT b'1' AS bit`) as Array<{ bit: Uint8Array | boolean }>
      expect(result[0].bit).toEqual(isKingbase ? true : Uint8Array.from([1]))
    })
  },
  {
    optOut: {
      from: ['cockroachdb', 'mongodb', 'postgresql', 'sqlite', 'sqlserver'],
      reason: `
        Testing a MySQL specific data type
      `,
    },
  },
)
