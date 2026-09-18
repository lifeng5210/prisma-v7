import { defineConfig } from 'prisma-kb/config'

export default defineConfig({
  engine: 'classic',
  datasource: {
    url: 'file:./dev.db',
  },
})
