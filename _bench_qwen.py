#!/usr/bin/env python3
"""Benchmark qwen2:1.5b on VPS."""
import paramiko, time, json

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('187.127.8.196', username='root', password='2xtO/2Ek6?d/PqS)J)Xf')

def ssh(cmd, t=130):
    i, o, e = c.exec_command(cmd, timeout=t)
    return o.read().decode(), e.read().decode()

# Write test payload
payload = json.dumps({
    "model": "qwen2:1.5b",
    "prompt": "Voce e um especialista em midia DOOH no Brasil. Analise este ponto: Painel LED em centro comercial de Londrina, fluxo 150000/mes, CPM R$8.50, score 0.85/1.0, bairro tipo Centro Corporativo, perfil alta renda dominante. Gere: 1) headline comercial, 2) narrativa de venda em 2 frases, 3) publico ideal. Responda em JSON.",
    "stream": False,
    "options": {"num_predict": 200, "num_ctx": 2048}
})

# Write payload to remote file via sftp
sftp = c.open_sftp()
with sftp.file('/tmp/qwen_test.json', 'w') as f:
    f.write(payload)
sftp.close()

print("=== qwen2:1.5b - realistic DOOH prompt ===")
start = time.time()
out, err = ssh('curl -s --max-time 120 http://localhost:11434/api/generate -d @/tmp/qwen_test.json')
elapsed = time.time() - start
print(f"Wall time: {elapsed:.1f}s")
try:
    d = json.loads(out)
    print(f"Response: {d.get('response', '')[:500]}")
    print(f"Total duration: {d.get('total_duration', 0)/1e9:.1f}s")
    print(f"Eval count: {d.get('eval_count', 0)} tokens")
    print(f"Prompt eval: {d.get('prompt_eval_duration', 0)/1e9:.1f}s")
    eval_dur = d.get('eval_duration', 0)
    eval_cnt = d.get('eval_count', 1)
    if eval_dur > 0:
        print(f"Token rate: {eval_cnt / (eval_dur/1e9):.1f} tokens/s")
except Exception as ex:
    print(f"Parse error: {ex}")
    print(f"Raw: {out[:300]}")

c.close()
