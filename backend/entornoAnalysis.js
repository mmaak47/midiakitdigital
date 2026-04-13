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
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY
  || process.env.GOOGLE_MAPS_API_KEY
  || process.env.GOOGLE_API_KEY
  || process.env.GMAPS_API_KEY
  || '';
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY || '';
const AUTO_REFRESH_ENABLED = String(process.env.ENTORNO_AUTO_REFRESH_ENABLED || 'true').toLowerCase() !== 'false';
const AUTO_REFRESH_INTERVAL_MINUTES = Math.max(5, Number(process.env.ENTORNO_AUTO_REFRESH_INTERVAL_MINUTES) || 90);
const AUTO_REFRESH_RADIUS_RAW = process.env.ENTORNO_AUTO_REFRESH_RADIUS || DEFAULT_RADIUS;
const ALL_SEGMENTS_DEFAULT = 'clinica,hospital,educacao,escola,faculdade,automotivo,varejo,restaurante,imobiliaria,construtora,contabilidade,advocacia,industria,fitness,beleza,pet,farmacia,supermercado,financeiro,turismo,coworking,tecnologia';
const AUTO_REFRESH_SEGMENTS_RAW = String(process.env.ENTORNO_AUTO_REFRESH_SEGMENTS || ALL_SEGMENTS_DEFAULT);
const AUTO_REFRESH_CITIES = String(process.env.ENTORNO_AUTO_REFRESH_CITIES || '')
  .split(',')
  .map((item) => String(item || '').trim())
  .filter(Boolean);

// Legacy fallback — used only when segment_target_categories table has no data
const SEGMENT_CATEGORIES_LEGACY = {
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
  fitness: ['academia', 'crossfit', 'pilates', 'natacao', 'esporte', 'personal trainer'],
  beleza: ['salao de beleza', 'estetica', 'barbearia', 'spa', 'manicure', 'cosmeticos'],
  pet: ['pet shop', 'veterinario', 'clinica veterinaria', 'banho e tosa', 'racao'],
  farmacia: ['farmacia', 'drogaria', 'manipulacao', 'produtos naturais', 'laboratorio'],
  supermercado: ['supermercado', 'mercado', 'atacado', 'hortifruti', 'mercearia'],
  financeiro: ['banco', 'financeira', 'cooperativa de credito', 'corretora', 'contabilidade'],
  turismo: ['hotel', 'pousada', 'hostel', 'agencia de viagem', 'turismo', 'aluguel de carro'],
  coworking: ['coworking', 'escritorio compartilhado', 'sala comercial', 'centro empresarial'],
  tecnologia: ['tecnologia', 'informatica', 'software', 'startup', 'assistencia tecnica'],
  outro: []
};

