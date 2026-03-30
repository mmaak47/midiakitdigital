const PAGE_WIDTH = 1366;
const PAGE_HEIGHT = 768;

const BRAND_ORANGE = '#E8591A';
const BRAND_BLACK = '#0B0B0B';
const BRAND_PANEL = '#141414';
const BRAND_BORDER = 'rgba(255,255,255,0.12)';
const BRAND_MUTED = 'rgba(255,255,255,0.72)';

const FILE_NAME = 'Informações Técnicas Intermidia.pdf';

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
  return resolveAssetUrl(point?.imagem2 || point?.imagem || '');
}

function getPointTypeLabel(point) {
  const tipo = String(point?.tipo || '').trim();
  if (tipo === 'Elevador') {
    const categoria = String(point?.elevador_categoria || 'Comercial').trim();
    return `Elevador - ${escapeHtml(categoria)}`;
  }
  return escapeHtml(tipo || 'Formato');
}

function isPhysicalPanel(point) {
  const tipo = String(point?.tipo || '').trim();
  return tipo === 'Frontlight' || tipo === 'Backlight';
}

function buildFooter() {
  return `
    <footer style="position:absolute;left:46px;right:46px;bottom:26px;height:54px;border-top:1px solid rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:10px;color:${BRAND_MUTED};font-size:16px;">
      <div style="font-weight:600;">Ficou em duvida? Entre em contato:</div>
      <div style="display:flex;align-items:center;gap:14px;white-space:nowrap;">
        <span style="font-weight:700;color:#ffffff;">Maite Doin</span>
        <span style="display:inline-flex;align-items:center;gap:8px;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M20.5 3.5A11 11 0 0 0 3.17 16.74L2 22l5.45-1.13A11 11 0 1 0 20.5 3.5Z" fill="#25D366"/>
            <path d="M16.98 13.9c-.25-.13-1.5-.74-1.73-.82-.23-.08-.4-.12-.57.12-.17.25-.65.82-.8.98-.15.17-.3.19-.55.06-.25-.13-1.07-.39-2.03-1.25-.75-.67-1.25-1.49-1.4-1.75-.15-.25-.02-.39.11-.52.11-.11.25-.3.38-.44.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.57-1.38-.78-1.89-.2-.49-.4-.43-.57-.44h-.49c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.12.17 1.77 2.7 4.29 3.79.6.26 1.06.42 1.42.54.6.19 1.15.16 1.58.1.48-.07 1.5-.61 1.71-1.2.21-.58.21-1.08.15-1.2-.06-.12-.23-.19-.48-.32Z" fill="#fff"/>
          </svg>
          Whatsapp: 43 8800-5719
        </span>
        <span>Email: criacao@redeintermidia.com</span>
      </div>
    </footer>
  `;
}

