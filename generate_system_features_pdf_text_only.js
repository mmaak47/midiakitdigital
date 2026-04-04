const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'frontend', 'public');
const OUTPUT_DIR = path.join(ROOT, 'docs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'Sistema_Intermidia_Funcionalidades_Descricao.pdf');
const ENDPOINT = process.env.PDF_ENDPOINT || 'http://localhost:3002/api/pdf/render';

function readAsDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'application/octet-stream';
  const buffer = fs.readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function main() {
  const logo = readAsDataUrl(path.join(PUBLIC_DIR, 'logo-light.png'));

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Funcionalides do Sistema Comercial - Descrição</title>
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

.title { margin: 0; font-size: 42px; line-height: 1.06; letter-spacing: -0.02em; color: #111827; }
.sub { margin: 8px 0 0; color: #64748b; font-size: 17px; }

.cards { margin-top: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.card { border-radius: 16px; border: 1px solid #d7dee8; background: rgba(255,255,255,0.92); padding: 14px; }
.card h3 { margin: 0; color: #ea580c; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.card p { margin: 8px 0 0; color: #1f2937; font-size: 15px; line-height: 1.35; }

.panel-grid { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.panel { border-radius: 18px; border: 1px solid #d7dee8; background: rgba(255,255,255,0.93); padding: 16px; }
.panel h2 { margin: 0; font-size: 28px; line-height: 1.06; letter-spacing: -0.02em; color: #111827; }
.panel ul { margin: 10px 0 0; padding-left: 18px; color: #334155; font-size: 16px; line-height: 1.38; }

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
      <span class="chip">Versão sem imagens</span>
    </div>

    <h1 class="h1">Funcionalides do Sistema Comercial</h1>
    <p class="lead">Versão textual consolidada com descrição completa dos módulos e capacidades da plataforma Intermidia.</p>

    <div class="cards">
      <div class="card"><h3>Landing Comercial</h3><p>Seleção de praça e formato, visão consolidada de inventário e indicadores para abertura de planejamento.</p></div>
      <div class="card"><h3>Explorador de Pontos</h3><p>Navegação detalhada por ponto, filtros avançados, mapa interativo e leitura comercial por localização.</p></div>
      <div class="card"><h3>Apresentação em Slides</h3><p>Modo de apresentação para reuniões, com narrativa por formato, fotos e dados comerciais por ponto.</p></div>
      <div class="card"><h3>Geração de Simulações</h3><p>Composição visual e analítica para validar aderência do ponto e apoiar argumentação comercial.</p></div>
      <div class="card"><h3>Proposta Comercial em PDF</h3><p>Geração de proposta em documento com consolidado de investimento, fluxo e composição da seleção.</p></div>
      <div class="card"><h3>PDF Técnico por Pontos</h3><p>Export técnico com resolução, proporção, mídias aceitas e regras de entrega por formato.</p></div>
      <div class="card"><h3>Análise de Entorno</h3><p>Processamento de contexto territorial com jobs assíncronos e monitoramento para inteligência de ponto.</p></div>
      <div class="card"><h3>Cadastro de Usuário</h3><p>Gestão de usuários administrativos com controle de acesso e manutenção de perfis internos.</p></div>
      <div class="card"><h3>Gestão Operacional</h3><p>Configurações administrativas, cache de PDF, backups automáticos e monitoramento de operação.</p></div>
    </div>
  </div>
</section>

<section class="bg">
  <div class="pad">
    <h2 class="title">Fluxo Comercial e Inteligência de Decisão</h2>
    <p class="sub">Do primeiro filtro até a geração de proposta, com visão estratégica e técnica integrada.</p>

    <div class="panel-grid">
      <div class="panel">
        <h2>Etapa 1: Descoberta e seleção</h2>
        <ul>
          <li>Landing com filtros por praça e formato.</li>
          <li>Indicadores de pontos, telas, fluxo e inserções.</li>
          <li>Leitura por formato e acesso rápido ao inventário.</li>
          <li>Mapa interativo para validar distribuição territorial.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Etapa 2: Exploração profunda</h2>
        <ul>
          <li>Explorador de pontos com filtros avançados.</li>
          <li>Detalhamento de endereço, público e métricas.</li>
          <li>Apresentação em slides para defesa comercial.</li>
          <li>Geração de simulações para apoio de venda.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Etapa 3: Proposta e documentos</h2>
        <ul>
          <li>Proposta comercial em PDF por seleção.</li>
          <li>PDF técnico por pontos com requisitos de arte.</li>
          <li>Consolidado de investimento e fluxo da campanha.</li>
          <li>Entrega em formato pronto para apresentação ao cliente.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Etapa 4: Governança operacional</h2>
        <ul>
          <li>Administração de pontos, fotos e dados técnicos.</li>
          <li>Cadastro de usuários e controle de acessos.</li>
          <li>Análise de entorno com jobs e histórico.</li>
          <li>Cache de PDFs, backup SQLite, logs e estabilidade em produção.</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="bg">
  <div class="pad">
    <h2 class="title">Cobertura Funcional Completa (Checklist)</h2>
    <p class="sub">Resumo objetivo das capacidades implementadas no sistema comercial.</p>

    <div class="panel-grid">
      <div class="panel">
        <h2>Módulos de Interface</h2>
        <ul>
          <li>Landing comercial.</li>
          <li>Explorador de pontos.</li>
          <li>Mapa interativo dark/light.</li>
          <li>Modo apresentação em slides.</li>
          <li>Catálogo da seleção.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Módulos de Conteúdo</h2>
        <ul>
          <li>Cadastro e edição de pontos.</li>
          <li>Upload e gestão de imagens.</li>
          <li>Campos técnicos (resolução/dimensões).</li>
          <li>Cadastro de usuários administrativos.</li>
          <li>Parâmetros comerciais e operacionais.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Módulos Analíticos</h2>
        <ul>
          <li>Análise de entorno por job assíncrono.</li>
          <li>Leitura de público e fluxo por ponto.</li>
          <li>Simulação para apoio de proposta.</li>
          <li>Sugestão de mix e planejamento estratégico.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>Módulos de Documento e Infra</h2>
        <ul>
          <li>Geração de proposta comercial em PDF.</li>
          <li>Geração de PDF técnico por pontos.</li>
          <li>Cache de PDF e bypass para personalizados.</li>
          <li>Autenticação, backup, logs e operação contínua.</li>
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
    fileName: 'Funcionalides do Sistema Comercial - Descricao.pdf',
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
