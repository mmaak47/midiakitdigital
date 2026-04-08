/**
 * routes/arte.js
 * Endpoints de geração de arte via IA para pontos DOOH.
 *
 * POST   /api/arte/gerar          → gera arte para 1 ponto
 * POST   /api/arte/gerar-lote     → gera arte para N pontos em paralelo
 * GET    /api/arte/geracoes/:id   → histórico de gerações de uma proposta
 * GET    /api/arte/config         → verifica se REPLICATE_API_TOKEN está configurado
 * DELETE /api/arte/geracoes/:id   → remove registro de geração (admin)
 */

const express = require('express');
const path    = require('path');
const { gerarArte, gerarPrompt, agruparPorResolucao } = require('../services/arteService');
// Provider: Replicate / black-forest-labs/flux-1.1-pro

const router = express.Router();

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function getUploadsDir(req) {
  // req.app.get('uploadsDir') é definido no server.js
  return req.app.get('uploadsDir') || path.join(__dirname, '..', 'uploads');
}

function salvarGeracaoDb(db, dados) {
  return db.prepare(`
    INSERT INTO arte_geracoes (
      proposta_id, ponto_id, ponto_nome,
      resolucao_nativa_w, resolucao_nativa_h,
      resolucao_geracao_w, resolucao_geracao_h,
      orientacao, prompt_texto, prompt_editado_manualmente,
      variacoes_json, variacao_escolhida,
      api_usada, custo_estimado_usd, duracao_ms,
      normalizado, gerado_por_usuario_id
    ) VALUES (
      @proposta_id, @ponto_id, @ponto_nome,
      @resolucao_nativa_w, @resolucao_nativa_h,
      @resolucao_geracao_w, @resolucao_geracao_h,
      @orientacao, @prompt_texto, @prompt_editado_manualmente,
      @variacoes_json, @variacao_escolhida,
      @api_usada, @custo_estimado_usd, @duracao_ms,
      @normalizado, @gerado_por_usuario_id
    )
  `).run(dados);
}

// ─────────────────────────────────────────
// GET /api/arte/config
// Informa se a API key está configurada (sem expor a chave)
// ─────────────────────────────────────────
router.get('/config', (req, res) => {
  const configured = Boolean(process.env.REPLICATE_API_TOKEN);
  res.json({ configured, provider: 'replicate / flux-1.1-pro' });
});

