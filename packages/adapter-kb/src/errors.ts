import type { Error as DriverAdapterErrorObject, MappedError } from '@prisma/driver-adapter-utils'

type KingbaseError = {
  code?: string
  message?: string
  severity?: string
  detail?: string
  column?: string
  constraint?: string
  table?: string
  hint?: string
  errno?: number
  syscall?: string
  address?: string
  port?: number
}

const SOCKET_ERRORS = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'])

export function convertDriverError(error: unknown): DriverAdapterErrorObject {
  if (isSocketError(error)) {
    return mapSocketError(error)
  }

  if (isTlsError(error)) {
    return {
      kind: 'TlsConnectionError',
      reason: error.message,
    }
  }

  if (isKingbaseError(error)) {
    return {
      originalCode: error.code,
      originalMessage: error.message,
      ...mapKingbaseError(error),
    }
  }

  throw error
}

function mapKingbaseError(error: KingbaseError): MappedError {
  // SQLSTATE 22P03 is used for several kinds of malformed binary input. The
  // Kingbase bit type reports an overlong bit string with this SQLSTATE rather
  // than 22001, so only map this specific diagnostic to Prisma's length error.
  if (error.code === '22P03' && error.message?.includes('invalid length in external bit string')) {
    return { kind: 'LengthMismatch', column: error.column }
  }

  switch (error.code) {
    case '22001':
      return { kind: 'LengthMismatch', column: error.column }
    case '22003':
      return { kind: 'ValueOutOfRange', cause: error.message ?? 'N/A' }
    case '22P02':
      return { kind: 'InvalidInputValue', message: error.message ?? 'N/A' }
    case '23505': {
      const fields = parseKeyFields(error.detail)
      let constraint: { fields: string[] } | { index: string } | undefined

      if (error.constraint) {
        constraint = { index: error.constraint }
      } else if (fields !== undefined) {
        constraint = { fields }
      }

      let table = error.table
      if (table === undefined && fields !== undefined && fields.length > 0 && error.constraint) {
        const suffix = `_${fields.join('_')}_key`
        if (error.constraint.endsWith(suffix)) {
          table = error.constraint.slice(0, -suffix.length)
        }
      }

      return {
        kind: 'UniqueConstraintViolation',
        constraint,
        table,
      }
    }
    case '23502': {
      const fields = parseKeyFields(error.detail)
      return {
        kind: 'NullConstraintViolation',
        constraint: fields !== undefined ? { fields } : error.column ? { fields: [error.column] } : undefined,
      }
    }
    case '23503':
      return {
        kind: 'ForeignKeyConstraintViolation',
        constraint: buildConstraint(error),
      }
    case '23001':
      return {
        kind: 'RestrictViolation',
        constraint: buildConstraint(error),
      }
    case '3D000':
      return { kind: 'DatabaseDoesNotExist', db: extractQuotedValue(error.message) }
    case '42P04':
      return { kind: 'DatabaseAlreadyExists', db: extractQuotedValue(error.message) }
    case '28000':
      return { kind: 'DatabaseAccessDenied', db: extractQuotedValue(error.message) }
    case '28P01':
      return { kind: 'AuthenticationFailed', user: extractQuotedValue(error.message) }
    case '40001':
    case '40P01':
      return { kind: 'TransactionWriteConflict' }
    case '42P01':
      return {
        kind: 'TableDoesNotExist',
        table: error.table ?? extractErrorIdentifier(error.message, /^relation (.+) does not exist$/),
      }
    case '42703': {
      const column = error.column ?? extractErrorIdentifier(error.message, /^column (.+) does not exist$/)
      return { kind: 'ColumnNotFound', column }
    }
    case '53300':
      return { kind: 'TooManyConnections', cause: error.message ?? 'N/A' }
    default:
      return {
        kind: 'postgres',
        code: error.code ?? 'N/A',
        severity: error.severity ?? 'ERROR',
        message: error.message ?? 'N/A',
        detail: error.detail,
        column: error.column,
        hint: error.hint,
      }
  }
}

