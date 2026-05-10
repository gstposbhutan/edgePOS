/**
 * NEXUS BHUTAN - Database Package
 *
 * This package provides shared database schemas, Supabase client configuration,
 * and migration scripts for the entire NEXUS BHUTAN ecosystem.
 *
 * @package @nexus-bhutan/database
 */

// Export database client and schemas
export { db, closeConnection } from './db';
export * from './schema';

// Supabase client configuration (for direct Supabase usage when needed)
export const createSupabaseClient = (url: string, key: string) => {
  // Placeholder for Supabase client initialization
  return { url, key };
};

// Re-export types for backward compatibility
export type { Entity, Product, Transaction } from './schema';
