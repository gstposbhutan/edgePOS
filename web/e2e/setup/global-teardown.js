const { cleanupDatabase } = require('../fixtures/db-cleanup')

async function globalTeardown() {
  console.log('[E2E Teardown] Cleaning up test database...')
  await cleanupDatabase()
  console.log('[E2E Teardown] Cleanup complete')
}

module.exports = globalTeardown
