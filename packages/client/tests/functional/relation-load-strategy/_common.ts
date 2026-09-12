import { allProviders, Providers } from '../_utils/providers'

export const providersSupportingRelationJoins = [
  Providers.POSTGRESQL,
  Providers.COCKROACHDB,
  Providers.MYSQL,
  Providers.KINGBASE_ORACLE,
]

export const providersNotSupportingRelationJoins = allProviders
  .filter((provider) => !providersSupportingRelationJoins.includes(provider.provider))
  .map((provider) => provider.provider)

/**
 * Generic relation load strategy.
 * The generated type for a specific provider may be narrower.
 */
export type RelationLoadStrategy = 'query' | 'join'
