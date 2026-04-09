'use strict';

/**
 * GeoAudience Intelligence Service
 *
 * Analyses the 400m radius around every media point using OpenStreetMap Overpass
 * and IBGE demographic APIs to auto-classify the neighbourhood and build a rich
 * audience profile.
 *
 * Data sources:
 *  - OSM Overpass: universal POI query (amenity, shop, office, healthcare, leisure, tourism, building)
 *  - IBGE Agregados API: city-level population + PIB per capita
 *  - IBGE Localidades API: territorial context (already in frontend ibge.js, replicated here)
 */

const db = require('./database');

// ─── Configuration ───────────────────────────────────────────────────────────
const OVERPASS_ENDPOINT = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';
const IBGE_AGREGADOS_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados';
const IBGE_LOCALIDADES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const GEO_RADIUS = Number(process.env.GEOAUDIENCE_RADIUS) || 800;
const FETCH_TIMEOUT_MS = Number(process.env.GEOAUDIENCE_FETCH_TIMEOUT_MS) || 15000;
const CACHE_TTL_HOURS = Number(process.env.GEOAUDIENCE_CACHE_TTL_HOURS) || 168; // 1 week
const BATCH_DELAY_MS = 1200; // delay between Overpass requests to avoid rate limiting

// ─── Functional POI Groups ──────────────────────────────────────────────────
// Maps OSM tag values to functional groups used for neighbourhood classification.
// Each element: { tagKey: [values ...] }. '*' means any value for that tag.
const FUNCTIONAL_GROUPS = {
  corporate: {
    office: ['*'],
    amenity: ['bank', 'bureau_de_change', 'coworking_space']
  },
  commercial: {
    shop: ['supermarket', 'convenience', 'clothes', 'shoes', 'mobile_phone', 'electronics',
      'department_store', 'mall', 'optician', 'jewelry', 'gift', 'toys', 'variety_store',
      'furniture', 'hardware', 'trade', 'stationery', 'photo', 'fabric', 'watches', 'bag'],
    amenity: ['marketplace', 'post_office']
  },
  food: {
    amenity: ['restaurant', 'fast_food', 'cafe', 'food_court', 'ice_cream', 'bar', 'pub', 'biergarten'],
    shop: ['bakery', 'butcher', 'confectionery', 'deli', 'greengrocer', 'pastry', 'coffee',
      'seafood', 'cheese', 'beverages', 'alcohol', 'wine']
  },
  health: {
    amenity: ['hospital', 'clinic', 'doctors', 'dentist', 'veterinary'],
    healthcare: ['*'],
    shop: ['pharmacy', 'chemist', 'medical_supply', 'hearing_aids', 'herbalist']
  },
  education: {
    amenity: ['school', 'university', 'college', 'kindergarten', 'library',
      'language_school', 'music_school', 'driving_school', 'training']
  },
  leisure: {
    amenity: ['cinema', 'theatre', 'casino', 'arts_centre', 'nightclub', 'community_centre'],
    tourism: ['museum', 'gallery', 'theme_park', 'attraction', 'viewpoint', 'zoo'],
    leisure: ['dance', 'escape_game', 'amusement_arcade', 'bowling_alley', 'miniature_golf']
  },
  fitness: {
    leisure: ['sports_centre', 'fitness_centre', 'swimming_pool', 'pitch', 'track', 'stadium'],
    shop: ['sports']
  },
  transport: {
    amenity: ['bus_station', 'taxi', 'car_rental', 'fuel', 'parking', 'bicycle_rental',
      'ferry_terminal', 'car_wash'],
    shop: ['car', 'car_repair', 'car_parts', 'motorcycle', 'tyres']
  },
  residential: {
    building: ['residential', 'apartments', 'house', 'detached', 'terrace', 'dormitory'],
    amenity: ['childcare', 'social_facility']
  },
  beauty: {
    shop: ['beauty', 'hairdresser', 'cosmetics', 'perfumery', 'tattoo'],
    amenity: ['spa']
  },
  hospitality: {
    tourism: ['hotel', 'motel', 'hostel', 'guest_house', 'apartment', 'camp_site', 'chalet']
  },
  religious: {
    amenity: ['place_of_worship']
  },
  green: {
    leisure: ['park', 'garden', 'nature_reserve', 'playground', 'dog_park'],
    amenity: ['fountain']
  }
};

