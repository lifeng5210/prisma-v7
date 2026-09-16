# `@prisma-kb/engines`

⚠️ **Warning**: This package is intended for the Prisma Kingbase distribution.
Its release cycle does not follow SemVer, so its APIs can change between releases.

The postinstall hook downloads the native Schema Engine for the current platform from the Kingbase engine mirror.

The engine revision to download is directly determined by its `@prisma-kb/engines-version` dependency.

You should probably not use this package directly, but instead use one of these:

- the Prisma Kingbase CLI distribution
- the Prisma Kingbase Client distribution
