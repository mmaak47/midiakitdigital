/**
 * routes/ai.js — AI generation, DOOH intelligence, analysis + memory endpoints
 */
'use strict';

const { Router } = require('express');
const ai = require('../services/aiService');

const router = Router();

// ── POST /api/ai/generate — Structured OOH content generation ──────────────
router.post('/generate', async (req, res) => {
  try {
    const data = req.body?.data || req.body;
    if (!data || (typeof data === 'object' && !Object.keys(data).length)) {
      return res.status(400).json({ error: 'data is required' });
    }

    const userId = req.authUser?.id || null;
    const result = await ai.generateStructuredOutput(data, userId);
    res.json(result);
  } catch (err) {
    console.error('[ai/generate]', err.message);
    res.status(503).json({
      error: 'AI generation failed',
      detail: err.message,
      fallback: {
        headline: '',
        descricao: 'Geração temporariamente indisponível.',
        pontos_fortes: [],
      },
    });
  }
});

// ── POST /api/ai/analyze — Free-form analysis ──────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input || typeof input !== 'string' || input.trim().length < 3) {
      return res.status(400).json({ error: 'input string is required (min 3 chars)' });
    }

    const userId = req.authUser?.id || null;
    const result = await ai.analyzeInput(input.trim(), userId);
    res.json(result);
  } catch (err) {
    console.error('[ai/analyze]', err.message);
    res.status(503).json({ error: 'AI analysis failed', detail: err.message });
  }
});

// ── GET /api/ai/point/:pontoId — AI insight for a single DOOH point ────────
router.get('/point/:pontoId', async (req, res) => {
  try {
    const pontoId = parseInt(req.params.pontoId);
    if (!pontoId || pontoId < 1) {
      return res.status(400).json({ error: 'pontoId inválido' });
    }

    const userId = req.authUser?.id || null;
    const result = await ai.generatePointInsight(pontoId, userId);
    res.json(result);
  } catch (err) {
    console.error(`[ai/point/${req.params.pontoId}]`, err.message);
    if (err.message === 'PONTO_NOT_FOUND') {
      return res.status(404).json({ error: 'Ponto não encontrado' });
    }
    res.status(503).json({ error: 'AI insight failed', detail: err.message });
  }
});

// ── POST /api/ai/campaign-point-insights — Batch AI insights for campaign points ─
router.post('/campaign-point-insights', async (req, res) => {
  try {
    const params = req.body;
    if (!params?.pontos?.length) {
      return res.status(400).json({ error: 'pontos array required' });
    }
    const result = await ai.generateCampaignPointInsights(params);
    res.json(result);
  } catch (err) {
    console.error('[ai/campaign-point-insights]', err.message);
    res.status(503).json({ error: 'Point insights failed', detail: err.message });
  }
});

// ── POST /api/ai/campaign — AI analysis for a full campaign ─────────────────
router.post('/campaign', async (req, res) => {
  try {
    const campaignData = req.body;
    if (!campaignData || !campaignData.cidade) {
      return res.status(400).json({ error: 'Campaign data with cidade is required' });
    }

    const userId = req.authUser?.id || null;
    const result = await ai.analyzeCampaign(campaignData, userId);
    res.json(result);
  } catch (err) {
    console.error('[ai/campaign]', err.message);
    res.status(503).json({ error: 'Campaign analysis failed', detail: err.message });
  }
});

// ── POST /api/ai/recommend — AI-powered point selection ─────────────────────
router.post('/recommend', async (req, res) => {
  try {
    const params = req.body;
    if (!params || !params.cidade) {
      return res.status(400).json({ error: 'cidade is required' });
    }

    const userId = req.authUser?.id || null;
    const result = await ai.smartRecommendation(params, userId);
    res.json(result);
  } catch (err) {
    console.error('[ai/recommend]', err.message);
    res.status(503).json({ error: 'Recommendation failed', detail: err.message });
  }
});

// ── POST /api/ai/optimize-score — AI-driven score optimization via point swaps ─
router.post('/optimize-score', async (req, res) => {
  try {
    const params = req.body;
    if (!params?.cidade || !params?.selectedPointIds?.length) {
      return res.status(400).json({ error: 'cidade and selectedPointIds required' });
    }
    const result = await ai.optimizeScore(params);
    res.json(result);
  } catch (err) {
    console.error('[ai/optimize-score]', err.message);
    res.status(503).json({ error: 'Score optimization failed', detail: err.message });
  }
});

// ── POST /api/ai/plan-decision — AI-first campaign point selection ────────────
router.post('/plan-decision', async (req, res) => {
  try {
    const params = req.body;
    if (!params?.cidade) {
      return res.status(400).json({ error: 'cidade is required' });
    }

    const userId = req.authUser?.id || null;
    const result = await ai.aiPlanDecision(params, userId);
    res.json(result);
  } catch (err) {
    console.error('[ai/plan-decision]', err.message);
    res.status(503).json({
      mode: 'rule_based',
      selected_points: [],
      error: 'AI plan decision failed',
      detail: err.message,
      _source: 'error',
    });
  }
});

