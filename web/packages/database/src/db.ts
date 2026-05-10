/**
 * NEXUS BHUTAN - Database Client Setup
 *
 * Centralized database connection and client configuration
 * for Supabase PostgreSQL with Drizzle ORM.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Database connection string from environment variables
const connectionString = process.env.DATABASE_URL || '';

// Create PostgreSQL connection with pooler-compatible settings
// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, {
  prepare: false,
  max: 10, // Maximum number of connections
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create Drizzle instance with schema
export const db = drizzle(client, { schema });

// Export for use in applications and services
export default db;

// Export schema for direct querying
export * from './schema';

// Graceful shutdown
export const closeConnection = async () => {
  await client.end();
};