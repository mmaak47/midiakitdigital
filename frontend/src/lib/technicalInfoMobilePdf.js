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

  return createMobilePage(`
    <div style="position:absolute;inset:0;background:linear-gradient(160deg,${SURFACE} 0%,${BLACK} 100%);"></div>
    <div style="position:absolute;inset:0;padding:44px 28px;display:flex;flex-direction:column;gap:28px;box-sizing:border-box;overflow:hidden;">

      <!-- Logo -->
      <img src="/logo.png" alt="" style="height:38px;width:auto;object-fit:contain;" />

      <!-- Title block -->
      <div style="margin-top:8px;">
        <div style="width:44px;height:4px;background:${ORANGE};border-radius:2px;margin-bottom:16px;"></div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ORANGE};">Rede Intermidia</div>
        <h1 style="margin-top:10px;font-size:40px;line-height:1.0;font-weight:800;letter-spacing:-0.03em;color:${TEXT};">Manual de<br/>Especificações</h1>
        <p style="margin-top:12px;font-size:15px;line-height:1.55;color:${MUTED};">Informações técnicas para produção e envio de materiais para os pontos de mídia.</p>
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
          specItem('Formatos aceitos', 'MP4, AVI, MOV, GIF, JPG, PNG'),
          specItem('Prazo de envio', '48h antes da veiculação'),
          specItem('Peso máximo', '50 MB por arquivo'),
          specItem('Áudio', 'Sem áudio (mídia indoor silenciosa)'),
        ])}
      </div>

      <!-- Footer contact -->
      <div style="padding-top:16px;border-top:1px solid ${BORDER};">
        <div style="font-size:12px;color:${MUTED};">Dúvidas: <span style="color:${TEXT};">criacao@redeintermidia.com</span></div>
      </div>
    </div>
  `);
}

function buildTechMobilePointPage(point, index, total) {
  const img        = pickImg(point);
  const focalPt    = String(point?.foto_focal_point || 'center center').trim();
  const nome       = (point.nome || 'SEM NOME').toUpperCase();
  const durSec     = parseDuracao(point?.duracao);
  const durLabel   = formatDuracaoLabel(durSec);
  const hoursDay   = parseHorario(point?.horario);
  const insPerDay  = durSec > 0 ? Math.round((hoursDay * 3600) / durSec) : null;
  const insercoesLabel = insPerDay ? `≈ ${insPerDay}/dia` : '-';
  const widthPx    = Number(point?.arte_largura || point?.largura_px || 0);
  const heightPx   = Number(point?.arte_altura  || point?.altura_px  || 0);
  const resolucao  = widthPx && heightPx ? `${widthPx}×${heightPx} px` : '-';
  const loopSec    = (() => {
    if (!point?.loop) return durSec * 5 || 30;
    const v = String(point.loop).replace(/[^0-9.]/g, '');
    return Number(v) || (durSec * 5 || 30);
  })();
  const loopLabel  = loopSec >= 60 ? `${Math.round(loopSec / 60)} min` : `${loopSec}s`;

  return createMobilePage(`
    <!-- Photo panel: top 38% -->
    <div style="position:absolute;top:0;left:0;right:0;height:38%;background:#111;overflow:hidden;">
      ${img
        ? `<img src="${img}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${escHtml(focalPt)};" />`
        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${MUTED};">Sem foto cadastrada</div>`}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(11,11,11,0.7) 100%);"></div>
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${ORANGE};"></div>
      <div style="position:absolute;top:16px;right:16px;padding:5px 12px;border-radius:999px;background:rgba(0,0,0,0.65);font-size:12px;font-weight:700;color:#fff;">${index}/${total}</div>
      <div style="position:absolute;bottom:12px;left:18px;">
        <img src="/logo.png" alt="" style="height:24px;width:auto;object-fit:contain;opacity:0.85;" />
      </div>
    </div>

    <!-- Content panel: bottom 62% -->
    <div style="position:absolute;top:38%;left:0;right:0;bottom:0;padding:18px 22px 18px;display:flex;flex-direction:column;gap:12px;overflow:hidden;box-sizing:border-box;">

      <!-- Name + location -->
      <div>
        <div style="font-size:24px;line-height:1.05;font-weight:700;letter-spacing:-0.01em;color:${TEXT};word-break:break-word;">${escHtml(nome)}</div>
        ${point.tipo ? `<span style="margin-top:8px;display:inline-flex;padding:5px 14px;border-radius:999px;background:${ORANGE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fff;">${escHtml(point.tipo)}</span>` : ''}
        ${point.endereco ? `<div style="margin-top:6px;font-size:13px;color:${MUTED};">${escHtml(point.endereco)}${point.cidade ? `, ${escHtml(point.cidade)}` : ''}</div>` : ''}
      </div>

      <!-- Technical specifications -->
      <div style="flex:1;overflow:hidden;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">Especificações técnicas</div>
        ${specCard([
          specItem('Resolução', resolucao),
          specItem('Duração do spot', durLabel),
          specItem('Exibição média', insercoesLabel),
          specItem('Loop estimado', loopLabel),
          specItem('Funcionamento', point?.horario || '6h às 23h'),
          specItem('Peso máximo', '50 MB'),
        ])}
      </div>

      <!-- Creative rules note -->
      <div style="padding:12px 16px;border-radius:10px;background:rgba(232,89,26,0.07);border-left:3px solid ${ORANGE};">
        <div style="font-size:12px;font-weight:700;color:${TEXT};">Regras criativas</div>
        <p style="margin-top:4px;font-size:12px;line-height:1.5;color:${MUTED};">Texto curto, alto contraste e logotipo em destaque. Material sujeito a aprovação técnica.</p>
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
  const prepared = await preparePoints(list, options.onStatusChange);

  if (typeof options.onStatusChange === 'function') options.onStatusChange('Montando páginas mobile...');
  const pages = [buildTechMobileCoverPage(prepared)];
  prepared.forEach((point, i) => pages.push(buildTechMobilePointPage(point, i + 1, prepared.length)));

  await renderMobilePagesToPdf(pages, FILE_NAME_MOBILE);

  if (typeof options.onStatusChange === 'function') options.onStatusChange('PDF mobile gerado com sucesso.');
}
