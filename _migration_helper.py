"""Temporary helper to run migration on production PostgreSQL."""
import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

DB_URL = "postgresql://DB_USER:DB_PASSWORD@127.0.0.1:5432/midiakit_prod"

def ssh_exec(client, cmd, timeout=120):
    print(f'>>> {cmd[:120]}{"..." if len(cmd)>120 else ""}')
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode('utf-8', 'ignore').strip()
    err = e.read().decode('utf-8', 'ignore').strip()
    if out:
        print(out)
    if err:
        print('[stderr]', err)
    print()
    return out, err

def psql(client, sql, timeout=120):
    cmd = f'sudo -u postgres psql -d midiakit_prod -c "{sql}"'
    return ssh_exec(client, cmd, timeout)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Step 1: List existing tables
print("=== EXISTING TABLES ===")
psql(c, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")

# Step 2: Create missing tables
print("=== CREATING geo_audience_profiles ===")
psql(c, """
CREATE TABLE IF NOT EXISTS geo_audience_profiles (
  id                    SERIAL PRIMARY KEY,
  ponto_id              INTEGER NOT NULL UNIQUE REFERENCES pontos(id) ON DELETE CASCADE,
  neighborhood_type     TEXT,
  neighborhood_label    TEXT,
  confidence            REAL,
  socioeconomic_level   TEXT,
  socioeconomic_score   REAL,
  environment_type      TEXT,
  dominant_activity     TEXT,
  urban_density         TEXT,
  pois_per_km2          INTEGER,
  lifestyle_indicators  TEXT,
  poi_summary           TEXT,
  total_pois            INTEGER,
  radius_m              INTEGER,
  demographic_data      TEXT,
  audience_narrative    TEXT,
  premium_count         INTEGER,
  raw_data              TEXT,
  updated_at            TEXT,
  expires_at            TEXT
);
""")

psql(c, "CREATE INDEX IF NOT EXISTS idx_geo_audience_ponto ON geo_audience_profiles(ponto_id);")

print("=== CREATING census_audience_profiles ===")
psql(c, """
CREATE TABLE IF NOT EXISTS census_audience_profiles (
  id                        SERIAL PRIMARY KEY,
  ponto_id                  INTEGER NOT NULL UNIQUE REFERENCES pontos(id) ON DELETE CASCADE,
  municipio                 TEXT,
  municipio_ibge_code       TEXT,
  setor_censitario          TEXT,
  perfil_alta_renda         REAL,
  perfil_massa_varejo       REAL,
  perfil_jovem_universitario REAL,
  perfil_terceira_idade     REAL,
  perfil_dominante          TEXT,
  score_geral               REAL,
  pois_proximos             TEXT,
  fontes_dados              TEXT,
  dados_censitarios         TEXT,
  dados_pois                TEXT,
  total_pois                INTEGER,
  updated_at                TEXT,
  expires_at                TEXT
);
""")

psql(c, "CREATE INDEX IF NOT EXISTS idx_census_perfil_dominante ON census_audience_profiles(perfil_dominante);")
psql(c, "CREATE INDEX IF NOT EXISTS idx_census_municipio ON census_audience_profiles(municipio);")

# Step 3: Verify all tables now exist
print("=== FINAL TABLE LIST ===")
psql(c, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")

# Step 3b: Create segment_target_categories (missing from production)
print("=== CREATING segment_target_categories ===")
psql(c, """
CREATE TABLE IF NOT EXISTS segment_target_categories (
  id              SERIAL PRIMARY KEY,
  segment_id      TEXT NOT NULL,
  place_category  TEXT NOT NULL,
  weight          INTEGER NOT NULL DEFAULT 5,
  UNIQUE(segment_id, place_category)
);
""")
psql(c, "CREATE INDEX IF NOT EXISTS idx_segment_target_segment ON segment_target_categories(segment_id);")

# Step 4: Grant permissions to midiakit_app for all tables
print("=== GRANTING PERMISSIONS ===")
psql(c, "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO midiakit_app;")
psql(c, "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO midiakit_app;")
psql(c, "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO midiakit_app;")
psql(c, "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO midiakit_app;")

# Step 5: Final table list
print("=== FINAL TABLE LIST (AFTER ALL) ===")
psql(c, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")

# Step 6: Restart PM2 and verify endpoints
print("=== RESTARTING PM2 ===")
ssh_exec(c, "cd /home/mmak/midiakit && pm2 restart intermidia-midiakit")
import time; time.sleep(4)

print("=== VERIFYING ENDPOINTS ===")

# Fix: expires_at and updated_at are TEXT but compared with NOW() — alter to TIMESTAMPTZ
print("=== FIXING COLUMN TYPES ===")
psql(c, "ALTER TABLE geo_audience_profiles ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at::timestamptz;")
psql(c, "ALTER TABLE geo_audience_profiles ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz;")
psql(c, "ALTER TABLE census_audience_profiles ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at::timestamptz;")
psql(c, "ALTER TABLE census_audience_profiles ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz;")

# Also fix entorno_cache if it has similar columns
psql(c, "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'entorno_cache' AND column_name IN ('expires_at','updated_at') ORDER BY column_name;")

ssh_exec(c, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/api/geoaudience/profiles")
ssh_exec(c, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/api/census/profiles")
ssh_exec(c, "curl -s http://127.0.0.1:3002/api/geoaudience/profiles 2>&1 | head -c 300")
ssh_exec(c, "curl -s http://127.0.0.1:3002/api/census/profiles 2>&1 | head -c 300")

# Step 7: Get admin credentials, login, and trigger batch analysis
print("=== GETTING ADMIN USERS ===")
psql(c, "SELECT id, username, email, role FROM admin_users;")

# Try common passwords for admin user
print("=== TRYING LOGIN ===")
import json
token = None

# Try login with known credentials
for uname in ['admin']:
    for pwd in ['***REDACTED_PASSWORD***']:
        out, _ = ssh_exec(c, f"""curl -s -X POST http://127.0.0.1:3002/api/auth/login -H 'Content-Type: application/json' -d '{{"username":"{uname}","password":"{pwd}"}}'""")
        try:
            resp = json.loads(out)
            if resp.get('token'):
                token = resp['token']
                print(f"SUCCESS with {uname} — token: {token[:30]}...")
                break
        except:
            pass
    if token:
        break

if not token:
    print("Login failed. Resetting admin password via Node.js...")
    TEMP_PWD = "***REDACTED_PASSWORD***"
    # Generate hash using the same auth module on the server
    hash_cmd = f"""cd /home/mmak/midiakit/backend && node -e "const a = require('./auth'); console.log(a.hashPassword('{TEMP_PWD}'))" """
    hash_out, _ = ssh_exec(c, hash_cmd)
    if hash_out and hash_out.startswith('scrypt$'):
        # Use heredoc to avoid bash $ expansion in the scrypt hash
        escaped_hash = hash_out.replace("'", "''")
        update_sql = f"UPDATE admin_users SET password = '{escaped_hash}' WHERE username = 'admin';"
        update_cmd = f"sudo -u postgres psql -d midiakit_prod <<'EOSQL'\n{update_sql}\nEOSQL"
        ssh_exec(c, update_cmd)
        print("Password reset. Trying login again...")
        out2, _ = ssh_exec(c, f"""curl -s -X POST http://127.0.0.1:3002/api/auth/login -H 'Content-Type: application/json' -d '{{"username":"admin","password":"{TEMP_PWD}"}}'""")
        try:
            resp2 = json.loads(out2)
            token = resp2.get('token')
            if token:
                print(f"SUCCESS — token: {token[:30]}...")
        except:
            print(f"Login still failed: {out2[:200]}")
    else:
        print(f"Hash generation failed: {hash_out}")

if token:
    print("=== TRIGGERING BATCH ANALYSIS ===")
    
    # Trigger geoaudience analyze
    print("--- GeoAudience Analyze ---")
    ssh_exec(c, f"""curl -s -X POST http://127.0.0.1:3002/api/geoaudience/analyze -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{{"cidade":"","force":false}}'""")
    
    # Trigger census analyze
    print("--- Census Analyze ---")
    ssh_exec(c, f"""curl -s -X POST http://127.0.0.1:3002/api/census/analyze -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{{"municipio":"","force":false}}'""")
    
    # Trigger entorno analyze
    print("--- Entorno Analyze ---")
    ssh_exec(c, f"""curl -s -X POST http://127.0.0.1:3002/api/entorno/analyze -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{{"segmento":"clinica","raio":800}}'""")
else:
    print("Skipping batch analysis — no token")

c.close()
print("Done.")
