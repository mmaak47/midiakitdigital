const PAGE_WIDTH = 1366;
const PAGE_HEIGHT = 768; // Adjusted to match the Midia Kit modern design

const BRAND_ORANGE = '#E8591A';
const BRAND_BLACK = '#0B0B0B';
const BRAND_PANEL = '#141414';
const BRAND_BORDER = 'rgba(255,255,255,0.12)';
const BRAND_MUTED = 'rgba(255,255,255,0.72)';
const POINT_NAME_LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

import { normalizeHorarioForPdf } from './horarioUtils';

const FILE_NAME = 'Informações Técnicas.pdf';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeNumber(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function formatDecimal(value, digits = 2) {
  const numeric = normalizeNumber(value, null);
  if (numeric === null) return '-';
  return numeric.toFixed(digits).replace('.', ',');
}

function resolveAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return `${window.location.origin}${raw}`;
  return `${window.location.origin}/${raw.replace(/^\/+/, '')}`;
}

function pickPointImage(point) {
  return point?._pdfImage || resolveAssetUrl(point?.imagem2 || point?.imagem || '');
}

async function compressImageForPdf(url, options = {}) {
  const source = resolveAssetUrl(url);
  if (!source) return '';

  const maxWidth = Number(options.maxWidth || 1400);
  const quality = Number(options.quality || 0.72);

  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';

    image.onload = () => {
      try {
        const ratio = image.naturalWidth > 0 ? image.naturalHeight / image.naturalWidth : 1;
        const targetWidth = Math.max(1, Math.min(maxWidth, image.naturalWidth || maxWidth));
        const targetHeight = Math.max(1, Math.round(targetWidth * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(source);
          return;
        }

        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(source);
      }
    };

    image.onerror = () => resolve(source);
    image.src = source;
  });
}

function parseDuracaoText(str) {
  if (!str) return 0;
  const s = String(str).trim().toLowerCase();

  // formato mm:ss
  const mmss = s.match(/^(\d+):(\d{2})$/);
  if (mmss) return parseInt(mmss[1]) * 60 + parseInt(mmss[2]);

  let total = 0;
  const min = s.match(/(\d+(?:[.,]\d+)?)\s*min/);
  if (min) total += parseFloat(min[1].replace(',', '.')) * 60;
  const sec = s.match(/(\d+(?:[.,]\d+)?)\s*s(?:eg)?(?:\b|$)/);
  if (sec) total += parseFloat(sec[1].replace(',', '.'));

  if (!min && !sec) {
    const num = parseFloat(s.replace(',', '.'));
    if (!isNaN(num)) total = num;
  }
  return Math.round(total);
}

function parseOperatingHours(horario) {
  if (!horario) return 17; // Default: 6h às 23h = 17 horas
  const h = String(horario).toLowerCase();
  
  // Exemplo de parse: "6h às 23h" -> 23 - 6 = 17
  const matches = h.match(/(\d{1,2})h.*?(?:às|as).*?(\d{1,2})h/);
  if (matches) {
    const start = parseInt(matches[1], 10);
    const end = parseInt(matches[2], 10);
    let duration = end > start ? end - start : (24 - start) + end; // Se atravessa a meia noite
    if (duration > 0 && duration <= 24) return duration;
  }
  
  // Tentar 24h
  if (h.includes("24")) return 24;
  
  return 17;
}

function normalizeTextForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

async function preparePointsForPdf(points, onStatusChange) {
  const result = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (typeof onStatusChange === 'function') {
      onStatusChange(`Otimizando fotos (${index + 1}/${points.length})...`);
    }

    const original = resolveAssetUrl(point?.imagem2 || point?.imagem || '');
    const optimized = original
      ? await compressImageForPdf(original)
      : '';

    result.push({
      ...point,
      _pdfImage: optimized || original
    });
  }

  return result;
}

function createPage(content) {
  return `
    <section style="width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;position:relative;overflow:hidden;background:${BRAND_BLACK};color:#fff;font-family:Poppins,system-ui,sans-serif;page-break-after:always;break-after:page;">
      ${content}
    </section>
  `;
}

function buildIcons() {
  const S = `stroke="${BRAND_ORANGE}" stroke-width="1.8"`;
  return {
    aspect: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" ${S}/><path d="M9 9l6 6m0-6l-6 6" ${S} stroke-linecap="round"/></svg>`,
    res: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    file: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" ${S} stroke-linejoin="round"/><path d="M13 2v7h7" ${S} stroke-linejoin="round"/></svg>`,
    weight: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" ${S} stroke-linejoin="round"/><path d="M7 10l5 5 5-5M12 15V3" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="12" r="10" ${S}/><path d="M12 6v6l4 2" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    loop: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M17 2.1l4 4-4 4" ${S} stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12.2v-2a4 4 0 0 1 4-4h14M7 21.9l-4-4 4-4" ${S} stroke-linecap="round" stroke-linejoin="round"/><path d="M21 11.8v2a4 4 0 0 1-4 4H3" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    activity: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="12" r="4" ${S}/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    audio: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" ${S}/><path d="M16 2v4M8 2v4M3 10h18" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    alert: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" ${S} stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" ${S} stroke-linecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" ${S} stroke-linecap="round"/></svg>`
  };
}

