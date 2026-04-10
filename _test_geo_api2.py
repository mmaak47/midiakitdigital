import paramiko, json
from secrets import VPS_HOST, VPS_USER, VPS_PASS

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

tests = [
    # Nearby / radius search around Londrina center
    ("nearby", "curl -s 'http://localhost:3002/api/geo/nearby?lat=-23.3045&lng=-51.1696&raio=2000'"),
    # Dynamic radius for ponto 1
    ("radius", "curl -s 'http://localhost:3002/api/geo/radius/1'"),
    # Enriched first item
    ("enriched-1", "curl -s 'http://localhost:3002/api/geo/enriched?cidade=Londrina' | python3 -c \"import sys,json; d=json.load(sys.stdin); p=d['pontos'][0]; print(json.dumps({k:p[k] for k in ['id','nome','tipo','fluxo','score_base']}, ensure_ascii=False))\""),
    # Opportunity (all cities)
    ("opportunity-all", "curl -s 'http://localhost:3002/api/geo/opportunity'"),
]

for label, cmd in tests:
    print(f'\n=== {label} ===')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
    out = stdout.read().decode()
    try:
        d = json.loads(out)
        if 'count' in d:
            print(f"count: {d['count']}")
        if 'pontos' in d and len(d['pontos']) > 0:
            for p in d['pontos'][:3]:
                name = p.get('nome', p.get('ponto_id', '?'))
                dist = p.get('distancia_m', '')
                score = p.get('score_base', p.get('opportunity_score', ''))
                print(f"  {name} dist={round(dist) if dist else '-'}m score={score}")
        elif 'raio_m' in d:
            print(f"ponto_id={d.get('ponto_id')} raio={d['raio_m']}m")
        elif 'clusters' in d:
            print(f"clusters: {len(d['clusters'])}")
        else:
            print(out[:200])
    except:
        print(out[:300])

c.close()
print('\nAll done!')
