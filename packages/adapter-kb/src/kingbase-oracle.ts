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

  async executeScript(script: string): Promise<void> {
    for (const statement of splitOracleStatements(script)) {
      try {
        await this.client.query(statement)
      } catch (error) {
        this.onError(error)
      }
    }
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

/** Splits Oracle-compatible scripts while preserving procedural block bodies. */
export function splitOracleStatements(script: string): string[] {
  const statements: string[] = []
  let statement = ''
  let quote: "'" | '"' | '`' | undefined
  let lineComment = false
  let blockComment = false
  let proceduralBlock = false

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
      const dollarQuote = readDollarQuote(script, index)
      if (dollarQuote !== undefined) {
        const closeIndex = script.indexOf(dollarQuote, index + dollarQuote.length)
        if (closeIndex !== -1) {
          statement += script.slice(index, closeIndex + dollarQuote.length)
          index = closeIndex + dollarQuote.length - 1
          continue
        }
      }
    }

    if (
      character === 'q' ||
      character === 'Q' ||
      ((character === 'n' || character === 'N') && (nextCharacter === 'q' || nextCharacter === 'Q'))
    ) {
      const alternativeQuoteEnd = readOracleAlternativeQuoteEnd(script, index)
      if (alternativeQuoteEnd !== undefined) {
        const closeIndex = script.indexOf(alternativeQuoteEnd.delimiter, alternativeQuoteEnd.contentStart)
        if (closeIndex !== -1) {
          statement += script.slice(index, closeIndex + alternativeQuoteEnd.delimiter.length)
          index = closeIndex + alternativeQuoteEnd.delimiter.length - 1
          continue
        }
      }
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

    if (proceduralBlock && character === '/' && isOracleScriptTerminator(script, index)) {
      addStatement(statements, statement)
      statement = ''
      proceduralBlock = false
      index = skipToNextLine(script, index)
      continue
    }

    if (character === ';' && !proceduralBlock) {
      addStatement(statements, statement)
      statement = ''
      continue
    }

    statement += character
    if (!proceduralBlock && isOracleProceduralBlock(statement) && hasOracleScriptTerminator(script, index + 1)) {
      proceduralBlock = true
    }
  }

  addStatement(statements, statement)
  return statements
}

function addStatement(statements: string[], statement: string): void {
  const trimmed = statement.trim()
  if (trimmed) {
    statements.push(trimmed)
  }
}

function readDollarQuote(sql: string, start: number): string | undefined {
  if (start > 0 && /[A-Za-z0-9_]/.test(sql[start - 1])) {
    return undefined
  }

  let end = start + 1
  if (end >= sql.length) {
    return undefined
  }

  if (sql[end] !== '$') {
    if (!/[A-Za-z_]/.test(sql[end])) {
      return undefined
    }
    end++
    while (end < sql.length && sql[end] !== '$') {
      if (!/[A-Za-z0-9_]/.test(sql[end])) {
        return undefined
      }
      end++
    }
  }

  return end < sql.length ? sql.slice(start, end + 1) : undefined
}

function readOracleAlternativeQuoteEnd(
  sql: string,
  start: number,
): { delimiter: string; contentStart: number } | undefined {
  const nationalPrefix =
    (sql[start] === 'n' || sql[start] === 'N') && (sql[start + 1] === 'q' || sql[start + 1] === 'Q')
  const quoteStart = nationalPrefix ? start + 1 : start

  if (
    (sql[quoteStart] !== 'q' && sql[quoteStart] !== 'Q') ||
    sql[quoteStart + 1] !== "'" ||
    (start > 0 && /[A-Za-z0-9_$#]/.test(sql[start - 1]))
  ) {
    return undefined
  }

  const openingDelimiter = sql[quoteStart + 2]
  if (openingDelimiter === undefined || /\s/.test(openingDelimiter) || openingDelimiter === "'") {
    return undefined
  }

  const closingDelimiter =
    {
      '[': ']',
      '{': '}',
      '(': ')',
      '<': '>',
    }[openingDelimiter] ?? openingDelimiter

  return {
    delimiter: `${closingDelimiter}'`,
    contentStart: quoteStart + 3,
  }
}

function isOracleProceduralBlock(statement: string): boolean {
  const statementWithoutLeadingComments = stripLeadingSqlComments(statement)

  return (
    /^(?:declare|begin)\b/i.test(statementWithoutLeadingComments) ||
    /^create\s+(?:or\s+replace\s+)?(?:(?:non)?editionable\s+)?(?:function|procedure|package(?:\s+body)?|trigger|type(?:\s+body)?)\b/i.test(
      statementWithoutLeadingComments,
    )
  )
}

function stripLeadingSqlComments(statement: string): string {
  let index = 0

  while (index < statement.length) {
    while (index < statement.length && /\s/.test(statement[index])) {
      index++
    }

    if (statement.startsWith('--', index)) {
      const lineEnd = statement.indexOf('\n', index + 2)
      if (lineEnd === -1) {
        return ''
      }
      index = lineEnd + 1
      continue
    }

    if (statement.startsWith('/*', index)) {
      const commentEnd = statement.indexOf('*/', index + 2)
      if (commentEnd === -1) {
        return ''
      }
      index = commentEnd + 2
      continue
    }

    break
  }

  return statement.slice(index)
}

function hasOracleScriptTerminator(script: string, start: number): boolean {
  return /(?:^|\n)\s*\/\s*(?:--[^\n]*)?(?:\n|$)/.test(script.slice(start))
}

function isOracleScriptTerminator(script: string, start: number): boolean {
  const lineStart = script.lastIndexOf('\n', start - 1) + 1
  const lineEnd = script.indexOf('\n', start)
  return /^\s*\/\s*(?:--.*)?$/.test(script.slice(lineStart, lineEnd === -1 ? script.length : lineEnd))
}

function skipToNextLine(script: string, start: number): number {
  const lineEnd = script.indexOf('\n', start)
  return lineEnd === -1 ? script.length : lineEnd
}