// Full list of tag keys we query from Overpass
const TAG_KEYS_QUERIED = ['amenity', 'shop', 'healthcare', 'office', 'tourism', 'leisure', 'building'];

// ─── Neighbourhood Type Definitions ─────────────────────────────────────────
// Each type contains a vector of expected proportions per functional group
// and metadata for display.
const NEIGHBORHOOD_TYPES = {
  centro_corporativo: {
    label: 'Centro Corporativo',
    icon: 'Building2',
    vector: { corporate: 0.25, food: 0.20, commercial: 0.15, transport: 0.10, health: 0.05 },
    socioeconomic: 'alto',
    environment: 'corporativo',
    dominantActivity: 'Escritórios, serviços financeiros e alimentação executiva',
    lifestyle: ['executivo', 'corporativo', 'alta_renda']
  },
  zona_comercial: {
    label: 'Zona Comercial',
    icon: 'ShoppingBag',
    vector: { commercial: 0.30, food: 0.20, transport: 0.10, health: 0.08 },
    socioeconomic: 'medio-alto',
    environment: 'comercial',
    dominantActivity: 'Comércio varejista, alimentação e serviços',
    lifestyle: ['consumo', 'varejo', 'servicos']
  },
  residencial_premium: {
    label: 'Residencial Premium',
    icon: 'Home',
    vector: { residential: 0.20, fitness: 0.12, beauty: 0.10, food: 0.15, green: 0.10 },
    socioeconomic: 'alto',
    environment: 'residencial alto padrão',
    dominantActivity: 'Moradia de alto padrão, lazer e bem-estar',
    lifestyle: ['premium', 'bem_estar', 'alta_renda', 'fitness']
  },
  residencial_medio: {
    label: 'Residencial Médio',
    icon: 'Home',
    vector: { residential: 0.25, commercial: 0.15, transport: 0.12, health: 0.10, education: 0.08 },
    socioeconomic: 'medio',
    environment: 'residencial',
    dominantActivity: 'Moradia, comércio local e serviços essenciais',
    lifestyle: ['familiar', 'servicos_basicos']
  },
  zona_universitaria: {
    label: 'Zona Universitária',
    icon: 'GraduationCap',
    vector: { education: 0.30, food: 0.20, commercial: 0.10, leisure: 0.10 },
    socioeconomic: 'medio',
    environment: 'universitário',
    dominantActivity: 'Ensino superior, alimentação e serviços estudantis',
    lifestyle: ['jovem', 'universitario', 'cultural']
  },
  zona_lazer: {
    label: 'Zona de Lazer e Entretenimento',
    icon: 'PartyPopper',
    vector: { food: 0.25, leisure: 0.20, hospitality: 0.10, beauty: 0.05 },
    socioeconomic: 'medio-alto',
    environment: 'entretenimento',
    dominantActivity: 'Gastronomia, bares, entretenimento e hotelaria',
    lifestyle: ['noturno', 'gastronomia', 'turismo']
  },
  zona_popular_densa: {
    label: 'Zona Popular de Alta Densidade',
    icon: 'Users',
    vector: { transport: 0.20, commercial: 0.20, food: 0.15, residential: 0.15 },
    socioeconomic: 'medio-baixo',
    environment: 'popular denso',
    dominantActivity: 'Transporte público, comércio popular e serviços essenciais',
    lifestyle: ['popular', 'transporte_publico', 'alta_densidade']
  },
  polo_saude: {
    label: 'Polo de Saúde',
    icon: 'Heart',
    vector: { health: 0.35, food: 0.15, commercial: 0.10, transport: 0.08 },
    socioeconomic: 'medio-alto',
    environment: 'saúde',
    dominantActivity: 'Hospitais, clínicas, farmácias e serviços médicos',
    lifestyle: ['saude', 'bem_estar', 'servicos_medicos']
  },
  polo_educacional: {
    label: 'Polo Educacional',
    icon: 'BookOpen',
    vector: { education: 0.30, commercial: 0.15, food: 0.15, transport: 0.08 },
    socioeconomic: 'medio',
    environment: 'educacional',
    dominantActivity: 'Escolas, cursos, livrarias e serviços educacionais',
    lifestyle: ['educacao', 'familiar', 'jovem']
  }
};

// ─── Socioeconomic indicators (premium POI presence) ────────────────────────
const PREMIUM_INDICATORS = new Set([
  'coworking_space', 'spa', 'gym', 'fitness_centre', 'sports_centre', 'swimming_pool'
]);
const PREMIUM_SHOP_INDICATORS = new Set([
  'beauty', 'cosmetics', 'perfumery', 'jewelry', 'watches', 'wine'
]);

