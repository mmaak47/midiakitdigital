import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    'cd /home/mmak/midiakit && git fetch origin main && git reset --hard origin/main',
    'cd /home/mmak/midiakit && pm2 delete intermidia-midiakit 2>/dev/null; pm2 start ecosystem.config.js',
    'pm2 save',
    'sleep 3',
    'pm2 logs intermidia-midiakit --lines 5 --nostream',
]

for cmd in cmds:
    print('>>>', cmd)
    i, o, e = c.exec_command(cmd, timeout=180)
    out = o.read().decode('utf-8', 'ignore').strip()
    err = e.read().decode('utf-8', 'ignore').strip()
    if out:
        print(out)
    if err:
        print(err)
    print()

c.close()
print('Deploy complete!')
