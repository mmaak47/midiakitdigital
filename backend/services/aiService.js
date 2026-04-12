/**
 * services/aiService.js — DOOH Intelligence Layer
 *
 * Full AI engine trained on Digital Out-of-Home media data:
 *   - DOOH knowledge base (formats, metrics, benchmarks)
 *   - Point-level AI insights (commercial arguments, audience narrative)
 *   - Campaign AI analysis (strategy, optimization, competitive positioning)
 *   - Smart recommendations powered by PostGIS enriched data
 *   - generateLocal/generateWithFallback (Ollama + Replicate)
 *   - Cache + Memory + Pattern learning layers
 */
'use strict';

const crypto = require('crypto');
const db = require('../database');

// ── Config ──────────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2:1.5b';
const OLLAMA_FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'llama3';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 90000;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const CACHE_TTL_HOURS = Number(process.env.AI_CACHE_TTL_HOURS) || 72;

// ── DOOH Knowledge Base ─────────────────────────────────────────────────────

// Compact knowledge for fast models (qwen2:1.5b)
const DOOH_KNOWLEDGE_COMPACT = `Você é especialista em mídia DOOH (Digital Out-of-Home) no Brasil, sistema MidiaKit da Rede Intermidia.
Formatos: Painel LED (CPM R$5-15), Elevador (CPM R$2-8, público cativo), Tela Indoor (CPM R$3-12, PDV), Backlight (CPM R$8-20), Frontlight (CPM R$10-25).
Métricas: Fluxo=impactos/mês, CPM=Preço/(Fluxo/1000), Frequência ideal=2-6x/semana.
Regras: NUNCA inventar números, usar dados reais fornecidos, linguagem comercial profissional brasileira.`;

// Full knowledge for larger models (llama3, mistral)
const DOOH_KNOWLEDGE = `## CONHECIMENTO: MÍDIA DOOH (Digital Out-of-Home)

Você é especialista sênior em mídia DOOH no mercado brasileiro, sistema MidiaKit Digital da Rede Intermidia.

### FORMATOS:
- Painel LED: Grande formato, alto tráfego, spots 15s, visibilidade 24h. CPM R$5-15.
- Elevador: Telas residenciais/comerciais, frequência 4-8x/dia, público cativo A/B. CPM R$2-8.
- Tela Indoor: Supermercados/academias, perto do PDV, momento de decisão. CPM R$3-12.
- Backlight: Iluminação traseira, grande formato, vias arteriais. CPM R$8-20.
- Frontlight: Iluminação frontal, rodovias, alto alcance veicular. CPM R$10-25.

### MÉTRICAS:
- Fluxo: impactos mensais | CPM = (Preço/Fluxo)*1000 | Frequência ideal: 2-6x/semana
- Cobertura: % dos pontos da cidade no plano | GRP = Alcance × Frequência

### AUDIÊNCIA POR BAIRRO:
Centro Corporativo, Zona Comercial, Residencial Premium, Residencial Médio, Zona Universitária, Zona de Lazer, Zona Popular Densa, Polo de Saúde, Polo Educacional.

### REGRAS:
1. NUNCA inventar dados — usar números reais fornecidos
2. CPM baixo = eficiência, Fluxo alto = alcance
3. "Público cativo" para elevadores, "Momento de decisão" para indoor, "Visibilidade 24h" para LED
4. Linguagem profissional de mercado publicitário brasileiro
`;

// Select knowledge base based on model size
function getKnowledge() {
  return OLLAMA_MODEL.includes('1.5b') || OLLAMA_MODEL.includes('0.5b') || OLLAMA_MODEL.includes('tiny')
    ? DOOH_KNOWLEDGE_COMPACT
    : DOOH_KNOWLEDGE;
}

// ── Data helpers: pull real data from PostgreSQL ────────────────────────────

function getEnrichedPoints(cidade) {
  try {
    if (cidade) {
      return db.prepare(
        `SELECT * FROM pontos_enriquecidos WHERE cidade = ? ORDER BY score_base DESC`
      ).all(cidade);
    }
    return db.prepare(`SELECT * FROM pontos_enriquecidos ORDER BY score_base DESC`).all();
  } catch { return []; }
}

function getPointById(pontoId) {
  try {
    return db.prepare(`SELECT * FROM pontos_enriquecidos WHERE id = ? LIMIT 1`).get(Number(pontoId));
  } catch { return null; }
}

function getClusters(cidade) {
  try {
    if (cidade) {
      return db.prepare(
        `SELECT pc.cluster_id, pc.ponto_id, p.nome, p.tipo, p.fluxo, p.preco
         FROM ponto_clusters pc JOIN pontos p ON p.id = pc.ponto_id
         WHERE pc.cidade = ? ORDER BY pc.cluster_id`
      ).all(cidade);
    }
    return [];
  } catch { return []; }
}

function getCityStats(cidade) {
  try {
    const rows = getEnrichedPoints(cidade);
    if (!rows.length) return null;
    const totalFluxo = rows.reduce((s, r) => s + (Number(r.fluxo) || 0), 0);
    const totalPreco = rows.reduce((s, r) => s + (Number(r.preco) || 0), 0);
    const tipos = {};
    const bairros = {};
    const perfis = {};
    rows.forEach(r => {
      if (r.tipo) tipos[r.tipo] = (tipos[r.tipo] || 0) + 1;
      if (r.neighborhood_type) bairros[r.neighborhood_type] = (bairros[r.neighborhood_type] || 0) + 1;
      if (r.perfil_dominante) perfis[r.perfil_dominante] = (perfis[r.perfil_dominante] || 0) + 1;
    });
    return {
      cidade,
      total_pontos: rows.length,
      total_fluxo: totalFluxo,
      investimento_total: totalPreco,
      cpm_medio: totalFluxo > 0 ? totalPreco / (totalFluxo / 1000) : 0,
      formatos: tipos,
      bairros,
      perfis_demograficos: perfis,
      score_medio: rows.reduce((s, r) => s + (Number(r.score_base) || 0), 0) / rows.length,
    };
  } catch { return null; }
}

function getPointEntorno(pontoId) {
  try {
    return db.prepare(
      `SELECT segmento_analisado, score_relevancia, total_estabelecimentos_relacionados, categorias_encontradas
       FROM entorno_cache WHERE ponto_id = ? ORDER BY score_relevancia DESC LIMIT 5`
    ).all(Number(pontoId));
  } catch { return []; }
}

function getPointGeoProfile(pontoId) {
  try {
    return db.prepare(
      `SELECT neighborhood_type, neighborhood_label, socioeconomic_level, socioeconomic_score,
              urban_density, total_pois, environment_type, dominant_activity, audience_narrative
       FROM geo_audience_profiles WHERE ponto_id = ? LIMIT 1`
    ).get(Number(pontoId));
  } catch { return null; }
}

function getPointCensus(pontoId) {
  try {
    return db.prepare(
      `SELECT perfil_dominante, score_geral, perfil_alta_renda, perfil_massa_varejo,
              perfil_jovem_universitario, perfil_terceira_idade
       FROM census_audience_profiles WHERE ponto_id = ? LIMIT 1`
    ).get(Number(pontoId));
  } catch { return null; }
}

// ── Bootstrap tables ────────────────────────────────────────────────────────

function ensureTables() {
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_cache (
      id BIGSERIAL PRIMARY KEY,
      input_hash TEXT UNIQUE NOT NULL,
      prompt TEXT,
      response TEXT NOT NULL,
      model TEXT,
      latency_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).run();
  } catch { /* already exists */ }

  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_memory (
      id BIGSERIAL PRIMARY KEY,
      input TEXT NOT NULL,
      output TEXT NOT NULL,
      feedback INTEGER DEFAULT 0,
      user_id INTEGER,
      context TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).run();
  } catch { /* already exists */ }

  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_patterns (
      id BIGSERIAL PRIMARY KEY,
      pattern TEXT UNIQUE NOT NULL,
      response TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      last_used_at TIMESTAMPTZ DEFAULT NOW()
    )`).run();
  } catch { /* already exists */ }

  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_cache_hash ON ai_cache(input_hash)`).run();
  } catch { /* */ }
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_memory_feedback ON ai_memory(feedback DESC)`).run();
  } catch { /* */ }
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_patterns_score ON ai_patterns(score DESC)`).run();
  } catch { /* */ }

  // Add session_id column to ai_memory (idempotent)
  try {
    db.prepare(`ALTER TABLE ai_memory ADD COLUMN session_id TEXT`).run();
  } catch { /* column already exists */ }
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_memory_session ON ai_memory(session_id)`).run();
  } catch { /* */ }
}

try { ensureTables(); } catch (e) {
  console.error('[ai] table bootstrap failed:', e.message);
}

// ── Hash helper ─────────────────────────────────────────────────────────────

function hashInput(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

// ── Cache layer ─────────────────────────────────────────────────────────────

function getCached(inputHash) {
  try {
    const row = db.prepare(
      `SELECT response, model, created_at FROM ai_cache
       WHERE input_hash = ?
         AND created_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'
       LIMIT 1`
    ).get(inputHash);
    return row || null;
  } catch { return null; }
}

function setCache(inputHash, prompt, response, model, latencyMs) {
  try {
    db.prepare(
      `INSERT INTO ai_cache (input_hash, prompt, response, model, latency_ms)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (input_hash) DO UPDATE
       SET response = EXCLUDED.response,
           model = EXCLUDED.model,
           latency_ms = EXCLUDED.latency_ms,
           created_at = NOW()`
    ).run(inputHash, prompt, response, model, latencyMs);
  } catch (e) {
    console.error('[ai-cache] save failed:', e.message);
  }
}

// ── Memory / Learning layer ─────────────────────────────────────────────────

function saveMemory(input, output, userId = null, context = null, sessionId = null) {
  try {
    db.prepare(
      `INSERT INTO ai_memory (input, output, user_id, context, session_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(input, output, userId, context, sessionId);
  } catch (e) {
    console.error('[ai-memory] save failed:', e.message);
  }
}

function updateFeedback(memoryId, feedback) {
  try {
    db.prepare(
      `UPDATE ai_memory SET feedback = ? WHERE id = ?`
    ).run(feedback, memoryId);

    // Also update pattern scores based on feedback
    const mem = db.prepare(`SELECT input, output FROM ai_memory WHERE id = ?`).get(memoryId);
    if (mem) {
      const patternKey = extractPatternKey(mem.input);
      if (feedback > 0) {
        upsertPattern(patternKey, mem.output, 1);
      } else if (feedback < 0) {
        upsertPattern(patternKey, mem.output, -1);
      }
    }
  } catch (e) {
    console.error('[ai-memory] feedback update failed:', e.message);
  }
}

