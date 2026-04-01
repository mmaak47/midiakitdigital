import paramiko

host = '187.127.8.196'
user = 'root'
password = '***REMOVED-VPS-PASS***'

origins = 'http://187.127.8.196,http://20.151.87.182,http://4.229.233.157,http://localhost:5173,http://127.0.0.1:5173'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=host, username=user, password=password, timeout=30)

commands = [
    "mkdir -p /home/mmak/midiakit/backend",
    "bash -lc \"if [ -f /home/mmak/midiakit/backend/.env ]; then sed -i '/^FRONTEND_ORIGINS=/d' /home/mmak/midiakit/backend/.env; fi\"",
    f"bash -lc \"echo 'FRONTEND_ORIGINS={origins}' >> /home/mmak/midiakit/backend/.env\"",
    "cd /home/mmak/midiakit && pm2 restart intermidia-midiakit",
    "pm2 status",
    "tail -n 20 /root/.pm2/logs/intermidia-midiakit-error.log",
]

for cmd in commands:
    print(f'>>> {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
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
print('CORS updated and PM2 restarted.')
