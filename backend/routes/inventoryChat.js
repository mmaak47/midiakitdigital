/**
 * routes/inventoryChat.js — AI-powered DOOH/OOH inventory chatbot endpoint
 */
'use strict';

const { Router } = require('express');
const { processInventoryChat } = require('../services/inventoryChatService');

const router = Router();

// ── POST /api/inventory-chat ──────────────────────────────────────────────────
router.post('/inventory-chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      return res.status(400).json({ error: 'message string is required (min 2 chars)' });
    }

    // Sanitize history: keep last 20, only valid {role, text} objects
    const safeHistory = Array.isArray(history)
      ? history
          .filter(h => h && typeof h.role === 'string' && typeof h.text === 'string')
          .slice(-20)
      : [];

    const userId = req.authUser?.id || null;
    const result = await processInventoryChat(message.trim(), safeHistory, userId);
    res.json(result);
  } catch (err) {
    console.error('[inventory-chat]', err.message);
    res.status(503).json({
      response: 'Desculpe, estou com dificuldade para processar sua pergunta. Tente novamente em alguns instantes.',
      intent: 'error',
      entities: {},
      _model: 'fallback',
    });
  }
});

module.exports = router;
