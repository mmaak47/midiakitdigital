/**
 * inventoryChatService.js
 * RAG-powered chatbot for DOOH/OOH inventory — scored-intent detection,
 * real DB data injection, LLM generation via Replicate with algorithmic fallback.
 */
'use strict';

const crypto = require('crypto');
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

// ── Session Management (chat_sessions table) ─────────────────────────────────
function ensureChatTables() {
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      conversation_state TEXT DEFAULT '{}',
      history TEXT DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      message_count INTEGER DEFAULT 0,
      last_intent TEXT
    )`).run();
  } catch { /* already exists */ }
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id)`).run();
  } catch { /* */ }
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at)`).run();
  } catch { /* */ }
}
try { ensureChatTables(); } catch (e) {
  console.error('[inventory-chat] session table bootstrap failed:', e.message);
}

function generateSessionId() {
  return crypto.randomUUID();
}

function getOrCreateSession(sessionId, userId) {
  if (sessionId) {
    try {
      const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId);
      if (row) {
        return {
          ...row,
          conversation_state: JSON.parse(row.conversation_state || '{}'),
          history: JSON.parse(row.history || '[]'),
        };
      }
    } catch { /* fall through to create */ }
  }
  const id = sessionId || generateSessionId();
  try {
    db.prepare('INSERT INTO chat_sessions (id, user_id) VALUES (?, ?)').run(id, userId);
  } catch { /* might already exist from race */ }
  return { id, user_id: userId, conversation_state: {}, history: [], message_count: 0 };
}

function updateSession(sessionId, { history, conversation_state, last_intent }) {
  try {
    db.prepare(
      `UPDATE chat_sessions SET history = ?, conversation_state = ?, updated_at = NOW(), message_count = message_count + 1, last_intent = ? WHERE id = ?`
    ).run(JSON.stringify(history), JSON.stringify(conversation_state), last_intent, sessionId);
  } catch (e) {
    console.error('[inventory-chat] session update failed:', e.message);
  }
}

// Lazy cleanup: run at most once per hour
let _lastCleanupTs = 0;
function cleanupStaleSessions() {
  const now = Date.now();
  if (now - _lastCleanupTs < 60 * 60 * 1000) return;
  _lastCleanupTs = now;
  try {
    db.prepare(`DELETE FROM chat_sessions WHERE updated_at < NOW() - INTERVAL '7 days'`).run();
    db.prepare(`DELETE FROM chat_sessions WHERE message_count = 0 AND updated_at < NOW() - INTERVAL '24 hours'`).run();
  } catch { /* non-critical */ }
}

// ── Conversation State Accumulation ──────────────────────────────────────────
function dedupe(arr) {
  return [...new Set(arr)];
}

function accumulateState(existingState, newEntities, message, intent) {
  const state = { ...existingState };
  const n = norm(message);

  if (newEntities.cidades.length) {
    state.cidades = dedupe([...newEntities.cidades, ...(state.cidades || [])]);
    // User explicitly asked about a city without specifying a region → clear accumulated
    // region so future queries for this city aren't incorrectly filtered by a prior bairro
    if (!newEntities.regioes.length) {
      state.regioes = [];
    }
  }

  if (newEntities.regioes.length) {
    state.regioes = dedupe([...newEntities.regioes, ...(state.regioes || [])]);
  }

  if (newEntities.formatos.length) {
    state.formatos = dedupe([...newEntities.formatos, ...(state.formatos || [])]);
  }

  if (newEntities.pontoIds.length) {
    state.pontoIds_discussed = dedupe([
      ...(state.pontoIds_discussed || []),
      ...newEntities.pontoIds,
    ]).slice(-20);
  }

  // Budget detection
  const budgetMatch = n.match(/(?:orcamento|budget|investir|gastar|verba)\b.*?(\d[\d.,]*)/);
  if (budgetMatch) {
    state.budget_hint = parseFloat(budgetMatch[1].replace(/\./g, '').replace(',', '.'));
  }

  // Objective detection
  const objMatch = n.match(/(?:quero|objetivo|campanha\s+de|foco\s+em)\s+(awareness|branding|performance|conversao|alcance|frequencia)/);
  if (objMatch) {
    state.objetivo = objMatch[1];
  }

  return state;
}

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

// ── Bairro map: point name → bairro (built from actual seed addresses) ───────
// Each entry maps a point name (lowercased) to its bairro.
// Derived by traversing all 89 seed addresses and identifying the neighborhood
// from the "endereco" field (part after " - ") or from the street/avenue context.
const BAIRRO_MAP = {
  // ── LONDRINA ───────────────────────────────────────────────────────────────
  // Gleba Palhano / Palhano region
  'palhano premium':            'Gleba Palhano',
  'palhano business t.1':       'Gleba Palhano',
  'palhano business t.2':       'Gleba Palhano',
  'ed. nyc palhano':            'Gleba Palhano',
  'garden palhano':             'Gleba Palhano',
  'ed. premiatto residence':    'Gleba Palhano',
  'ed. maison tuscany':         'Gleba Palhano',
  'panetteria palhano':         'Gleba Palhano',
  'panetteria palhano (backlight)': 'Gleba Palhano',
  'posto alpha (tela conveniencia)': 'Gleba Palhano',
  'posto alpha (led)':          'Gleba Palhano',
  'totem led caba mall':        'Gleba Palhano',
  'lab. oswaldo cruz (gleba)':  'Gleba Palhano',
  'ed. palhano residence':      'Guanabara',
  'videowall muffato madre':    'Gleba Palhano',
  'hachimitsu alameda jardino': 'Gleba Palhano',
  'ed. geneve':                 'Gleba Palhano',
  'fruttaria alphaville':       'Gleba Palhano',
  // Centro
  'comercial senador':          'Centro',
  'ed. studio d':               'Centro',
  'ldn grill':                  'Centro',
  'lab. oswaldo cruz (souza naves)': 'Centro',
  'posto ipiranga tiradentes x rio branco': 'Centro',
  'posto ipiranga (tiradentes)': 'Centro',
  'bar valentino':              'Centro',
  'bento munhoz':               'Centro',
  'posto ipiranga quintino':    'Centro',
  // Higienópolis
  'ed. pioneiros do cafe':      'Higienópolis',
  'hospital uniorte':           'Higienópolis',
  'uniorte fisio':              'Higienópolis',
  // Guanabara
  'uniorte prime':              'Guanabara',
  // Morumbi
  'duetto residence':           'Morumbi',
  // Jardim Andrade / Shangri-lá
  'ed. morada shangri-la':      'Shangri-lá',
  'ed. brisas alto do araxa':   'Jardim Andrade',
  // Terra Bonita
  'ed. fit terra bonita':       'Terra Bonita',
  // Petrópolis
  'ed. terranoble':             'Petrópolis',
  // Inglaterra
  'ed. torre santorini':        'Inglaterra',
  // Duque de Caxias area
  'duque hall':                 'Vila Casoni',
  'totem digital muffato duque': 'Vila Casoni',
  // Zona Norte
  'lab. oswaldo cruz (saul elkind)': 'Zona Norte',
  'totem digital muffato saul elkind': 'Zona Norte',
  // Aeroporto / Robert Koch
  'videowall muffato aeroporto': 'Aeroporto',
  // Cafezal
  'totem digital muffato cafezal': 'Cafezal',
  // Harry Prochet / Mediterrâneo
  'posto mediterraneo':         'Mediterrâneo',
  // Andes
  'posto gastech':              'Andes',
  // Maranhão / Leste-Oeste
  'posto ipiranga leste oeste': 'Jardim Bandeirantes',
  'posto ipiranga sun lake':    'Jardim Sun Lake',
  'posto br via expressa':      'Zona Leste',
  'posto ipiranga av maringa':  'Centro',
  // Strassberg (Rod. Celso Garcia Cid)
  'strassberg':                 'Rodovia Celso Garcia Cid',
  'strassberg (frontlight)':    'Rodovia Celso Garcia Cid',
  'rod. celso garcia cid':      'Rodovia Celso Garcia Cid',
  // Hachimitsu JK
  'hachimitsu jk':              'Av. Juscelino Kubitschek',
  'hachimitsu bela suica':      'Bela Suíça',
  // Others Londrina
  "arnaldo's":                  'Av. Maringá',
  'o casarao':                  'Av. Maringá',
  'waldemar spranger':          'Waldemar Spranger',
  'gil de abreu e souza':       'Gil de Abreu',
  'joaquim de matos barreto':   'Joaquim de Matos Barreto',
  'merkava clube de tiro':      'Cambé',
  'totem digital muffato ibipora': 'Ibiporã',
  'totem muffato cambe':        'Cambé',

  // ── MARINGÁ ────────────────────────────────────────────────────────────────
  'boteco do neco':             'Zona II',
  'sr. zanoni':                 'Zona 04',
  'hachimitsu maringa':         'Zona 02',
  'mercadao fratello':          'Centro',
  'mercadao de maringa':        'Centro',
  'maison lumini':              'Zona 01',
  'maison montalcino':          'Zona 08',
  'maison porto fino':          'Zona 08',
  'new tower plaza (torre 1)':  'Zona 07',
  'new tower plaza (torre 2)':  'Zona 07',
  'ed. marcelino champagnat':   'Zona 02',
  'nyc maringa':                'Zona 08',
  'ed. solar do bosque':        'Vila Cleópatra',
  'imperium residence':         'Cidade Nova',
  'spazio misato':              'Jardim das Estações',
  'residencial alta floresta':  'Zona 07',
  'ed. torre alvorear':         'Jardim Alvorada',
  'aeroporto de maringa':       'Aeroporto',

  // ── BALNEÁRIO CAMBORIÚ ─────────────────────────────────────────────────────
  'big wheel - cabines':        'Pioneiros',
  'big wheel - painel bilheteria': 'Pioneiros',
  'cafeteria da praca':         'Centro',
  'martin luther - painel 1':   'Nações',
  'martin luther - painel 2':   'Nações',
  'ed. seas tower':             'Centro',
  'ed. central park':           'Centro',

  // ── ITAJAÍ ─────────────────────────────────────────────────────────────────
  'ed. ville de leon':          'Itaipava',
  'london hub':                 'Centro',
};

// ── Bairro aliases: user input → canonical bairro name ──────────────────────
const BAIRRO_ALIASES = {
  'gleba palhano': 'Gleba Palhano',
  'gleba': 'Gleba Palhano',
  'palhano': 'Gleba Palhano',
  'higienopolis': 'Higienópolis',
  'higienópolis': 'Higienópolis',
  'jardim higienopolis': 'Higienópolis',
  'guanabara': 'Guanabara',
  'centro': 'Centro',
  'morumbi': 'Morumbi',
  'shangri-la': 'Shangri-lá',
  'shangri la': 'Shangri-lá',
  'shangrila': 'Shangri-lá',
  'terra bonita': 'Terra Bonita',
  'petropolis': 'Petrópolis',
  'petrópolis': 'Petrópolis',
  'inglaterra': 'Inglaterra',
  'jardim andrade': 'Jardim Andrade',
  'vila casoni': 'Vila Casoni',
  'zona norte': 'Zona Norte',
  'zona sul': 'Zona Sul',
  'zona leste': 'Zona Leste',
  'zona oeste': 'Zona Oeste',
  'cafezal': 'Cafezal',
  'aeroporto': 'Aeroporto',
  'andes': 'Andes',
  'bela suica': 'Bela Suíça',
  'bela suíça': 'Bela Suíça',
  'mediterraneo': 'Mediterrâneo',
  'mediterrâneo': 'Mediterrâneo',
  'cambe': 'Cambé',
  'cambé': 'Cambé',
  'ibipora': 'Ibiporã',
  'ibiporã': 'Ibiporã',
  // Maringá zones
  'zona 01': 'Zona 01',
  'zona 02': 'Zona 02',
  'zona 04': 'Zona 04',
  'zona 07': 'Zona 07',
  'zona 08': 'Zona 08',
  'zona ii': 'Zona II',
  'vila cleopatra': 'Vila Cleópatra',
  'vila cleópatra': 'Vila Cleópatra',
  'cidade nova': 'Cidade Nova',
  'jardim alvorada': 'Jardim Alvorada',
  'jardim das estacoes': 'Jardim das Estações',
  'jardim das estações': 'Jardim das Estações',
  // Balneário Camboriú
  'pioneiros': 'Pioneiros',
  'nacoes': 'Nações',
  'nações': 'Nações',
  // Itajaí
  'itaipava': 'Itaipava',
};

/**
 * Get the canonical bairro name for a point (by its nome field).
 * Returns null if not mapped.
 */
function getBairroForPoint(pointName) {
  if (!pointName) return null;
  return BAIRRO_MAP[String(pointName).toLowerCase().trim()] || null;
}

/**
 * Resolve user input to a canonical bairro name.
 * Checks BAIRRO_ALIASES first, then tries a fuzzy match against BAIRRO_MAP values.
 */
function resolveRegionName(input) {
  const n = norm(input);
  // Direct alias match
  if (BAIRRO_ALIASES[n]) return BAIRRO_ALIASES[n];
  // Also try with accents preserved (user might type "Higienópolis")
  const lower = String(input).toLowerCase().trim();
  if (BAIRRO_ALIASES[lower]) return BAIRRO_ALIASES[lower];
  // Check if it directly matches a bairro value in BAIRRO_MAP
  const allBairros = new Set(Object.values(BAIRRO_MAP));
  for (const b of allBairros) {
    if (norm(b) === n) return b;
  }
  return input; // fallback: use as-is
}

// ── Cached bairro/region index (30 min TTL) ──────────────────────────────────
let _knownRegions = [];      // [{ name, nameNorm, city }]
let _regionsCacheTs = 0;

function getKnownRegions() {
  const now = Date.now();
  if (_knownRegions.length && now - _regionsCacheTs < CITIES_TTL) return _knownRegions;
  try {
    const regionSet = new Map(); // nameNorm → { name, city }

    // 1. Primary source: BAIRRO_MAP — traverse all point→bairro mappings
    //    and also associate each bairro with its city (from enriched data)
    const points = ai.getEnrichedPoints();
    const pointCityMap = new Map();
    for (const p of points) {
      if (p.nome) pointCityMap.set(String(p.nome).toLowerCase().trim(), p.cidade || '');
    }

    for (const [pointNameLower, bairro] of Object.entries(BAIRRO_MAP)) {
      const bairroNorm = norm(bairro);
      if (bairroNorm.length < 2) continue;
      if (!regionSet.has(bairroNorm)) {
        const city = pointCityMap.get(pointNameLower) || '';
        regionSet.set(bairroNorm, { name: bairro, nameNorm: bairroNorm, city });
      }
    }

    // 2. Secondary: from enriched point data (neighborhood_label, endereco)
    for (const p of points) {
      const sources = [];
      if (p.neighborhood_label) sources.push(p.neighborhood_label);
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
        const n2 = norm(raw);
        if (n2.length < 3) continue;
        const isCidade = getKnownCities().some(c => norm(c) === n2);
        if (isCidade) continue;
        if (!regionSet.has(n2)) {
          regionSet.set(n2, { name: raw, nameNorm: n2, city: p.cidade || '' });
        }
      }
    }

    // 3. Add all aliases so user inputs match
    for (const [aliasRaw, canonical] of Object.entries(BAIRRO_ALIASES)) {
      const aliasNorm = norm(aliasRaw);
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
 * Search points matching a bairro/region.
 * Strategy: BAIRRO_MAP lookup first (most reliable), then case-insensitive DB search.
 */
function searchPointsByRegion(regionName, cidade) {
  // 1. Resolve the canonical bairro name from user input
  const canonical = resolveRegionName(regionName);
  const canonicalNorm = norm(canonical);

  // 2. Find all point names that belong to this bairro (from BAIRRO_MAP)
  const matchedNames = [];
  for (const [pointNameLower, bairro] of Object.entries(BAIRRO_MAP)) {
    if (norm(bairro) === canonicalNorm) {
      matchedNames.push(pointNameLower);
    }
  }

  // 3. If we have BAIRRO_MAP matches, fetch those points from enriched data
  if (matchedNames.length > 0) {
    const points = ai.getEnrichedPoints(cidade);
    const result = points.filter(p => {
      const pn = String(p.nome || '').toLowerCase().trim();
      return matchedNames.includes(pn);
    });
    if (result.length > 0) {
      // Tag each point with its bairro for display
      return result
        .map(p => ({ ...p, _bairro: canonical }))
        .sort((a, b) => (Number(b.fluxo) || 0) - (Number(a.fluxo) || 0));
    }
  }

  // 4. Fallback: case-insensitive DB search (catches points not in BAIRRO_MAP)
  const term = `%${regionName}%`;
  try {
    // Use LOWER() for case-insensitive search (works on both SQLite and PostgreSQL)
    let sql = `SELECT * FROM pontos_enriquecidos WHERE ativo = 1 AND (LOWER(nome) LIKE LOWER(?) OR LOWER(endereco) LIKE LOWER(?))`;
    const params = [term, term];
    if (cidade) {
      sql += ' AND cidade = ?';
      params.push(cidade);
    }
    sql += ' ORDER BY fluxo DESC';

    try {
      const rows = db.prepare(sql).all(...params);
      return rows.map(p => ({ ...p, _bairro: canonical }));
    } catch {
      let sqlFb = `SELECT * FROM pontos WHERE ativo = 1 AND (LOWER(nome) LIKE LOWER(?) OR LOWER(endereco) LIKE LOWER(?))`;
      const paramsFb = [term, term];
      if (cidade) {
        sqlFb += ' AND cidade = ?';
        paramsFb.push(cidade);
      }
      sqlFb += ' ORDER BY fluxo DESC';
      return db.prepare(sqlFb).all(...paramsFb).map(p => ({ ...p, _bairro: canonical }));
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

  // Boost pontos_regiao if a known region or bairro alias is detected
  const regions = getKnownRegions();
  const hasRegion = regions.some(r => n.includes(r.nameNorm));
  const hasBairroAlias = Object.keys(BAIRRO_ALIASES).some(alias => n.includes(norm(alias)));
  if ((hasRegion || hasBairroAlias) && scores.pontos_regiao < 8) {
    scores.pontos_regiao = Math.max(scores.pontos_regiao, 8);
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

  // Detect regions/bairros — check BAIRRO_ALIASES first, then known regions
  const regioes = [];
  // 1. Check BAIRRO_ALIASES for exact matches (most reliable)
  for (const [aliasRaw, canonical] of Object.entries(BAIRRO_ALIASES)) {
    const aliasNorm = norm(aliasRaw);
    if (n.includes(aliasNorm) && !regioes.some(r => norm(r) === norm(canonical))) {
      regioes.push(canonical);
    }
  }
  // 2. Check dynamically discovered regions
  const regions = getKnownRegions();
  for (const r of regions) {
    if (n.includes(r.nameNorm) && !regioes.some(rr => norm(rr) === r.nameNorm)) {
      regioes.push(r.name);
      if (r.city && !cidades.includes(r.city)) cidades.push(r.city);
    }
  }
  // 3. If we found a bairro but no city, try to infer city from BAIRRO_MAP
  if (regioes.length && !cidades.length) {
    const resolvedBairro = resolveRegionName(regioes[0]);
    const resolvedNorm = norm(resolvedBairro);
    // Find any point in this bairro and grab its city
    const points = ai.getEnrichedPoints();
    for (const p of points) {
      const pn = String(p.nome || '').toLowerCase().trim();
      const mappedBairro = BAIRRO_MAP[pn];
      if (mappedBairro && norm(mappedBairro) === resolvedNorm && p.cidade) {
        cidades.push(p.cidade);
        break;
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
        // Resolve canonical bairro name for display
        const bairroCanonical = resolveRegionName(regiao);
        const pontos = searchPointsByRegion(regiao, cidade);
        if (!pontos.length) {
          // Try broader search without city filter
          const broader = searchPointsByRegion(regiao, null);
          if (broader.length) {
            const lines = broader.map((p, i) =>
              `${i + 1}. ${p.nome} (${p.tipo}, ${p.cidade}) — Fluxo: ${fmtNum(p.fluxo)} imp/mês, ${fmtBRL(p.preco)}/mês` +
              (p.endereco ? ` | End: ${p.endereco}` : '') +
              (p._bairro ? ` | Bairro: ${p._bairro}` : '')
            );
            return `Pontos na região "${bairroCanonical}" (${broader.length} resultados — LISTA COMPLETA):\n${lines.join('\n')}\n\nTotal fluxo: ${fmtNum(broader.reduce((s, p) => s + (Number(p.fluxo) || 0), 0))} impactos/mês | Investimento total: ${fmtBRL(broader.reduce((s, p) => s + (Number(p.preco) || 0), 0))}/mês\n\nIMPORTANTE: Estes são TODOS os ${broader.length} pontos nesta região. NÃO existem outros.`;
          }
          // List available bairros as suggestions
          const allBairros = [...new Set(Object.values(BAIRRO_MAP))].sort();
          return `Nenhum ponto encontrado na região "${bairroCanonical}"${cidade ? ' em ' + cidade : ''}.\n\nBairros disponíveis no inventário: ${allBairros.slice(0, 15).join(', ')}${allBairros.length > 15 ? '...' : ''}.`;
        }
        const lines = pontos.map((p, i) =>
          `${i + 1}. ${p.nome} (${p.tipo}) — Fluxo: ${fmtNum(p.fluxo)} imp/mês, ${fmtBRL(p.preco)}/mês` +
          (p.endereco ? ` | End: ${p.endereco}` : '') +
          (p._bairro ? ` | Bairro: ${p._bairro}` : '')
        );
        return `Pontos na região "${bairroCanonical}"${cidade ? ' em ' + cidade : ''} (${pontos.length} resultados — LISTA COMPLETA):\n${lines.join('\n')}\n\nTotal fluxo: ${fmtNum(pontos.reduce((s, p) => s + (Number(p.fluxo) || 0), 0))} impactos/mês | Investimento total: ${fmtBRL(pontos.reduce((s, p) => s + (Number(p.preco) || 0), 0))}/mês\n\nIMPORTANTE: Estes são TODOS os ${pontos.length} pontos nesta região. NÃO existem outros.`;
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
        // Send ALL points — never truncate, to prevent LLM from inventing the rest
        const lines = pontos.map((p, i) => {
          const bairro = getBairroForPoint(p.nome) || p.neighborhood_label || null;
          return `${i + 1}. ${p.nome} (${p.tipo}) — Fluxo: ${fmtNum(p.fluxo)} imp/mês, ${fmtBRL(p.preco)}/mês` +
            (p.endereco ? ` | End: ${p.endereco}` : '') +
            (bairro ? ` | Bairro: ${bairro}` : '');
        });
        return `Pontos em ${cidade} (${total} pontos — LISTA COMPLETA, não existem outros):\n${lines.join('\n')}\n\nTotal fluxo: ${fmtNum(pontos.reduce((s, p) => s + (Number(p.fluxo) || 0), 0))} impactos/mês\n\nIMPORTANTE: Estes são TODOS os ${total} pontos em ${cidade}. NÃO existem outros além destes.`;
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

// ── Build LLM prompt (split system_prompt + prompt for Replicate) ────────────
function buildChatPrompt(dbContext, serverHistory, userMessage, conversationState) {
  const system_prompt = `Você é o Especialista de Mídia Externa da Rede Intermídia, um consultor de mídia Out-of-Home digital.

