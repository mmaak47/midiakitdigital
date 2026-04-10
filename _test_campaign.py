#!/usr/bin/env python3
import json, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('187.127.8.196', username='root', password='2xtO/2Ek6?d/PqS)J)Xf')

def ssh(cmd):
    i,o,e = c.exec_command(cmd, timeout=180)
    return o.read().decode(), e.read().decode()

# Test campaign endpoint (no auth)
print('=== CAMPAIGN ANALYSIS ===')
payload = json.dumps({
    "cidade": "Londrina",
    "segmento": "clinica",
    "objetivo": "reconhecimento de marca",
    "empresa": "TestClinica",
    "investimento": 10000,
    "pontos_selecionados": 5,
    "formatos": ["LED", "Elevador"],
    "fluxo_total": 500000,
    "cpm": 20,
    "alcance_pct": 15,
    "frequencia": 3.5,
    "score": 6.2,
})
ssh(f"echo '{payload}' > /tmp/camp.json")
out, err = ssh('curl -s --max-time 120 -X POST http://localhost:3002/api/ai/campaign -H "Content-Type: application/json" -d @/tmp/camp.json')
print(f'Response ({len(out)} chars):')
if out.startswith('{'):
    d = json.loads(out)
    for k, v in d.items():
        val = str(v)[:200]
        print(f'  {k}: {val}')
else:
    print(out[:500])
if err:
    print(f'ERR: {err[:300]}')

c.close()
