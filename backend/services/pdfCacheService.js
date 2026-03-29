const fs = require('fs');

function slugifyCity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCitySlugs(citySlugs = []) {
  return Array.from(new Set(
    (Array.isArray(citySlugs) ? citySlugs : [])
      .map((value) => slugifyCity(value))
      .filter(Boolean)
  ));
}

function getCombinationKey(citySlugs = []) {
  const normalized = normalizeCitySlugs(citySlugs);
  if (!normalized.length) return 'consolidado';
  return [...normalized].sort().join('+');
}

function buildSnapshotRows(snapshot = {}) {
  const rows = [];
  Object.entries(snapshot).forEach(([citySlug, values]) => {
    rows.push({ snapshot_type: 'point_count', city_slug: citySlug, snapshot_value: String(values.pointCount || 0) });
    rows.push({ snapshot_type: 'photo_count', city_slug: citySlug, snapshot_value: String(values.photoCount || 0) });
    rows.push({ snapshot_type: 'point_hash', city_slug: citySlug, snapshot_value: String(values.pointHash || '') });
  });
  return rows;
}

function parseSnapshotRows(rows = []) {
  const snapshot = {};
  rows.forEach((row) => {
    const citySlug = String(row.city_slug || '');
    if (!citySlug) return;
    if (!snapshot[citySlug]) {
      snapshot[citySlug] = { pointCount: 0, photoCount: 0, pointHash: '' };
    }

    const type = String(row.snapshot_type || '');
    if (type === 'point_count') snapshot[citySlug].pointCount = Number(row.snapshot_value || 0);
    if (type === 'photo_count') snapshot[citySlug].photoCount = Number(row.snapshot_value || 0);
    if (type === 'point_hash') snapshot[citySlug].pointHash = String(row.snapshot_value || '');
  });
  return snapshot;
}

async function getCurrentSnapshot(citySlugs, db) {
  const snapshot = {};
  const normalized = normalizeCitySlugs(citySlugs);

  const allPoints = db.prepare(`
    SELECT id, nome, cidade, updated_at, imagem, imagem2
    FROM pontos
    WHERE ativo = 1
    ORDER BY id
  `).all();

  normalized.forEach((citySlug) => {
    const cityPoints = allPoints.filter((point) => slugifyCity(point.cidade) === citySlug);
    const pointHash = cityPoints
      .map((point) => String(point.updated_at || `${point.id}_${point.nome || ''}`))
      .join(',');
    const photoCount = cityPoints.reduce((sum, point) => {
      let count = sum;
      if (String(point.imagem || '').trim()) count += 1;
      if (String(point.imagem2 || '').trim()) count += 1;
      return count;
    }, 0);

    snapshot[citySlug] = {
      pointCount: cityPoints.length,
      photoCount,
      pointHash
    };
  });

  return snapshot;
}

async function findValidCache(combinationKey, citySlugs, db) {
  const row = db.prepare(`
    SELECT *
    FROM pdf_cache
    WHERE combination_key = ? AND is_valid = 1
  `).get(combinationKey);

  if (!row) return null;

  if (!fs.existsSync(row.file_path)) {
    db.prepare('UPDATE pdf_cache SET is_valid = 0 WHERE id = ?').run(row.id);
    return null;
  }

  const currentSnapshot = await getCurrentSnapshot(citySlugs, db);
  const storedRows = db.prepare(`
    SELECT snapshot_type, city_slug, snapshot_value
    FROM pdf_cache_snapshot
    WHERE cache_id = ?
  `).all(row.id);
  const storedSnapshot = parseSnapshotRows(storedRows);

  const cities = normalizeCitySlugs(citySlugs);
  const invalid = cities.some((citySlug) => {
    const current = currentSnapshot[citySlug] || { pointCount: 0, photoCount: 0, pointHash: '' };
    const stored = storedSnapshot[citySlug] || { pointCount: -1, photoCount: -1, pointHash: '__missing__' };
    return current.pointCount !== stored.pointCount
      || current.photoCount !== stored.photoCount
      || current.pointHash !== stored.pointHash;
  });

  if (invalid) {
    db.prepare('UPDATE pdf_cache SET is_valid = 0 WHERE id = ?').run(row.id);
    return null;
  }

  return row;
}

async function saveCache(combinationKey, citySlugs, filePath, fileSize, db) {
  db.prepare('UPDATE pdf_cache SET is_valid = 0 WHERE combination_key = ?').run(combinationKey);

  const citySlugsNormalized = normalizeCitySlugs(citySlugs);
  const result = db.prepare(`
    INSERT INTO pdf_cache (combination_key, city_slugs, file_path, file_size_kb, generated_at, is_valid)
    VALUES (?, ?, ?, ?, datetime('now'), 1)
  `).run(
    combinationKey,
    JSON.stringify(citySlugsNormalized),
    filePath,
    Number.isFinite(Number(fileSize)) ? Math.round(Number(fileSize)) : null
  );

  const cacheId = result.lastInsertRowid;
  const snapshot = await getCurrentSnapshot(citySlugsNormalized, db);
  const snapshotRows = buildSnapshotRows(snapshot);
  const insertSnapshot = db.prepare(`
    INSERT INTO pdf_cache_snapshot (cache_id, snapshot_type, city_slug, snapshot_value)
    VALUES (?, ?, ?, ?)
  `);

  snapshotRows.forEach((row) => {
    insertSnapshot.run(cacheId, row.snapshot_type, row.city_slug, row.snapshot_value);
  });
}

async function invalidateCityCaches(citySlug, db) {
  const normalized = slugifyCity(citySlug);
  if (!normalized) return;

  const rows = db.prepare(`
    SELECT id
    FROM pdf_cache
    WHERE city_slugs LIKE '%' || ? || '%'
      AND is_valid = 1
  `).all(normalized);

  rows.forEach((row) => {
    db.prepare('UPDATE pdf_cache SET is_valid = 0 WHERE id = ?').run(row.id);
  });
}

module.exports = {
  slugifyCity,
  normalizeCitySlugs,
  getCombinationKey,
  getCurrentSnapshot,
  findValidCache,
  saveCache,
  invalidateCityCaches
};
