"""Install PostGIS on VPS and run initial migration SQL."""
import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    'apt-get update -qq',
    'apt-get install -y postgresql-16-postgis-3 postgis',
    "PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -c 'SELECT PostGIS_Version();'",
]

for cmd in cmds:
    print('>>>', cmd)
    i, o, e = c.exec_command(cmd, timeout=300)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        print(out[-800:] if len(out) > 800 else out)
    if err:
        print(err[-800:] if len(err) > 800 else err)
    print()

c.close()
print('Done')
