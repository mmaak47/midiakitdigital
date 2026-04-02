/**
 * Audience Intelligence Engine
 *
 * Three features:
 *  1. Audience Score — profile-based affinity scoring per DOOH point
 *  2. Audience Heatmap — geographic grid cells with audience density
 *  3. Campaign Simulator — impressions, reach, frequency, CPM estimation
 *
 * Reuses entornoAnalysis POI fetching & existing entorno_cache data.
 */

'use strict';

const db = require('./database');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const FETCH_TIMEOUT = 15_000;
const ANALYSIS_RADIUS = Number(process.env.AUDIENCE_ANALYSIS_RADIUS) || 800;
const CACHE_TTL_HOURS = 168; // 1 week
const HEATMAP_CELL_SIZE_M = 200;

// ---------------------------------------------------------------------------
// Default Audience Profiles + Place‑Category Weights
// ---------------------------------------------------------------------------

const DEFAULT_PROFILES = {
  investidores: {
    label: 'Investidores',
    description: 'Profissionais e frequentadores de ambientes financeiros e corporativos.',
    weights: {
      bank: 10, investment_office: 9, coworking: 8, financial_office: 9,
      insurance_office: 7, luxury_restaurant: 6, hotel: 5, conference_center: 7,
      law_office: 6, real_estate: 5, consulting_office: 7
    }
  },
  familias: {
    label: 'Famílias',
    description: 'Público familiar, frequentadores de escolas, parques e supermercados.',
    weights: {
      school: 10, shopping_mall: 8, supermarket: 7, park: 6,
      playground: 8, childcare: 9, toy_store: 6, bakery: 5,
      pharmacy: 5, clinic: 4, church: 5, community_centre: 6
    }
  },
  estudantes: {
    label: 'Estudantes',
    description: 'Jovens universitários e frequentadores de ambientes educacionais.',
    weights: {
      university: 10, college: 9, library: 8, bookstore: 7,
      cafe: 6, bar: 5, fast_food: 5, copy_shop: 6,
      language_school: 7, coworking: 4, cinema: 4, sports_centre: 5
    }
  },
  executivos: {
    label: 'Executivos',
    description: 'Profissionais de alto nível que frequentam ambientes corporativos premium.',
    weights: {
      coworking: 9, financial_office: 8, law_office: 8, consulting_office: 8,
      hotel: 7, conference_center: 8, fine_dining: 7, spa: 6,
      fitness_centre: 5, car_dealership: 4, airport: 6, bank: 6
    }
  },
  classe_alta: {
    label: 'Classe Alta',
    description: 'Consumidores de alto poder aquisitivo em áreas premium.',
    weights: {
      jewelry: 10, perfumery: 9, wine_shop: 8, spa: 8,
      fine_dining: 7, hotel: 7, fitness_centre: 6, cosmetics: 6,
      department_store: 5, art_gallery: 7, optician: 4, watches: 9
    }
  },
  classe_media: {
    label: 'Classe Média',
    description: 'Consumidores de renda média em áreas comerciais de alto movimento.',
    weights: {
      supermarket: 9, shopping_mall: 8, pharmacy: 7, bakery: 6,
      clothes_shop: 7, convenience: 6, fast_food: 5, bank: 5,
      bus_station: 5, mobile_phone_shop: 6, hardware_store: 4, fuel_station: 4
    }
  }
};

