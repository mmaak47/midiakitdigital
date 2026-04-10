import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

DB = "postgresql://midiakit_app:vAskc8v3c3U3IfJ7yQtv1QtHMWYZ@127.0.0.1:5432/midiakit_prod"

fix_sql = r"""
-- Fix fn_pontos_no_raio: integer -> bigint for id and fluxo
DROP FUNCTION IF EXISTS fn_pontos_no_raio(double precision, double precision, integer);
CREATE OR REPLACE FUNCTION fn_pontos_no_raio(
  p_lng DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_raio_m INTEGER DEFAULT 800
)
RETURNS TABLE(
  id BIGINT, nome TEXT, cidade TEXT, tipo TEXT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  fluxo BIGINT, preco DOUBLE PRECISION, publico TEXT,
  distancia_m DOUBLE PRECISION
) LANGUAGE plpgsql STABLE AS $$
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
$$;

-- Fix fn_opportunity_index: integer -> bigint for ponto_id
DROP FUNCTION IF EXISTS fn_opportunity_index(integer);
CREATE OR REPLACE FUNCTION fn_opportunity_index(p_raio_m INTEGER DEFAULT 600)
RETURNS TABLE(
  ponto_id BIGINT, nome TEXT, cidade TEXT,
  demanda DOUBLE PRECISION, concorrencia BIGINT,
  oportunidade DOUBLE PRECISION
) LANGUAGE plpgsql STABLE AS $$
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
        )
      ELSE
        (COALESCE(pe.geo_total_pois, 0) * 0.6 + COALESCE(pe.score_geral, 0) * 40)::DOUBLE PRECISION * 2
    END AS oportunidade
  FROM pontos_enriquecidos pe
  WHERE pe.location IS NOT NULL
  ORDER BY oportunidade DESC;
END;
$$;
"""

cmd = f"sudo -u postgres psql -d midiakit_prod -v ON_ERROR_STOP=1"
print('Fixing functions...')
stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
stdin.write(fix_sql)
stdin.channel.shutdown_write()
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out)
if err: print(err)

# Test the fixed functions
print('\n--- Testing nearby...')
test1 = "curl -s 'http://localhost:3002/api/geo/nearby?lat=-23.3045&lng=-51.1696&raio=2000'"
stdin, stdout, stderr = c.exec_command(test1, timeout=15)
out = stdout.read().decode()
import json
d = json.loads(out)
print(f"count={d.get('count', 0)}, raio={d.get('raio_m')}")
if d.get('pontos'):
    for p in d['pontos'][:3]:
        print(f"  {p.get('nome')} - {round(p.get('distancia_m', 0))}m")

print('\n--- Testing opportunity...')
test2 = "curl -s 'http://localhost:3002/api/geo/opportunity?cidade=Londrina'"
stdin, stdout, stderr = c.exec_command(test2, timeout=15)
out = stdout.read().decode()
d = json.loads(out)
print(f"count={d.get('count', 0)}")
if d.get('pontos'):
    for p in d['pontos'][:3]:
        print(f"  {p.get('nome')} oportunidade={round(p.get('oportunidade', 0), 1)}")

c.close()
print('\nDone!')
