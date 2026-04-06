"""
evolution_connect_whatsapp.py
==============================
Conecta o WhatsApp à instância 'intermidia' da Evolution API.
Execute APÓS o setup_evolution_api.py ter rodado com sucesso.

Uso:
  python evolution_connect_whatsapp.py

O script vai:
  1. Solicitar o QR Code da instância
  2. Gerar o QR Code como imagem PNG (qrcode.png) para você escanear
  3. Verificar se a conexão foi estabelecida
"""

import sys
import time
import base64
import urllib.request
import urllib.error
import json

try:
    import paramiko
except ImportError:
    print("ERRO: pip install paramiko")
    sys.exit(1)

# ─── PREENCHA COM OS DADOS GERADOS PELO setup_evolution_api.py ───────────────
HOST          = '187.127.8.196'
USER          = 'root'
PASS          = '***REDACTED-VPS-PASS***'
EVO_PORT      = 8080
EVO_API_KEY   = '***REDACTED-EVO-APIKEY***'   # gerada pelo setup_evolution_api.py
INSTANCE_NAME = 'intermidia'
# ─────────────────────────────────────────────────────────────────────────────

def req(path, method='GET', body=None):
    url = f'http://{HOST}:{EVO_PORT}{path}'
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(url, data=data, headers={
        'apikey': EVO_API_KEY,
        'Content-Type': 'application/json'
    }, method=method)
    with urllib.request.urlopen(r, timeout=20) as resp:
        return json.loads(resp.read().decode())

def main():
    if PASS == 'COLOQUE_AQUI_A_SENHA_DO_VPS' or EVO_API_KEY == 'COLOQUE_AQUI_A_API_KEY_GERADA':
        print("\n⚠️  Preencha PASS e EVO_API_KEY antes de executar.\n")
        sys.exit(1)

    # Tenta abrir porta 8080 via SSH tunnel para acesso local
    print(f"\n🔌  Conectando ao VPS {HOST}...")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=30)

    # Abre túnel SSH: porta local 18080 → VPS 127.0.0.1:8080
    transport = client.get_transport()
    local_port = 18080
    transport.request_port_forward('', local_port)

    import threading
    import socketserver
    import socket

    class ForwardServer(socketserver.ThreadingTCPServer):
        daemon_threads = True
        allow_reuse_address = True

    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            try:
                chan = transport.open_channel(
                    'direct-tcpip',
                    ('127.0.0.1', EVO_PORT),
                    self.request.getpeername()
                )
                if chan is None:
                    return
                fwd = threading.Thread(target=self._forward, args=(chan, self.request), daemon=True)
                fwd.start()
                self._forward(self.request, chan)
            except Exception:
                pass

        def _forward(self, src, dst):
            while True:
                try:
                    data = src.recv(1024)
                    if not data:
                        break
                    dst.send(data)
                except Exception:
                    break

    server = ForwardServer(('127.0.0.1', local_port), Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"  ✓  Túnel SSH aberto: localhost:{local_port} → VPS:{EVO_PORT}")

    # A partir daqui usa localhost:18080
    import urllib.request as ur

    def req_local(path, method='GET', body=None):
        url = f'http://127.0.0.1:{local_port}{path}'
        data = json.dumps(body).encode() if body else None
        r = ur.Request(url, data=data, headers={
            'apikey': EVO_API_KEY,
            'Content-Type': 'application/json'
        }, method=method)
        with ur.urlopen(r, timeout=20) as resp:
            return json.loads(resp.read().decode())

    # Verifica status da instância
    print(f"\n  Verificando instância '{INSTANCE_NAME}'...")
    try:
        status = req_local(f'/instance/connectionState/{INSTANCE_NAME}')
        state = status.get('instance', {}).get('state', 'unknown')
        print(f"  Estado atual: {state}")
        if state == 'open':
            print("\n  ✅  WhatsApp já está conectado!")
            client.close()
            return
    except Exception as e:
        print(f"  ⚠️  Erro ao verificar estado: {e}")

    # Solicita QR Code
    print(f"\n  Solicitando QR Code...")
    try:
        qr_resp = req_local(f'/instance/connect/{INSTANCE_NAME}')
    except Exception as e:
        print(f"  ERRO ao solicitar QR Code: {e}")
        client.close()
        return

    # Procura o QR Code na resposta
    qr_b64 = None
    if 'base64' in qr_resp:
        raw = qr_resp['base64']
        if ',' in raw:
            qr_b64 = raw.split(',')[1]
        else:
            qr_b64 = raw
    elif 'qrcode' in qr_resp:
        raw = qr_resp['qrcode']
        if ',' in raw:
            qr_b64 = raw.split(',')[1]
        else:
            qr_b64 = raw

    if qr_b64:
        qr_path = 'qrcode_whatsapp.png'
        with open(qr_path, 'wb') as f:
            f.write(base64.b64decode(qr_b64))
        print(f"\n  📷  QR Code salvo em: {qr_path}")
        print(f"  Abra o arquivo e escaneie com o WhatsApp (Configurações → Aparelhos conectados → +)")

        # Tenta abrir automaticamente
        import subprocess, os
        try:
            if sys.platform == 'win32':
                os.startfile(qr_path)
            elif sys.platform == 'darwin':
                subprocess.run(['open', qr_path])
            else:
                subprocess.run(['xdg-open', qr_path])
        except Exception:
            pass
    else:
        print("\n  QR Code não encontrado na resposta. Resposta completa:")
        print(json.dumps(qr_resp, indent=2, ensure_ascii=False))
        print("\n  Tente acessar diretamente:")
        print(f"  GET https://midiakit.redeintermidia.com/evolution/instance/connect/{INSTANCE_NAME}")
        print(f"  Header: apikey: {EVO_API_KEY}")
        client.close()
        return

    # Aguarda conexão
    print(f"\n  Aguardando você escanear o QR Code (60 segundos)...")
    for i in range(20):
        time.sleep(3)
        try:
            status = req_local(f'/instance/connectionState/{INSTANCE_NAME}')
            state = status.get('instance', {}).get('state', 'unknown')
            print(f"  ... {(i+1)*3}s — estado: {state}")
            if state == 'open':
                print("\n  ✅  WhatsApp conectado com sucesso!")
                break
        except Exception:
            pass
    else:
        print("\n  ⏱️  Tempo esgotado. Se o QR Code expirou, execute o script novamente.")

    server.shutdown()
    client.close()

    print(f"""
{'='*58}
  Próximo passo:
  No painel Admin → Configurações → Evolution API, preencha:

  URL da API        : https://midiakit.redeintermidia.com/evolution
  Nome da Instância : {INSTANCE_NAME}
  API Key           : {EVO_API_KEY}
  Número destino    : 55 + DDD + Número (ex: 5543999990000)
                      OU o ID do grupo WhatsApp

  Para descobrir o ID de um grupo:
  GET /group/fetchAllGroups/{INSTANCE_NAME}?getParticipants=false
  Header: apikey: {EVO_API_KEY}
{'='*58}
""")


if __name__ == '__main__':
    mai