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
import { fieldToColumnType, mapArg, mapRow, UnsupportedNativeDataType } from './conversion'
import { convertDriverError } from './errors'

const debug = Debug('prisma:driver-adapter:kb')

type PoolConfig = Record<string, unknown>

type PoolVerifier = (client: KingbaseQueryableClient, callback: (error?: Error) => void) => void

type QueryConfig = {
  text: string
  values: unknown[]
  rowMode: 'array'
}

type Field = {
  name: string
  dataTypeID: number
  dataTypeModifier?: number
}

type QueryResult = {
  fields?: Field[]
  rows: Array<unknown[] | Record<string, unknown>>
  rowCount?: number | null
  /** MySQL-compatible drivers commonly expose this for INSERT statements. */
  insertId?: string | number | bigint
  /** Accept the alternate spelling used by some driver versions. */
  lastInsertId?: string | number | bigint
}

type KingbaseQueryableClient = {
  query(query: QueryConfig | string): Promise<QueryResult>
}

type KingbaseClient = KingbaseQueryableClient & {
  release(error?: Error): void
  on?(event: string, listener: (error: unknown) => void): void
  off?(event: string, listener: (error: unknown) => void): void
}

type KingbasePool = KingbaseQueryableClient & {
  connect(): Promise<KingbaseClient>
  end(): Promise<void>
  on?(event: string, listener: (error: unknown) => void): void
  off?(event: string, listener: (error: unknown) => void): void
}

type KingbaseRuntimeModule = {
  Pool: new (config: PoolConfig) => KingbasePool
  default?: KingbaseRuntimeModule
}

const runtimeModule = kingbaseModule as unknown as KingbaseRuntimeModule
const runtime = runtimeModule.default ?? runtimeModule

class KingbaseQueryable<Client extends KingbaseQueryableClient> implements SqlQueryable {
  readonly provider = 'kingbase-mysql' as const
  readonly adapterName = packageName

  constructor(
    protected readonly client: Client,
    protected readonly adapterOptions?: PrismaKbOptions,
    private readonly pool?: KingbasePool,
  ) {}

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const tag = '[js::query_raw]'
    debug(`${tag} %O`, query)

    const { result, lastInsertId: insertLastInsertId } = await this.performQueryRaw(query)
    const fields = result.fields ?? []

    let columnTypes: SqlResultSet['columnTypes']
    try {
      columnTypes = fields.map((field) => fieldToColumnType(field.dataTypeID, field.dataTypeModifier))
    } catch (error) {
      if (error instanceof UnsupportedNativeDataType) {
        throw new DriverAdapterError({
          kind: 'UnsupportedNativeDataType',
          type: error.type,
        })
      }
      throw error
    }

    const lastInsertId = insertLastInsertId ?? normalizeLastInsertId(result.insertId ?? result.lastInsertId)

    return {
      columnNames: fields.map((field) => field.name),
      columnTypes,
      rows: result.rows.map((row) => mapRow(row, fields)),
      lastInsertId,
    }
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    const tag = '[js::execute_raw]'
    debug(`${tag} %O`, query)

