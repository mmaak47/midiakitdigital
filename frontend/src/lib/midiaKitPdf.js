import { jsPDF } from 'jspdf';

const PAGE_WIDTH = 1600;
const PAGE_HEIGHT = 1131;
const BRAND_ORANGE = '#FE5C2B';
const BRAND_DARK = '#0A0A0A';
const BRAND_PANEL = '#171717';
const BRAND_BORDER = 'rgba(255,255,255,0.08)';
const imageCache = new Map();
const IMAGE_FETCH_TIMEOUT_MS = 15000;
const IMAGE_RENDER_WAIT_TIMEOUT_MS = 8000;

function formatInt(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatDecimalMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function slugify(value) {
  return (value || 'praca')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pickImageUrl(ponto) {
  if (Array.isArray(ponto?.imagens) && ponto.imagens.length > 0) {
    const first = ponto.imagens[0];
    if (typeof first === 'string') return first;
    if (first?.url) return first.url;
  }
  return ponto?.imagem || '';
}

function pickProposalImageUrl(ponto) {
  return ponto?.proposalSimulationPreview || ponto?.simulacao_preview || pickImageUrl(ponto);
}

function buildResumo(pontos) {
  const totals = pontos.reduce((acc, p) => {
    acc.telas += Number(p.telas) || 0;
    acc.fluxo += Number(p.fluxo) || 0;
    acc.preco += Number(p.preco) || 0;
    return acc;
  }, { telas: 0, fluxo: 0, preco: 0 });

  const ticketMedio = pontos.length ? Math.round(totals.preco / pontos.length) : 0;
  return { ...totals, ticketMedio };
}

function normalizeLines(input, limit = 6) {
  const values = Array.isArray(input)
    ? input
    : String(input || '')
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?])\s+/));

  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function assetUrl(path) {
  return new URL(path, window.location.origin).toString();
}

async function imageToDataUrl(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();

  imageCache.set(url, promise);
  return promise;
}

function createStage() {
  const stage = document.createElement('div');
  Object.assign(stage.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: `${PAGE_WIDTH}px`,
    zIndex: '-1',
    pointerEvents: 'none'
  });
  document.body.appendChild(stage);
  return stage;
}

function createPage(content, background = '#050505') {
  const page = document.createElement('section');
  Object.assign(page.style, {
    width: `${PAGE_WIDTH}px`,
    height: `${PAGE_HEIGHT}px`,
    position: 'relative',
    overflow: 'hidden',
    background,
    color: '#ffffff',
    fontFamily: 'Montserrat, system-ui, sans-serif',
    boxSizing: 'border-box'
  });
  page.innerHTML = content;
  return page;
}

async function waitForImages(node) {
  const images = Array.from(node.querySelectorAll('img'));
  await Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(done, IMAGE_RENDER_WAIT_TIMEOUT_MS);
      img.onload = done;
      img.onerror = done;
      img.decode?.().then(done).catch(done);
    });
  }));
}

async function renderPagesToPdf(pages, fileName) {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const { default: html2canvas } = await import('html2canvas');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const stage = createStage();

  try {
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      stage.appendChild(page);
      await waitForImages(page);

      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#050505',
        logging: false,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        windowWidth: PAGE_WIDTH,
        windowHeight: PAGE_HEIGHT
      });

      if (index > 0) {
        doc.addPage('a4', 'landscape');
      }

      const image = canvas.toDataURL('image/jpeg', 0.92);
      doc.addImage(image, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
      stage.removeChild(page);
    }
  } finally {
    stage.remove();
  }

  doc.save(fileName);
}

