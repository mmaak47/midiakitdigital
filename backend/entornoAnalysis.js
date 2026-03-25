const db = require('./database');

const OVERPASS_ENDPOINT = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';
const NOMINATIM_ENDPOINT = process.env.NOMINATIM_API_URL || 'https://nominatim.openstreetmap.org/search';
const GOOGLE_PLACES_ENDPOINT = process.env.GOOGLE_PLACES_NEARBY_URL || 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const FOURSQUARE_PLACES_ENDPOINT = process.env.FOURSQUARE_PLACES_URL || 'https://api.foursquare.com/v3/places/search';
const DEFAULT_RADIUS = Number(process.env.ENTORNO_DEFAULT_RADIUS_METERS) || 800;
const MIN_RADIUS = 200;
const MAX_RADIUS = 2000;
const CACHE_TTL_HOURS = Number(process.env.ENTORNO_CACHE_TTL_HOURS) || 72;
const FETCH_TIMEOUT_MS = Number(process.env.ENTORNO_FETCH_TIMEOUT_MS) || 12000;
const PLACES_PROVIDER = String(process.env.ENTORNO_PLACES_PROVIDER || 'auto').toLowerCase();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY || '';

const SEGMENT_CATEGORIES = {
  clinica: ['hospital', 'farmacia', 'clinica', 'laboratorio', 'consultorio odontologico', 'pronto atendimento', 'centro medico'],
  hospital: ['hospital', 'farmacia', 'clinica', 'laboratorio', 'pronto atendimento', 'saude', 'centro medico'],
  educacao: ['escola', 'faculdade', 'universidade', 'curso', 'biblioteca', 'colegio'],
  escola: ['escola', 'faculdade', 'universidade', 'curso', 'biblioteca', 'colegio'],
  faculdade: ['faculdade', 'universidade', 'campus', 'curso', 'colegio', 'biblioteca'],
  automotivo: ['concessionaria', 'oficina', 'autopecas', 'lava rapido', 'posto de combustivel'],
  varejo: ['shopping', 'supermercado', 'loja', 'centro comercial', 'galeria'],
  restaurante: ['restaurante', 'lanchonete', 'bar', 'cafeteria', 'delivery'],
  imobiliaria: ['imobiliaria', 'construtora', 'centro comercial', 'escritorio', 'cartorio'],
  construtora: ['construtora', 'imobiliaria', 'material de construcao', 'engenharia', 'decoracao'],
  contabilidade: ['contabilidade', 'escritorio', 'consultoria', 'cartorio', 'centro empresarial'],
  advocacia: ['advocacia', 'forum', 'cartorio', 'escritorio', 'tribunal'],
  industria: ['posto de combustivel', 'autopecas', 'logistica', 'transportadora', 'ferramentas'],
  outro: []
};

const jobQueue = [];
let activeJobId = null;

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeSegment(segment) {
  const value = normalize(segment);
  return SEGMENT_CATEGORIES[value] ? value : 'outro';
}

function normalizeRadius(value) {
  const radius = Number(value);
  if (!Number.isFinite(radius)) return DEFAULT_RADIUS;
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Math.round(radius)));
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

async function fetchJson(url, options = {}) {
  const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'intermidia-midiakit/1.0 (entorno-analysis)',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clear();
  }
}

function pickPointCoordinates(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001) {
    return { lat, lng, source: 'point' };
  }
  return null;
}

async function geocodeAddress(address) {
  if (!address) return null;
  const params = new URLSearchParams({
    q: address,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'br'
  });

  const payload = await fetchJson(`${NOMINATIM_ENDPOINT}?${params.toString()}`);
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, source: 'nominatim' };
}

function overpassQuery(lat, lng, radius) {
  return `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lng})[amenity];
  way(around:${radius},${lat},${lng})[amenity];
  node(around:${radius},${lat},${lng})[shop];
  way(around:${radius},${lat},${lng})[shop];
  node(around:${radius},${lat},${lng})[healthcare];
  way(around:${radius},${lat},${lng})[healthcare];
  node(around:${radius},${lat},${lng})[office];
  way(around:${radius},${lat},${lng})[office];
  node(around:${radius},${lat},${lng})[tourism];
  way(around:${radius},${lat},${lng})[tourism];
);
out center tags;
`;
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return earthRadius * c;
}