// ─── Segment ↔ Neighbourhood Affinity Matrix ────────────────────────────────
// Each segment has bonus multipliers per neighbourhood type (1.0 = neutral)
const SEGMENT_NEIGHBORHOOD_AFFINITY = {
  clinica:       { polo_saude: 1.8, residencial_premium: 1.4, centro_corporativo: 1.2 },
  hospital:      { polo_saude: 1.9, residencial_medio: 1.2 },
  escola:        { polo_educacional: 1.8, residencial_medio: 1.5, residencial_premium: 1.3 },
  faculdade:     { zona_universitaria: 1.9, zona_lazer: 1.2, polo_educacional: 1.4 },
  construtora:   { residencial_premium: 1.6, centro_corporativo: 1.3, residencial_medio: 1.2 },
  imobiliaria:   { residencial_premium: 1.7, centro_corporativo: 1.3, zona_comercial: 1.2 },
  varejo:        { zona_comercial: 1.8, zona_popular_densa: 1.4, residencial_medio: 1.2 },
  restaurante:   { zona_lazer: 1.7, zona_comercial: 1.4, centro_corporativo: 1.3 },
  contabilidade: { centro_corporativo: 1.8, zona_comercial: 1.3 },
  advocacia:     { centro_corporativo: 1.8, zona_comercial: 1.2 },
  industria:     { zona_popular_densa: 1.3, zona_comercial: 1.2 },
  outro:         {}
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
        'User-Agent': 'intermidia-midiakit/1.0 (geoaudience)',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clear();
  }
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Overpass Query (universal — not segment-specific) ──────────────────────

function buildOverpassQuery(lat, lng, radius) {
  return `
[out:json][timeout:30];
(
  node(around:${radius},${lat},${lng})["amenity"];
  way(around:${radius},${lat},${lng})["amenity"];
  node(around:${radius},${lat},${lng})["shop"];
  way(around:${radius},${lat},${lng})["shop"];
  node(around:${radius},${lat},${lng})["office"];
  way(around:${radius},${lat},${lng})["office"];
  node(around:${radius},${lat},${lng})["healthcare"];
  way(around:${radius},${lat},${lng})["healthcare"];
  node(around:${radius},${lat},${lng})["tourism"];
  way(around:${radius},${lat},${lng})["tourism"];
  node(around:${radius},${lat},${lng})["leisure"];
  way(around:${radius},${lat},${lng})["leisure"];
  node(around:${radius},${lat},${lng})["building"~"residential|apartments|commercial|office|retail|hotel|hospital|school|university"];
  way(around:${radius},${lat},${lng})["building"~"residential|apartments|commercial|office|retail|hotel|hospital|school|university"];
);
out center tags;
`;
}

// ─── POI Classification ─────────────────────────────────────────────────────

/**
 * Classify a single OSM element into one of the functional groups.
 * Returns the group name or null if unclassified.
 */
function classifyElement(tags) {
  for (const [group, rules] of Object.entries(FUNCTIONAL_GROUPS)) {
    for (const tagKey of TAG_KEYS_QUERIED) {
      const acceptedValues = rules[tagKey];
      if (!acceptedValues) continue;

      const actual = tags[tagKey];
      if (!actual) continue;

      if (acceptedValues.includes('*') || acceptedValues.includes(actual)) {
        return group;
      }
    }
  }
  return null;
}

/**
 * Fetch all POIs within radius around (lat, lng) from Overpass and classify them.
 */
