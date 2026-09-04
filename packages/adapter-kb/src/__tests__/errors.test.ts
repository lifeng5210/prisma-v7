import { describe, expect, test } from 'vitest'

import { convertDriverError } from '../errors'

describe('Kingbase error conversion', () => {
  test('maps a unique constraint violation', () => {
    expect(
      convertDriverError({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        severity: 'ERROR',
        detail: 'Key (email)=(alice@example.com) already exists.',
      }),
    ).toMatchObject({
      kind: 'UniqueConstraintViolation',
      constraint: { fields: ['email'] },
      originalCode: '23505',
    })
  })

  test('maps an overlong bit string to a length mismatch', () => {
    expect(
      convertDriverError({
        code: '22P03',
        message: 'invalid length in external bit string',
        severity: 'ERROR',
      }),
    ).toMatchObject({
      kind: 'LengthMismatch',
      originalCode: '22P03',
      originalMessage: 'invalid length in external bit string',
    })
  })

  test('preserves other malformed binary input errors', () => {
    expect(
      convertDriverError({ code: '22P03', message: 'invalid binary representation', severity: 'ERROR' }),
    ).toMatchObject({
      kind: 'postgres',
      code: '22P03',
      originalMessage: 'invalid binary representation',
    })
  })

  test('preserves unknown Kingbase SQLSTATE errors', () => {
    expect(convertDriverError({ code: 'KB001', message: 'Kingbase error', severity: 'ERROR' })).toMatchObject({
      kind: 'postgres',
      code: 'KB001',
      originalMessage: 'Kingbase error',
    })
  })

  test('maps connection refusal', () => {
    expect(
      convertDriverError({ code: 'ECONNREFUSED', address: 'localhost', port: 54321, syscall: 'connect', errno: -111 }),
    ).toMatchObject({
      kind: 'DatabaseNotReachable',
      host: 'localhost',
      port: 54321,
    })
  })

  test('maps a reset connection separately from an unreachable database', () => {
    expect(convertDriverError({ code: 'ECONNRESET', syscall: 'read', errno: -104 })).toEqual({
      kind: 'ConnectionClosed',
    })
  })

  test('does not convert ordinary JavaScript errors into database errors', () => {
    expect(() => convertDriverError(new Error('programming error'))).toThrow('programming error')
  })

  test('maps TLS errors', () => {
    expect(convertDriverError({ code: 'CERT_HAS_EXPIRED', message: 'certificate expired' })).toEqual({
      kind: 'TlsConnectionError',
      reason: 'certificate expired',
    })
  })

  test('does not create an empty unique constraint field list', () => {
    expect(
      convertDriverError({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        severity: 'ERROR',
        detail: 'duplicate key value violates unique constraint "User_email_key"',
        constraint: 'User_email_key',
      }),
    ).toMatchObject({
      kind: 'UniqueConstraintViolation',
      constraint: { index: 'User_email_key' },
    })
  })

  test('recovers constraint fields and table/column names from driver details', () => {
    expect(
      convertDriverError({
        code: '23503',
        message: 'insert or update violates foreign key constraint',
        severity: 'ERROR',
        detail: 'Key (author_id)=(1) is not present in table "Author".',
      }),
    ).toMatchObject({
      kind: 'ForeignKeyConstraintViolation',
      constraint: { fields: ['author_id'] },
    })

    expect(
      convertDriverError({
        code: '42P01',
        message: 'relation "UserTest" does not exist',
        severity: 'ERROR',
      }),
    ).toMatchObject({ kind: 'TableDoesNotExist', table: 'UserTest' })

    expect(
      convertDriverError({
        code: '42703',
        message: 'column "missing" does not exist',
        severity: 'ERROR',
      }),
    ).toMatchObject({ kind: 'ColumnNotFound', column: 'missing' })
  })
})
