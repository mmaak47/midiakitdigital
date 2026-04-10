-- ============================================================================
-- PostGIS Migration for MidiaKit Digital
-- Run as: psql -U midiakit_app -d midiakit_prod -f postgis_migration.sql
-- ============================================================================

-- 1. GEOSPATIAL COLUMN + INDEX -----------------------------------------------

-- Add geometry column to pontos
ALTER TABLE pontos ADD COLUMN IF NOT EXISTS location geometry(Point, 4326);

-- Populate from existing lat/lng
UPDATE pontos
SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE lat IS NOT NULL AND lng IS NOT NULL AND location IS NULL;

-- Spatial index
CREATE INDEX IF NOT EXISTS idx_pontos_location ON pontos USING GIST (location);

-- 2. TRIGGER: auto-sync location on INSERT/UPDATE ----------------------------

CREATE OR REPLACE FUNCTION fn_sync_ponto_location()
RETURNS trigger AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_ponto_location ON pontos;
CREATE TRIGGER trg_sync_ponto_location
  BEFORE INSERT OR UPDATE OF lat, lng ON pontos
  FOR EACH ROW EXECUTE FUNCTION fn_sync_ponto_location();

-- 3. CLUSTERS TABLE -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS ponto_clusters (
  id SERIAL PRIMARY KEY,
  ponto_id INTEGER NOT NULL REFERENCES pontos(id) ON DELETE CASCADE,
  cluster_id INTEGER NOT NULL,
  cidade TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ponto_id)
);

CREATE INDEX IF NOT EXISTS idx_ponto_clusters_cluster ON ponto_clusters(cluster_id);
CREATE INDEX IF NOT EXISTS idx_ponto_clusters_cidade ON ponto_clusters(cidade);

-- 4. MATERIALIZED VIEW: pontos_enriquecidos ----------------------------------

DROP MATERIALIZED VIEW IF EXISTS pontos_enriquecidos;

CREATE MATERIALIZED VIEW pontos_enriquecidos AS
SELECT
  p.id,
  p.nome,
  p.cidade,
  p.tipo,
  p.endereco,
  p.lat,
  p.lng,
  p.location,
  p.fluxo,
  p.insercoes,
  p.preco,
  p.publico,
  p.telas,
  p.audience_tags,
  p.ativo,
  -- Geo audience
  g.neighborhood_type,
  g.neighborhood_label,
  g.socioeconomic_level,
  g.socioeconomic_score,
  g.urban_density,
  g.total_pois        AS geo_total_pois,
  g.confidence         AS geo_confidence,
  -- Census
  c.perfil_dominante,
  c.score_geral,
  c.perfil_alta_renda,
  c.perfil_massa_varejo,
  c.perfil_jovem_universitario,
  c.perfil_terceira_idade,
  -- Entorno (best segment)
  e_best.score_relevancia AS entorno_relevancia,
  e_best.total_estabelecimentos_relacionados AS entorno_total_pois,
  -- Pre-computed base score
  (
    COALESCE(p.fluxo, 0) * 0.00002 +
    COALESCE(g.socioeconomic_score, 0) * 0.01 +
    COALESCE(e_best.score_relevancia, 0) * 0.003 +
    COALESCE(c.score_geral, 0) * 10
  ) AS score_base
FROM pontos p
LEFT JOIN geo_audience_profiles g ON g.ponto_id = p.id
LEFT JOIN census_audience_profiles c ON c.ponto_id = p.id
LEFT JOIN LATERAL (
  SELECT score_relevancia, total_estabelecimentos_relacionados
  FROM entorno_cache ec
  WHERE ec.ponto_id = p.id
  ORDER BY score_relevancia DESC
  LIMIT 1
) e_best ON TRUE
WHERE p.ativo = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pe_id ON pontos_enriquecidos(id);
CREATE INDEX IF NOT EXISTS idx_pe_location ON pontos_enriquecidos USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_pe_cidade ON pontos_enriquecidos(cidade);
CREATE INDEX IF NOT EXISTS idx_pe_tipo ON pontos_enriquecidos(tipo);

-- 5. FUNCTION: radius search --------------------------------------------------

