import paramiko, os
from datetime import datetime
from secrets import OLD_VPS_HOST, OLD_VPS_USER, OLD_VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(OLD_VPS_HOST, 22, OLD_VPS_USER, OLD_VPS_PASS, timeout=30)

sftp = c.open_sftp()
remote_path = '/home/mmak/midiakit/backend/midiakit.db'
local_dir = r'c:\midia kit\backend'
local_path = os.path.join(local_dir, 'midiakit.db')

info = sftp.stat(remote_path)
print(f'Remote DB: {info.st_size / 1024:.1f} KB, modificado em {datetime.fromtimestamp(info.st_mtime)}')

sftp.get(remote_path, local_path)
local_size = os.path.getsize(local_path)
print(f'Salvo em: {local_path}')
print(f'Tamanho local: {local_size / 1024:.1f} KB')

sftp.close()
c.close()
print('Concluido.')