function buildSpecItem(title, value, iconSvg) {
  return `
    <div style="display:flex;gap:14px;align-items:flex-start;">
      <div style="width:38px;height:38px;border-radius:10px;background:rgba(232,89,26,0.1);border:1px solid rgba(232,89,26,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${iconSvg}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${title}</div>
        <div style="font-size:15px;font-weight:600;color:#fff;line-height:1.2;">${value}</div>
      </div>
    </div>
  `;
}

function buildHeroImageFrame(image, focalPoint) {
  if (!image) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${BRAND_MUTED};font-size:18px;background:#111;">Sem foto cadastrada</div>`;
  }
  const fp = String(focalPoint || 'center center').trim() || 'center center';
  
  return `
    <div style="position:absolute;inset:0;background:#000;">
      <img src="${image}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${escapeHtml(fp)};filter:blur(26px) saturate(1.1);transform:scale(1.08);opacity:0.45;" />
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,7,7,0.12),rgba(7,7,7,0.62));"></div>
      <img src="${image}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:${escapeHtml(fp)};filter:drop-shadow(0 24px 44px rgba(0,0,0,0.45));" />
    </div>
  `;
}

function buildCoverPage(points) {
  const total = points.length;
  const icons = buildIcons();

  return createPage(`
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 100% 0%, rgba(232,89,26,0.3), transparent 50%),linear-gradient(140deg,#090909,#111 46%,#1b120d 100%);"></div>
    <div style="position:relative;z-index:2;padding:64px;height:100%;display:flex;flex-direction:column;justify-content:space-between;">
      
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:inline-flex;align-items:center;gap:10px;padding:10px 18px;border:1px solid rgba(255,255,255,0.15);border-radius:999px;background:rgba(255,255,255,0.04);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${BRAND_ORANGE};">
          Manual de Especificações
        </div>
        <img src="${resolveAssetUrl('/logo.png')}" alt="Intermídia" style="height:48px;object-fit:contain;" />
      </div>
      
      <!-- Title Area -->
      <div style="margin-top:40px;">
        <h1 style="margin:0;font-size:72px;line-height:1.05;font-weight:900;letter-spacing:-.04em;max-width:800px;">Informações<br>Técnicas</h1>
        <p style="margin:16px 0 0;font-size:22px;color:${BRAND_MUTED};max-width:700px;line-height:1.4;">Diretrizes de resolução, formatos e regras criativas dos pontos selecionados.</p>
        <div style="display:inline-flex;align-items:baseline;gap:6px;margin-top:24px;">
           <span style="font-size:36px;font-weight:900;color:#fff;">${total}</span>
           <span style="font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:${BRAND_ORANGE};">Ponto${total > 1 ? 's' : ''}</span>
        </div>
      </div>

      <!-- Global Specs -->
      <div style="margin-top:48px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;">
         <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;">
            ${buildSpecItem('Tipos de arquivo', 'Vídeo (mp4, mov) ou<br/>Imagem (jpg, png, pdf)', icons.file)}
         </div>
         <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;">
            ${buildSpecItem('Prazo para envio', 'Até 48h antes<br/>do início', icons.calendar)}
         </div>
         <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;">
            ${buildSpecItem('Áudio', 'Campanhas<br/>sem áudio', icons.audio)}
         </div>
      </div>

      <!-- RODAPÉ DE CONTATO -->
      <div style="margin-top:48px;padding:24px 32px;background:rgba(232,89,26,0.05);border:1px solid rgba(232,89,26,0.2);border-radius:16px;display:flex;justify-content:space-between;align-items:center;">
         <div>
           <div style="font-size:12px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Dúvidas? Fale com a criação</div>
           <div style="display:flex;align-items:baseline;gap:10px;">
             <div style="font-size:24px;font-weight:800;color:#fff;">Maite Doin</div>
             <div style="font-size:15px;color:rgba(255,255,255,0.6);">criacao@redeintermidia.com</div>
           </div>
         </div>
         <div>
           <span style="display:inline-flex;align-items:center;gap:10px;padding:12px 24px;background:rgba(232,89,26,0.15);border:1px solid rgba(232,89,26,0.3);border-radius:999px;font-size:18px;font-weight:700;color:#fff;">
             <svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="${BRAND_ORANGE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
             43 8800-5719
           </span>
         </div>
      </div>

    </div>
  `);
}

