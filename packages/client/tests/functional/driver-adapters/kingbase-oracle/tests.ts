import { Providers } from '../../_utils/providers'
import testMatrix from './_matrix'
// @ts-ignore
import type { PrismaClient } from './generated/prisma/client'

declare let prisma: PrismaClient

testMatrix.setupTestSuite(
  () => {
    test('executes compiled and raw $n-parameter queries through PrismaKbOracle', async () => {
      await prisma.user.create({
        data: {
          id: 1,
          name: 'Ada',
          payload: new Uint8Array([1, 2]),
        },
      })

      await expect(prisma.user.findUniqueOrThrow({ where: { id: 1 } })).resolves.toMatchObject({
        id: 1,
        name: 'Ada',
        payload: new Uint8Array([1, 2]),
      })

      // An untyped `$n` parameter is inferred as text by Kingbase Oracle.
      // This assertion verifies that the adapter preserves the numbered
      // placeholder instead of applying the MySQL `?` rewrite.
      await expect(prisma.$queryRaw<Array<{ value: string }>>`SELECT ${7} AS "value"`).resolves.toEqual([
        { value: '7' },
      ])
    })

    test('creates an implicit many-to-many relation through an Oracle MERGE source row', async () => {
      await prisma.role.create({ data: { id: 1, name: 'admin' } })

      await expect(
        prisma.user.create({
          data: {
            id: 2,
            name: 'Lin',
            roles: { connect: { id: 1 } },
          },
          include: { roles: true },
        }),
      ).resolves.toMatchObject({
        id: 2,
        roles: [{ id: 1, name: 'admin' }],
      })
    })

    test('round trips Oracle temporal native types without losing time or timezone', async () => {
      const dateValue = new Date('2025-01-02T03:04:05.000Z')
      const timestampValue = new Date('2025-02-03T04:05:06.123Z')
      const timestampTzValue = new Date('2025-03-04T05:06:07.456Z')
      const timestampLocalTzValue = new Date('2025-04-05T06:07:08.789Z')

      await expect(
        prisma.oracleTemporal.create({
          data: {
            id: 1,
            dateValue,
            timestampValue,
            timestampTzValue,
            timestampLocalTzValue,
          },
        }),
      ).resolves.toEqual({
        id: 1,
        dateValue,
        timestampValue,
        timestampTzValue,
        timestampLocalTzValue,
      })

      await expect(
        prisma.oracleTemporal.findFirstOrThrow({
          where: {
            dateValue,
            timestampValue,
            timestampTzValue,
            timestampLocalTzValue,
          },
        }),
      ).resolves.toMatchObject({ id: 1 })
    })

    test('round trips Oracle TINYINT and exposes ROWID as text', async () => {
      await expect(prisma.oracleTinyInt.create({ data: { id: 1, value: -128 } })).resolves.toEqual({
        id: 1,
        value: -128,
      })
      await expect(prisma.oracleTinyInt.update({ where: { id: 1 }, data: { value: 127 } })).resolves.toEqual({
        id: 1,
        value: 127,
      })

      const [{ rowId }] = await prisma.$queryRaw<Array<{ rowId: string }>>`SELECT nextrowid() AS "rowId"`
      expect(rowId).toMatch(/^[A-Za-z0-9+/]{23}$/)
    })
  },
  {
    skipDefaultClientInstance: false,
    optOut: {
      from: [
        Providers.SQLITE,
        Providers.POSTGRESQL,
        Providers.MYSQL,
        Providers.MONGODB,
        Providers.COCKROACHDB,
        Providers.SQLSERVER,
        Providers.KINGBASE_MYSQL,
      ],
      reason: 'covers the Kingbase Oracle adapter specifically',
    },
  },
)
