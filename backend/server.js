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
const arteRouter          = require('./routes/arte');
const comercialChatRouter = require('./routes/comercialChat');
const geoRouter           = require('./routes/geo');
const aiRouter            = require('./routes/ai');
const {
  TOKEN_TTL_SECONDS,
  createAuthToken,
  parseAuthToken,
  extractBearerToken,
  hashPassword,
  verifyPassword,
  isPasswordHash
} = require('./auth');
const { createBackupScheduler } = require('./backupService');
const { startScheduledMessages } = require('./services/scheduledMessagesService');
const { generatePdfsFromPointNames } = require('./services/technicalPdfService');
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

// ── Schema bootstrap — runs for BOTH SQLite and PostgreSQL ───────────────────
// In SQLite mode, database.sqlite.js already ran these; the IF NOT EXISTS
// guards make them safe to run again. In PostgreSQL mode this is the ONLY
// place these tables are created (database.js has no auto-migration).
try {
  // Written in SQLite syntax — the postgres compat layer (database.js) transforms
  // INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY and datetime('now') → NOW()
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      telefone   TEXT NOT NULL,
      empresa    TEXT NOT NULL,
      status     TEXT DEFAULT 'novo',
      notas      TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS navigation_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT,
      page_url   TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_nav_events_session ON navigation_events(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_nav_events_created ON navigation_events(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS proposta_tokens (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      token         TEXT UNIQUE NOT NULL,
      proposta_data TEXT NOT NULL,
      expires_at    TEXT NOT NULL,
      created_by    INTEGER,
      created_at    TEXT DEFAULT (datetime('now')),
      viewed_at     TEXT,
      approved_at   TEXT,
      approved_name TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_proposta_tokens_token ON proposta_tokens(token)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_proposta_links (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id            INTEGER NOT NULL,
      proposta_tipo      TEXT NOT NULL,
      proposta_id        INTEGER,
      proposta_token_id  INTEGER,
      etapa              TEXT NOT NULL DEFAULT 'enviada',
      observacao         TEXT,
      created_by         INTEGER,
      created_at         TEXT DEFAULT (datetime('now')),
      updated_at         TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lead_proposta_links_lead ON lead_proposta_links(lead_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lead_proposta_links_proposta ON lead_proposta_links(proposta_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lead_proposta_links_token ON lead_proposta_links(proposta_token_id)`);

  // Column migrations — safe to ignore if already applied
  try { db.exec(`ALTER TABLE chat_sessions ADD COLUMN lead_captured INTEGER DEFAULT 0`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN proposta_vencedora_tipo TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN proposta_vencedora_id INTEGER`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN proposta_vencedora_token_id INTEGER`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN venda_id INTEGER`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN convertido_em TEXT`); } catch { /* exists */ }
} catch (e) {
  console.error('[schema bootstrap]', e.message);
}

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
const proposalImagesPath = path.join(uploadsPath, 'proposal-images');
if (!fs.existsSync(proposalImagesPath)) fs.mkdirSync(proposalImagesPath, { recursive: true });
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

// Origens permitidas para endpoints públicos de monitores (players de tela).
// Configure via MONITOR_ORIGINS=https://player1.com,https://player2.com no .env
// Se não configurado, aceita mesmas origens que o frontend.
function getMonitorCorsOptions() {
  const fromEnv = String(process.env.MONITOR_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (fromEnv.length) {
    const monitorOrigins = new Set(fromEnv);
    return {
      origin: (origin, cb) => {
        if (!origin || monitorOrigins.has(origin)) cb(null, true);
        else cb(new Error('Origem não permitida'));
      },
      methods: ['GET', 'HEAD', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept'],
      maxAge: 86400
    };
  }

  // Sem MONITOR_ORIGINS definido: usa as mesmas origens do frontend (mais restritivo que '*')
  return {
    origin: corsOriginValidator,
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    maxAge: 86400
  };
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 1200),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.ip || req.connection?.remoteAddress || 'unknown';
    return ip.replace(/^::ffff:/, '');
  },
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  // Count only failed attempts and partition by IP + login identifier.
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = (forwarded || req.ip || req.connection?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const identifier = String(req.body?.username || req.body?.email || '').trim().toLowerCase();
    return identifier ? `${ip}:${identifier}` : ip;
  },
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

// Rate limiter mais generoso para rotas públicas (proposta, tracking, census)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_RATE_LIMIT_MAX || 3000),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.ip || req.connection?.remoteAddress || 'unknown';
    return ip.replace(/^::ffff:/, '');
  },
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' }
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

  // Content-Security-Policy
  // - 'unsafe-inline' em style-src necessário para Leaflet/MapLibre injetarem estilos dinâmicos
  // - 'unsafe-eval' em script-src necessário para maplibre-gl (WebAssembly / eval)
  // - blob: em worker-src necessário para web workers do maplibre-gl
  // - data: em img-src necessário para canvas toDataURL() usado na geração de PDF
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);

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
// Rotas públicas com limiter mais generoso (antes do apiLimiter geral)
app.use('/api/p', publicLimiter);
app.use('/api/track', publicLimiter);
app.use('/api/census/profiles', publicLimiter);
app.use('/api/leads/check', publicLimiter);
// apiLimiter geral — skip rotas que já têm publicLimiter
const PUBLIC_PREFIXES = ['/api/p/', '/api/p', '/api/track', '/api/census/profiles', '/api/leads/check'];
app.use('/api', (req, res, next) => {
  const fullPath = req.originalUrl || req.url;
  if (PUBLIC_PREFIXES.some(prefix => fullPath.startsWith(prefix))) return next();
  return apiLimiter(req, res, next);
});

// Responde com erro 500 genérico ao cliente e loga detalhes no servidor
function internalError(res, err, msg = 'Erro interno no servidor.') {
  console.error('[error]', err?.message || err);
  res.status(500).json({ error: msg });
}

// Lê token do cookie HttpOnly (fallback ao Bearer header)
function extractTokenFromCookie(req) {
  const cookieHeader = String(req.headers.cookie || '');
  const match = cookieHeader.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]).trim() : '';
}

// Helpers para setar/limpar cookies de autenticação
function setAuthCookies(res, req, token) {
  const isHttps = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  const secure = isHttps ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `admin_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Max-Age=${TOKEN_TTL_SECONDS}; Path=/api${secure}`,
    `auth_hint=1; SameSite=Strict; Max-Age=${TOKEN_TTL_SECONDS}; Path=/${secure}`
  ]);
}

function clearAuthCookies(res, req) {
  const isHttps = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  const secure = isHttps ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `admin_token=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/api${secure}`,
    `auth_hint=; SameSite=Strict; Max-Age=0; Path=/${secure}`
  ]);
}

function resolveAuthenticatedUser(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization) || extractTokenFromCookie(req);
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
    '/loop-audit',
    '/geo',
    '/ai/health',
    '/ai/stats',
    '/ai/point',
    '/leads/check'
  ];

  if (method === 'GET' && publicGetPrefixes.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))) {
    return next();
  }

  // AI campaign analysis + recommendation — public for /planejar
  const publicPostPaths = ['/ai/campaign', '/ai/recommend', '/ai/plan-decision', '/inventory-chat', '/ai/proposta-texto', '/track', '/leads/capture'];
  if (method === 'POST' && publicPostPaths.includes(routePath)) {
    return next();
  }

  // Proposta pública — leitura e aprovação pelo cliente (sem login)
  if (routePath.startsWith('/p/')) return next();

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
app.use('/api/comercial/chat', requireRoles(['admin', 'gerente_comercial', 'vendedor']), comercialChatRouter);
app.use('/api/geo', geoRouter);
app.use('/api/ai', aiRouter);

// ── Inventory chatbot (inline, same pattern as other /api routes) ──
const { processInventoryChat } = require('./services/inventoryChatService');
const _inventoryChatHandler = async (req, res) => {
  try {
    const { message, history, sessionId } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      return res.status(400).json({ error: 'message string is required (min 2 chars)' });
    }
    const safeHistory = Array.isArray(history)
      ? history.filter(h => h && typeof h.role === 'string' && typeof h.text === 'string').slice(-20)
      : [];
    const userId = req.authUser?.id || null;
    const safeSessionId = (typeof sessionId === 'string' && sessionId.length >= 10) ? sessionId : null;
    const result = await processInventoryChat(message.trim(), safeHistory, userId, safeSessionId);
    res.json(result);
  } catch (err) {
    console.error('[inventory-chat]', err.message);
    res.status(503).json({
      response: 'Desculpe, estou com dificuldade para processar sua pergunta. Tente novamente em alguns instantes.',
      intent: 'error',
      entities: {},
      _model: 'fallback',
    });
  }
};
app.post('/api/inventory-chat', _inventoryChatHandler);
app.post('/inventory-chat', _inventoryChatHandler);

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
    internalError(res, err);
  }
});

// GET single ponto
app.get('/api/pontos/:id', (req, res) => {
  try {
    const ponto = db.prepare('SELECT * FROM pontos WHERE id = ?').get(req.params.id);
    if (!ponto) return res.status(404).json({ error: 'Ponto não encontrado' });
    res.json(hydratePontoRow(ponto));
  } catch (err) {
    internalError(res, err);
  }
});

app.get('/api/audience-tags', (req, res) => {
  try {
    const rows = db.prepare('SELECT audience_tags, publico FROM pontos WHERE ativo = 1').all();
    res.json(buildAudienceTagCatalog(rows));
  } catch (err) {
    internalError(res, err);
  }
});

// GET distinct publico values
app.get('/api/publicos', (req, res) => {
  try {
    const rows = db.prepare('SELECT DISTINCT publico FROM pontos WHERE ativo = 1 AND publico IS NOT NULL ORDER BY publico').all();
    res.json(rows.map(r => r.publico));
  } catch (err) {
    internalError(res, err);
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
    internalError(res, err);
  }
});

// ── Public Monitor API (auditoria de loop) ───────────────────────────────────
const openCors = cors(getMonitorCorsOptions());
const monitorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.MONITOR_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
  message: { error: 'Muitas requisições ao monitor. Tente novamente em breve.' }
});

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

app.get('/api/monitors', openCors, monitorLimiter, (req, res) => {
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
app.get('/api/monitors/lookup', openCors, monitorLimiter, (req, res) => {
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

app.get('/api/monitors/:id', openCors, monitorLimiter, (req, res) => {
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

// ── Tabela de propostas públicas (link para o cliente) ──
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS proposta_tokens (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    token         TEXT UNIQUE NOT NULL,
    proposta_data TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    created_by    INTEGER,
    created_at    TEXT DEFAULT (datetime('now')),
    viewed_at     TEXT,
    approved_at   TEXT,
    approved_name TEXT
  )`).run();
} catch (e) { /* já existe */ }

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

app.get('/api/loop-audit', openCors, monitorLimiter, async (req, res) => {
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
app.get('/api/loop-audit/exclusions', openCors, monitorLimiter, (req, res) => {
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
  const token = createAuthToken(safeUser);

  setAuthCookies(res, req, token);
  res.json({
    success: true,
    token,
    user: safeUser
  });
});

// Logout — limpa cookies de autenticação no servidor
app.post('/api/auth/logout', (req, res) => {
  clearAuthCookies(res, req);
  res.json({ ok: true });
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
  }
});

// Get job status
app.get('/api/entorno/jobs/:id', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
  }
});

// Trigger one immediate auto-refresh cycle manually
app.post('/api/entorno/auto/run-now', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    runAutoRefreshCycle();
    res.json({ success: true, state: getAutoRefreshState() });
  } catch (err) {
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
  }
});

// GET coverage summary
app.get('/api/geoaudience/coverage', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const cidade = String(req.query.cidade || '').trim() || null;
    const summary = geoAudience.getCoverageSummary(cidade);
    res.json(summary);
  } catch (err) {
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
  }
});