async function fetchAndClassifyPOIs(lat, lng, radius) {
  const query = buildOverpassQuery(lat, lng, radius);
  const payload = await fetchJson(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: query
  });

  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const groupCounts = {};
  const poiDetails = [];
  let premiumCount = 0;

  for (const group of Object.keys(FUNCTIONAL_GROUPS)) {
    groupCounts[group] = 0;
  }

  for (const el of elements) {
    const tags = el.tags || {};
    const group = classifyElement(tags);
    if (!group) continue;

    groupCounts[group]++;

    const placeLat = Number(el.lat ?? el.center?.lat);
    const placeLng = Number(el.lon ?? el.center?.lon);
    const distance = (Number.isFinite(placeLat) && Number.isFinite(placeLng))
      ? haversineMeters(lat, lng, placeLat, placeLng)
      : null;

    // Track premium indicators
    for (const key of TAG_KEYS_QUERIED) {
      const val = tags[key];
      if (val && (PREMIUM_INDICATORS.has(val) || PREMIUM_SHOP_INDICATORS.has(val))) {
        premiumCount++;
        break;
      }
    }

    poiDetails.push({
      group,
      name: tags.name || null,
      distance: distance ? Number(distance.toFixed(1)) : null,
      tags: Object.fromEntries(TAG_KEYS_QUERIED.filter((k) => tags[k]).map((k) => [k, tags[k]]))
    });
  }

  const total = Object.values(groupCounts).reduce((s, v) => s + v, 0);

  return { groupCounts, total, premiumCount, poiDetails };
}

// ─── Neighbourhood Classification ───────────────────────────────────────────

/**
 * Classify a neighbourhood based on POI group distribution.
 * Uses cosine similarity between observed distribution and each type's expected vector.
 */
function classifyNeighborhood(groupCounts, total) {
  if (total < 3) {
    return { type: 'indefinido', label: 'Área com poucos dados', confidence: 0 };
  }

  // Build observed proportion vector
  const observed = {};
  for (const [group, count] of Object.entries(groupCounts)) {
    observed[group] = count / total;
  }

  let bestType = 'zona_comercial';
  let bestScore = -1;

  for (const [type, def] of Object.entries(NEIGHBORHOOD_TYPES)) {
    const expected = def.vector;

    // Cosine similarity
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (const group of Object.keys(FUNCTIONAL_GROUPS)) {
      const a = observed[group] || 0;
      const b = expected[group] || 0;
      dotProduct += a * b;
      magA += a * a;
      magB += b * b;
    }

    const denominator = Math.sqrt(magA) * Math.sqrt(magB);
    const similarity = denominator > 0 ? dotProduct / denominator : 0;

    if (similarity > bestScore) {
      bestScore = similarity;
      bestType = type;
    }
  }

  const def = NEIGHBORHOOD_TYPES[bestType];
  return {
    type: bestType,
    label: def.label,
    confidence: Number((bestScore * 100).toFixed(1))
  };
}

// ─── Socioeconomic & Urban Density Inference ────────────────────────────────

function inferSocioeconomic(groupCounts, total, premiumCount) {
  if (total < 3) return { level: 'indefinido', score: 0 };

  // Premium ratio
  const premiumRatio = premiumCount / Math.max(total, 1);
  const fitnessBeauty = ((groupCounts.fitness || 0) + (groupCounts.beauty || 0)) / Math.max(total, 1);
  const corporateRatio = (groupCounts.corporate || 0) / Math.max(total, 1);

  const rawScore = (premiumRatio * 35) + (fitnessBeauty * 30) + (corporateRatio * 20) + Math.min(15, total * 0.15);
  const clamped = Math.max(0, Math.min(100, rawScore));

  let level;
  if (clamped >= 60) level = 'alto';
  else if (clamped >= 40) level = 'medio-alto';
  else if (clamped >= 20) level = 'medio';
  else level = 'medio-baixo';

  return { level, score: Number(clamped.toFixed(1)) };
}

function inferUrbanDensity(total, radius) {
  // POIs per square km
  const areaKm2 = Math.PI * (radius / 1000) ** 2;
  const density = total / Math.max(areaKm2, 0.01);

  let label;
  if (density >= 300) label = 'muito alta';
  else if (density >= 150) label = 'alta';
  else if (density >= 60) label = 'media';
  else if (density >= 20) label = 'baixa';
  else label = 'muito baixa';

  return { label, poisPerKm2: Math.round(density) };
}

function inferLifestyle(groupCounts, total) {
  if (total < 3) return [];

  const indicators = [];
  const pct = (group) => ((groupCounts[group] || 0) / total) * 100;

  if (pct('fitness') >= 8) indicators.push('fitness_e_saude');
  if (pct('beauty') >= 5) indicators.push('estetica_e_beleza');
  if (pct('food') >= 25) indicators.push('gastronomia');
  if (pct('leisure') >= 10) indicators.push('entretenimento');
  if (pct('corporate') >= 15) indicators.push('profissional_executivo');
  if (pct('education') >= 15) indicators.push('educacao');
  if (pct('health') >= 15) indicators.push('saude_e_bem_estar');
  if (pct('hospitality') >= 5) indicators.push('turismo');
  if (pct('green') >= 8) indicators.push('ar_livre');
  if (pct('transport') >= 15) indicators.push('alta_mobilidade');
  if (pct('residential') >= 15) indicators.push('vida_residencial');

  return indicators;
}

