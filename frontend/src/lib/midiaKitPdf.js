import { jsPDF } from 'jspdf';
import { loadPdfLayoutConfig } from './pdfLayoutConfig';
import { buildAudienceQualification, buildEntornoSummary, getSegmentDisplayName } from './strategy';

const PAGE_WIDTH = 1600;
const PAGE_HEIGHT = 1260;
export const PDF_PAGE_SIZE = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
const PDF_MM_WIDTH = 297;
const PDF_MM_HEIGHT = Number((PDF_MM_WIDTH * (PAGE_HEIGHT / PAGE_WIDTH)).toFixed(2));
const BRAND_ORANGE = '#FE5C2B';
const BRAND_DARK = '#0A0A0A';
const BRAND_PANEL = '#171717';
const BRAND_BORDER = 'rgba(255,255,255,0.08)';

const CITY_STATE_MAP = {
  'londrina': 'Paran├í',
  'maring├í': 'Paran├í',
  'maringa': 'Paran├í',
  'balne├írio cambori├║': 'Santa Catarina',
  'balneario camboriu': 'Santa Catarina',
  'itaja├¡': 'Santa Catarina',
  'itajai': 'Santa Catarina',
  'curitiba': 'Paran├í',
  'florian├│polis': 'Santa Catarina',
  'florianopolis': 'Santa Catarina',
};
function getCityState(cidade) {
  const key = String(cidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const keyRaw = String(cidade || '').toLowerCase();
  return CITY_STATE_MAP[keyRaw] || CITY_STATE_MAP[key] || '';
}

const imageCache = new Map();
const IMAGE_FETCH_TIMEOUT_MS = 15000;
const IMAGE_RENDER_WAIT_TIMEOUT_MS = 8000;
let pdfAssetsPromise = null;
let activePdfLayoutConfig = null;

function getActivePdfLayoutConfig() {
  return activePdfLayoutConfig;
}

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

function formatPointNameHtml(name, options = {}) {
  const source = String(name || '').trim().toUpperCase();
  if (!source) return 'PONTO SEM NOME';

  const innerStyle = options.innerStyle || 'font-size:0.62em;font-weight:600;letter-spacing:-0.01em;';
  const regex = /\(([^)]+)\)/g;
  let html = '';
  let cursor = 0;
  let match = regex.exec(source);

  while (match) {
    html += escapeHtml(source.slice(cursor, match.index));
    html += `<span style="${innerStyle}">(${escapeHtml(match[1])})</span>`;
    cursor = regex.lastIndex;
    match = regex.exec(source);
  }

  html += escapeHtml(source.slice(cursor));
  return html;
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

function highlightCalibrationTargets(page, focusKey, isolateFocus) {
  const allTargets = Array.from(page.querySelectorAll('[data-calibration-id]'));
  if (!allTargets.length) return page;

  const focusedTargets = focusKey
    ? Array.from(page.querySelectorAll(`[data-calibration-id="${focusKey}"]`))
    : [];

  allTargets.forEach((target) => {
    target.style.transition = 'opacity 120ms ease, filter 120ms ease, box-shadow 120ms ease, outline 120ms ease';
    target.style.position = target.style.position || 'relative';
    target.style.zIndex = '1';
    target.style.opacity = '1';
    target.style.filter = 'none';
    target.style.outline = 'none';
    target.style.boxShadow = target.style.boxShadow || '';
  });

  if (!focusedTargets.length) {
    return page;
  }

  allTargets.forEach((target) => {
    const isFocused = target.dataset.calibrationId === focusKey;
    if (!isFocused && isolateFocus) {
      target.style.opacity = '0.14';
      target.style.filter = 'grayscale(0.25) saturate(0.55) brightness(0.72)';
    }
    if (isFocused) {
      target.style.zIndex = '3';
      target.style.outline = `3px solid ${BRAND_ORANGE}`;
      target.style.outlineOffset = '4px';
      target.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.28), 0 22px 48px rgba(0,0,0,0.34)';
    }
  });

  return page;
}

function buildCalibrationPreviewData() {
  const point = {
    nome: 'MUFFATO MADRE LEONIA (ELEVADOR SOCIAL)',
    cidade: 'Londrina',
    tipo: 'Tela Indoor',
    endereco: 'Av. Madre Leonia Milito, 1175 ┬À Gleba Palhano',
    publico: 'A/B',
    fluxo: 128000,
    telas: 4,
    insercoes: 720,
    tempo: '15s',
    loop: '3 min',
    veiculacao: 'V├¡deo sem ├íudio',
    horario: '06:00 ├ás 22:00',
    preco: 6200,
    proposalSimulationPreview: ''
  };

  return {
    cidade: 'Londrina',
    resumo: { telas: 84, fluxo: 2840000, preco: 0, ticketMedio: 0 },
    cityStats: { cidade: 'Londrina', totalTelas: 84, totalEnderecos: 19 },
    proposalClient: 'Cliente Exemplo',
    proposalCity: 'Londrina',
    proposalTotals: { valorTotal: 24800, fluxoTotal: 512000, cpmEstimado: 18.42, insercoesTotal: 1440 },
    highlights: [
      'Cobertura premium em rotas de alta recorr├¬ncia.',
      'Presen├ºa visual forte em pontos de decis├úo e deslocamento.',
      'Leitura comercial organizada para defesa r├ípida na reuni├úo.'
    ],
    point,
    points: [point, { ...point, nome: 'AEROPORTO DE LONDRINA (SAGU├âO)', endereco: 'Av. Santos Dumont, 900' }]
  };
}

