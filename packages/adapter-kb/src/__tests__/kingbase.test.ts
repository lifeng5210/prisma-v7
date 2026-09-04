import { ColumnTypeEnum, type SqlQuery } from '@prisma/driver-adapter-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { PrismaKbAdapterFactory, rewriteQuestionMarkPlaceholders, splitStatements } from '../kingbase'

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

const query: SqlQuery = {
  sql: 'SELECT id FROM `UserTest` WHERE id = ?',
  args: [1],
  argTypes: [{ scalarType: 'int', arity: 'scalar' }],
}

function createPool(): { pool: MockPool; connection: MockConnection } {
  const connection: MockConnection = {
    query: vi.fn().mockResolvedValue({ fields: [], rows: [], rowCount: 0 }),
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
    })
    expect(adapter.provider).toBe('kingbase-mysql')

    await adapter.dispose()
    expect(pool.off).toHaveBeenCalled()
  })

  test('reads LAST_INSERT_ID on the same connection as a pooled insert', async () => {
    const { pool, connection } = createPool()
    connection.query.mockResolvedValueOnce({ fields: [], rows: [], rowCount: 1 }).mockResolvedValueOnce({
      fields: [{ name: 'LAST_INSERT_ID()', dataTypeID: 20 }],
      rows: [[42]],
      rowCount: 1,
    })
    const adapter = await new PrismaKbAdapterFactory(pool).connect()

    await expect(
      adapter.queryRaw({
        sql: 'INSERT INTO `UserTest` (`id`) VALUES (?)',
        args: [1],
        argTypes: [{ scalarType: 'int', arity: 'scalar' }],
      }),
    ).resolves.toMatchObject({ lastInsertId: '42' })

    expect(pool.query).not.toHaveBeenCalled()
    expect(connection.query).toHaveBeenNthCalledWith(1, {
      text: 'INSERT INTO `UserTest` (`id`) VALUES ($1)',
      values: [1],
      rowMode: 'array',
    })
    expect(connection.query).toHaveBeenNthCalledWith(2, {
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
    connection.query.mockResolvedValueOnce({ fields: [], rows: [], rowCount: 1 }).mockRejectedValueOnce(error)
    const adapter = await new PrismaKbAdapterFactory(pool).connect()

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

  test('starts and releases a transaction connection', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbAdapterFactory(pool).connect()
    const transaction = await adapter.startTransaction('READ COMMITTED')

    expect(connection.query).toHaveBeenCalledWith({ text: 'BEGIN', values: [], rowMode: 'array' })
    expect(connection.query).toHaveBeenCalledWith({
      text: 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
      values: [],
      rowMode: 'array',
    })

    await transaction.rollback()
    expect(connection.query).not.toHaveBeenCalledWith({ text: 'ROLLBACK', values: [], rowMode: 'array' })
    expect(connection.release).toHaveBeenCalledOnce()
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

  test('splits scripts without breaking literals or comments', () => {
    expect(splitStatements("INSERT INTO t VALUES ('a;b'); -- c;\nSELECT 1; /* d; */ SELECT 2;")).toEqual([
      "INSERT INTO t VALUES ('a;b')",
      '-- c;\nSELECT 1',
      '/* d; */ SELECT 2',
    ])
  })
})
