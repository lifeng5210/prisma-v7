import { ensureDatabaseExists, parseDatasourceInfo } from '../utils/ensureDatabaseExists'
import { describeMatrix, sqliteOnly } from './__helpers__/conditionalTests'
import { createDefaultTestContext } from './__helpers__/context'

const ctx = createDefaultTestContext()

describeMatrix(sqliteOnly, 'SQLite', () => {
  it('can create database - sqlite', async () => {
    ctx.fixture('schema-only-sqlite')
    const result = ensureDatabaseExists(ctx.fs.path('prisma'), 'sqlite', await ctx.configWithDatasource())
    await expect(result).resolves.toMatchInlineSnapshot(`"SQLite database dev.db created at file:dev.db"`)
  })

  it('can create database - sqlite - folder', async () => {
    ctx.fixture('schema-folder-sqlite')
    const result = ensureDatabaseExists(ctx.fs.path('prisma'), 'sqlite', await ctx.configWithDatasource())
    await expect(result).resolves.toMatchInlineSnapshot(`"SQLite database dev.db created at file:dev.db"`)
  })
})

describe('parseDatasourceInfo', () => {
  test.each([
    ['kingbase-mysql', 'Kingbase MySQL'],
    ['kingbase-oracle', 'Kingbase Oracle'],
  ] as const)('reports an explicitly selected %s schema', (provider, prettyProvider) => {
    const datasource = {
      name: 'db',
      provider,
      activeProvider: provider,
      schemas: [],
      sourceFilePath: '/app/prisma/schema.prisma',
    }
    const config = {
      datasource: {
        url: `${provider}://user:password@localhost:54321/app?schema=app_schema`,
      },
    } as Parameters<typeof parseDatasourceInfo>[1]

    expect(parseDatasourceInfo(datasource, config)).toMatchObject({
      prettyProvider,
      dbName: 'app',
      schema: 'app_schema',
    })
  })

  test.each(['kingbase-mysql', 'kingbase-oracle'] as const)(
    'does not invent a default schema for %s when none is selected',
    (provider) => {
      const datasource = {
        name: 'db',
        provider,
        activeProvider: provider,
        schemas: [],
        sourceFilePath: '/app/prisma/schema.prisma',
      }
      const config = {
        datasource: {
          url: `${provider}://user:password@localhost:54321/app`,
        },
      } as Parameters<typeof parseDatasourceInfo>[1]

      expect(parseDatasourceInfo(datasource, config).schema).toBeUndefined()
    },
  )
})
//
// Would need logic to be reproducible for testing other databases
// createDatabase is already tested in the `@prisma/internals` tests
//
