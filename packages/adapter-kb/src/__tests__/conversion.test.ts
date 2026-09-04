import { ColumnTypeEnum } from '@prisma/driver-adapter-utils'
import { describe, expect, test } from 'vitest'

import { fieldToColumnType, mapArg, mapRow } from '../conversion'

describe('Kingbase field conversion', () => {
  test.each([
    [21, ColumnTypeEnum.Int32],
    [23, ColumnTypeEnum.Int32],
    [7014, ColumnTypeEnum.Int32],
    [8100, ColumnTypeEnum.Int32],
    [20, ColumnTypeEnum.Int64],
    [26, ColumnTypeEnum.Int64],
    [7082, ColumnTypeEnum.Int64],
    [7084, ColumnTypeEnum.Int64],
    [700, ColumnTypeEnum.Float],
    [701, ColumnTypeEnum.Double],
    [1700, ColumnTypeEnum.Numeric],
    [790, ColumnTypeEnum.Numeric],
    [16, ColumnTypeEnum.Boolean],
    [1082, ColumnTypeEnum.Date],
    [7944, ColumnTypeEnum.Date],
    [1083, ColumnTypeEnum.Time],
    [1266, ColumnTypeEnum.Time],
    [7950, ColumnTypeEnum.Time],
    [1114, ColumnTypeEnum.DateTime],
    [7952, ColumnTypeEnum.DateTime],
    [7954, ColumnTypeEnum.DateTime],
    [114, ColumnTypeEnum.Json],
    [3802, ColumnTypeEnum.Json],
    [7024, ColumnTypeEnum.Json],
    [17, ColumnTypeEnum.Bytes],
    [3383, ColumnTypeEnum.Bytes],
    [7021, ColumnTypeEnum.Bytes],
    [1043, ColumnTypeEnum.Text],
    [7018, ColumnTypeEnum.Text],
    [8016, ColumnTypeEnum.Text],
    [18, ColumnTypeEnum.Character],
    [142, ColumnTypeEnum.Text],
  ])('maps type id %s to %s', (typeId, expected) => {
    expect(fieldToColumnType(typeId)).toBe(expected)
  })

  test.each([
    [1000, ColumnTypeEnum.BooleanArray],
    [1001, ColumnTypeEnum.BytesArray],
    [1005, ColumnTypeEnum.Int32Array],
    [1007, ColumnTypeEnum.Int32Array],
    [1016, ColumnTypeEnum.Int64Array],
    [1021, ColumnTypeEnum.FloatArray],
    [1022, ColumnTypeEnum.DoubleArray],
    [1231, ColumnTypeEnum.NumericArray],
    [1182, ColumnTypeEnum.DateArray],
    [1183, ColumnTypeEnum.TimeArray],
    [1115, ColumnTypeEnum.DateTimeArray],
    [199, ColumnTypeEnum.JsonArray],
    [3807, ColumnTypeEnum.JsonArray],
    [2951, ColumnTypeEnum.UuidArray],
    [7083, ColumnTypeEnum.Int64Array],
    [7953, ColumnTypeEnum.DateTimeArray],
    [1002, ColumnTypeEnum.TextArray],
    [8101, ColumnTypeEnum.TextArray],
  ])('maps array type id %s to %s', (typeId, expected) => {
    expect(fieldToColumnType(typeId)).toBe(expected)
  })

  test('uses the typmod to distinguish Kingbase BIT(1) from binary BIT', () => {
    expect(fieldToColumnType(4655, 1)).toBe(ColumnTypeEnum.Boolean)
    expect(fieldToColumnType(4655, 8)).toBe(ColumnTypeEnum.Bytes)
  })

  test('maps driver rows to arrays', () => {
    expect(mapRow({ id: 1, name: 'Alice' })).toEqual([1, 'Alice'])
    expect(mapRow([1, 2n])).toEqual([1, '2'])
  })

  test('converts Kingbase binary types returned as hex literals to byte arrays', () => {
    expect(mapRow(['0xAA'], [{ dataTypeID: 4655 }])).toEqual([Buffer.from([0xaa])])
    expect(mapRow(['0x010203'], [{ dataTypeID: 8013 }])).toEqual([Buffer.from([1, 2, 3])])
    expect(mapRow(['\\xaa'], [{ dataTypeID: 3383 }])).toEqual([Buffer.from([0xaa])])
    expect(mapRow(['\\x0a'], [{ dataTypeID: 17 }])).toEqual([Buffer.from([0x0a])])
    expect(mapRow([['\\x0a', '\\x0b']], [{ dataTypeID: 1001 }])).toEqual([[Buffer.from([0x0a]), Buffer.from([0x0b])]])
    expect(mapRow([Buffer.from([1, 2])], [{ dataTypeID: 3383 }])).toEqual([Buffer.from([1, 2])])
  })

  test('keeps valid JSON text and quotes unquoted JSON string scalars', () => {
    expect(mapRow(['{"payload":"SGVsbG8="}'], [{ dataTypeID: 7024 }])).toEqual(['{"payload":"SGVsbG8="}'])
    expect(mapRow(['SGVsbG8='], [{ dataTypeID: 7024 }])).toEqual(['"SGVsbG8="'])
    expect(mapRow([['SGVsbG8=', 'hello']], [{ dataTypeID: 7024 }])).toEqual(['["SGVsbG8=","hello"]'])
  })

  test('decodes BIT(1) values as booleans rather than byte arrays', () => {
    expect(mapRow(['0x80'], [{ dataTypeID: 4655, dataTypeModifier: 1 }])).toEqual([true])
    expect(mapRow(['0x00'], [{ dataTypeID: 4655, dataTypeModifier: 1 }])).toEqual([false])
    expect(mapRow(['0x01'], [{ dataTypeID: 4655, dataTypeModifier: 1 }])).toEqual([true])
    expect(mapRow([Buffer.from([0, 0, 0, 0, 0, 0, 0, 1, 0x80])], [{ dataTypeID: 4655, dataTypeModifier: 1 }])).toEqual([
      true,
    ])
    // wider BIT values keep their byte-array form
    expect(mapRow(['0xAA'], [{ dataTypeID: 4655, dataTypeModifier: 8 }])).toEqual([Buffer.from([0xaa])])
  })

  test('maps Prisma bytes and datetime arguments', () => {
    expect(mapArg('aGVsbG8=', { scalarType: 'bytes', arity: 'scalar' })).toEqual(Buffer.from('hello'))
    expect(mapArg('qg==', { scalarType: 'bytes', dbType: 'Bit', arity: 'scalar' })).toEqual(
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 8, 0xaa]),
    )
    expect(mapArg(new Uint8Array([0xaa]), { scalarType: 'bytes', dbType: 'Bit', arity: 'scalar' })).toEqual(
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 8, 0xaa]),
    )
    expect(mapArg(true, { scalarType: 'boolean', dbType: 'Bit', arity: 'scalar' })).toEqual(
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 1, 0x80]),
    )
    expect(mapArg(false, { scalarType: 'boolean', dbType: 'Bit', arity: 'scalar' })).toEqual(
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 1, 0x00]),
    )
    expect(mapArg('2025-01-02T03:04:05.678Z', { scalarType: 'datetime', arity: 'scalar' })).toBe(
      '2025-01-02 03:04:05.678',
    )
    expect(
      mapArg(new Date('2025-01-02T03:04:05.678Z'), { scalarType: 'datetime', dbType: 'DATE', arity: 'scalar' }),
    ).toBe('2025-01-02')
    expect(
      mapArg(new Date('2025-01-02T03:04:05.678Z'), { scalarType: 'datetime', dbType: 'TIME', arity: 'scalar' }),
    ).toBe('03:04:05.678')
  })
})
