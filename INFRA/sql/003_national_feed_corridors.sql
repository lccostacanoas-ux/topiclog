-- ============================================================================
-- Topic Log — Script DDL PostgreSQL 16 + PostGIS (Migração Versionada 003)
-- Escopo: Complemento PR-03 (Feed Nacional, Corredores Viários e No Meu Trajeto)
-- Referências: DOCS/05-Banco-de-Dados.md, DOCS/02-TRD-Tecnico.md, D02, D03, D04
-- ============================================================================

-- 1. Tabela de Municípios Brasileiros (brazilian_municipalities)
CREATE TABLE IF NOT EXISTS brazilian_municipalities (
    ibge_code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    state_uf CHAR(2) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOGRAPHY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_br_mun_geom ON brazilian_municipalities USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_br_mun_uf_name ON brazilian_municipalities (state_uf, name);

-- 2. Tabela de Trechos e Capacidade por Segmento da Viagem (trip_legs)
CREATE TABLE IF NOT EXISTS trip_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    leg_sequence INT NOT NULL,
    from_city VARCHAR(100) NOT NULL,
    to_city VARCHAR(100) NOT NULL,
    from_point GEOGRAPHY(Point, 4326) NOT NULL,
    to_point GEOGRAPHY(Point, 4326) NOT NULL,
    distance_meters INT NOT NULL,
    total_capacity_grams INT NOT NULL,
    allocated_capacity_grams INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_trip_leg UNIQUE (trip_id, leg_sequence)
);

CREATE INDEX IF NOT EXISTS idx_trip_legs_trip ON trip_legs (trip_id, leg_sequence);
CREATE INDEX IF NOT EXISTS idx_trip_legs_geom ON trip_legs USING GIST (from_point, to_point);

-- 3. Função PostGIS: Busca de Oportunidades em Corredor Viário com Buffer
CREATE OR REPLACE FUNCTION fn_find_shipments_in_route_corridor(
    p_route_linestring GEOGRAPHY,
    p_buffer_meters INT DEFAULT 20000,
    p_max_weight_grams INT DEFAULT 20000,
    p_vehicle_type VARCHAR(20) DEFAULT 'CAR'
)
RETURNS TABLE (
    shipment_id UUID,
    pickup_distance_to_corridor DOUBLE PRECISION,
    delivery_distance_to_corridor DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS shipment_id,
        ST_Distance(s.approximate_pickup_point, p_route_linestring) AS pickup_distance_to_corridor,
        ST_Distance(s.approximate_delivery_point, p_route_linestring) AS delivery_distance_to_corridor
    FROM shipments s
    WHERE s.status = 'PUBLISHED'
      AND s.weight_grams <= p_max_weight_grams
      AND ST_DWithin(s.approximate_pickup_point, p_route_linestring, p_buffer_meters)
      AND ST_DWithin(s.approximate_delivery_point, p_route_linestring, p_buffer_meters);
END;
$$ LANGUAGE plpgsql STABLE;
