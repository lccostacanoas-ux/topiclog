-- ============================================================================
-- Topic Log — Script Rollback DDL PostgreSQL 16 (Reversão Versionada 004)
-- ============================================================================

DROP TABLE IF EXISTS priority_offers CASCADE;
DROP TABLE IF EXISTS proposal_audit_events CASCADE;
DROP TABLE IF EXISTS contract_leg_reservations CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS proposals CASCADE;