app.get('/api/census/coverage', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { municipio } = req.query;
    res.json(censusAudience.getCoverageSummary(municipio));
  } catch (err) {
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
  }
});

// ─── Audience Intelligence Engine Routes ─────────────────────────────────────

// Profiles CRUD
app.get('/api/audience-intel/profiles', (req, res) => {
  try {
    res.json(audienceIntel.listProfiles());
  } catch (err) { internalError(res, err); }
});

app.put('/api/audience-intel/profiles/:name', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const { label, description, weights } = req.body;
    if (!label || !weights) return res.status(400).json({ error: 'label and weights required' });
    res.json(audienceIntel.upsertProfile(req.params.name, { label, description, weights }));
  } catch (err) { internalError(res, err); }
});

app.delete('/api/audience-intel/profiles/:name', requireRoles(['admin']), (req, res) => {
  try {
    const deleted = audienceIntel.deleteProfile(req.params.name);
    res.json({ deleted });
  } catch (err) { internalError(res, err); }
});

// Point scoring
app.get('/api/audience-intel/scores', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { cidade, profile, minScore } = req.query;
    res.json(audienceIntel.getAllScores({ cidade, profile, minScore }));
  } catch (err) { internalError(res, err); }
});

app.get('/api/audience-intel/scores/:pontoId', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const pontoId = Number(req.params.pontoId);
    if (!Number.isFinite(pontoId)) return res.status(400).json({ error: 'ID inválido' });
    res.json(audienceIntel.getPointScores(pontoId));
  } catch (err) { internalError(res, err); }
});

app.get('/api/audience-intel/ranking', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { profile, cidade, limit } = req.query;
    if (!profile) return res.status(400).json({ error: 'profile query param required' });
    res.json(audienceIntel.getRanking({ profile, cidade, limit: Number(limit) || 20 }));
  } catch (err) { internalError(res, err); }
});

// Analyze (triggers async scoring)
app.post('/api/audience-intel/analyze/:pontoId', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const pontoId = Number(req.params.pontoId);
    if (!Number.isFinite(pontoId)) return res.status(400).json({ error: 'ID inválido' });
    const force = req.query.force === '1' || req.query.force === 'true';
    const scores = await audienceIntel.analyzePoint(pontoId, { force });
    res.json(scores);
  } catch (err) { internalError(res, err); }
});

app.post('/api/audience-intel/analyze-city', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const { cidade, force } = req.body;
    // Run async — respond immediately with job reference
    const result = audienceIntel.analyzeCity(cidade, { force: !!force });
    // Don't await — return immediately
    res.json({ message: 'Analysis started', cidade: cidade || 'all' });
  } catch (err) { internalError(res, err); }
});

app.get('/api/audience-intel/jobs/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const job = audienceIntel.getJob(Number(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) { internalError(res, err); }
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
  } catch (err) { internalError(res, err); }
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
  } catch (err) { internalError(res, err); }
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
    internalError(res, err);
  }
});

// GET all pontos for admin (including inactive)
app.get('/api/admin/pontos', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const pontos = db.prepare('SELECT * FROM pontos ORDER BY cidade, nome').all().map(hydratePontoRow);
    res.json(pontos);
  } catch (err) {
    internalError(res, err);
  }
});

app.get('/api/admin/users', requireRoles(['admin']), (req, res) => {
  try {
    const users = db.prepare('SELECT id, first_name, last_name, username, email, whatsapp, role, is_vendedor, photo_url, created_at FROM admin_users ORDER BY first_name ASC, last_name ASC, username ASC').all();
    res.json(users);
  } catch (err) {
    internalError(res, err);
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
    const created = db.prepare('SELECT id, first_name, last_name, username, email, whatsapp, role, is_vendedor, photo_url, created_at FROM admin_users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    internalError(res, err);
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
    internalError(res, err);
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

    const updated = db.prepare('SELECT id, first_name, last_name, username, email, whatsapp, role, is_vendedor, photo_url FROM admin_users WHERE id = ?').get(id);
    if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(updated);
  } catch (err) {
    internalError(res, err);
  }
});

app.get('/api/admin/pdf-layout', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    res.json(readPdfLayoutOverrides());
  } catch (err) {
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
  }
});

app.put('/api/admin/settings', requireRoles(['admin']), (req, res) => {
  try {
    const {
      lucro_minimo_percentual,
      evolution_api_url,
      evolution_instance,
      evolution_api_key,
      evolution_dest_number,
      evolution_financeiro_number
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
    const evoFields = { evolution_api_url, evolution_instance, evolution_api_key, evolution_dest_number, evolution_financeiro_number };
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
    internalError(res, err);
  }
});

// Endpoint de teste: dispara manualmente o lembrete do financeiro
app.post('/api/admin/test-financeiro-reminder', requireRoles(['admin']), async (req, res) => {
  try {
    const settings = getEvolutionSettings();
    const financeiroNumber = settings.evolution_financeiro_number;

    if (!financeiroNumber) {
      return res.status(400).json({ error: 'Número do financeiro não configurado' });
    }
    if (!settings.evolution_api_url || !settings.evolution_instance || !settings.evolution_api_key) {
      return res.status(400).json({ error: 'Evolution API não configurada' });
    }

    // Busca vendas sem contrato assinado
    const vendas = db.prepare(`
      SELECT v.id, v.razao_social, v.cnpj, v.vendedor_nome, v.valor_mensal,
             v.created_at, v.pontos_nomes
      FROM vendas v
      WHERE v.status = 'ativa'
        AND v.id NOT IN (
          SELECT ve.venda_id FROM venda_etapas ve
          WHERE ve.etapa_key = 'contrato_assinado'
            AND ve.removido = 0
        )
      ORDER BY v.created_at ASC
    `).all();

    if (vendas.length === 0) {
      return res.json({ message: 'Nenhuma venda pendente de assinatura para enviar', vendaCount: 0 });
    }

    // Monta a mensagem
    const lines = [];
    lines.push('📋 *LEMBRETE SEMANAL — CONTRATOS PENDENTES DE ASSINATURA*');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`Existem *${vendas.length}* venda(s) ativa(s) sem a confirmação de contrato assinado:`);
    lines.push('');

    vendas.forEach((v, i) => {
      const pontos = (() => {
        try { return JSON.parse(v.pontos_nomes || '[]'); } catch { return []; }
      })();
      const pontosStr = pontos.length > 0 ? pontos.join(', ') : '—';

      lines.push(`*${i + 1}. ${v.razao_social || 'Sem nome'}*`);
      if (v.cnpj) lines.push(`   CNPJ: ${v.cnpj}`);
      if (v.vendedor_nome) lines.push(`   Vendedor: ${v.vendedor_nome}`);
      if (v.valor_mensal) lines.push(`   Valor mensal: R$ ${v.valor_mensal}`);
      lines.push(`   Pontos: ${pontosStr}`);
      if (v.created_at) lines.push(`   Criada em: ${v.created_at.slice(0, 10)}`);
      lines.push('');
    });

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('Por favor, verifique e cobre a assinatura dos contratos listados acima.');

    const message = lines.join('\n');

    // Envia via Evolution API
    await sendEvolutionText({
      apiUrl: settings.evolution_api_url,
      instance: settings.evolution_instance,
      apiKey: settings.evolution_api_key,
      number: financeiroNumber,
      text: message
    });

    res.json({
      message: 'Lembrete enviado com sucesso',
      vendaCount: vendas.length,
      financeiroNumber
    });
  } catch (err) {
    console.error('[test-reminder] Erro:', err.message);
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
  }
});

