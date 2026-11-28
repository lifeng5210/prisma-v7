import { defineConfig } from 'prisma-kb/config'

export default defineConfig({
  datasource: {
    url: process.env['UNDEFINED_VARIABLE'],
  },
})
