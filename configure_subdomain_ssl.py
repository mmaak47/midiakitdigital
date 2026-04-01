import paramiko

HOST = '187.127.8.196'
USER = 'root'
PASS = '***REMOVED-VPS-PASS***'
DOMAIN = 'midiakit.redeintermidia.com'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=HOST, username=USER, password=PASS, timeout=40)

nginx_conf = f'''server {{
    listen 80;
    listen [::]:80;
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
}}
'''

sftp = client.open_sftp()
with sftp.file('/etc/nginx/sites-available/midiakit', 'w') as f:
    f.write(nginx_conf)
sftp.close()

commands = [
    "nginx -t",
    "systemctl reload nginx",
    "apt-get update",
    "apt-get install -y certbot python3-certbot-nginx",
    (
        "certbot --nginx -d midiakit.redeintermidia.com "
        "--agree-tos --register-unsafely-without-email --non-interactive --redirect"
    ),
    "nginx -t",
    "systemctl reload nginx",
    "curl -I http://midiakit.redeintermidia.com",
    "curl -I https://midiakit.redeintermidia.com",
    "bash -lc \"if [ -f /home/mmak/midiakit/backend/.env ]; then sed -i '/^FRONTEND_ORIGINS=/d' /home/mmak/midiakit/backend/.env; fi\"",
    "bash -lc \"echo 'FRONTEND_ORIGINS=http://187.127.8.196,http://midiakit.redeintermidia.com,https://midiakit.redeintermidia.com,http://20.151.87.182,http://4.229.233.157,http://localhost:5173,http://127.0.0.1:5173' >> /home/mmak/midiakit/backend/.env\"",
    "cd /home/mmak/midiakit && pm2 restart intermidia-midiakit --update-env",
    "pm2 status",
]

for cmd in commands:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=240)
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
print('Subdomain + SSL configured successfully.')
