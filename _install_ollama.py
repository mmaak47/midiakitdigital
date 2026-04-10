import paramiko
import time
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Step 1: Install Ollama
print('=== Installing Ollama ===')
cmd = 'curl -fsSL https://ollama.com/install.sh | sh'
stdin, stdout, stderr = c.exec_command(cmd, timeout=300)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out[-500:])
if err: print(err[-500:])

# Step 2: Enable + start service
print('\n=== Enabling service ===')
for cmd in ['systemctl enable ollama', 'systemctl start ollama']:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err: print(err)

# Step 3: Configure performance limits in systemd override
print('\n=== Configuring performance limits ===')
override_content = """[Service]
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=5m"
"""
cmd = f"""mkdir -p /etc/systemd/system/ollama.service.d && cat > /etc/systemd/system/ollama.service.d/override.conf << 'HEREDOC'
{override_content.strip()}
HEREDOC
"""
stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out)
if err: print(err)

# Reload and restart
for cmd in ['systemctl daemon-reload', 'systemctl restart ollama']:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err: print(err)

# Step 4: Verify
print('\n=== Verifying ===')
time.sleep(3)
stdin, stdout, stderr = c.exec_command('systemctl status ollama --no-pager -l | head -15', timeout=15)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out)
if err: print(err)

# Test API
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:11434/api/tags', timeout=10)
out = stdout.read().decode()
print(f'API response: {out[:200]}')

c.close()
print('\nOllama install done!')
