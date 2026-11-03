import type {
  ConnectionInfo,
  IsolationLevel,
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
  SqlQuery,
  SqlQueryable,
  SqlResultSet,
  Transaction,
  TransactionOptions,
} from '@prisma-kb/driver-adapter-utils'
import { Debug, DriverAdapterError } from '@prisma-kb/driver-adapter-utils'
// kingbasedb is a pg-compatible driver, but does not currently publish a
// stable TypeScript module declaration. Keep the runtime dependency isolated
// behind the small structural interfaces used by this adapter.
// @ts-ignore: kingbasedb exposes the pg-compatible runtime API.
import * as kingbaseModule from 'kingbasedb'

import { name as packageName } from '../package.json'
import { convertDriverError } from './errors'
import {
  fieldToOracleColumnType,
  jsonTypeIds,
  mapOracleArg,
  mapOracleRow,
  UnsupportedOracleNativeDataType,
} from './kingbase-oracle-conversion'

const debug = Debug('prisma:driver-adapter:kb-oracle')

type PoolConfig = Record<string, unknown>

type PoolVerifier = (client: KingbaseOracleQueryableClient, callback: (error?: Error) => void) => void

type QueryConfig = {
  text: string
  values: unknown[]
  rowMode: 'array'
  types?: { getTypeParser(oid: number, format?: string): (value: string) => unknown }
}

type Field = {
  name: string
  dataTypeID: number
}

type QueryResult = {
  fields?: Field[]
  rows: Array<unknown[] | Record<string, unknown>>
  rowCount?: number | null
}

type KingbaseOracleQueryableClient = {
  query(query: QueryConfig | string): Promise<QueryResult>
}

type KingbaseOracleClient = KingbaseOracleQueryableClient & {
  release(error?: Error): void
  on?(event: string, listener: (error: unknown) => void): void
  off?(event: string, listener: (error: unknown) => void): void
}

type KingbaseOraclePool = KingbaseOracleQueryableClient & {
  connect(): Promise<KingbaseOracleClient>
  end(): Promise<void>
  on?(event: string, listener: (error: unknown) => void): void
  off?(event: string, listener: (error: unknown) => void): void
}

type KingbaseRuntimeModule = {
  Pool: new (config: PoolConfig) => KingbaseOraclePool
  types: {
    getTypeParser(oid: number, format?: string): (value: string) => unknown
  }
  default?: KingbaseRuntimeModule
}

const runtimeModule = kingbaseModule as unknown as KingbaseRuntimeModule
const runtime = runtimeModule.default ?? runtimeModule

class KingbaseOracleQueryable<Client extends KingbaseOracleQueryableClient> implements SqlQueryable {
  readonly provider = 'kingbase-oracle' as const
  readonly adapterName = packageName

  constructor(
    protected readonly client: Client,
    protected readonly adapterOptions?: PrismaKbOracleOptions,
  ) {}

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const tag = '[js::query_raw]'
    debug(`${tag} %O`, query)

    const result = await this.performIO(query)
    const fields = result.fields ?? []

    let columnTypes: SqlResultSet['columnTypes']
    try {
      columnTypes = fields.map((field) => fieldToOracleColumnType(field.dataTypeID))
    } catch (error) {
      if (error instanceof UnsupportedOracleNativeDataType) {
        throw new DriverAdapterError({
          kind: 'UnsupportedNativeDataType',
          type: error.type,
        })
      }
      throw error
    }

    return {
      columnNames: fields.map((field) => field.name),
      columnTypes,
      rows: result.rows.map((row) => mapOracleRow(row, fields)),
    }
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    const tag = '[js::execute_raw]'
    debug(`${tag} %O`, query)

    return (await this.performIO(query)).rowCount ?? 0
  }

  private async performIO(query: SqlQuery): Promise<QueryResult> {
    const values = query.args.map((arg, index) => mapOracleArg(arg, query.argTypes[index]))

    try {
      // The Kingbase Oracle visitor already emits PostgreSQL-wire `$n`
      // placeholders. Unlike the MySQL adapter, never rewrite the SQL here.
      return await this.client.query({
        text: query.sql,
        values,
        rowMode: 'array',
        types: {
          getTypeParser: (oid, format = 'text') => {
            // Preserve JSON wire text for the Client's decoder. In particular,
            // decoded strings such as "123" cannot be distinguished from JSON
            // numbers by inspecting their contents.
            if (format === 'text' && jsonTypeIds.has(oid)) {
              return (value) => value
            }
            return runtime.types.getTypeParser(oid, format)
          },
        },
      })
    } catch (error) {
      this.onError(error)
    }
  }

  protected onError(error: unknown): never {
    debug('Error in Kingbase Oracle query: %O', error)
    throw new DriverAdapterError(convertDriverError(error))
  }
}