// ── POST /api/ai/feedback — Update memory feedback ─────────────────────────
router.post('/feedback', (req, res) => {
  try {
    const { memoryId, feedback } = req.body || {};
    if (!memoryId || ![-1, 0, 1].includes(Number(feedback))) {
      return res.status(400).json({ error: 'memoryId and feedback (-1, 0, 1) required' });
    }

    ai.updateFeedback(Number(memoryId), Number(feedback));
    res.json({ ok: true });
  } catch (err) {
    console.error('[ai/feedback]', err.message);
    res.status(500).json({ error: 'Feedback update failed' });
  }
});

// ── GET /api/ai/stats — Memory and learning stats ──────────────────────────
router.get('/stats', (req, res) => {
  try {
    const stats = ai.getMemoryStats();
    res.json(stats);
  } catch (err) {
    console.error('[ai/stats]', err.message);
    res.status(500).json({ error: 'Stats retrieval failed' });
  }
});

// ── GET /api/ai/health — Ollama + Replicate health check ───────────────────
router.get('/health', async (req, res) => {
  try {
    const health = await ai.healthCheck();
    res.json(health);
  } catch (err) {
    console.error('[ai/health]', err.message);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// ── POST /api/ai/proposta-texto — Geração de texto comercial para proposta ────
router.post('/proposta-texto', async (req, res) => {
  const { segmento, objetivo, clientName, cidade, points = [], totals = {} } = req.body || {};
  if (!points.length) return res.status(400).json({ error: 'points é obrigatório.' });

  // Fallback algorítmico (usado se IA falhar)
  function buildFallback() {
    const cidades = [...new Set(points.map(p => p.cidade).filter(Boolean))].join(', ') || cidade || 'sua cidade';
    const tiposUniq = [...new Set(points.map(p => p.tipo).filter(Boolean))].join(', ');
    const fluxoTotal = totals.fluxoTotal || points.reduce((s, p) => s + (p.fluxo || 0), 0);
    const cpm = totals.cpmEstimado ? `R$ ${Number(totals.cpmEstimado).toFixed(2)}` : null;
    return {
      justificativa: `A campanha foi planejada para ${clientName || 'o cliente'} com foco em ${segmento || 'seu segmento'} em ${cidades}. Com ${points.length} ponto${points.length > 1 ? 's' : ''} estrategicamente selecionados (${tiposUniq}), a proposta garante presença consistente nos principais fluxos urbanos da região.`,
      argumentoAudiencia: `Os pontos selecionados concentram alto fluxo qualificado — ${fluxoTotal.toLocaleString('pt-BR')} impactos mensais estimados${cpm ? ` a um CPM de ${cpm}` : ''} —, com localização alinhada ao perfil de público relevante para ${segmento || 'o segmento'}.`,
      porQueEstesPoints: points.map(p => `${p.nome} (${p.tipo || ''}, ${p.cidade || ''}) — ${(p.fluxo || 0).toLocaleString('pt-BR')} impactos/mês`),
      _source: 'fallback'
    };
  }

  try {
    const pontosDesc = points.map((p, i) =>
      `${i + 1}. ${p.nome} | ${p.tipo} | ${p.cidade} | Fluxo: ${(p.fluxo || 0).toLocaleString('pt-BR')}/mês | Preço: R$${p.preco || 0} | Telas: ${p.telas || 1}${p.entornoScore ? ` | Score entorno: ${p.entornoScore}` : ''}`
    ).join('\n');

    const prompt = `${ai.DOOH_KNOWLEDGE_COMPACT}

Você deve gerar textos comerciais para uma PROPOSTA DE MÍDIA DOOH. Responda APENAS com JSON válido, sem texto extra.

DADOS DA PROPOSTA:
- Cliente: ${clientName || 'não informado'}
- Segmento: ${segmento || 'não informado'}
- Objetivo: ${objetivo || 'não informado'}
- Cidade(s): ${cidade || [...new Set(points.map(p => p.cidade).filter(Boolean))].join(', ')}
- Investimento total: R$ ${totals.valorTotal || 0}
- Fluxo total: ${(totals.fluxoTotal || 0).toLocaleString('pt-BR')} impactos/mês
- CPM estimado: R$ ${totals.cpmEstimado || 0}
- Pontos selecionados:
${pontosDesc}

Gere o JSON a seguir com textos profissionais em português brasileiro:
{
  "justificativa": "<2-3 frases sobre a estratégia geral da campanha, por que estes pontos e este mix fazem sentido para o cliente>",
  "argumentoAudiencia": "<2 frases sobre a audiência e contexto dos pontos: perfil, momento de impacto, relevância para o segmento>",
  "porQueEstesPoints": ["<frase curta de argumento para cada ponto, na mesma ordem da lista acima>"]
}`;

    const raw = await ai.generateReplicateFirst(prompt, { temperature: 0.7, maxTokens: 800 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON não encontrado na resposta');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.justificativa || !parsed.argumentoAudiencia) throw new Error('Campos obrigatórios ausentes');
    res.json({ ...parsed, _source: 'llm' });
  } catch (err) {
    console.warn('[ai/proposta-texto] fallback acionado:', err.message);
    res.json(buildFallback());
  }
});

module.exports = router;