function parseKeyFields(detail?: string): string[] | undefined {
  const fields = detail?.match(/Key \(([^)]+)\)/)?.[1]
  return fields?.split(/,\s*/)
}

function buildConstraint(error: KingbaseError): { fields: string[] } | { index: string } | undefined {
  const fields = parseKeyFields(error.detail)
  if (fields !== undefined) {
    return { fields }
  }

  if (error.column) {
    return { fields: [error.column] }
  }

  if (error.constraint) {
    return { index: error.constraint }
  }

  return undefined
}

type SocketError = KingbaseError & {
  code: 'ENOTFOUND' | 'ECONNREFUSED' | 'ECONNRESET' | 'ETIMEDOUT'
  syscall: string
  errno: number
}

function mapSocketError(error: SocketError): MappedError {
  switch (error.code) {
    case 'ENOTFOUND':
    case 'ECONNREFUSED':
      return {
        kind: 'DatabaseNotReachable',
        host: error.address,
        port: error.port,
      }
    case 'ECONNRESET':
      return { kind: 'ConnectionClosed' }
    case 'ETIMEDOUT':
      return { kind: 'SocketTimeout' }
  }
}

function isSocketError(error: unknown): error is SocketError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as KingbaseError).code === 'string' &&
    typeof (error as KingbaseError).syscall === 'string' &&
    typeof (error as KingbaseError).errno === 'number' &&
    SOCKET_ERRORS.has((error as KingbaseError).code ?? '')
  )
}

const TLS_ERRORS = new Set([
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_CRL',
  'UNABLE_TO_DECRYPT_CERT_SIGNATURE',
  'UNABLE_TO_DECRYPT_CRL_SIGNATURE',
  'UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY',
  'CERT_SIGNATURE_FAILURE',
  'CRL_SIGNATURE_FAILURE',
  'CERT_NOT_YET_VALID',
  'CERT_HAS_EXPIRED',
  'CRL_NOT_YET_VALID',
  'CRL_HAS_EXPIRED',
  'ERROR_IN_CERT_NOT_BEFORE_FIELD',
  'ERROR_IN_CERT_NOT_AFTER_FIELD',
  'ERROR_IN_CRL_LAST_UPDATE_FIELD',
  'ERROR_IN_CRL_NEXT_UPDATE_FIELD',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_CHAIN_TOO_LONG',
  'CERT_REVOKED',
  'INVALID_CA',
  'INVALID_PURPOSE',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
  'HOSTNAME_MISMATCH',
  'ERR_TLS_CERT_ALTNAME_FORMAT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])

function isTlsError(error: unknown): error is Error & { code?: string } {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const typedError = error as KingbaseError
  if (typeof typedError.code === 'string') {
    return TLS_ERRORS.has(typedError.code)
  }

  return (
    typedError.message === 'The server does not support SSL connections' ||
    typedError.message === 'There was an error establishing an SSL connection'
  )
}

function isKingbaseError(error: unknown): error is KingbaseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as KingbaseError).code === 'string' &&
    typeof (error as KingbaseError).message === 'string' &&
    typeof (error as KingbaseError).severity === 'string' &&
    (typeof (error as KingbaseError).detail === 'string' || (error as KingbaseError).detail === undefined) &&
    (typeof (error as KingbaseError).column === 'string' || (error as KingbaseError).column === undefined) &&
    (typeof (error as KingbaseError).hint === 'string' || (error as KingbaseError).hint === undefined)
  )
}

function extractQuotedValue(message?: string): string | undefined {
  return message?.match(/"([^"]+)"/)?.[1]
}

function extractErrorIdentifier(message: string | undefined, pattern: RegExp): string | undefined {
  const identifier = message?.match(pattern)?.[1]
  return identifier?.replace(/^"|"$/g, '').replaceAll('""', '"')
}
