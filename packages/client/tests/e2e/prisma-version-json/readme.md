# Prisma Version JSON E2E Test

This test verifies that `prisma-kb version --json` outputs valid JSON that can be parsed by `jq`.

## What it tests

- `prisma-kb version --json` outputs valid JSON
- The JSON output can be successfully parsed by `jq` (exit code 0)
- The JSON contains some expected fields

## Running the test

```bash
pnpm --filter @prisma-kb/client test:e2e prisma-version-json
```
