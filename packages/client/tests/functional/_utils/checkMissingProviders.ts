import { NamedTestSuiteConfig, TestSuiteMeta } from './getTestSuiteInfo'
import { Providers } from './providers'
import { MatrixOptions } from './types'

/**
 * Ensure that we are not forgetting to add a provider to the matrix unless we
 * explicitly opt out during in the {@link setupTestSuiteMatrix} creation.
 * @param suiteConfigs
 * @param suiteMeta
 * @param options
 */
export function checkMissingProviders({
  suiteConfigs,
  suiteMeta,
  options,
}: {
  suiteConfigs: NamedTestSuiteConfig[]
  suiteMeta: TestSuiteMeta
  options?: MatrixOptions
}) {
  const suiteConfigProviders = suiteConfigs.map(({ matrixOptions: { provider } }) => provider)

  // Kingbase is exercised through the JavaScript adapter when a matrix opts
  // into it. Do not require every existing provider-specific matrix to add it.
  const requiredProviders = Object.values(Providers).filter((provider) => provider !== Providers.KINGBASE_MYSQL)

  const missingProviders = requiredProviders.reduce((acc, provider) => {
    if (suiteConfigProviders.includes(provider)) return acc
    if (options?.optOut?.from.includes(provider)) return acc

    return [...acc, provider]
  }, [] as Providers[])

  if (missingProviders.length) {
    throw new Error(
      `Test: '${suiteMeta.testName}' is missing providers '${missingProviders
        .map((x) => `'${x}'`)
        .join(', ')}' out using options.optOut`,
    )
  }
}
