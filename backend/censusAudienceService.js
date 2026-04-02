'use strict';

/**
 * Census Audience Classification Service
 *
 * Classifies DOOH points by 4 audience profiles using:
 *  1. IBGE Censo 2022 (Tabelas 4714, 5938, 9606, 9529) — população, PIB, renda, instrução
 *  2. IBGE Malhas API — GeoJSON de setores censitários para geocruzamento
 *  3. OpenStreetMap Overpass API — POIs em raio de 500 m para validação de perfil
 *
 * Perfis classificados:
 *  - alta_renda:           Renda ≥ R$ 5 000, instrução superior > 40 %, POIs premium
 *  - massa_varejo:         Renda R$ 1 500–5 000, alta densidade, POIs comércio/transporte
 *  - jovem_universitario:  18–29 anos > 35 %, POIs universidade / bares / transporte
 *  - terceira_idade:       60 + anos > 25 %, POIs saúde / religião / praças
 */

const db = require('./database');

// ─── Configuration ──────────────────────────────────────────────────────────

const OVERPASS_ENDPOINT  = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';
const IBGE_AGREGADOS_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados';
const IBGE_LOCALIDADES   = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const IBGE_MALHAS        = 'https://servicodados.ibge.gov.br/api/v3/malhas/municipios';
const ANALYSIS_RADIUS    = Number(process.env.CENSUS_ANALYSIS_RADIUS) || 800;
const FETCH_TIMEOUT      = 20_000;
const MESH_FETCH_TIMEOUT = 60_000;
const CACHE_TTL_HOURS    = 168; // 1 week
const BATCH_DELAY_MS     = 1_500;
const SM_2022            = 1212; // salário mínimo 2022

// ─── Profile Definitions ────────────────────────────────────────────────────

const PROFILES = {
  alta_renda: {
    label: 'Alta Renda',
    icon: 'Gem',
    color: '#f59e0b',
    description: 'Público de alto poder aquisitivo, formação universitária e consumo premium.',
    osmMatch: {
      // Removed: bank, clinic, doctors, dentist — ubíquos em bairros populares no Brasil e não são
      // indicadores confiáveis de renda alta. Mantemos apenas POIs genuinamente premium.
      amenity: ['bureau_de_change', 'spa', 'coworking_space'],
      shop: ['department_store', 'jewelry', 'watches', 'perfumery', 'wine', 'cosmetics', 'optician', 'bag'],
      leisure: ['fitness_centre', 'sports_centre', 'swimming_pool'],
      office: ['lawyer', 'financial', 'insurance', 'consulting', 'architect', 'estate_agent', 'investment'],
      tourism: ['hotel']
    },
    // Aumentado de 30 para 50: requer mais POIs premium para saturar o sinal
    expectedPois: 50
  },
  massa_varejo: {
    label: 'Massa / Varejo',
    icon: 'ShoppingCart',
    color: '#3b82f6',
    description: 'Público de renda média, alta concentração demográfica e consumo cotidiano.',
    osmMatch: {
      // bank adicionado aqui: agências bancárias são ubíquas em centros comerciais populares
      amenity: ['marketplace', 'post_office', 'bus_station', 'fuel', 'parking', 'taxi', 'car_wash', 'fast_food', 'bank'],
      shop: ['supermarket', 'convenience', 'clothes', 'mobile_phone', 'variety_store', 'hardware', 'shoes', 'electronics', 'butcher', 'greengrocer', 'bakery', 'lottery', 'tyres', 'car_repair'],
      building: ['commercial'],
      office: ['__any__']
    },
    expectedPois: 40
  },
  jovem_universitario: {
    label: 'Jovem / Universitário',
    icon: 'GraduationCap',
    color: '#8b5cf6',
    description: 'Público jovem (18–29), universitário, conectado e vida social ativa.',
    osmMatch: {
      amenity: ['university', 'college', 'language_school', 'bar', 'pub', 'nightclub', 'cafe', 'fast_food', 'bicycle_rental', 'library', 'cinema', 'coworking_space', 'food_court'],
      shop: ['books', 'computer', 'mobile_phone', 'coffee', 'sports'],
      leisure: ['dance', 'escape_game', 'amusement_arcade', 'fitness_centre', 'sports_centre']
    },
    expectedPois: 20
  },
  terceira_idade: {
    label: 'Terceira Idade',
    icon: 'HeartPulse',
    color: '#10b981',
    description: 'Público 60 + anos, frequentador de saúde, espaços religiosos e lazer.',
    osmMatch: {
      amenity: ['hospital', 'clinic', 'doctors', 'place_of_worship', 'social_facility', 'community_centre', 'pharmacy'],
      healthcare: ['__any__'],
      leisure: ['park', 'garden', 'playground', 'nature_reserve'],
      shop: ['pharmacy', 'chemist', 'hearing_aids', 'medical_supply', 'herbalist']
    },
    expectedPois: 20
  }
};

