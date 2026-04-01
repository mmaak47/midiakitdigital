import paramiko
import json
import time

h = 'REDACTED_OLD_VPS_IP'
u = 'mmak'
p = '***REMOVED-OLD-PASS***'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(h, 22, u, p, timeout=30)

# Test simple PNG render to verify PDF generation works
test_html = """<!DOCTYPE html>
<html>
<head>
<style>
body { background: #000; color: #fff; font-family: Arial; }
.container { padding: 40px; }
</style>
</head>
<body>
<div class="container">
<h1>Test PDF</h1>
<p>Se este PDF foi gerado, a fila e memória estão funcionando!</p>
</div>
</body>
</html>"""

curl_cmd = f"""curl -X POST http://127.0.0.1:3002/api/pdf/render \
  -H "Content-Type: application/json" \
  -d '{json.dumps({
    "html": test_html,
    "fileName": "test.pdf",
    "noCache": True
  })}' \
  -w "\\nHTTP Status: %{{http_code}}\\nTime: %{{time_total}}s\\n" \
  -o /tmp/test.pdf \
  --max-time 120"""

print("=" * 60)
print("TEST: Renderizando PDF de teste...")
print("=" * 60)

start = time.time()
i, o, e = c.exec_command(curl_cmd, timeout=130)
output = o.read().decode('utf-8', 'ignore')
errors = e.read().decode('utf-8', 'ignore')
elapsed = time.time() - start

print("STDOUT:", output)
if errors:
    print("STDERR:", errors)
print(f"Total time: {elapsed:.2f}s")

# Check if PDF was created
print("\n" + "=" * 60)
print("Verificando arquivo PDF...")
print("=" * 60)
i, o, e = c.exec_command("ls -lh /tmp/test.pdf && file /tmp/test.pdf", timeout=10)
print(o.read().decode('utf-8', 'ignore'))

c.close()
