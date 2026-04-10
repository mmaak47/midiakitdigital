import paramiko
import json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Test generate - RAW response
print('=== RAW /api/ai/generate ===')
payload = '{"nome":"Painel LED Centro","tipo":"Painel LED","cidade":"Londrina","fluxo":250000,"preco":3500}'
cmd = f"curl -sv -X POST http://localhost:3002/api/ai/generate -H 'Content-Type: application/json' -d '{payload}' 2>&1"
stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
out = stdout.read().decode()
print(out[:2000])

print('\n\n=== RAW /api/ai/analyze ===')
payload2 = '{"input":"Qual o melhor formato DOOH para varejo?"}'
cmd2 = f"curl -sv -X POST http://localhost:3002/api/ai/analyze -H 'Content-Type: application/json' -d '{payload2}' 2>&1"
stdin, stdout, stderr = c.exec_command(cmd2, timeout=120)
out = stdout.read().decode()
print(out[:2000])

# Check PM2 error logs
print('\n\n=== PM2 ERROR LOGS ===')
stdin, stdout, stderr = c.exec_command('pm2 logs intermidia-midiakit --err --lines 30 --nostream', timeout=10)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out[-1500:])
if err: print(err[-500:])

c.close()
print('\nDone!')
