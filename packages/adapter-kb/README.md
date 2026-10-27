# @prisma-kb/adapter-kb

Prisma Driver Adapter for KingbaseES using the `kingbasedb` Node.js driver.

The adapter follows the `pg`-compatible API exposed by `kingbasedb` and exports
two factories: `PrismaKb` for the `kingbase-mysql` Prisma provider, and
`PrismaKbOracle` for `kingbase-oracle`.

Install this package together with the Prisma Kingbase Client distribution.

`executeScript` is not implemented in either compatibility mode and throws
`Not implemented yet`, matching the upstream MySQL adapter's interface behavior.
Use Prisma's supported query and transaction APIs for application operations.

The Kingbase MySQL adapter does not bind or decode standalone SQL arrays.
JSON array values and ordinary `IN (...)` queries remain supported.

## Source layout

- `src/index.ts` exports the two adapter factories and their options.
- `src/kingbase.ts` and `src/kingbase-oracle.ts` handle queries, transactions, connection configuration, and mode-specific sessions.
- `src/conversion.ts` and `src/kingbase-oracle-conversion.ts` handle each mode's parameter and result conversion.
- `src/constants.ts` defines the shared wire type boundary; `src/errors.ts` maps driver errors.
- `src/__tests__/` contains adapter, conversion, and error regression tests.