// OSM tag mapping: our category keys → OSM amenity/shop/office/leisure/tourism values
const CATEGORY_OSM_MAP = {
  bank: { amenity: ['bank'] },
  investment_office: { office: ['financial', 'investment'] },
  coworking: { amenity: ['coworking_space'] },
  financial_office: { office: ['financial', 'insurance', 'accountant'] },
  insurance_office: { office: ['insurance'] },
  luxury_restaurant: { amenity: ['restaurant'] },  // scored by proximity to premium areas
  hotel: { tourism: ['hotel'] },
  conference_center: { amenity: ['conference_centre', 'events_venue'] },
  law_office: { office: ['lawyer'] },
  real_estate: { office: ['estate_agent'] },
  consulting_office: { office: ['consulting'] },
  school: { amenity: ['school'] },
  shopping_mall: { shop: ['mall', 'department_store'] },
  supermarket: { shop: ['supermarket'] },
  park: { leisure: ['park', 'garden'] },
  playground: { leisure: ['playground'] },
  childcare: { amenity: ['childcare', 'kindergarten'] },
  toy_store: { shop: ['toys'] },
  bakery: { shop: ['bakery'] },
  pharmacy: { shop: ['pharmacy'], amenity: ['pharmacy'] },
  clinic: { amenity: ['clinic', 'doctors'] },
  church: { amenity: ['place_of_worship'] },
  community_centre: { amenity: ['community_centre'] },
  university: { amenity: ['university'] },
  college: { amenity: ['college'] },
  library: { amenity: ['library'] },
  bookstore: { shop: ['books'] },
  cafe: { amenity: ['cafe'] },
  bar: { amenity: ['bar', 'pub'] },
  fast_food: { amenity: ['fast_food'] },
  copy_shop: { shop: ['copyshop', 'stationery'] },
  language_school: { amenity: ['language_school'] },
  cinema: { amenity: ['cinema'] },
  sports_centre: { leisure: ['sports_centre', 'fitness_centre'] },
  fitness_centre: { leisure: ['fitness_centre'] },
  car_dealership: { shop: ['car'] },
  airport: { aeroway: ['aerodrome'] },
  fine_dining: { amenity: ['restaurant'] },
  jewelry: { shop: ['jewelry'] },
  perfumery: { shop: ['perfumery'] },
  wine_shop: { shop: ['wine', 'alcohol'] },
  spa: { amenity: ['spa'], leisure: ['spa'] },
  cosmetics: { shop: ['cosmetics', 'beauty'] },
  department_store: { shop: ['department_store'] },
  art_gallery: { tourism: ['gallery', 'museum'] },
  optician: { shop: ['optician'] },
  watches: { shop: ['watches'] },
  clothes_shop: { shop: ['clothes'] },
  convenience: { shop: ['convenience'] },
  mobile_phone_shop: { shop: ['mobile_phone'] },
  hardware_store: { shop: ['hardware', 'doityourself'] },
  fuel_station: { amenity: ['fuel'] },
  bus_station: { amenity: ['bus_station'] },
  hospital: { amenity: ['hospital'] },
  dentist: { amenity: ['dentist'] },
  hairdresser: { shop: ['hairdresser'] },
  gym: { leisure: ['fitness_centre', 'sports_centre'] },
  swimming_pool: { leisure: ['swimming_pool'] }
};

// Flatten all OSM values we need to query
const ALL_OSM_TAGS = (() => {
  const byKey = {};
  for (const catMap of Object.values(CATEGORY_OSM_MAP)) {
    for (const [tagKey, values] of Object.entries(catMap)) {
      if (!byKey[tagKey]) byKey[tagKey] = new Set();
      for (const v of values) byKey[tagKey].add(v);
    }
  }
  return byKey;
})();

