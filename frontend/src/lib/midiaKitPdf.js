import { loadPdfLayoutConfig } from './pdfLayoutConfig';
import { buildAudienceQualification, buildEntornoSummary, getSegmentDisplayName, sortFormatos } from './strategy';

const PAGE_WIDTH = 1366;
const PAGE_HEIGHT = 768;
export const PDF_PAGE_SIZE = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
const BRAND_ORANGE = '#E8591A';
const BRAND_DARK = '#0A0A0A';
const BRAND_PANEL = '#171717';
const BRAND_BORDER = 'rgba(255,255,255,0.08)';
const PROPOSAL_ACCENT = '#FF5A1F';
const PROPOSAL_BG = '#000000';
const PROPOSAL_SURFACE = '#111111';
const PROPOSAL_SURFACE_ALT = '#161616';
const PROPOSAL_BORDER = 'rgba(255,255,255,0.08)';
const PROPOSAL_LABEL = 'rgba(255,255,255,0.35)';
const PROPOSAL_TEXT_SECONDARY = 'rgba(255,255,255,0.55)';

const CITY_STATE_MAP = {
  'londrina': 'Paraná',
  'maringá': 'Paraná',
  'maringa': 'Paraná',
  'balneário camboriú': 'Santa Catarina',
  'balneario camboriu': 'Santa Catarina',
  'itajaí': 'Santa Catarina',
  'itajai': 'Santa Catarina',
  'curitiba': 'Paraná',
  'florianópolis': 'Santa Catarina',
  'florianopolis': 'Santa Catarina',
};
function getCityState(cidade) {
  const key = String(cidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const keyRaw = String(cidade || '').toLowerCase();
  return CITY_STATE_MAP[keyRaw] || CITY_STATE_MAP[key] || '';
}

const imageCache = new Map();
const IMAGE_FETCH_TIMEOUT_MS = 15000;
let pdfAssetsPromise = null;
let activePdfLayoutConfig = null;

function getActivePdfLayoutConfig() {
  return activePdfLayoutConfig;
}

function formatInt(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function getElevadorCategoria(point) {
  const normalized = String(point?.elevador_categoria || '').trim().toLowerCase();
  if (normalized === 'residencial') return 'Residencial';
  return 'Comercial';
}

function getPointTypeLabel(point) {
  const tipo = String(point?.tipo || '').trim();
  if (tipo === 'Elevador') {
    return `Elevador - ${getElevadorCategoria(point)}`;
  }
  return tipo || 'Formato';
}

function getBaseTypeLabel(typeLabel) {
  return String(typeLabel || '').split(' - ')[0].trim();
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

function formatCostPerImpact(value) {
  const numeric = Number(value) || 0;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '-';
  }

  if (numeric < 0.01) {
    return `R$ ${numeric.toFixed(4).replace('.', ',')}`;
  }

  return `R$ ${numeric.toFixed(2).replace('.', ',')}`;
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
  const applySmartBreaks = (value) => String(value || '')
    .replace(/([./-])/g, '$1<wbr>')
    .replace(/\s+\(/g, ' <wbr>(')
    .replace(/\)(\s+)/g, ')<wbr>$1');
  const regex = /\(([^)]+)\)/g;
  let html = '';
  let cursor = 0;
  let match = regex.exec(source);

  while (match) {
    html += applySmartBreaks(escapeHtml(source.slice(cursor, match.index)));
    html += `<span style="${innerStyle}">(${escapeHtml(match[1])})</span>`;
    cursor = regex.lastIndex;
    match = regex.exec(source);
  }

  html += applySmartBreaks(escapeHtml(source.slice(cursor)));
  return html;
}

function formatPointAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) return '';

  const main = raw.split('•')[0].trim().replace(/\s*\b(Parana|Santa Catarina|Sao Paulo|Rio de Janeiro|Minas Gerais)\b\s*$/i, '').trim();
  const match = main.match(/^([^,]+,\s*[^,-]+)(?:\s*-\s*([^,]+))?/);
  if (match) {
    const streetAndNumber = match[1].trim();
    const district = (match[2] || '').trim();
    return district ? `${streetAndNumber} - ${district}` : streetAndNumber;
  }

  const parts = main.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1]}`;
  }

  return main;
}

function pickImageUrl(ponto) {
  if (Array.isArray(ponto?.imagens) && ponto.imagens.length > 0) {
    const first = ponto.imagens[0];
    if (typeof first === 'string') return first;
    if (first?.url) return first.url;
  }
  return ponto?.imagem2 || ponto?.imagem || '';
}

function pickProposalImageUrl(ponto) {
  return ponto?.proposalSimulationPreview || ponto?.simulacao_preview || pickImageUrl(ponto);
}

function isVehicleFlowPoint(point) {
  const explicit = String(point?.tipo_fluxo || '').toLowerCase().trim();
  if (explicit === 'veiculos') return true;
  if (explicit === 'pessoas') {
    const tipo = String(point?.tipo || '').toLowerCase();
    if (tipo.includes('painel') && tipo.includes('led')) return true;
    return false;
  }

  const tipo = String(point?.tipo || '').toLowerCase();
  return tipo.includes('painel') && tipo.includes('led');
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

function createPage(content, background = '#050505') {
  const page = document.createElement('section');
  Object.assign(page.style, {
    display: 'block',
    width: `${PAGE_WIDTH}px`,
    height: `${PAGE_HEIGHT}px`,
    minHeight: `${PAGE_HEIGHT}px`,
    maxHeight: `${PAGE_HEIGHT}px`,
    position: 'relative',
    overflow: 'hidden',
    background,
    color: '#ffffff',
    fontFamily: 'Poppins, system-ui, sans-serif',
    boxSizing: 'border-box',
    pageBreakAfter: 'always',
    breakAfter: 'page',
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
    endereco: 'Av. Madre Leonia Milito, 1175 • Gleba Palhano',
    publico: 'A/B',
    fluxo: 128000,
    telas: 4,
    insercoes: 720,
    tempo: '15s',
    loop: '3 min',
    veiculacao: 'Vídeo sem áudio',
    horario: '06:00 às 22:00',
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
      'Cobertura premium em rotas de alta recorrência.',
      'Presença visual forte em pontos de decisão e deslocamento.',
      'Leitura comercial organizada para defesa rápida na reunião.'
    ],
    point,
    points: [point, { ...point, nome: 'AEROPORTO DE LONDRINA (SAGUÃO)', endereco: 'Av. Santos Dumont, 900' }]
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

async function renderPagesToPdf(pages, fileName) {
  const origin = window.location.origin;
  const pageHtmlParts = pages.map((p) => p.outerHTML).join('\n');
  const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<base href="${origin}">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; }
html, body { margin: 0; padding: 0; background: #000; }
@page { size: 1366px 768px; margin: 0; }
section {
  display: block;
  width: 1366px !important;
  height: 768px !important;
  overflow: hidden !important;
  page-break-after: always;
  break-after: page;
}
section:last-child {
  page-break-after: avoid;
  break-after: avoid;
}
@media print {
  html, body {
    width: 1366px;
    height: auto;
    margin: 0;
    padding: 0;
    overflow: visible;
  }
}
</style>
</head>
<body>${pageHtmlParts}</body></html>`;

  const res = await fetch('/api/pdf/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: fullHtml, fileName }),
    credentials: 'same-origin',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao gerar PDF no servidor');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildMetricCards(cards, options = {}) {
  const columns = options.columns || cards.length;
  return `
    <div style="display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:${options.gap || 18}px;">
      ${cards.map((card) => `
        ${(() => {
          const rawValue = String(card.value ?? '');
          const baseValueSize = Number(options.valueSize || 36);
          let resolvedValueSize = baseValueSize;
          if (rawValue.length >= 16) {
            resolvedValueSize = Math.max(20, baseValueSize - 14);
          } else if (rawValue.length >= 12) {
            resolvedValueSize = Math.max(24, baseValueSize - 10);
          } else if (rawValue.length >= 10) {
            resolvedValueSize = Math.max(28, baseValueSize - 6);
          }
          return `
        <div style="border:1px solid ${options.borderColor || BRAND_BORDER};background:${options.background || 'rgba(255,255,255,0.06)'};border-radius:${options.radius || 26}px;padding:${options.padding || '24px 26px'};backdrop-filter:blur(10px);min-height:${options.minHeight || 0}px;box-sizing:border-box;">
          <div style="display:flex;align-items:center;gap:12px;color:${options.labelColor || 'rgba(255,255,255,0.72)'};font-size:${options.labelSize || 16}px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:${options.iconSize || 36}px;height:${options.iconSize || 36}px;border-radius:999px;background:rgba(254,92,43,0.18);color:${BRAND_ORANGE};font-weight:700;line-height:1;flex:0 0 auto;">${card.iconHtml || escapeHtml(card.icon || '•')}</span>
            <span style="line-height:1.2;">${escapeHtml(card.label)}</span>
          </div>
          <div style="margin-top:18px;padding-bottom:4px;font-family:Poppins, system-ui, sans-serif;font-size:${resolvedValueSize}px;line-height:1.16;font-weight:700;color:${options.valueColor || '#ffffff'};letter-spacing:-0.03em;word-break:${options.valueWordBreak || 'break-word'};white-space:${options.valueWhiteSpace || 'normal'};max-width:100%;overflow:visible;">${escapeHtml(rawValue)}</div>
        </div>
          `;
        })()}
      `).join('')}
    </div>
  `;
}

