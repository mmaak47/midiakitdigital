/**
 * technicalInfoMobilePdf.js
 * Template PDF mobile para: Informações Técnicas (Especificações).
 *
 * Formato: 540×960px (portrait 9:16 — otimizado para celular)
 * Layout: coluna única, fonte mínima 16px, especificações em cards.
 *
 * ❌ NÃO altera a lógica de geração do PDF desktop.
 * ✅ Arquivo independente; reutiliza apenas utilitários básicos.
 */

// ── Dimensões ───────────────────────────────────────────────────────────────
const MOBILE_W = 540;
const MOBILE_H = 960;

// ── Paleta (identidade visual mantida) ─────────────────────────────────────
const ORANGE  = '#E8591A';
const BLACK   = '#0B0B0B';
const SURFACE = '#141414';
const BORDER  = 'rgba(255,255,255,0.10)';
const MUTED   = 'rgba(255,255,255,0.55)';
const TEXT    = '#FFFFFF';
const POINT_NAME_LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

const FILE_NAME_MOBILE = 'Informações Técnicas Mobile.pdf';

// ── Helpers ─────────────────────────────────────────────────────────────────

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return `${window.location.origin}${raw}`;
  return `${window.location.origin}/${raw.replace(/^\/+/, '')}`;
}

function pickImg(point) {
  return point?._pdfImage || resolveUrl(point?.imagem2 || point?.imagem || '');
}

