import { defineMatrix } from '../_utils/defineMatrix'
import { Providers } from '../_utils/providers'

export default defineMatrix(() => [
  [
    {
      provider: Providers.POSTGRESQL,
      previewFeatures: '"fullTextSearch"',
      index: '',
      andQuery: 'John & Smith',
      orQuery: 'John | April',
      notQuery: '(John | April) & !Smith',
      noResultsQuery: 'April & Smith',
      badQuery: 'John Smith',
    },
    {
      provider: Providers.MYSQL,
      previewFeatures: '"fullTextSearch", "fullTextIndex"',
      index: `
      @@fulltext([name])
      @@fulltext([name, email])
      @@fulltext([email])
      `,
      andQuery: '+John +Smith',
      orQuery: 'John April',
      notQuery: 'John -Smith April',
      noResultsQuery: '+April +Smith',
      badQuery: 'John <--> Smith',
    },
    {
      provider: Providers.KINGBASE_MYSQL,
      previewFeatures: '"fullTextSearch", "fullTextIndex"',
      index: `
      @@fulltext([name])
      @@fulltext([name, email])
      @@fulltext([email])
      `,
      // Kingbase implements full-text search using its PostgreSQL-compatible
      // tsquery syntax, not MySQL BOOLEAN MODE syntax.
      andQuery: 'John & Smith',
      orQuery: 'John | April',
      notQuery: '(John | April) & !Smith',
      noResultsQuery: 'April & Smith',
      badQuery: 'John Smith',
    },
    {
      provider: Providers.KINGBASE_ORACLE,
      previewFeatures: '"fullTextSearch"',
      // Oracle-mode full-text search uses tsquery syntax and does not require
      // Prisma to manage a @@fulltext index.
      index: '',
      andQuery: 'John & Smith',
      orQuery: 'John | April',
      notQuery: '(John | April) & !Smith',
      noResultsQuery: 'April & Smith',
      badQuery: 'John Smith',
    },
  ],
])
