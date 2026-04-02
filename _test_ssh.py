import paramiko, os

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())

key_path = os.path.expanduser('~/.ssh/id_rsa')
print(f'Using key: {key_path}, exists: {os.path.exists(key_path)}')

try:
    key = paramiko.RSAKey.from_private_key_file(key_path)
    c.connect('REDACTED_VPS_IP', 22, 'root', pkey=key, timeout=30, allow_agent=False, look_for_keys=False)
    stdin, stdout, stderr = c.exec_command('whoami')
    print('Connected as:', stdout.read().decode().strip())
    c.close()
except Exception as e:
    print('Error:', type(e).__name__, e)