function matchesAnyCategory(tagsText, categories) {
  return categories.find((category) => tagsText.includes(normalize(category))) || null;
}

function buildProviderChain() {
  if (PLACES_PROVIDER === 'google') return ['google'];
  if (PLACES_PROVIDER === 'foursquare') return ['foursquare'];
  if (PLACES_PROVIDER === 'osm') return ['osm'];
  return ['osm', 'google', 'foursquare'];
}

function providerAvailable(provider) {
  if (provider === 'google') return Boolean(GOOGLE_PLACES_API_KEY);
  if (provider === 'foursquare') return Boolean(FOURSQUARE_API_KEY);
  return true;
}

function toMetricsFromMatches({ categories, radius, matchedPlaces, provider }) {
  const uniqueCategories = [...new Set(matchedPlaces.map((item) => item.category))];
  const total = matchedPlaces.length;
  const avgDistance = total
    ? matchedPlaces.reduce((sum, place) => sum + place.distance, 0) / total
    : null;
  const diversityRatio = categories.length ? uniqueCategories.length / categories.length : 0;

  return {
    provider,
    total,
    categoriesFound: uniqueCategories,
    avgDistance: avgDistance ? Number(avgDistance.toFixed(2)) : null,
    score: scoreRelevance({ total, avgDistance: avgDistance || radius, diversityRatio, radius }),
    matchedPlaces: matchedPlaces.slice(0, 120)
  };
}

function parseFoursquareDistance(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function scoreRelevance({ total, avgDistance, diversityRatio, radius }) {
  if (!total) return 0;

  const weightQuantity = 1.1;
  const weightDistance = 30;
  const weightDiversity = 24;

  const proximity = Math.max(0, 1 - (avgDistance / Math.max(radius, 1)));
  const raw = total * weightQuantity + proximity * weightDistance + diversityRatio * weightDiversity;
  return Number(raw.toFixed(2));
}

async function fetchNearbyFromOsm({ lat, lng, radius, segment }) {
  const categories = SEGMENT_CATEGORIES[segment] || [];
  if (!categories.length) {
    return {
      provider: 'osm',
      total: 0,
      categoriesFound: [],
      avgDistance: null,
      score: 0,
      matchedPlaces: []
    };
  }

  const query = overpassQuery(lat, lng, radius);
  const payload = await fetchJson(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: query
  });

  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const matchedPlaces = [];

  for (const element of elements) {
    const tags = element.tags || {};
    const text = normalize([
      tags.name,
      tags.amenity,
      tags.shop,
      tags.healthcare,
      tags.office,
      tags.tourism,
      tags.description
    ].filter(Boolean).join(' '));

    const categoryHit = matchesAnyCategory(text, categories);
    if (!categoryHit) continue;

    const placeLat = Number(element.lat ?? element.center?.lat);
    const placeLng = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) continue;

    const distance = haversineMeters(lat, lng, placeLat, placeLng);
    if (distance > radius) continue;

    matchedPlaces.push({
      osmId: `${element.type || 'x'}-${element.id}`,
      category: categoryHit,
      distance,
      name: tags.name || null
    });
  }

  return toMetricsFromMatches({ categories, radius, matchedPlaces, provider: 'osm' });
}

async function fetchNearbyFromGoogle({ lat, lng, radius, segment }) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key nao configurada');
  }

  const categories = SEGMENT_CATEGORIES[segment] || [];
  if (!categories.length) {
    return {
      provider: 'google',
      total: 0,
      categoriesFound: [],
      avgDistance: null,
      score: 0,
      matchedPlaces: []
    };
  }

  const matchedPlaces = [];

  for (const category of categories) {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radius),
      keyword: category,
      language: 'pt-BR',
      key: GOOGLE_PLACES_API_KEY
    });

    const payload = await fetchJson(`${GOOGLE_PLACES_ENDPOINT}?${params.toString()}`);
    const results = Array.isArray(payload?.results) ? payload.results : [];

    for (const result of results) {
      const placeLat = Number(result?.geometry?.location?.lat);
      const placeLng = Number(result?.geometry?.location?.lng);
      if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) continue;

      const distance = haversineMeters(lat, lng, placeLat, placeLng);
      if (distance > radius) continue;

      const osmLikeId = result.place_id || `${category}-${result.name || 'place'}`;
      if (matchedPlaces.some((item) => item.osmId === osmLikeId)) continue;

      matchedPlaces.push({
        osmId: osmLikeId,
        category,
        distance,
        name: result.name || null
      });
    }
  }

  return toMetricsFromMatches({ categories, radius, matchedPlaces, provider: 'google' });
}

