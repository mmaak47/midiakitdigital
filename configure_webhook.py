"""
configure_webhook.py
====================
Configura o webhook da instância 'intermidia' na Evolution API
para apontar para http://187.127.8.196/api/webhooks/whatsapp
com o evento messages.upsert habilitado.

Execução:  python configure_webhook.py
"""

import json
import urllib.request
import urllib.error

# ── Lê as configurações salvas no banco via Admin > Configurações ─────────────
# Se ainda não salvou pela interface, preencha manualmente aqui:
EVO_URL      = 'https://midiakit.redeintermidia.com/evolution'  # URL base da Evolution API
EVO_API_KEY  = ''   # deixe vazio para ler do banco (ver abaixo)
INSTANCE     = 'intermidia'
WEBHOOK_URL  = 'http://187.127.8.196/api/webhooks/whatsapp'

# ── Fallback: lê a API key salva no banco do sistema ─────────────────────────
if not EVO_API_KEY:
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
        # Tenta ler do SQLite local (só funciona se DB_ENGINE=sqlite)
        import sqlite3
        db_path = os.path.join(os.path.dirname(__file__), 'backend', 'database.sqlite')
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            row = conn.execute("SELECT value FROM app_settings WHERE key='evolution_api_key'").fetchone()
            conn.close()
            if row:
                EVO_API_KEY = row[0]
                print(f"  ✓  API Key lida do banco local.")
    except Exception as e:
        print(f"  ⚠️  Não foi possível ler a API key do banco: {e}")

if not EVO_API_KEY:
    EVO_API_KEY = input("Cole a Evolution API Key (visível em Admin > Configurações): ").strip()

# ─────────────────────────────────────────────────────────────────────────────

def evo_request(method, path, body=None):
    base = EVO_URL.rstrip('/')
    url  = f"{base}{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            'Content-Type': 'application/json',
            'apikey': EVO_API_KEY,
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'ignore')
        raise RuntimeError(f"HTTP {e.code}: {body[:300]}")

# ── 1. Verifica se a instância existe ────────────────────────────────────────
print(f"\n🔍  Verificando instância '{INSTANCE}'...")
try:
    info = evo_request('GET', f'/instance/fetchInstances')
    names = [i.get('instance', {}).get('instanceName') or i.get('instanceName') for i in (info if isinstance(info, list) else [info])]
    if INSTANCE in names:
        print(f"  ✓  Instância '{INSTANCE}' encontrada.")
    else:
        print(f"  ⚠️  Instância '{INSTANCE}' não encontrada. Instâncias disponíveis: {names}")
        print("     Verifique se o nome está correto no topo deste script.")
except Exception as e:
    print(f"  ⚠️  Não foi possível listar instâncias: {e}")

# ── 2. Configura o webhook ────────────────────────────────────────────────────
print(f"\n⚙️   Configurando webhook...")
print(f"    URL     : {WEBHOOK_URL}")
print(f"    Eventos : MESSAGES_UPSERT, MESSAGES_UPDATE")

webhook_payload = {
    "webhook": {
        "enabled": True,
        "url": WEBHOOK_URL,
        "webhookByEvents": False,
        "webhookBase64": False,
        "events": [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE"
        ]
    }
}

try:
    result = evo_request('POST', f'/webhook/set/{INSTANCE}', webhook_payload)
    print(f"\n  ✅  Webhook configurado com sucesso!")
    print(f"     Resposta: {json.dumps(result, ensure_ascii=False, indent=2)}")
except Exception as e:
    print(f"\n  ❌  Erro ao configurar webhook: {e}")

# ── 3. Confirma a configuração atual ─────────────────────────────────────────
print(f"\n🔎  Confirmando configuração atual do webhook...")
try:
    current = evo_request('GET', f'/webhook/find/{INSTANCE}')
    print(f"     {json.dumps(current, ensure_ascii=False, indent=2)}")
except Exception as e:
    print(f"  ⚠️  Não foi possível confirmar: {e}")

print("\n✅  Pronto! O sistema agora receberá reações emoji via WhatsApp.")
print(f"    Endpoint: POST {WEBHOOK_URL}")
print( "    Eventos : MESSAGES_UPSERT (reações são recebidas neste evento)")