${ai.DOOH_KNOWLEDGE_COMPACT}

REGRAS ABSOLUTAS:
1. Responda EXCLUSIVAMENTE com base nos dados no bloco CONTEXTO abaixo. NUNCA invente nomes de pontos, números, endereços, preços ou fluxos.
2. Se um ponto NÃO está listado no CONTEXTO, ele NÃO EXISTE para esta resposta.
3. Se não tiver dados suficientes, diga CLARAMENTE: "Não encontrei essa informação no inventário disponível" e sugira reformular.
4. Formate valores com R$ e pontos de milhar. Fluxo como "X impactos/mês".
5. Máximo 4 parágrafos ou 1 parágrafo + lista de até 10 itens.
6. Tom consultivo, profissional e comercialmente proativo. Português brasileiro.
7. Ao listar pontos: "Nome (Tipo) — Fluxo X impactos/mês, R$ Y/mês"
8. Liste TODOS os pontos presentes no CONTEXTO quando relevante — não omita nenhum.
9. Inclua endereço e bairro quando disponíveis.
10. NUNCA se apresente como "Sou o Especialista" ou similar em nenhuma resposta — o usuário já sabe quem você é. Se for saudação, responda amigavelmente e sugira exemplos diretamente.
11. NUNCA adicione pontos que não estejam explicitamente no CONTEXTO.

