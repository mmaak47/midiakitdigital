import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

DB = "postgresql://midiakit_app:vAskc8v3c3U3IfJ7yQtv1QtHMWYZ@127.0.0.1:5432/midiakit_prod"

checks = [
    # Check if location column exists on pontos
    f"psql '{DB}' -c \"SELECT column_name FROM information_schema.columns WHERE table_name='pontos' AND column_name='location';\"",
    # Check if ponto_clusters table exists
    f"psql '{DB}' -c \"SELECT count(*) as clusters FROM ponto_clusters;\" 2>&1",
    # Check materialized view
    f"psql '{DB}' -c \"SELECT count(*) as enriched FROM pontos_enriquecidos;\" 2>&1",
    # Check functions
    f"psql '{DB}' -c \"SELECT proname FROM pg_proc WHERE proname LIKE 'fn_%' ORDER BY proname;\"",
    # Check total pontos with location
    f"psql '{DB}' -c \"SELECT count(*) as with_location FROM pontos WHERE location IS NOT NULL;\"",
]

for cmd in checks:
    print(f'>>> {cmd.split("-c")[1][:60] if "-c" in cmd else cmd[:60]}...')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err: print(err)
    print('---')

c.close()
print('Done!')