const PROFILE_KEYS  = Object.keys(PROFILES);
const PROFILE_LABELS = Object.fromEntries(PROFILE_KEYS.map(k => [k, PROFILES[k].label]));
const QUERY_TAG_KEYS = ['amenity', 'shop', 'healthcare', 'office', 'tourism', 'leisure', 'building'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

async function fetchJson(url, opts = {}) {
  const { signal, clear } = timeoutSignal(opts.timeout || FETCH_TIMEOUT);
  try {
    const r = await fetch(url, {
      ...opts,
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'intermidia-midiakit/1.0 (census)',
        ...(opts.headers || {})
      }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } finally { clear(); }
}

async function fetchGeoJson(url, timeout = MESH_FETCH_TIMEOUT) {
  const { signal, clear } = timeoutSignal(timeout);
  try {
    const r = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/vnd.geo+json, application/json',
        'User-Agent': 'intermidia-midiakit/1.0 (census)'
      }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } finally { clear(); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalize(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }

function safeJsonParse(str, fb) {
  if (!str) return fb;
  try { return JSON.parse(str); } catch { return fb; }
}

// ─── Point-in-Polygon (Ray Casting) ────────────────────────────────────────

function pointInPolygon(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // GeoJSON → [lng, lat]
    const [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

/** Pre-compute bounding boxes for every feature so point-in-polygon tests
 *  can be short-circuited for the vast majority of census tracts. */
function preprocessMesh(geojson) {
  if (!geojson?.features) return geojson;
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    const rings = g.type === 'Polygon'
      ? [g.coordinates[0]]
      : g.type === 'MultiPolygon'
        ? g.coordinates.map(p => p[0])
        : [];
    let mnLat = Infinity, mxLat = -Infinity, mnLng = Infinity, mxLng = -Infinity;
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lat < mnLat) mnLat = lat;
        if (lat > mxLat) mxLat = lat;
        if (lng < mnLng) mnLng = lng;
        if (lng > mxLng) mxLng = lng;
      }
    }
    if (Number.isFinite(mnLat)) f._bbox = { mnLat, mxLat, mnLng, mxLng };
  }
  return geojson;
}

function findFeatureForPoint(lat, lng, geojson) {
  if (!geojson?.features?.length) return null;
  for (const f of geojson.features) {
    // Bounding box pre-filter
    if (f._bbox) {
      const b = f._bbox;
      if (lat < b.mnLat || lat > b.mxLat || lng < b.mnLng || lng > b.mxLng) continue;
    }
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon'
      ? [g.coordinates[0]]
      : g.type === 'MultiPolygon'
        ? g.coordinates.map(p => p[0])
        : [];
    for (const ring of polys) {
      if (pointInPolygon(lat, lng, ring)) return f;
    }
  }
  return null;
}

// ─── IBGE City Code Cache ───────────────────────────────────────────────────

const cityCodeCache = new Map();

async function getIBGECityCode(cityName) {
  const key = normalize(cityName);
  if (cityCodeCache.has(key)) return cityCodeCache.get(key);

  const cleaned = String(cityName || '').trim();
  if (!cleaned) return null;

  const url = `${IBGE_LOCALIDADES}?nome=${encodeURIComponent(cleaned)}&orderBy=nome`;
  const items = await fetchJson(url);
  if (!Array.isArray(items) || !items.length) return null;

  const target = normalize(cleaned);
  const match = items.find(m => normalize(m?.nome) === target) || items[0];
  const code = match?.id ?? null;
  if (code) cityCodeCache.set(key, code);
  return code;
}

// ─── Census Tract Mesh Cache ────────────────────────────────────────────────

const meshCache = new Map();
const MESH_TTL = 24 * 60 * 60 * 1000;

async function getCensusTractMesh(codMunicipio) {
  const cached = meshCache.get(codMunicipio);
  if (cached && Date.now() - cached.at < MESH_TTL) return cached.mesh;

  let mesh = null;
  // Try setor censitário level first
  try {
    const url = `${IBGE_MALHAS}/${codMunicipio}?formato=application/vnd.geo%2Bjson&qualidade=maxima&intrarregiao=setor`;
    console.log(`[census] Fetching setor mesh for municipality ${codMunicipio}…`);
    mesh = await fetchGeoJson(url, MESH_FETCH_TIMEOUT);
    if (mesh?.features?.length) {
      mesh = preprocessMesh(mesh);
      console.log(`[census] Loaded ${mesh.features.length} census tracts`);
    }
  } catch (err) {
    console.warn(`[census] Setor mesh failed (${err.message}). Trying distrito…`);
    try {
      const url = `${IBGE_MALHAS}/${codMunicipio}?formato=application/vnd.geo%2Bjson&qualidade=maxima&intrarregiao=distrito`;
      mesh = await fetchGeoJson(url, MESH_FETCH_TIMEOUT);
      if (mesh?.features?.length) {
        mesh = preprocessMesh(mesh);
        console.log(`[census] Loaded ${mesh.features.length} distritos (fallback)`);
      }
    } catch (e2) {
      console.warn(`[census] Distrito mesh also failed: ${e2.message}`);
    }
  }

  if (mesh?.features?.length) meshCache.set(codMunicipio, { mesh, at: Date.now() });
  return mesh;
}

// ─── IBGE Census Data ───────────────────────────────────────────────────────

const censusCache = new Map();
const CENSUS_TTL = 24 * 60 * 60 * 1000;

/**
 * Parse income-bracket results from Table 9606 to estimate average monthly income.
 * Bracket names in Portuguese are normalised and matched by pattern.
 */
function estimateRendaFromBrackets(resultados) {
  if (!Array.isArray(resultados) || !resultados.length) return null;

  let totalPop = 0;
  let weightedIncome = 0;

  for (const r of resultados) {
    const serie = r.series?.[0]?.serie;
    if (!serie) continue;
    const pop = parseInt(String(Object.values(serie)[0]).replace(/\D/g, ''), 10);
    if (!Number.isFinite(pop) || pop <= 0) continue;

    // Extract bracket name from classificacoes
    let bracketName = '';
    for (const c of (r.classificacoes || [])) {
      const entries = Object.values(c.categoria || {});
      if (entries.length) bracketName = String(entries[0] || '');
    }
    const bn = normalize(bracketName);

    // Determine midpoint (R$ / month based on SM 2022 = R$ 1 212)
    let midpoint = 0;
    if (bn.includes('sem rend') || bn.includes('sem rendimento')) {
      midpoint = 0;
    } else if (bn.includes('ate 1/4') || bn.includes('até 1/4')) {
      midpoint = SM_2022 * 0.125;
    } else if (bn.includes('1/4') && bn.includes('1/2')) {
      midpoint = SM_2022 * 0.375;
    } else if (bn.includes('1/2') && bn.includes('1 ')) {
      midpoint = SM_2022 * 0.75;
    } else {
      // Extract numeric multipliers (e.g. "mais de 2 a 3")
      const nums = bn.match(/\d+/g);
      if (nums && nums.length >= 2) {
        midpoint = SM_2022 * (parseInt(nums[0], 10) + parseInt(nums[1], 10)) / 2;
      } else if (nums && nums.length === 1) {
        midpoint = SM_2022 * parseInt(nums[0], 10) * 1.5;
      }
    }

    totalPop += pop;
    weightedIncome += pop * midpoint;
  }

  return totalPop > 0 ? Number((weightedIncome / totalPop).toFixed(2)) : null;
}

/**
 * Parse education-level results from Table 9529 to find % with higher education.
 */
function parsePctSuperior(resultados) {
  if (!Array.isArray(resultados) || !resultados.length) return null;

  let total = 0;
  let superior = 0;

  for (const r of resultados) {
    const serie = r.series?.[0]?.serie;
    if (!serie) continue;
    const val = parseInt(String(Object.values(serie)[0]).replace(/\D/g, ''), 10);
    if (!Number.isFinite(val) || val <= 0) continue;

    total += val;

    let catName = '';
    for (const c of (r.classificacoes || [])) {
      const entries = Object.values(c.categoria || {});
      if (entries.length) catName = normalize(String(entries[0] || ''));
    }

    if (catName.includes('superior completo') || catName.includes('mestrado') || catName.includes('doutorado')) {
      superior += val;
    }
  }

  return total > 0 ? Number((superior / total).toFixed(4)) : null;
}

/**
 * Parse age-group results to find % young (15-29) and % elderly (60+).
 */
function parseAgeBrackets(resultados) {
  if (!Array.isArray(resultados) || !resultados.length) return null;

  let total = 0;
  let jovem = 0;
  let idoso = 0;

  for (const r of resultados) {
    const serie = r.series?.[0]?.serie;
    if (!serie) continue;
    const val = parseInt(String(Object.values(serie)[0]).replace(/\D/g, ''), 10);
    if (!Number.isFinite(val) || val <= 0) continue;

    total += val;

    let catName = '';
    for (const c of (r.classificacoes || [])) {
      const entries = Object.values(c.categoria || {});
      if (entries.length) catName = String(entries[0] || '').toLowerCase();
    }

    // Detect age brackets by parsing numbers
    const ageNums = catName.match(/(\d+)/g);
    if (ageNums) {
      const low = parseInt(ageNums[0], 10);
      if (low >= 15 && low < 30) jovem += val;
      if (low >= 60) idoso += val;
    }

    // Handle "ou mais" (e.g., "80 anos ou mais")
    if (catName.includes('ou mais') && ageNums) {
      const age = parseInt(ageNums[0], 10);
      if (age >= 60 && !idoso) idoso += val;
    }
  }

  if (total <= 0) return null;
  return {
    pctJovem18_29: Number((jovem / total).toFixed(4)),
    pctIdoso60plus: Number((idoso / total).toFixed(4))
  };
}

/**
 * Fetch all available census data for a municipality.
 * Gracefully degrades when specific tables are unavailable.
 */
async function fetchCensusData(codMunicipio) {
  const cached = censusCache.get(codMunicipio);
  if (cached && Date.now() - cached.at < CENSUS_TTL) return cached.data;

  const result = {
    population: null,
    pibPerCapita: null,
    rendaMediaDomiciliar: null,
    pctInstrucaoSuperior: null,
    pctJovem18_29: null,
    pctIdoso60plus: null,
    fontes: []
  };

  // 1. Population — Table 4714 (confirmed working)
  try {
    const url = `${IBGE_AGREGADOS_URL}/4714/periodos/2022/variaveis/93?localidades=N6[${codMunicipio}]`;
    const res = await fetchJson(url);
    const serie = res?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (serie) {
      const v = parseInt(String(Object.values(serie)[0]).replace(/\D/g, ''), 10);
      if (Number.isFinite(v)) { result.population = v; result.fontes.push('IBGE_4714'); }
    }
  } catch { /* non-critical */ }

  // 2. PIB per capita — Table 5938 (confirmed working)
  try {
    const url = `${IBGE_AGREGADOS_URL}/5938/periodos/2021/variaveis/37?localidades=N6[${codMunicipio}]`;
    const res = await fetchJson(url);
    const serie = res?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (serie) {
      const v = parseFloat(String(Object.values(serie)[0]).replace(',', '.'));
      if (Number.isFinite(v)) { result.pibPerCapita = Number(v.toFixed(2)); result.fontes.push('IBGE_5938'); }
    }
  } catch { /* non-critical */ }

  // 3. Renda domiciliar — Table 9606 (Census 2022 income brackets)
  try {
    const url = `${IBGE_AGREGADOS_URL}/9606/periodos/2022/variaveis/93?localidades=N6[${codMunicipio}]`;
    const res = await fetchJson(url);
    const resultados = res?.[0]?.resultados || [];
    const renda = estimateRendaFromBrackets(resultados);
    if (renda != null && renda > 0) { result.rendaMediaDomiciliar = renda; result.fontes.push('IBGE_9606'); }
  } catch { /* non-critical */ }

  // Fallback: estimate from PIB per capita
  if (!result.rendaMediaDomiciliar && result.pibPerCapita) {
    result.rendaMediaDomiciliar = Number((result.pibPerCapita / 12 * 0.55).toFixed(2));
  }

  // 4. Grau de instrução — Table 9529 (Census 2022)
  try {
    const url = `${IBGE_AGREGADOS_URL}/9529/periodos/2022/variaveis/93?localidades=N6[${codMunicipio}]`;
    const res = await fetchJson(url);
    const resultados = res?.[0]?.resultados || [];
    const pct = parsePctSuperior(resultados);
    if (pct != null) { result.pctInstrucaoSuperior = pct; result.fontes.push('IBGE_9529'); }
  } catch { /* non-critical */ }

  // 5. Faixas etárias — Table 9514 or fallback to 4714 with age classification
  try {
    const url = `${IBGE_AGREGADOS_URL}/9514/periodos/2022/variaveis/93?localidades=N6[${codMunicipio}]`;
    const res = await fetchJson(url);
    const resultados = res?.[0]?.resultados || [];
    const ages = parseAgeBrackets(resultados);
    if (ages) {
      result.pctJovem18_29 = ages.pctJovem18_29;
      result.pctIdoso60plus = ages.pctIdoso60plus;
      result.fontes.push('IBGE_9514');
    }
  } catch { /* non-critical */ }

  censusCache.set(codMunicipio, { data: result, at: Date.now() });
  return result;
}

// ─── Overpass POI Query ─────────────────────────────────────────────────────

function buildOverpassQuery(lat, lng, radius) {
  return `[out:json][timeout:30];
(
  node(around:${radius},${lat},${lng})["amenity"];
  way(around:${radius},${lat},${lng})["amenity"];
  node(around:${radius},${lat},${lng})["shop"];
  way(around:${radius},${lat},${lng})["shop"];
  node(around:${radius},${lat},${lng})["healthcare"];
  way(around:${radius},${lat},${lng})["healthcare"];
  node(around:${radius},${lat},${lng})["office"];
  way(around:${radius},${lat},${lng})["office"];
  node(around:${radius},${lat},${lng})["tourism"];
  way(around:${radius},${lat},${lng})["tourism"];
  node(around:${radius},${lat},${lng})["leisure"];
  way(around:${radius},${lat},${lng})["leisure"];
  node(around:${radius},${lat},${lng})["building"~"residential|apartments|commercial|office|retail"];
  way(around:${radius},${lat},${lng})["building"~"residential|apartments|commercial|office|retail"];
);
out center tags;
`;
}

/**
 * Classify a single OSM element into matching audience profiles.
 * A POI can match multiple profiles (e.g. pharmacy → massa_varejo + terceira_idade).
 */
function classifyElementForProfiles(tags) {
  const hits = {};
  for (const [pk, profile] of Object.entries(PROFILES)) {
    for (const tagKey of QUERY_TAG_KEYS) {
      const actual = tags[tagKey];
      if (!actual) continue;
      const matchers = profile.osmMatch[tagKey];
      if (!matchers) continue;
      if (matchers === '__any__' || (Array.isArray(matchers) && (matchers.includes('__any__') || matchers.includes(actual)))) {
        hits[pk] = (hits[pk] || 0) + 1;
        break; // count POI once per profile
      }
    }
  }
  return hits;
}

async function fetchAndClassifyPOIs(lat, lng) {
  const query = buildOverpassQuery(lat, lng, ANALYSIS_RADIUS);
  const payload = await fetchJson(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: query,
    timeout: FETCH_TIMEOUT
  });

  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const counts = {};
  for (const k of PROFILE_KEYS) counts[k] = 0;
  const named = new Set();

  for (const el of elements) {
    const tags = el.tags || {};
    const hits = classifyElementForProfiles(tags);
    for (const [pk, c] of Object.entries(hits)) counts[pk] += c;
    if (tags.name) named.add(tags.name);
  }

  return {
    profileCounts: counts,
    totalPois: elements.length,
    namedPois: Array.from(named).slice(0, 30)
  };
}