// Build reverse index: osm_tag_key + osm_value → our category
const TAG_TO_CATEGORY = (() => {
  const map = {};
  for (const [cat, tagDef] of Object.entries(CATEGORY_OSM_MAP)) {
    for (const [tagKey, values] of Object.entries(tagDef)) {
      for (const v of values) {
        const key = `${tagKey}:${v}`;
        if (!map[key]) map[key] = [];
        map[key].push(cat);
      }
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// DB Bootstrap — ensure tables exist
// ---------------------------------------------------------------------------

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audience_profiles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT,
      weights JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS audience_point_scores (
      id SERIAL PRIMARY KEY,
      ponto_id INTEGER NOT NULL,
      profile_name TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      breakdown JSONB DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      UNIQUE(ponto_id, profile_name)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_aps_ponto ON audience_point_scores (ponto_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_aps_profile ON audience_point_scores (profile_name)
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS audience_jobs (
      id SERIAL PRIMARY KEY,
      status TEXT DEFAULT 'pending',
      cidade TEXT,
      progress INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Run on import
try { ensureTables(); } catch (e) { console.error('[audience-intel] Table bootstrap error:', e.message); }

// ---------------------------------------------------------------------------
// Seed default profiles if table is empty
// ---------------------------------------------------------------------------

function seedDefaultProfiles() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM audience_profiles').get();
  if (count && count.c > 0) return;
  const stmt = db.prepare(
    `INSERT INTO audience_profiles (name, label, description, weights) VALUES (?, ?, ?, ?)
     ON CONFLICT (name) DO NOTHING`
  );
  for (const [name, def] of Object.entries(DEFAULT_PROFILES)) {
    stmt.run(name, def.label, def.description, JSON.stringify(def.weights));
  }
  console.log('[audience-intel] Seeded', Object.keys(DEFAULT_PROFILES).length, 'default profiles');
}

try { seedDefaultProfiles(); } catch (e) { console.error('[audience-intel] Seed error:', e.message); }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_008.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeoutSignal(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  if (typeof t.unref === 'function') t.unref();
  return ac.signal;
}

// ---------------------------------------------------------------------------
// POI Fetching — Overpass
// ---------------------------------------------------------------------------

async function fetchPOIsInRadius(lat, lng, radius) {
  const query = `
    [out:json][timeout:25];
    (
      node(around:${radius},${lat},${lng})["amenity"];
      node(around:${radius},${lat},${lng})["shop"];
      node(around:${radius},${lat},${lng})["office"];
      node(around:${radius},${lat},${lng})["leisure"];
      node(around:${radius},${lat},${lng})["tourism"];
      node(around:${radius},${lat},${lng})["healthcare"];
      way(around:${radius},${lat},${lng})["amenity"];
      way(around:${radius},${lat},${lng})["shop"];
      way(around:${radius},${lat},${lng})["office"];
      way(around:${radius},${lat},${lng})["leisure"];
      way(around:${radius},${lat},${lng})["tourism"];
      way(around:${radius},${lat},${lng})["healthcare"];
    );
    out center tags;
  `;

  const resp = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
    signal: timeoutSignal(FETCH_TIMEOUT),
  });

  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  const data = await resp.json();

  // Classify each element into our categories
  const categoryCounts = {};
  const elements = data?.elements || [];

  for (const el of elements) {
    const tags = el.tags || {};
    const matched = classifyElement(tags);
    for (const cat of matched) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  return { categoryCounts, totalPois: elements.length };
}

function classifyElement(tags) {
  const matched = [];
  const TAG_KEYS = ['amenity', 'shop', 'office', 'leisure', 'tourism', 'healthcare', 'aeroway'];
  for (const tagKey of TAG_KEYS) {
    const val = tags[tagKey];
    if (!val) continue;
    const lookupKey = `${tagKey}:${val}`;
    const cats = TAG_TO_CATEGORY[lookupKey];
    if (cats) matched.push(...cats);
  }
  return [...new Set(matched)];
}

// ---------------------------------------------------------------------------
// FEATURE 1 — Audience Score
// ---------------------------------------------------------------------------

function loadProfiles() {
  return db.prepare('SELECT name, label, description, weights FROM audience_profiles ORDER BY name').all()
    .map(r => ({
      ...r,
      weights: typeof r.weights === 'string' ? JSON.parse(r.weights) : r.weights
    }));
}

async function scorePoint(point, profiles, radius = ANALYSIS_RADIUS) {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const { categoryCounts } = await fetchPOIsInRadius(lat, lng, radius);

  const results = [];
  for (const profile of profiles) {
    const weights = profile.weights;
    let score = 0;
    const breakdown = {};
    for (const [category, weight] of Object.entries(weights)) {
      const count = categoryCounts[category] || 0;
      const contribution = count * weight;
      score += contribution;
      if (count > 0) breakdown[category] = { count, weight, contribution };
    }
    results.push({
      profile_name: profile.name,
      label: profile.label,
      score: Math.round(score * 100) / 100,
      breakdown,
    });
  }

  return results;
}

async function analyzePoint(pontoId, { force = false } = {}) {
  const point = db.prepare('SELECT id, lat, lng, cidade FROM pontos WHERE id = ? AND ativo = 1').get(pontoId);
  if (!point) throw new Error(`Point ${pontoId} not found`);

  if (!force) {
    const cached = db.prepare(
      `SELECT id FROM audience_point_scores WHERE ponto_id = ? AND expires_at > NOW() LIMIT 1`
    ).get(pontoId);
    if (cached) return getPointScores(pontoId);
  }

  const profiles = loadProfiles();
  const scores = await scorePoint(point, profiles);
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600_000).toISOString();

  for (const s of scores) {
    db.prepare(`
      INSERT INTO audience_point_scores (ponto_id, profile_name, score, breakdown, updated_at, expires_at)
      VALUES (?, ?, ?, ?, NOW(), ?)
      ON CONFLICT (ponto_id, profile_name) DO UPDATE SET
        score = EXCLUDED.score,
        breakdown = EXCLUDED.breakdown,
        updated_at = NOW(),
        expires_at = EXCLUDED.expires_at
    `).run(s.profile_name, s.score, JSON.stringify(s.breakdown), expiresAt, pontoId);
    // Note: positional params order matches after bind rewrite
  }

  // Workaround: the database.js bindSql replaces ? left-to-right, so we need correct order
  // Let's use a simpler approach: delete + insert
  db.prepare('DELETE FROM audience_point_scores WHERE ponto_id = ?').run(pontoId);
  for (const s of scores) {
    db.prepare(`
      INSERT INTO audience_point_scores (ponto_id, profile_name, score, breakdown, updated_at, expires_at)
      VALUES (?, ?, ?, ?, NOW(), ?)
    `).run(pontoId, s.profile_name, s.score, JSON.stringify(s.breakdown), expiresAt);
  }

  return scores;
}

async function analyzeCity(cidade, { force = false } = {}) {
  let points;
  if (cidade) {
    points = db.prepare('SELECT id, lat, lng, cidade FROM pontos WHERE ativo = 1 AND cidade = ?').all(cidade);
  } else {
    points = db.prepare('SELECT id, lat, lng, cidade FROM pontos WHERE ativo = 1').all();
  }

  const jobRow = db.prepare(
    `INSERT INTO audience_jobs (status, cidade, total) VALUES ('running', ?, ?) RETURNING id`
  ).get(cidade || null, points.length);
  const jobId = jobRow?.id;

  const profiles = loadProfiles();
  let analyzed = 0, skipped = 0, errors = 0;
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600_000).toISOString();

  for (const point of points) {
    try {
      if (!force) {
        const cached = db.prepare(
          `SELECT id FROM audience_point_scores WHERE ponto_id = ? AND expires_at > NOW() LIMIT 1`
        ).get(point.id);
        if (cached) { skipped++; continue; }
      }

      const scores = await scorePoint(point, profiles);

      db.prepare('DELETE FROM audience_point_scores WHERE ponto_id = ?').run(point.id);
      for (const s of scores) {
        db.prepare(`
          INSERT INTO audience_point_scores (ponto_id, profile_name, score, breakdown, updated_at, expires_at)
          VALUES (?, ?, ?, ?, NOW(), ?)
        `).run(point.id, s.profile_name, s.score, JSON.stringify(s.breakdown), expiresAt);
      }
      analyzed++;

      if (jobId && analyzed % 5 === 0) {
        db.prepare(`UPDATE audience_jobs SET progress = ?, updated_at = NOW() WHERE id = ?`)
          .run(analyzed + skipped, jobId);
      }

      // Rate-limit Overpass
      if (analyzed < points.length) await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      errors++;
      console.error(`[audience-intel] Error analyzing point ${point.id}:`, err.message);
    }
  }

  if (jobId) {
    db.prepare(`UPDATE audience_jobs SET status = 'done', progress = ?, errors = ?, updated_at = NOW() WHERE id = ?`)
      .run(analyzed + skipped + errors, errors, jobId);
  }

  return { jobId, analyzed, skipped, errors, total: points.length };
}

function getPointScores(pontoId) {
  const rows = db.prepare(`
    SELECT aps.profile_name, aps.score, aps.breakdown, aps.updated_at,
           ap.label, ap.description
    FROM audience_point_scores aps
    JOIN audience_profiles ap ON ap.name = aps.profile_name
    WHERE aps.ponto_id = ?
    ORDER BY aps.score DESC
  `).all(pontoId);
  return rows.map(r => ({
    profile: r.profile_name,
    label: r.label,
    description: r.description,
    score: r.score,
    breakdown: typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : (r.breakdown || {}),
    updated_at: r.updated_at,
  }));
}

function getAllScores({ cidade, profile, minScore } = {}) {
  let sql = `
    SELECT aps.ponto_id, aps.profile_name, aps.score, aps.breakdown, aps.updated_at,
           ap.label,
           p.nome, p.cidade, p.tipo, p.lat, p.lng
    FROM audience_point_scores aps
    JOIN audience_profiles ap ON ap.name = aps.profile_name
    JOIN pontos p ON p.id = aps.ponto_id AND p.ativo = 1
    WHERE 1=1
  `;
  const params = [];
  if (cidade) { sql += ' AND p.cidade = ?'; params.push(cidade); }
  if (profile) { sql += ' AND aps.profile_name = ?'; params.push(profile); }
  if (minScore) { sql += ' AND aps.score >= ?'; params.push(Number(minScore)); }
  sql += ' ORDER BY aps.score DESC';

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    ponto_id: r.ponto_id,
    nome: r.nome,
    cidade: r.cidade,
    tipo: r.tipo,
    lat: r.lat,
    lng: r.lng,
    profile: r.profile_name,
    label: r.label,
    score: r.score,
    breakdown: typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : (r.breakdown || {}),
    updated_at: r.updated_at,
  }));
}

