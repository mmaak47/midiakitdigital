require('dotenv').config();

// ---------------------------------------------------------------------------
// Hard startup validation — crash early with clear message if DB is misconfigured
// ---------------------------------------------------------------------------
if (String(process.env.DB_ENGINE || '').toLowerCase() === 'postgres' && !process.env.DATABASE_URL) {
  console.error('[FATAL] DB_ENGINE=postgres but DATABASE_URL is not set.');
  console.error('        Check backend/.env or PM2 ecosystem env vars.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const { startLicenseWatcher, requireLicense, isLicensed } = require('./license');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const db = require('./database');
const cidadeFotosRouter = require('./routes/cidadeFotos');
const arteRouter        = require('./routes/arte');
const comercialChatRouter = require('./routes/comercialChat');
const {
  createAuthToken,
  parseAuthToken,
  extractBearerToken,
  hashPassword,
  verifyPassword,
  isPasswordHash
} = require('./auth');
const { createBackupScheduler } = require('./backupService');
const { renderHtmlToPdfCompressed: renderHtmlToPdf } = require('./pdfService');
const {
  slugifyCity,
  normalizeCitySlugs,
  getCombinationKey,
  findValidCache,
  saveCache,
  invalidateCityCaches
} = require('./services/pdfCacheService');
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
  getProviderRuntimeInfo,
  startAutoRefreshScheduler,
  getAutoRefreshConfig,
  getAutoRefreshState,
  runAutoRefreshCycle
} = require('./entornoAnalysis');
const geoAudience = require('./geoAudienceService');
const censusAudience = require('./censusAudienceService');
const audienceIntel = require('./audienceIntelService');

const app = express();

const DB_ENGINE = String(process.env.DB_ENGINE || 'sqlite').toLowerCase();
const PORT = process.env.PORT || 3002;

// ---------------------------------------------------------------------------
// Global error handlers — prevent silent crashes under Passenger / shared hosting
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
});

const uploadsPath = path.join(__dirname, 'uploads');
const pdfCachePath = path.join(__dirname, 'pdf-cache');
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
const ELEVADOR_TIPO = 'Elevador';
const ELEVADOR_ARTE_LARGURA = 1080;
const ELEVADOR_ARTE_ALTURA = 1920;
const ALLOWED_UPLOAD_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_AUDIENCE_TAGS = [
  { key: 'classe-a', label: 'Classe A', weight: 1 },
  { key: 'classe-b', label: 'Classe B', weight: 1 },
  { key: 'premium', label: 'Premium', weight: 1 },
  { key: 'familias', label: 'Familias', weight: 1 },
  { key: 'jovens', label: 'Jovens', weight: 1 },
  { key: 'executivos', label: 'Executivos', weight: 1 },
  { key: 'motoristas', label: 'Motoristas', weight: 1 },
  { key: 'shopper', label: 'Shopper', weight: 1 },
  { key: 'moradores', label: 'Moradores', weight: 1 },
  { key: 'turistas', label: 'Turistas', weight: 1 }
];
const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_BLOCKS = ['morning', 'afternoon', 'evening'];

function getAllowedOrigins() {
  const fromEnv = String(process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (fromEnv.length) {
    return new Set(fromEnv);
  }

  return new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]);
}

const allowedOrigins = getAllowedOrigins();

function corsOriginValidator(origin, callback) {
  if (!origin || allowedOrigins.has(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('Origem não permitida pelo CORS'));
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 15),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }
});

const pdfRenderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PDF_RENDER_RATE_LIMIT_MAX || 50),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
  message: { error: 'Limite de geração de PDF atingido. Tente novamente em alguns minutos.' }
});

const loginSchema = z.object({
  username: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  password: z.string().min(1)
}).refine((value) => value.username || value.email, {
  message: 'Usuário ou e-mail é obrigatório',
  path: ['username']
});

function validateLoginPayload(req, res, next) {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Payload inválido',
      details: parsed.error.flatten()
    });
  }

  req.body = parsed.data;
  next();
}

function ensureValidCoordinate(value, min, max, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${fieldName} inválido`);
  }
}

function validateCoordinates(req, res, next) {
  try {
    ensureValidCoordinate(req.body?.lat, -90, 90, 'lat');
    ensureValidCoordinate(req.body?.lng, -180, 180, 'lng');
    next();
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

function normalizeCoordinateForDb(value, min, max, fallback = null) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error('Coordenada inválida');
  }

  return Number(numeric.toFixed(7));
}

function extensionFromMime(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

// Middleware
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use('/api', cors({ origin: corsOriginValidator }));
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// PDF render endpoint — must be registered before global express.json (own 120mb body parser)
app.post('/api/pdf/render', pdfRenderLimiter, express.json({ limit: '120mb' }), async (req, res) => {
  const { html, fileName } = req.body || {};
  const bypassCache = String(req.body?.noCache || '').toLowerCase() === 'true' || req.body?.noCache === true;
  console.log(`[pdf/render] request received: htmlLen=${html?.length || 0} fileName=${fileName || '?'} noCache=${bypassCache}`);
  if (!html || typeof html !== 'string' || html.length < 10) {
    return res.status(400).json({ error: 'Parâmetro html obrigatório.' });
  }
  if (html.length > 100_000_000) {
    return res.status(400).json({ error: 'Conteúdo HTML excede o limite permitido.' });
  }

  const citySlugs = normalizeCitySlugs(
    req.body?.citySlugs
    || req.body?.cities
    || req.body?.pracas
    || req.body?.cidades
    || []
  );
  const cacheableCities = citySlugs.length ? citySlugs : ['consolidado'];
  const combinationKey = getCombinationKey(cacheableCities);
  const requestedName = String(fileName || `midia-kit-${combinationKey}.pdf`).trim() || `midia-kit-${combinationKey}.pdf`;
  const fallbackName = requestedName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\-_. ]/g, '_');
  const safeName = fallbackName || `midia-kit-${combinationKey}.pdf`;
  const encodedName = encodeURIComponent(requestedName);
  const contentDisposition = `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`;

  try {
    if (!fs.existsSync(pdfCachePath)) {
      fs.mkdirSync(pdfCachePath, { recursive: true });
    }

    if (!bypassCache) {
      const cached = await findValidCache(combinationKey, cacheableCities, db);
      if (cached) {
        db.prepare('UPDATE pdf_cache SET download_count = download_count + 1 WHERE id = ?').run(cached.id);
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': contentDisposition,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Download-Options': 'noopen',
          'X-PDF-Cache': 'HIT',
        });
        return fs.createReadStream(cached.file_path).pipe(res);
      }
    }

    const pdfBuffer = await renderHtmlToPdf(html);
    if (!bypassCache) {
      const outputPath = path.join(pdfCachePath, `${combinationKey}.pdf`);
      fs.writeFileSync(outputPath, pdfBuffer);
      const fileSizeKb = Math.round(fs.statSync(outputPath).size / 1024);
      await saveCache(combinationKey, cacheableCities, outputPath, fileSizeKb, db);
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Download-Options': 'noopen',
      'X-PDF-Cache': bypassCache ? 'BYPASS' : 'MISS',
    });
    console.log(`[pdf/render] success: ${safeName} size=${pdfBuffer.length} cache=${bypassCache ? 'BYPASS' : 'MISS'}`);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('[pdf/render] Erro:', err.message || err);
    return res.status(500).json({ error: 'Erro ao gerar PDF.' });
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(compression({ threshold: 1024 }));
app.use('/api', apiLimiter);

function resolveAuthenticatedUser(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação obrigatório.' });
    }

    const claims = parseAuthToken(token);
    const user = db.prepare(`
      SELECT id, first_name, last_name, username, email, whatsapp, role, photo_url
      FROM admin_users
      WHERE id = ? AND lower(username) = lower(?)
      LIMIT 1
    `).get(Number(claims.sub), String(claims.username || ''));

    if (!user) {
      return res.status(401).json({ error: 'Sessão inválida.' });
    }

    req.authUser = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

function requireRoles(roles = []) {
  return (req, res, next) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Autenticação obrigatória.' });
    }
    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({ error: 'Acesso negado para este perfil.' });
    }
    next();
  };
}

function authenticateSensitiveApi(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  const routePath = String(req.path || '');

  if (routePath === '/auth/login') return next();

  // Webhook da Evolution API — não exige autenticação
  if (routePath.startsWith('/webhooks/')) return next();

  const publicGetPrefixes = [
    '/pontos',
    '/publicos',
    '/stats',
    '/audience-tags',
    '/cidade-fotos',
    '/geoaudience/profiles',
    '/census/profiles',
    '/audience-intel/profiles',
    '/monitors',
    '/loop-audit'
  ];

  if (method === 'GET' && publicGetPrefixes.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))) {
    return next();
  }

  return resolveAuthenticatedUser(req, res, next);
}

app.use('/api', authenticateSensitiveApi);
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (String(process.env.UPLOADS_FORCE_ATTACHMENT || 'false').toLowerCase() === 'true') {
      res.setHeader('Content-Disposition', 'attachment');
    }
  }
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
    const ext = extensionFromMime(file.mimetype);
    if (!ext) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }

    cb(null, `${randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME.has(file.mimetype)) {
      cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou WEBP.'));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 4,
    fields: 60
  }
});

function pickUploadedPath(req, fieldName) {
  const file = req.files?.[fieldName]?.[0];
  return file ? `/uploads/${file.filename}` : null;
}

// Expor db e uploadsPath para routers via app.set (antes de registrar as rotas)
app.set('db', db);
app.set('uploadsDir', uploadsPath);

app.use('/api', cidadeFotosRouter);
app.use('/api/arte', arteRouter);

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeElevadorCategoria(value, fallback = 'Comercial') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'residencial') return 'Residencial';
  if (normalized === 'comercial') return 'Comercial';
  return fallback;
}

const VALID_FOCAL_POINTS = new Set([
  'center center',
  'top center',
  'bottom center',
  'center left',
  'center right',
  'top left',
  'top right',
  'bottom left',
  'bottom right'
]);

function normalizeFotoFocalPoint(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (VALID_FOCAL_POINTS.has(normalized)) return normalized;
  return 'center center';
}

const VALID_PDF_IMAGE_SOURCES = new Set(['imagem', 'imagem2']);

function normalizePdfImageSource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (VALID_PDF_IMAGE_SOURCES.has(normalized)) return normalized;
  return 'imagem2';
}

function normalizePhysicalSizeMeters(value, fallback = null) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const numeric = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Number(numeric.toFixed(3));
}

function slugifyUsernamePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function buildBaseUsername(firstName, lastName) {
  const joined = [slugifyUsernamePart(firstName), slugifyUsernamePart(lastName)].filter(Boolean).join('.');
  return joined || `usuario.${Date.now()}`;
}

