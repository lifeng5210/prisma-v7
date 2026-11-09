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

Kingbase MySQL adaptation targets R3; the tested baseline is V009R003C018.
Compatibility with R1 is not required.

The connector uses Kingbase's native conversion and aggregate rules. BLOB-to-BIT
column changes return the server's unsupported-conversion error; Prisma does not
parse decimal prefixes or emulate MySQL strict/non-strict conversion behavior.
Temporal-to-numeric changes use native casts, including server-defined precision
and overflow behavior. Parameterized SUM uses the upstream MySQL `SUM(?)` SQL
without additional casts. Parameters are encoded for the type described by the
server; aggregate result types and precision follow the database's behavior.

R3 supports `Int @db.UnsignedTinyInt`, `Int @db.UnsignedSmallInt`, and
`Int @db.UnsignedMediumInt` through native unsigned columns. All three use the
existing INT4 codecs. `UnsignedTinyInt` accepts Int fields only and cannot be
combined with `autoincrement()`; `UnsignedSmallInt` and `UnsignedMediumInt`
support native auto-increment. `Int @db.UnsignedInt` and
`BigInt @db.UnsignedBigInt` remain supported.

The connector targets new R3 databases and does not create domains, CHECK
constraints, or protective triggers to emulate small unsigned integers. It no
longer maintains special detection or migration guards for earlier emulation
objects; general unsupported-type and foreign-key handling still applies.
These code changes do not remove existing database objects.

## Oracle-mode date/time handling

On the tested R2 V009R002C016 baseline, the adapter preserves the connection's
time zone, including connections borrowed from an application-owned pool.
Prisma DateTime values round-trip as UTC instants without requiring a UTC
session. `TimestampLocalTz` uses the server's plain TIMESTAMP representation;
`TimestampTz` retains its time-zone-aware binding and decoding.

## Source layout

- `src/index.ts` exports the two adapter factories and their options.
- `src/kingbase.ts` and `src/kingbase-oracle.ts` handle queries, transactions, connection configuration, and mode-specific sessions.
- `src/conversion.ts` and `src/kingbase-oracle-conversion.ts` handle each mode's parameter and result conversion.
- `src/constants.ts` defines the shared wire type boundary; `src/errors.ts` maps driver errors.
- `src/__tests__/` contains adapter, conversion, and error regression tests.
