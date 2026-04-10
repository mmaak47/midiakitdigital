import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Pull llama3 (main model ~4.7GB)
print('=== Pulling llama3 (this may take a few minutes) ===')
stdin, stdout, stderr = c.exec_command('ollama pull llama3', timeout=900)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out[-500:])
if err: print(err[-500:])

# Pull mistral (lighter fallback ~4.1GB)
print('\n=== Pulling mistral ===')
stdin, stdout, stderr = c.exec_command('ollama pull mistral', timeout=900)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out[-500:])
if err: print(err[-500:])

# Verify models
print('\n=== Models installed ===')
stdin, stdout, stderr = c.exec_command('ollama list', timeout=15)
out = stdout.read().decode()
if out: print(out)

# Quick test
print('\n=== Quick test ===')
stdin, stdout, stderr = c.exec_command(
    """curl -s http://localhost:11434/api/generate -d '{"model":"llama3","prompt":"Say hello in Portuguese, one sentence only","stream":false}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response','NO_RESPONSE')[:200])" """,
    timeout=120
)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out)
if err: print('ERR:', err[:200])

# Check memory after loading
print('\n=== Memory after model load ===')
stdin, stdout, stderr = c.exec_command('free -h', timeout=10)
out = stdout.read().decode()
if out: print(out)

c.close()
print('Done!')
