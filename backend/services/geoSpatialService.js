/**
 * geoSpatialService.js — PostGIS geospatial intelligence layer
 *
 * Provides radius search, clustering, share of voice, opportunity index,
 * enriched points, and the strategic decision layer.
 */
'use strict';

const db = require('../database');

const isPostgres = db.engine === 'postgres';

// ── Helper: run raw SQL (postgres-only functions) ──
function queryAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function execSql(sql) {
  db.exec(sql);
}

// ── 1. Radius search ────────────────────────────────────────────────────────

function searchByRadius(lng, lat, raioMetros = 800) {
  if (!isPostgres) return [];
  return queryAll(
    `SELECT * FROM fn_pontos_no_raio(?, ?, ?)`,
    [lng, lat, raioMetros]
  );
}

// ── 2. Nearest points (ordered by distance) ─────────────────────────────────

function nearest(lng, lat, limit = 20) {
  if (!isPostgres) return [];
  return queryAll(
    `SELECT
       p.id, p.nome, p.cidade, p.tipo, p.lat, p.lng, p.fluxo, p.preco, p.publico,
       ST_Distance(
         p.location::geography,
         ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography
       ) AS distancia_m
     FROM pontos p
     WHERE p.ativo = 1 AND p.location IS NOT NULL
     ORDER BY p.location <-> ST_SetSRID(ST_MakePoint(?, ?), 4326)
     LIMIT ?`,
    [lng, lat, lng, lat, limit]
  );
}

// ── 3. Enriched points (from materialized view) ─────────────────────────────

function getEnrichedPoints(cidade = null) {
  if (!isPostgres) return [];
  if (cidade) {
    return queryAll(
      `SELECT * FROM pontos_enriquecidos WHERE cidade = ? ORDER BY score_base DESC`,
      [cidade]
    );
  }
  return queryAll(`SELECT * FROM pontos_enriquecidos ORDER BY score_base DESC`);
}

function refreshEnrichedView() {
  if (!isPostgres) return;
  execSql('REFRESH MATERIALIZED VIEW pontos_enriquecidos');
}

// ── 4. Clusters ─────────────────────────────────────────────────────────────

function rebuildClusters(cidade = null, k = 5) {
  if (!isPostgres) return;
  queryOne(`SELECT fn_rebuild_clusters(?, ?)`, [cidade, k]);
}

function getClusters(cidade = null) {
  if (!isPostgres) return [];
  if (cidade) {
    return queryAll(
      `SELECT pc.cluster_id, pc.ponto_id, p.nome, p.tipo, p.lat, p.lng, p.fluxo, p.preco
       FROM ponto_clusters pc
       JOIN pontos p ON p.id = pc.ponto_id
       WHERE pc.cidade = ?
       ORDER BY pc.cluster_id, p.fluxo DESC`,
      [cidade]
    );
  }
  return queryAll(
    `SELECT pc.cluster_id, pc.cidade, pc.ponto_id, p.nome, p.tipo, p.lat, p.lng, p.fluxo, p.preco
     FROM ponto_clusters pc
     JOIN pontos p ON p.id = pc.ponto_id
     ORDER BY pc.cidade, pc.cluster_id, p.fluxo DESC`
  );
}

// ── 5. Share of voice ───────────────────────────────────────────────────────

function getShareOfVoice(cidade = null) {
  if (!isPostgres) return [];
  return queryAll(`SELECT * FROM fn_share_of_voice(?)`, [cidade]);
}

function calculateSOV(selectedPointIds, cidade) {
  if (!isPostgres || !selectedPointIds?.length) return null;

  const clusters = getShareOfVoice(cidade);
  if (!clusters.length) return null;

  // Get cluster assignment for selected points
  const placeholders = selectedPointIds.map(() => '?').join(',');
  const selectedClusters = queryAll(
    `SELECT pc.cluster_id, pc.ponto_id, p.insercoes, p.fluxo
     FROM ponto_clusters pc
     JOIN pontos p ON p.id = pc.ponto_id
     WHERE pc.ponto_id IN (${placeholders})`,
    selectedPointIds
  );

  return clusters.map(cluster => {
    const myPoints = selectedClusters.filter(sc => sc.cluster_id === cluster.cluster_id);
    const myInsercoes = myPoints.reduce((s, p) => s + (p.insercoes || 0), 0);
    const myFluxo = myPoints.reduce((s, p) => s + (p.fluxo || 0), 0);
    const sovInsercoes = cluster.total_insercoes > 0
      ? (myInsercoes / cluster.total_insercoes) * 100 : 0;
    const sovFluxo = cluster.total_fluxo > 0
      ? (myFluxo / cluster.total_fluxo) * 100 : 0;

    let dominancia = 'Baixa presença';
    if (sovFluxo >= 60) dominancia = 'Dominante';
    else if (sovFluxo >= 30) dominancia = 'Competitivo';

    return {
      cluster_id: cluster.cluster_id,
      cidade: cluster.cidade,
      total_pontos_area: Number(cluster.total_pontos),
      meus_pontos: myPoints.length,
      sov_insercoes: Math.round(sovInsercoes * 10) / 10,
      sov_fluxo: Math.round(sovFluxo * 10) / 10,
      dominancia,
      centroid: { lat: cluster.centroid_lat, lng: cluster.centroid_lng }
    };
  });
}

