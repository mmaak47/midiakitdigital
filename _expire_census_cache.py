"""Expire all census cache rows on production so re-analysis happens."""
import paramiko

HOST = 'REDACTED_VPS_IP'
USER = 'root'
PASS = '***REDACTED_PASSWORD***'

SQL = "UPDATE census_audience_profiles SET expires_at = NOW() - INTERVAL '1 day';"
CMD = f"PGPASSWORD=***REDACTED_DB_PASSWORD*** psql -U midiakit_app -d midiakit_prod -h 127.0.0.1 -c \"{SQL}\""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS)
stdin, stdout, stderr = c.exec_command(CMD)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
c.close()
print('Done - census cache expired.')
