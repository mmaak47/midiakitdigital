import paramiko, secrets as s

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(s.VPS_HOST, username=s.VPS_USER, password=s.VPS_PASS)

# 1. Teste local direto na porta 3002
cmd1 = "curl -s -X POST 'http://localhost:3002/api/webhooks/whatsapp' -H 'Content-Type: application/json' -d '{\"event\":\"test\"}'"
_, o, _ = ssh.exec_command(cmd1)
print("=== LOCAL 3002 ===")
print(o.read().decode("utf-8", "replace"))

# 2. Teste via nginx (porta 80 / IP público)
cmd2 = "curl -s -X POST 'http://127.0.0.1/api/webhooks/whatsapp' -H 'Content-Type: application/json' -d '{\"event\":\"ping\"}'"
_, o, _ = ssh.exec_command(cmd2)
print("=== NGINX 80 ===")
print(o.read().decode("utf-8", "replace"))

# 3. Config nginx
cmd3 = "cat /etc/nginx/sites-enabled/midiakit 2>/dev/null || echo '--- nao existe midiakit ---'"
_, o, _ = ssh.exec_command(cmd3)
print("=== NGINX CONFIG ===")
print(o.read().decode("utf-8", "replace"))

# 4. Ultimas linhas do log de acesso do nginx
cmd4 = "tail -20 /var/log/nginx/access.log 2>/dev/null"
_, o, _ = ssh.exec_command(cmd4)
print("=== NGINX ACCESS LOG ===")
print(o.read().decode("utf-8", "replace"))

ssh.close()
print("DONE")
