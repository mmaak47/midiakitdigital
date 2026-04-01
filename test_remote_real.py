import paramiko
from secrets import OLD_VPS_HOST as h, OLD_VPS_USER as u, OLD_VPS_PASS as p

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(h, 22, u, p, timeout=30)

remote_cmd = r'''python3 - <<'PY'
import sqlite3, json, subprocess

conn = sqlite3.connect('/home/mmak/midiakit/backend/midiakit.db')
cur = conn.cursor()
cur.execute("SELECT COALESCE(imagem2, imagem, '') as img, nome FROM pontos WHERE ativo=1 AND (imagem2 IS NOT NULL OR imagem IS NOT NULL) LIMIT 2")
rows = cur.fetchall()

images = []
for img, name in rows:
    raw = (img or '').strip()
    if not raw:
        continue
    if raw.startswith('http://') or raw.startswith('https://'):
        url = raw
    elif raw.startswith('/'):
        url = 'http://127.0.0.1:3002' + raw
    else:
        url = 'http://127.0.0.1:3002/' + raw.lstrip('/')
    images.append((url, name))

if not images:
    print('NO_IMAGES_FOUND')
    raise SystemExit(0)

parts = []
for url, name in images:
    parts.append(f'<div style="margin:12px 0"><h3>{name}</h3><img src="{url}" style="width:1200px;height:500px;object-fit:cover"/></div>')

html = '<!doctype html><html><head><meta charset="utf-8"><style>body{background:#111;color:#fff;font-family:Arial;padding:20px}</style></head><body><h1>Teste real com imagens</h1>' + ''.join(parts) + '</body></html>'

payload = json.dumps({
    'html': html,
    'fileName': 'real-images-test.pdf',
    'noCache': True
})

cmd = [
    'curl', '-sS', '-X', 'POST', 'http://127.0.0.1:3002/api/pdf/render',
    '-H', 'Content-Type: application/json',
    '-d', payload,
    '-w', '\nHTTP:%{http_code} TIME:%{time_total}s\n',
    '-o', '/tmp/real-images-test.pdf',
    '--max-time', '180'
]

res = subprocess.run(cmd, capture_output=True, text=True)
print(res.stdout)
if res.stderr.strip():
    print(res.stderr)
subprocess.run(['ls', '-lh', '/tmp/real-images-test.pdf'])
PY'''

print('===== REALISTIC PDF TEST =====')
i, o, e = c.exec_command(remote_cmd, timeout=220)
print(o.read().decode('utf-8', 'ignore'))
err = e.read().decode('utf-8', 'ignore')
if err.strip():
    print('[stderr]')
    print(err)

print('===== RECENT PDF ERRORS =====')
i, o, e = c.exec_command("tail -30 /home/mmak/.pm2/logs/intermidia-midiakit-error.log | grep -E '\\[pdf/render\\]|Timed out|Connection closed' || true", timeout=30)
print(o.read().decode('utf-8', 'ignore'))

c.close()
