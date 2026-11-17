import { defineConfig } from 'prisma-kb/config'

export default defineConfig({
  datasource: {
    url: 'file:./prisma/dev.db',
  },
  schema: './prisma/schema.prisma',
  typedSql: {
    path: './prisma/sql',
  },
  migrations: {
    seed: 'tsx ./prisma/seed.ts',
  },
})
