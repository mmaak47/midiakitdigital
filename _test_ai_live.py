import paramiko
import json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Test 1: /api/ai/generate via the app
print('=== TEST 1: POST /api/ai/generate ===')
payload = json.dumps({
    "nome": "Painel LED Centro",
    "tipo": "Painel LED",
    "cidade": "Londrina",
    "fluxo": 250000,
    "preco": 3500,
    "publico": "A/B"
})
cmd = f"curl -s -X POST http://localhost:3002/api/ai/generate -H 'Content-Type: application/json' -d '{payload}'"
stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
out = stdout.read().decode()
err = stderr.read().decode()
try:
    result = json.loads(out)
    print(f'  Source: {result.get("_source")}')
    print(f'  Model: {result.get("_model")}')
    print(f'  Headline: {result.get("headline", "N/A")[:100]}')
    print(f'  Descricao: {result.get("descricao", "N/A")[:200]}')
    print(f'  Pontos fortes: {result.get("pontos_fortes", [])}')
except:
    print(f'  Raw: {out[:500]}')
    if err:
        print(f'  Err: {err[:300]}')

# Test 2: /api/ai/analyze
print('\n=== TEST 2: POST /api/ai/analyze ===')
payload2 = json.dumps({"input": "Qual o melhor formato de midia DOOH para uma campanha de varejo em Londrina?"})
cmd2 = f"curl -s -X POST http://localhost:3002/api/ai/analyze -H 'Content-Type: application/json' -d '{payload2}'"
stdin, stdout, stderr = c.exec_command(cmd2, timeout=120)
out = stdout.read().decode()
err = stderr.read().decode()
try:
    result = json.loads(out)
    print(f'  Source: {result.get("_source")}')
    print(f'  Model: {result.get("_model")}')
    resp_text = result.get("response", "N/A")
    print(f'  Response: {resp_text[:400]}')
except:
    print(f'  Raw: {out[:500]}')
    if err:
        print(f'  Err: {err[:300]}')

# Test 3: /api/ai/stats
print('\n=== TEST 3: GET /api/ai/stats ===')
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:3002/api/ai/stats', timeout=15)
out = stdout.read().decode()
try:
    stats = json.loads(out)
    print(f'  Memory: {stats.get("memory", {})}')
    print(f'  Patterns: {stats.get("patterns", {}).get("total", 0)} patterns')
    print(f'  Cache: {stats.get("cache", {}).get("size", 0)} entries')
except:
    print(f'  Raw: {out[:300]}')

c.close()
print('\nDone!')
