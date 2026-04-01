import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Check PM2 logs for DB engine confirmation
stdin, stdout, stderr = c.exec_command('pm2 logs intermidia-midiakit --lines 15 --nostream')
print('=== PM2 LOGS ===')
print(stdout.read().decode('utf-8', 'ignore'))

# Verify API returns data
stdin, stdout, stderr = c.exec_command('curl -s http://127.0.0.1:3002/api/pontos | python3 -c "import sys,json; data=json.load(sys.stdin); print(f\'API OK: {len(data)} pontos returned\')"')
print('=== API CHECK ===')
print(stdout.read().decode('utf-8', 'ignore'))
print(stderr.read().decode('utf-8', 'ignore'))

# Check PM2 env now has DB_ENGINE
stdin, stdout, stderr = c.exec_command('pm2 env 0 2>/dev/null | grep DB_ENGINE || echo "DB_ENGINE not in PM2 env"')
print('=== PM2 DB_ENGINE ===')
print(stdout.read().decode('utf-8', 'ignore'))

c.close()
