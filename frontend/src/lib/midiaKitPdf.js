import { jsPDF } from 'jspdf';
import { PDF_LAYOUT } from './pdfLayoutConfig';

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
            <span style="display:inline-flex;align-items:center;justify-content:center;width:${options.iconSize || 36}px;height:${options.iconSize || 36}px;border-radius:999px;background:rgba(254,92,43,0.18);color:${BRAND_ORANGE};font-weight:700;line-height:1;flex:0 0 auto;">${card.iconHtml || escapeHtml(card.icon || '•')}</span>
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

function metricIconSvg(kind, color = '#111111') {
  const common = `fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    publico: `<svg viewBox="0 0 24 24" width="20" height="20" ${common}><circle cx="9" cy="8" r="3.2"></circle><circle cx="16.5" cy="9.5" r="2.5"></circle><path d="M3.5 18.5c0-3.1 2.5-5.5 5.5-5.5s5.5 2.4 5.5 5.5"></path><path d="M14.6 18.5c0-2.3 1.8-4.1 4.1-4.1"></path></svg>`,
    fluxo: `<svg viewBox="0 0 24 24" width="20" height="20" ${common}><path d="M3.5 12h13"></path><path d="M12 6.5L16.5 12 12 17.5"></path><path d="M20.5 8.5v7"></path></svg>`,
    telas: `<svg viewBox="0 0 24 24" width="20" height="20" ${common}><rect x="3" y="5" width="18" height="12" rx="2"></rect><path d="M9 20h6"></path><path d="M12 17v3"></path></svg>`,
    insercoes: `<svg viewBox="0 0 24 24" width="20" height="20" ${common}><path d="M12 4v16"></path><path d="M5 12h14"></path><circle cx="12" cy="12" r="8"></circle></svg>`,
    tempo: `<svg viewBox="0 0 24 24" width="20" height="20" ${common}><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l2.8 2.8"></path></svg>`,
    loop: `<svg viewBox="0 0 24 24" width="20" height="20" ${common}><path d="M17 7h3V4"></path><path d="M7 17H4v3"></path><path d="M20 7a8 8 0 0 0-13.7-2.5"></path><path d="M4 17a8 8 0 0 0 13.7 2.5"></path></svg>`,
    veiculacao: `<svg viewBox="0 0 24 24" width="20" height="20" ${common}><rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M10 9.2l5 2.8-5 2.8z"></path></svg>`,
    horario: `<svg viewBox="0 0 24 24" width="20" height="20" ${common}><circle cx="12" cy="12" r="8"></circle><path d="M12 7v5h4"></path></svg>`
  };

  return icons[kind] || icons.fluxo;
}