class KingbaseOracleTransaction extends KingbaseOracleQueryable<KingbaseOracleClient> implements Transaction {
  constructor(
    client: KingbaseOracleClient,
    readonly options: TransactionOptions,
    readonly oracleOptions?: PrismaKbOracleOptions,
    readonly cleanup?: () => void,
  ) {
    super(client, oracleOptions)
  }

  commit(): Promise<void> {
    debug('[js::commit]')
    this.cleanup?.()
    this.client.release()
    return Promise.resolve()
  }

  rollback(): Promise<void> {
    debug('[js::rollback]')
    this.cleanup?.()
    this.client.release()
    return Promise.resolve()
  }

  async createSavepoint(name: string): Promise<void> {
    await this.executeRaw({ sql: `SAVEPOINT ${name}`, args: [], argTypes: [] })
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    await this.executeRaw({ sql: `ROLLBACK TO SAVEPOINT ${name}`, args: [], argTypes: [] })
  }

  async releaseSavepoint(name: string): Promise<void> {
    await this.executeRaw({ sql: `RELEASE SAVEPOINT ${name}`, args: [], argTypes: [] })
  }
}

export type PrismaKbOracleOptions = {
  /** The schema/database name used by the generated query plan. */
  schema?: string
  /** Whether an externally supplied pool should be closed by the adapter. */
  disposeExternalPool?: boolean
  /** Receives errors emitted by an idle pool connection. */
  onPoolError?: (error: unknown) => void
  /** Receives errors emitted by a transaction connection. */
  onConnectionError?: (error: unknown) => void
}

export class PrismaKbOracleAdapter extends KingbaseOracleQueryable<KingbaseOraclePool> implements SqlDriverAdapter {
  constructor(
    client: KingbaseOraclePool,
    protected readonly oracleOptions?: PrismaKbOracleOptions,
    private readonly release?: () => Promise<void>,
    private readonly underlyingPool: KingbaseOraclePool = client,
  ) {
    super(client, oracleOptions)
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    const options: TransactionOptions = { usePhantomQuery: false }
    const connection = await this.client.connect().catch((error) => this.onError(error))

    const onError = (error: unknown) => {
      debug('Error from Kingbase Oracle connection: %O', error)
      this.oracleOptions?.onConnectionError?.(error)
    }
    connection.on?.('error', onError)

    const cleanup = () => connection.off?.('error', onError)

    try {
      const transaction = new KingbaseOracleTransaction(connection, options, this.oracleOptions, cleanup)
      await transaction.executeRaw({ sql: 'BEGIN', args: [], argTypes: [] })
      if (isolationLevel) {
        await transaction.executeRaw({
          sql: `SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`,
          args: [],
          argTypes: [],
        })
      }
      return transaction
    } catch (error) {
      cleanup()
      connection.release(error instanceof Error ? error : undefined)
      this.onError(error)
    }
  }

  executeScript(_script: string): Promise<void> {
    throw new Error('Not implemented yet')
  }

  getConnectionInfo(): ConnectionInfo {
    return {
      schemaName: this.oracleOptions?.schema,
      // Kingbase uses the PostgreSQL Bind message, whose parameter count is
      // a signed 16-bit integer in both compatibility modes.
      maxBindValues: 32767,
      // The Oracle visitor renders LATERAL joins and JSON aggregation. Keep
      // this in sync with the connector's `LateralJoin` capability.
      supportsRelationJoins: true,
    }
  }

  async dispose(): Promise<void> {
    return this.release?.()
  }

  underlyingDriver(): KingbaseOraclePool {
    return this.underlyingPool
  }
}

export class PrismaKbOracleAdapterFactory implements SqlDriverAdapterFactory {
  readonly provider = 'kingbase-oracle' as const
  readonly adapterName = packageName

  private readonly poolOrConfig: { type: 'pool'; pool: KingbaseOraclePool } | { type: 'config'; config: PoolConfig }
  private readonly options?: PrismaKbOracleOptions
  private externalPoolClaimed = false

  constructor(poolOrConfig: KingbaseOraclePool | PoolConfig | string, options?: PrismaKbOracleOptions) {
    this.poolOrConfig = isPool(poolOrConfig)
      ? { type: 'pool', pool: poolOrConfig }
      : { type: 'config', config: normalizePoolConfig(poolOrConfig) }
    const schema = options?.schema ?? getSchemaFromPoolOrConfig(poolOrConfig)
    this.options = schema === undefined ? options : { ...options, schema }
  }

