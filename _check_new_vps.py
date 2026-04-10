import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    'hostname && whoami',
    'ls /home/mmak/midiakit/ 2>/dev/null || echo NO_MMAK_PATH',
    'ls /root/midiakit/ 2>/dev/null || echo NO_ROOT_PATH',
    'find / -maxdepth 4 -name "server.js" -path "*/midiakit*" 2>/dev/null | head -5',
    'pm2 list 2>/dev/null || echo PM2_NOT_FOUND',
    'which node && node -v 2>/dev/null || echo NO_NODE',
    'psql --version 2>/dev/null || echo NO_PSQL',
    "sudo -u postgres psql -c 'SELECT PostGIS_Version();' 2>/dev/null || echo NO_POSTGIS",
]

for cmd in cmds:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err: print(err)
    print('---')

c.close()
print('Done!')