// POST criar nova proposta
app.post('/api/propostas', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { titulo, descricao, pontos, desconto_percentual, desconto_tipo, valor_total_original, lead_id } = req.body;
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

    const leadId = Number(lead_id || 0);
    if (leadId > 0) {
      const leadExists = db.prepare('SELECT id FROM leads WHERE id = ?').get(leadId);
      if (leadExists) {
        db.prepare(`
          INSERT INTO lead_proposta_links (lead_id, proposta_tipo, proposta_id, etapa, observacao, created_by)
          VALUES (?, 'interna', ?, 'criada', ?, ?)
        `).run(leadId, Number(result.lastInsertRowid), 'Vínculo automático na criação da proposta interna.', req.authUser.id);

        db.prepare(`
          UPDATE leads
          SET status = CASE WHEN status = 'novo' THEN 'em_atendimento' ELSE status END,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(leadId);
      }
    }

    const proposta = db.prepare('SELECT id, usuario_id, titulo, status, requer_aprovacao FROM propostas WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(proposta);
  } catch (err) {
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
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
    internalError(res, err);
  }
});

app.delete('/api/admin/pdf-layout', requireRoles(['admin']), (req, res) => {
  try {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(PDF_LAYOUT_SETTINGS_KEY);
    res.json({ success: true, overrides: {}, updatedAt: null });
  } catch (err) {
    internalError(res, err);
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
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const photoUrl = `/uploads/${file.filename}`;
    db.prepare("UPDATE admin_users SET photo_url = ?, updated_at = datetime('now') WHERE id = ?").run(photoUrl, req.authUser.id);
    res.json({ success: true, photo_url: photoUrl });
  } catch (err) {
    internalError(res, err);
  }
});

// Admin: upload photo for any user
app.post('/api/admin/users/:id/photo', requireRoles(['admin']), upload.fields([{ name: 'photo', maxCount: 1 }]), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const file = req.files?.photo?.[0];
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const photoUrl = `/uploads/${file.filename}`;
    db.prepare("UPDATE admin_users SET photo_url = ?, updated_at = datetime('now') WHERE id = ?").run(photoUrl, id);
    res.json({ success: true, photo_url: photoUrl });
  } catch (err) {
    internalError(res, err);
  }
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

// ─── Sync vendas_comercial (current month) → vendas table ──────────────────
// Creates vendas rows for gestão entries that have no linked venda yet
try {
  const now = new Date();
  const syncYear = now.getFullYear();
  const syncMonth = now.getMonth() + 1;
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
      console.warn(`[gestão→vendas] sync failed for vc.id=${vc.id}:`, syncRowErr.message);
    }
  }
  if (syncCount > 0) console.log(`[gestão→vendas] synced ${syncCount} vendas_comercial → vendas for ${syncMonth}/${syncYear}`);
} catch (e) { console.error('[gestão→vendas] sync failed:', e.message); }

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
    'evolution_dest_number',
    'evolution_financeiro_number'
  ];
  const result = {};
  keys.forEach(k => {
    // Env vars têm precedência sobre o banco — use EVOLUTION_API_KEY, EVOLUTION_API_URL, etc.
    const envKey = k.toUpperCase().replace(/-/g, '_');
    const fromEnv = process.env[envKey] || '';
    if (fromEnv) {
      result[k] = fromEnv;
    } else {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k);
      result[k] = row?.value || '';
    }
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

      // Auto-sync para vendas_comercial (Gestão Comercial)
      try {
        const now = new Date();
        const vNome = vendedor_nome || req.authUser?.username || null;
        // Calcular qtde_parcelas e total_contrato corretamente
        const qtdeParcelas = (periodo_tipo === 'meses' && periodo_meses) ? Number(periodo_meses) : 1;
        const valorMensalNum = Number(valor_mensal || 0);
        const totalContrato = valorMensalNum * qtdeParcelas;
        // Converter pontos_nomes de JSON para string legível
        let pontosStr = null;
        try {
          const nomes = Array.isArray(pontos_nomes) ? pontos_nomes : JSON.parse(pontos_nomes || '[]');
          pontosStr = nomes.length > 0 ? nomes.join(', ') : null;
        } catch { pontosStr = pontos_nomes || null; }
        db.prepare(`
          INSERT INTO vendas_comercial
            (vendedor_nome, ano, mes, data_venda, cliente, cnpj, pontos_contratados,
             valor_mensal, total_contrato, qtde_parcelas, obs, venda_id)
          VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          vNome,
          now.getFullYear(),
          now.getMonth() + 1,
          String(razao_social).trim(),
          cnpj || null,
          pontosStr,
          valorMensalNum,
          totalContrato,
          qtdeParcelas,
          obs || null,
          vendaId
        );
      } catch (syncErr) {
        console.warn('[vendas] auto-sync vendas_comercial falhou:', syncErr.message);
      }

      res.json({
        success: true,
        id: vendaId,
        whatsapp_status: whatsappStatus,
        message: whatsappStatus === 'enviado'
          ? 'Venda registrada e notificação enviada via WhatsApp!'
          : whatsappStatus === 'nao_configurado'
            ? 'Venda registrada. Configure a Evolution API nas Configurações para ativar o disparo automático.'
            : `Venda registrada. Falha no WhatsApp: ${whatsappError || 'erro desconhecido'}`
      });

      // ─── Disparo assíncrono: PDF técnico para o WhatsApp do cliente ───────
      // Roda em background para não atrasar a resposta ao vendedor.
      setImmediate(async () => {
        const evoClient = getEvolutionSettings();
        if (!evoClient.evolution_api_url || !evoClient.evolution_instance || !evoClient.evolution_api_key) {
          return; // Evolution API não configurada
        }

        const clientPhone = responsavel_whatsapp ? String(responsavel_whatsapp).trim() : null;
        if (!clientPhone) {
          console.warn(`[vendas/pdf] Venda ${vendaId}: responsavel_whatsapp não informado — PDF não enviado.`);
          return;
        }

        let pontosArr = [];
        try {
          pontosArr = Array.isArray(pontos_nomes) ? pontos_nomes : JSON.parse(pontos_nomes || '[]');
        } catch {
          console.warn(`[vendas/pdf] Venda ${vendaId}: falha ao parsear pontos_nomes.`);
          return;
        }

        if (pontosArr.length === 0) {
          console.warn(`[vendas/pdf] Venda ${vendaId}: sem pontos — PDF não gerado.`);
          return;
        }

        const nomeResponsavel = responsavel_nome ? String(responsavel_nome).trim() : 'cliente';
        const nomeVendedor    = vendedor_nome || req.authUser?.username || 'nosso time';

        const caption = `Oi, ${nomeResponsavel}! Tudo bem? 😄\n\nPassando pra te dar os parabéns pela escolha dos pontos — excelente decisão!\n\nEu sou o assistente de criação que trabalha junto com o ${nomeVendedor} e vou te ajudar com tudo que envolver criativos.\n\nTe enviei a proposta técnica com os detalhes 📄\n\nSe quiser trocar ideias ou precisar de ajuda com as artes, estou por aqui!`;

        console.log(`[vendas/pdf] Gerando PDFs técnicos para venda ${vendaId} (${pontosArr.length} ponto(s))...`);

        try {
          const { desktop, mobile } = await generatePdfsFromPointNames(db, pontosArr);

          // Envia PDF desktop
          try {
            const tmpDesktop = require('path').join(require('os').tmpdir(), `venda_${vendaId}_tecnico.pdf`);
            require('fs').writeFileSync(tmpDesktop, desktop);
            await sendEvolutionDocument({
              apiUrl:   evoClient.evolution_api_url,
              instance: evoClient.evolution_instance,
              apiKey:   evoClient.evolution_api_key,
              number:   clientPhone,
              caption,
              filePath: tmpDesktop,
              fileName: 'Informações Técnicas.pdf'
            });
            require('fs').unlinkSync(tmpDesktop);
            console.log(`[vendas/pdf] PDF desktop enviado para ${clientPhone} (venda ${vendaId}).`);
          } catch (sendErr) {
            console.error(`[vendas/pdf] Falha ao enviar PDF desktop (venda ${vendaId}):`, sendErr.message);
          }

          // Envia PDF mobile
          try {
            const tmpMobile = require('path').join(require('os').tmpdir(), `venda_${vendaId}_tecnico_mobile.pdf`);
            require('fs').writeFileSync(tmpMobile, mobile);
            await sendEvolutionDocument({
              apiUrl:   evoClient.evolution_api_url,
              instance: evoClient.evolution_instance,
              apiKey:   evoClient.evolution_api_key,
              number:   clientPhone,
              caption:  '📱 Versão mobile da proposta técnica:',
              filePath: tmpMobile,
              fileName: 'Informações Técnicas Mobile.pdf'
            });
            require('fs').unlinkSync(tmpMobile);
            console.log(`[vendas/pdf] PDF mobile enviado para ${clientPhone} (venda ${vendaId}).`);
          } catch (sendErr) {
            console.error(`[vendas/pdf] Falha ao enviar PDF mobile (venda ${vendaId}):`, sendErr.message);
          }

        } catch (genErr) {
          console.error(`[vendas/pdf] Falha ao gerar PDFs técnicos (venda ${vendaId}):`, genErr.message);
        }
      });
      // ─────────────────────────────────────────────────────────────────────

    } catch (err) {
      console.error('[vendas] erro:', err.message);
      internalError(res, err);
    }
  }
);

