import { defineConfig } from 'prisma-kb/config'

export default defineConfig({
  datasource: {
    url: 'file:dev.db',
  },
})
