import { defineConfig } from 'prisma-kb/config'

export default defineConfig({
  datasource: {
    url: 'postgresql://user@pwd:example.com/db',
  },
})
