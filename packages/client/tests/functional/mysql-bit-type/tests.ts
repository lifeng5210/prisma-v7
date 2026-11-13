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
