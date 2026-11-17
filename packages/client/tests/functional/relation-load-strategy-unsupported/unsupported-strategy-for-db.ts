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

  for (const relationLoadStrategy of ['query', 'join'] as const) {
    testIf(relationJoinsEnabled && isKingbaseMysql)(
      `Kingbase MySQL supports ${relationLoadStrategy} relation loading`,
      async () => {
        const user = await prisma.user.create({
          data: {
            login: `${relationLoadStrategy}-strategy-user`,
            posts: {
              create: {
                title: 'Related post',
                content: `Loaded with the ${relationLoadStrategy} strategy`,
              },
            },
          },
        })

        await expect(
          prisma.user.findMany({
            // @ts-test-if: previewFeatures.includes('relationJoins') && ['postgresql', 'cockroachdb', 'mysql', 'kingbase-mysql', 'kingbase-oracle'].includes(provider)
            relationLoadStrategy,
            where: { id: user.id },
            select: {
              login: true,
              posts: { select: { title: true, content: true } },
            },
          }),
        ).resolves.toEqual([
          {
            login: `${relationLoadStrategy}-strategy-user`,
            posts: [{ title: 'Related post', content: `Loaded with the ${relationLoadStrategy} strategy` }],
          },
        ])
      },
    )
  }

  testIf(relationJoinsEnabled && !providerSupportsRelationJoins)(
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
