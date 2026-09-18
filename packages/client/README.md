# @prisma-kb/client

Prisma Client distribution for KingbaseES, based on Prisma ORM 7.10.0.

This package adds the `kingbase-mysql` and `kingbase-oracle` providers and is
intended to be used with the matching `prisma-kb` CLI and
`@prisma-kb/adapter-kb` driver adapter versions.

## Installation

```bash
npm install @prisma-kb/client@7.10.0-kb.1 @prisma-kb/adapter-kb@7.10.0-kb.1
npm install --save-dev prisma-kb@7.10.0-kb.1
```

After generating a client, import it from this package:

```ts
import { PrismaClient } from '@prisma-kb/client'
```

Keep all `@prisma-kb/*` packages on the same release version. This release uses
Kingbase engine revision `5b8c5395cd3894eb88907c3e1e04ad43a669927f`.

## License

Apache-2.0. See the repository license for details.
