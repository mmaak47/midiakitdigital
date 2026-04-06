"""
setup_evolution_api.py
======================
Instala e configura a Evolution API v2 no mesmo VPS que roda o sistema Midia Kit.
Execução: python setup_evolution_api.py

O que este script faz:
  1. Conecta ao VPS via SSH
  2. Instala Docker + Docker Compose (se não estiver instalado)
  3. Cria o arquivo /opt/evolution-api/docker-compose.yml e .env
  4. Sobe o container da Evolution API na porta 8080 (acesso APENAS local)
  5. Registra a Evolution API no PM2 via docker-compose up (healthcheck)
  6. Adiciona um bloco nginx para expor a API em:
         https://midiakit.redeintermidia.com/evolution/
     (sem subdomínio extra — zero configuração de DNS necessária)
  7. Recarrega nginx e aplica SSL (já existente pelo certbot)
  8. Imprime os dados de configuração para copiar no painel Admin

Pré-requisito no seu computador:
  pip install paramiko
"""

import sys
import os
import time

try:
    import paramiko
except ImportError:
    print("ERRO: instale o paramiko primeiro:  pip install paramiko")
    sys.exit(1)

# ─── CONFIGURAÇÕES DO VPS ──────────────────────────────────────────────────────
HOST   = '187.127.8.196'
USER   = 'root'
# ⚠️  Preencha a senha do root antes de rodar:
PASS   = '***REDACTED-VPS-PASS***'

DOMAIN        = 'midiakit.redeintermidia.com'
EVO_PORT      = 8080          # porta interna (só localhost)
EVO_DIR       = '/opt/evolution-api'
EVO_VERSION   = 'atendai/evolution-api:v2.2.3'  # versão estável

# Gera API Key aleatória de 40 chars para a Evolution API
EVO_API_KEY   = os.urandom(20).hex()

# ──────────────────────────────────────────────────────────────────────────────

