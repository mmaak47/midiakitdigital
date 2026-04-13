'use strict';

const GOOGLE_NEARBY_URL = process.env.GOOGLE_PLACES_NEARBY_URL || 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const GOOGLE_DETAILS_URL = process.env.GOOGLE_PLACES_DETAILS_URL || 'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
const DEFAULT_RADIUS_METERS = Number(process.env.GOOGLE_HOURS_SYNC_RADIUS_METERS) || 220;
const FETCH_TIMEOUT_MS = Number(process.env.GOOGLE_HOURS_SYNC_TIMEOUT_MS) || 12000;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTokens(value) {
  const stop = new Set(['posto', 'ed', 'edificio', 'residence', 'residencial', 'condominio', 'the', 'de', 'da', 'do', 'e']);
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stop.has(token));
}

function jaccardSimilarity(a, b) {
  const setA = new Set(toTokens(a));
  const setB = new Set(toTokens(b));
  if (!setA.size || !setB.size) return 0;

  let inter = 0;
  setA.forEach((token) => {
    if (setB.has(token)) inter += 1;
  });

  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildConfidence(pointName, placeName, distanceMeters, radiusMeters) {
  const nameScore = jaccardSimilarity(pointName, placeName);
  const normalizedPoint = normalizeText(pointName);
  const normalizedPlace = normalizeText(placeName);
  const containsBoost = (normalizedPoint && normalizedPlace)
    && (normalizedPlace.includes(normalizedPoint) || normalizedPoint.includes(normalizedPlace))
    ? 0.15
    : 0;
  const distanceScore = Math.max(0, 1 - (distanceMeters / Math.max(1, radiusMeters)));
  const confidence = Math.min(1, (nameScore * 0.72) + (distanceScore * 0.28) + containsBoost);
  return { confidence, nameScore, distanceScore };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function findBestPlaceByNameAndCoords({ name, lat, lng, radiusMeters }) {
  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    location: `${lat},${lng}`,
    radius: String(radiusMeters),
    keyword: String(name || ''),
    language: 'pt-BR'
  });

  const payload = await fetchJson(`${GOOGLE_NEARBY_URL}?${params.toString()}`);
  const results = Array.isArray(payload?.results) ? payload.results : [];

  let best = null;
  results.forEach((result) => {
    const placeLat = Number(result?.geometry?.location?.lat);
    const placeLng = Number(result?.geometry?.location?.lng);
    if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) return;

    const distanceMeters = haversineMeters(lat, lng, placeLat, placeLng);
    const { confidence, nameScore, distanceScore } = buildConfidence(name, result?.name || '', distanceMeters, radiusMeters);

    const candidate = {
      placeId: result?.place_id || '',
      placeName: result?.name || '',
      vicinity: result?.vicinity || '',
      distanceMeters,
      confidence,
      nameScore,
      distanceScore
    };

    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    }
  });

  return best;
}

async function fetchPlaceOpeningHours(placeId) {
  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    place_id: placeId,
    fields: 'name,place_id,opening_hours,formatted_address',
    language: 'pt-BR'
  });

  const payload = await fetchJson(`${GOOGLE_DETAILS_URL}?${params.toString()}`);
  return payload?.result || null;
}

function extractGoogleHoursText(details) {
  const weekdayText = details?.opening_hours?.weekday_text;
  if (!Array.isArray(weekdayText) || !weekdayText.length) return '';
  return weekdayText.join(' | ').trim();
}

async function syncPointOperatingHours({ point, radiusMeters, dryRun = true, confidenceThreshold = 0.56 }) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'missing_coordinates' };
  }

  const best = await findBestPlaceByNameAndCoords({
    name: point?.nome || '',
    lat,
    lng,
    radiusMeters
  });

  if (!best?.placeId) {
    return { ok: false, reason: 'no_candidate' };
  }

  if (best.distanceMeters > radiusMeters || best.confidence < confidenceThreshold) {
    return {
      ok: false,
      reason: 'low_confidence_match',
      match: best
    };
  }

  const details = await fetchPlaceOpeningHours(best.placeId);
  const hoursText = extractGoogleHoursText(details);
  if (!hoursText) {
    return {
      ok: false,
      reason: 'no_opening_hours',
      match: best,
      placeName: details?.name || best.placeName
    };
  }

  return {
    ok: true,
    dryRun,
    pointId: point.id,
    pointName: point.nome,
    previousHours: point.horario || '',
    newHours: hoursText,
    match: {
      ...best,
      placeName: details?.name || best.placeName,
      formattedAddress: details?.formatted_address || ''
    }
  };
}

function assertConfigured() {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY (ou GOOGLE_MAPS_API_KEY) nao configurada no backend/.env');
  }
}

module.exports = {
  DEFAULT_RADIUS_METERS,
  assertConfigured,
  syncPointOperatingHours
};
