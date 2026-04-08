import subprocess
import sys
import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

# ── 1. Commit & push local changes ──────────────────────────────────────────
def run_local(cmd, check=True):
    print(f'[local] {cmd}')
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='ignore')
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip())
    if check and result.returncode != 0:
        print(f'[erro] Comando falhou com código {result.returncode}')
        sys.exit(1)
    return result

status = run_local('git status --porcelain', check=False)
if status.stdout.strip():
    run_local('git add -A')
    run_local('git commit -m "deploy: atualizações automáticas"')
else:
    print('[local] Nada para commitar, workspace limpo.')

push_result = run_local('git push origin main', check=False)
if push_result.returncode != 0:
    print('[erro] git push falhou — verifique as mensagens acima.')
    sys.exit(1)
print()

# ── 2. Deploy na VPS ────────────────────────────────────────────────────────
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Upload ecosystem.config.js (not tracked in git — contains secrets)
print('[sftp] Enviando ecosystem.config.js para a VPS...')
sftp = c.open_sftp()
sftp.put('ecosystem.config.js', '/home/mmak/midiakit/ecosystem.config.js')
sftp.close()
print('[sftp] OK')
print()

cmds = [
    'cd /home/mmak/midiakit && git fetch origin main && git reset --hard origin/main',
    'cd /home/mmak/midiakit/backend && npm install --omit=dev',
    'cd /home/mmak/midiakit/frontend && npm install --production=false && npm run build',
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

# Re-upload ecosystem.config.js after git reset (git reset removes it since it's not in the repo)
print('[sftp] Re-enviando ecosystem.config.js após git reset...')
sftp = c.open_sftp()
sftp.put('ecosystem.config.js', '/home/mmak/midiakit/ecosystem.config.js')
sftp.close()
print('[sftp] OK')
print()

cmds2 = [
    'cd /home/mmak/midiakit && pm2 delete intermidia-midiakit 2>/dev/null; pm2 start ecosystem.config.js',
    'pm2 save',
    'sleep 3',
    'pm2 logs intermidia-midiakit --lines 5 --nostream',
]

for cmd in cmds2:
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
