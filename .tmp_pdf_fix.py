import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname='187.127.8.196', username='root', password='***REMOVED-VPS-PASS***', timeout=40)

packages = 'ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxrender1 libxshmfence1 wget'
commands = [
    f'export DEBIAN_FRONTEND=noninteractive; apt-get install -y {packages}',
    'cd /home/mmak/midiakit && pm2 reload ecosystem.config.js --update-env',
    'pm2 env 0 | grep PDF_ALLOWED_HOSTS',
    'ldconfig -p | grep libatk-1.0.so.0',
    "curl -s -o /tmp/test-pdf.bin -w 'STATUS=%{http_code} SIZE=%{size_download}' -X POST -H 'Origin: https://midiakit.redeintermidia.com' -H 'Content-Type: application/json' --data-binary '{\"html\":\"<!doctype html><html><head><meta charset=\\\"utf-8\\\"></head><body><h1>PDF OK</h1><p>Teste</p></body></html>\",\"fileName\":\"teste.pdf\",\"noCache\":true}' http://127.0.0.1:3002/api/pdf/render",
    'file /tmp/test-pdf.bin',
    'tail -20 /root/.pm2/logs/intermidia-midiakit-error.log'
]

for command in commands:
    print(f'=== {command} ===')
    stdin, stdout, stderr = client.exec_command(command, timeout=2400)
    out = stdout.read().decode('utf-8', 'ignore')
    err = stderr.read().decode('utf-8', 'ignore')
    code = stdout.channel.recv_exit_status()
    print(out)
    if err:
        print('STDERR:', err)
    if code != 0:
        raise SystemExit(f'Command failed ({code}): {command}')

client.close()
