import paramiko
import sys

h = 'REDACTED_VPS_IP'
u = 'root'
p = '***REMOVED-VPS-PASS***'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(h, 22, u, p, timeout=30)

print("=" * 60)
print("PM2 STATUS")
print("=" * 60)
i, o, e = c.exec_command('pm2 status', timeout=30)
print(o.read().decode('utf-8', 'ignore'))

print("=" * 60)
print("PM2 LOGS (ultimas 120 linhas)")
print("=" * 60)
i, o, e = c.exec_command('pm2 logs intermidia-midiakit --lines 120 --nostream', timeout=60)
print(o.read().decode('utf-8', 'ignore'))

print("\n" + "=" * 60)
print("NGINX SITE CONFIG")
print("=" * 60)
i, o, e = c.exec_command('cat /etc/nginx/sites-available/midiakit', timeout=30)
print(o.read().decode('utf-8', 'ignore'))

print("\n" + "=" * 60)
print("NGINX ERROR LOG (últimas 30 linhas)")
print("=" * 60)
i, o, e = c.exec_command('tail -60 /var/log/nginx/error.log', timeout=30)
print(o.read().decode('utf-8', 'ignore'))

print("\n" + "=" * 60)
print("NGINX ACCESS LOG (últimas 20 linhas)")
print("=" * 60)
i, o, e = c.exec_command('tail -60 /var/log/nginx/access.log', timeout=30)
print(o.read().decode('utf-8', 'ignore'))

c.close()
