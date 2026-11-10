-- ============================================================================
-- Topic Log — Script DDL PostgreSQL 16 + PostGIS (Migração Versionada 002)
-- Escopo: PR-03 (Matching Geoespacial, Rotas, Paradas Intermediárias e Busca Radial)
-- Referências: DOCS/05-Banco-de-Dados.md, DOCS/02-TRD-Tecnico.md, ADR-0004, D02, D03, D04
-- ============================================================================

-- 1. Habilitação de Extensões Espaciais PostGIS
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela de Municípios e Regiões de Atendimento (service_regions) com PostGIS
CREATE TABLE IF NOT EXISTS service_regions (
    ibge_code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    state_uf CHAR(2) NOT NULL DEFAULT 'MG',
    priority_order INT NOT NULL DEFAULT 999,
    is_pilot BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    center_point GEOGRAPHY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_regions_geom ON service_regions USING GIST (center_point);
CREATE INDEX IF NOT EXISTS idx_service_regions_uf_name ON service_regions (state_uf, name);

-- Inserção das Cidades Piloto e Corredores de Minas Gerais
INSERT INTO service_regions (ibge_code, name, state_uf, priority_order, is_pilot, is_enabled, center_point)
VALUES
    ('3136207', 'João Monlevade', 'MG', 1, TRUE, TRUE, ST_SetSRID(ST_MakePoint(-43.1736, -19.8100), 4326)::geography),
    ('3106200', 'Belo Horizonte', 'MG', 2, TRUE, TRUE, ST_SetSRID(ST_MakePoint(-43.9345, -19.9167), 4326)::geography),
    ('3105400', 'Barão de Cocais', 'MG', 3, FALSE, TRUE, ST_SetSRID(ST_MakePoint(-43.4867, -19.9444), 4326)::geography),
    ('3109907', 'Caeté', 'MG', 4, FALSE, TRUE, ST_SetSRID(ST_MakePoint(-43.6689, -19.8800), 4326)::geography),
    ('3144706', 'Nova Era', 'MG', 5, FALSE, TRUE, ST_SetSRID(ST_MakePoint(-43.0311, -19.7578), 4326)::geography),
    ('3131703', 'Itabira', 'MG', 6, FALSE, TRUE, ST_SetSRID(ST_MakePoint(-43.2260, -19.6190), 4326)::geography),
    ('3131307', 'Ipatinga', 'MG', 7, FALSE, TRUE, ST_SetSRID(ST_MakePoint(-42.5400, -19.4680), 4326)::geography),
    ('3146107', 'Ouro Preto', 'MG', 8, FALSE, TRUE, ST_SetSRID(ST_MakePoint(-43.5033, -20.3856), 4326)::geography)
ON CONFLICT (ibge_code) DO UPDATE
SET name = EXCLUDED.name,
    priority_order = EXCLUDED.priority_order,
    is_pilot = EXCLUDED.is_pilot,
    center_point = EXCLUDED.center_point;

-- 3. Tabela de Waypoints / Paradas das Viagens com Geometria (trip_waypoints)
CREATE TABLE IF NOT EXISTS trip_waypoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    sequence_order INT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state_uf CHAR(2) NOT NULL DEFAULT 'MG',
    location_point GEOGRAPHY(Point, 4326) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_trip_waypoint_seq UNIQUE (trip_id, sequence_order)
);

CREATE INDEX IF NOT EXISTS idx_trip_waypoints_trip ON trip_waypoints (trip_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_trip_waypoints_geom ON trip_waypoints USING GIST (location_point);

-- 4. Tabela de Log de Matching e Compatibilidade Geoespacial (matching_evaluations)
CREATE TABLE IF NOT EXISTS matching_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL,
    trip_id UUID NOT NULL,
    is_compatible BOOLEAN NOT NULL,
    match_score INT NOT NULL,
    match_type VARCHAR(40) NOT NULL,
    rejection_reason VARCHAR(50) NOT NULL DEFAULT 'NONE',
    distance_km NUMERIC(8, 2) NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matching_shipment ON matching_evaluations (shipment_id);
CREATE INDEX IF NOT EXISTS idx_matching_trip ON matching_evaluations (trip_id);
CREATE INDEX IF NOT EXISTS idx_matching_compatible ON matching_evaluations (is_compatible, match_score DESC);

-- 5. Função PostGIS Canônica: Busca de Oportunidades em Raio de até R metros (ex: 2.000m)
CREATE OR REPLACE FUNCTION fn_find_shipments_within_radius(
    p_center_lon DOUBLE PRECISION,
    p_center_lat DOUBLE PRECISION,
    p_radius_meters INT DEFAULT 2000
)
RETURNS TABLE (
    shipment_id UUID,
    distance_meters DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS shipment_id,
        ST_Distance(
            s.approximate_pickup_point, 
            ST_SetSRID(ST_MakePoint(p_center_lon, p_center_lat), 4326)::geography
        ) AS distance_meters
    FROM shipments s
    WHERE s.status = 'PUBLISHED'
      AND s.approximate_pickup_point IS NOT NULL
      AND ST_DWithin(
            s.approximate_pickup_point, 
            ST_SetSRID(ST_MakePoint(p_center_lon, p_center_lat), 4326)::geography, 
            p_radius_meters
          )
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;
