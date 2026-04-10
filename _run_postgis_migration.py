"""Run PostGIS migration SQL on VPS."""
import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# First push so the SQL file is on the VPS
print('>>> git pull')
i, o, e = c.exec_command('cd /home/mmak/midiakit && git pull origin main', timeout=60)
print(o.read().decode().strip())
print(e.read().decode().strip())
print()

# Run the migration SQL
cmd = "PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -f /home/mmak/midiakit/backend/scripts/postgis_migration.sql"
print('>>> Running migration...')
i, o, e = c.exec_command(cmd, timeout=120)
out = o.read().decode().strip()
err = e.read().decode().strip()
if out: print(out)
if err: print(err)
print()

# Verify
verify_cmds = [
    "PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -c 'SELECT COUNT(*) AS with_location FROM pontos WHERE location IS NOT NULL;'",
    "PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -c 'SELECT COUNT(*) AS clusters FROM ponto_clusters;'",
    "PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -c 'SELECT COUNT(*) AS enriched FROM pontos_enriquecidos;'",
    "PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -c 'SELECT cidade, COUNT(*) as n FROM ponto_clusters GROUP BY cidade ORDER BY n DESC LIMIT 5;'",
]

for cmd in verify_cmds:
    print('>>>', cmd.split('-c ')[-1])
    i, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode().strip())
    er = e.read().decode().strip()
    if er: print(er)
    print()

c.close()
print('Migration complete!')
