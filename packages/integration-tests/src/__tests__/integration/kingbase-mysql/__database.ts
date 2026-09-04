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
  name: 'kingbase-mysql',
  datasource: {
    url: (ctx) => getConnectionString(ctx),
  },
  async connect(ctx) {
    logKingbaseDatabaseStage(ctx, 'creating raw database client')
    const db = new runtime.Client({ connectionString: getConnectionString(ctx) })
    logKingbaseDatabaseStage(ctx, 'raw database client created; connecting')
    await db.connect()
    logKingbaseDatabaseStage(ctx, 'raw database client connected; running SELECT 1')
    await db.query('SELECT 1')
    logKingbaseDatabaseStage(ctx, 'SELECT 1 completed')
    return db
  },
  async beforeEach(db, sqlScenario, ctx: Context) {
    logKingbaseDatabaseStage(ctx, 'running database setup SQL')
    try {
      await db.query(`
        DROP SCHEMA IF EXISTS "${ctx.id}" CASCADE;
        CREATE SCHEMA "${ctx.id}";
        SET search_path TO "${ctx.id}";
        ${sqlScenario}
      `)
      logKingbaseDatabaseStage(ctx, 'database setup SQL completed')
    } finally {
      await close(db)
      logKingbaseDatabaseStage(ctx, 'raw database connection closed')
    }
  },
  afterEach: close,
  close,
} as Input<KingbaseClient>['database']

function getConnectionString(ctx: Context): string {
  const connectionString = process.env.TEST_KINGBASE_MYSQL_URI
  if (!connectionString) {
    throw new Error('TEST_KINGBASE_MYSQL_URI is not set')
  }

  const url = new URL(connectionString)
  url.searchParams.set('schema', ctx.id)
  return url.toString()
}

async function close(db: KingbaseClient): Promise<void> {
  if (!db.closed) {
    db.closed = true
    await db.end()
  }
}

function logKingbaseDatabaseStage(ctx: Context, stage: string): void {
  if (process.env.DEBUG_KINGBASE_MYSQL_INTEGRATION === '1') {
    process.stderr.write(`[kingbase-mysql] ${ctx.scenarioName}: ${stage}\n`)
  }
}
