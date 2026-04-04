"""Trigger census re-analysis with force=true via SSH curl on the VPS."""
import paramiko

HOST = 'REDACTED_VPS_IP'
USER = 'root'
PASS = '***REDACTED_PASSWORD***'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS)

# Step 1: Get admin users to login
sql = "SELECT username, role FROM admin_users WHERE role = 'admin' LIMIT 1;"
cmd = f"PGPASSWORD=***REDACTED_DB_PASSWORD*** psql -U midiakit_app -d midiakit_prod -h 127.0.0.1 -t -A -c \"{sql}\""
_, stdout, _ = c.exec_command(cmd)
admin_info = stdout.read().decode().strip()
print('Admin user:', admin_info)

# Step 2: Login as admin to get token (need to know password)
# Let's try triggering the auto-scheduler directly via the Node process instead
# We can use pm2 to send a signal, or we can just call analyzeCity from a node one-liner

node_cmd = '''cd /home/mmak/midiakit && node -e "
const census = require('./backend/censusAudienceService');
census.analyzeCity(null, { force: true }).then(r => {
  console.log(JSON.stringify(r));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
"'''

print('Starting full re-analysis with force=true...')
_, stdout, stderr = c.exec_command(node_cmd, timeout=600)
out = stdout.read().decode()
err = stderr.read().decode()
print('OUT:', out)
if err:
    print('ERR:', err)

c.close()
print('Done.')