// ─── Scoring Engine ─────────────────────────────────────────────────────────
//
// Estratégia de pontuação revisada para evitar viés de "Alta Renda universal":
//
// Problema anterior: o PIB per capita municipal (dado de NÍVEL DE CIDADE) era usado
// com peso elevado para todos os pontos da mesma cidade, fazendo cidades com PIB
// mediano (Londrina ~R$40k, Maringá ~R$40k) ou alto (Balneário Camboriú ~R$60k)
// classificarem TODOS seus pontos como Alta Renda, independente do bairro real.
//
// Solução: distinguir entre renda REAL do setor (quando disponível via IBGE_9606 ou
// IBGE_N8) vs. estimativa derivada do PIB municipal (fallback). Dar peso muito maior
// ao sinal de POI local (que é específico do raio de 800m ao redor do ponto).

function scoreProfiles(poiCounts, census) {
  const scores = {};

  // Verifica se a renda vem de dado censitário real (não fallback de PIB)
  const hasRealIncomeData = Array.isArray(census.fontes) &&
    (census.fontes.includes('IBGE_9606') || census.fontes.includes('IBGE_N8_renda'));
  const hasSetorIncome = Array.isArray(census.fontes) && census.fontes.includes('IBGE_N8_renda');

  // ── alta_renda ──────────────────────────────────────────────
  {
    const poiSignal = clamp(poiCounts.alta_renda / PROFILES.alta_renda.expectedPois);
    let censusSignal = 0;
    let censusWeight = 0;

    if (census.rendaMediaDomiciliar) {
      if (hasSetorIncome) {
        // Renda real do SETOR CENSITÁRIO — máxima confiabilidade (nível bairro)
        censusSignal += clamp(census.rendaMediaDomiciliar / 5000) * 0.55;
        censusWeight += 0.55;
      } else if (hasRealIncomeData) {
        // Renda real do município (Table 9606) — confiável mas nível cidade
        censusSignal += clamp(census.rendaMediaDomiciliar / 5000) * 0.30;
        censusWeight += 0.30;
        // PIB como sinal complementar moderado
        if (census.pibPerCapita) {
          censusSignal += clamp(census.pibPerCapita / 70000) * 0.10;
          censusWeight += 0.10;
        }
      } else if (census.pibPerCapita) {
        // Apenas PIB disponível (fallback estimado) — peso baixo para evitar
        // inflacionar Alta Renda em cidades com PIB mediano/alto uniformemente
        censusSignal += clamp(census.pibPerCapita / 70000) * 0.15;
        censusWeight += 0.15;
      }
    } else if (census.pibPerCapita) {
      censusSignal += clamp(census.pibPerCapita / 70000) * 0.15;
      censusWeight += 0.15;
    }

    if (census.pctInstrucaoSuperior != null) {
      censusSignal += clamp(census.pctInstrucaoSuperior / 0.40) * 0.25;
      censusWeight += 0.25;
    }

    // POI recebe peso maior (60%) — é o único sinal local/bairro disponível na maioria dos casos
    scores.alta_renda = censusWeight > 0
      ? Number((poiSignal * 0.60 + (censusSignal / censusWeight) * 0.40).toFixed(4))
      : Number((poiSignal * 0.90).toFixed(4));
  }

  // ── massa_varejo ────────────────────────────────────────────
  {
    const poiSignal = clamp(poiCounts.massa_varejo / PROFILES.massa_varejo.expectedPois);
    let censusSignal = 0;
    let censusWeight = 0;

    if (census.rendaMediaDomiciliar && hasRealIncomeData) {
      // Bell-curve: peak em R$ 2.500 (renda típica de bairros populares em cidades médias BR)
      const dist = Math.abs(census.rendaMediaDomiciliar - 2500);
      censusSignal += clamp(1 - dist / 2500) * 0.50;
      censusWeight += 0.50;
    } else if (census.pibPerCapita) {
      // Cidades com PIB per capita entre R$25k-45k/ano têm perfil de massa/varejo mais forte
      const pibSignal = clamp(1 - Math.abs(census.pibPerCapita - 35000) / 35000);
      censusSignal += pibSignal * 0.20;
      censusWeight += 0.20;
    }
    if (census.population) {
      censusSignal += clamp(census.population / 300000) * 0.50;
      censusWeight += 0.50;
    }

    scores.massa_varejo = censusWeight > 0
      ? Number((poiSignal * 0.55 + (censusSignal / censusWeight) * 0.45).toFixed(4))
      : Number(poiSignal.toFixed(4));
  }

  // ── jovem_universitario ─────────────────────────────────────
  {
    const poiSignal = clamp(poiCounts.jovem_universitario / PROFILES.jovem_universitario.expectedPois);
    let censusSignal = 0;
    let censusWeight = 0;

    if (census.pctJovem18_29 != null) {
      censusSignal += clamp(census.pctJovem18_29 / 0.35);
      censusWeight += 1;
    } else if (census.population && census.population > 100000) {
      // Larger cities tend to be younger
      censusSignal += clamp(census.population / 500000) * 0.3;
      censusWeight += 0.3;
    }

    scores.jovem_universitario = censusWeight > 0
      ? Number((poiSignal * 0.55 + (censusSignal / censusWeight) * 0.45).toFixed(4))
      : Number(poiSignal.toFixed(4));
  }

  // ── terceira_idade ──────────────────────────────────────────
  {
    const poiSignal = clamp(poiCounts.terceira_idade / PROFILES.terceira_idade.expectedPois);
    let censusSignal = 0;
    let censusWeight = 0;

    if (census.pctIdoso60plus != null) {
      censusSignal += clamp(census.pctIdoso60plus / 0.25);
      censusWeight += 1;
    }

    scores.terceira_idade = censusWeight > 0
      ? Number((poiSignal * 0.50 + (censusSignal / censusWeight) * 0.50).toFixed(4))
      : Number(poiSignal.toFixed(4));
  }

  // ── aggregate ───────────────────────────────────────────────
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const perfilDominante = sorted[0][0];
  const maxScore = sorted[0][1];
  const avgScore = sorted.reduce((s, [, v]) => s + v, 0) / sorted.length;
  const scoreGeral = Number((maxScore * 0.6 + avgScore * 0.4).toFixed(4));

  return { perfis: scores, perfilDominante, scoreGeral };
}

