"""Check entorno_cache columns and pontos per city."""
import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

cmds = [
    r"PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -c '\d entorno_cache'",
    "PGPASSWORD=vAskc8v3c3U3IfJ7yQtv1QtHMWYZ psql -h 127.0.0.1 -U midiakit_app -d midiakit_prod -c 'SELECT cidade, COUNT(*) as n FROM pontos WHERE ativo=1 GROUP BY cidade ORDER BY n DESC;'",
]

for cmd in cmds:
    print('>>>', cmd.split('-c ')[-1])
    i, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode().strip())
    er = e.read().decode().strip()
    if er: print(er)
    print()

c.close()
