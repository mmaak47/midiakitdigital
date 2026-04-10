import paramiko, json, time
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Check logs
print('=== Recent Logs ===')
stdin, stdout, stderr = c.exec_command('cat /root/.pm2/logs/intermidia-midiakit-out.log | tail -10', timeout=10)
print(stdout.read().decode())

stdin, stdout, stderr = c.exec_command('cat /root/.pm2/logs/intermidia-midiakit-error.log | tail -10', timeout=10)
err = stdout.read().decode()
if err.strip(): print('ERRORS:\n' + err)

# Test health endpoint
print('\n=== Testing /api/ai/health ===')
stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3002/api/ai/health", timeout=10)
out = stdout.read().decode()
print(out)

# Test stats
print('\n=== Testing /api/ai/stats ===')
stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3002/api/ai/stats", timeout=10)
out = stdout.read().decode()
print(out)

# Test generate with real point data
print('\n=== Testing /api/ai/generate (real OOH data) ===')
payload = json.dumps({
    "data": {
        "nome": "POSTO IPIRANGA - Av. Tiradentes",
        "tipo": "Painel LED",
        "cidade": "Londrina",
        "fluxo": 1920000,
        "preco": 4500,
        "publico": "AB 25-55",
        "insercoes": 1800,
        "bairro": "Centro"
    }
})
cmd = f"""curl -s -X POST http://localhost:3002/api/ai/generate -H 'Content-Type: application/json' -d '{payload}'"""
stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
out = stdout.read().decode()
print(out[:800])

c.close()
print('\nDone!')
