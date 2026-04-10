import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    'free -h',
    'nproc',
    'which ollama 2>/dev/null || echo NO_OLLAMA',
    'ollama list 2>/dev/null || echo OLLAMA_NOT_RUNNING',
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
