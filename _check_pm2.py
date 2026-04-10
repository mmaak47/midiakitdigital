import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Check PM2 logs
print('=== PM2 Logs ===')
stdin, stdout, stderr = c.exec_command('pm2 logs intermidia-midiakit --lines 20 --nostream', timeout=15)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out)
if err: print(err)

# Check PM2 status
print('=== PM2 Status ===')
stdin, stdout, stderr = c.exec_command('pm2 status intermidia-midiakit', timeout=10)
out = stdout.read().decode()
if out: print(out)

c.close()
