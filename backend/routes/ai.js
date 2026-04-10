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

module.exports = router;
