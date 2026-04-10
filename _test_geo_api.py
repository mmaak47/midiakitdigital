import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

tests = [
    # Test enriched points for Londrina
    "curl -s 'http://localhost:3002/api/geo/enriched?cidade=Londrina' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'enriched: count={d.get(\\\"count\\\",0)}')\"",
    # Test clusters
    "curl -s 'http://localhost:3002/api/geo/clusters?cidade=Londrina' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'clusters: count={d.get(\\\"count\\\",0)}')\"",
    # Test nearest (Londrina center approx -23.3045, -51.1696)
    "curl -s 'http://localhost:3002/api/geo/nearest?lat=-23.3045&lng=-51.1696&limit=5' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'nearest: count={d.get(\\\"count\\\",0)}'); [print(f'  {p.get(\\\"nome\\\",\\\"?\\\")} - {round(p.get(\\\"distancia_m\\\",0))}m') for p in d.get(\\\"pontos\\\",[])[:3]]\"",
    # Test SOV
    "curl -s 'http://localhost:3002/api/geo/sov?cidade=Londrina' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'sov clusters: {d.get(\\\"count\\\",0)}')\"",
    # Test opportunity index
    "curl -s 'http://localhost:3002/api/geo/opportunity?cidade=Londrina' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'opportunity: {d.get(\\\"count\\\",0)} pontos')\"",
]

for cmd in tests:
    print(f'---')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out.strip())
    if err: print('ERR:', err.strip())

c.close()
print('\n--- All tests done!')