// ─── IBGE Demographics (city-level) ─────────────────────────────────────────

const ibgeCityCache = new Map(); // cityName → { data, fetchedAt }
const IBGE_CITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function fetchIBGECityCode(cityName) {
  const cleaned = String(cityName || '').trim();
  if (!cleaned) return null;

  const url = `${IBGE_LOCALIDADES_URL}?nome=${encodeURIComponent(cleaned)}&orderBy=nome`;
  const items = await fetchJson(url);
  if (!Array.isArray(items) || !items.length) return null;

  const normalizedTarget = normalize(cleaned);
  const match = items.find((m) => normalize(m?.nome) === normalizedTarget) || items[0];
  return match?.id || null;
}

async function fetchIBGEDemographics(cityName) {
  // Check in-memory cache
  const cached = ibgeCityCache.get(cityName);
  if (cached && Date.now() - cached.fetchedAt < IBGE_CITY_CACHE_TTL_MS) {
    return cached.data;
  }

  const ibgeCode = await fetchIBGECityCode(cityName);
  if (!ibgeCode) {
    return { population: null, pibPerCapita: null, ibgeCode: null };
  }

  let population = null;
  let pibPerCapita = null;

  // Population (Censo 2022, Table 4714, Variable 93)
  try {
    const popUrl = `${IBGE_AGREGADOS_URL}/4714/periodos/2022/variaveis/93?localidades=N6[${ibgeCode}]`;
    const popData = await fetchJson(popUrl);
    const series = popData?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (series) {
      const val = Object.values(series)[0];
      const parsed = parseInt(String(val).replace(/\D/g, ''), 10);
      if (Number.isFinite(parsed)) population = parsed;
    }
  } catch { /* non-critical */ }

  // PIB per capita (Table 5938, Variable 37)
  try {
    const pibUrl = `${IBGE_AGREGADOS_URL}/5938/periodos/2021/variaveis/37?localidades=N6[${ibgeCode}]`;
    const pibData = await fetchJson(pibUrl);
    const series = pibData?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (series) {
      const val = Object.values(series)[0];
      const parsed = parseFloat(String(val).replace(',', '.'));
      if (Number.isFinite(parsed)) pibPerCapita = Number(parsed.toFixed(2));
    }
  } catch { /* non-critical */ }

  const result = { population, pibPerCapita, ibgeCode };
  ibgeCityCache.set(cityName, { data: result, fetchedAt: Date.now() });
  return result;
}

// ─── Narrative Generation ───────────────────────────────────────────────────

const LIFESTYLE_LABELS = {
  fitness_e_saude: 'fitness e saúde',
  estetica_e_beleza: 'estética e beleza',
  gastronomia: 'gastronomia',
  entretenimento: 'entretenimento',
  profissional_executivo: 'perfil executivo',
  educacao: 'educação',
  saude_e_bem_estar: 'saúde e bem-estar',
  turismo: 'turismo',
  ar_livre: 'vida ao ar livre',
  alta_mobilidade: 'alta mobilidade urbana',
  vida_residencial: 'vida residencial'
};

