import paramiko

h = '20.151.87.182'
u = 'mmak'
p = '***REMOVED-OLD-PASS***'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(h, 22, u, p, timeout=30)

print("=" * 60)
print("NGINX Config Check")
print("=" * 60)
i, o, e = c.exec_command('sudo -n nginx -T 2>&1 | grep -A 50 "sites-enabled/midiakit"', timeout=30)
print(o.read().decode('utf-8', 'ignore'))

print("\n" + "=" * 60)
print("PM2 Status & Recent Errors")
print("=" * 60)
i, o, e = c.exec_command('pm2 info intermidia-midiakit | head -40', timeout=30)
print(o.read().decode('utf-8', 'ignore'))

print("\n" + "=" * 60)
print("Browser Process Check")
print("=" * 60)
i, o, e = c.exec_command('ps aux | grep -i puppeteer', timeout=30)
print(o.read().decode('utf-8', 'ignore'))

print("\n" + "=" * 60)
print("Memory & CPU Usage")
print("=" * 60)
i, o, e = c.exec_command('free -h && echo "---" && top -bn1 | head -12', timeout=30)
print(o.read().decode('utf-8', 'ignore'))

c.close()