// ─── Teste de envio de PDF técnico via WhatsApp ───────────────────────────────
// Gera os PDFs para os pontos informados e envia ao número de teste.
// Não registra venda, não notifica o grupo interno.
app.post('/api/vendas/test-pdf', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  const { phone, pontos_nomes, responsavel_nome, vendedor_nome } = req.body || {};

  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ error: 'Informe o campo "phone" com o número de destino (ex: 5543999999999).' });
  }

  let pontosArr = [];
  try {
    pontosArr = Array.isArray(pontos_nomes) ? pontos_nomes : JSON.parse(pontos_nomes || '[]');
  } catch {
    return res.status(400).json({ error: 'Campo "pontos_nomes" deve ser um array JSON de nomes.' });
  }

  if (pontosArr.length === 0) {
    // Se nenhum ponto foi informado, usa os 2 primeiros pontos ativos do banco como fallback
    try {
      const fallback = db.prepare('SELECT nome FROM pontos WHERE ativo = 1 LIMIT 2').all();
      pontosArr = fallback.map(r => r.nome);
    } catch { /* ignora */ }
  }

  if (pontosArr.length === 0) {
    return res.status(400).json({ error: 'Nenhum ponto encontrado. Informe "pontos_nomes" ou cadastre pontos ativos.' });
  }

  const evo = getEvolutionSettings();
  if (!evo.evolution_api_url || !evo.evolution_instance || !evo.evolution_api_key) {
    return res.status(400).json({ error: 'Evolution API não configurada nas Configurações.' });
  }

  const destPhone      = String(phone).trim();
  const nomeResp       = responsavel_nome ? String(responsavel_nome).trim() : 'cliente teste';
  const nomeVend       = vendedor_nome    ? String(vendedor_nome).trim()    : req.authUser?.username || 'vendedor';
  const caption        = `Oi, ${nomeResp}! Tudo bem? 😄\n\nPassando pra te dar os parabéns pela escolha dos pontos — excelente decisão!\n\nEu sou o assistente de criação que trabalha junto com o ${nomeVend} e vou te ajudar com tudo que envolver criativos.\n\nTe enviei a proposta técnica com os detalhes 📄\n\nSe quiser trocar ideias ou precisar de ajuda com as artes, estou por aqui!`;
  const log            = [];

  try {
    log.push(`Gerando PDFs para ${pontosArr.length} ponto(s): ${pontosArr.join(', ')}`);
    const { desktop, mobile } = await generatePdfsFromPointNames(db, pontosArr);
    log.push(`PDFs gerados — desktop: ${(desktop.length / 1024).toFixed(0)} KB, mobile: ${(mobile.length / 1024).toFixed(0)} KB`);

    // Envia desktop
    const tmpD = require('path').join(require('os').tmpdir(), `test_pdf_desktop_${Date.now()}.pdf`);
    require('fs').writeFileSync(tmpD, desktop);
    try {
      await sendEvolutionDocument({
        apiUrl: evo.evolution_api_url, instance: evo.evolution_instance, apiKey: evo.evolution_api_key,
        number: destPhone, caption, filePath: tmpD, fileName: 'Informações Técnicas.pdf'
      });
      log.push(`PDF desktop enviado para ${destPhone}.`);
    } finally {
      try { require('fs').unlinkSync(tmpD); } catch {}
    }

    // Envia mobile
    const tmpM = require('path').join(require('os').tmpdir(), `test_pdf_mobile_${Date.now()}.pdf`);
    require('fs').writeFileSync(tmpM, mobile);
    try {
      await sendEvolutionDocument({
        apiUrl: evo.evolution_api_url, instance: evo.evolution_instance, apiKey: evo.evolution_api_key,
        number: destPhone, caption: '📱 Versão mobile da proposta técnica:', filePath: tmpM,
        fileName: 'Informações Técnicas Mobile.pdf'
      });
      log.push(`PDF mobile enviado para ${destPhone}.`);
    } finally {
      try { require('fs').unlinkSync(tmpM); } catch {}
    }

    res.json({ success: true, phone: destPhone, pontos: pontosArr, log });
  } catch (err) {
    log.push(`ERRO: ${err.message}`);
    console.error('[vendas/test-pdf]', err.message);
    res.status(500).json({ success: false, error: err.message, log });
  }
});

// ─── Listagem de vendas ───────────────────────────────────────────────────────
app.get('/api/vendas', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { status, q } = req.query;
    const { role, id: userId } = req.authUser;
    let sql = `SELECT * FROM vendas`;
    const conditions = [];
    const params = [];
    // Vendedor só vê as próprias vendas
    if (role === 'vendedor') {
      conditions.push(`vendedor_id = ?`);
      params.push(userId);
    }
    if (status && status !== 'todas') {
      conditions.push(`status = ?`);
      params.push(status);
    }
    if (q) {
      conditions.push(`(razao_social ILIKE ? OR cnpj ILIKE ? OR vendedor_nome ILIKE ?)`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC`;
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    internalError(res, err);
  }
});

// ─── Editar venda completa ────────────────────────────────────────────────────
app.put('/api/vendas/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM vendas WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Venda não encontrada.' });

    const {
      tipo, razao_social, cnpj, pontos_nomes, valor_mensal, tipo_valor,
      via_agencia, agencia_nome, comissao_pct, troca_material,
      periodo, dia_pagamento, data_primeira_parcela, dia_pagamento_dia,
      responsavel_nome, responsavel_whatsapp, obs, status, vendedor_nome
    } = req.body;

    db.prepare(`
      UPDATE vendas SET
        tipo = ?, razao_social = ?, cnpj = ?, pontos_nomes = ?, valor_mensal = ?, tipo_valor = ?,
        via_agencia = ?, agencia_nome = ?, comissao_pct = ?, troca_material = ?,
        periodo = ?, dia_pagamento = ?, data_primeira_parcela = ?, dia_pagamento_dia = ?,
        responsavel_nome = ?, responsavel_whatsapp = ?, obs = ?, status = ?, vendedor_nome = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      tipo || 'Nova Venda',
      razao_social || '',
      cnpj || null,
      pontos_nomes || '[]',
      valor_mensal || null,
      tipo_valor || null,
      via_agencia ? 1 : 0,
      agencia_nome || null,
      comissao_pct || null,
      troca_material ? 1 : 0,
      periodo || null,
      dia_pagamento || null,
      data_primeira_parcela || null,
      dia_pagamento_dia ? Number(dia_pagamento_dia) : null,
      responsavel_nome || null,
      responsavel_whatsapp || null,
      obs || null,
      status || 'ativa',
      vendedor_nome || null,
      id
    );

    const updated = db.prepare('SELECT * FROM vendas WHERE id = ?').get(id);

    // Sync pontos_contratados in the linked vendas_comercial record
    if (pontos_nomes) {
      try {
        const parsedNomes = JSON.parse(pontos_nomes);
        if (Array.isArray(parsedNomes)) {
          const commaList = parsedNomes.join(', ');
          db.prepare(`UPDATE vendas_comercial SET pontos_contratados = ?, updated_at = datetime('now') WHERE venda_id = ?`).run(commaList, id);
        }
      } catch {}
    }

    res.json(updated);
  } catch (err) {
    internalError(res, err);
  }
});

// ─── Atualizar status de uma venda ───────────────────────────────────────────
app.patch('/api/vendas/:id', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, obs } = req.body;
    const { role, id: userId } = req.authUser;
    const allowed = ['ativa', 'renovada', 'cancelada', 'pendente'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    // Vendedor só pode atualizar as próprias vendas
    if (role === 'vendedor') {
      const venda = db.prepare(`SELECT vendedor_id FROM vendas WHERE id = ?`).get(id);
      if (!venda || Number(venda.vendedor_id) !== Number(userId)) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }
    db.prepare(`UPDATE vendas SET status = ?, obs = ?, updated_at = datetime('now') WHERE id = ?`).run(status, obs || null, id);
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

// ─── Deletar venda (apenas admin e gerente_comercial) ────────────────────────
app.delete('/api/vendas/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const { id } = req.params;
    const venda = db.prepare('SELECT id FROM vendas WHERE id = ?').get(id);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });
    db.prepare('DELETE FROM venda_etapas WHERE venda_id = ?').run(id);
    // Also remove linked vendas_comercial record
    db.prepare('DELETE FROM vendas_comercial WHERE venda_id = ?').run(id);
    db.prepare('DELETE FROM vendas WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── Etapas pós-venda (checklist por reação emoji) ───────────────────────────
app.get('/api/vendas/:id/etapas', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.authUser;
    if (role === 'vendedor') {
      const venda = db.prepare('SELECT vendedor_id FROM vendas WHERE id = ?').get(id);
      if (!venda || Number(venda.vendedor_id) !== Number(userId)) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }
    const etapas = db.prepare(
      'SELECT * FROM venda_etapas WHERE venda_id = ? AND removido = 0 ORDER BY confirmado_at ASC'
    ).all(id);
    res.json(etapas);
  } catch (err) {
    internalError(res, err);
  }
});

