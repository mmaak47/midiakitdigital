import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Check current .env
stdin, stdout, stderr = c.exec_command('cat /home/mmak/midiakit/backend/.env')
print('=== .env ===')
print(stdout.read().decode())

# Check PM2 env for the process
stdin, stdout, stderr = c.exec_command("pm2 env 0 2>/dev/null | grep -E 'DB_ENGINE|DATABASE_URL' || echo 'PM2 env not found'")
print('=== PM2 env ===')
print(stdout.read().decode())

# Check ecosystem config on server
stdin, stdout, stderr = c.exec_command('cat /home/mmak/midiakit/ecosystem.config.js')
print('=== ecosystem.config.js on server ===')
print(stdout.read().decode())

c.close()
