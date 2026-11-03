import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configureEnginesMirror, PRISMA_KB_ENGINES_MIRROR } from '../mirror'

const originalBinariesMirror = process.env.PRISMA_BINARIES_MIRROR
const originalEnginesMirror = process.env.PRISMA_ENGINES_MIRROR

beforeEach(() => {
  delete process.env.PRISMA_BINARIES_MIRROR
  delete process.env.PRISMA_ENGINES_MIRROR
})

afterEach(() => {
  if (originalBinariesMirror === undefined) {
    delete process.env.PRISMA_BINARIES_MIRROR
  } else {
    process.env.PRISMA_BINARIES_MIRROR = originalBinariesMirror
  }

  if (originalEnginesMirror === undefined) {
    delete process.env.PRISMA_ENGINES_MIRROR
  } else {
    process.env.PRISMA_ENGINES_MIRROR = originalEnginesMirror
  }
})

describe('configureEnginesMirror', () => {
  it('uses the Kingbase mirror by default', () => {
    configureEnginesMirror()

    expect(process.env.PRISMA_ENGINES_MIRROR).toBe(PRISMA_KB_ENGINES_MIRROR)
  })

  it('preserves an explicit engine mirror', () => {
    process.env.PRISMA_ENGINES_MIRROR = 'https://example.test/engines'

    configureEnginesMirror()

    expect(process.env.PRISMA_ENGINES_MIRROR).toBe('https://example.test/engines')
  })

  it('does not override the legacy binaries mirror', () => {
    process.env.PRISMA_BINARIES_MIRROR = 'https://example.test/binaries'

    configureEnginesMirror()

    expect(process.env.PRISMA_ENGINES_MIRROR).toBeUndefined()
  })
})
