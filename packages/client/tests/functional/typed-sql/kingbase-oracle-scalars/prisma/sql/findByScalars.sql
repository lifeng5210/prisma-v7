SELECT "id"
FROM "TestModel"
WHERE "intValue" = $1
  AND "stringValue" = $2
  AND "boolValue" = $3
  AND "decimalValue" = $4
  AND "dateValue" = $5
  AND "timestampTzValue" = $6
