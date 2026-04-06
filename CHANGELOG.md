# Changelog

All notable changes to the NEXUS BHUTAN project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Supabase project initialization and configuration
- Prisma ORM setup with PostgreSQL schema for GST 2026 compliance
- Complete database schema for NEXUS BHUTAN ecosystem:
  - Entity model (multi-tenant supply chain hierarchy)
  - Product model (with image embedding storage for AI recognition)
  - Transaction model (GST 2026 compliant with 5% flat rate)
  - AuditLog model (compliance and fraud detection tracking)
  - InventoryMovement model (stock flow tracking)
- Environment variable configuration for Supabase connection
- Database client setup examples for POS terminal integration

### Changed
- Switched from Drizzle ORM to Prisma 6 for better Supabase compatibility
- Updated vector storage approach from pgVector to JSON arrays

### Technical Details
- Database: PostgreSQL via Supabase (project: uoermqevxkuxbazbzxkc)
- ORM: Prisma 6 with traditional schema-based configuration
- Connection: Pooler and direct connection URLs configured
- Schema: Multi-tenant design with RLS-ready structure

### Database Schema
- **entities**: Multi-tenant foundation (Distributor → Wholesaler → Retailer)
- **products**: Central brain with 1536-dim image embeddings for AI
- **transactions**: GST compliant accounting ledger with digital signatures
- **audit_logs**: Complete audit trail for compliance
- **inventory_movements**: Stock tracking with reconciliation support

### Known Issues
- Database connection authentication pending verification
- Need to configure Row-Level Security (RLS) policies
- Migration scripts to be created once connection is established

### Next Steps
- Resolve database connection authentication
- Push schema to Supabase
- Configure RLS policies for multi-tenant isolation
- Create seed data for testing
- Set up Prisma Client generation