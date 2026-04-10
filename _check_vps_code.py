import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Check what version of server.js is on VPS (the authenticateSensitiveApi function)
print('=== authenticateSensitiveApi on VPS ===')
cmd = "grep -n -A 30 'function authenticateSensitiveApi' /home/mmak/midiakit/backend/server.js"
stdin, stdout, stderr = c.exec_command(cmd, timeout=10)
out = stdout.read().decode()
print(out[:1500])

# Also check git log
print('\n=== Git log ===')
stdin, stdout, stderr = c.exec_command('cd /home/mmak/midiakit && git log --oneline -5', timeout=10)
out = stdout.read().decode()
print(out)

# Check local git log too
print('\n=== Database URL check ===')
stdin, stdout, stderr = c.exec_command('cat /home/mmak/midiakit/backend/.env 2>/dev/null || echo "NO .env FILE"', timeout=5)
out = stdout.read().decode()
print(out[:500])

c.close()