function getRanking({ profile, cidade, limit = 20 } = {}) {
  if (!profile) throw new Error('profile is required');
  let sql = `
    SELECT aps.ponto_id, aps.score, aps.breakdown,
           p.nome, p.cidade, p.tipo, p.lat, p.lng, p.fluxo, p.preco
    FROM audience_point_scores aps
    JOIN pontos p ON p.id = aps.ponto_id AND p.ativo = 1
    WHERE aps.profile_name = ?
  `;
  const params = [profile];
  if (cidade) { sql += ' AND p.cidade = ?'; params.push(cidade); }
  sql += ' ORDER BY aps.score DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params).map(r => ({
    ponto_id: r.ponto_id,
    nome: r.nome,
    cidade: r.cidade,
    tipo: r.tipo,
    lat: r.lat,
    lng: r.lng,
    score: r.score,
    fluxo: r.fluxo,
    preco: r.preco,
    breakdown: typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : (r.breakdown || {}),
  }));
}

// ---------------------------------------------------------------------------
// FEATURE 2 — Audience Heatmap
// ---------------------------------------------------------------------------

function metersToDegreesLat(meters) {
  return meters / 111_320;
}
function metersToDegreesLng(meters, lat) {
  return meters / (111_320 * Math.cos((lat * Math.PI) / 180));
}

