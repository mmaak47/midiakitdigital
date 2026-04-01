import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname='187.127.8.196', username='root', password='***REMOVED-VPS-PASS***', timeout=30)

commands = [
    'pm2 env 0 | grep PDF_ALLOWED_HOSTS',
    'ldconfig -p | grep libatk-1.0.so.0',
    "curl -s -o /tmp/test-pdf.bin -w 'STATUS=%{http_code} SIZE=%{size_download}' -X POST -H 'Origin: https://midiakit.redeintermidia.com' -H 'Content-Type: application/json' --data-binary '{\"html\":\"<!doctype html><html><head><meta charset=\\\"utf-8\\\"></head><body><h1>PDF OK</h1><p>Teste</p></body></html>\",\"fileName\":\"teste.pdf\",\"noCache\":true}' http://127.0.0.1:3002/api/pdf/render",
    'file /tmp/test-pdf.bin',
    'tail -20 /root/.pm2/logs/intermidia-midiakit-error.log',
]

for command in commands:
    print(f'=== {command} ===')
    stdin, stdout, stderr = client.exec_command(command, timeout=120)
    out = stdout.read().decode('utf-8', 'ignore')
    err = stderr.read().decode('utf-8', 'ignore')
    print(out)
    if err:
        print('STDERR:', err)

client.close()
