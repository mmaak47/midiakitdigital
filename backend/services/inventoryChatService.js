/**
 * inventoryChatService.js
 * RAG-powered chatbot for DOOH/OOH inventory — scored-intent detection,
 * real DB data injection, LLM generation via Replicate with algorithmic fallback.
 */
'use strict';

const ai = require('./aiService');
const db = require('../database');

// ── Text normalization (same pattern as comercialChat.js) ─────────────────────
function norm(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtNum(n) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
}

function fmtBRL(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Cached city list (30 min TTL) ─────────────────────────────────────────────
let _knownCities = [];
let _citiesCacheTs = 0;
const CITIES_TTL = 30 * 60 * 1000;

function getKnownCities() {
  const now = Date.now();
  if (_knownCities.length && now - _citiesCacheTs < CITIES_TTL) return _knownCities;
  try {
    const points = ai.getEnrichedPoints();
    const set = new Set();
    for (const p of points) {
      if (p.cidade) set.add(p.cidade);
    }
    _knownCities = [...set].sort();
    _citiesCacheTs = now;
  } catch { /* keep stale */ }
  return _knownCities;
}

// ── Cached bairro/region index (30 min TTL) ──────────────────────────────────
let _knownRegions = [];      // [{ name, nameNorm, city }]
let _regionsCacheTs = 0;

function getKnownRegions() {
  const now = Date.now();
  if (_knownRegions.length && now - _regionsCacheTs < CITIES_TTL) return _knownRegions;
  try {
    const points = ai.getEnrichedPoints();
    const regionSet = new Map(); // nameNorm → { name, city }

    for (const p of points) {
      // Extract from nome — common patterns: "PALHANO PREMIUM", "NYC PALHANO"
      // Extract from endereco — "Av. X, 100 - Gleba Palhano"
      // Extract from neighborhood_label
      const sources = [];

      // 1. Neighborhood label from geo_audience_profiles
      if (p.neighborhood_label) sources.push(p.neighborhood_label);

      // 2. Endereco after " - " often has bairro: "R. X, 100 - Centro"
      if (p.endereco) {
        const dashParts = String(p.endereco).split(/\s*-\s*/);
        for (let i = 1; i < dashParts.length; i++) {
          const part = dashParts[i].trim().replace(/,.*$/, '').trim();
          if (part.length >= 3 && part.length < 40 && !/^\d/.test(part)) {
            sources.push(part);
          }
        }
      }

      for (const raw of sources) {
        const n = norm(raw);
        if (n.length < 3) continue;
        // Skip if it's just a city name
        const isCidade = getKnownCities().some(c => norm(c) === n);
        if (isCidade) continue;
        if (!regionSet.has(n)) {
          regionSet.set(n, { name: raw, nameNorm: n, city: p.cidade || '' });
        }
      }
    }

    // Hand-curated common aliases for well-known neighborhoods
    const REGION_ALIASES = {
      'gleba palhano': 'Palhano',
      'gleba': 'Palhano',
      'palhano': 'Palhano',
      'higienopolis': 'Higienópolis',
      'jardim higienopolis': 'Higienópolis',
      'guanabara': 'Guanabara',
      'centro': 'Centro',
      'zona sul': 'Zona Sul',
      'zona norte': 'Zona Norte',
      'zona leste': 'Zona Leste',
      'zona oeste': 'Zona Oeste',
    };

    for (const [aliasNorm, canonical] of Object.entries(REGION_ALIASES)) {
      if (!regionSet.has(aliasNorm)) {
        regionSet.set(aliasNorm, { name: canonical, nameNorm: aliasNorm, city: '' });
      }
    }

    _knownRegions = [...regionSet.values()];
    _regionsCacheTs = now;
  } catch { /* keep stale */ }
  return _knownRegions;
}

/**
 * Search points matching a bairro/region by name, endereco, or neighborhood_label.
 * Uses direct DB query (LIKE) to catch all matches, not just cached data.
 */
function searchPointsByRegion(regionName, cidade) {
  const term = `%${regionName}%`;
  try {
    // Try pontos_enriquecidos first (PostgreSQL), fall back to pontos table (SQLite)
    let sql = `SELECT * FROM pontos_enriquecidos WHERE ativo = 1 AND (nome LIKE ? OR endereco LIKE ?)`;
    const params = [term, term];
    if (cidade) {
      sql += ' AND cidade = ?';
      params.push(cidade);
    }
    sql += ' ORDER BY fluxo DESC';

    try {
      return db.prepare(sql).all(...params);
    } catch {
      // Fallback: query plain pontos table (SQLite)
      let sqlFallback = `SELECT * FROM pontos WHERE ativo = 1 AND (nome LIKE ? OR endereco LIKE ?)`;
      const paramsFb = [term, term];
      if (cidade) {
        sqlFallback += ' AND cidade = ?';
        paramsFb.push(cidade);
      }
      sqlFallback += ' ORDER BY fluxo DESC';
      return db.prepare(sqlFallback).all(...paramsFb);
    }
  } catch {
    return [];
  }
}

// ── Format aliases ────────────────────────────────────────────────────────────
const FORMAT_ALIASES = {
  led: 'Painel LED',
  'painel led': 'Painel LED',
  elevador: 'Elevador',
  indoor: 'Tela Indoor',
  'tela indoor': 'Tela Indoor',
  tela: 'Tela Indoor',
  backlight: 'Backlight',
  frontlight: 'Frontlight',
  painel: 'Painel LED',
  totem: 'Totem Digital',
  'video wall': 'Video Wall',
  videowall: 'Video Wall',
  muffato: 'Circuito Muffato',
  posto: 'LED Posto',
};

// ── Intent engine (scored, same pattern as comercialChat.js) ──────────────────
const INTENCOES_CONFIG = [
  {
    id: 'saudacao',
    sinais: [
      { peso: 5, regex: /^(oi|ola|bom dia|boa tarde|boa noite|e ai|eai|hey|hi|hello)\b/ },
      { peso: 4, regex: /\b(ajuda|help|o que (voce|vc) (faz|sabe|pode)|como (usar|funciona))\b/ },
      { peso: 3, regex: /\b(menu|opcoes|comandos)\b/ },
    ],
  },
  {
    id: 'pontos_regiao',
    sinais: [
      { peso: 8, regex: /\b(pontos?|inventario|midias?|paineis?|telas?)\b.*\b(n[ao]?|d[ao]?|em|perto|proximo|regiao)\b.*\b(gleba|palhano|higienopolis|guanabara|centro|jardim|vila|zona)\b/ },
      { peso: 8, regex: /\b(gleba|palhano|higienopolis|guanabara)\b.*\b(pontos?|midias?|telas?|paineis?|tem|existe|disponiveis?)\b/ },
      { peso: 7, regex: /\b(pontos?|midias?|telas?)\b.*\b(bairro|regiao|zona|rua|avenida)\b/ },
      { peso: 6, regex: /\b(bairro|regiao|zona)\b.*\b(pontos?|midias?|telas?)\b/ },
    ],
  },
  {
    id: 'pontos_cidade',
    sinais: [
      { peso: 6, regex: /\b(pontos?|inventario|midias?|paineis?|telas?)\b.*\b(em|de|na|no|para)\b/ },
      { peso: 5, regex: /\bo\s*que\s*(tem|existe|ha|possui)\s*(em|na|no)\b/ },
      { peso: 4, regex: /\b(disponiveis?|disponivel)\b.*\b(em|na|no)\b/ },
      { peso: 3, regex: /\b(listar?|mostrar?|ver)\b.*\b(pontos?|midias?)\b/ },
    ],
  },
  {
    id: 'ponto_detalhe',
    sinais: [
      { peso: 7, regex: /\b(fale?|detalhe|info|informac|conte)\b.*\b(ponto|midia|painel|tela)\b/ },
      { peso: 7, regex: /\bponto\s*(?:#|n(?:u|ú)mero|id)?\s*\d+/ },
      { peso: 5, regex: /\b(mais\s*sobre|detalhes?\s*(do|da|sobre))\b/ },
      { peso: 4, regex: /\b(como\s*[eé]\s*(o|a)|o\s*que\s*[eé]\s*(o|a))\b.*\b(ponto|painel|tela)\b/ },
    ],
  },
  {
    id: 'maior_fluxo',
    sinais: [
      { peso: 7, regex: /\b(maior|mais)\s*(fluxo|audiencia|impacto|visibilidade|movimento)\b/ },
      { peso: 6, regex: /\b(fluxo|audiencia|impacto)\b.*\b(maior|melhor|mais\s*alto)\b/ },
      { peso: 5, regex: /\b(mais\s*(visto|visualizado|movimentado)|melhor\s*ponto)\b/ },
      { peso: 4, regex: /\b(ponto\s*(top|principal|destaque))\b/ },
    ],
  },
  {
    id: 'melhor_cpm',
    sinais: [
      { peso: 7, regex: /\b(menor|melhor|mais\s*barato)\s*cpm\b/ },
      { peso: 6, regex: /\bcpm\b.*\b(menor|melhor|baixo|barato)\b/ },
      { peso: 5, regex: /\b(mais\s*eficiente|melhor\s*custo\s*beneficio|custo\s*beneficio)\b/ },
      { peso: 4, regex: /\b(barato|economico|acessivel)\b.*\b(ponto|midia)\b/ },
    ],
  },
  {
    id: 'formatos',
    sinais: [
      { peso: 6, regex: /\b(formatos?|tipos?\s*de\s*midia|tipos?\s*de\s*ponto|categorias?\s*de)\b/ },
      { peso: 5, regex: /\b(quais?\s*(formatos?|tipos?|midias?))\b/ },
      { peso: 5, regex: /\b(tem\s*(led|elevador|backlight|frontlight|indoor|tela))\b/ },
      { peso: 4, regex: /\b(led|elevador|backlight|frontlight)\b.*\b(tem|existe|disponiveis?)\b/ },
    ],
  },
  {
    id: 'cidade_stats',
    sinais: [
      { peso: 6, regex: /\b(resumo|overview|panorama|visao\s*geral)\b.*\b(de|da|do|em)\b/ },
      { peso: 5, regex: /\b(como\s*[eé]|como\s*ta|como\s*esta)\b.*\b(cidade|londrina|maringa|curitiba|cascavel)\b/ },
      { peso: 5, regex: /\b(mercado|cobertura|presenca)\b.*\b(em|de|da)\b/ },
      { peso: 4, regex: /\b(numeros?|estatisticas?|dados?)\b.*\b(cidade|de|da)\b/ },
    ],
  },
  {
    id: 'conhecimento_geral',
    sinais: [
      { peso: 7, regex: /\b(o\s*que\s*[eé]|qual\s*[eé]\s*a?\s*diferenca|diferenca\s*entre|como\s*funciona|pra\s*que\s*serve)\b/ },
      { peso: 6, regex: /\b(o\s*que\s*significa|defin(a|icao|ir)|explique?|explica)\b/ },
      { peso: 5, regex: /\b(cpm|ooh|dooh|grp|alcance|frequencia|impacto)\b.*\b(que|como|significa|funciona)\b/ },
      { peso: 4, regex: /\b(led\s*vs|elevador\s*vs|comparacao\s*entre|diferenca)\b/ },
      { peso: 3, regex: /\b(vantagem|beneficio|quando\s*usar)\b.*\b(led|elevador|indoor|backlight|frontlight)\b/ },
    ],
  },
  {
    id: 'disponibilidade',
    sinais: [
      { peso: 6, regex: /\b(quantos?\s*pontos?|total\s*de\s*pontos?|quantas?\s*midias?)\b/ },
      { peso: 5, regex: /\b(inventario|catalogo|portfolio)\b/ },
      { peso: 4, regex: /\b(disponiveis?|disponibilidade|em\s*estoque)\b/ },
      { peso: 3, regex: /\b(quantos?|total|soma)\b.*\b(tem|temos|existe)\b/ },
    ],
  },
  {
    id: 'comparar',
    sinais: [
      { peso: 7, regex: /\b(compare|comparar|comparacao|comparativo)\b/ },
      { peso: 6, regex: /\b(led|elevador|backlight|frontlight|indoor)\b.*\b(vs|versus|ou|contra|x)\b.*\b(led|elevador|backlight|frontlight|indoor)\b/ },
      { peso: 5, regex: /\b(\w+)\s*(vs|versus|contra|x)\s*(\w+)\b/ },
      { peso: 4, regex: /\b(qual\s*(melhor|pior)|entre\s*\w+\s*e\s*\w+)\b/ },
    ],
  },
];

function classificarIntencao(txt) {
  const n = norm(txt);
  const scores = {};

  for (const { id, sinais } of INTENCOES_CONFIG) {
    scores[id] = 0;
    for (const { peso, regex } of sinais) {
      if (regex.test(n)) scores[id] += peso;
    }
  }

  // Boost pontos_regiao if a known region is detected in the message
  const regions = getKnownRegions();
  const hasRegion = regions.some(r => n.includes(r.nameNorm));
  if (hasRegion && scores.pontos_regiao < 6) {
    // Boost it so region queries win over generic pontos_cidade
    scores.pontos_regiao = Math.max(scores.pontos_regiao, 6);
  }

  const melhor = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!melhor || melhor[1] < 3) return 'desconhecido';
  return melhor[0];
}

// ── Entity extraction ─────────────────────────────────────────────────────────
function extractEntities(message) {
  const n = norm(message);
  const cities = getKnownCities();

  // Detect cities
  const cidades = [];
  for (const c of cities) {
    const cn = norm(c);
    if (cn.length >= 3 && n.includes(cn)) cidades.push(c);
  }

  // Detect regions/bairros
  const regioes = [];
  const regions = getKnownRegions();
  for (const r of regions) {
    if (n.includes(r.nameNorm) && !regioes.includes(r.name)) {
      regioes.push(r.name);
      // If the region has a known city, auto-add it
      if (r.city && !cidades.includes(r.city)) cidades.push(r.city);
    }
  }

  // Also do free-text region detection for common patterns
  // "na Gleba Palhano", "do Centro", "na Higienópolis", "região do Palhano"
  const regionPatterns = [
    /\b(?:n[ao]|d[ao]|em|regiao\s*(?:d[ao])?)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,2})/g,
    /\b(gleba\s*palhano|palhano|higienopolis|guanabara|centro|jardim\s+\w+|vila\s+\w+)\b/gi,
  ];
  for (const pat of regionPatterns) {
    let m;
    while ((m = pat.exec(message)) !== null) {
      const candidate = m[1].trim();
      const cn = norm(candidate);
      // Not a city
      if (cities.some(c => norm(c) === cn)) continue;
      // Not a format
      if (FORMAT_ALIASES[cn]) continue;
      // Not too short
      if (cn.length < 3) continue;
      if (!regioes.some(r => norm(r) === cn)) {
        regioes.push(candidate);
      }
    }
  }

  // Detect point IDs
  const pontoIds = [];
  const idMatches = message.matchAll(/ponto\s*(?:#|n[uú]mero|id)?\s*(\d+)/gi);
  for (const m of idMatches) pontoIds.push(Number(m[1]));
  if (!pontoIds.length) {
    const bareNum = n.match(/\b(\d{1,5})\b/);
    if (bareNum && /\b(fale|detalhe|info|sobre|como\s*[eé])\b/.test(n)) {
      pontoIds.push(Number(bareNum[1]));
    }
  }

  // Detect formats
  const formatos = [];
  for (const [alias, canonical] of Object.entries(FORMAT_ALIASES)) {
    if (n.includes(alias) && !formatos.includes(canonical)) {
      formatos.push(canonical);
    }
  }

  return { cidades, regioes, pontoIds, formatos };
}

// ── Build DB context per intent ───────────────────────────────────────────────
function buildChatContext(intent, entities) {
  const { cidades, regioes, pontoIds, formatos } = entities;
  const cidade = cidades[0] || null;
  const regiao = regioes[0] || null;

  try {
    switch (intent) {
      case 'pontos_regiao': {
        if (!regiao) {
          // Fallback to pontos_cidade behavior
          return buildChatContext('pontos_cidade', entities);
        }
        const pontos = searchPointsByRegion(regiao, cidade);
        if (!pontos.length) {
          // Try a broader search with just the regiao term
          const broader = searchPointsByRegion(regiao, null);
          if (broader.length) {
            const lines = broader.map((p, i) =>
              `${i + 1}. ${p.nome} (${p.tipo}, ${p.cidade}) — Fluxo: ${fmtNum(p.fluxo)} imp/mês, ${fmtBRL(p.preco)}/mês` +
              (p.endereco ? ` | End: ${p.endereco}` : '')
            );
            return `Pontos encontrados na região "${regiao}" (${broader.length} resultados):\n${lines.join('\n')}\n\nTotal fluxo: ${fmtNum(broader.reduce((s, p) => s + (Number(p.fluxo) || 0), 0))} impactos/mês | Investimento total: ${fmtBRL(broader.reduce((s, p) => s + (Number(p.preco) || 0), 0))}/mês`;
          }
          return `Nenhum ponto encontrado na região "${regiao}"${cidade ? ' em ' + cidade : ''}.`;
        }
        const lines = pontos.map((p, i) =>
          `${i + 1}. ${p.nome} (${p.tipo}) — Fluxo: ${fmtNum(p.fluxo)} imp/mês, ${fmtBRL(p.preco)}/mês` +
          (p.endereco ? ` | End: ${p.endereco}` : '') +
          (p.neighborhood_label ? ` | Zona: ${p.neighborhood_label}` : '')
        );
        return `Pontos na região "${regiao}"${cidade ? ' em ' + cidade : ''} (${pontos.length} resultados):\n${lines.join('\n')}\n\nTotal fluxo: ${fmtNum(pontos.reduce((s, p) => s + (Number(p.fluxo) || 0), 0))} impactos/mês | Investimento total: ${fmtBRL(pontos.reduce((s, p) => s + (Number(p.preco) || 0), 0))}/mês`;
      }

      case 'pontos_cidade': {
        if (!cidade && regiao) {
          // User asked about points but we detected a region, not a city
          return buildChatContext('pontos_regiao', entities);
        }
        if (!cidade) {
          const all = getKnownCities();
          return `Cidades disponíveis no inventário: ${all.join(', ')}.`;
        }
        // If we also have a region, filter by it
        if (regiao) {
          return buildChatContext('pontos_regiao', entities);
        }
        const pontos = ai.getEnrichedPoints(cidade);
        if (!pontos.length) return `Nenhum ponto encontrado em ${cidade}.`;
        const total = pontos.length;
        const display = pontos.slice(0, 15);
        const lines = display.map((p, i) =>
          `${i + 1}. ${p.nome} (${p.tipo}) — Fluxo: ${fmtNum(p.fluxo)} imp/mês, ${fmtBRL(p.preco)}/mês` +
          (p.endereco ? ` | End: ${p.endereco}` : '') +
          (p.neighborhood_label ? ` | Zona: ${p.neighborhood_label}` : '')
        );
        const suffix = total > 15 ? `\n\n... e mais ${total - 15} pontos. Total: ${total} pontos em ${cidade}.` : '';
        return `Pontos em ${cidade} (${total} pontos):\n${lines.join('\n')}${suffix}\n\nTotal fluxo: ${fmtNum(pontos.reduce((s, p) => s + (Number(p.fluxo) || 0), 0))} impactos/mês`;
      }

      case 'ponto_detalhe': {
        const pid = pontoIds[0];
        if (!pid) return 'Nenhum ponto identificado na pergunta.';
        const p = ai.getPointById(pid);
        if (!p) return `Ponto #${pid} não encontrado no inventário.`;
        const ctx = ai.enrichPointWithContext(pid);
        const ctxStr = ai.buildPointContextString(p, ctx);
        return `Ponto #${p.id}: ${p.nome}\nTipo: ${p.tipo} | Cidade: ${p.cidade} | Endereço: ${p.endereco || 'N/A'}\nFluxo: ${fmtNum(p.fluxo)} impactos/mês | Preço: ${fmtBRL(p.preco)}/mês\nCPM: ${fmtBRL(p.fluxo > 0 ? p.preco / (p.fluxo / 1000) : 0)}\n${ctxStr}`;
      }

      case 'maior_fluxo': {
        let pontos;
        if (regiao) {
          pontos = searchPointsByRegion(regiao, cidade).sort((a, b) => (Number(b.fluxo) || 0) - (Number(a.fluxo) || 0)).slice(0, 5);
        } else {
          pontos = ai.getEnrichedPoints(cidade).sort((a, b) => (Number(b.fluxo) || 0) - (Number(a.fluxo) || 0)).slice(0, 5);
        }
        if (!pontos.length) return cidade ? `Nenhum ponto encontrado em ${cidade}.` : 'Nenhum ponto encontrado.';
        const label = regiao ? `na região ${regiao}` : cidade ? `em ${cidade}` : '';
        const lines = pontos.map((p, i) =>
          `${i + 1}. ${p.nome} (${p.tipo}${p.cidade ? ', ' + p.cidade : ''}) — ${fmtNum(p.fluxo)} impactos/mês, ${fmtBRL(p.preco)}/mês`
        );
        return `Top 5 pontos por fluxo${label ? ' ' + label : ''}:\n${lines.join('\n')}`;
      }

      case 'melhor_cpm': {
        let pontos;
        if (regiao) {
          pontos = searchPointsByRegion(regiao, cidade).filter(p => Number(p.fluxo) > 0);
        } else {
          pontos = ai.getEnrichedPoints(cidade).filter(p => Number(p.fluxo) > 0);
        }
        pontos = pontos.map(p => ({ ...p, cpm: Number(p.preco) / (Number(p.fluxo) / 1000) }))
          .sort((a, b) => a.cpm - b.cpm)
          .slice(0, 5);
        if (!pontos.length) return cidade ? `Nenhum ponto com fluxo válido em ${cidade}.` : 'Nenhum ponto com fluxo válido.';
        const label = regiao ? `na região ${regiao}` : cidade ? `em ${cidade}` : '';
        const lines = pontos.map((p, i) =>
          `${i + 1}. ${p.nome} (${p.tipo}${p.cidade ? ', ' + p.cidade : ''}) — CPM: ${fmtBRL(p.cpm)}, Fluxo: ${fmtNum(p.fluxo)}/mês`
        );
        return `Top 5 pontos por menor CPM${label ? ' ' + label : ''}:\n${lines.join('\n')}`;
      }

      case 'formatos': {
        let pontos;
        if (regiao) {
          pontos = searchPointsByRegion(regiao, cidade);
        } else {
          pontos = ai.getEnrichedPoints(cidade);
        }
        if (!pontos.length) return cidade ? `Nenhum ponto em ${cidade}.` : 'Nenhum ponto no inventário.';
        const byFormat = {};
        for (const p of pontos) {
          const t = p.tipo || 'Outro';
          if (!byFormat[t]) byFormat[t] = { count: 0, totalFluxo: 0, minPreco: Infinity, maxPreco: 0 };
          byFormat[t].count++;
          byFormat[t].totalFluxo += Number(p.fluxo) || 0;
          const preco = Number(p.preco) || 0;
          if (preco < byFormat[t].minPreco) byFormat[t].minPreco = preco;
          if (preco > byFormat[t].maxPreco) byFormat[t].maxPreco = preco;
        }
        const label = regiao ? `na região ${regiao}` : cidade ? `em ${cidade}` : '';
        const lines = Object.entries(byFormat).map(([tipo, d]) =>
          `- ${tipo}: ${d.count} pontos, Fluxo total: ${fmtNum(d.totalFluxo)}/mês, Preço: ${fmtBRL(d.minPreco)} - ${fmtBRL(d.maxPreco)}`
        );
        return `Formatos disponíveis${label ? ' ' + label : ''}:\n${lines.join('\n')}`;
      }

      case 'cidade_stats': {
        if (!cidade) {
          const all = getKnownCities();
          return `Cidades no inventário: ${all.join(', ')}. Sobre qual cidade deseja saber?`;
        }
        const stats = ai.getCityStats(cidade);
        if (!stats) return `Sem dados para ${cidade}.`;
        const formatList = Object.entries(stats.formatos).map(([t, c]) => `${t}: ${c}`).join(', ');
        return `${cidade}: ${stats.total_pontos} pontos\nFluxo total: ${fmtNum(stats.total_fluxo)} impactos/mês\nInvestimento total: ${fmtBRL(stats.investimento_total)}/mês\nCPM médio: ${fmtBRL(stats.cpm_medio)}\nFormatos: ${formatList}\nScore médio: ${stats.score_medio.toFixed(1)}/10`;
      }

      case 'disponibilidade': {
        if (regiao) {
          const pontos = searchPointsByRegion(regiao, cidade);
          const tipos = {};
          for (const p of pontos) tipos[p.tipo || 'Outro'] = (tipos[p.tipo || 'Outro'] || 0) + 1;
          const resumo = Object.entries(tipos).map(([t, c]) => `${t}: ${c}`).join(', ');
          const label = regiao + (cidade ? ` em ${cidade}` : '');
          return `Região ${label}: ${pontos.length} pontos ativos — ${resumo}`;
        }
        if (cidade) {
          const pontos = ai.getEnrichedPoints(cidade);
          const tipos = {};
          for (const p of pontos) tipos[p.tipo || 'Outro'] = (tipos[p.tipo || 'Outro'] || 0) + 1;
          const resumo = Object.entries(tipos).map(([t, c]) => `${t}: ${c}`).join(', ');
          return `${cidade}: ${pontos.length} pontos ativos — ${resumo}`;
        }
        const all = ai.getEnrichedPoints();
        const byCidade = {};
        for (const p of all) {
          byCidade[p.cidade] = (byCidade[p.cidade] || 0) + 1;
        }
        const lines = Object.entries(byCidade).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}: ${n} pontos`);
        return `Inventário total: ${all.length} pontos ativos\n${lines.join('\n')}`;
      }

      case 'comparar': {
        if (formatos.length >= 2) {
          const pontos = regiao ? searchPointsByRegion(regiao, cidade) : ai.getEnrichedPoints(cidade);
          const compare = formatos.slice(0, 2).map(f => {
            const ps = pontos.filter(p => p.tipo === f);
            const totalFluxo = ps.reduce((s, p) => s + (Number(p.fluxo) || 0), 0);
            const totalPreco = ps.reduce((s, p) => s + (Number(p.preco) || 0), 0);
            const cpm = totalFluxo > 0 ? totalPreco / (totalFluxo / 1000) : 0;
            return `${f}: ${ps.length} pontos, ${fmtNum(totalFluxo)} fluxo total, CPM médio ${fmtBRL(cpm)}`;
          });
          return `Comparação${cidade ? ' em ' + cidade : ''}:\n${compare.join('\n')}`;
        }
        if (cidades.length >= 2) {
          const compare = cidades.slice(0, 2).map(c => {
            const stats = ai.getCityStats(c);
            if (!stats) return `${c}: sem dados`;
            return `${c}: ${stats.total_pontos} pontos, ${fmtNum(stats.total_fluxo)} fluxo, CPM médio ${fmtBRL(stats.cpm_medio)}`;
          });
          return `Comparação:\n${compare.join('\n')}`;
        }
        return '';
      }

      case 'conhecimento_geral':
        return '';

      case 'saudacao':
        return '';

      default:
        return '';
    }
  } catch (err) {
    console.error('[inventoryChat] buildChatContext error:', err.message);
    return '';
  }
}

// ── Build LLM prompt ──────────────────────────────────────────────────────────
function buildChatPrompt(dbContext, history, userMessage) {
  const systemBlock = `Você é o Especialista DOOH da Rede Intermídia, um consultor de mídia Out-of-Home digital.

${ai.DOOH_KNOWLEDGE_COMPACT}

REGRAS:
1. Use APENAS dados fornecidos no CONTEXTO abaixo. NUNCA invente números, nomes de pontos ou cidades.
2. Se não tiver dados suficientes para responder, diga claramente e sugira reformular a pergunta.
3. Formate valores com R$ e pontos de milhar. Fluxo como "X impactos/mês".
4. Máximo 4 parágrafos ou 1 parágrafo + lista de até 10 itens.
5. Tom consultivo e profissional. Português brasileiro.
6. Ao listar pontos: "Nome (Tipo) — Fluxo X impactos/mês, R$ Y/mês"
7. Se a pergunta for uma saudação, apresente-se brevemente e sugira exemplos de perguntas.
8. Quando o CONTEXTO tiver TODOS os pontos de uma região, liste TODOS eles — não omita nenhum.
9. Sempre inclua endereço e tipo quando disponível para ajudar o usuário a localizar o ponto.`;

  const parts = [systemBlock];

  if (dbContext) {
    parts.push(`\nCONTEXTO (dados reais do inventário):\n${dbContext}`);
  }

  if (history.length) {
    const recent = history.slice(-6);
    const histBlock = recent.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.text}`).join('\n');
    parts.push(`\nHISTÓRICO DA CONVERSA:\n${histBlock}`);
  }

  parts.push(`\nUsuário: ${userMessage}\nAssistente:`);

  return parts.join('\n');
}

// ── Algorithmic fallback ──────────────────────────────────────────────────────
function buildAlgorithmicResponse(intent, entities, dbContext) {
  switch (intent) {
    case 'saudacao':
      return 'Olá! Sou o Especialista DOOH da Rede Intermídia. Posso ajudar com informações sobre nosso inventário de mídia digital.\n\nExperimente perguntar:\n- "Quais pontos na Gleba Palhano?"\n- "Pontos disponíveis em Londrina"\n- "Ponto com maior fluxo em Maringá"\n- "O que é CPM?"\n- "Formatos disponíveis"';

    case 'conhecimento_geral':
      return 'Como especialista DOOH, posso explicar conceitos de mídia Out-of-Home. Nossos principais formatos são:\n\n- **Painel LED**: Alto impacto visual, 24h de visibilidade, ideal para branding massivo\n- **Elevador**: Público cativo em prédios residenciais e comerciais, alta frequência\n- **Tela Indoor**: Proximidade ao ponto de venda, momento de decisão de compra\n- **Backlight**: Grande formato iluminado, vias de alto tráfego\n- **Frontlight**: Rodovias e vias arteriais, alto alcance veicular\n\nPara informações específicas do inventário, pergunte sobre uma cidade, bairro ou formato!';

    default:
      if (dbContext) return dbContext;
      return 'Não encontrei dados específicos para sua pergunta. Tente perguntar sobre:\n- Pontos em uma cidade ou bairro (ex: "pontos na Gleba Palhano")\n- Detalhes de um ponto (ex: "ponto #42")\n- Formatos disponíveis\n- Estatísticas de uma cidade';
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function processInventoryChat(message, history = [], userId = null) {
  const intent = classificarIntencao(message);
  const entities = extractEntities(message);
  const dbContext = buildChatContext(intent, entities);

  // Build a semantic cache key from intent + entities + context hash.
  // This means "pontos na gleba palhano" and "quais pontos no palhano?" hit the same cache
  // when they resolve to the same intent/entities/dbContext.
  const cacheKey = ai.hashInput(`chat_v2_${intent}_${JSON.stringify({
    c: entities.cidades,
    r: entities.regioes,
    f: entities.formatos,
    p: entities.pontoIds,
    ctx: dbContext ? dbContext.slice(0, 200) : '',
  })}`);

  // Check cache (skip for saudacao — always fresh)
  if (intent !== 'saudacao') {
    const cached = ai.getCached(cacheKey);
    if (cached && cached.response && cached.response.length > 20) {
      console.log(`[inventory-chat] cache hit (intent=${intent})`);
      return {
        response: cached.response,
        intent,
        entities,
        _model: cached.model || 'cache',
        _source: 'cache',
      };
    }
  }

  const startMs = Date.now();

  // Try LLM generation
  try {
    const prompt = buildChatPrompt(dbContext, history, message);
    const result = await ai.generateReplicateFirst(prompt);

    if (result && typeof result === 'object' && result.text) {
      const text = result.text.trim();
      if (text.length > 20) {
        const latency = Date.now() - startMs;
        // Save to cache
        ai.setCache(cacheKey, message, text, result.model || 'replicate', latency);
        return {
          response: text,
          intent,
          entities,
          _model: result.model || 'replicate',
        };
      }
    }
    if (typeof result === 'string' && result.trim().length > 20) {
      const latency = Date.now() - startMs;
      ai.setCache(cacheKey, message, result.trim(), 'replicate', latency);
      return {
        response: result.trim(),
        intent,
        entities,
        _model: 'replicate',
      };
    }
  } catch (err) {
    console.error('[inventoryChat] LLM failed:', err.message);
  }

  // Algorithmic fallback — also cache it so we don't retry LLM for the same query
  const fallback = buildAlgorithmicResponse(intent, entities, dbContext);
  if (intent !== 'saudacao' && intent !== 'desconhecido') {
    ai.setCache(cacheKey, message, fallback, 'algorithmic', Date.now() - startMs);
  }
  return {
    response: fallback,
    intent,
    entities,
    _model: 'algorithmic',
  };
}

module.exports = { processInventoryChat };
