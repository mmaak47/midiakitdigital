const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const multer = require('multer');
const db = require('./database');
const { createBackupScheduler } = require('./backupService');
const {
  DEFAULT_RADIUS,
  getSegmentCategories,
  normalizeSegment,
  normalizeRadius,
  geocodeAddress,
  enqueueJob,
  getJob,
  listJobs,
  getScoresWithCoverage,
  invalidatePointCache,
  getProviderRuntimeInfo
} = require('./entornoAnalysis');

const app = express();
const PORT = process.env.PORT || 3002;
const uploadsPath = path.join(__dirname, 'uploads');
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');

// Middleware
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(compression({ threshold: 1024 }));
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

// Serve frontend build
app.use(express.static(frontendDistPath, {
  maxAge: '30d',
  etag: true,
  lastModified: true,
  index: false
}));

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (!allowed.includes(ext.toLowerCase())) {
      return cb(new Error('Tipo de arquivo não permitido'));
    }
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 3,
    fields: 30
  }
});

function pickUploadedPath(req, fieldName) {
  const file = req.files?.[fieldName]?.[0];
  return file ? `/uploads/${file.filename}` : null;
}

function parseOptionalCity(value) {
  if (Array.isArray(value)) {
    return parseOptionalCity(value[0]);
  }
  if (!value) return '';
  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === 'todas') return '';
  return normalized;
}

function parseOptionalValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (!value) return [];

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function appendMultiFilter(sqlParts, params, column, values) {
  if (!values.length) return;

  const placeholders = values.map(() => '?').join(', ');
  sqlParts.push(` AND ${column} IN (${placeholders})`);
  params.push(...values);
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PDF_LAYOUT_SETTINGS_KEY = 'pdf_layout_overrides';

function readPdfLayoutOverrides() {
  const row = db.prepare('SELECT value, updated_at FROM app_settings WHERE key = ?').get(PDF_LAYOUT_SETTINGS_KEY);
  if (!row?.value) {
    return { overrides: {}, updatedAt: null };
  }

  try {
    return {
      overrides: JSON.parse(row.value),
      updatedAt: row.updated_at || null
    };
  } catch {
    return { overrides: {}, updatedAt: row.updated_at || null };
  }
}

function writePdfLayoutOverrides(overrides) {
  const serialized = JSON.stringify(overrides || {});
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(PDF_LAYOUT_SETTINGS_KEY, serialized);

  return readPdfLayoutOverrides();
}

// ==================== API ROUTES ====================

// GET all pontos (with optional filters)
app.get('/api/pontos', (req, res) => {
  const { tipo, search } = req.query;
  const cidades = parseOptionalValues(req.query.cidade);
  const publicos = parseOptionalValues(req.query.publico);
  const sqlParts = ['SELECT * FROM pontos WHERE ativo = 1'];
  const params = [];

  appendMultiFilter(sqlParts, params, 'cidade', cidades);
  if (tipo) {
    sqlParts.push(' AND tipo = ?');
    params.push(tipo);
  }
  appendMultiFilter(sqlParts, params, 'publico', publicos);
  if (search) {
    sqlParts.push(' AND (nome LIKE ? OR endereco LIKE ? OR descricao LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  sqlParts.push(' ORDER BY cidade, nome');

  try {
    const pontos = db.prepare(sqlParts.join('')).all(...params);
    res.json(pontos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single ponto
app.get('/api/pontos/:id', (req, res) => {
  try {
    const ponto = db.prepare('SELECT * FROM pontos WHERE id = ?').get(req.params.id);
    if (!ponto) return res.status(404).json({ error: 'Ponto não encontrado' });
    res.json(ponto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET distinct publico values
app.get('/api/publicos', (req, res) => {
  try {
    const rows = db.prepare('SELECT DISTINCT publico FROM pontos WHERE ativo = 1 AND publico IS NOT NULL ORDER BY publico').all();
    res.json(rows.map(r => r.publico));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET stats
app.get('/api/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM pontos WHERE ativo = 1').get().c;
    const cidades = db.prepare('SELECT COUNT(DISTINCT cidade) as c FROM pontos WHERE ativo = 1').get().c;
    const telas = db.prepare('SELECT COALESCE(SUM(telas), 0) as c FROM pontos WHERE ativo = 1').get().c;
    const fluxo = db.prepare('SELECT COALESCE(SUM(fluxo), 0) as c FROM pontos WHERE ativo = 1').get().c;
    res.json({ total, cidades, telas, fluxo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin auth
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username e password obrigatórios' });
  }
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ? AND password = ?').get(username, password);
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.json({ success: true, token: Buffer.from(`${username}:${Date.now()}`).toString('base64') });
});

// CREATE ponto
app.post('/api/pontos', upload.fields([
  { name: 'imagem', maxCount: 1 },
  { name: 'simulacao_arte', maxCount: 1 },
  { name: 'simulacao_preview', maxCount: 1 }
]), (req, res) => {
  try {
    const data = req.body;
    const imagem = pickUploadedPath(req, 'imagem') || data.imagem || null;
    const simulacaoArte = pickUploadedPath(req, 'simulacao_arte') || data.simulacao_arte || null;
    const simulacaoPreview = pickUploadedPath(req, 'simulacao_preview') || data.simulacao_preview || null;
    const simulacaoTela = data.simulacao_tela || null;
    const arteLargura = parseInt(data.arte_largura, 10) || 1920;
    const arteAltura = parseInt(data.arte_altura, 10) || 1080;

    const stmt = db.prepare(`
      INSERT INTO pontos (nome, cidade, tipo, endereco, lat, lng, horario, fluxo, insercoes, tempo, loop, veiculacao, publico, telas, preco, descricao, imagem, simulacao_tela, simulacao_arte, simulacao_preview, arte_largura, arte_altura)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.nome, data.cidade, data.tipo, data.endereco,
      parseFloat(data.lat) || 0, parseFloat(data.lng) || 0,
      data.horario, parseInt(data.fluxo) || 0, parseInt(data.insercoes) || 0,
      data.tempo || '15s', data.loop || '3 min', data.veiculacao || 'Vídeo sem áudio',
      data.publico || 'A/B', parseInt(data.telas) || 1, parseFloat(data.preco) || 0,
      data.descricao, imagem, simulacaoTela, simulacaoArte, simulacaoPreview, arteLargura, arteAltura
    );

    const ponto = db.prepare('SELECT * FROM pontos WHERE id = ?').get(result.lastInsertRowid);
    invalidatePointCache(ponto.id);
    res.status(201).json(ponto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE ponto
app.put('/api/pontos/:id', upload.fields([
  { name: 'imagem', maxCount: 1 },
  { name: 'simulacao_arte', maxCount: 1 },
  { name: 'simulacao_preview', maxCount: 1 }
]), (req, res) => {
  try {
    const data = req.body;
    const existing = db.prepare('SELECT * FROM pontos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ponto não encontrado' });

    const imagem = pickUploadedPath(req, 'imagem') || data.imagem || existing.imagem;
    const simulacaoArte = pickUploadedPath(req, 'simulacao_arte') || data.simulacao_arte || existing.simulacao_arte;
    const simulacaoPreview = pickUploadedPath(req, 'simulacao_preview') || data.simulacao_preview || existing.simulacao_preview;
    const simulacaoTela = data.simulacao_tela || existing.simulacao_tela;
    const arteLargura = parseInt(data.arte_largura, 10) || existing.arte_largura || 1920;
    const arteAltura = parseInt(data.arte_altura, 10) || existing.arte_altura || 1080;

    const stmt = db.prepare(`
      UPDATE pontos SET
        nome = ?, cidade = ?, tipo = ?, endereco = ?, lat = ?, lng = ?,
        horario = ?, fluxo = ?, insercoes = ?, tempo = ?, loop = ?,
        veiculacao = ?, publico = ?, telas = ?, preco = ?, descricao = ?,
        imagem = ?, simulacao_tela = ?, simulacao_arte = ?, simulacao_preview = ?,
        arte_largura = ?, arte_altura = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      data.nome || existing.nome, data.cidade || existing.cidade, data.tipo || existing.tipo,
      data.endereco || existing.endereco,
      parseFloat(data.lat) || existing.lat, parseFloat(data.lng) || existing.lng,
      data.horario || existing.horario, parseInt(data.fluxo) || existing.fluxo,
      parseInt(data.insercoes) || existing.insercoes,
      data.tempo || existing.tempo, data.loop || existing.loop,
      data.veiculacao || existing.veiculacao, data.publico || existing.publico,
      parseInt(data.telas) || existing.telas, parseFloat(data.preco) || existing.preco,
      data.descricao || existing.descricao, imagem,
      simulacaoTela, simulacaoArte, simulacaoPreview,
      arteLargura, arteAltura,
      req.params.id
    );

    const ponto = db.prepare('SELECT * FROM pontos WHERE id = ?').get(req.params.id);
    const enderecoAlterado = String(data.endereco || existing.endereco) !== String(existing.endereco || '');
    const latInformada = data.lat !== undefined && data.lat !== null && String(data.lat).trim() !== '';
    const lngInformada = data.lng !== undefined && data.lng !== null && String(data.lng).trim() !== '';
    const coordenadasAlteradas = (latInformada && Number.parseFloat(data.lat) !== Number(existing.lat)) || (lngInformada && Number.parseFloat(data.lng) !== Number(existing.lng));
    if (enderecoAlterado || coordenadasAlteradas) {
      invalidatePointCache(ponto.id);
    }
    res.json(ponto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List available segment categories for entorno analysis
app.get('/api/entorno/categories', (req, res) => {
  const requested = req.query.segmento;
  const { segment, categories } = getSegmentCategories(requested);
  res.json({
    segmento: segment,
    categorias: categories,
    raioPadrao: DEFAULT_RADIUS,
    providers: getProviderRuntimeInfo()
  });
});

// Queue async entorno analysis job
app.post('/api/entorno/analyze', (req, res) => {
  try {
    const segmento = normalizeSegment(req.body?.segmento || req.query.segmento);
    const raio = normalizeRadius(req.body?.raio || req.query.raio || DEFAULT_RADIUS);
    const cidade = parseOptionalCity(req.body?.cidade || req.query.cidade);
    const job = enqueueJob({ segment: segmento, radius: raio, city: cidade });

    res.status(202).json({
      success: true,
      ...job,
      message: job.deduplicated
        ? 'Analise ja estava em andamento para esse recorte.'
        : 'Analise de entorno enfileirada com sucesso.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get job status
app.get('/api/entorno/jobs/:id', (req, res) => {
  try {
    const jobId = Number(req.params.id);
    if (!Number.isFinite(jobId)) {
      return res.status(400).json({ error: 'job id invalido' });
    }
    const job = getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'job nao encontrado' });
    }
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List recent jobs for monitoring in admin
app.get('/api/entorno/jobs', (req, res) => {
  try {
    const cidade = parseOptionalCity(req.query.cidade);
    const jobs = listJobs({
      limit: req.query.limit,
      status: req.query.status ? String(req.query.status).trim() : '',
      segment: req.query.segmento ? String(req.query.segmento).trim() : '',
      city: cidade
    });
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read cached entorno scores and optionally auto-queue refresh
app.get('/api/entorno/scores', (req, res) => {
  try {
    const segmento = normalizeSegment(req.query.segmento);
    const raio = normalizeRadius(req.query.raio || DEFAULT_RADIUS);
    const cidade = parseOptionalCity(req.query.cidade);
    const force = String(req.query.force || '').toLowerCase() === 'true';

    const scores = getScoresWithCoverage({ segment: segmento, radius: raio, city: cidade });
    let job = null;

    if (force || scores.coverage < 0.85) {
      job = enqueueJob({ segment: segmento, radius: raio, city: cidade });
    }

    res.json({
      segmento,
      raio,
      cidade,
      totalPontos: scores.totalPoints,
      pontosComCache: scores.freshPoints,
      coberturaCache: Number(scores.coverage.toFixed(4)),
      metrics: scores.metrics,
      byPoint: scores.byPoint,
      job
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/entorno/client-address', async (req, res) => {
  try {
    const address = String(req.body?.address || '').trim();
    const requestedCities = parseOptionalValues(req.body?.cidade);
    const pointIds = Array.isArray(req.body?.pointIds)
      ? req.body.pointIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    if (!address) {
      return res.status(400).json({ error: 'Endereço do cliente é obrigatório' });
    }

    const location = await geocodeAddress(address);
    if (!location) {
      return res.status(404).json({ error: 'Não foi possível localizar o endereço informado' });
    }

    const sqlParts = ['SELECT * FROM pontos WHERE ativo = 1'];
    const params = [];

    if (pointIds.length) {
      const placeholders = pointIds.map(() => '?').join(', ');
      sqlParts.push(` AND id IN (${placeholders})`);
      params.push(...pointIds);
    }

    appendMultiFilter(sqlParts, params, 'cidade', requestedCities);
    sqlParts.push(' ORDER BY nome');

    const points = db.prepare(sqlParts.join('')).all(...params);
    const byPoint = {};
    const rankedPoints = [];

    points.forEach((point) => {
      if (!Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) {
        return;
      }

      const distanceMeters = haversineDistanceMeters(location.lat, location.lng, Number(point.lat), Number(point.lng));
      const distanceKm = distanceMeters / 1000;
      const proximityScore = Math.max(0, 10 - Math.min(10, distanceKm * 1.35));
      const payload = {
        pointId: point.id,
        distanceMeters,
        distanceKm,
        proximityScore
      };

      byPoint[point.id] = payload;
      rankedPoints.push({
        id: point.id,
        nome: point.nome,
        cidade: point.cidade,
        tipo: point.tipo,
        ...payload
      });
    });

    rankedPoints.sort((a, b) => a.distanceMeters - b.distanceMeters);

    res.json({
      address,
      location,
      byPoint,
      rankedPoints: rankedPoints.slice(0, 12)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE ponto (soft delete)
app.delete('/api/pontos/:id', (req, res) => {
  try {
    const result = db.prepare('UPDATE pontos SET ativo = 0 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Ponto não encontrado' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all pontos for admin (including inactive)
app.get('/api/admin/pontos', (req, res) => {
  try {
    const pontos = db.prepare('SELECT * FROM pontos ORDER BY cidade, nome').all();
    res.json(pontos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, username FROM admin_users ORDER BY username ASC').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Usuário deve ter ao menos 3 caracteres' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    }

    const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Usuário já existe' });
    }

    const result = db.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run(username, password);
    const created = db.prepare('SELECT id, username FROM admin_users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM admin_users').get();
    if (count.c <= 1) {
      return res.status(400).json({ error: 'Não é possível remover o último usuário administrador' });
    }

    const result = db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
    if (!result.changes) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/pdf-layout', (req, res) => {
  try {
    res.json(readPdfLayoutOverrides());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/pdf-layout', (req, res) => {
  try {
    const overrides = req.body?.overrides;
    if (overrides && (typeof overrides !== 'object' || Array.isArray(overrides))) {
      return res.status(400).json({ error: 'overrides deve ser um objeto JSON' });
    }
    res.json(writePdfLayoutOverrides(overrides || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/pdf-layout', (req, res) => {
  try {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(PDF_LAYOUT_SETTINGS_KEY);
    res.json({ success: true, overrides: {}, updatedAt: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Intermidia Mídia Kit API running on port ${PORT}`);
  if (String(process.env.SQLITE_BACKUP_ENABLED || 'true').toLowerCase() !== 'false') {
    createBackupScheduler(db);
  } else {
    console.log('[backup] Automatic SQLite backup disabled by SQLITE_BACKUP_ENABLED=false');
  }
});
