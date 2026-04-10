"""Enable PostGIS extension and run database migration."""
import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# PostGIS extension must be created by superuser or user with CREATE privilege
cmds = [
    # Grant the app user permission to create extensions, then create PostGIS
    "sudo -u postgres psql -d midiakit_prod -c 'CREATE EXTENSION IF NOT EXISTS postgis;'",
    # Verify
    "PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -c 'SELECT PostGIS_Version();'",
]

for cmd in cmds:
    print('>>>', cmd)
    i, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out: print(out)
    if err: print(err)
    print()

c.close()
print('Done')
