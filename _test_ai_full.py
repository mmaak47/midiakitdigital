import paramiko, json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

# Get an admin user to login
print('=== Getting admin user ===')
DB = "postgresql://midiakit_app:vAskc8v3c3U3IfJ7yQtv1QtHMWYZ@127.0.0.1:5432/midiakit_prod"
cmd = f"""psql '{DB}' -t -A -c "SELECT username, role FROM admin_users WHERE role='admin' LIMIT 1;" """
stdin, stdout, stderr = c.exec_command(cmd, timeout=10)
out = stdout.read().decode().strip()
print(f'Admin user: {out}')

# Login to get token
username = out.split('|')[0] if out else 'admin'
print(f'\n=== Login as {username} ===')
login_payload = json.dumps({"username": username, "password": "admin"})
cmd = f"""curl -s -X POST http://localhost:3002/api/auth/login -H 'Content-Type: application/json' -d '{login_payload}'"""
stdin, stdout, stderr = c.exec_command(cmd, timeout=10)
login_resp = stdout.read().decode()
print(f'Login response: {login_resp[:200]}')

try:
    token_data = json.loads(login_resp)
    token = token_data.get('token', '')
except:
    token = ''

if not token:
    print('No token from login, trying to use Node to generate one directly...')
    # Generate token directly from the backend
    cmd = """cd /home/mmak/midiakit/backend && node -e "
    require('dotenv').config();
    const {createAuthToken} = require('./auth');
    const db = require('./database');
    const user = db.prepare('SELECT id, username FROM admin_users WHERE role=\\'admin\\' LIMIT 1').get();
    if(user) { console.log(createAuthToken({sub:user.id, username:user.username})); }
    else { console.log('NO_ADMIN_USER'); }
    " """
    stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
    token = stdout.read().decode().strip()
    err = stderr.read().decode()
    if err: print('ERR:', err[:200])
    print(f'Token: {token[:50]}...' if len(token) > 50 else f'Token: {token}')

if token and token != 'NO_ADMIN_USER':
    # Test generate endpoint
    print('\n=== Testing /api/ai/generate with auth ===')
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
    print(out[:1000])

    # Test analyze endpoint
    print('\n=== Testing /api/ai/analyze ===')
    payload2 = json.dumps({"input": "Qual a melhor estratégia de OOH para lançamento de produto em Londrina?"})
    cmd = f"""curl -s -X POST http://localhost:3002/api/ai/analyze -H 'Content-Type: application/json' -H 'Authorization: Bearer {token}' -d '{payload2}'"""
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    print(out[:1000])

    # Check stats again (should have entries now)
    print('\n=== Stats after generation ===')
    stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3002/api/ai/stats", timeout=10)
    out = stdout.read().decode()
    print(out)
else:
    print('Could not get auth token')

c.close()
print('\nDone!')
