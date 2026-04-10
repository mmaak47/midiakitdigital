/**
 * services/aiService.js — Local AI layer with Ollama + Replicate fallback
 *
 * Modules:
 *   - generateLocal(prompt)        → Ollama llama3/mistral
 *   - generateWithReplicate(prompt) → Replicate API fallback
 *   - generateWithFallback(prompt) → local → replicate chain
 *   - generateStructuredOutput(data) → prompt engineering + JSON parsing
 *   - Cache layer (PostgreSQL ai_cache)
 *   - Memory/learning layer (ai_memory + ai_patterns)
 */
'use strict';

const crypto = require('crypto');
const db = require('../database');

// ── Config ──────────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const OLLAMA_FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || 'mistral';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 30000;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const CACHE_TTL_HOURS = Number(process.env.AI_CACHE_TTL_HOURS) || 72;

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
        model: 'meta/meta-llama-3-8b-instruct',
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

// ── Prompt Engineering ──────────────────────────────────────────────────────

function buildPrompt(data, memories = [], patterns = []) {
  let memoryContext = '';
  if (memories.length) {
    const lines = memories.map(m => {
      const tag = m.feedback > 0 ? '✓ aprovado' : 'neutro';
      return `- [${tag}] Input: "${String(m.input).slice(0, 80)}" → "${String(m.output).slice(0, 120)}"`;
    });
    memoryContext = `\nCONTEXTO DE INTERAÇÕES ANTERIORES:\n${lines.join('\n')}\n`;
  }

  let patternContext = '';
  if (patterns.length) {
    const lines = patterns.map(p => `- Padrão (score ${p.score}): "${String(p.response).slice(0, 150)}"`);
    patternContext = `\nPADRÕES BEM-SUCEDIDOS:\n${lines.join('\n')}\n`;
  }

  return `Você é um especialista em mídia OOH (Out of Home) do sistema MidiaKit Digital.
${memoryContext}${patternContext}
Com base nos dados abaixo, gere uma saída EXCLUSIVAMENTE em JSON válido (sem texto adicional):

DADOS:
${JSON.stringify(data, null, 2)}

REGRAS:
- Seja comercial, direto e persuasivo
- Destaque visibilidade, impacto e alcance
- Não invente dados numéricos — use os fornecidos
- Use linguagem profissional de mercado publicitário
- O texto deve ser em português brasileiro

FORMATO OBRIGATÓRIO (JSON válido, sem markdown):
{
  "headline": "título impactante para o ponto/campanha",
  "descricao": "texto comercial destacando diferenciais",
  "pontos_fortes": ["ponto forte 1", "ponto forte 2", "ponto forte 3"]
}`;
}

function buildAnalysisPrompt(input, memories = [], patterns = []) {
  let memoryContext = '';
  if (memories.length) {
    const lines = memories.map(m => {
      const tag = m.feedback > 0 ? '✓' : '○';
      return `- [${tag}] "${String(m.input).slice(0, 60)}" → "${String(m.output).slice(0, 100)}"`;
    });
    memoryContext = `\nHistórico relevante:\n${lines.join('\n')}\n`;
  }

  let patternContext = '';
  if (patterns.length) {
    patternContext = `\nPadrões conhecidos:\n${patterns.map(p => `- (score ${p.score}) ${String(p.response).slice(0, 120)}`).join('\n')}\n`;
  }

  return `Você é uma IA especialista no sistema MidiaKit Digital — plataforma de mídia OOH.
${memoryContext}${patternContext}
Tarefa:
${input}

Responda de forma prática, direta e estratégica. Em português brasileiro.`;
}

// ── JSON parser helper ──────────────────────────────────────────────────────

function extractJSON(text) {
  // Try direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // Try extracting JSON from markdown code blocks
  const blockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1].trim()); } catch { /* continue */ }
  }

  // Try finding JSON object in text
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* continue */ }
  }

  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate structured OOH content for a point/campaign.
 * Uses cache + memory + fallback chain.
 */
async function generateStructuredOutput(data, userId = null) {
  const inputStr = JSON.stringify(data);
  const inputHash = hashInput(inputStr);

  // 1. Check cache
  const cached = getCached(inputHash);
  if (cached) {
    console.log('[ai] cache HIT');
    return { ...extractJSON(cached.response), _source: 'cache', _model: cached.model };
  }

  // 2. Retrieve memory context
  const memories = getRelevantMemories(inputStr);
  const patterns = getTopPatterns(inputStr);

  // 3. Build prompt
  const prompt = buildPrompt(data, memories, patterns);

  // 4. Generate with fallback
  const result = await generateWithFallback(prompt);

  // 5. Parse JSON
  const parsed = extractJSON(result.text);
  if (!parsed) {
    console.warn('[ai] failed to parse JSON from response, returning raw');
    return {
      headline: '',
      descricao: result.text.slice(0, 500),
      pontos_fortes: [],
      _source: 'raw',
      _model: result.model,
    };
  }

  // 6. Cache result
  setCache(inputHash, prompt, JSON.stringify(parsed), result.model, result.latency);

  // 7. Save to memory
  saveMemory(inputStr, JSON.stringify(parsed), userId);

  return { ...parsed, _source: 'generated', _model: result.model };
}

/**
 * Free-form analysis endpoint.
 */
async function analyzeInput(input, userId = null) {
  const inputHash = hashInput(input);

  // Cache check
  const cached = getCached(inputHash);
  if (cached) {
    console.log('[ai] analyze cache HIT');
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

/**
 * Get memory stats.
 */
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

// ── Health check ────────────────────────────────────────────────────────────

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
  updateFeedback,
  getMemoryStats,
  healthCheck,
  hashInput,
};
