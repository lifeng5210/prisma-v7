import { introspectionIntegrationTest } from '../../__helpers__/integrationTest'
import { database } from './__database'
import { scenarios } from './__scenarios'

if (process.env.TEST_KINGBASE_ORACLE_URI) {
  introspectionIntegrationTest({ database, scenarios })
} else {
  describe('Kingbase Oracle introspection tests', () => {
    test.skip('requires TEST_KINGBASE_ORACLE_URI', () => {})
  })
}