function buildMediaAndDurationBlock() {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px;">
      <div style="border:1px solid ${BRAND_BORDER};border-radius:16px;background:rgba(255,255,255,0.03);padding:16px;">
        <div style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${BRAND_ORANGE};margin-bottom:10px;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" stroke="${BRAND_ORANGE}" stroke-width="1.8"/><path d="M10 9l6 3-6 3V9z" fill="${BRAND_ORANGE}"/></svg>
          Midias aceitas
        </div>
        <p style="font-size:17px;line-height:1.4;color:#fff;">Videos em .mp4 ou .mov<br/>Imagens em .png, .jpg ou PDF</p>
      </div>
      <div style="border:1px solid ${BRAND_BORDER};border-radius:16px;background:rgba(255,255,255,0.03);padding:16px;">
        <div style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${BRAND_ORANGE};margin-bottom:10px;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="12" cy="12" r="9" stroke="${BRAND_ORANGE}" stroke-width="1.8"/><path d="M12 7v5l3.2 2" stroke="${BRAND_ORANGE}" stroke-width="1.8" stroke-linecap="round"/></svg>
          Duracao
        </div>
        <p style="font-size:17px;line-height:1.4;color:#fff;">Cotas de 10 segundos e 15 segundos</p>
      </div>
    </div>
  `;
}

function buildProportionWidget(point) {
  const widthPx = Math.max(1, Math.round(normalizeNumber(point?.arte_largura, 1920) || 1920));
  const heightPx = Math.max(1, Math.round(normalizeNumber(point?.arte_altura, 1080) || 1080));

  const larguraM = normalizeNumber(point?.midia_largura_m, null);
  const alturaM = normalizeNumber(point?.midia_altura_m, null);

  const usePhysical = isPhysicalPanel(point) && larguraM && alturaM;
  const ratioW = usePhysical ? larguraM : widthPx;
  const ratioH = usePhysical ? alturaM : heightPx;

  const baseMaxW = 420;
  const baseMaxH = 230;
  const safeRatioW = Math.max(ratioW, 1);
  const safeRatioH = Math.max(ratioH, 1);
  const scale = Math.min(baseMaxW / safeRatioW, baseMaxH / safeRatioH);
  const boxWidth = Math.max(120, Math.round(safeRatioW * scale));
  const boxHeight = Math.max(70, Math.round(safeRatioH * scale));

  const title = usePhysical ? 'Proporcao fisica da tela' : 'Proporcao da resolucao';
  const middleLabel = usePhysical
    ? `${formatDecimal(larguraM)}m x ${formatDecimal(alturaM)}m`
    : `${widthPx} x ${heightPx}`;

  return `
    <div style="border:1px solid ${BRAND_BORDER};border-radius:20px;background:rgba(255,255,255,0.03);padding:16px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${BRAND_ORANGE};margin-bottom:12px;">${title}</div>
      <div style="height:280px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a1a,#111);border-radius:14px;">
        <div style="position:relative;width:${boxWidth}px;height:${boxHeight}px;background:#ff5e2b;border:6px solid #111;box-shadow:0 0 0 2px rgba(255,255,255,0.12) inset;">
          <svg viewBox="0 0 ${boxWidth} ${boxHeight}" width="${boxWidth}" height="${boxHeight}" style="position:absolute;left:0;top:0;">
            <line x1="0" y1="0" x2="40%" y2="40%" stroke="#111" stroke-width="2"/>
            <line x1="60%" y1="60%" x2="100%" y2="100%" stroke="#111" stroke-width="2"/>
          </svg>
          <div style="position:absolute;left:50%;top:50%;transform:translate(-50%, -50%);font-size:42px;font-weight:900;color:#111;letter-spacing:-.02em;">${escapeHtml(middleLabel)}</div>
        </div>
      </div>
    </div>
  `;
}

function buildResolutionBlock(point) {
  const widthPx = Math.max(1, Math.round(normalizeNumber(point?.arte_largura, 1920) || 1920));
  const heightPx = Math.max(1, Math.round(normalizeNumber(point?.arte_altura, 1080) || 1080));

  const larguraM = normalizeNumber(point?.midia_largura_m, null);
  const alturaM = normalizeNumber(point?.midia_altura_m, null);
  const areaM2 = larguraM && alturaM ? Number((larguraM * alturaM).toFixed(2)) : null;

  const physicalLines = isPhysicalPanel(point)
    ? `
      <p style="margin:0;color:#fff;font-size:18px;"><strong>Largura:</strong> ${larguraM ? `${formatDecimal(larguraM)} m` : '-'}</p>
      <p style="margin:6px 0 0;color:#fff;font-size:18px;"><strong>Altura:</strong> ${alturaM ? `${formatDecimal(alturaM)} m` : '-'}</p>
      <p style="margin:6px 0 0;color:#fff;font-size:18px;"><strong>Area:</strong> ${areaM2 ? `${formatDecimal(areaM2)} m2` : '-'}</p>
    `
    : '';

  return `
    <div style="border:1px solid ${BRAND_BORDER};border-radius:20px;background:rgba(255,255,255,0.03);padding:18px;">
      <div style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${BRAND_ORANGE};margin-bottom:10px;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="${BRAND_ORANGE}" stroke-width="1.7"/><path d="M8 9h8M8 13h5" stroke="${BRAND_ORANGE}" stroke-width="1.7" stroke-linecap="round"/></svg>
        Informacoes tecnicas
      </div>
      <p style="margin:0;color:#fff;font-size:20px;"><strong>Formato:</strong> ${getPointTypeLabel(point)}</p>
      <p style="margin:8px 0 0;color:#fff;font-size:18px;"><strong>Resolucao para arte:</strong> ${widthPx} x ${heightPx} px</p>
      ${physicalLines}
    </div>
  `;
}

function createPage(content) {
  return `
    <section style="width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;position:relative;overflow:hidden;background:${BRAND_BLACK};color:#fff;font-family:Poppins,system-ui,sans-serif;page-break-after:always;break-after:page;">
      ${content}
      ${buildFooter()}
    </section>
  `;
}

function buildCoverPage(points) {
  const total = points.length;
  return createPage(`
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 0% 0%, rgba(232,89,26,0.42), transparent 40%),linear-gradient(140deg,#090909,#111 46%,#1b120d 100%);"></div>
    <div style="position:relative;z-index:2;padding:54px 54px 100px;height:100%;display:flex;flex-direction:column;gap:22px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <img src="${resolveAssetUrl('/logo-light.png')}" alt="Intermidia" style="height:48px;object-fit:contain;" />
        <div style="padding:8px 14px;border:1px solid rgba(255,255,255,0.24);border-radius:999px;background:rgba(255,255,255,0.05);font-size:13px;letter-spacing:.08em;text-transform:uppercase;">Documento tecnico</div>
      </div>

      <div>
        <h1 style="margin:0;font-size:66px;line-height:1.03;font-weight:900;max-width:980px;letter-spacing:-.03em;">Informacoes Tecnicas Intermidia</h1>
        <p style="margin:18px 0 0;font-size:22px;color:rgba(255,255,255,0.88);max-width:860px;line-height:1.35;">PDF tecnico com foto do ponto, nome, resolucao da tela e especificacoes de entrega.</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:780px;">
        <div style="border:1px solid ${BRAND_BORDER};border-radius:18px;background:rgba(255,255,255,0.03);padding:16px;">
          <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND_ORANGE};font-weight:700;">Pontos selecionados</p>
          <p style="margin:8px 0 0;font-size:44px;font-weight:800;line-height:1;">${total}</p>
        </div>
        <div style="border:1px solid ${BRAND_BORDER};border-radius:18px;background:rgba(255,255,255,0.03);padding:16px;">
          <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${BRAND_ORANGE};font-weight:700;">Padrao de entrega</p>
          <p style="margin:8px 0 0;font-size:30px;font-weight:800;line-height:1.1;">10s e 15s</p>
        </div>
      </div>

      ${buildMediaAndDurationBlock()}
    </div>
  `);
}

function buildPointPage(point, index, total) {
  const image = pickPointImage(point);
  const imageBlock = image
    ? `<img src="${image}" alt="${escapeHtml(point?.nome || 'Ponto')}" style="width:100%;height:100%;object-fit:cover;object-position:${escapeHtml(point?.foto_focal_point || 'center center')};"/>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${BRAND_MUTED};font-size:20px;background:linear-gradient(135deg,#1a1a1a,#111);">Sem foto cadastrada</div>`;

  return createPage(`
    <div style="position:relative;z-index:2;padding:42px 46px 100px;height:100%;display:grid;grid-template-columns:58% 42%;gap:20px;">
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <img src="${resolveAssetUrl('/logo-light.png')}" alt="Intermidia" style="height:34px;object-fit:contain;" />
          <div style="padding:6px 10px;border-radius:999px;background:rgba(232,89,26,0.2);border:1px solid rgba(232,89,26,0.45);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ffd3bf;">Ponto ${index} de ${total}</div>
        </div>

        <div style="border:1px solid ${BRAND_BORDER};border-radius:20px;background:${BRAND_PANEL};height:320px;overflow:hidden;">
          ${imageBlock}
        </div>

        <div style="border:1px solid ${BRAND_BORDER};border-radius:20px;background:rgba(255,255,255,0.03);padding:18px;">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${BRAND_ORANGE};margin-bottom:8px;">Ponto</div>
          <h2 style="margin:0;font-size:34px;line-height:1.15;font-weight:900;letter-spacing:-.02em;word-break:break-word;">${escapeHtml(point?.nome || 'Ponto sem nome')}</h2>
          <p style="margin:12px 0 0;color:${BRAND_MUTED};font-size:17px;">${escapeHtml(point?.cidade || '-')} ${point?.endereco ? `• ${escapeHtml(point.endereco)}` : ''}</p>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px;min-width:0;">
        ${buildResolutionBlock(point)}
        ${buildProportionWidget(point)}
        ${buildMediaAndDurationBlock()}
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
html, body { background: #000; }
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
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || 'Falha ao gerar PDF tecnico.');
  }

  if (typeof onStatusChange === 'function') {
    onStatusChange('Baixando arquivo...');
  }

  const disposition = String(response.headers.get('Content-Disposition') || '');
  const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const resolvedFileName = decodeURIComponent((fileNameMatch?.[1] || fileName).replace(/\"/g, '').trim());

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = resolvedFileName;
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
    throw new Error('Selecione pelo menos um ponto para exportar o PDF tecnico.');
  }

  const pages = [buildCoverPage(list)];
  list.forEach((point, index) => {
    pages.push(buildPointPage(point, index + 1, list.length));
  });

  if (typeof options.onStatusChange === 'function') {
    options.onStatusChange('Montando paginas tecnicas...');
  }

  await renderPagesToPdf(pages, FILE_NAME, options.onStatusChange);

  if (typeof options.onStatusChange === 'function') {
    options.onStatusChange('PDF tecnico gerado com sucesso.');
  }
}
