import { loadPdfLayoutConfig } from './pdfLayoutConfig';
import { buildAudienceQualification, buildEntornoSummary, getSegmentDisplayName, sortFormatos } from './strategy';

const PAGE_WIDTH = 1366;
const PAGE_HEIGHT = 768;
export const PDF_PAGE_SIZE = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
const BRAND_ORANGE = '#E8591A';
const BRAND_DARK = '#0A0A0A';
const BRAND_PANEL = '#171717';
const BRAND_BORDER = 'rgba(255,255,255,0.08)';
const PROPOSAL_ACCENT = '#E8591A';
const PROPOSAL_BG = '#FFFFFF';
const PROPOSAL_SURFACE = '#F5F6F8';
const PROPOSAL_SURFACE_ALT = '#EBEDF0';
const PROPOSAL_BORDER = 'rgba(0,0,0,0.09)';
const PROPOSAL_LABEL = 'rgba(0,0,0,0.40)';
const PROPOSAL_TEXT_SECONDARY = 'rgba(0,0,0,0.60)';
const PROPOSAL_TEXT = '#1A1A2E';

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
export function getCityState(cidade) {
  const key = String(cidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const keyRaw = String(cidade || '').toLowerCase();
  return CITY_STATE_MAP[keyRaw] || CITY_STATE_MAP[key] || '';
}

const imageCache = new Map();
const pdfAssetsPromiseByCity = new Map();
const IMAGE_FETCH_TIMEOUT_MS = 15000;
let activePdfLayoutConfig = null;

function getActivePdfLayoutConfig() {
  return activePdfLayoutConfig;
}

export function formatInt(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function getElevadorCategoria(point) {
  const normalized = String(point?.elevador_categoria || '').trim().toLowerCase();
  if (normalized === 'residencial') return 'Residencial';
  return 'Comercial';
}

export function getPointTypeLabel(point) {
  const tipo = String(point?.tipo || '').trim();
  if (tipo === 'Elevador') {
    return `Elevador - ${getElevadorCategoria(point)}`;
  }
  return tipo || 'Formato';
}

function getBaseTypeLabel(typeLabel) {
  return String(typeLabel || '').split(' - ')[0].trim();
}

export function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

export function formatDecimalMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

export function formatCostPerImpact(value) {
  const numeric = Number(value) || 0;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '-';
  }

  if (numeric < 0.01) {
    return `R$ ${numeric.toFixed(4).replace('.', ',')}`;
  }

  return `R$ ${numeric.toFixed(2).replace('.', ',')}`;
}

export function slugify(value) {
  return (value || 'praca')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function blobUrlToDataUrl(url) {
  if (!url || !url.startsWith('blob:')) return url;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

export function formatPointNameHtml(name, options = {}) {
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

export function formatPointAddress(address) {
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

export function pickImageUrl(ponto) {
  const preferred = String(ponto?.pdf_image_source || 'imagem2').trim().toLowerCase();
  if (preferred === 'imagem' && (ponto?.imagem || ponto?.imagem2)) {
    return ponto?.imagem || ponto?.imagem2 || '';
  }
  if (preferred === 'imagem2' && (ponto?.imagem2 || ponto?.imagem)) {
    return ponto?.imagem2 || ponto?.imagem || '';
  }

  if (Array.isArray(ponto?.imagens) && ponto.imagens.length > 0) {
    const first = ponto.imagens[0];
    if (typeof first === 'string') return first;
    if (first?.url) return first.url;
  }

  // Legacy fallback keeps the previous PDF behavior when no explicit source is set.
  return ponto?.imagem2 || ponto?.imagem || '';
}

export function pickProposalImageUrl(ponto) {
  return ponto?.proposalSimulationPreview || ponto?.simulacao_preview || pickImageUrl(ponto);
}

export function isVehicleFlowPoint(point) {
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

export function buildResumo(pontos) {
  const totals = pontos.reduce((acc, p) => {
    acc.telas += Number(p.telas) || 0;
    acc.fluxo += Number(p.fluxo) || 0;
    acc.preco += Number(p.preco) || 0;
    return acc;
  }, { telas: 0, fluxo: 0, preco: 0 });

  const ticketMedio = pontos.length ? Math.round(totals.preco / pontos.length) : 0;
  return { ...totals, ticketMedio };
}

export function getAudienceQualityScore(point) {
  const tags = Array.isArray(point?.audience_tags) ? point.audience_tags : [];
  if (tags.length) {
    const avgWeight = tags.reduce((sum, tag) => sum + (Number(tag?.weight) || 1), 0) / tags.length;
    return Math.min(1.35, Math.max(0.85, avgWeight));
  }

  const publico = String(point?.publico || '').toUpperCase();
  if (publico.includes('A') && publico.includes('B')) return 1.05;
  if (publico.includes('A')) return 1.15;
  if (publico.includes('B')) return 0.95;
  return 1;
}

export function normalizeLines(input, limit = 6) {
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

// Comprime uma imagem via Canvas antes de embutir no PDF.
// Redimensiona para no máximo MAX_IMG_PX em qualquer dimensão e recodifica como JPEG.
// Reduz o tamanho do HTML enviado ao backend em ~90% sem perda visual perceptível no PDF.
const MAX_IMG_PX = 1366;   // largura/altura máxima — igual à largura do PDF
const IMG_QUALITY = 0.75;  // qualidade JPEG (0–1)

async function compressImageBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX_IMG_PX || h > MAX_IMG_PX) {
        const scale = Math.min(MAX_IMG_PX / w, MAX_IMG_PX / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', IMG_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export async function imageToDataUrl(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);

  const promise = (async () => {
    // Data URLs are already embeddable in HTML/PDF.
    if (String(url).startsWith('data:image/')) {
      return url;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
      const rawUrl = String(url || '').trim();
      const isBlobUrl = rawUrl.startsWith('blob:');
      const isAbsolute = /^https?:\/\//i.test(rawUrl);
      const normalizedUrl = (isBlobUrl || isAbsolute)
        ? rawUrl
        : new URL(rawUrl, window.location.origin).toString();

      const res = await fetch(normalizedUrl, { signal: controller.signal, credentials: 'include' });
      if (!res.ok) return null;
      const blob = await res.blob();
      // Comprimir via Canvas antes de embutir — evita HTML de 100MB+
      const compressed = await compressImageBlob(blob);
      if (compressed) return compressed;
      // Fallback: embutir sem compressão se o Canvas falhar (ex: SVG, WebP incomum)
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

function createPage(content, background = '#050505', options = {}) {
  const pageH = options.height || PAGE_HEIGHT;
  const page = document.createElement('section');
  if (options.cssClass) page.className = options.cssClass;
  if (options.height) page.dataset.customHeight = String(options.height);
  Object.assign(page.style, {
    display: 'block',
    width: `${PAGE_WIDTH}px`,
    height: `${pageH}px`,
    minHeight: `${pageH}px`,
    maxHeight: `${pageH}px`,
    position: 'relative',
    overflow: options.height ? 'visible' : 'hidden',
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

async function renderPagesToPdf(pages, fileName, options = {}) {
  const origin = window.location.origin;
  const pdfTitle = String(fileName || 'documento.pdf').replace(/\.pdf$/i, '').trim() || 'Documento';
  const pageHtmlParts = pages.map((p) => p.outerHTML).join('\n');
  // Inject named @page rules for sections that require a non-standard height
  const customPageCss = pages
    .filter((p) => p.dataset?.customHeight && p.className)
    .map((p) => {
      const h = parseInt(p.dataset.customHeight, 10);
      const cls = p.className.split(/\s+/)[0];
      const pageName = cls.replace(/[^a-zA-Z0-9]/g, '_') + '_named';
      return [
        `@page ${pageName} { size: ${PAGE_WIDTH}px ${h}px; margin: 0; }`,
        `section.${cls} { page: ${pageName}; height: ${h}px !important; max-height: ${h}px !important; overflow: visible !important; }`,
      ].join('\n');
    })
    .join('\n');
  const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<base href="${origin}">
<title>${escapeHtml(pdfTitle)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; }
html, body { margin: 0; padding: 0; background: #FFFFFF; }
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
${customPageCss}
</style>
</head>
<body>${pageHtmlParts}</body></html>`;

  const payload = JSON.stringify({
    html: fullHtml,
    fileName,
    citySlugs: Array.isArray(options.citySlugs) ? options.citySlugs : [],
    noCache: options.noCache === true
  });

  let res = await fetch('/api/pdf/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    credentials: 'same-origin',
  });

  // Retry once on transient gateway/service errors (only 502/503 — 504 means backend already retried).
  if (!res.ok && [502, 503].includes(res.status)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    res = await fetch('/api/pdf/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      credentials: 'same-origin',
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao gerar PDF no servidor');
  }

  const disposition = String(res.headers.get('Content-Disposition') || '');
  const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const resolvedFileName = decodeURIComponent((fileNameMatch?.[1] || fileName).replace(/\"/g, '').trim());

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = resolvedFileName;
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
      <div style="height:100%;border-radius:${options.radius || 30}px;border:1px solid ${PROPOSAL_BORDER};background:${PROPOSAL_SURFACE_ALT};display:flex;align-items:center;justify-content:center;color:${PROPOSAL_LABEL};font-size:28px;font-weight:600;">
        Imagem indisponível
      </div>
    `;
  }

  const focalPoint = String(options.focalPoint || 'center center').trim() || 'center center';
  const mainImageStyle = options.fit === 'cover'
    ? `display:block;width:100%;height:100%;object-fit:cover;object-position:${escapeHtml(focalPoint)};`
    : 'display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;';

  return `
    <div style="position:relative;height:100%;border-radius:${options.radius || 30}px;overflow:hidden;border:1px solid ${PROPOSAL_BORDER};background:${PROPOSAL_SURFACE_ALT};">
      <img src="${image}" alt="" style="position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;object-position:${escapeHtml(focalPoint)};filter:blur(16px) saturate(1.1);opacity:0.12;" />
      <div style="position:absolute;left:28px;top:28px;right:28px;bottom:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${image}" alt="" style="${mainImageStyle}filter:drop-shadow(0 12px 24px rgba(0,0,0,0.12));" />
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

export function formatCoordinates(ponto) {
  const lat = Number(ponto?.lat);
  const lng = Number(ponto?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Coordenadas não informadas';
  }

  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function buildMidiaKitCoverPage({ cidade, pontos, resumo, assets, selectedCities = [] }) {
  const estado = getCityState(cidade);
  const totalFormatos = new Set(pontos.map((ponto) => ponto.tipo).filter(Boolean)).size;
  const totalPublicos = new Set(pontos.map((ponto) => ponto.publico).filter(Boolean)).size;
  const totalEnderecos = new Set(pontos.map((ponto) => `${ponto.cidade || ''}-${ponto.endereco || ''}`.trim()).filter(Boolean)).size;
  const heroImage = assets.cityBg || assets.heroBg || assets.showcase || '';
  const normalizedSelectedCities = Array.from(new Set(
    (Array.isArray(selectedCities) ? selectedCities : [])
      .map((cityName) => String(cityName || '').trim())
      .filter(Boolean)
  ));
  const selectedCitiesLabel = normalizedSelectedCities.join(' · ');
  const isMultiCity = normalizedSelectedCities.length > 1;
  const cards = [
    { label: 'Pontos ativos', value: formatInt(pontos.length), icon: 'type' },
    { label: 'Pontos de Impacto disponíveis', value: formatInt(resumo.telas), icon: 'type' },
    { label: 'Fluxo mensal', value: formatInt(resumo.fluxo), icon: 'coordinates' },
    { label: 'Formatos no kit', value: formatInt(totalFormatos), icon: 'city' }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:50%;background:#07090b;"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:50%;overflow:hidden;background:#080808;">
      <img src="${heroImage}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;" />
      <div style="position:absolute;inset:0;background:linear-gradient(to left,rgba(0,0,0,0.16) 0%,rgba(0,0,0,0.42) 45%,rgba(0,0,0,0.58) 100%);"></div>
    </div>
    <div style="position:absolute;left:50%;top:0;bottom:0;width:160px;background:linear-gradient(to right,#07090b 0%,rgba(7,9,11,0.92) 36%,rgba(7,9,11,0.5) 72%,rgba(7,9,11,0) 100%);"></div>

    <div style="position:absolute;left:72px;top:68px;right:54%;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;">
      <img src="${assets.logo || ''}" alt="" style="width:172px;height:auto;object-fit:contain;" />
      <span style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:999px;background:${BRAND_ORANGE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fff;">MIDIA KIT</span>
    </div>

    <div style="position:absolute;left:72px;top:170px;right:56%;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_ORANGE};">Cobertura estratégica</div>
      <div style="margin-top:14px;font-family:Poppins, system-ui, sans-serif;font-size:72px;line-height:0.92;font-weight:700;letter-spacing:-0.05em;text-transform:uppercase;color:#fff;word-break:break-word;">${escapeHtml(cidade)}</div>
      ${estado ? `<div style="margin-top:12px;font-size:20px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.7);">${escapeHtml(estado)}</div>` : ''}
      ${isMultiCity ? `<div style="margin-top:12px;max-width:560px;font-size:14px;line-height:1.35;color:rgba(255,255,255,0.72);"><span style="font-weight:700;color:rgba(255,255,255,0.9);">Praças selecionadas:</span> ${escapeHtml(selectedCitiesLabel)}</div>` : ''}
      <div style="margin-top:16px;max-width:540px;font-size:18px;line-height:1.34;color:rgba(255,255,255,0.82);">Inventário premium para planejar presença urbana com escala, frequência e impacto visual na praça.</div>
    </div>

    <div style="position:absolute;left:72px;right:56%;bottom:56px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px;row-gap:12px;">
      ${cards.map((card) => `
        <div style="padding-top:16px;border-top:2px solid ${BRAND_ORANGE};">
          <div style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.52);">${escapeHtml(card.label)}</div>
          <div style="margin-top:10px;font-family:Poppins, system-ui, sans-serif;font-size:38px;line-height:0.98;font-weight:700;letter-spacing:-0.03em;color:#fff;">${escapeHtml(card.value)}</div>
        </div>
      `).join('')}
    </div>

    <div style="position:absolute;left:72px;right:56%;bottom:16px;display:flex;flex-wrap:wrap;gap:10px;">
      <span style="display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);font-size:12px;line-height:1;color:#fff;">${midiaKitDetailIcon('location', BRAND_ORANGE, 14)} ${formatInt(totalEnderecos)} endereços</span>
      <span style="display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);font-size:12px;line-height:1;color:#fff;">${midiaKitDetailIcon('city', BRAND_ORANGE, 14)} ${formatInt(totalPublicos)} públicos</span>
    </div>
  `, '#050505');
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
    <div style="position:absolute;left:66px;top:56px;right:66px;bottom:56px;border-radius:34px;background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.08);overflow:hidden;display:flex;">
      
      <div style="flex:0 0 540px;position:relative;background:#0b0b0b;border-right:1px solid rgba(255,255,255,0.06);">
        <img src="${assets.about1 || assets.about2 || assets.showcase || ''}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:contrast(1.02);" />
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,5,5,0.02) 0%,rgba(5,5,5,0.28) 45%,rgba(5,5,5,0.92) 100%);"></div>
        <div style="position:absolute;left:42px;right:42px;bottom:42px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 16px;border-radius:999px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.9);">Leitura do inventário</div>
          <div style="margin-top:16px;font-family:Poppins, system-ui, sans-serif;font-size:42px;line-height:1.08;font-weight:700;color:#fff;letter-spacing:-0.03em;">Desde 2007, a Intermidia transforma localização em resultado de marca.</div>
        </div>
      </div>

      <div style="flex:1;padding:56px 64px;display:flex;flex-direction:column;justify-content:center;">
        <img src="${assets.logo || ''}" alt="" style="width:160px;height:auto;object-fit:contain;" />
        <div style="margin-top:20px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND_ORANGE};">Visão do mídia kit</div>
        <div style="margin-top:12px;font-family:Poppins, system-ui, sans-serif;font-size:36px;line-height:1.1;font-weight:700;color:#fff;letter-spacing:-0.03em;">Planejamento com repertório, critério e experiência de mercado.</div>
        <div style="margin-top:16px;font-size:15px;line-height:1.45;color:rgba(255,255,255,0.72);">A Intermidia atua desde 2007 no OOH e no DOOH, conectando pontos premium, dados de audiência e leitura comercial para campanhas memoráveis.</div>
        <div style="margin-top:12px;font-size:14px;line-height:1.45;color:rgba(255,255,255,0.72);">Nas próximas páginas, você encontra cada formato explicado, com foto real, endereço, coordenadas e métricas para decidir com confiança.</div>

        <div style="margin-top:38px;display:grid;grid-template-columns:1fr 1fr;column-gap:32px;row-gap:28px;">
          ${cards.map((card) => `
            <div>
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:rgba(232,89,26,0.12);">${midiaKitDetailIcon('type', BRAND_ORANGE, 14)}</span>
                <span style="font-size:13px;font-weight:700;color:#fff;line-height:1.2;">${escapeHtml(card.title)}</span>
              </div>
              <div style="margin-top:10px;font-size:12px;line-height:1.45;color:rgba(255,255,255,0.6);">${escapeHtml(card.text)}</div>
            </div>
          `).join('')}
        </div>
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
    .sort((a, b) => (b.fluxo - a.fluxo) || (b.pontos - a.pontos))
    .slice(0, 5);

  const totalEnderecos = new Set(pontos.map((p) => `${p.cidade || ''}-${p.endereco || ''}`.trim())).size;
  const totalPontos = pontos.length;
  const resumo = buildResumo(pontos);
  const featuredPoint = [...pontos]
    .map((point) => ({
      ...point,
      __featuredScore: (Number(point?.fluxo) || 0) * getAudienceQualityScore(point)
    }))
    .sort((a, b) => (Number(b.__featuredScore) || 0) - (Number(a.__featuredScore) || 0))[0] || null;

  const cards = [
    { label: 'Endereços', value: formatInt(totalEnderecos), icon: 'location' },
    { label: 'Pontos', value: formatInt(totalPontos), icon: 'type' },
    { label: 'Pontos de Impacto', value: formatInt(resumo.telas), icon: 'city' },
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

    <div style="position:absolute;left:70px;right:70px;top:206px;bottom:44px;display:grid;grid-template-columns:1.05fr 0.95fr;gap:24px;align-items:stretch;">
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
          <div style="margin-top:14px;font-size:17px;line-height:1.42;color:rgba(255,255,255,0.8);">Praça com <strong style="color:#fff;">${formatInt(totalPontos)} pontos</strong>, <strong style="color:#fff;">${formatInt(resumo.telas)} pontos de impacto</strong> e fluxo mensal consolidado de <strong style="color:#fff;">${formatInt(resumo.fluxo)}</strong>. A composição por formato facilita montar uma grade equilibrada entre cobertura e frequência.</div>
        </div>
      </div>

        <div style="display:grid;grid-template-rows:auto 1fr;gap:12px;min-height:0;">
        <div style="padding:16px 20px;border-radius:24px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_ORANGE};">Mix de formatos</div>
            <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.44);">Top ${rows.length}</div>
          </div>
          <div style="margin-top:12px;display:grid;gap:0;">
            ${rows.map((row) => `
              <div style="display:grid;grid-template-columns:minmax(0,1fr) 88px 138px;gap:12px;align-items:center;padding:8px 2px 8px 12px;border-left:3px solid ${BRAND_ORANGE};border-bottom:1px solid rgba(255,255,255,0.08);">
                <div>
                  <div style="font-size:14px;font-weight:700;color:#fff;line-height:1.2;">${escapeHtml(row.tipo)}</div>
                  <div style="margin-top:3px;font-size:10px;color:rgba(255,255,255,0.5);">${formatInt(row.telas)} pontos de impacto disponíveis</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-family:Poppins, system-ui, sans-serif;font-size:20px;line-height:1;font-weight:700;color:#fff;">${formatInt(row.pontos)}</div>
                  <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.46);">pontos</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.48);">Fluxo mensal</div>
                  <div style="margin-top:3px;font-size:15px;font-weight:700;color:${BRAND_ORANGE};">${formatInt(row.fluxo)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="padding:14px 16px;border-radius:24px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);min-height:0;overflow:hidden;">
          <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_ORANGE};">Ponto em destaque</div>
          <div style="margin-top:6px;font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:0.05em;text-transform:uppercase;">Critério: fluxo x qualificação de público</div>
          ${featuredPoint ? `
            <div style="margin-top:10px;padding:10px 12px;border-left:3px solid ${BRAND_ORANGE};border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
                <div style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#fff;line-height:1.2;"><span style="display:block;width:6px;height:6px;border-radius:999px;background:${BRAND_ORANGE};flex:0 0 auto;"></span>${escapeHtml(featuredPoint.nome || 'Ponto destaque')}</div>
                <span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 8px;border-radius:999px;background:${BRAND_ORANGE};font-size:10px;font-weight:700;color:#fff;">1</span>
              </div>
              <div style="margin-top:7px;display:flex;align-items:flex-start;gap:8px;color:rgba(255,255,255,0.66);font-size:11px;line-height:1.35;">${midiaKitDetailIcon('location', BRAND_ORANGE, 12)}<span>${escapeHtml(formatPointAddress(featuredPoint.endereco) || 'Endereço não informado')}</span></div>
              <div style="margin-top:4px;display:flex;align-items:flex-start;gap:8px;color:rgba(255,255,255,0.62);font-size:11px;line-height:1.35;">${midiaKitDetailIcon('coordinates', BRAND_ORANGE, 12)}<span>${escapeHtml(formatCoordinates(featuredPoint))}</span></div>
              <div style="margin-top:6px;font-size:11px;color:rgba(255,255,255,0.72);">Fluxo estimado: <strong style="color:#fff;">${escapeHtml(formatInt(featuredPoint.fluxo))}</strong> / mês</div>
            </div>
          ` : `<div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.6);">Sem ponto disponível para destaque.</div>`}
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

export function getFormatDescription(tipo) {
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
          <div style="font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.48);">Pontos de Impacto</div>
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
    { key: 'telas', label: 'Pontos de Impacto', value: formatInt(ponto.telas) },
    { key: 'insercoes', label: 'Inserções', value: `Mín. ${formatInt(ponto.insercoes)}` },
    { key: 'tempo', label: 'Tempo', value: ponto.tempo || '-' },
    { key: 'loop', label: 'Loop', value: ponto.loop ? `Mín. ${ponto.loop}` : '-' }
  ];
  const photo = image || assets.showcase || assets.about1 || '';
  const focalPoint = String(ponto?.foto_focal_point || 'center center').trim() || 'center center';
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
        ${photo ? `<img src="${photo}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${escapeHtml(focalPoint)};display:block;" />` : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);font-size:20px;">Imagem indisponível</div>`}
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

function buildProposalCoverPage({ proposalClient, proposalCity, proposalPoints, proposalTotals, pricingSummary, highlights, strategicTopics, strategicSubtitle, simulationSummary, segmento, assets, showMetricsMethodology = true }) {
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
    <div style="position:absolute;inset:auto auto -180px -60px;width:560px;height:560px;border-radius:999px;background:radial-gradient(circle,rgba(232,89,26,0.12) 0%,rgba(232,89,26,0.03) 48%,rgba(232,89,26,0) 72%);"></div>
    <div style="position:relative;z-index:1;display:grid;grid-template-columns:1.04fr 0.96fr;height:768px;max-height:768px;padding:58px 64px 50px;gap:22px;box-sizing:border-box;overflow:hidden;font-family:Poppins, system-ui, sans-serif;color:${PROPOSAL_TEXT};">
      <div style="display:flex;flex-direction:column;min-width:0;">
        <div style="display:flex;align-items:center;gap:18px;">
          <img src="${assets.logoLight || assets.logo || ''}" alt="" style="height:48px;width:auto;object-fit:contain;" />
          <div data-calibration-id="proposal.cover.badge" style="display:inline-flex;align-items:center;justify-content:center;height:${layout.badgeMinHeight}px;padding:0 ${layout.badgePaddingX}px;border-radius:100px;background:${PROPOSAL_ACCENT};border:1px solid ${PROPOSAL_ACCENT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#fff;line-height:1;text-align:center;">
            <span style="display:block;">Proposta comercial</span>
          </div>
        </div>

        <div style="margin-top:28px;font-family:Poppins, system-ui, sans-serif;font-size:68px;line-height:0.92;font-weight:700;letter-spacing:-0.05em;max-width:680px;max-height:190px;overflow:hidden;">${escapeHtml(proposalClient)}</div>
        <div style="margin-top:14px;font-size:20px;line-height:1.35;color:${PROPOSAL_TEXT_SECONDARY};max-width:620px;max-height:112px;overflow:hidden;">${escapeHtml(subtitleText)}</div>

        <div data-calibration-id="proposal.cover.chips" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
          ${[
            proposalCity,
            formatPointCountLabel(proposalPoints.length || 0),
            segmentLabel,
            `Gerado em ${new Date().toLocaleDateString('pt-BR')}`
          ].map((chip) => `
            <div style="display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border-radius:100px;background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.10);font-size:12px;font-weight:600;color:${PROPOSAL_TEXT_SECONDARY};line-height:1;text-align:center;">
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
              valueWordBreak: 'break-word',
              valueColor: PROPOSAL_TEXT,
              labelColor: PROPOSAL_LABEL,
              background: PROPOSAL_SURFACE,
              borderColor: PROPOSAL_BORDER
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
                <div style="font-size:17px;line-height:1.35;color:${PROPOSAL_TEXT};word-break:break-word;max-height:4.1em;overflow:hidden;">${escapeHtml(item)}</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="padding:10px 12px;border-radius:12px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Segmento priorizado</div>
              <div style="margin-top:6px;font-size:18px;line-height:1.2;color:${PROPOSAL_TEXT};font-weight:700;word-break:break-word;">${escapeHtml(segmentLabel)}</div>
            </div>
            ${hasEntornoData ? `
              <div style="padding:10px 12px;border-radius:12px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Entorno aderente</div>
                <div style="margin-top:6px;font-size:18px;line-height:1.2;color:${PROPOSAL_TEXT};font-weight:700;word-break:break-word;">${escapeHtml(`${formatInt(pointsWithEntorno)} ponto${pointsWithEntorno === 1 ? '' : 's'}`)}</div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `, PROPOSAL_BG);
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

    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:38px 48px;box-sizing:border-box;display:grid;grid-template-rows:auto auto 1fr;gap:12px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;color:${PROPOSAL_TEXT};">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;flex-shrink:0;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:100px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Como ler as métricas</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(segmentLabel)} • ${formatInt(pointCount)} pontos</div>
      </div>

      <div style="padding:16px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};font-size:13px;line-height:1.45;color:${PROPOSAL_TEXT_SECONDARY};">
        As métricas abaixo resumem eficiência comercial e escala de entrega da campanha. Os valores exibidos já refletem esta proposta.
      </div>

      <div style="display:grid;grid-template-columns:1.06fr 0.94fr;gap:12px;min-height:0;">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:10px;align-content:stretch;">
          ${metrics.map((item) => `
            <div style="padding:12px 12px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};display:grid;grid-template-rows:auto auto auto 1fr auto;gap:6px;height:100%;box-sizing:border-box;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(item.name)}</div>
              <div style="font-size:12px;line-height:1.32;color:${PROPOSAL_TEXT_SECONDARY};word-break:break-word;">${escapeHtml(item.meaning)}</div>
              <div style="padding:6px 8px;border-radius:8px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};font-size:10px;line-height:1.3;color:${PROPOSAL_TEXT_SECONDARY};word-break:break-word;">${escapeHtml(item.howToRead)}</div>
              <div style="margin-top:4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Resultado</div>
              <div style="font-family:Poppins, system-ui, sans-serif;font-size:30px;line-height:1.02;font-weight:800;color:${PROPOSAL_TEXT};word-break:break-word;">${escapeHtml(item.value)}</div>
            </div>
          `).join('')}
        </div>

        <div style="display:grid;gap:8px;align-content:start;">
          <div style="padding:18px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};border-left:3px solid ${PROPOSAL_ACCENT};">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Score da campanha</div>
            <div style="margin-top:8px;font-size:12px;line-height:1.45;color:${PROPOSAL_TEXT_SECONDARY};">
              Índice de 0 a 10 que combina diversidade de formatos, volume de fluxo, cobertura, presença e aderência ao público/objetivo.
            </div>
            <div style="margin-top:10px;padding:10px;border-radius:10px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};font-size:11px;line-height:1.4;color:${PROPOSAL_TEXT_SECONDARY};">Leitura prática: quanto maior a diversidade, o fluxo e a presença, maior o score final da campanha.</div>
          </div>

          ${hasEntornoData ? `
            <div style="padding:18px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};border-left:3px solid ${PROPOSAL_ACCENT};">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Score do entorno</div>
              <div style="margin-top:8px;font-size:12px;line-height:1.45;color:${PROPOSAL_TEXT_SECONDARY};">
                Mede relevância comercial local por ponto para o segmento priorizado, considerando proximidade e categorias relacionadas.
              </div>
              <div style="margin-top:10px;padding:10px;border-radius:10px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};font-size:11px;line-height:1.35;color:${PROPOSAL_TEXT_SECONDARY};">Leitura prática: mais locais aderentes e mais proximidade tendem a elevar o score de entorno.</div>
              <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="padding:10px;border-radius:10px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};">
                  <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Score médio</div>
                  <div style="margin-top:6px;font-size:22px;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${scoreEntornoMedio.toFixed(1).replace('.', ',')}</div>
                </div>
                <div style="padding:10px;border-radius:10px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};">
                  <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Pontos com dados</div>
                  <div style="margin-top:6px;font-size:22px;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${formatInt(pointsWithEntorno)}</div>
                </div>
              </div>
            </div>
          ` : ''}

          <div style="padding:10px 12px;border-radius:12px;background:rgba(232,89,26,0.06);border:1px solid rgba(232,89,26,0.25);font-size:11px;line-height:1.35;color:${PROPOSAL_TEXT_SECONDARY};">
            Observação: as métricas são estimativas com base no inventário e nos dados cadastrais da campanha. Valores podem variar conforme filtros, objetivo e seleção de pontos.
          </div>
        </div>
      </div>
    </div>
  `, PROPOSAL_BG);
}

function buildProposalPointPage({ point, index, total, image, mapImage, segmento, assets }) {
  const layout = getActivePdfLayoutConfig().proposal.point;
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

  const leftStats = [
    { label: 'Público', value: escapeHtml(audience.badge || 'A/B+') },
    { label: escapeHtml(fluxoLabel), value: formatInt(point.fluxo) },
    { label: 'Telas', value: formatInt(point.telas || 1) },
    { label: 'Inserções', value: formatInt(point.insercoes || 15300) },
  ];
  
  const tempo = point.tempo_insercao || '15s';
  const loop = point.loop || '3 min';
  leftStats.push({ label: 'Tempo', value: escapeHtml(tempo) });
  leftStats.push({ label: 'Loop', value: escapeHtml(loop) });

  const hasImage = Boolean(image);
  const hasMap = Boolean(mapImage);

  return createPage(`
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:28px 32px;box-sizing:border-box;display:grid;grid-template-columns:${(hasImage || hasMap) ? "1fr 1.05fr" : "1fr"};gap:20px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;color:${PROPOSAL_TEXT};">
      
      <!-- LEFT COLUMN -->
      <div style="display:flex;flex-direction:column;gap:20px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};border-radius:24px;padding:26px 32px;overflow:hidden;box-sizing:border-box;">
        
        <!-- Header: Logo and Pagination -->
        <div style="display:flex;justify-content:space-between;align-items:center;min-height:32px;flex-shrink:0;">
          <img src="${assets.logoLight || assets.logo || ''}" alt="" style="height:32px;width:auto;object-fit:contain;flex-shrink:0;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 12px;border-radius:100px;border:1px solid rgba(232,89,26,0.24);background:rgba(232,89,26,0.12);font-size:12px;font-weight:700;color:${PROPOSAL_ACCENT};line-height:1;font-variant-numeric: tabular-nums;">
            <span>${index}</span><span style="opacity:0.6;margin:0 2px;">/</span><span>${total}</span>
          </div>
        </div>

        <!-- Title & Info -->
        <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
          <span style="display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 10px;border-radius:6px;background:${PROPOSAL_ACCENT};font-size:11px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:0.08em;align-self:flex-start;">${escapeHtml(getPointTypeLabel(point) || 'PAINEL LED')}</span>
          <div style="font-size:28px;line-height:1.1;font-weight:800;letter-spacing:-0.03em;color:${PROPOSAL_TEXT};margin-top:2px;word-break:break-word;max-height:2.2em;overflow:hidden;">
            ${formatPointNameHtml(point.nome || 'PONTO SEM NOME', { innerStyle: 'font-size:0.66em;font-weight:600;letter-spacing:-0.01em;' })}
          </div>
          <div style="margin-top:6px;display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.4;color:${PROPOSAL_TEXT_SECONDARY};">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${PROPOSAL_ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span>${escapeHtml(point.cidade || '-')}${point.endereco ? ' · ' + escapeHtml(point.endereco) : ''}</span>
          </div>
          ${coords ? `
          <div style="display:flex;align-items:center;gap:8px;font-size:11px;line-height:1;color:${PROPOSAL_TEXT_SECONDARY};margin-top:2px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${PROPOSAL_ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            <span>${escapeHtml(coords)}</span>
          </div>` : ''}
        </div>

        <!-- Grid of small stats -->
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:4px;flex-shrink:0;">
          ${leftStats.map(s => `
            <div style="background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:10px;padding:12px 14px;">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(s.label)}</div>
              <div style="font-size:20px;font-weight:800;color:${PROPOSAL_TEXT};line-height:1.2;margin-top:4px;">${escapeHtml(s.value)}</div>
            </div>
          `).join('')}
        </div>

        <!-- Público Block -->
        <div style="margin-top:2px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;flex-shrink:0;">
          <span style="display:inline-flex;height:24px;align-items:center;padding:0 10px;border-radius:4px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.24);font-size:10px;font-weight:800;color:${PROPOSAL_ACCENT};text-transform:uppercase;letter-spacing:0.05em;">Público ${escapeHtml(audience.badge)}</span>
          <div style="margin-top:12px;font-size:16px;line-height:1.3;font-weight:700;color:${PROPOSAL_TEXT};word-break:break-word;max-height:2.7em;overflow:hidden;">${escapeHtml(audience.headline)}</div>
          <div style="margin-top:6px;font-size:12px;line-height:1.45;color:${PROPOSAL_TEXT_SECONDARY};word-break:break-word;max-height:3.0em;overflow:hidden;">${escapeHtml(audience.summary)}</div>
        </div>

        <!-- Filler -->
        <div style="flex:1;min-height:0;"></div>

        <!-- Bottom Row -->
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;border-top:1px solid rgba(0,0,0,0.06);padding-top:18px;flex-shrink:0;">
          <div style="display:flex;gap:36px;">
            <div>
              <div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Veiculação</div>
              <div style="font-size:14px;font-weight:700;color:${PROPOSAL_TEXT};margin-top:4px;">${escapeHtml(point.veiculacao || 'Vídeo sem áudio')}</div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Horário</div>
              <div style="font-size:14px;font-weight:700;color:${PROPOSAL_TEXT};margin-top:4px;">${escapeHtml(point.horario || '24 horas')}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Valor mensal</div>
            <div style="font-size:28px;font-weight:800;color:${PROPOSAL_ACCENT};line-height:1;margin-top:4px;">${escapeHtml(formatMoney(point.preco))}</div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div style="display:flex;flex-direction:column;gap:12px;height:100%;min-width:0;overflow:hidden;">
        ${hasImage ? `
        <div style="flex:1;min-height:0;border-radius:24px;overflow:hidden;background:${PROPOSAL_SURFACE_ALT};position:relative;border:1px solid ${PROPOSAL_BORDER};">
          <img src="${image}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${escapeHtml(point?.foto_focal_point || 'center 38%')};display:block;" />
        </div>
        ` : ''}
        
        ${hasMap ? `
        <div style="height:${hasImage ? '170px' : '100%'};flex-shrink:0;border-radius:24px;overflow:hidden;background:${PROPOSAL_SURFACE_ALT};position:relative;border:1px solid ${PROPOSAL_BORDER};">
          <img src="${mapImage}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;" />
        </div>
        ` : ''}
      </div>

    </div>
  `, PROPOSAL_BG);
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

  const gridStep = 110;
  const gridLines = [];
  for (let x = gridStep; x < width; x += gridStep) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`);
  }
  for (let y = gridStep; y < height; y += gridStep) {
    gridLines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`);
  }

  return `
    <div style="position:relative;width:100%;height:100%;border-radius:16px;overflow:hidden;background:#0b0b0b;" role="img" aria-label="Mapa geográfico de pontos e entorno">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="none" style="position:absolute;inset:0;">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#0a0a0a"/>
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#env-grid-grad)"/>
        <defs>
          <linearGradient id="env-grid-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="rgba(255,90,31,0.07)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0.02)"/>
          </linearGradient>
        </defs>
        ${gridLines.join('')}
      </svg>
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

    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:42px 56px;box-sizing:border-box;display:grid;grid-template-rows:auto auto auto 1fr;gap:12px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;color:${PROPOSAL_TEXT};">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;flex-shrink:0;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:100px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Evidências de entorno</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(proposalCity || 'Múltiplas praças')} • ${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="padding:14px 18px;border-radius:18px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Pontos com aderência</div>
          <div style="margin-top:6px;font-size:30px;line-height:1;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${formatInt(pointsWithEntorno.length)}</div>
        </div>
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Total de pontos da proposta</div>
          <div style="margin-top:6px;font-size:30px;line-height:1;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${formatInt(proposalPoints.length)}</div>
        </div>
        <div>
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Foco do segmento</div>
            <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(segmentLabel)}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;height:280px;">
        <div style="border-radius:12px;border:1px solid ${PROPOSAL_BORDER};background:${PROPOSAL_SURFACE};overflow:hidden;position:relative;">
          <div style="position:absolute;top:10px;left:12px;z-index:2;padding:5px 10px;border-radius:100px;border:1px solid rgba(232,89,26,0.26);background:rgba(232,89,26,0.14);font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Mapa geográfico de evidências</div>
          <div style="position:absolute;right:12px;bottom:10px;z-index:2;display:flex;gap:10px;align-items:center;font-size:11px;color:${PROPOSAL_TEXT_SECONDARY};">
            <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:999px;background:${BRAND_ORANGE};display:inline-block;"></span>Pontos</span>
            <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:999px;background:rgba(0,0,0,0.35);display:inline-block;"></span>Entorno</span>
          </div>
          <div style="position:absolute;inset:0;padding:10px;box-sizing:border-box;">${evidenceMapSvg}</div>
        </div>

        <div style="display:grid;gap:8px;align-content:start;">
          ${rows.slice(0, 3).map(({ point, totalLocais, score }) => `
            <div style="padding:12px 12px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};border-left:3px solid ${PROPOSAL_ACCENT};">
              <div style="font-size:14px;line-height:1.2;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(point.nome || 'Ponto sem nome')}</div>
              <div style="margin-top:5px;font-size:12px;color:${PROPOSAL_TEXT_SECONDARY};">${escapeHtml(point.cidade || '-')} • ${escapeHtml(getPointTypeLabel(point) || '-')}</div>
              <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div style="font-size:12px;color:${PROPOSAL_LABEL};">Locais relevantes</div>
                <div style="font-size:18px;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${formatInt(totalLocais)}</div>
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
              <div style="font-size:14px;line-height:1.2;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;word-break:break-word;">${escapeHtml(point.nome || 'Ponto sem nome')}</div>
              <div style="margin-top:3px;font-size:12px;color:${PROPOSAL_TEXT_SECONDARY};">${escapeHtml(point.cidade || '-')} • ${escapeHtml(getPointTypeLabel(point) || '-')}</div>
              <div style="margin-top:6px;font-size:11px;line-height:1.35;color:${PROPOSAL_TEXT_SECONDARY};max-height:2.7em;overflow:hidden;">${escapeHtml(summary.summary)}</div>
            </div>
            <div>
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Locais / score</div>
              <div style="margin-top:6px;font-size:17px;line-height:1;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${formatInt(totalLocais)}</div>
              <div style="margin-top:4px;font-size:12px;color:${PROPOSAL_ACCENT};font-weight:700;">score ${score.toFixed(1).replace('.', ',')}</div>
            </div>
            <div style="display:grid;gap:6px;">
              ${(places.length ? places : ['Sem locais próximos listados no cache atual.']).map((label) => `
                <div style="padding:6px 8px;border-radius:10px;background:${PROPOSAL_SURFACE_ALT};border:1px solid ${PROPOSAL_BORDER};font-size:10px;color:${PROPOSAL_TEXT_SECONDARY};line-height:1.3;word-break:break-word;">${escapeHtml(label)}</div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `, PROPOSAL_BG);
}

export async function loadPdfAssets(cidade = '') {
  const citySlug = cidade ? slugify(cidade) : '';
  const cacheKey = citySlug || '__default__';
  if (pdfAssetsPromiseByCity.has(cacheKey)) {
    return pdfAssetsPromiseByCity.get(cacheKey);
  }

  const promise = (async () => {
    const baseAssets = {
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
    };

    if (!citySlug) {
      return baseAssets;
    }

    try {
      const response = await fetch(`/api/cidade-fotos/${encodeURIComponent(citySlug)}`);
      if (!response.ok) {
        return baseAssets;
      }
      const cityPhoto = await response.json();
      if (cityPhoto?.imagem_url) {
        return { ...baseAssets, cityBg: cityPhoto.imagem_url };
      }
      return baseAssets;
    } catch {
      return baseAssets;
    }
  })();

  pdfAssetsPromiseByCity.set(cacheKey, promise);
  return promise;
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
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;color:${PROPOSAL_TEXT};">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;flex-shrink:0;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 18px;border-radius:100px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Score da campanha</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(segmentLabel)}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="padding:22px 26px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Pontos com score</div>
          <div style="margin-top:10px;font-size:42px;line-height:1;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${rows.filter((r) => r.score > 0).length}</div>
        </div>
        <div style="padding:22px 26px;border-radius:24px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Score médio</div>
          <div style="margin-top:10px;font-size:64px;line-height:1;font-weight:800;color:${PROPOSAL_ACCENT};font-family:Poppins, system-ui, sans-serif;">${rows.length ? (rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(1).replace('.', ',') : '0,0'}</div>
        </div>
      </div>

      <div style="flex:1;display:grid;gap:12px;align-content:start;overflow:hidden;">
        ${rows.map((row) => {
          const bar = Math.max(2, Math.round((row.score / maxScore) * 100));
          const color = row.score >= 7 ? BRAND_ORANGE : row.score >= 4 ? PROPOSAL_TEXT : PROPOSAL_LABEL;
          return `
            <div style="display:grid;grid-template-columns:minmax(0,2fr) 112px minmax(0,1.4fr);gap:14px;align-items:center;padding:16px 20px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
              <div>
                <div style="font-size:18px;font-weight:700;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${escapeHtml(row.nome)}</div>
                <div style="margin-top:3px;font-size:13px;color:${PROPOSAL_TEXT_SECONDARY};">${escapeHtml(row.cidade)} · ${row.total} locais relevantes</div>
              </div>
              <div style="text-align:center;font-size:28px;font-weight:700;line-height:1;color:${row.score <= 0 ? 'rgba(0,0,0,0.20)' : color};font-family:Poppins, system-ui, sans-serif;">${row.score.toFixed(1).replace('.', ',')}</div>
              <div style="display:flex;align-items:center;height:8px;border-radius:100px;background:rgba(0,0,0,0.06);overflow:hidden;">
                <div style="height:100%;width:${bar}%;border-radius:100px;background:${row.score >= 6 ? PROPOSAL_ACCENT : 'rgba(0,0,0,0.25)'};"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `, PROPOSAL_BG);
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
    <div style="position:relative;z-index:1;height:768px;max-height:768px;padding:52px 62px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;overflow:hidden;font-family:Poppins, system-ui, sans-serif;color:${PROPOSAL_TEXT};">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:16px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:40px;width:auto;object-fit:contain;flex-shrink:0;" />
          <div style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 18px;border-radius:100px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.24);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">Cobertura e presença</div>
        </div>
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};">${escapeHtml(segmentLabel)}</div>
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
            <div style="margin-top:10px;font-size:${card.label === 'Cobertura do segmento' ? '56px' : '36px'};line-height:1;font-weight:800;color:${card.label === 'Cobertura do segmento' ? PROPOSAL_ACCENT : PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${escapeHtml(card.value)}</div>
          </div>
        `).join('')}
      </div>

      <div style="flex:1;display:grid;gap:12px;align-content:start;overflow:hidden;">
        <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PROPOSAL_LABEL};padding-bottom:8px;border-bottom:1px solid ${PROPOSAL_BORDER};">Presença por ponto</div>
        ${proposalPoints.map((point) => {
          const locais = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
          const score = Number(point?.entornoMetrics?.score_relevancia) || 0;
          const hasData = locais > 0;
          const barPct = hasData ? Math.max(2, Math.round((score / maxEntornoScore) * 100)) : 0;
          return `
            <div style="display:grid;grid-template-columns:minmax(0,1.8fr) 88px 92px minmax(0,1.2fr);gap:14px;align-items:center;padding:14px 18px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};">
              <div>
                <div style="font-size:16px;font-weight:700;color:${PROPOSAL_TEXT};">${escapeHtml(point.nome || 'Ponto')}</div>
                <div style="margin-top:2px;font-size:12px;color:${PROPOSAL_LABEL};">${escapeHtml(point.cidade || '-')} · ${escapeHtml(getPointTypeLabel(point) || '-')}</div>
              </div>
              <div style="text-align:center;font-size:22px;font-weight:700;line-height:1;color:${hasData ? PROPOSAL_TEXT : 'rgba(0,0,0,0.25)'};font-family:Poppins;">${formatInt(locais)}</div>
              <div style="text-align:center;font-size:18px;font-weight:700;line-height:1;color:${score >= 6 ? PROPOSAL_ACCENT : 'rgba(0,0,0,0.30)'};font-family:Poppins;">${score.toFixed(1).replace('.', ',')}</div>
              <div style="display:flex;align-items:center;height:8px;border-radius:100px;background:rgba(0,0,0,0.06);overflow:hidden;">
                <div style="height:100%;width:${barPct}%;border-radius:100px;background:${score >= 6 ? PROPOSAL_ACCENT : 'rgba(0,0,0,0.25)'};"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `, PROPOSAL_BG);
}

function buildImpactPage({ proposalPoints, proposalTotals, pricingSummary, simulationSummary, segmento, proposalClient, proposalCity, publico, assets }) {
  const segmentLabel = getSegmentDisplayName(segmento);
  const pointCount = proposalPoints.length;
  const finalTotal = pricingSummary?.finalTotal ?? proposalTotals?.valorTotal ?? 0;
  const originalTotal = pricingSummary?.originalTotal ?? finalTotal;
  const hasDiscount = pricingSummary?.hasDiscount && pricingSummary?.discountTotal > 0;
  const discountTotal = pricingSummary?.discountTotal ?? 0;
  const publicoLabel = Array.isArray(publico) ? publico.filter(Boolean).join(', ') : (publico || '—');
  const cityLabel = Array.isArray(proposalCity) ? proposalCity.join(', ') : (proposalCity || '—');

  const insercoesLabel = proposalTotals?.insercoesTotal ? proposalTotals.insercoesTotal.toLocaleString('pt-BR') : '—';
  const fluxoLabel = proposalTotals?.fluxoTotal ? proposalTotals.fluxoTotal.toLocaleString('pt-BR') : '—';
  const cpmLabel = proposalTotals?.cpmEstimado ? formatMoney(proposalTotals.cpmEstimado) : '—';

  // Dynamic page height: fixed overhead + per-row height for all points
  const IMPACT_ROW_HEIGHT_PX = 44;
  const IMPACT_OVERHEAD_PX = 340;
  const impactPageHeight = Math.max(PAGE_HEIGHT, IMPACT_OVERHEAD_PX + proposalPoints.length * IMPACT_ROW_HEIGHT_PX);

  let pointRows = proposalPoints.map((p) => `
    <tr>
      <td style="padding:12px 16px;font-size:13px;font-weight:600;color:${PROPOSAL_TEXT};border-bottom:1px solid ${PROPOSAL_BORDER};max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.nome || 'Ponto')}</td>
      <td style="padding:12px 16px;font-size:12px;color:${PROPOSAL_TEXT_SECONDARY};border-bottom:1px solid ${PROPOSAL_BORDER};">${escapeHtml(p.cidade || '—')}</td>
      <td style="padding:12px 16px;font-size:12px;color:${PROPOSAL_TEXT_SECONDARY};border-bottom:1px solid ${PROPOSAL_BORDER};">${escapeHtml(getPointTypeLabel(p) || '—')}</td>
      <td style="padding:12px 16px;font-size:13px;font-weight:700;color:${PROPOSAL_ACCENT};border-bottom:1px solid ${PROPOSAL_BORDER};text-align:right;white-space:nowrap;">${formatMoney(p.precoOriginal ?? p.preco ?? 0)}</td>
      <td style="padding:12px 16px;font-size:13px;font-weight:700;color:${PROPOSAL_ACCENT};border-bottom:1px solid ${PROPOSAL_BORDER};text-align:right;white-space:nowrap;">${formatMoney(p.precoFinal ?? p.preco ?? 0)}</td>
    </tr>
  `).join('');

  return createPage(`
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <div style="position:absolute;top:-20%;right:-10%;width:800px;height:800px;background:radial-gradient(circle, rgba(232,89,26,0.06) 0%, transparent 60%);border-radius:50%;filter:blur(60px);pointer-events:none;"></div>
    <div style="position:absolute;bottom:-20%;left:-10%;width:600px;height:600px;background:radial-gradient(circle, rgba(232,89,26,0.04) 0%, transparent 60%);border-radius:50%;filter:blur(60px);pointer-events:none;"></div>

    <div style="position:relative;z-index:1;height:${impactPageHeight}px;max-height:${impactPageHeight}px;padding:42px 52px;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;overflow:visible;font-family:Poppins, system-ui, sans-serif;color:${PROPOSAL_TEXT};">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${assets.logoHorizontal || assets.logo || ''}" alt="" style="height:36px;width:auto;object-fit:contain;" />
          <div style="width:2px;height:24px;background:${PROPOSAL_BORDER};"></div>
          <div style="font-size:18px;font-weight:600;color:${PROPOSAL_TEXT};letter-spacing:0.02em;">Plano de Investimento & Impacto</div>
        </div>
      </div>

      <div style="display:flex;gap:24px;flex:1;overflow:visible;">

        <!-- LEFT COLUMN (Points & Info) -->
        <div style="flex:1;display:flex;flex-direction:column;gap:20px;overflow:visible;">

          <!-- Summary cards -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
            ${[
              { label: 'Cliente', value: proposalClient || '—' },
              { label: 'Cidades', value: cityLabel },
              { label: 'Segmento', value: segmentLabel },
              { label: 'Públicos', value: publicoLabel }
            ].map((card) => `
              <div style="padding:14px 16px;border-radius:12px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_ACCENT};">${escapeHtml(card.label)}</div>
                <div style="margin-top:6px;font-size:13px;font-weight:600;color:${PROPOSAL_TEXT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(card.value)}">${escapeHtml(card.value)}</div>
              </div>
            `).join('')}
          </div>

          <!-- Points table -->
          <div style="flex:1;display:flex;flex-direction:column;border-radius:16px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};overflow:visible;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
            <div style="padding:14px 20px;background:${PROPOSAL_SURFACE_ALT};border-bottom:1px solid ${PROPOSAL_BORDER};display:flex;align-items:center;justify-content:space-between;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_LABEL};">Pontos da campanha</div>
              <div style="font-size:11px;font-weight:700;color:${PROPOSAL_ACCENT};background:rgba(232,89,26,0.10);border:1px solid rgba(232,89,26,0.20);padding:4px 12px;border-radius:100px;">Total de ${pointCount} pontos</div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_LABEL};text-align:left;border-bottom:1px solid ${PROPOSAL_BORDER};">Ponto</th>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_LABEL};text-align:left;border-bottom:1px solid ${PROPOSAL_BORDER};">Cidade</th>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_LABEL};text-align:left;border-bottom:1px solid ${PROPOSAL_BORDER};">Tipo</th>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_LABEL};text-align:right;border-bottom:1px solid ${PROPOSAL_BORDER};">Valor Tabela</th>
                  <th style="padding:5px 16px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_LABEL};text-align:right;border-bottom:1px solid ${PROPOSAL_BORDER};line-height:1.2;">Valor Negociado<br>no Combo</th>
                </tr>
              </thead>
              <tbody>
                ${pointRows}
              </tbody>
            </table>
          </div>

        </div>

        <!-- RIGHT COLUMN (Impact & Finance) -->
        <div style="width:340px;display:flex;flex-direction:column;gap:20px;">

          <!-- Impact Metrics Box -->
          <div style="border-radius:16px;background:${PROPOSAL_SURFACE};border:1px solid ${PROPOSAL_BORDER};padding:24px;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_TEXT};margin-bottom:20px;display:flex;align-items:center;gap:8px;">
              <div style="width:6px;height:6px;border-radius:50%;background:${PROPOSAL_ACCENT};box-shadow:0 0 10px ${PROPOSAL_ACCENT};"></div>
              Estimativas de Impacto
            </div>

            <div style="display:flex;flex-direction:column;gap:18px;">
              <div style="padding-bottom:16px;border-bottom:1px dashed ${PROPOSAL_BORDER};">
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${PROPOSAL_LABEL};margin-bottom:4px;">Inserções (Mensais)</div>
                <div style="font-size:24px;font-weight:800;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${insercoesLabel}</div>
              </div>
              <div style="padding-bottom:16px;border-bottom:1px dashed ${PROPOSAL_BORDER};">
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${PROPOSAL_LABEL};margin-bottom:4px;">Fluxo de Pessoas (Mensal)</div>
                <div style="font-size:24px;font-weight:800;color:${PROPOSAL_TEXT};font-family:Poppins, system-ui, sans-serif;">${fluxoLabel}</div>
              </div>
              <div>
                <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${PROPOSAL_LABEL};margin-bottom:4px;">CPM Estimado</div>
                <div style="font-size:24px;font-weight:800;color:${PROPOSAL_ACCENT};font-family:Poppins, system-ui, sans-serif;">${cpmLabel}</div>
              </div>
            </div>
          </div>

          <!-- Investment Summary -->
          <div style="flex:1;border-radius:16px;background:rgba(232,89,26,0.04);border:1px solid rgba(232,89,26,0.20);padding:24px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden;box-shadow:0 4px 20px rgba(232,89,26,0.06);">
            <div style="position:absolute;top:0;left:0;width:100%;height:3px;background:linear-gradient(90deg, transparent, ${PROPOSAL_ACCENT}, transparent);"></div>

            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${PROPOSAL_ACCENT};background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.2);padding:6px 12px;border-radius:100px;align-self:flex-start;margin-bottom:auto;">
              Resumo Financeiro
            </div>

            <div style="margin-top:24px;">
              ${hasDiscount ? `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <div style="font-size:12px;font-weight:500;color:${PROPOSAL_LABEL};">Valor Original</div>
                  <div style="font-size:14px;font-weight:600;color:${PROPOSAL_LABEL};text-decoration:line-through;font-family:Poppins, system-ui, sans-serif;">${formatMoney(originalTotal)}</div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:16px;border-bottom:1px dashed ${PROPOSAL_BORDER};">
                  <div style="font-size:12px;font-weight:500;color:${PROPOSAL_TEXT_SECONDARY};">Desconto Aplicado</div>
                  <div style="font-size:14px;font-weight:700;color:#16a34a;font-family:Poppins, system-ui, sans-serif;">-${formatMoney(discountTotal)}</div>
                </div>
              ` : ''}

              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${PROPOSAL_TEXT_SECONDARY};">Total Mensal</div>
                <div style="font-size:32px;font-weight:800;color:${PROPOSAL_ACCENT};font-family:Poppins, system-ui, sans-serif;line-height:1.1;letter-spacing:-0.02em;">${formatMoney(finalTotal)}</div>
                <div style="font-size:9.5px;color:${PROPOSAL_LABEL};margin-top:12px;line-height:1.45;">
                  Negociação válida <strong>exclusivamente</strong> para o plano e quantidade de pontos apresentados.<br>
                  Para outras condições de compra, os valores deverão ser consultados.<br>
                  * Produção de materiais por conta do cliente.
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `, PROPOSAL_BG, { height: impactPageHeight, cssClass: 'impact-page' });
}

export async function generateMidiaKitPdf({ praca, pracas, pontos }) {
  activePdfLayoutConfig = await loadPdfLayoutConfig();
  const cidade = praca && praca !== 'Todas as praças' ? praca : 'Consolidado';
  const selectedCities = Array.from(new Set(
    (Array.isArray(pracas) ? pracas : [])
      .map((cityName) => String(cityName || '').trim())
      .filter(Boolean)
  ));
  const kitPontos = Array.isArray(pontos) ? pontos : [];
  const resumo = buildResumo(kitPontos);
  const assets = await loadPdfAssets(cidade);
  const cityStats = {
    cidade,
    totalTelas: resumo.telas,
    totalEnderecos: new Set(kitPontos.map((p) => `${p.cidade || ''}-${p.endereco || ''}`.trim())).size
  };

  // Pré-carrega todas as imagens dos pontos em paralelo com compressão via canvas
  // antes de montar o HTML — o Puppeteer recebe data URLs prontas (sem downloads externos)
  const pointImages = await Promise.all(kitPontos.map((ponto) => imageToDataUrl(pickImageUrl(ponto))));
  const pages = [
    buildMidiaKitCoverPage({ cidade, pontos: kitPontos, resumo, assets, selectedCities }),
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
  const citySlugs = Array.from(new Set(
    [
      ...(Array.isArray(pracas) ? pracas : []),
      ...kitPontos.map((point) => point?.cidade).filter(Boolean)
    ]
      .map((cityName) => slugify(cityName))
      .filter(Boolean)
  ));
  await renderPagesToPdf(pages, fileName, { citySlugs });
}

function buildProposalClosingPage(assets, overviewMapImage) {
  const mapHtml = overviewMapImage
    ? `<div style="width:100%;max-width:980px;margin:0 auto;border-radius:20px;overflow:hidden;border:1px solid ${PROPOSAL_BORDER};background:${PROPOSAL_SURFACE};box-shadow:0 12px 36px rgba(0,0,0,0.10);">
        <div style="width:100%;height:0;padding-top:56%;position:relative;">
          <img src="${overviewMapImage}" alt="Mapa de cobertura" style="position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;" />
        </div>
      </div>`
    : '';

  return createPage(`
    <div style="position:absolute;inset:0;background:${PROPOSAL_BG};"></div>
    <div style="position:absolute;inset:auto auto -180px -60px;width:560px;height:560px;border-radius:999px;background:radial-gradient(circle,rgba(232,89,26,0.08) 0%,rgba(232,89,26,0.02) 48%,rgba(232,89,26,0) 72%);"></div>
    <div style="position:relative;z-index:1;height:768px;max-height:768px;display:flex;align-items:center;justify-content:center;padding:44px 56px;box-sizing:border-box;overflow:hidden;font-family:Poppins, system-ui, sans-serif;color:${PROPOSAL_TEXT};">
      <div style="width:100%;max-width:1060px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;text-align:center;">
        <img src="${assets.logoLight || assets.logo || ''}" alt="" style="height:56px;width:auto;object-fit:contain;flex-shrink:0;" />
        ${mapHtml}
        <div style="text-align:center;max-width:980px;">
          <div style="font-family:Poppins, system-ui, sans-serif;font-size:56px;font-weight:800;line-height:1.08;letter-spacing:-0.03em;color:${PROPOSAL_TEXT};">
          O mundo acontece lá fora<span style="color:${PROPOSAL_ACCENT};">.</span>
          </div>
          <div style="margin-top:14px;font-size:14px;font-weight:500;color:${PROPOSAL_TEXT_SECONDARY};letter-spacing:0.08em;text-transform:uppercase;">
            Intermidia OOH + DOOH — Desde 2007
          </div>
        </div>
      </div>
    </div>
  `);
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
  publico,
  pointMapImages = [],
  overviewMapImage = null,
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
  // Auto-detect público from points if not provided by user
  const effectivePublico = (Array.isArray(publico) && publico.filter(Boolean).length > 0)
    ? publico
    : Array.from(new Set(proposalPoints.map((p) => p.publico).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const assets = await loadPdfAssets();
  // Pré-carrega e comprime todas as imagens da proposta em paralelo via canvas
  const proposalImages = await Promise.all(
    proposalPoints.map((point) => imageToDataUrl(pickProposalImageUrl(point)))
  );
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
      assets,
      showMetricsMethodology
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
    pages.push(buildImpactPage({ proposalPoints, proposalTotals, pricingSummary, simulationSummary, segmento, proposalClient, proposalCity, publico: effectivePublico, assets }));
  }

  pages.push(buildProposalClosingPage(assets, overviewMapImage));

  const fileName = `proposta-${slugify(proposalClient)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const citySlugs = Array.from(new Set(
    proposalPoints
      .map((point) => slugify(point?.cidade || proposalCity))
      .filter(Boolean)
  ));
  await renderPagesToPdf(pages, fileName, { citySlugs, noCache: true });
}