// ─── Analysis Pipeline ──────────────────────────────────────────────────────

async function analyzePoint(point) {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) < 0.001) return null;

  const cidade = String(point.cidade || '').trim();

  // 1. IBGE city code
  const ibgeCode = await getIBGECityCode(cidade);

  // 2. Census data (city-level)
  let census = { population: null, pibPerCapita: null, rendaMediaDomiciliar: null, fontes: [] };
  if (ibgeCode) census = await fetchCensusData(ibgeCode);

  // 3. Census tract geocoding
  let setorCensitario = null;
  if (ibgeCode) {
    try {
      const mesh = await getCensusTractMesh(ibgeCode);
      const feature = findFeatureForPoint(lat, lng, mesh);
      if (feature) {
        setorCensitario = feature.properties?.codarea
          || feature.properties?.CD_SETOR
          || feature.properties?.cod
          || null;
      }
    } catch { /* non-critical */ }
  }

  // 3b. Try to fetch income data at setor censitário level (N8) via IBGE SIDRA.
  // Tabela 9606 (classes de rendimento) pode estar disponível em N8 para o Censo 2022.
  // Se funcionar, substitui a estimativa de renda derivada do PIB municipal — muito mais preciso.
  if (setorCensitario && !census.fontes.includes('IBGE_9606')) {
    try {
      const setorUrl = `${IBGE_AGREGADOS_URL}/9606/periodos/2022/variaveis/93?localidades=N8[${encodeURIComponent(setorCensitario)}]`;
      const setorRes = await fetchJson(setorUrl);
      const setorResultados = setorRes?.[0]?.resultados || [];
      if (setorResultados.length > 0) {
        const setorRenda = estimateRendaFromBrackets(setorResultados);
        if (setorRenda != null && setorRenda > 0) {
          // Dado de setor real disponível — muito mais preciso que nível municipal
          census = { ...census, rendaMediaDomiciliar: setorRenda };
          census.fontes = [...census.fontes, 'IBGE_N8_renda'];
          console.log(`[census] Setor-level renda for ${setorCensitario}: R$${setorRenda.toFixed(0)}/mês`);
        }
      }
    } catch { /* N8 não disponível para esta tabela — fallback gracioso */ }
  }

  // 4. Overpass POI analysis
  const { profileCounts, totalPois, namedPois } = await fetchAndClassifyPOIs(lat, lng);

  // 5. Score all 4 profiles
  const { perfis, perfilDominante, scoreGeral } = scoreProfiles(profileCounts, census);

  // 6. Data sources used
  const fontesDados = [...new Set([...census.fontes, 'OSM'])];
  if (setorCensitario) fontesDados.push('IBGE_MALHAS');

  // 7. Build profile record
  const profile = {
    ponto_id: point.id,
    municipio: cidade,
    municipio_ibge_code: ibgeCode ? String(ibgeCode) : null,
    setor_censitario: setorCensitario,
    perfil_alta_renda: perfis.alta_renda,
    perfil_massa_varejo: perfis.massa_varejo,
    perfil_jovem_universitario: perfis.jovem_universitario,
    perfil_terceira_idade: perfis.terceira_idade,
    perfil_dominante: perfilDominante,
    score_geral: scoreGeral,
    pois_proximos: namedPois,
    fontes_dados: fontesDados,
    dados_censitarios: census,
    dados_pois: profileCounts,
    total_pois: totalPois
  };

  // 8. Upsert into DB
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600000).toISOString();

  db.prepare(`
    INSERT INTO census_audience_profiles
      (ponto_id, municipio, municipio_ibge_code, setor_censitario,
       perfil_alta_renda, perfil_massa_varejo, perfil_jovem_universitario, perfil_terceira_idade,
       perfil_dominante, score_geral, pois_proximos, fontes_dados,
       dados_censitarios, dados_pois, total_pois, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(ponto_id) DO UPDATE SET
      municipio = excluded.municipio,
      municipio_ibge_code = excluded.municipio_ibge_code,
      setor_censitario = excluded.setor_censitario,
      perfil_alta_renda = excluded.perfil_alta_renda,
      perfil_massa_varejo = excluded.perfil_massa_varejo,
      perfil_jovem_universitario = excluded.perfil_jovem_universitario,
      perfil_terceira_idade = excluded.perfil_terceira_idade,
      perfil_dominante = excluded.perfil_dominante,
      score_geral = excluded.score_geral,
      pois_proximos = excluded.pois_proximos,
      fontes_dados = excluded.fontes_dados,
      dados_censitarios = excluded.dados_censitarios,
      dados_pois = excluded.dados_pois,
      total_pois = excluded.total_pois,
      updated_at = datetime('now'),
      expires_at = excluded.expires_at
  `).run(
    profile.ponto_id,
    profile.municipio,
    profile.municipio_ibge_code,
    profile.setor_censitario,
    profile.perfil_alta_renda,
    profile.perfil_massa_varejo,
    profile.perfil_jovem_universitario,
    profile.perfil_terceira_idade,
    profile.perfil_dominante,
    profile.score_geral,
    JSON.stringify(profile.pois_proximos),
    JSON.stringify(profile.fontes_dados),
    JSON.stringify(profile.dados_censitarios),
    JSON.stringify(profile.dados_pois),
    profile.total_pois,
    expiresAt
  );

  return profile;
}

