import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Test with explicit error output
cmds = [
    "curl -s 'http://localhost:3002/api/geo/nearby?lat=-23.3045&lng=-51.1696&raio=2000' 2>&1",
    "pm2 logs intermidia-midiakit --lines 5 --nostream 2>&1 | grep -i 'geo\\|error' | tail -5",
    "curl -s 'http://localhost:3002/api/geo/opportunity' 2>&1",
    "pm2 logs intermidia-midiakit --lines 5 --nostream 2>&1 | grep -i 'geo\\|error' | tail -5",
]

for cmd in cmds:
    print(f'>>> {cmd[:80]}...')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out.strip())
    if err: print('ERR:', err.strip())
    print('---')

c.close()