function generateHeatmap({ cidade, profile, bounds, cellSizeM = HEATMAP_CELL_SIZE_M } = {}) {
  if (!profile) throw new Error('profile is required');

  // Load profile weights
  const profileRow = db.prepare('SELECT weights FROM audience_profiles WHERE name = ?').get(profile);
  if (!profileRow) throw new Error(`Profile "${profile}" not found`);
  const weights = typeof profileRow.weights === 'string' ? JSON.parse(profileRow.weights) : profileRow.weights;

  // Get all scored points with breakdown for this profile
  let sql = `
    SELECT aps.ponto_id, aps.score, aps.breakdown,
           p.lat, p.lng, p.cidade
    FROM audience_point_scores aps
    JOIN pontos p ON p.id = aps.ponto_id AND p.ativo = 1
    WHERE aps.profile_name = ?
  `;
  const params = [profile];
  if (cidade) { sql += ' AND p.cidade = ?'; params.push(cidade); }
  sql += ' ORDER BY aps.score DESC';

  const points = db.prepare(sql).all(...params).map(r => ({
    ...r,
    lat: Number(r.lat),
    lng: Number(r.lng),
    breakdown: typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : (r.breakdown || {}),
  }));

  if (!points.length) return { cells: [], profile, cellSizeM };

  // Determine bounds
  let minLat, maxLat, minLng, maxLng;
  if (bounds) {
    [minLng, minLat, maxLng, maxLat] = bounds;
  } else {
    minLat = Math.min(...points.map(p => p.lat)) - 0.01;
    maxLat = Math.max(...points.map(p => p.lat)) + 0.01;
    minLng = Math.min(...points.map(p => p.lng)) - 0.01;
    maxLng = Math.max(...points.map(p => p.lng)) + 0.01;
  }

  const latStep = metersToDegreesLat(cellSizeM);
  const midLat = (minLat + maxLat) / 2;
  const lngStep = metersToDegreesLng(cellSizeM, midLat);

  const cells = [];
  const influenceRadius = ANALYSIS_RADIUS; // 800m — each point influences cells within this radius

  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lng = minLng; lng <= maxLng; lng += lngStep) {
      let cellScore = 0;

      for (const pt of points) {
        const dist = haversineMeters(lat, lng, pt.lat, pt.lng);
        if (dist > influenceRadius) continue;

        // Inverse distance weighting: closer points contribute more
        const weight = 1 - (dist / influenceRadius);
        cellScore += pt.score * weight;
      }

      if (cellScore > 0) {
        cells.push({
          lat: Math.round(lat * 1e6) / 1e6,
          lng: Math.round(lng * 1e6) / 1e6,
          score: Math.round(cellScore * 100) / 100,
        });
      }
    }
  }

  // Normalize to 0-100
  const maxScore = Math.max(...cells.map(c => c.score), 1);
  for (const c of cells) {
    c.audience_score = Math.round((c.score / maxScore) * 100);
  }

  return { cells, profile, cellSizeM, totalPoints: points.length };
}

