import { ColumnTypeEnum } from '@prisma/driver-adapter-utils'
import { describe, expect, test } from 'vitest'

import { fieldToOracleColumnType, mapOracleArg, mapOracleRow } from '../kingbase-oracle-conversion'

describe('Kingbase Oracle field conversion', () => {
  test.each([
    [21, ColumnTypeEnum.Int32],
    [23, ColumnTypeEnum.Int32],
    [8100, ColumnTypeEnum.Int32],
    [20, ColumnTypeEnum.Int64],
    [700, ColumnTypeEnum.Float],
    [701, ColumnTypeEnum.Double],
    [1700, ColumnTypeEnum.Numeric],
    [16, ColumnTypeEnum.Boolean],
    [1082, ColumnTypeEnum.Date],
    [1083, ColumnTypeEnum.Time],
    [1114, ColumnTypeEnum.DateTime],
    [8020, ColumnTypeEnum.DateTime],
    [114, ColumnTypeEnum.Json],
    [3802, ColumnTypeEnum.Json],
    [17, ColumnTypeEnum.Bytes],
    [8013, ColumnTypeEnum.Bytes],
    [1043, ColumnTypeEnum.Text],
    [8014, ColumnTypeEnum.Text],
    [8015, ColumnTypeEnum.Text],
    [8016, ColumnTypeEnum.Text],
    [18, ColumnTypeEnum.Character],
  ])('maps Oracle type id %s to %s', (typeId, expected) => {
    expect(fieldToOracleColumnType(typeId)).toBe(expected)
  })

  test.each([
    [1009, ColumnTypeEnum.TextArray],
    [1003, ColumnTypeEnum.TextArray],
    [1015, ColumnTypeEnum.TextArray],
  ])('maps PostgreSQL-compatible catalog array type id %s to %s', (typeId, expected) => {
    expect(fieldToOracleColumnType(typeId)).toBe(expected)
  })

  test.each([1182, 1115, 1185, 199, 3807, 1001, 6124, 6126, 8017, 8019, 8021])(
    'rejects unsupported array type id %s before result decoding',
    (typeId) => {
      expect(() => fieldToOracleColumnType(typeId)).toThrow(`Unsupported column type`)
    },
  )

  test('maps Oracle rows to protocol values', () => {
    expect(mapOracleRow({ id: 1, name: 'Alice' })).toEqual([1, 'Alice'])
    expect(mapOracleRow([2n])).toEqual(['2'])
    expect(mapOracleRow(['0x0102'], [{ dataTypeID: 8013 }])).toEqual([Buffer.from([1, 2])])
    expect(mapOracleRow(['\\x0a'], [{ dataTypeID: 17 }])).toEqual([Buffer.from([0x0a])])
    expect(mapOracleRow(['2025-01-02 03:04:05'], [{ dataTypeID: 8020 }])).toEqual(['2025-01-02T03:04:05+00:00'])
    expect(mapOracleRow(['{"hello":"world"}'], [{ dataTypeID: 114 }])).toEqual(['{"hello":"world"}'])
    expect(mapOracleRow(['aGVsbG8='], [{ dataTypeID: 114 }])).toEqual(['"aGVsbG8="'])
    expect(mapOracleRow([new Date(2025, 0, 2, 3, 4, 5)], [{ dataTypeID: 8020 }])).toEqual(['2025-01-02T03:04:05+00:00'])
    expect(mapOracleRow([new Date(2025, 0, 2, 3, 4, 5)], [{ dataTypeID: 1114 }])).toEqual(['2025-01-02T03:04:05+00:00'])
    expect(mapOracleRow(['-128', '127'], [{ dataTypeID: 8100 }, { dataTypeID: 8100 }])).toEqual([-128, 127])
  })

  test('preserves offset-less wall-clock timestamps in a non-UTC zone across DST', () => {
    const previousTimezone = process.env.TZ
    process.env.TZ = 'America/New_York'

    try {
      expect(mapOracleRow([new Date(2025, 0, 15, 12, 34, 56)], [{ dataTypeID: 8020 }])).toEqual([
        '2025-01-15T12:34:56+00:00',
      ])
      expect(mapOracleRow([new Date(2025, 6, 15, 12, 34, 56)], [{ dataTypeID: 1114 }])).toEqual([
        '2025-07-15T12:34:56+00:00',
      ])
    } finally {
      if (previousTimezone === undefined) {
        delete process.env.TZ
      } else {
        process.env.TZ = previousTimezone
      }
    }
  })

  test('maps bytes without MySQL bit encoding', () => {
    expect(mapOracleArg('aGVsbG8=', { scalarType: 'bytes', dbType: 'BLOB', arity: 'scalar' })).toEqual(
      Buffer.from('hello'),
    )
  })

  test.each([
    ['DATE', '2025-01-02 03:04:05.678'],
    ['TIMESTAMP', '2025-01-02 03:04:05.678'],
    ['TIMESTAMPTZ', '2025-01-02T03:04:05.678Z'],
    ['TIMESTAMPLOCALTZ', '2025-01-02T03:04:05.678Z'],
    ['TIME', '03:04:05.678'],
  ])('maps Oracle %s arguments without losing their temporal components', (dbType, expected) => {
    expect(
      mapOracleArg(new Date('2025-01-02T03:04:05.678Z'), {
        scalarType: 'datetime',
        dbType,
        arity: 'scalar',
      }),
    ).toBe(expected)
  })
})
