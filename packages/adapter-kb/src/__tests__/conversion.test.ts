import { ColumnTypeEnum } from '@prisma-kb/driver-adapter-utils'
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
    1000, 1001, 1005, 1007, 1016, 1021, 1022, 1231, 1182, 1183, 1115, 199, 3807, 2951, 7083, 7953, 1002, 8101,
  ])('rejects SQL array type id %s', (typeId) => {
    expect(() => fieldToColumnType(typeId)).toThrow('Unsupported column type')
    for (const value of [[], [1, 2], null]) {
      expect(() => mapRow([value], [{ dataTypeID: typeId }])).toThrow('Unsupported column type')
    }
  })

  test('rejects SQL array arguments but keeps JSON array values', () => {
    for (const value of [[], [1, 2], null]) {
      expect(() => mapArg(value, { scalarType: 'int', arity: 'list' })).toThrow('Arrays are not supported')
    }
    expect(() => mapArg([1, 2], { scalarType: 'int', arity: 'scalar' })).toThrow('Arrays are not supported')
    expect(mapArg([1, '123', null], { scalarType: 'json', arity: 'scalar' })).toBe('[1,"123",null]')
    expect(mapArg('[1,2]', { scalarType: 'json', arity: 'scalar' })).toBe('[1,2]')
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
    expect(mapRow([Buffer.from([1, 2])], [{ dataTypeID: 3383 }])).toEqual([Buffer.from([1, 2])])
  })

  test('preserves complete JSON wire text without guessing string contents', () => {
    expect(mapRow(['{"payload":"SGVsbG8="}'], [{ dataTypeID: 7024 }])).toEqual(['{"payload":"SGVsbG8="}'])
    expect(mapRow(['"SGVsbG8="'], [{ dataTypeID: 7024 }])).toEqual(['"SGVsbG8="'])
    expect(mapRow([['SGVsbG8=', 'hello']], [{ dataTypeID: 7024 }])).toEqual(['["SGVsbG8=","hello"]'])
  })

  test.each([114, 3802, 7024])('preserves JSON value types for wire OID %s', (dataTypeID) => {
    for (const value of [
      '123',
      'true',
      'false',
      'null',
      '{}',
      '[]',
      '"quoted"',
      '',
      123,
      true,
      false,
      null,
      [1, '123'],
      { n: 'null' },
    ]) {
      const text = JSON.stringify(value)
      expect(mapRow([text], [{ dataTypeID }])).toEqual([text])
    }
    expect(mapRow([null], [{ dataTypeID }])).toEqual([null])
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

describe('Kingbase full-text search parameters', () => {
  test.each([
    'John & Smith',
    'John | April',
    '(John | April) & !Smith',
    '!John',
    'John <-> Smith',
    'John:*',
    'John <2> Smith',
    "'John':A",
    'John Smith',
    '',
  ])('preserves %s for database tsquery parsing', (input) => {
    expect(mapArg(input, { scalarType: 'string', arity: 'scalar' })).toBe(input)
  })
})
