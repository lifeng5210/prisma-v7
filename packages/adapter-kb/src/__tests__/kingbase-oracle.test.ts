import { ColumnTypeEnum, type SqlQuery } from '@prisma-kb/driver-adapter-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { PrismaKbOracleAdapterFactory, splitOracleStatements } from '../kingbase-oracle'

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
    expect(connection.query).toHaveBeenNthCalledWith(1, "SET TIME ZONE 'UTC'")
    expect(connection.query).toHaveBeenNthCalledWith(2, {
      text: 'SELECT "id" FROM "UserTest" WHERE "id" = $1',
      values: [1],
      rowMode: 'array',
    })
    expect(connection.release).toHaveBeenCalledOnce()
    expect(adapter.underlyingDriver()).toBe(pool)
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

    expect(connection.query).toHaveBeenNthCalledWith(1, "SET TIME ZONE 'UTC'")
    expect(connection.query).toHaveBeenCalledWith({ text: 'BEGIN', values: [], rowMode: 'array' })
    expect(connection.query).toHaveBeenCalledWith({
      text: 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
      values: [],
      rowMode: 'array',
    })

    await transaction.rollback()
    expect(connection.release).toHaveBeenCalledOnce()
  })

  test('configures every external pool connection with UTC and the selected schema', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbOracleAdapterFactory(pool, { schema: 'app_schema' }).connect()

    await adapter.queryRaw(query)

    expect(connection.query).toHaveBeenNthCalledWith(1, "SET TIME ZONE 'UTC'")
    expect(connection.query).toHaveBeenNthCalledWith(2, 'SET search_path TO "app_schema"')
    expect(connection.query).toHaveBeenNthCalledWith(3, {
      text: 'SELECT "id" FROM "UserTest" WHERE "id" = $1',
      values: [1],
      rowMode: 'array',
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

  test('configures owned pool connections with UTC and the selected schema', async () => {
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

    expect(client.query).toHaveBeenNthCalledWith(1, "SET TIME ZONE 'UTC'")
    expect(client.query).toHaveBeenNthCalledWith(2, 'SET search_path TO "app_schema"')

    await adapter.dispose()
  })

  test('executes Oracle procedural blocks without splitting their internal statements', async () => {
    const { pool, connection } = createPool()
    const adapter = await new PrismaKbOracleAdapterFactory(pool).connect()

    await adapter.executeScript(`
      CREATE TABLE "Log" ("id" INTEGER);
      BEGIN
        INSERT INTO "Log" ("id") VALUES (1);
        INSERT INTO "Log" ("id") VALUES (2);
      END;
      /
      SELECT * FROM "Log";
    `)

    expect(connection.query).toHaveBeenNthCalledWith(2, 'CREATE TABLE "Log" ("id" INTEGER)')
    expect(connection.query).toHaveBeenNthCalledWith(
      4,
      'BEGIN\n        INSERT INTO "Log" ("id") VALUES (1);\n        INSERT INTO "Log" ("id") VALUES (2);\n      END;',
    )
    expect(connection.query).toHaveBeenNthCalledWith(6, 'SELECT * FROM "Log"')
    expect(connection.release).toHaveBeenCalledTimes(3)
  })

  test('preserves semicolons inside dollar-quoted script bodies', () => {
    expect(splitOracleStatements('CREATE FUNCTION f() AS $$ BEGIN; END; $$; SELECT 1;')).toEqual([
      'CREATE FUNCTION f() AS $$ BEGIN; END; $$',
      'SELECT 1',
    ])
  })

  test('recognizes commented editionable procedures and Oracle alternative quotes', () => {
    expect(
      splitOracleStatements(`
        -- Keep this deployment comment with the procedure.
        /* A block comment can also precede CREATE. */
        CREATE OR REPLACE EDITIONABLE PROCEDURE write_log AS
        BEGIN
          INSERT INTO "Log" ("message") VALUES (q'[it's safe; keep this together]');
          INSERT INTO "Log" ("message") VALUES (q'{another; message}');
        END;
        /
        SELECT q'<a semicolon; and an apostrophe: it's>' AS "message";
        SELECT 1;
      `),
    ).toEqual([
      `-- Keep this deployment comment with the procedure.
        /* A block comment can also precede CREATE. */
        CREATE OR REPLACE EDITIONABLE PROCEDURE write_log AS
        BEGIN
          INSERT INTO "Log" ("message") VALUES (q'[it's safe; keep this together]');
          INSERT INTO "Log" ("message") VALUES (q'{another; message}');
        END;`,
      `SELECT q'<a semicolon; and an apostrophe: it's>' AS "message"`,
      'SELECT 1',
    ])
  })

  test('preserves semicolons and apostrophes inside national Oracle alternative quotes', () => {
    expect(
      splitOracleStatements(
        `SELECT nq'[it's; safe]' AS "lower"; SELECT NQ'{also; safe}' AS "upper"; SELECT nq'!'abc!' AS "same"; SELECT 1;`,
      ),
    ).toEqual([
      `SELECT nq'[it's; safe]' AS "lower"`,
      `SELECT NQ'{also; safe}' AS "upper"`,
      `SELECT nq'!'abc!' AS "same"`,
      'SELECT 1',
    ])
  })

  test('recognizes anonymous Oracle blocks after leading comments', () => {
    expect(
      splitOracleStatements(`
        -- Run both statements as one anonymous block.
        BEGIN
          NULL;
          NULL;
        END;
        /
        SELECT 1;
      `),
    ).toEqual([
      `-- Run both statements as one anonymous block.
        BEGIN
          NULL;
          NULL;
        END;`,
      'SELECT 1',
    ])
  })
})