function proposalIcon(kind) {
  const blk = `style="display:block;flex-shrink:0;"`;
  if (kind === 'target') {
    return `<span style="display:block;flex-shrink:0;width:16px;height:16px;position:relative;"><span style="position:absolute;inset:0;border:2px solid ${PROPOSAL_ACCENT};border-radius:999px;opacity:0.85;"></span><span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:6px;height:6px;border-radius:999px;background:${PROPOSAL_ACCENT};"></span></span>`;
  }
  if (kind === 'flow') {
    return `<svg viewBox="0 0 24 24" width="16" height="16" ${blk} fill="none" stroke="${PROPOSAL_ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7a8 8 0 0 0-13.7-2.5"></path><path d="M17 7h3V4"></path><path d="M4 17a8 8 0 0 0 13.7 2.5"></path><path d="M7 17H4v3"></path></svg>`;
  }
  if (kind === 'money') {
    return `<svg viewBox="0 0 24 24" width="16" height="16" ${blk} fill="none" stroke="${PROPOSAL_ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M9.2 10.2c0-1.1 1-2 2.2-2h1.2c1.1 0 2 .8 2 1.9 0 .9-.6 1.6-1.5 1.9l-2.1.6c-.9.3-1.5 1-1.5 1.9 0 1.1.9 1.9 2 1.9h1.3c1.2 0 2.2-.9 2.2-2"></path></svg>`;
  }
  if (kind === 'cpm') {
    return `<svg viewBox="0 0 24 24" width="16" height="16" ${blk} fill="none" stroke="${PROPOSAL_ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15a7 7 0 1 1 14 0"></path><path d="M12 11.5 15.8 9"></path><circle cx="12" cy="15" r="1.3" fill="${PROPOSAL_ACCENT}" stroke="none"></circle><path d="M7.5 17h9"></path></svg>`;
  }
  return `<span style="display:block;flex-shrink:0;width:8px;height:8px;border-radius:999px;background:${PROPOSAL_ACCENT};"></span>`;
}

function formatPointCountLabel(count) {
  return `${count} ${count === 1 ? 'ponto' : 'pontos'}`;
}

function buildHeroImageFrame(image, options = {}) {
  if (!image) {
    return `
      <div style="height:100%;border-radius:${options.radius || 30}px;border:1px solid ${BRAND_BORDER};background:linear-gradient(135deg,#121212,#1B1B1B);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.62);font-size:28px;font-weight:600;">
        Imagem indisponível
      </div>
    `;
  }

  const mainImageStyle = options.fit === 'cover'
    ? 'display:block;width:100%;height:100%;object-fit:cover;object-position:center;'
    : 'display:block;max-width:100%;max-height:100%;width:auto;height:auto;';

  return `
    <div style="position:relative;height:100%;border-radius:${options.radius || 30}px;overflow:hidden;border:1px solid ${BRAND_BORDER};background:#050505;">
      <img src="${image}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(26px) saturate(1.1);transform:scale(1.08);opacity:0.45;" />
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,7,7,0.12),rgba(7,7,7,0.62));"></div>
      <div style="position:absolute;left:28px;top:28px;right:28px;bottom:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${image}" alt="" style="${mainImageStyle}filter:drop-shadow(0 24px 44px rgba(0,0,0,0.45));" />
      </div>
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

function midiaKitDetailIcon(kind, color = BRAND_ORANGE, size = 18) {
  const common = `fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;
  const wh = `width="${size}" height="${size}"`;
  const blk = `style="display:block;flex-shrink:0;"`;
  const icons = {
    location: `<svg viewBox="0 0 24 24" ${wh} ${blk} ${common}><path d="M12 21s6-4.6 6-10a6 6 0 1 0-12 0c0 5.4 6 10 6 10Z"></path><circle cx="12" cy="11" r="2.3"></circle></svg>`,
    coordinates: `<svg viewBox="0 0 24 24" ${wh} ${blk} ${common}><path d="M12 3v4"></path><path d="M12 17v4"></path><path d="M3 12h4"></path><path d="M17 12h4"></path><circle cx="12" cy="12" r="4.5"></circle></svg>`,
    type: `<svg viewBox="0 0 24 24" ${wh} ${blk} ${common}><rect x="3" y="5" width="18" height="12" rx="2"></rect><path d="M9 20h6"></path><path d="M12 17v3"></path></svg>`,
    city: `<svg viewBox="0 0 24 24" ${wh} ${blk} ${common}><path d="M4 20V8l6-3v15"></path><path d="M10 20V4l6 2v14"></path><path d="M16 20v-9l4 2v7"></path></svg>`,
    money: `<svg viewBox="0 0 24 24" ${wh} ${blk} ${common}><circle cx="12" cy="12" r="8"></circle><path d="M9.3 10.2c0-1 1-1.9 2.2-1.9h1.1c1.1 0 2 .7 2 1.8 0 .9-.6 1.6-1.5 1.9l-2 .6c-.9.3-1.5 1-1.5 1.8 0 1.1.9 1.9 2 1.9h1.4c1.2 0 2.2-.9 2.2-2"></path></svg>`
  };

  return icons[kind] || icons.location;
}