function extractPatternKey(input) {
  // Extract keywords from input for pattern matching
  return String(input || '')
    .toLowerCase()
    .replace(/[^\w\sáàâãéèêíïóôõúüç]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .sort()
    .slice(0, 10)
    .join(' ');
}

function upsertPattern(pattern, response, scoreDelta) {
  if (!pattern) return;
  try {
    db.prepare(
      `INSERT INTO ai_patterns (pattern, response, score, usage_count, last_used_at)
       VALUES (?, ?, ?, 1, NOW())
       ON CONFLICT (pattern) DO UPDATE
       SET score = ai_patterns.score + ?,
           usage_count = ai_patterns.usage_count + 1,
           last_used_at = NOW(),
           response = CASE WHEN ? > 0 THEN EXCLUDED.response ELSE ai_patterns.response END`
    ).run(pattern, response, scoreDelta, scoreDelta, scoreDelta);
  } catch (e) {
    console.error('[ai-patterns] upsert failed:', e.message);
  }
}

function getRelevantMemories(input, limit = 5) {
  try {
    const keywords = String(input || '').split(/\s+/).filter(w => w.length > 3).slice(0, 5);
    if (!keywords.length) return [];

    const conditions = keywords.map(k => `input ILIKE '%${k.replace(/'/g, "''")}%'`).join(' OR ');
    return db.prepare(
      `SELECT id, input, output, feedback FROM ai_memory
       WHERE (${conditions}) AND feedback >= 0
       ORDER BY feedback DESC, created_at DESC
       LIMIT ?`
    ).all(limit);
  } catch { return []; }
}

function getTopPatterns(input, limit = 3) {
  try {
    const patternKey = extractPatternKey(input);
    const words = patternKey.split(' ').filter(Boolean).slice(0, 5);
    if (!words.length) return [];

    const conditions = words.map(w => `pattern ILIKE '%${w.replace(/'/g, "''")}%'`).join(' OR ');
    return db.prepare(
      `SELECT pattern, response, score FROM ai_patterns
       WHERE (${conditions}) AND score > 0
       ORDER BY score DESC
       LIMIT ?`
    ).all(limit);
  } catch { return []; }
}

// ── Ollama: local generation ────────────────────────────────────────────────

async function generateLocal(prompt, model = OLLAMA_MODEL, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const start = Date.now();

  // Build Ollama prompt: if system_prompt provided, prepend as system instruction
  const ollamaPrompt = options.system_prompt
    ? `<<SYS>>\n${options.system_prompt}\n<</SYS>>\n\n${prompt}`
    : prompt;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: ollamaPrompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          top_p: options.top_p || 0.9,
          num_predict: options.max_tokens || 2048,
          num_ctx: 4096,
        },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    const latency = Date.now() - start;
    console.log(`[ai] ${model} responded in ${latency}ms (${(data.response || '').length} chars)`);
    return { text: data.response || '', model, latency };
  } catch (error) {
    clearTimeout(timeout);
    const msg = error.name === 'AbortError' ? 'TIMEOUT' : error.message;
    console.error(`[ai] ${model} failed: ${msg}`);
    throw new Error(`LOCAL_AI_FAILED:${model}:${msg}`);
  }
}

// ── Replicate fallback ──────────────────────────────────────────────────────