// Category search aliases: maps DB category keys to search terms for each provider
const CATEGORY_SEARCH_TERMS = {
  pharmacy: ['farmacia', 'drogaria', 'pharmacy'],
  gym: ['academia', 'gym', 'fitness'],
  school: ['escola', 'colegio', 'school'],
  shopping_mall: ['shopping', 'centro comercial', 'mall'],
  residential_building: ['condominio', 'residencial', 'edificio residencial', 'apartment'],
  supermarket: ['supermercado', 'mercado', 'supermarket'],
  park: ['parque', 'praca', 'park'],
  beauty_salon: ['salao de beleza', 'estetica', 'beauty'],
  daycare: ['creche', 'berçario', 'daycare'],
  medical_center: ['centro medico', 'clinica', 'medical'],
  bus_station: ['rodoviaria', 'terminal', 'ponto de onibus', 'bus station'],
  parking_lot: ['estacionamento', 'parking'],
  hotel: ['hotel', 'pousada', 'hostel'],
  restaurant: ['restaurante', 'lanchonete', 'restaurant'],
  clinic: ['clinica', 'consultorio', 'clinic'],
  bookstore: ['livraria', 'bookstore'],
  stationery: ['papelaria', 'stationery'],
  church: ['igreja', 'templo', 'church'],
  coworking: ['coworking', 'escritorio compartilhado', 'cowork'],
  library: ['biblioteca', 'library'],
  cafe: ['cafeteria', 'cafe', 'coffee'],
  copy_shop: ['grafica', 'copiadora', 'copy shop'],
  bank: ['banco', 'agencia bancaria', 'bank'],
  office: ['escritorio', 'office', 'centro empresarial'],
  real_estate_agency: ['imobiliaria', 'real estate'],
  executive_restaurant: ['restaurante executivo', 'bistrô', 'fine dining'],
  luxury_condominium: ['condominio de luxo', 'alto padrao', 'luxury residential'],
  bar: ['bar', 'pub', 'lounge'],
  movie_theater: ['cinema', 'movie theater'],
  business_center: ['centro empresarial', 'business center'],
  registry_office: ['cartorio', 'registro', 'registry'],
  law_firm: ['advocacia', 'escritorio de advocacia', 'law firm'],
  court: ['forum', 'tribunal', 'court'],
  gas_station: ['posto de combustivel', 'gas station', 'fuel'],
  auto_parts: ['autopecas', 'auto parts'],
  logistics_center: ['logistica', 'centro de distribuicao', 'logistics'],
  warehouse: ['armazem', 'galpao', 'warehouse'],
  truck_stop: ['posto de parada', 'parada de caminhao', 'truck stop'],
  hardware_store: ['ferramentas', 'material de construcao', 'hardware'],
  industrial_zone: ['distrito industrial', 'zona industrial', 'industrial'],
  car_wash: ['lava rapido', 'lava jato', 'car wash'],
  insurance_agency: ['seguradora', 'seguros', 'insurance'],
  highway_access: ['acesso rodoviario', 'rodovia', 'highway'],
  supplement_store: ['suplementos', 'loja de suplementos', 'nutrition store'],
  sports_center: ['centro esportivo', 'quadra', 'sports center'],
  spa: ['spa', 'day spa', 'termas'],
  barber_shop: ['barbearia', 'barber shop'],
  pet_shop: ['pet shop', 'loja de animais', 'pet store'],
  veterinary: ['veterinario', 'clinica veterinaria', 'veterinary'],
  wholesale: ['atacado', 'atacadao', 'wholesale'],
  grocery: ['hortifruti', 'mercearia', 'sacolao', 'grocery'],
  financial_services: ['financeira', 'cooperativa de credito', 'corretora', 'financial'],
  credit_union: ['cooperativa de credito', 'sicoob', 'sicredi', 'credit union'],
  airport: ['aeroporto', 'airport'],
  tourist_attraction: ['ponto turistico', 'museu', 'monumento', 'tourist attraction'],
  travel_agency: ['agencia de viagem', 'travel agency'],
  tech_office: ['escritorio de tecnologia', 'startup', 'tech office'],
  university: ['universidade', 'faculdade', 'campus', 'university'],
  convention_center: ['centro de convencoes', 'eventos', 'convention center']
};

/**
 * Load target categories for a segment from the DB (audience-location model).
 * Returns array of { category, weight, searchTerms[] }.
 * Falls back to legacy categories (weight=5, no audience model) if DB has no data.
 */
function loadTargetCategories(segment) {
  const rows = db.prepare(
    'SELECT place_category, weight FROM segment_target_categories WHERE segment_id = ? ORDER BY weight DESC'
  ).all(segment);

  if (rows.length > 0) {
    return rows.map((row) => ({
      category: row.place_category,
      weight: row.weight,
      searchTerms: CATEGORY_SEARCH_TERMS[row.place_category] || [row.place_category]
    }));
  }

  // Legacy fallback
  const legacy = SEGMENT_CATEGORIES_LEGACY[segment] || [];
  return legacy.map((cat) => ({
    category: cat,
    weight: 5,
    searchTerms: [cat]
  }));
}

// Compat reference for normalizeSegment
const SEGMENT_CATEGORIES = (() => {
  const map = { ...SEGMENT_CATEGORIES_LEGACY };
  // Additional segments from DB will be resolved at runtime via loadTargetCategories
  return map;
})();

