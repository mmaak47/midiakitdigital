#!/usr/bin/env python3
"""Benchmark Ollama response times on VPS."""
import paramiko, time, json

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('187.127.8.196', username='root', password='2xtO/2Ek6?d/PqS)J)Xf')

def ssh(cmd, timeout=130):
    i, o, e = c.exec_command(cmd, timeout=timeout)
    return o.read().decode(), e.read().decode()

# Write test prompt as JSON file
ssh("echo '{\"model\":\"llama3\",\"prompt\":\"Responda em 1 frase: o que e midia DOOH?\",\"stream\":false,\"options\":{\"num_predict\":50}}' > /tmp/ollama_test.json")

print("=== Test 1: Small prompt, llama3 ===")
start = time.time()
out, err = ssh("curl -s --max-time 120 http://localhost:11434/api/generate -d @/tmp/ollama_test.json")
elapsed = time.time() - start
print(f"Time: {elapsed:.1f}s")
try:
    d = json.loads(out)
    print(f"Response: {d.get('response', '')[:300]}")
    print(f"Total duration: {d.get('total_duration', 0)/1e9:.1f}s")
    print(f"Eval count: {d.get('eval_count', 0)} tokens")
except:
    print(f"Raw: {out[:300]}")
    print(f"Err: {err[:200]}")

# Test with mistral too
ssh("echo '{\"model\":\"mistral\",\"prompt\":\"Responda em 1 frase: o que e midia DOOH?\",\"stream\":false,\"options\":{\"num_predict\":50}}' > /tmp/ollama_test2.json")

print("\n=== Test 2: Small prompt, mistral ===")
start = time.time()
out, err = ssh("curl -s --max-time 120 http://localhost:11434/api/generate -d @/tmp/ollama_test2.json")
elapsed = time.time() - start
print(f"Time: {elapsed:.1f}s")
try:
    d = json.loads(out)
    print(f"Response: {d.get('response', '')[:300]}")
    print(f"Total duration: {d.get('total_duration', 0)/1e9:.1f}s")
    print(f"Eval count: {d.get('eval_count', 0)} tokens")
except:
    print(f"Raw: {out[:300]}")

c.close()