async function compressImg(url, maxW = 800) {
  const src = resolveUrl(url);
  if (!src) return '';
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const ratio  = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1;
        const tW     = Math.max(1, Math.min(maxW, img.naturalWidth || maxW));
        const tH     = Math.max(1, Math.round(tW * ratio));
        const canvas = document.createElement('canvas');
        canvas.width  = tW;
        canvas.height = tH;
        canvas.getContext('2d').drawImage(img, 0, 0, tW, tH);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function parseDuracao(str) {
  if (!str) return 0;
  const s = String(str).trim().toLowerCase();
  const mmss = s.match(/^(\d+):(\d{2})$/);
  if (mmss) return parseInt(mmss[1]) * 60 + parseInt(mmss[2]);
  let total = 0;
  const min = s.match(/(\d+(?:[.,]\d+)?)\s*min/);
  if (min) total += parseFloat(min[1].replace(',', '.')) * 60;
  const sec = s.match(/(\d+(?:[.,]\d+)?)\s*s(?:eg)?(?:\b|$)/);
  if (sec) total += parseFloat(sec[1].replace(',', '.'));
  if (!min && !sec) { const n = parseFloat(s.replace(',', '.')); if (!isNaN(n)) total = n; }
  return Math.round(total);
}

function parseHorario(horario) {
  if (!horario) return 17;
  const h = String(horario).toLowerCase();
  const m = h.match(/(\d{1,2})h.*?(?:às|as).*?(\d{1,2})h/);
  if (m) { const d = parseInt(m[2]) - parseInt(m[1]); if (d > 0 && d <= 24) return d; }
  if (h.includes('24')) return 24;
  return 17;
}

function formatDecimal(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return numeric.toFixed(digits).replace('.', ',');
}

function normalizeTextForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isStaticPrintedType(tipo) {
  const tipoNorm = normalizeTextForMatch(tipo);
  return tipoNorm.includes('backlight') || tipoNorm.includes('frontlight');
}

function buildAspectLabel(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'Horizontal 16:9';

  const orientation = h >= w ? 'Vertical' : 'Horizontal';
  const precision = 100;
  const wInt = Math.max(1, Math.round(w * precision));
  const hInt = Math.max(1, Math.round(h * precision));
  const gcd = (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  };
  const d = gcd(wInt, hInt);
  const rw = Math.max(1, Math.round(wInt / d));
  const rh = Math.max(1, Math.round(hInt / d));
  return `${orientation} ${rw}:${rh}`;
}

function buildAcceptedFileTypesLabel(points = []) {
  const hasStatic = points.some((point) => isStaticPrintedType(point?.tipo));
  const hasDigital = points.some((point) => !isStaticPrintedType(point?.tipo));
  if (hasStatic && !hasDigital) {
    return 'Imagem (jpg, png, pdf)';
  }
  if (hasStatic && hasDigital) {
    return 'Vídeo (mp4, mov) para digitais e Imagem (jpg, png, pdf) para mídia estática';
  }
  return 'Vídeo (mp4, mov) ou Imagem (jpg, png, pdf)';
}

function toPointTitleCase(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';

  let wordIndex = 0;
  return raw.split(/(\s+|-|\/)/).map((part) => {
    if (/^\s+$/.test(part) || part === '-' || part === '/') {
      return part;
    }

    return part.replace(/[A-Za-zÀ-ÿ0-9]+/g, (word) => {
      const lower = word.toLowerCase();
      const isRoman = /^(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(word);
      const isFirstWord = wordIndex === 0;
      wordIndex += 1;

      if (/^\d+$/.test(word)) return word;
      if (isRoman) return lower.toUpperCase();
      if (!isFirstWord && POINT_NAME_LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
  }).join('');
}

function normalizePointNameForPdf(nome, tipo) {
  const titled = toPointTitleCase(nome || 'Ponto');
  const tipoNorm = normalizeTextForMatch(tipo);

  if (!tipoNorm.includes('elevador')) {
    return titled;
  }

  if (/(?:\bCondom[ií]nio\b|\bCond\.?(?=\s|$))/i.test(titled)) {
    return titled
      .replace(/(?:\bCondom[ií]nio\b|\bCond\.?(?=\s|$))/gi, 'Cond.')
      .replace(/^(?:Ed\.|Edif[ií]cio)\s+/i, '')
      .trim();
  }

  if (/^Ed\.\s+/i.test(titled)) return titled;
  if (/^Edif[ií]cio\s+/i.test(titled)) return titled.replace(/^Edif[ií]cio\s+/i, 'Ed. ');
  return `Ed. ${titled}`;
}

function getPointCategoryKey(tipo) {
  const tipoNorm = normalizeTextForMatch(tipo);
  if (tipoNorm.includes('elevador')) return '01-elevadores';
  if ((tipoNorm.includes('painel') && tipoNorm.includes('led')) || tipoNorm.includes('led painel')) return '02-painel-led';
  if (tipoNorm.includes('backlight')) return '03-backlight';
  if (tipoNorm.includes('frontlight')) return '04-frontlight';
  if (tipoNorm.includes('led posto')) return '05-led-posto';
  if (tipoNorm.includes('totem')) return '06-totem';
  if (tipoNorm.includes('indoor')) return '07-indoor';
  return `99-${tipoNorm || 'outros'}`;
}

function normalizeAndSortPointsForPdf(points = []) {
  const normalized = points.map((point) => ({
    ...point,
    _pdfDisplayName: normalizePointNameForPdf(point?.nome, point?.tipo),
    _pdfCategoryKey: getPointCategoryKey(point?.tipo),
  }));

  return normalized.sort((a, b) => {
    const catCmp = String(a._pdfCategoryKey || '').localeCompare(String(b._pdfCategoryKey || ''), 'pt-BR');
    if (catCmp !== 0) return catCmp;

    const nameCmp = String(a._pdfDisplayName || '').localeCompare(String(b._pdfDisplayName || ''), 'pt-BR', {
      sensitivity: 'base',
      numeric: true,
    });
    if (nameCmp !== 0) return nameCmp;

    return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', {
      sensitivity: 'base',
      numeric: true,
    });
  });
}

function formatDuracaoLabel(durSec) {
  if (!durSec) return '-';
  if (durSec >= 60) {
    const m = Math.floor(durSec / 60), s = durSec % 60;
    return s > 0 ? `${m}min ${s}s` : `${m} min`;
  }
  return `${durSec}s`;
}

async function preparePoints(points, onStatus) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (typeof onStatus === 'function') onStatus(`Otimizando fotos (${i + 1}/${points.length})...`);
    const original  = resolveUrl(p?.imagem2 || p?.imagem || '');
    const optimized = original ? await compressImg(original) : '';
    result.push({ ...p, _pdfImage: optimized || original });
  }
  return result;
}

function createMobilePage(innerHTML, bg = BLACK) {
  const el = document.createElement('section');
  Object.assign(el.style, {
    display:        'block',
    width:          `${MOBILE_W}px`,
    height:         `${MOBILE_H}px`,
    minHeight:      `${MOBILE_H}px`,
    maxHeight:      `${MOBILE_H}px`,
    position:       'relative',
    overflow:       'hidden',
    background:     bg,
    color:          TEXT,
    fontFamily:     'Poppins, system-ui, sans-serif',
    boxSizing:      'border-box',
    pageBreakAfter: 'always',
    breakAfter:     'page',
  });
  el.innerHTML = innerHTML;
  return el;
}

function specItem(label, value) {
  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:13px 0;border-bottom:1px solid ${BORDER};">
      <span style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};flex:0 0 auto;padding-right:12px;">${escHtml(label)}</span>
      <span style="font-size:15px;font-weight:600;color:${TEXT};text-align:right;">${escHtml(String(value))}</span>
    </div>
  `;
}

function specCard(items) {
  return `<div style="background:${SURFACE};border:1px solid ${BORDER};border-radius:14px;padding:2px 18px 2px;box-sizing:border-box;">${items.join('')}</div>`;
}

// ── PÁGINAS ─────────────────────────────────────────────────────────────────

function buildTechMobileCoverPage(points) {
  const count = points.length;
  const fileTypesLabel = buildAcceptedFileTypesLabel(points);

  return createMobilePage(`
    <div style="position:absolute;inset:0;background:linear-gradient(160deg,${SURFACE} 0%,${BLACK} 100%);"></div>
    <div style="position:absolute;inset:0;padding:44px 28px;display:flex;flex-direction:column;gap:28px;box-sizing:border-box;overflow:hidden;">

      <!-- Logo -->
      <img src="/logo.png" alt="" style="height:38px;width:auto;object-fit:contain;" />

      <!-- Title block -->
      <div style="margin-top:8px;">
        <div style="display:inline-flex;align-items:center;padding:8px 16px;border:1px solid rgba(255,255,255,0.15);border-radius:999px;background:rgba(255,255,255,0.04);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${ORANGE};margin-bottom:16px;">Manual de Especificações</div>
        <h1 style="margin-top:10px;font-size:40px;line-height:1.0;font-weight:800;letter-spacing:-0.03em;color:${TEXT};">Informações<br/>Técnicas</h1>
        <p style="margin-top:12px;font-size:15px;line-height:1.55;color:${MUTED};">Diretrizes de resolução, formatos e regras criativas dos pontos selecionados.</p>
      </div>

      <!-- Point count -->
      <div style="padding:20px 22px;background:rgba(232,89,26,0.08);border:1px solid rgba(232,89,26,0.20);border-radius:14px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ORANGE};">Pontos neste manual</div>
        <div style="margin-top:6px;font-size:52px;font-weight:800;color:${TEXT};line-height:1;">${count}</div>
      </div>

      <!-- Global specs -->
      <div style="flex:1;display:flex;flex-direction:column;gap:10px;overflow:hidden;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};margin-bottom:4px;">Especificações gerais</div>
        ${specCard([
          specItem('Tipos de arquivo', fileTypesLabel),
          specItem('Prazo para envio', 'Até 48h antes do início'),
          specItem('Áudio', 'Campanhas sem áudio'),
        ])}
      </div>

      <!-- Footer contact -->
      <div style="padding:16px 18px;background:rgba(232,89,26,0.05);border:1px solid rgba(232,89,26,0.2);border-radius:14px;">
        <div style="font-size:11px;font-weight:700;color:${ORANGE};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Dúvidas? Fale com a criação</div>
        <div style="font-size:18px;font-weight:800;color:${TEXT};">Maite Doin</div>
        <div style="font-size:13px;color:${MUTED};margin-top:4px;">criacao@redeintermidia.com</div>
        <div style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:6px 14px;background:rgba(232,89,26,0.15);border:1px solid rgba(232,89,26,0.3);border-radius:999px;font-size:14px;font-weight:700;color:${TEXT};">43 8800-5719</div>
      </div>
    </div>
  `);
}

function buildTechMobilePointPage(point, index, total) {
  const img        = pickImg(point);
  const focalPt    = String(point?.foto_focal_point || 'center center').trim();
  const nome       = escHtml(point?._pdfDisplayName || point?.nome || 'Ponto');
  const isStaticPoint = isStaticPrintedType(point?.tipo);

  // Ambiente + Perfil (matching desktop)
  const ambiente   = escHtml((point?.ambiente && String(point.ambiente).trim() !== '') ? point.ambiente : 'Indoor');
  const perfil     = escHtml((point?.perfil_publico && String(point.perfil_publico).trim() !== '') ? point.perfil_publico : 'A/B');

  // Coordinates (matching desktop)
  const coords     = (point?.lat && point?.lng && point.lat !== '0' && point.lng !== '0')
    ? `${point.lat}, ${point.lng}` : '-';

  // Location
  const endereco   = escHtml(point?.endereco ? String(point.endereco).trim() : (point?.cidade || '-'));

  // Formato / aspect ratio (matching desktop)
  const widthPx    = Math.max(1, Math.round(Number(point?.arte_largura || 1080) || 1080));
  const heightPx   = Math.max(1, Math.round(Number(point?.arte_altura || 1920) || 1920));

  // Para Backlight/Frontlight, usar dimensoes fisicas em metros (nao pixels)
  const mwM = Number(point?.midia_largura_m);
  const mhM = Number(point?.midia_altura_m);
  const hasMeters = isStaticPoint && Number.isFinite(mwM) && mwM > 0 && Number.isFinite(mhM) && mhM > 0;
  const formatAspect = buildAspectLabel(hasMeters ? mwM : widthPx, hasMeters ? mhM : heightPx);
  const resolucao  = hasMeters ? `${formatDecimal(mwM, 2)}m x ${formatDecimal(mhM, 2)}m` : `${widthPx}x${heightPx} px`;

  // Duracao
  const duracaoItem = isStaticPoint
    ? 'Exibicao continua (midia estatica)'
    : ((point?.tempo && String(point.tempo).trim() !== '') ? escHtml(point.tempo) : '15s');

  // Insercoes por hora
  const insercoesMesTxt = String(point?.insercoes || '').replace(/\D/g, '');
  const insercoesMes = parseInt(insercoesMesTxt, 10);
  let insercoesLabel = '';
  if (isStaticPoint) {
    insercoesLabel = 'Exposicao continua';
  } else if (!isNaN(insercoesMes) && insercoesMes > 0) {
    const hoursDay = parseHorario(point?.horario);
    const perDay   = insercoesMes / 30;
    const perHour  = Math.round(perDay / hoursDay);
    insercoesLabel = `${perHour} insercoes/h`;
  } else {
    const loopSeg = parseDuracao(point?.loop) || 180;
    insercoesLabel = `${Math.floor(3600 / loopSeg)} insercoes/h`;
  }

  // Loop
  const loopLabelNormalized = isStaticPoint
    ? 'Nao se aplica'
    : (() => {
      const loopLabel = (point?.loop && String(point.loop).trim() !== '') ? escHtml(point.loop) : '180s';
      const parsedLoopSec = parseDuracao(point?.loop);
      return parsedLoopSec > 0 ? formatDuracaoLabel(parsedLoopSec) : loopLabel;
    })();

  return createMobilePage(`
    <!-- Photo panel: top 38% -->
    <div style="position:absolute;top:0;left:0;right:0;height:38%;background:#111;overflow:hidden;">
      ${img
        ? `<img src="${img}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${escHtml(focalPt)};" />`
        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${MUTED};">Sem foto cadastrada</div>`}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(11,11,11,0.7) 100%);"></div>
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${ORANGE};"></div>
      <div style="position:absolute;top:16px;right:16px;padding:5px 12px;border-radius:999px;background:rgba(0,0,0,0.65);font-size:12px;font-weight:700;color:#fff;">Ponto ${index} de ${total}</div>
      <div style="position:absolute;bottom:12px;left:18px;">
        <img src="/logo.png" alt="" style="height:24px;width:auto;object-fit:contain;opacity:0.85;" />
      </div>
    </div>

    <!-- Content panel: bottom 62% -->
    <div style="position:absolute;top:38%;left:0;right:0;bottom:0;padding:16px 22px 14px;display:flex;flex-direction:column;gap:10px;overflow:hidden;box-sizing:border-box;">

      <!-- Dados do ponto -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:800;color:${ORANGE};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">Dados do ponto</div>
        <div style="font-size:20px;line-height:1.1;font-weight:700;color:${TEXT};word-break:break-word;">${nome}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;">
            <div style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Ambiente / Perfil</div>
            <div style="font-size:12px;color:#fff;font-weight:600;">${ambiente} &bull; ${perfil}</div>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;">
            <div style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Coordenadas</div>
            <div style="font-size:12px;color:#fff;font-weight:600;">${coords}</div>
          </div>
          <div style="grid-column:1 / -1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;">
            <div style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Localização</div>
            <div style="font-size:12px;color:#fff;font-weight:600;">${endereco}</div>
          </div>
        </div>
      </div>

      <!-- Technical specifications -->
      <div style="flex:1;overflow:hidden;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};margin-bottom:6px;">Especificações da tela</div>
        ${specCard([
          specItem('Formato', formatAspect),
          specItem('Resolução', resolucao),
          specItem('Duração', duracaoItem),
          specItem('Exibição média', insercoesLabel),
          specItem('Loop estimado', loopLabelNormalized),
          specItem('Tamanho máximo', '50MB'),
          specItem('Funcionamento', point?.horario || '6h às 23h'),
        ])}
      </div>

      <!-- Creative rules + operation note -->
      <div style="padding:10px 14px;border-radius:10px;background:rgba(232,89,26,0.07);border-left:3px solid ${ORANGE};">
        <div style="font-size:11px;font-weight:700;color:${TEXT};">Regras criativas</div>
        <p style="margin-top:3px;font-size:11px;line-height:1.5;color:${MUTED};">Texto curto, alto contraste e logo em destaque</p>
      </div>
      <div style="padding:10px 14px;border-radius:8px;background:rgba(232,89,26,0.08);border-left:4px solid ${ORANGE};display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;font-weight:700;color:${TEXT};">Operação:</span>
        <span style="font-size:12px;color:rgba(255,255,255,0.85);">Material sujeito a aprovação técnica.</span>
      </div>
    </div>
  `);
}

async function renderMobilePagesToPdf(pages, fileName) {
  const pageHtml = pages.map((p) => p.outerHTML).join('\n');
  const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<base href="${window.location.origin}">
<title>${escHtml(fileName.replace(/\.pdf$/i, ''))}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; }
html, body { margin:0; padding:0; background:#000; }
@page { size: ${MOBILE_W}px ${MOBILE_H}px; margin:0; }
section { display:block; width:${MOBILE_W}px !important; height:${MOBILE_H}px !important; overflow:hidden !important; page-break-after:always; break-after:page; }
section:last-child { page-break-after:avoid; break-after:avoid; }
</style>
</head><body>${pageHtml}</body></html>`;

  const res = await fetch('/api/pdf/render', {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body:        JSON.stringify({ html: fullHtml, fileName, noCache: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao gerar o PDF técnico mobile.');
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── EXPORT PÚBLICO ──────────────────────────────────────────────────────────

export async function generateTechnicalInfoMobilePdf(points = [], options = {}) {
  const list = Array.isArray(points)
    ? points.filter((p) => p && p.id !== undefined)
    : [];

  if (!list.length) {
    throw new Error('Selecione pelo menos um ponto para exportar o PDF técnico mobile.');
  }

  if (typeof options.onStatusChange === 'function') options.onStatusChange('Otimizando imagens...');
  const prepared = normalizeAndSortPointsForPdf(
    await preparePoints(list, options.onStatusChange)
  );

  if (typeof options.onStatusChange === 'function') options.onStatusChange('Montando páginas mobile...');
  const pages = [buildTechMobileCoverPage(prepared)];
  prepared.forEach((point, i) => pages.push(buildTechMobilePointPage(point, i + 1, prepared.length)));

  await renderMobilePagesToPdf(pages, FILE_NAME_MOBILE);

  if (typeof options.onStatusChange === 'function') options.onStatusChange('PDF mobile gerado com sucesso.');
}