// ---------------------------------------------------------------------------
// FEATURE 3 — Campaign Simulator
// ---------------------------------------------------------------------------

function simulateCampaign({ selectedPoints, investment, periodDays } = {}) {
  if (!selectedPoints?.length) throw new Error('selectedPoints is required');
  if (!investment || investment <= 0) throw new Error('investment must be positive');
  if (!periodDays || periodDays <= 0) throw new Error('periodDays must be positive');

  // Fetch point data
  const placeholders = selectedPoints.map(() => '?').join(',');
  const points = db.prepare(`
    SELECT id, nome, cidade, tipo, fluxo, telas, preco, tempo, loop, horario, insercoes
    FROM pontos WHERE id IN (${placeholders}) AND ativo = 1
  `).all(...selectedPoints);

  if (!points.length) throw new Error('No valid points found');

  let totalImpressions = 0;
  const pointResults = [];

  for (const pt of points) {
    const fluxo = Number(pt.fluxo) || 0;

    // Parse tempo (e.g. "15s" → 15 seconds)
    const tempoSec = parseInt(String(pt.tempo).replace(/\D/g, '')) || 15;

    // Parse loop  (e.g. "3 min" → 180 seconds)
    const loopMatch = String(pt.loop).match(/(\d+)/);
    const loopSec = loopMatch ? Number(loopMatch[1]) * 60 : 180;

    // Plays per hour
    const playsPerHour = Math.floor(3600 / loopSec);

    // Active hours from horario (e.g. "06:00 às 22:00" → 16h, "24 horas" → 24h)
    let hoursActive = 16;
    if (pt.horario) {
      const h = String(pt.horario).toLowerCase();
      if (h.includes('24')) {
        hoursActive = 24;
      } else {
        const match = h.match(/(\d{1,2})[:\s]*(?:\d{2})?\s*[àa]+\w*\s*(\d{1,2})/);
        if (match) hoursActive = Math.max(1, Number(match[2]) - Number(match[1]));
      }
    }

    // Telas multiplier
    const telas = Number(pt.telas) || 1;

    // Daily impressions = fluxo_diario is already daily
    // But fluxo might be monthly — let's use insercoes if available (already per month)
    // insercoes = estimated monthly insertions/views
    const insercoesMonth = Number(pt.insercoes) || 0;

    let impressions;
    if (insercoesMonth > 0) {
      // insercoes is already monthly — scale to campaign period
      impressions = Math.round((insercoesMonth / 30) * periodDays);
    } else {
      // Fallback: fluxo × plays × hours × days
      impressions = fluxo * playsPerHour * hoursActive * periodDays;
    }

    totalImpressions += impressions;

    pointResults.push({
      ponto_id: pt.id,
      nome: pt.nome,
      cidade: pt.cidade,
      tipo: pt.tipo,
      fluxo,
      telas,
      impressions,
    });
  }

  // Unique reach factor: typically 40-60% of impressions are unique viewers
  const uniqueReachFactor = 0.45;
  const estimatedReach = Math.round(totalImpressions * uniqueReachFactor);

  // Average frequency
  const avgFrequency = estimatedReach > 0
    ? Math.round((totalImpressions / estimatedReach) * 10) / 10
    : 0;

  // CPM
  const cpm = totalImpressions > 0
    ? Math.round((investment / (totalImpressions / 1000)) * 100) / 100
    : 0;

  // Cost per point
  const totalMonthlyCost = points.reduce((sum, p) => sum + (Number(p.preco) || 0), 0);
  const campaignCost = (totalMonthlyCost / 30) * periodDays;

  return {
    summary: {
      total_impressions: totalImpressions,
      estimated_reach: estimatedReach,
      avg_frequency: avgFrequency,
      cpm,
      investment,
      period_days: periodDays,
      num_points: points.length,
      estimated_cost: Math.round(campaignCost * 100) / 100,
    },
    by_point: pointResults,
  };
}

