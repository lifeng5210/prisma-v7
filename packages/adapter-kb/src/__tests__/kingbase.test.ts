import { randomUUID } from 'node:crypto'

import { ColumnTypeEnum, type SqlQuery } from '@prisma-kb/driver-adapter-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { PrismaKbAdapterFactory, rewriteQuestionMarkPlaceholders } from '../kingbase'

type MockConnection = {
  query: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
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

const query: SqlQuery = {
  sql: 'SELECT id FROM `UserTest` WHERE id = ?',
  args: [1],
  argTypes: [{ scalarType: 'int', arity: 'scalar' }],
}

function createPool(): { pool: MockPool; connection: MockConnection } {
  const connection: MockConnection = {
    query: vi.fn().mockResolvedValue({ fields: [], rows: [], rowCount: 0 }),
    connect: vi.fn().mockRejectedValue(new Error('an active transaction connection must not be reconnected')),
    end: vi.fn().mockResolvedValue(undefined),
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

test.skipIf(!process.env.TEST_KINGBASE_MYSQL_URI)(
  'real MYSQL JSON results preserve scalar strings and SQL NULL',
  async () => {
    const adapter = await new PrismaKbAdapterFactory(process.env.TEST_KINGBASE_MYSQL_URI!).connect()
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
            sql: `SELECT CAST(? AS ${jsonType}) AS value`,
            args: [JSON.stringify(value)],
            argTypes: [{ scalarType: 'string', arity: 'scalar' }],
          })
          expect(result.columnTypes).toEqual([ColumnTypeEnum.Json])
          expect(JSON.parse(result.rows[0][0] as string)).toEqual(value)
        }
      }
      for (const sql of [
        'SELECT ARRAY[1,2] AS value',
        'SELECT NULL::integer[] AS value',
        'SELECT ARRAY[1] AS value WHERE false',
      ]) {
        await expect(adapter.queryRaw({ sql, args: [], argTypes: [] })).rejects.toMatchObject({
          cause: { kind: 'UnsupportedNativeDataType' },
        })
      }
      await expect(
        adapter.queryRaw({
          sql: 'SELECT CAST(? AS integer[]) AS value',
          args: [[1, 2]],
          argTypes: [{ scalarType: 'int', arity: 'list' }],
        }),
      ).rejects.toThrow('Arrays are not supported')
      expect(
        (
          await adapter.queryRaw({
            sql: 'SELECT 2 IN (?,?) AS value',
            args: [1, 2],
            argTypes: [
              { scalarType: 'int', arity: 'scalar' },
              { scalarType: 'int', arity: 'scalar' },
            ],
          })
        ).rows,
      ).toEqual([[true]])
      const jsonArray = await adapter.queryRaw({
        sql: 'SELECT CAST(? AS JSON) AS value',
        args: [[1, '123', null]],
        argTypes: [{ scalarType: 'json', arity: 'scalar' }],
      })
      expect(JSON.parse(jsonArray.rows[0][0] as string)).toEqual([1, '123', null])
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

describe('PrismaKbAdapterFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('executes a query through an externally supplied pool', async () => {
    const { pool } = createPool()
    const adapter = await new PrismaKbAdapterFactory(pool).connect()

    await expect(adapter.queryRaw(query)).resolves.toEqual({
      columnNames: ['id'],
      columnTypes: [ColumnTypeEnum.Int32],
      rows: [[1]],
    })
    expect(pool.query).toHaveBeenCalledWith({
      text: 'SELECT id FROM `UserTest` WHERE id = $1',
      values: [1],
      rowMode: 'array',
      types: expect.objectContaining({ getTypeParser: expect.any(Function) }),
    })
    const config = pool.query.mock.calls[0][0]
    for (const oid of [114, 3802, 7024]) {
      expect(config.types.getTypeParser(oid, 'text')('"123"')).toBe('"123"')
    }
    expect(config.types.getTypeParser(23, 'text')('7')).toBe(7)
    expect(adapter.provider).toBe('kingbase-mysql')
    expect(adapter.getConnectionInfo()).toMatchObject({ maxBindValues: 32767 })

    await adapter.dispose()
    expect(pool.off).toHaveBeenCalled()
  })

  test('rejects SQL array bindings before database access and array result metadata without rows', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbAdapterFactory(pool).connect()
    await expect(
      adapter.executeRaw({ sql: 'SELECT ?', args: [[1, 2]], argTypes: [{ scalarType: 'int', arity: 'list' }] }),
    ).rejects.toThrow('Arrays are not supported')
    expect(pool.connect).not.toHaveBeenCalled()
    expect(pool.query).not.toHaveBeenCalled()
    expect(connection.query).not.toHaveBeenCalled()
    pool.query.mockResolvedValueOnce({ fields: [{ name: 'items', dataTypeID: 1007 }], rows: [], rowCount: 0 })
    await expect(
      adapter.queryRaw({ sql: 'SELECT ARRAY[1] WHERE false', args: [], argTypes: [] }),
    ).rejects.toMatchObject({ cause: { kind: 'UnsupportedNativeDataType', type: 'int4_array' } })
    await adapter.dispose()
  })

  test('configures every external pool connection with the selected schema', async () => {
    const { pool, connection } = createPool()
    connection.query.mockResolvedValueOnce({ fields: [], rows: [], rowCount: 0 }).mockResolvedValueOnce({
      fields: [{ name: 'id', dataTypeID: 23 }],
      rows: [[1]],
      rowCount: 1,
    })
    const adapter = await new PrismaKbAdapterFactory(pool, { schema: 'app_schema' }).connect()

    await expect(adapter.queryRaw(query)).resolves.toMatchObject({ rows: [[1]] })

    expect(pool.query).not.toHaveBeenCalled()
    expect(connection.query).toHaveBeenNthCalledWith(1, 'SET search_path TO "app_schema"')
    expect(connection.query).toHaveBeenNthCalledWith(2, {
      text: 'SELECT id FROM `UserTest` WHERE id = $1',
      values: [1],
      rowMode: 'array',
      types: expect.objectContaining({ getTypeParser: expect.any(Function) }),
    })
    expect(connection.release).toHaveBeenCalledOnce()
    expect(adapter.underlyingDriver()).toBe(pool)
  })

  test('reads LAST_INSERT_ID on the same connection as a pooled insert', async () => {
    const { pool, connection } = createPool()
    connection.query
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        fields: [{ name: 'LAST_INSERT_ID()', dataTypeID: 20 }],
        rows: [[42]],
        rowCount: 1,
      })
    const adapter = await new PrismaKbAdapterFactory(pool, { schema: 'app_schema' }).connect()

    await expect(
      adapter.queryRaw({
        sql: 'INSERT INTO `UserTest` (`id`) VALUES (?)',
        args: [1],
        argTypes: [{ scalarType: 'int', arity: 'scalar' }],
      }),
    ).resolves.toMatchObject({ lastInsertId: '42' })

    expect(pool.query).not.toHaveBeenCalled()
    expect(connection.query).toHaveBeenNthCalledWith(1, 'SET search_path TO "app_schema"')
    expect(connection.query).toHaveBeenNthCalledWith(2, {
      text: 'INSERT INTO `UserTest` (`id`) VALUES ($1)',
      values: [1],
      rowMode: 'array',
      types: expect.objectContaining({ getTypeParser: expect.any(Function) }),
    })
    expect(connection.query).toHaveBeenNthCalledWith(3, {
      text: 'SELECT LAST_INSERT_ID()',
      values: [],
      rowMode: 'array',
    })
    expect(connection.release).toHaveBeenCalledOnce()
  })

  test('discards the pooled connection when LAST_INSERT_ID fails', async () => {
    const { pool, connection } = createPool()
    const error = Object.assign(new Error('connection reset'), {
      code: 'ECONNRESET',
      errno: -104,
      syscall: 'read',
    })
    connection.query
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 1 })
      .mockRejectedValueOnce(error)
    const adapter = await new PrismaKbAdapterFactory(pool, { schema: 'app_schema' }).connect()

    await expect(
      adapter.queryRaw({
        sql: 'INSERT INTO `UserTest` (`id`) VALUES (?)',
        args: [1],
        argTypes: [{ scalarType: 'int', arity: 'scalar' }],
      }),
    ).rejects.toThrow('ConnectionClosed')

    expect(pool.query).not.toHaveBeenCalled()
    expect(connection.release).toHaveBeenCalledWith(expect.any(Error))
  })

  test.each([100, -1, '9007199254740993'])(
    'reports the marked explicit ID %s instead of a stale generated ID',
    async (id) => {
      const { pool, connection } = createPool()
      const adapter = await new PrismaKbAdapterFactory(pool).connect()
      const result = await adapter.queryRaw({
        sql: 'INSERT INTO `UserTest` (`other`, `id`) VALUES (?, ?)',
        args: [999, id],
        argTypes: [
          { scalarType: 'int', arity: 'scalar' },
          { scalarType: 'bigint', arity: 'scalar', dbType: 'PRISMA_MYSQL_AUTOINCREMENT_ID' },
        ],
      })
      expect(result.lastInsertId).toBe(String(id))
      expect(connection.query).toHaveBeenCalledTimes(1)
      expect(connection.query).toHaveBeenCalledWith(expect.objectContaining({ values: [999, id] }))
      expect(pool.query).not.toHaveBeenCalled()
      expect(connection.release).toHaveBeenCalledOnce()
    },
  )

  test.each([
    ['ANSI_QUOTES', '42'],
    ['ANSI_QUOTES,NO_AUTO_VALUE_ON_ZERO', '0'],
  ])('resolves a marked zero ID with session sql_mode=%s', async (mode, expected) => {
    const { pool, connection } = createPool()
    connection.query
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ fields: [], rows: [[mode]], rowCount: 1 })
      .mockResolvedValueOnce({ fields: [], rows: [[42]], rowCount: 1 })
    const adapter = await new PrismaKbAdapterFactory(pool).connect()
    await expect(
      adapter.queryRaw({
        sql: 'INSERT INTO `UserTest` (`id`) VALUES (?)',
        args: [0],
        argTypes: [{ scalarType: 'int', arity: 'scalar', dbType: 'PRISMA_MYSQL_AUTOINCREMENT_ID' }],
      }),
    ).resolves.toMatchObject({ lastInsertId: expected })
    expect(connection.query).toHaveBeenNthCalledWith(2, {
      text: 'SHOW sql_mode',
      values: [],
      rowMode: 'array',
    })
    expect(connection.query).toHaveBeenCalledTimes(expected === '0' ? 2 : 3)
  })

  test('starts and releases a transaction connection', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbAdapterFactory(pool, { schema: 'app_schema' }).connect()
    const transaction = await adapter.startTransaction('READ COMMITTED')

    expect(connection.query).toHaveBeenNthCalledWith(1, 'SET search_path TO "app_schema"')
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
    expect(connection.query).not.toHaveBeenCalledWith(expect.objectContaining({ text: 'ROLLBACK' }))
    expect(connection.release).toHaveBeenCalledOnce()
  })

  test('translates strict sslaccept to certificate-verifying driver settings', async () => {
    const adapter = await new PrismaKbAdapterFactory(
      'kingbase-mysql://user:password@localhost:54321/app?sslaccept=strict',
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

  test('translates accept_invalid_certs sslaccept to the driver no-verify mode', async () => {
    const adapter = await new PrismaKbAdapterFactory(
      'kingbase-mysql://user:password@localhost:54321/app?sslaccept=accept_invalid_certs',
    ).connect()
    const pool = adapter.underlyingDriver() as unknown as {
      options: { connectionString: string }
    }
    const url = new URL(pool.options.connectionString)

    expect(url.searchParams.get('sslaccept')).toBeNull()
    expect(url.searchParams.get('sslmode')).toBe('no-verify')

    await adapter.dispose()
  })

  test('reads LAST_INSERT_ID on the active transaction connection without reconnecting it', async () => {
    const { pool, connection } = createPool()
    connection.query
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ fields: [], rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        fields: [{ name: 'LAST_INSERT_ID()', dataTypeID: 20 }],
        rows: [[42]],
        rowCount: 1,
      })
    const adapter = await new PrismaKbAdapterFactory(pool, { schema: 'app_schema' }).connect()
    const transaction = await adapter.startTransaction()

    await expect(
      transaction.queryRaw({
        sql: 'INSERT INTO `UserTest` (`id`) VALUES (?)',
        args: [1],
        argTypes: [{ scalarType: 'int', arity: 'scalar' }],
      }),
    ).resolves.toMatchObject({ lastInsertId: '42' })

    expect(pool.connect).toHaveBeenCalledOnce()
    expect(connection.connect).not.toHaveBeenCalled()
    expect(connection.query).toHaveBeenNthCalledWith(4, {
      text: 'INSERT INTO `UserTest` (`id`) VALUES ($1)',
      values: [1],
      rowMode: 'array',
      types: expect.objectContaining({ getTypeParser: expect.any(Function) }),
    })
    expect(connection.query).toHaveBeenNthCalledWith(5, {
      text: 'SELECT LAST_INSERT_ID()',
      values: [],
      rowMode: 'array',
    })

    await transaction.rollback()
  })

  test('uses schema-scoped index names without querying an aborted transaction', async () => {
    const { pool, connection } = createPool()
    const violation = {
      severity: 'ERROR',
      code: '23505',
      schema: 'app',
      constraint: '_prisma_idx_same',
      message: 'duplicate',
    }
    connection.query.mockImplementation((query: string | { text: string }) => {
      const sql = typeof query === 'string' ? query : query.text
      if (sql.includes('sys_catalog.sys_description')) {
        return Promise.resolve({
          rows: [
            ['other', '_prisma_idx_same', 'prisma:logical-index:wrong'],
            ['app', '_prisma_idx_same', 'prisma:logical-index:custom_unique'],
          ],
        })
      }
      if (sql.startsWith('INSERT')) return Promise.reject(violation)
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const adapter = await new PrismaKbAdapterFactory(pool).connect()
    const transaction = await adapter.startTransaction()
    const calls = connection.query.mock.calls.length
    await expect(
      transaction.executeRaw({ sql: 'INSERT INTO items VALUES(1)', args: [], argTypes: [] }),
    ).rejects.toMatchObject({
      cause: { kind: 'UniqueConstraintViolation', constraint: { index: 'custom_unique' } },
    })
    expect(connection.query).toHaveBeenCalledTimes(calls + 1)
    expect(pool.query).not.toHaveBeenCalled()
    await transaction.executeRaw({ sql: 'ROLLBACK', args: [], argTypes: [] })
    await transaction.rollback()
  })

  test('starts transactions even when index metadata is not readable', async () => {
    const { pool, connection } = createPool()
    connection.query.mockImplementation((query: string | { text: string }) => {
      const sql = typeof query === 'string' ? query : query.text
      if (sql.includes('sys_catalog.sys_description')) return Promise.reject(new Error('metadata unavailable'))
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const adapter = await new PrismaKbAdapterFactory(pool).connect()
    const transaction = await adapter.startTransaction()
    await transaction.executeRaw({ sql: 'SELECT 1', args: [], argTypes: [] })
    await transaction.executeRaw({ sql: 'ROLLBACK', args: [], argTypes: [] })
    await transaction.rollback()
    expect(connection.release).toHaveBeenCalledOnce()
  })

  test('retains the original unique violation when an autocommit metadata lookup fails', async () => {
    const { pool } = createPool()
    pool.query
      .mockRejectedValueOnce({
        severity: 'ERROR',
        code: '23505',
        schema: 'app',
        constraint: '_prisma_idx_unknown',
        message: 'duplicate',
      })
      .mockRejectedValueOnce(new Error('metadata unavailable'))
    const adapter = await new PrismaKbAdapterFactory(pool).connect()
    await expect(adapter.executeRaw({ sql: 'UPDATE items SET value=1', args: [], argTypes: [] })).rejects.toMatchObject(
      {
        cause: {
          kind: 'UniqueConstraintViolation',
          constraint: { index: '_prisma_idx_unknown' },
          originalCode: '23505',
        },
      },
    )
  })

  test('does not rewrite question marks inside SQL literals, identifiers, or comments', () => {
    expect(rewriteQuestionMarkPlaceholders("SELECT '?', `?`, /* ? */ id FROM t WHERE a = ? -- ?\nAND b = ?")).toBe(
      "SELECT '?', `?`, /* ? */ id FROM t WHERE a = $1 -- ?\nAND b = $2",
    )
  })

  test('rewrites question marks while preserving hash comments, dollar quotes, and ?? escapes', () => {
    expect(rewriteQuestionMarkPlaceholders('SELECT ? # ?\nAND ?')).toBe('SELECT $1 # ?\nAND $2')
    expect(rewriteQuestionMarkPlaceholders('SELECT $$?$$, $tag$?$tag$, ?')).toBe('SELECT $$?$$, $tag$?$tag$, $1')
    expect(rewriteQuestionMarkPlaceholders('SELECT ??, ?')).toBe('SELECT ?, $1')
  })

  test('rejects script execution without borrowing a connection or executing SQL', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbAdapterFactory(pool, { schema: 'app_schema' }).connect()

    expect(() => adapter.executeScript('BEGIN; INSERT INTO records VALUES (1); ROLLBACK;')).toThrow(
      'Not implemented yet',
    )
    expect(pool.connect).not.toHaveBeenCalled()
    expect(pool.query).not.toHaveBeenCalled()
    expect(connection.query).not.toHaveBeenCalled()

    await adapter.dispose()
  })
})

test.skipIf(!process.env.TEST_KINGBASE_MYSQL_URI)(
  'real MYSQL unique errors restore custom names before and inside a single-connection transaction',
  async () => {
    const namespace = `kb_unique_${randomUUID().replaceAll('-', '')}`
    const adapter = await new PrismaKbAdapterFactory(
      { connectionString: process.env.TEST_KINGBASE_MYSQL_URI!, max: 1 },
      { schema: namespace },
    ).connect()
    const driver = adapter.underlyingDriver()
    let created = false
    try {
      await driver.query(`CREATE SCHEMA "${namespace}"`)
      created = true
      await driver.query(`CREATE TABLE "${namespace}".items(id INT PRIMARY KEY, value INT)`)
      await driver.query(`CREATE UNIQUE INDEX "_prisma_idx_error_probe" ON "${namespace}".items(value)`)
      await driver.query(
        `COMMENT ON INDEX "${namespace}"."_prisma_idx_error_probe" IS 'prisma:logical-index:custom''unique'`,
      )
      await driver.query(`INSERT INTO "${namespace}".items VALUES(1,1)`)
      const duplicate: SqlQuery = { sql: 'INSERT INTO items VALUES(3,1)', args: [], argTypes: [] }
      const expected = { cause: { kind: 'UniqueConstraintViolation', constraint: { index: "custom'unique" } } }
      await expect(adapter.queryRaw(duplicate)).rejects.toMatchObject(expected)
      const transaction = await adapter.startTransaction()
      try {
        await transaction.executeRaw({ sql: 'INSERT INTO items VALUES(2,2)', args: [], argTypes: [] })
        await expect(transaction.queryRaw(duplicate)).rejects.toMatchObject(expected)
      } finally {
        await transaction.executeRaw({ sql: 'ROLLBACK', args: [], argTypes: [] })
        await transaction.rollback()
      }
      expect((await adapter.queryRaw({ sql: 'SELECT COUNT(*)::INT FROM items', args: [], argTypes: [] })).rows).toEqual(
        [[1]],
      )
    } finally {
      if (created) await driver.query(`DROP SCHEMA "${namespace}" CASCADE`)
      await adapter.dispose()
    }
  },
)
