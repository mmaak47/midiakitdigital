import paramiko
from pathlib import Path

OLD_HOST = 'REDACTED_OLD_VPS_IP'
OLD_USER = 'mmak'
OLD_PASS = '***REMOVED-OLD-PASS***'
OLD_BASE = '/home/mmak/midiakit'

NEW_HOST = 'REDACTED_VPS_IP'
NEW_USER = 'root'
NEW_PASS = '***REMOVED-VPS-PASS***'
NEW_BASE = '/home/mmak/midiakit'
WORKDIR = Path(r'c:\midia kit\.migration_tmp')
WORKDIR.mkdir(parents=True, exist_ok=True)


def connect(host, user, password):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=user, password=password, timeout=40)
    return client


def run(client, cmd, timeout=600):
    print(f'>>> {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode(errors='ignore').strip()
    err = stderr.read().decode(errors='ignore').strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(err)
    if code != 0:
        raise RuntimeError(f'Command failed ({code}): {cmd}')


def sftp_exists(sftp, path):
    try:
        sftp.stat(path)
        return True
    except Exception:
        return False


print('=== 1) Coletando artefatos do servidor antigo ===')
old = connect(OLD_HOST, OLD_USER, OLD_PASS)
old_sftp = old.open_sftp()

remote_db = f'{OLD_BASE}/backend/midiakit.db'
remote_uploads_tar = '/tmp/midiakit_uploads.tar.gz'
remote_source_tar = '/tmp/midiakit_source.tar.gz'
remote_license = f'{OLD_BASE}/backend/license.key'
remote_backend_env = f'{OLD_BASE}/backend/.env'
remote_root_env = f'{OLD_BASE}/.env'

run(old, f"tar -czf {remote_uploads_tar} -C {OLD_BASE}/backend uploads", timeout=1800)
run(
    old,
    "tar --exclude='midiakit/.git' "
    "--exclude='midiakit/frontend/node_modules' "
    "--exclude='midiakit/backend/node_modules' "
    "--exclude='midiakit/backend/midiakit.db' "
    "--exclude='midiakit/backend/uploads' "
    "--exclude='midiakit/backend/pdf-cache' "
    f"-czf {remote_source_tar} -C /home/mmak midiakit",
    timeout=1800,
)

local_db = WORKDIR / 'midiakit.db'
local_uploads_tar = WORKDIR / 'midiakit_uploads.tar.gz'
local_source_tar = WORKDIR / 'midiakit_source.tar.gz'
local_license = WORKDIR / 'license.key'
local_backend_env = WORKDIR / 'backend.env'
local_root_env = WORKDIR / 'root.env'

old_sftp.get(remote_db, str(local_db))
old_sftp.get(remote_uploads_tar, str(local_uploads_tar))
old_sftp.get(remote_source_tar, str(local_source_tar))
print(f'DB baixada: {local_db}')
print(f'Uploads baixados: {local_uploads_tar}')
print(f'Codigo-fonte baixado: {local_source_tar}')

has_license = sftp_exists(old_sftp, remote_license)
has_backend_env = sftp_exists(old_sftp, remote_backend_env)
has_root_env = sftp_exists(old_sftp, remote_root_env)

if has_license:
    old_sftp.get(remote_license, str(local_license))
    print('License key copiada.')
if has_backend_env:
    old_sftp.get(remote_backend_env, str(local_backend_env))
    print('backend/.env copiado.')
if has_root_env:
    old_sftp.get(remote_root_env, str(local_root_env))
    print('.env da raiz copiado.')

old_sftp.close()
old.close()

print('=== 2) Provisionando servidor novo ===')
new = connect(NEW_HOST, NEW_USER, NEW_PASS)
new_sftp = new.open_sftp()

run(new, 'apt-get update', timeout=1800)
run(new, 'apt-get install -y git curl ca-certificates gnupg nginx', timeout=1800)
run(new, 'bash -lc "node -v >/dev/null 2>&1 || true"')
run(new, 'bash -lc "if ! command -v node >/dev/null 2>&1; then curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y nodejs; fi"', timeout=1800)
run(new, 'bash -lc "if ! node -v | grep -q ^v20; then curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y nodejs; fi"', timeout=1800)
run(new, 'npm install -g pm2', timeout=1800)

run(new, 'mkdir -p /home/mmak && rm -rf /home/mmak/midiakit')
new_sftp.put(str(local_source_tar), '/tmp/midiakit_source.tar.gz')
run(new, 'tar -xzf /tmp/midiakit_source.tar.gz -C /home/mmak', timeout=1800)

# Dependencias e build
run(new, f'cd {NEW_BASE}/backend && npm install', timeout=1800)
run(new, f'cd {NEW_BASE}/frontend && npm install', timeout=1800)
run(new, f'cd {NEW_BASE}/frontend && npm run build', timeout=1800)

print('=== 3) Enviando banco, uploads e configs ===')
new_sftp.put(str(local_db), f'{NEW_BASE}/backend/midiakit.db')
new_sftp.put(str(local_uploads_tar), '/tmp/midiakit_uploads.tar.gz')

if has_license:
    new_sftp.put(str(local_license), f'{NEW_BASE}/backend/license.key')
if has_backend_env:
    new_sftp.put(str(local_backend_env), f'{NEW_BASE}/backend/.env')
if has_root_env:
    new_sftp.put(str(local_root_env), f'{NEW_BASE}/.env')

run(new, f'tar -xzf /tmp/midiakit_uploads.tar.gz -C {NEW_BASE}/backend', timeout=1800)
run(new, f'mkdir -p {NEW_BASE}/backend/pdf-cache {NEW_BASE}/backend/backups')
run(new, f'chmod 755 {NEW_BASE}/backend/uploads || true')

print('=== 4) Subindo aplicacao com PM2 ===')
run(new, f'cd {NEW_BASE} && pm2 delete intermidia-midiakit || true')
run(new, f'cd {NEW_BASE} && pm2 start ecosystem.config.js')
run(new, 'pm2 save')
run(new, 'pm2 status')

print('=== 5) Configurando Nginx ===')
nginx_conf = '''server {
    listen 80;
    listen [::]:80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
'''

local_nginx = WORKDIR / 'midiakit_nginx.conf'
local_nginx.write_text(nginx_conf, encoding='utf-8')
new_sftp.put(str(local_nginx), '/etc/nginx/sites-available/midiakit')

run(new, 'ln -sf /etc/nginx/sites-available/midiakit /etc/nginx/sites-enabled/midiakit')
run(new, 'rm -f /etc/nginx/sites-enabled/default')
run(new, 'nginx -t')
run(new, 'systemctl enable nginx')
run(new, 'systemctl restart nginx')

print('=== 6) Verificacao ===')
run(new, 'curl -I http://127.0.0.1:3002', timeout=120)
run(new, 'curl -I http://127.0.0.1', timeout=120)

new_sftp.close()
new.close()

print('Migracao concluida com sucesso.')
print(f'IP novo servidor: {NEW_HOST}')
print('Aponte o dominio/subdominio para este IP e depois habilite HTTPS (Lets Encrypt).')
