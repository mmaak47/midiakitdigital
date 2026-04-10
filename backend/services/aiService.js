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

function saveMemory(input, output, userId = null, context = null) {
  try {
    db.prepare(
      `INSERT INTO ai_memory (input, output, user_id, context)
       VALUES (?, ?, ?, ?)`
    ).run(input, output, userId, context);
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

async function generateLocal(prompt, model = OLLAMA_MODEL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const start = Date.now();

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 1024,
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

async function generateWithReplicate(prompt) {
  if (!REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_NOT_CONFIGURED');
  }

  const start = Date.now();

  try {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        version: 'meta/meta-llama-3-8b-instruct',
        input: {
          prompt,
          max_tokens: 1024,
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Replicate HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = Array.isArray(data.output) ? data.output.join('') : String(data.output || '');
    const latency = Date.now() - start;
    console.log(`[ai] replicate responded in ${latency}ms`);
    return { text, model: 'replicate:llama3-8b', latency };
  } catch (error) {
    console.error('[ai] replicate failed:', error.message);
    throw new Error(`REPLICATE_FAILED:${error.message}`);
  }
}

// ── Fallback chain ──────────────────────────────────────────────────────────

async function generateWithFallback(prompt) {
  // Try primary model (llama3)
  try {
    return await generateLocal(prompt, OLLAMA_MODEL);
  } catch (e1) {
    console.warn(`[ai] primary failed (${OLLAMA_MODEL}), trying fallback...`);

    // Try fallback model (mistral)
    try {
      return await generateLocal(prompt, OLLAMA_FALLBACK_MODEL);
    } catch (e2) {
      console.warn(`[ai] local fallback failed (${OLLAMA_FALLBACK_MODEL}), trying replicate...`);

      // Try Replicate
      try {
        return await generateWithReplicate(prompt);
      } catch (e3) {
        console.error('[ai] all providers failed');
        throw new Error('ALL_AI_PROVIDERS_FAILED');
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
  return `${getKnowledge()}
${buildMemoryBlock(memories, patterns)}
Com base nos dados abaixo, gere uma saída EXCLUSIVAMENTE em JSON válido (sem texto adicional, sem markdown):

DADOS DO PONTO/CAMPANHA:
${JSON.stringify(data, null, 2)}

REGRAS ABSOLUTAS:
- Seja comercial, direto e persuasivo
- Use os dados numéricos REAIS fornecidos — NUNCA invente números
- Linguagem profissional de mercado publicitário brasileiro
- Destaque os diferenciais que tornam este ponto/campanha único

IMPORTANTE: Gere conteúdo REAL e ESPECÍFICO. NÃO copie os exemplos, crie textos originais baseados nos dados.

Gere JSON puro (sem markdown):
{"headline":"escreva um título impactante sobre este ponto/campanha específico","descricao":"escreva 2-3 frases comerciais usando os dados reais acima","pontos_fortes":["escreva argumento real 1","escreva argumento real 2","escreva argumento real 3"]}`;
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

  let extra = '';
  if (geoProfile) {
    extra += ` Bairro: ${geoProfile.neighborhood_label || geoProfile.neighborhood_type}, nível ${geoProfile.socioeconomic_level || 'n/a'}.`;
  }
  if (census) {
    extra += ` Perfil: ${census.perfil_dominante || 'n/a'}.`;
  }
  if (entorno?.length) {
    extra += ` Entorno: ${entorno.slice(0, 3).map(e => `${e.segmento_analisado}(${e.total_estabelecimentos_relacionados})`).join(', ')}.`;
  }

  return `${getKnowledge()}

PONTO: ${point.nome} (${point.tipo}) em ${point.cidade}
Preço R$${fmt(point.preco)}/mês, Fluxo ${fmt(point.fluxo)}/mês, CPM R$${cpm.toFixed(2)}, Score ${Number(point.score_base || 0).toFixed(1)}.${extra}

Escreva uma análise comercial para este ponto DOOH. Use EXATAMENTE este formato:

HEADLINE: uma frase comercial impactante sobre este ponto
NARRATIVA: 2-3 frases para convencer um anunciante a investir neste ponto
ARGUMENTO1: primeiro argumento de venda real
ARGUMENTO2: segundo argumento de venda real
ARGUMENTO3: terceiro argumento de venda real
PUBLICO1: primeiro segmento de público ideal
PUBLICO2: segundo segmento de público ideal
DESTAQUE: a principal vantagem competitiva deste ponto`;
}

/**
 * Parse text-marker format from LLM into structured object.
 */
function parsePointInsightText(text) {
  const get = (key) => {
    const re = new RegExp(`${key}:\\s*(.+)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
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
 * Build prompt for full campaign analysis.
 */
function buildCampaignAnalysisPrompt(campaignData, cityStats) {
  const fmt = n => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));

  let pontosSummary = '';
  if (campaignData.pontos?.length) {
    pontosSummary = campaignData.pontos.slice(0, 10).map(p =>
      `${p.nome}(${p.tipo},Fluxo${fmt(p.fluxo)},R$${fmt(p.preco)})`
    ).join('; ');
  }

  let cityLine = '';
  if (cityStats) {
    cityLine = ` Cidade: ${cityStats.total_pontos} pontos, CPM médio R$${cityStats.cpm_medio.toFixed(2)}.`;
  }

  return `${getKnowledge()}

ANALISE ESTA CAMPANHA DOOH E GERE RECOMENDAÇÕES ESTRATÉGICAS:

Campanha: ${campaignData.cidade || 'n/a'}, segmento ${campaignData.segmento || 'n/a'}, objetivo ${campaignData.objetivo || 'n/a'}.
Orçamento R$${fmt(campaignData.budget || 0)}, ${campaignData.periodoSemanas || 4} semanas.
Pontos(${campaignData.pontos?.length || 0}): ${pontosSummary || 'nenhum'}
Investimento R$${fmt(campaignData.investimento || 0)}, Fluxo ${fmt(campaignData.fluxoTotal || 0)}/mês, CPM R$${Number(campaignData.cpm || 0).toFixed(2)}, Cobertura ${campaignData.coberturaPct || 0}%.${cityLine}

Escreva uma análise estratégica desta campanha. Use EXATAMENTE este formato:

AVALIACAO: Excelente ou Boa ou Regular
RESUMO: 2-3 frases sobre esta campanha específica
FORTE1: primeiro ponto forte desta campanha
FORTE2: segundo ponto forte desta campanha
OPORTUNIDADE1: primeira sugestão de melhoria
OPORTUNIDADE2: segunda sugestão de melhoria
ARGUMENTO1: primeiro argumento comercial para vender esta campanha
ARGUMENTO2: segundo argumento comercial
ARGUMENTO3: terceiro argumento comercial
ESTRATEGIA: a estratégia recomendada para esta campanha`;
}

/**
 * Parse text-marker format for campaign analysis.
 */
function parseCampaignAnalysisText(text) {
  const get = (key) => {
    const re = new RegExp(`${key}:\\s*(.+)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };
  const avaliacao = get('AVALIACAO') || get('AVALIAÇÃO');
  const resumo = get('RESUMO');
  const fortes = [get('FORTE1'), get('FORTE2')].filter(Boolean);
  const oportunidades = [get('OPORTUNIDADE1'), get('OPORTUNIDADE2')].filter(Boolean);
  const args = [get('ARGUMENTO1'), get('ARGUMENTO2'), get('ARGUMENTO3')].filter(Boolean);
  const estrategia = get('ESTRATEGIA') || get('ESTRATÉGIA');
  if (!resumo && !avaliacao) return null;
  return {
    avaliacao: avaliacao || 'Boa',
    resumo_executivo: resumo,
    pontos_fortes: fortes.length ? fortes : (resumo ? [resumo] : []),
    oportunidades_melhoria: oportunidades,
    argumentacao_comercial: args,
    estrategia_recomendada: estrategia,
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

  const parsed = extractJSON(result.text);
  if (!parsed) {
    return {
      headline: '',
      descricao: result.text.slice(0, 500),
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
      narrativa: result.text.slice(0, 500),
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

// ── DOOH Intelligence: Campaign Analysis ────────────────────────────────────

/**
 * AI-powered analysis of a full campaign (selected points + budget + objective).
 */
async function analyzeCampaign(campaignData, userId = null) {
  const inputStr = JSON.stringify({
    cidade: campaignData.cidade,
    segmento: campaignData.segmento,
    objetivo: campaignData.objetivo,
    pontos_count: campaignData.pontos?.length || 0,
    investimento: campaignData.investimento,
  });
  const inputHash = hashInput('campaign_' + inputStr);

  const cached = getCached(inputHash);
  if (cached) {
    return { ...extractJSON(cached.response), _source: 'cache', _model: cached.model };
  }

  const cityStats = getCityStats(campaignData.cidade);
  const prompt = buildCampaignAnalysisPrompt(campaignData, cityStats);

  const result = await generateWithFallback(prompt);
  // Try text markers first (more reliable for small models), then JSON
  const parsed = parseCampaignAnalysisText(result.text) || extractJSON(result.text);

  if (!parsed) {
    return {
      avaliacao: 'N/A',
      resumo_executivo: result.text.slice(0, 500),
      pontos_fortes: [],
      oportunidades_melhoria: [],
      argumentacao_comercial: [],
      estrategia_recomendada: '',
      _source: 'raw',
      _model: result.model,
    };
  }

  setCache(inputHash, prompt, JSON.stringify(parsed), result.model, result.latency);
  saveMemory(inputStr, JSON.stringify(parsed), userId, 'campaign_analysis');

  return { ...parsed, _source: 'generated', _model: result.model };
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
  generateWithReplicate,
  generateStructuredOutput,
  analyzeInput,
  generatePointInsight,
  analyzeCampaign,
  smartRecommendation,
  updateFeedback,
  getMemoryStats,
  healthCheck,
  hashInput,
};
