import { expect, test } from 'vitest'

import { credentialsToUri, uriToCredentials } from '../convertCredentials'

const uris = [
  'file:',
  'file:dev.db',
  'file:/absolute-dev.db',
  'file:./current-dev.db',
  'file:../parent-dev.db',
  'file:../../parent-parent-dev.db',
  'postgresql://localhost:5433?schema=production',
  'postgresql://other@localhost/otherdb?schema=my_schema&connect_timeout=10&application_name=myapp',
  'postgresql://',
  'postgresql://localhost',
  'postgresql://localhost:5433',
  'postgresql://localhost/mydb',
  'postgresql://user@localhost',
  'postgresql://user:secret@localhost',
  'postgresql://user:secret@localhost?sslmode=prefer',
  'mysql://user:password@localhost:3333',
  'mysql://user@localhost:3333',
  'mysql://user@localhost:3333/dbname',
  'mysql://user@localhost:3333/dbname?sslmode=prefer',
  'mongodb://mongodb0.example.com:27017/admin',
  'mongodb://myDBReader:D1fficultP%40ssw0rd@mongodb0.example.com:27017/admin',
]

for (const uri of uris) {
  test(`Convert ${uri}`, () => {
    const credentials = uriToCredentials(uri)
    const uriFromCredentials = credentialsToUri(credentials)

    expect(credentials).toMatchSnapshot()
    expect(uriFromCredentials).toMatchSnapshot()

    expect(uriFromCredentials).toBe(uri)
  })
}

const notIdenticalUris = [
  'postgresql://root:prisma@localhost/prisma?host=/var/run/postgresql/',
  'mysql://root@localhost/db?socket=/private/tmp/mysql.sock',
  'mysql://user:specialatchar@password@localhost:3333',
  'mongodb+srv://root:randompassword@cluster0.ab1cd.mongodb.net/mydb?retryWrites=true&w=majority',
]

for (const uri of notIdenticalUris) {
  test(`Convert ${uri}`, () => {
    const credentials = uriToCredentials(uri)
    const uriFromCredentials = credentialsToUri(credentials)

    expect(credentials).toMatchSnapshot()
    expect(uriFromCredentials).toMatchSnapshot()
  })
}

test('Kingbase MySQL accepts both URL protocols', () => {
  const canonical = uriToCredentials('kingbase-mysql://user:password@localhost:54321/mydb?schema=public')
  const alias = uriToCredentials('kingbase://user:password@localhost:54321/mydb?schema=public')

  expect(canonical.type).toBe('kingbase-mysql')
  expect(alias).toMatchObject({
    type: 'kingbase-mysql',
    host: 'localhost',
    port: 54321,
    database: 'mydb',
    schema: 'public',
  })
  expect(credentialsToUri(alias)).toBe('kingbase-mysql://user:password@localhost:54321/mydb?schema=public')
})

test('Kingbase Oracle round-trips its URL protocol', () => {
  const uri = 'kingbase-oracle://user:password@localhost:54325/mydb?schema=public'
  const credentials = uriToCredentials(uri)

  expect(credentials).toMatchObject({
    type: 'kingbase-oracle',
    host: 'localhost',
    port: 54325,
    user: 'user',
    password: 'password',
    database: 'mydb',
    schema: 'public',
  })
  expect(credentialsToUri(credentials)).toBe(uri)
})