function buildMidiaKitCoverPage({ cidade, pontos, resumo, assets }) {
  const layout = PDF_LAYOUT.midiaKit.cover;
  const cityLine = cidade === 'Consolidado' && layout.showAllCitiesOnConsolidated
    ? 'Londrina, Maringá e Balneário Camboriú'
    : cidade;

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
      <div style="margin-top:26px;display:inline-flex;align-items:center;justify-content:center;min-height:${layout.outOfHomeMinHeight}px;padding:0 ${layout.outOfHomePaddingX}px;background:#fff;color:#000;font-size:18px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;line-height:1;">Out of Home</div>
    </div>

    <div style="position:absolute;right:70px;bottom:90px;text-align:left;">
      <div style="font-family:Poppins, system-ui, sans-serif;color:#fff;font-size:64px;line-height:0.95;font-weight:700;text-transform:uppercase;">${escapeHtml(cidade)}</div>
      <div style="margin-top:10px;color:#fff;font-size:16px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.82;">${escapeHtml(cityLine)}</div>
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
    <div style="position:absolute;left:44%;top:0;bottom:0;width:76px;background:linear-gradient(90deg,rgba(0,0,0,0.9),rgba(0,0,0,0));"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:56%;background:url('${assets.pattern || ''}') center/cover no-repeat;opacity:0.08;"></div>

    <div style="position:absolute;left:740px;right:82px;top:82px;">
      <img src="${assets.logo || ''}" alt="" style="height:70px;width:auto;object-fit:contain;" />
      <div style="margin-top:24px;font-size:23px;line-height:1.42;color:#fff;max-width:760px;">
        Na Intermidia, não apenas defendemos a mídia OOH e DOOH. Nós vivemos a transformação que ela representa.
      </div>
      <div style="margin-top:22px;width:180px;height:4px;background:${BRAND_ORANGE};"></div>
    </div>

    <div style="position:absolute;left:740px;right:82px;top:270px;display:grid;grid-template-columns:1fr 1fr;gap:34px;">
      <div style="font-size:21px;line-height:1.45;color:#fff;">
        <strong style="display:block;font-family:Poppins, system-ui, sans-serif;font-size:58px;line-height:1.08;font-weight:700;letter-spacing:-0.02em;margin-bottom:22px;">A Intermidia é especialista em comunicação Out of Home e Digital Out of Home desde 2007.</strong>
        Somos apaixonados pelo impacto que a mídia OOH e DOOH pode gerar.
      </div>
      <div style="font-size:21px;line-height:1.45;color:#fff;">
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
  const layout = PDF_LAYOUT.midiaKit.formatDivider;
  const lines = splitFormatTitle(tipo);
  return createPage(`
    <div style="position:absolute;inset:0;background:#000;"></div>
    <img src="${assets.wallpaper || assets.heroBg || ''}" alt="" style="position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(16px) saturate(1.12);opacity:0.18;" />
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 46%, rgba(254,92,43,0.16) 0%, rgba(254,92,43,0.03) 38%, rgba(0,0,0,0.92) 78%);"></div>

    <div style="position:absolute;left:0;top:0;bottom:0;width:${layout.leftRailWidth}px;background:linear-gradient(180deg,#0a0a0a,#050505);border-right:1px solid rgba(255,255,255,0.12);"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:${layout.leftRailWidth}px;background:url('${assets.pattern || ''}') center/cover no-repeat;opacity:0.12;"></div>
    <div style="position:absolute;left:22px;top:30px;">
      <img src="${assets.logo07 || assets.logoHorizontal || assets.logo || ''}" alt="" style="height:150px;width:auto;object-fit:contain;" />
    </div>
    <div style="position:absolute;left:84px;top:${layout.cityVerticalTop}px;bottom:${layout.cityVerticalBottom}px;writing-mode:vertical-rl;text-orientation:mixed;font-family:Poppins, system-ui, sans-serif;font-size:${layout.cityVerticalFontSize}px;line-height:1.2;font-weight:700;color:rgba(255,255,255,0.92);letter-spacing:${layout.cityVerticalLetterSpacing}em;text-transform:uppercase;white-space:nowrap;display:flex;align-items:center;justify-content:center;">
      ${escapeHtml((cityStats.cidade || '').toUpperCase())}
    </div>

    <div style="position:absolute;left:560px;bottom:138px;width:560px;border-left:2px solid rgba(255,255,255,0.58);border-bottom:2px solid rgba(255,255,255,0.58);height:344px;"></div>
    <div style="position:absolute;right:98px;top:198px;text-align:left;max-width:630px;">
      ${lines.map((line) => `<div style="font-family:Poppins, system-ui, sans-serif;font-size:${layout.titleFontSize}px;line-height:0.9;font-weight:700;color:#fff;letter-spacing:-0.04em;">${escapeHtml(line)}</div>`).join('')}
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
  const layout = PDF_LAYOUT.midiaKit.pointPage;
  const details = [
    { key: 'publico', label: 'Público', value: ponto.publico || '-' },
    { key: 'fluxo', label: 'Fluxo / mês', value: formatInt(ponto.fluxo) },
    { key: 'telas', label: 'Telas', value: formatInt(ponto.telas) },
    { key: 'insercoes', label: 'Inserções', value: formatInt(ponto.insercoes) },
    { key: 'tempo', label: 'Tempo', value: ponto.tempo || '-' },
    { key: 'loop', label: 'Loop', value: ponto.loop || '-' },
    { label: 'Veiculação', value: ponto.veiculacao || '-' },
    { label: 'Horário', value: ponto.horario || '-' }
  ];

  return createPage(`
    <div style="position:absolute;inset:0;background:#d9d9d9;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:${layout.leftRailWidth}px;background:#0c0c0c;"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:${layout.leftRailWidth}px;background:url('${assets.pattern || ''}') center/cover no-repeat;opacity:0.12;"></div>
    <div style="position:absolute;left:0;top:14px;bottom:14px;width:${layout.leftRailWidth}px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;">
      <img src="${assets.logoHorizontal || assets.logo07 || assets.logo || ''}" alt="" style="width:38px;height:auto;transform:rotate(-90deg);transform-origin:center;object-fit:contain;" />
      <div style="writing-mode:vertical-rl;text-orientation:mixed;font-size:11px;font-weight:700;letter-spacing:0.08em;color:rgba(255,255,255,0.82);text-transform:uppercase;line-height:1.15;">${escapeHtml(ponto.cidade || '')}</div>
    </div>

    <div style="position:absolute;left:${layout.leftRailWidth}px;top:0;bottom:0;right:${layout.imagePanelWidth}px;background:#e7e7e7;"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:${layout.imagePanelWidth}px;background:#1a1a1a;"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:${layout.imagePanelWidth}px;background:url('${image || assets.showcase || ''}') center/cover no-repeat;"></div>

    <div style="position:absolute;left:${layout.contentLeft}px;top:52px;right:${layout.contentRight}px;display:flex;align-items:flex-end;justify-content:flex-start;gap:14px;border-bottom:2px solid #161616;padding-bottom:12px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:46px;height:46px;border:2px solid #222;display:flex;align-items:center;justify-content:center;font-size:21px;">▥</div>
        <div style="font-family:Poppins, system-ui, sans-serif;font-size:${layout.typeFontSize}px;line-height:0.9;font-weight:700;letter-spacing:-0.03em;color:#000;">${escapeHtml((ponto.tipo || 'FORMATO').toUpperCase())}</div>
      </div>
    </div>

    <div style="position:absolute;left:${layout.contentLeft}px;top:${layout.nameTop}px;right:${layout.contentRight}px;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;">
      <div style="font-family:Poppins, system-ui, sans-serif;font-size:${layout.nameFontSize}px;line-height:1.02;font-weight:700;color:#000;max-width:calc(100% - ${layout.nameMaxWidthOffset}px);word-break:break-word;">${formatPointNameHtml(ponto.nome || 'PONTO SEM NOME')}</div>
      <div style="font-size:44px;line-height:0.95;font-weight:700;color:#000;white-space:nowrap;padding-top:8px;">${index}/${total}</div>
    </div>

    <div style="position:absolute;left:${layout.contentLeft}px;top:${layout.addressTop}px;right:${layout.contentRight}px;font-size:28px;line-height:1.4;color:#111;">${escapeHtml(ponto.endereco || 'Endereço não informado')} ${escapeHtml(ponto.cidade ? `· ${ponto.cidade}` : '')}</div>

    <div style="position:absolute;left:${layout.contentLeft}px;top:${layout.metricsBoxTop}px;right:${layout.contentRight}px;border:2px solid rgba(17,17,17,0.32);background:rgba(255,255,255,0.5);padding:22px 24px;border-radius:16px;"></div>
    <div style="position:absolute;left:${layout.contentLeft + 26}px;top:${layout.metricsGridTop}px;right:${layout.contentRight + 24}px;display:grid;grid-template-columns:1fr 1fr;gap:18px 26px;">
      ${details.slice(0, 6).map((item) => `
        <div style="display:grid;grid-template-columns:22px 1fr;grid-template-areas:'icon label' '. value';column-gap:10px;row-gap:7px;min-height:96px;">
          <div style="grid-area:icon;display:flex;align-items:center;justify-content:center;width:22px;height:22px;">${metricIconSvg(item.key)}</div>
          <div style="grid-area:label;font-size:${layout.metricLabelFontSize}px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#222;line-height:1.05;">${escapeHtml(item.label)}</div>
          <div style="grid-area:value;font-family:Poppins, system-ui, sans-serif;font-size:${layout.metricValueFontSize}px;line-height:1.18;font-weight:700;color:#000;word-break:break-word;">${escapeHtml(item.value)}</div>
        </div>
      `).join('')}
    </div>

    <div style="position:absolute;left:${layout.contentLeft}px;bottom:${layout.footerLineBottom}px;right:${layout.contentRight}px;border-top:2px solid #1a1a1a;"></div>
    <div style="position:absolute;left:${layout.contentLeft}px;bottom:${layout.footerBottom}px;right:${layout.contentRight}px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;">
      <div>
        <div style="font-size:20px;line-height:1.35;color:#111;">mínimo de ${escapeHtml(formatInt(ponto.insercoes || 0))} inserções/mês</div>
        <div style="font-size:20px;line-height:1.35;color:#111;">veiculação: ${escapeHtml((ponto.veiculacao || 'vídeo sem áudio').toLowerCase())}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;min-width:320px;">
        <div style="font-size:26px;line-height:1;color:#111;margin-bottom:${layout.priceLabelMarginBottom}px;">Valor mensal:</div>
        <div style="font-family:Poppins, system-ui, sans-serif;font-size:${layout.priceValueFontSize}px;line-height:0.96;font-weight:700;color:#000;white-space:nowrap;">${escapeHtml(formatMoney(ponto.preco))}</div>
      </div>
    </div>

    <div style="position:absolute;right:20px;bottom:22px;padding:8px 12px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.22);">
      <img src="${assets.logoHorizontal || assets.logo07 || assets.logo || ''}" alt="" style="height:20px;width:auto;object-fit:contain;" />
    </div>
  `, '#ECE7E0');
}

function buildProposalCoverPage({ proposalClient, proposalCity, proposalPoints, proposalTotals, highlights, simulationSummary, assets }) {
  const layout = PDF_LAYOUT.proposal.cover;
  const cards = [
    { iconHtml: proposalIcon('target'), label: 'Pontos', value: formatInt(proposalPoints.length) },
    { iconHtml: proposalIcon('flow'), label: 'Fluxo total', value: formatInt(proposalTotals.fluxoTotal) },
    { iconHtml: proposalIcon('money'), label: 'Valor total', value: formatMoney(proposalTotals.valorTotal) },
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
          <div style="display:inline-flex;align-items:center;justify-content:center;min-height:${layout.badgeMinHeight}px;padding:0 ${layout.badgePaddingX}px;border-radius:999px;background:rgba(254,92,43,0.14);border:1px solid rgba(254,92,43,0.24);font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};line-height:1;text-align:center;">
            <span style="display:block;transform:translateY(1px);">Proposta comercial</span>
          </div>
        </div>

        <div style="margin-top:40px;font-family:Poppins, system-ui, sans-serif;font-size:84px;line-height:0.92;font-weight:700;letter-spacing:-0.05em;max-width:760px;">${escapeHtml(proposalClient)}</div>
        <div style="margin-top:20px;font-size:28px;line-height:1.45;color:rgba(255,255,255,0.74);max-width:720px;">Praça ${escapeHtml(proposalCity)} com material de venda redesenhado para leitura mais forte, imagens melhor enquadradas e informações sem estouro de margem.</div>

        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:24px;">
          ${[
            proposalCity,
            formatPointCountLabel(proposalPoints.length || 0),
            `Gerado em ${new Date().toLocaleDateString('pt-BR')}`
          ].map((chip) => `
            <div style="display:inline-flex;align-items:center;justify-content:center;min-height:${layout.chipMinHeight}px;padding:0 ${layout.chipPaddingX}px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:18px;font-weight:600;color:rgba(255,255,255,0.78);line-height:1;text-align:center;">
              <span style="display:block;transform:translateY(1px);">${escapeHtml(chip)}</span>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:auto;">
          ${buildMetricCards(cards, {
            valueSize: layout.metricValueSize,
            labelSize: layout.metricLabelSize,
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
          <div style="display:flex;align-items:center;gap:12px;font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_ORANGE};"><span style="display:inline-flex;align-items:center;justify-content:center;width:${layout.strategicHeaderIconSize}px;height:${layout.strategicHeaderIconSize}px;border-radius:999px;background:rgba(254,92,43,0.16);">${proposalIcon('target')}</span>Direcionamento estratégico</div>
          <div style="margin-top:22px;display:grid;gap:14px;">
            ${strategicItems.map((item) => `
              <div style="display:grid;grid-template-columns:36px 1fr;gap:14px;align-items:flex-start;padding:16px 18px;border-radius:22px;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);">
                <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;background:rgba(254,92,43,0.16);">
                  <span style="display:block;width:${layout.strategicDotSize}px;height:${layout.strategicDotSize}px;border-radius:999px;background:${BRAND_ORANGE};"></span>
                </div>
                <div style="font-size:22px;line-height:1.5;color:#fff;word-break:break-word;">${escapeHtml(item)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

function buildProposalPointPage({ point, index, total, image, assets }) {
  const layout = PDF_LAYOUT.proposal.point;
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
            <div style="font-family:Poppins, system-ui, sans-serif;font-size:34px;line-height:1.03;font-weight:700;letter-spacing:-0.03em;color:#fff;white-space:normal;word-break:break-word;">${formatPointNameHtml(point.nome || 'PONTO SEM NOME', { innerStyle: 'font-size:0.66em;font-weight:600;letter-spacing:-0.01em;' })}</div>
            <div style="margin-top:6px;font-size:18px;line-height:1.4;color:rgba(255,255,255,0.68);">${escapeHtml(point.cidade || '-')} · ${escapeHtml(point.tipo || '-')}</div>
          </div>
        </div>
        <div style="display:inline-grid;grid-template-columns:auto auto auto;align-items:center;justify-content:center;column-gap:${layout.counterGap}px;min-width:${layout.counterMinWidth}px;min-height:${layout.counterMinHeight}px;padding:0 ${layout.counterPaddingX}px;border-radius:20px;background:#111;border:1px solid rgba(255,255,255,0.08);font-size:18px;font-weight:700;color:#fff;line-height:1;font-family:Poppins, system-ui, sans-serif;">
          <span style="display:block;color:${BRAND_ORANGE};transform:translateY(1px);">${index}</span>
          <span style="display:block;color:rgba(255,255,255,0.56);transform:translateY(1px);">/</span>
          <span style="display:block;color:rgba(255,255,255,0.86);transform:translateY(1px);">${total}</span>
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

        </div>
      </div>
    </div>
  `, BRAND_DARK);
}

async function loadPdfAssets() {
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
}

export async function generateMidiaKitPdf({ praca, pontos }) {
  const cidade = praca && praca !== 'Todas as praças' ? praca : 'Consolidado';
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