TÁTICA COMERCIAL:
- Você tem malicia de vendedor: destaque os benefícios, crie senso de urgência, incentive a fechar negócio.
- Se o cliente pedir desconto, ofereça até 10% de desconto posicionándolo como um valor especial, limitado e excepcional.
- Se o cliente insistir em desconto maior que 10%, responda que precisa falar diretamente com um vendedor e forneça o WhatsApp: **(43) 98450-0480** (wa.me/554398450480). Não ofereça mais de 10% em hipótese alguma por este canal.`;

  const parts = [];

  if (dbContext) {
    parts.push(`CONTEXTO (dados reais do inventário — use SOMENTE estes dados):\n${dbContext}`);
  } else {
    parts.push('CONTEXTO: Nenhum dado específico encontrado para esta consulta.');
  }

  if (serverHistory && serverHistory.length) {
    const recent = serverHistory.slice(-6);
    const histBlock = recent.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.text}`).join('\n');
    parts.push(`HISTÓRICO DA CONVERSA:\n${histBlock}`);
  }

  if (conversationState) {
    const cs = conversationState;
    const stateParts = [];
    if (cs.cidades?.length) stateParts.push(`Cidade: ${cs.cidades[0]}`);
    if (cs.regioes?.length) stateParts.push(`Região: ${cs.regioes[0]}`);
    if (cs.formatos?.length) stateParts.push(`Formatos: ${cs.formatos.join(', ')}`);
    if (cs.budget_hint) stateParts.push(`Orçamento: ${fmtBRL(cs.budget_hint)}`);
    if (cs.objetivo) stateParts.push(`Objetivo: ${cs.objetivo}`);
    if (stateParts.length) {
      parts.push(`ESTADO DA CONVERSA:\n${stateParts.join(' | ')}`);
    }
  }

  parts.push(`Pergunta do usuário: ${userMessage}\nAssistente:`);

  return { system_prompt, prompt: parts.join('\n\n') };
}