const jobQueue = [];
let activeJobId = null;
let autoRefreshTimer = null;
let autoRefreshState = {
  enabled: AUTO_REFRESH_ENABLED,
  intervalMinutes: AUTO_REFRESH_INTERVAL_MINUTES,
  radius: DEFAULT_RADIUS,
  segments: ALL_SEGMENTS_DEFAULT.split(','),
  cities: AUTO_REFRESH_CITIES,
  lastRunAt: null,
  lastQueued: [],
  lastError: null
};

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

/**
 * Match text against target categories (audience-location model).
 * Returns the matched target category object { category, weight, searchTerms } or null.
 */
function matchTargetCategory(tagsText, targetCategories) {
  for (const target of targetCategories) {
    for (const term of target.searchTerms) {
      if (tagsText.includes(normalize(term))) {
        return target;
      }
    }
  }
  return null;
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

function toMetricsFromMatches({ targetCategories, radius, matchedPlaces, provider }) {
  const uniqueCategories = [...new Set(matchedPlaces.map((item) => item.category))];
  const total = matchedPlaces.length;
  const avgDistance = total
    ? matchedPlaces.reduce((sum, place) => sum + place.distance, 0) / total
    : null;
  const totalCategories = targetCategories.length || uniqueCategories.length || 1;
  const diversityRatio = uniqueCategories.length / totalCategories;

  // Build per-category breakdown with weighted affinity scores
  const categoryBreakdown = {};
  for (const place of matchedPlaces) {
    if (!categoryBreakdown[place.category]) {
      categoryBreakdown[place.category] = { count: 0, weight: place.categoryWeight || 5 };
    }
    categoryBreakdown[place.category].count += 1;
  }

  // Compute affinity score: sum(count * weight) for each category
  let affinityScore = 0;
  const categoryContributions = [];
  for (const [cat, info] of Object.entries(categoryBreakdown)) {
    const contribution = info.count * info.weight;
    affinityScore += contribution;
    categoryContributions.push({
      category: cat,
      count: info.count,
      weight: info.weight,
      contribution
    });
  }
  categoryContributions.sort((a, b) => b.contribution - a.contribution);

  // Combined score: legacy relevance + affinity
  const legacyScore = scoreRelevance({ total, avgDistance: avgDistance || radius, diversityRatio, radius });
  const combinedScore = Number((legacyScore + affinityScore * 0.5).toFixed(2));

  return {
    provider,
    total,
    categoriesFound: uniqueCategories,
    avgDistance: avgDistance ? Number(avgDistance.toFixed(2)) : null,
    score: combinedScore,
    affinityScore: Number(affinityScore.toFixed(2)),
    categoryBreakdown: categoryContributions,
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
  const targetCategories = loadTargetCategories(segment);
  if (!targetCategories.length) {
    return {
      provider: 'osm',
      total: 0,
      categoriesFound: [],
      avgDistance: null,
      score: 0,
      affinityScore: 0,
      categoryBreakdown: [],
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

    const targetHit = matchTargetCategory(text, targetCategories);
    if (!targetHit) continue;

    const placeLat = Number(element.lat ?? element.center?.lat);
    const placeLng = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) continue;

    const distance = haversineMeters(lat, lng, placeLat, placeLng);
    if (distance > radius) continue;

    matchedPlaces.push({
      osmId: `${element.type || 'x'}-${element.id}`,
      category: targetHit.category,
      categoryWeight: targetHit.weight,
      distance,
      name: tags.name || null,
      lat: placeLat,
      lng: placeLng
    });
  }

  return toMetricsFromMatches({ targetCategories, radius, matchedPlaces, provider: 'osm' });
}

async function fetchNearbyFromGoogle({ lat, lng, radius, segment }) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key nao configurada');
  }

  const targetCategories = loadTargetCategories(segment);
  if (!targetCategories.length) {
    return {
      provider: 'google',
      total: 0,
      categoriesFound: [],
      avgDistance: null,
      score: 0,
      affinityScore: 0,
      categoryBreakdown: [],
      matchedPlaces: []
    };
  }

  const matchedPlaces = [];

  for (const target of targetCategories) {
    for (const keyword of target.searchTerms.slice(0, 2)) {
      const params = new URLSearchParams({
        location: `${lat},${lng}`,
        radius: String(radius),
        keyword,
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

        const osmLikeId = result.place_id || `${target.category}-${result.name || 'place'}`;
        if (matchedPlaces.some((item) => item.osmId === osmLikeId)) continue;

        matchedPlaces.push({
          osmId: osmLikeId,
          category: target.category,
          categoryWeight: target.weight,
          distance,
          name: result.name || null,
          lat: placeLat,
          lng: placeLng
        });
      }
    }
  }

  return toMetricsFromMatches({ targetCategories, radius, matchedPlaces, provider: 'google' });
}

async function fetchNearbyFromFoursquare({ lat, lng, radius, segment }) {
  if (!FOURSQUARE_API_KEY) {
    throw new Error('Foursquare API key nao configurada');
  }

  const targetCategories = loadTargetCategories(segment);
  if (!targetCategories.length) {
    return {
      provider: 'foursquare',
      total: 0,
      categoriesFound: [],
      avgDistance: null,
      score: 0,
      affinityScore: 0,
      categoryBreakdown: [],
      matchedPlaces: []
    };
  }

  const matchedPlaces = [];

  for (const target of targetCategories) {
    for (const keyword of target.searchTerms.slice(0, 2)) {
      const params = new URLSearchParams({
        ll: `${lat},${lng}`,
        radius: String(radius),
        query: keyword,
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
        const fsqId = result.fsq_id || `${target.category}-${result.name || 'place'}`;
        if (matchedPlaces.some((item) => item.osmId === fsqId)) continue;

        const distance = parseFoursquareDistance(result.distance);
        if (distance === null || distance > radius) continue;

        const placeLat = Number(result?.geocodes?.main?.latitude);
        const placeLng = Number(result?.geocodes?.main?.longitude);
        const hasCoords = Number.isFinite(placeLat) && Number.isFinite(placeLng);

        matchedPlaces.push({
          osmId: fsqId,
          category: target.category,
          categoryWeight: target.weight,
          distance,
          name: result.name || null,
          lat: hasCoords ? placeLat : null,
          lng: hasCoords ? placeLng : null
        });
      }
    }
  }

  return toMetricsFromMatches({ targetCategories, radius, matchedPlaces, provider: 'foursquare' });
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
      affinityScore: metrics.affinityScore || 0,
      categoryBreakdown: metrics.categoryBreakdown || [],
      places: metrics.matchedPlaces || []
    }),
    cacheExpiryIso()
  );
}

