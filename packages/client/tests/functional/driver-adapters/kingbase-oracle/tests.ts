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

    test.each(['join', 'query'] as const)('preserves precise nested scalars with %s relations', async (strategy) => {
      const parentId = strategy === 'join' ? 101 : 102
      const stamp = new Date('2026-01-02T03:04:05.123Z')
      const values = [
        { id: 9007199254740993n, amount: '12345678901234567890.123456789' },
        { id: -9007199254740993n, amount: '-12345678901234567890.123456789' },
        { id: 9223372036854775807n, amount: '0.000000000000000000000000000001' },
        { id: -9223372036854775808n, amount: '0' },
      ]
      const data = values.map((value, index) => ({
        ...value,
        small: index - 2,
        measure: 1.5,
        optionalAmount: index === 0 ? value.amount : null,
        payload: index === 0 ? Uint8Array.of(0, 255) : null,
        stamp,
        meta: { index, numeric: 7 },
      }))
      // Also exercise the implicit relation read following a nested create.
      try {
        const created = await prisma.oraclePrecisionParent.create({
          data: {
            id: parentId,
            children: { create: data },
            single: { create: { id: 9007199254740993n, amount: values[0].amount } },
          },
          include: { children: { orderBy: { id: 'asc' } }, single: true },
        })
        const read = await prisma.oraclePrecisionParent.findUniqueOrThrow({
          relationLoadStrategy: strategy,
          where: { id: parentId },
          include: { children: { orderBy: { id: 'asc' } }, single: true, _count: { select: { children: true } } },
        })
        const expected = [...data].sort((a, b) => (a.id < b.id ? -1 : 1))
        for (const parent of [created, read]) {
          expect(
            parent.children.map((child) => ({
              id: child.id,
              amount: child.amount.toFixed(),
              optionalAmount: child.optionalAmount?.toFixed() ?? null,
              small: child.small,
              measure: child.measure,
              payload: child.payload,
              stamp: child.stamp,
              meta: child.meta,
            })),
          ).toEqual(expected)
          expect(parent.single?.id).toBe(9007199254740993n)
          expect(parent.single?.amount.toFixed()).toBe(values[0].amount)
        }
        expect(read._count.children).toBe(4)
      } finally {
        await prisma.oraclePrecisionParent.deleteMany({ where: { id: parentId } })
      }
    })

    test('preserves JSON scalar string types in root and joined/query relation results', async () => {
      const values = [
        '123',
        'true',
        'false',
        'null',
        '{}',
        '[]',
        '"quoted"',
        '',
        'hello',
        123,
        true,
        false,
        [1, '123'],
        { n: 'null' },
      ]
      const ids = values.map((_, index) => 3000 + index)
      try {
        for (const [index, payload] of values.entries()) {
          const created = await prisma.oracleJsonPath.create({ data: { id: ids[index], payload } })
          const read = await prisma.oracleJsonPath.findUniqueOrThrow({ where: { id: ids[index] } })
          expect(created.payload).toEqual(payload)
          expect(read.payload).toEqual(payload)
        }
        await prisma.oraclePrecisionParent.create({
          data: {
            id: 103,
            children: {
              create: values.map((meta, index) => ({
                id: BigInt(ids[index]),
                amount: '1',
                small: index,
                measure: 1.5,
                stamp: new Date('2026-01-02T03:04:05.123Z'),
                meta,
              })),
            },
          },
        })
        for (const relationLoadStrategy of ['join', 'query'] as const) {
          const parent = await prisma.oraclePrecisionParent.findUniqueOrThrow({
            where: { id: 103 },
            relationLoadStrategy,
            include: { children: { orderBy: { id: 'asc' } } },
          })
          expect(parent.children.map((child) => child.meta)).toEqual(values)
        }
      } finally {
        await prisma.oraclePrecisionParent.deleteMany({ where: { id: 103 } })
        await prisma.oracleJsonPath.deleteMany({ where: { id: { in: ids } } })
      }
    })

    test('distinguishes numeric JSON object keys from array indexes', async () => {
      const payload = {
        map: {
          '0': 'zero',
          '01': 'leading',
          '-1': 'minus',
          '': 'empty',
          'a.b': { 'q"\\k': 'escaped' },
          NULL: 'literal-null',
          '{a,b}': 'delimiters',
          '汉😀': 'unicode',
        },
        items: [{ value: 'first' }, { value: 'last' }],
        count: { '0': 17 },
      }
      await prisma.oracleJsonPath.createMany({
        data: [
          { id: 1, payload },
          { id: 2, payload: { map: { '0': 'other' }, count: { '0': 1 } } },
        ],
      })
      const cases = [
        { path: ['map', '0'], equals: 'zero' },
        { path: ['map', '01'], equals: 'leading' },
        { path: ['map', '-1'], equals: 'minus' },
        { path: ['map', ''], equals: 'empty' },
        { path: ['map', 'NULL'], equals: 'literal-null' },
        { path: ['map', '{a,b}'], equals: 'delimiters' },
        { path: ['map', '汉😀'], equals: 'unicode' },
        { path: ['map', 'a.b', 'q"\\k'], equals: 'escaped' },
        { path: ['items', '0', 'value'], equals: 'first' },
        { path: ['items', '-1', 'value'], equals: 'last' },
      ]
      for (const filter of cases) {
        const rows = await prisma.oracleJsonPath.findMany({ where: { payload: filter }, select: { id: true } })
        expect({ path: filter.path, rows }).toEqual({ path: filter.path, rows: [{ id: 1 }] })
      }
      await expect(
        prisma.oracleJsonPath.findMany({
          where: { payload: { path: ['map', '0'], string_contains: 'zer' } },
          select: { id: true },
        }),
      ).resolves.toEqual([{ id: 1 }])
      await expect(
        prisma.oracleJsonPath.findMany({ where: { payload: { path: ['count', '0'], gte: 10 } }, select: { id: true } }),
      ).resolves.toEqual([{ id: 1 }])
      await expect(
        prisma.oracleJsonPath.findMany({ where: { payload: { equals: payload } }, select: { id: true } }),
      ).resolves.toEqual([{ id: 1 }])
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

    test('creates, filters, updates and deletes Oracle native values', async () => {
      const [{ value: rowId }] = await prisma.$queryRawUnsafe<{ value: string }[]>(
        'SELECT nextrowid()::text AS "value"',
      )
      const input = { id: 1, fixed: '中文ab', variable: '中文ab', rowId, universal: rowId, integer: -2147483648 }
      expect(await prisma.oracleNativeValue.create({ data: input })).toEqual(input)
      expect(await prisma.oracleNativeValue.findUnique({ where: { rowId } })).toEqual(input)
      expect(await prisma.oracleNativeValue.findMany({ where: { universal: rowId, integer: { lt: 0 } } })).toEqual([
        input,
      ])
      const updated = await prisma.oracleNativeValue.update({
        where: { rowId },
        data: { fixed: 'abc', variable: 'short', integer: 2147483647 },
      })
      expect(updated).toEqual({ ...input, fixed: 'abc     ', variable: 'short', integer: 2147483647 })
      expect(await prisma.oracleNativeValue.delete({ where: { rowId } })).toEqual(updated)
    })

    test('preserves nullable values and native integer defaults', async () => {
      expect(await prisma.oracleNativeValue.create({ data: { id: 2 } })).toEqual({
        id: 2,
        fixed: null,
        variable: null,
        rowId: null,
        universal: null,
        integer: 7,
      })
      const input = { id: 3, fixed: null, variable: null, rowId: null, universal: null, integer: null }
      expect(await prisma.oracleNativeValue.create({ data: input })).toEqual(input)
    })

    test('rejects native length and integer overflow without inserting rows', async () => {
      for (const data of [
        { id: 4, fixed: '中文国' },
        { id: 4, variable: '中文国' },
        { id: 4, universal: 'x'.repeat(4001) },
        { id: 4, integer: 2147483648 },
        { id: 4, integer: -2147483649 },
        { id: 4, rowId: 'invalid-rowid' },
      ]) {
        await expect(prisma.oracleNativeValue.create({ data })).rejects.toThrow()
      }
      expect(await prisma.oracleNativeValue.findUnique({ where: { id: 4 } })).toBeNull()
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