function buildMetricCards(cards, options = {}) {
  const columns = options.columns || cards.length;
  return `
    <div style="display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:${options.gap || 18}px;">
      ${cards.map((card) => `
        <div style="border:1px solid ${options.borderColor || BRAND_BORDER};background:${options.background || 'rgba(255,255,255,0.06)'};border-radius:${options.radius || 26}px;padding:${options.padding || '24px 26px'};backdrop-filter:blur(10px);min-height:${options.minHeight || 0}px;box-sizing:border-box;">
          <div style="display:flex;align-items:center;gap:12px;color:${options.labelColor || 'rgba(255,255,255,0.72)'};font-size:${options.labelSize || 16}px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:${options.iconSize || 34}px;height:${options.iconSize || 34}px;border-radius:999px;background:rgba(254,92,43,0.18);color:${BRAND_ORANGE};font-weight:700;">${escapeHtml(card.icon || '•')}</span>
            <span>${escapeHtml(card.label)}</span>
          </div>
          <div style="margin-top:18px;font-family:Poppins, system-ui, sans-serif;font-size:${options.valueSize || 36}px;line-height:1.05;font-weight:700;color:${options.valueColor || '#ffffff'};letter-spacing:-0.03em;word-break:break-word;">${escapeHtml(card.value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildHeroImageFrame(image, options = {}) {
  if (!image) {
    return `
      <div style="height:100%;border-radius:${options.radius || 30}px;border:1px solid ${BRAND_BORDER};background:linear-gradient(135deg,#121212,#1B1B1B);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.62);font-size:28px;font-weight:600;">
        Imagem indisponível
      </div>
    `;
  }

  return `
    <div style="position:relative;height:100%;border-radius:${options.radius || 30}px;overflow:hidden;border:1px solid ${BRAND_BORDER};background:#050505;">
      <img src="${image}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(26px) saturate(1.1);transform:scale(1.08);opacity:0.45;" />
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,7,7,0.12),rgba(7,7,7,0.62));"></div>
      <img src="${image}" alt="" style="position:absolute;inset:28px;width:calc(100% - 56px);height:calc(100% - 56px);object-fit:${options.fit || 'contain'};object-position:center;filter:drop-shadow(0 24px 44px rgba(0,0,0,0.45));" />
    </div>
  `;
}

function buildMidiaKitCoverPage({ cidade, pontos, resumo, assets }) {
  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <div style="position:absolute;inset:0;background:url('${assets.heroBg || assets.cityBg || ''}') center/cover no-repeat;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:47%;background:#000;"></div>
    <div style="position:absolute;left:47%;top:0;width:0;height:0;border-top:${PAGE_HEIGHT}px solid rgba(0,0,0,0.98);border-left:220px solid transparent;"></div>

    <div style="position:absolute;left:72px;top:88px;width:360px;">
      <img src="${assets.logo || ''}" alt="" style="width:180px;height:auto;object-fit:contain;" />
    </div>

    <div style="position:absolute;left:72px;bottom:120px;width:420px;">
      <div style="font-family:Poppins, system-ui, sans-serif;color:#fff;font-size:58px;line-height:0.95;font-weight:700;letter-spacing:-0.04em;">Elevando o branding</div>
      <div style="margin-top:20px;color:rgba(255,255,255,0.8);font-size:34px;line-height:1.22;">Invista no futuro da publicidade OOH e DOOH</div>
      <div style="margin-top:26px;display:inline-flex;align-items:center;padding:10px 16px;background:#fff;color:#000;font-size:18px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Out of Home</div>
    </div>

    <div style="position:absolute;right:70px;bottom:90px;text-align:left;">
      <div style="font-family:Poppins, system-ui, sans-serif;color:#fff;font-size:64px;line-height:0.95;font-weight:700;text-transform:uppercase;">${escapeHtml(cidade)}</div>
      <div style="margin-top:10px;color:#fff;font-size:16px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.82;">Londrina, Maringá e Balneário Camboriú</div>
      <div style="margin-top:20px;color:${BRAND_ORANGE};font-size:30px;font-weight:700;letter-spacing:0.03em;">MIDIAKIT 2026</div>
      <div style="margin-top:10px;color:rgba(255,255,255,0.86);font-size:20px;">${formatInt(pontos.length)} pontos • ${formatInt(resumo.telas)} telas • fluxo ${formatInt(resumo.fluxo)}/mês</div>
    </div>
  `, '#030303');
}

function buildMidiaKitManifestoPage({ assets }) {
  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:44%;overflow:hidden;">
      <img src="${assets.about1 || assets.about2 || ''}" alt="" style="width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.05);" />
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0.15) 55%,rgba(0,0,0,0.0) 100%);"></div>
    </div>
    <div style="position:absolute;left:44%;top:0;width:0;height:0;border-top:${PAGE_HEIGHT}px solid rgba(0,0,0,0.94);border-left:120px solid transparent;"></div>

    <div style="position:absolute;left:760px;right:82px;top:88px;">
      <img src="${assets.logo || ''}" alt="" style="height:70px;width:auto;object-fit:contain;" />
      <div style="margin-top:26px;font-size:34px;line-height:1.34;color:#fff;max-width:760px;">
        Na Intermidia, não apenas defendemos a mídia OOH e DOOH. Nós vivemos a transformação que ela representa.
      </div>
      <div style="margin-top:24px;width:230px;height:6px;background:${BRAND_ORANGE};"></div>
    </div>

    <div style="position:absolute;left:760px;right:82px;top:290px;display:grid;grid-template-columns:1fr 1fr;gap:54px;">
      <div style="font-size:45px;line-height:1.35;color:#fff;">
        <strong style="font-weight:700;">A Intermidia é especialista em comunicação Out of Home e Digital Out of Home desde 2007.</strong>
        <br/><br/>
        Somos apaixonados pelo impacto que a mídia OOH e DOOH pode gerar.
      </div>
      <div style="font-size:45px;line-height:1.35;color:#fff;">
        Valorizamos a força da publicidade no ambiente urbano e acreditamos que cada ponto de contato é uma oportunidade para transformar marcas em referência.
        <br/><br/>
        Entregamos soluções que levam sua mensagem além do óbvio, alcançando as pessoas onde elas vivem, trabalham e se movem.
      </div>
    </div>
  `, '#000');
}

function buildMidiaKitSummaryPage({ cidade, pontos, assets }) {
  const byTipo = pontos.reduce((acc, p) => {
    const tipo = p.tipo || 'Sem tipo';
    if (!acc[tipo]) acc[tipo] = { pontos: 0, telas: 0, fluxo: 0, preco: 0 };
    acc[tipo].pontos += 1;
    acc[tipo].telas += Number(p.telas) || 0;
    acc[tipo].fluxo += Number(p.fluxo) || 0;
    acc[tipo].preco += Number(p.preco) || 0;
    return acc;
  }, {});

  const rows = Object.entries(byTipo)
    .map(([tipo, data]) => ({ tipo, ...data }))
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 3);

  const totalEnderecos = new Set(pontos.map((p) => `${p.cidade || ''}-${p.endereco || ''}`.trim())).size;
  const totalPontos = pontos.length;
  const lines = rows.map((row) => `${row.tipo.toLowerCase()} e ${formatInt(row.pontos)} pontos`).join(', ');

  const cards = [
    { label: 'endereços', value: formatInt(totalEnderecos) },
    { label: 'pontos de impacto', value: formatInt(totalPontos) }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:url('${assets.heroBg || assets.showcase || ''}') center/cover no-repeat;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:41%;background:#000;"></div>
    <div style="position:absolute;left:41%;top:0;width:0;height:0;border-top:${PAGE_HEIGHT}px solid rgba(0,0,0,0.98);border-left:180px solid transparent;"></div>

    <div style="position:absolute;left:82px;top:86px;padding:24px 34px;background:#000;border-radius:20px;min-width:310px;">
      <div style="font-family:Poppins, system-ui, sans-serif;font-size:64px;line-height:0.93;color:#fff;font-weight:700;text-transform:uppercase;">${escapeHtml(cidade)}</div>
      <div style="margin-top:8px;color:#fff;font-size:18px;letter-spacing:0.07em;text-transform:uppercase;opacity:0.78;">Paraná</div>
    </div>

    <div style="position:absolute;left:88px;top:340px;right:980px;border-left:2px solid rgba(255,255,255,0.5);padding-left:36px;">
      ${cards.map((card) => `
        <div style="margin-bottom:20px;">
          <span style="font-family:Poppins, system-ui, sans-serif;font-size:56px;font-weight:700;color:#fff;line-height:1;">${escapeHtml(card.value)}</span>
          <span style="margin-left:12px;font-size:42px;color:#fff;line-height:1.2;">${escapeHtml(card.label)}</span>
        </div>
      `).join('')}
      <div style="margin-top:26px;font-size:45px;line-height:1.4;color:#fff;max-width:460px;">
        em <strong>${escapeHtml(lines || 'formatos estratégicos')}</strong> com cobertura urbana premium.
      </div>
    </div>

    <div style="position:absolute;right:84px;top:86px;padding:20px;background:rgba(0,0,0,0.75);">
      <img src="${assets.logo || ''}" alt="" style="height:180px;width:auto;object-fit:contain;" />
    </div>
  `, '#050505');
}

function splitFormatTitle(tipo) {
  const words = String(tipo || 'FORMATO').toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [words[0] || 'FORMATO'];
  if (words.length === 2) return words;
  const first = words.slice(0, 2).join(' ');
  const second = words.slice(2).join(' ');
  return [first, second];
}

function buildMidiaKitFormatDividerPage({ tipo, cityStats, assets }) {
  const lines = splitFormatTitle(tipo);
  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <div style="position:absolute;left:120px;top:140px;">
      <img src="${assets.logo || ''}" alt="" style="height:220px;width:auto;object-fit:contain;" />
    </div>

    <div style="position:absolute;left:500px;bottom:130px;width:560px;border-left:2px solid rgba(255,255,255,0.62);border-bottom:2px solid rgba(255,255,255,0.62);height:360px;"></div>
    <div style="position:absolute;right:90px;top:200px;text-align:left;">
      ${lines.map((line) => `<div style="font-family:Poppins, system-ui, sans-serif;font-size:96px;line-height:0.9;font-weight:700;color:#fff;letter-spacing:-0.04em;">${escapeHtml(line)}</div>`).join('')}
    </div>

    <div style="position:absolute;right:190px;bottom:170px;text-align:right;color:#fff;">
      <div style="font-family:Poppins, system-ui, sans-serif;font-size:58px;font-weight:700;line-height:1;">${escapeHtml(formatInt(cityStats.totalTelas || 0))}</div>
      <div style="font-size:34px;line-height:1.15;opacity:0.92;">telas</div>
      <div style="margin-top:16px;font-family:Poppins, system-ui, sans-serif;font-size:58px;font-weight:700;line-height:1;">${escapeHtml(formatInt(cityStats.totalEnderecos || 0))}</div>
      <div style="font-size:34px;line-height:1.15;opacity:0.92;">endereços</div>
    </div>
  `, '#000');
}

function buildMidiaKitPointPage({ ponto, index, total, image, assets }) {
  const details = [
    { label: 'Público', value: ponto.publico || '-' },
    { label: 'Fluxo / mês', value: formatInt(ponto.fluxo) },
    { label: 'Telas', value: formatInt(ponto.telas) },
    { label: 'Inserções', value: formatInt(ponto.insercoes) },
    { label: 'Tempo', value: ponto.tempo || '-' },
    { label: 'Loop', value: ponto.loop || '-' },
    { label: 'Veiculação', value: ponto.veiculacao || '-' },
    { label: 'Horário', value: ponto.horario || '-' }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:#d9d9d9;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:40px;background:#0c0c0c;"></div>
    <div style="position:absolute;left:40px;top:0;bottom:0;right:670px;background:#e7e7e7;"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:670px;background:#1a1a1a;"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:670px;background:url('${image || assets.showcase || ''}') center/cover no-repeat;"></div>

    <div style="position:absolute;left:58px;top:42px;right:710px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:2px solid #161616;padding-bottom:12px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:46px;height:46px;border:2px solid #222;display:flex;align-items:center;justify-content:center;font-size:21px;">▥</div>
        <div style="font-family:Poppins, system-ui, sans-serif;font-size:56px;line-height:0.95;font-weight:700;letter-spacing:-0.04em;color:#000;">${escapeHtml((ponto.tipo || 'FORMATO').toUpperCase())}</div>
      </div>
      <div style="padding:8px 18px;border:2px solid #333;font-size:34px;line-height:1;color:#111;text-transform:uppercase;">${escapeHtml((ponto.publico || 'A/B').toUpperCase())}</div>
    </div>

    <div style="position:absolute;left:58px;top:122px;right:710px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;">
      <div style="font-family:Poppins, system-ui, sans-serif;font-size:68px;line-height:0.93;font-weight:700;color:#000;">${escapeHtml((ponto.nome || '').toUpperCase())}</div>
      <div style="font-size:26px;font-weight:700;color:#000;">${index}/${total}</div>
    </div>

    <div style="position:absolute;left:58px;top:206px;right:710px;font-size:28px;line-height:1.4;color:#111;">${escapeHtml(ponto.endereco || 'Endereço não informado')} ${escapeHtml(ponto.cidade ? `· ${ponto.cidade}` : '')}</div>

    <div style="position:absolute;left:58px;top:282px;right:710px;border-top:2px solid #1a1a1a;"></div>
    <div style="position:absolute;left:58px;top:300px;right:710px;display:grid;grid-template-columns:1fr 1fr;gap:20px 34px;">
      ${details.slice(0, 6).map((item) => `
        <div>
          <div style="font-size:19px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#222;">${escapeHtml(item.label)}</div>
          <div style="margin-top:6px;font-family:Poppins, system-ui, sans-serif;font-size:34px;line-height:1.2;font-weight:700;color:#000;word-break:break-word;">${escapeHtml(item.value)}</div>
        </div>
      `).join('')}
    </div>

    <div style="position:absolute;left:58px;bottom:150px;right:710px;border-top:2px solid #1a1a1a;"></div>
    <div style="position:absolute;left:58px;bottom:78px;right:710px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;">
      <div>
        <div style="font-size:20px;line-height:1.4;color:#111;">mínimo de ${escapeHtml(formatInt(ponto.insercoes || 0))} inserções/mês</div>
        <div style="font-size:20px;line-height:1.4;color:#111;">veiculação: ${escapeHtml((ponto.veiculacao || 'vídeo sem áudio').toLowerCase())}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:26px;color:#111;">Valor mensal:</div>
        <div style="font-family:Poppins, system-ui, sans-serif;font-size:56px;line-height:1;font-weight:700;color:#000;">${escapeHtml(formatMoney(ponto.preco))}</div>
      </div>
    </div>

    <div style="position:absolute;left:8px;top:16px;width:24px;height:24px;overflow:hidden;">
      <img src="${assets.logo || ''}" alt="" style="width:100%;height:100%;object-fit:contain;" />
    </div>

    <div style="position:absolute;right:20px;bottom:22px;padding:8px 12px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.22);">
      <img src="${assets.logo || ''}" alt="" style="height:20px;width:auto;object-fit:contain;" />
    </div>
  `, '#ECE7E0');
}

function buildProposalCoverPage({ proposalClient, proposalCity, proposalPoints, proposalTotals, highlights, simulationSummary, assets }) {
  const cards = [
    { icon: '◎', label: 'Pontos', value: formatInt(proposalPoints.length) },
    { icon: '↺', label: 'Fluxo total', value: formatInt(proposalTotals.fluxoTotal) },
    { icon: 'R$', label: 'Valor total', value: formatMoney(proposalTotals.valorTotal) },
    { icon: 'CP', label: 'CPM estimado', value: formatDecimalMoney(proposalTotals.cpmEstimado) }
  ];
  const strategicItems = highlights.length ? highlights : ['Argumentos estratégicos serão definidos na reunião comercial.'];

  return createPage(`
    <div style="position:absolute;inset:0;background:url('${assets.heroBg || assets.cityBg || ''}') center/cover no-repeat;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(105deg,rgba(0,0,0,0.93) 0%,rgba(0,0,0,0.84) 50%,rgba(0,0,0,0.7) 100%);"></div>
    <div style="position:absolute;inset:auto auto -180px -60px;width:560px;height:560px;border-radius:999px;background:radial-gradient(circle,rgba(254,92,43,0.28) 0%,rgba(254,92,43,0.06) 48%,rgba(254,92,43,0) 72%);"></div>
    <div style="position:relative;z-index:1;display:grid;grid-template-columns:1.04fr 0.96fr;height:100%;padding:70px 74px 62px;gap:30px;box-sizing:border-box;">
      <div style="display:flex;flex-direction:column;min-width:0;">
        <div style="display:flex;align-items:center;gap:18px;">
          <img src="${assets.logo || ''}" alt="" style="height:48px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;padding:10px 16px;border-radius:999px;background:rgba(254,92,43,0.14);border:1px solid rgba(254,92,43,0.24);font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Proposta comercial</div>
        </div>

        <div style="margin-top:40px;font-family:Poppins, system-ui, sans-serif;font-size:84px;line-height:0.92;font-weight:700;letter-spacing:-0.05em;max-width:760px;">${escapeHtml(proposalClient)}</div>
        <div style="margin-top:20px;font-size:28px;line-height:1.45;color:rgba(255,255,255,0.74);max-width:720px;">Praça ${escapeHtml(proposalCity)} com material de venda redesenhado para leitura mais forte, imagens melhor enquadradas e informações sem estouro de margem.</div>

        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:24px;">
          ${[
            proposalCity,
            `${proposalPoints.length || 0} pontos`,
            `Gerado em ${new Date().toLocaleDateString('pt-BR')}`
          ].map((chip) => `
            <div style="padding:12px 18px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:18px;font-weight:600;color:rgba(255,255,255,0.78);">${escapeHtml(chip)}</div>
          `).join('')}
        </div>

        <div style="margin-top:auto;">
          ${buildMetricCards(cards, { valueSize: 32, minHeight: 146 })}
        </div>
      </div>

      <div style="display:grid;grid-template-rows:1fr auto;gap:20px;min-width:0;">
        <div style="padding:28px 30px;border-radius:34px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.09);backdrop-filter:blur(14px);display:flex;flex-direction:column;">
          <div style="display:flex;align-items:center;gap:12px;font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};"><span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:rgba(254,92,43,0.16);">◎</span>Direcionamento estratégico</div>
          <div style="margin-top:22px;display:grid;gap:14px;">
            ${strategicItems.map((item) => `
              <div style="display:grid;grid-template-columns:36px 1fr;gap:14px;align-items:flex-start;padding:16px 18px;border-radius:22px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);">
                <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;background:rgba(254,92,43,0.16);color:${BRAND_ORANGE};font-weight:700;">•</div>
                <div style="font-size:22px;line-height:1.5;color:#fff;word-break:break-word;">${escapeHtml(item)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="padding:24px 28px;border-radius:28px;background:rgba(10,10,10,0.62);border:1px solid rgba(255,255,255,0.08);display:grid;grid-template-columns:1.1fr 0.9fr;gap:18px;align-items:center;">
          <div>
            <div style="font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.56);">Leitura do material</div>
            <div style="margin-top:10px;font-size:22px;line-height:1.5;color:#fff;">${escapeHtml(simulationSummary || 'As páginas seguintes apresentam cada ponto com preview/simulação e dados essenciais para tomada comercial.')}</div>
          </div>
          <div style="position:relative;height:190px;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
            <img src="${assets.showcase || assets.about2 || ''}" alt="" style="width:100%;height:100%;object-fit:cover;" />
            <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.06) 0%,rgba(0,0,0,0.68) 100%);"></div>
          </div>
        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

function buildProposalPointPage({ point, index, total, image, assets }) {
  const stats = [
    { label: 'Público', value: point.publico || '-' },
    { label: 'Fluxo', value: formatInt(point.fluxo) },
    { label: 'Telas', value: formatInt(point.telas) },
    { label: 'Inserções', value: formatInt(point.insercoes) },
    { label: 'Investimento', value: formatMoney(point.preco) }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#050505 0%,#0B0B0B 38%,#111111 100%);"></div>
    <div style="position:absolute;top:0;right:0;bottom:0;width:34%;background:url('${assets.wallpaper || assets.cityBg || ''}') center/cover no-repeat;opacity:0.08;"></div>
    <div style="position:relative;z-index:1;height:100%;padding:42px 46px;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr;gap:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:18px;padding:18px 22px;border-radius:26px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
        <div style="display:flex;align-items:center;gap:16px;min-width:0;">
          <img src="${assets.logo || ''}" alt="" style="height:34px;width:auto;object-fit:contain;" />
          <div style="min-width:0;">
            <div style="font-family:Poppins, system-ui, sans-serif;font-size:34px;line-height:1.05;font-weight:700;letter-spacing:-0.03em;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(point.nome || 'Ponto sem nome')}</div>
            <div style="margin-top:6px;font-size:18px;line-height:1.4;color:rgba(255,255,255,0.68);">${escapeHtml(point.cidade || '-')} · ${escapeHtml(point.tipo || '-')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:20px;background:#111;border:1px solid rgba(255,255,255,0.08);font-size:18px;font-weight:700;color:#fff;">
          <span style="color:${BRAND_ORANGE};">${index}</span>
          <span style="color:rgba(255,255,255,0.56);">/ ${total}</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.18fr 0.82fr;gap:24px;min-height:0;">
        <div style="position:relative;min-width:0;">
          <div style="position:absolute;inset:0;padding:26px;border-radius:34px;background:linear-gradient(180deg,#121212 0%,#090909 100%);border:1px solid rgba(255,255,255,0.08);box-sizing:border-box;">
            ${buildHeroImageFrame(image, { fit: 'contain', radius: 28 })}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px;min-width:0;">
          <div style="padding:26px 28px;border-radius:30px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Endereço</div>
            <div style="margin-top:12px;font-size:23px;line-height:1.5;color:#fff;word-break:break-word;">${escapeHtml(point.endereco || 'Endereço não informado')}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr;gap:14px;">
            ${stats.map((item) => `
              <div style="padding:18px 20px;border-radius:24px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(item.label)}</div>
                <div style="margin-top:10px;font-size:26px;line-height:1.25;color:#fff;font-weight:700;word-break:break-word;">${escapeHtml(item.value)}</div>
              </div>
            `).join('')}
          </div>

          <div style="margin-top:auto;padding:24px 26px;border-radius:28px;background:rgba(254,92,43,0.12);border:1px solid rgba(254,92,43,0.24);font-size:20px;line-height:1.5;color:#fff;">
            Preview com proporção preservada e margem segura para evitar cortes e textos espremidos.
          </div>
        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

async function loadPdfAssets() {
  const [
    logo,
    heroBg,
    cityBg,
    about1,
    about2,
    audience,
    showcase,
    wallpaper
  ] = await Promise.all([
    imageToDataUrl(assetUrl('/logo.png')),
    imageToDataUrl(assetUrl('/hero-bg.jpg')),
    imageToDataUrl(assetUrl('/city-bg.jpg')),
    imageToDataUrl(assetUrl('/about-1.jpg')),
    imageToDataUrl(assetUrl('/about-2.jpg')),
    imageToDataUrl(assetUrl('/audience.jpg')),
    imageToDataUrl(assetUrl('/showcase.png')),
    imageToDataUrl(assetUrl('/wallpaper.jpg'))
  ]);

  return {
    logo,
    heroBg,
    cityBg,
    about1,
    about2,
    audience,
    showcase,
    wallpaper
  };
}

export async function generateMidiaKitPdf({ praca, pontos }) {
  const cidade = praca && praca !== 'Todas as praças' ? praca : 'Consolidado';
  const kitPontos = Array.isArray(pontos) ? pontos : [];
  const resumo = buildResumo(kitPontos);
  const assets = await loadPdfAssets();
  const cityStats = {
    totalTelas: resumo.telas,
    totalEnderecos: new Set(kitPontos.map((p) => `${p.cidade || ''}-${p.endereco || ''}`.trim())).size
  };

  const pointImages = await Promise.all(kitPontos.map((ponto) => imageToDataUrl(pickImageUrl(ponto))));
  const pages = [
    buildMidiaKitCoverPage({ cidade, pontos: kitPontos, resumo, assets }),
    buildMidiaKitManifestoPage({ assets }),
    buildMidiaKitSummaryPage({ cidade, pontos: kitPontos, assets })
  ];

  const groupedByTipo = kitPontos.reduce((acc, ponto, index) => {
    const tipo = ponto.tipo || 'Formato';
    if (!acc[tipo]) acc[tipo] = [];
    acc[tipo].push({ ponto, index });
    return acc;
  }, {});

  Object.entries(groupedByTipo).forEach(([tipo, items]) => {
    pages.push(buildMidiaKitFormatDividerPage({ tipo, cityStats, assets }));
    items.forEach(({ ponto, index }) => {
      pages.push(buildMidiaKitPointPage({
        ponto,
        index: index + 1,
        total: kitPontos.length,
        image: pointImages[index],
        assets
      }));
    });
  });

  const fileName = `midia-kit-${slugify(cidade)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  await renderPagesToPdf(pages, fileName);
}

export async function generateProposalPdf({
  clientName,
  city,
  points,
  totals,
  strategicText,
  simulationSummary
}) {
  const proposalPoints = Array.isArray(points) ? points : [];
  const proposalTotals = totals || { valorTotal: 0, fluxoTotal: 0, cpmEstimado: 0, insercoesTotal: 0 };
  const proposalCity = city || 'Múltiplas praças';
  const proposalClient = clientName || 'Cliente não informado';
  const highlights = normalizeLines(strategicText, 4);
  const assets = await loadPdfAssets();
  const proposalImages = await Promise.all(proposalPoints.map((point) => imageToDataUrl(pickProposalImageUrl(point))));

  const pages = [
    buildProposalCoverPage({
      proposalClient,
      proposalCity,
      proposalPoints,
      proposalTotals,
      highlights,
      simulationSummary,
      assets
    })
  ];

  proposalPoints.forEach((point, index) => {
    pages.push(buildProposalPointPage({
      point,
      index: index + 1,
      total: proposalPoints.length,
      image: proposalImages[index],
      assets
    }));
  });

  const fileName = `proposta-${slugify(proposalClient)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  await renderPagesToPdf(pages, fileName);
}