// ─── Webhook Evolution API — reações emoji pós-venda ─────────────────────────
app.post('/api/webhooks/whatsapp', (req, res) => {
  try {
    const payload = req.body;
    const event = payload?.event;

    // Só processa votos em poll (messages.update) e mensagens normais
    const HANDLED = ['messages.upsert', 'message', 'messages.update', 'MESSAGES_UPDATE'];
    if (!HANDLED.includes(event)) {
      return res.json({ ok: true, ignored: 'event-not-handled' });
    }

    let data = payload?.data;
    if (Array.isArray(data)) data = data[0];

    // ── Voto em enquete (poll vote) ──────────────────────────────────────────
    const pollUpdate = data?.pollUpdates?.[0] || data?.update?.pollUpdates?.[0];
    if (pollUpdate) {
      const pollId = data?.key?.id || data?.update?.key?.id;
      if (!pollUpdate.vote?.selectedOptions?.length || !pollId) {
        return res.json({ ok: true, ignored: 'empty-vote' });
      }

      const venda = db.prepare(`SELECT id FROM vendas WHERE whatsapp_poll_id = ?`).get(pollId);
      if (!venda) {
        return res.json({ ok: true, ignored: 'poll-not-found', pollId });
      }

      const ETAPAS_MAP = {
        '📤 Contrato Enviado':    { key: 'contrato_enviado',  label: 'Contrato Enviado'    },
        '✅ Contrato Assinado':   { key: 'contrato_assinado', label: 'Contrato Assinado'   },
        '📦 Cobrança de Material':{ key: 'cobranca_material', label: 'Cobrança de Material' },
        '🎨 Material Recebido':   { key: 'material_recebido', label: 'Material Recebido'   },
        '📡 Veiculando':          { key: 'veiculando',        label: 'Veiculando'          },
      };

      for (const option of pollUpdate.vote.selectedOptions) {
        const etapa = ETAPAS_MAP[option];
        if (!etapa) continue;
        try {
          db.prepare(`
            INSERT INTO venda_etapas (venda_id, etapa_key, etapa_label, emoji, confirmado_at, confirmado_por)
            VALUES (?, ?, ?, '', NOW(), 'webhook')
            ON CONFLICT (venda_id, etapa_key) DO NOTHING
          `).run(venda.id, etapa.key, etapa.label);
        } catch { /* ignore */ }
      }

      return res.json({ ok: true, processed: 'poll-vote' });
    }

    res.json({ ok: true, ignored: 'no-handler' });
  } catch (err) {
    console.error('[webhook] erro:', err.message);
    res.json({ ok: true, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GESTÃO COMERCIAL — Metas, Vendas Comercial, Renovações, Acumulado
// ═══════════════════════════════════════════════════════════════════════════

const MESES_LABEL = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function getVendedoresAtivos() {
  const rows = db.prepare("SELECT username, first_name, last_name FROM admin_users WHERE is_vendedor = 1 ORDER BY first_name, last_name").all();
  return rows.map(r => r.username);
}

// Endpoint público (autenticado) para listar vendedores
app.get('/api/gestao/vendedores', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const rows = db.prepare("SELECT id, username, first_name, last_name, role, photo_url FROM admin_users WHERE is_vendedor = 1 ORDER BY first_name, last_name").all();
    res.json(rows);
  } catch (err) {
    internalError(res, err);
  }
});

// ─── METAS ───────────────────────────────────────────────────────────────
app.get('/api/gestao/metas', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const rows = db.prepare('SELECT * FROM metas_vendedor WHERE ano = ? ORDER BY vendedor_nome, mes').all(ano);
    res.json(rows);
  } catch (err) {
    internalError(res, err);
  }
});

app.put('/api/gestao/metas', requireRoles(['admin','gerente_comercial']), (req, res) => {
  try {
    const { vendedor_nome, ano, mes, valor_meta, valor_meta_recorrencia } = req.body;
    if (!vendedor_nome || !ano || !mes) return res.status(400).json({ error: 'Campos obrigatórios: vendedor_nome, ano, mes' });
    db.prepare(`
      INSERT INTO metas_vendedor (vendedor_nome, ano, mes, valor_meta, valor_meta_recorrencia, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (vendedor_nome, ano, mes) DO UPDATE SET valor_meta = ?, valor_meta_recorrencia = ?, updated_at = datetime('now')
    `).run(String(vendedor_nome), Number(ano), Number(mes), Number(valor_meta || 0), Number(valor_meta_recorrencia || 0), Number(valor_meta || 0), Number(valor_meta_recorrencia || 0));
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

app.put('/api/gestao/metas/batch', requireRoles(['admin','gerente_comercial']), (req, res) => {
  try {
    const { metas } = req.body; // [{vendedor_nome, ano, mes, valor_meta, valor_meta_recorrencia}]
    if (!Array.isArray(metas)) return res.status(400).json({ error: 'metas deve ser um array' });
    for (const m of metas) {
      db.prepare(`
        INSERT INTO metas_vendedor (vendedor_nome, ano, mes, valor_meta, valor_meta_recorrencia, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT (vendedor_nome, ano, mes) DO UPDATE SET valor_meta = ?, valor_meta_recorrencia = ?, updated_at = datetime('now')
      `).run(String(m.vendedor_nome), Number(m.ano), Number(m.mes), Number(m.valor_meta || 0), Number(m.valor_meta_recorrencia || 0), Number(m.valor_meta || 0), Number(m.valor_meta_recorrencia || 0));
    }
    res.json({ ok: true, count: metas.length });
  } catch (err) {
    internalError(res, err);
  }
});

// ─── VENDAS COMERCIAL (planilha mensal) ──────────────────────────────────
app.get('/api/gestao/vendas', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const mes = req.query.mes ? Number(req.query.mes) : null;
    const vendedor = req.query.vendedor || null;
    let sql = `SELECT * FROM vendas_comercial WHERE ano = ? AND UPPER(COALESCE(cliente,'')) NOT IN ('META BASE','HIPER META','META MÊS','META MES')`;
    const params = [ano];
    if (mes) { sql += ' AND mes = ?'; params.push(mes); }
    if (vendedor) { sql += ' AND vendedor_nome = ?'; params.push(vendedor); }
    sql += ' ORDER BY mes, vendedor_nome, data_venda';
    const rows = db.prepare(sql).all(...params);
    // Enrich linked vendas with etapas from venda_etapas (same as vendas page)
    const etapaStmt = db.prepare('SELECT etapa_key, etapa_label, emoji, confirmado_por, confirmado_at FROM venda_etapas WHERE venda_id = ? AND removido = 0');
    for (const row of rows) {
      if (row.venda_id) {
        row.etapas = etapaStmt.all(row.venda_id);
      }
    }
    res.json(rows);
  } catch (err) {
    internalError(res, err);
  }
});

app.post('/api/gestao/vendas', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const b = req.body;
    if (!b.cliente || !b.vendedor_nome || !b.ano || !b.mes) {
      return res.status(400).json({ error: 'Campos obrigatórios: cliente, vendedor_nome, ano, mes' });
    }
    const result = db.prepare(`
      INSERT INTO vendas_comercial
        (vendedor_nome, ano, mes, data_venda, cliente, cnpj, pontos_contratados,
         valor_mensal, total_contrato, qtde_parcelas, previsao_veiculacao,
         data_emissao_nf, vencimento_boletos, contato, email, obs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(b.vendedor_nome), Number(b.ano), Number(b.mes),
      b.data_venda || null, b.cliente, b.cnpj || null, b.pontos_contratados || null,
      Number(b.valor_mensal || 0), Number(b.total_contrato || 0), Number(b.qtde_parcelas || 1),
      b.previsao_veiculacao || null, b.data_emissao_nf || null, b.vencimento_boletos || null,
      b.contato || null, b.email || null, b.obs || null
    );
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    internalError(res, err);
  }
});

app.put('/api/gestao/vendas/:id', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const b = req.body;
    const id = Number(req.params.id);
    db.prepare(`
      UPDATE vendas_comercial SET
        vendedor_nome = ?, data_venda = ?, cliente = ?, cnpj = ?,
        pontos_contratados = ?, valor_mensal = ?, total_contrato = ?,
        qtde_parcelas = ?, previsao_veiculacao = ?, data_emissao_nf = ?,
        vencimento_boletos = ?, contato = ?, email = ?,
        status_contrato = ?, status_contrato_assinado = ?,
        status_conteudo = ?, status_checkin = ?,
        status_faturado = ?, status_excel_pastas = ?,
        obs = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      String(b.vendedor_nome || ''),
      b.data_venda || null, b.cliente || '', b.cnpj || null,
      b.pontos_contratados || null, Number(b.valor_mensal || 0),
      Number(b.total_contrato || 0), Number(b.qtde_parcelas || 1),
      b.previsao_veiculacao || null, b.data_emissao_nf || null,
      b.vencimento_boletos || null, b.contato || null, b.email || null,
      b.status_contrato ? 1 : 0, b.status_contrato_assinado ? 1 : 0,
      b.status_conteudo ? 1 : 0, b.status_checkin ? 1 : 0,
      b.status_faturado ? 1 : 0, b.status_excel_pastas ? 1 : 0,
      b.obs || null, id
    );
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

app.patch('/api/gestao/vendas/:id/status', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { field, value } = req.body;
    const ETAPA_KEYS = ['contrato_enviado','contrato_assinado','cobranca_material','material_recebido','veiculando'];
    // Mapping for manual vendas (no venda_id): etapa key → local boolean column
    const LOCAL_MAP = {
      'contrato_enviado': 'status_contrato',
      'contrato_assinado': 'status_contrato_assinado',
      'cobranca_material': 'status_conteudo',
      'material_recebido': 'status_checkin',
      'veiculando': 'status_faturado',
    };
    if (!ETAPA_KEYS.includes(field)) return res.status(400).json({ error: 'Campo inválido' });
    // Check if this vendas_comercial record is linked to a real venda
    const row = db.prepare('SELECT venda_id FROM vendas_comercial WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Venda não encontrada' });

    if (row.venda_id) {
      // Linked venda: toggle in venda_etapas
      const etapaLabel = ETAPAS_VENDA.find(e => e.key === field)?.label || field;
      const etapaEmoji = ETAPAS_VENDA.find(e => e.key === field)?.emoji || '';
      if (value) {
        db.prepare(`
          INSERT INTO venda_etapas (venda_id, etapa_key, etapa_label, emoji, confirmado_at, confirmado_por, removido)
          VALUES (?, ?, ?, ?, datetime('now'), 'gestao', 0)
          ON CONFLICT (venda_id, etapa_key) DO UPDATE SET removido = 0, confirmado_at = datetime('now'), confirmado_por = 'gestao'
        `).run(row.venda_id, field, etapaLabel, etapaEmoji);
      } else {
        db.prepare(`UPDATE venda_etapas SET removido = 1 WHERE venda_id = ? AND etapa_key = ?`).run(row.venda_id, field);
      }
    } else {
      // Manual venda: toggle local boolean column
      const col = LOCAL_MAP[field];
      if (col) {
        db.prepare(`UPDATE vendas_comercial SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`).run(value ? 1 : 0, id);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

app.delete('/api/gestao/vendas/:id', requireRoles(['admin','gerente_comercial']), (req, res) => {
  try {
    db.prepare('DELETE FROM vendas_comercial WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

// ─── RENOVAÇÕES ──────────────────────────────────────────────────────────
app.get('/api/gestao/renovacoes', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const mes = req.query.mes ? Number(req.query.mes) : null;
    let sql = 'SELECT * FROM renovacoes WHERE ano = ?';
    const params = [ano];
    if (mes) { sql += ' AND mes = ?'; params.push(mes); }
    sql += ' ORDER BY mes, cliente';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    internalError(res, err);
  }
});

app.post('/api/gestao/renovacoes', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const b = req.body;
    if (!b.cliente || !b.ano || !b.mes) return res.status(400).json({ error: 'Campos obrigatórios: cliente, ano, mes' });
    const result = db.prepare(`
      INSERT INTO renovacoes (ano, mes, cliente, cnpj, pontos, valor_mensal, status, vendedor_nome, obs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(b.ano), Number(b.mes), b.cliente, b.cnpj || null,
      b.pontos || null, Number(b.valor_mensal || 0),
      b.status || 'pendente', b.vendedor_nome ? String(b.vendedor_nome) : null,
      b.obs || null
    );
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    internalError(res, err);
  }
});

app.put('/api/gestao/renovacoes/:id', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const b = req.body;
    const id = Number(req.params.id);
    db.prepare(`
      UPDATE renovacoes SET
        cliente = ?, cnpj = ?, pontos = ?, valor_mensal = ?,
        status = ?, vendedor_nome = ?, obs = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      b.cliente || '', b.cnpj || null, b.pontos || null,
      Number(b.valor_mensal || 0), b.status || 'pendente',
      b.vendedor_nome ? String(b.vendedor_nome).toUpperCase() : null,
      b.obs || null, id
    );
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

app.delete('/api/gestao/renovacoes/:id', requireRoles(['admin','gerente_comercial']), (req, res) => {
  try {
    db.prepare('DELETE FROM renovacoes WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

// ─── ACUMULADO / DASHBOARD ──────────────────────────────────────────────
app.get('/api/gestao/acumulado', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();

    // Metas por vendedor/mês
    const metas = db.prepare('SELECT * FROM metas_vendedor WHERE ano = ? ORDER BY vendedor_nome, mes').all(ano);

    // Vendas realizadas agregadas por vendedor/mês
    const vendas = db.prepare(`
      SELECT vendedor_nome, mes,
             COUNT(*) as qtde_vendas,
             COALESCE(SUM(valor_mensal), 0) as total_mensal,
             COALESCE(SUM(total_contrato), 0) as total_contrato
      FROM vendas_comercial
      WHERE ano = ?
      GROUP BY vendedor_nome, mes
      ORDER BY vendedor_nome, mes
    `).all(ano);

    // Renovações agregadas por mês
    const renovacoes = db.prepare(`
      SELECT mes,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) as concluidas,
             SUM(CASE WHEN status != 'concluida' THEN 1 ELSE 0 END) as pendentes,
             COALESCE(SUM(valor_mensal), 0) as valor_total
      FROM renovacoes
      WHERE ano = ?
      GROUP BY mes
      ORDER BY mes
    `).all(ano);

    const vendedoresAtivos = getVendedoresAtivos();
    res.json({ ano, metas, vendas, renovacoes, vendedores: vendedoresAtivos, mesesLabel: MESES_LABEL });
  } catch (err) {
    internalError(res, err);
  }
});

// ─── IMPORT BULK (vendas + metas + renovacoes) ──────────────────────────
app.post('/api/gestao/import', requireRoles(['admin']), (req, res) => {
  try {
    const { vendas, metas, renovacoes } = req.body;
    let importedVendas = 0, importedMetas = 0, importedRenovacoes = 0;

    if (Array.isArray(vendas)) {
      const stmtV = db.prepare(`
        INSERT INTO vendas_comercial
          (vendedor_nome, ano, mes, data_venda, cliente, cnpj, pontos_contratados,
           valor_mensal, total_contrato, qtde_parcelas, previsao_veiculacao,
           data_emissao_nf, status_contrato, status_contrato_assinado,
           status_conteudo, status_checkin, status_faturado, status_excel_pastas, obs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of vendas) {
        if (!v.cliente || !v.vendedor_nome || !v.ano || !v.mes) continue;
        stmtV.run(
          v.vendedor_nome, Number(v.ano), Number(v.mes),
          v.data_venda || null, v.cliente, v.cnpj || null,
          v.pontos_contratados || null, Number(v.valor_mensal || 0),
          Number(v.total_contrato || 0), Number(v.qtde_parcelas || 1),
          v.previsao_veiculacao || null, v.data_emissao_nf || null,
          v.status_contrato ? 1 : 0, v.status_contrato_assinado ? 1 : 0,
          v.status_conteudo ? 1 : 0, v.status_checkin ? 1 : 0,
          v.status_faturado ? 1 : 0, v.status_excel_pastas ? 1 : 0,
          v.obs || null
        );
        importedVendas++;
      }
    }

    if (Array.isArray(metas)) {
      for (const m of metas) {
        if (!m.vendedor_nome || !m.ano || !m.mes) continue;
        db.prepare(`
          INSERT INTO metas_vendedor (vendedor_nome, ano, mes, valor_meta)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(vendedor_nome, ano, mes) DO UPDATE SET valor_meta = excluded.valor_meta, updated_at = datetime('now')
        `).run(m.vendedor_nome, Number(m.ano), Number(m.mes), Number(m.valor_meta || 0));
        importedMetas++;
      }
    }

    if (Array.isArray(renovacoes)) {
      const stmtR = db.prepare(`
        INSERT INTO renovacoes (ano, mes, cliente, pontos, valor_mensal, status, vendedor_nome, obs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of renovacoes) {
        if (!r.cliente || !r.ano || !r.mes) continue;
        stmtR.run(
          Number(r.ano), Number(r.mes), r.cliente, r.pontos || null,
          Number(r.valor_mensal || 0), r.status || 'pendente',
          r.vendedor_nome || null, r.obs || null
        );
        importedRenovacoes++;
      }
    }

    res.json({ ok: true, importedVendas, importedMetas, importedRenovacoes });
  } catch (err) {
    internalError(res, err);
  }
});

// ── Propostas Públicas ────────────────────────────────────────────────────────

// POST /api/proposta-publica/upload-image — upload de imagem de simulação (auth)
app.post('/api/proposta-publica/upload-image', resolveAuthenticatedUser, upload.fields([{ name: 'image', maxCount: 1 }]), (req, res) => {
  try {
    const file = req.files?.image?.[0];
    if (!file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    // Move o arquivo para a pasta proposal-images
    const ext = path.extname(file.filename) || '.png';
    const newName = `${randomUUID()}${ext}`;
    const newPath = path.join(proposalImagesPath, newName);
    fs.renameSync(file.path, newPath);
    res.json({ url: `/uploads/proposal-images/${newName}` });
  } catch (err) {
    internalError(res, err, 'Erro ao salvar imagem da simulação.');
  }
});

// GET /api/admin/propostas — listar todas as propostas públicas (admin/gerente)
app.get('/api/admin/propostas', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT pt.*, au.first_name, au.last_name, au.username AS creator_username
      FROM proposta_tokens pt
      LEFT JOIN admin_users au ON au.id = pt.created_by
      ORDER BY pt.created_at DESC
      LIMIT 500
    `).all();
    const propostas = rows.map(row => {
      let data = {};
      try { data = JSON.parse(row.proposta_data || '{}'); } catch { /* ignore */ }
      return {
        id: row.id,
        token: row.token,
        clientName: data.clientName || '',
        segmento: data.segmento || '',
        pointsCount: Array.isArray(data.points) ? data.points.length : 0,
        totalValue: data.pricingSummary?.totalComDesconto ?? data.totals?.valorTotal ?? 0,
        created_by_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.creator_username || '',
        created_at: row.created_at,
        expires_at: row.expires_at,
        viewed_at: row.viewed_at,
        approved_at: row.approved_at,
        approved_name: row.approved_name
      };
    });
    res.json({ propostas });
  } catch (err) {
    internalError(res, err, 'Erro ao listar propostas.');
  }
});

// DELETE /api/admin/propostas/:id — excluir proposta (admin/gerente)
app.delete('/api/admin/propostas/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const id = Number(req.params.id);
    // Remover imagens de simulação associadas
    const row = db.prepare('SELECT proposta_data FROM proposta_tokens WHERE id = ?').get(id);
    if (row) {
      try {
        const data = JSON.parse(row.proposta_data || '{}');
        if (Array.isArray(data.points)) {
          for (const p of data.points) {
            const imgUrl = p.proposalSimulationPreview || '';
            if (imgUrl.startsWith('/uploads/proposal-images/')) {
              const filePath = path.join(__dirname, imgUrl);
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
          }
        }
      } catch { /* ignore parse errors */ }
    }
    db.prepare('DELETE FROM proposta_tokens WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err, 'Erro ao excluir proposta.');
  }
});

// POST /api/proposta-publica — vendedor cria link público da proposta (auth)
app.post('/api/proposta-publica', resolveAuthenticatedUser, express.json({ limit: '2mb' }), (req, res) => {
  try {
    const { proposta_data, expires_days = 7, lead_id } = req.body || {};
    if (!proposta_data || typeof proposta_data !== 'object') {
      return res.status(400).json({ error: 'proposta_data é obrigatório.' });
    }
    const days = Math.min(Math.max(Number(expires_days) || 7, 1), 30);
    const token = randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    // Remove campos internos sensíveis antes de salvar
    const { custo_operacional, lucro_minimo_percentual, ...safeData } = proposta_data;
    if (safeData.points) {
      safeData.points = safeData.points.map(({ custo_operacional: _co, ...p }) => p);
    }

    const insertToken = db.prepare(`INSERT INTO proposta_tokens (token, proposta_data, expires_at, created_by)
                VALUES (?, ?, ?, ?)`).run(token, JSON.stringify(safeData), expiresAt, req.authUser.id);

    const leadId = Number(lead_id || 0);
    if (leadId > 0) {
      const leadExists = db.prepare('SELECT id FROM leads WHERE id = ?').get(leadId);
      if (leadExists) {
        db.prepare(`
          INSERT INTO lead_proposta_links (lead_id, proposta_tipo, proposta_token_id, etapa, observacao, created_by)
          VALUES (?, 'publica', ?, 'enviada', ?, ?)
        `).run(leadId, Number(insertToken.lastInsertRowid), 'Vínculo automático ao gerar link público da proposta.', req.authUser.id);

        db.prepare(`
          UPDATE leads
          SET status = CASE WHEN status = 'novo' THEN 'em_atendimento' ELSE status END,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(leadId);
      }
    }

    const origin = String(process.env.FRONTEND_ORIGINS || '').split(',')[0].trim()
      || `${req.protocol}://${req.get('host')}`;
    res.json({ token, url: `${origin}/p/${token}`, expires_at: expiresAt });
  } catch (err) {
    internalError(res, err);
  }
});

// GET /api/p/:token — cliente acessa proposta pública
app.get('/api/p/:token', (req, res) => {
  try {
    const token = String(req.params.token || '').replace(/[^a-f0-9]/g, '');
    if (!token) return res.status(400).json({ error: 'Token inválido.' });
    const row = db.prepare('SELECT * FROM proposta_tokens WHERE token = ?').get(token);
    if (!row) return res.status(404).json({ error: 'Proposta não encontrada ou expirada.' });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Este link expirou.' });
    }
    if (!row.viewed_at) {
      db.prepare("UPDATE proposta_tokens SET viewed_at = datetime('now') WHERE token = ?").run(token);
    }

    db.prepare(`
      UPDATE lead_proposta_links
      SET etapa = CASE WHEN etapa IN ('criada', 'enviada') THEN 'visualizada' ELSE etapa END,
          updated_at = datetime('now')
      WHERE proposta_tipo = 'publica' AND proposta_token_id = ?
    `).run(row.id);

    db.prepare(`
      UPDATE leads
      SET status = CASE WHEN status = 'novo' THEN 'em_atendimento' ELSE status END,
          updated_at = datetime('now')
      WHERE id IN (
        SELECT lead_id FROM lead_proposta_links WHERE proposta_tipo = 'publica' AND proposta_token_id = ?
      )
    `).run(row.id);

    res.json({
      ...JSON.parse(row.proposta_data),
      expires_at: row.expires_at,
      approved_at: row.approved_at,
      approved_name: row.approved_name
    });
  } catch (err) {
    internalError(res, err);
  }
});

// POST /api/p/:token/aprovar — cliente aprova a proposta
app.post('/api/p/:token/aprovar', express.json(), (req, res) => {
  try {
    const token = String(req.params.token || '').replace(/[^a-f0-9]/g, '');
    const nome = String(req.body?.nome || '').trim().slice(0, 120);
    if (!token) return res.status(400).json({ error: 'Token inválido.' });
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
    const row = db.prepare('SELECT * FROM proposta_tokens WHERE token = ?').get(token);
    if (!row) return res.status(404).json({ error: 'Proposta não encontrada.' });
    if (new Date(row.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirado.' });
    if (row.approved_at) return res.json({ ok: true, already: true });

    db.prepare("UPDATE proposta_tokens SET approved_at = datetime('now'), approved_name = ? WHERE token = ?").run(nome, token);

    db.prepare(`
      UPDATE lead_proposta_links
      SET etapa = 'aprovada',
          updated_at = datetime('now')
      WHERE proposta_tipo = 'publica' AND proposta_token_id = ?
    `).run(row.id);

    db.prepare(`
      UPDATE leads
      SET status = CASE WHEN status IN ('novo', 'em_atendimento') THEN 'em_atendimento' ELSE status END,
          updated_at = datetime('now')
      WHERE id IN (
        SELECT lead_id FROM lead_proposta_links WHERE proposta_tipo = 'publica' AND proposta_token_id = ?
      )
    `).run(row.id);

    // Notificação WhatsApp para o vendedor
    try {
      const settings = getEvolutionSettings();
      if (settings.evolution_api_url && settings.evolution_api_key && settings.evolution_dest_number) {
        const vendedor = db.prepare('SELECT first_name, last_name FROM admin_users WHERE id = ?').get(row.created_by);
        const vendedorNome = vendedor ? `${vendedor.first_name} ${vendedor.last_name}`.trim() : 'vendedor';
        const data = JSON.parse(row.proposta_data || '{}');
        const clienteNome = data.clientName || 'Cliente';
        const msg = `✅ *${nome}* aprovou a proposta de *${clienteNome}*!\n\nVendedor: ${vendedorNome}\nLink: /p/${token}`;
        sendEvolutionText({ apiUrl: settings.evolution_api_url, instance: settings.evolution_instance, apiKey: settings.evolution_api_key, number: settings.evolution_dest_number, text: msg }).catch(() => {});
      }
    } catch (_) { /* notificação não bloqueia resposta */ }

    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

// ── Navigation tracking (public) ──────────────────────────────────────────────
const VALID_EVENT_TYPES = new Set(['page_view', 'pdf_generate', 'slides_open', 'chatbot_open', 'chatbot_message', 'whatsapp_click', 'proposal_view', 'point_detail_view']);

app.post('/api/track', (req, res) => {
  try {
    const { sessionId, eventType, eventData, pageUrl } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string' || !VALID_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: 'Invalid tracking data.' });
    }
    db.prepare('INSERT INTO navigation_events (session_id, event_type, event_data, page_url) VALUES (?, ?, ?, ?)').run(
      sessionId.slice(0, 64), eventType, eventData ? JSON.stringify(eventData).slice(0, 2000) : null, (pageUrl || '').slice(0, 500)
    );
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err, 'Erro ao registrar evento.');
  }
});

// ── Lead capture (public) ─────────────────────────────────────────────────────
app.post('/api/leads/capture', (req, res) => {
  try {
    const { sessionId, telefone, empresa } = req.body || {};
    if (!sessionId || !telefone || !empresa) {
      return res.status(400).json({ error: 'sessionId, telefone e empresa são obrigatórios.' });
    }
    const cleanPhone = String(telefone).replace(/\D/g, '').slice(0, 15);
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Telefone inválido.' });
    }
    const result = db.prepare(
      `INSERT INTO leads (session_id, telefone, empresa) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET telefone = excluded.telefone, empresa = excluded.empresa, updated_at = datetime('now')`
    ).run(sessionId.slice(0, 64), cleanPhone, String(empresa).trim().slice(0, 200));
    try {
      db.prepare('UPDATE chat_sessions SET lead_captured = 1 WHERE id = ?').run(sessionId);
    } catch { /* session may not exist yet */ }
    res.json({ ok: true, leadId: result.lastInsertRowid || null });
  } catch (err) {
    internalError(res, err, 'Erro ao capturar lead.');
  }
});

app.get('/api/leads/check/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const lead = db.prepare('SELECT id, telefone, empresa FROM leads WHERE session_id = ?').get(sessionId);
    res.json({ captured: !!lead, telefone: lead?.telefone, empresa: lead?.empresa });
  } catch (err) {
    internalError(res, err, 'Erro ao verificar lead.');
  }
});

const LEAD_LINK_ETAPAS = new Set(['criada', 'enviada', 'visualizada', 'aprovada', 'convertida', 'perdida']);

app.post('/api/leads/:id/propostas/link', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const { proposta_tipo, proposta_id, proposta_token_id, token, etapa = 'enviada', observacao } = req.body || {};
    if (!['interna', 'publica'].includes(String(proposta_tipo || ''))) {
      return res.status(400).json({ error: 'proposta_tipo deve ser interna ou publica.' });
    }
    if (!LEAD_LINK_ETAPAS.has(String(etapa || ''))) {
      return res.status(400).json({ error: 'Etapa inválida.' });
    }

    const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    let propostaInternaId = null;
    let propostaTokenId = null;

    if (proposta_tipo === 'interna') {
      propostaInternaId = Number(proposta_id || 0);
      if (!propostaInternaId) return res.status(400).json({ error: 'proposta_id é obrigatório para proposta interna.' });
      const proposta = db.prepare('SELECT id FROM propostas WHERE id = ?').get(propostaInternaId);
      if (!proposta) return res.status(404).json({ error: 'Proposta interna não encontrada.' });
    } else {
      if (token) {
        const tokenRow = db.prepare('SELECT id FROM proposta_tokens WHERE token = ?').get(String(token).replace(/[^a-f0-9]/g, ''));
        if (!tokenRow) return res.status(404).json({ error: 'Token de proposta pública não encontrado.' });
        propostaTokenId = Number(tokenRow.id);
      } else {
        propostaTokenId = Number(proposta_token_id || 0);
        if (!propostaTokenId) return res.status(400).json({ error: 'proposta_token_id (ou token) é obrigatório para proposta pública.' });
        const propostaToken = db.prepare('SELECT id FROM proposta_tokens WHERE id = ?').get(propostaTokenId);
        if (!propostaToken) return res.status(404).json({ error: 'Proposta pública não encontrada.' });
      }
    }

    const existing = db.prepare(`
      SELECT id FROM lead_proposta_links
      WHERE lead_id = ?
        AND proposta_tipo = ?
        AND coalesce(proposta_id, 0) = ?
        AND coalesce(proposta_token_id, 0) = ?
      LIMIT 1
    `).get(leadId, proposta_tipo, Number(propostaInternaId || 0), Number(propostaTokenId || 0));

    let linkId;
    if (existing?.id) {
      db.prepare(`
        UPDATE lead_proposta_links
        SET etapa = ?, observacao = coalesce(?, observacao), updated_at = datetime('now')
        WHERE id = ?
      `).run(etapa, observacao || null, existing.id);
      linkId = existing.id;
    } else {
      const insert = db.prepare(`
        INSERT INTO lead_proposta_links (lead_id, proposta_tipo, proposta_id, proposta_token_id, etapa, observacao, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        leadId,
        proposta_tipo,
        propostaInternaId || null,
        propostaTokenId || null,
        etapa,
        String(observacao || '').trim().slice(0, 500) || null,
        req.authUser.id
      );
      linkId = Number(insert.lastInsertRowid || 0);
    }

    db.prepare(`
      UPDATE leads
      SET status = CASE WHEN status = 'novo' THEN 'em_atendimento' ELSE status END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(leadId);

    res.status(201).json({ ok: true, id: linkId });
  } catch (err) {
    internalError(res, err, 'Erro ao vincular proposta ao lead.');
  }
});

app.get('/api/leads/:id/propostas', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const links = db.prepare(`
      SELECT
        lpl.*,
        p.titulo AS proposta_titulo,
        p.status AS proposta_status,
        p.updated_at AS proposta_updated_at,
        pt.token AS proposta_token,
        pt.expires_at AS proposta_expires_at,
        pt.viewed_at AS proposta_viewed_at,
        pt.approved_at AS proposta_approved_at,
        pt.approved_name AS proposta_approved_name
      FROM lead_proposta_links lpl
      LEFT JOIN propostas p ON p.id = lpl.proposta_id
      LEFT JOIN proposta_tokens pt ON pt.id = lpl.proposta_token_id
      WHERE lpl.lead_id = ?
      ORDER BY lpl.updated_at DESC, lpl.id DESC
    `).all(leadId);

    res.json({ links });
  } catch (err) {
    internalError(res, err, 'Erro ao listar propostas do lead.');
  }
});

app.patch('/api/leads/:id/propostas/:linkId/etapa', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const linkId = Number(req.params.linkId);
    const { etapa, observacao } = req.body || {};
    if (!LEAD_LINK_ETAPAS.has(String(etapa || ''))) {
      return res.status(400).json({ error: 'Etapa inválida.' });
    }

    const link = db.prepare('SELECT * FROM lead_proposta_links WHERE id = ? AND lead_id = ?').get(linkId, leadId);
    if (!link) return res.status(404).json({ error: 'Vínculo não encontrado.' });

    db.prepare(`
      UPDATE lead_proposta_links
      SET etapa = ?, observacao = coalesce(?, observacao), updated_at = datetime('now')
      WHERE id = ?
    `).run(etapa, observacao || null, linkId);

    if (etapa === 'convertida') {
      db.prepare(`
        UPDATE leads
        SET status = 'convertido',
            proposta_vencedora_tipo = ?,
            proposta_vencedora_id = ?,
            proposta_vencedora_token_id = ?,
            convertido_em = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(link.proposta_tipo, link.proposta_id || null, link.proposta_token_id || null, leadId);
    } else if (['enviada', 'visualizada', 'aprovada'].includes(etapa)) {
      db.prepare(`
        UPDATE leads
        SET status = CASE WHEN status = 'novo' THEN 'em_atendimento' ELSE status END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(leadId);
    }

    res.json({ ok: true });
  } catch (err) {
    internalError(res, err, 'Erro ao atualizar etapa do vínculo.');
  }
});

app.post('/api/leads/:id/converter', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const { link_id, venda_id, notas } = req.body || {};
    const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    let winnerTipo = null;
    let winnerPropostaId = null;
    let winnerTokenId = null;

    if (Number(link_id || 0) > 0) {
      const link = db.prepare('SELECT * FROM lead_proposta_links WHERE id = ? AND lead_id = ?').get(Number(link_id), leadId);
      if (!link) return res.status(404).json({ error: 'Vínculo não encontrado.' });
      winnerTipo = link.proposta_tipo;
      winnerPropostaId = link.proposta_id || null;
      winnerTokenId = link.proposta_token_id || null;
      db.prepare("UPDATE lead_proposta_links SET etapa = 'convertida', updated_at = datetime('now') WHERE id = ?").run(link.id);
    }

    db.prepare(`
      UPDATE leads
      SET status = 'convertido',
          proposta_vencedora_tipo = coalesce(?, proposta_vencedora_tipo),
          proposta_vencedora_id = coalesce(?, proposta_vencedora_id),
          proposta_vencedora_token_id = coalesce(?, proposta_vencedora_token_id),
          venda_id = coalesce(?, venda_id),
          convertido_em = coalesce(convertido_em, datetime('now')),
          notas = coalesce(?, notas),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      winnerTipo,
      winnerPropostaId,
      winnerTokenId,
      Number(venda_id || 0) || null,
      String(notas || '').trim().slice(0, 1000) || null,
      leadId
    );

    res.json({ ok: true });
  } catch (err) {
    internalError(res, err, 'Erro ao converter lead.');
  }
});

// ── Leads admin (authenticated) ───────────────────────────────────────────────
app.get('/api/leads', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const { status, q, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    let where = '1=1';
    const params = [];
    if (status && status !== 'todos') { where += ' AND l.status = ?'; params.push(status); }
    if (q) { where += ' AND (l.empresa LIKE ? OR l.telefone LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const total = db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE ${where}`).get(...params).c;
    const leads = db.prepare(`
      SELECT l.*, (SELECT COUNT(*) FROM navigation_events ne WHERE ne.session_id = l.session_id) as event_count,
        (SELECT MAX(ne.created_at) FROM navigation_events ne WHERE ne.session_id = l.session_id) as last_event_at
      FROM leads l WHERE ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);
    res.json({ leads, total, page: Number(page) });
  } catch (err) {
    internalError(res, err, 'Erro ao listar leads.');
  }
});

app.get('/api/leads/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
    const events = db.prepare('SELECT * FROM navigation_events WHERE session_id = ? ORDER BY created_at ASC').all(lead.session_id);
    const links = db.prepare(`
      SELECT
        lpl.*,
        p.titulo AS proposta_titulo,
        p.status AS proposta_status,
        p.updated_at AS proposta_updated_at,
        pt.token AS proposta_token,
        pt.expires_at AS proposta_expires_at,
        pt.viewed_at AS proposta_viewed_at,
        pt.approved_at AS proposta_approved_at,
        pt.approved_name AS proposta_approved_name
      FROM lead_proposta_links lpl
      LEFT JOIN propostas p ON p.id = lpl.proposta_id
      LEFT JOIN proposta_tokens pt ON pt.id = lpl.proposta_token_id
      WHERE lpl.lead_id = ?
      ORDER BY lpl.updated_at DESC, lpl.id DESC
    `).all(req.params.id);
    res.json({ lead, events, links });
  } catch (err) {
    internalError(res, err, 'Erro ao buscar lead.');
  }
});

app.put('/api/leads/:id/status', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const { status, notas } = req.body || {};
    const validStatuses = ['novo', 'em_atendimento', 'convertido', 'descartado'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    db.prepare('UPDATE leads SET status = ?, notas = coalesce(?, notas), updated_at = datetime(\'now\') WHERE id = ?').run(status, notas || null, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err, 'Erro ao atualizar lead.');
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo excede o limite de 50MB.' });
    }
    console.error('[upload]', err.message);
    return res.status(400).json({ error: 'Erro de upload.' });
  }
  if (err?.message === 'Origem não permitida pelo CORS') {
    return res.status(403).json({ error: 'Origem não permitida.' });
  }
  if (err?.message) {
    console.error('[error-handler]', err.message);
    return res.status(400).json({ error: 'Requisição inválida.' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Intermidia Mídia Kit API running on port ${PORT}`);
  startLicenseWatcher().catch((err) => {
    console.error('[license] Watcher failed to start:', err.message);
    process.exit(1);
  });
  if (String(process.env.SQLITE_BACKUP_ENABLED || 'true').toLowerCase() !== 'false') {
    createBackupScheduler(db);
  } else {
    console.log('[backup] Automatic SQLite backup disabled by SQLITE_BACKUP_ENABLED=false');
  }
  const scheduler = startAutoRefreshScheduler();
  if (scheduler) {
    const config = getAutoRefreshConfig();
    console.log(`[entorno-auto] enabled. interval=${config.intervalMinutes}min radius=${config.radius}m`);
  } else {
    console.log('[entorno-auto] disabled by ENTORNO_AUTO_REFRESH_ENABLED=false');
  }

  // Agendador de mensagens (lembrete financeiro toda segunda 08:30)
  startScheduledMessages({ db, sendEvolutionText, getEvolutionSettings });
});
