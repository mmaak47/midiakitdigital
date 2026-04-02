import paramiko

VPS_HOST = 'REDACTED_VPS_IP'
VPS_USER = 'root'
VPS_PASS = "***REDACTED_PASSWORD***"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    'cd /home/mmak/midiakit && git fetch origin main && git reset --hard origin/main',
    'cd /home/mmak/midiakit/frontend && npm install && npm run build',
    'cd /home/mmak/midiakit && pm2 restart intermidia-midiakit',
    'cd /home/mmak/midiakit && git rev-parse --short HEAD',
    'pm2 list',
]

for cmd in cmds:
    print('>>>', cmd)
    i, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode('utf-8', 'ignore').strip()
    err = e.read().decode('utf-8', 'ignore').strip()
    if out:
        print(out)
    if err:
        print('STDERR:', err)
    print()

c.close()