async function fetchNearbyFromFoursquare({ lat, lng, radius, segment }) {
  if (!FOURSQUARE_API_KEY) {
    throw new Error('Foursquare API key nao configurada');
  }

  const categories = SEGMENT_CATEGORIES[segment] || [];
  if (!categories.length) {
    return {
      provider: 'foursquare',
      total: 0,
      categoriesFound: [],
      avgDistance: null,
      score: 0,
      matchedPlaces: []
    };
  }

  const matchedPlaces = [];

  for (const category of categories) {
    const params = new URLSearchParams({
      ll: `${lat},${lng}`,
      radius: String(radius),
      query: category,
      limit: '30'
    });

    const payload = await fetchJson(`${FOURSQUARE_PLACES_ENDPOINT}?${params.toString()}`, {
      headers: {
        Authorization: FOURSQUARE_API_KEY,
        accept: 'application/json'
      }
    });
    const results = Array.isArray(payload?.results) ? payload.results : [];

    for (const result of results) {
      const fsqId = result.fsq_id || `${category}-${result.name || 'place'}`;
      if (matchedPlaces.some((item) => item.osmId === fsqId)) continue;

      const distance = parseFoursquareDistance(result.distance);
      if (distance === null || distance > radius) continue;

      matchedPlaces.push({
        osmId: fsqId,
        category,
        distance,
        name: result.name || null
      });
    }
  }

  return toMetricsFromMatches({ categories, radius, matchedPlaces, provider: 'foursquare' });
}

