const { seedDatabase } = require('../fixtures/db-seed')

async function globalSetup(config) {
  console.log('[E2E Setup] Seeding test database...')
  await seedDatabase()
  console.log('[E2E Setup] Database seeded successfully')
}

module.exports = globalSetup
