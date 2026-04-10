import paramiko
import json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Step 1: Login to get auth token
print('=== LOGIN ===')
login_payload = '{"usuario":"admin","senha":"intermidia2025"}'
cmd = f"curl -s -X POST http://localhost:3002/api/login -H 'Content-Type: application/json' -d '{login_payload}'"
stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
out = stdout.read().decode()
print(out[:300])
try:
    login = json.loads(out)
    token = login.get('token', '')
    print(f'  Token: {token[:30]}...' if token else '  NO TOKEN')
except:
    token = ''
    print('  Failed to parse login response')

if token:
    # Step 2: Test /api/ai/generate WITH auth
    print('\n=== TEST /api/ai/generate (with auth) ===')
    payload = '{"nome":"Painel LED Centro","tipo":"Painel LED","cidade":"Londrina","fluxo":250000,"preco":3500}'
    cmd = f"curl -s -X POST http://localhost:3002/api/ai/generate -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{payload}'"
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    print(out[:1000])

    # Step 3: Test /api/ai/analyze WITH auth
    print('\n=== TEST /api/ai/analyze (with auth) ===')
    payload2 = '{"input":"Qual o melhor formato DOOH para varejo?"}'
    cmd2 = f"curl -s -X POST http://localhost:3002/api/ai/analyze -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{payload2}'"
    stdin, stdout, stderr = c.exec_command(cmd2, timeout=120)
    out = stdout.read().decode()
    print(out[:1000])

# Step 4: Test public endpoints
print('\n=== TEST /api/ai/campaign (public) ===')
campaign = '{"cidade":"Londrina","segmento":"Varejo","objetivo":"awareness","budget":10000,"periodoSemanas":4,"pontos":[],"investimento":5000,"fluxoTotal":500000,"cpm":10,"coberturaPct":30}'
cmd3 = f"curl -s -X POST http://localhost:3002/api/ai/campaign -H 'Content-Type: application/json' -d '{campaign}'"
stdin, stdout, stderr = c.exec_command(cmd3, timeout=120)
out = stdout.read().decode()
print(out[:1000])

print('\n=== TEST /api/ai/recommend (public) ===')
rec = '{"cidade":"Londrina","segmento":"Varejo","objetivo":"awareness","budget":10000,"maxPontos":5,"publico":"A/B"}'
cmd4 = f"curl -s -X POST http://localhost:3002/api/ai/recommend -H 'Content-Type: application/json' -d '{rec}'"
stdin, stdout, stderr = c.exec_command(cmd4, timeout=120)
out = stdout.read().decode()
print(out[:1000])

c.close()
print('\nDone!')