function hasFreshPointCache({ pointId, segment, radius }) {
  const row = db.prepare(`
    SELECT expires_at
    FROM entorno_cache
    WHERE ponto_id = ?
      AND segmento_analisado = ?
      AND raio_m = ?
    LIMIT 1
  `).get(pointId, segment, radius);

  if (!row?.expires_at) return false;
  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() > Date.now();
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
      ec.raw_result,
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
  return rows.map((row) => {
    let raw = {};
    try {
      raw = row.raw_result ? JSON.parse(row.raw_result) : {};
    } catch {
      raw = {};
    }

    return {
      ponto_id: row.ponto_id,
      latitude: row.latitude,
      longitude: row.longitude,
      segmento_analisado: row.segmento_analisado,
      raio_m: row.raio_m,
      total_estabelecimentos_relacionados: row.total_estabelecimentos_relacionados,
      categorias_encontradas: JSON.parse(row.categorias_encontradas || '[]'),
      distancia_media: row.distancia_media,
      score_relevancia: row.score_relevancia,
      affinity_score: raw.affinityScore || 0,
      category_breakdown: Array.isArray(raw.categoryBreakdown) ? raw.categoryBreakdown : [],
      provider: raw.provider || 'osm',
      places: Array.isArray(raw.places) ? raw.places.slice(0, 12) : [],
      updated_at: row.updated_at,
      expires_at: row.expires_at
    };
  });
}