  connect(): Promise<PrismaKbOracleAdapter> {
    const poolOrConfig = this.poolOrConfig
    const ownsPool = poolOrConfig.type === 'config' || this.options?.disposeExternalPool === true

    if (poolOrConfig.type === 'pool' && ownsPool) {
      if (this.externalPoolClaimed) {
        throw new Error('connect() can only be called once when disposeExternalPool is true')
      }
      this.externalPoolClaimed = true
    }

    const underlyingPool =
      poolOrConfig.type === 'pool'
        ? poolOrConfig.pool
        : new runtime.Pool(configureOracleSession(poolOrConfig.config, this.options?.schema))
    const pool =
      poolOrConfig.type === 'pool' ? configureExternalOraclePool(underlyingPool, this.options?.schema) : underlyingPool
    const onPoolError = (error: unknown) => this.options?.onPoolError?.(error)
    underlyingPool.on?.('error', onPoolError)

    return Promise.resolve(
      new PrismaKbOracleAdapter(
        pool,
        this.options,
        async () => {
          if (ownsPool) {
            await underlyingPool.end()
          } else {
            underlyingPool.off?.('error', onPoolError)
          }
        },
        underlyingPool,
      ),
    )
  }
}

function isPool(value: unknown): value is KingbaseOraclePool {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<KingbaseOraclePool>).connect === 'function' &&
    typeof (value as Partial<KingbaseOraclePool>).end === 'function'
  )
}

function normalizePoolConfig(config: PoolConfig | string): PoolConfig {
  if (typeof config === 'string') {
    return { connectionString: normalizeConnectionString(config) }
  }

  const connectionString = config.connectionString
  if (typeof connectionString === 'string') {
    return { ...config, connectionString: normalizeConnectionString(connectionString) }
  }

  return config
}

function getSchemaFromPoolOrConfig(poolOrConfig: KingbaseOraclePool | PoolConfig | string): string | undefined {
  if (typeof poolOrConfig === 'string') {
    return getSchemaFromConnectionString(poolOrConfig)
  }

  if (isPool(poolOrConfig)) {
    return undefined
  }

  return typeof poolOrConfig.connectionString === 'string'
    ? getSchemaFromConnectionString(poolOrConfig.connectionString)
    : undefined
}

function getSchemaFromConnectionString(connectionString: string): string | undefined {
  try {
    return new URL(connectionString).searchParams.get('schema') ?? undefined
  } catch {
    return undefined
  }
}

function configureOracleSession(config: PoolConfig, schema: string | undefined): PoolConfig {
  const existingVerify = config.verify
  const verify: PoolVerifier = (client, callback) => {
    const configureSession = () => {
      void configureOracleClientSession(client, schema).then(
        () => callback(),
        (error) => callback(error instanceof Error ? error : new Error(String(error))),
      )
    }

    if (typeof existingVerify !== 'function') {
      configureSession()
      return
    }

    try {
      const verifyExistingConnection = existingVerify as PoolVerifier
      verifyExistingConnection(client, (error) => {
        if (error) {
          callback(error)
          return
        }
        configureSession()
      })
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)))
    }
  }

  return { ...config, verify }
}

function configureExternalOraclePool(pool: KingbaseOraclePool, schema: string | undefined): KingbaseOraclePool {
  const connect = async (): Promise<KingbaseOracleClient> => {
    const connection = await pool.connect()

    try {
      await configureOracleClientSession(connection, schema)
      return connection
    } catch (error) {
      connection.release(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  return {
    async query(query) {
      const connection = await connect()

      try {
        const result = await connection.query(query)
        connection.release()
        return result
      } catch (error) {
        connection.release(error instanceof Error ? error : new Error(String(error)))
        throw error
      }
    },
    connect,
    end: () => pool.end(),
    on: (event, listener) => pool.on?.(event, listener),
    off: (event, listener) => pool.off?.(event, listener),
  }
}

async function configureOracleClientSession(
  client: KingbaseOracleQueryableClient,
  schema: string | undefined,
): Promise<void> {
  // TIMESTAMP WITH LOCAL TIME ZONE is returned as a plain TIMESTAMP in the
  // session time zone. Configure both owned and external pool connections so
  // the adapter can consistently expose Prisma DateTime values as UTC.
  await client.query("SET TIME ZONE 'UTC'")

  if (schema !== undefined) {
    await client.query(`SET search_path TO "${schema.replaceAll('"', '""')}"`)
  }
}

function normalizeConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString)
    if (url.protocol === 'kingbase-oracle:') {
      // The Prisma provider name is not a driver URL scheme. kingbasedb's
      // connection-string parser accepts `kingbase:`, not the Prisma scheme.
      url.protocol = 'kingbase:'
    }

    // Keep Prisma's connection-string TLS option consistent with the
    // PostgreSQL-compatible driver option used by kingbasedb.
    const sslAccept = url.searchParams.get('sslaccept')
    if (sslAccept !== null) {
      if (url.searchParams.get('sslmode') !== 'disable') {
        url.searchParams.set('sslmode', sslAccept === 'accept_invalid_certs' ? 'no-verify' : 'verify-full')
      }
      url.searchParams.delete('sslaccept')
    }

    return url.toString()
  } catch {
    // Let kingbasedb report malformed connection strings with its own error.
  }

  return connectionString
}
