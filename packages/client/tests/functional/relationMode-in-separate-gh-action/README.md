## Testing `relationMode` datasource property on all databases

Internal Notion pages

- [Project](https://www.notion.so/prismaio/Referential-Actions-TS-Test-Plan-52571af2aa6a48c1ae3a929880fd25aa)
- [Findings](https://www.notion.so/prismaio/Phase-1-Report-on-findings-f21c7bb079c5414296286973fdcd62c2)

Note: We are not testing SetNull with `foreignKeys` because it is invalid.
SetNull with a non-optional relation errors when the migration DDL is applied for all databases
(except for PostgreSQL where it fails at runtime)
Related issue to add a validation error: https://github.com/prisma/prisma/issues/14673

How to run these tests?

```sh
RELATION_MODE=foreignKeys pnpm run test:functional:code --relation-mode-tests-only
RELATION_MODE=prisma pnpm run test:functional:code --relation-mode-tests-only

# Or test default (no `relationMode` datasource property, which means using Foreign Keys for SQL databases)
pnpm run test:functional:code --relation-mode-tests-only

# To only run one test file, for example:
pnpm run test:functional:code --relation-mode-tests-only relationMode/tests_1-to-1.ts
pnpm run test:functional:code --relation-mode-tests-only relationMode/tests_1-to-n.ts
pnpm run test:functional:code --relation-mode-tests-only relationMode/tests_m-to-n.ts
pnpm run test:functional:code --relation-mode-tests-only relationMode/tests_m-to-n-MongoDB.ts
```

Kingbase MySQL and Kingbase Oracle are registered in the shared matrix and use
the existing `js_kb_mysql` and `js_kb_oracle` adapters. Both participate in
`foreignKeys` and `prisma`; omitting `RELATION_MODE` uses the default foreign-key
mode. Their connectors currently declare all actions in this matrix, so no
additional Kingbase denylist is applied.

Run the following from `packages/client` when validating the registration:

```sh
RELATION_MODE=foreignKeys pnpm run test:functional:code --adapter js_kb_mysql --relation-mode-tests-only relationMode-in-separate-gh-action
RELATION_MODE=prisma pnpm run test:functional:code --adapter js_kb_mysql --relation-mode-tests-only relationMode-in-separate-gh-action
RELATION_MODE=foreignKeys pnpm run test:functional:code --adapter js_kb_oracle --relation-mode-tests-only relationMode-in-separate-gh-action
RELATION_MODE=prisma pnpm run test:functional:code --adapter js_kb_oracle --relation-mode-tests-only relationMode-in-separate-gh-action
```

Kingbase-specific error expectations have been added to `conditionalError.snapshot`.
Database validation on 2026-11-11 used the `prisma-client-js` generator:

| Adapter        | Relation mode | Passed (excluding expected failures) | Failed | Existing `.failing` tests |
| -------------- | ------------- | ------------------------------------ | ------ | ------------------------- |
| `js_kb_mysql`  | `foreignKeys` | 432                                  | 0      | 0                         |
| `js_kb_mysql`  | `prisma`      | 422                                  | 6      | 4                         |
| `js_kb_oracle` | `foreignKeys` | 432                                  | 0      | 0                         |
| `js_kb_oracle` | `prisma`      | 422                                  | 6      | 4                         |

Each combination executes 432 cases. Ten existing `todo` cases and 278 SQL
conditional skips per combination are excluded; the MongoDB-only file is also
excluded. Jest includes `.failing` tests in its passed count, so its headline for
each `prisma` run is 426 passed and 6 failed.

The six failures are one-to-one `deleteMany` operations with default, `Restrict`,
and `NoAction` actions, each with and without mapped names. They throw
`Expected zero or one element, got 2` instead of a required-relation error.
An isolated native MySQL 8.0.46 control reproduces the same framework problem.
Expanding the existing `.failing` cases for diagnosis also reveals the same
cardinality problem in two `SetNull` bulk-delete cases. The other two `SetNull`
cases correctly reject a single delete with P2014 but still use an obsolete
placeholder expectation. No new skips or production fixes were applied.

Detailed results: `/tmp/kes-relation-validation-20261111/`; durable findings:
[`kingbase-relation-mode-validation-20261111.md`](../../../../../../prisma-engines/record/kingbase-relation-mode-validation-20261111.md).

Some reproductions related to `relationMode`:

- [10000](../issues/10000/)
- [12378](../issues/12378/)
- [12557](../issues/12557/)
- [13766](../issues/13766/)
- [14271](../issues/14271/)