// ── Algorithmic fallback ──────────────────────────────────────────────────────
function buildAlgorithmicResponse(intent, entities, dbContext) {
  switch (intent) {
    case 'saudacao':
      return 'Olá! Posso ajudar com informações sobre nosso inventário de mídia externa digital da Rede Intermídia.\n\nExperimente perguntar:\n- "Quais pontos na Gleba Palhano?"\n- "Pontos disponíveis em Londrina"\n- "Ponto com maior fluxo em Maringá"\n- "O que é CPM?"\n- "Formatos disponíveis"';

    case 'conhecimento_geral':
      return 'Posso explicar conceitos de mídia externa Out-of-Home. Nossos principais formatos são:\n\n- **Painel LED**: Alto impacto visual, 24h de visibilidade, ideal para branding massivo\n- **Elevador**: Público cativo em prédios residenciais e comerciais, alta frequência\n- **Tela Indoor**: Proximidade ao ponto de venda, momento de decisão de compra\n- **Backlight**: Grande formato iluminado, vias de alto tráfego\n- **Frontlight**: Rodovias e vias arteriais, alto alcance veicular\n\nPara informações específicas do inventário, pergunte sobre uma cidade, bairro ou formato!';

    default:
      if (dbContext) return dbContext;
      return 'Não encontrei dados específicos para sua pergunta. Tente perguntar sobre:\n- Pontos em uma cidade ou bairro (ex: "pontos na Gleba Palhano")\n- Detalhes de um ponto (ex: "ponto #42")\n- Formatos disponíveis\n- Estatísticas de uma cidade';
  }
}