// ─────────────────────────────────────────
// POST /api/arte/preview-prompt
// Retorna o prompt que seria gerado sem chamar a API
// ─────────────────────────────────────────
router.post('/preview-prompt', (req, res) => {
  try {
    const { ponto, contexto } = req.body;
    if (!ponto) return res.status(400).json({ error: 'ponto obrigatório' });

    const prompt = gerarPrompt(ponto, contexto || {});
    res.json({ prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────
// POST /api/arte/gerar
// Gera arte para um único ponto
// ─────────────────────────────────────────
router.post('/gerar', async (req, res) => {
  const db = req.app.get('db');

  try {
    const { ponto_id, proposta_id, contexto, prompt_customizado } = req.body;

    if (!ponto_id) {
      return res.status(400).json({ error: 'ponto_id obrigatório' });
    }

    // Buscar ponto
    const ponto = db.prepare('SELECT * FROM pontos WHERE id = ? AND ativo = 1').get(ponto_id);
    if (!ponto) {
      return res.status(404).json({ error: `Ponto ${ponto_id} não encontrado` });
    }

    const ctx = {
      proposta_id: proposta_id || null,
      segmento: contexto?.segmento || '',
      cidade:   contexto?.cidade   || ponto.cidade || '',
      objetivo: contexto?.objetivo || '',
    };

    const uploadsDir = getUploadsDir(req);

    const resultado = await gerarArte({
      ponto,
      contexto: ctx,
      promptCustomizado: prompt_customizado || null,
      uploadsDir,
    });

    // Salvar log no banco
    const usuarioId = req.authUser?.id || null;
    const insertResult = salvarGeracaoDb(db, {
      proposta_id:              ctx.proposta_id,
      ponto_id:                 ponto.id,
      ponto_nome:               ponto.nome,
      resolucao_nativa_w:       resultado.resolucao_nativa.w,
      resolucao_nativa_h:       resultado.resolucao_nativa.h,
      resolucao_geracao_w:      resultado.resolucao_geracao.w,
      resolucao_geracao_h:      resultado.resolucao_geracao.h,
      orientacao:               resultado.orientacao,
      prompt_texto:             resultado.prompt,
      prompt_editado_manualmente: prompt_customizado ? 1 : 0,
      variacoes_json:           JSON.stringify(resultado.variacoes),
      variacao_escolhida:       null,
      api_usada:                'replicate/flux-1.1-pro',
      custo_estimado_usd:       resultado.custo_estimado_usd,
      duracao_ms:               resultado.duracao_ms,
      normalizado:              resultado.normalizado ? 1 : 0,
      gerado_por_usuario_id:    usuarioId,
    });

    res.json({
      geracao_id: insertResult.lastInsertRowid,
      ponto_id:   ponto.id,
      ponto_nome: ponto.nome,
      variacoes:  resultado.variacoes,
      prompt:     resultado.prompt,
      resolucao_nativa:  resultado.resolucao_nativa,
      resolucao_geracao: resultado.resolucao_geracao,
      normalizado:       resultado.normalizado,
      orientacao:        resultado.orientacao,
      duracao_ms:        resultado.duracao_ms,
    });

  } catch (err) {
    console.error('[arte/gerar]', err.message);

    if (err.message?.startsWith('REPLICATE_TIMEOUT')) {
      return res.status(504).json({ error: err.message, retry: true });
    }
    if (err.message?.startsWith('REPLICATE_RATE_LIMIT')) {
      return res.status(429).json({ error: err.message, retry: true });
    }
    if (err.message?.startsWith('REPLICATE_API_TOKEN')) {
      return res.status(503).json({ error: err.message });
    }

    res.status(500).json({ error: err.message || 'Erro interno ao gerar arte' });
  }
});

// ─────────────────────────────────────────
// POST /api/arte/gerar-lote
// Gera arte para múltiplos pontos em paralelo (máx 5 simultâneos)
// ─────────────────────────────────────────
router.post('/gerar-lote', async (req, res) => {
  const db = req.app.get('db');

  try {
    const { ponto_ids, proposta_id, contexto, agrupar_por_resolucao = true } = req.body;

    if (!Array.isArray(ponto_ids) || !ponto_ids.length) {
      return res.status(400).json({ error: 'ponto_ids (array) obrigatório' });
    }

    // Buscar todos os pontos
    const placeholders = ponto_ids.map(() => '?').join(',');
    const pontos = db.prepare(
      `SELECT * FROM pontos WHERE id IN (${placeholders}) AND ativo = 1`
    ).all(...ponto_ids);

    if (!pontos.length) {
      return res.status(404).json({ error: 'Nenhum ponto encontrado' });
    }

    const uploadsDir = getUploadsDir(req);
    const usuarioId  = req.authUser?.id || null;
    const ctx = { proposta_id, ...contexto };

    // Agrupar por resolução para economizar chamadas
    const grupos = agrupar_por_resolucao ? agruparPorResolucao(pontos) : pontos.map((p) => ({ resolucao: null, pontos: [p] }));

    const MAX_CONCURRENT = 5;
    const resultados = [];
    const erros = [];

    // Processar em lotes de MAX_CONCURRENT
    for (let i = 0; i < grupos.length; i += MAX_CONCURRENT) {
      const lote = grupos.slice(i, i + MAX_CONCURRENT);

      const promessas = lote.map(async (grupo) => {
        // Usar o primeiro ponto do grupo para gerar; compartilhar resultado com os demais
        const pontoBase = grupo.pontos[0];
        const pontosCompartilhados = grupo.pontos.slice(1);

        try {
          const resultado = await gerarArte({
            ponto: pontoBase,
            contexto: { ...ctx, cidade: contexto?.cidade || pontoBase.cidade },
            promptCustomizado: null,
            uploadsDir,
          });

          const insertResult = salvarGeracaoDb(db, {
            proposta_id:              ctx.proposta_id || null,
            ponto_id:                 pontoBase.id,
            ponto_nome:               pontoBase.nome,
            resolucao_nativa_w:       resultado.resolucao_nativa.w,
            resolucao_nativa_h:       resultado.resolucao_nativa.h,
            resolucao_geracao_w:      resultado.resolucao_geracao.w,
            resolucao_geracao_h:      resultado.resolucao_geracao.h,
            orientacao:               resultado.orientacao,
            prompt_texto:             resultado.prompt,
            prompt_editado_manualmente: 0,
            variacoes_json:           JSON.stringify(resultado.variacoes),
            variacao_escolhida:       null,
            api_usada:                'replicate/flux-1.1-pro',
            custo_estimado_usd:       resultado.custo_estimado_usd,
            duracao_ms:               resultado.duracao_ms,
            normalizado:              resultado.normalizado ? 1 : 0,
            gerado_por_usuario_id:    usuarioId,
          });

          resultados.push({
            ponto_id:   pontoBase.id,
            ponto_nome: pontoBase.nome,
            geracao_id: insertResult.lastInsertRowid,
            variacoes:  resultado.variacoes,
            compartilhada_com: pontosCompartilhados.map((p) => p.id),
            orientacao: resultado.orientacao,
          });

        } catch (err) {
          erros.push({ ponto_id: pontoBase.id, ponto_nome: pontoBase.nome, erro: err.message });
        }
      });

      await Promise.all(promessas);
    }

    res.json({
      total_pontos:   pontos.length,
      total_geracoes: resultados.length,
      total_erros:    erros.length,
      resultados,
      erros,
    });

  } catch (err) {
    console.error('[arte/gerar-lote]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /api/arte/geracoes/:proposta_id
// Lista gerações de uma proposta
// ─────────────────────────────────────────
router.get('/geracoes/:proposta_id', (req, res) => {
  const db = req.app.get('db');
  try {
    const rows = db.prepare(
      `SELECT * FROM arte_geracoes WHERE proposta_id = ? ORDER BY gerado_em DESC`
    ).all(req.params.proposta_id);

    const hydrated = rows.map((row) => ({
      ...row,
      variacoes: (() => { try { return JSON.parse(row.variacoes_json || '[]'); } catch { return []; } })(),
    }));

    res.json(hydrated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /api/arte/geracoes-ponto/:ponto_id
// Últimas gerações de um ponto específico (todas as propostas)
// ─────────────────────────────────────────
router.get('/geracoes-ponto/:ponto_id', (req, res) => {
  const db = req.app.get('db');
  try {
    const rows = db.prepare(
      `SELECT * FROM arte_geracoes WHERE ponto_id = ? ORDER BY gerado_em DESC LIMIT 20`
    ).all(req.params.ponto_id);

    const hydrated = rows.map((row) => ({
      ...row,
      variacoes: (() => { try { return JSON.parse(row.variacoes_json || '[]'); } catch { return []; } })(),
    }));

    res.json(hydrated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────
// PATCH /api/arte/geracoes/:id/escolha
// Marca qual variação foi escolhida
// ─────────────────────────────────────────
router.patch('/geracoes/:id/escolha', (req, res) => {
  const db = req.app.get('db');
  try {
    const { variacao_escolhida } = req.body;
    if (!variacao_escolhida) return res.status(400).json({ error: 'variacao_escolhida obrigatória' });

    db.prepare(
      `UPDATE arte_geracoes SET variacao_escolhida = ? WHERE id = ?`
    ).run(variacao_escolhida, req.params.id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────
// DELETE /api/arte/geracoes/:id
// Remove registro (admin only — tratado pelo middleware no server.js)
// ─────────────────────────────────────────
router.delete('/geracoes/:id', (req, res) => {
  const db = req.app.get('db');
  try {
    db.prepare('DELETE FROM arte_geracoes WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /api/arte/stats
// Dashboard admin — métricas mensais
// ─────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = req.app.get('db');
  try {
    const total = db.prepare(`SELECT COUNT(*) as c FROM arte_geracoes`).get()?.c || 0;
    const custoTotal = db.prepare(`SELECT COALESCE(SUM(custo_estimado_usd), 0) as c FROM arte_geracoes`).get()?.c || 0;
    const custoMedio = total > 0 ? custoTotal / total : 0;
    const porResolucao = db.prepare(
      `SELECT resolucao_geracao_w || 'x' || resolucao_geracao_h as res, COUNT(*) as c
       FROM arte_geracoes GROUP BY res ORDER BY c DESC LIMIT 10`
    ).all();
    const taxaRegeneracao = db.prepare(
      `SELECT ponto_id, ponto_nome, COUNT(*) as total_geracoes
       FROM arte_geracoes GROUP BY ponto_id ORDER BY total_geracoes DESC LIMIT 10`
    ).all();

    res.json({
      total_geracoes: total,
      custo_total_usd: Number(custoTotal).toFixed(4),
      custo_medio_usd: Number(custoMedio).toFixed(4),
      resolucoes_mais_usadas: porResolucao,
      pontos_mais_regenerados: taxaRegeneracao,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
