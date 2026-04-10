import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

DB = "postgresql://midiakit_app:vAskc8v3c3U3IfJ7yQtv1QtHMWYZ@127.0.0.1:5432/midiakit_prod"

# Check data types for pontos.id
check_sql = """
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'pontos' AND column_name IN ('id', 'fluxo', 'preco', 'lat', 'lng')
ORDER BY column_name;
"""

cmd = f"sudo -u postgres psql -d midiakit_prod -c \"{check_sql}\""
print('>>> Checking pontos column types...')
stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out)
if err: print(err)

# Check fn_pontos_no_raio return type
check_fn = """
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_pontos_no_raio';
"""
cmd = f"sudo -u postgres psql -d midiakit_prod -c \"{check_fn}\""
print('>>> fn_pontos_no_raio definition:')
stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out)
if err: print(err)

# Check fn_opportunity_index definition
check_fn2 = """
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_opportunity_index';
"""
cmd = f"sudo -u postgres psql -d midiakit_prod -c \"{check_fn2}\""
print('>>> fn_opportunity_index definition:')
stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
out = stdout.read().decode()
err = stderr.read().decode()
if out: print(out)
if err: print(err)

c.close()
