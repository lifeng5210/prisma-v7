import { runtimeIntegrationTest } from '../../__helpers__/integrationTest'
import { database } from './__database'
import { scenarios } from './__scenarios'

if (process.env.TEST_KINGBASE_MYSQL_URI) {
  runtimeIntegrationTest({ database, scenarios })
} else {
  describe('Kingbase MySQL integration tests', () => {
    test.skip('requires TEST_KINGBASE_MYSQL_URI', () => {})
  })
}