async function analyzeCity(city, { force = false } = {}) {
  let points;
  if (city) {
    points = db.prepare('SELECT id, nome, cidade, lat, lng FROM pontos WHERE ativo = 1 AND cidade = ?').all(city);
  } else {
    points = db.prepare('SELECT id, nome, cidade, lat, lng FROM pontos WHERE ativo = 1').all();
  }

  const results = { total: points.length, analyzed: 0, errors: 0, skipped: 0 };

  for (const point of points) {
    if (!force) {
      const existing = db.prepare(
        "SELECT id FROM census_audience_profiles WHERE ponto_id = ? AND expires_at > datetime('now')"
      ).get(point.id);
      if (existing) { results.skipped++; continue; }
    }

    try {
      const profile = await analyzePoint(point);
      if (profile) results.analyzed++;
      else results.skipped++;
    } catch (err) {
      results.errors++;
      console.error(`[census] Error on point ${point.id} (${point.nome}):`, err.message);
    }

    await sleep(BATCH_DELAY_MS);
  }

  return results;
}

// ─── Data Retrieval ─────────────────────────────────────────────────────────

function deserializeRow(row) {
  if (!row) return null;
  return {
    ponto_id: row.ponto_id,
    municipio: row.municipio,
    municipio_ibge_code: row.municipio_ibge_code,
    setor_censitario: row.setor_censitario,
    perfis: {
      alta_renda: row.perfil_alta_renda,
      massa_varejo: row.perfil_massa_varejo,
      jovem_universitario: row.perfil_jovem_universitario,
      terceira_idade: row.perfil_terceira_idade
    },
    perfil_dominante: row.perfil_dominante,
    score_geral: row.score_geral,
    pois_proximos: safeJsonParse(row.pois_proximos, []),
    fontes_dados: safeJsonParse(row.fontes_dados, []),
    dados_censitarios: safeJsonParse(row.dados_censitarios, {}),
    dados_pois: safeJsonParse(row.dados_pois, {}),
    total_pois: row.total_pois,
    updated_at: row.updated_at,
    expires_at: row.expires_at
  };
}

