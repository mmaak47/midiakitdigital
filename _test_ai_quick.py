#!/usr/bin/env python3
"""Quick test: single AI point insight endpoint."""
import json, paramiko, sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('187.127.8.196', username='root', password='2xtO/2Ek6?d/PqS)J)Xf')

def ssh(cmd):
    i,o,e = client.exec_command(cmd, timeout=180)
    return o.read().decode(), e.read().decode()

# Login - write JSON file using echo
ssh('echo \'{"username":"admin","password":"Admin@12345"}\' > /tmp/lb.json')
out, _ = ssh('curl -s -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d @/tmp/lb.json')
print(f"Login response: {out[:200]}")
token = json.loads(out)['token']
print(f"Token OK: {token[:30]}...")
AUTH = f'-H "Authorization: Bearer {token}"'

# Point insight
print("\n=== POINT INSIGHT (ponto 1) - waiting up to 120s ===")
out, err = ssh(f'curl -s --max-time 120 http://localhost:3002/api/ai/point/1 {AUTH}')
print(f"Response ({len(out)} chars):")
print(out[:3000])
if err:
    print(f"stderr: {err[:300]}")

client.close()