async function fetchNearbyForSegment({ lat, lng, radius, segment }) {
  const chain = buildProviderChain().filter(providerAvailable);
  if (!chain.length) {
    throw new Error('Nenhum provedor de places disponivel. Configure keys ou ENTORNO_PLACES_PROVIDER=osm');
  }

  let lastError = null;
  for (const provider of chain) {
    try {
      if (provider === 'google') {
        return await fetchNearbyFromGoogle({ lat, lng, radius, segment });
      }
      if (provider === 'foursquare') {
        return await fetchNearbyFromFoursquare({ lat, lng, radius, segment });
      }
      return await fetchNearbyFromOsm({ lat, lng, radius, segment });
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Falha ao buscar estabelecimentos no entorno');
}

function cacheExpiryIso() {
  return new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000).toISOString();
}

function upsertEntornoCache({ pointId, lat, lng, segment, radius, metrics }) {
  const stmt = db.prepare(`
    INSERT INTO entorno_cache (
      ponto_id, latitude, longitude, segmento_analisado, raio_m,
      total_estabelecimentos_relacionados, categorias_encontradas, distancia_media,
      score_relevancia, raw_result, updated_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(ponto_id, segmento_analisado, raio_m)
    DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      total_estabelecimentos_relacionados = excluded.total_estabelecimentos_relacionados,
      categorias_encontradas = excluded.categorias_encontradas,
      distancia_media = excluded.distancia_media,
      score_relevancia = excluded.score_relevancia,
      raw_result = excluded.raw_result,
      updated_at = datetime('now'),
      expires_at = excluded.expires_at
  `);

  stmt.run(
    pointId,
    lat,
    lng,
    segment,
    radius,
    metrics.total,
    JSON.stringify(metrics.categoriesFound || []),
    metrics.avgDistance,
    metrics.score,
    JSON.stringify({
      provider: metrics.provider || 'osm',
      total: metrics.total,
      categoriesFound: metrics.categoriesFound,
      avgDistance: metrics.avgDistance,
      places: metrics.matchedPlaces || []
    }),
    cacheExpiryIso()
  );
}

function listScores({ segment, radius, city }) {
  const params = [segment, radius];
  let sql = `
    SELECT
      ec.ponto_id,
      ec.latitude,
      ec.longitude,
      ec.segmento_analisado,
      ec.raio_m,
      ec.total_estabelecimentos_relacionados,
      ec.categorias_encontradas,
      ec.distancia_media,
      ec.score_relevancia,
      ec.updated_at,
      ec.expires_at
    FROM entorno_cache ec
    JOIN pontos p ON p.id = ec.ponto_id
    WHERE p.ativo = 1
      AND ec.segmento_analisado = ?
      AND ec.raio_m = ?
  `;

  if (city) {
    sql += ' AND p.cidade = ?';
    params.push(city);
  }

  sql += ' ORDER BY ec.score_relevancia DESC, ec.total_estabelecimentos_relacionados DESC';

  const rows = db.prepare(sql).all(...params);
  return rows.map((row) => ({
    ponto_id: row.ponto_id,
    latitude: row.latitude,
    longitude: row.longitude,
    segmento_analisado: row.segmento_analisado,
    raio_m: row.raio_m,
    total_estabelecimentos_relacionados: row.total_estabelecimentos_relacionados,
    categorias_encontradas: JSON.parse(row.categorias_encontradas || '[]'),
    distancia_media: row.distancia_media,
    score_relevancia: row.score_relevancia,
    updated_at: row.updated_at,
    expires_at: row.expires_at
  }));
}

function invalidatePointCache(pointId) {
  db.prepare('DELETE FROM entorno_cache WHERE ponto_id = ?').run(pointId);
}

function getSegmentCategories(segment) {
  const normalized = normalizeSegment(segment);
  return {
    segment: normalized,
    categories: SEGMENT_CATEGORIES[normalized] || []
  };
}

function getJob(jobId) {
  return db.prepare('SELECT * FROM entorno_jobs WHERE id = ?').get(jobId);
}

function listJobs({ limit = 20, status, segment, city } = {}) {
  const params = [];
  let sql = 'SELECT * FROM entorno_jobs WHERE 1=1';

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (segment) {
    sql += ' AND segmento_analisado = ?';
    params.push(normalizeSegment(segment));
  }
  if (city) {
    sql += ' AND cidade = ?';
    params.push(city);
  }

  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(Math.max(1, Math.min(100, Number(limit) || 20)));

  return db.prepare(sql).all(...params);
}

function getRecentJob(segment, radius, city) {
  const cityValue = city || '';
  return db.prepare(`
    SELECT * FROM entorno_jobs
    WHERE segmento_analisado = ? AND raio_m = ? AND cidade = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(segment, radius, cityValue);
}

function createJob({ segment, radius, city }) {
  const cityValue = city || '';
  const result = db.prepare(`
    INSERT INTO entorno_jobs (
      segmento_analisado, raio_m, cidade, status, total_points,
      processed_points, error_count, created_at, updated_at
    ) VALUES (?, ?, ?, 'queued', 0, 0, 0, datetime('now'), datetime('now'))
  `).run(segment, radius, cityValue);
  return result.lastInsertRowid;
}

function updateJobProgress(jobId, patch = {}) {
  const current = getJob(jobId);
  if (!current) return;

  db.prepare(`
    UPDATE entorno_jobs SET
      status = ?,
      total_points = ?,
      processed_points = ?,
      error_count = ?,
      last_error = ?,
      started_at = ?,
      finished_at = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    patch.status || current.status,
    patch.total_points ?? current.total_points,
    patch.processed_points ?? current.processed_points,
    patch.error_count ?? current.error_count,
    patch.last_error ?? current.last_error,
    patch.started_at ?? current.started_at,
    patch.finished_at ?? current.finished_at,
    jobId
  );
}

async function ensurePointCoordinates(point) {
  const existing = pickPointCoordinates(point);
  if (existing) return existing;

  const geocoded = await geocodeAddress(point.endereco);
  if (!geocoded) return null;

  db.prepare(`
    UPDATE pontos
    SET lat = ?, lng = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(geocoded.lat, geocoded.lng, point.id);

  return geocoded;
}

async function processJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  const segment = normalizeSegment(job.segmento_analisado);
  const radius = normalizeRadius(job.raio_m);
  const city = job.cidade || '';

  const points = city
    ? db.prepare('SELECT * FROM pontos WHERE ativo = 1 AND cidade = ? ORDER BY id').all(city)
    : db.prepare('SELECT * FROM pontos WHERE ativo = 1 ORDER BY id').all();

  updateJobProgress(jobId, {
    status: 'running',
    total_points: points.length,
    processed_points: 0,
    error_count: 0,
    last_error: null,
    started_at: new Date().toISOString()
  });

  let processed = 0;
  let errors = 0;

  for (const point of points) {
    try {
      const coords = await ensurePointCoordinates(point);
      if (!coords) {
        errors += 1;
      } else {
        const metrics = await fetchNearbyForSegment({
          lat: coords.lat,
          lng: coords.lng,
          radius,
          segment
        });

        upsertEntornoCache({
          pointId: point.id,
          lat: coords.lat,
          lng: coords.lng,
          segment,
          radius,
          metrics
        });
      }
    } catch (err) {
      errors += 1;
      updateJobProgress(jobId, {
        last_error: String(err?.message || err)
      });
    } finally {
      processed += 1;
      if (processed % 5 === 0 || processed === points.length) {
        updateJobProgress(jobId, {
          processed_points: processed,
          error_count: errors
        });
      }
    }
  }

  updateJobProgress(jobId, {
    status: 'completed',
    processed_points: processed,
    error_count: errors,
    finished_at: new Date().toISOString()
  });
}

async function processQueue() {
  if (activeJobId || !jobQueue.length) return;

  const nextJob = jobQueue.shift();
  activeJobId = nextJob;

  try {
    await processJob(nextJob);
  } catch (err) {
    updateJobProgress(nextJob, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      last_error: String(err?.message || err)
    });
  } finally {
    activeJobId = null;
    setImmediate(processQueue);
  }
}

function enqueueJob({ segment, radius, city = '' }) {
  const normalizedSegment = normalizeSegment(segment);
  const normalizedRadius = normalizeRadius(radius);

  const recent = getRecentJob(normalizedSegment, normalizedRadius, city);
  if (recent && (recent.status === 'queued' || recent.status === 'running')) {
    return {
      jobId: recent.id,
      deduplicated: true,
      segment: normalizedSegment,
      radius: normalizedRadius,
      city
    };
  }

  const jobId = createJob({
    segment: normalizedSegment,
    radius: normalizedRadius,
    city
  });

  jobQueue.push(jobId);
  setImmediate(processQueue);

  return {
    jobId,
    deduplicated: false,
    segment: normalizedSegment,
    radius: normalizedRadius,
    city
  };
}

function isExpired(isoString) {
  if (!isoString) return true;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() <= Date.now();
}

function buildScoreMap(metrics) {
  return metrics.reduce((acc, row) => {
    acc[row.ponto_id] = row;
    return acc;
  }, {});
}

function getScoresWithCoverage({ segment, radius, city }) {
  const metrics = listScores({ segment, radius, city });
  const totalPoints = city
    ? db.prepare('SELECT COUNT(*) as c FROM pontos WHERE ativo = 1 AND cidade = ?').get(city).c
    : db.prepare('SELECT COUNT(*) as c FROM pontos WHERE ativo = 1').get().c;

  const freshMetrics = metrics.filter((item) => !isExpired(item.expires_at));
  const fresh = freshMetrics.length;
  const coverage = totalPoints > 0 ? fresh / totalPoints : 0;

  return {
    metrics: freshMetrics,
    byPoint: buildScoreMap(freshMetrics),
    totalPoints,
    freshPoints: fresh,
    coverage
  };
}

function getProviderRuntimeInfo() {
  return {
    configuredProvider: PLACES_PROVIDER,
    providerOrder: buildProviderChain(),
    availableProviders: {
      osm: true,
      google: Boolean(GOOGLE_PLACES_API_KEY),
      foursquare: Boolean(FOURSQUARE_API_KEY)
    }
  };
}

module.exports = {
  DEFAULT_RADIUS,
  SEGMENT_CATEGORIES,
  getSegmentCategories,
  normalizeSegment,
  normalizeRadius,
  enqueueJob,
  getJob,
  listJobs,
  getScoresWithCoverage,
  invalidatePointCache,
  getProviderRuntimeInfo
};
