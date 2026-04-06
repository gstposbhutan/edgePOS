# Changelog

All notable changes to the NEXUS BHUTAN project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Database Connection Testing Suite**: Comprehensive troubleshooting tools for Supabase connectivity
  - `test-db-connection.js`: Direct PostgreSQL connection testing
  - `test-db-connection-advanced.js`: Advanced connection diagnostics
  - `test-supabase-rest.js`: REST API connection verification
- **SQL Schema Creation**: Complete database schema ready for manual execution
  - `supabase/schema.sql`: Production-ready SQL with indexes and sample data
  - Multi-tenant entity hierarchy (Distributor → Wholesaler → Retailer)
  - AI-ready product table with image embedding storage
  - GST 2026 compliant transaction ledger (5% flat rate + ITC)
  - Complete audit trail for compliance and fraud detection
  - Inventory movement tracking across supply chain
- **Alternative Connection Methods**: Multiple approaches for database connectivity
  - Supabase REST API (✅ Working)
  - Direct PostgreSQL connection (requires password verification)
  - Prisma ORM integration (pending schema creation)
- **Database Setup Scripts**: Automated Prisma client generation and schema pulling
- **Sample Data**: Initial test data for 3 entities and 3 products

### Changed
- **Database Password Resolution**: Corrected authentication credentials
- **Connection Approach**: Shifted from direct PostgreSQL to REST API primary method
- **Schema Creation**: Manual SQL execution instead of automated migration

### Technical Details
- **Database**: PostgreSQL via Supabase (project: uoermqevxkuxbazbzxkc)
- **Connection Methods**: REST API (working), Direct PostgreSQL (troubleshooting)
- **Authentication**: Service role and anon keys confirmed working
- **Schema Design**: Multi-tenant with RLS-ready structure
- **GST Compliance**: 5% flat rate with Input Tax Credit tracking

### Database Schema Features
- **entities**: Multi-tenant foundation with parent-child relationships
- **products**: Central brain with JSON-stored image embeddings (1536-dim)
- **transactions**: GST compliant ledger with digital signature support
- **audit_logs**: Complete audit trail for regulatory compliance
- **inventory_movements**: Stock reconciliation across supply chain

### Connection Status
- ✅ **Supabase REST API**: Working with anon/service role keys
- ⚠️ **Direct PostgreSQL**: Password authentication under investigation
- 📋 **SQL Schema**: Ready for manual execution in Supabase dashboard
- 🔧 **Prisma Integration**: Pending schema creation

### Next Steps
1. Execute `supabase/schema.sql` in Supabase SQL Editor
2. Run `update-prisma-client.js` to generate Prisma client
3. Configure Row-Level Security (RLS) policies
4. Begin POS terminal development with working database
5. Set up automated migrations for future schema changes

### Documentation
- Updated database connection troubleshooting guide
- Added comprehensive SQL schema with sample data
- Created automated Prisma client update script
- Documented REST API integration patterns