function buildCalibrationPreviewPage(previewKey, assets) {
  const sample = buildCalibrationPreviewData();
  const image = assets.showcase || assets.cityBg || assets.heroBg || '';

  switch (previewKey) {
    case 'midiaKit.cover':
      return buildMidiaKitCoverPage({ cidade: sample.cidade, pontos: sample.points, resumo: sample.resumo, assets });
    case 'midiaKit.formatDivider':
      return buildMidiaKitFormatDividerPage({ tipo: 'Tela Indoor Premium', cityStats: sample.cityStats, assets });
    case 'midiaKit.pointPage':
      return buildMidiaKitPointPage({ ponto: sample.point, index: 1, total: 12, image, assets });
    case 'proposal.cover':
      return buildProposalCoverPage({
        proposalClient: sample.proposalClient,
        proposalCity: sample.proposalCity,
        proposalPoints: sample.points,
        proposalTotals: sample.proposalTotals,
        highlights: sample.highlights,
        simulationSummary: null,
        assets
      });
    case 'proposal.point':
      return buildProposalPointPage({ point: sample.point, index: 1, total: 6, image, assets });
    default:
      throw new Error(`Preview PDF desconhecido: ${previewKey}`);
  }
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
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PDF_MM_WIDTH, PDF_MM_HEIGHT] });
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
        doc.addPage([PDF_MM_WIDTH, PDF_MM_HEIGHT], 'landscape');
      }

      const image = canvas.toDataURL('image/jpeg', 0.92);
      doc.addImage(image, 'JPEG', 0, 0, PDF_MM_WIDTH, PDF_MM_HEIGHT, undefined, 'FAST');
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
            <span style="display:inline-flex;align-items:center;justify-content:center;width:${options.iconSize || 36}px;height:${options.iconSize || 36}px;border-radius:999px;background:rgba(254,92,43,0.18);color:${BRAND_ORANGE};font-weight:700;line-height:1;flex:0 0 auto;">${card.iconHtml || escapeHtml(card.icon || 'ÔÇó')}</span>
            <span style="line-height:1.2;">${escapeHtml(card.label)}</span>
          </div>
          <div style="margin-top:18px;font-family:Poppins, system-ui, sans-serif;font-size:${options.valueSize || 36}px;line-height:1.05;font-weight:700;color:${options.valueColor || '#ffffff'};letter-spacing:-0.03em;word-break:${options.valueWordBreak || 'break-word'};white-space:${options.valueWhiteSpace || 'normal'};">${escapeHtml(card.value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function proposalIcon(kind) {
  if (kind === 'target') {
    return `<span style="position:relative;display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;"><span style="position:absolute;inset:0;border:2px solid ${BRAND_ORANGE};border-radius:999px;opacity:0.85;"></span><span style="position:absolute;width:6px;height:6px;border-radius:999px;background:${BRAND_ORANGE};"></span></span>`;
  }
  if (kind === 'flow') {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${BRAND_ORANGE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7a8 8 0 0 0-13.7-2.5"></path><path d="M17 7h3V4"></path><path d="M4 17a8 8 0 0 0 13.7 2.5"></path><path d="M7 17H4v3"></path></svg>`;
  }
  if (kind === 'money') {
    return `<span style="font-family:Poppins, system-ui, sans-serif;font-size:32px;font-weight:700;line-height:1;display:block;transform:translateY(1px);">R$</span>`;
  }
  if (kind === 'cpm') {
    return `<span style="font-family:Poppins, system-ui, sans-serif;font-size:28px;font-weight:700;line-height:1;display:block;transform:translateY(1px);">CP</span>`;
  }
  return `<span style="display:block;width:8px;height:8px;border-radius:999px;background:${BRAND_ORANGE};"></span>`;
}

function formatPointCountLabel(count) {
  return `${count} ${count === 1 ? 'ponto' : 'pontos'}`;
}

function buildHeroImageFrame(image, options = {}) {
  if (!image) {
    return `
      <div style="height:100%;border-radius:${options.radius || 30}px;border:1px solid ${BRAND_BORDER};background:linear-gradient(135deg,#121212,#1B1B1B);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.62);font-size:28px;font-weight:600;">
        Imagem indispon├¡vel
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

function metricIconSvg(kind, color = '#111111', size = 20) {
  const common = `fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  const wh = `width="${size}" height="${size}"`;
  const icons = {
    publico: `<svg viewBox="0 0 24 24" ${wh} ${common}><circle cx="9" cy="8" r="3.2"></circle><circle cx="16.5" cy="9.5" r="2.5"></circle><path d="M3.5 18.5c0-3.1 2.5-5.5 5.5-5.5s5.5 2.4 5.5 5.5"></path><path d="M14.6 18.5c0-2.3 1.8-4.1 4.1-4.1"></path></svg>`,
    fluxo: `<svg viewBox="0 0 24 24" ${wh} ${common}><path d="M3.5 12h13"></path><path d="M12 6.5L16.5 12 12 17.5"></path><path d="M20.5 8.5v7"></path></svg>`,
    telas: `<svg viewBox="0 0 24 24" ${wh} ${common}><rect x="3" y="5" width="18" height="12" rx="2"></rect><path d="M9 20h6"></path><path d="M12 17v3"></path></svg>`,
    insercoes: `<svg viewBox="0 0 24 24" ${wh} ${common}><path d="M12 4v16"></path><path d="M5 12h14"></path><circle cx="12" cy="12" r="8"></circle></svg>`,
    tempo: `<svg viewBox="0 0 24 24" ${wh} ${common}><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l2.8 2.8"></path></svg>`,
    loop: `<svg viewBox="0 0 24 24" ${wh} ${common}><path d="M17 7h3V4"></path><path d="M7 17H4v3"></path><path d="M20 7a8 8 0 0 0-13.7-2.5"></path><path d="M4 17a8 8 0 0 0 13.7 2.5"></path></svg>`,
    veiculacao: `<svg viewBox="0 0 24 24" ${wh} ${common}><rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M10 9.2l5 2.8-5 2.8z"></path></svg>`,
    horario: `<svg viewBox="0 0 24 24" ${wh} ${common}><circle cx="12" cy="12" r="8"></circle><path d="M12 7v5h4"></path></svg>`
  };

  return icons[kind] || icons.fluxo;
}

function buildMidiaKitCoverPage({ cidade, pontos, resumo, assets }) {
  const layout = getActivePdfLayoutConfig().midiaKit.cover;
  const estado = getCityState(cidade);

  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <div style="position:absolute;inset:0;background:url('${assets.heroBg || assets.cityBg || ''}') center/cover no-repeat;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:47%;background:linear-gradient(90deg,rgba(0,0,0,0.96) 0%,rgba(0,0,0,0.94) 76%,rgba(0,0,0,0.58) 100%);"></div>
    <div style="position:absolute;left:47%;top:0;bottom:0;width:8px;background:${BRAND_ORANGE};opacity:0.86;"></div>
    <div style="position:absolute;left:48%;top:0;bottom:0;width:90px;background:linear-gradient(90deg,rgba(0,0,0,0.55),rgba(0,0,0,0));"></div>

    <div style="position:absolute;left:72px;top:88px;width:360px;">
      <img src="${assets.logo || ''}" alt="" style="width:180px;height:auto;object-fit:contain;" />
    </div>

    <div style="position:absolute;left:72px;bottom:120px;width:420px;">
      <div style="font-family:Poppins, system-ui, sans-serif;color:#fff;font-size:58px;line-height:0.95;font-weight:700;letter-spacing:-0.04em;">Elevando o branding</div>
      <div style="margin-top:20px;color:rgba(255,255,255,0.8);font-size:34px;line-height:1.22;">Invista no futuro da publicidade OOH e DOOH</div>
      <table cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;"><tr><td style="min-height:${layout.outOfHomeMinHeight}px;padding:12px ${layout.outOfHomePaddingX}px;background:#fff;color:#000;font-size:18px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;line-height:1;text-align:center;white-space:nowrap;">Out of Home</td></tr></table>
    </div>

    <div style="position:absolute;right:70px;bottom:90px;text-align:left;">
      <div style="font-family:Poppins, system-ui, sans-serif;color:#fff;font-size:64px;line-height:0.95;font-weight:700;text-transform:uppercase;">${escapeHtml(cidade)}</div>
      ${estado ? `<div style="margin-top:10px;color:#fff;font-size:16px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.82;">${escapeHtml(estado)}</div>` : ''}
      <div style="margin-top:20px;color:${BRAND_ORANGE};font-size:30px;font-weight:700;letter-spacing:0.03em;">MIDIAKIT 2026</div>
      <div style="margin-top:10px;color:rgba(255,255,255,0.86);font-size:20px;">${formatInt(pontos.length)} pontos ÔÇó ${formatInt(resumo.telas)} telas ÔÇó fluxo ${formatInt(resumo.fluxo)}/m├¬s</div>
    </div>
  `, '#030303');
}

function buildMidiaKitManifestoPage({ assets }) {
  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:44%;overflow:hidden;">
      <img src="${assets.about1 || assets.about2 || ''}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center top;filter:grayscale(1) contrast(1.05);" />
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0.0) 40%,rgba(0,0,0,0.0) 70%,rgba(0,0,0,0.95) 100%);"></div>
    </div>

    <div style="position:absolute;left:740px;right:82px;top:82px;">
      <img src="${assets.logo || ''}" alt="" style="height:70px;width:auto;object-fit:contain;" />
      <div style="margin-top:24px;font-size:23px;line-height:1.42;color:#fff;max-width:760px;">
        Na Intermidia, n├úo apenas defendemos a m├¡dia OOH e DOOH. N├│s vivemos a transforma├º├úo que ela representa.
      </div>
      <div style="margin-top:22px;width:180px;height:4px;background:${BRAND_ORANGE};"></div>
    </div>

    <div style="position:absolute;left:740px;right:82px;top:270px;display:grid;grid-template-columns:1fr 1fr;gap:34px;">
      <div style="font-size:21px;line-height:1.45;color:#fff;">
        <strong style="display:block;font-family:Poppins, system-ui, sans-serif;font-size:58px;line-height:1.08;font-weight:700;letter-spacing:-0.02em;margin-bottom:22px;">A Intermidia ├® especialista em comunica├º├úo Out of Home e Digital Out of Home desde 2007.</strong>
        Somos apaixonados pelo impacto que a m├¡dia OOH e DOOH pode gerar.
      </div>
      <div style="font-size:21px;line-height:1.45;color:#fff;">
        Valorizamos a for├ºa da publicidade no ambiente urbano e acreditamos que cada ponto de contato ├® uma oportunidade para transformar marcas em refer├¬ncia.
        <br/><br/>
        Entregamos solu├º├Áes que levam sua mensagem al├®m do ├│bvio, alcan├ºando as pessoas onde elas vivem, trabalham e se movem.
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
    { label: 'endere├ºos', value: formatInt(totalEnderecos) },
    { label: 'pontos de impacto', value: formatInt(totalPontos) }
  ];

  const estado = getCityState(cidade);

  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:52%;overflow:hidden;">
      <img src="${assets.heroBg || assets.showcase || ''}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center;" />
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.55) 35%,rgba(0,0,0,0.1) 100%);"></div>
    </div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:48%;background:linear-gradient(90deg,#000 0%,#000 85%,rgba(0,0,0,0) 100%);"></div>

    <div style="position:absolute;left:82px;top:86px;min-width:310px;">
      <div style="font-family:Poppins, system-ui, sans-serif;font-size:64px;line-height:0.93;color:#fff;font-weight:700;text-transform:uppercase;">${escapeHtml(cidade)}</div>
      ${estado ? `<div style="margin-top:8px;color:#fff;font-size:18px;letter-spacing:0.07em;text-transform:uppercase;opacity:0.78;">${escapeHtml(estado)}</div>` : ''}
    </div>

    <div style="position:absolute;left:88px;top:280px;right:980px;border-left:2px solid rgba(255,255,255,0.5);padding-left:36px;">
      ${cards.map((card) => `
        <div style="margin-bottom:20px;">
          <span style="font-family:Poppins, system-ui, sans-serif;font-size:56px;font-weight:700;color:#fff;line-height:1;">${escapeHtml(card.value)}</span>
          <span style="margin-left:12px;font-size:42px;color:#fff;line-height:1.2;">${escapeHtml(card.label)}</span>
        </div>
      `).join('')}
      <div style="margin-top:26px;font-size:40px;line-height:1.4;color:#fff;max-width:460px;">
        em <strong>${escapeHtml(lines || 'formatos estrat├®gicos')}</strong> com cobertura urbana premium.
      </div>
    </div>

    <div style="position:absolute;right:84px;top:58px;padding:18px;background:rgba(0,0,0,0.65);border-radius:16px;">
      <img src="${assets.logo || ''}" alt="" style="height:120px;width:auto;object-fit:contain;" />
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

function buildMidiaKitFormatDividerPage({ tipo, formatStats, cityStats, assets }) {
  const layout = getActivePdfLayoutConfig().midiaKit.formatDivider;
  const lines = splitFormatTitle(tipo);
  const telas = formatStats ? formatStats.telas : (cityStats.totalTelas || 0);
  const enderecos = formatStats ? formatStats.enderecos : (cityStats.totalEnderecos || 0);
  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <img src="${assets.wallpaper || assets.heroBg || ''}" alt="" style="position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(16px) saturate(1.12);opacity:0.10;" />
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 46%, rgba(254,92,43,0.10) 0%, rgba(254,92,43,0.02) 38%, rgba(0,0,0,0.92) 78%);"></div>

    <div style="position:absolute;right:98px;top:198px;text-align:left;max-width:630px;">
      ${lines.map((line) => `<div style="font-family:Poppins, system-ui, sans-serif;font-size:${layout.titleFontSize}px;line-height:0.9;font-weight:700;color:#fff;letter-spacing:-0.04em;">${escapeHtml(line)}</div>`).join('')}
    </div>

    <div style="position:absolute;left:560px;bottom:138px;width:560px;border-left:2px solid rgba(255,255,255,0.58);border-bottom:2px solid rgba(255,255,255,0.58);height:344px;"></div>

    <div style="position:absolute;right:190px;bottom:170px;text-align:right;color:#fff;">
      <div style="font-family:Poppins, system-ui, sans-serif;font-size:58px;font-weight:700;line-height:1;">${escapeHtml(formatInt(telas))}</div>
      <div style="font-size:34px;line-height:1.15;opacity:0.92;">telas</div>
      <div style="margin-top:16px;font-family:Poppins, system-ui, sans-serif;font-size:58px;font-weight:700;line-height:1;">${escapeHtml(formatInt(enderecos))}</div>
      <div style="font-size:34px;line-height:1.15;opacity:0.92;">endere├ºos</div>
    </div>

    <div style="position:absolute;left:82px;bottom:58px;font-family:Poppins, system-ui, sans-serif;font-size:22px;font-weight:700;color:rgba(255,255,255,0.7);letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml((cityStats.cidade || '').toUpperCase())}</div>

    <div style="position:absolute;right:60px;bottom:50px;">
      <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:36px;width:auto;object-fit:contain;opacity:0.8;" />
    </div>
  `, '#000');
}

function buildMidiaKitPointPage({ ponto, index, total, image, assets }) {
  const layout = getActivePdfLayoutConfig().midiaKit.pointPage;
  const estado = getCityState(ponto.cidade);
  const fluxoLabel = ponto.tipo_fluxo === 'veiculos' ? 'Veículos / mês' : 'Pessoas / mês';
  const details = [
    { key: 'publico', label: 'Público', value: ponto.publico || '-' },
    { key: 'fluxo', label: fluxoLabel, value: formatInt(ponto.fluxo) },
    { key: 'telas', label: 'Telas', value: formatInt(ponto.telas) },
    { key: 'insercoes', label: 'Inserções', value: `Mín. ${formatInt(ponto.insercoes)}` },
    { key: 'tempo', label: 'Tempo', value: ponto.tempo || '-' },
    { key: 'loop', label: 'Looping', value: `Mín. ${ponto.loop || '-'}` },
    { label: 'Veiculação', value: ponto.veiculacao || '-' },
    { label: 'Horário', value: ponto.horario || '-' }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:#d9d9d9;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:${layout.leftRailWidth}px;background:#0c0c0c;overflow:hidden;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:${layout.leftRailWidth}px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">
      <div style="transform:rotate(180deg);writing-mode:vertical-lr;white-space:nowrap;display:flex;align-items:center;gap:10px;padding-bottom:20px;padding-top:20px;">
        <span style="font-size:14px;font-weight:700;letter-spacing:0.08em;color:rgba(255,255,255,0.85);text-transform:uppercase;">${escapeHtml(ponto.cidade || '')}</span>
        ${estado ? `<span style="font-size:11px;font-weight:600;letter-spacing:0.06em;color:rgba(255,255,255,0.45);text-transform:uppercase;">${escapeHtml(estado)}</span>` : ''}
      </div>
      <div style="padding-bottom:18px;">
        <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="width:38px;height:auto;object-fit:contain;" />
      </div>
    </div>

    <div style="position:absolute;left:${layout.leftRailWidth}px;top:0;bottom:0;right:${layout.imagePanelWidth}px;background:#e7e7e7;"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:${layout.imagePanelWidth}px;background:#1a1a1a;"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:${layout.imagePanelWidth}px;background:url('${image || assets.showcase || ''}') center/cover no-repeat;"></div>

    <div style="position:absolute;left:${layout.contentLeft}px;top:42px;right:${layout.contentRight}px;border-bottom:2px solid #161616;padding-bottom:12px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:46px;height:46px;border:2px solid #222;display:flex;align-items:center;justify-content:center;font-size:21px;">ÔûÑ</div>
        <div style="font-family:Poppins, system-ui, sans-serif;font-size:${layout.typeFontSize}px;line-height:0.9;font-weight:700;letter-spacing:-0.03em;color:#000;">${escapeHtml((ponto.tipo || 'FORMATO').toUpperCase())}</div>
      </div>
    </div>

    <div style="position:absolute;left:${layout.contentLeft}px;top:${layout.nameTop}px;right:${layout.contentRight}px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;">
        <div style="font-family:Poppins, system-ui, sans-serif;font-size:${layout.nameFontSize}px;line-height:1.02;font-weight:700;color:#000;max-width:calc(100% - ${layout.nameMaxWidthOffset}px);word-break:break-word;">${formatPointNameHtml(ponto.nome || 'PONTO SEM NOME')}</div>
        <div style="font-size:44px;line-height:0.95;font-weight:700;color:#000;white-space:nowrap;padding-top:8px;">${index}/${total}</div>
      </div>
      <div style="margin-top:8px;font-size:18px;line-height:1.3;color:#444;">${escapeHtml(ponto.endereco || 'Endere├ºo n├úo informado')}${escapeHtml(ponto.cidade ? ` ┬À ${ponto.cidade}` : '')}</div>
    </div>

    <div style="position:absolute;left:${layout.contentLeft}px;top:${layout.metricsBoxTop}px;right:${layout.contentRight}px;border:2px solid rgba(17,17,17,0.32);background:rgba(255,255,255,0.5);padding:22px 24px;border-radius:16px;"></div>
    <div style="position:absolute;left:${layout.contentLeft + 26}px;top:${layout.metricsGridTop}px;right:${layout.contentRight + 24}px;display:grid;grid-template-columns:1fr 1fr;gap:18px 26px;">
      ${details.slice(0, 6).map((item) => `
        <div style="min-height:96px;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;padding-right:8px;line-height:0;">${metricIconSvg(item.key, '#111111', layout.metricIconSize)}</td>
            <td style="vertical-align:middle;font-size:${layout.metricLabelFontSize}px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#222;line-height:1;">${escapeHtml(item.label)}</td>
          </tr></table>
          <div style="margin-top:7px;font-family:Poppins, system-ui, sans-serif;font-size:${layout.metricValueFontSize}px;line-height:1.18;font-weight:700;color:#000;word-break:break-word;">${escapeHtml(item.value)}</div>
        </div>
      `).join('')}
    </div>

    <div style="position:absolute;left:${layout.contentLeft}px;bottom:${layout.footerLineBottom}px;right:${layout.contentRight}px;border-top:2px solid #1a1a1a;"></div>
    <div style="position:absolute;left:${layout.contentLeft}px;bottom:${layout.footerBottom}px;right:${layout.contentRight}px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;">
      <div>
        <div style="font-size:20px;line-height:1.35;color:#111;">m├¡nimo de ${escapeHtml(formatInt(ponto.insercoes || 0))} inser├º├Áes/m├¬s</div>
        <div style="font-size:20px;line-height:1.35;color:#111;">veicula├º├úo: ${escapeHtml((ponto.veiculacao || 'v├¡deo sem ├íudio').toLowerCase())}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;min-width:320px;">
        <div style="font-size:26px;line-height:1;color:#111;margin-bottom:${layout.priceLabelMarginBottom}px;">Valor mensal:</div>
        <div style="font-family:Poppins, system-ui, sans-serif;font-size:${layout.priceValueFontSize}px;line-height:0.96;font-weight:700;color:#000;white-space:nowrap;">${escapeHtml(formatMoney(ponto.preco))}</div>
      </div>
    </div>

  `, '#ECE7E0');
}

function buildProposalCoverPage({ proposalClient, proposalCity, proposalPoints, proposalTotals, pricingSummary, highlights, simulationSummary, segmento, assets }) {
  const layout = getActivePdfLayoutConfig().proposal.cover;
  const segmentLabel = getSegmentDisplayName(segmento);
  const pointsWithEntorno = proposalPoints.filter((point) => Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) > 0).length;
  const originalTotal = pricingSummary?.originalTotal ?? proposalTotals.valorTotal;
  const finalTotal = pricingSummary?.finalTotal ?? proposalTotals.valorTotal;
  const hasDiscount = pricingSummary?.hasDiscount && originalTotal !== finalTotal;
  const cards = hasDiscount
    ? [
        { iconHtml: proposalIcon('target'), label: 'Pontos', value: formatInt(proposalPoints.length) },
        { iconHtml: proposalIcon('flow'), label: 'Fluxo total', value: formatInt(proposalTotals.fluxoTotal) },
        { iconHtml: proposalIcon('money'), label: 'Valor Tabela', value: formatMoney(originalTotal) },
        { iconHtml: proposalIcon('money'), label: 'Valor Negociado', value: formatMoney(finalTotal) }
      ]
    : [
        { iconHtml: proposalIcon('target'), label: 'Pontos', value: formatInt(proposalPoints.length) },
        { iconHtml: proposalIcon('flow'), label: 'Fluxo total', value: formatInt(proposalTotals.fluxoTotal) },
        { iconHtml: proposalIcon('money'), label: 'Valor Negociado', value: formatMoney(finalTotal) },
        { iconHtml: proposalIcon('cpm'), label: 'CPM estimado', value: formatDecimalMoney(proposalTotals.cpmEstimado) }
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
          <div data-calibration-id="proposal.cover.badge" style="display:inline-flex;align-items:center;justify-content:center;min-height:${layout.badgeMinHeight}px;padding:0 ${layout.badgePaddingX}px;border-radius:999px;background:rgba(254,92,43,0.14);border:1px solid rgba(254,92,43,0.24);font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};line-height:1;text-align:center;">
            <span style="display:block;transform:translateY(1px);">Proposta comercial</span>
          </div>
        </div>

        <div style="margin-top:40px;font-family:Poppins, system-ui, sans-serif;font-size:84px;line-height:0.92;font-weight:700;letter-spacing:-0.05em;max-width:760px;">${escapeHtml(proposalClient)}</div>
        <div style="margin-top:20px;font-size:28px;line-height:1.45;color:rgba(255,255,255,0.74);max-width:720px;">Praça ${escapeHtml(proposalCity)} com material de venda redesenhado para leitura mais forte, imagens melhor enquadradas e informações sem estouro de margem.</div>

        <div data-calibration-id="proposal.cover.chips" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:24px;">
          ${[
            proposalCity,
            formatPointCountLabel(proposalPoints.length || 0),
            segmentLabel,
            `Gerado em ${new Date().toLocaleDateString('pt-BR')}`
          ].map((chip) => `
            <div style="display:inline-flex;align-items:center;justify-content:center;min-height:${layout.chipMinHeight}px;padding:0 ${layout.chipPaddingX}px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:18px;font-weight:600;color:rgba(255,255,255,0.78);line-height:1;text-align:center;">
              <span style="display:block;transform:translateY(1px);">${escapeHtml(chip)}</span>
            </div>
          `).join('')}
        </div>

        <div data-calibration-id="proposal.cover.metricCards" style="margin-top:auto;">
          ${buildMetricCards(cards, {
            valueSize: layout.metricValueSize,
            labelSize: layout.metricLabelSize,
            iconSize: layout.metricIconSize,
            minHeight: 146,
            gap: layout.metricGap,
            padding: layout.metricPadding,
            valueWhiteSpace: 'nowrap',
            valueWordBreak: 'normal'
          })}
        </div>
      </div>

      <div style="display:grid;grid-template-rows:1fr;gap:20px;min-width:0;">
        <div style="padding:28px 30px;border-radius:34px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.09);backdrop-filter:blur(14px);display:flex;flex-direction:column;">
          <div data-calibration-id="proposal.cover.strategicHeader" style="display:flex;align-items:center;gap:12px;font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};"><span style="display:inline-flex;align-items:center;justify-content:center;width:${layout.strategicHeaderIconSize}px;height:${layout.strategicHeaderIconSize}px;border-radius:999px;background:rgba(254,92,43,0.16);">${proposalIcon('target')}</span>Direcionamento estratégico</div>
          <div data-calibration-id="proposal.cover.strategicCards" style="margin-top:22px;display:grid;gap:14px;">
            ${strategicItems.map((item) => `
              <div style="display:grid;grid-template-columns:36px 1fr;gap:14px;align-items:flex-start;padding:16px 18px;border-radius:22px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);">
                <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;background:rgba(254,92,43,0.16);">
                  <span style="display:block;width:${layout.strategicDotSize}px;height:${layout.strategicDotSize}px;border-radius:999px;background:${BRAND_ORANGE};"></span>
                </div>
                <div style="font-size:22px;line-height:1.5;color:#fff;word-break:break-word;">${escapeHtml(item)}</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="padding:14px 16px;border-radius:20px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.46);">Segmento priorizado</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.25;color:#fff;font-weight:700;word-break:break-word;">${escapeHtml(segmentLabel)}</div>
            </div>
            <div style="padding:14px 16px;border-radius:20px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.46);">Entorno aderente</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.25;color:#fff;font-weight:700;word-break:break-word;">${escapeHtml(`${formatInt(pointsWithEntorno)} ponto${pointsWithEntorno === 1 ? '' : 's'}`)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

function buildProposalPointPage({ point, index, total, image, image2, segmento, assets }) {
  const layout = getActivePdfLayoutConfig().proposal.point;
  const audience = buildAudienceQualification(point);
  const environment = buildEntornoSummary(point?.entornoMetrics, segmento);
  const relevantPlacesCount = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
  const fluxoLabel = point.tipo_fluxo === 'veiculos' ? 'veículos/mês' : 'pessoas/mês';
  const coords = (() => {
    const lat = Number(point.lat); const lng = Number(point.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001) {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    return null;
  })();
  const stats = [
    { label: 'Fluxo', value: `${formatInt(point.fluxo)} ${fluxoLabel}` },
    { label: 'Telas', value: formatInt(point.telas) },
    { label: 'Mín. Inserções', value: formatInt(point.insercoes) },
    { label: 'Valor Negociado', value: formatMoney(point.preco) }
  ];

  const hasSecondImage = image2 && point.tipo === 'Elevador';
  const imageFrameHtml = hasSecondImage
    ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;height:100%;">
        ${buildHeroImageFrame(image, { fit: 'contain', radius: 20 })}
        ${buildHeroImageFrame(image2, { fit: 'contain', radius: 20 })}
      </div>`
    : buildHeroImageFrame(image, { fit: 'contain', radius: 28 });

  return createPage(`
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#050505 0%,#0B0B0B 38%,#111111 100%);"></div>
    <div style="position:absolute;top:0;right:0;bottom:0;width:34%;background:url('${assets.wallpaper || assets.cityBg || ''}') center/cover no-repeat;opacity:${layout.rightWallpaperOpacity};"></div>
    <div style="position:relative;z-index:1;height:100%;padding:42px 46px;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr;gap:24px;">
      <div data-calibration-id="proposal.point.header" style="display:flex;justify-content:space-between;align-items:center;gap:18px;padding:18px 22px;border-radius:26px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
        <div style="display:flex;align-items:center;gap:16px;min-width:0;">
          <img src="${assets.logo || ''}" alt="" style="height:34px;width:auto;object-fit:contain;" />
          <div style="min-width:0;">
            <div style="font-family:Poppins, system-ui, sans-serif;font-size:34px;line-height:1.03;font-weight:700;letter-spacing:-0.03em;color:#fff;white-space:normal;word-break:break-word;">${formatPointNameHtml(point.nome || 'PONTO SEM NOME', { innerStyle: 'font-size:0.66em;font-weight:600;letter-spacing:-0.01em;' })}</div>
            <div style="margin-top:6px;font-size:18px;line-height:1.4;color:rgba(255,255,255,0.68);">${escapeHtml(point.cidade || '-')} · ${escapeHtml(point.tipo || '-')}${coords ? ` <span style="font-size:14px;color:rgba(255,255,255,0.4);">· ${escapeHtml(coords)}</span>` : ''}</div>
          </div>
        </div>
        <div data-calibration-id="proposal.point.counter" style="display:inline-grid;grid-template-columns:auto auto auto;align-items:center;justify-content:center;column-gap:${layout.counterGap}px;min-width:${layout.counterMinWidth}px;min-height:${layout.counterMinHeight}px;padding:0 ${layout.counterPaddingX}px;border-radius:20px;background:#111;border:1px solid rgba(255,255,255,0.08);font-size:18px;font-weight:700;color:#fff;line-height:1;font-family:Poppins, system-ui, sans-serif;">
          <span style="display:block;color:${BRAND_ORANGE};transform:translateY(1px);">${index}</span>
          <span style="display:block;color:rgba(255,255,255,0.56);transform:translateY(1px);">/</span>
          <span style="display:block;color:rgba(255,255,255,0.86);transform:translateY(1px);">${total}</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.18fr 0.82fr;gap:24px;min-height:0;">
        <div data-calibration-id="proposal.point.imageFrame" style="position:relative;min-width:0;">
          <div style="position:absolute;inset:0;padding:26px;border-radius:34px;background:linear-gradient(180deg,#121212 0%,#090909 100%);border:1px solid rgba(255,255,255,0.08);box-sizing:border-box;">
            ${imageFrameHtml}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px;min-width:0;">
          <div data-calibration-id="proposal.point.addressBox" style="padding:26px 28px;border-radius:30px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Entorno relevante</div>
            <div style="margin-top:10px;font-size:38px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(relevantPlacesCount)}</div>
            <div style="margin-top:8px;font-size:14px;line-height:1.45;color:rgba(255,255,255,0.72);">${escapeHtml(relevantPlacesCount === 1 ? 'local relevante no raio analisado.' : 'locais relevantes no raio analisado.')}</div>
          </div>

          <div style="padding:22px 24px;border-radius:28px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Qualificação do público</div>
            <div style="margin-top:10px;display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 14px;border-radius:999px;background:rgba(254,92,43,0.16);border:1px solid rgba(254,92,43,0.24);font-size:15px;font-weight:700;color:${BRAND_ORANGE};">${escapeHtml(audience.badge)}</div>
            <div style="margin-top:12px;font-size:22px;line-height:1.35;color:#fff;font-weight:700;word-break:break-word;">${escapeHtml(audience.headline)}</div>
            <div style="margin-top:10px;font-size:16px;line-height:1.5;color:rgba(255,255,255,0.72);word-break:break-word;">${escapeHtml(audience.summary)}</div>
          </div>

          <div style="padding:22px 24px;border-radius:28px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Entorno relevante</div>
            <div style="margin-top:10px;font-size:20px;line-height:1.35;color:#fff;font-weight:700;word-break:break-word;">${escapeHtml(environment.headline)}</div>
            <div style="margin-top:8px;font-size:15px;line-height:1.45;color:rgba(255,255,255,0.68);word-break:break-word;">${escapeHtml(environment.summary)}</div>
          </div>

          <div data-calibration-id="proposal.point.statsList" style="display:grid;grid-template-columns:1fr;gap:14px;">
            ${stats.map((item) => `
              <div style="padding:18px 20px;border-radius:24px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(item.label)}</div>
                <div style="margin-top:10px;font-size:26px;line-height:1.25;color:#fff;font-weight:700;word-break:break-word;">${escapeHtml(item.value)}</div>
              </div>
            `).join('')}
          </div>

        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

function resolvePointCoordinates(point) {
  const candidates = [
    { lat: point?.lat, lng: point?.lng },
    { lat: point?.latitude, lng: point?.longitude },
    { lat: point?.entornoMetrics?.latitude, lng: point?.entornoMetrics?.longitude }
  ];

  for (const candidate of candidates) {
    const lat = Number(candidate.lat);
    const lng = Number(candidate.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001) {
      return { lat, lng };
    }
  }

  return null;
}

function hashToAngle(value) {
  const source = String(value || 'seed');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash % 360);
  return (normalized * Math.PI) / 180;
}

function buildEntornoEvidenceMapSvg(rows) {
  const width = 980;
  const height = 380;
  const padding = 34;
  const points = rows
    .map((row, index) => {
      const coord = resolvePointCoordinates(row.point);
      if (!coord) return null;
      return {
        ...coord,
        index: index + 1,
        row
      };
    })
    .filter(Boolean);

  const realPlaceCoords = [];

  points.forEach((entry) => {
    const rawPlaces = Array.isArray(entry.row.rawPlaces) ? entry.row.rawPlaces.slice(0, 8) : [];
    rawPlaces.forEach((place, placeIndex) => {
      const lat = Number(place?.lat);
      const lng = Number(place?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001) {
        realPlaceCoords.push({
          lat,
          lng,
          label: place?.name || `Local ${placeIndex + 1}`,
          category: place?.category || '',
          distance: Number(place?.distance) || 0,
          pointEntry: entry
        });
      }
    });
  });

  if (!points.length) {
    return `
      <div style="height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.62);font-size:15px;">
        Sem coordenadas v├ílidas para montar o mapa de evid├¬ncias.
      </div>
    `;
  }

  const mapSamples = [
    ...points.map((item) => ({ lat: item.lat, lng: item.lng })),
    ...realPlaceCoords.map((item) => ({ lat: item.lat, lng: item.lng }))
  ];

  const minLat = Math.min(...mapSamples.map((item) => item.lat));
  const maxLat = Math.max(...mapSamples.map((item) => item.lat));
  const minLng = Math.min(...mapSamples.map((item) => item.lng));
  const maxLng = Math.max(...mapSamples.map((item) => item.lng));

  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  const project = (lat, lng) => {
    const x = padding + ((lng - minLng) / lngSpan) * (width - padding * 2);
    const y = padding + ((maxLat - lat) / latSpan) * (height - padding * 2);
    return { x, y };
  };

  const nearbyMarkers = realPlaceCoords.map((place) => {
    const projected = project(place.lat, place.lng);
    return {
      x: projected.x,
      y: projected.y,
      label: place.label,
      category: place.category,
      distance: place.distance
    };
  });

  const hasRealNearbyCoords = nearbyMarkers.length > 0;

  if (!hasRealNearbyCoords) {
    points.forEach((entry) => {
      const base = project(entry.lat, entry.lng);
      const rawPlaces = Array.isArray(entry.row.rawPlaces) ? entry.row.rawPlaces.slice(0, 5) : [];

      rawPlaces.forEach((place, placeIndex) => {
        const distance = Math.max(70, Math.min(1000, Number(place?.distance) || 220));
        const angle = hashToAngle(`${entry.row.point?.id || entry.index}-${place?.name || placeIndex}`);
        const radiusPx = 14 + (distance / 1000) * 62;
        const x = Math.max(padding, Math.min(width - padding, base.x + Math.cos(angle) * radiusPx));
        const y = Math.max(padding, Math.min(height - padding, base.y + Math.sin(angle) * radiusPx));

        nearbyMarkers.push({
          x,
          y,
          label: place?.name || `Local ${placeIndex + 1}`,
          category: place?.category || '',
          distance
        });
      });
    });
  }

  const pointMarkersSvg = points.map((entry) => {
    const { x, y } = project(entry.lat, entry.lng);
    return `
      <g>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="rgba(254,92,43,0.28)" stroke="rgba(254,92,43,0.5)" stroke-width="1"></circle>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.2" fill="${BRAND_ORANGE}"></circle>
        <text x="${x.toFixed(1)}" y="${(y + 3.2).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#0a0a0a">${entry.index}</text>
      </g>
    `;
  }).join('');

  const nearbyMarkersSvg = nearbyMarkers.map((marker) => `
    <g>
      <circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="4" fill="rgba(255,255,255,0.74)" stroke="rgba(255,255,255,0.32)" stroke-width="1"></circle>
      <title>${escapeHtml(`${marker.label} ÔÇó ${Math.round(marker.distance)} m`)}</title>
    </g>
  `).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa esquem├ítico de pontos e entorno">
      <defs>
        <pattern id="gridPattern" width="38" height="38" patternUnits="userSpaceOnUse">
          <path d="M 38 0 L 0 0 0 38" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="rgba(8,8,8,0.78)" />
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="url(#gridPattern)" />
      ${nearbyMarkersSvg}
      ${pointMarkersSvg}
    </svg>
  `;
}

function buildProposalEntornoEvidencePage({ proposalCity, proposalPoints, segmento, assets }) {
  const segmentLabel = getSegmentDisplayName(segmento);
  const pointsWithEntorno = proposalPoints
    .filter((point) => Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) > 0)
    .sort((a, b) => {
      const scoreA = Number(a?.entornoMetrics?.score_relevancia) || 0;
      const scoreB = Number(b?.entornoMetrics?.score_relevancia) || 0;
      return scoreB - scoreA;
    });

  const rows = (pointsWithEntorno.length ? pointsWithEntorno : proposalPoints)
    .slice(0, 5)
    .map((point) => {
      const summary = buildEntornoSummary(point?.entornoMetrics, segmento);
      const metrics = point?.entornoMetrics || {};
      const totalLocais = Number(metrics.total_estabelecimentos_relacionados) || 0;
      const score = Number(metrics.score_relevancia) || 0;
      const places = summary.places.slice(0, 2).map((place) => `${place.name} (${place.distanceLabel})`);
      return {
        point,
        totalLocais,
        score,
        places,
        summary,
        rawPlaces: Array.isArray(metrics.places) ? metrics.places : []
      };
    });

  const evidenceMapSvg = buildEntornoEvidenceMapSvg(rows);

  return createPage(`
    <div style="position:absolute;inset:0;background:#050505;"></div>
    <img src="${assets.wallpaper || assets.heroBg || ''}" alt="" style="position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(18px) saturate(1.1);opacity:0.12;" />
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.68),rgba(0,0,0,0.9));"></div>

    <div style="position:relative;z-index:1;height:100%;padding:48px 62px;box-sizing:border-box;display:grid;grid-template-rows:auto auto auto 1fr;gap:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 16px;border-radius:999px;background:rgba(254,92,43,0.16);border:1px solid rgba(254,92,43,0.24);font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Evid├¬ncias de entorno</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.62);">${escapeHtml(proposalCity || 'M├║ltiplas pra├ºas')} ÔÇó ${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="padding:18px 22px;border-radius:22px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;">
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos com ader├¬ncia</div>
          <div style="margin-top:8px;font-size:34px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(pointsWithEntorno.length)}</div>
        </div>
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Total de pontos da proposta</div>
          <div style="margin-top:8px;font-size:34px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(proposalPoints.length)}</div>
        </div>
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Foco do segmento</div>
          <div style="margin-top:8px;font-size:26px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(segmentLabel)}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:14px;min-height:320px;">
        <div style="border-radius:20px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);overflow:hidden;position:relative;">
          <div style="position:absolute;top:10px;left:12px;z-index:2;padding:5px 10px;border-radius:999px;border:1px solid rgba(254,92,43,0.26);background:rgba(254,92,43,0.14);font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${BRAND_ORANGE};">Mapa esquem├ítico de evid├¬ncias</div>
          <div style="position:absolute;right:12px;bottom:10px;z-index:2;display:flex;gap:10px;align-items:center;font-size:11px;color:rgba(255,255,255,0.68);">
            <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:999px;background:${BRAND_ORANGE};display:inline-block;"></span>Pontos</span>
            <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:999px;background:rgba(255,255,255,0.8);display:inline-block;"></span>Entorno</span>
          </div>
          <div style="position:absolute;inset:0;padding:10px;box-sizing:border-box;">${evidenceMapSvg}</div>
        </div>

        <div style="display:grid;gap:10px;align-content:start;">
          ${rows.slice(0, 3).map(({ point, totalLocais, score }) => `
            <div style="padding:14px 14px;border-radius:16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:16px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(point.nome || 'Ponto sem nome')}</div>
              <div style="margin-top:5px;font-size:12px;color:rgba(255,255,255,0.68);">${escapeHtml(point.cidade || '-')} ÔÇó ${escapeHtml(point.tipo || '-')}</div>
              <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div style="font-size:12px;color:rgba(255,255,255,0.62);">Locais relevantes</div>
                <div style="font-size:20px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(totalLocais)}</div>
              </div>
              <div style="margin-top:4px;font-size:12px;color:${BRAND_ORANGE};font-weight:700;">score ${score.toFixed(1).replace('.', ',')}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display:grid;gap:10px;align-content:start;">
        ${rows.map(({ point, totalLocais, score, places, summary }) => `
          <div style="padding:14px 16px;border-radius:18px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);display:grid;grid-template-columns:2fr 0.8fr 1.5fr;gap:14px;align-items:start;">
            <div>
              <div style="font-size:17px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(point.nome || 'Ponto sem nome')}</div>
              <div style="margin-top:3px;font-size:12px;color:rgba(255,255,255,0.65);">${escapeHtml(point.cidade || '-')} ÔÇó ${escapeHtml(point.tipo || '-')}</div>
              <div style="margin-top:8px;font-size:12px;line-height:1.42;color:rgba(255,255,255,0.78);">${escapeHtml(summary.summary)}</div>
            </div>
            <div>
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Locais / score</div>
              <div style="margin-top:8px;font-size:20px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(totalLocais)}</div>
              <div style="margin-top:4px;font-size:12px;color:${BRAND_ORANGE};font-weight:700;">score ${score.toFixed(1).replace('.', ',')}</div>
            </div>
            <div style="display:grid;gap:6px;">
              ${(places.length ? places : ['Sem locais pr├│ximos listados no cache atual.']).map((label) => `
                <div style="padding:8px 10px;border-radius:12px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);font-size:11px;color:rgba(255,255,255,0.82);line-height:1.35;word-break:break-word;">${escapeHtml(label)}</div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `, BRAND_DARK);
}

async function loadPdfAssets() {
  if (pdfAssetsPromise) {
    return pdfAssetsPromise;
  }

  pdfAssetsPromise = (async () => {
    const [
      logo,
      logoHorizontal,
      logo07,
      heroBg,
      cityBg,
      about1,
      about2,
      audience,
      showcase,
      wallpaper,
      pattern
    ] = await Promise.all([
      imageToDataUrl(assetUrl('/logo.png')),
      imageToDataUrl(assetUrl('/logo-deitado.png')),
      imageToDataUrl(assetUrl('/logo-07.png')),
      imageToDataUrl(assetUrl('/hero-bg.jpg')),
      imageToDataUrl(assetUrl('/city-bg.jpg')),
      imageToDataUrl(assetUrl('/about-1.jpg')),
      imageToDataUrl(assetUrl('/about-2.jpg')),
      imageToDataUrl(assetUrl('/audience.jpg')),
      imageToDataUrl(assetUrl('/showcase.png')),
      imageToDataUrl(assetUrl('/wallpaper.jpg')),
      imageToDataUrl(assetUrl('/patterns/INTERMIDIA_PATTERN_ID.VISUAL_2024_INTERMIDIA_PATTERN_ID.VISUAL-4.png'))
    ]);

    return {
      logo,
      logoHorizontal,
      logo07,
      heroBg,
      cityBg,
      about1,
      about2,
      audience,
      showcase,
      wallpaper,
      pattern
    };
  })();

  return pdfAssetsPromise;
}

function buildCampaignScorePage({ proposalPoints, segmento, assets }) {
  const segmentLabel = getSegmentDisplayName(segmento);
  const rows = proposalPoints.map((point) => {
    const score = Number(point?.entornoMetrics?.score_relevancia) || 0;
    const total = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
    return { nome: point.nome || 'Ponto sem nome', cidade: point.cidade || '-', score, total };
  }).sort((a, b) => b.score - a.score);

  const maxScore = Math.max(...rows.map((r) => r.score), 1);

  return createPage(`
    <div style="position:absolute;inset:0;background:#050505;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.08) 0%,transparent 40%);"></div>
    <div style="position:relative;z-index:1;height:100%;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 18px;border-radius:999px;background:rgba(254,92,43,0.16);border:1px solid rgba(254,92,43,0.24);font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Score da campanha</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="padding:22px 26px;border-radius:24px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos com score</div>
          <div style="margin-top:10px;font-size:42px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${rows.filter((r) => r.score > 0).length}</div>
        </div>
        <div style="padding:22px 26px;border-radius:24px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Score médio</div>
          <div style="margin-top:10px;font-size:42px;line-height:1;font-weight:700;color:${BRAND_ORANGE};font-family:Poppins, system-ui, sans-serif;">${rows.length ? (rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(1).replace('.', ',') : '0,0'}</div>
        </div>
      </div>

      <div style="flex:1;display:grid;gap:12px;align-content:start;overflow:hidden;">
        ${rows.map((row) => {
          const bar = Math.max(2, Math.round((row.score / maxScore) * 100));
          const color = row.score >= 7 ? BRAND_ORANGE : row.score >= 4 ? '#fff' : 'rgba(255,255,255,0.45)';
          return `
            <div style="display:grid;grid-template-columns:2fr 0.4fr 1.4fr;gap:14px;align-items:center;padding:16px 20px;border-radius:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);">
              <div>
                <div style="font-size:18px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${escapeHtml(row.nome)}</div>
                <div style="margin-top:3px;font-size:13px;color:rgba(255,255,255,0.55);">${escapeHtml(row.cidade)} · ${row.total} locais relevantes</div>
              </div>
              <div style="text-align:right;font-size:28px;font-weight:700;color:${color};font-family:Poppins, system-ui, sans-serif;">${row.score.toFixed(1).replace('.', ',')}</div>
              <div style="height:10px;border-radius:999px;background:rgba(255,255,255,0.1);overflow:hidden;">
                <div style="height:100%;width:${bar}%;border-radius:999px;background:${color};"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `, BRAND_DARK);
}

function buildCoverageLayerPage({ proposalPoints, segmento, proposalTotals, assets }) {
  const segmentLabel = getSegmentDisplayName(segmento);
  const withEntorno = proposalPoints.filter((p) => Number(p?.entornoMetrics?.total_estabelecimentos_relacionados) > 0);
  const coveragePct = proposalPoints.length ? Math.round((withEntorno.length / proposalPoints.length) * 100) : 0;
  const totalLocais = proposalPoints.reduce((s, p) => s + (Number(p?.entornoMetrics?.total_estabelecimentos_relacionados) || 0), 0);

  return createPage(`
    <div style="position:absolute;inset:0;background:#050505;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.06) 0%,transparent 40%);"></div>
    <div style="position:relative;z-index:1;height:100%;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 18px;border-radius:999px;background:rgba(254,92,43,0.16);border:1px solid rgba(254,92,43,0.24);font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Cobertura e presença</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
        ${[
          { label: 'Pontos na proposta', value: formatInt(proposalPoints.length) },
          { label: 'Com entorno analisado', value: formatInt(withEntorno.length) },
          { label: 'Cobertura do segmento', value: `${coveragePct}%` },
          { label: 'Total de locais mapeados', value: formatInt(totalLocais) }
        ].map((card) => `
          <div style="padding:22px 20px;border-radius:22px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(card.label)}</div>
            <div style="margin-top:10px;font-size:36px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${escapeHtml(card.value)}</div>
          </div>
        `).join('')}
      </div>

      <div style="flex:1;display:grid;gap:12px;align-content:start;overflow:hidden;">
        <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);">Presença por ponto</div>
        ${proposalPoints.map((point) => {
          const locais = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
          const score = Number(point?.entornoMetrics?.score_relevancia) || 0;
          const hasData = locais > 0;
          return `
            <div style="display:grid;grid-template-columns:1.8fr 0.5fr 0.5fr 1.2fr;gap:14px;align-items:center;padding:14px 18px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);">
              <div>
                <div style="font-size:16px;font-weight:700;color:#fff;">${escapeHtml(point.nome || 'Ponto')}</div>
                <div style="margin-top:2px;font-size:12px;color:rgba(255,255,255,0.5);">${escapeHtml(point.cidade || '-')} · ${escapeHtml(point.tipo || '-')}</div>
              </div>
              <div style="font-size:22px;font-weight:700;color:${hasData ? '#fff' : 'rgba(255,255,255,0.3)'};font-family:Poppins;">${formatInt(locais)}</div>
              <div style="font-size:18px;font-weight:700;color:${score >= 6 ? BRAND_ORANGE : 'rgba(255,255,255,0.4)'};font-family:Poppins;">${score.toFixed(1).replace('.', ',')}</div>
              <div style="height:8px;border-radius:999px;background:rgba(255,255,255,0.1);overflow:hidden;">
                <div style="height:100%;width:${Math.min(100, score * 10)}%;border-radius:999px;background:${score >= 6 ? BRAND_ORANGE : 'rgba(255,255,255,0.4)'};"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `, BRAND_DARK);
}

function buildImpactPage({ proposalPoints, proposalTotals, pricingSummary, simulationSummary, segmento, assets }) {
  const segmentLabel = getSegmentDisplayName(segmento);
  const fluxoTotal = Number(proposalTotals?.fluxoTotal) || 0;
  const insercoesTotal = Number(proposalTotals?.insercoesTotal) || 0;
  const cpm = Number(proposalTotals?.cpmEstimado) || 0;
  const finalTotal = pricingSummary?.finalTotal ?? proposalTotals?.valorTotal ?? 0;
  const mesesCampanha = 3;
  const impactos3m = fluxoTotal * mesesCampanha;

  return createPage(`
    <div style="position:absolute;inset:0;background:#050505;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.1) 0%,transparent 50%);"></div>
    <div style="position:relative;z-index:1;height:100%;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 18px;border-radius:999px;background:rgba(254,92,43,0.16);border:1px solid rgba(254,92,43,0.24);font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Impacto da campanha</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
        ${[
          { label: 'Impactos/mês', value: formatInt(fluxoTotal) },
          { label: `Impactos em ${mesesCampanha} meses`, value: formatInt(impactos3m) },
          { label: 'CPM estimado', value: formatDecimalMoney(cpm) }
        ].map((card) => `
          <div style="padding:26px 28px;border-radius:26px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(card.label)}</div>
            <div style="margin-top:12px;font-size:42px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${escapeHtml(card.value)}</div>
          </div>
        `).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:20px;flex:1;">
        <div style="padding:28px 30px;border-radius:28px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:14px;">
          <div style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Impacto por ponto</div>
          ${proposalPoints.map((p) => `
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
              <div style="font-size:16px;color:#fff;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.nome || 'Ponto')}</div>
              <div style="flex-shrink:0;font-size:15px;color:rgba(255,255,255,0.72);">${formatInt(p.fluxo || 0)}/mês</div>
            </div>
          `).join('')}
        </div>

        <div style="padding:28px 30px;border-radius:28px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:16px;">
          <div style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};">Resumo financeiro</div>
          ${[
            { label: 'Mín. Inserções/mês', value: formatInt(insercoesTotal) },
            { label: 'Valor Negociado', value: formatMoney(finalTotal) },
            { label: 'Custo por impacto', value: fluxoTotal > 0 ? `R$ ${(finalTotal / fluxoTotal).toFixed(2).replace('.', ',')}` : '-' }
          ].map((row) => `
            <div>
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(row.label)}</div>
              <div style="margin-top:6px;font-size:26px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${escapeHtml(row.value)}</div>
            </div>
          `).join('')}
          ${simulationSummary ? `<div style="margin-top:auto;padding:12px 14px;border-radius:14px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.07);font-size:12px;line-height:1.5;color:rgba(255,255,255,0.6);">${escapeHtml(simulationSummary)}</div>` : ''}
        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

export async function generateMidiaKitPdf({ praca, pontos }) {
  activePdfLayoutConfig = await loadPdfLayoutConfig();
  const cidade = praca && praca !== 'Todas as pra├ºas' ? praca : 'Consolidado';
  const kitPontos = Array.isArray(pontos) ? pontos : [];
  const resumo = buildResumo(kitPontos);
  const assets = await loadPdfAssets();
  const cityStats = {
    cidade,
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
    const formatTelas = items.reduce((sum, { ponto }) => sum + (Number(ponto.telas) || 0), 0);
    const formatEnderecos = new Set(items.map(({ ponto }) => `${ponto.cidade || ''}-${ponto.endereco || ''}`.trim())).size;
    pages.push(buildMidiaKitFormatDividerPage({ tipo, formatStats: { telas: formatTelas, enderecos: formatEnderecos }, cityStats, assets }));
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
  segmento,
  strategicText,
  simulationSummary,
  pricingSummary,
  showCampaignScore = true,
  showCoverageLayer = true,
  showImpactSection = true
}) {
  activePdfLayoutConfig = await loadPdfLayoutConfig();
  const proposalPoints = Array.isArray(points) ? points : [];
  const proposalTotals = totals || { valorTotal: 0, fluxoTotal: 0, cpmEstimado: 0, insercoesTotal: 0 };
  const proposalCity = city || 'Múltiplas praças';
  const proposalClient = clientName || 'Cliente não informado';
  const highlights = normalizeLines(strategicText, 4);
  const assets = await loadPdfAssets();
  const proposalImages = await Promise.all(proposalPoints.map((point) => imageToDataUrl(pickProposalImageUrl(point))));
  const proposalImages2 = await Promise.all(proposalPoints.map((point) => {
    if (point.tipo === 'Elevador' && point.imagem2) {
      return imageToDataUrl(point.imagem2.startsWith('http') ? point.imagem2 : assetUrl(point.imagem2));
    }
    return Promise.resolve(null);
  }));

  const pages = [
    buildProposalCoverPage({
      proposalClient,
      proposalCity,
      proposalPoints,
      proposalTotals,
      pricingSummary,
      highlights,
      simulationSummary,
      segmento,
      assets
    })
  ];

  proposalPoints.forEach((point, index) => {
    pages.push(buildProposalPointPage({
      point,
      index: index + 1,
      total: proposalPoints.length,
      image: proposalImages[index],
      image2: proposalImages2[index] || null,
      segmento,
      assets
    }));
  });

  pages.push(buildProposalEntornoEvidencePage({
    proposalCity,
    proposalPoints,
    segmento,
    assets
  }));

  if (showCampaignScore) {
    pages.push(buildCampaignScorePage({ proposalPoints, segmento, assets }));
  }

  if (showCoverageLayer) {
    pages.push(buildCoverageLayerPage({ proposalPoints, segmento, proposalTotals, assets }));
  }

  if (showImpactSection) {
    pages.push(buildImpactPage({ proposalPoints, proposalTotals, pricingSummary, simulationSummary, segmento, assets }));
  }

  const fileName = `proposta-${slugify(proposalClient)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  await renderPagesToPdf(pages, fileName);
}
