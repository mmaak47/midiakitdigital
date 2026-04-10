import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    'cd /home/mmak/midiakit && git pull origin main',
    'cd /home/mmak/midiakit/frontend && npm run build',
    'pm2 restart intermidia-midiakit',
    'sleep 4 && pm2 logs intermidia-midiakit --lines 15 --nostream',
]

for cmd in cmds:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=300)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err: print(err)
    print('---')

c.close()
print('Deploy done!')