    return (await this.performIO(query)).rowCount ?? 0
  }

  /**
   * `LAST_INSERT_ID()` is connection-local. Pool.query() releases its client
   * before resolving, so keep an INSERT and the fallback lookup on the same
   * checked-out client.
   */
  private async performQueryRaw(query: SqlQuery): Promise<{ result: QueryResult; lastInsertId?: string }> {
    if (!isInsertQuery(query.sql)) {
      return { result: await this.performIO(query) }
    }

    if (!this.pool) {
      return this.performInsertQuery(query, this.client)
    }

    const connection = await this.pool.connect().catch((error) => this.onError(error))
    let releaseError: Error | undefined

    try {
      return await this.performInsertQuery(query, connection)
    } catch (error) {
      releaseError = error instanceof Error ? error : undefined
      throw error
    } finally {
      connection.release(releaseError)
    }
  }

  private async performInsertQuery(
    query: SqlQuery,
    client: KingbaseQueryableClient,
  ): Promise<{ result: QueryResult; lastInsertId?: string }> {
    const result = await this.performIO(query, client)
    const lastInsertId =
      normalizeLastInsertId(result.insertId ?? result.lastInsertId) ?? (await this.fetchLastInsertId(query.sql, client))

    return { result, lastInsertId }
  }

  /**
   * The PostgreSQL-compatible result shape does not always expose MySQL's
   * `insertId`. Kingbase MySQL mode still supports LAST_INSERT_ID(), so use
   * it as a fallback for INSERT statements used by the query compiler.
   */
  private async fetchLastInsertId(
    sql: string,
    client: KingbaseQueryableClient = this.client,
  ): Promise<string | undefined> {
    if (!isInsertQuery(sql)) {
      return undefined
    }

    try {
      const result = await client.query({
        text: 'SELECT LAST_INSERT_ID()',
        values: [],
        rowMode: 'array',
      })
      return normalizeLastInsertId(result.rows[0]?.[0] as string | number | bigint | undefined)
    } catch (error) {
      debug('Kingbase did not return a last insert id: %O', error)
      this.onError(error)
    }
  }

  private async performIO(query: SqlQuery, client: KingbaseQueryableClient = this.client): Promise<QueryResult> {
    const values = query.args.map((arg, index) => mapArg(arg, query.argTypes[index]))

    try {
      return await client.query({
        text: rewriteQuestionMarkPlaceholders(query.sql),
        values,
        rowMode: 'array',
      })
    } catch (error) {
      this.onError(error)
    }
  }

  protected onError(error: unknown): never {
    debug('Error in Kingbase query: %O', error)
    throw new DriverAdapterError(convertDriverError(error))
  }
}

function isInsertQuery(sql: string): boolean {
  return /^\s*insert\b/i.test(sql)
}

function normalizeLastInsertId(value: string | number | bigint | undefined): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}

