/**
 * routes/ai.js — AI generation + analysis + memory endpoints
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
