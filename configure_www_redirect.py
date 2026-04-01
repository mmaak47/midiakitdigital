import paramiko

HOST = '187.127.8.196'
USER = 'root'
PASS = '***REMOVED-VPS-PASS***'

DOMAIN = 'midiakit.redeintermidia.com'
WWW_DOMAIN = 'www.midiakit.redeintermidia.com'

nginx_conf = f'''server {{
    server_name {DOMAIN};

    client_max_body_size 50M;

    location / {{
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }}

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/{DOMAIN}/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/{DOMAIN}/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}}

server {{
    listen 80;
    listen [::]:80;
    server_name {DOMAIN};
    return 301 https://{DOMAIN}$request_uri;
}}

server {{
    listen 80;
    listen [::]:80;
    server_name {WWW_DOMAIN};
    return 301 https://{DOMAIN}$request_uri;
}}
'''

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=HOST, username=USER, password=PASS, timeout=40)

sftp = client.open_sftp()
with sftp.file('/etc/nginx/sites-available/midiakit', 'w') as f:
    f.write(nginx_conf)
sftp.close()

commands = [
    'nginx -t',
    'systemctl reload nginx',
    "bash -lc \"if [ -f /home/mmak/midiakit/backend/.env ]; then sed -i '/^FRONTEND_ORIGINS=/d' /home/mmak/midiakit/backend/.env; fi\"",
    (
        "bash -lc \"echo 'FRONTEND_ORIGINS="
        "http://187.127.8.196,http://midiakit.redeintermidia.com,https://midiakit.redeintermidia.com,"
        "http://www.midiakit.redeintermidia.com,https://www.midiakit.redeintermidia.com,"
        "http://20.151.87.182,http://4.229.233.157,http://localhost:5173,http://127.0.0.1:5173' "
        ">> /home/mmak/midiakit/backend/.env\""
    ),
    'cd /home/mmak/midiakit && pm2 restart intermidia-midiakit --update-env',
    'pm2 status',
]

for cmd in commands:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=180)
    out = stdout.read().decode(errors='ignore').strip()
    err = stderr.read().decode(errors='ignore').strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(err)
    if code != 0:
        raise RuntimeError(f'Command failed ({code}): {cmd}')

client.close()
print('Nginx prepared for www redirect (pending DNS record).')
