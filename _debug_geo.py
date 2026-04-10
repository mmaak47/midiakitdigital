import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    # Check service file exists
    'head -15 /home/mmak/midiakit/backend/services/geoSpatialService.js',
    # Check route file exists 
    'head -5 /home/mmak/midiakit/backend/routes/geo.js',
    # Check server.js has the geo import
    'grep -n "geo" /home/mmak/midiakit/backend/server.js',
    # Quick test with curl and raw output
    "curl -s 'http://localhost:3002/api/geo/enriched' 2>&1",
    # Check PM2 error logs for geo
    'pm2 logs intermidia-midiakit --lines 30 --nostream 2>&1 | grep -i "geo\\|error\\|Error" | tail -10',
]

for cmd in cmds:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err: print(err)
    print('---')

c.close()
print('Done!')