async function generateWithReplicate(prompt, model = 'meta/meta-llama-3-70b-instruct', options = {}) {
  if (!REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_NOT_CONFIGURED');
  }

  const start = Date.now();

  try {
    const inputPayload = {
      prompt,
      max_tokens: options.max_tokens || 1200,
      temperature: options.temperature ?? 0.3,
    };
    // Use Replicate's system_prompt field when provided
    if (options.system_prompt) {
      inputPayload.system_prompt = options.system_prompt;
    }

    const response = await fetch('https://api.replicate.com/v1/models/' + model + '/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({ input: inputPayload }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Replicate HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = Array.isArray(data.output) ? data.output.join('') : String(data.output || '');
    const latency = Date.now() - start;
    const modelShort = model.split('/').pop();
    console.log(`[ai] replicate (${modelShort}) responded in ${latency}ms`);
    return { text, model: `replicate:${modelShort}`, latency };
  } catch (error) {
    console.error('[ai] replicate failed:', error.message);
    throw new Error(`REPLICATE_FAILED:${error.message}`);
  }
}

// ── Fallback chain ──────────────────────────────────────────────────────────

async function generateWithFallback(prompt, options = {}) {
  // Try primary model (llama3)
  try {
    return await generateLocal(prompt, OLLAMA_MODEL, options);
  } catch (e1) {
    console.warn(`[ai] primary failed (${OLLAMA_MODEL}), trying fallback...`);

    // Try fallback model (mistral)
    try {
      return await generateLocal(prompt, OLLAMA_FALLBACK_MODEL, options);
    } catch (e2) {
      console.warn(`[ai] local fallback failed (${OLLAMA_FALLBACK_MODEL}), trying replicate...`);

      // Try Replicate
      try {
        return await generateWithReplicate(prompt, 'meta/meta-llama-3-70b-instruct', options);
      } catch (e3) {
        console.error('[ai] all providers failed');
        throw new Error('ALL_AI_PROVIDERS_FAILED');
      }
    }
  }
}

/**
 * Replicate-first chain: better model (70B) as primary, local as fallback.
 * Used for client-facing content that needs commercial quality.
 */
async function generateReplicateFirst(prompt, options = {}) {
  // 1. Try Replicate 70B (best quality)
  try {
    return await generateWithReplicate(prompt, 'meta/meta-llama-3-70b-instruct', options);
  } catch (e1) {
    console.warn('[ai] replicate 70B failed, trying replicate 8B...');

    // 2. Try Replicate 8B
    try {
      return await generateWithReplicate(prompt, 'meta/meta-llama-3-8b-instruct', options);
    } catch (e2) {
      console.warn('[ai] replicate 8B failed, trying local fallback...');

      // 3. Try local Ollama (last resort)
      try {
        return await generateLocal(prompt, OLLAMA_FALLBACK_MODEL, options);
      } catch (e3) {
        try {
          return await generateLocal(prompt, OLLAMA_MODEL, options);
        } catch (e4) {
          console.error('[ai] all providers failed (replicate-first chain)');
          throw new Error('ALL_AI_PROVIDERS_FAILED');
        }
      }
    }
  }
}

// ── Prompt Engineering (DOOH-aware) ─────────────────────────────────────────

function buildMemoryBlock(memories, patterns) {
  let ctx = '';
  if (memories.length) {
    const lines = memories.map(m => {
      const tag = m.feedback > 0 ? '✓ aprovado' : 'neutro';
      return `- [${tag}] "${String(m.input).slice(0, 80)}" → "${String(m.output).slice(0, 120)}"`;
    });
    ctx += `\nINTERAÇÕES ANTERIORES RELEVANTES:\n${lines.join('\n')}\n`;
  }
  if (patterns.length) {
    const lines = patterns.map(p => `- (score ${p.score}) ${String(p.response).slice(0, 150)}`);
    ctx += `\nPADRÕES BEM-SUCEDIDOS:\n${lines.join('\n')}\n`;
  }
  return ctx;
}

function buildPrompt(data, memories = [], patterns = []) {
  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
  const nome = data.nome || data.empresa || 'ponto';
  const tipo = data.tipo || 'DOOH';
  const cidade = data.cidade || '';
  const fluxo = Number(data.fluxo || 0);
  const preco = Number(data.preco || 0);
  const cpm = fluxo > 0 ? preco / (fluxo / 1000) : 0;

  return `Você é consultor de mídia DOOH. Crie conteúdo comercial ESPECÍFICO.
${buildMemoryBlock(memories, patterns)}
DADOS: ${nome} (${tipo}) em ${cidade}. Preço R$${fmt(preco)}/mês, Fluxo ${fmt(fluxo)} impactos/mês, CPM R$${cpm.toFixed(2)}.

Usando os dados acima, escreva conteúdo original e específico para "${nome}".

HEADLINE: frase de impacto comercial sobre ${nome} citando o fluxo de ${fmt(fluxo)} impactos
DESCRICAO: 2-3 frases comerciais para vender ${nome}, cite CPM R$${cpm.toFixed(2)} e localização em ${cidade}
FORTE1: argumento de venda baseado no alcance e fluxo
FORTE2: argumento sobre custo-benefício e CPM
FORTE3: argumento sobre localização e público`;
}

function buildAnalysisPrompt(input, memories = [], patterns = []) {
  return `${getKnowledge()}
${buildMemoryBlock(memories, patterns)}
TAREFA:
${input}

Responda de forma prática, direta e estratégica. Em português brasileiro.
Use seu conhecimento profundo de DOOH para fundamentar a análise.`;
}

/**
 * Build a detailed prompt for point-level AI insight.
 * Uses all enrichment data (geo, census, entorno) from the database.
 */
function buildPointInsightPrompt(point, entorno, geoProfile, census) {
  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
  const cpm = Number(point.fluxo) > 0 ? (Number(point.preco) / (Number(point.fluxo) / 1000)) : 0;

  // Classify the point
  let cpmClass = cpm <= 5 ? 'muito eficiente' : cpm <= 15 ? 'eficiente' : cpm <= 30 ? 'médio' : 'premium';
  let tipoVantagem = '';
  const tipo = (point.tipo || '').toLowerCase();
  if (tipo.includes('led') || tipo.includes('painel')) tipoVantagem = 'alta visibilidade 24h, grande formato, impacto visual';
  else if (tipo.includes('elevador')) tipoVantagem = 'público cativo, alta frequência 4-8x/dia, perfil A/B';
  else if (tipo.includes('indoor') || tipo.includes('tela')) tipoVantagem = 'perto do ponto de venda, momento de decisão de compra';
  else if (tipo.includes('backlight')) tipoVantagem = 'grande formato iluminado, vias arteriais';
  else if (tipo.includes('frontlight')) tipoVantagem = 'rodovias de alto tráfego, alcance veicular';

  let geoCtx = '';
  if (geoProfile) {
    geoCtx = `\nLOCALIZAÇÃO: Bairro tipo "${geoProfile.neighborhood_label || geoProfile.neighborhood_type}", nível socioeconômico ${geoProfile.socioeconomic_level || 'n/a'}, densidade ${geoProfile.urban_density || 'n/a'}, atividade dominante: ${geoProfile.dominant_activity || 'n/a'}.`;
    if (geoProfile.audience_narrative) geoCtx += ` ${geoProfile.audience_narrative}`;
  }

  let censusCtx = '';
  if (census) {
    const perfis = [];
    if (Number(census.perfil_alta_renda) > 0.3) perfis.push('alta renda');
    if (Number(census.perfil_massa_varejo) > 0.3) perfis.push('massa/varejo');
    if (Number(census.perfil_jovem_universitario) > 0.3) perfis.push('jovem universitário');
    if (Number(census.perfil_terceira_idade) > 0.3) perfis.push('terceira idade');
    censusCtx = `\nPERFIL DEMOGRÁFICO: ${census.perfil_dominante || 'misto'}${perfis.length ? ` (destaque: ${perfis.join(', ')})` : ''}, score geral ${Number(census.score_geral || 0).toFixed(1)}.`;
  }

  let entornoCtx = '';
  if (entorno?.length) {
    entornoCtx = `\nENTORNO COMERCIAL: ${entorno.slice(0, 4).map(e => `${e.segmento_analisado} (${e.total_estabelecimentos_relacionados} estabelecimentos, relevância ${Number(e.score_relevancia || 0).toFixed(1)})`).join('; ')}.`;
  }

  return `Você é consultor sênior de mídia DOOH. Analise este ponto com dados reais e crie argumentos comerciais específicos.

PONTO DE MÍDIA: ${point.nome}
- Formato: ${point.tipo}
- Cidade: ${point.cidade}
- Preço: R$${fmt(point.preco)}/mês
- Fluxo: ${fmt(point.fluxo)} impactos/mês
- CPM: R$${cpm.toFixed(2)} (${cpmClass})
- Score: ${Number(point.score_base || 0).toFixed(1)}/10
- Vantagem do formato: ${tipoVantagem || 'mídia digital'}${geoCtx}${censusCtx}${entornoCtx}

Crie uma análise comercial ESPECÍFICA para o ponto "${point.nome}" usando os dados acima. Mencione o nome, cidade, valores e fluxo reais.

HEADLINE: frase de venda para ${point.nome} em ${point.cidade}, cite o fluxo de ${fmt(point.fluxo)} impactos
NARRATIVA: por que anunciar no ${point.nome} é uma boa decisão, cite CPM R$${cpm.toFixed(2)} e dados do entorno
ARGUMENTO1: argumento sobre o alcance de ${fmt(point.fluxo)} impactos/mês nesta localização
ARGUMENTO2: argumento sobre eficiência do CPM R$${cpm.toFixed(2)} comparado ao mercado
ARGUMENTO3: argumento sobre o perfil do público que circula nesta região
PUBLICO1: segmento ideal de anunciante para este ponto, baseado no entorno
PUBLICO2: segundo segmento ideal
DESTAQUE: a vantagem competitiva única do ${point.nome}`;
}

/**
 * Parse text-marker format from LLM into structured object.
 */
function parsePointInsightText(text) {
  const MARKERS = ['HEADLINE', 'NARRATIVA', 'ARGUMENTO1', 'ARGUMENTO2', 'ARGUMENTO3', 'PUBLICO1', 'PUBLICO2', 'DESTAQUE'];
  const get = (key) => {
    const allKeys = MARKERS.join('|');
    const re = new RegExp(`${key}:\\s*([\\s\\S]*?)(?=(?:${allKeys}):|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].replace(/\n+/g, ' ').trim() : '';
  };
  const headline = get('HEADLINE');
  const narrativa = get('NARRATIVA');
  const args = [get('ARGUMENTO1'), get('ARGUMENTO2'), get('ARGUMENTO3')].filter(Boolean);
  const publico = [get('PUBLICO1'), get('PUBLICO2')].filter(Boolean);
  const destaque = get('DESTAQUE');
  if (!headline && !narrativa) return null;
  return { headline, narrativa, argumentos: args, publico_ideal: publico, destaque };
}

/**
 * Parse text-marker format for /generate endpoint.
 */
function parseGenerateText(text) {
  const MARKERS = ['HEADLINE', 'DESCRICAO', 'DESCRIÇÃO', 'FORTE1', 'FORTE2', 'FORTE3'];
  const get = (key) => {
    const allKeys = MARKERS.join('|');
    const re = new RegExp(`${key}:\\s*([\\s\\S]*?)(?=(?:${allKeys}):|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].replace(/\n+/g, ' ').trim() : '';
  };
  const headline = get('HEADLINE');
  const descricao = get('DESCRICAO') || get('DESCRIÇÃO');
  const fortes = [get('FORTE1'), get('FORTE2'), get('FORTE3')].filter(Boolean);
  if (!headline && !descricao) return null;
  return { headline, descricao, pontos_fortes: fortes };
}

/**
 * Build prompt for full campaign analysis.
 * Uses all enrichment data sent by the frontend CampaignPlanner.
 */
function buildCampaignAnalysisPrompt(campaignData, cityStats) {
  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
  const fmtDec = (n, d = 2) => Number(n || 0).toFixed(d);

  const cidade = campaignData.cidade || 'sua cidade';
  const segmento = campaignData.segmento || 'Geral';
  const objetivo = campaignData.objetivo || 'awareness';
  const empresa = campaignData.empresa || 'cliente';
  const publico = campaignData.publico || '';
  const pontosSel = Number(campaignData.pontos_selecionados || campaignData.pontos?.length || 0);
  const formatos = campaignData.formatos || [];
  const fluxoTotal = Number(campaignData.fluxo_total || campaignData.fluxoTotal || 0);
  const investimento = Number(campaignData.investimento || 0);
  const cpm = Number(campaignData.cpm || 0);
  const alcancePct = Number(campaignData.alcance_pct || campaignData.coberturaPct || 0);
  const frequencia = Number(campaignData.frequencia || 0);

  // Points summary
  let pontosSummary = '';
  if (campaignData.pontos?.length) {
    pontosSummary = campaignData.pontos.slice(0, 5).map(p =>
      `${p.nome} (${p.tipo}, ${fmt(p.fluxo)} impactos/mês)`
    ).join('; ');
  }

  // Identify real strengths from the data
  const strengths = [];
  if (cpm <= 15) strengths.push(`CPM de R$${fmtDec(cpm)} — altamente eficiente para DOOH`);
  else if (cpm <= 30) strengths.push(`CPM de R$${fmtDec(cpm)} — dentro da faixa competitiva do mercado`);
  if (fluxoTotal >= 100000) strengths.push(`${fmt(fluxoTotal)} impactos/mês — alto volume de exposição`);
  else if (fluxoTotal >= 30000) strengths.push(`${fmt(fluxoTotal)} impactos/mês de exposição da marca`);
  if (formatos.length >= 3) strengths.push(`${formatos.length} formatos diferentes — mix de mídia diversificado`);
  else if (formatos.length >= 2) strengths.push(`Mix de ${formatos.join(' e ')} — complementaridade de formatos`);
  if (frequencia >= 2) strengths.push(`Frequência de ${fmtDec(frequencia, 1)}x — reforço de memória efetivo`);
  if (pontosSel >= 5) strengths.push(`${pontosSel} pontos estratégicos selecionados em ${cidade}`);

  const strengthsBlock = strengths.length ? `\nDESTAQUES POSITIVOS: ${strengths.join('. ')}.` : '';

  // AI decision context (when AI selected the points)
  let aiDecisionBlock = '';
  if (campaignData._aiStrategy) {
    aiDecisionBlock = `\nDECISÃO DA IA: ${campaignData._aiStrategy}`;
    if (campaignData._pointRoles) {
      const roles = campaignData._pointRoles;
      const premiums = Object.entries(roles).filter(([, r]) => r === 'premium').map(([id]) => id);
      const supports = Object.entries(roles).filter(([, r]) => r === 'support').map(([id]) => id);
      const coverages = Object.entries(roles).filter(([, r]) => r === 'coverage').map(([id]) => id);
      const parts = [];
      if (premiums.length) parts.push(`Premium: ${premiums.length} ponto(s)`);
      if (supports.length) parts.push(`Suporte: ${supports.length} ponto(s)`);
      if (coverages.length) parts.push(`Cobertura: ${coverages.length} ponto(s)`);
      if (parts.length) aiDecisionBlock += `\nRoles dos pontos: ${parts.join(', ')}`;
    }
  }

  return `Você é um consultor de mídia DOOH escrevendo uma análise COMERCIAL para apresentar ao cliente ${empresa}.
Tom: POSITIVO, PROFISSIONAL, VENDEDOR. Destaque o valor e os benefícios da campanha. NÃO critique.

CAMPANHA:
${empresa} em ${cidade}, segmento ${segmento}
Objetivo: ${objetivo}, Público: ${publico || 'geral'}
${pontosSel} pontos, formatos: ${formatos.length ? formatos.join(', ') : 'variados'}
Investimento: R$${fmt(investimento)}/mês → ${fmt(fluxoTotal)} impactos/mês
CPM: R$${fmtDec(cpm)}, Alcance: ${fmtDec(alcancePct, 1)}%, Frequência: ${fmtDec(frequencia, 1)}x${strengthsBlock}${aiDecisionBlock}
${pontosSummary ? `Pontos: ${pontosSummary}` : ''}

Responda EXATAMENTE neste formato (cada tag DEVE iniciar uma nova linha):

RESUMO: [2-3 frases vendedoras sobre a campanha de ${empresa} em ${cidade}. Cite R$${fmt(investimento)} de investimento e ${fmt(fluxoTotal)} impactos. Tom entusiasmado mas profissional.]
FORTE1: [principal vantagem competitiva desta campanha, cite um dado real]
FORTE2: [segundo benefício concreto, cite um dado real diferente do FORTE1]
OPORTUNIDADE1: [sugestão de como ampliar os resultados, tom de upsell positivo]
OPORTUNIDADE2: [segunda sugestão de expansão ou otimização]
ESTRATEGIA: [recomendação estratégica para ${objetivo} no segmento ${segmento} em ${cidade}, 2-3 frases]

REGRAS:
- Tom SEMPRE positivo e comercial. Nunca use palavras negativas (baixo, fraco, ruim, insuficiente).
- Cada tag deve ter conteúdo DIFERENTE e ÚNICO.
- Use dados reais fornecidos nos números.
- Oportunidades são sugestões de EXPANSÃO, não críticas.`;
}

/**
 * Build a high-quality algorithmic campaign analysis (no LLM needed).
 * Used as fallback when LLM fails or produces poor output.
 * Generates commercially appealing text using real campaign data.
 */
function buildAlgorithmicAnalysis(campaignData) {
  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
  const fmtDec = (n, d = 2) => Number(n || 0).toFixed(d);

  const cidade = campaignData.cidade || 'sua cidade';
  const segmento = campaignData.segmento || 'Geral';
  const objetivo = campaignData.objetivo || 'awareness';
  const empresa = campaignData.empresa || 'cliente';
  const pontosSel = Number(campaignData.pontos_selecionados || campaignData.pontos?.length || 0);
  const formatos = campaignData.formatos || [];
  const fluxoTotal = Number(campaignData.fluxo_total || campaignData.fluxoTotal || 0);
  const investimento = Number(campaignData.investimento || 0);
  const cpm = Number(campaignData.cpm || 0);
  const alcancePct = Number(campaignData.alcance_pct || campaignData.coberturaPct || 0);
  const frequencia = Number(campaignData.frequencia || 0);

  const SEGMENTO_LABELS = {
    clinica: 'Clínicas e Saúde', hospital: 'Hospitais', escola: 'Escolas',
    faculdade: 'Ensino Superior', construtora: 'Construtoras', imobiliaria: 'Imobiliárias',
    varejo: 'Varejo', restaurante: 'Gastronomia', automotivo: 'Automotivo',
    fitness: 'Fitness e Bem-estar', beleza: 'Beleza e Estética', pet: 'Pet',
    farmacia: 'Farmácias', supermercado: 'Supermercados', governo: 'Governo',
    turismo: 'Turismo', tecnologia: 'Tecnologia', servicos: 'Serviços',
  };

  const OBJETIVO_PHRASES = {
    'reconhecimento de marca': 'construir reconhecimento de marca com alto impacto visual',
    'presenca premium': 'posicionar a marca em ambientes premium de alta circulação',
    'cobertura regional': 'cobrir estrategicamente múltiplas regiões com presença simultânea',
    'proximidade da decisao de compra': 'impactar consumidores no momento mais próximo da decisão de compra',
    'lembranca continua': 'manter presença contínua na rotina do público-alvo',
  };

  const segLabel = SEGMENTO_LABELS[segmento] || segmento;
  const objPhrase = OBJETIVO_PHRASES[objetivo] || `alcançar o objetivo de ${objetivo}`;

  // CPM classification (always positive phrasing)
  let cpmPhrase;
  if (cpm <= 8) cpmPhrase = `CPM de apenas R$${fmtDec(cpm)}, um dos mais eficientes do mercado DOOH`;
  else if (cpm <= 18) cpmPhrase = `CPM competitivo de R$${fmtDec(cpm)}, garantindo excelente custo-benefício`;
  else if (cpm <= 35) cpmPhrase = `CPM de R$${fmtDec(cpm)}, alinhado com a média do mercado para os formatos selecionados`;
  else cpmPhrase = `investimento premium de R$${fmtDec(cpm)} por mil impactos, com foco em posicionamento de alto valor`;

  // Flux classification
  let fluxPhrase;
  if (fluxoTotal >= 500000) fluxPhrase = `impressionantes ${fmt(fluxoTotal)} impactos mensais, garantindo alta visibilidade`;
  else if (fluxoTotal >= 100000) fluxPhrase = `${fmt(fluxoTotal)} impactos mensais, assegurando exposição consistente da marca`;
  else if (fluxoTotal >= 30000) fluxPhrase = `${fmt(fluxoTotal)} impactos mensais direcionados ao público-alvo`;
  else fluxPhrase = `${fmt(fluxoTotal)} impactos mensais em pontos de alta afinidade com o público`;

  // Format phrase
  let fmtPhrase;
  if (formatos.length >= 3) fmtPhrase = `A diversidade de ${formatos.length} formatos (${formatos.join(', ')}) cria um mix de mídia completo que impacta o público em diferentes momentos do dia`;
  else if (formatos.length === 2) fmtPhrase = `A combinação de ${formatos.join(' e ')} oferece complementaridade — cobrindo diferentes contextos de exposição do público`;
  else if (formatos.length === 1) fmtPhrase = `O formato ${formatos[0]} foi selecionado estrategicamente por sua alta afinidade com o segmento de ${segLabel}`;
  else fmtPhrase = `Os formatos selecionados foram otimizados para maximizar o impacto no segmento de ${segLabel}`;

  // Resumo
  const resumo = `O plano de mídia DOOH para ${empresa} em ${cidade} foi desenhado para ${objPhrase}. Com investimento de R$${fmt(investimento)}/mês distribuído em ${pontosSel} pontos estratégicos, a campanha projeta ${fluxPhrase}.`;

  // Pontos fortes (pick the 2 best real strengths)
  const fortes = [];
  if (cpm <= 25) {
    fortes.push(`Eficiência de investimento: ${cpmPhrase}, permitindo que cada real investido gere o máximo de exposição para ${empresa}.`);
  } else {
    fortes.push(`Posicionamento premium: os pontos selecionados estão em locais de alto valor que reforçam o posicionamento de ${empresa} no segmento de ${segLabel}.`);
  }
  fortes.push(`${fmtPhrase}, maximizando as chances de ${objetivo === 'reconhecimento de marca' ? 'fixação da marca na mente do consumidor' : objetivo === 'presenca premium' ? 'associação com ambientes de qualidade' : 'conversão e lembrança'}.`);

  // Oportunidades (positive upsell suggestions)
  const oportunidades = [];
  if (formatos.length <= 2 && pontosSel < 10) {
    oportunidades.push(`Ampliar o mix com formatos complementares pode aumentar o alcance em até 40%, impactando o público em novos contextos ao longo do dia.`);
  } else {
    oportunidades.push(`Estender a campanha para períodos maiores pode fortalecer a frequência de exposição e consolidar a lembrança da marca junto ao público de ${cidade}.`);
  }
  if (alcancePct < 20) {
    oportunidades.push(`Adicionar pontos em bairros complementares pode expandir significativamente a cobertura geográfica e atingir novas audiências potenciais.`);
  } else {
    oportunidades.push(`Com a base sólida atual, integrar a campanha DOOH com ações digitais (QR codes, redes sociais) pode potencializar o retorno sobre o investimento.`);
  }

  // Estratégia
  const estrategia = `Para ${segLabel} em ${cidade}, recomendamos manter a presença contínua nos ${pontosSel} pontos selecionados, priorizando horários de pico para maximizar o ${frequencia >= 2 ? `ritmo de frequência atual de ${fmtDec(frequencia, 1)}x` : 'contato com o público-alvo'}. A combinação de localização estratégica e volume de ${fmt(fluxoTotal)} impactos/mês posiciona ${empresa} com destaque frente à concorrência no mercado local.`;

  return {
    avaliacao: 'Estratégica',
    resumo_executivo: resumo,
    pontos_fortes: fortes,
    oportunidades_melhoria: oportunidades,
    argumentacao_comercial: [],
    estrategia_recomendada: estrategia,
    _source: 'algorithmic',
  };
}

/**
 * Parse text-marker format for campaign analysis.
 */
function parseCampaignAnalysisText(text) {
  // Markers the model should output — order matters for between-marker extraction
  const MARKERS = ['AVALIACAO', 'AVALIAÇÃO', 'RESUMO', 'FORTE1', 'FORTE2', 'OPORTUNIDADE1', 'OPORTUNIDADE2', 'ARGUMENTO1', 'ARGUMENTO2', 'ARGUMENTO3', 'ESTRATEGIA', 'ESTRATÉGIA'];
  const get = (key) => {
    // Try to capture text between this marker and the next marker (or end of string)
    const allKeys = MARKERS.join('|');
    const re = new RegExp(`${key}:\\s*([\\s\\S]*?)(?=(?:${allKeys}):|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].replace(/\n+/g, ' ').trim() : '';
  };
  const avaliacao = get('AVALIACAO') || get('AVALIAÇÃO');
  const resumo = get('RESUMO');
  const fortes = [get('FORTE1'), get('FORTE2')].filter(Boolean);
  const oportunidades = [get('OPORTUNIDADE1'), get('OPORTUNIDADE2')].filter(Boolean);
  const args = [get('ARGUMENTO1'), get('ARGUMENTO2'), get('ARGUMENTO3')].filter(Boolean);
  const estrategia = get('ESTRATEGIA') || get('ESTRATÉGIA');

  // If markers were found properly, return structured data
  if (resumo && (fortes.length || oportunidades.length)) {
    return {
      avaliacao: avaliacao || 'Boa',
      resumo_executivo: resumo,
      pontos_fortes: fortes,
      oportunidades_melhoria: oportunidades,
      argumentacao_comercial: args,
      estrategia_recomendada: estrategia,
    };
  }

  // Fallback: split prose into sections by paragraphs/sentences
  const clean = text.replace(/^(Resumo|Avalia[çc][ãa]o|An[aá]lise):\s*/i, '').trim();
  if (clean.length < 30) return null;

  // Split into paragraphs or sentences
  const paragraphs = clean.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 15);
  if (paragraphs.length === 0) return null;

  // First paragraph/section → resumo
  const resumoFallback = paragraphs[0];
  // Look for anything that looks like strengths/positives
  const fortesFromText = [];
  const oportFromText = [];
  const estratFromText = [];
  for (let i = 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const lower = p.toLowerCase();
    if (lower.includes('melhoria') || lower.includes('oportunidade') || lower.includes('sugir') || lower.includes('considerar') || lower.includes('aumentar') || lower.includes('reduzir')) {
      oportFromText.push(p.replace(/^[\d\-\.\)]+\s*/, ''));
    } else if (lower.includes('estratégia') || lower.includes('estrategia') || lower.includes('recomen') || lower.includes('ação')) {
      estratFromText.push(p);
    } else if (lower.includes('forte') || lower.includes('destaque') || lower.includes('positiv') || lower.includes('eficien') || lower.includes('alcance') || lower.includes('investimento')) {
      fortesFromText.push(p.replace(/^[\d\-\.\)]+\s*/, ''));
    }
  }

  // If we couldn't classify paragraphs, split sentences from the text
  if (fortesFromText.length === 0 && oportFromText.length === 0) {
    const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
    if (sentences.length >= 3) {
      return {
        avaliacao: avaliacao || 'Boa',
        resumo_executivo: sentences.slice(0, 3).join(' '),
        pontos_fortes: sentences.length > 3 ? [sentences[3]] : [sentences[1]],
        oportunidades_melhoria: sentences.length > 4 ? [sentences[4]] : [],
        argumentacao_comercial: [],
        estrategia_recomendada: sentences.length > 5 ? sentences[5] : '',
      };
    }
  }

  return {
    avaliacao: avaliacao || 'Boa',
    resumo_executivo: resumoFallback,
    pontos_fortes: fortesFromText.length ? fortesFromText.slice(0, 2) : (resumo ? [resumo] : [resumoFallback.slice(0, 200)]),
    oportunidades_melhoria: oportFromText.slice(0, 2),
    argumentacao_comercial: args,
    estrategia_recomendada: estratFromText.join(' ') || estrategia,
  };
}

/**
 * Build prompt for smart recommendation (which points to select).
 */
function buildRecommendationPrompt(params, enrichedPoints, cityStats) {
  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
  const top = enrichedPoints.slice(0, 12);

  const pointsTable = top.map((p, i) => {
    const cpm = Number(p.fluxo) > 0 ? (Number(p.preco) / (Number(p.fluxo) / 1000)) : 999;
    return `${i + 1}.[ID:${p.id}]${p.nome}(${p.tipo})Fluxo${fmt(p.fluxo)},R$${fmt(p.preco)},CPM${cpm.toFixed(1)},${p.perfil_dominante || 'n/a'},Score${Number(p.score_base || 0).toFixed(1)}`;
  }).join('\n');

  return `${getKnowledge()}

Selecione os melhores pontos DOOH para: ${params.cidade}, segmento ${params.segmento || 'Geral'}, objetivo ${params.objetivo || 'awareness'}, orçamento R$${fmt(params.budget || 0)}, máx ${params.maxPontos || 10} pontos, público ${params.publico || 'A/B'}.

Pontos disponíveis:
${pointsTable}

IMPORTANTE: Selecione IDs reais da lista acima. NÃO copie os exemplos.

Gere JSON puro (sem markdown):
{"pontos_recomendados":[liste os IDs numéricos selecionados],"estrategia":"escreva a lógica real da seleção","investimento_estimado":0,"fluxo_estimado":0,"porque_funciona":["escreva razão real 1","escreva razão real 2","escreva razão real 3"]}`;
}

// ── JSON parser helper ──────────────────────────────────────────────────────

function extractJSON(text) {
  try { return JSON.parse(text); } catch { /* continue */ }
  const blockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1].trim()); } catch { /* continue */ }
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* continue */ }
  }
  // Repair attempt: fix common LLM JSON errors
  const repaired = repairJSON(text);
  if (repaired) return repaired;
  return null;
}

/**
 * Attempt to repair broken JSON from small LLMs:
 * - unquoted keys (narrativa: → "narrativa":)
 * - missing commas between fields
 * - truncated JSON (add closing })
 * - newlines inside strings
 */
function repairJSON(text) {
  let raw = text.match(/\{[\s\S]*/)?.[0];
  if (!raw) return null;
  // Ensure it ends with }
  if (!raw.includes('}')) raw += '"}';
  raw = raw.replace(/\}\s*[\s\S]*$/, '}'); // keep only first object
  // Fix unquoted keys: word: → "word":
  raw = raw.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
  // Fix missing comma before "key":
  raw = raw.replace(/(["\d\]}])\s*\n\s*"/g, '$1,\n"');
  // Fix trailing comma before }
  raw = raw.replace(/,\s*\}/g, '}');
  // Fix newlines inside string values
  raw = raw.replace(/"([^"]*)\n([^"]*)"/g, (_, a, b) => `"${a} ${b}"`);
  // Truncated: if last string value has no closing quote, close it
  if ((raw.match(/"/g) || []).length % 2 !== 0) raw += '"';
  // Ensure closing brackets
  const opens = (raw.match(/\{/g) || []).length;
  const closes = (raw.match(/\}/g) || []).length;
  for (let i = closes; i < opens; i++) raw += '}';
  const arrOpens = (raw.match(/\[/g) || []).length;
  const arrCloses = (raw.match(/\]/g) || []).length;
  for (let i = arrCloses; i < arrOpens; i++) raw += ']';
  try { return JSON.parse(raw); } catch { /* continue */ }
  return null;
}

// ── Public API: Original endpoints ──────────────────────────────────────────

async function generateStructuredOutput(data, userId = null) {
  const inputStr = JSON.stringify(data);
  const inputHash = hashInput(inputStr);

  const cached = getCached(inputHash);
  if (cached) {
    console.log('[ai] cache HIT');
    return { ...extractJSON(cached.response), _source: 'cache', _model: cached.model };
  }

  const memories = getRelevantMemories(inputStr);
  const patterns = getTopPatterns(inputStr);
  const prompt = buildPrompt(data, memories, patterns);

  const result = await generateWithFallback(prompt);

  // Try text markers first, then JSON
  const parsed = parseGenerateText(result.text) || extractJSON(result.text);
  if (!parsed) {
    return {
      headline: '',
      descricao: result.text.slice(0, 2000),
      pontos_fortes: [],
      _source: 'raw',
      _model: result.model,
    };
  }

  setCache(inputHash, prompt, JSON.stringify(parsed), result.model, result.latency);
  saveMemory(inputStr, JSON.stringify(parsed), userId);

  return { ...parsed, _source: 'generated', _model: result.model };
}

async function analyzeInput(input, userId = null) {
  const inputHash = hashInput(input);

  const cached = getCached(inputHash);
  if (cached) {
    return { response: cached.response, _source: 'cache', _model: cached.model };
  }

  const memories = getRelevantMemories(input);
  const patterns = getTopPatterns(input);
  const prompt = buildAnalysisPrompt(input, memories, patterns);

  const result = await generateWithFallback(prompt);

  setCache(inputHash, prompt, result.text, result.model, result.latency);
  saveMemory(input, result.text, userId);

  return { response: result.text, _source: 'generated', _model: result.model };
}

// ── DOOH Intelligence: Point Insight ────────────────────────────────────────

/**
 * Generate AI-powered commercial insight for a single DOOH point.
 * Pulls all enrichment data (geo, census, entorno) and builds a rich prompt.
 */
async function generatePointInsight(pontoId, userId = null) {
  const point = getPointById(pontoId);
  if (!point) throw new Error('PONTO_NOT_FOUND');

  const cacheKey = `point_insight_${pontoId}`;
  const inputHash = hashInput(cacheKey);

  const cached = getCached(inputHash);
  if (cached) {
    console.log(`[ai] point insight cache HIT: ${pontoId}`);
    return { ...extractJSON(cached.response), _source: 'cache', _model: cached.model, ponto_id: pontoId };
  }

  const entorno = getPointEntorno(pontoId);
  const geoProfile = getPointGeoProfile(pontoId);
  const census = getPointCensus(pontoId);

  const memories = getRelevantMemories(point.nome + ' ' + point.cidade + ' ' + point.tipo);
  const patternsCtx = getTopPatterns(point.tipo + ' ' + (point.neighborhood_type || ''));

  const prompt = buildPointInsightPrompt(point, entorno, geoProfile, census);

  const result = await generateWithFallback(prompt);
  // Try text markers first (more reliable for small models), then JSON
  const parsed = parsePointInsightText(result.text) || extractJSON(result.text);

  if (!parsed) {
    return {
      headline: point.nome,
      narrativa: result.text.slice(0, 2000),
      argumentos: [],
      publico_ideal: [],
      destaque: '',
      _source: 'raw',
      _model: result.model,
      ponto_id: pontoId,
    };
  }

  setCache(inputHash, prompt, JSON.stringify(parsed), result.model, result.latency);
  saveMemory(`insight:${point.nome}`, JSON.stringify(parsed), userId, 'point_insight');

  return { ...parsed, _source: 'generated', _model: result.model, ponto_id: pontoId };
}

/**
 * Generate short commercial AI commentary for each point in a campaign.
 * Single LLM call for the whole batch — efficient and consistent tone.
 */
/**
 * Enrich a point with real geo/census/entorno data from the database.
 */
function enrichPointWithContext(pontoId) {
  const geo = getPointGeoProfile(pontoId);
  const census = getPointCensus(pontoId);
  const entorno = getPointEntorno(pontoId);
  return { geo, census, entorno };
}

/**
 * Build a concise context string from real point data for prompt injection.
 */
function buildPointContextString(p, ctx) {
  const parts = [];
  if (ctx.geo) {
    if (ctx.geo.neighborhood_label) parts.push(`Zona: ${ctx.geo.neighborhood_label}`);
    if (ctx.geo.socioeconomic_level) parts.push(`Nível socioeconômico: ${ctx.geo.socioeconomic_level}`);
    if (ctx.geo.dominant_activity) parts.push(`Atividade: ${ctx.geo.dominant_activity}`);
    if (ctx.geo.urban_density) parts.push(`Densidade: ${ctx.geo.urban_density}`);
  }
  if (ctx.census) {
    const labels = { alta_renda: 'Alta renda', massa_varejo: 'Massa/Varejo', jovem_universitario: 'Jovem universitário', terceira_idade: 'Terceira idade', misto: 'Perfil Misto' };
    if (ctx.census.perfil_dominante) parts.push(`Perfil demográfico: ${labels[ctx.census.perfil_dominante] || ctx.census.perfil_dominante}`);
    const perfilDetails = [];
    if (Number(ctx.census.perfil_alta_renda) > 0.25) perfilDetails.push(`${(Number(ctx.census.perfil_alta_renda) * 100).toFixed(0)}% alta renda`);
    if (Number(ctx.census.perfil_jovem_universitario) > 0.25) perfilDetails.push(`${(Number(ctx.census.perfil_jovem_universitario) * 100).toFixed(0)}% jovem/universitário`);
    if (Number(ctx.census.perfil_massa_varejo) > 0.25) perfilDetails.push(`${(Number(ctx.census.perfil_massa_varejo) * 100).toFixed(0)}% massa/varejo`);
    if (perfilDetails.length) parts.push(`Composição: ${perfilDetails.join(', ')}`);
  }
  if (ctx.entorno?.length) {
    const topEntorno = ctx.entorno.slice(0, 3).map(e => `${e.segmento_analisado} (${e.total_estabelecimentos_relacionados})`);
    parts.push(`Entorno comercial: ${topEntorno.join(', ')}`);
  }
  return parts.join(' | ');
}

async function generateCampaignPointInsights(params) {
  const { pontos, objetivo, segmento, cidade, empresa } = params;
  if (!pontos?.length) return {};

  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));

  // Enrich each point with real geo/census/entorno data from DB
  const enrichedPoints = pontos.slice(0, 10).map(p => {
    const ctx = enrichPointWithContext(p.id);
    return { ...p, _ctx: ctx, _ctxStr: buildPointContextString(p, ctx) };
  });

  // Check cache
  const ids = pontos.map(p => p.id).sort().join(',');
  const inputHash = hashInput(`batch_insights_v2_${ids}_${objetivo}_${segmento}`);
  const cached = getCached(inputHash);
  if (cached) {
    const cachedResult = extractJSON(cached.response);
    if (cachedResult) return { ...cachedResult, _source: 'cache' };
  }

  // Build point summaries with REAL contextual data
  const pointLines = enrichedPoints.map((p, i) => {
    const cpm = Number(p.fluxo) > 0 ? (Number(p.preco) / (Number(p.fluxo) / 1000)) : 0;
    let line = `${i + 1}. [ID:${p.id}] ${p.nome} — ${p.tipo}, ${p.cidade}, Fluxo ${fmt(p.fluxo)}/mês, R$${fmt(p.preco)}/mês, CPM R$${cpm.toFixed(1)}`;
    if (p._ctxStr) line += `\n   DADOS REAIS: ${p._ctxStr}`;
    return line;
  }).join('\n');

  const prompt = `Você é um consultor de mídia DOOH escrevendo justificativas comerciais para uma proposta.
Empresa: ${empresa || 'cliente'}, Cidade: ${cidade}, Segmento: ${segmento}, Objetivo: ${objetivo}

PONTOS DA CAMPANHA (com dados reais de localização e público):
${pointLines}

Para CADA ponto, escreva uma justificativa comercial de 2-3 frases explicando POR QUE este ponto é estratégico.
Use OBRIGATORIAMENTE os DADOS REAIS fornecidos (zona, nível socioeconômico, perfil demográfico, entorno comercial).
Exemplo: "Localizado em zona premium de alta renda, este ponto impacta diretamente o público A/B com 45.000 impactos mensais. A presença de clínicas e escritórios no entorno reforça a afinidade com o segmento."

REGRAS:
- Cite dados REAIS: nome da zona, nível socioeconômico, perfil demográfico, entorno, fluxo, CPM.
- NUNCA invente dados. Se não tem dado, foque no formato e fluxo.
- Tom positivo e comercial. Cada insight deve ser ÚNICO.

Responda SOMENTE com JSON puro:
{"insights":{"ID1":"justificativa do ponto 1","ID2":"justificativa do ponto 2"}}`;

  try {
    const result = await generateReplicateFirst(prompt);
    const parsed = extractJSON(result.text);

    if (parsed?.insights && typeof parsed.insights === 'object') {
      // Validate that insights reference real point IDs
      const validIds = new Set(pontos.map(p => String(p.id)));
      const validInsights = {};
      for (const [key, val] of Object.entries(parsed.insights)) {
        if (validIds.has(String(key)) && typeof val === 'string' && val.length > 20) {
          validInsights[String(key)] = val;
        }
      }
      if (Object.keys(validInsights).length > 0) {
        // Fill any missing points with algorithmic
        const algoFallback = buildAlgorithmicPointInsights(enrichedPoints, objetivo, segmento);
        for (const p of pontos) {
          if (!validInsights[String(p.id)] && algoFallback.insights[String(p.id)]) {
            validInsights[String(p.id)] = algoFallback.insights[String(p.id)];
          }
        }
        const response = { insights: validInsights, _source: 'generated', _model: result.model };
        setCache(inputHash, prompt, JSON.stringify(response), result.model, result.latency);
        return response;
      }
    }

    // If parse failed, generate algorithmic insights with real data
    return buildAlgorithmicPointInsights(enrichedPoints, objetivo, segmento);
  } catch (err) {
    console.warn('[ai] batch insights failed, using algorithmic:', err.message);
    return buildAlgorithmicPointInsights(enrichedPoints, objetivo, segmento);
  }
}

/**
 * Rich algorithmic per-point insights using real geo/census/entorno data.
 */
function buildAlgorithmicPointInsights(pontos, objetivo, segmento) {
  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));

  const TIPO_VANTAGENS = {
    'Painel LED': 'alta visibilidade 24h em via de grande circulação',
    'Elevador': 'público cativo com frequência de até 8x ao dia',
    'Tela Indoor': 'proximidade do ponto de venda, impactando na decisão de compra',
    'Backlight': 'grande formato iluminado em via arterial',
    'Frontlight': 'alto alcance veicular em rodovia de grande movimento',
  };

  const SOCIO_LABELS = {
    'alto': 'zona de alto padrão',
    'medio-alto': 'zona de padrão médio-alto',
    'medio': 'zona de padrão médio',
    'medio-baixo': 'zona residencial consolidada',
    'baixo': 'zona de alto fluxo popular',
  };

  const PERFIL_PHRASES = {
    alta_renda: 'público predominantemente A/B, com alto poder aquisitivo',
    massa_varejo: 'alto volume de público consumidor, ideal para varejo e serviços',
    jovem_universitario: 'perfil jovem e universitário, alta receptividade a marcas inovadoras',
    terceira_idade: 'público maduro e fiel, com forte poder de decisão',
    misto: 'perfil demográfico diversificado, ampla cobertura de audiência',
  };

  const OBJ_VERBS = {
    'reconhecimento de marca': 'fixar a marca na rotina do público local',
    'presenca premium': 'posicionar a marca em ambiente de alto padrão',
    'cobertura regional': 'ampliar a presença regional da campanha',
    'proximidade da decisao de compra': 'impactar consumidores próximos à decisão de compra',
    'lembranca continua': 'manter frequência consistente de exposição',
  };

  const objVerb = OBJ_VERBS[objetivo] || 'alcançar os objetivos da campanha';

  const insights = {};
  for (const p of pontos) {
    const cpm = Number(p.fluxo) > 0 ? (Number(p.preco) / (Number(p.fluxo) / 1000)) : 0;
    const tipoLabel = TIPO_VANTAGENS[p.tipo] || `formato ${p.tipo} com exposição qualificada`;
    const ctx = p._ctx || enrichPointWithContext(p.id);

    const sentences = [];

    // Sentence 1: Location + socioeconomic context
    if (ctx.geo?.neighborhood_label && ctx.geo?.socioeconomic_level) {
      const socioLabel = SOCIO_LABELS[ctx.geo.socioeconomic_level] || `zona ${ctx.geo.socioeconomic_level}`;
      sentences.push(`Localizado em ${ctx.geo.neighborhood_label}, ${socioLabel} de ${p.cidade}, com ${tipoLabel}.`);
    } else if (ctx.geo?.neighborhood_label) {
      sentences.push(`Posicionado na região ${ctx.geo.neighborhood_label} de ${p.cidade}, com ${tipoLabel}.`);
    } else {
      sentences.push(`Ponto estratégico em ${p.cidade} com ${tipoLabel}, gerando ${fmt(p.fluxo)} impactos/mês.`);
    }

    // Sentence 2: Audience profile
    if (ctx.census?.perfil_dominante) {
      const perfilPhrase = PERFIL_PHRASES[ctx.census.perfil_dominante] || `perfil ${ctx.census.perfil_dominante}`;
      const pctHighest = Math.max(
        Number(ctx.census.perfil_alta_renda || 0),
        Number(ctx.census.perfil_massa_varejo || 0),
        Number(ctx.census.perfil_jovem_universitario || 0),
        Number(ctx.census.perfil_terceira_idade || 0),
      );
      if (pctHighest > 0.35) {
        sentences.push(`A região concentra ${perfilPhrase} (${(pctHighest * 100).toFixed(0)}%), reforçando a afinidade com o segmento.`);
      } else {
        sentences.push(`O entorno apresenta ${perfilPhrase}, contribuindo para ${objVerb}.`);
      }
    } else if (cpm <= 18) {
      sentences.push(`Com CPM de R$${cpm.toFixed(1)}, oferece excelente custo-benefício para ${objVerb}.`);
    } else {
      sentences.push(`Com ${fmt(p.fluxo)} impactos mensais, garante volume de exposição consistente para ${objVerb}.`);
    }

    // Sentence 3: Entorno (if available)
    if (ctx.entorno?.length >= 2) {
      const topSegmentos = ctx.entorno.slice(0, 2).map(e => e.segmento_analisado);
      const totalEstab = ctx.entorno.reduce((s, e) => s + Number(e.total_estabelecimentos_relacionados || 0), 0);
      sentences.push(`O entorno comercial inclui ${topSegmentos.join(' e ')} (${totalEstab} estabelecimentos), potencializando o alcance.`);
    }

    insights[String(p.id)] = sentences.join(' ');
  }

  return { insights, _source: 'algorithmic', _model: 'algorithmic' };
}

// ── DOOH Intelligence: Campaign Analysis ────────────────────────────────────

/**
 * AI-powered analysis of a full campaign (selected points + budget + objective).
 */
/**
 * Validate LLM analysis quality. Returns true if output is usable for clients.
 */
function isAnalysisQualityOk(analysis) {
  if (!analysis?.resumo_executivo || analysis.resumo_executivo.length < 50) return false;
  if (!analysis.pontos_fortes?.length) return false;

  // Detect repetition: if pontos_fortes repeats the resumo almost verbatim
  const resumoNorm = (analysis.resumo_executivo || '').toLowerCase().slice(0, 80);
  for (const pf of analysis.pontos_fortes) {
    if (pf.toLowerCase().slice(0, 80) === resumoNorm) return false;
  }

  // Detect negative/critical tone in what should be a sales document
  const allText = [
    analysis.resumo_executivo,
    ...(analysis.pontos_fortes || []),
    analysis.estrategia_recomendada || '',
  ].join(' ').toLowerCase();

  const negativeWords = ['fraco', 'baixa performance', 'insuficiente', 'ruim', 'problemátic', 'preocupante', 'ineficiente', 'deficiente'];
  const negativeCount = negativeWords.filter(w => allText.includes(w)).length;
  if (negativeCount >= 2) return false;

  return true;
}

async function analyzeCampaign(campaignData, userId = null) {
  const inputStr = JSON.stringify({
    cidade: campaignData.cidade,
    segmento: campaignData.segmento,
    objetivo: campaignData.objetivo,
    empresa: campaignData.empresa,
    pontos_count: campaignData.pontos_selecionados || campaignData.pontos?.length || 0,
    investimento: campaignData.investimento,
    cpm: campaignData.cpm,
    score: campaignData.score,
    alcance_pct: campaignData.alcance_pct,
    ai_strategy: campaignData._aiStrategy || '',
  });
  const inputHash = hashInput('campaign_v4_' + inputStr);

  const cached = getCached(inputHash);
  if (cached) {
    const cachedResult = extractJSON(cached.response);
    if (cachedResult && isAnalysisQualityOk(cachedResult)) {
      return { ...cachedResult, _source: 'cache', _model: cached.model };
    }
  }

  const cityStats = getCityStats(campaignData.cidade);
  const prompt = buildCampaignAnalysisPrompt(campaignData, cityStats);

  // Try LLM with Replicate-first chain (70B → 8B → local)
  let parsed = null;
  let resultModel = null;

  try {
    const result = await generateReplicateFirst(prompt);
    resultModel = result.model;
    parsed = parseCampaignAnalysisText(result.text) || extractJSON(result.text);

    // Quality gate: if LLM output is repetitive/negative, discard it
    if (parsed && !isAnalysisQualityOk(parsed)) {
      console.warn(`[ai] LLM output failed quality check (${resultModel}), using algorithmic fallback`);
      parsed = null;
    }
  } catch (err) {
    console.warn(`[ai] all LLM providers failed for campaign analysis: ${err.message}`);
  }

  // Fallback: generate high-quality algorithmic analysis from real data
  if (!parsed) {
    parsed = buildAlgorithmicAnalysis(campaignData);
    resultModel = 'algorithmic';
  }

  parsed._model = resultModel;
  parsed._source = parsed._source || 'generated';

  setCache(inputHash, prompt, JSON.stringify(parsed), resultModel, 0);
  saveMemory(inputStr, JSON.stringify(parsed), userId, 'campaign_analysis');

  return parsed;
}

// ── DOOH Intelligence: Smart Recommendation ─────────────────────────────────

/**
 * AI-powered point selection recommendation.
 * Uses enriched data + LLM to suggest the best points for a briefing.
 */
async function smartRecommendation(params, userId = null) {
  const { cidade, segmento, objetivo, budget, maxPontos, publico } = params;
  if (!cidade) throw new Error('CIDADE_REQUIRED');

  const inputStr = JSON.stringify({ cidade, segmento, objetivo, budget, maxPontos, publico });
  const inputHash = hashInput('recommend_' + inputStr);

  const cached = getCached(inputHash);
  if (cached) {
    return { ...extractJSON(cached.response), _source: 'cache', _model: cached.model };
  }

  const enriched = getEnrichedPoints(cidade);
  if (!enriched.length) {
    return { pontos_recomendados: [], estrategia: 'Nenhum ponto disponível nesta cidade.', _source: 'empty' };
  }

  const cityStats = getCityStats(cidade);
  const prompt = buildRecommendationPrompt(params, enriched, cityStats);

  const result = await generateWithFallback(prompt);
  const parsed = extractJSON(result.text);

  if (!parsed || !parsed.pontos_recomendados) {
    // Fallback: return top-N by score
    const topN = enriched.slice(0, maxPontos || 10);
    return {
      pontos_recomendados: topN.map(p => p.id),
      estrategia: 'Seleção automática baseada em score composto (fallback).',
      pontos: topN.map(p => ({ id: p.id, nome: p.nome, tipo: p.tipo, preco: p.preco, fluxo: p.fluxo, score_base: p.score_base })),
      _source: 'fallback',
      _model: result.model,
    };
  }

  // Enrich the AI response with full point data
  const selectedIds = new Set(parsed.pontos_recomendados.map(Number));
  const selectedPoints = enriched.filter(p => selectedIds.has(Number(p.id)));
  const totalInvestimento = selectedPoints.reduce((s, p) => s + (Number(p.preco) || 0), 0);
  const totalFluxo = selectedPoints.reduce((s, p) => s + (Number(p.fluxo) || 0), 0);

  const response = {
    ...parsed,
    pontos: selectedPoints.map(p => ({
      id: p.id,
      nome: p.nome,
      cidade: p.cidade,
      tipo: p.tipo,
      preco: p.preco,
      fluxo: p.fluxo,
      publico: p.publico,
      score_base: p.score_base,
      neighborhood_type: p.neighborhood_type,
      perfil_dominante: p.perfil_dominante,
    })),
    resumo: {
      total_pontos: selectedPoints.length,
      investimento: totalInvestimento,
      fluxo_total: totalFluxo,
      cpm: totalFluxo > 0 ? totalInvestimento / (totalFluxo / 1000) : 0,
    },
  };

  setCache(inputHash, prompt, JSON.stringify(response), result.model, result.latency);
  saveMemory(inputStr, JSON.stringify(response), userId, 'recommendation');

  return { ...response, _source: 'generated', _model: result.model };
}

/**
 * AI-powered score optimization via targeted point swaps.
 * Identifies the weakest score pillar and asks the LLM to suggest 1-2 swaps.
 */
async function optimizeScore(params) {
  const { cidade, selectedPointIds, weakestPillar, scoreBreakdown, budget, objetivo, segmento } = params;

  const pillarLabels = {
    qualidade: 'Qualidade dos Pontos', alcance: 'Alcance',
    frequencia: 'Frequência', eficiencia: 'Eficiência de Custo',
    cobertura: 'Cobertura Estratégica',
  };

  const enriched = getEnrichedPoints(cidade);
  if (!enriched.length) return { swaps: [], _source: 'empty' };

  const idSet = new Set(selectedPointIds.map(Number));
  const selected = enriched.filter(p => idSet.has(Number(p.id)));
  const unselected = enriched.filter(p => !idSet.has(Number(p.id))).slice(0, 10);

  if (!selected.length || !unselected.length) return { swaps: [], _source: 'insufficient' };

  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
  const fmtDec = (n, d = 2) => Number(n || 0).toFixed(d);

  const selectedTable = selected.map(p =>
    `ID:${p.id} ${p.nome} (${p.tipo}) Fluxo:${fmt(p.fluxo)} R$${fmt(p.preco)} Score:${fmtDec(p.score_base, 0)}`
  ).join('\n');

  const unselectedTable = unselected.map(p =>
    `ID:${p.id} ${p.nome} (${p.tipo}) Fluxo:${fmt(p.fluxo)} R$${fmt(p.preco)} Score:${fmtDec(p.score_base, 0)}`
  ).join('\n');

  const breakdownStr = Object.entries(scoreBreakdown || {})
    .filter(([k]) => k !== 'boost')
    .map(([k, v]) => `${pillarLabels[k] || k}: ${fmtDec(v, 1)}/10`)
    .join(', ');

  const prompt = `Você é um especialista em mídia DOOH. Uma campanha de ${segmento} com objetivo "${objetivo}" em ${cidade} tem score baixo.

SCORE ATUAL: ${breakdownStr}
PILAR MAIS FRACO: ${pillarLabels[weakestPillar] || weakestPillar}
ORÇAMENTO: R$${fmt(budget)}/mês

PONTOS ATUAIS DA CAMPANHA:
${selectedTable}

PONTOS DISPONÍVEIS PARA TROCA:
${unselectedTable}

Sugira 1 ou 2 trocas para melhorar o pilar "${pillarLabels[weakestPillar] || weakestPillar}".
${weakestPillar === 'alcance' || weakestPillar === 'frequencia' ? 'Priorize pontos com MAIOR fluxo.' : ''}
${weakestPillar === 'eficiencia' ? 'Priorize pontos com MENOR preço e bom fluxo (menor CPM).' : ''}
${weakestPillar === 'cobertura' ? 'Priorize pontos com formato DIFERENTE dos atuais.' : ''}

Responda SOMENTE com JSON:
{"swaps":[{"remove_id":NUMBER,"add_id":NUMBER,"reason":"texto curto"}]}`;

  try {
    const result = await generateWithFallback(prompt);
    const parsed = extractJSON(result.text);

    if (parsed?.swaps?.length) {
      return { swaps: parsed.swaps, _source: 'generated', _model: result.model };
    }

    return { swaps: [], _source: 'parse_failed', _model: result.model };
  } catch (err) {
    return { swaps: [], _source: 'error', _error: err.message };
  }
}

// ── Prompt versioning ─────────────────────────────────────────────────────────
const PROMPT_VERSION = { decision: 'decision_v1', narrative: 'narrative_v1' };

// ── AI Plan Decision — IA como cérebro do planejador ──────────────────────────

/**
 * Build the decision prompt: structured briefing + enriched points for LLM.
 */
function buildDecisionPrompt(campaign, enrichedPoints) {
  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
  const maxPts = Math.min(30, enrichedPoints.length);
  const pts = enrichedPoints.slice(0, maxPts);

  const pointsTable = pts.map((p, i) => {
    const cpm = Number(p.fluxo) > 0 ? (Number(p.preco) / (Number(p.fluxo) / 1000)) : 999;
    const ctx = enrichPointWithContext(p.id);
    const ctxStr = buildPointContextString(p, ctx);
    return `${i + 1}.[ID:${p.id}]${p.nome}(${p.tipo})F:${fmt(p.fluxo)},R$${fmt(p.preco)},CPM:${cpm.toFixed(1)},${p.perfil_dominante || 'n/a'},Score:${Number(p.score_base || 0).toFixed(1)}${ctxStr ? '|' + ctxStr : ''}`;
  }).join('\n');

  const minPts = Math.max(3, Math.min(pts.length, Math.ceil((campaign.budget || 5000) / 3000)));
  const maxSelect = Math.min(14, pts.length);

  return `${DOOH_KNOWLEDGE}

BRIEFING DA CAMPANHA:
- Empresa: ${campaign.company || 'Não informada'}
- Objetivo: ${campaign.objective || 'awareness'}
- Orçamento mensal: R$${fmt(campaign.budget || 0)}
- Duração: ${campaign.duration_weeks || 4} semanas
- Região: ${campaign.region || 'Não especificada'}
- Público-alvo: ${campaign.target_audience || 'A/B'}
- Segmento: ${campaign.segment || 'Geral'}

PONTOS DISPONÍVEIS (${pts.length} pontos, dados reais do inventário):
${pointsTable}

TAREFA: Selecione os melhores pontos para esta campanha. Considere:
1. Equilíbrio entre alcance (fluxo alto) e eficiência (CPM baixo)
2. Diversidade de formatos (LED + Elevador + Indoor = melhor cobertura)
3. Cobertura geográfica (não concentrar tudo num bairro)
4. Adequação do perfil de audiência ao público-alvo
5. Respeitar o orçamento: investimento total <= R$${fmt(campaign.budget || 0)}

REGRAS:
- Selecione entre ${minPts} e ${maxSelect} pontos
- Use APENAS IDs da lista acima. NÃO invente IDs.
- Justifique cada ponto com dados reais (fluxo, CPM, perfil, entorno)
- Atribua role: "premium" (âncora da campanha, alto fluxo), "support" (complemento estratégico), "coverage" (expansão de cobertura)

Responda APENAS com JSON puro (sem markdown, sem texto antes ou depois):
{"strategy_summary":"explicação da estratégia em 2-3 frases","selected_points":[{"id":N,"reason":"justificativa com dados reais","role":"premium|support|coverage"}],"budget_used":N,"budget_remaining":N}`;
}

/**
 * Validate the AI plan decision output.
 * Returns { valid: true, cleaned } or { valid: false, reason }.
 */
function validateAIPlanDecision(parsed, availableIds, budget) {
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, reason: 'not_object' };
  }
  if (!Array.isArray(parsed.selected_points) || !parsed.selected_points.length) {
    return { valid: false, reason: 'no_selected_points' };
  }

  const validRoles = new Set(['premium', 'support', 'coverage']);
  const seenIds = new Set();
  const cleaned = [];

  for (const sp of parsed.selected_points) {
    const id = Number(sp.id);
    if (!id || !availableIds.has(id)) continue; // skip invalid IDs
    if (seenIds.has(id)) continue; // skip duplicates
    seenIds.add(id);
    cleaned.push({
      id,
      reason: String(sp.reason || '').slice(0, 300),
      role: validRoles.has(sp.role) ? sp.role : 'support',
    });
  }

  if (cleaned.length < 2) {
    return { valid: false, reason: 'too_few_points' };
  }
  if (cleaned.length > 14) {
    cleaned.length = 14; // cap at 14
  }

  // Budget check: compute actual cost from DB points
  const budgetUsed = Number(parsed.budget_used) || 0;
  if (budgetUsed > budget * 1.15) {
    return { valid: false, reason: 'budget_exceeded' };
  }

  return {
    valid: true,
    cleaned: {
      strategy_summary: String(parsed.strategy_summary || '').slice(0, 500),
      selected_points: cleaned,
      budget_used: budgetUsed,
      budget_remaining: Number(parsed.budget_remaining) || Math.max(0, budget - budgetUsed),
    },
  };
}

/**
 * AI Plan Decision — IA decides which points to select for a campaign.
 * Uses Replicate 70B (primary) with algorithmic fallback.
 */
async function aiPlanDecision(params, userId = null) {
  const { cidade, segmento, objetivo, budget, duration, publico, empresa, maxPontos } = params;
  if (!cidade) throw new Error('CIDADE_REQUIRED');

  const startTime = Date.now();
  const campaign = {
    objective: objetivo || 'awareness',
    budget: Number(budget) || 5000,
    duration_weeks: Number(duration) || 4,
    region: cidade,
    target_audience: publico || 'A/B',
    segment: segmento || 'Geral',
    company: empresa || '',
  };

  const inputStr = JSON.stringify({ ...campaign, v: PROMPT_VERSION.decision });
  const inputHash = hashInput('plan_decision_v1_' + inputStr);

  // Check cache
  const cached = getCached(inputHash);
  if (cached) {
    const cachedParsed = extractJSON(cached.response);
    if (cachedParsed?.selected_points) {
      console.log(JSON.stringify({
        event: 'ai_plan_decision', mode: 'cache', input_hash: inputHash,
        points_selected: cachedParsed.selected_points.length,
        timestamp: new Date().toISOString(),
      }));
      return { ...cachedParsed, mode: 'ai_decision', _source: 'cache', _model: cached.model };
    }
  }

  // Get enriched points
  const enriched = getEnrichedPoints(cidade);
  if (!enriched.length) {
    return { mode: 'rule_based', selected_points: [], strategy_summary: 'Nenhum ponto disponível.', _source: 'empty' };
  }

  const availableIds = new Set(enriched.map(p => Number(p.id)));
  const prompt = buildDecisionPrompt(campaign, enriched);

  // Call LLM (Replicate-first chain)
  let result;
  try {
    result = await generateReplicateFirst(prompt);
  } catch (err) {
    console.error('[ai-plan-decision] LLM chain failed:', err.message);
    console.log(JSON.stringify({
      event: 'ai_plan_decision', mode: 'rule_based', input_hash: inputHash,
      error: err.message, latency_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }));
    return { mode: 'rule_based', selected_points: [], _source: 'llm_failed', _error: err.message };
  }

  // Parse and validate
  const parsed = extractJSON(result.text);
  const validation = validateAIPlanDecision(parsed, availableIds, campaign.budget);

  if (!validation.valid) {
    console.log(JSON.stringify({
      event: 'ai_plan_decision', mode: 'rule_based', input_hash: inputHash,
      error: `validation_failed:${validation.reason}`, latency_ms: Date.now() - startTime,
      model: result.model, timestamp: new Date().toISOString(),
    }));
    return { mode: 'rule_based', selected_points: [], _source: `invalid_${validation.reason}`, _model: result.model };
  }

  // Enrich response with full point data
  const selectedIds = new Set(validation.cleaned.selected_points.map(sp => sp.id));
  const selectedPoints = enriched.filter(p => selectedIds.has(Number(p.id)));
  const actualBudget = selectedPoints.reduce((s, p) => s + (Number(p.preco) || 0), 0);
  const actualFluxo = selectedPoints.reduce((s, p) => s + (Number(p.fluxo) || 0), 0);

  // Build point roles map
  const pointRoles = {};
  const pointReasons = {};
  for (const sp of validation.cleaned.selected_points) {
    pointRoles[sp.id] = sp.role;
    pointReasons[sp.id] = sp.reason;
  }

  const response = {
    mode: 'ai_decision',
    strategy_summary: validation.cleaned.strategy_summary,
    selected_points: validation.cleaned.selected_points,
    point_roles: pointRoles,
    point_reasons: pointReasons,
    budget_used: actualBudget,
    budget_remaining: Math.max(0, campaign.budget - actualBudget),
    pontos: selectedPoints.map(p => ({
      id: p.id, nome: p.nome, cidade: p.cidade, tipo: p.tipo,
      preco: p.preco, fluxo: p.fluxo, publico: p.publico,
      score_base: p.score_base, neighborhood_type: p.neighborhood_type,
      perfil_dominante: p.perfil_dominante, endereco: p.endereco,
      lat: p.lat, lng: p.lng, insercoes: p.insercoes, telas: p.telas,
    })),
    resumo: {
      total_pontos: selectedPoints.length,
      investimento: actualBudget,
      fluxo_total: actualFluxo,
      cpm: actualFluxo > 0 ? actualBudget / (actualFluxo / 1000) : 0,
    },
  };

  const latencyMs = Date.now() - startTime;

  // Cache & memory
  setCache(inputHash, prompt, JSON.stringify(response), result.model, latencyMs);
  saveMemory(inputStr, JSON.stringify(response), userId, 'plan_decision');

  // Structured log
  console.log(JSON.stringify({
    event: 'ai_plan_decision', mode: 'ai_decision', input_hash: inputHash,
    points_selected: selectedPoints.length, budget_used: actualBudget,
    latency_ms: latencyMs, model: result.model,
    timestamp: new Date().toISOString(),
  }));

  return { ...response, _source: 'generated', _model: result.model, _latency_ms: latencyMs };
}

// ── Stats & health ──────────────────────────────────────────────────────────

function getMemoryStats() {
  try {
    const totalMemories = db.prepare(`SELECT COUNT(*) as c FROM ai_memory`).get();
    const positiveMemories = db.prepare(`SELECT COUNT(*) as c FROM ai_memory WHERE feedback > 0`).get();
    const negativeMemories = db.prepare(`SELECT COUNT(*) as c FROM ai_memory WHERE feedback < 0`).get();
    const totalPatterns = db.prepare(`SELECT COUNT(*) as c FROM ai_patterns`).get();
    const topPatterns = db.prepare(`SELECT pattern, score, usage_count FROM ai_patterns ORDER BY score DESC LIMIT 5`).all();
    const cacheSize = db.prepare(`SELECT COUNT(*) as c FROM ai_cache`).get();
    const recentMemories = db.prepare(
      `SELECT id, LEFT(input, 80) as input_preview, feedback, created_at
       FROM ai_memory ORDER BY created_at DESC LIMIT 10`
    ).all();

    return {
      memory: {
        total: Number(totalMemories?.c || 0),
        positive: Number(positiveMemories?.c || 0),
        negative: Number(negativeMemories?.c || 0),
      },
      patterns: {
        total: Number(totalPatterns?.c || 0),
        top: topPatterns,
      },
      cache: {
        size: Number(cacheSize?.c || 0),
      },
      recentMemories,
    };
  } catch (e) {
    console.error('[ai] stats failed:', e.message);
    return { memory: { total: 0 }, patterns: { total: 0 }, cache: { size: 0 } };
  }
}

async function healthCheck() {
  const status = { ollama: false, models: [], replicate: !!REPLICATE_API_TOKEN };

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      status.ollama = true;
      status.models = (data.models || []).map(m => m.name);
    }
  } catch { /* offline */ }

  return status;
}

module.exports = {
  generateLocal,
  generateWithFallback,
  generateReplicateFirst,
  generateWithReplicate,
  generateStructuredOutput,
  analyzeInput,
  generatePointInsight,
  analyzeCampaign,
  generateCampaignPointInsights,
  smartRecommendation,
  optimizeScore,
  updateFeedback,
  getMemoryStats,
  healthCheck,
  hashInput,
  getCached,
  setCache,
  aiPlanDecision,
  // Data access (for inventoryChat)
  getEnrichedPoints,
  getCityStats,
  getPointById,
  getClusters,
  getPointEntorno,
  getPointGeoProfile,
  getPointCensus,
  enrichPointWithContext,
  buildPointContextString,
  DOOH_KNOWLEDGE_COMPACT,
  saveMemory,
  getRelevantMemories,
};
