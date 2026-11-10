-- ============================================================================
-- Topic Log — Script Rollback Migração Versionada 003
-- ============================================================================

DROP FUNCTION IF EXISTS fn_find_shipments_in_route_corridor(GEOGRAPHY, INT, INT, VARCHAR);
DROP TABLE IF EXISTS trip_legs CASCADE;
DROP TABLE IF EXISTS brazilian_municipalities CASCADE;
