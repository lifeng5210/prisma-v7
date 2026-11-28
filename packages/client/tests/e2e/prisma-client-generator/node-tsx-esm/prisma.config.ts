import { defineConfig } from 'prisma-kb/config'

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: 'file:./prisma/dev.db',
  },
})
