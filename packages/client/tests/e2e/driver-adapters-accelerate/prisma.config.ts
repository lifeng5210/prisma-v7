import { defineConfig, env } from 'prisma-kb/config'

export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
})
