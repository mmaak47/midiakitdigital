import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# List admin users
cmd = """psql -U midiakit_user -d midiakit -c "SELECT id, username, email, role, LEFT(password, 30) as pwd_start FROM admin_users LIMIT 5;" """
stdin, stdout, stderr = c.exec_command(cmd, timeout=10)
out = stdout.read().decode()
err = stderr.read().decode()
print('Users:')
print(out)
if err: print('ERR:', err[:300])

# Test public endpoints directly (no auth needed)
print('\n=== /api/ai/campaign (public POST) ===')
cmd2 = """curl -s -X POST http://localhost:3002/api/ai/campaign -H 'Content-Type: application/json' -d '{"cidade":"Londrina","segmento":"Varejo","objetivo":"awareness","budget":10000}' """
stdin, stdout, stderr = c.exec_command(cmd2, timeout=120)
out = stdout.read().decode()
print(out[:500])

c.close()
