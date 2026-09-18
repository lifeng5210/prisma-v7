import type {
  ConnectionInfo,
  IsolationLevel,
  SqlQuery,
  SqlResultSet,
  TransactionOptions,
} from '@prisma/driver-adapter-utils'

// Re-export Prisma's runtime helpers. The interfaces below deliberately widen
// only the provider union needed by the two Kingbase adapter modes.
export * from '@prisma/driver-adapter-utils'

export type Provider = import('@prisma/driver-adapter-utils').Provider | 'kingbase-mysql' | 'kingbase-oracle'

export interface AdapterInfo {
  readonly provider: Provider
  readonly adapterName: string
}

export interface Queryable<Query, Result> extends AdapterInfo {
  queryRaw(params: Query): Promise<Result>
  executeRaw(params: Query): Promise<number>
}

export interface SqlQueryable extends Queryable<SqlQuery, SqlResultSet> {}

export interface DriverAdapterFactory<Query, Result> extends AdapterInfo {
  connect(): Promise<Queryable<Query, Result>>
}

export interface SqlDriverAdapterFactory extends DriverAdapterFactory<SqlQuery, SqlResultSet> {
  connect(): Promise<SqlDriverAdapter>
}

export interface SqlMigrationAwareDriverAdapterFactory extends SqlDriverAdapterFactory {
  connectToShadowDb(): Promise<SqlDriverAdapter>
}

export interface SqlDriverAdapter extends SqlQueryable {
  executeScript(script: string): Promise<void>
  startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction>
  getConnectionInfo?(): ConnectionInfo
  dispose(): Promise<void>
}

export interface Transaction extends AdapterInfo, SqlQueryable {
  readonly options: TransactionOptions
  commit(): Promise<void>
  rollback(): Promise<void>
  createSavepoint?(name: string): Promise<void>
  rollbackToSavepoint?(name: string): Promise<void>
  releaseSavepoint?(name: string): Promise<void>
}
