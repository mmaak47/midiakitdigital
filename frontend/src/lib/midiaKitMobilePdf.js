/**
 * midiaKitMobilePdf.js
 * Templates PDF mobile para: Midia Kit e Proposta Comercial.
 *
 * Formato: 540×960px (proporção 9:16, portrait — otimizado para celular)
 * Layout: coluna única, fonte mínima 16px, cards generosos, identidade visual preservada.
 *
 * ❌ NÃO altera nem importa lógica de geração do PDF desktop.
 * ✅ Usa apenas utilitários compartilhados (exportados sem efeitos colaterais).
 */

import {
  slugify,
  escapeHtml,
  buildResumo,
  imageToDataUrl,
  loadPdfAssets,
  pickImageUrl,
  pickProposalImageUrl,
  normalizeLines,
  isVehicleFlowPoint,
  formatInt,
  formatMoney,
  getPointTypeLabel,
} from './midiaKitPdf';

import { sortFormatos, buildAudienceQualification } from './strategy';

// ── Dimensões da página mobile ──────────────────────────────────────────────
const MOBILE_W = 540;
const MOBILE_H = 960;

// ── Paleta Midia Kit mobile (dark — mantém identidade visual) ──────────────
const ORANGE  = '#E8591A';
const BLACK   = '#0A0A0A';
const SURFACE = '#141414';
const BORDER  = 'rgba(255,255,255,0.10)';
const MUTED   = 'rgba(255,255,255,0.55)';
const TEXT    = '#FFFFFF';

// ── Paleta Proposta mobile (light — alta legibilidade) ─────────────────────
const P_ORANGE  = '#E8591A';
const P_BG      = '#FFFFFF';
const P_SURFACE = '#F5F6F8';
const P_SURFACE2= '#EBEDF0';
const P_BORDER  = 'rgba(0,0,0,0.09)';
const P_MUTED   = 'rgba(0,0,0,0.48)';
const P_TEXT    = '#1A1A2E';

// ── Helpers internos ────────────────────────────────────────────────────────

function createMobilePage(innerHTML, bg = BLACK) {
  const el = document.createElement('section');
  Object.assign(el.style, {
    display:       'block',
    width:         `${MOBILE_W}px`,
    height:        `${MOBILE_H}px`,
    minHeight:     `${MOBILE_H}px`,
    maxHeight:     `${MOBILE_H}px`,
    position:      'relative',
    overflow:      'hidden',
    background:    bg,
    color:         TEXT,
    fontFamily:    'Poppins, system-ui, sans-serif',
    boxSizing:     'border-box',
    pageBreakAfter: 'always',
    breakAfter:    'page',
  });
  el.innerHTML = innerHTML;
  return el;
}

function badge(text, color = ORANGE) {
  return `<span style="display:inline-flex;align-items:center;padding:6px 16px;border-radius:999px;background:${color};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#fff;">${escapeHtml(text)}</span>`;
}

function card(content, opts = {}) {
  const bg     = opts.bg     || SURFACE;
  const border = opts.border || BORDER;
  const pad    = opts.pad    || '20px 22px';
  const radius = opts.radius || '16px';
  return `<div style="background:${bg};border:1px solid ${border};border-radius:${radius};padding:${pad};box-sizing:border-box;">${content}</div>`;
}

function statCard(label, value, accent = false) {
  return card(`
    <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</div>
    <div style="margin-top:8px;font-size:40px;line-height:1;font-weight:700;color:${accent ? ORANGE : TEXT};font-family:Poppins,system-ui,sans-serif;">${escapeHtml(String(value))}</div>
  `);
}

function metricRow(label, value) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid ${BORDER};">
      <span style="font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</span>
      <span style="font-size:16px;font-weight:700;color:${TEXT};">${escapeHtml(String(value))}</span>
    </div>
  `;
}

// Helpers específicos para o tema light da Proposta
function pCard(content, opts = {}) {
  const bg     = opts.bg     || P_SURFACE;
  const border = opts.border || P_BORDER;
  const pad    = opts.pad    || '18px 20px';
  const radius = opts.radius || '14px';
  return `<div style="background:${bg};border:1px solid ${border};border-radius:${radius};padding:${pad};box-sizing:border-box;">${content}</div>`;
}

function pMetricRow(label, value) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid ${P_BORDER};">
      <span style="font-size:12px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${P_MUTED};">${escapeHtml(label)}</span>
      <span style="font-size:15px;font-weight:700;color:${P_TEXT};">${escapeHtml(String(value))}</span>
    </div>
  `;
}

function pPageHeader(logo, badgeText) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <img src="${logo}" alt="" style="height:28px;width:auto;object-fit:contain;" />
      <span style="display:inline-flex;align-items:center;padding:5px 14px;border-radius:999px;background:${P_ORANGE};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#fff;">${escapeHtml(badgeText)}</span>
    </div>
  `;
}

function pageHeader(logo, badgeText) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
      <img src="${logo}" alt="" style="height:32px;width:auto;object-fit:contain;" />
      ${badge(badgeText)}
    </div>
  `;
}

