#!/usr/bin/env python3
"""Test DOOH AI endpoints on VPS."""
import json
import paramiko
import sys

VPS_HOST = '187.127.8.196'
VPS_USER = 'root'
VPS_PASS = '2xtO/2Ek6?d/PqS)J)Xf'
BASE = 'http://localhost:3002/api'

def ssh_exec(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    return out, err

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS)

    # 1. Login to get auth token
    print("=== LOGIN ===")
    login_cmd = (
        'node -e "const fs=require(\'fs\'); '
        'fs.writeFileSync(\'/tmp/lb.json\', JSON.stringify({username:\'admin\',password:\'Admin@12345\'}))"'
    )
    out, err = ssh_exec(client, login_cmd)
    if err and 'AUTH_SECRET' not in err:
        print(f"Error creating login file: {err}")

    out, err = ssh_exec(client, f'curl -s -X POST {BASE}/auth/login -H "Content-Type: application/json" -d @/tmp/lb.json')
    print(out[:500])
    try:
        login_data = json.loads(out)
        token = login_data.get('token', '')
    except:
        print("Failed to parse login response")
        client.close()
        sys.exit(1)

    if not token:
        print("No token received!")
        client.close()
        sys.exit(1)

    print(f"Token: {token[:30]}...")
    AUTH = f'-H "Authorization: Bearer {token}"'

    # 2. Health check
    print("\n=== AI HEALTH ===")
    out, _ = ssh_exec(client, f'curl -s {BASE}/ai/health')
    print(out[:500])

    # 3. AI Stats
    print("\n=== AI STATS ===")
    out, _ = ssh_exec(client, f'curl -s {BASE}/ai/stats')
    print(out[:500])

    # 4. Point Insight (ponto ID 1)
    print("\n=== POINT INSIGHT (ponto 1) ===")
    out, err = ssh_exec(client, f'curl -s --max-time 120 {BASE}/ai/point/1 {AUTH}')
    print(out[:2000])
    if err:
        print(f"stderr: {err[:200]}")

    # 5. Smart Recommendation
    print("\n=== SMART RECOMMENDATION ===")
    rec_cmd = (
        'node -e "const fs=require(\'fs\'); '
        'fs.writeFileSync(\'/tmp/rec.json\', JSON.stringify({cidade:\'Londrina\',segmento:\'varejo\',objetivo:\'cobertura regional\',budget:50000,maxPontos:8,publico:\'massa\'}))"'
    )
    ssh_exec(client, rec_cmd)
    out, err = ssh_exec(client, f'curl -s --max-time 120 -X POST {BASE}/ai/recommend -H "Content-Type: application/json" {AUTH} -d @/tmp/rec.json')
    print(out[:2000])
    if err:
        print(f"stderr: {err[:200]}")

    # 6. Campaign Analysis
    print("\n=== CAMPAIGN ANALYSIS ===")
    camp_cmd = (
        'node -e "const fs=require(\'fs\'); '
        'fs.writeFileSync(\'/tmp/camp.json\', JSON.stringify({cidade:\'Londrina\',pontos:[1,2,3],segmento:\'varejo\',objetivo:\'awareness\',budget:30000}))"'
    )
    ssh_exec(client, camp_cmd)
    out, err = ssh_exec(client, f'curl -s --max-time 120 -X POST {BASE}/ai/campaign -H "Content-Type: application/json" {AUTH} -d @/tmp/camp.json')
    print(out[:2000])
    if err:
        print(f"stderr: {err[:200]}")

    client.close()
    print("\n=== DONE ===")

if __name__ == '__main__':
    main()