function invalidatePointCache(pointId) {
  db.prepare('DELETE FROM entorno_cache WHERE ponto_id = ?').run(pointId);
}

function getSegmentCategories(segment) {
  const normalized = normalizeSegment(segment);
  const targets = loadTargetCategories(normalized);
  return {
    segment: normalized,
    categories: targets.map((t) => t.category),
    targetCategories: targets
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
      if (hasFreshPointCache({ pointId: point.id, segment, radius })) {
        continue;
      }

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

function getAutoRefreshSegments() {
  return AUTO_REFRESH_SEGMENTS_RAW
    .split(',')
    .map((item) => normalizeSegment(item))
    .filter(Boolean);
}

function getAutoRefreshRadius() {
  return normalizeRadius(AUTO_REFRESH_RADIUS_RAW);
}

function getAutoRefreshConfig() {
  return {
    enabled: AUTO_REFRESH_ENABLED,
    intervalMinutes: AUTO_REFRESH_INTERVAL_MINUTES,
    radius: getAutoRefreshRadius(),
    segments: getAutoRefreshSegments(),
    cities: AUTO_REFRESH_CITIES
  };
}

function getAutoRefreshState() {
  return {
    ...autoRefreshState,
    nextRunAt: autoRefreshState.lastRunAt
      ? new Date(new Date(autoRefreshState.lastRunAt).getTime() + AUTO_REFRESH_INTERVAL_MINUTES * 60 * 1000).toISOString()
      : null
  };
}

function runAutoRefreshCycle() {
  const queued = [];
  try {
    const segments = getAutoRefreshSegments().length ? getAutoRefreshSegments() : ALL_SEGMENTS_DEFAULT.split(',');
    const radius = getAutoRefreshRadius();
    const cities = AUTO_REFRESH_CITIES.length ? AUTO_REFRESH_CITIES : [''];

    for (const segment of segments) {
      for (const city of cities) {
        const result = enqueueJob({
          segment,
          radius,
          city: city || ''
        });
        queued.push(result);
      }
    }

    autoRefreshState = {
      ...autoRefreshState,
      lastRunAt: new Date().toISOString(),
      lastQueued: queued,
      lastError: null
    };
  } catch (err) {
    autoRefreshState = {
      ...autoRefreshState,
      lastRunAt: new Date().toISOString(),
      lastError: String(err?.message || err)
    };
  }
}

function startAutoRefreshScheduler() {
  if (!AUTO_REFRESH_ENABLED) {
    autoRefreshState = {
      ...autoRefreshState,
      enabled: false
    };
    return null;
  }

  autoRefreshState = {
    ...autoRefreshState,
    enabled: true,
    radius: getAutoRefreshRadius(),
    segments: getAutoRefreshSegments().length ? getAutoRefreshSegments() : ALL_SEGMENTS_DEFAULT.split(',')
  };

  if (autoRefreshTimer) return autoRefreshTimer;

  runAutoRefreshCycle();
  autoRefreshTimer = setInterval(runAutoRefreshCycle, AUTO_REFRESH_INTERVAL_MINUTES * 60 * 1000);
  if (typeof autoRefreshTimer.unref === 'function') {
    autoRefreshTimer.unref();
  }

  return autoRefreshTimer;
}

function stopAutoRefreshScheduler() {
  if (!autoRefreshTimer) return;
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

module.exports = {
  DEFAULT_RADIUS,
  SEGMENT_CATEGORIES,
  loadTargetCategories,
  getSegmentCategories,
  normalizeSegment,
  normalizeRadius,
  geocodeAddress,
  enqueueJob,
  getJob,
  listJobs,
  getScoresWithCoverage,
  invalidatePointCache,
  getProviderRuntimeInfo,
  startAutoRefreshScheduler,
  stopAutoRefreshScheduler,
  getAutoRefreshConfig,
  getAutoRefreshState,
  runAutoRefreshCycle
};
