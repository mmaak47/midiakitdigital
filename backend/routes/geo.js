/**
 * routes/geo.js — PostGIS geospatial API endpoints
 */
'use strict';

const { Router } = require('express');
const geo = require('../services/geoSpatialService');

const router = Router();

// ── GET /api/geo/nearby?lat=&lng=&raio= ─ Radius search ────────────────────
router.get('/nearby', (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const raio = parseInt(req.query.raio) || 800;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }
    if (raio < 50 || raio > 10000) {
      return res.status(400).json({ error: 'raio must be 50-10000 meters' });
    }

    const pontos = geo.searchByRadius(lng, lat, raio);
    res.json({ count: pontos.length, raio_m: raio, pontos });
  } catch (err) {
    console.error('[geo/nearby]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── GET /api/geo/nearest?lat=&lng=&limit= ─ Nearest points ─────────────────
router.get('/nearest', (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const pontos = geo.nearest(lng, lat, limit);
    res.json({ count: pontos.length, pontos });
  } catch (err) {
    console.error('[geo/nearest]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── GET /api/geo/enriched?cidade= ─ Materialized view ──────────────────────
router.get('/enriched', (req, res) => {
  try {
    const cidade = req.query.cidade || null;
    const pontos = geo.getEnrichedPoints(cidade);
    res.json({ count: pontos.length, pontos });
  } catch (err) {
    console.error('[geo/enriched]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── POST /api/geo/enriched/refresh ─ Refresh materialized view ──────────────
router.post('/enriched/refresh', (req, res) => {
  try {
    geo.refreshEnrichedView();
    res.json({ ok: true, message: 'Materialized view refreshed' });
  } catch (err) {
    console.error('[geo/enriched/refresh]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── GET /api/geo/clusters?cidade= ─ Get clusters ───────────────────────────
router.get('/clusters', (req, res) => {
  try {
    const cidade = req.query.cidade || null;
    const pontos = geo.getClusters(cidade);

    // Group by cluster
    const grouped = {};
    for (const p of pontos) {
      const key = `${p.cidade || 'all'}_${p.cluster_id}`;
      if (!grouped[key]) {
        grouped[key] = {
          cluster_id: p.cluster_id,
          cidade: p.cidade,
          pontos: []
        };
      }
      grouped[key].pontos.push(p);
    }

    const clusters = Object.values(grouped);
    res.json({ count: clusters.length, clusters });
  } catch (err) {
    console.error('[geo/clusters]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── POST /api/geo/clusters/rebuild?cidade=&k= ─ Rebuild clusters ───────────
router.post('/clusters/rebuild', (req, res) => {
  try {
    const cidade = req.query.cidade || req.body?.cidade || null;
    const k = parseInt(req.query.k || req.body?.k) || 5;
    geo.rebuildClusters(cidade, k);
    const clusters = geo.getClusters(cidade);
    res.json({ ok: true, total: clusters.length });
  } catch (err) {
    console.error('[geo/clusters/rebuild]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── GET /api/geo/sov?cidade= ─ Share of voice by cluster ───────────────────
router.get('/sov', (req, res) => {
  try {
    const cidade = req.query.cidade || null;
    const sov = geo.getShareOfVoice(cidade);
    res.json({ count: sov.length, clusters: sov });
  } catch (err) {
    console.error('[geo/sov]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── POST /api/geo/sov/calculate ─ SOV for selected points ──────────────────
router.post('/sov/calculate', (req, res) => {
  try {
    const { pontoIds, cidade } = req.body || {};
    if (!Array.isArray(pontoIds) || !pontoIds.length) {
      return res.status(400).json({ error: 'pontoIds array is required' });
    }

    const sov = geo.calculateSOV(pontoIds.map(Number), cidade);
    if (!sov) return res.json({ clusters: [] });
    res.json({ clusters: sov });
  } catch (err) {
    console.error('[geo/sov/calculate]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── GET /api/geo/opportunity?cidade= ─ Opportunity index ────────────────────
router.get('/opportunity', (req, res) => {
  try {
    const cidade = req.query.cidade || null;
    const data = geo.getOpportunityIndex(cidade);
    res.json({ count: data.length, pontos: data });
  } catch (err) {
    console.error('[geo/opportunity]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── GET /api/geo/radius/:pontoId ─ Dynamic radius ──────────────────────────
router.get('/radius/:pontoId', (req, res) => {
  try {
    const pontoId = parseInt(req.params.pontoId);
    if (!pontoId) return res.status(400).json({ error: 'Invalid pontoId' });
    const raio = geo.getDynamicRadius(pontoId);
    res.json({ ponto_id: pontoId, raio_m: raio });
  } catch (err) {
    console.error('[geo/radius]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── POST /api/geo/strategy ─ Strategic recommendation ───────────────────────
router.post('/strategy', (req, res) => {
  try {
    const { cidade, segmento, objetivo, budget, maxPontos } = req.body || {};
    if (!cidade) {
      return res.status(400).json({ error: 'cidade is required' });
    }

    const result = geo.buildStrategicRecommendation({
      cidade,
      segmento,
      objetivo,
      budget: Number(budget) || 0,
      maxPontos: Number(maxPontos) || 14,
    });

    if (!result) {
      return res.json({ estrategia: 'Nenhum ponto disponível para esta combinação.', plano: [], upgrades: [] });
    }

    res.json(result);
  } catch (err) {
    console.error('[geo/strategy]', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
