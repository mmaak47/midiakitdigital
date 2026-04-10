import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    # Check .env DB settings
    'cat /home/mmak/midiakit/backend/.env 2>/dev/null || echo NO_ENV',
    # Check server.js location
    'ls /home/mmak/midiakit/backend/server.js 2>/dev/null || echo NO_SERVER',
    # Install PostGIS
    'apt-get update -qq && apt-get install -y postgresql-16-postgis-3 postgis 2>&1 | tail -5',
    # Enable PostGIS extension
    "sudo -u postgres psql -d midiakit_prod -c 'CREATE EXTENSION IF NOT EXISTS postgis;' 2>&1",
    # Verify PostGIS
    "sudo -u postgres psql -d midiakit_prod -c 'SELECT PostGIS_Version();' 2>&1",
]

for cmd in cmds:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err: print(err)
    print('---')

c.close()
print('Done!')