function getProfile(pontoId) {
  return deserializeRow(
    db.prepare('SELECT * FROM census_audience_profiles WHERE ponto_id = ?').get(pontoId)
  );
}

function getAllProfiles({ municipio, perfil, minScore } = {}) {
  let sql = `
    SELECT c.* FROM census_audience_profiles c
    JOIN pontos p ON p.id = c.ponto_id
    WHERE p.ativo = 1`;
  const params = [];

  if (municipio) { sql += ' AND p.cidade = ?'; params.push(municipio); }
  if (perfil && PROFILE_KEYS.includes(perfil)) { sql += ' AND c.perfil_dominante = ?'; params.push(perfil); }
  if (minScore != null) { sql += ' AND c.score_geral >= ?'; params.push(Number(minScore)); }

  sql += ' ORDER BY c.score_geral DESC';
  return db.prepare(sql).all(...params).map(deserializeRow);
}

function getProfilesByPoint(municipio) {
  let sql = `
    SELECT c.* FROM census_audience_profiles c
    JOIN pontos p ON p.id = c.ponto_id
    WHERE p.ativo = 1`;
  const params = [];
  if (municipio) { sql += ' AND p.cidade = ?'; params.push(municipio); }

  const byPoint = {};
  for (const row of db.prepare(sql).all(...params)) {
    byPoint[row.ponto_id] = deserializeRow(row);
  }
  return byPoint;
}

