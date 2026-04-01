const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PRINTS_DIR = path.join(ROOT, 'frontend', 'public', 'prints');
const PUBLIC_DIR = path.join(ROOT, 'frontend', 'public');
const OUTPUT_DIR = path.join(ROOT, 'docs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'Sistema_Intermidia_Funcionalidades_Light.pdf');
const ENDPOINT = 'http://REDACTED_OLD_VPS_IP/api/pdf/render';

function readAsDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png'
    ? 'image/png'
    : (ext === '.jpg' || ext === '.jpeg')
      ? 'image/jpeg'
      : 'application/octet-stream';
  const buffer = fs.readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function getPrint(fileName) {
  return readAsDataUrl(path.join(PRINTS_DIR, fileName));
}

async function main() {
  const logo = readAsDataUrl(path.join(PUBLIC_DIR, 'logo-light.png'));

  const prints = {
    landing: getPrint('landing page.png'),
    landingMap: getPrint('lading page map.png'),
    landingSlides: getPrint('landing page slide show.png'),
    landingMidiaKit: getPrint('landing page midia kit.png'),
    explorar: getPrint('explorar.png'),
    comercialExplorar: getPrint('comercial explorar.png'),
    slideProposta: getPrint('slide proposta comercial.png'),
    adminPontos: getPrint('admin pontos.png'),
    adminConfig: getPrint('admin config.png'),
    adminUser: getPrint('admin new user.png'),
    adminEntorno: getPrint('admin entorno.png'),
    adminPdfTecnicoCache: getPrint('admin pdf tecnico and cache.png'),
    simulacao: getPrint('proposta comercial simulaçao.png'),
    propostaGerada: getPrint('proposta gerada.png'),
  };

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Funcionalides do Sistema Comercial</title>
<style>
* { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body { margin: 0; padding: 0; font-family: 'Poppins', 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #111827; }
@page { size: 1366px 900px; margin: 0; }
section { width: 1366px; height: 900px; position: relative; page-break-after: always; overflow: hidden; }
section:last-child { page-break-after: avoid; }

.bg {
  background:
    radial-gradient(circle at 0% 0%, rgba(232,89,26,0.18), transparent 38%),
    radial-gradient(circle at 100% 100%, rgba(15,23,42,0.08), transparent 42%),
    linear-gradient(135deg, #f8fafc, #eef2f7);
}

.pad { padding: 50px 64px; }
.top { display: flex; align-items: center; justify-content: space-between; }
.brand { display: inline-flex; align-items: center; gap: 10px; }
.brand .div { width: 1px; height: 18px; background: #cbd5e1; }
.brand .txt { color: #e8591a; font-size: 19px; font-weight: 700; letter-spacing: .01em; }
.chip { border: 1px solid #fed7aa; color: #9a3412; background: #fff7ed; border-radius: 999px; padding: 8px 14px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }

.h1 { margin: 20px 0 0; font-size: 62px; line-height: .96; letter-spacing: -0.03em; font-weight: 800; color: #0f172a; max-width: 980px; }
.lead { margin: 14px 0 0; font-size: 22px; line-height: 1.32; color: #334155; max-width: 1020px; }

.cards { margin-top: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.card { border-radius: 16px; border: 1px solid #d7dee8; background: rgba(255,255,255,0.92); padding: 14px; }
.card h3 { margin: 0; color: #ea580c; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.card p { margin: 8px 0 0; color: #1f2937; font-size: 15px; line-height: 1.35; }

.title { margin: 0; font-size: 42px; line-height: 1.06; letter-spacing: -0.02em; color: #111827; }
.sub { margin: 8px 0 0; color: #64748b; font-size: 17px; }

.grid2 { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.grid3 { margin-top: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.split { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.shot { border-radius: 18px; border: 1px solid #d7dee8; background: #0f172a; overflow: hidden; padding: 8px; display:flex; align-items:center; justify-content:center; }
.shot img { width: 100%; height: 100%; object-fit: contain; object-position: center top; display: block; background: #0f172a; }
.cap { margin-top: 6px; font-size: 12px; color: #64748b; }

.panel { border-radius: 18px; border: 1px solid #d7dee8; background: rgba(255,255,255,0.93); padding: 16px; }
.panel h2 { margin: 0; font-size: 30px; line-height: 1.05; letter-spacing: -0.02em; color: #111827; }
.panel ul { margin: 10px 0 0; padding-left: 18px; color: #334155; font-size: 16px; line-height: 1.38; }

.feature-grid { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
.feature h3 { margin: 0 0 6px 0; color: #ea580c; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.feature ul { margin: 0; padding-left: 18px; color: #334155; font-size: 14px; line-height: 1.35; }

.dev { margin-top: 18px; text-align: center; color: #475569; font-size: 16px; letter-spacing: .02em; }
.dev strong { color: #c2410c; }
</style>
</head>
<body>

<section class="bg">
  <div class="pad">
    <div class="top">
      <div class="brand">
        <img src="${logo}" alt="Intermidia" style="height:34px; width:auto;" />
        <span class="div"></span>
        <span class="txt">Comercial</span>
      </div>
      <span class="chip">Mapa Completo de Funcionalidades</span>
    </div>

    <h1 class="h1">Funcionalides do Sistema Comercial</h1>
    <p class="lead">Cobertura completa do sistema: landing, explorador, geração de simulações, proposta comercial em PDF, análise de entorno, cadastro de usuário, gestão de pontos, PDF técnico, cache e operação de produção.</p>

    <div class="cards">
      <div class="card"><h3>Landing e Inventário</h3><p>Entrada comercial com indicadores, seleção de praça e atalhos de fluxo.</p></div>
      <div class="card"><h3>Explorar Pontos</h3><p>Pesquisa por ponto, mapa, fotos, métricas e leitura de viabilidade.</p></div>
      <div class="card"><h3>Apresentação em Slides</h3><p>Modo visual para reunião comercial com narrativa por formato.</p></div>
      <div class="card"><h3>Geração de Simulações</h3><p>Simulação visual e comercial para apoiar decisão da proposta.</p></div>
      <div class="card"><h3>Proposta em PDF</h3><p>Geração de proposta comercial estruturada em documento.</p></div>
      <div class="card"><h3>Análise de Entorno</h3><p>Processamento de contexto territorial e inteligência de ponto.</p></div>
      <div class="card"><h3>Cadastro de Usuário</h3><p>Criação e gestão de acesso dos perfis internos.</p></div>
      <div class="card"><h3>PDF Técnico e Cache</h3><p>Export técnico por ponto com regras de arte e controle de cache.</p></div>
      <div class="card"><h3>Operação e Infra</h3><p>Auth, logs, backup e disponibilidade contínua em produção.</p></div>
    </div>
  </div>
</section>

<section class="bg">
  <div class="pad">
    <h2 class="title">Módulo 1: Landing Comercial</h2>
    <p class="sub">Visão inicial do inventário, filtros comerciais e gatilhos de ação.</p>

    <div class="grid2">
      <div>
        <div class="shot" style="height:312px;"><img src="${prints.landing}" alt="Landing page" /></div>
        <div class="cap">Landing principal</div>
      </div>
      <div>
        <div class="shot" style="height:312px;"><img src="${prints.landingMap}" alt="Landing map" /></div>
        <div class="cap">Mapa e visão territorial</div>
      </div>
    </div>

    <div class="split">
      <div class="panel">
        <h2>Funcionalidades-chave</h2>
        <ul>
          <li>Seleção por praça e formato.</li>
          <li>Métricas consolidadas de pontos/telas/fluxo.</li>
          <li>Acesso ao mapa e à apresentação em slides.</li>
          <li>Geração de mídia kit por seleção.</li>
          <li>Atalho para exploração completa do inventário.</li>
        </ul>
      </div>
      <div>
        <div class="shot" style="height:236px;"><img src="${prints.landingSlides}" alt="Slides from landing" /></div>
        <div class="cap">Abertura de apresentação em slides</div>
        <div class="shot" style="height:174px; margin-top:10px;"><img src="${prints.landingMidiaKit}" alt="Midia kit from landing" /></div>
        <div class="cap">Acesso ao fluxo de mídia kit e proposta</div>
      </div>
    </div>
  </div>
</section>

<section class="bg">
  <div class="pad">
    <h2 class="title">Módulo 2: Explorar + Slides + Simulação</h2>
    <p class="sub">Núcleo comercial para análise de ponto, narrativa de venda e simulação.</p>

    <div class="grid3">
      <div>
        <div class="shot" style="height:250px;"><img src="${prints.explorar}" alt="Explorer" /></div>
        <div class="cap">Explorar pontos</div>
      </div>
      <div>
        <div class="shot" style="height:250px;"><img src="${prints.comercialExplorar}" alt="Comercial explorar" /></div>
        <div class="cap">Visão comercial do explorador</div>
      </div>
      <div>
        <div class="shot" style="height:250px;"><img src="${prints.slideProposta}" alt="Slide proposta" /></div>
        <div class="cap">Apresentação em slides</div>
      </div>
    </div>

    <div class="split">
      <div class="panel">
        <h2>Geração de simulações</h2>
        <ul>
          <li>Visual de apoio para validar ativação no ponto.</li>
          <li>Leitura comercial integrada ao contexto do inventário.</li>
          <li>Base para construção da proposta e argumentação.</li>
        </ul>
        <div class="shot" style="height:238px; margin-top:10px;"><img src="${prints.simulacao}" alt="Simulacao" /></div>
      </div>
      <div class="panel">
        <h2>Proposta comercial em PDF</h2>
        <ul>
          <li>Documento de proposta com dados de seleção.</li>
          <li>Consolidação de preço, fluxo e estrutura comercial.</li>
          <li>Output pronto para envio e apresentação ao cliente.</li>
        </ul>
        <div class="shot" style="height:238px; margin-top:10px;"><img src="${prints.propostaGerada}" alt="Proposta gerada" /></div>
      </div>
    </div>
  </div>
</section>

<section class="bg">
  <div class="pad">
    <h2 class="title">Módulo 3: Administração Completa</h2>
    <p class="sub">Gestão operacional centralizada com cadastro, entorno, PDF técnico e governança.</p>

    <div class="grid3">
      <div>
        <div class="shot" style="height:230px;"><img src="${prints.adminPontos}" alt="Admin pontos" /></div>
        <div class="cap">Cadastro e gestão de pontos</div>
      </div>
      <div>
        <div class="shot" style="height:230px;"><img src="${prints.adminUser}" alt="Admin users" /></div>
        <div class="cap">Cadastro de usuário</div>
      </div>
      <div>
        <div class="shot" style="height:230px;"><img src="${prints.adminConfig}" alt="Admin config" /></div>
        <div class="cap">Configurações administrativas</div>
      </div>
    </div>

    <div class="split">
      <div class="panel">
        <h2>Análise de Entorno</h2>
        <ul>
          <li>Painel para execução de análises territoriais.</li>
          <li>Controle de jobs e acompanhamento de processamento.</li>
          <li>Apoio à decisão com contexto geográfico/comercial.</li>
        </ul>
        <div class="shot" style="height:214px; margin-top:10px;"><img src="${prints.adminEntorno}" alt="Admin entorno" /></div>
      </div>
      <div class="panel">
        <h2>PDF Técnico + Cache</h2>
        <ul>
          <li>Geração de PDF técnico por pontos selecionados.</li>
          <li>Regras de arte, proporção e dados técnicos.</li>
          <li>Painel de cache de PDFs para operação e performance.</li>
        </ul>
        <div class="shot" style="height:214px; margin-top:10px;"><img src="${prints.adminPdfTecnicoCache}" alt="Admin pdf tecnico e cache" /></div>
      </div>
    </div>

    <div class="feature-grid">
      <div class="feature">
        <h3>Segurança e Acesso</h3>
        <ul>
          <li>Login administrativo por credenciais.</li>
          <li>Rotas protegidas por token.</li>
          <li>Perfis de uso interno.</li>
        </ul>
      </div>
      <div class="feature">
        <h3>Confiabilidade Operacional</h3>
        <ul>
          <li>Render de PDF otimizado e estável.</li>
          <li>Controle de cache e logs.</li>
          <li>Backup automático e execução contínua.</li>
        </ul>
      </div>
    </div>

    <div class="dev">desenvolvido por <strong>Maitê Doin</strong></div>
  </div>
</section>

</body>
</html>`;

  const payload = {
    html,
    fileName: 'Funcionalides do Sistema Comercial - Light.pdf',
    noCache: true,
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    throw new Error(`Falha ao renderizar PDF: ${response.status} ${txt}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, buffer);

  console.log('PDF gerado com sucesso:');
  console.log(OUTPUT_FILE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
