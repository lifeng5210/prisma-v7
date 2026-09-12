// @ts-ignore: kingbasedb does not currently publish stable TypeScript declarations.
import * as kingbaseModule from 'kingbasedb'

import type { Context, Input } from '../../__helpers__/integrationTest'

type KingbaseClient = {
  connect: () => Promise<void>
  query: (query: string) => Promise<unknown>
  end: () => Promise<void>
  closed?: boolean
}

type KingbaseRuntime = {
  Client: new (config: { connectionString: string }) => KingbaseClient
  default?: KingbaseRuntime
}

const runtimeModule = kingbaseModule as unknown as KingbaseRuntime
const runtime = runtimeModule.default ?? runtimeModule

export const database = {
  name: 'kingbase-oracle',
  datasource: {
    url: (ctx) => getConnectionString(ctx),
  },
  async connect(ctx) {
    const db = new runtime.Client({ connectionString: getDriverConnectionString(ctx) })
    await db.connect()
    return db
  },
  async beforeEach(db, sqlScenario, ctx: Context) {
    try {
      await db.query(`
        DROP SCHEMA IF EXISTS "${ctx.id}" CASCADE;
        CREATE SCHEMA "${ctx.id}";
        SET search_path TO "${ctx.id}";
        ${sqlScenario}
      `)
    } finally {
      await close(db)
    }
  },
  afterEach: cleanupSchema,
  close,
} as Input<KingbaseClient>['database']

function getConnectionString(ctx: Context): string {
  const connectionString = process.env.TEST_KINGBASE_ORACLE_URI
  if (!connectionString) {
    throw new Error('TEST_KINGBASE_ORACLE_URI is not set')
  }

  const url = new URL(connectionString)
  url.searchParams.set('schema', ctx.id)
  return url.toString()
}

function getDriverConnectionString(ctx: Context): string {
  const url = new URL(getConnectionString(ctx))
  // kingbasedb uses its native wire-protocol scheme. The Prisma datasource
  // retains `kingbase-oracle` so Schema Engine selects the Oracle connector.
  url.protocol = 'kingbase:'
  return url.toString()
}

function getCleanupConnectionString(ctx: Context): string {
  const url = new URL(getDriverConnectionString(ctx))
  url.searchParams.delete('schema')
  return url.toString()
}

async function cleanupSchema(db: KingbaseClient, ctx: Context): Promise<void> {
  await close(db)

  const cleanupDb = new runtime.Client({ connectionString: getCleanupConnectionString(ctx) })
  try {
    await cleanupDb.connect()
    await cleanupDb.query(`DROP SCHEMA IF EXISTS "${ctx.id.replaceAll('"', '""')}" CASCADE`)
  } finally {
    await close(cleanupDb)
  }
}

async function close(db: KingbaseClient): Promise<void> {
  if (!db.closed) {
    db.closed = true
    await db.end()
  }
}