function buildPointPage(point, index, total) {
  const image = pickPointImage(point);
  const displayName = point?._pdfDisplayName || point?.nome || 'Ponto';
  
  const focalPoint = point?.foto_focal_point || 'center center';
  const imageContainer = buildHeroImageFrame(image, focalPoint);

  const widthPx = Math.max(1, Math.round(normalizeNumber(point?.arte_largura, 1080) || 1080));
  const heightPx = Math.max(1, Math.round(normalizeNumber(point?.arte_altura, 1920) || 1920));
  const isVertical = heightPx >= widthPx;
  const formatAspect = (() => {
    const g = (a, b) => { let x = Math.abs(a), y = Math.abs(b); while (y) { const t = y; y = x % y; x = t; } return x || 1; };
    const d = g(widthPx, heightPx);
    const rw = Math.round(widthPx / d), rh = Math.round(heightPx / d);
    const orientation = isVertical ? 'Vertical' : 'Horizontal';
    return `${orientation} ${rw}:${rh}`;
  })();

  const icons = buildIcons();

  // Dados do ponto
  const OUTDOOR_TIPOS = ['painel led', 'backlight', 'frontlight', 'led posto', 'totem digital'];
  const tipoLower = String(point?.tipo || '').toLowerCase().trim();
  const ambiente = OUTDOOR_TIPOS.includes(tipoLower) ? 'Outdoor' : 'Indoor';
  
  const p_perfil = point?.perfil_publico ? String(point.perfil_publico).trim() : 'A/B';
  const perfil = escapeHtml(p_perfil !== '' ? p_perfil : 'A/B');

  const coords = (point?.lat && point?.lng && point.lat !== '0' && point.lng !== '0')
    ? `${point.lat}, ${point.lng}`
    : '-';
    
  const endereco = escapeHtml(point?.endereco ? String(point.endereco).trim() : (point?.cidade || '-'));

  // Calculando insercoes REAIS/hora baseadas em Inserções/Mês
  // Fórmula: insercoes_mes / 30 dias / horas_por_dia = insercoes_por_hora
  const insercoesMesTxt = String(point?.insercoes || '').replace(/\D/g, '');
  const insercoesMes = parseInt(insercoesMesTxt, 10);
  
  let insercoesHoraLabel = '';
  
  if (!isNaN(insercoesMes) && insercoesMes > 0) {
    const horasPorDia = parseOperatingHours(point?.horario);
    const insercoesPorDia = insercoesMes / 30;
    const insercoesPorHoraMath = Math.round(insercoesPorDia / horasPorDia);
    insercoesHoraLabel = `${insercoesPorHoraMath} inserções/h`;
  } else {
    // Fallback para calculo baseado no loop (se não houver inserções por mês cadastradas)
    const loopSegundos = parseDuracaoText(point?.loop) || 180;
    const fallbackHora = Math.floor(3600 / loopSegundos);
    insercoesHoraLabel = `${fallbackHora} inserções/h`;
  }
  
  const duracaoItem = (point?.tempo && String(point.tempo).trim() !== '') ? escapeHtml(point.tempo) : '15s';
  const loopLabel = (point?.loop && String(point.loop).trim() !== '') ? escapeHtml(point.loop) : '180s';

  return createPage(`
    <div style="display:flex;height:100%;background:#0A0A0A;">
      <!-- COLUNA DA ESQUERDA: IMAGEM + DADOS DO PONTO -->
      <div style="flex:0 0 580px;padding:32px 20px 32px 36px;display:flex;flex-direction:column;gap:20px;">
          
          <div style="flex-shrink:0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:24px;">
             <div style="font-size:11px;font-weight:800;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:6px;">Dados do ponto</div>
             <div style="font-size:32px;font-weight:800;color:#fff;line-height:1.1;margin-bottom:20px;letter-spacing:-0.03em;word-break:break-word;">${escapeHtml(displayName)}</div>
             
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px;">
                  <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Ambiente / Perfil</div>
                  <div style="font-size:13px;color:#fff;font-weight:600;">${ambiente} &bull; ${perfil}</div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px;">
                  <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Coordenadas</div>
                  <div style="font-size:13px;color:#fff;font-weight:600;">${coords}</div>
                </div>
                <div style="grid-column:1 / -1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px;">
                  <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Localização</div>
                  <div style="font-size:13px;color:#fff;font-weight:600;">${endereco}</div>
                </div>
             </div>
          </div>
          
          <div style="flex:1;position:relative;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
             ${imageContainer}
             <div style="position:absolute;top:24px;left:24px;padding:6px 12px;border-radius:999px;background:rgba(232,89,26,0.3);backdrop-filter:blur(8px);border:1px solid rgba(232,89,26,0.5);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ffd3bf;">
                Ponto ${index} de ${total}
             </div>
             <img src="${resolveAssetUrl('/logo.png')}" alt="Intermídia" style="position:absolute;top:24px;right:24px;height:24px;object-fit:contain;" />
          </div>

      </div>

      <!-- COLUNA DA DIREITA: ESPECIFICAÇÕES LOCAIS -->
      <div style="flex:1;padding:48px 56px;display:flex;flex-direction:column;justify-content:center;background:radial-gradient(ellipse at 100% 0%, rgba(232,89,26,0.05) 0%, transparent 40%), #080808;">
          <div style="font-size:11px;font-weight:700;color:${BRAND_ORANGE};letter-spacing:0.18em;text-transform:uppercase;margin-bottom:4px;">Especificações da tela</div>
          <div style="font-size:42px;font-weight:900;color:#fff;letter-spacing:-0.03em;margin-bottom:40px;">Diretrizes Técnicas</div>
          
          <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:16px;row-gap:28px;">
            <div style="display:flex;flex-direction:column;gap:28px;">
              ${buildSpecItem('Formato', formatAspect, icons.aspect)}
              ${buildSpecItem('Duração', duracaoItem, icons.clock)}
              ${buildSpecItem('Exibição Média', insercoesHoraLabel, icons.activity)}
            </div>
            <div style="display:flex;flex-direction:column;gap:28px;">
              ${buildSpecItem('Resolução', `${widthPx}x${heightPx} px`, icons.res)}
              ${buildSpecItem('Tamanho máximo', '50MB', icons.weight)}
              ${buildSpecItem('Loop Estimado', loopLabel, icons.loop)}
            </div>
            
            <div style="grid-column: 1 / -1; display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:8px;">
              ${buildSpecItem('Funcionamento', escapeHtml(point?.horario && point.horario !== '' ? normalizeHorarioForPdf(point.horario) : '6h às 23h'), icons.sun)}
            </div>
            
            <div style="grid-column: 1 / -1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-top:12px;">
              ${buildSpecItem('Regras criativas', 'Texto curto, alto contraste e logo em destaque', icons.alert)}
            </div>
          </div>

          <div style="margin-top:32px;padding:16px 20px;background:rgba(232,89,26,0.08);border-left:4px solid ${BRAND_ORANGE};border-radius:8px;display:flex;align-items:center;gap:14px;">
             <svg viewBox="0 0 24 24" width="22" height="22" fill="none"><circle cx="12" cy="12" r="10" stroke="${BRAND_ORANGE}" stroke-width="1.8"/><path d="M12 8v4M12 16h.01" stroke="${BRAND_ORANGE}" stroke-width="2" stroke-linecap="round"/></svg>
             <div>
               <span style="font-size:15px;font-weight:700;color:#fff;">Operação:</span> 
               <span style="font-size:15px;color:rgba(255,255,255,0.85);margin-left:4px;">Material sujeito a aprovação técnica.</span>
             </div>
          </div>
      </div>
    </div>
  `);
}

