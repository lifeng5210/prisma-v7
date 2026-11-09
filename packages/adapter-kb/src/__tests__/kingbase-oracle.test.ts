import { randomUUID } from 'node:crypto'

import { ColumnTypeEnum, type SqlQuery } from '@prisma-kb/driver-adapter-utils'
// @ts-ignore: kingbasedb does not publish TypeScript declarations.
import * as kingbaseModule from 'kingbasedb'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { PrismaKbOracleAdapterFactory } from '../kingbase-oracle'

type MockConnection = {
  query: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

type MockPool = {
  query: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

type PoolVerifier = (client: { query: ReturnType<typeof vi.fn> }, callback: (error?: Error) => void) => void

const query: SqlQuery = {
  sql: 'SELECT "id" FROM "UserTest" WHERE "id" = $1',
  args: [1],
  argTypes: [{ scalarType: 'int', arity: 'scalar' }],
}

test.skipIf(!process.env.TEST_KINGBASE_ORACLE_URI).each([
  ['owned', 'Asia/Shanghai'],
  ['external', 'Asia/Shanghai'],
  ['owned', 'America/New_York'],
  ['external', 'America/New_York'],
])(
  'real Oracle %s pool preserves %s and DateTime instants',
  async (ownership, timezone) => {
    const runtime = kingbaseModule.default ?? kingbaseModule
    const config = {
      connectionString: process.env.TEST_KINGBASE_ORACLE_URI!.replace(/^kingbase-oracle:/, 'kingbase:'),
      options: `-c timezone=${timezone}`,
      max: 1,
    }
    const pool = ownership === 'external' ? new runtime.Pool(config) : undefined
    const adapter = await new PrismaKbOracleAdapterFactory(pool ?? config).connect()
    const table = `oracle_time_${randomUUID().replaceAll('-', '')}`
    const args = [
      '2026-01-02T00:00:00.123Z',
      '2026-01-02T08:00:00.123+08:00',
      '2026-07-02T05:30:00.123+05:30',
      // This UTC wall time does not exist in New York's local DST clock.
      '2026-03-08T02:30:00.123Z',
      null,
    ]
    const dbTypes = ['DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMESTAMPLOCALTZ']
    const sql = (sql: string): SqlQuery => ({ sql, args: [], argTypes: [] })
    try {
      expect((await adapter.queryRaw(sql('SHOW TIME ZONE'))).rows).toEqual([[timezone]])
      const transaction = await adapter.startTransaction()
      try {
        await transaction.executeRaw(
          sql(
            `CREATE TEMPORARY TABLE "${table}" (d DATE, plain TIMESTAMP(3), zoned TIMESTAMP(3) WITH TIME ZONE, localized TIMESTAMP(3) WITH LOCAL TIME ZONE)`,
          ),
        )
        for (const nativeTypeHints of [true, false]) {
          for (const input of args) {
            const parameters: Pick<SqlQuery, 'args' | 'argTypes'> = {
              args: dbTypes.map(() => (nativeTypeHints || input === null ? input : new Date(input))),
              argTypes: dbTypes.map((dbType) => ({
                scalarType: 'datetime',
                arity: 'scalar',
                ...(nativeTypeHints ? { dbType } : {}),
              })),
            }
            const expected = input === null ? null : new Date(input).toISOString()
            const dateExpected = expected?.replace('.123Z', '.000Z') ?? null
            const expectInstants = (result: Awaited<ReturnType<typeof transaction.queryRaw>>) => {
              expect(result.columnTypes).toEqual(dbTypes.map(() => ColumnTypeEnum.DateTime))
              expect(
                result.rows.map((row) =>
                  row.map((value) => (value === null ? null : new Date(value as string).toISOString())),
                ),
              ).toEqual([[dateExpected, expected, expected, expected]])
            }
            if (!nativeTypeHints) {
              expectInstants(
                await transaction.queryRaw({
                  sql: 'SELECT CAST($1 AS DATE), CAST($2 AS TIMESTAMP(3)), CAST($3 AS TIMESTAMP(3) WITH TIME ZONE), CAST($4 AS TIMESTAMP(3) WITH LOCAL TIME ZONE)',
                  ...parameters,
                }),
              )
            }
            await transaction.executeRaw({
              sql: `INSERT INTO "${table}" VALUES ($1, $2, $3, $4)`,
              ...parameters,
            })
            expectInstants(await transaction.queryRaw(sql(`SELECT * FROM "${table}"`)))
            await transaction.executeRaw(sql(`DELETE FROM "${table}"`))
          }
        }
        expect((await transaction.queryRaw(sql('SHOW TIME ZONE'))).rows).toEqual([[timezone]])
      } finally {
        // The runtime sends ROLLBACK; the adapter hook only releases the connection.
        try {
          await transaction.executeRaw(sql('ROLLBACK'))
        } finally {
          await transaction.rollback()
        }
      }
      expect((await adapter.queryRaw(sql('SHOW TIME ZONE'))).rows).toEqual([[timezone]])
      if (pool) {
        expect((await pool.query('SHOW TIME ZONE')).rows[0].TimeZone).toBe(timezone)
      }
    } finally {
      await adapter.dispose()
      await pool?.end()
    }
  },
  20000,
)

function createPool(): { pool: MockPool; connection: MockConnection } {
  const connection: MockConnection = {
    query: vi.fn().mockImplementation((query: unknown) =>
      Promise.resolve(
        typeof query === 'string'
          ? { fields: [], rows: [], rowCount: 0 }
          : {
              fields: [{ name: 'id', dataTypeID: 23 }],
              rows: [[1]],
              rowCount: 1,
            },
      ),
    ),
    release: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }
  const pool: MockPool = {
    query: vi.fn().mockResolvedValue({
      fields: [{ name: 'id', dataTypeID: 23 }],
      rows: [[1]],
      rowCount: 1,
    }),
    connect: vi.fn().mockResolvedValue(connection),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  }

  return { pool, connection }
}

test.skipIf(!process.env.TEST_KINGBASE_ORACLE_URI)(
  'real ORACLE JSON results preserve scalar strings and SQL NULL',
  async () => {
    const adapter = await new PrismaKbOracleAdapterFactory(process.env.TEST_KINGBASE_ORACLE_URI!).connect()
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
      null,
      [1, '123', null],
      { n: '123' },
    ]
    try {
      for (const jsonType of ['JSON', 'JSONB']) {
        for (const value of values) {
          const result = await adapter.queryRaw({
            sql: `SELECT CAST($1 AS ${jsonType}) AS value`,
            args: [JSON.stringify(value)],
            argTypes: [{ scalarType: 'string', arity: 'scalar' }],
          })
          expect(result.columnTypes).toEqual([ColumnTypeEnum.Json])
          expect(JSON.parse(result.rows[0][0] as string)).toEqual(value)
        }
      }
      const ordinaryDriverResult = await adapter.underlyingDriver().query({
        text: 'SELECT CAST($1 AS JSON) AS value',
        values: ['"123"'],
        rowMode: 'array',
      })
      expect(ordinaryDriverResult.rows).toEqual([['123']])
      const nulls = await adapter.queryRaw({ sql: 'SELECT CAST(NULL AS JSON) AS value', args: [], argTypes: [] })
      expect(nulls.rows).toEqual([[null]])
    } finally {
      await adapter.dispose()
    }
  },
  20000,
)

describe('PrismaKbOracleAdapterFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('preserves Oracle numbered placeholders and reports the Oracle provider', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbOracleAdapterFactory(pool).connect()

    await expect(adapter.queryRaw(query)).resolves.toEqual({
      columnNames: ['id'],
      columnTypes: [ColumnTypeEnum.Int32],
      rows: [[1]],
    })
    expect(connection.query).toHaveBeenNthCalledWith(1, {
      text: 'SELECT "id" FROM "UserTest" WHERE "id" = $1',
      values: [1],
      rowMode: 'array',
      types: expect.objectContaining({ getTypeParser: expect.any(Function) }),
    })
    expect(connection.release).toHaveBeenCalledOnce()
    expect(adapter.underlyingDriver()).toBe(pool)
    const config = connection.query.mock.calls[0][0]
    for (const oid of [114, 3802]) {
      expect(config.types.getTypeParser(oid, 'text')('"123"')).toBe('"123"')
    }
    for (const oid of [1114, 8020]) {
      expect(config.types.getTypeParser(oid, 'text')('2026-03-08 02:30:00')).toBe('2026-03-08 02:30:00')
    }
    expect(config.types.getTypeParser(23, 'text')('7')).toBe(7)
    expect(adapter.provider).toBe('kingbase-oracle')
    expect(adapter.getConnectionInfo()).toEqual({
      maxBindValues: 32767,
      schemaName: undefined,
      supportsRelationJoins: true,
    })

    await adapter.dispose()
    expect(pool.off).toHaveBeenCalled()
  })

  test('does not issue MySQL LAST_INSERT_ID for an Oracle insert', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbOracleAdapterFactory(pool).connect()

    await expect(
      adapter.queryRaw({
        sql: 'INSERT INTO "UserTest" ("id") VALUES ($1) RETURNING "id"',
        args: [1],
        argTypes: [{ scalarType: 'int', arity: 'scalar' }],
      }),
    ).resolves.toMatchObject({ rows: [[1]] })

    expect(pool.connect).toHaveBeenCalledOnce()
    expect(connection.query).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('LAST_INSERT_ID') }),
    )
  })

  test('starts and releases an Oracle transaction connection', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbOracleAdapterFactory(pool).connect()
    const transaction = await adapter.startTransaction('READ COMMITTED')

    expect(connection.query).toHaveBeenCalledWith({
      text: 'BEGIN',
      values: [],
      rowMode: 'array',
      types: expect.objectContaining({ getTypeParser: expect.any(Function) }),
    })
    expect(connection.query).toHaveBeenCalledWith({
      text: 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
      values: [],
      rowMode: 'array',
      types: expect.objectContaining({ getTypeParser: expect.any(Function) }),
    })

    await transaction.rollback()
    expect(connection.release).toHaveBeenCalledOnce()
  })

  test('configures every external pool connection with the selected schema', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbOracleAdapterFactory(pool, { schema: 'app_schema' }).connect()

    await adapter.queryRaw(query)

    expect(connection.query).toHaveBeenNthCalledWith(1, 'SET search_path TO "app_schema"')
    expect(connection.query).toHaveBeenNthCalledWith(2, {
      text: 'SELECT "id" FROM "UserTest" WHERE "id" = $1',
      values: [1],
      rowMode: 'array',
      types: expect.objectContaining({ getTypeParser: expect.any(Function) }),
    })
    expect(connection.release).toHaveBeenCalledOnce()
  })

  test('normalizes the Prisma Oracle URL scheme for kingbasedb', async () => {
    const adapter = await new PrismaKbOracleAdapterFactory(
      'kingbase-oracle://user:password@localhost:54325/app?sslaccept=strict',
    ).connect()
    const pool = adapter.underlyingDriver() as unknown as {
      options: { connectionString: string }
    }
    const url = new URL(pool.options.connectionString)

    expect(url.protocol).toBe('kingbase:')
    expect(url.searchParams.get('sslaccept')).toBeNull()
    expect(url.searchParams.get('sslmode')).toBe('verify-full')

    await adapter.dispose()
  })

  test('configures owned pool connections with the selected schema', async () => {
    const adapter = await new PrismaKbOracleAdapterFactory(
      'kingbase-oracle://user:password@localhost:54325/app?schema=app_schema',
    ).connect()
    const pool = adapter.underlyingDriver() as unknown as {
      options: { verify: PoolVerifier }
    }
    const client = {
      query: vi.fn().mockResolvedValue({ fields: [], rows: [], rowCount: 0 }),
    }

    await new Promise<void>((resolve, reject) => {
      pool.options.verify(client, (error) => (error ? reject(error) : resolve()))
    })

    expect(client.query).toHaveBeenNthCalledWith(1, 'SET search_path TO "app_schema"')

    await adapter.dispose()
  })

  test('rejects script execution without borrowing a connection or executing SQL', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbOracleAdapterFactory(pool, { schema: 'app_schema' }).connect()

    expect(() => adapter.executeScript('BEGIN; INSERT INTO records VALUES (1); ROLLBACK;')).toThrow(
      'Not implemented yet',
    )
    expect(pool.connect).not.toHaveBeenCalled()
    expect(pool.query).not.toHaveBeenCalled()
    expect(connection.query).not.toHaveBeenCalled()

    await adapter.dispose()
  })
})

// Read-only integration coverage does not require script execution.
test.skipIf(!process.env.TEST_KINGBASE_ORACLE_URI)(
  'real Oracle long JSON text remains untruncated',
  async () => {
    const adapter = await new PrismaKbOracleAdapterFactory(process.env.TEST_KINGBASE_ORACLE_URI!).connect()
    try {
      const result = await adapter.queryRaw({
        sql: 'SELECT CAST(CAST($1 AS JSONB) AS TEXT) ILIKE $2 AS matched',
        args: [JSON.stringify('a'.repeat(4100) + 'TAIL'), '%TAIL%'],
        argTypes: [
          { scalarType: 'json', arity: 'scalar' },
          { scalarType: 'string', arity: 'scalar' },
        ],
      })
      expect(result.rows).toEqual([[true]])
    } finally {
      await adapter.dispose()
    }
  },
  20000,
)