// ── Response validation (anti-hallucination) ─────────────────────────────────
let _allPointNamesCache = null;
let _allPointNamesCacheTs = 0;

function getAllPointNames() {
  const now = Date.now();
  if (_allPointNamesCache && now - _allPointNamesCacheTs < CITIES_TTL) return _allPointNamesCache;
  try {
    const points = ai.getEnrichedPoints();
    _allPointNamesCache = new Set(points.map(p => norm(p.nome)));
    _allPointNamesCacheTs = now;
  } catch {
    if (!_allPointNamesCache) _allPointNamesCache = new Set();
  }
  return _allPointNamesCache;
}

function extractNamesFromContext(dbContext) {
  const names = [];
  if (!dbContext) return names;
  for (const line of dbContext.split('\n')) {
    const m = line.match(/^\d+\.\s*(.+?)\s*\(/);
    if (m) names.push(m[1].trim());
  }
  return names;
}

function validateResponse(responseText, dbContext) {
  if (!responseText || !dbContext) return { valid: true, issues: [] };

  const allNames = getAllPointNames();
  const issues = [];

  // Extract point-like names from response (patterns: "1. Name (Type)" or "**Name** —")
  const responseNames = [];
  for (const line of responseText.split('\n')) {
    let m = line.match(/^\d+\.\s*\*?\*?(.+?)\*?\*?\s*[\(\-\—]/);
    if (m) responseNames.push(m[1].trim());
  }

  // Check that mentioned point names exist in the inventory
  for (const name of responseNames) {
    if (name.length > 3 && !allNames.has(norm(name))) {
      // Only flag if starts with uppercase (proper noun, likely a point name)
      if (/[A-ZÀ-Ú]/.test(name[0])) {
        issues.push({ type: 'unknown_point', name });
      }
    }
  }

  // Check point IDs mentioned as #N
  const idMatches = [...responseText.matchAll(/#(\d+)/g)];
  for (const m of idMatches) {
    const id = Number(m[1]);
    if (id > 0 && !ai.getPointById(id)) {
      issues.push({ type: 'invalid_id', id: m[1] });
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function processInventoryChat(message, history = [], userId = null, sessionId = null) {
  // Lazy session cleanup
  cleanupStaleSessions();

  const startMs = Date.now();
  const intent = classificarIntencao(message);
  const currentEntities = extractEntities(message);

  // ── Session: load or create ──────────────────────────────────────────────
  let session = null;
  let accState = null;
  if (sessionId) {
    session = getOrCreateSession(sessionId, userId);
  }

  // ── Accumulate conversation state ────────────────────────────────────────
  if (session) {
    accState = accumulateState(session.conversation_state, currentEntities, message, intent);
  }

  // ── Effective entities: current entities + accumulated context ────────────
  // When user explicitly asks about a whole city (pontos_cidade) without specifying
  // a region, do NOT inherit the accumulated region — they want ALL points in that
  // city, not filtered by a previously discussed bairro (e.g. "Gleba Palhano").
  const cityQueryWithoutRegion =
    intent === 'pontos_cidade' && currentEntities.cidades.length > 0 && currentEntities.regioes.length === 0;

  const effectiveEntities = {
    cidades:  currentEntities.cidades.length  ? currentEntities.cidades  : (accState?.cidades || []),
    regioes:  currentEntities.regioes.length  ? currentEntities.regioes  : (cityQueryWithoutRegion ? [] : (accState?.regioes || [])),
    formatos: currentEntities.formatos.length ? currentEntities.formatos : (accState?.formatos || []),
    pontoIds: currentEntities.pontoIds.length ? currentEntities.pontoIds : (accState?.pontoIds_discussed || []).slice(-3),
  };

  const dbContext = buildChatContext(intent, effectiveEntities);

  // ── Semantic cache key (v4: uses effective entities) ─────────────────────
  const cacheKey = ai.hashInput(`chat_v5_${intent}_${JSON.stringify({
    c: effectiveEntities.cidades,
    r: effectiveEntities.regioes,
    f: effectiveEntities.formatos,
    p: effectiveEntities.pontoIds,
    ctx: dbContext ? dbContext.slice(0, 200) : '',
  })}`);

  // Check cache (skip for saudacao — always fresh)
  if (intent !== 'saudacao') {
    const cached = ai.getCached(cacheKey);
    if (cached && cached.response && cached.response.length > 20) {
      console.log(`[inventory-chat] cache hit (intent=${intent})`);

      // Still update session with this interaction
      if (session) {
        const updatedHistory = [
          ...session.history.slice(-18),
          { role: 'user', text: message },
          { role: 'assistant', text: cached.response },
        ];
        updateSession(session.id, {
          history: updatedHistory,
          conversation_state: accState || session.conversation_state,
          last_intent: intent,
        });
      }

      return {
        response: cached.response,
        intent,
        entities: effectiveEntities,
        _model: cached.model || 'cache',
        _source: 'cache',
        sessionId: session?.id || null,
      };
    }
  }

  // ── Build prompt (system_prompt + prompt) ────────────────────────────────
  const serverHistory = session ? session.history : history;
  // Pass effective state to the prompt — remove stale region when user asked for a whole city
  const promptState = accState
    ? { ...accState, regioes: effectiveEntities.regioes }
    : null;
  const { system_prompt, prompt } = buildChatPrompt(dbContext, serverHistory, message, promptState);

  // LLM options: low temperature for grounding
  const llmOptions = {
    system_prompt,
    temperature: 0.2,
  };

  let responseText = null;
  let resultModel = null;
  let validationPassed = true;

  // ── Try LLM generation ──────────────────────────────────────────────────
  try {
    const result = await ai.generateReplicateFirst(prompt, llmOptions);

    if (result && typeof result === 'object' && result.text) {
      responseText = result.text.trim();
      resultModel = result.model || 'replicate';
    } else if (typeof result === 'string' && result.trim().length > 20) {
      responseText = result.trim();
      resultModel = 'replicate';
    }

    // ── Validate response (anti-hallucination) ────────────────────────────
    if (responseText && responseText.length > 20 && dbContext) {
      const validation = validateResponse(responseText, dbContext);
      validationPassed = validation.valid;

      if (!validation.valid) {
        console.warn(`[inventory-chat] validation failed: ${JSON.stringify(validation.issues)}`);

        // Retry with stricter prompt
        const contextNames = extractNamesFromContext(dbContext);
        if (contextNames.length) {
          const stricterPrompt = prompt + `\n\nIMPORTANTE: Use SOMENTE estes nomes de pontos: ${contextNames.join(', ')}. NAO mencione nenhum outro nome de ponto.`;
          try {
            const retryResult = await ai.generateReplicateFirst(stricterPrompt, {
              ...llmOptions,
              temperature: 0.1,
            });
            if (retryResult && retryResult.text && retryResult.text.trim().length > 20) {
              const retryValidation = validateResponse(retryResult.text.trim(), dbContext);
              if (retryValidation.valid) {
                responseText = retryResult.text.trim();
                resultModel = (retryResult.model || 'replicate') + ':retry';
                validationPassed = true;
              }
            }
          } catch { /* retry failed, fall through */ }
        }

        // If still invalid after retry, use algorithmic fallback
        if (!validationPassed) {
          responseText = buildAlgorithmicResponse(intent, effectiveEntities, dbContext);
          resultModel = 'algorithmic:validation_fallback';
          validationPassed = true; // algorithmic can't hallucinate
        }
      }
    }
  } catch (err) {
    console.error('[inventoryChat] LLM failed:', err.message);
  }

  // ── Algorithmic fallback if LLM produced nothing ────────────────────────
  if (!responseText || responseText.length <= 20) {
    responseText = buildAlgorithmicResponse(intent, effectiveEntities, dbContext);
    resultModel = 'algorithmic';
  }

  // ── Cache the response ──────────────────────────────────────────────────
  const latency = Date.now() - startMs;
  if (intent !== 'saudacao' && intent !== 'desconhecido') {
    ai.setCache(cacheKey, message, responseText, resultModel, latency);
  }

  // ── Update session ──────────────────────────────────────────────────────
  if (session) {
    const updatedHistory = [
      ...session.history.slice(-18),
      { role: 'user', text: message },
      { role: 'assistant', text: responseText },
    ];
    updateSession(session.id, {
      history: updatedHistory,
      conversation_state: accState || session.conversation_state,
      last_intent: intent,
    });
  }

  // ── Log to ai_memory ────────────────────────────────────────────────────
  try {
    ai.saveMemory(
      message,
      responseText,
      userId,
      JSON.stringify({
        intent,
        entities: effectiveEntities,
        model: resultModel,
        validation_passed: validationPassed,
        latency_ms: latency,
        turn: session ? session.message_count + 1 : 0,
      }),
      session?.id || null
    );
  } catch { /* non-critical */ }

  return {
    response: responseText,
    intent,
    entities: effectiveEntities,
    _model: resultModel,
    sessionId: session?.id || null,
  };
}

module.exports = { processInventoryChat };