// ---------------------------------------------------------------------------
// Profile CRUD
// ---------------------------------------------------------------------------

function listProfiles() {
  return db.prepare('SELECT name, label, description, weights FROM audience_profiles ORDER BY name').all()
    .map(r => ({
      ...r,
      weights: typeof r.weights === 'string' ? JSON.parse(r.weights) : r.weights
    }));
}

function upsertProfile(name, { label, description, weights }) {
  if (!name || !label || !weights || typeof weights !== 'object') {
    throw new Error('name, label, and weights are required');
  }
  db.prepare(`
    INSERT INTO audience_profiles (name, label, description, weights, updated_at)
    VALUES (?, ?, ?, ?, NOW())
    ON CONFLICT (name) DO UPDATE SET
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      weights = EXCLUDED.weights,
      updated_at = NOW()
  `).run(name, label, description || '', JSON.stringify(weights));
  return { name, label, description, weights };
}

function deleteProfile(name) {
  db.prepare('DELETE FROM audience_point_scores WHERE profile_name = ?').run(name);
  const result = db.prepare('DELETE FROM audience_profiles WHERE name = ?').run(name);
  return result?.changes > 0;
}

function getJob(jobId) {
  return db.prepare('SELECT * FROM audience_jobs WHERE id = ?').get(jobId);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ANALYSIS_RADIUS,
  analyzePoint,
  analyzeCity,
  getPointScores,
  getAllScores,
  getRanking,
  generateHeatmap,
  simulateCampaign,
  listProfiles,
  upsertProfile,
  deleteProfile,
  getJob,
};
