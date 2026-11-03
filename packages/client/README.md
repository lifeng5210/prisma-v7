# @prisma-kb/client

Prisma Client distribution for KingbaseES, based on Prisma ORM 7.10.0.

This package adds the `kingbase-mysql` and `kingbase-oracle` providers and is
intended to be used with the matching `prisma-kb` CLI and
`@prisma-kb/adapter-kb` driver adapter versions.

## Installation

```bash
npm install @prisma-kb/client @prisma-kb/adapter-kb
npm install --save-dev prisma-kb
```

After generating a client, import `PrismaClient` from the output configured in
the `generator` block of your Prisma schema:

```ts
import { PrismaClient } from './generated/prisma/client'
```

Use `PrismaKb` with the `kingbase-mysql` provider and `PrismaKbOracle` with the
`kingbase-oracle` provider:

```ts
import { PrismaKb, PrismaKbOracle } from '@prisma-kb/adapter-kb'
```

The Prisma Kingbase packages are versioned independently. Install their current
`latest` releases together, or pin a set of versions that you have tested
together in your lockfile.

## License

Apache-2.0. See the repository license for details.
