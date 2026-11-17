import { Role } from '@prisma-kb/client/index-browser'

test('can import enum from browser bundle', () => {
  expect(Role).toEqual({
    USER: 'USER',
    ADMIN: 'ADMIN',
  })
})

export {}