async function renderPagesToPdf(pagesHtml, fileName, onStatusChange) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"/>
<base href="${window.location.origin}" />
<title>${escapeHtml(fileName)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; }
html, body { background: #080808; margin:0; padding:0; }
@page { size: ${PAGE_WIDTH}px ${PAGE_HEIGHT}px; margin: 0; }
section:last-child { page-break-after: avoid; break-after: avoid; }
</style>
</head><body>${pagesHtml.join('\n')}</body></html>`;

  if (typeof onStatusChange === 'function') {
    onStatusChange('Enviando layout para o servidor...');
  }

  const response = await fetch('/api/pdf/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      html,
      fileName,
      noCache: true
    })
  });

  if (!response.ok) {
    throw new Error('Falha ao gerar o PDF técnico.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function generateTechnicalInfoPdf(points = [], options = {}) {
  const list = Array.isArray(points)
    ? points.filter((point) => point && point.id !== undefined)
    : [];

  if (!list.length) {
    throw new Error('Selecione pelo menos um ponto para exportar o PDF técnico.');
  }

  const preparedPoints = normalizeAndSortPointsForPdf(
    await preparePointsForPdf(list, options.onStatusChange)
  );

  const pages = [buildCoverPage(preparedPoints)];
  preparedPoints.forEach((point, index) => {
    pages.push(buildPointPage(point, index + 1, preparedPoints.length));
  });

  if (typeof options.onStatusChange === 'function') {
    options.onStatusChange('Montando páginas técnicas...');
  }

  await renderPagesToPdf(pages, FILE_NAME, options.onStatusChange);

  if (typeof options.onStatusChange === 'function') {
    options.onStatusChange('PDF técnico gerado com sucesso.');
  }
}