function getCoverageSummary(municipio) {
  const qTotal = municipio
    ? db.prepare('SELECT COUNT(*) as c FROM pontos WHERE ativo = 1 AND cidade = ?')
    : db.prepare('SELECT COUNT(*) as c FROM pontos WHERE ativo = 1');
  const total = (municipio ? qTotal.get(municipio) : qTotal.get()).c;

  const qProf = municipio
    ? db.prepare('SELECT COUNT(*) as c FROM census_audience_profiles c JOIN pontos p ON p.id = c.ponto_id WHERE p.ativo = 1 AND p.cidade = ?')
    : db.prepare('SELECT COUNT(*) as c FROM census_audience_profiles c JOIN pontos p ON p.id = c.ponto_id WHERE p.ativo = 1');
  const profiled = (municipio ? qProf.get(municipio) : qProf.get()).c;

  const qDist = municipio
    ? db.prepare('SELECT c.perfil_dominante as perfil, COUNT(*) as c FROM census_audience_profiles c JOIN pontos p ON p.id = c.ponto_id WHERE p.ativo = 1 AND p.cidade = ? GROUP BY c.perfil_dominante ORDER BY c DESC')
    : db.prepare('SELECT c.perfil_dominante as perfil, COUNT(*) as c FROM census_audience_profiles c JOIN pontos p ON p.id = c.ponto_id WHERE p.ativo = 1 GROUP BY c.perfil_dominante ORDER BY c DESC');
  const distribution = (municipio ? qDist.all(municipio) : qDist.all())
    .map(r => ({ perfil: r.perfil, label: PROFILES[r.perfil]?.label || r.perfil, count: r.c }));

  return {
    total,
    profiled,
    coveragePct: total > 0 ? Number((profiled / total).toFixed(4)) : 0,
    distribution
  };
}

