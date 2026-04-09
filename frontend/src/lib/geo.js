export function sanitizeCoordinate(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < min || numeric > max) return null;
  return Number(numeric.toFixed(7));
}

export function sanitizePoint(point) {
  const lat = sanitizeCoordinate(point?.lat, -90, 90);
  const lng = sanitizeCoordinate(point?.lng, -180, 180);
  if (lat === null || lng === null) return null;
  return { ...point, lat, lng };
}

export function sanitizePoints(points = []) {
  return (Array.isArray(points) ? points : [])
    .map((point) => sanitizePoint(point))
    .filter(Boolean);
}

export function mergeBounds(boundsList = []) {
  if (!boundsList.length) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const bounds of boundsList) {
    if (!Array.isArray(bounds) || bounds.length !== 4) continue;
    minLng = Math.min(minLng, Number(bounds[0]));
    minLat = Math.min(minLat, Number(bounds[1]));
    maxLng = Math.max(maxLng, Number(bounds[2]));
    maxLat = Math.max(maxLat, Number(bounds[3]));
  }

  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

export function computeCityBoundingBoxes(points = []) {
  const byCity = new Map();

  for (const point of sanitizePoints(points)) {
    const city = String(point?.cidade || '').trim();
    if (!city) continue;

    const current = byCity.get(city) || [point.lng, point.lat, point.lng, point.lat];
    current[0] = Math.min(current[0], point.lng);
    current[1] = Math.min(current[1], point.lat);
    current[2] = Math.max(current[2], point.lng);
    current[3] = Math.max(current[3], point.lat);
    byCity.set(city, current);
  }

  return Object.fromEntries(byCity);
}
