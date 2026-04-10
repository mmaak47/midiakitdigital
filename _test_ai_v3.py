import paramiko, json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Create a temp script on VPS to generate token
script = """
require('dotenv').config();
const {createAuthToken} = require('./auth');
const db = require('./database');
const user = db.prepare("SELECT id, username FROM admin_users WHERE role='admin' LIMIT 1").get();
if (user) {
  const token = createAuthToken({sub: user.id, username: user.username});
  console.log(token);
} else {
  console.log('NO_USER');
}
"""

# Write temp script
cmd = f"""cat > /home/mmak/midiakit/backend/_gen_token.js << 'ENDSCRIPT'
{script}
ENDSCRIPT"""
stdin, stdout, stderr = c.exec_command(cmd, timeout=10)
stdout.read()

# Run it
stdin, stdout, stderr = c.exec_command('cd /home/mmak/midiakit/backend && node _gen_token.js', timeout=15)
token = stdout.read().decode().strip()
err = stderr.read().decode()
if err: print('ERR:', err[:200])

# Clean up
c.exec_command('rm /home/mmak/midiakit/backend/_gen_token.js')

print(f'Token: {token[:60]}...' if len(token) > 60 else f'Token: {token}')

if token and token != 'NO_USER':
    # Test generate
    print('\n=== POST /api/ai/generate ===')
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
    cmd = f"curl -s -m 120 -X POST http://localhost:3002/api/ai/generate -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{payload}'"
    stdin, stdout, stderr = c.exec_command(cmd, timeout=180)
    out = stdout.read().decode()
    print(out[:1500])

    # Test analyze
    print('\n=== POST /api/ai/analyze ===')
    payload2 = json.dumps({"input": "Melhor estrategia de OOH para Londrina centro?"})
    cmd = f"curl -s -m 120 -X POST http://localhost:3002/api/ai/analyze -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{payload2}'"
    stdin, stdout, stderr = c.exec_command(cmd, timeout=180)
    out = stdout.read().decode()
    print(out[:1500])

    # Stats
    print('\n=== GET /api/ai/stats ===')
    stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3002/api/ai/stats", timeout=10)
    print(stdout.read().decode())

    # Check server logs for AI activity
    print('\n=== PM2 AI logs ===')
    stdin, stdout, stderr = c.exec_command("cat /root/.pm2/logs/intermidia-midiakit-out.log | grep -i 'ai' | tail -5", timeout=10)
    print(stdout.read().decode())

c.close()
print('\nDone!')
