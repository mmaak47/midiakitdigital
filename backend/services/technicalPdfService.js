'use strict';

/**
 * technicalPdfService.js
 *
 * Gera os PDFs técnicos (desktop + mobile) no servidor, reutilizando exatamente
 * o mesmo layout das versões frontend (technicalInfoPdf.js / technicalInfoMobilePdf.js).
 *
 * Diferenças em relação ao frontend:
 *  - window.location.origin → BASE_URL (http://localhost:PORT)
 *  - Compressão de imagem via Canvas → omitida (Puppeteer já carrega imagens por HTTP)
 *  - document.createElement → strings HTML puras
 *  - fetch /api/pdf/render → chama renderHtmlToPdfCompressed diretamente
 */

const { renderHtmlToPdfCompressed } = require('../pdfService');

const BASE_URL = `http://localhost:${process.env.PORT || 3002}`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS COMPARTILHADOS
// ─────────────────────────────────────────────────────────────────────────────

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

function resolveAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return `${BASE_URL}${raw}`;
  return `${BASE_URL}/${raw.replace(/^\/+/, '')}`;
}

function pickPointImage(point) {
  return resolveAssetUrl(point?.imagem2 || point?.imagem || '');
}

function parseDuracaoText(str) {
  if (!str) return 0;
  const s = String(str).trim().toLowerCase();
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
  if (!horario) return 17;
  const h = String(horario).toLowerCase();
  const matches = h.match(/(\d{1,2})h.*?(?:às|as).*?(\d{1,2})h/);
  if (matches) {
    const start = parseInt(matches[1], 10);
    const end = parseInt(matches[2], 10);
    const duration = end > start ? end - start : (24 - start) + end;
    if (duration > 0 && duration <= 24) return duration;
  }
  if (h.includes('24')) return 24;
  return 17;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF DESKTOP (1366×768) — espelho de technicalInfoPdf.js
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_WIDTH  = 1366;
const PAGE_HEIGHT = 768;
const BRAND_ORANGE = '#E8591A';
const BRAND_BLACK  = '#0B0B0B';
const BRAND_MUTED  = 'rgba(255,255,255,0.72)';

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
    aspect:   `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" ${S}/><path d="M9 9l6 6m0-6l-6 6" ${S} stroke-linecap="round"/></svg>`,
    res:      `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    file:     `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" ${S} stroke-linejoin="round"/><path d="M13 2v7h7" ${S} stroke-linejoin="round"/></svg>`,
    weight:   `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" ${S} stroke-linejoin="round"/><path d="M7 10l5 5 5-5M12 15V3" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    clock:    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="12" r="10" ${S}/><path d="M12 6v6l4 2" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    loop:     `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M17 2.1l4 4-4 4" ${S} stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12.2v-2a4 4 0 0 1 4-4h14M7 21.9l-4-4 4-4" ${S} stroke-linecap="round" stroke-linejoin="round"/><path d="M21 11.8v2a4 4 0 0 1-4 4H3" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    activity: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    sun:      `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="12" r="4" ${S}/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    audio:    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" ${S}/><path d="M16 2v4M8 2v4M3 10h18" ${S} stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    alert:    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" ${S} stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" ${S} stroke-linecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" ${S} stroke-linecap="round"/></svg>`
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

function buildDesktopCoverPage(points) {
  const total = points.length;
  const icons = buildIcons();
  const logoUrl = resolveAssetUrl('/logo.png');

  return createPage(`
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 100% 0%, rgba(232,89,26,0.3), transparent 50%),linear-gradient(140deg,#090909,#111 46%,#1b120d 100%);"></div>
    <div style="position:relative;z-index:2;padding:64px;height:100%;display:flex;flex-direction:column;justify-content:space-between;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:inline-flex;align-items:center;gap:10px;padding:10px 18px;border:1px solid rgba(255,255,255,0.15);border-radius:999px;background:rgba(255,255,255,0.04);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${BRAND_ORANGE};">
          Manual de Especificações
        </div>
        <img src="${logoUrl}" alt="Intermídia" style="height:48px;object-fit:contain;" />
      </div>
      <div style="margin-top:40px;">
        <h1 style="margin:0;font-size:72px;line-height:1.05;font-weight:900;letter-spacing:-.04em;max-width:800px;">Informações<br>Técnicas</h1>
        <p style="margin:16px 0 0;font-size:22px;color:${BRAND_MUTED};max-width:700px;line-height:1.4;">Diretrizes de resolução, formatos e regras criativas dos pontos selecionados.</p>
        <div style="display:inline-flex;align-items:baseline;gap:6px;margin-top:24px;">
           <span style="font-size:36px;font-weight:900;color:#fff;">${total}</span>
           <span style="font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:${BRAND_ORANGE};">Ponto${total > 1 ? 's' : ''}</span>
        </div>
      </div>
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

function buildDesktopPointPage(point, index, total) {
  const image      = pickPointImage(point);
  const focalPoint = point?.foto_focal_point || 'center center';
  const imageContainer = buildHeroImageFrame(image, focalPoint);
  const logoUrl    = resolveAssetUrl('/logo.png');

  const widthPx  = Math.max(1, Math.round(normalizeNumber(point?.arte_largura, 1080) || 1080));
  const heightPx = Math.max(1, Math.round(normalizeNumber(point?.arte_altura, 1920) || 1920));
  const isVertical = heightPx >= widthPx;
  const formatAspect = isVertical ? 'Vertical 9:16' : 'Horizontal 16:9';

  const icons = buildIcons();

  const ambiente = escapeHtml(point?.ambiente || 'Indoor');
  const perfil   = escapeHtml(point?.perfil_publico || point?.publico || 'A/B');
  const coords   = (point?.lat && point?.lng && point.lat !== '0' && point.lng !== '0')
    ? `${point.lat}, ${point.lng}`
    : '-';
  const endereco = escapeHtml(point?.endereco ? String(point.endereco).trim() : (point?.cidade || '-'));

  const insercoesMes = parseInt(String(point?.insercoes || '').replace(/\D/g, ''), 10);
  let insercoesHoraLabel = '';
  if (!isNaN(insercoesMes) && insercoesMes > 0) {
    const horasPorDia      = parseOperatingHours(point?.horario);
    const insercoesPorHora = Math.round((insercoesMes / 30) / horasPorDia);
    insercoesHoraLabel = `${insercoesPorHora} inserções/h`;
  } else {
    const loopSeg   = parseDuracaoText(point?.loop) || 180;
    insercoesHoraLabel = `${Math.floor(3600 / loopSeg)} inserções/h`;
  }

  const duracaoItem = escapeHtml(point?.tempo && String(point.tempo).trim() !== '' ? point.tempo : '15s');
  const loopLabel   = escapeHtml(point?.loop  && String(point.loop).trim()  !== '' ? point.loop  : '180s');

  return createPage(`
    <div style="display:flex;height:100%;background:#0A0A0A;">
      <div style="flex:0 0 580px;padding:32px 20px 32px 36px;display:flex;flex-direction:column;gap:20px;">
          <div style="flex-shrink:0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:24px;">
             <div style="font-size:11px;font-weight:800;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.12em;margin-bottom:6px;">Dados do ponto</div>
             <div style="font-size:32px;font-weight:800;color:#fff;line-height:1.1;margin-bottom:20px;letter-spacing:-0.03em;word-break:break-word;">${escapeHtml(point?.nome || 'Ponto')}</div>
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
             <img src="${logoUrl}" alt="Intermídia" style="position:absolute;top:24px;right:24px;height:24px;object-fit:contain;" />
          </div>
      </div>
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
              ${buildSpecItem('Funcionamento', escapeHtml(point?.horario && point.horario !== '' ? point.horario : '6h às 23h'), icons.sun)}
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

function buildDesktopHtml(points) {
  const pages = [buildDesktopCoverPage(points)];
  points.forEach((point, index) => {
    pages.push(buildDesktopPointPage(point, index + 1, points.length));
  });

  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"/>
<base href="${BASE_URL}" />
<title>Informações Técnicas</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; }
html, body { background: #080808; margin:0; padding:0; }
@page { size: ${PAGE_WIDTH}px ${PAGE_HEIGHT}px; margin: 0; }
section:last-child { page-break-after: avoid; break-after: avoid; }
</style>
</head><body>${pages.join('\n')}</body></html>`;
}

async function generateDesktopPdfBuffer(points) {
  const html = buildDesktopHtml(points);
  return renderHtmlToPdfCompressed(html);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF MOBILE (540×960) — espelho de technicalInfoMobilePdf.js
// ─────────────────────────────────────────────────────────────────────────────

const MOBILE_W  = 540;
const MOBILE_H  = 960;
const M_ORANGE  = '#E8591A';
const M_BLACK   = '#0B0B0B';
const M_SURFACE = '#141414';
const M_BORDER  = 'rgba(255,255,255,0.10)';
const M_MUTED   = 'rgba(255,255,255,0.55)';
const M_TEXT    = '#FFFFFF';

function mSpecItem(label, value) {
  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:13px 0;border-bottom:1px solid ${M_BORDER};">
      <span style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${M_MUTED};flex:0 0 auto;padding-right:12px;">${escapeHtml(label)}</span>
      <span style="font-size:15px;font-weight:600;color:${M_TEXT};text-align:right;">${escapeHtml(String(value))}</span>
    </div>
  `;
}

function mSpecCard(items) {
  return `<div style="background:${M_SURFACE};border:1px solid ${M_BORDER};border-radius:14px;padding:2px 18px 2px;box-sizing:border-box;">${items.join('')}</div>`;
}

function buildMobileCoverPage(points) {
  const count   = points.length;
  const logoUrl = resolveAssetUrl('/logo.png');

  return `
    <section style="display:block;width:${MOBILE_W}px;height:${MOBILE_H}px;min-height:${MOBILE_H}px;max-height:${MOBILE_H}px;position:relative;overflow:hidden;background:${M_BLACK};color:${M_TEXT};font-family:Poppins,system-ui,sans-serif;box-sizing:border-box;page-break-after:always;break-after:page;">
      <div style="position:absolute;inset:0;background:linear-gradient(160deg,${M_SURFACE} 0%,${M_BLACK} 100%);"></div>
      <div style="position:absolute;inset:0;padding:44px 28px;display:flex;flex-direction:column;gap:28px;box-sizing:border-box;overflow:hidden;">
        <img src="${logoUrl}" alt="" style="height:38px;width:auto;object-fit:contain;" />
        <div style="margin-top:8px;">
          <div style="width:44px;height:4px;background:${M_ORANGE};border-radius:2px;margin-bottom:16px;"></div>
          <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${M_ORANGE};">Rede Intermidia</div>
          <h1 style="margin-top:10px;font-size:40px;line-height:1.0;font-weight:800;letter-spacing:-0.03em;color:${M_TEXT};">Manual de<br/>Especificações</h1>
          <p style="margin-top:12px;font-size:15px;line-height:1.55;color:${M_MUTED};">Informações técnicas para produção e envio de materiais para os pontos de mídia.</p>
        </div>
        <div style="padding:20px 22px;background:rgba(232,89,26,0.08);border:1px solid rgba(232,89,26,0.20);border-radius:14px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${M_ORANGE};">Pontos neste manual</div>
          <div style="margin-top:6px;font-size:52px;font-weight:800;color:${M_TEXT};line-height:1;">${count}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:10px;overflow:hidden;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${M_MUTED};margin-bottom:4px;">Especificações gerais</div>
          ${mSpecCard([
            mSpecItem('Formatos aceitos', 'MP4, AVI, MOV, GIF, JPG, PNG'),
            mSpecItem('Prazo de envio', '48h antes da veiculação'),
            mSpecItem('Peso máximo', '50 MB por arquivo'),
            mSpecItem('Áudio', 'Sem áudio (mídia indoor silenciosa)'),
          ])}
        </div>
        <div style="padding-top:16px;border-top:1px solid ${M_BORDER};">
          <div style="font-size:12px;color:${M_MUTED};">Dúvidas: <span style="color:${M_TEXT};">criacao@redeintermidia.com</span></div>
        </div>
      </div>
    </section>
  `;
}

function buildMobilePointPage(point, index, total) {
  const img      = pickPointImage(point);
  const logoUrl  = resolveAssetUrl('/logo.png');
  const focalPt  = String(point?.foto_focal_point || 'center center').trim();
  const nome     = escapeHtml((point.nome || 'SEM NOME').toUpperCase());
  const durSec   = parseDuracaoText(point?.tempo || point?.duracao);
  const loopSec  = (() => {
    if (!point?.loop) return durSec * 5 || 30;
    const v = String(point.loop).replace(/[^0-9.]/g, '');
    return Number(v) || (durSec * 5 || 30);
  })();
  const loopLabel = loopSec >= 60 ? `${Math.round(loopSec / 60)} min` : `${loopSec}s`;
  const durLabel  = durSec >= 60
    ? `${Math.floor(durSec / 60)}min${durSec % 60 > 0 ? ` ${durSec % 60}s` : ''}`
    : (durSec > 0 ? `${durSec}s` : '-');

  const hoursDay       = parseOperatingHours(point?.horario);
  const insPerDay      = durSec > 0 ? Math.round((hoursDay * 3600) / durSec) : null;
  const insercoesLabel = insPerDay ? `≈ ${insPerDay}/dia` : '-';

  const widthPx  = Number(point?.arte_largura || point?.largura_px || 0);
  const heightPx = Number(point?.arte_altura  || point?.altura_px  || 0);
  const resolucao = widthPx && heightPx ? `${widthPx}×${heightPx} px` : '-';

  const photoHtml = img
    ? `<img src="${img}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${escapeHtml(focalPt)};" />`
    : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${M_MUTED};">Sem foto cadastrada</div>`;

  return `
    <section style="display:block;width:${MOBILE_W}px;height:${MOBILE_H}px;min-height:${MOBILE_H}px;max-height:${MOBILE_H}px;position:relative;overflow:hidden;background:${M_BLACK};color:${M_TEXT};font-family:Poppins,system-ui,sans-serif;box-sizing:border-box;page-break-after:always;break-after:page;">
      <div style="position:absolute;top:0;left:0;right:0;height:38%;background:#111;overflow:hidden;">
        ${photoHtml}
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(11,11,11,0.7) 100%);"></div>
        <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${M_ORANGE};"></div>
        <div style="position:absolute;top:16px;right:16px;padding:5px 12px;border-radius:999px;background:rgba(0,0,0,0.65);font-size:12px;font-weight:700;color:#fff;">${index}/${total}</div>
        <div style="position:absolute;bottom:12px;left:18px;">
          <img src="${logoUrl}" alt="" style="height:24px;width:auto;object-fit:contain;opacity:0.85;" />
        </div>
      </div>
      <div style="position:absolute;top:38%;left:0;right:0;bottom:0;padding:18px 22px 18px;display:flex;flex-direction:column;gap:12px;overflow:hidden;box-sizing:border-box;">
        <div>
          <div style="font-size:24px;line-height:1.05;font-weight:700;letter-spacing:-0.01em;color:${M_TEXT};word-break:break-word;">${nome}</div>
          ${point.tipo ? `<span style="margin-top:8px;display:inline-flex;padding:5px 14px;border-radius:999px;background:${M_ORANGE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fff;">${escapeHtml(point.tipo)}</span>` : ''}
          ${point.endereco ? `<div style="margin-top:6px;font-size:13px;color:${M_MUTED};">${escapeHtml(point.endereco)}${point.cidade ? `, ${escapeHtml(point.cidade)}` : ''}</div>` : ''}
        </div>
        <div style="flex:1;overflow:hidden;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${M_MUTED};margin-bottom:8px;">Especificações técnicas</div>
          ${mSpecCard([
            mSpecItem('Resolução', resolucao),
            mSpecItem('Duração do spot', durLabel),
            mSpecItem('Exibição média', insercoesLabel),
            mSpecItem('Loop estimado', loopLabel),
            mSpecItem('Funcionamento', point?.horario || '6h às 23h'),
            mSpecItem('Peso máximo', '50 MB'),
          ])}
        </div>
        <div style="padding:12px 16px;border-radius:10px;background:rgba(232,89,26,0.07);border-left:3px solid ${M_ORANGE};">
          <div style="font-size:12px;font-weight:700;color:${M_TEXT};">Regras criativas</div>
          <p style="margin-top:4px;font-size:12px;line-height:1.5;color:${M_MUTED};">Texto curto, alto contraste e logotipo em destaque. Material sujeito a aprovação técnica.</p>
        </div>
      </div>
    </section>
  `;
}

function buildMobileHtml(points) {
  const pages = [buildMobileCoverPage(points)];
  points.forEach((point, index) => {
    pages.push(buildMobilePointPage(point, index + 1, points.length));
  });

  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<base href="${BASE_URL}">
<title>Informações Técnicas Mobile</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; }
html, body { margin:0; padding:0; background:#000; }
@page { size: ${MOBILE_W}px ${MOBILE_H}px; margin:0; }
section { display:block; width:${MOBILE_W}px !important; height:${MOBILE_H}px !important; overflow:hidden !important; page-break-after:always; break-after:page; }
section:last-child { page-break-after:avoid; break-after:avoid; }
</style>
</head><body>${pages.join('\n')}</body></html>`;
}

async function generateMobilePdfBuffer(points) {
  const html = buildMobileHtml(points);
  return renderHtmlToPdfCompressed(html);
}

// ─────────────────────────────────────────────────────────────────────────────
// GERA OS DOIS PDFs A PARTIR DOS DADOS DE UMA VENDA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca os pontos pelo nome e gera os dois buffers de PDF.
 *
 * @param {object} db         - instância do banco (better-sqlite3)
 * @param {string[]} nomes    - array de nomes dos pontos
 * @returns {{ desktop: Buffer, mobile: Buffer }}
 */
async function generatePdfsFromPointNames(db, nomes) {
  if (!nomes || nomes.length === 0) {
    throw new Error('Nenhum ponto associado à venda.');
  }

  // Busca pontos pelo nome (case-insensitive, trim)
  const placeholders = nomes.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM pontos WHERE TRIM(LOWER(nome)) IN (${placeholders}) AND ativo = 1`
  ).all(...nomes.map(n => String(n).trim().toLowerCase()));

  if (rows.length === 0) {
    throw new Error(`Nenhum ponto ativo encontrado para os nomes: ${nomes.join(', ')}`);
  }

  // Mantém a ordem original da venda
  const ordered = nomes
    .map(name => rows.find(r => r.nome.trim().toLowerCase() === name.trim().toLowerCase()))
    .filter(Boolean);

  const [desktop, mobile] = await Promise.all([
    generateDesktopPdfBuffer(ordered),
    generateMobilePdfBuffer(ordered),
  ]);

  return { desktop, mobile };
}

module.exports = { generatePdfsFromPointNames };
