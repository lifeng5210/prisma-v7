SELECT
  "tinyIntValue",
  "intValue",
  "bigIntValue",
  "floatValue",
  "decimalValue",
  "stringValue",
  "clobValue",
  "nclobValue",
  "boolValue",
  "bytesValue",
  "jsonValue",
  "uuidValue",
  "xmlValue",
  "dateValue",
  "timestampValue",
  "timestampTzValue",
  "timestampLocalTzValue"
FROM "TestModel"
WHERE "id" = $1