function resolveUniqueUsername(firstName, lastName) {
  const base = buildBaseUsername(firstName, lastName);
  let candidate = base;
  let suffix = 2;
  while (db.prepare('SELECT id FROM admin_users WHERE lower(username) = lower(?)').get(candidate)) {
    candidate = `${base}.${suffix}`;
    suffix += 1;
  }
  return candidate;
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

function normalizeAudienceTagKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveAudienceLabel(key, fallback = '') {
  const found = DEFAULT_AUDIENCE_TAGS.find((tag) => tag.key === key);
  if (found) return found.label;
  return String(fallback || key)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function parseJsonLikeInput(raw, fallbackValue) {
  if (raw === undefined || raw === null || raw === '') return fallbackValue;
  if (typeof raw === 'object') return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function audienceTagsFromPublico(publico) {
  const normalized = String(publico || '').toUpperCase();
  const tags = [];

  if (normalized.includes('A')) {
    tags.push({ key: 'classe-a', label: 'Classe A', weight: 1.15 });
  }
  if (normalized.includes('B')) {
    tags.push({ key: 'classe-b', label: 'Classe B', weight: 1.05 });
  }

  return tags;
}

function normalizeAudienceTagsInput(raw, fallbackPublico = '') {
  const parsed = parseJsonLikeInput(raw, raw);
  const list = Array.isArray(parsed)
    ? parsed
    : String(parsed || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const normalized = [];
  const seen = new Set();

  const sourceItems = list.length ? list : audienceTagsFromPublico(fallbackPublico);

  for (const item of sourceItems) {
    const rawKey = typeof item === 'object' ? item.key || item.value || item.label : item;
    const key = normalizeAudienceTagKey(rawKey);
    if (!key || seen.has(key)) continue;

    const rawWeight = typeof item === 'object' ? Number(item.weight) : Number.NaN;
    const weight = Number.isFinite(rawWeight) ? clamp(rawWeight, 0.4, 2) : 1;
    const label = resolveAudienceLabel(key, typeof item === 'object' ? item.label : item);

    normalized.push({ key, label, weight: Number(weight.toFixed(2)) });
    seen.add(key);

    if (normalized.length >= 16) break;
  }

  return normalized;
}

function defaultAvailabilityForHorario(horario = '') {
  const normalized = String(horario || '').toLowerCase();
  const is24h = normalized.includes('24');
  const base = is24h ? 0.92 : 0.78;

  return {
    defaultPct: base,
    dayFactors: {
      mon: 1,
      tue: 1,
      wed: 1,
      thu: 1,
      fri: 1,
      sat: 0.95,
      sun: 0.9
    },
    blockFactors: {
      morning: 0.95,
      afternoon: 1,
      evening: is24h ? 1 : 0.82
    }
  };
}

function normalizeAvailabilityCalendarInput(raw, fallbackHorario = '') {
  const baseline = defaultAvailabilityForHorario(fallbackHorario);
  const parsed = parseJsonLikeInput(raw, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return baseline;
  }

  const defaultPct = Number.isFinite(Number(parsed.defaultPct))
    ? clamp(Number(parsed.defaultPct), 0.2, 1)
    : baseline.defaultPct;

  const dayFactors = { ...baseline.dayFactors };
  WEEK_DAYS.forEach((day) => {
    if (Number.isFinite(Number(parsed.dayFactors?.[day]))) {
      dayFactors[day] = clamp(Number(parsed.dayFactors[day]), 0.2, 1.5);
    }
  });

  const blockFactors = { ...baseline.blockFactors };
  TIME_BLOCKS.forEach((block) => {
    if (Number.isFinite(Number(parsed.blockFactors?.[block]))) {
      blockFactors[block] = clamp(Number(parsed.blockFactors[block]), 0.2, 1.5);
    }
  });

  return {
    defaultPct: Number(defaultPct.toFixed(3)),
    dayFactors,
    blockFactors
  };
}

function hydratePontoRow(row) {
  if (!row) return row;

  return {
    ...row,
    foto_focal_point: normalizeFotoFocalPoint(row.foto_focal_point),
    pdf_image_source: normalizePdfImageSource(row.pdf_image_source),
    audience_tags: normalizeAudienceTagsInput(row.audience_tags, row.publico),
    availability_calendar: normalizeAvailabilityCalendarInput(row.availability_calendar, row.horario)
  };
}

function buildAudienceTagCatalog(rows = []) {
  const map = new Map();

  DEFAULT_AUDIENCE_TAGS.forEach((tag) => {
    map.set(tag.key, { ...tag, count: 0 });
  });

  rows.forEach((row) => {
    const tags = normalizeAudienceTagsInput(row?.audience_tags, row?.publico);
    tags.forEach((tag) => {
      const current = map.get(tag.key) || { key: tag.key, label: tag.label, weight: 1, count: 0 };
      map.set(tag.key, {
        ...current,
        label: tag.label || current.label,
        weight: Number(tag.weight) || current.weight,
        count: Number(current.count || 0) + 1
      });
    });
  });

  return Array.from(map.values())
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label, 'pt-BR'));
}

// ==================== API ROUTES ====================

// GET all pontos (with optional filters)
app.get('/api/pontos', (req, res) => {
  const { tipo, search } = req.query;
  const elevadorCategoria = String(req.query.elevador_categoria || '').trim();
  const cidades = parseOptionalValues(req.query.cidade);
  const publicos = parseOptionalValues(req.query.publico);
  const audienceTags = parseOptionalValues(req.query.audience_tag).map((value) => normalizeAudienceTagKey(value)).filter(Boolean);
  const sqlParts = ['SELECT * FROM pontos WHERE ativo = 1'];
  const params = [];

  appendMultiFilter(sqlParts, params, 'cidade', cidades);
  if (tipo) {
    sqlParts.push(' AND tipo = ?');
    params.push(tipo);
  }
  appendMultiFilter(sqlParts, params, 'publico', publicos);
  if (elevadorCategoria) {
    sqlParts.push(' AND tipo = ? AND elevador_categoria = ?');
    params.push(ELEVADOR_TIPO, normalizeElevadorCategoria(elevadorCategoria));
  }
  if (search) {
    sqlParts.push(' AND (nome LIKE ? OR endereco LIKE ? OR descricao LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  audienceTags.forEach((tag) => {
    sqlParts.push(' AND lower(audience_tags) LIKE ?');
    params.push(`%"key":"${tag}"%`);
  });

  // Census audience profile filter — supports ?perfil=alta_renda&municipio=Londrina
  const perfilFilter = String(req.query.perfil || '').trim();
  if (perfilFilter && censusAudience.PROFILE_KEYS.includes(perfilFilter)) {
    sqlParts.push(' AND id IN (SELECT ponto_id FROM census_audience_profiles WHERE perfil_dominante = ?)');
    params.push(perfilFilter);
  }

  sqlParts.push(' ORDER BY cidade, nome');

  try {
    const pontos = db.prepare(sqlParts.join('')).all(...params).map(hydratePontoRow);
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
    res.json(hydratePontoRow(ponto));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audience-tags', (req, res) => {
  try {
    const rows = db.prepare('SELECT audience_tags, publico FROM pontos WHERE ativo = 1').all();
    res.json(buildAudienceTagCatalog(rows));
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

// ── Public Monitor API (auditoria de loop) ───────────────────────────────────
const openCors = cors({ origin: '*', methods: ['GET', 'HEAD', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Accept'], maxAge: 86400 });

// Tipos que não participam da auditoria de loop (impressão física ou gerenciamento externo)
const MONITOR_BASE_WHERE = `ativo = 1 AND tipo NOT IN ('Backlight','Frontlight','Totem Digital','Circuito Muffato')`;
const MONITOR_SELECT = `SELECT id, nome, cidade, tipo, endereco, loop, tempo, telas, insercoes, monitor_last_seen FROM pontos`;

function loopTextToSeconds(loop) {
  if (!loop) return null;
  const s = String(loop).trim().toLowerCase();
  const minMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*min/);
  if (minMatch) return Math.round(parseFloat(minMatch[1].replace(',', '.')) * 60);
  const mmssMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mmssMatch) return parseInt(mmssMatch[1], 10) * 60 + parseInt(mmssMatch[2], 10);
  const secMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*s(?:eg(?:undos?)?)?\.?$/);
  if (secMatch) return Math.round(parseFloat(secMatch[1].replace(',', '.')));
  const hMinMatch = s.match(/^(\d+)\s*h\s*(?:(\d+)\s*min)?/);
  if (hMinMatch) return parseInt(hMinMatch[1], 10) * 3600 + (hMinMatch[2] ? parseInt(hMinMatch[2], 10) * 60 : 0);
  return null;
}

function tempoTextToSeconds(tempo) {
  if (!tempo) return 15;
  const s = String(tempo).trim().toLowerCase();
  const secMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*s(?:eg)?\.?$/);
  if (secMatch) return Math.round(parseFloat(secMatch[1].replace(',', '.')));
  const minMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*min/);
  if (minMatch) return Math.round(parseFloat(minMatch[1].replace(',', '.')) * 60);
  return 15;
}

function deriveMonitorLocal(ponto) {
  const baseName = ponto.nome
    .replace(/\s*[-–]\s*(?:tela|screen|monitor|t\.)\s*\d+\s*$/i, '')
    .trim();
  if (ponto.endereco) return `${baseName} | ${ponto.endereco} - ${(ponto.cidade || '').toUpperCase()}`;
  return `${baseName} - ${(ponto.cidade || '').toUpperCase()}`;
}

function monitorStatus(lastSeen) {
  if (!lastSeen) return 'offline';
  return (Date.now() - new Date(lastSeen).getTime()) <= 10 * 60 * 1000 ? 'online' : 'offline';
}

function formatMonitorRow(p) {
  const ciclo_segundos = loopTextToSeconds(p.loop);
  const tempo_insercao_seg = tempoTextToSeconds(p.tempo);
  const telas = typeof p.telas === 'number' ? p.telas : (parseInt(p.telas, 10) || 1);
  const cotas_por_loop = ciclo_segundos && tempo_insercao_seg ? Math.floor(ciclo_segundos / tempo_insercao_seg) : null;
  return {
    id: p.id,
    nome: p.nome,
    local: deriveMonitorLocal(p),
    cidade: p.cidade,
    telas,
    ciclo_segundos,
    tempo_insercao_seg,
    cotas_por_loop,
    total_insercoes_ativas: typeof p.insercoes === 'number' ? p.insercoes : (parseInt(p.insercoes, 10) || 0),
    status: monitorStatus(p.monitor_last_seen),
  };
}

// Normaliza nome para comparação fuzzy: remove sufixo de tela, strip punctuation, lowercase
function normalizeMonitorName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*[-–]\s*(?:tela|screen|monitor|t\.?)\s*\d+\s*$/i, '')
    .replace(/['''\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMonitorMatch(query, row) {
  const nq = normalizeMonitorName(query);
  const nn = normalizeMonitorName(row.nome);
  if (nn === nq) return 100;
  if (nn.includes(nq) || nq.includes(nn)) return 80;
  const qw = nq.split(' ').filter((w) => w.length > 2);
  const nw = nn.split(' ').filter((w) => w.length > 2);
  if (!qw.length || !nw.length) return 0;
  const overlap = qw.filter((w) => nw.includes(w)).length;
  return Math.round((overlap / Math.max(qw.length, nw.length)) * 60);
}

app.get('/api/monitors', openCors, (req, res) => {
  const statusFilter = String(req.query.status || '').trim().toLowerCase();
  const cidadeFilter = String(req.query.cidade || '').trim();
  const sqlParts = [`${MONITOR_SELECT} WHERE ${MONITOR_BASE_WHERE}`];
  const params = [];
  if (cidadeFilter) {
    sqlParts.push(' AND lower(cidade) = lower(?)');
    params.push(cidadeFilter);
  }
  sqlParts.push(' ORDER BY cidade, nome');
  try {
    let rows = db.prepare(sqlParts.join('')).all(...params).map(formatMonitorRow);
    if (statusFilter === 'online' || statusFilter === 'offline') {
      rows = rows.filter((m) => m.status === statusFilter);
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno ao buscar monitores.' });
  }
});

// Lookup por nome: retorna candidatos ordenados por similaridade (para auto-match de player_id)
app.get('/api/monitors/lookup', openCors, (req, res) => {
  const q = String(req.query.nome || '').trim();
  if (!q) return res.status(400).json({ error: 'Parâmetro nome é obrigatório.' });
  try {
    const rows = db.prepare(`${MONITOR_SELECT} WHERE ${MONITOR_BASE_WHERE} ORDER BY cidade, nome`).all();
    const scored = rows
      .map((r) => ({ score: scoreMonitorMatch(q, r), monitor: formatMonitorRow(r) }))
      .filter((x) => x.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ score, monitor }) => ({ ...monitor, _match_score: score }));
    if (!scored.length) return res.status(404).json({ error: 'Nenhum monitor encontrado para esse nome.' });
    res.json(scored);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno ao buscar monitor.' });
  }
});

app.get('/api/monitors/:id', openCors, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const row = db.prepare(`${MONITOR_SELECT} WHERE id = ? AND ${MONITOR_BASE_WHERE}`).get(id);
    if (!row) return res.status(404).json({ error: 'Monitor não encontrado.' });
    res.json(formatMonitorRow(row));
  } catch (err) {
    res.status(500).json({ error: 'Erro interno ao buscar monitor.' });
  }
});

// ── Loop Audit — dados reais da API de origem ────────────────────────────────
const ORIGIN_API_URL = 'https://sistema.redeintermidia.com/api/monitors';
const LOOP_DEFAULT_TEMPO_SEG = 15; // duração estimada por inserção

// Cache simples em memória (TTL 5 min)
let _loopCache = null;
let _loopCacheAt = 0;
const LOOP_CACHE_TTL = 60 * 1000; // 1 min

function fetchOriginMonitors() {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    if (_loopCache && (now - _loopCacheAt) < LOOP_CACHE_TTL) return resolve(_loopCache);
    const https = require('https');
    https.get(ORIGIN_API_URL, { timeout: 15000, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!Array.isArray(parsed)) return reject(new Error('Resposta inválida da API de origem'));
          _loopCache = parsed;
          _loopCacheAt = Date.now();
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function classifyRisk(pctOcupado) {
  if (pctOcupado >= 100) return { level: 'critical', msg: 'Lotado — sem cotas', color: 'red' };
  if (pctOcupado >= 90)  return { level: 'high',     msg: 'Quase lotado',      color: 'orange' };
  if (pctOcupado >= 75)  return { level: 'medium',   msg: 'Atenção comercial',  color: 'yellow' };
  return                         { level: 'low',      msg: 'Saudável',           color: 'green' };
}

// ── Tabela de exclusões manuais do loop audit ──
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS loop_audit_exclusions (
    origin_id INTEGER PRIMARY KEY,
    nome TEXT,
    motivo TEXT,
    excluido_em TEXT DEFAULT (datetime('now'))
  )`).run();
} catch (e) { /* já existe */ }

// ── Tabela de gerações de arte via IA ──
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS arte_geracoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposta_id INTEGER,
    ponto_id INTEGER,
    ponto_nome TEXT,
    resolucao_nativa_w INTEGER,
    resolucao_nativa_h INTEGER,
    resolucao_geracao_w INTEGER,
    resolucao_geracao_h INTEGER,
    orientacao TEXT,
    prompt_texto TEXT,
    prompt_editado_manualmente INTEGER DEFAULT 0,
    variacoes_json TEXT,
    variacao_escolhida INTEGER,
    api_usada TEXT DEFAULT 'replicate/flux-1.1-pro',
    custo_estimado_usd REAL DEFAULT 0,
    duracao_ms INTEGER,
    normalizado INTEGER DEFAULT 0,
    gerado_em TEXT DEFAULT (datetime('now')),
    gerado_por_usuario_id INTEGER
  )`).run();
} catch (e) { /* já existe */ }

app.get('/api/loop-audit', openCors, async (req, res) => {
  try {
    if (req.query.bust === '1') { _loopCache = null; _loopCacheAt = 0; }
    const monitors = await fetchOriginMonitors();
    const cidadeFilter = req.query.cidade || null;
    const showHidden = req.query.hidden === '1';

    // Excluir painéis estáticos (backlight / frontlight)
    const EXCLUDE_RE = /\bbacklight\b|\bfrontlight\b/i;
    const filteredMonitors = monitors.filter(m => !EXCLUDE_RE.test(m.nome || ''));

    // Excluir monitors ocultados manualmente
    const excludedRows = db.prepare('SELECT origin_id FROM loop_audit_exclusions').all();
    const excludedIds = new Set(excludedRows.map(r => r.origin_id));
    const visibleMonitors = showHidden ? filteredMonitors : filteredMonitors.filter(m => !excludedIds.has(m.id));

    const DURACAO_INSERCAO = 10; // cada inserção = 10s
    const CICLO_PADRAO = 180;    // loop padrão 3 min

    // ciclo_segundos da API = tempo OCUPADO no loop
    function calcMonitorStats(m) {
      const insercoes = m.total_insercoes_ativas || 0;
      const ocupadoSeg = m.ciclo_segundos || 0;
      const livreSeg = Math.max(0, CICLO_PADRAO - ocupadoSeg);
      const cotasLivres = Math.floor(livreSeg / DURACAO_INSERCAO);
      const pctOcupado = Math.min(100, Math.round((ocupadoSeg / CICLO_PADRAO) * 100));
      const risk = classifyRisk(pctOcupado);
      return {
        origin_id: m.id,
        nome: (m.nome || '').trim(),
        local: (m.local || '').trim(),
        cidade: m.cidade || null,
        status: m.status || 'unknown',
        ciclo_padrao_seg: CICLO_PADRAO,
        insercoes_ativas: insercoes,
        cotas_livres: cotasLivres,
        ocupado_seg: ocupadoSeg,
        livre_seg: livreSeg,
        pct_ocupado: pctOcupado,
        risk_level: risk.level,
        risk_msg: risk.msg,
        risk_color: risk.color,
      };
    }

    const allItems = visibleMonitors.map(calcMonitorStats);

    // Agrupar por local: montar um item por local, expandir somente quando houver divergência
    const byLocal = new Map();
    for (const item of allItems) {
      const key = item.local || item.nome;
      if (!byLocal.has(key)) byLocal.set(key, []);
      byLocal.get(key).push(item);
    }

    const items = [];
    for (const [localKey, group] of byLocal) {
      if (group.length === 1) {
        items.push({ ...group[0], telas: 1, divergente: false });
      } else {
        const cotasSet = new Set(group.map(g => g.cotas_livres));
        if (cotasSet.size === 1) {
          // Todos iguais → mostra uma linha só (pega o primeiro, indica quantas telas)
          const rep = group[0];
          const onlineCount = group.filter(g => g.status === 'online').length;
          items.push({
            ...rep,
            status: onlineCount > 0 ? 'online' : rep.status,
            telas: group.length,
            divergente: false,
          });
        } else {
          // Diferem → mostra cada um separado para identificar problema
          for (const g of group) {
            items.push({ ...g, telas: group.length, divergente: true });
          }
        }
      }
    }

    // Filtro por cidade
    const finalItems = cidadeFilter ? items.filter(i => i.cidade === cidadeFilter) : items;

    // Summary
    const total = finalItems.length;
    const critical = finalItems.filter(i => i.risk_level === 'critical').length;
    const high = finalItems.filter(i => i.risk_level === 'high').length;
    const medium = finalItems.filter(i => i.risk_level === 'medium').length;
    const low = finalItems.filter(i => i.risk_level === 'low').length;
    const totalCotasLivres = finalItems.reduce((s, i) => s + i.cotas_livres, 0);
    const cidades = [...new Set(finalItems.map(i => i.cidade).filter(Boolean))].sort();

    res.json({
      duracao_insercao_seg: DURACAO_INSERCAO,
      cache_age_ms: Date.now() - _loopCacheAt,
      hidden_count: excludedIds.size,
      summary: { total, critical, high, medium, low, totalCotasLivres, cidades },
      items: finalItems
    });
  } catch (err) {
    console.error('Loop audit fetch error:', err.message);
    res.status(502).json({ error: 'Não foi possível obter dados da API de origem.' });
  }
});

// ── Gerenciar exclusões do loop audit ──
app.get('/api/loop-audit/exclusions', openCors, (req, res) => {
  const rows = db.prepare('SELECT origin_id, nome, motivo, excluido_em FROM loop_audit_exclusions ORDER BY excluido_em DESC').all();
  res.json(rows);
});

app.post('/api/loop-audit/exclusions', express.json(), (req, res) => {
  const { origin_id, nome, motivo } = req.body || {};
  if (!origin_id) return res.status(400).json({ error: 'origin_id obrigatório' });
  db.prepare('INSERT OR REPLACE INTO loop_audit_exclusions (origin_id, nome, motivo) VALUES (?, ?, ?)').run(origin_id, nome || '', motivo || '');
  res.json({ ok: true });
});

app.delete('/api/loop-audit/exclusions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  db.prepare('DELETE FROM loop_audit_exclusions WHERE origin_id = ?').run(id);
  res.json({ ok: true });
});

// Admin auth
app.post('/api/auth/login', loginLimiter, validateLoginPayload, (req, res) => {
  const credential = String(req.body?.username || req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  if (!credential || !password) {
    return res.status(400).json({ error: 'Usuário/e-mail e senha são obrigatórios' });
  }
  const user = db.prepare(`
    SELECT id, first_name, last_name, username, email, whatsapp, role, password
    FROM admin_users
    WHERE (lower(username) = lower(?) OR lower(email) = lower(?))
    LIMIT 1
  `).get(credential, credential);

  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  if (!isPasswordHash(user.password)) {
    const upgradedHash = hashPassword(password);
    db.prepare("UPDATE admin_users SET password = ?, updated_at = datetime('now') WHERE id = ?").run(upgradedHash, user.id);
  }

  const { password: _password, ...safeUser } = user;

  res.json({ 
    success: true, 
    token: createAuthToken(safeUser),
    user: safeUser
  });
});

// CREATE ponto
app.post('/api/pontos', upload.fields([
  { name: 'imagem', maxCount: 1 },
  { name: 'imagem2', maxCount: 1 },
  { name: 'simulacao_arte', maxCount: 1 },
  { name: 'simulacao_preview', maxCount: 1 }
]), requireRoles(['admin', 'gerente_comercial']), validateCoordinates, (req, res) => {
  try {
    const data = req.body;
    const latDb = normalizeCoordinateForDb(data.lat, -90, 90, null);
    const lngDb = normalizeCoordinateForDb(data.lng, -180, 180, null);
    const imagem = pickUploadedPath(req, 'imagem') || data.imagem || null;
    const imagem2 = pickUploadedPath(req, 'imagem2') || data.imagem2 || null;
    const simulacaoArte = pickUploadedPath(req, 'simulacao_arte') || data.simulacao_arte || null;
    const simulacaoPreview = pickUploadedPath(req, 'simulacao_preview') || data.simulacao_preview || null;
    const simulacaoTela = data.simulacao_tela || null;
    const tipo = data.tipo || '';
    const arteLargura = tipo === ELEVADOR_TIPO
      ? ELEVADOR_ARTE_LARGURA
      : (parseInt(data.arte_largura, 10) || 1920);
    const arteAltura = tipo === ELEVADOR_TIPO
      ? ELEVADOR_ARTE_ALTURA
      : (parseInt(data.arte_altura, 10) || 1080);
    const isBackOrFrontLight = tipo === 'Backlight' || tipo === 'Frontlight';
    const midiaLarguraM = isBackOrFrontLight
      ? normalizePhysicalSizeMeters(data.midia_largura_m, null)
      : null;
    const midiaAlturaM = isBackOrFrontLight
      ? normalizePhysicalSizeMeters(data.midia_altura_m, null)
      : null;
    const elevadorCategoria = tipo === ELEVADOR_TIPO
      ? normalizeElevadorCategoria(data.elevador_categoria)
      : null;
    const tipoFluxo = data.tipo_fluxo || 'pessoas';
    const audienceTags = normalizeAudienceTagsInput(data.audience_tags, data.publico || 'A/B');
    const availabilityCalendar = normalizeAvailabilityCalendarInput(data.availability_calendar, data.horario || '');
    const imagemFocoX = Number.isFinite(Number(data.imagem_foco_x)) ? clamp(Number(data.imagem_foco_x), 0, 100) : 50;
    const imagemFocoY = Number.isFinite(Number(data.imagem_foco_y)) ? clamp(Number(data.imagem_foco_y), 0, 100) : 50;
    const imagemFocoZoom = Number.isFinite(Number(data.imagem_foco_zoom)) ? clamp(Number(data.imagem_foco_zoom), 100, 220) : 100;
    const fotoFocalPoint = normalizeFotoFocalPoint(data.foto_focal_point);
    const pdfImageSource = normalizePdfImageSource(data.pdf_image_source);

    const stmt = db.prepare(`
      INSERT INTO pontos (nome, cidade, tipo, endereco, lat, lng, horario, fluxo, insercoes, tempo, loop, veiculacao, publico, telas, preco, descricao, imagem, imagem2, simulacao_tela, simulacao_arte, simulacao_preview, arte_largura, arte_altura, midia_largura_m, midia_altura_m, tipo_fluxo, audience_tags, availability_calendar, elevador_categoria, imagem_foco_x, imagem_foco_y, imagem_foco_zoom, foto_focal_point, pdf_image_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.nome, data.cidade, tipo, data.endereco,
      latDb, lngDb,
      data.horario, parseInt(data.fluxo) || 0, parseInt(data.insercoes) || 0,
      data.tempo || '15s', data.loop || '3 min', data.veiculacao || 'Vídeo sem áudio',
      data.publico || 'A/B', parseInt(data.telas) || 1, parseFloat(data.preco) || 0,
      data.descricao, imagem, imagem2, simulacaoTela, simulacaoArte, simulacaoPreview,
      arteLargura, arteAltura, midiaLarguraM, midiaAlturaM, tipoFluxo,
      JSON.stringify(audienceTags), JSON.stringify(availabilityCalendar), elevadorCategoria,
      imagemFocoX, imagemFocoY, imagemFocoZoom,
      fotoFocalPoint, pdfImageSource
    );

    const ponto = db.prepare('SELECT * FROM pontos WHERE id = ?').get(result.lastInsertRowid);
    invalidatePointCache(ponto.id);
    invalidateCityCaches(ponto.cidade, db);
    res.status(201).json(hydratePontoRow(ponto));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE ponto
app.put('/api/pontos/:id', upload.fields([
  { name: 'imagem', maxCount: 1 },
  { name: 'imagem2', maxCount: 1 },
  { name: 'simulacao_arte', maxCount: 1 },
  { name: 'simulacao_preview', maxCount: 1 }
]), requireRoles(['admin', 'gerente_comercial']), validateCoordinates, (req, res) => {
  try {
    const data = req.body;
    const existing = db.prepare('SELECT * FROM pontos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ponto não encontrado' });

    const latDb = normalizeCoordinateForDb(data.lat, -90, 90, Number(existing.lat));
    const lngDb = normalizeCoordinateForDb(data.lng, -180, 180, Number(existing.lng));

    const imagem = pickUploadedPath(req, 'imagem') || data.imagem || existing.imagem;
    const imagem2 = pickUploadedPath(req, 'imagem2') || data.imagem2 || existing.imagem2 || null;
    const simulacaoArte = pickUploadedPath(req, 'simulacao_arte') || data.simulacao_arte || existing.simulacao_arte;
    const simulacaoPreview = pickUploadedPath(req, 'simulacao_preview') || data.simulacao_preview || existing.simulacao_preview;
    const simulacaoTela = data.simulacao_tela || existing.simulacao_tela;
    const tipo = data.tipo || existing.tipo;
    const arteLargura = tipo === ELEVADOR_TIPO
      ? ELEVADOR_ARTE_LARGURA
      : (parseInt(data.arte_largura, 10) || existing.arte_largura || 1920);
    const arteAltura = tipo === ELEVADOR_TIPO
      ? ELEVADOR_ARTE_ALTURA
      : (parseInt(data.arte_altura, 10) || existing.arte_altura || 1080);
    const isBackOrFrontLight = tipo === 'Backlight' || tipo === 'Frontlight';
    const midiaLarguraM = isBackOrFrontLight
      ? normalizePhysicalSizeMeters(data.midia_largura_m, normalizePhysicalSizeMeters(existing.midia_largura_m, null))
      : null;
    const midiaAlturaM = isBackOrFrontLight
      ? normalizePhysicalSizeMeters(data.midia_altura_m, normalizePhysicalSizeMeters(existing.midia_altura_m, null))
      : null;
    const elevadorCategoria = tipo === ELEVADOR_TIPO
      ? normalizeElevadorCategoria(data.elevador_categoria || existing.elevador_categoria || 'Comercial')
      : null;
    const tipoFluxo = data.tipo_fluxo || existing.tipo_fluxo || 'pessoas';
    const audienceTags = normalizeAudienceTagsInput(
      data.audience_tags !== undefined ? data.audience_tags : existing.audience_tags,
      data.publico || existing.publico || 'A/B'
    );
    const availabilityCalendar = normalizeAvailabilityCalendarInput(
      data.availability_calendar !== undefined ? data.availability_calendar : existing.availability_calendar,
      data.horario || existing.horario || ''
    );
    const imagemFocoX = Number.isFinite(Number(data.imagem_foco_x))
      ? clamp(Number(data.imagem_foco_x), 0, 100)
      : clamp(Number(existing.imagem_foco_x) || 50, 0, 100);
    const imagemFocoY = Number.isFinite(Number(data.imagem_foco_y))
      ? clamp(Number(data.imagem_foco_y), 0, 100)
      : clamp(Number(existing.imagem_foco_y) || 50, 0, 100);
    const imagemFocoZoom = Number.isFinite(Number(data.imagem_foco_zoom))
      ? clamp(Number(data.imagem_foco_zoom), 100, 220)
      : clamp(Number(existing.imagem_foco_zoom) || 100, 100, 220);
    const fotoFocalPoint = normalizeFotoFocalPoint(data.foto_focal_point || existing.foto_focal_point);
    const pdfImageSource = normalizePdfImageSource(data.pdf_image_source || existing.pdf_image_source);

    const stmt = db.prepare(`
      UPDATE pontos SET
        nome = ?, cidade = ?, tipo = ?, endereco = ?, lat = ?, lng = ?,
        horario = ?, fluxo = ?, insercoes = ?, tempo = ?, loop = ?,
        veiculacao = ?, publico = ?, telas = ?, preco = ?, descricao = ?,
        imagem = ?, imagem2 = ?, simulacao_tela = ?, simulacao_arte = ?, simulacao_preview = ?,
        arte_largura = ?, arte_altura = ?, midia_largura_m = ?, midia_altura_m = ?, tipo_fluxo = ?, audience_tags = ?, availability_calendar = ?, elevador_categoria = ?,
        imagem_foco_x = ?, imagem_foco_y = ?, imagem_foco_zoom = ?,
        foto_focal_point = ?,
        pdf_image_source = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      data.nome || existing.nome, data.cidade || existing.cidade, tipo,
      data.endereco || existing.endereco,
      latDb, lngDb,
      data.horario || existing.horario, parseInt(data.fluxo) || existing.fluxo,
      parseInt(data.insercoes) || existing.insercoes,
      data.tempo || existing.tempo, data.loop || existing.loop,
      data.veiculacao || existing.veiculacao, data.publico || existing.publico,
      parseInt(data.telas) || existing.telas, parseFloat(data.preco) || existing.preco,
      data.descricao || existing.descricao, imagem, imagem2,
      simulacaoTela, simulacaoArte, simulacaoPreview,
      arteLargura, arteAltura, midiaLarguraM, midiaAlturaM, tipoFluxo,
      JSON.stringify(audienceTags), JSON.stringify(availabilityCalendar), elevadorCategoria,
      imagemFocoX, imagemFocoY, imagemFocoZoom, fotoFocalPoint, pdfImageSource,
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
    const previousCity = slugifyCity(existing.cidade);
    const currentCity = slugifyCity(ponto.cidade);
    if (previousCity) invalidateCityCaches(previousCity, db);
    if (currentCity && currentCity !== previousCity) invalidateCityCaches(currentCity, db);
    res.json(hydratePontoRow(ponto));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple geocoding endpoint for admin use
app.get('/api/geocode', requireRoles(['admin', 'gerente_comercial', 'vendedor']), async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Parâmetro q obrigatório' });
  try {
    const location = await geocodeAddress(q);
    if (!location) return res.status(404).json({ error: 'Endereço não encontrado' });
    res.json({ lat: location.lat, lng: location.lng });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List available segment categories for entorno analysis
app.get('/api/entorno/categories', (req, res) => {
  const requested = req.query.segmento;
  const { segment, categories, targetCategories } = getSegmentCategories(requested);
  res.json({
    segmento: segment,
    categorias: categories,
    targetCategories: targetCategories || [],
    raioPadrao: DEFAULT_RADIUS,
    providers: getProviderRuntimeInfo()
  });
});

// Queue async entorno analysis job
app.post('/api/entorno/analyze', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
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
app.get('/api/entorno/jobs/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
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
app.get('/api/entorno/jobs', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
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

// Auto-refresh scheduler status and config
app.get('/api/entorno/auto', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    res.json({
      config: getAutoRefreshConfig(),
      state: getAutoRefreshState()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger one immediate auto-refresh cycle manually
app.post('/api/entorno/auto/run-now', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    runAutoRefreshCycle();
    res.json({ success: true, state: getAutoRefreshState() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read cached entorno scores and optionally auto-queue refresh
app.get('/api/entorno/scores', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
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

app.post('/api/entorno/client-address', requireRoles(['admin', 'gerente_comercial', 'vendedor']), async (req, res) => {
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

// ====================== GEO-AUDIENCE INTELLIGENCE =========================

// GET all profiles (optionally filtered by city)
app.get('/api/geoaudience/profiles', (req, res) => {
  try {
    const cidade = String(req.query.cidade || '').trim() || null;
    const profiles = geoAudience.getAllProfiles(cidade);
    const summary = geoAudience.getCoverageSummary(cidade);
    res.json({ profiles, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single point profile
app.get('/api/geoaudience/profile/:pontoId', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const pontoId = Number(req.params.pontoId);
    if (!Number.isFinite(pontoId)) return res.status(400).json({ error: 'ID inválido' });
    const profile = geoAudience.getProfile(pontoId);
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado. Execute a análise primeiro.' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET coverage summary
app.get('/api/geoaudience/coverage', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const cidade = String(req.query.cidade || '').trim() || null;
    const summary = geoAudience.getCoverageSummary(cidade);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET neighbourhood type definitions
app.get('/api/geoaudience/types', (req, res) => {
  const types = Object.entries(geoAudience.NEIGHBORHOOD_TYPES).map(([key, def]) => ({
    type: key,
    label: def.label,
    icon: def.icon,
    socioeconomic: def.socioeconomic,
    environment: def.environment,
    dominantActivity: def.dominantActivity,
    lifestyle: def.lifestyle
  }));
  res.json({ types, radius: geoAudience.GEO_RADIUS });
});

// POST trigger analysis for a city (or all cities)
app.post('/api/geoaudience/analyze', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const cidade = String(req.body?.cidade || '').trim() || null;
    const force = req.body?.force === true;

    // Return immediately, run analysis in background
    res.status(202).json({
      success: true,
      message: `Análise GeoAudience iniciada${cidade ? ` para ${cidade}` : ' para todas as cidades'}.`,
      cidade,
      force
    });

    // Run asynchronously
    geoAudience.analyzeCity(cidade, { force }).then((result) => {
      console.log(`[geoaudience] Analysis complete: ${result.analyzed} analyzed, ${result.skipped} skipped, ${result.errors} errors`);
    }).catch((err) => {
      console.error('[geoaudience] Analysis failed:', err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST analyze a single point
app.post('/api/geoaudience/analyze/:pontoId', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const pontoId = Number(req.params.pontoId);
    if (!Number.isFinite(pontoId)) return res.status(400).json({ error: 'ID inválido' });

    const point = db.prepare('SELECT id, nome, cidade, lat, lng FROM pontos WHERE id = ? AND ativo = 1').get(pontoId);
    if (!point) return res.status(404).json({ error: 'Ponto não encontrado' });

    const profile = await geoAudience.analyzePoint(point);
    if (!profile) return res.status(422).json({ error: 'Coordenadas inválidas para este ponto' });

    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Census Audience Classification Routes ──────────────────────────────────

app.get('/api/census/profiles', (req, res) => {
  try {
    const { municipio, perfil, min_score } = req.query;
    const profiles = censusAudience.getAllProfiles({
      municipio,
      perfil,
      minScore: min_score ? Number(min_score) : undefined
    });
    const summary = censusAudience.getCoverageSummary(municipio);
    res.json({ profiles, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/census/profile/:pontoId', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const pontoId = Number(req.params.pontoId);
    if (!Number.isFinite(pontoId)) return res.status(400).json({ error: 'pontoId inválido' });
    const profile = censusAudience.getProfile(pontoId);
    if (!profile) return res.status(404).json({ error: 'Perfil censitário não encontrado' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/census/coverage', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { municipio } = req.query;
    res.json(censusAudience.getCoverageSummary(municipio));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/census/types', (req, res) => {
  const types = Object.entries(censusAudience.PROFILES).map(([key, def]) => ({
    key,
    label: def.label,
    icon: def.icon,
    description: def.description,
    color: def.color
  }));
  res.json({ types, radius: censusAudience.ANALYSIS_RADIUS });
});

app.get('/api/census/geojson', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { municipio, perfil, min_score } = req.query;
    const geojson = censusAudience.buildGeoJSON({
      municipio,
      perfil,
      minScore: min_score ? Number(min_score) : undefined
    });
    res.json(geojson);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/census/analyze', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const { municipio, force } = req.body || {};
    res.status(202).json({
      message: `Análise censitária iniciada${municipio ? ` para ${municipio}` : ' para todas as cidades'}.`
    });
    censusAudience.analyzeCity(municipio, { force: !!force }).then((result) => {
      console.log(`[census] Analysis complete: ${result.analyzed} analyzed, ${result.skipped} skipped, ${result.errors} errors`);
    }).catch((err) => {
      console.error('[census] Analysis failed:', err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/census/analyze/:pontoId', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const pontoId = Number(req.params.pontoId);
    if (!Number.isFinite(pontoId)) return res.status(400).json({ error: 'ID inválido' });
    const point = db.prepare('SELECT id, nome, cidade, lat, lng FROM pontos WHERE id = ? AND ativo = 1').get(pontoId);
    if (!point) return res.status(404).json({ error: 'Ponto não encontrado' });
    const profile = await censusAudience.analyzePoint(point);
    if (!profile) return res.status(422).json({ error: 'Coordenadas inválidas para este ponto' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Audience Intelligence Engine Routes ─────────────────────────────────────

// Profiles CRUD
app.get('/api/audience-intel/profiles', (req, res) => {
  try {
    res.json(audienceIntel.listProfiles());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/audience-intel/profiles/:name', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const { label, description, weights } = req.body;
    if (!label || !weights) return res.status(400).json({ error: 'label and weights required' });
    res.json(audienceIntel.upsertProfile(req.params.name, { label, description, weights }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/audience-intel/profiles/:name', requireRoles(['admin']), (req, res) => {
  try {
    const deleted = audienceIntel.deleteProfile(req.params.name);
    res.json({ deleted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Point scoring
app.get('/api/audience-intel/scores', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { cidade, profile, minScore } = req.query;
    res.json(audienceIntel.getAllScores({ cidade, profile, minScore }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/audience-intel/scores/:pontoId', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const pontoId = Number(req.params.pontoId);
    if (!Number.isFinite(pontoId)) return res.status(400).json({ error: 'ID inválido' });
    res.json(audienceIntel.getPointScores(pontoId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/audience-intel/ranking', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { profile, cidade, limit } = req.query;
    if (!profile) return res.status(400).json({ error: 'profile query param required' });
    res.json(audienceIntel.getRanking({ profile, cidade, limit: Number(limit) || 20 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Analyze (triggers async scoring)
app.post('/api/audience-intel/analyze/:pontoId', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const pontoId = Number(req.params.pontoId);
    if (!Number.isFinite(pontoId)) return res.status(400).json({ error: 'ID inválido' });
    const force = req.query.force === '1' || req.query.force === 'true';
    const scores = await audienceIntel.analyzePoint(pontoId, { force });
    res.json(scores);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/audience-intel/analyze-city', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const { cidade, force } = req.body;
    // Run async — respond immediately with job reference
    const result = audienceIntel.analyzeCity(cidade, { force: !!force });
    // Don't await — return immediately
    res.json({ message: 'Analysis started', cidade: cidade || 'all' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/audience-intel/jobs/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const job = audienceIntel.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Heatmap
app.get('/api/audience-intel/heatmap', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { profile, cidade, cellSize } = req.query;
    if (!profile) return res.status(400).json({ error: 'profile query param required' });
    let bounds = null;
    if (req.query.bounds) {
      bounds = req.query.bounds.split(',').map(Number);
      if (bounds.length !== 4 || bounds.some(n => !Number.isFinite(n))) {
        return res.status(400).json({ error: 'bounds must be minLng,minLat,maxLng,maxLat' });
      }
    }
    res.json(audienceIntel.generateHeatmap({
      profile,
      cidade,
      bounds,
      cellSizeM: Number(cellSize) || undefined,
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Campaign Simulator
app.post('/api/audience-intel/simulate', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { selectedPoints, investment, periodDays } = req.body;
    if (!Array.isArray(selectedPoints) || !selectedPoints.length) {
      return res.status(400).json({ error: 'selectedPoints array required' });
    }
    if (!investment || investment <= 0) return res.status(400).json({ error: 'positive investment required' });
    if (!periodDays || periodDays <= 0) return res.status(400).json({ error: 'positive periodDays required' });
    res.json(audienceIntel.simulateCampaign({
      selectedPoints: selectedPoints.map(Number),
      investment: Number(investment),
      periodDays: Number(periodDays),
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE ponto (soft delete)
app.delete('/api/pontos/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const existing = db.prepare('SELECT id, cidade FROM pontos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ponto não encontrado' });
    const result = db.prepare('UPDATE pontos SET ativo = 0 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Ponto não encontrado' });
    invalidateCityCaches(existing.cidade, db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all pontos for admin (including inactive)
app.get('/api/admin/pontos', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const pontos = db.prepare('SELECT * FROM pontos ORDER BY cidade, nome').all().map(hydratePontoRow);
    res.json(pontos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', requireRoles(['admin']), (req, res) => {
  try {
    const users = db.prepare('SELECT id, first_name, last_name, username, email, whatsapp, role, is_vendedor, photo_url, created_at FROM admin_users ORDER BY first_name ASC, last_name ASC, username ASC').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', requireRoles(['admin']), (req, res) => {
  try {
    const firstName = String(req.body?.firstName || req.body?.first_name || '').trim();
    const lastName = String(req.body?.lastName || req.body?.last_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const whatsapp = String(req.body?.whatsapp || '').trim();
    const password = String(req.body?.password || '').trim();
    const role = String(req.body?.role || 'vendedor').trim();

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Nome, sobrenome, e-mail e senha são obrigatórios' });
    }

    const validRoles = ['admin', 'gerente_comercial', 'vendedor'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role inválido. Valores permitidos: admin, gerente_comercial, vendedor' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const username = resolveUniqueUsername(firstName, lastName);

    const existingEmail = db.prepare('SELECT id FROM admin_users WHERE lower(email) = lower(?)').get(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const passwordHash = hashPassword(password);

    const isVendedor = req.body?.is_vendedor ? 1 : 0;

    const result = db.prepare(`
      INSERT INTO admin_users (first_name, last_name, username, email, whatsapp, password, role, is_vendedor, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(firstName, lastName, username, email, whatsapp, passwordHash, role, isVendedor);
    const created = db.prepare('SELECT id, first_name, last_name, username, email, whatsapp, role, is_vendedor, created_at FROM admin_users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireRoles(['admin']), (req, res) => {
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

app.put('/api/admin/users/:id', requireRoles(['admin']), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const role = String(req.body?.role || '').trim();
    const validRoles = ['admin', 'gerente_comercial', 'vendedor'];
    
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role inválido. Valores permitidos: admin, gerente_comercial, vendedor' });
    }

    const isVendedor = req.body?.is_vendedor !== undefined ? (req.body.is_vendedor ? 1 : 0) : null;
    if (isVendedor !== null) {
      db.prepare("UPDATE admin_users SET role = ?, is_vendedor = ?, updated_at = datetime('now') WHERE id = ?").run(role, isVendedor, id);
    } else {
      db.prepare("UPDATE admin_users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, id);
    }
    const result = db.prepare('SELECT changes() as changes').get ? { changes: 1 } : { changes: 1 };

    const updated = db.prepare('SELECT id, first_name, last_name, username, email, whatsapp, role, is_vendedor FROM admin_users WHERE id = ?').get(id);
    if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/pdf-layout', requireRoles(['admin']), (req, res) => {
  try {
    res.json(readPdfLayoutOverrides());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/settings', requireRoles(['admin']), (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value FROM app_settings').all();
    const result = {};
    settings.forEach(s => {
      result[s.key] = isNaN(s.value) ? s.value : Number(s.value);
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/pdf-cache', requireRoles(['admin']), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        id,
        combination_key,
        city_slugs,
        file_size_kb,
        generated_at,
        download_count,
        is_valid
      FROM pdf_cache
      ORDER BY generated_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/pdf-cache/:id', requireRoles(['admin']), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    db.prepare('UPDATE pdf_cache SET is_valid = 0 WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/settings', requireRoles(['admin']), (req, res) => {
  try {
    const {
      lucro_minimo_percentual,
      evolution_api_url,
      evolution_instance,
      evolution_api_key,
      evolution_dest_number
    } = req.body;

    if (lucro_minimo_percentual !== undefined) {
      const value = Number(lucro_minimo_percentual);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return res.status(400).json({ error: 'lucro_minimo_percentual deve ser um número entre 0 e 100' });
      }
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(
        'lucro_minimo_percentual',
        String(value)
      );
    }

    // Evolution API settings (string values — salva independente do valor)
    const evoFields = { evolution_api_url, evolution_instance, evolution_api_key, evolution_dest_number };
    Object.entries(evoFields).forEach(([key, val]) => {
      if (val !== undefined) {
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(
          key,
          String(val || '')
        );
      }
    });

    const settings = db.prepare('SELECT key, value FROM app_settings').all();
    const result = {};
    settings.forEach(s => {
      result[s.key] = isNaN(s.value) || s.key.startsWith('evolution_') ? s.value : Number(s.value);
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== PROPOSTAS ENDPOINTS ==============

// GET todas as propostas (com filtro por role)
app.get('/api/propostas', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const status = req.query.status;
    const role = req.authUser.role;
    const usuarioId = req.authUser.id;

    let query = 'SELECT p.*, u.username as usuario_nome FROM propostas p LEFT JOIN admin_users u ON p.usuario_id = u.id';
    const params = [];

    if (role === 'vendedor') {
      query += ' WHERE p.usuario_id = ?';
      params.push(usuarioId);
    } else if (role === 'gerente_comercial' || role === 'admin') {
      // Gerente comercial e admin veem todas as propostas
    }

    if (status) {
      query += params.length > 0 ? ' AND p.status = ?' : ' WHERE p.status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.updated_at DESC';
    const propostas = db.prepare(query).all(...params);
    res.json(propostas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET uma proposta específica
app.get('/api/propostas/:id', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const proposta = db.prepare('SELECT p.*, u.username as usuario_nome FROM propostas p LEFT JOIN admin_users u ON p.usuario_id = u.id WHERE p.id = ?').get(id);
    
    if (!proposta) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    if (req.authUser.role === 'vendedor' && Number(proposta.usuario_id) !== Number(req.authUser.id)) {
      return res.status(403).json({ error: 'Acesso negado à proposta solicitada.' });
    }

    proposta.pontos = JSON.parse(proposta.pontos_json || '[]');
    delete proposta.pontos_json;

    res.json(proposta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST criar nova proposta
app.post('/api/propostas', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { titulo, descricao, pontos, desconto_percentual, desconto_tipo, valor_total_original } = req.body;
    const usuario_id = req.authUser.id;

    if (!usuario_id || !titulo || !Array.isArray(pontos) || !desconto_tipo) {
      return res.status(400).json({ error: 'Campos obrigatórios: usuario_id, titulo, pontos (array), desconto_tipo' });
    }

    const lucroMinimo = Number(db.prepare('SELECT value FROM app_settings WHERE key = "lucro_minimo_percentual"').get()?.value || 15);
    const desconto = Number(desconto_percentual || 0);
    const clicarDesconto = (desconto / 100);

    // Calcular se requer aprovação
    let requerAprovacao = 0;
    if (desconto_tipo !== 'nenhum' && clicarDesconto > (lucroMinimo / 100)) {
      requerAprovacao = 1;
    }

    const valor_final = Number(valor_total_original) * (1 - clicarDesconto);
    const valor_desconto = Number(valor_total_original) - valor_final;

    const result = db.prepare(`
      INSERT INTO propostas (usuario_id, titulo, descricao, pontos_json, desconto_percentual, desconto_tipo, valor_total_original, valor_total_desconto, valor_total_final, status, requer_aprovacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usuario_id, 
      titulo, 
      descricao || '',
      JSON.stringify(pontos),
      desconto,
      desconto_tipo,
      valor_total_original,
      valor_desconto,
      valor_final,
      'rascunho',
      requerAprovacao
    );

    const proposta = db.prepare('SELECT id, usuario_id, titulo, status, requer_aprovacao FROM propostas WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(proposta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT atualizar proposta
app.put('/api/propostas/:id', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { titulo, descricao, pontos, desconto_percentual, desconto_tipo, valor_total_original } = req.body;

    const proposta = db.prepare('SELECT * FROM propostas WHERE id = ?').get(id);
    if (!proposta) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    if (req.authUser.role === 'vendedor' && Number(proposta.usuario_id) !== Number(req.authUser.id)) {
      return res.status(403).json({ error: 'Acesso negado à proposta solicitada.' });
    }

    const lucroMinimo = Number(db.prepare('SELECT value FROM app_settings WHERE key = "lucro_minimo_percentual"').get()?.value || 15);
    const desconto = Number(desconto_percentual || 0);
    const clicarDesconto = (desconto / 100);

    // Calcular se requer aprovação
    let requerAprovacao = 0;
    if (desconto_tipo !== 'nenhum' && clicarDesconto > (lucroMinimo / 100)) {
      requerAprovacao = 1;
    }

    const valor_final = Number(valor_total_original) * (1 - clicarDesconto);
    const valor_desconto = Number(valor_total_original) - valor_final;

    db.prepare(`
      UPDATE propostas 
      SET titulo = ?, descricao = ?, pontos_json = ?, desconto_percentual = ?, desconto_tipo = ?, valor_total_original = ?, valor_total_desconto = ?, valor_total_final = ?, requer_aprovacao = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      titulo || proposta.titulo,
      descricao !== undefined ? descricao : proposta.descricao,
      pontos ? JSON.stringify(pontos) : proposta.pontos_json,
      desconto,
      desconto_tipo || proposta.desconto_tipo,
      valor_total_original !== undefined ? valor_total_original : proposta.valor_total_original,
      valor_desconto,
      valor_final,
      requerAprovacao,
      id
    );

    const updated = db.prepare('SELECT id, usuario_id, titulo, status, requer_aprovacao FROM propostas WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE proposta
app.delete('/api/propostas/:id', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT usuario_id FROM propostas WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }
    if (req.authUser.role === 'vendedor' && Number(existing.usuario_id) !== Number(req.authUser.id)) {
      return res.status(403).json({ error: 'Acesso negado à proposta solicitada.' });
    }

    const result = db.prepare('DELETE FROM propostas WHERE id = ?').run(id);

    if (!result.changes) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST aprovar proposta (apenas gerente comercial e admin)
app.post('/api/propostas/:id/aprovar', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { motivo } = req.body;
    const gerente_id = req.authUser.id;

    const proposta = db.prepare('SELECT * FROM propostas WHERE id = ?').get(id);
    if (!proposta) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    // Criar registro de aprovação
    db.prepare(`
      INSERT INTO propostas_aprovacoes (proposta_id, gerente_id, status, motivo)
      VALUES (?, ?, ?, ?)
    `).run(id, gerente_id, 'aprovado', motivo || '');

    // Atualizar proposta
    db.prepare(`
      UPDATE propostas 
      SET status = ?, aprovado_por = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run('aprovada', gerente_id, id);

    res.json({ success: true, message: 'Proposta aprovada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST rejeitar proposta (apenas gerente comercial e admin)
app.post('/api/propostas/:id/rejeitar', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { motivo_rejeicao } = req.body;
    const gerente_id = req.authUser.id;

    const proposta = db.prepare('SELECT * FROM propostas WHERE id = ?').get(id);
    if (!proposta) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    if (!motivo_rejeicao) {
      return res.status(400).json({ error: 'motivo_rejeicao é obrigatório' });
    }

    // Criar registro de rejeição
    db.prepare(`
      INSERT INTO propostas_aprovacoes (proposta_id, gerente_id, status, motivo)
      VALUES (?, ?, ?, ?)
    `).run(id, gerente_id, 'rejeitado', motivo_rejeicao);

    // Atualizar proposta
    db.prepare(`
      UPDATE propostas 
      SET status = ?, motivo_rejeicao = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run('rejeitada', motivo_rejeicao, id);

    res.json({ success: true, message: 'Proposta rejeitada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/pdf-layout', requireRoles(['admin']), (req, res) => {
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

app.delete('/api/admin/pdf-layout', requireRoles(['admin']), (req, res) => {
  try {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(PDF_LAYOUT_SETTINGS_KEY);
    res.json({ success: true, overrides: {}, updatedAt: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== USUÁRIO ATUAL ====================

app.get('/api/users/me', resolveAuthenticatedUser, (req, res) => {
  const { id, first_name, last_name, username, email, whatsapp, role, photo_url } = req.authUser;
  res.json({ id, first_name, last_name, username, email, whatsapp, role, photo_url });
});

// Upload photo for own user
app.post('/api/users/me/photo', resolveAuthenticatedUser, upload.fields([{ name: 'photo', maxCount: 1 }]), (req, res) => {
  try {
    const file = req.files?.photo?.[0];
    if (!file) return res.status(400).json({ error: 'Nenhuma foto enviada' });
    const photoUrl = `/uploads/${file.filename}`;
    db.prepare("UPDATE admin_users SET photo_url = ?, updated_at = datetime('now') WHERE id = ?").run(photoUrl, req.authUser.id);
    res.json({ success: true, photo_url: photoUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: upload photo for any user
app.post('/api/admin/users/:id/photo', requireRoles(['admin']), upload.fields([{ name: 'photo', maxCount: 1 }]), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const user = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const file = req.files?.photo?.[0];
    if (!file) return res.status(400).json({ error: 'Nenhuma foto enviada' });
    const photoUrl = `/uploads/${file.filename}`;
    db.prepare("UPDATE admin_users SET photo_url = ?, updated_at = datetime('now') WHERE id = ?").run(photoUrl, id);
    res.json({ success: true, photo_url: photoUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== VENDAS ====================

// Multer config para PDFs do P.I. (pedido de inserção)
const piStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const piPath = path.join(__dirname, 'uploads', 'pi');
    fs.mkdirSync(piPath, { recursive: true });
    cb(null, piPath);
  },
  filename: (req, file, cb) => {
    cb(null, `pi-${randomUUID()}.pdf`);
  }
});
const uploadPi = multer({
  storage: piStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Apenas PDFs são aceitos para o P.I.'));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 20 }
});

// Inicializa tabela de vendas (se não existir)
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL DEFAULT 'Nova Venda',
      razao_social TEXT NOT NULL,
      cnpj TEXT,
      pontos_nomes TEXT,
      valor_mensal TEXT,
      periodo TEXT,
      dia_pagamento TEXT,
      forma_pagamento TEXT,
      responsavel_nome TEXT,
      responsavel_whatsapp TEXT,
      pi_path TEXT,
      vendedor_id INTEGER,
      vendedor_nome TEXT,
      whatsapp_status TEXT DEFAULT 'pendente',
      whatsapp_error TEXT,
      whatsapp_message_id TEXT,
      status TEXT DEFAULT 'ativa',
      obs TEXT,
      updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
} catch (dbInitErr) {
  console.error('[vendas] falha ao criar tabela vendas:', dbInitErr.message);
}
// Migração: adiciona colunas novas a tabelas existentes (idempotente)
[
  'ALTER TABLE vendas ADD COLUMN whatsapp_message_id TEXT',
  'ALTER TABLE vendas ADD COLUMN whatsapp_poll_id TEXT',
  'ALTER TABLE vendas ADD COLUMN whatsapp_list_id TEXT',
  'ALTER TABLE vendas ADD COLUMN tipo_valor TEXT',
  'ALTER TABLE vendas ADD COLUMN via_agencia INTEGER DEFAULT 0',
  'ALTER TABLE vendas ADD COLUMN agencia_nome TEXT',
  'ALTER TABLE vendas ADD COLUMN comissao_pct TEXT',
  'ALTER TABLE vendas ADD COLUMN troca_material INTEGER DEFAULT 0',
  'ALTER TABLE pontos ADD COLUMN monitor_last_seen TEXT DEFAULT NULL',
  'ALTER TABLE admin_users ADD COLUMN is_vendedor INTEGER DEFAULT 0',
  'ALTER TABLE admin_users ADD COLUMN photo_url TEXT DEFAULT NULL',
].forEach(sql => {
  try { db.prepare(sql).run(); } catch { /* coluna já existe */ }
});
// Tabela de etapas pós-venda validadas por reação emoji no WhatsApp
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS venda_etapas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL REFERENCES vendas(id),
      etapa_key TEXT NOT NULL,
      etapa_label TEXT NOT NULL,
      emoji TEXT NOT NULL,
      confirmado_por TEXT,
      confirmado_at TEXT,
      removido INTEGER DEFAULT 0,
      UNIQUE(venda_id, etapa_key)
    )
  `).run();
} catch (dbInitErr) {
  console.error('[venda_etapas] falha ao criar tabela:', dbInitErr.message);
}

// ─── GESTÃO COMERCIAL: metas, vendas_comercial, renovações ─────────────
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS metas_vendedor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_nome TEXT NOT NULL,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      valor_meta REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      UNIQUE(vendedor_nome, ano, mes)
    )
  `).run();
} catch (e) { console.error('[metas_vendedor] init:', e.message); }

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vendas_comercial (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_nome TEXT NOT NULL,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      data_venda TEXT,
      cliente TEXT NOT NULL,
      cnpj TEXT,
      pontos_contratados TEXT,
      valor_mensal REAL DEFAULT 0,
      total_contrato REAL DEFAULT 0,
      qtde_parcelas INTEGER DEFAULT 1,
      previsao_veiculacao TEXT,
      data_emissao_nf TEXT,
      vencimento_boletos TEXT,
      contato TEXT,
      email TEXT,
      status_contrato INTEGER DEFAULT 0,
      status_contrato_assinado INTEGER DEFAULT 0,
      status_conteudo INTEGER DEFAULT 0,
      status_checkin INTEGER DEFAULT 0,
      status_faturado INTEGER DEFAULT 0,
      status_excel_pastas INTEGER DEFAULT 0,
      obs TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )
  `).run();
} catch (e) { console.error('[vendas_comercial] init:', e.message); }
try { db.prepare("ALTER TABLE vendas_comercial ADD COLUMN venda_id INTEGER").run(); } catch {}
try { db.prepare("ALTER TABLE metas_vendedor ADD COLUMN valor_meta_recorrencia REAL DEFAULT 0").run(); } catch {}

// Repair auto-synced vendas_comercial rows where total_contrato was incorrectly set to valor_mensal
try {
  // Only fix records linked to a venda (venda_id IS NOT NULL) with qtde_parcelas=1
  // and whose period is "N meses" in the source vendas table
  const toFix = db.prepare(`
    SELECT vc.id, vc.valor_mensal, v.periodo, v.pontos_nomes
    FROM vendas_comercial vc
    JOIN vendas v ON v.id = vc.venda_id
    WHERE vc.venda_id IS NOT NULL
      AND vc.qtde_parcelas = 1
      AND vc.total_contrato = vc.valor_mensal
      AND v.periodo LIKE '% mes%'
  `).all();
  const stmtFix = db.prepare(`
    UPDATE vendas_comercial SET total_contrato = ?, qtde_parcelas = ?, pontos_contratados = COALESCE(?, pontos_contratados) WHERE id = ?
  `);
  for (const row of toFix) {
    const match = String(row.periodo || '').match(/^(\d+)\s+mes/i);
    const meses = match ? Number(match[1]) : 1;
    let pontosStr = null;
    try {
      const nomes = Array.isArray(row.pontos_nomes) ? row.pontos_nomes : JSON.parse(row.pontos_nomes || '[]');
      pontosStr = nomes.length > 0 ? nomes.join(', ') : null;
    } catch { pontosStr = null; }
    stmtFix.run(Number(row.valor_mensal || 0) * meses, meses, pontosStr, row.id);
  }
  if (toFix.length > 0) console.log(`[gestao] repaired ${toFix.length} auto-synced vendas_comercial rows`);
} catch (e) { console.error('[gestao] repair auto-sync failed:', e.message); }

// Migration: add data_primeira_parcela column to vendas table
try { db.prepare("ALTER TABLE vendas ADD COLUMN data_primeira_parcela TEXT").run(); } catch {}
// Migration: add dia_pagamento_dia column to vendas (integer day only)
try { db.prepare("ALTER TABLE vendas ADD COLUMN dia_pagamento_dia INTEGER").run(); } catch {}

// ─── Sync vendas_comercial (April 2026) → vendas table ──────────────────
// Creates vendas rows for gestão entries that have no linked venda yet
try {
  const now = new Date();
  const syncYear = now.getFullYear();
  const syncMonth = now.getMonth() + 1; // April = 4
  const unlinked = db.prepare(`
    SELECT * FROM vendas_comercial
    WHERE ano = ? AND mes = ? AND (venda_id IS NULL OR venda_id = 0)
    AND UPPER(COALESCE(cliente,'')) NOT IN ('META BASE','HIPER META','META MÊS','META MES')
  `).all(syncYear, syncMonth);

  const insertVenda = db.prepare(`
    INSERT INTO vendas (tipo, razao_social, cnpj, pontos_nomes, valor_mensal,
      periodo, vendedor_nome, whatsapp_status, status, obs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'nao_configurado', 'ativa', ?, COALESCE(?, datetime('now')))
  `);
  const linkBack = db.prepare(`UPDATE vendas_comercial SET venda_id = ? WHERE id = ?`);

  let syncCount = 0;
  for (const vc of unlinked) {
    try {
      const pontosNomes = vc.pontos_contratados
        ? JSON.stringify(vc.pontos_contratados.split(',').map(s => s.trim()).filter(Boolean))
        : '[]';
      const periodo = vc.qtde_parcelas > 1 ? `${vc.qtde_parcelas} meses` : null;
      const result = insertVenda.run(
        'Nova Venda',
        vc.cliente,
        vc.cnpj || null,
        pontosNomes,
        vc.valor_mensal || null,
        periodo,
        vc.vendedor_nome || null,
        vc.obs || null,
        vc.data_venda || null
      );
      linkBack.run(result.lastInsertRowid, vc.id);
      syncCount++;
    } catch (syncRowErr) {
      console.warn(`[gestao→vendas] sync failed for vc.id=${vc.id}:`, syncRowErr.message);
    }
  }
  if (syncCount > 0) console.log(`[gestao→vendas] synced ${syncCount} vendas_comercial → vendas for ${syncMonth}/${syncYear}`);
} catch (e) { console.error('[gestao→vendas] sync failed:', e.message); }

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS renovacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      cliente TEXT NOT NULL,
      cnpj TEXT,
      pontos TEXT,
      valor_mensal REAL DEFAULT 0,
      status TEXT DEFAULT 'pendente',
      vendedor_nome TEXT,
      obs TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )
  `).run();
} catch (e) { console.error('[renovacoes] init:', e.message); }

function getEvolutionSettings() {
  const keys = [
    'evolution_api_url',
    'evolution_instance',
    'evolution_api_key',
    'evolution_dest_number'
  ];
  const result = {};
  keys.forEach(k => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k);
    result[k] = row?.value || '';
  });
  return result;
}

// Etapas pós-venda (usadas no sendList e no webhook)
const ETAPAS_VENDA = [
  { key: 'contrato_enviado',   label: 'Contrato Enviado',   emoji: '📤' },
  { key: 'contrato_assinado',  label: 'Contrato Assinado',  emoji: '✅' },
  { key: 'cobranca_material',  label: 'Cobrança de Material', emoji: '📦' },
  { key: 'material_recebido',  label: 'Material Recebido',  emoji: '🎨' },
  { key: 'veiculando',         label: 'Veiculando',         emoji: '📡' },
];

// Mapeamento emoji → etapa (fallback reação — mantido para retrocompatibilidade)
const EMOJI_ETAPA_MAP = Object.fromEntries(
  ETAPAS_VENDA.map(e => [e.emoji, e])
);

// Mapeamento nome completo da opção da lista → etapa
const LIST_OPTION_MAP = Object.fromEntries(
  ETAPAS_VENDA.map(e => [`${e.emoji} ${e.label}`, e])
);

async function sendEvolutionText({ apiUrl, instance, apiKey, number, text }) {
  const base = apiUrl.replace(/\/$/, '');
  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify({ number: String(number).trim(), text })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution [texto]: ${res.status} ${body.slice(0, 120)}`);
  }
  return res.json();
}

async function sendEvolutionPoll({ apiUrl, instance, apiKey, number, name, values }) {
  const base = apiUrl.replace(/\/$/, '');
  const url = `${base}/message/sendPoll/${encodeURIComponent(instance)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify({ number: String(number).trim(), name, values, selectableCount: values.length })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution [poll]: ${res.status} ${body.slice(0, 120)}`);
  }
  return res.json();
}

async function sendEvolutionList({ apiUrl, instance, apiKey, number, title, description, footerText, buttonText, sections }) {
  const base = apiUrl.replace(/\/$/, '');
  const url = `${base}/message/sendList/${encodeURIComponent(instance)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify({
      number: String(number).trim(),
      title,
      description,
      footerText: footerText || '',
      buttonText,
      sections
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution [list]: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function sendEvolutionDocument({ apiUrl, instance, apiKey, number, caption, filePath, fileName }) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const base = apiUrl.replace(/\/$/, '');
  const url = `${base}/message/sendMedia/${encodeURIComponent(instance)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify({
      number: String(number).trim(),
      mediatype: 'document',
      caption,
      media: base64,
      fileName: fileName || 'PI.pdf'
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution [documento]: ${res.status} ${body.slice(0, 120)}`);
  }
  return res.json();
}

function buildVendaWhatsappMessage({ tipo, vendedorNome, razaoSocial, cnpj, pontosNomes,
  valorMensal, tipoValor, periodo, diaPagamento, dataPrimeiraParcela, diaPagamentoDia,
  viaAgencia, agenciaNome, comissaoPct,
  trocaMaterial,
  responsavelNome, responsavelWhatsapp, obs }) {

  const isRenovacao = tipo === 'Renovação';
  const headerEmoji = isRenovacao ? '🔄' : '🟠';
  const headerLabel = isRenovacao ? 'RENOVAÇÃO' : 'NOVA VENDA';

  const lines = [];

  lines.push(`${headerEmoji} *${headerLabel}* — ${vendedorNome}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  if (cnpj) {
    lines.push(`🏢 *${razaoSocial}*`);
    lines.push(`_CNPJ: ${cnpj}_`);
  } else {
    lines.push(`🏢 *${razaoSocial}*`);
  }
  lines.push('');

  const nomes = Array.isArray(pontosNomes) ? pontosNomes : JSON.parse(pontosNomes || '[]');
  if (nomes.length > 0) {
    lines.push(`📍 *PONTO${nomes.length > 1 ? 'S' : ''} CONTRATADO${nomes.length > 1 ? 'S' : ''}*`);
    nomes.forEach(n => lines.push(`  • ${n}`));
    lines.push('');
  }

  const financeiro = [
    valorMensal ? `💰 Valor mensal: *R$ ${valorMensal}*${tipoValor ? ` _(${tipoValor})_` : ''}` : null,
    periodo     ? `📅 Período: *${periodo}*` : null,
    dataPrimeiraParcela ? `📆 Data da 1ª parcela: *${dataPrimeiraParcela}*` : null,
    diaPagamentoDia ? `📆 Dia de pagamento: *Dia ${diaPagamentoDia} de cada mês*` : (diaPagamento ? `📆 Dia de pagamento: *dia ${diaPagamento}*` : null),
  ].filter(Boolean);

  if (financeiro.length > 0) {
    lines.push('💼 *CONDIÇÕES COMERCIAIS*');
    financeiro.forEach(l => lines.push(l));
    if (viaAgencia && agenciaNome) {
      lines.push(`🤝 Via agência: *${agenciaNome}*${comissaoPct ? ` · Comissão: *${comissaoPct}%*` : ''}`);
    }
    lines.push('');
  }

  if (isRenovacao) {
    lines.push(`🔁 Troca de material: *${trocaMaterial ? 'Sim' : 'Não'}*`);
    lines.push('');
  }

  if (responsavelNome || responsavelWhatsapp) {
    lines.push('👤 *RESPONSÁVEL PELO CLIENTE*');
    if (responsavelNome)      lines.push(`Nome: ${responsavelNome}`);
    if (responsavelWhatsapp)  lines.push(`WhatsApp: ${responsavelWhatsapp}`);
  }

  if (obs && String(obs).trim()) {
    lines.push('');
    lines.push(`📝 *OBS:* ${String(obs).trim()}`);
  }

  return lines.join('\n');
}

app.post(
  '/api/vendas',
  resolveAuthenticatedUser,
  uploadPi.single('pi'),
  async (req, res) => {
    try {
      const {
        tipo = 'Nova Venda',
        razao_social,
        cnpj,
        valor_mensal,
        tipo_valor,
        via_agencia,
        agencia_nome,
        comissao_pct,
        troca_material,
        periodo_tipo,
        periodo_meses,
        periodo_inicio,
        periodo_fim,
        dia_pagamento,
        data_primeira_parcela,
        dia_pagamento_dia,
        responsavel_nome,
        responsavel_whatsapp,
        obs,
        pontos_nomes,
        vendedor_nome
      } = req.body;

      if (!razao_social || !String(razao_social).trim()) {
        return res.status(400).json({ error: 'Razão Social é obrigatória.' });
      }

      // Monta string de período
      let periodo = '';
      if (periodo_tipo === 'meses' && periodo_meses) {
        periodo = `${periodo_meses} ${Number(periodo_meses) === 1 ? 'mês' : 'meses'}`;
      } else if (periodo_tipo === 'datas' && periodo_inicio && periodo_fim) {
        const fmt = d => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
        periodo = `${fmt(periodo_inicio)} à ${fmt(periodo_fim)}`;
      }

      const piPath = req.file ? req.file.path : null;

      // Salva no banco
      const stmt = db.prepare(`
        INSERT INTO vendas (tipo, razao_social, cnpj, pontos_nomes, valor_mensal, tipo_valor,
          via_agencia, agencia_nome, comissao_pct, troca_material,
          periodo, dia_pagamento, data_primeira_parcela, dia_pagamento_dia,
          responsavel_nome, responsavel_whatsapp,
          obs, pi_path, vendedor_id, vendedor_nome, whatsapp_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', datetime('now'))
      `);

      const dbResult = stmt.run(
        tipo,
        String(razao_social).trim(),
        cnpj || null,
        pontos_nomes || '[]',
        valor_mensal || null,
        tipo_valor || null,
        via_agencia === 'true' || via_agencia === true ? 1 : 0,
        agencia_nome || null,
        comissao_pct || null,
        troca_material === 'true' || troca_material === true ? 1 : 0,
        periodo || null,
        dia_pagamento || null,
        data_primeira_parcela || null,
        dia_pagamento_dia ? Number(dia_pagamento_dia) : null,
        responsavel_nome || null,
        responsavel_whatsapp || null,
        obs || null,
        piPath || null,
        req.authUser?.id || null,
        vendedor_nome || req.authUser?.username || null
      );

      const vendaId = dbResult.lastInsertRowid;

      // Disparo WhatsApp via Evolution API
      const evo = getEvolutionSettings();
      let whatsappStatus = 'pendente';
      let whatsappError = null;

      if (evo.evolution_api_url && evo.evolution_instance && evo.evolution_api_key && evo.evolution_dest_number) {
        try {
          const mensagem = buildVendaWhatsappMessage({
            tipo,
            vendedorNome: vendedor_nome || req.authUser?.username || 'Vendedor',
            razaoSocial: String(razao_social).trim(),
            cnpj: cnpj || '',
            pontosNomes: pontos_nomes || '[]',
            valorMensal: valor_mensal || '',
            tipoValor: tipo_valor || '',
            periodo,
            diaPagamento: dia_pagamento || '',
            dataPrimeiraParcela: data_primeira_parcela || '',
            diaPagamentoDia: dia_pagamento_dia || '',
            viaAgencia: via_agencia === 'true' || via_agencia === true,
            agenciaNome: agencia_nome || '',
            comissaoPct: comissao_pct || '',
            trocaMaterial: troca_material === 'true' || troca_material === true,
            responsavelNome: responsavel_nome || '',
            responsavelWhatsapp: responsavel_whatsapp || '',
            obs: obs || ''
          });

          let waMsgId = null;
          if (piPath) {
            // Envia o PDF com a mensagem como caption
            const evoResp = await sendEvolutionDocument({
              apiUrl: evo.evolution_api_url,
              instance: evo.evolution_instance,
              apiKey: evo.evolution_api_key,
              number: evo.evolution_dest_number,
              caption: mensagem,
              filePath: piPath,
              fileName: req.file?.originalname || 'PI.pdf'
            });
            waMsgId = evoResp?.key?.id || evoResp?.[0]?.key?.id || null;
          } else {
            const evoResp = await sendEvolutionText({
              apiUrl: evo.evolution_api_url,
              instance: evo.evolution_instance,
              apiKey: evo.evolution_api_key,
              number: evo.evolution_dest_number,
              text: mensagem
            });
            waMsgId = evoResp?.key?.id || evoResp?.[0]?.key?.id || null;
          }

          whatsappStatus = 'enviado';

          // Envia enquete de etapas pós-venda (best-effort)
          try {
            const pollResp = await sendEvolutionPoll({
              apiUrl: evo.evolution_api_url,
              instance: evo.evolution_instance,
              apiKey: evo.evolution_api_key,
              number: evo.evolution_dest_number,
              name: `📋 Etapas — ${String(razao_social).trim()}`,
              values: ETAPAS_VENDA.map(e => `${e.emoji} ${e.label}`)
            });
            const pollId = pollResp?.key?.id || pollResp?.[0]?.key?.id || null;
            if (pollId) {
              try {
                db.prepare('UPDATE vendas SET whatsapp_poll_id = ? WHERE id = ?').run(pollId, vendaId);
              } catch { /* ignora */ }
            }
          } catch (pollErr) {
            console.warn('[vendas] falha ao enviar enquete de etapas:', pollErr.message);
          }
        } catch (wErr) {
          console.error('[vendas] falha ao enviar WhatsApp:', wErr.message);
          whatsappStatus = 'falha';
          whatsappError = wErr.message;
        }

        // Atualiza status no banco
        try {
          db.prepare("UPDATE vendas SET whatsapp_status = ?, whatsapp_error = ?, whatsapp_message_id = COALESCE(?, whatsapp_message_id) WHERE id = ?")
            .run(whatsappStatus, whatsappError || null, waMsgId || null, vendaId);
        } catch { /* ignora falha de update */ }
      } else {
        whatsappStatus = 'nao_configurado';
        console.warn('[vendas] Evolution API não configurada — WhatsApp não disparado.');
        try {
          db.prepare("UPDATE vendas SET whatsapp_status = 'nao_configurado' WHERE id = ?").run(vendaId);
        } catch { /* ignora */ }
      }

      // Auto-sync para vendas_comercial (Gestão Comerci