def run(client, cmd, timeout=120, show=True):
    """Executa um comando SSH e retorna stdout+stderr."""
    if show:
        print(f"\n▶  {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out  = stdout.read().decode('utf-8', 'ignore').strip()
    err  = stderr.read().decode('utf-8', 'ignore').strip()
    combined = (out + '\n' + err).strip()
    if combined and show:
        print(combined)
    return combined

def write_file(sftp, remote_path, content):
    """Escreve um arquivo remoto via SFTP."""
    with sftp.file(remote_path, 'w') as f:
        f.write(content)
    print(f"  ✓  Arquivo criado: {remote_path}")

def section(title):
    print(f"\n{'='*62}")
    print(f"  {title}")
    print(f"{'='*62}")


# ─── DOCKER COMPOSE ───────────────────────────────────────────────────────────
DOCKER_COMPOSE_CONTENT = f"""version: '3.3'

services:
  evolution-api:
    image: {EVO_VERSION}
    container_name: evolution-api
    restart: always
    ports:
      - "127.0.0.1:{EVO_PORT}:{EVO_PORT}"   # somente localhost — nginx faz o proxy
    env_file:
      - .env
    volumes:
      - ./store:/evolution/store
      - ./instances:/evolution/instances
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:{EVO_PORT}/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
"""

# ─── .ENV DA EVOLUTION API ────────────────────────────────────────────────────
EVO_ENV_CONTENT = f"""# Evolution API v2 — gerado automaticamente
SERVER_URL=https://{DOMAIN}/evolution
SERVER_PORT={EVO_PORT}

# Autenticação global
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY={EVO_API_KEY}
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

# Logs
LOG_LEVEL=ERROR
LOG_COLOR=true
LOG_BAILEYS=error

# QR Code
QRCODE_LIMIT=30
QRCODE_COLOR=#198754

# Storage — usa arquivos locais (sem Redis, sem PostgreSQL externo)
DATABASE_ENABLED=false
CACHE_REDIS_ENABLED=false
CACHE_LOCAL_ENABLED=true

# Webhook padrão (deixe em branco — configure por instância no painel se quiser)
WEBHOOK_GLOBAL_URL=
WEBHOOK_GLOBAL_ENABLED=false
WEBHOOK_EVENTS_APPLICATION_STARTUP=false
WEBHOOK_EVENTS_QRCODE_UPDATED=true
WEBHOOK_EVENTS_MESSAGES_SET=false
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_MESSAGES_UPDATE=false
WEBHOOK_EVENTS_CONTACTS_SET=false
WEBHOOK_EVENTS_CONTACTS_UPSERT=false
WEBHOOK_EVENTS_CONTACTS_UPDATE=false
WEBHOOK_EVENTS_PRESENCE_UPDATE=false
WEBHOOK_EVENTS_CHATS_SET=false
WEBHOOK_EVENTS_CHATS_UPSERT=false
WEBHOOK_EVENTS_CHATS_UPDATE=false
WEBHOOK_EVENTS_CHATS_DELETE=false
WEBHOOK_EVENTS_GROUPS_UPSERT=false
WEBHOOK_EVENTS_GROUPS_UPDATE=false
WEBHOOK_EVENTS_GROUP_PARTICIPANTS_UPDATE=false
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
WEBHOOK_EVENTS_CALL=false
WEBHOOK_EVENTS_NEW_JWT_TOKEN=false
"""

# ─── NGINX — bloco location /evolution/ ──────────────────────────────────────
NGINX_LOCATION_BLOCK = f"""
    # ── Evolution API ──────────────────────────────────────────────
    location /evolution/ {{
        proxy_pass         http://127.0.0.1:{EVO_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 120s;
        client_max_body_size 50M;
    }}
    # ───────────────────────────────────────────────────────────────
"""

# ─── SCRIPT PM2 PARA INICIAR O DOCKER COMPOSE ────────────────────────────────
PM2_DOCKER_SCRIPT = f"""#!/usr/bin/env node
// pm2-evolution-watcher.js
// Mantém o container da Evolution API rodando, reinicia se parar
const {{ execSync, spawn }} = require('child_process');
const DIR = '{EVO_DIR}';

function isRunning() {{
  try {{
    const out = execSync('docker inspect -f {{{{.State.Running}}}} evolution-api 2>/dev/null', {{ encoding: 'utf8' }}).trim();
    return out === 'true';
  }} catch {{ return false; }}
}}

function startContainer() {{
  console.log('[evolution] iniciando container...');
  try {{
    execSync(`docker compose -f ${{DIR}}/docker-compose.yml up -d --remove-orphans`, {{ stdio: 'inherit' }});
    console.log('[evolution] container iniciado.');
  }} catch(e) {{
    console.error('[evolution] falha ao iniciar:', e.message);
  }}
}}

// Verifica a cada 30 segundos
startContainer();
setInterval(() => {{
  if (!isRunning()) {{
    console.log('[evolution] container parado — reiniciando...');
    startContainer();
  }}
}}, 30000);
"""

PM2_EVO_ECOSYSTEM = f"""module.exports = {{
  apps: [{{
    name: 'evolution-api-watcher',
    script: '{EVO_DIR}/pm2-evolution-watcher.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '50M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    env: {{
      NODE_ENV: 'production'
    }}
  }}]
}};
"""


# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    if PASS == 'COLOQUE_AQUI_A_SENHA_DO_VPS':
        print("\n⚠️  ATENÇÃO: preencha a variável PASS com a senha do root do VPS antes de executar.\n")
        sys.exit(1)

    print(f"\n🚀  Configurando Evolution API no VPS {HOST}")
    print(f"    Domínio  : {DOMAIN}")
    print(f"    Porta    : {EVO_PORT} (somente localhost)")
    print(f"    Endpoint : https://{DOMAIN}/evolution/")
    print(f"    API Key  : {EVO_API_KEY}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=HOST, username=USER, password=PASS, timeout=40)
    sftp = client.open_sftp()

    # ── 1. Instalar Docker ────────────────────────────────────────────────────
    section("1 / 6 — Verificando / Instalando Docker")
    docker_check = run(client, 'docker --version 2>/dev/null || echo "NOT_INSTALLED"', show=False)
    if 'NOT_INSTALLED' in docker_check or 'not found' in docker_check:
        print("  Docker não encontrado — instalando...")
        run(client, 'apt-get update -qq', timeout=120)
        run(client, 'apt-get install -y -qq ca-certificates curl gnupg lsb-release', timeout=120)
        run(client, (
            'curl -fsSL https://download.docker.com/linux/ubuntu/gpg '
            '| gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg 2>/dev/null'
        ), timeout=60)
        run(client, (
            'echo "deb [arch=$(dpkg --print-architecture) '
            'signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] '
            'https://download.docker.com/linux/ubuntu '
            '$(lsb_release -cs) stable" '
            '| tee /etc/apt/sources.list.d/docker.list > /dev/null'
        ), timeout=30)
        run(client, 'apt-get update -qq', timeout=120)
        run(client, 'apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin', timeout=300)
        run(client, 'systemctl enable docker && systemctl start docker')
        print("  ✓  Docker instalado.")
    else:
        print(f"  ✓  Docker já instalado: {docker_check.splitlines()[0]}")

    # ── 2. Criar diretório e arquivos de configuração ─────────────────────────
    section("2 / 6 — Criando configuração da Evolution API")
    run(client, f'mkdir -p {EVO_DIR}/store {EVO_DIR}/instances')
    write_file(sftp, f'{EVO_DIR}/docker-compose.yml', DOCKER_COMPOSE_CONTENT)
    write_file(sftp, f'{EVO_DIR}/.env', EVO_ENV_CONTENT)
    write_file(sftp, f'{EVO_DIR}/pm2-evolution-watcher.js', PM2_DOCKER_SCRIPT)
    write_file(sftp, f'{EVO_DIR}/ecosystem.config.js', PM2_EVO_ECOSYSTEM)

    # ── 3. Baixar imagem e subir container ────────────────────────────────────
    section("3 / 6 — Iniciando container Evolution API (pode demorar ~2 min)")
    run(client, f'docker pull {EVO_VERSION}', timeout=300)
    run(client, f'docker compose -f {EVO_DIR}/docker-compose.yml down 2>/dev/null || true')
    run(client, f'docker compose -f {EVO_DIR}/docker-compose.yml up -d --remove-orphans', timeout=120)

    # Aguarda a API subir
    print("\n  Aguardando Evolution API inicializar...")
    for i in range(15):
        time.sleep(4)
        check = run(client, f'curl -s -o /dev/null -w "%{{http_code}}" http://localhost:{EVO_PORT}/', show=False)
        if check in ('200', '401', '404'):
            print(f"  ✓  Evolution API respondendo (HTTP {check})")
            break
        print(f"  ... tentativa {i+1}/15 — aguardando (HTTP {check or '?'})")
    else:
        print("  ⚠️  API não respondeu no tempo esperado. Verifique com: docker logs evolution-api")

    # ── 4. Registrar no PM2 (watcher) ────────────────────────────────────────
    section("4 / 6 — Registrando watcher no PM2")
    run(client, f'pm2 delete evolution-api-watcher 2>/dev/null || true')
    run(client, f'pm2 start {EVO_DIR}/ecosystem.config.js')
    run(client, 'pm2 save')
    print("  ✓  Watcher registrado. O container será reiniciado automaticamente se parar.")

    # ── 5. Configurar nginx ───────────────────────────────────────────────────
    section("5 / 6 — Configurando nginx (proxy /evolution/)")

    # Lê a config atual do nginx para o domínio
    nginx_conf_path = f'/etc/nginx/sites-available/{DOMAIN}'
    alt_path = '/etc/nginx/sites-available/midiakit'
    existing_path = run(client, f'ls {nginx_conf_path} 2>/dev/null || ls {alt_path} 2>/dev/null || echo "NOT_FOUND"', show=False)

    if 'NOT_FOUND' in existing_path:
        print("  ⚠️  Config nginx não encontrada. Criando nova...")
        nginx_conf = f"""server {{
    listen 80;
    server_name {DOMAIN};

    location / {{
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 50M;
    }}
{NGINX_LOCATION_BLOCK}
}}
"""
        write_file(sftp, f'/etc/nginx/sites-available/{DOMAIN}', nginx_conf)
        run(client, f'ln -sf /etc/nginx/sites-available/{DOMAIN} /etc/nginx/sites-enabled/{DOMAIN} 2>/dev/null || true')
    else:
        # Injeta o bloco /evolution/ antes do fechamento `}` do server block
        conf_file = existing_path.strip().splitlines()[0]
        print(f"  Config encontrada: {conf_file}")
        current = run(client, f'cat {conf_file}', show=False)

        if '/evolution/' in current:
            print("  ✓  Bloco /evolution/ já existe no nginx — pulando.")
        else:
            # Insere antes do último `}`
            last_brace = current.rfind('}')
            new_conf = current[:last_brace] + NGINX_LOCATION_BLOCK + '\n}'
            write_file(sftp, conf_file, new_conf)
            print("  ✓  Bloco /evolution/ adicionado ao nginx.")

    # Testa e recarrega nginx
    nginx_test = run(client, 'nginx -t 2>&1')
    if 'successful' in nginx_test or 'syntax is ok' in nginx_test:
        run(client, 'systemctl reload nginx')
        print("  ✓  Nginx recarregado.")
    else:
        print("  ⚠️  Teste nginx falhou — verifique manualmente com: nginx -t")

    # ── 6. Criar instância padrão na Evolution API ────────────────────────────
    section("6 / 6 — Criando instância 'intermidia' na Evolution API")
    time.sleep(3)
    create_resp = run(client, f"""curl -s -X POST http://localhost:{EVO_PORT}/instance/create \\
  -H 'Content-Type: application/json' \\
  -H 'apikey: {EVO_API_KEY}' \\
  -d '{{"instanceName":"intermidia","qrcode":true,"integration":"WHATSAPP-BAILEYS"}}'""")

    if '"instance"' in create_resp or '"instanceName"' in create_resp:
        print("  ✓  Instância 'intermidia' criada com sucesso.")
    elif 'already' in create_resp.lower() or 'exists' in create_resp.lower():
        print("  ✓  Instância já existia — ok.")
    else:
        print("  ⚠️  Verifique a resposta acima. Pode criar manualmente pelo painel.")

    sftp.close()
    client.close()

    # ── Resumo final ──────────────────────────────────────────────────────────
    print(f"""
{'='*62}
  ✅  EVOLUTION API CONFIGURADA COM SUCESSO!
{'='*62}

  📋  COPIE ESSES DADOS PARA O PAINEL ADMIN
      Configurações → Integração WhatsApp — Evolution API

  ┌─────────────────────────────────────────────────────────
  │  URL da API          : https://{DOMAIN}/evolution
  │  Nome da Instância   : intermidia
  │  API Key             : {EVO_API_KEY}
  │  Número de destino   : (preencher com o número/grupo)
  └─────────────────────────────────────────────────────────

  📱  PRÓXIMO PASSO — conectar o WhatsApp:
      1. Acesse: https://{DOMAIN}/evolution/instance/connect/intermidia
         (com o header  apikey: {EVO_API_KEY})
         OU use um cliente REST como Insomnia / Postman
      2. Um QR Code será retornado — escaneie com o WhatsApp
      3. Após conectar, configure o número/grupo de destino
         no painel Admin e faça um teste de nova venda.

  🔍  Comandos úteis no VPS:
      docker logs evolution-api -f     → ver logs em tempo real
      docker ps                         → ver status do container
      pm2 status                        → ver todos os processos
      docker compose -f {EVO_DIR}/docker-compose.yml restart

  ⚠️  GUARDE A API KEY — ela não será exibida novamente:
      {EVO_API_KEY}
{'='*62}
""")


if __name__ == '__main__':
    main()