function formatCoordinates(ponto) {
  const lat = Number(ponto?.lat);
  const lng = Number(ponto?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Coordenadas não informadas';
  }

  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function buildMidiaKitCoverPage({ cidade, pontos, resumo, assets }) {
  const estado = getCityState(cidade);
  const totalFormatos = new Set(pontos.map((ponto) => ponto.tipo).filter(Boolean)).size;
  const totalPublicos = new Set(pontos.map((ponto) => ponto.publico).filter(Boolean)).size;
  const totalEnderecos = new Set(pontos.map((ponto) => `${ponto.cidade || ''}-${ponto.endereco || ''}`.trim()).filter(Boolean)).size;
  const heroImage = assets.cityBg || assets.heroBg || assets.showcase || '';
  const cards = [
    { label: 'Pontos ativos', value: formatInt(pontos.length), icon: 'type' },
    { label: 'Telas disponíveis', value: formatInt(resumo.telas), icon: 'type' },
    { label: 'Fluxo mensal', value: formatInt(resumo.fluxo), icon: 'coordinates' },
    { label: 'Formatos no kit', value: formatInt(totalFormatos), icon: 'city' }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:#050505;"></div>
    <div style="position:absolute;inset:0;background:url('${heroImage}') center/cover no-repeat;opacity:0.22;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#050505 12%,rgba(5,5,5,0.9) 48%,rgba(5,5,5,0.96) 100%);"></div>

    <div style="position:absolute;left:76px;top:72px;right:76px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;">
      <img src="${assets.logo || ''}" alt="" style="width:178px;height:auto;object-fit:contain;" />
      <span style="display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 18px;border-radius:999px;background:${BRAND_ORANGE};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fff;">OOH + DOOH 2026</span>
    </div>

    <div style="position:absolute;left:76px;top:148px;width:640px;max-height:310px;overflow:hidden;">
      <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_ORANGE};">Cobertura estratégica por praça</div>
      <div style="margin-top:18px;font-family:Poppins, system-ui, sans-serif;font-size:68px;line-height:0.94;font-weight:700;letter-spacing:-0.05em;color:#fff;text-transform:uppercase;">${escapeHtml(cidade)}</div>
      ${estado ? `<div style="margin-top:10px;font-size:20px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.72);">${escapeHtml(estado)}</div>` : ''}
      <div style="margin-top:16px;max-width:640px;font-size:18px;line-height:1.32;color:rgba(255,255,255,0.84);">Inventário premium para planejar presença urbana com escala, frequência e impacto visual na praça.</div>
    </div>

    <div style="position:absolute;left:76px;right:76px;bottom:52px;display:flex;flex-direction:column;gap:0;">
      <div style="display:grid;grid-template-columns:1.15fr 0.85fr;gap:34px;align-items:end;">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;column-gap:36px;">
          ${cards.map((card) => `
            <div style="padding:28px 0 24px 0;border-top:1px solid ${BRAND_ORANGE};">
              <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.56);">${escapeHtml(card.label)}</div>
              <div style="margin-top:14px;font-family:Poppins, system-ui, sans-serif;font-size:40px;line-height:0.96;font-weight:700;color:#fff;letter-spacing:-0.03em;">${escapeHtml(card.value)}</div>
            </div>
          `).join('')}
        </div>
        <div style="height:360px;">
          <div style="position:relative;height:100%;overflow:hidden;border-radius:24px;">
            <img src="${heroImage}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;" />
            <div style="position:absolute;left:0;top:0;width:100px;height:100%;background:linear-gradient(to right,#030303,transparent);"></div>
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.12);"></div>
          </div>
        </div>
      </div>
      <div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:14px;">
        <span style="display:inline-flex;align-items:center;gap:10px;padding:12px 16px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);font-size:14px;line-height:1;color:#fff;">${midiaKitDetailIcon('location', BRAND_ORANGE, 16)} ${formatInt(totalEnderecos)} endereços mapeados</span>
        <span style="display:inline-flex;align-items:center;gap:10px;padding:12px 16px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);font-size:14px;line-height:1;color:#fff;">${midiaKitDetailIcon('city', BRAND_ORANGE, 16)} ${formatInt(totalPublicos)} públicos em foco</span>
      </div>
    </div>
  `, '#030303');
}

function buildMidiaKitManifestoPage({ assets }) {
  const cards = [
    {
      title: 'Onde sua campanha aparece',
      text: 'Pontos distribuídos em regiões de alto fluxo e visibilidade dentro da praça selecionada.'
    },
    {
      title: 'Qual exposição você compra',
      text: 'Fluxo, inserções, tempo de tela e público organizados para facilitar comparação e decisão.'
    },
    {
      title: 'Como ativar com segurança',
      text: 'Fotos reais, endereço e coordenadas de cada ponto para validar contexto e aderência da campanha.'
    },
    {
      title: 'Quanto investir por formato',
      text: 'Valor mensal por ponto e leitura de mix para montar uma proposta eficiente para a meta de cobertura.'
    }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:#050505;"></div>
    <div style="position:absolute;left:78px;top:78px;right:78px;bottom:78px;border-radius:40px;background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.08);overflow:hidden;"></div>
    <div style="position:absolute;left:78px;top:78px;bottom:78px;width:760px;overflow:hidden;border-top-left-radius:40px;border-bottom-left-radius:40px;background:#0b0b0b;">
      <img src="${assets.about1 || assets.about2 || assets.showcase || ''}" alt="" style="width:100%;height:100%;object-fit:contain;object-position:center;filter:contrast(1.02);background:#0b0b0b;" />
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,5,5,0.02) 0%,rgba(5,5,5,0.28) 58%,rgba(5,5,5,0.76) 100%);"></div>
      <div style="position:absolute;left:40px;right:40px;bottom:36px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 14px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.86);">Leitura do inventário</div>
        <div style="margin-top:14px;font-family:Poppins, system-ui, sans-serif;font-size:52px;line-height:1.02;font-weight:700;color:#fff;letter-spacing:-0.03em;">Desde 2007, a Intermidia transforma localização em resultado de marca.</div>
      </div>
    </div>

    <div style="position:absolute;left:820px;right:72px;top:78px;bottom:78px;display:flex;flex-direction:column;">
      <img src="${assets.logo || ''}" alt="" style="width:180px;height:auto;object-fit:contain;" />
      <div style="margin-top:20px;font-size:14px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.52);">Visão do mídia kit</div>
      <div style="margin-top:12px;font-family:Poppins, system-ui, sans-serif;font-size:44px;line-height:1.05;font-weight:700;color:#fff;letter-spacing:-0.035em;">Planejamento com repertório, critério e experiência de mercado.</div>
      <div style="margin-top:14px;font-size:18px;line-height:1.34;color:rgba(255,255,255,0.78);">A Intermidia atua desde 2007 no OOH e no DOOH, conectando pontos premium, dados de audiência e leitura comercial para campanhas memoráveis.</div>
      <div style="margin-top:12px;font-size:15px;line-height:1.38;color:rgba(255,255,255,0.7);">Nas próximas páginas, você encontra cada formato explicado, com foto real, endereço, coordenadas e métricas para decidir com confiança.</div>

      <div style="margin-top:20px;padding-top:8px;display:grid;grid-template-columns:1fr 1fr;column-gap:18px;row-gap:8px;">
        ${cards.map((card) => `
          <div style="padding:0 0 8px;border-bottom:1px solid rgba(255,255,255,0.12);">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:rgba(254,92,43,0.18);">${midiaKitDetailIcon('type', BRAND_ORANGE, 13)}</span>
              <span style="font-size:13px;font-weight:700;color:#fff;line-height:1.2;">${escapeHtml(card.title)}</span>
            </div>
            <div style="margin-top:8px;font-size:12px;line-height:1.42;color:rgba(255,255,255,0.7);">${escapeHtml(card.text)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `, '#000');
}

function buildMidiaKitSummaryPage({ cidade, pontos, assets }) {
  const byTipo = pontos.reduce((acc, p) => {
    const tipo = getPointTypeLabel(p);
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
    .slice(0, 5);

  const totalEnderecos = new Set(pontos.map((p) => `${p.cidade || ''}-${p.endereco || ''}`.trim())).size;
  const totalPontos = pontos.length;
  const resumo = buildResumo(pontos);
  const featuredPoints = pontos.slice(0, 3);

  const cards = [
    { label: 'Endereços', value: formatInt(totalEnderecos), icon: 'location' },
    { label: 'Pontos', value: formatInt(totalPontos), icon: 'type' },
    { label: 'Telas', value: formatInt(resumo.telas), icon: 'city' },
    { label: 'Ticket médio', value: formatMoney(resumo.ticketMedio), icon: 'money' }
  ];

  const estado = getCityState(cidade);

  return createPage(`
    <div style="position:absolute;inset:0;background:#050505;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,#050505 0%,#0a0a0a 100%);"></div>

    <div style="position:absolute;left:70px;right:70px;top:70px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;">
      <div>
        <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_ORANGE};">Resumo executivo da praça</div>
        <div style="margin-top:12px;font-family:Poppins, system-ui, sans-serif;font-size:72px;line-height:0.95;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:-0.04em;">${escapeHtml(cidade)}</div>
        ${estado ? `<div style="margin-top:8px;font-size:18px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.66);">${escapeHtml(estado)}</div>` : ''}
      </div>
      <img src="${assets.logo || ''}" alt="" style="width:170px;height:auto;object-fit:contain;opacity:0.98;" />
    </div>

    <div style="position:absolute;left:70px;right:70px;top:188px;bottom:66px;display:grid;grid-template-columns:1.05fr 0.95fr;gap:28px;align-items:stretch;">
      <div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
          ${cards.map((card) => `
            <div style="padding:16px 18px;border-radius:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);">${midiaKitDetailIcon(card.icon, BRAND_ORANGE, 18)}</span>
                <span style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.56);">${escapeHtml(card.label)}</span>
              </div>
              <div style="margin-top:16px;font-family:Poppins, system-ui, sans-serif;font-size:36px;line-height:1;font-weight:700;color:#fff;">${escapeHtml(card.value)}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:12px;padding:16px 20px;border-radius:28px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);">
          <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_ORANGE};">Leitura rápida do inventário</div>
          <div style="margin-top:14px;font-size:17px;line-height:1.42;color:rgba(255,255,255,0.8);">Praça com <strong style="color:#fff;">${formatInt(totalPontos)} pontos</strong>, <strong style="color:#fff;">${formatInt(resumo.telas)} telas</strong> e fluxo mensal consolidado de <strong style="color:#fff;">${formatInt(resumo.fluxo)}</strong>. A composição por formato facilita montar uma grade equilibrada entre cobertura e frequência.</div>
        </div>
      </div>

      <div style="display:grid;grid-template-rows:auto 1fr;gap:18px;">
        <div style="padding:18px 22px;border-radius:28px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_ORANGE};">Mix de formatos</div>
            <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.44);">Top ${rows.length}</div>
          </div>
          <div style="margin-top:18px;display:grid;gap:0;">
            ${rows.map((row) => `
              <div style="display:grid;grid-template-columns:minmax(0,1fr) 92px 150px;gap:16px;align-items:center;padding:10px 4px 10px 16px;border-left:3px solid ${BRAND_ORANGE};border-bottom:1px solid rgba(255,255,255,0.08);">
                <div>
                  <div style="font-size:15px;font-weight:700;color:#fff;line-height:1.2;">${escapeHtml(row.tipo)}</div>
                  <div style="margin-top:4px;font-size:11px;color:rgba(255,255,255,0.5);">${formatInt(row.telas)} telas disponíveis</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-family:Poppins, system-ui, sans-serif;font-size:22px;line-height:1;font-weight:700;color:#fff;">${formatInt(row.pontos)}</div>
                  <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.46);">pontos</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.48);">Fluxo mensal</div>
                  <div style="margin-top:4px;font-size:16px;font-weight:700;color:${BRAND_ORANGE};">${formatInt(row.fluxo)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="padding:16px 18px;border-radius:28px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);">
          <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_ORANGE};">Pontos em destaque</div>
          <div style="margin-top:18px;display:grid;gap:8px;">
            ${featuredPoints.map((ponto, index) => `
              <div style="padding:10px 14px;border-left:3px solid ${BRAND_ORANGE};border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
                  <div style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#fff;line-height:1.2;"><span style="display:block;width:6px;height:6px;border-radius:999px;background:${BRAND_ORANGE};flex:0 0 auto;"></span>${escapeHtml(ponto.nome || `Ponto ${index + 1}`)}</div>
                  <span style="display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 10px;border-radius:999px;background:${BRAND_ORANGE};font-size:11px;font-weight:700;color:#fff;">${index + 1}</span>
                </div>
                <div style="margin-top:8px;display:flex;align-items:flex-start;gap:10px;color:rgba(255,255,255,0.66);font-size:12px;line-height:1.35;">${midiaKitDetailIcon('location', BRAND_ORANGE, 13)}<span>${escapeHtml(formatPointAddress(ponto.endereco) || 'Endereço não informado')}</span></div>
                <div style="margin-top:8px;display:flex;align-items:flex-start;gap:10px;color:rgba(255,255,255,0.66);font-size:12px;line-height:1.35;">${midiaKitDetailIcon('coordinates', BRAND_ORANGE, 13)}<span>${escapeHtml(formatCoordinates(ponto))}</span></div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
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

function getFormatDescription(tipo) {
  const normalized = String(tipo || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized.includes('backlight')) {
    return 'Backlight é um painel com iluminação interna, que mantém a arte viva dia e noite, com excelente leitura à distância e em corredores de alto fluxo.';
  }
  if (normalized.includes('frontlight')) {
    return 'Frontlight recebe iluminação externa direcionada para a lona, entregando grande impacto em avenidas e entradas de cidade com leitura ampla da mensagem.';
  }
  if (normalized.includes('elevador')) {
    return 'No elevador, a tela indoor aparece em um momento de atenção quase exclusiva, com proximidade da audiência e alta frequência de repetição no dia a dia.';
  }
  if (normalized.includes('indoor')) {
    return 'Indoor significa exibição em ambiente interno, perto da decisão de compra e do tempo de permanência do público, com contexto comercial qualificado.';
  }
  if (normalized.includes('video wall') || normalized.includes('video-wall') || normalized.includes('video wall')) {
    return 'Video Wall combina multiplos modulos para criar uma tela de grande impacto visual, ideal para storytelling de marca em pontos premium.';
  }
  if (normalized.includes('painel led') || normalized.includes('led posto') || normalized.includes('totem digital')) {
    return 'Formatos digitais em LED entregam dinamismo de criacao, atualizacao agil de campanha e alta visibilidade em rotas urbanas de recorrencia.';
  }

  return 'Este formato amplia presença de marca com leitura objetiva de imagem, localização e métricas para tomada de decisão comercial com mais segurança.';
}

function buildMidiaKitFormatDividerPage({ tipo, formatStats, cityStats, assets }) {
  const lines = splitFormatTitle(tipo);
  const telas = formatStats ? formatStats.telas : (cityStats.totalTelas || 0);
  const enderecos = formatStats ? formatStats.enderecos : (cityStats.totalEnderecos || 0);
  return createPage(`
    <div style="position:absolute;inset:0;background:#050505;"></div>
    <img src="${assets.wallpaper || assets.heroBg || assets.showcase || ''}" alt="" style="position:absolute;inset:-60px;width:calc(100% + 120px);height:calc(100% + 120px);object-fit:cover;filter:blur(18px) saturate(1.08);opacity:0.10;" />
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,5,5,0.96) 0%,rgba(5,5,5,0.74) 45%,rgba(5,5,5,0.92) 100%);"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:18px;background:${BRAND_ORANGE};"></div>
    <div style="overflow:hidden;max-width:100%;position:absolute;right:0;top:0;bottom:0;display:flex;align-items:center;pointer-events:none;">
      <span style="display:block;font-family:Poppins, system-ui, sans-serif;font-size:110px;line-height:0.9;font-weight:700;color:#fff;opacity:0.04;text-transform:uppercase;white-space:nowrap;letter-spacing:-0.05em;padding-right:20px;">${escapeHtml(tipo.toUpperCase())}</span>
    </div>

    <div style="position:absolute;left:78px;top:76px;right:78px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;">
      <div>
        <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_ORANGE};">Formato em destaque</div>
        <div style="margin-top:14px;display:grid;gap:2px;">
          ${lines.map((line) => `<div style="font-family:Poppins, system-ui, sans-serif;font-size:76px;line-height:0.92;font-weight:700;color:#fff;letter-spacing:-0.05em;">${escapeHtml(line)}</div>`).join('')}
        </div>
      </div>
      <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:52px;width:auto;object-fit:contain;opacity:0.96;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.45));" />
    </div>

    <div style="position:absolute;left:82px;right:82px;bottom:84px;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:end;">
      <div style="max-width:700px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.82);">${escapeHtml(cityStats.cidade || 'Praça')}</div>
        <div style="margin-top:18px;font-size:28px;line-height:1.38;color:rgba(255,255,255,0.78);">${escapeHtml(getFormatDescription(tipo))}</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,180px));gap:16px;">
        <div style="padding:20px 22px;border-left:3px solid ${BRAND_ORANGE};">
          <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.48);">Telas</div>
          <div style="margin-top:10px;font-family:Poppins, system-ui, sans-serif;font-size:42px;line-height:1;font-weight:700;color:#fff;">${escapeHtml(formatInt(telas))}</div>
        </div>
        <div style="padding:20px 22px;border-left:3px solid ${BRAND_ORANGE};">
          <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.48);">Endereços</div>
          <div style="margin-top:10px;font-family:Poppins, system-ui, sans-serif;font-size:42px;line-height:1;font-weight:700;color:#fff;">${escapeHtml(formatInt(enderecos))}</div>
        </div>
      </div>
    </div>
  `, '#000');
}

function buildMidiaKitEndingPage({ assets }) {
  return createPage(`
    <div style="position:absolute;inset:0;background:#0A0A0A;"></div>
    <div style="position:absolute;left:80px;top:0;width:6px;height:100%;background:${BRAND_ORANGE};"></div>
    <div style="position:absolute;bottom:-20px;right:-10px;font-family:Poppins,sans-serif;font-size:260px;font-weight:900;line-height:1;letter-spacing:-0.05em;color:rgba(255,255,255,0.03);user-select:none;pointer-events:none;white-space:nowrap;max-width:100%;overflow:hidden;display:block;">OOH</div>

    <div style="position:absolute;left:120px;top:50%;transform:translateY(-50%);">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND_ORANGE};margin-bottom:32px;">INTERMIDIA OOH + DOOH</div>
      <div style="font-family:Poppins,sans-serif;font-size:72px;font-weight:900;line-height:1.0;letter-spacing:-0.02em;color:#fff;">
        <div>O mundo</div>
        <div>acontece lá fora<span style="color:${BRAND_ORANGE};">.</span></div>
      </div>
      <div style="width:280px;height:1px;background:rgba(255,255,255,0.15);margin:32px 0;"></div>
      <div style="font-size:14px;font-weight:500;color:#fff;">redeintermidia.com</div>
      <div style="margin-top:6px;font-size:12px;color:rgba(255,255,255,0.45);">Planejamento OOH + DOOH desde 2007</div>
    </div>

    <div style="position:absolute;bottom:60px;right:60px;text-align:right;">
      <img src="${assets.logo07 || assets.logo || ''}" alt="" style="width:120px;height:auto;object-fit:contain;" />
      <div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.25);">© 2026</div>
    </div>
  `, '#0A0A0A');
}

function buildMidiaKitPointPage({ ponto, index, total, image, assets }) {
  const fluxoLabel = isVehicleFlowPoint(ponto) ? 'Veículos / mês' : 'Pessoas / mês';
  const metrics = [
    { key: 'publico', label: 'Público', value: ponto.publico || '-' },
    { key: 'fluxo', label: fluxoLabel, value: formatInt(ponto.fluxo) },
    { key: 'telas', label: 'Telas', value: formatInt(ponto.telas) },
    { key: 'insercoes', label: 'Inserções', value: `Mín. ${formatInt(ponto.insercoes)}` },
    { key: 'tempo', label: 'Tempo', value: ponto.tempo || '-' },
    { key: 'loop', label: 'Loop', value: ponto.loop ? `Mín. ${ponto.loop}` : '-' }
  ];
  const photo = image || assets.showcase || assets.about1 || '';
  const locationLabel = formatPointAddress(ponto.endereco);
  const veiculacao = ponto.veiculacao || 'Vídeo sem áudio';
  const horario = ponto.horario || '-';

  return createPage(`
    <div style="position:absolute;inset:0;background:#ECEFF3;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,#F4F6F9 0%,#E9EDF2 100%);"></div>
    <div style="position:absolute;left:56px;top:56px;right:56px;bottom:56px;border-radius:36px;border:1px solid rgba(17,24,39,0.10);overflow:hidden;background:#F8FAFC;box-shadow:0 22px 48px rgba(15,23,42,0.10);">
      <div style="position:absolute;left:0;top:0;bottom:0;width:58.5%;background:linear-gradient(180deg,#FFFFFF 0%,#F1F5F9 100%);display:flex;flex-direction:column;padding:36px 40px 28px 40px;box-sizing:border-box;"></div>
      <div style="position:absolute;left:0;top:0;width:58.5%;height:8px;background:${BRAND_ORANGE};z-index:2;"></div>
      <div style="position:absolute;right:0;top:0;bottom:0;width:41.5%;background:#111;overflow:hidden;">
        ${photo ? `<img src="${photo}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;" />` : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);font-size:20px;">Imagem indisponível</div>`}
      </div>

      <div style="position:absolute;left:0;top:8px;bottom:0;width:58.5%;display:flex;flex-direction:column;padding:28px 40px 24px 40px;box-sizing:border-box;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-shrink:0;">
          <img src="${assets.logoLight || assets.logo || ''}" alt="" style="width:160px;height:auto;object-fit:contain;" />
          <span style="display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:999px;background:rgba(254,92,43,0.10);border:1px solid rgba(254,92,43,0.30);font-size:15px;font-weight:700;color:${BRAND_ORANGE};flex-shrink:0;">${index}/${total}</span>
        </div>

        <div style="margin-top:14px;flex-shrink:0;">
          <div style="display:inline-flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;background:${BRAND_ORANGE};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#fff;">
            ${midiaKitDetailIcon('type', '#ffffff', 14)} ${escapeHtml(getPointTypeLabel(ponto))}
          </div>
          <div style="margin-top:12px;font-family:Poppins, system-ui, sans-serif;font-size:48px;line-height:0.98;font-weight:700;letter-spacing:-0.02em;color:#111827;word-break:break-word;overflow-wrap:anywhere;hyphens:auto;">${formatPointNameHtml(ponto.nome || 'PONTO SEM NOME', { innerStyle: 'font-size:0.6em;font-weight:600;letter-spacing:-0.006em;color:rgba(17,24,39,0.62);' })}</div>
        </div>

        <div style="margin-top:12px;display:grid;gap:8px;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:10px;color:rgba(17,24,39,0.78);font-size:17px;line-height:1.35;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:#FFF7ED;border:1px solid rgba(254,92,43,0.24);flex:0 0 auto;">${midiaKitDetailIcon('location', BRAND_ORANGE, 16)}</span>
            <span>${escapeHtml(locationLabel || 'Endereço não informado')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;color:rgba(17,24,39,0.78);font-size:17px;line-height:1.35;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:#FFF7ED;border:1px solid rgba(254,92,43,0.24);flex:0 0 auto;">${midiaKitDetailIcon('coordinates', BRAND_ORANGE, 16)}</span>
            <span>${escapeHtml(formatCoordinates(ponto))}</span>
          </div>
        </div>

        <div style="margin-top:14px;flex:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-content:start;">
          ${metrics.map((item) => `
            <div style="padding:10px 12px;background:#F7F6F3;border:1px solid #E8E8E8;box-sizing:border-box;">
              <div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#888;">${metricIconSvg(item.key, '#888', 14)}${escapeHtml(item.label)}</div>
              <div style="margin-top:8px;font-family:Poppins, system-ui, sans-serif;font-size:18px;line-height:1.1;font-weight:700;color:#1A1A1A;word-break:break-word;">${escapeHtml(item.value)}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:auto;padding-top:12px;border-top:1px solid rgba(17,24,39,0.16);display:grid;grid-template-columns:1fr 1fr auto;gap:14px;align-items:end;flex-shrink:0;">
          <div>
            <div style="font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#888;">Veiculação</div>
            <div style="margin-top:6px;font-size:16px;line-height:1.24;color:#1A1A1A;">${escapeHtml(veiculacao)}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#888;">Horário</div>
            <div style="margin-top:6px;font-size:16px;line-height:1.24;color:#1A1A1A;">${escapeHtml(horario)}</div>
          </div>
          <div style="text-align:right;min-width:180px;padding-left:14px;border-left:1px solid #E8E8E8;">
            <div style="font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#888;">Valor Mensal</div>
            <div style="margin-top:6px;font-family:Poppins, system-ui, sans-serif;font-size:28px;line-height:1;font-weight:800;color:${BRAND_ORANGE};white-space:nowrap;letter-spacing:-0.02em;">${escapeHtml(formatMoney(ponto.preco))}</div>
          </div>
        </div>
      </div>
    </div>
  `, '#ECEFF3');
}

function buildProposalCoverPage({ proposalClient, proposalCity, proposalPoints, proposalTotals, pricingSummary, highlights, strategicTopics, strategicSubtitle, simulationSummary, segmento, assets }) {
  const layout = getActivePdfLayoutConfig().proposal.cover;
  const segmentLabel = getSegmentDisplayName(segmento);
  const pointsWithEntorno = proposalPoints.filter((point) => Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) > 0).length;
  const hasEntornoData = pointsWithEntorno > 0;
  const originalTotal = pricingSummary?.originalTotal ?? proposalTotals.valorTotal;
  const finalTotal = pricingSummary?.finalTotal ?? proposalTotals.valorTotal;
  const cards = [
    { iconHtml: proposalIcon('target'), label: 'Pontos', value: formatInt(proposalPoints.length) },
    { iconHtml: proposalIcon('flow'), label: 'Fluxo total', value: formatInt(proposalTotals.fluxoTotal) },
    { iconHtml: proposalIcon('money'), label: 'Valor Tabela', value: formatMoney(originalTotal) },
    { iconHtml: proposalIcon('money'), label: 'Valor Negociado', value: formatMoney(finalTotal) },
    { iconHtml: proposalIcon('cpm'), label: 'CPM estimado', value: formatDecimalMoney(proposalTotals.cpmEstimado) }
  ];
  const strategicItems = strategicTopics.length
    ? strategicTopics
    : (highlights.length ? highlights : ['Argumentos estratégicos serão definidos na reunião comercial.']);
  const subtitleText = String(strategicSubtitle || '').trim() || `Planejamento comercial para ${proposalCity} com foco em cobertura, frequência e presença de marca.`;

  return createPage(`
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(105deg,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.88) 52%,rgba(0,0,0,0.76) 100%);"></div>
    <div style="position:absolute;inset:auto auto -180px -60px;width:560px;height:560px;border-radius:999px;background:radial-gradient(circle,rgba(255,90,31,0.28) 0%,rgba(255,90,31,0.06) 48%,rgba(255,90,31,0) 72%);"></div>
    <div style="position:relative;z-index:1;display:grid;grid-template-columns:1.04fr 0.96fr;height:768px;max-height:768px;padding:58px 64px 50px;gap:22px;box-sizing:border-box;overflow:hidden;font-family:Inter,'Helvetica Neue',sans-serif;">
      <div style="display:flex;flex-direction:column;min-width:0;">
        <div style="display:flex;align-items:center;gap:18px;">
          <img src="${assets.logo || ''}" alt="" style="height:48px;width:auto;object-fit:contain;" />
          <div data-calibration-id="proposal.cover.badge" style="display:inline-flex;align-items:center;justify-content:center;height:${layout.badgeMinHeight}px;padding:0 ${layout.badgePaddingX}px;border-radius:100px;background:${PROPOSAL_ACCENT};border:1px solid ${PROPOSAL_ACCENT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#fff;line-height:1;text-align:center;">
            <span style="display:block;">Proposta comercial</span>
          </div>
        </div>

        <div style="margin-top:28px;font-family:Poppins, system-ui, sans-serif;font-size:68px;line-height:0.92;font-weight:700;letter-spacing:-0.05em;max-width:680px;max-height:190px;overflow:hidden;">${escapeHtml(proposalClient)}</div>
        <div style="margin-top:14px;font-size:20px;line-height:1.35;color:rgba(255,255,255,0.74);max-width:620px;max-height:112px;overflow:hidden;">${escapeHtml(subtitleText)}</div>

        <div data-calibration-id="proposal.cover.chips" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
          ${[
            proposalCity,
            formatPointCountLabel(proposalPoints.length || 0),
            segmentLabel,
            `Gerado em ${new Date().toLocaleDateString('pt-BR')}`
          ].map((chip) => `
            <div style="display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border-radius:100px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:600;color:${PROPOSAL_TEXT_SECONDARY};line-height:1;text-align:center;">
              <span style="display:block;">${escapeHtml(chip)}</span>
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
            valueWhiteSpace: 'normal',
            valueWordBreak: 'break-word'
          })}
        </div>
      </div>

      <div style="display:grid;grid-template-rows:1fr;gap:20px;min-width:0;">
        <div style="padding:20px 22px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};display:flex;flex-direction:column;overflow:hidden;">
          <div data-calibration-id="proposal.cover.strategicHeader" style="display:flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};border-top:2px solid ${PROPOSAL_ACCENT};padding-top:8px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:${layout.strategicHeaderIconSize}px;height:${layout.strategicHeaderIconSize}px;border-radius:999px;background:rgba(255,90,31,0.16);">${proposalIcon('target')}</span>Direcionamento estratégico</div>
          <div data-calibration-id="proposal.cover.strategicCards" style="margin-top:14px;display:grid;gap:10px;">
            ${strategicItems.map((item) => `
              <div style="display:grid;grid-template-columns:32px 1fr;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};">
                <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;background:rgba(254,92,43,0.16);">
                  <span style="display:block;width:${layout.strategicDotSize}px;height:${layout.strategicDotSize}px;border-radius:999px;background:${PROPOSAL_ACCENT};"></span>
                </div>
                <div style="font-size:17px;line-height:1.35;color:#fff;word-break:break-word;max-height:4.1em;overflow:hidden;">${escapeHtml(item)}</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="padding:10px 12px;border-radius:12px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Segmento priorizado</div>
              <div style="margin-top:6px;font-size:18px;line-height:1.2;color:#fff;font-weight:700;word-break:break-word;">${escapeHtml(segmentLabel)}</div>
            </div>
            ${hasEntornoData ? `
              <div style="padding:10px 12px;border-radius:12px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Entorno aderente</div>
                <div style="margin-top:6px;font-size:18px;line-height:1.2;color:#fff;font-weight:700;word-break:break-word;">${escapeHtml(`${formatInt(pointsWithEntorno)} ponto${pointsWithEntorno === 1 ? '' : 's'}`)}</div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

function buildProposalMetricsMethodologyPage({ proposalPoints, proposalTotals, pricingSummary, segmento, assets }) {
  const segmentLabel = getSegmentDisplayName(segmento);
  const pointCount = proposalPoints.length;
  const fluxoTotal = Number(proposalTotals?.fluxoTotal) || 0;
  const insercoesTotal = Number(proposalTotals?.insercoesTotal) || 0;
  const valorTabela = Number(pricingSummary?.originalTotal ?? proposalTotals?.valorTotal) || 0;
  const valorNegociado = Number(pricingSummary?.finalTotal ?? proposalTotals?.valorTotal) || 0;
  const ticketMedio = pointCount > 0 ? valorNegociado / pointCount : 0;
  const cpm = fluxoTotal > 0 ? valorNegociado / (fluxoTotal / 1000) : 0;
  const custoPorImpacto = fluxoTotal > 0 ? valorNegociado / fluxoTotal : 0;
  const pointsWithEntorno = proposalPoints.filter((point) => Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) > 0).length;
  const hasEntornoData = pointsWithEntorno > 0;
  const scoreEntornoMedio = pointCount > 0
    ? proposalPoints.reduce((sum, point) => sum + (Number(point?.entornoMetrics?.score_relevancia) || 0), 0) / pointCount
    : 0;

  const metrics = [
    {
      name: 'Valor Tabela',
      meaning: 'Soma dos valores mensais dos pontos sem desconto.',
      howToRead: 'Soma dos valores mensais de todos os pontos, antes de qualquer negociação.',
      value: formatMoney(valorTabela)
    },
    {
      name: 'Valor Negociado',
      meaning: 'Valor final da proposta após políticas comerciais.',
      howToRead: 'Valor final considerado para a campanha após condições comerciais aplicadas.',
      value: formatMoney(valorNegociado)
    },
    {
      name: 'Ticket Médio',
      meaning: 'Investimento médio por ponto selecionado.',
      howToRead: 'Média de investimento por ponto selecionado.',
      value: formatMoney(ticketMedio)
    },
    {
      name: 'CPM Estimado',
      meaning: 'Custo estimado para mil impactos (1.000).',
      howToRead: 'Quanto custa, em média, gerar mil impactos dentro deste plano.',
      value: `R$ ${cpm.toFixed(2).replace('.', ',')}`
    },
    {
      name: 'Custo por Impacto',
      meaning: 'Custo unitário estimado por impacto mensal.',
      howToRead: 'Custo estimado de cada impacto mensal, considerando todo o fluxo da campanha.',
      value: formatCostPerImpact(custoPorImpacto)
    },
    {
      name: 'Inserções Mensais',
      meaning: 'Volume mínimo de inserções previstas no plano.',
      howToRead: 'Quantidade mínima de inserções mensais planejadas para execução da campanha.',
      value: `Mínimo de ${formatInt(insercoesTotal)}`
    }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <img src="${assets.wallpaper || assets.heroBg || ''}" alt="" style="position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(18px) saturate(1.1);opacity:0.12;" />
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.7),rgba(0,0,0,0.92));"></div>

    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:48px 62px;box-sizing:border-box;display:grid;grid-template-rows:auto auto 1fr;gap:16px;overflow:hidden;font-family:Inter,'Helvetica Neue',sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Como ler as métricas</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.62);">${escapeHtml(segmentLabel)} • ${formatInt(pointCount)} pontos</div>
      </div>

      <div style="padding:16px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};font-size:13px;line-height:1.45;color:rgba(255,255,255,0.85);">
        As métricas abaixo resumem eficiência comercial e escala de entrega da campanha. Os valores exibidos já refletem esta proposta.
      </div>

      <div style="display:grid;grid-template-columns:1.06fr 0.94fr;gap:14px;min-height:0;">
        <div style="display:grid;gap:10px;align-content:start;">
          ${metrics.map((item) => `
            <div style="padding:24px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};display:grid;grid-template-columns:1.2fr 0.8fr;gap:12px;align-items:start;">
              <div>
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(item.name)}</div>
                <div style="margin-top:8px;font-size:13px;line-height:1.4;color:${PROPOSAL_TEXT_SECONDARY};">${escapeHtml(item.meaning)}</div>
                <div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid ${PROPOSAL_BORDER};font-size:11px;line-height:1.35;color:rgba(255,255,255,0.85);word-break:break-word;">${escapeHtml(item.howToRead)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Resultado</div>
                <div style="margin-top:8px;font-family:Poppins, system-ui, sans-serif;font-size:36px;line-height:1.05;font-weight:800;color:#fff;word-break:break-word;">${escapeHtml(item.value)}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display:grid;gap:10px;align-content:start;">
          <div style="padding:18px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};border-left:3px solid ${PROPOSAL_ACCENT};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Score da campanha</div>
            <div style="margin-top:8px;font-size:12px;line-height:1.45;color:rgba(255,255,255,0.78);">
              Índice de 0 a 10 que combina diversidade de formatos, volume de fluxo, cobertura, presença e aderência ao público/objetivo.
            </div>
            <div style="margin-top:10px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.08);font-size:11px;line-height:1.4;color:rgba(255,255,255,0.85);">Leitura prática: quanto maior a diversidade, o fluxo e a presença, maior o score final da campanha.</div>
          </div>

          ${hasEntornoData ? `
            <div style="padding:18px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};border-left:3px solid ${PROPOSAL_ACCENT};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Score do entorno</div>
              <div style="margin-top:8px;font-size:12px;line-height:1.45;color:rgba(255,255,255,0.78);">
                Mede relevância comercial local por ponto para o segmento priorizado, considerando proximidade e categorias relacionadas.
              </div>
              <div style="margin-top:10px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.08);font-size:11px;line-height:1.35;color:rgba(255,255,255,0.85);">Leitura prática: mais locais aderentes e mais proximidade tendem a elevar o score de entorno.</div>
              <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="padding:10px;border-radius:10px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.07);">
                  <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Score médio</div>
                  <div style="margin-top:6px;font-size:22px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${scoreEntornoMedio.toFixed(1).replace('.', ',')}</div>
                </div>
                <div style="padding:10px;border-radius:10px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.07);">
                  <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos com dados</div>
                  <div style="margin-top:6px;font-size:22px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(pointsWithEntorno)}</div>
                </div>
              </div>
            </div>
          ` : ''}

          <div style="padding:14px 16px;border-radius:12px;background:rgba(255,90,31,0.06);border:1px solid rgba(255,90,31,0.3);font-size:12px;line-height:1.45;color:rgba(255,255,255,0.9);">
            Observação: as métricas são estimativas com base no inventário e nos dados cadastrais da campanha. Valores podem variar conforme filtros, objetivo e seleção de pontos.
          </div>
        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

function buildProposalPointPage({ point, index, total, image, mapImage, segmento, assets }) {
  const layout = getActivePdfLayoutConfig().proposal.point;
  const counterMinWidth = Math.max(Number(layout.counterMinWidth) || 0, 110);
  const counterPaddingX = Math.max(Number(layout.counterPaddingX) || 0, 14);
  const audience = buildAudienceQualification(point);
  const environment = buildEntornoSummary(point?.entornoMetrics, segmento);
  const relevantPlacesCount = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
  const hasEntornoData = relevantPlacesCount > 0;
  const fluxoLabel = isVehicleFlowPoint(point) ? 'veículos/mês' : 'pessoas/mês';
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
    { label: 'Inserções', value: `Mínimo de ${formatInt(point.insercoes)}` },
    { label: 'Valor Negociado', value: formatMoney(point.preco) }
  ];

  const imageFrameHtml = buildHeroImageFrame(image, { fit: 'contain', radius: 28 });

  return createPage(`
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#000000 0%,#050505 38%,#101010 100%);"></div>
    <div style="position:absolute;top:0;right:0;bottom:0;width:34%;background:url('${assets.wallpaper || assets.cityBg || ''}') center/cover no-repeat;opacity:${layout.rightWallpaperOpacity};"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:32px 36px;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr;gap:16px;overflow:hidden;font-family:Inter,'Helvetica Neue',sans-serif;">
      <div data-calibration-id="proposal.point.header" style="display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
        <div style="display:flex;align-items:center;gap:16px;min-width:0;">
          <img src="${assets.logo || ''}" alt="" style="height:34px;width:auto;object-fit:contain;" />
          <div style="min-width:0;">
            <div style="font-family:Poppins, system-ui, sans-serif;font-size:28px;line-height:1.03;font-weight:700;letter-spacing:-0.03em;color:#fff;white-space:normal;word-break:break-word;max-height:2.1em;overflow:hidden;">${formatPointNameHtml(point.nome || 'PONTO SEM NOME', { innerStyle: 'font-size:0.66em;font-weight:600;letter-spacing:-0.01em;' })}</div>
            <div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;line-height:1.25;color:${PROPOSAL_TEXT_SECONDARY};">
              <span style="display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 10px;border-radius:100px;background:${PROPOSAL_ACCENT};font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(getPointTypeLabel(point) || '-')}</span>
              <span>${escapeHtml(point.cidade || '-')} · ${escapeHtml(getPointTypeLabel(point) || '-')}</span>
              ${coords ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-height:22px;padding:0 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);font-size:12px;line-height:1;color:rgba(255,255,255,0.58);">${escapeHtml(coords)}</span>` : ''}
            </div>
          </div>
        </div>
        <div data-calibration-id="proposal.point.counter" style="display:inline-flex;align-items:center;justify-content:center;gap:${layout.counterGap}px;min-width:${counterMinWidth}px;height:${layout.counterMinHeight}px;padding:0 ${counterPaddingX}px;border-radius:100px;background:rgba(255,255,255,0.08);font-size:13px;font-weight:700;color:#fff;line-height:1;font-family:Poppins, system-ui, sans-serif;white-space:nowrap;text-align:center;letter-spacing:0;box-sizing:border-box;">
          <span style="display:block;color:${PROPOSAL_ACCENT};">${index}</span>
          <span style="display:block;color:rgba(255,255,255,0.56);">/</span>
          <span style="display:block;color:rgba(255,255,255,0.86);">${total}</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.18fr 0.82fr;gap:16px;min-height:0;overflow:hidden;">
        <div data-calibration-id="proposal.point.imageFrame" style="position:relative;min-width:0;">
          <div style="position:absolute;inset:0;padding:20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};box-sizing:border-box;">
            ${imageFrameHtml}
            <div style="position:absolute;left:20px;right:20px;bottom:20px;height:90px;background:linear-gradient(to top,rgba(0,0,0,0.62),transparent);pointer-events:none;"></div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;min-width:0;overflow:hidden;">
          ${hasEntornoData ? `
            <div data-calibration-id="proposal.point.addressBox" style="padding:16px 18px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};border-top:2px solid ${PROPOSAL_ACCENT};padding-top:8px;">Entorno relevante</div>
              <div style="margin-top:6px;font-size:30px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(relevantPlacesCount)}</div>
              <div style="margin-top:6px;font-size:12px;line-height:1.35;color:rgba(255,255,255,0.72);">${escapeHtml(relevantPlacesCount === 1 ? 'local relevante no raio analisado.' : 'locais relevantes no raio analisado.')}</div>
            </div>
          ` : ''}

          <div style="padding:14px 16px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};border-top:2px solid ${PROPOSAL_ACCENT};padding-top:8px;">Qualificação do público</div>
            <div style="margin-top:8px;display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 12px;border-radius:100px;background:rgba(255,90,31,0.15);border:1px solid rgba(255,90,31,0.24);font-size:12px;font-weight:700;color:${PROPOSAL_ACCENT};">${escapeHtml(audience.badge)}</div>
            <div style="margin-top:8px;font-size:18px;line-height:1.3;color:#fff;font-weight:700;word-break:break-word;max-height:2.7em;overflow:hidden;">${escapeHtml(audience.headline)}</div>
            <div style="margin-top:6px;font-size:13px;line-height:1.35;color:${PROPOSAL_TEXT_SECONDARY};word-break:break-word;max-height:2.8em;overflow:hidden;">${escapeHtml(audience.summary)}</div>
          </div>

          ${mapImage ? `
            <div style="padding:10px 12px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Localização no mapa</div>
              <div style="margin-top:6px;height:96px;border-radius:12px;overflow:hidden;border:1px solid ${PROPOSAL_BORDER};background:rgba(255,255,255,0.02);">
                <img src="${mapImage}" alt="Mapa do ponto" style="width:100%;height:100%;object-fit:cover;filter:brightness(0.85) contrast(1.1);" />
              </div>
              <div style="margin-top:4px;font-size:10px;line-height:1.2;color:rgba(255,255,255,0.62);">Fonte cartográfica: OpenStreetMap/Carto.</div>
            </div>
          ` : ''}

          <div data-calibration-id="proposal.point.statsList" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
            ${stats.map((item) => `
              <div style="padding:14px 16px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid ${PROPOSAL_BORDER};">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(item.label)}</div>
                <div style="margin-top:4px;font-size:${item.label === 'Valor Negociado' ? '28px' : '18px'};line-height:1.2;color:${item.label === 'Valor Negociado' ? PROPOSAL_ACCENT : '#fff'};font-weight:800;word-break:break-word;">${escapeHtml(item.value)}</div>
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

function clampLat(lat) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function lngLatToWorldPixel(lat, lng, zoom) {
  const latClamped = clampLat(lat);
  const sin = Math.sin((latClamped * Math.PI) / 180);
  const scale = 256 * (2 ** zoom);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function pickMapZoom(samples, width, height, padding = 28) {
  for (let zoom = 15; zoom >= 9; zoom -= 1) {
    const projected = samples.map((item) => lngLatToWorldPixel(item.lat, item.lng, zoom));
    const minX = Math.min(...projected.map((item) => item.x));
    const maxX = Math.max(...projected.map((item) => item.x));
    const minY = Math.min(...projected.map((item) => item.y));
    const maxY = Math.max(...projected.map((item) => item.y));
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    if (spanX <= (width - padding * 2) * 0.92 && spanY <= (height - padding * 2) * 0.92) {
      return zoom;
    }
  }
  return 9;
}

function buildEntornoEvidenceMapHtml(rows) {
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
        Sem coordenadas válidas para montar o mapa de evidências.
      </div>
    `;
  }

  const mapSamples = [
    ...points.map((item) => ({ lat: item.lat, lng: item.lng })),
    ...realPlaceCoords.map((item) => ({ lat: item.lat, lng: item.lng }))
  ];

  const zoom = pickMapZoom(mapSamples, width, height, padding);
  const projectedSamples = mapSamples.map((item) => lngLatToWorldPixel(item.lat, item.lng, zoom));
  const minX = Math.min(...projectedSamples.map((item) => item.x));
  const maxX = Math.max(...projectedSamples.map((item) => item.x));
  const minY = Math.min(...projectedSamples.map((item) => item.y));
  const maxY = Math.max(...projectedSamples.map((item) => item.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY, 1);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const viewWorldWidth = width / scale;
  const viewWorldHeight = height / scale;
  const viewMinX = centerX - viewWorldWidth / 2;
  const viewMinY = centerY - viewWorldHeight / 2;
  const viewMaxX = viewMinX + viewWorldWidth;
  const viewMaxY = viewMinY + viewWorldHeight;

  const project = (lat, lng) => {
    const world = lngLatToWorldPixel(lat, lng, zoom);
    return {
      x: (world.x - viewMinX) * scale,
      y: (world.y - viewMinY) * scale
    };
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

  const pointMarkersHtml = points.map((entry) => {
    const { x, y } = project(entry.lat, entry.lng);
    return `
      <div style="position:absolute;left:${(x - 10).toFixed(1)}px;top:${(y - 10).toFixed(1)}px;width:20px;height:20px;border-radius:999px;border:1px solid rgba(254,92,43,0.56);background:rgba(254,92,43,0.3);"></div>
      <div style="position:absolute;left:${(x - 6).toFixed(1)}px;top:${(y - 6).toFixed(1)}px;width:12px;height:12px;border-radius:999px;background:${BRAND_ORANGE};"></div>
      <div style="position:absolute;left:${(x - 7).toFixed(1)}px;top:${(y - 6).toFixed(1)}px;min-width:14px;text-align:center;font-size:9px;font-weight:700;color:#0a0a0a;line-height:12px;">${entry.index}</div>
    `;
  }).join('');

  const nearbyMarkersHtml = nearbyMarkers.map((marker) => `
    <div title="${escapeHtml(`${marker.label} • ${Math.round(marker.distance)} m`)}" style="position:absolute;left:${(marker.x - 4).toFixed(1)}px;top:${(marker.y - 4).toFixed(1)}px;width:8px;height:8px;border-radius:999px;background:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.32);"></div>
  `).join('');

  const tileSize = 256;
  const worldTiles = 2 ** zoom;
  const startTileX = Math.floor(viewMinX / tileSize);
  const endTileX = Math.floor(viewMaxX / tileSize);
  const startTileY = Math.floor(viewMinY / tileSize);
  const endTileY = Math.floor(viewMaxY / tileSize);
  const tilePx = tileSize * scale;

  const tilesHtml = [];
  for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
      if (tileY < 0 || tileY >= worldTiles) continue;
      const wrappedTileX = ((tileX % worldTiles) + worldTiles) % worldTiles;
      const left = ((tileX * tileSize) - viewMinX) * scale;
      const top = ((tileY * tileSize) - viewMinY) * scale;
      tilesHtml.push(`
        <img crossorigin="anonymous" src="https://a.basemaps.cartocdn.com/dark_all/${zoom}/${wrappedTileX}/${tileY}.png" alt="" style="position:absolute;left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${(tilePx + 0.5).toFixed(2)}px;height:${(tilePx + 0.5).toFixed(2)}px;object-fit:cover;" />
      `);
    }
  }

  return `
    <div style="position:relative;width:100%;height:100%;border-radius:16px;overflow:hidden;background:#0b0b0b;" role="img" aria-label="Mapa geográfico de pontos e entorno">
      ${tilesHtml.join('')}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.16));"></div>
      ${nearbyMarkersHtml}
      ${pointMarkersHtml}
    </div>
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

  const evidenceMapSvg = buildEntornoEvidenceMapHtml(rows);

  return createPage(`
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <img src="${assets.wallpaper || assets.heroBg || ''}" alt="" style="position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(18px) saturate(1.1);opacity:0.12;" />
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.68),rgba(0,0,0,0.9));"></div>

    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:42px 56px;box-sizing:border-box;display:grid;grid-template-rows:auto auto auto 1fr;gap:12px;overflow:hidden;font-family:Inter,'Helvetica Neue',sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Evidências de entorno</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.62);">${escapeHtml(proposalCity || 'Múltiplas praças')} • ${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="padding:14px 18px;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos com aderência</div>
          <div style="margin-top:6px;font-size:30px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(pointsWithEntorno.length)}</div>
        </div>
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Total de pontos da proposta</div>
          <div style="margin-top:6px;font-size:30px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(proposalPoints.length)}</div>
        </div>
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Foco do segmento</div>
            <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(segmentLabel)}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;height:280px;">
        <div style="border-radius:12px;border:1px solid ${PROPOSAL_BORDER};background:${PROPOSAL_SURFACE};overflow:hidden;position:relative;">
          <div style="position:absolute;top:10px;left:12px;z-index:2;padding:5px 10px;border-radius:100px;border:1px solid rgba(255,90,31,0.26);background:rgba(255,90,31,0.14);font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Mapa geográfico de evidências</div>
          <div style="position:absolute;right:12px;bottom:10px;z-index:2;display:flex;gap:10px;align-items:center;font-size:11px;color:rgba(255,255,255,0.68);">
            <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:999px;background:${BRAND_ORANGE};display:inline-block;"></span>Pontos</span>
            <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:999px;background:rgba(255,255,255,0.8);display:inline-block;"></span>Entorno</span>
          </div>
          <div style="position:absolute;inset:0;padding:10px;box-sizing:border-box;">${evidenceMapSvg}</div>
        </div>

        <div style="display:grid;gap:8px;align-content:start;">
          ${rows.slice(0, 3).map(({ point, totalLocais, score }) => `
            <div style="padding:12px 12px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};border-left:3px solid ${PROPOSAL_ACCENT};">
              <div style="font-size:14px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(point.nome || 'Ponto sem nome')}</div>
              <div style="margin-top:5px;font-size:12px;color:rgba(255,255,255,0.68);">${escapeHtml(point.cidade || '-')} • ${escapeHtml(getPointTypeLabel(point) || '-')}</div>
              <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div style="font-size:12px;color:rgba(255,255,255,0.62);">Locais relevantes</div>
                <div style="font-size:18px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(totalLocais)}</div>
              </div>
              <div style="margin-top:4px;font-size:32px;color:${PROPOSAL_ACCENT};font-weight:800;line-height:1;">${score.toFixed(1).replace('.', ',')}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display:grid;gap:8px;align-content:start;overflow:hidden;">
        ${rows.slice(0, 3).map(({ point, totalLocais, score, places, summary }) => `
          <div style="padding:10px 12px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};display:grid;grid-template-columns:2fr 0.8fr 1.5fr;gap:10px;align-items:start;">
            <div>
              <div style="font-size:14px;line-height:1.2;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(point.nome || 'Ponto sem nome')}</div>
              <div style="margin-top:3px;font-size:12px;color:rgba(255,255,255,0.65);">${escapeHtml(point.cidade || '-')} • ${escapeHtml(getPointTypeLabel(point) || '-')}</div>
              <div style="margin-top:6px;font-size:11px;line-height:1.35;color:rgba(255,255,255,0.78);max-height:2.7em;overflow:hidden;">${escapeHtml(summary.summary)}</div>
            </div>
            <div>
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Locais / score</div>
              <div style="margin-top:6px;font-size:17px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${formatInt(totalLocais)}</div>
              <div style="margin-top:4px;font-size:12px;color:${PROPOSAL_ACCENT};font-weight:700;">score ${score.toFixed(1).replace('.', ',')}</div>
            </div>
            <div style="display:grid;gap:6px;">
              ${(places.length ? places : ['Sem locais próximos listados no cache atual.']).map((label) => `
                <div style="padding:6px 8px;border-radius:10px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);font-size:10px;color:rgba(255,255,255,0.82);line-height:1.3;word-break:break-word;">${escapeHtml(label)}</div>
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

  pdfAssetsPromise = Promise.resolve({
    logo: '/logo.png',
    logoLight: '/logo-light.png',
    logoHorizontal: '/logo-deitado.png',
    logo07: '/logo-07.png',
    heroBg: '/hero-bg.jpg',
    cityBg: '/city-bg.jpg',
    about1: '/about-1.jpg',
    about2: '/about-2.jpg',
    audience: '/audience.jpg',
    showcase: '/showcase.png',
    wallpaper: '/wallpaper.jpg',
    pattern: '/patterns/INTERMIDIA_PATTERN_ID.VISUAL_2024_INTERMIDIA_PATTERN_ID.VISUAL-4.png'
  });

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
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.08) 0%,transparent 40%);"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;overflow:hidden;font-family:Inter,'Helvetica Neue',sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 18px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Score da campanha</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="padding:22px 26px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Pontos com score</div>
          <div style="margin-top:10px;font-size:42px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${rows.filter((r) => r.score > 0).length}</div>
        </div>
        <div style="padding:22px 26px;border-radius:24px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Score médio</div>
          <div style="margin-top:10px;font-size:64px;line-height:1;font-weight:800;color:${PROPOSAL_ACCENT};font-family:Poppins, system-ui, sans-serif;">${rows.length ? (rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(1).replace('.', ',') : '0,0'}</div>
        </div>
      </div>

      <div style="flex:1;display:grid;gap:12px;align-content:start;overflow:hidden;">
        ${rows.map((row) => {
          const bar = Math.max(2, Math.round((row.score / maxScore) * 100));
          const color = row.score >= 7 ? BRAND_ORANGE : row.score >= 4 ? '#fff' : 'rgba(255,255,255,0.45)';
          return `
            <div style="display:grid;grid-template-columns:minmax(0,2fr) 112px minmax(0,1.4fr);gap:14px;align-items:center;padding:16px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
              <div>
                <div style="font-size:18px;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${escapeHtml(row.nome)}</div>
                <div style="margin-top:3px;font-size:13px;color:rgba(255,255,255,0.55);">${escapeHtml(row.cidade)} · ${row.total} locais relevantes</div>
              </div>
              <div style="text-align:center;font-size:28px;font-weight:700;line-height:1;color:${row.score <= 0 ? 'rgba(255,255,255,0.25)' : color};font-family:Poppins, system-ui, sans-serif;">${row.score.toFixed(1).replace('.', ',')}</div>
              <div style="display:flex;align-items:center;height:8px;border-radius:100px;background:rgba(255,255,255,0.08);overflow:hidden;">
                <div style="height:100%;width:${bar}%;border-radius:100px;background:${row.score <= 0 ? 'rgba(255,255,255,0.25)' : PROPOSAL_ACCENT};"></div>
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
  const maxEntornoScore = Math.max(1, ...proposalPoints.map((p) => Number(p?.entornoMetrics?.score_relevancia) || 0));
  const coveragePct = proposalPoints.length ? Math.round((withEntorno.length / proposalPoints.length) * 100) : 0;
  const totalLocais = proposalPoints.reduce((s, p) => s + (Number(p?.entornoMetrics?.total_estabelecimentos_relacionados) || 0), 0);

  return createPage(`
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.06) 0%,transparent 40%);"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;overflow:hidden;font-family:Inter,'Helvetica Neue',sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 18px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Cobertura e presença</div>
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
          <div style="padding:22px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(card.label)}</div>
            <div style="margin-top:10px;font-size:${card.label === 'Cobertura do segmento' ? '56px' : '36px'};line-height:1;font-weight:800;color:${card.label === 'Cobertura do segmento' ? PROPOSAL_ACCENT : '#fff'};font-family:Poppins, system-ui, sans-serif;">${escapeHtml(card.value)}</div>
          </div>
        `).join('')}
      </div>

      <div style="flex:1;display:grid;gap:12px;align-content:start;overflow:hidden;">
        <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);">Presença por ponto</div>
        ${proposalPoints.map((point) => {
          const locais = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
          const score = Number(point?.entornoMetrics?.score_relevancia) || 0;
          const hasData = locais > 0;
          const barPct = hasData ? Math.max(2, Math.round((score / maxEntornoScore) * 100)) : 0;
          return `
            <div style="display:grid;grid-template-columns:minmax(0,1.8fr) 88px 92px minmax(0,1.2fr);gap:14px;align-items:center;padding:14px 18px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
              <div>
                <div style="font-size:16px;font-weight:700;color:#fff;">${escapeHtml(point.nome || 'Ponto')}</div>
                <div style="margin-top:2px;font-size:12px;color:rgba(255,255,255,0.5);">${escapeHtml(point.cidade || '-')} · ${escapeHtml(getPointTypeLabel(point) || '-')}</div>
              </div>
              <div style="text-align:center;font-size:22px;font-weight:700;line-height:1;color:${hasData ? '#fff' : 'rgba(255,255,255,0.3)'};font-family:Poppins;">${formatInt(locais)}</div>
              <div style="text-align:center;font-size:18px;font-weight:700;line-height:1;color:${score >= 6 ? PROPOSAL_ACCENT : 'rgba(255,255,255,0.4)'};font-family:Poppins;">${score.toFixed(1).replace('.', ',')}</div>
              <div style="display:flex;align-items:center;height:8px;border-radius:100px;background:rgba(255,255,255,0.08);overflow:hidden;">
                <div style="height:100%;width:${barPct}%;border-radius:100px;background:${score >= 6 ? PROPOSAL_ACCENT : 'rgba(255,255,255,0.4)'};"></div>
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
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(254,92,43,0.1) 0%,transparent 50%);"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;overflow:hidden;font-family:Inter,'Helvetica Neue',sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 18px;border-radius:100px;background:rgba(255,90,31,0.12);border:1px solid rgba(255,90,31,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Impacto da campanha</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
        ${[
          { label: 'Impactos/mês', value: formatInt(fluxoTotal) },
          { label: `Impactos em ${mesesCampanha} meses`, value: formatInt(impactos3m) },
          { label: 'CPM estimado', value: formatDecimalMoney(cpm) }
        ].map((card) => `
          <div style="padding:24px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(card.label)}</div>
            <div style="margin-top:12px;font-size:48px;line-height:1;font-weight:800;color:#fff;font-family:Poppins, system-ui, sans-serif;">${escapeHtml(card.value)}</div>
          </div>
        `).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:20px;flex:1;">
        <div style="padding:24px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};border-top:2px solid ${PROPOSAL_ACCENT};padding-top:8px;">Impacto por ponto</div>
          ${proposalPoints.map((p) => `
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:16px;color:#fff;font-weight:600;min-width:0;max-width:72%;line-height:1.25;white-space:normal;word-break:break-word;">${escapeHtml(p.nome || 'Ponto')}</div>
              <div style="flex-shrink:0;font-size:15px;color:rgba(255,255,255,0.72);">${formatInt(p.fluxo || 0)}/mês</div>
            </div>
          `).join('')}
        </div>

        <div style="padding:24px;border-radius:12px;background:rgba(255,90,31,0.06);border:1px solid rgba(255,90,31,0.3);display:flex;flex-direction:column;gap:16px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Resumo financeiro</div>
          ${[
            { label: 'Inserções/mês', value: `Mínimo de ${formatInt(insercoesTotal)}` },
            { label: 'Valor Negociado', value: formatMoney(finalTotal) },
            { label: 'Custo por impacto', value: formatCostPerImpact(fluxoTotal > 0 ? (finalTotal / fluxoTotal) : 0) }
          ].map((row) => `
            <div>
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${escapeHtml(row.label)}</div>
              <div style="margin-top:6px;font-size:26px;line-height:1;font-weight:700;color:#fff;font-family:Poppins, system-ui, sans-serif;">${escapeHtml(row.value)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

export async function generateMidiaKitPdf({ praca, pontos }) {
  activePdfLayoutConfig = await loadPdfLayoutConfig();
  const cidade = praca && praca !== 'Todas as praças' ? praca : 'Consolidado';
  const kitPontos = Array.isArray(pontos) ? pontos : [];
  const resumo = buildResumo(kitPontos);
  const assets = await loadPdfAssets();
  const cityStats = {
    cidade,
    totalTelas: resumo.telas,
    totalEnderecos: new Set(kitPontos.map((p) => `${p.cidade || ''}-${p.endereco || ''}`.trim())).size
  };

  const pointImages = kitPontos.map((ponto) => pickImageUrl(ponto));
  const pages = [
    buildMidiaKitCoverPage({ cidade, pontos: kitPontos, resumo, assets }),
    buildMidiaKitManifestoPage({ assets }),
    buildMidiaKitSummaryPage({ cidade, pontos: kitPontos, assets })
  ];

  const groupedByTipo = kitPontos.reduce((acc, ponto, index) => {
    const tipo = getPointTypeLabel(ponto);
    if (!acc[tipo]) acc[tipo] = [];
    acc[tipo].push({ ponto, index });
    return acc;
  }, {});

  Object.entries(groupedByTipo)
    .sort(([tipoA], [tipoB]) => {
      const baseA = getBaseTypeLabel(tipoA);
      const baseB = getBaseTypeLabel(tipoB);
      return sortFormatos([baseA, baseB]).indexOf(baseA) === 0 ? -1 : 1;
    })
    .forEach(([tipo, items]) => {
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

  pages.push(buildMidiaKitEndingPage({ assets }));

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
  strategicTopics,
  strategicSubtitle,
  simulationSummary,
  pricingSummary,
  pointMapImages = [],
  showMetricsMethodology = true,
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
  const strategicTopicsList = normalizeLines(strategicTopics, 6);
  const hasEntornoData = proposalPoints.some((point) => Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) > 0);
  const assets = await loadPdfAssets();
  const proposalImages = proposalPoints.map((point) => pickProposalImageUrl(point));
  const pages = [
    buildProposalCoverPage({
      proposalClient,
      proposalCity,
      proposalPoints,
      proposalTotals,
      pricingSummary,
      highlights,
      strategicTopics: strategicTopicsList,
      strategicSubtitle,
      simulationSummary,
      segmento,
      assets
    })
  ];

  if (showMetricsMethodology) {
    pages.push(buildProposalMetricsMethodologyPage({
      proposalPoints,
      proposalTotals,
      pricingSummary,
      segmento,
      assets
    }));
  }

  proposalPoints.forEach((point, index) => {
    pages.push(buildProposalPointPage({
      point,
      index: index + 1,
      total: proposalPoints.length,
      image: proposalImages[index],
      mapImage: pointMapImages[index] || null,
      segmento,
      assets
    }));
  });

  if (hasEntornoData) {
    pages.push(buildProposalEntornoEvidencePage({
      proposalCity,
      proposalPoints,
      segmento,
      assets
    }));
  }

  if (showCampaignScore) {
    pages.push(buildCampaignScorePage({ proposalPoints, segmento, assets }));
  }

  if (showCoverageLayer && hasEntornoData) {
    pages.push(buildCoverageLayerPage({ proposalPoints, segmento, proposalTotals, assets }));
  }

  if (showImpactSection) {
    pages.push(buildImpactPage({ proposalPoints, proposalTotals, pricingSummary, simulationSummary, segmento, assets }));
  }

  const fileName = `proposta-${slugify(proposalClient)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  await renderPagesToPdf(pages, fileName);
}
