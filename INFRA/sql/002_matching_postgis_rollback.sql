-- ============================================================================
-- Topic Log — Script DDL de Rollback (Reversão da Migração 002)
-- Escopo: PR-03 (Reversão de tabelas e funções de matching geoespacial)
-- ============================================================================

DROP FUNCTION IF EXISTS fn_find_shipments_within_radius(DOUBLE PRECISION, DOUBLE PRECISION, INT);
DROP TABLE IF EXISTS matching_evaluations CASCADE;
DROP TABLE IF EXISTS trip_waypoints CASCADE;
-- Preserva service_regions se outras tabelas dependerem dela, ou exclui com segurança:
DROP TABLE IF EXISTS service_regions CASCADE;