// ── 6. Opportunity index ────────────────────────────────────────────────────

function getOpportunityIndex(cidade = null) {
  if (!isPostgres) return [];
  const all = queryAll(`SELECT * FROM fn_opportunity_index(600)`);
  if (cidade) return all.filter(r => r.cidade === cidade);
  return all;
}

// ── 7. Dynamic radius ───────────────────────────────────────────────────────

function getDynamicRadius(pontoId) {
  if (!isPostgres) return 800;
  const row = queryOne(`SELECT fn_raio_dinamico(?) AS raio`, [pontoId]);
  return row?.raio ?? 800;
}

// ── 8. Strategic decision layer ─────────────────────────────────────────────

function buildStrategicRecommendation({
  cidade,
  segmento,
  objetivo,
  budget = 0,
  maxPontos = 14,
}) {
  if (!isPostgres) return null;

  const enriched = getEnrichedPoints(cidade);
  if (!enriched.length) return null;

  // Sort by score_base descending
  const sorted = [...enriched].sort((a, b) => (b.score_base || 0) - (a.score_base || 0));

  // Select top points within budget
  const plano = [];
  let spend = 0;

  for (const pt of sorted) {
    if (plano.length >= maxPontos) break;
    const preco = Number(pt.preco) || 0;
    if (budget > 0 && spend + preco > budget * 1.05) continue;
    plano.push(pt);
    spend += preco;
  }

  if (!plano.length) return null;

  const totalFluxo = plano.reduce((s, p) => s + (Number(p.fluxo) || 0), 0);
  const totalInsercoes = plano.reduce((s, p) => s + (Number(p.insercoes) || 0), 0);
  const avgScore = plano.reduce((s, p) => s + (Number(p.score_base) || 0), 0) / plano.length;
  const formatos = [...new Set(plano.map(p => p.tipo).filter(Boolean))];
  const cpm = totalFluxo > 0 ? spend / (totalFluxo / 1000) : 0;

  // Upgrades: next best points NOT in the plan
  const upgrades = sorted
    .filter(pt => !plano.some(p => p.id === pt.id))
    .slice(0, 3)
    .map(pt => ({
      id: pt.id,
      nome: pt.nome,
      tipo: pt.tipo,
      preco: pt.preco,
      fluxo: pt.fluxo,
      score_base: pt.score_base,
      impacto: `+${new Intl.NumberFormat('pt-BR').format(pt.fluxo || 0)} impactos/mês por +R$ ${new Intl.NumberFormat('pt-BR').format(pt.preco || 0)}`
    }));

  const estrategia = objetivo === 'presenca premium'
    ? `Plano premium com ${plano.length} pontos focados em ambientes de alto padrão em ${cidade}.`
    : objetivo === 'cobertura regional'
    ? `Cobertura regional com ${plano.length} pontos e ${formatos.length} formatos distribuídos em ${cidade}.`
    : `Plano otimizado com ${plano.length} pontos equilibrando alcance, frequência e eficiência em ${cidade}.`;

  const porque_funciona = [
    `${formatos.length} formatos complementares (${formatos.join(', ')}) garantem exposição em diferentes momentos do dia.`,
    `Fluxo total de ${new Intl.NumberFormat('pt-BR').format(totalFluxo)} impactos/mês com CPM de R$ ${cpm.toFixed(2)}.`,
    totalInsercoes > 0
      ? `${new Intl.NumberFormat('pt-BR').format(totalInsercoes)} inserções mensais asseguram frequência de contato.`
      : null,
    budget > 0
      ? `Investimento de R$ ${new Intl.NumberFormat('pt-BR').format(spend)} (${Math.round(spend / budget * 100)}% do orçamento).`
      : null,
  ].filter(Boolean);

  return {
    estrategia,
    porque_funciona,
    plano: plano.map(p => ({
      id: p.id,
      nome: p.nome,
      cidade: p.cidade,
      tipo: p.tipo,
      preco: p.preco,
      fluxo: p.fluxo,
      score_base: p.score_base,
      neighborhood_type: p.neighborhood_type,
      perfil_dominante: p.perfil_dominante,
    })),
    upgrades,
    resumo: {
      total_pontos: plano.length,
      total_formatos: formatos.length,
      investimento: spend,
      fluxo_total: totalFluxo,
      cpm,
      score_medio: Math.round(avgScore * 100) / 100,
    }
  };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  isPostgis: isPostgres,
  searchByRadius,
  nearest,
  getEnrichedPoints,
  refreshEnrichedView,
  rebuildClusters,
  getClusters,
  getShareOfVoice,
  calculateSOV,
  getOpportunityIndex,
  getDynamicRadius,
  buildStrategicRecommendation,
};
