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
prefix. Invalid expressions are reported by the database. Existing MySQL-mode
queries such as `+John +Smith`, `John Smith`, or `John*` must be rewritten to
`John & Smith`, `John | Smith`, or `John:*` respectively. This is an input
contract change from earlier Kingbase adapter builds; it does not change the
upstream MySQL provider.

MySQL-mode full-text queries keep the fixed `simple` configuration used by
Prisma-managed `@@fulltext` indexes. Oracle-mode queries keep the database's
default configuration and do not expose `@@fulltext`. Tokenization and relevance
scores can therefore differ between modes even with the same query expression.

## MySQL-mode type boundaries

The connector uses Kingbase's native conversion and aggregate rules. BLOB-to-BIT
column changes return the server's unsupported-conversion error; Prisma does not
parse decimal prefixes or emulate MySQL strict/non-strict conversion behavior.
Temporal-to-numeric changes use native casts, including server-defined precision
and overflow behavior. SUM parameters retain their actual types; required casts disambiguate parameters
without promoting integer inputs to MySQL DECIMAL.

`UnsignedTinyInt`, `UnsignedSmallInt`, and `UnsignedMediumInt` are rejected by
schema validation. `UnsignedInt` and `UnsignedBigInt` remain supported. Prisma
no longer creates domains or range triggers to emulate small unsigned integers.
Existing emulation objects are preserved and introspected as unsupported fields;
models without a supported unique identifier are ignored. Incompatible foreign
keys between legacy emulation storage types require explicit migration before
introspection or schema migration can proceed. Migrate those columns
explicitly before using them through Prisma Client.

## Source layout

- `src/index.ts` exports the two adapter factories and their options.
- `src/kingbase.ts` and `src/kingbase-oracle.ts` handle queries, transactions, connection configuration, and mode-specific sessions.
- `src/conversion.ts` and `src/kingbase-oracle-conversion.ts` handle each mode's parameter and result conversion.
- `src/constants.ts` defines the shared wire type boundary; `src/errors.ts` maps driver errors.
- `src/__tests__/` contains adapter, conversion, and error regression tests.