class KingbaseTransaction extends KingbaseQueryable<KingbaseClient> implements Transaction {
  constructor(
    client: KingbaseClient,
    readonly options: TransactionOptions,
    readonly kbOptions?: PrismaKbOptions,
    readonly cleanup?: () => void,
  ) {
    super(client, kbOptions)
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

export type PrismaKbOptions = {
  /** The schema/database name used by the generated query plan. */
  schema?: string
  /** Whether an externally supplied pool should be closed by the adapter. */
  disposeExternalPool?: boolean
  /** Receives errors emitted by an idle pool connection. */
  onPoolError?: (error: unknown) => void
  /** Receives errors emitted by a transaction connection. */
  onConnectionError?: (error: unknown) => void
}

export class PrismaKbAdapter extends KingbaseQueryable<KingbasePool> implements SqlDriverAdapter {
  constructor(
    client: KingbasePool,
    protected readonly kbOptions?: PrismaKbOptions,
    private readonly release?: () => Promise<void>,
    private readonly underlyingPool: KingbasePool = client,
  ) {
    super(client, kbOptions, client)
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    const options: TransactionOptions = { usePhantomQuery: false }
    const connection = await this.client.connect().catch((error) => this.onError(error))

    const onError = (error: unknown) => {
      debug('Error from Kingbase connection: %O', error)
      this.kbOptions?.onConnectionError?.(error)
    }
    connection.on?.('error', onError)

    const cleanup = () => connection.off?.('error', onError)

    try {
      const transaction = new KingbaseTransaction(connection, options, this.kbOptions, cleanup)
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

  async executeScript(script: string): Promise<void> {
    for (const statement of splitStatements(script)) {
      try {
        await this.client.query(statement)
      } catch (error) {
        this.onError(error)
      }
    }
  }

  getConnectionInfo(): ConnectionInfo {
    return {
      schemaName: this.kbOptions?.schema,
      // Kingbase accepts at most i16::MAX bind parameters, even though its
      // MySQL-compatible SQL dialect otherwise follows MySQL semantics.
      maxBindValues: 32767,
      supportsRelationJoins: false,
    }
  }

  async dispose(): Promise<void> {
    return this.release?.()
  }

  underlyingDriver(): KingbasePool {
    return this.underlyingPool
  }
}

export class PrismaKbAdapterFactory implements SqlDriverAdapterFactory {
  readonly provider = 'kingbase-mysql' as const
  readonly adapterName = packageName

  private readonly poolOrConfig: { type: 'pool'; pool: KingbasePool } | { type: 'config'; config: PoolConfig }
  private readonly options?: PrismaKbOptions
  private externalPoolClaimed = false

  constructor(poolOrConfig: KingbasePool | PoolConfig | string, options?: PrismaKbOptions) {
    this.poolOrConfig = isPool(poolOrConfig)
      ? { type: 'pool', pool: poolOrConfig }
      : { type: 'config', config: normalizePoolConfig(poolOrConfig) }
    const schema = options?.schema ?? getSchemaFromPoolOrConfig(poolOrConfig)
    this.options = schema === undefined ? options : { ...options, schema }
  }

  connect(): Promise<PrismaKbAdapter> {
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
        : new runtime.Pool(configureSearchPath(poolOrConfig.config, this.options?.schema))
    const pool =
      poolOrConfig.type === 'pool'
        ? configureExternalKingbasePool(underlyingPool, this.options?.schema)
        : underlyingPool
    const onPoolError = (error: unknown) => this.options?.onPoolError?.(error)
    underlyingPool.on?.('error', onPoolError)

    return Promise.resolve(
      new PrismaKbAdapter(
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

function isPool(value: unknown): value is KingbasePool {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<KingbasePool>).connect === 'function' &&
    typeof (value as Partial<KingbasePool>).end === 'function'
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

function getSchemaFromPoolOrConfig(poolOrConfig: KingbasePool | PoolConfig | string): string | undefined {
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

function configureSearchPath(config: PoolConfig, schema: string | undefined): PoolConfig {
  if (!schema) {
    return config
  }

  const existingVerify = config.verify
  const verify: PoolVerifier = (client, callback) => {
    const setSearchPath = () => {
      void setClientSearchPath(client, schema).then(
        () => callback(),
        (error) => callback(error instanceof Error ? error : new Error(String(error))),
      )
    }

    if (typeof existingVerify !== 'function') {
      setSearchPath()
      return
    }

    try {
      const verifyExistingConnection = existingVerify as PoolVerifier
      verifyExistingConnection(client, (error) => {
        if (error) {
          callback(error)
          return
        }
        setSearchPath()
      })
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)))
    }
  }

  return { ...config, verify }
}

function configureExternalKingbasePool(pool: KingbasePool, schema: string | undefined): KingbasePool {
  if (!schema) {
    return pool
  }

  const connect = async (): Promise<KingbaseClient> => {
    const connection = await pool.connect()

    try {
      await setClientSearchPath(connection, schema)
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

function setClientSearchPath(client: KingbaseQueryableClient, schema: string): Promise<QueryResult> {
  return client.query(`SET search_path TO "${schema.replaceAll('"', '""')}"`)
}

function normalizeConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString)
    if (url.protocol === 'kingbase-mysql:') {
      // The Prisma provider name is not a driver URL scheme. kingbasedb's
      // connection-string parser accepts the Kingbase scheme, not postgres://.
      url.protocol = 'kingbase:'
    }

    // `sslaccept` is a Prisma/MySQL connection parameter, while kingbasedb
    // uses the PostgreSQL-compatible `sslmode` parameter. Translate it before
    // handing the URL to the driver so strict mode cannot silently disable
    // certificate verification.
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

/**
 * The Kingbase MySQL query visitor emits `?` placeholders, while the
 * pg-compatible kingbasedb driver consumes numbered `$n` placeholders.
 * Rewrite only placeholders outside quoted SQL and comments.
 */
export function rewriteQuestionMarkPlaceholders(sql: string): string {
  let result = ''
  let parameterNumber = 1
  let quote: "'" | '"' | '`' | undefined
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < sql.length; index++) {
    const character = sql[index]
    const nextCharacter = sql[index + 1]

    if (lineComment) {
      result += character
      if (character === '\n') {
        lineComment = false
      }
      continue
    }

    if (blockComment) {
      result += character
      if (character === '*' && nextCharacter === '/') {
        result += nextCharacter
        index++
        blockComment = false
      }
      continue
    }

    if (quote !== undefined) {
      result += character

      if (character === '\\' && quote === "'" && nextCharacter !== undefined) {
        result += nextCharacter
        index++
      } else if (character === quote) {
        if (nextCharacter === quote) {
          result += nextCharacter
          index++
        } else {
          quote = undefined
        }
      }
      continue
    }

    if (character === '#') {
      result += character
      lineComment = true
      continue
    }

    if (character === '$') {
      const end = skipDollarQuote(sql, index)
      if (end !== undefined) {
        result += sql.slice(index, end)
        index = end - 1
        continue
      }
    }

    if (character === '-' && nextCharacter === '-') {
      result += '--'
      index++
      lineComment = true
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      result += '/*'
      index++
      blockComment = true
      continue
    }

    if (character === "'" || character === '"' || character === '`') {
      result += character
      quote = character
      continue
    }

    if (character === '?') {
      // `??` is a literal `?` in Kingbase's MySQL-compatibility layer.
      if (nextCharacter === '?') {
        result += '?'
        index++
      } else {
        result += `$${parameterNumber++}`
      }
    } else {
      result += character
    }
  }

  return result
}

function skipDollarQuote(sql: string, start: number): number | undefined {
  // A `$` preceded by an identifier character belongs to that identifier
  // (PostgreSQL allows `$` in identifiers), not a dollar-quote opener.
  if (start > 0 && isIdentifierCont(sql[start - 1])) {
    return undefined
  }

  let tagEnd = start + 1
  if (tagEnd >= sql.length) {
    return undefined
  }

  if (sql[tagEnd] !== '$') {
    if (!isIdentifierStart(sql[tagEnd])) {
      return undefined
    }
    tagEnd += 1
    while (tagEnd < sql.length && sql[tagEnd] !== '$') {
      if (!isIdentifierCont(sql[tagEnd])) {
        return undefined
      }
      tagEnd += 1
    }
    if (tagEnd >= sql.length) {
      return undefined
    }
  }

  const tag = sql.slice(start, tagEnd + 1)
  const closeIndex = sql.indexOf(tag, tagEnd + 1)
  return closeIndex === -1 ? sql.length : closeIndex + tag.length
}

function isIdentifierStart(character: string): boolean {
  return /[a-zA-Z_]/.test(character)
}

function isIdentifierCont(character: string): boolean {
  return /[a-zA-Z0-9_]/.test(character)
}

/** Split migration scripts without treating semicolons in literals or comments as delimiters. */
export function splitStatements(script: string): string[] {
  const statements: string[] = []
  let statement = ''
  let quote: "'" | '"' | '`' | undefined
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < script.length; index++) {
    const character = script[index]
    const nextCharacter = script[index + 1]

    if (lineComment) {
      statement += character
      if (character === '\n') {
        lineComment = false
      }
      continue
    }

    if (blockComment) {
      statement += character
      if (character === '*' && nextCharacter === '/') {
        statement += nextCharacter
        index++
        blockComment = false
      }
      continue
    }

    if (quote !== undefined) {
      statement += character

      if (character === '\\' && quote === "'" && nextCharacter !== undefined) {
        statement += nextCharacter
        index++
      } else if (character === quote) {
        if (nextCharacter === quote) {
          statement += nextCharacter
          index++
        } else {
          quote = undefined
        }
      }
      continue
    }

    if (character === '$') {
      const end = skipDollarQuote(script, index)
      if (end !== undefined) {
        statement += script.slice(index, end)
        index = end - 1
        continue
      }
    }

    if (character === '#') {
      statement += character
      lineComment = true
      continue
    }

    if (character === '-' && nextCharacter === '-') {
      statement += '--'
      index++
      lineComment = true
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      statement += '/*'
      index++
      blockComment = true
      continue
    }

    if (character === "'" || character === '"' || character === '`') {
      statement += character
      quote = character
      continue
    }

    if (character === ';') {
      const trimmed = statement.trim()
      if (trimmed) {
        statements.push(trimmed)
      }
      statement = ''
    } else {
      statement += character
    }
  }

  const trimmed = statement.trim()
  if (trimmed) {
    statements.push(trimmed)
  }

  return statements
}