// ─── GeoJSON Builder ────────────────────────────────────────────────────────

function buildGeoJSON({ municipio, perfil, minScore } = {}) {
  const profiles = getAllProfiles({ municipio, perfil, minScore });
  const ids = profiles.map(p => p.ponto_id);
  if (!ids.length) return { type: 'FeatureCollection', features: [] };

  const ph = ids.map(() => '?').join(',');
  const pontos = db.prepare(
    `SELECT id, nome, cidade, tipo, lat, lng, fluxo, publico, preco FROM pontos WHERE id IN (${ph})`
  ).all(...ids);
  const pMap = new Map(pontos.map(p => [p.id, p]));

  const features = profiles.filter(p => pMap.has(p.ponto_id)).map(profile => {
    const pt = pMap.get(profile.ponto_id);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(pt.lng), Number(pt.lat)] },
      properties: {
        id: pt.id,
        nome: pt.nome,
        municipio: pt.cidade,
        tipo: pt.tipo,
        fluxo: pt.fluxo,
        publico: pt.publico,
        preco: pt.preco,
        setor_censitario: profile.setor_censitario,
        perfis: profile.perfis,
        perfil_dominante: profile.perfil_dominante,
        score_geral: profile.score_geral,
        pois_proximos: profile.pois_proximos.slice(0, 10),
        fontes_dados: profile.fontes_dados
      }
    };
  });

  return { type: 'FeatureCollection', features };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  PROFILES,
  PROFILE_KEYS,
  PROFILE_LABELS,
  ANALYSIS_RADIUS,
  analyzePoint,
  analyzeCity,
  getProfile,
  getAllProfiles,
  getProfilesByPoint,
  getCoverageSummary,
  buildGeoJSON,
  fetchCensusData,
  getCensusTractMesh
};
