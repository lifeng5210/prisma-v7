export const PRISMA_KB_ENGINES_MIRROR = 'https://lifeng5210.github.io/prisma-engines-binaries'

/**
 * Keep user-provided mirrors authoritative, but use the Kingbase mirror when
 * neither of Prisma's standard mirror overrides is configured.
 */
export function configureEnginesMirror(): void {
  if (process.env.PRISMA_BINARIES_MIRROR === undefined && process.env.PRISMA_ENGINES_MIRROR === undefined) {
    process.env.PRISMA_ENGINES_MIRROR = PRISMA_KB_ENGINES_MIRROR
  }
}
