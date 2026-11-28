import { Providers, RelationModes } from '../../_utils/providers'
import testMatrix from './_matrix'

/* eslint-disable @typescript-eslint/no-unused-vars */

// @ts-ignore this is just for type checks
declare let prisma: import('./generated/prisma/client').PrismaClient
// @ts-ignore this is just for type checks
declare let Prisma: typeof import('./generated/prisma/client').Prisma

testMatrix.setupTestSuite(
  ({ provider, relationMode }, suiteMeta) => {
    const isMySql = provider === Providers.MYSQL || provider === Providers.KINGBASE_MYSQL

    const expectedPivot = (id: number) =>
      provider === Providers.KINGBASE_ORACLE
        ? { a: new Prisma.Decimal(id), b: new Prisma.Decimal(id) }
        : { A: id, B: id }

    describe('issue 16390', () => {
      afterEach(async () => {
        // Start from a clean state
        await prisma.item.deleteMany({})
        await prisma.category.deleteMany({})
        if (isMySql) {
          await prisma.$executeRaw`TRUNCATE TABLE \`_CategoryToItem\`;`
        } else {
          await prisma.$executeRaw`TRUNCATE TABLE "_CategoryToItem";`
        }
      })

      test('when deleting an item, the corresponding entry in the implicit pivot table should be deleted', async () => {
        // Create one category
        const category = await prisma.category.create({
          data: {},
        })
        expect(category).toMatchObject({
          id: 1,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })

        // Create one item linked to the category
        const item = await prisma.item.create({
          data: {
            categories: {
              connect: {
                id: category.id,
              },
            },
          },
          include: {
            categories: true,
          },
        })
        expect(item).toMatchObject({
          categories: [{ id: 1, createdAt: expect.any(Date), updatedAt: expect.any(Date) }],
          id: 1,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })

        // Check the pivot table entries
        let pivotTable
        if (isMySql) {
          pivotTable = await prisma.$queryRaw`SELECT * FROM \`_CategoryToItem\`;`
        } else {
          pivotTable = await prisma.$queryRaw`SELECT * FROM "_CategoryToItem";`
        }
        expect(pivotTable).toStrictEqual([expectedPivot(1)])

        // Delete the item
        expect(
          await prisma.item.delete({
            where: {
              id: item.id,
            },
          }),
        ).toMatchObject({
          id: 1,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })

        // Item query now returns null
        expect(
          await prisma.item.findUnique({
            where: {
              id: item.id,
            },
            include: {
              categories: true,
            },
          }),
        ).toBeNull()

        // Category has no items
        expect(
          await prisma.category.findUnique({
            where: {
              id: category.id,
            },
            include: {
              items: true,
            },
          }),
        ).toMatchObject({
          id: 1,
          items: [],
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })

        // Everything looks good but....
        // Let's check the pivot table

        // Check the pivot table entries
        let pivotTableAfterDelete
        if (isMySql) {
          pivotTableAfterDelete = await prisma.$queryRaw`SELECT * FROM \`_CategoryToItem\`;`
        } else {
          pivotTableAfterDelete = await prisma.$queryRaw`SELECT * FROM "_CategoryToItem";`
        }

        // ... the pivot table entry is still there!
        // This is a bug in the relationMode="prisma" emulation
        if (relationMode === RelationModes.PRISMA) {
          expect(pivotTableAfterDelete).toStrictEqual([expectedPivot(1)])
        } else {
          // This is the expected behavior for prisma and foreignKeys
          // once this bug is fixed
          expect(pivotTableAfterDelete).toStrictEqual([])
        }
      })
    })

    test('when deleting a category, the corresponding entry in the implicit pivot table should be deleted', async () => {
      // Create one category
      const category = await prisma.category.create({
        data: {},
      })
      expect(category).toMatchObject({
        id: 2,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })

      // Create one item linked to the category
      const item = await prisma.item.create({
        data: {
          categories: {
            connect: {
              id: category.id,
            },
          },
        },
        include: {
          categories: true,
        },
      })
      expect(item).toMatchObject({
        categories: [{ id: 2, createdAt: expect.any(Date), updatedAt: expect.any(Date) }],
        id: 2,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })

      // Check the pivot table entries
      let pivotTable
      if (isMySql) {
        pivotTable = await prisma.$queryRaw`SELECT * FROM \`_CategoryToItem\`;`
      } else {
        pivotTable = await prisma.$queryRaw`SELECT * FROM "_CategoryToItem";`
      }
      expect(pivotTable).toStrictEqual([expectedPivot(2)])

      // Delete the category
      expect(
        await prisma.category.delete({
          where: {
            id: item.id,
          },
        }),
      ).toMatchObject({
        id: 2,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })

      // Category query now returns null
      expect(
        await prisma.category.findUnique({
          where: {
            id: category.id,
          },
          include: {
            items: true,
          },
        }),
      ).toBeNull()

      // Item has no category
      expect(
        await prisma.item.findUnique({
          where: {
            id: item.id,
          },
          include: {
            categories: true,
          },
        }),
      ).toMatchObject({
        id: 2,
        categories: [],
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })

      // Everything looks good but....
      // Let's check the pivot table

      // Check the pivot table entries
      let pivotTableAfterDelete
      if (isMySql) {
        pivotTableAfterDelete = await prisma.$queryRaw`SELECT * FROM \`_CategoryToItem\`;`
      } else {
        pivotTableAfterDelete = await prisma.$queryRaw`SELECT * FROM "_CategoryToItem";`
      }

      // ... the pivot table entry is still there!
      // This is a bug in the relationMode="prisma" emulation
      //
      // TODO once the bug is fixed: remove conditional
      // pivot table should be empty
      if (relationMode === RelationModes.PRISMA) {
        expect(pivotTableAfterDelete).toStrictEqual([expectedPivot(2)])
      } else {
        // This is the expected behavior for prisma and foreignKeys
        // once this bug is fixed
        expect(pivotTableAfterDelete).toStrictEqual([])
      }
    })
  },
  // Use `optOut` to opt out from testing the default selected providers
  // otherwise the suite will require all providers to be specified.
  {
    optOut: {
      from: ['sqlite', 'mongodb', 'cockroachdb', 'sqlserver'],
      reason: 'Only testing postgresql and mysql',
    },
  },
)