CREATE OR REPLACE FUNCTION fn_pontos_no_raio(
  p_lng DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_raio_m INTEGER DEFAULT 800
)
RETURNS TABLE (
  id INTEGER,
  nome TEXT,
  cidade TEXT,
  tipo TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  fluxo INTEGER,
  preco DOUBLE PRECISION,
  publico TEXT,
  distancia_m DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.nome, p.cidade, p.tipo,
    p.lat::DOUBLE PRECISION, p.lng::DOUBLE PRECISION,
    p.fluxo, p.preco::DOUBLE PRECISION, p.publico,
    ST_Distance(
      p.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distancia_m
  FROM pontos p
  WHERE p.ativo = 1
    AND p.location IS NOT NULL
    AND ST_DWithin(
      p.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_raio_m
    )
  ORDER BY distancia_m ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 6. FUNCTION: cluster by city ------------------------------------------------

CREATE OR REPLACE FUNCTION fn_rebuild_clusters(p_cidade TEXT DEFAULT NULL, p_k INTEGER DEFAULT 5)
RETURNS void AS $$
DECLARE
  v_city RECORD;
  v_count BIGINT;
  v_k INTEGER;
BEGIN
  -- Clear existing clusters for the target city
  IF p_cidade IS NOT NULL THEN
    DELETE FROM ponto_clusters WHERE cidade = p_cidade;
  ELSE
    DELETE FROM ponto_clusters;
  END IF;

  -- Build clusters per city, adapting K to city size
  FOR v_city IN
    SELECT DISTINCT cidade FROM pontos
    WHERE ativo = 1 AND location IS NOT NULL
      AND (p_cidade IS NULL OR cidade = p_cidade)
  LOOP
    SELECT COUNT(*) INTO v_count
    FROM pontos WHERE ativo = 1 AND location IS NOT NULL AND cidade = v_city.cidade;

    -- K must be < number of distinct points; min 1
    v_k := LEAST(p_k, GREATEST(1, v_count - 1));
    IF v_k < 1 THEN v_k := 1; END IF;

    INSERT INTO ponto_clusters (ponto_id, cluster_id, cidade)
    SELECT
      p.id,
      ST_ClusterKMeans(p.location, v_k) OVER () AS cluster_id,
      p.cidade
    FROM pontos p
    WHERE p.ativo = 1
      AND p.location IS NOT NULL
      AND p.cidade = v_city.cidade;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 7. FUNCTION: share of voice by cluster --------------------------------------

CREATE OR REPLACE FUNCTION fn_share_of_voice(p_cidade TEXT DEFAULT NULL)
RETURNS TABLE (
  cluster_id INTEGER,
  cidade TEXT,
  total_pontos BIGINT,
  total_insercoes BIGINT,
  total_fluxo BIGINT,
  centroid_lat DOUBLE PRECISION,
  centroid_lng DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.cluster_id,
    pc.cidade,
    COUNT(*)::BIGINT AS total_pontos,
    COALESCE(SUM(p.insercoes), 0)::BIGINT AS total_insercoes,
    COALESCE(SUM(p.fluxo), 0)::BIGINT AS total_fluxo,
    AVG(p.lat)::DOUBLE PRECISION AS centroid_lat,
    AVG(p.lng)::DOUBLE PRECISION AS centroid_lng
  FROM ponto_clusters pc
  JOIN pontos p ON p.id = pc.ponto_id
  WHERE (p_cidade IS NULL OR pc.cidade = p_cidade)
  GROUP BY pc.cluster_id, pc.cidade
  ORDER BY pc.cidade, pc.cluster_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- 8. FUNCTION: opportunity index per point ------------------------------------

CREATE OR REPLACE FUNCTION fn_opportunity_index(p_raio_m INTEGER DEFAULT 600)
RETURNS TABLE (
  ponto_id INTEGER,
  nome TEXT,
  cidade TEXT,
  demanda DOUBLE PRECISION,
  concorrencia BIGINT,
  oportunidade DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.id AS ponto_id,
    pe.nome,
    pe.cidade,
    (COALESCE(pe.geo_total_pois, 0) * 0.6 + COALESCE(pe.score_geral, 0) * 40)::DOUBLE PRECISION AS demanda,
    (
      SELECT COUNT(*)
      FROM pontos p2
      WHERE p2.ativo = 1
        AND p2.id != pe.id
        AND p2.location IS NOT NULL
        AND ST_DWithin(p2.location::geography, pe.location::geography, p_raio_m)
    ) AS concorrencia,
    CASE
      WHEN (
        SELECT COUNT(*)
        FROM pontos p2
        WHERE p2.ativo = 1
          AND p2.id != pe.id
          AND p2.location IS NOT NULL
          AND ST_DWithin(p2.location::geography, pe.location::geography, p_raio_m)
      ) > 0
      THEN
        (COALESCE(pe.geo_total_pois, 0) * 0.6 + COALESCE(pe.score_geral, 0) * 40)::DOUBLE PRECISION
        / (
          SELECT COUNT(*)
          FROM pontos p2
          WHERE p2.ativo = 1
            AND p2.id != pe.id
            AND p2.location IS NOT NULL
            AND ST_DWithin(p2.location::geography, pe.location::geography, p_raio_m)
        )::DOUBLE PRECISION
      ELSE
        (COALESCE(pe.geo_total_pois, 0) * 0.6 + COALESCE(pe.score_geral, 0) * 40)::DOUBLE PRECISION * 2
    END AS oportunidade
  FROM pontos_enriquecidos pe
  WHERE pe.location IS NOT NULL
  ORDER BY oportunidade DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 9. FUNCTION: dynamic radius based on density --------------------------------

CREATE OR REPLACE FUNCTION fn_raio_dinamico(p_ponto_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_location geometry;
  v_nearby BIGINT;
BEGIN
  SELECT location INTO v_location FROM pontos WHERE id = p_ponto_id AND ativo = 1;
  IF v_location IS NULL THEN RETURN 800; END IF;

  -- Count points within 500m to determine density
  SELECT COUNT(*) INTO v_nearby
  FROM pontos
  WHERE ativo = 1
    AND id != p_ponto_id
    AND location IS NOT NULL
    AND ST_DWithin(location::geography, v_location::geography, 500);

  -- Dense area → smaller radius, sparse → larger
  IF v_nearby >= 10 THEN RETURN 400;
  ELSIF v_nearby >= 5 THEN RETURN 600;
  ELSIF v_nearby >= 2 THEN RETURN 800;
  ELSE RETURN 1200;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- 10. Initial cluster build ---------------------------------------------------
SELECT fn_rebuild_clusters(NULL, 5);

-- 11. Refresh materialized view -----------------------------------------------
REFRESH MATERIALIZED VIEW pontos_enriquecidos;
