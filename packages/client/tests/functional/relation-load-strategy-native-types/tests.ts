import { Providers } from '../_utils/providers'
import testMatrix from './_matrix'
// @ts-ignore
import type { PrismaClient } from './generated/prisma/client'

declare let prisma: PrismaClient

const strategies = ['query', 'join'] as const
const bitCases = [
  ['bit7', [0], [0]],
  ['bit7', [1], [1]],
  ['bit7', [127], [127]],
  ['bit8', [128], [128]],
  ['bit8', [255], [255]],
  ['bit9', [0, 1], [0, 1]],
  ['bit9', [1, 255], [1, 255]],
  ['bit17', [0, 0, 1], [0, 0, 1]],
  ['bit64', [0, 0, 0, 0, 0, 6, 107, 58], [0, 0, 0, 0, 0, 6, 107, 58]],
  ['bit64', [128, 0, 0, 0, 0, 0, 0, 0], [128, 0, 0, 0, 0, 0, 0, 0]],
  ['bit64', [255, 255, 255, 255, 255, 255, 255, 255], [255, 255, 255, 255, 255, 255, 255, 255]],
] as const

testMatrix.setupTestSuite(
  ({ provider }) => {
    beforeEach(async () => {
      await prisma.child.deleteMany()
      await prisma.parent.deleteMany()
    })

    describe.each(strategies)('%s relation strategy', (relationLoadStrategy) => {
      test('preserves nullable float, BigInt and binary values in nested results', async () => {
        const bytesValue = Uint8Array.from([0, 1, 128, 255])
        const blobValue = Uint8Array.from([0, 255, 128, 1])
        const longBlob = Uint8Array.from({ length: 4096 }, (_, index) => index % 256)
        await prisma.parent.create({
          data: {
            id: 1,
            children: {
              create: [
                { id: 1, floatValue: 1.25, bigValue: BigInt('9223372036854775807'), bytesValue, blobValue },
                {
                  id: 2,
                  floatValue: -1.25,
                  bigValue: BigInt('-9223372036854775808'),
                  bytesValue: new Uint8Array(),
                  blobValue: new Uint8Array(),
                },
                { id: 3 },
                { id: 4, blobValue: longBlob },
              ],
            },
          },
        })
        const result = await prisma.parent.findUniqueOrThrow({
          where: { id: 1 },
          relationLoadStrategy,
          include: { children: { orderBy: { id: 'asc' } } },
        })
        expect(result.children).toMatchObject([
          { id: 1, floatValue: 1.25, bigValue: BigInt('9223372036854775807'), bytesValue, blobValue },
          {
            id: 2,
            floatValue: -1.25,
            bigValue: BigInt('-9223372036854775808'),
            bytesValue: new Uint8Array(),
            blobValue: new Uint8Array(),
          },
          { id: 3, floatValue: null, bigValue: null, bytesValue: null, blobValue: null },
          { id: 4, floatValue: null, bigValue: null, bytesValue: null, blobValue: longBlob },
        ])
      })

      describeIf(provider === Providers.MYSQL || provider === Providers.KINGBASE_MYSQL)('BIT widths', () => {
        test.each(bitCases)('preserves %s bytes %j', async (field, input, output) => {
          await prisma.parent.create({
            data: { id: 1, children: { create: { id: 1, [field]: Uint8Array.from(input) } } },
          })
          const result = await prisma.parent.findUniqueOrThrow({
            where: { id: 1 },
            relationLoadStrategy,
            include: { children: true },
          })
          const child = result.children[0] as Record<string, unknown>
          expect(child[field]).toEqual(Uint8Array.from(output))
        })
      })
    })
  },
  {
    optOut: {
      from: [Providers.SQLITE, Providers.MONGODB, Providers.COCKROACHDB, Providers.SQLSERVER],
      reason: 'Exercises native Float, BigInt and binary types with the SQL relation loading implementations.',
    },
  },
)