function generateNarrative(profile) {
  const {
    neighborhood_type: type,
    neighborhood_label: label,
    socioeconomic_level: socio,
    urban_density: density,
    poi_summary: poiSummary,
    total_pois: total,
    lifestyle_indicators: lifestyle,
    demographic_data: demo
  } = profile;

  const parts = [];

  // Opening
  parts.push(`Este ponto está localizado em uma **${label}**`);
  if (density) {
    parts[0] += ` de densidade urbana **${density}**`;
  }
  parts[0] += '.';

  // POI highlight
  if (poiSummary && total > 0) {
    const sorted = Object.entries(poiSummary)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const top3 = sorted.slice(0, 3).map(([group, count]) => {
        const pct = Math.round((count / total) * 100);
        return `**${GROUP_LABELS[group] || group}** (${count} pontos, ${pct}%)`;
      });
      parts.push(`Os ${total} estabelecimentos mapeados em ${GEO_RADIUS}m revelam predominância de ${top3.join(', ')}.`);
    }
  }

  // Socioeconomic
  if (socio && socio !== 'indefinido') {
    const socioDesc = {
      alto: 'alto poder aquisitivo',
      'medio-alto': 'poder aquisitivo médio-alto',
      medio: 'poder aquisitivo médio',
      'medio-baixo': 'poder aquisitivo médio-baixo'
    };
    parts.push(`O perfil socioeconômico do entorno indica **${socioDesc[socio] || socio}**.`);
  }

  // Lifestyle
  if (lifestyle && lifestyle.length > 0) {
    const labels = lifestyle.map((l) => LIFESTYLE_LABELS[l] || l);
    parts.push(`Indicadores de estilo de vida: **${labels.join(', ')}**.`);
  }

  // Demographics
  if (demo?.population) {
    const popLabel = demo.population >= 1000000
      ? `${(demo.population / 1000000).toFixed(1)}M`
      : `${Math.round(demo.population / 1000)}mil`;
    let demoText = `O município possui população de ${popLabel} habitantes`;
    if (demo.pibPerCapita) {
      demoText += ` e PIB per capita de R$ ${Number(demo.pibPerCapita).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    demoText += ' (fonte: IBGE).';
    parts.push(demoText);
  }

  return parts.join(' ');
}

const GROUP_LABELS = {
  corporate: 'Corporativo / Escritórios',
  commercial: 'Comércio',
  food: 'Alimentação',
  health: 'Saúde',
  education: 'Educação',
  leisure: 'Lazer / Entretenimento',
  fitness: 'Fitness / Esportes',
  transport: 'Transporte',
  residential: 'Residencial',
  beauty: 'Beleza / Estética',
  hospitality: 'Hotelaria / Turismo',
  religious: 'Religioso',
  green: 'Áreas Verdes'
};

// ─── Core Analysis Functions ────────────────────────────────────────────────

/**
 * Analyse a single point and store the profile in geo_audience_profiles.
 * Returns the profile object.
 */
async function analyzePoint(point) {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) < 0.001) {
    return null;
  }

  // Fetch & classify POIs
  const { groupCounts, total, premiumCount, poiDetails } = await fetchAndClassifyPOIs(lat, lng, GEO_RADIUS);

  // Classify neighbourhood
  const neighborhood = classifyNeighborhood(groupCounts, total);
  const typeDef = NEIGHBORHOOD_TYPES[neighborhood.type];

  // Infer attributes
  const socio = inferSocioeconomic(groupCounts, total, premiumCount);
  const density = inferUrbanDensity(total, GEO_RADIUS);
  const lifestyle = inferLifestyle(groupCounts, total);

  // Fetch IBGE demographics (city-level, cached)
  const demo = await fetchIBGEDemographics(point.cidade);

  // Build profile
  const profile = {
    ponto_id: point.id,
    neighborhood_type: neighborhood.type,
    neighborhood_label: neighborhood.label,
    confidence: neighborhood.confidence,
    socioeconomic_level: typeDef?.socioeconomic || socio.level,
    socioeconomic_score: socio.score,
    environment_type: typeDef?.environment || 'misto',
    dominant_activity: typeDef?.dominantActivity || 'Atividade mista',
    urban_density: density.label,
    pois_per_km2: density.poisPerKm2,
    lifestyle_indicators: lifestyle,
    poi_summary: groupCounts,
    total_pois: total,
    radius_m: GEO_RADIUS,
    demographic_data: demo,
    premium_count: premiumCount
  };

  // Generate narrative
  profile.audience_narrative = generateNarrative(profile);

  // Upsert into database
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600000).toISOString();

  db.prepare(`
    INSERT INTO geo_audience_profiles (ponto_id, neighborhood_type, neighborhood_label, confidence,
      socioeconomic_level, socioeconomic_score, environment_type, dominant_activity,
      urban_density, pois_per_km2, lifestyle_indicators, poi_summary, total_pois,
      radius_m, demographic_data, audience_narrative, premium_count, raw_data,
      updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(ponto_id) DO UPDATE SET
      neighborhood_type = excluded.neighborhood_type,
      neighborhood_label = excluded.neighborhood_label,
      confidence = excluded.confidence,
      socioeconomic_level = excluded.socioeconomic_level,
      socioeconomic_score = excluded.socioeconomic_score,
      environment_type = excluded.environment_type,
      dominant_activity = excluded.dominant_activity,
      urban_density = excluded.urban_density,
      pois_per_km2 = excluded.pois_per_km2,
      lifestyle_indicators = excluded.lifestyle_indicators,
      poi_summary = excluded.poi_summary,
      total_pois = excluded.total_pois,
      radius_m = excluded.radius_m,
      demographic_data = excluded.demographic_data,
      audience_narrative = excluded.audience_narrative,
      premium_count = excluded.premium_count,
      raw_data = excluded.raw_data,
      updated_at = datetime('now'),
      expires_at = excluded.expires_at
  `).run(
    profile.ponto_id,
    profile.neighborhood_type,
    profile.neighborhood_label,
    profile.confidence,
    profile.socioeconomic_level,
    profile.socioeconomic_score,
    profile.environment_type,
    profile.dominant_activity,
    profile.urban_density,
    profile.pois_per_km2,
    JSON.stringify(profile.lifestyle_indicators),
    JSON.stringify(profile.poi_summary),
    profile.total_pois,
    profile.radius_m,
    JSON.stringify(profile.demographic_data),
    profile.audience_narrative,
    profile.premium_count,
    JSON.stringify({ poiCount: poiDetails.length, topPois: poiDetails.slice(0, 30) }),
    expiresAt
  );

  return profile;
}

/**
 * Batch-analyse all points in a city (or all points if city is empty).
 * Returns { total, analyzed, errors, profiles }.
 */
async function analyzeCity(city, { force = false } = {}) {
  let points;
  if (city) {
    points = db.prepare(
      'SELECT id, nome, cidade, lat, lng FROM pontos WHERE ativo = 1 AND cidade = ?'
    ).all(city);
  } else {
    points = db.prepare(
      'SELECT id, nome, cidade, lat, lng FROM pontos WHERE ativo = 1'
    ).all();
  }

  const results = { total: points.length, analyzed: 0, errors: 0, skipped: 0, profiles: [] };

  for (const point of points) {
    // Skip if fresh cache exists (unless force)
    if (!force) {
      const existing = db.prepare(
        "SELECT id FROM geo_audience_profiles WHERE ponto_id = ? AND expires_at > datetime('now')"
      ).get(point.id);
      if (existing) {
        results.skipped++;
        continue;
      }
    }

    try {
      const profile = await analyzePoint(point);
      if (profile) {
        results.profiles.push(profile);
        results.analyzed++;
      } else {
        results.skipped++;
      }
    } catch (err) {
      results.errors++;
      console.error(`[geoaudience] Error analyzing point ${point.id} (${point.nome}):`, err.message);
    }

    // Rate limiting
    await sleep(BATCH_DELAY_MS);
  }

  return results;
}

// ─── Data Retrieval ─────────────────────────────────────────────────────────

function getProfile(pontoId) {
  const row = db.prepare('SELECT * FROM geo_audience_profiles WHERE ponto_id = ?').get(pontoId);
  return row ? deserializeProfile(row) : null;
}

function getProfiles(pontoIds) {
  if (!Array.isArray(pontoIds) || !pontoIds.length) return {};
  const placeholders = pontoIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM geo_audience_profiles WHERE ponto_id IN (${placeholders})`
  ).all(...pontoIds);

  const byPoint = {};
  for (const row of rows) {
    byPoint[row.ponto_id] = deserializeProfile(row);
  }
  return byPoint;
}

function getAllProfiles(city) {
  let rows;
  if (city) {
    rows = db.prepare(`
      SELECT g.* FROM geo_audience_profiles g
      JOIN pontos p ON p.id = g.ponto_id
      WHERE p.cidade = ? AND p.ativo = 1
    `).all(city);
  } else {
    rows = db.prepare(`
      SELECT g.* FROM geo_audience_profiles g
      JOIN pontos p ON p.id = g.ponto_id
      WHERE p.ativo = 1
    `).all();
  }

  const byPoint = {};
  for (const row of rows) {
    byPoint[row.ponto_id] = deserializeProfile(row);
  }
  return byPoint;
}

function getCoverageSummary(city) {
  const totalQuery = city
    ? db.prepare('SELECT COUNT(*) as c FROM pontos WHERE ativo = 1 AND cidade = ?')
    : db.prepare('SELECT COUNT(*) as c FROM pontos WHERE ativo = 1');
  const total = (city ? totalQuery.get(city) : totalQuery.get()).c;

  const profiledQuery = city
    ? db.prepare(`
        SELECT COUNT(*) as c FROM geo_audience_profiles g
        JOIN pontos p ON p.id = g.ponto_id
        WHERE p.ativo = 1 AND p.cidade = ?
      `)
    : db.prepare(`
        SELECT COUNT(*) as c FROM geo_audience_profiles g
        JOIN pontos p ON p.id = g.ponto_id
        WHERE p.ativo = 1
      `);
  const profiled = (city ? profiledQuery.get(city) : profiledQuery.get()).c;

  const freshQuery = city
    ? db.prepare(`
        SELECT COUNT(*) as c FROM geo_audience_profiles g
        JOIN pontos p ON p.id = g.ponto_id
        WHERE p.ativo = 1 AND p.cidade = ? AND g.expires_at > datetime('now')
      `)
    : db.prepare(`
        SELECT COUNT(*) as c FROM geo_audience_profiles g
        JOIN pontos p ON p.id = g.ponto_id
        WHERE p.ativo = 1 AND g.expires_at > datetime('now')
      `);
  const fresh = (city ? freshQuery.get(city) : freshQuery.get()).c;

  // Type distribution
  const distQuery = city
    ? db.prepare(`
        SELECT g.neighborhood_type, COUNT(*) as c
        FROM geo_audience_profiles g
        JOIN pontos p ON p.id = g.ponto_id
        WHERE p.ativo = 1 AND p.cidade = ?
        GROUP BY g.neighborhood_type
        ORDER BY c DESC
      `)
    : db.prepare(`
        SELECT g.neighborhood_type, COUNT(*) as c
        FROM geo_audience_profiles g
        JOIN pontos p ON p.id = g.ponto_id
        WHERE p.ativo = 1
        GROUP BY g.neighborhood_type
        ORDER BY c DESC
      `);
  const distribution = city ? distQuery.all(city) : distQuery.all();

  return {
    total,
    profiled,
    fresh,
    coveragePct: total > 0 ? Number((profiled / total).toFixed(4)) : 0,
    freshPct: total > 0 ? Number((fresh / total).toFixed(4)) : 0,
    distribution: distribution.map((r) => ({
      type: r.neighborhood_type,
      label: NEIGHBORHOOD_TYPES[r.neighborhood_type]?.label || r.neighborhood_type,
      count: r.c
    }))
  };
}

function deserializeProfile(row) {
  return {
    ponto_id: row.ponto_id,
    neighborhood_type: row.neighborhood_type,
    neighborhood_label: row.neighborhood_label,
    confidence: row.confidence,
    socioeconomic_level: row.socioeconomic_level,
    socioeconomic_score: row.socioeconomic_score,
    environment_type: row.environment_type,
    dominant_activity: row.dominant_activity,
    urban_density: row.urban_density,
    pois_per_km2: row.pois_per_km2,
    lifestyle_indicators: safeJsonParse(row.lifestyle_indicators, []),
    poi_summary: safeJsonParse(row.poi_summary, {}),
    total_pois: row.total_pois,
    radius_m: row.radius_m,
    demographic_data: safeJsonParse(row.demographic_data, {}),
    audience_narrative: row.audience_narrative,
    premium_count: row.premium_count,
    updated_at: row.updated_at,
    expires_at: row.expires_at
  };
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

// ─── Segment Affinity Score ─────────────────────────────────────────────────

/**
 * Compute affinity score between a point's geo-audience profile and a target segment.
 * Returns 0-100 score.
 */
function getSegmentAffinity(pontoId, segmento) {
  const profile = getProfile(pontoId);
  if (!profile || profile.neighborhood_type === 'indefinido') return 0;

  const affinityMap = SEGMENT_NEIGHBORHOOD_AFFINITY[segmento] || {};
  const multiplier = affinityMap[profile.neighborhood_type] || 1.0;

  // Base score from confidence + socioeconomic score
  const baseScore = (profile.confidence * 0.4) + (profile.socioeconomic_score * 0.3) + (Math.min(100, profile.total_pois) * 0.3);
  return Math.min(100, Number((baseScore * multiplier).toFixed(1)));
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  GEO_RADIUS,
  NEIGHBORHOOD_TYPES,
  SEGMENT_NEIGHBORHOOD_AFFINITY,
  GROUP_LABELS,
  analyzePoint,
  analyzeCity,
  getProfile,
  getProfiles,
  getAllProfiles,
  getCoverageSummary,
  getSegmentAffinity,
  fetchIBGEDemographics
};
