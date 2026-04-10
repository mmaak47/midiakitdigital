import paramiko, json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Get admin user with ID
DB = "postgresql://midiakit_app:vAskc8v3c3U3IfJ7yQtv1QtHMWYZ@127.0.0.1:5432/midiakit_prod"
cmd = f"""psql '{DB}' -t -A -c "SELECT id, username, role FROM admin_users LIMIT 5;" """
stdin, stdout, stderr = c.exec_command(cmd, timeout=10)
out = stdout.read().decode().strip()
print(f'Users: {out}')

# Generate token with correct sub
cmd = """cd /home/mmak/midiakit/backend && node -e "
require('dotenv').config();
const {createAuthToken} = require('./auth');
const db = require('./database');
const user = db.prepare(\"SELECT id, username FROM admin_users WHERE role='admin' LIMIT 1\").get();
console.log(JSON.stringify({user, token: user ? createAuthToken({sub:user.id, username:user.username}) : null}));
" """
stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
out = stdout.read().decode().strip()
err = stderr.read().decode()
if err: print('ERR:', err[:300])
print(f'Token data: {out[:200]}')

try:
    data = json.loads(out)
    token = data.get('token', '')
    print(f'\nUser: {data.get("user")}')
except:
    token = ''
    print('Failed to parse token data')

if token:
    print('\n=== Testing /api/ai/generate with valid auth ===')
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
    cmd = f"""curl -s -X POST http://localhost:3002/api/ai/generate -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{payload}'"""
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    print(out[:1200])

    print('\n=== Testing /api/ai/analyze ===')
    payload2 = json.dumps({"input": "Melhor estrategia OOH para lancamento de produto em Londrina?"})
    cmd = f"""curl -s -X POST http://localhost:3002/api/ai/analyze -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{payload2}'"""
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    print(out[:1200])

    print('\n=== Stats ===')
    stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3002/api/ai/stats", timeout=10)
    print(stdout.read().decode())

c.close()
print('\nDone!')
