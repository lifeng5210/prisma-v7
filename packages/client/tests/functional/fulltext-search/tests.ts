import { Providers } from '../_utils/providers'
import testMatrix from './_matrix'
// @ts-ignore
import type { PrismaClient } from './generated/prisma/client'

declare let prisma: PrismaClient

testMatrix.setupTestSuite(
  ({ provider, andQuery, orQuery, notQuery, noResultsQuery, badQuery }, _suiteMeta, _clientMeta) => {
    beforeAll(async () => {
      await prisma.user.createMany({
        data: [
          {
            email: 'email1@email.io',
            name: 'John Smith',
          },
          {
            email: 'email2@email.io',
            name: 'April ONeal',
          },
          {
            email: 'email3@email.io',
            name: 'John Pearl',
          },
        ],
      })
    })

    test('AND query', async () => {
      const result = await prisma.user.findMany({
        where: {
          name: {
            search: andQuery,
          },
        },
      })

      expect(result).toEqual([expect.objectContaining({ name: 'John Smith' })])
    })

    test('OR query', async () => {
      const result = await prisma.user.findMany({
        where: {
          name: {
            search: orQuery,
          },
        },
      })

      expect(result).toHaveLength(3)
      expect(result).toContainEqual(expect.objectContaining({ name: 'John Smith' }))
      expect(result).toContainEqual(expect.objectContaining({ name: 'April ONeal' }))
      expect(result).toContainEqual(expect.objectContaining({ name: 'John Pearl' }))
    })

    test('NOT query', async () => {
      const result = await prisma.user.findMany({
        where: {
          name: {
            search: notQuery,
          },
        },
      })

      expect(result).toHaveLength(2)
      expect(result).toContainEqual(expect.objectContaining({ name: 'April ONeal' }))
      expect(result).toContainEqual(expect.objectContaining({ name: 'John Pearl' }))
    })

    test('no results', async () => {
      const result = await prisma.user.findMany({
        where: {
          name: {
            search: noResultsQuery,
          },
        },
      })

      expect(result).toEqual([])
    })

    testIf(provider === Providers.MYSQL)(
      'binds each Boolean Mode input with matching semantics on reused plans',
      async () => {
        for (const [search, expected] of [
          ['John', ['John Smith', 'John Pearl']],
          ['+John +Smith', ['John Smith']],
          ['John April', ['John Smith', 'John Pearl', 'April ONeal']],
          ['John -Smith April', ['John Pearl', 'April ONeal']],
          ['"John Smith"', ['John Smith']],
          ['John*', ['John Smith', 'John Pearl']],
          ['-John', []],
          ['+(John April) -Smith', ['John Pearl', 'April ONeal']],
        ] as const) {
          const users = await prisma.user.findMany({ where: { name: { search } } })
          expect(users.map((user) => user.name).sort()).toEqual([...expected].sort())
        }
      },
    )

    testIf(provider === Providers.KINGBASE_MYSQL || provider === Providers.KINGBASE_ORACLE)(
      'binds native tsquery inputs unchanged on reused plans',
      async () => {
        for (const [search, expected] of [
          ['John', ['John Smith', 'John Pearl']],
          ['John & Smith', ['John Smith']],
          ['John | April', ['John Smith', 'John Pearl', 'April ONeal']],
          ['(John | April) & !Smith', ['John Pearl', 'April ONeal']],
          ['John <-> Smith', ['John Smith']],
          ['John:*', ['John Smith', 'John Pearl']],
          ['!John', ['April ONeal']],
          ['April & Smith', []],
        ] as const) {
          const users = await prisma.user.findMany({ where: { name: { search } } })
          expect(users.map((user) => user.name).sort()).toEqual([...expected].sort())
        }
      },
    )

    testIf(provider === Providers.KINGBASE_MYSQL || provider === Providers.KINGBASE_ORACLE)(
      'binds native tsquery relevance parameters on reused plans',
      async () => {
        for (const [search, first] of [
          ['John & Smith', 'John Smith'],
          ['April', 'April ONeal'],
          ['John & Pearl', 'John Pearl'],
        ] as const) {
          const users = await prisma.user.findMany({
            orderBy: { _relevance: { fields: ['name'], search, sort: 'desc' } },
          })
          expect(users).toHaveLength(3)
          expect(users[0].name).toBe(first)
        }
      },
    )

    // TODO: Windows: why is this test skipped?
    // TODO: Edge: skipped because of the error snapshot
    testIf(process.platform !== 'win32')('bad query', async () => {
      const result = prisma.user
        .findMany({
          where: {
            name: {
              search: badQuery,
            },
          },
        })
        .catch((e) => {
          const error = e as Error
          // Prisma Client surfaces unmapped DB errors as P2039 and raw
          // query failures as P2010; both use the same `Code: \`X\`.
          // Message: \`Y\`` suffix. Extract just the DB message to keep
          // the snapshot portable across drivers and engine modes
          // (local driver adapter vs. qpe=remote).
          const matches = error.message.match(/(?:Code: `[^`]+`\. )?Message: `([^`]*)`/)
          error.message = matches?.[1] ?? error.message
          throw error
        })

      await expect(result).rejects.toMatchPrismaErrorSnapshot()
    })

    test('order by relevance on a single field', async () => {
      const users = await prisma.user.findMany({
        orderBy: {
          _relevance: {
            fields: ['name'],
            search: 'John',
            sort: 'desc',
          },
        },
      })

      expect(users).toEqual([
        expect.objectContaining({ name: 'John Smith' }),
        expect.objectContaining({ name: 'John Pearl' }),
        expect.objectContaining({ name: 'April ONeal' }),
      ])
    })

    test('order by relevance on multiple fields', async () => {
      const users = await prisma.user.findMany({
        orderBy: {
          _relevance: {
            fields: ['name', 'email'],
            search: 'John',
            sort: 'asc',
          },
        },
      })

      expect(users).toEqual([
        expect.objectContaining({ name: 'April ONeal' }),
        expect.objectContaining({ name: 'John Smith' }),
        expect.objectContaining({ name: 'John Pearl' }),
      ])
    })

    test('order by relevance: multiple orderBy statements', async () => {
      const users = await prisma.user.findMany({
        orderBy: {
          _relevance: {
            fields: ['name'],
            search: 'John',
            sort: 'desc',
          },
        },
      })

      expect(users).toEqual([
        expect.objectContaining({ name: 'John Smith' }),
        expect.objectContaining({ name: 'John Pearl' }),
        expect.objectContaining({ name: 'April ONeal' }),
      ])
    })
  },
  {
    optOut: {
      from: ['sqlite', 'mongodb', 'cockroachdb', 'sqlserver'],
      reason: 'these connectors do not support full-text search',
    },
  },
)
