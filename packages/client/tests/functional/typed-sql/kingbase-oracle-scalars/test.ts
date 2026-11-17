import { expectTypeOf } from 'expect-type'

import { Providers } from '../../_utils/providers'
import testMatrix from './_matrix'
// @ts-ignore
import type { Prisma as PrismaNamespace, PrismaClient } from './generated/prisma/client'
// @ts-ignore
import * as Sql from './generated/prisma/sql'

declare let prisma: PrismaClient
declare let Prisma: typeof PrismaNamespace
declare let sql: typeof Sql

const id = 'oracle-typed-sql'
const dateValue = new Date('2025-01-02T03:04:05.000Z')
const timestampValue = new Date('2025-02-03T04:05:06.123Z')
const timestampTzValue = new Date('2025-03-04T05:06:07.456Z')
const timestampLocalTzValue = new Date('2025-04-05T06:07:08.789Z')

testMatrix.setupTestSuite(
  () => {
    beforeAll(async () => {
      await prisma.testModel.create({
        data: {
          id,
          tinyIntValue: -128,
          intValue: 123,
          bigIntValue: 12345n,
          floatValue: 12.5,
          decimalValue: new Prisma.Decimal('12.34'),
          stringValue: 'hello',
          clobValue: 'clob text',
          nclobValue: 'nclob 文本',
          boolValue: true,
          bytesValue: Uint8Array.of(1, 2, 3),
          jsonValue: { hello: 'world' },
          uuidValue: '123e4567-e89b-12d3-a456-426614174000',
          xmlValue: '<hello />',
          dateValue,
          timestampValue,
          timestampTzValue,
          timestampLocalTzValue,
        },
      })
    })

    test('infers and maps Oracle scalar result types', async () => {
      const [result] = await prisma.$queryRawTyped(sql.getScalars(id))

      expect(result).toEqual({
        tinyIntValue: -128,
        intValue: new Prisma.Decimal('123'),
        bigIntValue: new Prisma.Decimal('12345'),
        floatValue: 12.5,
        decimalValue: new Prisma.Decimal('12.34'),
        stringValue: 'hello',
        clobValue: 'clob text',
        nclobValue: 'nclob 文本',
        boolValue: true,
        bytesValue: Uint8Array.of(1, 2, 3),
        jsonValue: { hello: 'world' },
        uuidValue: '123e4567-e89b-12d3-a456-426614174000',
        xmlValue: '<hello />',
        dateValue,
        timestampValue,
        timestampTzValue,
        timestampLocalTzValue,
      })

      expectTypeOf(result.tinyIntValue).toMatchTypeOf<number | null>()
      // The generated Client module is unavailable to ESLint before this fixture is generated.
      // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      expectTypeOf(result.intValue).toMatchTypeOf<PrismaNamespace.Decimal | null>()
      // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      expectTypeOf(result.bigIntValue).toMatchTypeOf<PrismaNamespace.Decimal | null>()
      expectTypeOf(result.floatValue).toMatchTypeOf<number | null>()
      // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      expectTypeOf(result.decimalValue).toMatchTypeOf<PrismaNamespace.Decimal | null>()
      expectTypeOf(result.stringValue).toMatchTypeOf<string | null>()
      expectTypeOf(result.boolValue).toMatchTypeOf<boolean | null>()
      expectTypeOf(result.bytesValue).toMatchTypeOf<Uint8Array | null>()
      expectTypeOf(result.jsonValue).toMatchTypeOf<PrismaNamespace.JsonValue>()
      expectTypeOf(result.dateValue).toMatchTypeOf<Date | null>()
      expectTypeOf(result.timestampLocalTzValue).toMatchTypeOf<Date | null>()
    })

    test('infers Oracle scalar parameter types', async () => {
      await expect(
        prisma.$queryRawTyped(
          sql.findByScalars(123, 'hello', true, new Prisma.Decimal('12.34'), dateValue, timestampTzValue),
        ),
      ).resolves.toEqual([{ id }])
    })

    test('infers Oracle ROWID results as text', async () => {
      const [result] = await prisma.$queryRawTyped(sql.getRowId())

      expect(result.rowId).toMatch(/^[A-Za-z0-9+/]{23}$/)
      expectTypeOf(result.rowId).toMatchTypeOf<string | null>()
    })
  },
  {
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
      reason: 'covers Kingbase Oracle Typed SQL specifically',
    },
  },
)
