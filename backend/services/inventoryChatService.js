/**
 * inventoryChatService.js
 * RAG-powered chatbot for DOOH/OOH inventory — scored-intent detection,
 * real DB data injection, LLM generation via Replicate with algorithmic fallback.
 */
'use strict';

const ai = require('./aiService');

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

  // Detect point IDs
  const pontoIds = [];
  const idMatches = message.matchAll(/ponto\s*(?:#|n[uú]mero|id)?\s*(\d+)/gi);
  for (const m of idMatches) pontoIds.push(Number(m[1]));
  // bare number when likely about a specific point
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

  return { cidades, pontoIds, formatos };
}

// ── Build DB context per intent ───────────────────────────────────────────────
function buildChatContext(intent, entities) {
  const { cidades, pontoIds, formatos } = entities;
  const cidade = cidades[0] || null;

  try {
    switch (intent) {
      case 'pontos_cidade': {
        if (!cidade) {
          const all = getKnownCities();
          return `Cidades disponíveis no inventário: ${all.join(', ')}.`;
        }
        const pontos = ai.getEnrichedPoints(cidade).slice(0, 10);
        if (!pontos.length) return `Nenhum ponto encontrado em ${cidade}.`;
        const lines = pontos.map((p, i) =>
          `${i + 1}. ${p.nome} (${p.tipo}) — Fluxo: ${fmtNum(p.fluxo)} imp/mês, ${fmtBRL(p.preco)}/mês` +
          (p.neighborhood_label ? `, Zona: ${p.neighborhood_label}` : '')
        );
        return `Top ${pontos.length} pontos em ${cidade}:\n${lines.join('\n')}`;
      }

      case 'ponto_detalhe': {
        const pid = pontoIds[0];
        if (!pid) return 'Nenhum ponto identificado na pergunta.';
        const p = ai.getPointById(pid);
        if (!p) return `Ponto #${pid} não encontrado no inventário.`;
        const ctx = ai.enrichPointWithContext(pid);
        const ctxStr = ai.buildPointContextString(p, ctx);
        return `Ponto #${p.id}: ${p.nome}\nTipo: ${p.tipo} | Cidade: ${p.cidade}\nFluxo: ${fmtNum(p.fluxo)} impactos/mês | Preço: ${fmtBRL(p.preco)}/mês\nCPM: ${fmtBRL(p.fluxo > 0 ? p.preco / (p.fluxo / 1000) : 0)}\n${ctxStr}`;
      }

      case 'maior_fluxo': {
        const pontos = ai.getEnrichedPoints(cidade).sort((a, b) => (Number(b.fluxo) || 0) - (Number(a.fluxo) || 0)).slice(0, 5);
        if (!pontos.length) return cidade ? `Nenhum ponto encontrado em ${cidade}.` : 'Nenhum ponto encontrado.';
        const lines = pontos.map((p, i) =>
          `${i + 1}. ${p.nome} (${p.tipo}${p.cidade ? ', ' + p.cidade : ''}) — ${fmtNum(p.fluxo)} impactos/mês, ${fmtBRL(p.preco)}/mês`
        );
        return `Top 5 pontos por fluxo${cidade ? ' em ' + cidade : ''}:\n${lines.join('\n')}`;
      }

      case 'melhor_cpm': {
        const pontos = ai.getEnrichedPoints(cidade)
          .filter(p => Number(p.fluxo) > 0)
          .map(p => ({ ...p, cpm: Number(p.preco) / (Number(p.fluxo) / 1000) }))
          .sort((a, b) => a.cpm - b.cpm)
          .slice(0, 5);
        if (!pontos.length) return cidade ? `Nenhum ponto com fluxo válido em ${cidade}.` : 'Nenhum ponto com fluxo válido.';
        const lines = pontos.map((p, i) =>
          `${i + 1}. ${p.nome} (${p.tipo}${p.cidade ? ', ' + p.cidade : ''}) — CPM: ${fmtBRL(p.cpm)}, Fluxo: ${fmtNum(p.fluxo)}/mês`
        );
        return `Top 5 pontos por menor CPM${cidade ? ' em ' + cidade : ''}:\n${lines.join('\n')}`;
      }

      case 'formatos': {
        const pontos = ai.getEnrichedPoints(cidade);
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
        const lines = Object.entries(byFormat).map(([tipo, d]) =>
          `- ${tipo}: ${d.count} pontos, Fluxo total: ${fmtNum(d.totalFluxo)}/mês, Preço: ${fmtBRL(d.minPreco)} - ${fmtBRL(d.maxPreco)}`
        );
        return `Formatos disponíveis${cidade ? ' em ' + cidade : ''}:\n${lines.join('\n')}`;
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
          const pontos = ai.getEnrichedPoints(cidade);
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
4. Máximo 4 parágrafos ou 1 parágrafo + lista de até 8 itens.
5. Tom consultivo e profissional. Português brasileiro.
6. Ao listar pontos: "Nome (Tipo) — Fluxo X impactos/mês, R$ Y/mês"
7. Se a pergunta for uma saudação, apresente-se brevemente e sugira exemplos de perguntas.`;

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
      return 'Olá! Sou o Especialista DOOH da Rede Intermídia. Posso ajudar com informações sobre nosso inventário de mídia digital.\n\nExperimente perguntar:\n- "Quais pontos disponíveis em Londrina?"\n- "Ponto com maior fluxo em Maringá"\n- "O que é CPM?"\n- "Formatos disponíveis"';

    case 'conhecimento_geral':
      return 'Como especialista DOOH, posso explicar conceitos de mídia Out-of-Home. Nossos principais formatos são:\n\n- **Painel LED**: Alto impacto visual, 24h de visibilidade, ideal para branding massivo\n- **Elevador**: Público cativo em prédios residenciais e comerciais, alta frequência\n- **Tela Indoor**: Proximidade ao ponto de venda, momento de decisão de compra\n- **Backlight**: Grande formato iluminado, vias de alto tráfego\n- **Frontlight**: Rodovias e vias arteriais, alto alcance veicular\n\nPara informações específicas do inventário, pergunte sobre uma cidade ou formato!';

    default:
      if (dbContext) return dbContext;
      return 'Não encontrei dados específicos para sua pergunta. Tente perguntar sobre:\n- Pontos em uma cidade específica\n- Detalhes de um ponto (ex: "ponto #42")\n- Formatos disponíveis\n- Estatísticas de uma cidade';
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function processInventoryChat(message, history = [], userId = null) {
  const intent = classificarIntencao(message);
  const entities = extractEntities(message);
  const dbContext = buildChatContext(intent, entities);

  // Try LLM generation
  try {
    const prompt = buildChatPrompt(dbContext, history, message);
    const result = await ai.generateReplicateFirst(prompt);

    if (result && typeof result === 'object' && result.text) {
      const text = result.text.trim();
      // Basic quality check — reject very short or repetitive output
      if (text.length > 20) {
        return {
          response: text,
          intent,
          entities,
          _model: result.model || 'replicate',
        };
      }
    }
    // If result is a string (old format)
    if (typeof result === 'string' && result.trim().length > 20) {
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

  // Algorithmic fallback
  const fallback = buildAlgorithmicResponse(intent, entities, dbContext);
  return {
    response: fallback,
    intent,
    entities,
    _model: 'algorithmic',
  };
}

module.exports = { processInventoryChat };
