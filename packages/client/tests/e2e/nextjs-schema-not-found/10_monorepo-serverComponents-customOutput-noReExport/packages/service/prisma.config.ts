import { defineConfig, env } from 'prisma-kb/config'

export default defineConfig({
  datasource: {
    url: env('TEST_E2E_POSTGRES_URI'),
  },
})
