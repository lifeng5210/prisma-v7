# @prisma-kb/adapter-kb

Prisma Driver Adapter for KingbaseES using the `kingbasedb` Node.js driver.

The adapter follows the `pg`-compatible API exposed by `kingbasedb` and exports
two factories: `PrismaKbMysql` for the `kingbase-mysql` Prisma provider, and
`PrismaKbOracle` for `kingbase-oracle`.

`PrismaKb` remains available as a compatibility alias for `PrismaKbMysql`.
MySQL adapter options are exported as `PrismaKbMysqlOptions`, with
`PrismaKbOptions` retained as a compatibility alias.

Install this package together with the Prisma Kingbase Client distribution.

`executeScript` is not implemented in either compatibility mode and throws
`Not implemented yet`.
Use Prisma's supported query and transaction APIs for application operations.

The Kingbase MySQL adapter does not bind or decode standalone SQL arrays.
JSON array values and ordinary `IN (...)` queries remain supported.

## Full-text search

Both `kingbase-mysql` and `kingbase-oracle` accept Kingbase `tsquery` expressions
in `search` filters and `_relevance.search`. Parameters are passed unchanged;
MySQL Boolean Mode expressions are not translated.

```ts
await prisma.user.findMany({
  where: { name: { search: 'John & !Smith' } },
  orderBy: { _relevance: { fields: ['name'], search: 'John | April', sort: 'desc' } },
})
```

Use `&` for AND, `|` for OR, `!` for NOT, `<->` for a phrase, and `:*` for a
prefix. Invalid expressions are reported by the database. For example,
`John & Smith` matches both terms, `John | Smith` matches either term, and
`John:*` performs prefix matching.

MySQL-mode full-text queries keep the fixed `simple` configuration used by
Prisma-managed `@@fulltext` indexes. Oracle-mode queries keep the database's
default configuration and do not expose `@@fulltext`. Tokenization and relevance
scores can therefore differ between modes even with the same query expression.

## MySQL-mode type boundaries

Kingbase MySQL adaptation targets R3 V009R003C018.

BIT parameters with a declared `BIT(n)` width preserve that width, including
leading zeros, and reject values that do not fit. Use matching Kingbase query
compiler Wasm and adapter builds to pass the declared width. Calls that supply
only `Bit` without a width use numeric encoding based on significant bits.

Column conversions and aggregates follow Kingbase's native rules. Unsupported
conversions are reported by the database; result types, precision, and overflow
handling follow the server's behavior.

R3 supports `Int @db.UnsignedTinyInt`, `Int @db.UnsignedSmallInt`, and
`Int @db.UnsignedMediumInt` through native unsigned columns.
`UnsignedTinyInt` accepts Int fields only and cannot be combined with
`autoincrement()`; `UnsignedSmallInt` and `UnsignedMediumInt`
support native auto-increment. `Int @db.UnsignedInt` and
`BigInt @db.UnsignedBigInt` remain supported.

## Oracle-mode date/time handling

On R2 V009R002C016, the adapter preserves the connection's time zone, including
connections borrowed from an application-owned pool.
Prisma DateTime values round-trip as UTC instants without requiring a UTC
session. `TimestampLocalTz` uses the server's plain TIMESTAMP representation;
`TimestampTz` retains its time-zone-aware binding and decoding.

## Source layout

- `src/index.ts` exports the two adapter factories and their options.
- `src/kingbase-mysql.ts` and `src/kingbase-oracle.ts` handle queries, transactions, connection configuration, and mode-specific sessions.
- `src/kingbase-mysql-conversion.ts` and `src/kingbase-oracle-conversion.ts` handle each mode's parameter and result conversion.
- `src/constants.ts` defines the shared wire type boundary; `src/errors.ts` maps driver errors.
- `src/__tests__/` contains adapter, conversion, and error regression tests.

## Functional tests

Configure `TEST_FUNCTIONAL_KINGBASE_MYSQL_URI` and
`TEST_FUNCTIONAL_KINGBASE_ORACLE_URI` in `.db.env` with connections to dedicated
test databases. From the repository root, select the command for the mode being
tested:

```sh
pnpm --filter @prisma-kb/client test:functional:code --adapter js_kb_mysql
pnpm --filter @prisma-kb/client test:functional:code --adapter js_kb_oracle
```