async function renderMobilePagesToPdf(pages, fileName, opts = {}) {
  const pageHtml = pages.map((p) => p.outerHTML).join('\n');
  const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8">
<base href="${window.location.origin}">
<title>${escapeHtml(fileName.replace(/\.pdf$/i, ''))}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; }
html, body { margin:0; padding:0; background:#000; }
@page { size: ${MOBILE_W}px ${MOBILE_H}px; margin:0; }
section { display:block; width:${MOBILE_W}px !important; height:${MOBILE_H}px !important; overflow:hidden !important; page-break-after:always; break-after:page; }
section:last-child { page-break-after:avoid; break-after:avoid; }
</style>
</head><body>${pageHtml}</body></html>`;

  const res = await fetch('/api/pdf/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      html: fullHtml,
      fileName,
      citySlugs: Array.isArray(opts.citySlugs) ? opts.citySlugs : [],
      noCache: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao gerar PDF mobile');
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── MIDIA KIT MOBILE ────────────────────────────────────────────────────────

function buildMKMobileCoverPage({ cidade, pontos, resumo, assets, selectedCities }) {
  const estado = (() => {
    const map = { 'londrina':'Paraná','maringá':'Paraná','maringa':'Paraná','balneário camboriú':'Santa Catarina','balneario camboriu':'Santa Catarina','itajaí':'Santa Catarina','itajai':'Santa Catarina','curitiba':'Paraná','florianópolis':'Santa Catarina','florianopolis':'Santa Catarina' };
    const k = String(cidade||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return map[String(cidade||'').toLowerCase()] || map[k] || '';
  })();

  const cities = Array.from(new Set((selectedCities||[]).map((c)=>String(c).trim()).filter(Boolean)));
  const totalEnderecos = new Set(pontos.map((p)=>`${p.cidade||''}-${p.endereco||''}`)).size;

  return createMobilePage(`
    <!-- Hero image (top 42% of page) -->
    <div style="position:absolute;top:0;left:0;right:0;height:42%;overflow:hidden;">
      <img src="${assets.cityBg||assets.heroBg||''}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;" />
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,10,0.15) 0%,rgba(10,10,10,0.72) 80%,${BLACK} 100%);"></div>
      <!-- Badge over image -->
      <div style="position:absolute;top:22px;left:22px;right:22px;display:flex;align-items:flex-start;justify-content:space-between;">
        <img src="${assets.logo||''}" alt="" style="height:36px;width:auto;object-fit:contain;" />
        ${badge('Midia Kit')}
      </div>
    </div>

    <!-- Content below hero -->
    <div style="position:absolute;top:38%;left:0;right:0;bottom:0;padding:0 24px 24px;display:flex;flex-direction:column;gap:18px;overflow:hidden;">

      <!-- City name block -->
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ORANGE};">Cobertura estratégica</div>
        <div style="margin-top:8px;font-size:52px;line-height:0.92;font-weight:700;letter-spacing:-0.04em;text-transform:uppercase;color:${TEXT};word-break:break-word;">${escapeHtml(cidade)}</div>
        ${estado ? `<div style="margin-top:6px;font-size:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.65);">${escapeHtml(estado)}</div>` : ''}
        ${cities.length>1 ? `<div style="margin-top:6px;font-size:13px;color:${MUTED};">${escapeHtml(cities.join(' · '))}</div>` : ''}
      </div>

      <!-- Stats grid: 2 columns -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="padding:14px 16px;border-top:3px solid ${ORANGE};background:${SURFACE};border-radius:12px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Pontos ativos</div>
          <div style="margin-top:6px;font-size:34px;line-height:1;font-weight:700;color:${TEXT};">${formatInt(pontos.length)}</div>
        </div>
        <div style="padding:14px 16px;border-top:3px solid ${ORANGE};background:${SURFACE};border-radius:12px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Pontos de Impacto</div>
          <div style="margin-top:6px;font-size:34px;line-height:1;font-weight:700;color:${TEXT};">${formatInt(resumo.telas)}</div>
        </div>
        <div style="padding:14px 16px;border-top:3px solid ${ORANGE};background:${SURFACE};border-radius:12px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Fluxo mensal</div>
          <div style="margin-top:6px;font-size:34px;line-height:1;font-weight:700;color:${TEXT};">${formatInt(resumo.fluxo)}</div>
        </div>
        <div style="padding:14px 16px;border-top:3px solid ${ORANGE};background:${SURFACE};border-radius:12px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Endereços</div>
          <div style="margin-top:6px;font-size:34px;line-height:1;font-weight:700;color:${TEXT};">${formatInt(totalEnderecos)}</div>
        </div>
      </div>

      <!-- Bottom tagline -->
      <div style="margin-top:auto;padding-top:16px;border-top:1px solid ${BORDER};">
        <p style="font-size:14px;line-height:1.5;color:${MUTED};">Inventário premium para planejar presença urbana com escala, frequência e impacto visual na praça.</p>
      </div>
    </div>
  `);
}

function buildMKMobileManifestoPage({ assets }) {
  return createMobilePage(`
    <div style="position:absolute;inset:0;background:${SURFACE};"></div>
    <div style="position:absolute;inset:0;padding:40px 28px;display:flex;flex-direction:column;gap:28px;box-sizing:border-box;overflow:hidden;">
      ${pageHeader(assets.logoHorizontal||assets.logo||'', 'Nossa Missão')}

      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:20px;">
        <h2 style="font-size:34px;line-height:1.1;font-weight:700;letter-spacing:-0.02em;color:${TEXT};">Conectamos<br/>marcas a<br/><span style="color:${ORANGE};">pessoas.</span></h2>
        <p style="font-size:16px;line-height:1.65;color:${MUTED};">Somos uma rede de mídia digital indoor e outdoor que leva mensagens para onde as pessoas vivem, trabalham e circulam.</p>
        <p style="font-size:16px;line-height:1.65;color:${MUTED};">Com formatos de alto impacto visual e cobertura estratégica, garantimos presença de marca em ambientes de alto tráfego.</p>
      </div>

      ${card(`
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ORANGE};margin-bottom:8px;">Nossos diferenciais</div>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:8px;">
          ${['Telas em ambientes premium','Alta frequência de exibição','Público qualificado e segmentado','Relatórios e dados de audiência'].map((d)=>`<li style="display:flex;align-items:center;gap:10px;font-size:14px;color:${TEXT};">
            <span style="width:8px;height:8px;border-radius:50%;background:${ORANGE};flex-shrink:0;"></span>${escapeHtml(d)}</li>`).join('')}
        </ul>
      `)}
    </div>
  `);
}

function buildMKMobileSummaryPage({ cidade, pontos, assets }) {
  const tipos = [...new Set(pontos.map((p) => getPointTypeLabel(p)).filter(Boolean))];
  const publicos = [...new Set(pontos.map((p) => p.publico).filter(Boolean))];
  const totalTelas = pontos.reduce((s, p) => s + (Number(p.telas) || 0), 0);
  const totalFluxo = pontos.reduce((s, p) => s + (Number(p.fluxo) || 0), 0);

  return createMobilePage(`
    <div style="position:absolute;inset:0;padding:40px 28px;display:flex;flex-direction:column;gap:20px;box-sizing:border-box;overflow:hidden;">
      ${pageHeader(assets.logoHorizontal||assets.logo||'', 'Resumo')}

      <div style="font-size:28px;font-weight:700;letter-spacing:-0.02em;color:${TEXT};">${escapeHtml(cidade)}</div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${card(`
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Pontos ativos</div>
              <div style="margin-top:6px;font-size:36px;font-weight:700;color:${TEXT};">${formatInt(pontos.length)}</div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Pontos de Impacto</div>
              <div style="margin-top:6px;font-size:36px;font-weight:700;color:${TEXT};">${formatInt(totalTelas)}</div>
            </div>
          </div>
        `)}
        ${card(`
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">Fluxo mensal estimado</div>
          <div style="font-size:36px;font-weight:700;color:${ORANGE};">${formatInt(totalFluxo)}</div>
          <div style="font-size:12px;color:${MUTED};margin-top:4px;">pessoas / veículos por mês</div>
        `)}
        ${tipos.length ? card(`
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};margin-bottom:10px;">Formatos disponíveis</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${tipos.map((t)=>`<span style="padding:6px 14px;border-radius:999px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.25);font-size:13px;font-weight:600;color:${ORANGE};">${escapeHtml(t)}</span>`).join('')}
          </div>
        `) : ''}
        ${publicos.length ? card(`
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};margin-bottom:10px;">Públicos atendidos</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${publicos.map((p)=>`<span style="padding:5px 12px;border-radius:999px;background:${SURFACE};border:1px solid ${BORDER};font-size:13px;color:${TEXT};">${escapeHtml(p)}</span>`).join('')}
          </div>
        `) : ''}
      </div>
    </div>
  `);
}

function buildMKMobileFormatDividerPage({ tipo, formatStats, assets }) {
  return createMobilePage(`
    <div style="position:absolute;inset:0;background:linear-gradient(160deg,${SURFACE} 0%,${BLACK} 100%);"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:48px 28px;gap:32px;box-sizing:border-box;">
      <img src="${assets.logoHorizontal||assets.logo||''}" alt="" style="height:30px;width:auto;object-fit:contain;opacity:0.7;" />

      <div style="width:56px;height:4px;background:${ORANGE};border-radius:2px;"></div>

      <div>
        <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ORANGE};margin-bottom:12px;">Formato</div>
        <div style="font-size:52px;line-height:0.95;font-weight:800;letter-spacing:-0.03em;text-transform:uppercase;color:${TEXT};word-break:break-word;">${escapeHtml(tipo)}</div>
      </div>

      <div style="display:flex;gap:28px;">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Pontos de Impacto</div>
          <div style="margin-top:6px;font-size:40px;font-weight:700;color:${TEXT};">${formatInt(formatStats.telas)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Endereços</div>
          <div style="margin-top:6px;font-size:40px;font-weight:700;color:${TEXT};">${formatInt(formatStats.enderecos)}</div>
        </div>
      </div>

      <p style="font-size:14px;line-height:1.55;color:${MUTED};max-width:380px;">A seguir, cada ponto do formato ${escapeHtml(tipo)} com especificações completas e informações de audiência.</p>
    </div>
  `);
}

function buildMKMobilePointPage({ ponto, index, total, image, assets }) {
  const fluxoLabel = isVehicleFlowPoint(ponto) ? 'Veículos/mês' : 'Pessoas/mês';
  const tipo = getPointTypeLabel(ponto);
  const photo = image || assets.showcase || '';
  const focalPoint = String(ponto?.foto_focal_point || 'center center').trim();
  const nome = (ponto.nome || 'PONTO SEM NOME').toUpperCase();
  const preco = ponto.preco ? formatMoney(ponto.preco) : null;

  return createMobilePage(`
    <!-- Photo panel: top 40% -->
    <div style="position:absolute;top:0;left:0;right:0;height:40%;background:#111;overflow:hidden;display:flex;align-items:center;justify-content:center;">
      ${photo ? `<img src="${photo}" alt="" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;" />` : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${MUTED};font-size:16px;">Sem foto</div>`}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(10,10,10,0.72) 100%);"></div>
      <!-- Orange accent bar -->
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${ORANGE};"></div>
      <!-- Counter badge -->
      <div style="position:absolute;top:18px;right:18px;padding:6px 14px;border-radius:999px;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);font-size:13px;font-weight:700;color:#fff;">${index}/${total}</div>
      <!-- Logo -->
      <div style="position:absolute;bottom:16px;left:18px;">
        <img src="${assets.logoLight||assets.logo||''}" alt="" style="height:26px;width:auto;object-fit:contain;" />
      </div>
    </div>

    <!-- Info panel: bottom 60% -->
    <div style="position:absolute;top:40%;left:0;right:0;bottom:0;padding:20px 22px 20px;display:flex;flex-direction:column;gap:12px;overflow:hidden;box-sizing:border-box;">

      <!-- Type badge + name -->
      <div>
        ${badge(tipo)}
        <div style="margin-top:10px;font-size:28px;line-height:1.05;font-weight:700;letter-spacing:-0.02em;color:${TEXT};word-break:break-word;">${escapeHtml(nome)}</div>
        ${ponto.endereco ? `<div style="margin-top:5px;font-size:13px;color:${MUTED};">${escapeHtml(ponto.endereco)}${ponto.cidade ? `, ${escapeHtml(ponto.cidade)}` : ''}</div>` : ''}
      </div>

      <!-- Metrics grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:1;">
        ${[
          { label: fluxoLabel,           value: formatInt(ponto.fluxo) },
          { label: 'Pontos de Impacto',  value: formatInt(ponto.telas) },
          { label: 'Inserções mín.',     value: formatInt(ponto.insercoes) },
          { label: 'Tempo por spot',     value: ponto.tempo || '-' },
          { label: 'Público',            value: ponto.publico || '-' },
          { label: 'Loop',               value: ponto.loop ? `Mín. ${ponto.loop}` : '-' },
        ].map(({ label, value }) => `
          <div style="background:${SURFACE};border:1px solid ${BORDER};border-radius:12px;padding:12px 14px;box-sizing:border-box;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</div>
            <div style="margin-top:5px;font-size:17px;font-weight:700;color:${TEXT};word-break:break-word;">${escapeHtml(String(value))}</div>
          </div>
        `).join('')}
      </div>

      <!-- Price footer -->
      ${preco ? `
      <div style="padding-top:10px;border-top:1px solid ${BORDER};display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Investimento / mês</span>
        <span style="font-size:22px;font-weight:800;color:${ORANGE};">${escapeHtml(preco)}</span>
      </div>` : ''}
    </div>
  `);
}

function buildMKMobileEndingPage({ assets }) {
  return createMobilePage(`
    <div style="position:absolute;inset:0;background:linear-gradient(160deg,${SURFACE} 0%,${BLACK} 100%);"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 32px;gap:32px;box-sizing:border-box;text-align:center;">
      <img src="${assets.logo||''}" alt="" style="height:56px;width:auto;object-fit:contain;" />

      <div>
        <div style="font-size:36px;font-weight:700;line-height:1.1;color:${TEXT};">Vamos<br/>conversar?</div>
        <p style="margin-top:14px;font-size:16px;line-height:1.65;color:${MUTED};">Entre em contato e descubra como nossos pontos de mídia podem amplificar a presença da sua marca.</p>
      </div>

      ${card(`
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ORANGE};margin-bottom:4px;">E-mail</div>
            <div style="font-size:15px;color:${TEXT};">comercial@redeintermidia.com</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ORANGE};margin-bottom:4px;">Contato</div>
            <div style="font-size:15px;color:${TEXT};">Maite Doin</div>
          </div>
        </div>
      `)}

      <div style="margin-top:auto;">
        ${badge('Rede Intermidia', 'rgba(232,89,26,0.18)')}
      </div>
    </div>
  `);
}

// ── PROPOSTA COMERCIAL MOBILE ───────────────────────────────────────────────

// ── Proposta Mobile — tema light ────────────────────────────────────────────

function buildProposalMobileCoverPage({ proposalClient, proposalCity, proposalTotals, highlights, strategicTopics, assets }) {
  const topicsList = (Array.isArray(strategicTopics) ? strategicTopics : []).slice(0, 5);

  return createMobilePage(`
    <div style="position:absolute;inset:0;background:${P_BG};"></div>
    <!-- Orange accent strip top -->
    <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${P_ORANGE};"></div>
    <div style="position:absolute;inset:0;padding:36px 26px 28px;display:flex;flex-direction:column;gap:20px;box-sizing:border-box;overflow:hidden;">
      ${pPageHeader(assets.logoLight||assets.logoHorizontal||assets.logo||'', 'Proposta Comercial')}

      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${P_ORANGE};">Preparado para</div>
        <div style="margin-top:6px;font-size:38px;line-height:1.0;font-weight:800;letter-spacing:-0.03em;color:${P_TEXT};word-break:break-word;">${escapeHtml(proposalClient)}</div>
        <div style="margin-top:5px;font-size:15px;color:${P_MUTED};">${escapeHtml(Array.isArray(proposalCity) ? proposalCity.join(' · ') : proposalCity)}</div>
      </div>

      ${topicsList.length ? pCard(`
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};margin-bottom:10px;">Estratégia</div>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:9px;">
          ${topicsList.map((t)=>`<li style="display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.45;color:${P_TEXT};">
            <span style="margin-top:5px;width:7px;height:7px;border-radius:50%;background:${P_ORANGE};flex-shrink:0;"></span>${escapeHtml(t)}</li>`).join('')}
        </ul>
      `) : ''}

      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:auto;">
        <div style="padding:14px 16px;border-top:3px solid ${P_ORANGE};background:${P_SURFACE};border-radius:12px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};">Pontos</div>
          <div style="margin-top:5px;font-size:32px;font-weight:700;color:${P_TEXT};">${formatInt(proposalTotals.pontos||0)}</div>
        </div>
        <div style="padding:14px 16px;border-top:3px solid ${P_ORANGE};background:${P_SURFACE};border-radius:12px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};">Investimento</div>
          <div style="margin-top:5px;font-size:20px;font-weight:800;color:${P_ORANGE};">${escapeHtml(formatMoney(proposalTotals.valorTotal||0))}</div>
        </div>
      </div>
    </div>
  `, P_BG);
}

function buildProposalMobilePointPage({ point, index, total, image, assets }) {
  const tipo = getPointTypeLabel(point);
  const photo = image || assets.showcase || '';
  const nome = (point.nome || 'PONTO SEM NOME').toUpperCase();
  const fluxoLabel = isVehicleFlowPoint(point) ? 'Veículos/mês' : 'Pessoas/mês';
  const audience = buildAudienceQualification(point);
  const hasEntorno = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) > 0;
  const entornoCount = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;

  return createMobilePage(`
    <!-- Photo panel: image with contain (no cropping) + blur bg -->
    <div style="position:absolute;top:0;left:0;right:0;height:34%;background:${P_SURFACE2};overflow:hidden;display:flex;align-items:center;justify-content:center;">
      ${photo
        ? `<img src="${photo}" alt="" style="position:absolute;inset:-30px;width:calc(100% + 60px);height:calc(100% + 60px);object-fit:cover;filter:blur(14px) saturate(1.1);opacity:0.12;" />
           <img src="${photo}" alt="" style="position:relative;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;" />`
        : `<div style="color:${P_MUTED};font-size:14px;">Sem imagem</div>`}
      <!-- Orange accent bar -->
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${P_ORANGE};"></div>
      <!-- Counter -->
      <div style="position:absolute;top:14px;right:14px;padding:4px 12px;border-radius:999px;background:rgba(0,0,0,0.55);font-size:11px;font-weight:700;color:#fff;">${index}/${total}</div>
    </div>

    <!-- Info panel -->
    <div style="position:absolute;top:34%;left:0;right:0;bottom:0;padding:14px 22px 16px;display:flex;flex-direction:column;gap:8px;overflow:hidden;box-sizing:border-box;background:${P_BG};">
      ${pPageHeader(assets.logoLight||assets.logoHorizontal||assets.logo||'', tipo)}

      <div>
        <div style="font-size:20px;line-height:1.05;font-weight:800;color:${P_TEXT};word-break:break-word;">${escapeHtml(nome)}</div>
        ${point.endereco ? `<div style="margin-top:3px;font-size:11px;color:${P_MUTED};">${escapeHtml(point.endereco)}${point.cidade ? `, ${escapeHtml(point.cidade)}` : ''}</div>` : ''}
      </div>

      <!-- Audience qualification -->
      <div style="padding:10px 14px;border-radius:10px;background:${P_SURFACE};border:1px solid ${P_BORDER};">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 10px;border-radius:100px;background:rgba(232,89,26,0.12);border:1px solid rgba(232,89,26,0.24);font-size:11px;font-weight:700;color:${P_ORANGE};">${escapeHtml(audience.badge)}</span>
          ${hasEntorno ? `<span style="display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 10px;border-radius:100px;background:rgba(0,0,0,0.05);font-size:11px;font-weight:600;color:${P_MUTED};">${formatInt(entornoCount)} locais no entorno</span>` : ''}
        </div>
        <div style="margin-top:6px;font-size:14px;line-height:1.3;font-weight:700;color:${P_TEXT};">${escapeHtml(audience.headline)}</div>
        <div style="margin-top:3px;font-size:11px;line-height:1.3;color:${P_MUTED};">${escapeHtml(audience.summary)}</div>
      </div>

      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        ${pMetricRow(fluxoLabel, formatInt(point.fluxo))}
        ${pMetricRow('Pontos de Impacto', formatInt(point.telas))}
        ${pMetricRow('Inserções mín.', formatInt(point.insercoes))}
      </div>

      ${point.preco ? `
      <div style="padding:12px 16px;border-radius:12px;background:rgba(232,89,26,0.07);border:1px solid rgba(232,89,26,0.20);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};">Investimento / mês</span>
        <span style="font-size:22px;font-weight:800;color:${P_ORANGE};">${escapeHtml(formatMoney(point.preco))}</span>
      </div>` : ''}
    </div>
  `, P_BG);
}

// Página de tabela de preços (nova)
function buildProposalMobilePricingPages({ proposalPoints, proposalTotals, pricingSummary, assets }) {
  // Divide pontos em grupos de até 7 por página para garantir legibilidade
  const ITEMS_PER_PAGE = 7;
  const pages = [];
  const total = proposalPoints.length;

  for (let start = 0; start < total; start += ITEMS_PER_PAGE) {
    const slice = proposalPoints.slice(start, start + ITEMS_PER_PAGE);
    const isFirst = start === 0;
    const isLast = start + ITEMS_PER_PAGE >= total;

    const rows = slice.map((point, i) => {
      const precoTabela = Number(point?.preco_tabela || point?.preco || 0);
      const precoNegociado = Number(point?.preco || 0);
      const hasDiscount = precoTabela > 0 && precoNegociado > 0 && precoNegociado < precoTabela;
      const nome = (point.nome || 'Ponto sem nome');
      const rowBg = (start + i) % 2 === 0 ? P_BG : P_SURFACE;
      return `
        <div style="display:grid;grid-template-columns:1fr 110px 110px;gap:0;background:${rowBg};padding:11px 14px;border-bottom:1px solid ${P_BORDER};">
          <div>
            <div style="font-size:13px;font-weight:600;color:${P_TEXT};word-break:break-word;line-height:1.3;">${escapeHtml(nome)}</div>
            ${point.cidade ? `<div style="font-size:11px;color:${P_MUTED};margin-top:2px;">${escapeHtml(point.cidade)}</div>` : ''}
          </div>
          <div style="text-align:right;font-size:13px;color:${hasDiscount ? P_MUTED : P_TEXT};${hasDiscount ? 'text-decoration:line-through;' : ''}font-weight:${hasDiscount ? '400' : '600'};">
            ${precoTabela ? escapeHtml(formatMoney(precoTabela)) : '-'}
          </div>
          <div style="text-align:right;font-size:13px;font-weight:700;color:${P_ORANGE};">
            ${precoNegociado ? escapeHtml(formatMoney(precoNegociado)) : '-'}
          </div>
        </div>
      `;
    }).join('');

    // Cabeçalho de coluna (repetido em cada página)
    const header = `
      <div style="display:grid;grid-template-columns:1fr 110px 110px;gap:0;padding:9px 14px;background:${P_SURFACE2};border-bottom:2px solid ${P_ORANGE};">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${P_MUTED};">Ponto</div>
        <div style="text-align:right;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${P_MUTED};">Tabela</div>
        <div style="text-align:right;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${P_ORANGE};">Negociado</div>
      </div>
    `;

    // Rodapé com totais apenas na última página
    const footer = isLast ? `
      <div style="margin-top:auto;padding-top:12px;">
        <div style="height:1px;background:${P_BORDER};margin-bottom:14px;"></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${P_MUTED};">Total negociado / mês</span>
            <span style="font-size:22px;font-weight:800;color:${P_ORANGE};">${escapeHtml(formatMoney(proposalTotals.valorTotal||0))}</span>
          </div>
          ${pricingSummary?.descontoAplicado ? `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:600;color:${P_MUTED};">Desconto aplicado</span>
            <span style="font-size:14px;font-weight:700;color:#16A34A;">${escapeHtml(String(pricingSummary.descontoAplicado))}</span>
          </div>` : ''}
        </div>
      </div>
    ` : '';

    pages.push(createMobilePage(`
      <div style="position:absolute;inset:0;background:${P_BG};"></div>
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${P_ORANGE};"></div>
      <div style="position:absolute;inset:0;padding:24px 0 22px;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;">
        <div style="padding:0 22px 14px;display:flex;align-items:center;justify-content:space-between;">
          <img src="${assets.logoHorizontal||assets.logo||''}" alt="" style="height:26px;width:auto;object-fit:contain;" />
          <span style="display:inline-flex;align-items:center;padding:4px 13px;border-radius:999px;background:${P_ORANGE};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#fff;">Tabela de Valores</span>
        </div>
        <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
          ${header}
          <div style="flex:1;overflow:hidden;">
            ${rows}
          </div>
        </div>
        <div style="padding:0 22px;">
          ${footer}
        </div>
      </div>
    `, P_BG));
  }

  return pages;
}

function buildProposalMobileImpactPage({ proposalTotals, pricingSummary, proposalClient, proposalCity, publico, assets }) {
  const publicoLabel = Array.isArray(publico) ? publico.filter(Boolean).join(', ') : (publico || '—');
  const cityLabel = Array.isArray(proposalCity) ? proposalCity.join(', ') : (proposalCity || '—');
  return createMobilePage(`
    <div style="position:absolute;inset:0;background:${P_BG};"></div>
    <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${P_ORANGE};"></div>
    <div style="position:absolute;inset:0;padding:32px 26px 28px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box;overflow:hidden;">
      ${pPageHeader(assets.logoLight||assets.logoHorizontal||assets.logo||'', 'Investimento')}

      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};">Resumo financeiro</div>
        <div style="margin-top:5px;font-size:26px;font-weight:700;color:${P_TEXT};">${escapeHtml(proposalClient)}</div>
      </div>

      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="padding:10px 12px;border-top:3px solid ${P_ORANGE};background:${P_SURFACE};border-radius:10px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${P_MUTED};">Cidades</div>
          <div style="margin-top:4px;font-size:13px;font-weight:600;color:${P_TEXT};word-break:break-word;">${escapeHtml(cityLabel)}</div>
        </div>
        <div style="padding:10px 12px;border-top:3px solid ${P_ORANGE};background:${P_SURFACE};border-radius:10px;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${P_MUTED};">Públicos</div>
          <div style="margin-top:4px;font-size:13px;font-weight:600;color:${P_TEXT};word-break:break-word;">${escapeHtml(publicoLabel)}</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;flex:1;">
        ${pCard(`
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};margin-bottom:5px;">Total negociado / mês</div>
          <div style="font-size:42px;font-weight:800;color:${P_ORANGE};line-height:1;">${escapeHtml(formatMoney(proposalTotals.valorTotal||0))}</div>
        `)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="padding:13px 15px;border-top:3px solid ${P_ORANGE};background:${P_SURFACE};border-radius:12px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};">Pontos</div>
            <div style="margin-top:5px;font-size:30px;font-weight:700;color:${P_TEXT};">${formatInt(proposalTotals.pontos||0)}</div>
          </div>
          <div style="padding:13px 15px;border-top:3px solid ${P_ORANGE};background:${P_SURFACE};border-radius:12px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};">Inserções/mês</div>
            <div style="margin-top:5px;font-size:30px;font-weight:700;color:${P_TEXT};">${formatInt(proposalTotals.insercoesTotal||0)}</div>
          </div>
        </div>
        ${proposalTotals.fluxoTotal ? pCard(`
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};margin-bottom:5px;">Fluxo total estimado</div>
          <div style="font-size:26px;font-weight:700;color:${P_TEXT};">${formatInt(proposalTotals.fluxoTotal)}</div>
          <div style="font-size:12px;color:${P_MUTED};margin-top:3px;">pessoas/mês</div>
        `) : ''}
        ${proposalTotals.cpmEstimado ? pCard(`
          <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${P_MUTED};margin-bottom:5px;">CPM estimado</div>
          <div style="font-size:24px;font-weight:700;color:${P_TEXT};">${escapeHtml(formatMoney(proposalTotals.cpmEstimado))}</div>
          <div style="font-size:12px;color:${P_MUTED};margin-top:3px;">por 1.000 visualizações</div>
        `) : ''}
      </div>
    </div>
  `, P_BG);
}

function buildProposalMobileClosingPage(assets, overviewMapImage) {
  const mapHtml = overviewMapImage
    ? `<div style="width:100%;border-radius:14px;overflow:hidden;border:1px solid ${P_BORDER};box-shadow:0 6px 24px rgba(0,0,0,0.08);">
        <img src="${overviewMapImage}" alt="Mapa de cobertura" style="display:block;width:100%;height:auto;object-fit:contain;" />
      </div>`
    : '';

  return createMobilePage(`
    <div style="position:absolute;inset:0;background:${P_BG};"></div>
    <div style="position:absolute;top:0;left:0;right:0;height:5px;background:${P_ORANGE};"></div>
    <div style="position:relative;z-index:1;height:${MOBILE_H}px;max-height:${MOBILE_H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:40px 28px;box-sizing:border-box;overflow:hidden;">
      <img src="${assets.logoLight||assets.logo||''}" alt="" style="height:44px;width:auto;object-fit:contain;" />
      ${mapHtml}
      <div style="text-align:center;">
        <div style="font-family:Poppins, system-ui, sans-serif;font-size:28px;font-weight:800;line-height:1.15;letter-spacing:-0.02em;color:${P_TEXT};">
          O mundo acontece lá fora<span style="color:${P_ORANGE};">.</span>
        </div>
        <div style="margin-top:10px;font-size:11px;font-weight:500;color:${P_MUTED};letter-spacing:0.06em;text-transform:uppercase;">Intermidia OOH + DOOH — Desde 2007</div>
      </div>
    </div>
  `, P_BG);
}

// ── EXPORTS PÚBLICOS ────────────────────────────────────────────────────────

export async function generateMidiaKitMobilePdf({ praca, pracas, pontos }) {
  const cidade = praca && praca !== 'Todas as praças' ? praca : 'Consolidado';
  const selectedCities = Array.from(new Set(
    (Array.isArray(pracas) ? pracas : []).map((c) => String(c || '').trim()).filter(Boolean)
  ));
  const kitPontos = Array.isArray(pontos) ? pontos : [];
  const resumo = buildResumo(kitPontos);
  const assets = await loadPdfAssets(cidade);

  const pointImages = await Promise.all(kitPontos.map((p) => imageToDataUrl(pickImageUrl(p))));

  const pages = [
    buildMKMobileCoverPage({ cidade, pontos: kitPontos, resumo, assets, selectedCities }),
    buildMKMobileManifestoPage({ assets }),
    buildMKMobileSummaryPage({ cidade, pontos: kitPontos, assets }),
  ];

  // Agrupar por formato
  const groupedByTipo = kitPontos.reduce((acc, ponto, index) => {
    const tipo = getPointTypeLabel(ponto);
    if (!acc[tipo]) acc[tipo] = [];
    acc[tipo].push({ ponto, index });
    return acc;
  }, {});

  Object.entries(groupedByTipo)
    .sort(([a], [b]) => {
      const bases = sortFormatos([a.split(' - ')[0].trim(), b.split(' - ')[0].trim()]);
      return bases.indexOf(a.split(' - ')[0].trim()) === 0 ? -1 : 1;
    })
    .forEach(([tipo, items]) => {
      const telas = items.reduce((s, { ponto }) => s + (Number(ponto.telas) || 0), 0);
      const enderecos = new Set(items.map(({ ponto }) => `${ponto.cidade||''}-${ponto.endereco||''}`)).size;
      pages.push(buildMKMobileFormatDividerPage({ tipo, formatStats: { telas, enderecos }, assets }));
      items.forEach(({ ponto, index }) => {
        pages.push(buildMKMobilePointPage({ ponto, index: index + 1, total: kitPontos.length, image: pointImages[index], assets }));
      });
    });

  pages.push(buildMKMobileEndingPage({ assets }));

  const fileName = `midia-kit-mobile-${slugify(cidade)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const citySlugs = Array.from(new Set(
    [...(Array.isArray(pracas) ? pracas : []), ...kitPontos.map((p) => p?.cidade).filter(Boolean)]
      .map((c) => slugify(c)).filter(Boolean)
  ));

  await renderMobilePagesToPdf(pages, fileName, { citySlugs });
}

export async function generateProposalMobilePdf({
  clientName,
  city,
  points,
  totals,
  pricingSummary,
  publico,
  strategicText,
  strategicTopics,
  strategicSubtitle,
  simulationSummary,
  segmento,
  pointMapImages = [],
  overviewMapImage = null,
  showImpactSection = true,
}) {
  const proposalPoints  = Array.isArray(points) ? points : [];
  const proposalTotals  = { ...(totals || {}), pontos: proposalPoints.length };
  const proposalClient  = clientName || 'Cliente não informado';
  const proposalCity    = city || 'Múltiplas praças';
  const highlights      = normalizeLines(strategicText, 4);
  const topicsList      = normalizeLines(strategicTopics, 6);
  const assets          = await loadPdfAssets();
  // Auto-detect público from points if not provided by user
  const effectivePublico = (Array.isArray(publico) && publico.filter(Boolean).length > 0)
    ? publico
    : Array.from(new Set(proposalPoints.map((p) => p.publico).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const proposalImages = await Promise.all(
    proposalPoints.map((p) => imageToDataUrl(pickProposalImageUrl(p)))
  );

  const pages = [
    buildProposalMobileCoverPage({
      proposalClient,
      proposalCity,
      proposalTotals,
      highlights,
      strategicTopics: topicsList,
      strategicSubtitle,
      assets,
    }),
  ];

  proposalPoints.forEach((point, index) => {
    pages.push(buildProposalMobilePointPage({
      point,
      index: index + 1,
      total: proposalPoints.length,
      image: proposalImages[index],
      mapImage: pointMapImages[index] || null,
      segmento,
      assets,
    }));
  });

  // Pricing table pages
  if (proposalPoints.length > 0) {
    const pricingPages = buildProposalMobilePricingPages({
      proposalPoints,
      proposalTotals,
      pricingSummary,
      assets,
    });
    pages.push(...pricingPages);
  }

  if (showImpactSection) {
    pages.push(buildProposalMobileImpactPage({
      proposalTotals,
      pricingSummary,
      proposalClient,
      proposalCity,
      publico: effectivePublico,
      assets,
    }));
  }

  pages.push(buildProposalMobileClosingPage(assets, overviewMapImage));

  const fileName = `proposta-mobile-${slugify(proposalClient)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const citySlugs = Array.from(new Set(
    proposalPoints.map((p) => slugify(p?.cidade || proposalCity)).filter(Boolean)
  ));

  await renderMobilePagesToPdf(pages, fileName, { citySlugs });
}
