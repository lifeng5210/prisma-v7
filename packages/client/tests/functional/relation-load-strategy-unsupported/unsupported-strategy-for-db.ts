import { Providers } from '../_utils/providers'
import { providersSupportingRelationJoins } from '../relation-load-strategy/_common'
import testMatrix from './_matrix'
// @ts-ignore
import type { PrismaClient } from './generated/prisma/client'

declare let prisma: PrismaClient

testMatrix.setupTestSuite((suiteConfig, _suiteMeta, _clientMeta, cliMeta) => {
  const relationJoinsEnabled = cliMeta.previewFeatures.includes('relationJoins')
  const providerSupportsRelationJoins = providersSupportingRelationJoins.includes(suiteConfig.provider)
  const isKingbaseMysql = suiteConfig.provider === Providers.KINGBASE_MYSQL

  // Kingbase MySQL exposes the strategy argument, then disables JOIN at runtime.
  // Its query strategy remains available even though JOIN is not supported.
  testIf(relationJoinsEnabled && isKingbaseMysql)('Kingbase MySQL supports query relation loading', async () => {
    const user = await prisma.user.create({
      data: {
        login: 'query-strategy-user',
        posts: {
          create: {
            title: 'Related post',
            content: 'Loaded with the query strategy',
          },
        },
      },
    })

    await expect(
      prisma.user.findMany({
        // @ts-test-if: previewFeatures.includes('relationJoins') && ['postgresql', 'cockroachdb', 'mysql', 'kingbase-mysql', 'kingbase-oracle'].includes(provider)
        relationLoadStrategy: 'query',
        where: { id: user.id },
        select: {
          login: true,
          posts: { select: { title: true, content: true } },
        },
      }),
    ).resolves.toEqual([
      {
        login: 'query-strategy-user',
        posts: [{ title: 'Related post', content: 'Loaded with the query strategy' }],
      },
    ])
  })

  testIf(relationJoinsEnabled && isKingbaseMysql)('Kingbase MySQL rejects join relation loading', async () => {
    await expect(
      prisma.user.findMany({
        // @ts-test-if: previewFeatures.includes('relationJoins') && ['postgresql', 'cockroachdb', 'mysql', 'kingbase-mysql', 'kingbase-oracle'].includes(provider)
        relationLoadStrategy: 'join',
        include: { posts: true },
      }),
    ).rejects.toMatchObject({ name: 'PrismaClientKnownRequestError', code: 'P2019' })
  })

  testIf(relationJoinsEnabled && !providerSupportsRelationJoins && !isKingbaseMysql)(
    'using load strategy that is not supported for provider',
    async () => {
      await expect(
        prisma.user.findMany({
          // @ts-test-if: previewFeatures.includes('relationJoins') && ['postgresql', 'cockroachdb', 'mysql', 'kingbase-mysql', 'kingbase-oracle'].includes(provider)
          relationLoadStrategy: 'query',
          include: {
            posts: true,
          },
        }),
      ).rejects.toMatchPrismaErrorInlineSnapshot(`
          "
          Invalid \`prisma.user.findMany()\` invocation in
          /client/tests/functional/relation-load-strategy-unsupported/unsupported-strategy-for-db.ts:0:0

            XX 'using load strategy that is not supported for provider',
            XX async () => {
            XX   await expect(
          → XX     prisma.user.findMany({
                     relationLoadStrategy: "query",
                     ~~~~~~~~~~~~~~~~~~~~
                     include: {
                       posts: true
                     },
                   ? where?: UserWhereInput,
                   ? orderBy?: UserOrderByWithRelationInput[] | UserOrderByWithRelationInput,
                   ? cursor?: UserWhereUniqueInput,
                   ? take?: Int,
                   ? skip?: Int,
                   ? distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
                   })

          Unknown argument \`relationLoadStrategy\`. Available options are marked with ?."
        `)
    },
  )
})
