import paramiko
import json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Check PM2 status
print('=== PM2 STATUS ===')
stdin, stdout, stderr = c.exec_command('pm2 jlist', timeout=15)
out = stdout.read().decode()
try:
    procs = json.loads(out)
    for p in procs:
        name = p.get('name', '?')
        status = p.get('pm2_env', {}).get('status', '?')
        restarts = p.get('pm2_env', {}).get('restart_time', '?')
        print(f'  {name} — status: {status}, restarts: {restarts}')
except:
    print(out[:500])

# Check if the app health endpoint responds
print('\n=== AI HEALTH CHECK ===')
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:3002/api/ai/health', timeout=15)
out = stdout.read().decode()
print(out[:500])

# Check Ollama directly
print('\n=== OLLAMA TAGS ===')
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:11434/api/tags', timeout=10)
out = stdout.read().decode()
try:
    tags = json.loads(out)
    for m in tags.get('models', []):
        print(f'  {m["name"]} ({m.get("size", "?")} bytes)')
except:
    print(out[:300])

# Quick Ollama test
print('\n=== OLLAMA QUICK TEST (qwen2:1.5b) ===')
stdin, stdout, stderr = c.exec_command(
    '''curl -s http://localhost:11434/api/generate -d '{"model":"qwen2:1.5b","prompt":"Diga ola em uma frase","stream":false}' ''',
    timeout=60
)
out = stdout.read().decode()
try:
    resp = json.loads(out)
    print(f'  Response: {resp.get("response", "NO_RESPONSE")[:200]}')
    print(f'  Total duration: {resp.get("total_duration", 0) / 1e9:.1f}s')
except:
    print(out[:300])

# Check PM2 logs for errors
print('\n=== RECENT PM2 LOGS ===')
stdin, stdout, stderr = c.exec_command('pm2 logs intermidia-midiakit --lines 20 --nostream', timeout=10)
out = stdout.read().decode()
err = stderr.read().decode()
if out:
    print(out[-1000:])
if err:
    print(err[-500:])

c.close()
print('\nDone!')
