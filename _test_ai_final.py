import paramiko
import json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Step 1: Login correctly
print('=== LOGIN ===')
login_payload = '{"username":"admin","password":"intermidia2025"}'
cmd = "curl -s -X POST http://localhost:3002/api/auth/login -H 'Content-Type: application/json' -d '" + login_payload + "'"
stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
out = stdout.read().decode()
print(out[:300])
try:
    login = json.loads(out)
    token = login.get('token', '')
except:
    token = ''

if not token:
    print('  FAILED to get token!')
    c.close()
    exit()

print(f'  Token OK: {token[:30]}...')

# Step 2: /api/ai/generate with auth
print('\n=== /api/ai/generate (auth) ===')
payload = '{"nome":"Painel LED Centro","tipo":"Painel LED","cidade":"Londrina","fluxo":250000,"preco":3500}'
cmd = "curl -s -X POST http://localhost:3002/api/ai/generate -H 'Content-Type: application/json' -H 'Authorization: Bearer " + token + "' -d '" + payload + "'"
stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
out = stdout.read().decode()
print(out[:1000])

# Step 3: /api/ai/campaign (should be public)
print('\n=== /api/ai/campaign (no auth) ===')
campaign = '{"cidade":"Londrina","segmento":"Varejo","objetivo":"awareness","budget":10000,"periodoSemanas":4,"pontos":[],"investimento":5000,"fluxoTotal":500000,"cpm":10,"coberturaPct":30}'
cmd = "curl -s -X POST http://localhost:3002/api/ai/campaign -H 'Content-Type: application/json' -d '" + campaign + "'"
stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
out = stdout.read().decode()
print(out[:1000])

# Step 4: /api/ai/recommend (should be public)
print('\n=== /api/ai/recommend (no auth) ===')
rec = '{"cidade":"Londrina","segmento":"Varejo","objetivo":"awareness","budget":10000,"maxPontos":5,"publico":"A/B"}'
cmd = "curl -s -X POST http://localhost:3002/api/ai/recommend -H 'Content-Type: application/json' -d '" + rec + "'"
stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
out = stdout.read().decode()
print(out[:1000])

c.close()
print('\nDone!')
