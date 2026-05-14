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
const { ipKeyGenerator } = rateLimit;
const { z } = require('zod');
const XLSX = require('xlsx');
const { randomUUID, timingSafeEqual } = require('crypto');
const db = require('./database');
const cidadeFotosRouter = require('./routes/cidadeFotos');
const arteRouter          = require('./routes/arte');
const comercialChatRouter = require('./routes/comercialChat');
const geoRouter           = require('./routes/geo');
const aiRouter            = require('./routes/ai');
const aiService           = require('./services/aiService');
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
const { renderHtmlToPdfCompressed: renderHtmlToPdf, renderHtmlToScreenshot } = require('./pdfService');
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
  runJobSync,
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
const {
  DEFAULT_RADIUS_METERS: GOOGLE_HOURS_DEFAULT_RADIUS,
  assertConfigured: assertGoogleHoursConfigured,
  syncPointOperatingHours
} = require('./services/googleHoursSyncService');

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_filters (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT UNIQUE NOT NULL,
      filters_json    TEXT NOT NULL,
      label           TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      views           INTEGER DEFAULT 0,
      last_viewed_at  TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shared_filters_code ON shared_filters(code)`);

  // Column migrations — safe to ignore if already applied
  try { db.exec(`ALTER TABLE chat_sessions ADD COLUMN lead_captured INTEGER DEFAULT 0`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN proposta_vencedora_tipo TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN proposta_vencedora_id INTEGER`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN proposta_vencedora_token_id INTEGER`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN venda_id INTEGER`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN convertido_em TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN orcamento TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN origem TEXT`); } catch { /* exists */ }
  try { db.exec(`ALTER TABLE leads ADD COLUMN ultima_mensagem TEXT`); } catch { /* exists */ }
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
const POINT_NAME_LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function normalizeTextForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toPointTitleCase(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';

  let wordIndex = 0;
  return raw.split(/(\s+|-|\/)/).map((part) => {
    if (/^\s+$/.test(part) || part === '-' || part === '/') {
      return part;
    }

    return part.replace(/[A-Za-zÀ-ÿ0-9]+/g, (word) => {
      const lower = word.toLowerCase();
      const isRoman = /^(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i.test(word);
      const isFirstWord = wordIndex === 0;
      wordIndex += 1;

      if (/^\d+$/.test(word)) return word;
      if (isRoman) return lower.toUpperCase();
      if (!isFirstWord && POINT_NAME_LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
  }).join('');
}

function isElevadorTipo(tipo) {
  return normalizeTextForMatch(tipo).includes('elevador');
}

function normalizePointNameByType(nome, tipo) {
  const titled = toPointTitleCase(nome || '');
  if (!titled) return titled;

  if (!isElevadorTipo(tipo)) {
    return titled;
  }

  if (/(?:\bCondom[ií]nio\b|\bCond\.?(?=\s|$))/i.test(titled)) {
    const condensed = titled
      .replace(/(?:\bCondom[ií]nio\b|\bCond\.?(?=\s|$))/gi, 'Cond.')
      .replace(/^(?:Ed\.|Edif[ií]cio)\s+/i, '')
      .trim();
    return condensed;
  }

  if (/^Ed\.\s+/i.test(titled)) {
    return titled;
  }

  if (/^Edif[ií]cio\s+/i.test(titled)) {
    return titled.replace(/^Edif[ií]cio\s+/i, 'Ed. ');
  }

  return `Ed. ${titled}`;
}

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

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || req.connection?.remoteAddress || 'unknown';
  return ip.replace(/^::ffff:/, '');
}

function getRateLimitKey(req) {
  return ipKeyGenerator(getClientIp(req));
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
  keyGenerator: (req) => getRateLimitKey(req),
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
    const ip = getRateLimitKey(req);
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
  keyGenerator: (req) => getRateLimitKey(req),
  message: { error: 'Limite de geração de PDF atingido. Tente novamente em alguns minutos.' }
});

// Rate limiter mais generoso para rotas públicas (proposta, tracking, census)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_RATE_LIMIT_MAX || 3000),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRateLimitKey(req),
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
    if (err?.code === 'PDF_QUEUE_FULL') {
      res.set('Retry-After', '20');
      return res.status(503).json({ error: 'Fila de geração de PDF cheia. Tente novamente em instantes.' });
    }
    if (err?.code === 'PDF_RENDER_TIMEOUT') {
      return res.status(504).json({ error: 'Tempo limite ao gerar PDF. Tente novamente.' });
    }
    return res.status(500).json({ error: 'Erro ao gerar PDF.' });
  }
});

// Screenshot endpoint — renderiza uma unica pagina HTML como PNG (para editor visual)
// Se extractEditables=true, tambem extrai posicoes de [data-editable] via Puppeteer
// e retorna JSON { png: "data:image/png;base64,...", editables: [...] }
app.post('/api/pdf/screenshot', pdfRenderLimiter, express.json({ limit: '30mb' }), async (req, res) => {
  const { html, width, height, scale, extractEditables } = req.body || {};
  if (!html || typeof html !== 'string' || html.length < 10) {
    return res.status(400).json({ error: 'Parâmetro html obrigatório.' });
  }
  try {
    const result = await renderHtmlToScreenshot(html, {
      width: Number(width) || 1366,
      height: Number(height) || 768,
      scale: Number(scale) || 2,
      extractEditables: !!extractEditables,
    });

    if (extractEditables) {
      // JSON: base64 PNG + posicoes dos editaveis (medidos no mesmo Puppeteer)
      const base64Png = result.screenshot.toString('base64');
      return res.json({
        png: `data:image/png;base64,${base64Png}`,
        editables: result.editables || [],
      });
    } else {
      // Original: raw PNG buffer
      const pngBuffer = result.screenshot;
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': pngBuffer.length,
        'Cache-Control': 'no-store',
      });
      return res.end(pngBuffer);
    }
  } catch (err) {
    console.error('[pdf/screenshot] Erro:', err.message || err);
    return res.status(500).json({ error: 'Erro ao gerar screenshot.' });
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(compression({ threshold: 1024 }));
// Rotas públicas com limiter mais generoso (antes do apiLimiter geral)
app.use('/api/p', publicLimiter);
app.use('/api/share', publicLimiter);
app.use('/api/track', publicLimiter);
app.use('/api/census/profiles', publicLimiter);
app.use('/api/leads/check', publicLimiter);
// apiLimiter geral — skip rotas que já têm publicLimiter
const PUBLIC_PREFIXES = ['/api/p/', '/api/p', '/api/share', '/api/track', '/api/census/profiles', '/api/leads/check'];
app.use('/api', (req, res, next) => {
  const fullPath = req.originalUrl || req.url;
  if (PUBLIC_PREFIXES.some(prefix => fullPath.startsWith(prefix))) return next();
  return apiLimiter(req, res, next);
});

// ── Short URL para filtros compartilhados ────────────────────────────
function generateShortCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  const bytes = require('crypto').randomBytes(length);
  for (let i = 0; i < length; i++) code += chars[bytes[i] % chars.length];
  return code;
}

const shareLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { error: 'Limite de criação de links atingido.' } });

app.post('/api/share', shareLimiter, express.json({ limit: '16kb' }), (req, res) => {
  try {
    const { filters, label } = req.body || {};
    if (!filters || typeof filters !== 'object') {
      return res.status(400).json({ error: 'Filtros inválidos.' });
    }
    // Sanitiza — aceita arrays de strings, string de busca, e IDs de pontos (favoritos)
    const clean = {
      cidade: Array.isArray(filters.cidade) ? filters.cidade.filter(v => typeof v === 'string').slice(0, 20) : [],
      tipo: Array.isArray(filters.tipo) ? filters.tipo.filter(v => typeof v === 'string').slice(0, 10) : [],
      publico: Array.isArray(filters.publico) ? filters.publico.filter(v => typeof v === 'string').slice(0, 10) : [],
      elevador: Array.isArray(filters.elevador) ? filters.elevador.filter(v => typeof v === 'string').slice(0, 5) : [],
      q: typeof filters.q === 'string' ? filters.q.trim().slice(0, 100) : '',
      pointIds: Array.isArray(filters.pointIds) ? filters.pointIds.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0).slice(0, 200) : [],
    };
    const hasAny = clean.cidade.length || clean.tipo.length || clean.publico.length || clean.elevador.length || clean.q || clean.pointIds.length;
    if (!hasAny) return res.status(400).json({ error: 'Nenhum filtro selecionado.' });

    // Verifica se filtros idênticos já existem para reutilizar o code
    const filtersJson = JSON.stringify(clean);
    const existing = db.prepare('SELECT code FROM shared_filters WHERE filters_json = ?').get(filtersJson);
    if (existing) {
      return res.json({ code: existing.code, url: `/s/${existing.code}`, reused: true });
    }

    // Gera código único
    let code;
    for (let attempt = 0; attempt < 10; attempt++) {
      code = generateShortCode(attempt < 5 ? 6 : 8);
      const dup = db.prepare('SELECT id FROM shared_filters WHERE code = ?').get(code);
      if (!dup) break;
      if (attempt === 9) return res.status(500).json({ error: 'Falha ao gerar código único.' });
    }

    db.prepare('INSERT INTO shared_filters (code, filters_json, label) VALUES (?, ?, ?)').run(
      code, filtersJson, typeof label === 'string' ? label.trim().slice(0, 200) : null
    );

    res.json({ code, url: `/s/${code}` });
  } catch (err) {
    console.error('[share/create]', err.message);
    res.status(500).json({ error: 'Erro ao criar link compartilhável.' });
  }
});

app.get('/api/share/:code', (req, res) => {
  try {
    const { code } = req.params;
    if (!code || typeof code !== 'string' || code.length > 12) {
      return res.status(400).json({ error: 'Código inválido.' });
    }
    const row = db.prepare('SELECT code, filters_json, label, created_at, views FROM shared_filters WHERE code = ?').get(code);
    if (!row) return res.status(404).json({ error: 'Link não encontrado.' });

    // Incrementa views
    db.prepare("UPDATE shared_filters SET views = views + 1, last_viewed_at = datetime('now') WHERE code = ?").run(code);

    const filters = JSON.parse(row.filters_json);
    res.json({ code: row.code, filters, label: row.label, createdAt: row.created_at, views: row.views + 1 });
  } catch (err) {
    console.error('[share/get]', err.message);
    res.status(500).json({ error: 'Erro ao buscar link.' });
  }
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

function secureTokenEquals(candidate, expected) {
  const left = Buffer.from(String(candidate || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
  if (!left.length || !right.length || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function extractIntegrationToken(req) {
  const customHeader = String(req.headers['x-integration-token'] || '').trim();
  if (customHeader) return customHeader;

  const bearer = extractBearerToken(req.headers.authorization);
  if (bearer) return bearer;

  return String(req.query.token || '').trim();
}

function requireMaintenanceIntegrationToken(req, res, next) {
  const expectedToken = String(process.env.MANUTENCAO_SYNC_TOKEN || '').trim();
  if (!expectedToken) {
    return res.status(503).json({
      error: 'Integração indisponível: MANUTENCAO_SYNC_TOKEN não configurado.'
    });
  }

  const providedToken = extractIntegrationToken(req);
  if (!secureTokenEquals(providedToken, expectedToken)) {
    return res.status(401).json({ error: 'Token de integração inválido.' });
  }

  next();
}

function resolveAuthenticatedUser(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization) || extractTokenFromCookie(req);
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação obrigatório.' });
    }

    const claims = parseAuthToken(token);
    const user = db.prepare(`
      SELECT id, first_name, last_name, username, email, whatsapp, role, is_vendedor, photo_url
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
  // 'diretor' é um cargo sênior que herda os acessos de gerente_comercial e vendedor.
  const expanded = Array.isArray(roles) ? [...roles] : [];
  if ((expanded.includes('gerente_comercial') || expanded.includes('vendedor')) && !expanded.includes('diretor')) {
    expanded.push('diretor');
  }
  return (req, res, next) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Autenticação obrigatória.' });
    }
    if (!expanded.includes(req.authUser.role)) {
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
    '/tv',
    '/geo',
    '/ai/health',
    '/ai/stats',
    '/ai/point',
    '/leads/check',
    '/integracoes/manutencao/pontos'
  ];

  if (method === 'GET' && publicGetPrefixes.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))) {
    return next();
  }

  // AI campaign analysis + recommendation — public for /planejar
  const publicPostPaths = ['/ai/campaign', '/ai/recommend', '/ai/plan-decision', '/inventory-chat', '/ai/proposta-texto', '/track', '/leads/capture', '/leads/capture-contact', '/leads/last-message'];
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
// Hashed assets (JS/CSS) get 30-day cache (hash changes on every build).
// HTML files get no-cache to ensure browser always loads latest asset references.
app.use(express.static(frontendDistPath, {
  maxAge: '30d',
  etag: true,
  lastModified: true,
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
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

const POINT_IMPORT_ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);
const POINT_IMPORT_ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv'
]);

const uploadPointImport = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = String(path.extname(file?.originalname || '') || '').toLowerCase();
    const isAllowedExt = POINT_IMPORT_ALLOWED_EXTENSIONS.has(ext);
    const isAllowedMime = POINT_IMPORT_ALLOWED_MIME.has(String(file?.mimetype || '').toLowerCase());
    if (!isAllowedExt && !isAllowedMime) {
      cb(new Error('Arquivo inválido. Envie um Excel (.xlsx, .xls) ou CSV.'));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 20
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

const CHATBOT_PROPOSAL_TTL_DAYS = 7;

function normalizeChatbotText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function shouldGenerateProposalFromChat(message) {
  const normalized = normalizeChatbotText(message);
  const directRequest = /\b(quero\s+proposta|gerar\s+proposta|montar\s+proposta|proposta\s+comercial|pdf\s+da\s+proposta)\b/.test(normalized);
  const hasProposalWord = /\b(proposta|orcamento|planejamento|plano|pdf)\b/.test(normalized);
  const hasActionWord = /\b(gerar|gera|montar|monte|criar|crie|fazer|faca|quero|preciso|enviar|envia)\b/.test(normalized);
  return directRequest || (hasProposalWord && hasActionWord);
}

function parseBudgetValue(rawValue, { requireBudgetKeyword = false } = {}) {
  const source = String(rawValue || '').trim();
  if (!source) return null;

  const normalized = normalizeChatbotText(source);
  if (requireBudgetKeyword && !/\b(orcamento|budget|verba|invest|gastar|mensal|maximo|limite)\b/.test(normalized)) {
    return null;
  }

  const numberMatch = normalized.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+[.,]?\d*)/);
  if (!numberMatch) return null;

  let valueText = numberMatch[1].replace(/\s/g, '');
  if (valueText.includes('.') && valueText.includes(',')) {
    valueText = valueText.replace(/\./g, '').replace(',', '.');
  } else if (valueText.includes(',')) {
    valueText = valueText.replace(/\./g, '').replace(',', '.');
  } else {
    const thousandsPattern = /^\d{1,3}(?:\.\d{3})+$/;
    if (thousandsPattern.test(valueText)) {
      valueText = valueText.replace(/\./g, '');
    }
  }

  let value = Number(valueText);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (/\b(k|mil)\b/.test(normalized) && value < 1000) {
    value *= 1000;
  }

  if (value > 2_000_000) return null;
  return Math.round(value);
}

function inferCityFromMessage(message) {
  const normalized = normalizeChatbotText(message);
  try {
    const points = aiService.getEnrichedPoints();
    const knownCities = [...new Set(points.map((p) => String(p.cidade || '').trim()).filter(Boolean))];
    for (const city of knownCities) {
      if (normalized.includes(normalizeChatbotText(city))) {
        return city;
      }
    }
  } catch {
    return '';
  }
  return '';
}

const CHATBOT_SEGMENT_HINTS = [
  { key: 'clinica', regex: /\b(clinica|clinicas|odont|medic|saude)\b/ },
  { key: 'hospital', regex: /\b(hospital|hospitais)\b/ },
  { key: 'escola', regex: /\b(escola|colegio|colegios)\b/ },
  { key: 'faculdade', regex: /\b(faculdade|universidade|ensino\s+superior)\b/ },
  { key: 'construtora', regex: /\b(construtora|obra|obras|engenharia)\b/ },
  { key: 'imobiliaria', regex: /\b(imobiliaria|imovel|imoveis|corretor)\b/ },
  { key: 'varejo', regex: /\b(varejo|loja|lojas|comercio)\b/ },
  { key: 'restaurante', regex: /\b(restaurante|alimentacao|comida|bar|lanchonete)\b/ },
  { key: 'advocacia', regex: /\b(advocacia|advogado|juridico)\b/ },
  { key: 'contabilidade', regex: /\b(contabilidade|contador|fiscal)\b/ },
  { key: 'industria', regex: /\b(industria|industrial|fabrica)\b/ },
  { key: 'automotivo', regex: /\b(automotivo|concessionaria|mecanica|carro)\b/ },
  { key: 'fitness', regex: /\b(fitness|academia|treino)\b/ },
  { key: 'beleza', regex: /\b(beleza|estetica|salao|cosmetico)\b/ },
  { key: 'pet', regex: /\b(pet|veterinaria|veterinario)\b/ },
  { key: 'farmacia', regex: /\b(farmacia|drogaria)\b/ },
  { key: 'supermercado', regex: /\b(supermercado|mercado|atacarejo)\b/ },
  { key: 'financeiro', regex: /\b(financeiro|banco|credito|fintech)\b/ },
  { key: 'turismo', regex: /\b(turismo|hotel|hospedagem|viagem)\b/ },
  { key: 'coworking', regex: /\b(coworking|escritorio\s+compartilhado)\b/ },
  { key: 'tecnologia', regex: /\b(tecnologia|software|ti|startup)\b/ },
];

function inferSegmentFromMessage(message) {
  const normalized = normalizeChatbotText(message);
  for (const hint of CHATBOT_SEGMENT_HINTS) {
    if (hint.regex.test(normalized)) return hint.key;
  }
  return 'outro';
}

function inferObjectiveFromMessage(message) {
  const normalized = normalizeChatbotText(message);
  if (/\b(venda|conversao|lead|captacao|performance|resultado)\b/.test(normalized)) {
    return 'proximidade da decisao de compra';
  }
  if (/\b(premium|alto\s*padrao|luxo|sofisticado)\b/.test(normalized)) {
    return 'presenca premium';
  }
  if (/\b(cobertura|regional|abrangencia|cidade\s*toda)\b/.test(normalized)) {
    return 'cobertura regional';
  }
  if (/\b(lembranca|frequencia|recorrencia|constante)\b/.test(normalized)) {
    return 'lembranca continua';
  }
  return 'reconhecimento de marca';
}

function formatMoneyBR(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatIntBR(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function fetchPointsByIds(ids) {
  if (!ids.length) return new Map();
  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT id, nome, cidade, tipo, endereco, fluxo, preco, telas, insercoes,
             lat, lng, publico, tempo, loop, veiculacao, imagem, imagem2,
             simulacao_preview, foto_focal_point, disponibilidade
      FROM pontos
      WHERE ativo = 1 AND id IN (${placeholders})
    `).all(...ids);
    return new Map(rows.map((row) => [Number(row.id), row]));
  } catch {
    return new Map();
  }
}

function selectFallbackProposalPoints(cidade, budget) {
  const maxBudget = Math.max(Number(budget) || 10000, 3000);
  let candidates = [];
  try {
    candidates = aiService.getEnrichedPoints(cidade)
      .filter((p) => Number(p.preco) > 0 && Number(p.fluxo) > 0)
      .sort((a, b) => {
        const scoreA = Number(a.fluxo || 0) / Math.max(Number(a.preco || 0), 1);
        const scoreB = Number(b.fluxo || 0) / Math.max(Number(b.preco || 0), 1);
        return scoreB - scoreA;
      });
  } catch {
    return [];
  }

  const picked = [];
  let spend = 0;
  for (const point of candidates) {
    const price = Number(point.preco) || 0;
    if (!price) continue;

    // Always keep a minimum mix, then respect the envelope.
    if (picked.length < 3 || spend + price <= maxBudget * 1.2) {
      picked.push(point);
      spend += price;
    }
    if (picked.length >= 10) break;
  }
  return picked;
}

function normalizeProposalPoint(point, role, reason) {
  const preco = Number(point.precoFinal || point.preco || 0);
  const precoOriginal = Number(point.precoOriginal || point.preco || preco || 0);
  return {
    id: Number(point.id),
    nome: point.nome || `Ponto ${point.id}`,
    cidade: point.cidade || '',
    tipo: point.tipo || '',
    endereco: point.endereco || '',
    fluxo: Number(point.fluxo || 0),
    preco,
    precoOriginal,
    precoFinal: preco,
    telas: Number(point.telas || 0),
    insercoes: Number(point.insercoes || 0),
    lat: point.lat !== null && point.lat !== undefined ? Number(point.lat) : null,
    lng: point.lng !== null && point.lng !== undefined ? Number(point.lng) : null,
    publico: point.publico || '',
    tempo: point.tempo || '',
    loop: point.loop || '',
    veiculacao: point.veiculacao || '',
    imagem: point.imagem || '',
    imagem2: point.imagem2 || '',
    simulacao_preview: point.simulacao_preview || '',
    foto_focal_point: point.foto_focal_point || '',
    disponibilidade: point.disponibilidade || '',
    proposal_role: role || 'support',
    proposal_reason: reason || '',
  };
}

function buildPricingSummary(points) {
  const originalTotal = points.reduce((sum, p) => sum + (Number(p.precoOriginal || p.preco || 0)), 0);
  const finalTotal = points.reduce((sum, p) => sum + (Number(p.precoFinal || p.preco || 0)), 0);
  const discountTotal = Math.max(0, originalTotal - finalTotal);
  const discountPercent = originalTotal > 0 ? (discountTotal / originalTotal) * 100 : 0;
  return {
    hasDiscount: discountTotal > 0,
    originalTotal,
    discountTotal,
    finalTotal,
    discountPercent,
  };
}

async function maybeAttachChatbotProposal(req, originalMessage, chatResult) {
  if (!shouldGenerateProposalFromChat(originalMessage)) {
    return chatResult;
  }

  try {
    const sessionId = chatResult?.sessionId || null;
    if (!sessionId) {
      return {
        ...chatResult,
        response: `${chatResult.response}\n\nPosso gerar uma proposta comercial automatica para voce. Primeiro preciso do cadastro no chat (empresa e telefone) e da cidade alvo da campanha.`,
      };
    }

    let sessionState = {};
    try {
      const sessionRow = db.prepare('SELECT conversation_state FROM chat_sessions WHERE id = ?').get(sessionId);
      sessionState = JSON.parse(sessionRow?.conversation_state || '{}');
    } catch {
      sessionState = {};
    }

    const lead = db.prepare('SELECT id, empresa, orcamento FROM leads WHERE session_id = ?').get(sessionId);
    const cidade = chatResult?.entities?.cidades?.[0]
      || sessionState?.cidades?.[0]
      || inferCityFromMessage(originalMessage);

    if (!cidade) {
      return {
        ...chatResult,
        response: `${chatResult.response}\n\nPara gerar a proposta agora, me diga a cidade principal da campanha.`,
      };
    }

    const budget =
      parseBudgetValue(originalMessage, { requireBudgetKeyword: true })
      || Number(sessionState?.budget_hint || 0)
      || parseBudgetValue(lead?.orcamento || '')
      || 10000;

    const segmento = inferSegmentFromMessage(originalMessage);
    const objetivo = inferObjectiveFromMessage(originalMessage);

    let plan = null;
    try {
      plan = await aiService.aiPlanDecision({
        cidade,
        segmento,
        objetivo,
        budget,
        duration: 4,
        publico: 'A/B',
        empresa: lead?.empresa || '',
      });
    } catch (err) {
      console.warn('[inventory-chat] aiPlanDecision failed:', err.message);
    }

    const roleMap = plan?.point_roles || {};
    const reasonMap = plan?.point_reasons || {};
    let selectedPoints = Array.isArray(plan?.pontos) ? plan.pontos : [];
    if (selectedPoints.length < 2) {
      selectedPoints = selectFallbackProposalPoints(cidade, budget);
    }

    const orderedIds = [...new Set(
      selectedPoints
        .map((point) => Number(point.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )].slice(0, 12);

    if (orderedIds.length < 2) {
      return {
        ...chatResult,
        response: `${chatResult.response}\n\nAinda nao consegui montar uma proposta segura com os dados atuais. Me informe cidade, segmento e orcamento para eu gerar em seguida.`,
      };
    }

    const detailedPointsById = fetchPointsByIds(orderedIds);
    const selectedById = new Map(selectedPoints.map((point) => [Number(point.id), point]));

    const proposalPoints = orderedIds
      .map((id) => {
        const merged = { ...(selectedById.get(id) || {}), ...(detailedPointsById.get(id) || {}) };
        return normalizeProposalPoint(merged, roleMap[id], reasonMap[id]);
      })
      .filter((point) => Number.isFinite(point.id));

    if (proposalPoints.length < 2) {
      return {
        ...chatResult,
        response: `${chatResult.response}\n\nNao consegui finalizar a proposta agora. Tente novamente com a cidade e um orcamento estimado.`,
      };
    }

    const totals = proposalPoints.reduce((acc, point) => {
      acc.valorTotal += Number(point.precoFinal || point.preco || 0);
      acc.fluxoTotal += Number(point.fluxo || 0);
      acc.insercoesTotal += Number(point.insercoes || 0);
      return acc;
    }, { valorTotal: 0, fluxoTotal: 0, insercoesTotal: 0, cpmEstimado: 0 });
    totals.cpmEstimado = totals.fluxoTotal > 0 ? totals.valorTotal / (totals.fluxoTotal / 1000) : 0;

    const pricingSummary = buildPricingSummary(proposalPoints);
    const reasonLines = proposalPoints
      .filter((point) => point.proposal_reason)
      .slice(0, 5)
      .map((point) => `- ${point.nome}: ${point.proposal_reason}`);

    const strategicTopics = [
      `Objetivo central: ${objetivo}.`,
      `Praca priorizada: ${cidade}.`,
      `Mix sugerido: ${proposalPoints.length} pontos com equilibrio entre alcance e eficiencia de CPM.`,
      ...reasonLines,
    ].join('\n');

    const strategicText = [
      plan?.strategy_summary || '',
      `A campanha foi estruturada para maximizar presenca em ${cidade} dentro do orcamento informado.`,
      `Estimativa consolidada de ${formatIntBR(totals.fluxoTotal)} impactos por mes com CPM aproximado de ${formatMoneyBR(totals.cpmEstimado)}.`,
    ].filter(Boolean);

    const proposalData = {
      clientName: lead?.empresa || 'Cliente Intermidia',
      clientAddress: '',
      segmento,
      objetivo,
      strategicTopics,
      strategicText,
      points: proposalPoints,
      totals,
      pricingSummary,
    };

    const token = randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + CHATBOT_PROPOSAL_TTL_DAYS * 86400000).toISOString();

    const insertToken = db.prepare(`
      INSERT INTO proposta_tokens (token, proposta_data, expires_at, created_by)
      VALUES (?, ?, ?, ?)
    `).run(token, JSON.stringify(proposalData), expiresAt, req.authUser?.id || null);

    if (lead?.id) {
      db.prepare(`
        INSERT INTO lead_proposta_links (lead_id, proposta_tipo, proposta_token_id, etapa, observacao, created_by)
        VALUES (?, 'publica', ?, 'enviada', ?, ?)
      `).run(
        Number(lead.id),
        Number(insertToken.lastInsertRowid),
        'Proposta gerada automaticamente pelo chatbot de inventario.',
        req.authUser?.id || null
      );

      db.prepare(`
        UPDATE leads
        SET status = CASE WHEN status = 'novo' THEN 'em_atendimento' ELSE status END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(Number(lead.id));
    }

    const origin = String(process.env.FRONTEND_ORIGINS || '').split(',')[0].trim()
      || `${req.protocol}://${req.get('host')}`;
    const url = `${origin}/p/${token}`;

    const proposalNotice = [
      '✅ Proposta comercial preliminar gerada com sucesso.',
      `Campanha sugerida para ${cidade} com ${proposalPoints.length} pontos.`,
      `Investimento estimado: ${formatMoneyBR(totals.valorTotal)}/mes.`,
      `Fluxo estimado: ${formatIntBR(totals.fluxoTotal)} impactos/mes.`,
      `CPM estimado: ${formatMoneyBR(totals.cpmEstimado)}.`,
      '',
      'Acesse sua proposta:',
      url,
    ].join('\n');

    return {
      ...chatResult,
      response: `${chatResult.response}\n\n${proposalNotice}`,
      proposal: {
        token,
        url,
        expires_at: expiresAt,
        cidade,
        budget,
        points: proposalPoints.length,
        totals,
      },
    };
  } catch (err) {
    console.error('[inventory-chat][proposal]', err.message);
    return {
      ...chatResult,
      response: `${chatResult.response}\n\nTive uma falha ao montar a proposta automatica agora. Se quiser, tente novamente informando cidade e orcamento.`,
    };
  }
}

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
    const baseResult = await processInventoryChat(message.trim(), safeHistory, userId, safeSessionId);
    const result = await maybeAttachChatbotProposal(req, message.trim(), baseResult);
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

// ---------------------------------------------------------------------------
// Auto-calculate monthly insertions from horario + telas
// 1 insertion every 3 min = 20/hour. Monthly = avg_daily_hours * 20 * 30 * telas
// ---------------------------------------------------------------------------
const DAY_ORDER_CALC = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const PT_DAY_MAP_CALC = {
  'segunda-feira': 'segunda', 'segunda': 'segunda', 'seg': 'segunda',
  'terca-feira': 'terca', 'terça-feira': 'terca', 'terça': 'terca', 'terca': 'terca', 'ter': 'terca',
  'quarta-feira': 'quarta', 'quarta': 'quarta', 'qua': 'quarta',
  'quinta-feira': 'quinta', 'quinta': 'quinta', 'qui': 'quinta',
  'sexta-feira': 'sexta', 'sexta': 'sexta', 'sex': 'sexta',
  'sabado': 'sabado', 'sab': 'sabado',
  'domingo': 'domingo', 'dom': 'domingo',
};
const EN_DAY_MAP_CALC = {
  mo: 'segunda', tu: 'terca', we: 'quarta', th: 'quinta', fr: 'sexta', sa: 'sabado', su: 'domingo',
};

function normDayCalc(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return PT_DAY_MAP_CALC[s] || EN_DAY_MAP_CALC[s] || null;
}

function cleanTimeCalc(t) {
  return String(t || '')
    .replace(/(\d{1,2})h(\d{2})/gi, '$1:$2')
    .replace(/(\d{1,2})h(?!\d)/gi, '$1:00')
    .replace(/\./g, ':')
    .replace(/\s*[-–—]\s*/g, '–')
    .replace(/\s*às\s*/gi, '–')
    .trim();
}

function parseTimeRangeHours(t) {
  t = cleanTimeCalc(t);
  const ranges = [...t.matchAll(/(\d{1,2}):(\d{2})\s*–\s*(\d{1,2}):(\d{2})/g)];
  let total = 0;
  for (const m of ranges) {
    let start = parseInt(m[1]) + parseInt(m[2]) / 60;
    let end = parseInt(m[3]) + parseInt(m[4]) / 60;
    if (end <= start) end += 24;
    total += (end - start);
  }
  return total;
}

function expandOsmDaysCalc(spec) {
  const en = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  const rm = spec.toLowerCase().match(/^(\w{2})\s*-\s*(\w{2})$/);
  if (rm) {
    const si = en.indexOf(rm[1]), ei = en.indexOf(rm[2]);
    if (si >= 0 && ei >= 0) return en.slice(si, ei + 1).map(d => EN_DAY_MAP_CALC[d]);
  }
  return spec.split(',').map(d => normDayCalc(d.trim())).filter(Boolean);
}

function parseHorarioToDayHours(horario) {
  const raw = String(horario || '').trim();
  if (!raw || raw === '-') return null;
  if (/^24\s*h/i.test(raw) || raw === '24/7') {
    return Object.fromEntries(DAY_ORDER_CALC.map(d => [d, 24]));
  }
  if (/^\d{1,2}([:.h]\d{2}|h(?!\d))\s*(às|–|-|a)\s*\d{1,2}([:.h]\d{2}|h(?!\d))$/i.test(raw)) {
    const h = parseTimeRangeHours(raw);
    return h > 0 ? Object.fromEntries(DAY_ORDER_CALC.map(d => [d, h])) : null;
  }
  const dayHours = {};
  // Google weekday_text
  if (raw.includes('|') && /feira|segunda|terca|terça|quarta|quinta|sexta|sabado|domingo/i.test(raw)) {
    for (const entry of raw.split('|').map(s => s.trim()).filter(Boolean)) {
      const m = entry.match(/^([^:]+):\s*(.+)$/);
      if (m) { const d = normDayCalc(m[1]); if (d) dayHours[d] = (dayHours[d] || 0) + parseTimeRangeHours(m[2]); }
    }
    if (Object.keys(dayHours).length > 0) return dayHours;
  }
  // OSM
  if (/;/.test(raw) && /\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/i.test(raw)) {
    for (const part of raw.split(';').map(s => s.trim()).filter(Boolean)) {
      if (/24\s*\/?\s*7/i.test(part)) return Object.fromEntries(DAY_ORDER_CALC.map(d => [d, 24]));
      const m = part.match(/^([A-Za-z, -]+)\s+(.+)$/);
      if (m) { const h = parseTimeRangeHours(m[2]); for (const d of expandOsmDaysCalc(m[1].trim())) if (d) dayHours[d] = (dayHours[d] || 0) + h; }
    }
    if (Object.keys(dayHours).length > 0) return dayHours;
  }
  // Generic multiline
  const lines = raw.split(/[|\n]/).map(s => s.trim()).filter(Boolean);
  let lastDay = null;
  for (const line of lines) {
    const rm = line.match(/([\w\u00e7\u00e3\u00e1\u00e0-]+)\s*(?:a|à|até)\s*([\w\u00e7\u00e3\u00e1\u00e0-]+)\s*[:,-]?\s*(.+)/i);
    if (rm) {
      const sd = normDayCalc(rm[1]), ed = normDayCalc(rm[2]);
      if (sd && ed) {
        const si = DAY_ORDER_CALC.indexOf(sd), ei = DAY_ORDER_CALC.indexOf(ed);
        if (si >= 0 && ei >= 0) { const h = parseTimeRangeHours(rm[3]); for (let i = si; i <= ei; i++) dayHours[DAY_ORDER_CALC[i]] = (dayHours[DAY_ORDER_CALC[i]] || 0) + h; lastDay = null; continue; }
      }
    }
    let foundDay = null, timeStr = '';
    const tabParts = line.split(/\t/);
    if (tabParts.length >= 2) { const d = normDayCalc(tabParts[0]); if (d) { foundDay = d; timeStr = tabParts.slice(1).join(' ').trim(); } }
    if (!foundDay) {
      const nl = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (const [pat, dk] of Object.entries(PT_DAY_MAP_CALC)) {
        const np = pat.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (nl.includes(np)) { foundDay = dk; timeStr = nl.replace(np, '').replace(/^[\s:,\-–—\t]+/, '').trim(); break; }
      }
    }
    if (foundDay) { lastDay = foundDay; if (timeStr && /\d/.test(timeStr)) dayHours[foundDay] = (dayHours[foundDay] || 0) + parseTimeRangeHours(timeStr); }
    else if (lastDay && /\d{1,2}[:.]\d{2}/.test(line)) dayHours[lastDay] = (dayHours[lastDay] || 0) + parseTimeRangeHours(line);
  }
  return Object.keys(dayHours).length > 0 ? dayHours : null;
}

function calcInsercoesMensal(horario, telas) {
  telas = Math.max(parseInt(telas) || 1, 1);
  const dayHours = parseHorarioToDayHours(horario);
  if (!dayHours) return null;
  const weeklyTotal = DAY_ORDER_CALC.reduce((sum, d) => sum + (dayHours[d] || 0), 0);
  const dailyAvg = weeklyTotal / 7;
  return Math.round(dailyAvg * 20 * 30 * telas);
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

  const normalizedName = normalizePointNameByType(row.nome, row.tipo);
  const normalizedOwnerTag = normalizePointOwnerTag(row.owner_tag);

  return {
    ...row,
    nome: normalizedName || row.nome,
    owner_tag: normalizedOwnerTag,
    foto_focal_point: normalizeFotoFocalPoint(row.foto_focal_point),
    pdf_image_source: normalizePdfImageSource(row.pdf_image_source),
    audience_tags: normalizeAudienceTagsInput(row.audience_tags, row.publico),
    availability_calendar: normalizeAvailabilityCalendarInput(row.availability_calendar, row.horario)
  };
}

function normalizePointOwnerTag(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Intermídia';
  return raw.slice(0, 120);
}

function stripInternalPointFields(point) {
  if (!point || typeof point !== 'object') return point;
  const { owner_tag, ...publicPoint } = point;
  return publicPoint;
}

// One-time normalization pass at startup to keep persisted point names consistent
try {
  const rows = db.prepare('SELECT id, nome, tipo FROM pontos').all();
  if (rows.length > 0) {
    const updateNameStmt = db.prepare('UPDATE pontos SET nome = ? WHERE id = ?');
    let renamed = 0;
    for (const row of rows) {
      const normalizedName = normalizePointNameByType(row.nome, row.tipo);
      if (normalizedName && normalizedName !== row.nome) {
        updateNameStmt.run(normalizedName, row.id);
        renamed += 1;
      }
    }
    if (renamed > 0) {
      console.log(`[pontos] normalização de nomes aplicada: ${renamed} registro(s).`);
    }
  }
} catch (normalizeErr) {
  console.warn('[pontos] falha na normalização de nomes:', normalizeErr.message);
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

const POINT_IMPORT_TEMPLATE_COLUMNS = [
  { key: 'nome', label: 'nome *', sample: 'Ed. Exemplo Centro' },
  { key: 'cidade', label: 'cidade *', sample: 'Londrina' },
  { key: 'tipo', label: 'tipo *', sample: 'Elevador' },
  { key: 'endereco', label: 'endereco *', sample: 'Av. Higienopolis, 1234' },
  { key: 'horario', label: 'horario *', sample: '06:00 as 22:00' },
  { key: 'fluxo', label: 'fluxo *', sample: 30000 },
  { key: 'telas', label: 'telas *', sample: 2 },
  { key: 'preco', label: 'preco *', sample: 1200 },
  { key: 'publico', label: 'publico *', sample: 'A/B' },
  { key: 'owner_tag', label: 'owner_tag', sample: 'Intermídia' },
  { key: 'tempo', label: 'tempo', sample: '15s' },
  { key: 'loop', label: 'loop', sample: '3 min' },
  { key: 'veiculacao', label: 'veiculacao', sample: 'Video sem audio' },
  { key: 'insercoes', label: 'insercoes', sample: '' },
  { key: 'elevador_categoria', label: 'elevador_categoria', sample: 'Comercial' },
  { key: 'lat', label: 'lat', sample: -23.3119 },
  { key: 'lng', label: 'lng', sample: -51.1675 },
  { key: 'descricao', label: 'descricao', sample: 'Ponto de alta circulacao.' },
  { key: 'arte_largura', label: 'arte_largura_px', sample: ELEVADOR_ARTE_LARGURA },
  { key: 'arte_altura', label: 'arte_altura_px', sample: ELEVADOR_ARTE_ALTURA },
  { key: 'tipo_fluxo', label: 'tipo_fluxo', sample: 'pessoas' },
  { key: 'midia_largura_m', label: 'midia_largura_m', sample: '' },
  { key: 'midia_altura_m', label: 'midia_altura_m', sample: '' },
  { key: 'disponibilidade', label: 'disponibilidade', sample: 'disponivel' }
];

const POINT_IMPORT_HEADER_ALIASES = {
  nome: ['nome'],
  cidade: ['cidade'],
  tipo: ['tipo'],
  endereco: ['endereco'],
  horario: ['horario'],
  fluxo: ['fluxo'],
  telas: ['telas'],
  preco: ['preco'],
  publico: ['publico'],
  owner_tag: ['owner_tag', 'proprietario', 'empresa_proprietaria'],
  tempo: ['tempo'],
  loop: ['loop'],
  veiculacao: ['veiculacao'],
  insercoes: ['insercoes'],
  elevador_categoria: ['elevador_categoria'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'longitude'],
  descricao: ['descricao'],
  arte_largura: ['arte_largura_px', 'arte_largura'],
  arte_altura: ['arte_altura_px', 'arte_altura'],
  tipo_fluxo: ['tipo_fluxo'],
  midia_largura_m: ['midia_largura_m'],
  midia_altura_m: ['midia_altura_m'],
  disponibilidade: ['disponibilidade']
};

function normalizeImportHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function importCellToString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return repairMojibake(String(value).trim());
}

// Tenta detectar e corrigir mojibake clássico (UTF-8 lido como Latin-1/CP1252).
// Chamado em todos os valores vindos de importações de planilha — barreira
// final caso a leitura do arquivo tenha decodificado com a codepage errada.
function repairMojibake(text) {
  if (!text || typeof text !== 'string') return text;
  // Heurística: só roda se houver padrão típico de mojibake.
  if (!/Ã[\u0080-\u00BF]|Â[\u00A0-\u00BF]|â\u0080[\u0080-\u00BF]/.test(text)) {
    return text;
  }
  try {
    // text é UTF-8 que originalmente eram bytes UTF-8 lidos como Latin-1.
    // Reinterpretamos: pegamos cada code-point como byte e decodamos como UTF-8.
    const bytes = Buffer.from(text, 'latin1');
    const repaired = bytes.toString('utf8');
    // Aceita só se não introduzir caractere de substituição.
    if (!repaired.includes('\uFFFD')) return repaired;
  } catch {
    // ignore
  }
  return text;
}

function normalizeImportRow(rawRow = {}) {
  const normalized = {};
  Object.entries(rawRow).forEach(([rawKey, rawValue]) => {
    const key = normalizeImportHeaderKey(rawKey);
    if (!key) return;
    normalized[key] = rawValue;
  });
  return normalized;
}

function pickImportValue(row = {}, aliases = []) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return '';
}

function parseImportInteger(value, fallback = 0) {
  const parsed = Math.round(parseCurrencyLike(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseImportPhysicalSize(value, fallback = null) {
  return normalizePhysicalSizeMeters(importCellToString(value), fallback);
}

function buildPointImportTemplateBuffer() {
  const headers = POINT_IMPORT_TEMPLATE_COLUMNS.map((column) => column.label);
  const sampleRow = POINT_IMPORT_TEMPLATE_COLUMNS.map((column) => column.sample ?? '');

  const mainSheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  mainSheet['!cols'] = headers.map((label) => ({ wch: Math.max(14, String(label || '').length + 4) }));

  const instructionRows = [
    ['Instrucoes de preenchimento'],
    ['1) Preencha uma linha por ponto. Campos com * sao obrigatorios.'],
    ['2) Nao e necessario preencher foto/imagem no Excel. A foto pode ser enviada depois no sistema.'],
    ['3) Para Elevador, use elevador_categoria: Comercial ou Residencial.'],
    ['4) Para Backlight/Frontlight, voce pode informar midia_largura_m, midia_altura_m e disponibilidade.'],
    ['5) Formatos aceitos no import: .xlsx, .xls ou .csv (cabecalho na primeira linha).']
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);
  instructionSheet['!cols'] = [{ wch: 130 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, mainSheet, 'Pontos');
  XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instrucoes');

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}

// ==================== API ROUTES ====================

// Integração Manutenções: exporta pontos para consumo entre projetos na mesma VPS.
// Autenticação: header x-integration-token (ou Bearer) com MANUTENCAO_SYNC_TOKEN.
app.get('/api/integracoes/manutencao/pontos', requireMaintenanceIntegrationToken, (req, res) => {
  const cidades = parseOptionalValues(req.query.cidade);
  const tipos = parseOptionalValues(req.query.tipo);
  const incluirInativos = ['1', 'true', 'sim', 'yes'].includes(String(req.query.incluir_inativos || '').trim().toLowerCase());
  const sqlParts = ['SELECT * FROM pontos WHERE 1=1'];
  const params = [];

  if (!incluirInativos) {
    sqlParts.push(' AND ativo = 1');
  }

  appendMultiFilter(sqlParts, params, 'cidade', cidades);
  appendMultiFilter(sqlParts, params, 'tipo', tipos);
  sqlParts.push(' ORDER BY cidade, nome');

  try {
    const pontos = db.prepare(sqlParts.join('')).all(...params).map(hydratePontoRow);
    res.json({
      generated_at: new Date().toISOString(),
      total: pontos.length,
      pontos
    });
  } catch (err) {
    internalError(res, err);
  }
});

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
    // Case-insensitive search compatible with PostgreSQL (LIKE is case-sensitive in PG).
    sqlParts.push(' AND (LOWER(nome) LIKE LOWER(?) OR LOWER(endereco) LIKE LOWER(?) OR LOWER(descricao) LIKE LOWER(?))');
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
    const pontos = db.prepare(sqlParts.join('')).all(...params).map(hydratePontoRow).map(stripInternalPointFields);
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
    res.json(stripInternalPointFields(hydratePontoRow(ponto)));
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

// Sync operating hours from Google Places (strictly from source data, no invented values)
app.post('/api/admin/pontos/sync-hours/google', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    assertGoogleHoursConfigured();

    const body = req.body || {};
    const dryRun = String(body.dryRun ?? 'true').toLowerCase() !== 'false';
    const overwrite = String(body.overwrite ?? 'false').toLowerCase() === 'true';
    const limit = Math.max(1, Math.min(300, Number(body.limit) || 60));
    const radiusMeters = Math.max(80, Math.min(1000, Number(body.radiusMeters) || GOOGLE_HOURS_DEFAULT_RADIUS));
    const confidenceThreshold = Math.max(0.45, Math.min(0.95, Number(body.confidenceThreshold) || 0.56));
    const sourceRaw = String(body.source || 'auto').toLowerCase();
    const source = ['auto', 'google', 'osm'].includes(sourceRaw) ? sourceRaw : 'auto';
    const pointIds = Array.isArray(body.pointIds)
      ? body.pointIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
    const city = String(body.city || '').trim();

    const sql = ['SELECT * FROM pontos WHERE ativo = 1'];
    const params = [];

    if (!overwrite) {
      sql.push(" AND (horario IS NULL OR trim(horario) = '' OR lower(horario) = '24 horas' OR lower(horario) = '06:00 às 22:00')");
    }
    if (city) {
      sql.push(' AND cidade = ?');
      params.push(city);
    }
    if (pointIds.length) {
      const placeholders = pointIds.map(() => '?').join(', ');
      sql.push(` AND id IN (${placeholders})`);
      params.push(...pointIds);
    }
    sql.push(' ORDER BY cidade, nome LIMIT ?');
    params.push(limit);

    const rows = db.prepare(sql.join('')).all(...params);
    const processed = [];
    let updated = 0;

    for (const point of rows) {
      try {
        const result = await syncPointOperatingHours({
          point,
          radiusMeters,
          dryRun,
          confidenceThreshold,
          source
        });

        if (result.ok && !dryRun) {
          db.prepare('UPDATE pontos SET horario = ? WHERE id = ?').run(result.newHours, point.id);
          updated += 1;
        }

        processed.push({ id: point.id, nome: point.nome, cidade: point.cidade, ...result });
      } catch (err) {
        processed.push({
          id: point.id,
          nome: point.nome,
          cidade: point.cidade,
          ok: false,
          reason: 'sync_error',
          error: err?.message || 'unknown error'
        });
      }
    }

    const okCount = processed.filter((item) => item.ok).length;
    const withMatch = processed.filter((item) => item.match).length;
    res.json({
      dryRun,
      overwrite,
      source,
      selected: rows.length,
      matched: withMatch,
      validHours: okCount,
      updated,
      radiusMeters,
      confidenceThreshold,
      results: processed
    });
  } catch (err) {
    const message = String(err?.message || '');
    if (
      message.includes('GOOGLE_PLACES_API_KEY')
      || message.includes('GOOGLE_MAPS_API_KEY')
      || message.includes('GOOGLE_API_KEY')
      || message.includes('GMAPS_API_KEY')
    ) {
      console.error('[error]', message);
      return res.status(400).json({ error: message });
    }
    internalError(res, err, 'Erro ao sincronizar horarios via Google Places.');
  }
});

// ── Public Monitor API (auditoria de loop) ───────────────────────────────────
const openCors = cors(getMonitorCorsOptions());
const monitorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.MONITOR_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRateLimitKey(req),
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

const ORIGIN_CONTRACT_DEFAULT_BASE = 'https://sistema.redeintermidia.com';
const CONTRACT_SCRAPE_MONTH_OFFSETS = [0, 1, 2, -1];
const CONTRACT_CACHE_TTL_MS = 5 * 60 * 1000;
let _originContractCookie = '';
let _originContractCache = null;
let _originContractCacheAt = 0;

function getAppSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(String(key || ''));
  const value = row?.value;
  return value == null || value === '' ? fallback : String(value);
}

function parseSetCookieHeader(setCookieRaw) {
  if (!setCookieRaw) return '';
  if (Array.isArray(setCookieRaw)) {
    return setCookieRaw.map((v) => String(v).split(';')[0]).join('; ');
  }
  const first = String(setCookieRaw).split(',').map((v) => v.trim())[0] || '';
  return first.split(';')[0] || '';
}

function resolveOriginContractConfig() {
  const base = getAppSetting('origin_base', process.env.ORIGIN_BASE || ORIGIN_CONTRACT_DEFAULT_BASE);
  const user = getAppSetting('origin_user', process.env.ORIGIN_USER || '');
  const pass = getAppSetting('origin_pass', process.env.ORIGIN_PASS || '');
  let normalizedBase = String(base || ORIGIN_CONTRACT_DEFAULT_BASE).trim();
  if (!/^https?:\/\//i.test(normalizedBase)) {
    normalizedBase = `https://${normalizedBase}`;
  }
  normalizedBase = normalizedBase.replace(/\/+$/, '');
  if (/\/premium$/i.test(normalizedBase)) {
    normalizedBase = normalizedBase.replace(/\/premium$/i, '');
  }
  return {
    base: normalizedBase || ORIGIN_CONTRACT_DEFAULT_BASE,
    user: String(user || '').trim(),
    pass: String(pass || '').trim()
  };
}

async function originContractLogin() {
  const cfg = resolveOriginContractConfig();
  if (!cfg.base || !cfg.user || !cfg.pass) {
    return { ok: false, reason: 'Credenciais ORIGIN não configuradas.' };
  }

  const loginPageResp = await fetch(`${cfg.base}/login`, {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'text/html,*/*' }
  });
  if (!loginPageResp.ok && loginPageResp.status !== 302) {
    return { ok: false, reason: `Falha ao abrir login origem: HTTP ${loginPageResp.status}` };
  }

  const sessionCookie = parseSetCookieHeader(loginPageResp.headers.get('set-cookie'));
  if (!sessionCookie) {
    return { ok: false, reason: 'Origem não retornou cookie de sessão.' };
  }

  const body = new URLSearchParams();
  body.set('login', cfg.user);
  body.set('senha', cfg.pass);

  await fetch(`${cfg.base}/login/verifica`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie,
      Accept: 'text/html,*/*'
    },
    body: body.toString()
  });

  _originContractCookie = sessionCookie;
  return { ok: true };
}

function parseContractDateToIso(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function parseContractPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const raw = payload?.contratos_vencer?.lista || payload?.contratos_vencer || payload?.lista || payload?.data?.lista || [];
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const expirationDate = parseContractDateToIso(item?.data_final || item?.vencimento || item?.expirationDate);
    if (!expirationDate) return null;
    return {
      advertiser: String(item?.cliente || item?.anunciante || '').trim(),
      expirationDate,
      value: Number.parseFloat(item?.valor_parcela || item?.valor || item?.value || 0) || 0,
      vendorName: String(item?.vendedor || item?.vendorName || 'N/A').trim() || 'N/A',
      daysRemaining: Number.parseInt(item?.dias, 10) || 0
    };
  }).filter((item) => item && item.advertiser);
}

async function fetchContractsFromOrigin({ force = false } = {}) {
  const now = Date.now();
  if (!force && _originContractCache && (now - _originContractCacheAt) < CONTRACT_CACHE_TTL_MS) {
    return _originContractCache;
  }

  const cfg = resolveOriginContractConfig();
  if (!cfg.base || !cfg.user || !cfg.pass) {
    const empty = { items: [], warning: 'Credenciais ORIGIN não configuradas.' };
    _originContractCache = empty;
    _originContractCacheAt = Date.now();
    return empty;
  }

  if (!_originContractCookie) {
    const login = await originContractLogin();
    if (!login.ok) {
      const empty = { items: [], warning: login.reason || 'Falha no login da origem.' };
      _originContractCache = empty;
      _originContractCacheAt = Date.now();
      return empty;
    }
  }

  const unique = new Map();
  for (const offset of CONTRACT_SCRAPE_MONTH_OFFSETS) {
    const ref = new Date();
    ref.setDate(1);
    ref.setMonth(ref.getMonth() + offset);
    const mes = ref.getMonth() + 1;
    const ano = ref.getFullYear();
    const url = `${cfg.base}/premium/ajax-dashboard-data?mes=${mes}&ano=${ano}`;

    let resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        Cookie: _originContractCookie
      }
    });

    let payload = null;
    try { payload = await resp.json(); } catch { payload = null; }

    if (!payload || typeof payload !== 'object' || payload?.success === false) {
      const relog = await originContractLogin();
      if (!relog.ok) continue;

      resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json,text/plain,*/*',
          Cookie: _originContractCookie
        }
      });
      try { payload = await resp.json(); } catch { payload = null; }
    }

    const parsed = parseContractPayload(payload);
    for (const item of parsed) {
      unique.set(`${item.advertiser}|${item.expirationDate}`, item);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items = Array.from(unique.values()).map((item) => {
    const exp = new Date(`${item.expirationDate}T00:00:00`);
    const daysRemaining = Number.isFinite(item.daysRemaining) && item.daysRemaining
      ? item.daysRemaining
      : Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    return {
      ...item,
      daysRemaining
    };
  });

  const result = {
    items,
    warning: items.length ? '' : 'Nenhum contrato retornado no scraping da origem.'
  };
  _originContractCache = result;
  _originContractCacheAt = Date.now();
  return result;
}

function parseCurrencyLike(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

function normalizeSellerName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPermutaTipo(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return normalized.includes('permuta');
}

function formatSellerDisplayName(value) {
  const cleaned = String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Equipe Comercial';

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getAdminUserById(userId) {
  const id = Number(userId || 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  return db.prepare(`
    SELECT id, username, first_name, last_name
    FROM admin_users
    WHERE id = ?
  `).get(id) || null;
}

function getAdminUserByUsername(username) {
  const value = String(username || '').trim();
  if (!value) return null;
  return db.prepare(`
    SELECT id, username, first_name, last_name
    FROM admin_users
    WHERE lower(username) = lower(?)
    LIMIT 1
  `).get(value) || null;
}

function getAdminUserBySellerName(sellerName) {
  const target = normalizeSellerName(sellerName);
  if (!target) return null;
  const rows = db.prepare(`
    SELECT id, username, first_name, last_name
    FROM admin_users
  `).all();
  return rows.find((row) => {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    return normalizeSellerName(row.username) === target || normalizeSellerName(fullName) === target;
  }) || null;
}

function resolveSellerIdentity({ userId, sellerName, fallbackUsername } = {}) {
  const byId = getAdminUserById(userId);
  if (byId) {
    const displayName = [byId.first_name, byId.last_name].filter(Boolean).join(' ').trim() || byId.username;
    return { sellerId: byId.id, username: byId.username, displayName };
  }

  const byUsername = getAdminUserByUsername(fallbackUsername || sellerName);
  if (byUsername) {
    const displayName = [byUsername.first_name, byUsername.last_name].filter(Boolean).join(' ').trim() || byUsername.username;
    return { sellerId: byUsername.id, username: byUsername.username, displayName };
  }

  const byName = getAdminUserBySellerName(sellerName);
  if (byName) {
    const displayName = [byName.first_name, byName.last_name].filter(Boolean).join(' ').trim() || byName.username;
    return { sellerId: byName.id, username: byName.username, displayName };
  }

  const fallback = String(fallbackUsername || sellerName || '').trim();
  return {
    sellerId: Number.isFinite(Number(userId)) && Number(userId) > 0 ? Number(userId) : null,
    username: fallback || null,
    displayName: fallback || 'Vendedor',
  };
}

function getTvSellerDirectory() {
  const rows = db.prepare(`
    SELECT username, first_name, last_name, photo_url
    FROM admin_users
    WHERE is_vendedor = 1
  `).all();

  const directory = new Map();
  for (const row of rows) {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    const displayName = fullName || formatSellerDisplayName(row.username);
    const canonicalKey = normalizeSellerName(displayName) || normalizeSellerName(row.username);
    const info = {
      canonicalKey,
      displayName,
      photo_url: row.photo_url || null,
    };

    [row.username, fullName, displayName]
      .map((alias) => normalizeSellerName(alias))
      .filter(Boolean)
      .forEach((alias) => {
        directory.set(alias, info);
      });
  }

  return directory;
}

function getMonthlyVendorRanking() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const mes = month + 1;
  const sellerDirectory = getTvSellerDirectory();

  // Primary source: vendas_comercial (same source as GestaoComercial)
  const vcRows = db.prepare(`
    SELECT vendedor_nome, valor_mensal, total_contrato, permuta_valor_receber, permuta_total_receber, COALESCE(tipo, 'Nova Venda') as tipo
    FROM vendas_comercial
    WHERE ano = ? AND mes = ?
      AND UPPER(COALESCE(cliente,'')) NOT IN ('META BASE','HIPER META','META MÊS','META MES')
  `).all(year, mes);

  // Separate Permuta totals
  let permutaTotal = 0, permutaTotalContratos = 0, permutaVendas = 0;

  const map = new Map();
  for (const row of vcRows) {
    const sellerRaw = String(row.vendedor_nome || '').trim();
    const normalizedSeller = normalizeSellerName(sellerRaw);
    if (!normalizedSeller) continue;

    const sellerInfo = sellerDirectory.get(normalizedSeller);
    const sellerKey = sellerInfo?.canonicalKey || normalizedSeller;
    const sellerDisplayName = sellerInfo?.displayName || formatSellerDisplayName(sellerRaw);

    if (!map.has(sellerKey)) {
      map.set(sellerKey, {
        vendedor: sellerDisplayName,
        total: 0,
        total_contratos: 0,
        vendas: 0,
        photo_url: sellerInfo?.photo_url || null,
      });
    }

    const entry = map.get(sellerKey);
    if (!entry.photo_url && sellerInfo?.photo_url) {
      entry.photo_url = sellerInfo.photo_url;
    }
    if (sellerInfo?.displayName) {
      entry.vendedor = sellerInfo.displayName;
    }

    const valMensal = Number(row.valor_mensal || 0);
    const valContrato = Number(row.total_contrato || 0);

    if (isPermutaTipo(row.tipo)) {
      permutaTotal += valMensal;
      permutaTotalContratos += valContrato;
      permutaVendas += 1;

      const permutaReceberMensal = Number(row.permuta_valor_receber || 0);
      const permutaReceberContrato = Number(row.permuta_total_receber || 0);
      if (permutaReceberMensal > 0) {
        entry.total += permutaReceberMensal;
        entry.total_contratos += permutaReceberContrato;
        entry.vendas += 1;
      }
      continue;
    }

    entry.total += valMensal;
    entry.total_contratos += valContrato;
    entry.vendas += 1;
  }

  // Fallback: also check vendas table for any sellers not in vendas_comercial
  const vRows = db.prepare(`
    SELECT vendedor_nome, valor_mensal, permuta_valor_receber, tipo, created_at
    FROM vendas
    WHERE vendedor_nome IS NOT NULL AND TRIM(vendedor_nome) <> ''
  `).all();

  for (const row of vRows) {
    const createdAt = new Date(String(row.created_at || ''));
    if (Number.isNaN(createdAt.getTime())) continue;
    if (createdAt.getMonth() !== month || createdAt.getFullYear() !== year) continue;

    const sellerRaw = String(row.vendedor_nome || '').trim();
    const normalizedSeller = normalizeSellerName(sellerRaw);
    if (!normalizedSeller) continue;

    const sellerInfo = sellerDirectory.get(normalizedSeller);
    const sellerKey = sellerInfo?.canonicalKey || normalizedSeller;

    // If already tracked from vendas_comercial, skip
    if (map.has(sellerKey)) continue;

    const sellerDisplayName = sellerInfo?.displayName || formatSellerDisplayName(sellerRaw);
    const isPermutaRow = isPermutaTipo(row.tipo);
    const valMensalOriginal = parseCurrencyLike(row.valor_mensal);
    const val = isPermutaRow ? parseCurrencyLike(row.permuta_valor_receber) : valMensalOriginal;

    if (!map.has(sellerKey)) {
      map.set(sellerKey, {
        vendedor: sellerDisplayName,
        total: 0,
        total_contratos: 0,
        vendas: 0,
        photo_url: sellerInfo?.photo_url || null,
      });
    }

    const entry = map.get(sellerKey);
    if (isPermutaRow) {
      permutaTotal += valMensalOriginal;
      permutaTotalContratos += valMensalOriginal;
      permutaVendas += 1;
    }
    entry.total += val;
    entry.total_contratos += val;
    entry.vendas += 1;
  }

  const rankingList = Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((item, idx) => ({
      posicao: idx + 1,
      vendedor: item.vendedor,
      total: Number(item.total.toFixed(2)),
      total_contratos: Number(item.total_contratos.toFixed(2)),
      vendas: item.vendas,
      photo_url: item.photo_url || null,
    }));

  return {
    list: rankingList,
    permuta: {
      total: Number(permutaTotal.toFixed(2)),
      total_contratos: Number(permutaTotalContratos.toFixed(2)),
      vendas: permutaVendas,
    },
  };
}

function parseFlexibleDateToTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;

  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]) - 1;
    const year = Number(ddmmyyyy[3]);
    const hour = Number(ddmmyyyy[4] || 0);
    const minute = Number(ddmmyyyy[5] || 0);
    const dt = new Date(year, month, day, hour, minute, 0);
    const ts = dt.getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  return 0;
}

function formatTvShortDate(value) {
  const ts = parseFlexibleDateToTimestamp(value);
  if (!ts) return '--/--';
  return new Date(ts).toLocaleDateString('pt-BR');
}

function getTvGoalsSnapshot() {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;

  const metaRow = db.prepare(`
    SELECT valor_meta, valor_meta_recorrencia
    FROM metas_vendedor
    WHERE vendedor_nome = '__GLOBAL__' AND ano = ? AND mes = ?
    LIMIT 1
  `).get(ano, mes) || {};

  const realizedRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE
        WHEN TRIM(LOWER(COALESCE(tipo, 'nova venda'))) LIKE '%permuta%' THEN COALESCE(permuta_valor_receber, 0)
        ELSE COALESCE(valor_mensal, 0)
      END), 0) AS realizado_mensal,
      COALESCE(SUM(CASE
        WHEN TRIM(LOWER(COALESCE(tipo, 'nova venda'))) LIKE '%permuta%' THEN COALESCE(permuta_total_receber, 0)
        ELSE COALESCE(total_contrato, 0)
      END), 0) AS realizado_recorrencia,
      COUNT(*) AS vendas
    FROM vendas_comercial
    WHERE ano = ?
      AND mes = ?
      AND UPPER(COALESCE(cliente,'')) NOT IN ('META BASE','HIPER META','META MÊS','META MES')
  `).get(ano, mes) || {};

  const metaMensal = Number(metaRow.valor_meta || 0);
  const metaRecorrencia = Number(metaRow.valor_meta_recorrencia || 0);
  const realizadoMensal = Number(realizedRow.realizado_mensal || 0);
  const realizadoRecorrencia = Number(realizedRow.realizado_recorrencia || 0);

  return {
    ano,
    mes,
    meta_mensal: metaMensal,
    meta_recorrencia: metaRecorrencia,
    realizado_mensal: realizadoMensal,
    realizado_recorrencia: realizadoRecorrencia,
    vendas: Number(realizedRow.vendas || 0),
    pct_mensal: metaMensal > 0 ? Math.round((realizadoMensal / metaMensal) * 100) : 0,
    pct_recorrencia: metaRecorrencia > 0 ? Math.round((realizadoRecorrencia / metaRecorrencia) * 100) : 0,
  };
}

function getTvRecentActivity(limit = 5) {
  const max = Math.max(1, Math.min(20, Number(limit) || 5));

  const salesRows = db.prepare(`
    SELECT vendedor_nome, cliente, valor_mensal, total_contrato, data_venda, created_at
    FROM vendas_comercial
    WHERE UPPER(COALESCE(cliente,'')) NOT IN ('META BASE','HIPER META','META MÊS','META MES')
    ORDER BY created_at DESC
    LIMIT 40
  `).all();

  const renewalRows = db.prepare(`
    SELECT cliente, vendedor_nome, valor_mensal, status, updated_at, created_at
    FROM renovacoes
    ORDER BY COALESCE(updated_at, created_at) DESC
    LIMIT 40
  `).all();

  const replayRows = db.prepare(`
    SELECT id, venda_id, vendedor_nome, cliente, valor_mensal, created_at
    FROM tv_sale_replays
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  `).all();

  const entries = [];

  for (const row of salesRows) {
    const dateRef = row.data_venda || row.created_at;
    entries.push({
      type: 'venda',
      cliente: row.cliente || 'Cliente',
      vendedor: row.vendedor_nome || 'Sem vendedor',
      valor_mensal: Number(row.valor_mensal || 0),
      valor_total: Number(row.total_contrato || row.valor_mensal || 0),
      status: 'Venda',
      data_ref: formatTvShortDate(dateRef),
      _ts: parseFlexibleDateToTimestamp(dateRef),
    });
  }

  for (const row of renewalRows) {
    const dateRef = row.updated_at || row.created_at;
    const status = String(row.status || 'pendente').toLowerCase();
    entries.push({
      type: 'renovacao',
      cliente: row.cliente || 'Cliente',
      vendedor: row.vendedor_nome || 'Sem vendedor',
      valor_mensal: Number(row.valor_mensal || 0),
      valor_total: Number(row.valor_mensal || 0),
      status: status === 'concluida' ? 'Renovação concluída' : 'Renovação pendente',
      data_ref: formatTvShortDate(dateRef),
      _ts: parseFlexibleDateToTimestamp(dateRef),
    });
  }

  for (const row of replayRows) {
    const dateRef = row.created_at;
    entries.push({
      type: 'venda',
      cliente: row.cliente || 'Cliente',
      vendedor: row.vendedor_nome || 'Sem vendedor',
      valor_mensal: Number(row.valor_mensal || 0),
      valor_total: Number(row.valor_mensal || 0),
      status: 'Replay TV',
      data_ref: formatTvShortDate(dateRef),
      event_key: `tv-replay-${row.id}`,
      origem: 'tv_replay',
      venda_id: Number(row.venda_id || 0) || null,
      _ts: parseFlexibleDateToTimestamp(dateRef),
    });
  }

  return entries
    .sort((a, b) => b._ts - a._ts)
    .slice(0, max)
    .map(({ _ts, ...item }) => item);
}

function getLatestTvPostits(limit = 10) {
  const max = Math.max(1, Math.min(50, Number(limit) || 10));
  return db.prepare(`
    SELECT id, text, author, source, created_at
    FROM tv_postits
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(max);
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

// ── Tabela de post-its do painel TV ──
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS tv_postits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    author TEXT,
    source TEXT DEFAULT 'manual',
    external_message_id TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
} catch (e) { /* já existe */ }

// ── Tabela de ações de contrato via WhatsApp ──
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS contract_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    action TEXT NOT NULL,
    author TEXT,
    created_at TEXT DEFAULT (datetime('now'))
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

// ── Painel TV (público) ─────────────────────────────────────────────────────
app.get('/api/tv/dashboard', openCors, monitorLimiter, async (req, res) => {
  try {
    const warnings = [];

    let loopSummary = {
      total: 0,
      online: 0,
      offline: 0,
      lotados: 0,
      totalCotasLivres: 0,
      itensCriticos: []
    };

    try {
      const monitors = await fetchOriginMonitors();
      const EXCLUDE_RE = /\bbacklight\b|\bfrontlight\b/i;
      const DURACAO_INSERCAO = 10;
      const CICLO_PADRAO = 180;
      const filtered = monitors.filter((m) => !EXCLUDE_RE.test(m?.nome || ''));

      // Respeitar monitores ocultos (mesma lógica do /api/loop-audit)
      const excludedRows = db.prepare('SELECT origin_id FROM loop_audit_exclusions').all();
      const excludedIds = new Set(excludedRows.map(r => r.origin_id));
      const visible = filtered.filter(m => !excludedIds.has(m.id));

      const mapped = visible.map((m) => {
        const ocupadoSeg = Number(m?.ciclo_segundos || 0);
        const livreSeg = Math.max(0, CICLO_PADRAO - ocupadoSeg);
        const cotasLivres = Math.floor(livreSeg / DURACAO_INSERCAO);
        const pctOcupado = Math.min(100, Math.round((ocupadoSeg / CICLO_PADRAO) * 100));
        return {
          id: m?.id,
          nome: String(m?.nome || '').trim(),
          local: String(m?.local || '').trim(),
          cidade: m?.cidade || '',
          status: m?.status || 'unknown',
          pct_ocupado: pctOcupado,
          cotas_livres: cotasLivres,
          insercoes_ativas: Number(m?.total_insercoes_ativas || 0),
          ciclo_ocupado_seg: ocupadoSeg,
          ciclo_total_seg: CICLO_PADRAO
        };
      });

      // Agrupar por local: um item por local, expandir somente quando houver divergência de ciclo
      const byLocal = new Map();
      for (const item of mapped) {
        const key = item.local || item.nome;
        if (!byLocal.has(key)) byLocal.set(key, []);
        byLocal.get(key).push(item);
      }
      const grouped = [];
      for (const [, group] of byLocal) {
        if (group.length === 1) {
          grouped.push({ ...group[0], telas: 1, divergente: false });
        } else {
          const cotasSet = new Set(group.map(g => g.cotas_livres));
          if (cotasSet.size === 1) {
            const rep = group[0];
            const onlineCount = group.filter(g => g.status === 'online').length;
            grouped.push({
              ...rep,
              status: onlineCount > 0 ? 'online' : rep.status,
              telas: group.length,
              divergente: false,
            });
          } else {
            for (const g of group) {
              grouped.push({ ...g, telas: group.length, divergente: true });
            }
          }
        }
      }

      loopSummary = {
        total: grouped.length,
        online: grouped.filter((m) => m.status === 'online').length,
        offline: grouped.filter((m) => m.status !== 'online').length,
        lotados: grouped.filter((m) => m.pct_ocupado >= 100).length,
        totalCotasLivres: grouped.reduce((sum, m) => sum + (m.cotas_livres || 0), 0),
        lotadosItems: grouped.filter((m) => m.pct_ocupado >= 100),
        itensCriticos: grouped
          .sort((a, b) => b.cotas_livres - a.cotas_livres || a.pct_ocupado - b.pct_ocupado)
          .slice(0, 30)
      };
    } catch (err) {
      warnings.push(`Loop audit: ${err.message}`);
    }

    const contractsData = await fetchContractsFromOrigin();
    if (contractsData.warning) warnings.push(contractsData.warning);

    // Filter out contracts dismissed via WhatsApp commands (/renovou, /cancelou)
    let dismissedNames = [];
    try {
      const dismissedRows = db.prepare(`
        SELECT LOWER(client_name) as name, action FROM contract_actions
        WHERE created_at::timestamp > NOW() - INTERVAL '60 days'
      `).all();
      dismissedNames = dismissedRows.map(r => r.name);
    } catch (dErr) {
      console.error('[tv/dashboard] contract_actions query failed (non-fatal):', dErr.message);
    }
    const filteredContracts = contractsData.items.filter(c => {
      const nameNorm = (c.advertiser || '').toLowerCase().trim();
      return !dismissedNames.some(d => nameNorm.includes(d) || d.includes(nameNorm));
    });

    const expiring5 = filteredContracts.filter((c) => Number(c.daysRemaining) <= 5 && Number(c.daysRemaining) >= 0).length;
    const expiring15 = filteredContracts.filter((c) => Number(c.daysRemaining) <= 15 && Number(c.daysRemaining) > 5).length;

    const rankingData = getMonthlyVendorRanking();
    const goals = getTvGoalsSnapshot();
    const recentActivity = getTvRecentActivity(5);
    const tickerMessage = getAppSetting('tv_ticker_message', 'Painel Intermidia: acompanhe contratos, auditoria de loop e ranking de vendas em tempo real.');
    const postits = getLatestTvPostits(12);

    res.json({
      generated_at: new Date().toISOString(),
      loop: loopSummary,
      contracts: {
        total: filteredContracts.length,
        expiring_5d: expiring5,
        expiring_15d: expiring15,
        items: filteredContracts
          .sort((a, b) => Number(a.daysRemaining || 0) - Number(b.daysRemaining || 0))
          .slice(0, 14)
      },
      ranking: rankingData.list,
      goals,
      permuta: rankingData.permuta,
      recent_activity: recentActivity,
      ticker_message: tickerMessage,
      postits,
      warnings
    });
  } catch (err) {
    console.error('[tv/dashboard]', err.message);
    res.status(500).json({ error: 'Falha ao montar painel TV.' });
  }
});

// Dispara manualmente o popup de venda no /painel-tv sem reenviar WhatsApp.
app.post('/api/tv/replay-sale/:id', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const vendaId = Number(req.params.id);
    if (!Number.isInteger(vendaId) || vendaId <= 0) {
      return res.status(400).json({ error: 'ID de venda inválido.' });
    }

    const venda = db.prepare(`
      SELECT id, vendedor_id, vendedor_nome, razao_social, valor_mensal
      FROM vendas
      WHERE id = ?
    `).get(vendaId);

    if (!venda) {
      return res.status(404).json({ error: 'Venda não encontrada.' });
    }

    if (req.authUser?.role === 'vendedor' && Number(venda.vendedor_id || 0) !== Number(req.authUser?.id || 0)) {
      return res.status(403).json({ error: 'Você só pode disparar o popup das suas próprias vendas.' });
    }

    const replayResult = db.prepare(`
      INSERT INTO tv_sale_replays (venda_id, vendedor_nome, cliente, valor_mensal, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      venda.id,
      venda.vendedor_nome || req.authUser?.username || 'Vendedor',
      venda.razao_social || 'Cliente',
      Number(parseBRLCurrency(venda.valor_mensal) || 0),
      req.authUser?.id || null
    );

    res.json({
      ok: true,
      replay_id: replayResult.lastInsertRowid,
      venda_id: venda.id,
      cliente: venda.razao_social || 'Cliente',
      vendedor: venda.vendedor_nome || req.authUser?.username || 'Vendedor',
      valor_mensal: Number(parseBRLCurrency(venda.valor_mensal) || 0),
      message: 'Popup enviado para o Painel TV com sucesso.',
    });
  } catch (err) {
    internalError(res, err);
  }
});

// ── Contract Actions (WhatsApp commands) ──
app.get('/api/admin/contract-actions', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM contract_actions ORDER BY created_at DESC LIMIT 100`).all();
    res.json(rows);
  } catch (err) { internalError(res, err); }
});

app.delete('/api/admin/contract-actions/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    db.prepare(`DELETE FROM contract_actions WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) { internalError(res, err); }
});

app.get('/api/admin/tv/postits', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    res.json(getLatestTvPostits(limit));
  } catch (err) {
    internalError(res, err);
  }
});

app.post('/api/admin/tv/postits', requireRoles(['admin', 'gerente_comercial']), express.json(), (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const author = String(req.body?.author || req.authUser?.username || 'admin').trim();
    if (!text) return res.status(400).json({ error: 'text é obrigatório' });

    const info = db.prepare(`
      INSERT INTO tv_postits (text, author, source)
      VALUES (?, ?, 'manual')
    `).run(text.slice(0, 500), author.slice(0, 120));

    const row = db.prepare('SELECT id, text, author, source, created_at FROM tv_postits WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    internalError(res, err);
  }
});

app.delete('/api/admin/tv/postits/:id', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    db.prepare('DELETE FROM tv_postits WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

app.post('/api/admin/tv/contracts/sync', requireRoles(['admin', 'gerente_comercial']), async (req, res) => {
  try {
    const data = await fetchContractsFromOrigin({ force: true });
    res.json({ ok: true, total: data.items.length, warning: data.warning || '' });
  } catch (err) {
    internalError(res, err);
  }
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
    const normalizedNome = normalizePointNameByType(data.nome || '', tipo);
    const arteLargura = parseInt(data.arte_largura, 10) || 1920;
    const arteAltura = parseInt(data.arte_altura, 10) || 1080;
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
    const ownerTag = normalizePointOwnerTag(data.owner_tag);

    const disponibilidade = isBackOrFrontLight
      ? (['disponivel', 'indisponivel'].includes(data.disponibilidade) ? data.disponibilidade : 'disponivel')
      : null;

    const stmt = db.prepare(`
      INSERT INTO pontos (nome, cidade, tipo, endereco, lat, lng, horario, fluxo, insercoes, tempo, loop, veiculacao, publico, telas, preco, descricao, imagem, imagem2, simulacao_tela, simulacao_arte, simulacao_preview, arte_largura, arte_altura, midia_largura_m, midia_altura_m, tipo_fluxo, audience_tags, availability_calendar, elevador_categoria, imagem_foco_x, imagem_foco_y, imagem_foco_zoom, foto_focal_point, pdf_image_source, owner_tag, disponibilidade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const telasVal = parseInt(data.telas) || 1;
    const insercoes = isBackOrFrontLight
      ? (parseInt(data.insercoes) || 0)
      : (calcInsercoesMensal(data.horario, telasVal) ?? (parseInt(data.insercoes) || 0));

    const result = stmt.run(
      normalizedNome || data.nome, data.cidade, tipo, data.endereco,
      latDb, lngDb,
      data.horario, parseInt(data.fluxo) || 0, insercoes,
      data.tempo || '15s', data.loop || '3 min', data.veiculacao || 'Vídeo sem áudio',
      data.publico || 'A/B', telasVal, parseFloat(data.preco) || 0,
      data.descricao, imagem, imagem2, simulacaoTela, simulacaoArte, simulacaoPreview,
      arteLargura, arteAltura, midiaLarguraM, midiaAlturaM, tipoFluxo,
      JSON.stringify(audienceTags), JSON.stringify(availabilityCalendar), elevadorCategoria,
      imagemFocoX, imagemFocoY, imagemFocoZoom,
      fotoFocalPoint, pdfImageSource, ownerTag, disponibilidade
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
    const normalizedNome = normalizePointNameByType(data.nome || existing.nome, tipo);
    const arteLargura = parseInt(data.arte_largura, 10) || existing.arte_largura || 1920;
    const arteAltura = parseInt(data.arte_altura, 10) || existing.arte_altura || 1080;
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
    const ownerTag = normalizePointOwnerTag(data.owner_tag !== undefined ? data.owner_tag : existing.owner_tag);

    const disponibilidade = isBackOrFrontLight
      ? (['disponivel', 'indisponivel'].includes(data.disponibilidade) ? data.disponibilidade : (existing.disponibilidade || 'disponivel'))
      : null;

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
        owner_tag = ?,
        disponibilidade = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      normalizedNome || data.nome || existing.nome, data.cidade || existing.cidade, tipo,
      data.endereco || existing.endereco,
      latDb, lngDb,
      data.horario || existing.horario, parseInt(data.fluxo) || existing.fluxo,
      (() => {
        const t = data.tipo || existing.tipo;
        if (t === 'Backlight' || t === 'Frontlight') return parseInt(data.insercoes) || existing.insercoes;
        const h = data.horario || existing.horario;
        const n = parseInt(data.telas) || existing.telas;
        return calcInsercoesMensal(h, n) ?? (parseInt(data.insercoes) || existing.insercoes);
      })(),
      data.tempo || existing.tempo, data.loop || existing.loop,
      data.veiculacao || existing.veiculacao, data.publico || existing.publico,
      parseInt(data.telas) || existing.telas, parseFloat(data.preco) || existing.preco,
      data.descricao || existing.descricao, imagem, imagem2,
      simulacaoTela, simulacaoArte, simulacaoPreview,
      arteLargura, arteAltura, midiaLarguraM, midiaAlturaM, tipoFluxo,
      JSON.stringify(audienceTags), JSON.stringify(availabilityCalendar), elevadorCategoria,
      imagemFocoX, imagemFocoY, imagemFocoZoom, fotoFocalPoint, pdfImageSource,
      ownerTag,
      disponibilidade,
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

// Read cached entorno scores. When force=true, processes pontos synchronously
// (com cap de tempo) para que o vendedor receba a análise já populada na
// primeira resposta, em vez de ver "cache 0%" enquanto a fila assíncrona roda.
app.get('/api/entorno/scores', requireRoles(['admin', 'gerente_comercial', 'vendedor']), async (req, res) => {
  try {
    const segmento = normalizeSegment(req.query.segmento);
    const raio = normalizeRadius(req.query.raio || DEFAULT_RADIUS);
    const cidade = parseOptionalCity(req.query.cidade);
    const force = String(req.query.force || '').toLowerCase() === 'true';

    let job = null;
    if (force) {
      try {
        job = await runJobSync({ segment: segmento, radius: raio, city: cidade, maxWaitMs: 25000 });
      } catch (err) {
        console.warn('[entorno/scores] runJobSync falhou, caindo para fila assíncrona:', err?.message || err);
        job = enqueueJob({ segment: segmento, radius: raio, city: cidade });
      }
    }

    const scores = getScoresWithCoverage({ segment: segmento, radius: raio, city: cidade });

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

// HARD DELETE ponto (admin only) — permanently removes row
app.delete('/api/pontos/:id/hard', requireRoles(['admin']), (req, res) => {
  try {
    const existing = db.prepare('SELECT id, cidade, nome FROM pontos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ponto não encontrado' });
    const result = db.prepare('DELETE FROM pontos WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Ponto não encontrado' });
    invalidateCityCaches(existing.cidade, db);
    res.json({ success: true, deleted: existing.nome });
  } catch (err) {
    internalError(res, err);
  }
});

app.get('/api/admin/pontos/import/template', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const buffer = buildPointImportTemplateBuffer();
    const fileName = 'modelo-importacao-pontos.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    internalError(res, err, 'Falha ao gerar o Excel de exemplo.');
  }
});

app.post('/api/admin/pontos/import', requireRoles(['admin', 'gerente_comercial']), uploadPointImport.single('file'), (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Arquivo não enviado. Selecione um Excel para importar.' });
    }

    let workbook;
    try {
      const originalName = String(req.file.originalname || '').toLowerCase();
      const isCsv = originalName.endsWith('.csv') || /csv/i.test(req.file.mimetype || '');
      if (isCsv) {
        // CSVs costumam vir em UTF-8 (com ou sem BOM) ou Windows-1252.
        // O xlsx, por padrão, decodifica buffers de CSV como CP1252, o que
        // gera mojibake (ex: "Melância" → "MelÃ¢ncia") quando o arquivo
        // está em UTF-8. Detectamos a codificação manualmente:
        const buf = req.file.buffer;
        let text;
        const hasUtf8Bom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
        if (hasUtf8Bom) {
          text = buf.slice(3).toString('utf8');
        } else {
          // Tenta UTF-8 e valida — se falhar, cai para latin1.
          const utf8 = buf.toString('utf8');
          const looksValidUtf8 = !/\uFFFD/.test(utf8) && Buffer.byteLength(utf8, 'utf8') === buf.length;
          text = looksValidUtf8 ? utf8 : buf.toString('latin1');
        }
        workbook = XLSX.read(text, { type: 'string', raw: false });
      } else {
        // .xlsx/.xls — encoding interno é tratado pela própria lib.
        workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: false, codepage: 65001 });
      }
    } catch {
      return res.status(400).json({ error: 'Não foi possível ler o arquivo. Verifique se é um Excel válido.' });
    }

    const firstSheetName = workbook?.SheetNames?.[0];
    if (!firstSheetName) {
      return res.status(400).json({ error: 'Planilha sem abas. Use o modelo de importação.' });
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', blankrows: false });
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Nenhuma linha encontrada na planilha. Preencha ao menos um ponto.' });
    }

    const stmt = db.prepare(`
      INSERT INTO pontos (nome, cidade, tipo, endereco, lat, lng, horario, fluxo, insercoes, tempo, loop, veiculacao, publico, telas, preco, descricao, imagem, imagem2, simulacao_tela, simulacao_arte, simulacao_preview, arte_largura, arte_altura, midia_largura_m, midia_altura_m, tipo_fluxo, audience_tags, availability_calendar, elevador_categoria, imagem_foco_x, imagem_foco_y, imagem_foco_zoom, foto_focal_point, pdf_image_source, owner_tag, disponibilidade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const errors = [];
    const createdIds = [];
    const touchedCities = new Set();
    let processedRows = 0;

    rows.forEach((rawRow, idx) => {
      const rowNumber = idx + 2;
      const normalizedRow = normalizeImportRow(rawRow);

      const isEmpty = Object.values(normalizedRow).every((value) => !importCellToString(value));
      if (isEmpty) return;

      processedRows += 1;

      const data = {};
      Object.entries(POINT_IMPORT_HEADER_ALIASES).forEach(([field, aliases]) => {
        data[field] = pickImportValue(normalizedRow, aliases);
      });

      const requiredFields = ['nome', 'cidade', 'tipo', 'endereco', 'horario', 'fluxo', 'telas', 'preco', 'publico'];
      const missing = requiredFields.filter((field) => !importCellToString(data[field]));
      if (missing.length > 0) {
        errors.push({
          row: rowNumber,
          error: `Campos obrigatórios faltando: ${missing.join(', ')}`
        });
        return;
      }

      try {
        const tipo = importCellToString(data.tipo);
        const nomeOriginal = importCellToString(data.nome);
        const nome = normalizePointNameByType(nomeOriginal, tipo) || nomeOriginal;
        const cidade = importCellToString(data.cidade);
        const endereco = importCellToString(data.endereco);
        const horario = importCellToString(data.horario);
        const fluxo = Math.max(0, parseImportInteger(data.fluxo, 0));
        const telasVal = Math.max(1, parseImportInteger(data.telas, 1));
        const preco = Math.max(0, parseCurrencyLike(data.preco));
        const publico = importCellToString(data.publico) || 'A/B';
        const ownerTag = normalizePointOwnerTag(data.owner_tag);

        const isBackOrFrontLight = tipo === 'Backlight' || tipo === 'Frontlight';
        const insercoesInformadas = Math.max(0, parseImportInteger(data.insercoes, 0));
        const insercoes = isBackOrFrontLight
          ? insercoesInformadas
          : (calcInsercoesMensal(horario, telasVal) ?? insercoesInformadas);

        const tempo = importCellToString(data.tempo) || '15s';
        const loop = importCellToString(data.loop) || '3 min';
        const veiculacao = importCellToString(data.veiculacao) || 'Vídeo sem áudio';
        const descricao = importCellToString(data.descricao);
        const latDb = normalizeCoordinateForDb(data.lat, -90, 90, null);
        const lngDb = normalizeCoordinateForDb(data.lng, -180, 180, null);

        const arteLarguraDefault = tipo === ELEVADOR_TIPO ? ELEVADOR_ARTE_LARGURA : 1920;
        const arteAlturaDefault = tipo === ELEVADOR_TIPO ? ELEVADOR_ARTE_ALTURA : 1080;
        const arteLargura = Math.max(1, parseImportInteger(data.arte_largura, arteLarguraDefault));
        const arteAltura = Math.max(1, parseImportInteger(data.arte_altura, arteAlturaDefault));

        const elevadorCategoria = tipo === ELEVADOR_TIPO
          ? normalizeElevadorCategoria(importCellToString(data.elevador_categoria))
          : null;

        const tipoFluxo = importCellToString(data.tipo_fluxo).toLowerCase() === 'veiculos'
          ? 'veiculos'
          : 'pessoas';

        const midiaLarguraM = isBackOrFrontLight
          ? parseImportPhysicalSize(data.midia_largura_m, null)
          : null;
        const midiaAlturaM = isBackOrFrontLight
          ? parseImportPhysicalSize(data.midia_altura_m, null)
          : null;

        const disponibilidadeRaw = importCellToString(data.disponibilidade).toLowerCase();
        const disponibilidade = isBackOrFrontLight
          ? (disponibilidadeRaw === 'indisponivel' ? 'indisponivel' : 'disponivel')
          : null;

        const audienceTags = normalizeAudienceTagsInput('', publico);
        const availabilityCalendar = normalizeAvailabilityCalendarInput('', horario);

        const result = stmt.run(
          nome,
          cidade,
          tipo,
          endereco,
          latDb,
          lngDb,
          horario,
          fluxo,
          insercoes,
          tempo,
          loop,
          veiculacao,
          publico,
          telasVal,
          preco,
          descricao,
          null,
          null,
          null,
          null,
          null,
          arteLargura,
          arteAltura,
          midiaLarguraM,
          midiaAlturaM,
          tipoFluxo,
          JSON.stringify(audienceTags),
          JSON.stringify(availabilityCalendar),
          elevadorCategoria,
          50,
          50,
          100,
          'center center',
          'imagem2',
          ownerTag,
          disponibilidade
        );

        const created = db.prepare('SELECT id, cidade FROM pontos WHERE id = ?').get(result.lastInsertRowid);
        if (created?.id) {
          createdIds.push(Number(created.id));
          const citySlug = slugifyCity(created.cidade);
          if (citySlug) touchedCities.add(citySlug);
        }
      } catch (err) {
        errors.push({ row: rowNumber, error: err?.message || 'Falha ao inserir ponto.' });
      }
    });

    if (processedRows === 0) {
      return res.status(400).json({ error: 'A planilha está vazia. Preencha ao menos uma linha de ponto.' });
    }

    createdIds.forEach((id) => invalidatePointCache(id));
    touchedCities.forEach((citySlug) => invalidateCityCaches(citySlug, db));

    const createdCount = createdIds.length;
    const maxErrors = 100;
    const visibleErrors = errors.slice(0, maxErrors);

    if (createdCount === 0) {
      return res.status(400).json({
        error: 'Nenhum ponto foi importado. Verifique os erros da planilha.',
        totalRows: processedRows,
        createdCount,
        errorCount: errors.length,
        errors: visibleErrors
      });
    }

    return res.status(201).json({
      success: true,
      totalRows: processedRows,
      createdCount,
      errorCount: errors.length,
      errors: visibleErrors,
      warning: errors.length > maxErrors ? `Mostrando apenas os primeiros ${maxErrors} erros.` : ''
    });
  } catch (err) {
    internalError(res, err, 'Falha ao importar pontos via Excel.');
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

    const validRoles = ['admin', 'diretor', 'gerente_comercial', 'vendedor'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role inválido. Valores permitidos: admin, diretor, gerente_comercial, vendedor' });
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

    const existing = db.prepare('SELECT id, first_name, last_name, username, email FROM admin_users WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });

    const validRoles = ['admin', 'diretor', 'gerente_comercial', 'vendedor'];
    const body = req.body || {};

    // Build dynamic SET fragments
    const sets = [];
    const params = [];

    if (body.role !== undefined) {
      const role = String(body.role || '').trim();
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: 'Role inválido. Valores permitidos: admin, diretor, gerente_comercial, vendedor' });
      }
      sets.push('role = ?');
      params.push(role);
    }

    if (body.is_vendedor !== undefined) {
      sets.push('is_vendedor = ?');
      params.push(body.is_vendedor ? 1 : 0);
    }

    const firstNameRaw = body.firstName !== undefined ? body.firstName : body.first_name;
    if (firstNameRaw !== undefined) {
      const firstName = String(firstNameRaw || '').trim();
      if (!firstName) return res.status(400).json({ error: 'Nome não pode ficar em branco' });
      sets.push('first_name = ?');
      params.push(firstName);
    }

    const lastNameRaw = body.lastName !== undefined ? body.lastName : body.last_name;
    if (lastNameRaw !== undefined) {
      const lastName = String(lastNameRaw || '').trim();
      if (!lastName) return res.status(400).json({ error: 'Sobrenome não pode ficar em branco' });
      sets.push('last_name = ?');
      params.push(lastName);
    }

    if (body.username !== undefined) {
      const username = String(body.username || '').trim().toLowerCase();
      if (!username) return res.status(400).json({ error: 'Login não pode ficar em branco' });
      if (!/^[a-z0-9._-]+$/.test(username)) {
        return res.status(400).json({ error: 'Login deve conter apenas letras, números, ponto, underline ou traço' });
      }
      if (username !== String(existing.username || '').toLowerCase()) {
        const conflict = db.prepare('SELECT id FROM admin_users WHERE lower(username) = lower(?) AND id <> ?').get(username, id);
        if (conflict) return res.status(409).json({ error: 'Login já está em uso' });
      }
      sets.push('username = ?');
      params.push(username);
    }

    if (body.email !== undefined) {
      const email = String(body.email || '').trim().toLowerCase();
      if (email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'E-mail inválido' });
        }
        if (email !== String(existing.email || '').toLowerCase()) {
          const conflict = db.prepare('SELECT id FROM admin_users WHERE lower(email) = lower(?) AND id <> ?').get(email, id);
          if (conflict) return res.status(409).json({ error: 'E-mail já cadastrado' });
        }
      }
      sets.push('email = ?');
      params.push(email);
    }

    if (body.whatsapp !== undefined) {
      sets.push('whatsapp = ?');
      params.push(String(body.whatsapp || '').trim());
    }

    if (body.password !== undefined) {
      const password = String(body.password || '').trim();
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
        }
        sets.push('password = ?');
        params.push(hashPassword(password));
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    sets.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE admin_users SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT id, first_name, last_name, username, email, whatsapp, role, is_vendedor, photo_url FROM admin_users WHERE id = ?').get(id);
    if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
    try {
      const canonicalSellerName = String(updated.username || '').trim();
      const oldFullName = [existing.first_name, existing.last_name].filter(Boolean).join(' ').trim();
      const oldUsername = String(existing.username || '').trim();

      if (canonicalSellerName) {
        db.prepare(`
          UPDATE vendas
          SET vendedor_nome = ?, updated_at = datetime('now')
          WHERE vendedor_id = ?
        `).run(canonicalSellerName, id);

        db.prepare(`
          UPDATE vendas_comercial
          SET vendedor_id = ?, vendedor_nome = ?, updated_at = datetime('now')
          WHERE vendedor_id = ?
             OR venda_id IN (SELECT id FROM vendas WHERE vendedor_id = ?)
        `).run(id, canonicalSellerName, id, id);

        const aliasCandidates = [oldUsername, oldFullName]
          .map((v) => String(v || '').trim())
          .filter(Boolean);
        for (const alias of aliasCandidates) {
          db.prepare(`
            UPDATE vendas_comercial
            SET vendedor_id = ?, vendedor_nome = ?, updated_at = datetime('now')
            WHERE (vendedor_id IS NULL OR vendedor_id = 0)
              AND lower(trim(COALESCE(vendedor_nome, ''))) = lower(?)
          `).run(id, canonicalSellerName, alias);
        }
      }
    } catch (syncErr) {
      console.warn('[users] falha ao sincronizar vendedor nas vendas:', syncErr.message);
    }
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
      evolution_pdf_instance,
      evolution_api_key,
      evolution_dest_number,
      evolution_financeiro_number,
      tv_ticker_message,
      tv_postit_group_jid
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
    const evoFields = {
      evolution_api_url,
      evolution_instance,
      evolution_pdf_instance,
      evolution_api_key,
      evolution_dest_number,
      evolution_financeiro_number,
      tv_ticker_message,
      tv_postit_group_jid
    };
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
  const { id, first_name, last_name, username, email, whatsapp, role, is_vendedor, photo_url } = req.authUser;
  res.json({ id, first_name, last_name, username, email, whatsapp, role, is_vendedor: !!is_vendedor, photo_url });
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

// Helper: parse BRL currency string "5.000,00" → 5000.00
function parseBRLCurrency(v) {
  if (!v) return 0;
  const cleaned = String(v).replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatBRLCurrency(value) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return safe.toFixed(2).replace('.', ',');
}

function parseBooleanField(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

function resolvePermutaBreakdown({ total = 0, servico = 0, receber = 0 } = {}) {
  let valorServico = Number.isFinite(servico) ? Math.max(0, servico) : 0;
  let valorReceber = Number.isFinite(receber) ? Math.max(0, receber) : 0;
  const valorTotal = Number.isFinite(total) ? Math.max(0, total) : 0;

  const hasServico = valorServico > 0;
  const hasReceber = valorReceber > 0;

  if (valorTotal > 0) {
    if (hasServico && !hasReceber) {
      valorReceber = Math.max(0, valorTotal - valorServico);
    } else if (!hasServico && hasReceber) {
      valorServico = Math.max(0, valorTotal - valorReceber);
    } else if (hasServico && hasReceber) {
      const sum = valorServico + valorReceber;
      if (sum > valorTotal && sum > 0) {
        const ratio = valorTotal / sum;
        valorServico = Number((valorServico * ratio).toFixed(2));
        valorReceber = Number((valorReceber * ratio).toFixed(2));
      }
    }
  }

  return { valorServico, valorReceber, valorTotal };
}

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
  // O formulário de venda pode enviar muitos campos (arrays/JSON extras), então
  // evitamos bloquear com LIMIT_FIELD_COUNT ao anexar o P.I.
  limits: { fileSize: 50 * 1024 * 1024, files: 10, fields: 200 }
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

// Rascunho de nova venda (1 rascunho por vendedor/usuário autenticado)
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vendas_rascunhos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendedor_id INTEGER NOT NULL UNIQUE,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
} catch (dbInitErr) {
  console.error('[vendas_rascunhos] falha ao criar tabela:', dbInitErr.message);
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
  'ALTER TABLE vendas ADD COLUMN email TEXT',
  'ALTER TABLE vendas ADD COLUMN criativo_nome TEXT',
  'ALTER TABLE vendas ADD COLUMN criativo_whatsapp TEXT',
  'ALTER TABLE vendas ADD COLUMN criativo_email TEXT',
  "ALTER TABLE pontos ADD COLUMN disponibilidade TEXT DEFAULT 'disponivel'",
  'ALTER TABLE vendas ADD COLUMN nome_fantasia TEXT',
  'ALTER TABLE vendas ADD COLUMN cota_contratada TEXT',
  'ALTER TABLE vendas ADD COLUMN plano_fidelidade INTEGER DEFAULT 0',
  'ALTER TABLE vendas ADD COLUMN pontos_precos TEXT',
  'ALTER TABLE vendas ADD COLUMN permuta_valor_servico TEXT',
  'ALTER TABLE vendas ADD COLUMN permuta_valor_receber TEXT',
  "ALTER TABLE pontos ADD COLUMN owner_tag TEXT DEFAULT 'Intermídia'",
  'ALTER TABLE vendas ADD COLUMN tipo_documento TEXT',
  'ALTER TABLE vendas ADD COLUMN pi_numero TEXT',
  'ALTER TABLE vendas ADD COLUMN endereco_cep TEXT',
  'ALTER TABLE vendas ADD COLUMN responsavel_fixo TEXT',
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

// ─── Tabela de log de envios WhatsApp (PDF técnico, notificações, etc.) ──
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS whatsapp_send_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER REFERENCES vendas(id),
      tipo TEXT NOT NULL,
      destino TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      erro TEXT,
      detalhes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
} catch (dbInitErr) {
  console.error('[whatsapp_send_log] falha ao criar tabela:', dbInitErr.message);
}

// ─── Eventos manuais de replay para popup do Painel TV ─────────────────────
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tv_sale_replays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER REFERENCES vendas(id),
      vendedor_nome TEXT,
      cliente TEXT,
      valor_mensal REAL DEFAULT 0,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
} catch (dbInitErr) {
  console.error('[tv_sale_replays] falha ao criar tabela:', dbInitErr.message);
}

// Backfill: popula whatsapp_send_log a partir de vendas existentes (roda uma vez)
try {
  const logCount = db.prepare('SELECT COUNT(*) AS c FROM whatsapp_send_log').get().c;
  if (logCount === 0) {
    const vendas = db.prepare(`
      SELECT id, responsavel_whatsapp, whatsapp_status, whatsapp_error, pontos_nomes, created_at
      FROM vendas ORDER BY id
    `).all();
    const ins = db.prepare('INSERT INTO whatsapp_send_log (venda_id, tipo, destino, status, erro, detalhes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let filled = 0;
    for (const v of vendas) {
      const phone = sanitizePhoneForWhatsApp(v.responsavel_whatsapp);
      const ts = v.created_at || null;
      // Log da notificação do grupo
      if (v.whatsapp_status === 'enviado') {
        ins.run(v.id, 'notificacao_grupo', null, 'enviado', null, 'Backfill histórico', ts);
      } else if (v.whatsapp_status === 'falha') {
        ins.run(v.id, 'notificacao_grupo', null, 'falha', v.whatsapp_error || 'Erro desconhecido', 'Backfill histórico', ts);
      } else if (v.whatsapp_status === 'nao_configurado') {
        ins.run(v.id, 'notificacao_grupo', null, 'ignorado', null, 'Evolution API não configurada (backfill)', ts);
      }
      // Log do PDF — não temos certeza se foi enviado de fato, apenas que as condições existiam
      let hasPontos = false;
      try { const arr = JSON.parse(v.pontos_nomes || '[]'); hasPontos = arr.length > 0; } catch { /* ignore */ }
      if (v.whatsapp_status === 'enviado' && phone && hasPontos) {
        ins.run(v.id, 'pdf_desktop', phone, 'incerto', null, 'Backfill — sem confirmação real de entrega', ts);
        ins.run(v.id, 'pdf_mobile', phone, 'incerto', null, 'Backfill — sem confirmação real de entrega', ts);
      } else if (v.whatsapp_status === 'enviado' && !phone) {
        ins.run(v.id, 'pdf_desktop', null, 'ignorado', null, 'WhatsApp não informado (backfill)', ts);
      }
      filled++;
    }
    if (filled > 0) console.log(`[whatsapp_send_log] Backfill: ${filled} venda(s) históricas importadas.`);
  }
} catch (bfErr) {
  console.error('[whatsapp_send_log] backfill erro:', bfErr.message);
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
      vendedor_id INTEGER,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      data_venda TEXT,
      cliente TEXT NOT NULL,
      cnpj TEXT,
      pontos_contratados TEXT,
      valor_mensal REAL DEFAULT 0,
      total_contrato REAL DEFAULT 0,
      permuta_valor_servico REAL DEFAULT 0,
      permuta_valor_receber REAL DEFAULT 0,
      permuta_total_receber REAL DEFAULT 0,
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
try { db.prepare("ALTER TABLE vendas_comercial ADD COLUMN tipo TEXT NOT NULL DEFAULT 'Nova Venda'").run(); } catch {}
try { db.prepare("ALTER TABLE vendas_comercial ADD COLUMN vendedor_id INTEGER").run(); } catch {}
try { db.prepare("ALTER TABLE vendas_comercial ADD COLUMN permuta_valor_servico REAL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE vendas_comercial ADD COLUMN permuta_valor_receber REAL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE vendas_comercial ADD COLUMN permuta_total_receber REAL DEFAULT 0").run(); } catch {}

// Repair seller linkage in vendas_comercial to use seller user (vendedor_id/username)
try {
  // 1) Prefer linked vendas.vendedor_id when available
  const fromLinkedVendas = db.prepare(`
    UPDATE vendas_comercial
    SET vendedor_id = (
      SELECT v.vendedor_id
      FROM vendas v
      WHERE v.id = vendas_comercial.venda_id
    )
    WHERE (vendedor_id IS NULL OR vendedor_id = 0)
      AND venda_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM vendas v
        WHERE v.id = vendas_comercial.venda_id
          AND v.vendedor_id IS NOT NULL
          AND v.vendedor_id > 0
      )
  `).run();

  // 2) If vendedor_nome already stores username, backfill vendedor_id
  const fromUsername = db.prepare(`
    UPDATE vendas_comercial
    SET vendedor_id = (
      SELECT u.id
      FROM admin_users u
      WHERE lower(u.username) = lower(vendas_comercial.vendedor_nome)
      LIMIT 1
    )
    WHERE (vendedor_id IS NULL OR vendedor_id = 0)
      AND TRIM(COALESCE(vendedor_nome, '')) <> ''
      AND EXISTS (
        SELECT 1
        FROM admin_users u
        WHERE lower(u.username) = lower(vendas_comercial.vendedor_nome)
      )
  `).run();

  // 3) Canonicalize vendedor_nome to username whenever vendedor_id is known
  const canonicalizeName = db.prepare(`
    UPDATE vendas_comercial
    SET vendedor_nome = (
      SELECT u.username
      FROM admin_users u
      WHERE u.id = vendas_comercial.vendedor_id
      LIMIT 1
    ),
    updated_at = datetime('now')
    WHERE vendedor_id IS NOT NULL
      AND vendedor_id > 0
      AND EXISTS (
        SELECT 1
        FROM admin_users u
        WHERE u.id = vendas_comercial.vendedor_id
          AND COALESCE(vendas_comercial.vendedor_nome, '') <> COALESCE(u.username, '')
      )
  `).run();

  const repaired = Number(fromLinkedVendas.changes || 0) + Number(fromUsername.changes || 0) + Number(canonicalizeName.changes || 0);
  if (repaired > 0) {
    console.log(`[gestao] repaired ${repaired} seller link field(s) in vendas_comercial`);
  }
} catch (e) {
  console.error('[gestao] repair seller linkage failed:', e.message);
}

// Repair legacy seller aliases using known id-linked rows.
// If an alias (vendedor_nome) already appears with a concrete vendedor_id
// somewhere in the dataset, we can safely assign that same id to orphan rows.
try {
  const aliasToIds = new Map();
  const addAlias = (aliasRaw, sellerIdRaw) => {
    const alias = String(aliasRaw || '').trim().toLowerCase();
    const sellerId = Number(sellerIdRaw || 0);
    if (!alias || !Number.isFinite(sellerId) || sellerId <= 0) return;
    if (!aliasToIds.has(alias)) aliasToIds.set(alias, new Set());
    aliasToIds.get(alias).add(sellerId);
  };

  const vendasKnown = db.prepare(`
    SELECT vendedor_nome, vendedor_id
    FROM vendas
    WHERE vendedor_id IS NOT NULL
      AND vendedor_id > 0
      AND TRIM(COALESCE(vendedor_nome, '')) <> ''
  `).all();
  for (const row of vendasKnown) addAlias(row.vendedor_nome, row.vendedor_id);

  const comercialKnown = db.prepare(`
    SELECT vendedor_nome, vendedor_id
    FROM vendas_comercial
    WHERE vendedor_id IS NOT NULL
      AND vendedor_id > 0
      AND TRIM(COALESCE(vendedor_nome, '')) <> ''
  `).all();
  for (const row of comercialKnown) addAlias(row.vendedor_nome, row.vendedor_id);

  const updateVendas = db.prepare(`
    UPDATE vendas
    SET vendedor_id = ?,
        vendedor_nome = COALESCE((SELECT username FROM admin_users WHERE id = ?), vendedor_nome),
        updated_at = datetime('now')
    WHERE (vendedor_id IS NULL OR vendedor_id = 0)
      AND lower(trim(COALESCE(vendedor_nome, ''))) = ?
  `);
  const updateComercial = db.prepare(`
    UPDATE vendas_comercial
    SET vendedor_id = ?,
        vendedor_nome = COALESCE((SELECT username FROM admin_users WHERE id = ?), vendedor_nome),
        updated_at = datetime('now')
    WHERE (vendedor_id IS NULL OR vendedor_id = 0)
      AND lower(trim(COALESCE(vendedor_nome, ''))) = ?
  `);

  let repairedAliases = 0;
  for (const [alias, ids] of aliasToIds.entries()) {
    if (ids.size !== 1) continue;
    const sellerId = Number(Array.from(ids)[0] || 0);
    if (!Number.isFinite(sellerId) || sellerId <= 0) continue;
    repairedAliases += Number(updateVendas.run(sellerId, sellerId, alias).changes || 0);
    repairedAliases += Number(updateComercial.run(sellerId, sellerId, alias).changes || 0);
  }

  if (repairedAliases > 0) {
    console.log(`[gestao] repaired ${repairedAliases} seller alias row(s) with canonical vendedor_id`);
  }
} catch (e) {
  console.error('[gestao] repair seller aliases failed:', e.message);
}

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

// Repair vendas_comercial rows where valor_mensal is null/0 but linked vendas has data
try {
  const nullRows = db.prepare(`
    SELECT vc.id, v.valor_mensal AS v_valor, v.periodo, v.responsavel_nome, v.responsavel_whatsapp
    FROM vendas_comercial vc
    JOIN vendas v ON v.id = vc.venda_id
    WHERE vc.venda_id IS NOT NULL
      AND (vc.valor_mensal IS NULL OR vc.valor_mensal = 0)
      AND v.valor_mensal IS NOT NULL AND v.valor_mensal != ''
  `).all();
  const stmtFixNull = db.prepare(`
    UPDATE vendas_comercial SET valor_mensal = ?, total_contrato = ?, qtde_parcelas = ?, contato = COALESCE(?, contato), updated_at = datetime('now') WHERE id = ?
  `);
  for (const row of nullRows) {
    const valorNum = parseBRLCurrency(row.v_valor);
    const match = String(row.periodo || '').match(/^(\d+)\s+mes/i);
    const meses = match ? Number(match[1]) : 1;
    const contato = [row.responsavel_nome, row.responsavel_whatsapp].filter(Boolean).join(' · ') || null;
    stmtFixNull.run(valorNum, valorNum * meses, meses, contato, row.id);
  }
  if (nullRows.length > 0) console.log(`[gestao] repaired ${nullRows.length} null-value vendas_comercial rows`);
} catch (e) { console.error('[gestao] repair null-value sync failed:', e.message); }

// Migration: add data_primeira_parcela column to vendas table
try { db.prepare("ALTER TABLE vendas ADD COLUMN data_primeira_parcela TEXT").run(); } catch {}
// Migration: add dia_pagamento_dia column to vendas (integer day only)
try { db.prepare("ALTER TABLE vendas ADD COLUMN dia_pagamento_dia INTEGER").run(); } catch {}

// ─── Sync vendas_comercial → vendas (todos os meses) ──────────────────────
// Cria registros em `vendas` para entradas da Gestão Comercial sem venda_id
// e migra os status booleanos (status_contrato, status_contrato_assinado, ...)
// para venda_etapas. Sem isso, vendas adicionadas manualmente aparecem
// indevidamente nos lembretes do financeiro mesmo após terem sido marcadas
// como concluídas.
try {
  const unlinked = db.prepare(`
    SELECT * FROM vendas_comercial
    WHERE (venda_id IS NULL OR venda_id = 0)
    AND UPPER(COALESCE(cliente,'')) NOT IN ('META BASE','HIPER META','META MÊS','META MES','CLIENTE')
  `).all();

  const insertVenda = db.prepare(`
    INSERT INTO vendas (tipo, razao_social, cnpj, pontos_nomes, valor_mensal,
      periodo, vendedor_id, vendedor_nome, whatsapp_status, status, obs, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nao_configurado', 'ativa', ?, COALESCE(?, datetime('now')))
  `);
  const linkBack = db.prepare(`
    UPDATE vendas_comercial
    SET venda_id = ?,
        vendedor_id = COALESCE(vendedor_id, ?),
        vendedor_nome = COALESCE(?, vendedor_nome)
    WHERE id = ?
  `);
  const insertEtapa = db.prepare(`
    INSERT INTO venda_etapas (venda_id, etapa_key, etapa_label, emoji, confirmado_at, confirmado_por, removido)
    VALUES (?, ?, ?, ?, datetime('now'), 'gestao-backfill', 0)
    ON CONFLICT (venda_id, etapa_key) DO NOTHING
  `);

  // Mapa local (ETAPAS_VENDA ainda não foi declarado neste ponto do arquivo)
  const STATUS_BACKFILL = [
    { col: 'status_contrato',           key: 'contrato_enviado',  label: 'Contrato Enviado',     emoji: '📤' },
    { col: 'status_contrato_assinado',  key: 'contrato_assinado', label: 'Contrato Assinado',    emoji: '✅' },
    { col: 'status_conteudo',           key: 'cobranca_material', label: 'Cobrança de Material', emoji: '📦' },
    { col: 'status_checkin',            key: 'material_recebido', label: 'Material Recebido',    emoji: '🎨' },
    { col: 'status_faturado',           key: 'veiculando',        label: 'Veiculando',           emoji: '📡' },
  ];

  let syncCount = 0;
  let etapasMigradas = 0;
  for (const vc of unlinked) {
    try {
      const pontosNomes = vc.pontos_contratados
        ? JSON.stringify(String(vc.pontos_contratados).split(',').map(s => s.trim()).filter(Boolean))
        : '[]';
      const periodo = vc.qtde_parcelas > 1 ? `${vc.qtde_parcelas} meses` : null;
      const sellerIdentity = resolveSellerIdentity({
        userId: vc.vendedor_id,
        sellerName: vc.vendedor_nome,
      });
      const result = insertVenda.run(
        vc.tipo || 'Nova Venda',
        vc.cliente,
        vc.cnpj || null,
        pontosNomes,
        vc.valor_mensal || null,
        periodo,
        sellerIdentity.sellerId || null,
        sellerIdentity.username || vc.vendedor_nome || null,
        vc.obs || null,
        vc.data_venda || null
      );
      const newVendaId = result.lastInsertRowid;
      linkBack.run(newVendaId, sellerIdentity.sellerId || null, sellerIdentity.username || null, vc.id);
      syncCount++;

      for (const item of STATUS_BACKFILL) {
        if (vc[item.col]) {
          try {
            insertEtapa.run(newVendaId, item.key, item.label, item.emoji);
            etapasMigradas++;
          } catch { /* ignore conflict */ }
        }
      }
    } catch (syncRowErr) {
      console.warn(`[gestão→vendas] sync failed for vc.id=${vc.id}:`, syncRowErr.message);
    }
  }
  if (syncCount > 0) {
    console.log(`[gestão→vendas] backfill: ${syncCount} venda(s) vinculadas, ${etapasMigradas} etapa(s) migrada(s).`);
  }
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
    'evolution_pdf_instance',
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

function getTvEvolutionInstance(settings = null) {
  const evo = settings || getEvolutionSettings();
  return String(evo.evolution_tv_instance || 'aux adm').trim() || 'aux adm';
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

/**
 * Sanitiza número de telefone para formato WhatsApp brasileiro.
 * Remove caracteres não-numéricos e adiciona código do país 55 se ausente.
 * Ex: "(43) 99996-3014" -> "5543999963014"
 */
function sanitizePhoneForWhatsApp(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  // Se tem 10 ou 11 dígitos (DDD + número), falta o código do país
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }
  return digits;
}

function formatDateToBrazil(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatPhoneForMessage(raw) {
  const digitsOnly = String(raw || '').replace(/\D/g, '');
  if (!digitsOnly) return '';

  const local = digitsOnly.startsWith('55') && digitsOnly.length >= 12
    ? digitsOnly.slice(2)
    : digitsOnly;

  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return raw || digitsOnly;
}

function sanitizeFileNamePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveTechnicalPdfClientName({ nomeFantasia, razaoSocial } = {}) {
  const fantasia = String(nomeFantasia || '').trim();
  if (fantasia) return fantasia;
  const razao = String(razaoSocial || '').trim();
  return razao || 'Cliente';
}

function buildTechnicalPdfTitle({ nomeFantasia, razaoSocial } = {}) {
  const clientName = resolveTechnicalPdfClientName({ nomeFantasia, razaoSocial });
  const safeClientName = sanitizeFileNamePart(clientName) || 'Cliente';
  return `Informações Técnicas - Intermidia x ${safeClientName}`;
}

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

function buildVendaWhatsappMessage({ tipo, vendedorNome, razaoSocial, nomeFantasia, cnpj, pontosNomes, pontosPrecos,
  valorMensal, tipoValor, cotaContratada, planoFidelidade, periodo, diaPagamento, dataPrimeiraParcela, dataInicioVeiculacao, diaPagamentoDia,
  viaAgencia, agenciaNome, comissaoPct,
  trocaMaterial,
  responsavelNome, responsavelWhatsapp, responsavelFixo, responsavelEmail,
  criativoNome, criativoWhatsapp, criativoEmail,
  obs }) {

  const isRenovacao = tipo === 'Renovação';
  const headerEmoji = isRenovacao ? '🔄' : '🟠';
  const headerLabel = isRenovacao ? 'RENOVAÇÃO' : 'NOVA VENDA';

  const lines = [];
  const dataInicioVeiculacaoBr = formatDateToBrazil(dataInicioVeiculacao);
  const dataPrimeiraParcelaBr = formatDateToBrazil(dataPrimeiraParcela);

  lines.push(`${headerEmoji} *${headerLabel}* — ${vendedorNome}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  if (cnpj) {
    lines.push(`🏢 *${razaoSocial}*`);
    if (nomeFantasia) lines.push(`_${nomeFantasia}_`);
    lines.push(`_CNPJ: ${cnpj}_`);
  } else {
    lines.push(`🏢 *${razaoSocial}*`);
    if (nomeFantasia) lines.push(`_${nomeFantasia}_`);
  }
  lines.push('');

  const nomes = Array.isArray(pontosNomes) ? pontosNomes : JSON.parse(pontosNomes || '[]');
  let precos = {};
  try { precos = typeof pontosPrecos === 'string' ? JSON.parse(pontosPrecos || '{}') : (pontosPrecos || {}); } catch { /* ignore */ }
  if (nomes.length > 0) {
    lines.push(`📍 *PONTO${nomes.length > 1 ? 'S' : ''} CONTRATADO${nomes.length > 1 ? 'S' : ''}*`);
    nomes.forEach(n => {
      const preco = precos[n];
      lines.push(preco ? `  • ${n} — R$ ${preco}` : `  • ${n}`);
    });
    lines.push('');
  }

  const financeiro = [
    valorMensal ? `💰 Valor mensal: *R$ ${valorMensal}*${tipoValor ? ` _(${tipoValor})_` : ''}` : null,
    periodo     ? `📅 Período: *${periodo}*` : null,
    dataInicioVeiculacaoBr ? `📺 Data de início da veiculação: *${dataInicioVeiculacaoBr}*` : null,
    dataPrimeiraParcelaBr ? `📆 Data da 1ª parcela: *${dataPrimeiraParcelaBr}*` : null,
    diaPagamentoDia ? `📆 Dia de pagamento: *Dia ${diaPagamentoDia} de cada mês*` : (diaPagamento ? `📆 Dia de pagamento: *dia ${diaPagamento}*` : null),
    cotaContratada ? `⏱️ Cota contratada: *${cotaContratada}*` : null,
    planoFidelidade ? `🤝 Plano Fidelidade: *Sim*` : null,
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

  if (responsavelNome || responsavelWhatsapp || responsavelFixo || responsavelEmail) {
    lines.push('👤 *RESPONSÁVEL PELO CLIENTE*');
    if (responsavelNome)      lines.push(`Nome: ${responsavelNome}`);
    if (responsavelWhatsapp)  lines.push(`WhatsApp: ${responsavelWhatsapp}`);
    if (responsavelFixo)      lines.push(`Telefone Fixo: ${responsavelFixo}`);
    if (responsavelEmail)     lines.push(`E-mail: ${responsavelEmail}`);
  }

  if (criativoNome || criativoWhatsapp || criativoEmail) {
    lines.push('');
    lines.push('🎨 *RESPONSÁVEL PELO CRIATIVO*');
    if (criativoNome)      lines.push(`Nome: ${criativoNome}`);
    if (criativoWhatsapp)  lines.push(`WhatsApp: ${criativoWhatsapp}`);
    if (criativoEmail)     lines.push(`E-mail: ${criativoEmail}`);
  }

  if (obs && String(obs).trim()) {
    lines.push('');
    lines.push(`📝 *OBS:* ${String(obs).trim()}`);
  }

  return lines.join('\n');
}
function normalizeNameForGenderGuess(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function inferPtBrGenderByName(fullName) {
  const normalized = normalizeNameForGenderGuess(fullName);
  if (!normalized) return null;

  const firstName = normalized.split(/[\s-]+/)[0] || '';
  if (!firstName) return null;

  const femaleNames = new Set([
    'ana', 'maria', 'joana', 'juliana', 'fernanda', 'patricia', 'beatriz', 'camila', 'carla',
    'gabriela', 'isabela', 'mariana', 'laura', 'leticia', 'amanda', 'aline', 'renata', 'paula',
    'raquel', 'tatiana', 'monica', 'daniela', 'bruna', 'eduarda'
  ]);
  const maleNames = new Set([
    'joao', 'jose', 'pedro', 'carlos', 'marcos', 'marcio', 'lucas', 'rafael', 'gabriel',
    'felipe', 'diego', 'gustavo', 'thiago', 'rodrigo', 'leonardo', 'anderson', 'vinicius',
    'bruno', 'paulo', 'renato', 'daniel', 'eduardo'
  ]);

  if (femaleNames.has(firstName)) return 'feminino';
  if (maleNames.has(firstName)) return 'masculino';

  const masculineAExceptions = new Set(['nikola', 'luca', 'josua']);
  const feminineOExceptions = new Set(['darlene']);

  if (firstName.endsWith('a') && !masculineAExceptions.has(firstName)) return 'feminino';
  if (firstName.endsWith('o') && !feminineOExceptions.has(firstName)) return 'masculino';

  return null;
}
function buildSellerPartnerPhrase(vendedorNome) {
  const nome = String(vendedorNome || '').trim();
  if (!nome) return 'junto com nosso time';

  const guessedGender = inferPtBrGenderByName(nome);
  if (guessedGender === 'feminino') return `junto com a ${nome}`;
  if (guessedGender === 'masculino') return `junto com o ${nome}`;

  // Fallback neutro para evitar erro de concordancia quando nao houver confianca.
  return `junto com ${nome}`;
}

async function sendTechnicalPdfsForVenda({
  vendaId,
  responsavelWhatsApp,
  responsavelNome,
  vendedorNome,
  pontosNomes,
  nomeFantasia = '',
  razaoSocial = '',
  planoFidelidade = false,
  trigger = 'auto',
  actorName = '',
}) {
  const triggerLabel = trigger === 'manual_retry'
    ? `retry manual${actorName ? ` por ${actorName}` : ''}`
    : 'envio automatico';

  const logSend = (tipo, destino, status, erro, detalhes) => {
    try {
      db.prepare('INSERT INTO whatsapp_send_log (venda_id, tipo, destino, status, erro, detalhes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(vendaId, tipo, destino, status, erro || null, detalhes || null);
    } catch {
      // non-blocking log failure
    }
  };

  const evoClient = getEvolutionSettings();
  if (!evoClient.evolution_api_url || !evoClient.evolution_instance || !evoClient.evolution_api_key) {
    logSend('pdf_desktop', null, 'ignorado', null, `Evolution API nao configurada (${triggerLabel})`);
    return {
      ok: false,
      vendaId,
      reason: 'nao_configurado',
      error: 'Evolution API nao configurada.',
    };
  }

  const clientPhone = sanitizePhoneForWhatsApp(responsavelWhatsApp);
  if (!clientPhone) {
    logSend('pdf_desktop', null, 'ignorado', null, `WhatsApp do responsavel nao informado (${triggerLabel})`);
    return {
      ok: false,
      vendaId,
      reason: 'telefone_ausente',
      error: 'WhatsApp do responsavel nao informado.',
    };
  }

  let pontosArr = [];
  try {
    pontosArr = Array.isArray(pontosNomes) ? pontosNomes : JSON.parse(pontosNomes || '[]');
  } catch {
    logSend('pdf_desktop', clientPhone, 'falha', 'Falha ao parsear pontos_nomes', `Parse invalido (${triggerLabel})`);
    return {
      ok: false,
      vendaId,
      phone: clientPhone,
      reason: 'pontos_invalidos',
      error: 'Falha ao parsear pontos da venda.',
    };
  }

  if (!Array.isArray(pontosArr) || pontosArr.length === 0) {
    logSend('pdf_desktop', clientPhone, 'ignorado', null, `Sem pontos para gerar PDF (${triggerLabel})`);
    return {
      ok: false,
      vendaId,
      phone: clientPhone,
      reason: 'sem_pontos',
      error: 'Sem pontos para gerar PDF.',
    };
  }

  const nomeResponsavel = responsavelNome ? String(responsavelNome).trim() : 'cliente';
  const nomeVendedor = vendedorNome || 'nosso time';
  const sellerPartnerPhrase = buildSellerPartnerPhrase(nomeVendedor);
  const pdfTitle = buildTechnicalPdfTitle({ nomeFantasia, razaoSocial });
  const pdfDesktopFileName = `${sanitizeFileNamePart(pdfTitle) || 'Informações Técnicas'}.pdf`;
  const pdfMobileFileName = `${sanitizeFileNamePart(pdfTitle) || 'Informações Técnicas'} Mobile.pdf`;
  const pdfOptions = {
    pdfTitle,
    mobileTitle: `${pdfTitle} Mobile`,
    forcedLoopLabel: planoFidelidade ? '6 Minutos' : '',
  };
  const caption = `Oi, ${nomeResponsavel}! Tudo bem? 😄\n\nPassando pra te dar os parabens pela escolha dos pontos — excelente decisao!\n\nEu sou o assistente de criacao que trabalha ${sellerPartnerPhrase} e vou te ajudar com tudo que envolver criativos.\n\nTe enviei a proposta tecnica com os detalhes 📄\n\nSe quiser trocar ideias ou precisar de ajuda com as artes, estou por aqui!`;

  let desktopStatus = 'pendente';
  let mobileStatus = 'pendente';
  let desktopError = null;
  let mobileError = null;
  let photoModeUsed = 'full';

  try {
    const generated = await generatePdfsFromPointNames(db, pontosArr, pdfOptions);
    const { desktop, mobile } = generated;
    photoModeUsed = generated?.photoModeUsed || 'full';

    const photoModeLabel = photoModeUsed === 'none'
      ? 'sem fotos'
      : photoModeUsed === 'compact'
        ? 'fotos compactas'
        : 'fotos completas';

    // Envia PDF desktop
    const tmpDesktop = path.join(require('os').tmpdir(), `venda_${vendaId}_tecnico_retry.pdf`);
    fs.writeFileSync(tmpDesktop, desktop);
    try {
      await sendEvolutionDocument({
        apiUrl: evoClient.evolution_api_url,
        instance: evoClient.evolution_pdf_instance || evoClient.evolution_instance,
        apiKey: evoClient.evolution_api_key,
        number: clientPhone,
        caption,
        filePath: tmpDesktop,
        fileName: pdfDesktopFileName
      });
      desktopStatus = 'enviado';
      logSend('pdf_desktop', clientPhone, 'enviado', null, `${pontosArr.length} ponto(s) (${photoModeLabel}; ${triggerLabel})`);
    } catch (err) {
      desktopStatus = 'falha';
      desktopError = err.message;
      logSend('pdf_desktop', clientPhone, 'falha', err.message, `Falha no desktop (${triggerLabel})`);
    } finally {
      try { fs.unlinkSync(tmpDesktop); } catch { /* ignore */ }
    }

    // Envia PDF mobile
    const tmpMobile = path.join(require('os').tmpdir(), `venda_${vendaId}_tecnico_mobile_retry.pdf`);
    fs.writeFileSync(tmpMobile, mobile);
    try {
      await sendEvolutionDocument({
        apiUrl: evoClient.evolution_api_url,
        instance: evoClient.evolution_pdf_instance || evoClient.evolution_instance,
        apiKey: evoClient.evolution_api_key,
        number: clientPhone,
        caption: '📱 Versão mobile da proposta técnica:',
        filePath: tmpMobile,
        fileName: pdfMobileFileName
      });
      mobileStatus = 'enviado';
      logSend('pdf_mobile', clientPhone, 'enviado', null, `${pontosArr.length} ponto(s) (${photoModeLabel}; ${triggerLabel})`);
    } catch (err) {
      mobileStatus = 'falha';
      mobileError = err.message;
      logSend('pdf_mobile', clientPhone, 'falha', err.message, `Falha no mobile (${triggerLabel})`);
    } finally {
      try { fs.unlinkSync(tmpMobile); } catch { /* ignore */ }
    }
  } catch (genErr) {
    logSend('pdf_geracao', clientPhone, 'falha', genErr.message, `Falha ao gerar PDFs (${triggerLabel})`);
    return {
      ok: false,
      vendaId,
      phone: clientPhone,
      reason: 'erro_geracao',
      error: genErr.message,
      desktop: 'falha',
      mobile: 'falha',
    };
  }

  return {
    ok: desktopStatus === 'enviado' || mobileStatus === 'enviado',
    vendaId,
    phone: clientPhone,
    pontos: pontosArr.length,
    photo_mode: photoModeUsed,
    desktop: desktopStatus,
    mobile: mobileStatus,
    desktop_error: desktopError,
    mobile_error: mobileError,
  };
}

const VENDA_DRAFT_FORM_FIELDS = [
  'tipo',
  'razao_social',
  'nome_fantasia',
  'cnpj',
  'valor_mensal',
  'permuta_valor_servico',
  'permuta_valor_receber',
  'cota_contratada',
  'plano_fidelidade',
  'tipo_valor',
  'via_agencia',
  'agencia_nome',
  'comissao_pct',
  'troca_material',
  'periodo_tipo',
  'periodo_meses',
  'periodo_inicio',
  'periodo_fim',
  'data_primeira_parcela',
  'data_inicio_veiculacao',
  'dia_pagamento_dia',
  'responsavel_nome',
  'responsavel_whatsapp',
  'email',
  'criativo_nome',
  'criativo_whatsapp',
  'criativo_email',
  'obs',
];

function normalizeVendaDraftPayload(payload) {
  const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const rawForm = safePayload.form && typeof safePayload.form === 'object' && !Array.isArray(safePayload.form)
    ? safePayload.form
    : {};

  const form = {};
  for (const key of VENDA_DRAFT_FORM_FIELDS) {
    const value = rawForm[key];
    if (typeof value === 'boolean') {
      form[key] = value;
    } else if (value === null || value === undefined) {
      form[key] = '';
    } else {
      form[key] = String(value).slice(0, 600);
    }
  }

  const selectedPontos = Array.isArray(safePayload.selectedPontos)
    ? safePayload.selectedPontos
        .slice(0, 80)
        .map((p) => {
          const id = Number(p?.id);
          if (!Number.isFinite(id) || id <= 0) return null;
          return {
            id,
            nome: String(p?.nome || '').slice(0, 220),
            cidade: String(p?.cidade || '').slice(0, 120),
            tipo: String(p?.tipo || '').slice(0, 120),
          };
        })
        .filter(Boolean)
    : [];

  const rawPrecos = safePayload.pontoPrecos && typeof safePayload.pontoPrecos === 'object' && !Array.isArray(safePayload.pontoPrecos)
    ? safePayload.pontoPrecos
    : {};
  const pontoPrecos = {};
  for (const [key, value] of Object.entries(rawPrecos)) {
    const numericKey = String(Number(key));
    if (!/^\d+$/.test(numericKey)) continue;
    pontoPrecos[numericKey] = String(value ?? '').slice(0, 24);
  }

  return {
    form,
    selectedPontos,
    pontoPrecos,
    search: String(safePayload.search || '').slice(0, 160),
    saved_at: new Date().toISOString(),
  };
}

const PLANO_FIDELIDADE_BRAVI_RAZAO_SOCIAL = 'Bravi Comercio de Bebidas e Alimentos LTDA';

function parseVendaPointNames(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  const rawText = String(rawValue || '').trim();
  if (!rawText) return [];

  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    }
  } catch {
    // Legacy rows may contain comma-separated text instead of JSON.
  }

  return rawText
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function getPlanoFidelidadeBraviPoints() {
  const targetName = normalizeTextForMatch(PLANO_FIDELIDADE_BRAVI_RAZAO_SOCIAL);
  const rows = db.prepare(`
    SELECT id, razao_social, pontos_nomes, created_at
    FROM vendas
    WHERE COALESCE(TRIM(pontos_nomes), '') <> ''
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `).all();

  for (const row of rows) {
    if (normalizeTextForMatch(row?.razao_social) !== targetName) continue;

    const parsedNames = parseVendaPointNames(row?.pontos_nomes);
    if (parsedNames.length === 0) continue;

    const uniqueNames = Array.from(new Set(parsedNames));
    if (uniqueNames.length === 0) continue;

    return {
      found: true,
      sourceVendaId: row.id,
      sourceCreatedAt: row.created_at || null,
      pontosNomes: uniqueNames,
    };
  }

  return {
    found: false,
    sourceVendaId: null,
    sourceCreatedAt: null,
    pontosNomes: [],
  };
}

app.get('/api/vendas/plano-fidelidade/pontos', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const payload = getPlanoFidelidadeBraviPoints();
    res.json({
      cliente_razao_social: PLANO_FIDELIDADE_BRAVI_RAZAO_SOCIAL,
      found: payload.found,
      source_venda_id: payload.sourceVendaId,
      source_created_at: payload.sourceCreatedAt,
      pontos_nomes: payload.pontosNomes,
    });
  } catch (err) {
    internalError(res, err);
  }
});

app.post(
  '/api/vendas',
  resolveAuthenticatedUser,
  uploadPi.array('pi', 10),
  async (req, res) => {
    try {
      const {
        tipo = 'Nova Venda',
        razao_social,
        nome_fantasia,
        cnpj,
        valor_mensal,
        tipo_valor,
        cota_contratada,
        plano_fidelidade,
        via_agencia,
        agencia_nome,
        comissao_pct,
        pi_numero,
        tipo_documento,
        endereco_cep,
        troca_material,
        periodo_tipo,
        periodo_meses,
        periodo_inicio,
        periodo_fim,
        dia_pagamento,
        data_primeira_parcela,
        data_inicio_veiculacao,
        dia_pagamento_dia,
        responsavel_nome,
        responsavel_whatsapp,
        responsavel_fixo,
        email,
        criativo_nome,
        criativo_whatsapp,
        criativo_email,
        obs,
        pontos_nomes,
        pontos_precos,
        permuta_valor_servico,
        permuta_valor_receber,
        vendedor_nome
      } = req.body;

      if (!razao_social || !String(razao_social).trim()) {
        return res.status(400).json({ error: 'Razão Social é obrigatória.' });
      }

      if (!responsavel_nome || !String(responsavel_nome).trim()) {
        return res.status(400).json({ error: 'Nome do responsável pela compra é obrigatório.' });
      }

      const responsavelWhatsappFinal = String(responsavel_whatsapp || '').trim();
      const responsavelFixoFinal = String(responsavel_fixo || '').trim();
      if (!responsavelWhatsappFinal && !responsavelFixoFinal) {
        return res.status(400).json({ error: 'Informe WhatsApp ou Telefone Fixo do responsável pela compra.' });
      }
      const sellerIdentity = resolveSellerIdentity({
        userId: req.authUser?.id,
        sellerName: vendedor_nome,
        fallbackUsername: req.authUser?.username,
      });
      const vendedorIdCanonical = sellerIdentity.sellerId || req.authUser?.id || null;
      const vendedorNomeCanonical = sellerIdentity.username || String(vendedor_nome || '').trim() || req.authUser?.username || null;

      const tipoNorm = normalizeTextForMatch(tipo);
      const isRenovacaoVenda = tipoNorm.includes('renov');
      const isPermutaVenda = tipoNorm.includes('permuta');
      const trocaMaterialChoice = parseBooleanField(troca_material);
      if (isRenovacaoVenda && trocaMaterialChoice === null) {
        return res.status(400).json({ error: 'Em renovação, selecione se haverá troca de material (Sim ou Não).' });
      }

      const planoFidelidadeAtivo = plano_fidelidade === 'true' || plano_fidelidade === true;
      const cotaContratadaFinal = String(cota_contratada || '').trim() || (planoFidelidadeAtivo ? '10 Segundos' : '');
      const criativoNomeFinal = String(criativo_nome || '').trim();
      const criativoWhatsappFinal = String(criativo_whatsapp || '').trim();
      const criativoEmailFinal = String(criativo_email || '').trim();
      const valorMensalNum = parseBRLCurrency(valor_mensal);
      const permutaRawServico = parseBRLCurrency(permuta_valor_servico);
      const permutaRawReceber = parseBRLCurrency(permuta_valor_receber);
      const permutaBreakdown = isPermutaVenda
        ? resolvePermutaBreakdown({ total: valorMensalNum, servico: permutaRawServico, receber: permutaRawReceber })
        : resolvePermutaBreakdown();
      const permutaValorServicoFinal = isPermutaVenda && permutaBreakdown.valorServico > 0
        ? formatBRLCurrency(permutaBreakdown.valorServico)
        : null;
      const permutaValorReceberFinal = isPermutaVenda && permutaBreakdown.valorReceber > 0
        ? formatBRLCurrency(permutaBreakdown.valorReceber)
        : null;

      // Monta string de período
      let periodo = '';
      if (periodo_tipo === 'meses' && periodo_meses) {
        periodo = `${periodo_meses} ${Number(periodo_meses) === 1 ? 'mês' : 'meses'}`;
      } else if (periodo_tipo === 'datas' && periodo_inicio && periodo_fim) {
        const fmt = d => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
        periodo = `${fmt(periodo_inicio)} à ${fmt(periodo_fim)}`;
      }

      const piFilesArr = Array.isArray(req.files) ? req.files : [];
      const piPaths = piFilesArr.map(f => f.path);
      const piPath = piPaths[0] || null;
      const piPathStored = piPaths.length ? JSON.stringify(piPaths) : null;

      // Salva no banco
      const stmt = db.prepare(`
        INSERT INTO vendas (tipo, razao_social, nome_fantasia, cnpj, pontos_nomes, pontos_precos, permuta_valor_servico, permuta_valor_receber, valor_mensal, tipo_valor,
          cota_contratada, plano_fidelidade,
          via_agencia, agencia_nome, comissao_pct, troca_material,
          periodo, dia_pagamento, data_primeira_parcela, dia_pagamento_dia,
          responsavel_nome, responsavel_whatsapp, responsavel_fixo, email, criativo_nome, criativo_whatsapp, criativo_email,
          obs, pi_path, vendedor_id, vendedor_nome,
          tipo_documento, pi_numero, endereco_cep,
          whatsapp_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', datetime('now'))
      `);

      const dbResult = stmt.run(
        tipo,
        String(razao_social).trim(),
        nome_fantasia || null,
        cnpj || null,
        pontos_nomes || '[]',
        pontos_precos || '{}',
        permutaValorServicoFinal,
        permutaValorReceberFinal,
        valor_mensal || null,
        tipo_valor || null,
        cotaContratadaFinal || null,
        planoFidelidadeAtivo ? 1 : 0,
        via_agencia === 'true' || via_agencia === true ? 1 : 0,
        agencia_nome || null,
        comissao_pct || null,
        trocaMaterialChoice === true ? 1 : 0,
        periodo || null,
        dia_pagamento || null,
        data_primeira_parcela || null,
        dia_pagamento_dia ? Number(dia_pagamento_dia) : null,
        responsavel_nome || null,
        responsavelWhatsappFinal || null,
        responsavelFixoFinal || null,
        email || null,
        criativoNomeFinal || null,
        criativoWhatsappFinal || null,
        criativoEmailFinal || null,
        obs || null,
        piPathStored || null,
        vendedorIdCanonical,
        vendedorNomeCanonical,
        tipo_documento ? String(tipo_documento).trim() : null,
        pi_numero ? String(pi_numero).trim() : null,
        endereco_cep ? String(endereco_cep).trim() : null
      );

      const vendaId = dbResult.lastInsertRowid;

      // Disparo WhatsApp via Evolution API
      const evo = getEvolutionSettings();
      let whatsappStatus = 'pendente';
      let whatsappError = null;

      if (evo.evolution_api_url && evo.evolution_instance && evo.evolution_api_key && evo.evolution_dest_number) {
        let waMsgId = null;
        try {
          const mensagem = buildVendaWhatsappMessage({
            tipo,
            vendedorNome: sellerIdentity.displayName || vendedorNomeCanonical || 'Vendedor',
            razaoSocial: String(razao_social).trim(),
            nomeFantasia: nome_fantasia || '',
            cnpj: cnpj || '',
            pontosNomes: pontos_nomes || '[]',
            pontosPrecos: pontos_precos || '{}',
            valorMensal: valor_mensal || '',
            tipoValor: tipo_valor || '',
            cotaContratada: cotaContratadaFinal || '',
            planoFidelidade: planoFidelidadeAtivo,
            periodo,
            diaPagamento: dia_pagamento || '',
            dataPrimeiraParcela: data_primeira_parcela || '',
            dataInicioVeiculacao: data_inicio_veiculacao || '',
            diaPagamentoDia: dia_pagamento_dia || '',
            viaAgencia: via_agencia === 'true' || via_agencia === true,
            agenciaNome: agencia_nome || '',
            comissaoPct: comissao_pct || '',
            trocaMaterial: trocaMaterialChoice === true,
            responsavelNome: responsavel_nome || '',
            responsavelWhatsapp: responsavelWhatsappFinal || '',
            responsavelFixo: responsavelFixoFinal || '',
            responsavelEmail: String(email || '').trim(),
            criativoNome: String(criativo_nome || '').trim(),
            criativoWhatsapp: String(criativo_whatsapp || '').trim(),
            criativoEmail: String(criativo_email || '').trim(),
            obs: obs || ''
          });
          const resumoPiCaption = `📎 ${isRenovacaoVenda ? 'Renovação' : 'Nova venda'} — ${String(razao_social).trim()}\nDetalhes completos enviados na mensagem abaixo.`;

          if (piPath) {
            // Envia o primeiro PDF com caption curto para evitar truncamento.
            // O conteúdo completo segue em mensagem de texto na sequência.
            const evoResp = await sendEvolutionDocument({
              apiUrl: evo.evolution_api_url,
              instance: evo.evolution_instance,
              apiKey: evo.evolution_api_key,
              number: evo.evolution_dest_number,
              caption: resumoPiCaption,
              filePath: piPath,
              fileName: piFilesArr[0]?.originalname || 'PI.pdf'
            });
            waMsgId = evoResp?.key?.id || evoResp?.[0]?.key?.id || null;
            await sendEvolutionText({
              apiUrl: evo.evolution_api_url,
              instance: evo.evolution_instance,
              apiKey: evo.evolution_api_key,
              number: evo.evolution_dest_number,
              text: mensagem
            });
            // Envia os PDFs adicionais (se houver) sem caption
            for (let i = 1; i < piFilesArr.length; i += 1) {
              try {
                await sendEvolutionDocument({
                  apiUrl: evo.evolution_api_url,
                  instance: evo.evolution_instance,
                  apiKey: evo.evolution_api_key,
                  number: evo.evolution_dest_number,
                  caption: '',
                  filePath: piFilesArr[i].path,
                  fileName: piFilesArr[i].originalname || `PI-${i + 1}.pdf`
                });
              } catch (extraErr) {
                console.error('[venda] falha ao enviar P.I. adicional:', extraErr?.message || extraErr);
              }
            }
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
          try { db.prepare('INSERT INTO whatsapp_send_log (venda_id, tipo, destino, status, erro, detalhes) VALUES (?, ?, ?, ?, ?, ?)').run(vendaId, 'notificacao_grupo', evo.evolution_dest_number, 'enviado', null, piPath ? 'Com PI anexo' : 'Somente texto'); } catch { /* ignore */ }

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
            try { db.prepare('INSERT INTO whatsapp_send_log (venda_id, tipo, destino, status, erro, detalhes) VALUES (?, ?, ?, ?, ?, ?)').run(vendaId, 'enquete_etapas', evo.evolution_dest_number, 'falha', pollErr.message, null); } catch { /* ignore */ }
          }
        } catch (wErr) {
          console.error('[vendas] falha ao enviar WhatsApp:', wErr.message);
          whatsappStatus = 'falha';
          whatsappError = wErr.message;
          try { db.prepare('INSERT INTO whatsapp_send_log (venda_id, tipo, destino, status, erro, detalhes) VALUES (?, ?, ?, ?, ?, ?)').run(vendaId, 'notificacao_grupo', evo.evolution_dest_number, 'falha', wErr.message, null); } catch { /* ignore */ }
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
        const vNome = vendedorNomeCanonical;
        const vId = vendedorIdCanonical || null;
        // Calcular qtde_parcelas e total_contrato corretamente
        const qtdeParcelas = (periodo_tipo === 'meses' && periodo_meses) ? Number(periodo_meses) : 1;
        const totalContrato = valorMensalNum * qtdeParcelas;
        const permutaValorServicoNum = isPermutaVenda ? permutaBreakdown.valorServico : 0;
        const permutaValorReceberNum = isPermutaVenda ? permutaBreakdown.valorReceber : 0;
        const permutaTotalReceberNum = permutaValorReceberNum * qtdeParcelas;
        // Converter pontos_nomes de JSON para string legível
        let pontosStr = null;
        try {
          const nomes = Array.isArray(pontos_nomes) ? pontos_nomes : JSON.parse(pontos_nomes || '[]');
          pontosStr = nomes.length > 0 ? nomes.join(', ') : null;
        } catch { pontosStr = pontos_nomes || null; }
        // Build contato string from responsável data
        const contatoStr = [responsavel_nome, responsavel_whatsapp].filter(Boolean).join(' · ') || null;
        db.prepare(`
          INSERT INTO vendas_comercial
            (vendedor_nome, vendedor_id, ano, mes, data_venda, cliente, cnpj, pontos_contratados,
             valor_mensal, total_contrato, permuta_valor_servico, permuta_valor_receber, permuta_total_receber,
             qtde_parcelas, contato, email, obs, venda_id, tipo)
          VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          vNome,
          vId,
          now.getFullYear(),
          now.getMonth() + 1,
          String(razao_social).trim(),
          cnpj || null,
          pontosStr,
          valorMensalNum,
          totalContrato,
          permutaValorServicoNum,
          permutaValorReceberNum,
          permutaTotalReceberNum,
          qtdeParcelas,
          contatoStr,
          email || null,
          obs || null,
          vendaId,
          tipo || 'Nova Venda'
        );
      } catch (syncErr) {
        console.warn('[vendas] auto-sync vendas_comercial falhou:', syncErr.message);
      }

      // Venda concluída: remove rascunho vinculado ao vendedor atual.
      if (req.authUser?.id) {
        try {
          db.prepare('DELETE FROM vendas_rascunhos WHERE vendedor_id = ?').run(req.authUser.id);
        } catch (draftClearErr) {
          console.warn('[vendas] falha ao limpar rascunho após registro:', draftClearErr.message);
        }
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

      const shouldSkipTechnicalPdf = isRenovacaoVenda && trocaMaterialChoice === false;
      if (shouldSkipTechnicalPdf) {
        try {
          db.prepare('INSERT INTO whatsapp_send_log (venda_id, tipo, destino, status, erro, detalhes) VALUES (?, ?, ?, ?, ?, ?)')
            .run(vendaId, 'pdf_desktop', responsavelWhatsappFinal || null, 'ignorado', null, 'Renovacao sem troca de material: PDF tecnico nao enviado.');
        } catch {
          // non-blocking log failure
        }
        return;
      }

      // ─── Disparo assíncrono: PDF técnico para o contato correto ───────────
      // Roda em background para não atrasar a resposta ao vendedor.
      setImmediate(() => {
        (async () => {
          const vendedorNomeEfetivo = vendedor_nome || req.authUser?.username || 'nosso time';
          const criativoDestino = sanitizePhoneForWhatsApp(criativoWhatsappFinal);
          const compradorDestino = sanitizePhoneForWhatsApp(responsavel_whatsapp);
          const usaContatoCriativo = Boolean(criativoDestino);
          const destinoPdf = usaContatoCriativo ? criativoWhatsappFinal : responsavel_whatsapp;
          const nomeDestinoPdf = usaContatoCriativo ? (criativoNomeFinal || 'responsável pelos criativos') : responsavel_nome;

          const pdfResult = await sendTechnicalPdfsForVenda({
            vendaId,
            responsavelWhatsApp: destinoPdf,
            responsavelNome: nomeDestinoPdf,
            vendedorNome: vendedorNomeEfetivo,
            pontosNomes: pontos_nomes,
            nomeFantasia: nome_fantasia || '',
            razaoSocial: String(razao_social || '').trim(),
            planoFidelidade: planoFidelidadeAtivo,
            trigger: 'auto',
          });

          if (!usaContatoCriativo || !pdfResult?.ok) {
            return;
          }

          if (!compradorDestino || compradorDestino === criativoDestino) {
            return;
          }

          const evoSettings = getEvolutionSettings();
          if (!evoSettings.evolution_api_url || !evoSettings.evolution_instance || !evoSettings.evolution_api_key) {
            return;
          }

          const nomeCriativoTexto = criativoNomeFinal || 'responsável pelos criativos';
          const numeroCriativoTexto = formatPhoneForMessage(criativoWhatsappFinal || criativoDestino);
          const avisoCriativo = [
            `Olá! Sou do setor criativo da Intermídia e trabalho com o ${vendedorNomeEfetivo}.`,
            '',
            `Enviei os detalhes técnicos de criação para ${nomeCriativoTexto}, no número ${numeroCriativoTexto || criativoDestino}.`,
            '',
            'Parabéns pela sua aquisição e conte com a gente para criar uma campanha de alto impacto!'
          ].join('\n');

          try {
            await sendEvolutionText({
              apiUrl: evoSettings.evolution_api_url,
              instance: evoSettings.evolution_pdf_instance || evoSettings.evolution_instance,
              apiKey: evoSettings.evolution_api_key,
              number: compradorDestino,
              text: avisoCriativo,
            });

            try {
              db.prepare('INSERT INTO whatsapp_send_log (venda_id, tipo, destino, status, erro, detalhes) VALUES (?, ?, ?, ?, ?, ?)')
                .run(vendaId, 'aviso_contato_criativo', compradorDestino, 'enviado', null, `PDF técnico encaminhado para ${nomeCriativoTexto}`);
            } catch {
              // non-blocking log failure
            }
          } catch (noticeErr) {
            try {
              db.prepare('INSERT INTO whatsapp_send_log (venda_id, tipo, destino, status, erro, detalhes) VALUES (?, ?, ?, ?, ?, ?)')
                .run(vendaId, 'aviso_contato_criativo', compradorDestino, 'falha', noticeErr.message, `Falha ao avisar redirecionamento para ${nomeCriativoTexto}`);
            } catch {
              // non-blocking log failure
            }
          }
        })().catch((pdfErr) => {
          console.error(`[vendas/pdf] Falha inesperada no envio assíncrono da venda ${vendaId}:`, pdfErr.message);
        });
      });
      // ─────────────────────────────────────────────────────────────────────

    } catch (err) {
      console.error('[vendas] erro:', err.message);
      internalError(res, err);
    }
  }
);

// ─── Rascunho de Nova Venda (por vendedor) ───────────────────────────────────
app.get('/api/vendas/rascunho', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const row = db.prepare('SELECT payload_json, created_at, updated_at FROM vendas_rascunhos WHERE vendedor_id = ?').get(userId);
    if (!row) return res.json({ draft: null });

    let draft = null;
    try {
      draft = JSON.parse(row.payload_json || '{}');
    } catch {
      draft = null;
    }

    res.json({
      draft,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    });
  } catch (err) {
    internalError(res, err);
  }
});

app.put('/api/vendas/rascunho', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });

    const payload = normalizeVendaDraftPayload(req.body?.payload ?? req.body ?? {});
    const payloadJson = JSON.stringify(payload);

    if (payloadJson.length > 600000) {
      return res.status(400).json({ error: 'Rascunho excede o tamanho máximo permitido.' });
    }

    db.prepare(`
      INSERT INTO vendas_rascunhos (vendedor_id, payload_json, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(vendedor_id)
      DO UPDATE SET payload_json = excluded.payload_json, updated_at = datetime('now')
    `).run(userId, payloadJson);

    const row = db.prepare('SELECT updated_at FROM vendas_rascunhos WHERE vendedor_id = ?').get(userId);
    res.json({ ok: true, updated_at: row?.updated_at || null });
  } catch (err) {
    internalError(res, err);
  }
});

app.delete('/api/vendas/rascunho', requireRoles(['admin', 'gerente_comercial', 'vendedor']), (req, res) => {
  try {
    const userId = Number(req.authUser?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado.' });
    db.prepare('DELETE FROM vendas_rascunhos WHERE vendedor_id = ?').run(userId);
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

// ─── Log de envios WhatsApp (monitoramento) ─────────────────────────────────
app.get('/api/whatsapp-logs', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = db.prepare(`
      SELECT l.*, v.razao_social, v.vendedor_nome, v.responsavel_nome
      FROM whatsapp_send_log l
      LEFT JOIN vendas v ON v.id = l.venda_id
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(limit);
    res.json({ logs: rows });
  } catch (err) {
    console.error('[whatsapp-logs] erro:', err.message);
    res.status(500).json({ error: 'Falha ao buscar logs de envio.' });
  }
});

// ─── Reenvio manual de PDF técnico por venda ───────────────────────────────
app.post('/api/vendas/:id/retry-pdf', requireRoles(['admin', 'gerente_comercial', 'vendedor']), async (req, res) => {
  try {
    const vendaId = Number(req.params.id);
    if (!Number.isInteger(vendaId) || vendaId <= 0) {
      return res.status(400).json({ error: 'ID de venda inválido.' });
    }

    const venda = db.prepare(`
      SELECT id, vendedor_id, vendedor_nome, responsavel_nome, responsavel_whatsapp, criativo_nome, criativo_whatsapp, pontos_nomes,
             nome_fantasia, razao_social, plano_fidelidade
      FROM vendas
      WHERE id = ?
    `).get(vendaId);

    if (!venda) {
      return res.status(404).json({ error: 'Venda não encontrada.' });
    }

    if (req.authUser?.role === 'vendedor' && Number(venda.vendedor_id || 0) !== Number(req.authUser?.id || 0)) {
      return res.status(403).json({ error: 'Você só pode reenviar PDFs das suas próprias vendas.' });
    }

    const destinoWhatsApp = venda.criativo_whatsapp || venda.responsavel_whatsapp;
    const destinoNome = venda.criativo_nome || venda.responsavel_nome;

    const actorName = String(req.authUser?.username || 'usuario').trim();
    const result = await sendTechnicalPdfsForVenda({
      vendaId,
      responsavelWhatsApp: destinoWhatsApp,
      responsavelNome: destinoNome,
      vendedorNome: venda.vendedor_nome || req.authUser?.username || 'nosso time',
      pontosNomes: venda.pontos_nomes,
      nomeFantasia: venda.nome_fantasia || '',
      razaoSocial: venda.razao_social || '',
      planoFidelidade: Number(venda.plano_fidelidade || 0) === 1,
      trigger: 'manual_retry',
      actorName,
    });

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        ...result,
        error: result.error || 'Falha ao reenviar PDFs técnicos.',
      });
    }

    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error('[vendas/retry-pdf] erro:', err.message);
    res.status(500).json({ error: 'Falha ao tentar novamente o envio dos PDFs técnicos.' });
  }
});

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

  const destPhone      = sanitizePhoneForWhatsApp(phone) || String(phone).trim();
  const nomeResp       = responsavel_nome ? String(responsavel_nome).trim() : 'cliente teste';
  const nomeVend       = vendedor_nome    ? String(vendedor_nome).trim()    : req.authUser?.username || 'vendedor';
  const sellerPartnerPhrase = buildSellerPartnerPhrase(nomeVend);
  const caption        = `Oi, ${nomeResp}! Tudo bem? 😄\n\nPassando pra te dar os parabéns pela escolha dos pontos — excelente decisão!\n\nEu sou o assistente de criação que trabalha ${sellerPartnerPhrase} e vou te ajudar com tudo que envolver criativos.\n\nTe enviei a proposta técnica com os detalhes 📄\n\nSe quiser trocar ideias ou precisar de ajuda com as artes, estou por aqui!`;
  const log            = [];

  try {
    log.push(`Gerando PDFs para ${pontosArr.length} ponto(s): ${pontosArr.join(', ')}`);
    const pdfTitle = buildTechnicalPdfTitle({ razaoSocial: 'Cliente Teste' });
    const desktopFileName = `${sanitizeFileNamePart(pdfTitle) || 'Informações Técnicas'}.pdf`;
    const mobileFileName = `${sanitizeFileNamePart(pdfTitle) || 'Informações Técnicas'} Mobile.pdf`;
    const generated = await generatePdfsFromPointNames(db, pontosArr, {
      pdfTitle,
      mobileTitle: `${pdfTitle} Mobile`,
    });
    const { desktop, mobile } = generated;
    const photoModeUsed = generated?.photoModeUsed || 'full';
    log.push(`Modo de fotos: ${photoModeUsed === 'none' ? 'sem fotos' : photoModeUsed === 'compact' ? 'compactas' : 'completas'}`);
    log.push(`PDFs gerados — desktop: ${(desktop.length / 1024).toFixed(0)} KB, mobile: ${(mobile.length / 1024).toFixed(0)} KB`);

    // Envia desktop
    const tmpD = require('path').join(require('os').tmpdir(), `test_pdf_desktop_${Date.now()}.pdf`);
    require('fs').writeFileSync(tmpD, desktop);
    try {
      await sendEvolutionDocument({
        apiUrl: evo.evolution_api_url, instance: evo.evolution_pdf_instance || evo.evolution_instance, apiKey: evo.evolution_api_key,
        number: destPhone, caption, filePath: tmpD, fileName: desktopFileName
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
        apiUrl: evo.evolution_api_url, instance: evo.evolution_pdf_instance || evo.evolution_instance, apiKey: evo.evolution_api_key,
        number: destPhone, caption: '📱 Versão mobile da proposta técnica:', filePath: tmpM,
        fileName: mobileFileName
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
    const existing = db.prepare('SELECT id, vendedor_id FROM vendas WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Venda não encontrada.' });

    const {
      tipo, razao_social, nome_fantasia, cnpj, pontos_nomes, valor_mensal, tipo_valor,
      cota_contratada, plano_fidelidade,
      via_agencia, agencia_nome, comissao_pct, troca_material,
      periodo, dia_pagamento, data_primeira_parcela, dia_pagamento_dia,
      responsavel_nome, responsavel_whatsapp, email, obs, status, vendedor_nome
    } = req.body;
    const sellerIdentity = resolveSellerIdentity({
      userId: existing.vendedor_id,
      sellerName: vendedor_nome,
      fallbackUsername: vendedor_nome,
    });
    const vendedorNomeCanonical = sellerIdentity.username || String(vendedor_nome || '').trim() || null;
    const vendedorIdCanonical = sellerIdentity.sellerId || existing.vendedor_id || null;

    db.prepare(`
      UPDATE vendas SET
        tipo = ?, razao_social = ?, nome_fantasia = ?, cnpj = ?, pontos_nomes = ?, valor_mensal = ?, tipo_valor = ?,
        cota_contratada = ?, plano_fidelidade = ?,
        via_agencia = ?, agencia_nome = ?, comissao_pct = ?, troca_material = ?,
        periodo = ?, dia_pagamento = ?, data_primeira_parcela = ?, dia_pagamento_dia = ?,
        responsavel_nome = ?, responsavel_whatsapp = ?, email = ?, obs = ?, status = ?, vendedor_id = ?, vendedor_nome = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      tipo || 'Nova Venda',
      razao_social || '',
      nome_fantasia || null,
      cnpj || null,
      pontos_nomes || '[]',
      valor_mensal || null,
      tipo_valor || null,
      cota_contratada || null,
      plano_fidelidade ? 1 : 0,
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
      email || null,
      obs || null,
      status || 'ativa',
      vendedorIdCanonical,
      vendedorNomeCanonical,
      id
    );

    const updated = db.prepare('SELECT * FROM vendas WHERE id = ?').get(id);

    // Sync ALL relevant fields to the linked vendas_comercial record
    try {
      let pontosStr = null;
      if (pontos_nomes) {
        try {
          const parsedNomes = JSON.parse(pontos_nomes);
          if (Array.isArray(parsedNomes)) pontosStr = parsedNomes.join(', ');
        } catch {}
      }
      const valorNum = parseBRLCurrency(valor_mensal);
      // Parse qtde_parcelas from periodo (e.g. "12 meses")
      const periodoMatch = String(periodo || '').match(/^(\d+)\s+mes/i);
      const qtde = periodoMatch ? Number(periodoMatch[1]) : 1;
      const totalContrato = valorNum * qtde;
      const contatoStr = [responsavel_nome, responsavel_whatsapp].filter(Boolean).join(' · ') || null;

      db.prepare(`
        UPDATE vendas_comercial SET
          cliente = ?, cnpj = ?, pontos_contratados = COALESCE(?, pontos_contratados),
          valor_mensal = ?, total_contrato = ?, qtde_parcelas = ?,
          contato = ?, email = ?, vendedor_id = ?, vendedor_nome = ?, obs = ?,
          updated_at = datetime('now')
        WHERE venda_id = ?
      `).run(
        razao_social || '',
        cnpj || null,
        pontosStr,
        valorNum,
        totalContrato,
        qtde,
        contatoStr,
        email || null,
        vendedorIdCanonical,
        vendedorNomeCanonical,
        obs || null,
        id
      );
    } catch (syncErr) {
      console.warn('[vendas] PUT sync vendas_comercial falhou:', syncErr.message);
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
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const venda = db.prepare('SELECT id FROM vendas WHERE id = ?').get(id);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada.' });
    db.prepare('DELETE FROM venda_etapas WHERE venda_id = ?').run(id);
    db.prepare('DELETE FROM whatsapp_send_log WHERE venda_id = ?').run(id);
    db.prepare('DELETE FROM tv_sale_replays WHERE venda_id = ?').run(id);
    // Cascade para Gestão Comercial — usa Number(id) para garantir comparação
    // correta com coluna INTEGER no PostgreSQL (evita mismatch string vs int).
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

function extractEvolutionIncomingMessage(payload) {
  const data = payload?.data;
  if (Array.isArray(data?.messages) && data.messages.length) return data.messages[0];
  if (Array.isArray(data) && data.length) return data[0];
  return data || null;
}

function normalizeJid(value) {
  return String(value || '').trim().toLowerCase();
}

function unwrapEvolutionMessage(message) {
  let current = message;
  // Evolution/WA payloads may wrap real content in nested message containers.
  for (let i = 0; i < 6; i += 1) {
    if (!current || typeof current !== 'object') break;
    const nested =
      current?.ephemeralMessage?.message
      || current?.viewOnceMessage?.message
      || current?.viewOnceMessageV2?.message
      || current?.viewOnceMessageV2Extension?.message
      || current?.documentWithCaptionMessage?.message
      || current?.editedMessage?.message;
    if (!nested || nested === current) break;
    current = nested;
  }
  return current || message;
}

function extractEvolutionText(message) {
  if (!message || typeof message !== 'object') return '';
  const msg = unwrapEvolutionMessage(message.message || message);
  return String(
    msg?.conversation
    || msg?.extendedTextMessage?.text
    || msg?.imageMessage?.caption
    || msg?.videoMessage?.caption
    || msg?.documentMessage?.caption
    || msg?.buttonsResponseMessage?.selectedDisplayText
    || msg?.buttonsResponseMessage?.selectedButtonId
    || msg?.listResponseMessage?.title
    || msg?.listResponseMessage?.singleSelectReply?.selectedRowId
    || msg?.templateButtonReplyMessage?.selectedDisplayText
    || msg?.templateButtonReplyMessage?.selectedId
    || msg?.reactionMessage?.text
    || ''
  ).trim();
}

// ─── Sync missed poll votes from Evolution API ──────────────────────────────
const ETAPAS_MAP_GLOBAL = {
  '📤 Contrato Enviado':    { key: 'contrato_enviado',  label: 'Contrato Enviado'    },
  '✅ Contrato Assinado':   { key: 'contrato_assinado', label: 'Contrato Assinado'   },
  '📦 Cobrança de Material':{ key: 'cobranca_material', label: 'Cobrança de Material' },
  '🎨 Material Recebido':   { key: 'material_recebido', label: 'Material Recebido'   },
  '📡 Veiculando':          { key: 'veiculando',        label: 'Veiculando'          },
};

async function syncMissedPollVotes() {
  const evo = getEvolutionSettings();
  if (!evo.evolution_api_url || !evo.evolution_instance || !evo.evolution_api_key) {
    console.log('[poll-sync] Evolution API not configured, skipping.');
    return;
  }

  // Get vendas with poll IDs that have fewer than 5 confirmed etapas
  const vendas = db.prepare(`
    SELECT v.id, v.whatsapp_poll_id
    FROM vendas v
    WHERE v.whatsapp_poll_id IS NOT NULL AND v.whatsapp_poll_id != ''
  `).all();

  if (!vendas.length) {
    console.log('[poll-sync] No vendas with poll IDs.');
    return;
  }

  const destGroup = evo.evolution_dest_number;
  if (!destGroup) return;

  console.log(`[poll-sync] Checking ${vendas.length} vendas with poll IDs...`);

  try {
    const base = evo.evolution_api_url.replace(/\/+$/, '');
    const inst = encodeURIComponent(evo.evolution_instance);

    // Fetch recent messages from the group (poll votes)
    const resp = await fetch(`${base}/chat/findMessages/${inst}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evo.evolution_api_key,
      },
      body: JSON.stringify({
        where: { key: { remoteJid: destGroup } },
        limit: 200,
      }),
    });

    if (!resp.ok) {
      console.log(`[poll-sync] findMessages failed: HTTP ${resp.status}`);
      return;
    }

    const result = await resp.json();
    const messages = result?.messages?.records || result?.records || (Array.isArray(result) ? result : []);

    // Build map of pollId -> venda
    const pollMap = {};
    for (const v of vendas) {
      pollMap[v.whatsapp_poll_id] = v.id;
    }

    let totalSynced = 0;

    for (const msg of messages) {
      const pum = msg?.message?.pollUpdateMessage || msg?.message?.pollUpdateMessageV1;
      if (!pum?.vote?.selectedOptions?.length) continue;

      const creationKey = pum.pollCreationMessageKey?.id;
      if (!creationKey || !pollMap[creationKey]) continue;

      const vendaId = pollMap[creationKey];

      for (const option of pum.vote.selectedOptions) {
        const etapa = ETAPAS_MAP_GLOBAL[option];
        if (!etapa) continue;
        try {
          const r = db.prepare(`
            INSERT INTO venda_etapas (venda_id, etapa_key, etapa_label, emoji, confirmado_at, confirmado_por)
            VALUES (?, ?, ?, '', NOW(), 'webhook-sync')
            ON CONFLICT (venda_id, etapa_key) DO NOTHING
          `).run(vendaId, etapa.key, etapa.label);
          if (r.changes > 0) totalSynced++;
        } catch { /* ignore */ }
      }
    }

    if (totalSynced > 0) {
      console.log(`[poll-sync] Recovered ${totalSynced} missed etapas from Evolution API.`);
    } else {
      console.log('[poll-sync] No missed votes to recover.');
    }
  } catch (err) {
    console.error('[poll-sync] Error:', err.message);
  }
}

// ─── Webhook Evolution API — reações emoji pós-venda ─────────────────────────
app.post('/api/webhooks/whatsapp', async (req, res) => {
  try {
    const payload = req.body;
    const event = payload?.event;

    // Só processa votos em poll (messages.update) e mensagens normais
    const HANDLED = ['messages.upsert', 'message', 'messages.update', 'MESSAGES_UPDATE', 'MESSAGES_UPSERT'];
    if (!HANDLED.includes(event)) {
      return res.json({ ok: true, ignored: 'event-not-handled' });
    }

    let data = payload?.data;
    if (Array.isArray(data)) data = data[0];


    // ── Voto em enquete (poll vote) ──────────────────────────────────────────
    // Evolution v2 sends poll votes as messages.upsert with messageType="pollUpdateMessage"
    // Structure: data.message.pollUpdateMessage.vote.selectedOptions = [...]
    //            data.message.pollUpdateMessage.pollCreationMessageKey.id = <original poll message id>
    // Also handle legacy: data.pollUpdates[0] or data.update.pollUpdates[0]
    const pollUpdateMsg = data?.message?.pollUpdateMessage || data?.message?.pollUpdateMessageV1;
    const pollUpdateLegacy = data?.pollUpdates?.[0] || data?.update?.pollUpdates?.[0];
    const pollVote = pollUpdateMsg?.vote || pollUpdateLegacy?.vote;

    if (pollVote?.selectedOptions?.length) {
      // Poll ID = original poll creation message ID
      const pollId = pollUpdateMsg?.pollCreationMessageKey?.id
        || pollUpdateLegacy?.pollCreationMessageKey?.id
        || data?.key?.id
        || data?.update?.key?.id;

      console.log(`[webhook] poll vote: pollId=${pollId} options=${JSON.stringify(pollVote.selectedOptions)}`);

      if (!pollId) {
        return res.json({ ok: true, ignored: 'empty-vote-no-pollId' });
      }

      const venda = db.prepare(`SELECT id FROM vendas WHERE whatsapp_poll_id = ?`).get(pollId);
      if (!venda) {
        console.log(`[webhook] poll-not-found for pollId=${pollId}`);
        return res.json({ ok: true, ignored: 'poll-not-found', pollId });
      }

      const ETAPAS_MAP = ETAPAS_MAP_GLOBAL;

      let processed = 0;
      for (const option of pollVote.selectedOptions) {
        const etapa = ETAPAS_MAP[option];
        if (!etapa) continue;
        try {
          db.prepare(`
            INSERT INTO venda_etapas (venda_id, etapa_key, etapa_label, emoji, confirmado_at, confirmado_por)
            VALUES (?, ?, ?, '', NOW(), 'webhook')
            ON CONFLICT (venda_id, etapa_key) DO NOTHING
          `).run(venda.id, etapa.key, etapa.label);
          processed++;
        } catch { /* ignore */ }
      }

      console.log(`[webhook] poll-vote processed: vendaId=${venda.id} etapas=${processed}`);
      return res.json({ ok: true, processed: 'poll-vote' });
    }

    // ── Mensagem de grupo -> post-it do painel TV ───────────────────────────
    const incoming = extractEvolutionIncomingMessage(payload);
    const key = incoming?.key || data?.key || payload?.data?.key || {};
    const remoteJid = normalizeJid(key?.remoteJid);
    const messageId = String(key?.id || '').trim();
    const fromMe = Boolean(key?.fromMe);
    const text = extractEvolutionText(incoming || data);
    const groupJid = normalizeJid(getAppSetting('tv_postit_group_jid', ''));

    if (groupJid && remoteJid === groupJid && !fromMe && text) {
      const author = String(
        incoming?.pushName
        || data?.pushName
        || payload?.sender?.pushName
        || payload?.senderName
        || key?.participant
        || 'vendedor'
      ).trim();

      // ── Comandos WhatsApp (/, !) ────────────────────────────────────────
      const cmdMatch = text.match(/^[\/!](renovou|cancelou)\s+(.+)/i);
      if (cmdMatch) {
        const action = cmdMatch[1].toLowerCase(); // 'renovou' ou 'cancelou'
        const clientName = cmdMatch[2].trim();

        if (clientName.length < 2) {
          console.log(`[webhook] command ignored: client name too short "${clientName}"`);
        } else {
          db.prepare(`
            INSERT INTO contract_actions (client_name, action, author)
            VALUES (?, ?, ?)
          `).run(clientName, action, author);

          console.log(`[webhook] command: /${action} "${clientName}" by ${author}`);

          // Reply confirmation in group
          try {
            const evo = getEvolutionSettings();
            const tvInstance = getTvEvolutionInstance(evo);
            if (evo.evolution_api_url && tvInstance && evo.evolution_api_key) {
              const emoji = action === 'renovou' ? '🔄' : '❌';
              const label = action === 'renovou' ? 'RENOVADO' : 'CANCELADO';
              await sendEvolutionText({
                apiUrl: evo.evolution_api_url,
                instance: tvInstance,
                apiKey: evo.evolution_api_key,
                number: remoteJid,
                text: `${emoji} *${label}*: ${clientName}\n✅ Registrado por ${author.split(' ')[0]}. O contrato será atualizado no painel.`
              });
            }
          } catch (replyErr) {
            console.error('[webhook] reply error:', replyErr.message);
          }

          return res.json({ ok: true, processed: 'command', action, client: clientName });
        }
      }

      // ── Post-it normal ──────────────────────────────────────────────────

      if (messageId) {
        db.prepare(`
          INSERT INTO tv_postits (text, author, source, external_message_id)
          VALUES (?, ?, 'whatsapp', ?)
          ON CONFLICT (external_message_id) DO NOTHING
        `).run(text.slice(0, 500), author.slice(0, 120), messageId);
      } else {
        db.prepare(`
          INSERT INTO tv_postits (text, author, source)
          VALUES (?, ?, 'whatsapp')
        `).run(text.slice(0, 500), author.slice(0, 120));
      }

      return res.json({ ok: true, processed: 'tv-postit' });
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
app.get('/api/gestao/monthly-summary', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    res.json(getTvGoalsSnapshot());
  } catch (err) {
    internalError(res, err);
  }
});

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
    let sql = `
      SELECT
        vc.*,
        COALESCE(u_vc.username, u_v.username, u_name.username, vc.vendedor_nome) AS vendedor_username_resolved,
        COALESCE(
          NULLIF(TRIM(COALESCE(u_vc.first_name, '') || ' ' || COALESCE(u_vc.last_name, '')), ''),
          NULLIF(TRIM(COALESCE(u_v.first_name, '') || ' ' || COALESCE(u_v.last_name, '')), ''),
          NULLIF(TRIM(COALESCE(u_name.first_name, '') || ' ' || COALESCE(u_name.last_name, '')), ''),
          COALESCE(u_vc.username, u_v.username, u_name.username, vc.vendedor_nome)
        ) AS vendedor_display_name_resolved,
        COALESCE(vc.vendedor_id, v.vendedor_id, u_name.id) AS vendedor_id_resolved
      FROM vendas_comercial vc
      LEFT JOIN vendas v ON v.id = vc.venda_id
      LEFT JOIN admin_users u_vc ON u_vc.id = vc.vendedor_id
      LEFT JOIN admin_users u_v ON u_v.id = v.vendedor_id
      LEFT JOIN admin_users u_name ON lower(u_name.username) = lower(vc.vendedor_nome)
      WHERE vc.ano = ?
        AND UPPER(COALESCE(vc.cliente,'')) NOT IN ('META BASE','HIPER META','META MÊS','META MES')
    `;
    const params = [ano];
    if (mes) { sql += ' AND vc.mes = ?'; params.push(mes); }
    if (vendedor) {
      sql += ' AND (lower(COALESCE(u_vc.username, u_v.username, u_name.username, vc.vendedor_nome)) = lower(?) OR lower(vc.vendedor_nome) = lower(?))';
      params.push(vendedor, vendedor);
    }
    sql += ' ORDER BY vc.mes, COALESCE(u_vc.username, u_v.username, u_name.username, vc.vendedor_nome), vc.data_venda';
    const rows = db.prepare(sql).all(...params);
    // Enrich linked vendas with etapas from venda_etapas (same as vendas page)
    const etapaStmt = db.prepare('SELECT etapa_key, etapa_label, emoji, confirmado_por, confirmado_at FROM venda_etapas WHERE venda_id = ? AND removido = 0');
    for (const row of rows) {
      const resolvedUsername = String(row.vendedor_username_resolved || row.vendedor_nome || '').trim();
      const resolvedDisplayName = String(row.vendedor_display_name_resolved || resolvedUsername || row.vendedor_nome || '').trim();
      if (row.vendedor_id_resolved) row.vendedor_id = row.vendedor_id_resolved;
      if (resolvedUsername) {
        row.vendedor_nome = resolvedUsername;
        row.vendedor_username = resolvedUsername;
      }
      if (resolvedDisplayName) row.vendedor_display_name = resolvedDisplayName;
      delete row.vendedor_username_resolved;
      delete row.vendedor_display_name_resolved;
      delete row.vendedor_id_resolved;
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
    const sellerIdentity = resolveSellerIdentity({
      userId: b.vendedor_id,
      sellerName: b.vendedor_nome,
      fallbackUsername: b.vendedor_nome,
    });
    const vendedorNomeCanonical = sellerIdentity.username || String(b.vendedor_nome || '').trim();
    const vendedorIdCanonical = sellerIdentity.sellerId || null;
    const result = db.prepare(`
      INSERT INTO vendas_comercial
        (vendedor_nome, vendedor_id, ano, mes, data_venda, cliente, cnpj, pontos_contratados,
         valor_mensal, total_contrato, qtde_parcelas, previsao_veiculacao,
         data_emissao_nf, vencimento_boletos, contato, email, obs, tipo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      vendedorNomeCanonical, vendedorIdCanonical, Number(b.ano), Number(b.mes),
      b.data_venda || null, b.cliente, b.cnpj || null, b.pontos_contratados || null,
      parseBRLCurrency(b.valor_mensal), parseBRLCurrency(b.total_contrato), Number(b.qtde_parcelas || 1),
      b.previsao_veiculacao || null, b.data_emissao_nf || null, b.vencimento_boletos || null,
      b.contato || null, b.email || null, b.obs || null,
      b.tipo || 'Nova Venda'
    );
    const vcId = result.lastInsertRowid;

    // Auto-create linked vendas entry (skip META rows)
    const clienteUpper = String(b.cliente).toUpperCase().trim();
    if (!['META BASE','HIPER META','META MÊS','META MES','CLIENTE'].includes(clienteUpper)) {
      try {
        const pontosNomes = b.pontos_contratados
          ? JSON.stringify(b.pontos_contratados.split(',').map(s => s.trim()).filter(Boolean))
          : '[]';
        const parcelas = Number(b.qtde_parcelas || 1);
        const periodo = parcelas > 1 ? `${parcelas} meses` : null;
        const vendaResult = db.prepare(`
          INSERT INTO vendas (tipo, razao_social, cnpj, pontos_nomes, valor_mensal,
            periodo, vendedor_id, vendedor_nome, whatsapp_status, status, obs, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nao_configurado', 'ativa', ?, COALESCE(?, datetime('now')))
        `).run(
          b.tipo || 'Nova Venda',
          b.cliente,
          b.cnpj || null,
          pontosNomes,
          Number(b.valor_mensal || 0),
          periodo,
          vendedorIdCanonical,
          vendedorNomeCanonical,
          b.obs || null,
          b.data_venda || null
        );
        db.prepare(`UPDATE vendas_comercial SET venda_id = ? WHERE id = ?`).run(vendaResult.lastInsertRowid, vcId);
      } catch (linkErr) {
        console.warn(`[gestão→vendas] auto-link failed for vc.id=${vcId}:`, linkErr.message);
      }
    }

    res.json({ ok: true, id: vcId });
  } catch (err) {
    internalError(res, err);
  }
});

app.put('/api/gestao/vendas/:id', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const b = req.body;
    const id = Number(req.params.id);
    const sellerIdentity = resolveSellerIdentity({
      userId: b.vendedor_id,
      sellerName: b.vendedor_nome,
      fallbackUsername: b.vendedor_nome,
    });
    const vendedorNomeCanonical = sellerIdentity.username || String(b.vendedor_nome || '').trim();
    const vendedorIdCanonical = sellerIdentity.sellerId || null;
    db.prepare(`
      UPDATE vendas_comercial SET
        vendedor_nome = ?, vendedor_id = ?, data_venda = ?, cliente = ?, cnpj = ?,
        pontos_contratados = ?, valor_mensal = ?, total_contrato = ?,
        qtde_parcelas = ?, previsao_veiculacao = ?, data_emissao_nf = ?,
        vencimento_boletos = ?, contato = ?, email = ?,
        status_contrato = ?, status_contrato_assinado = ?,
        status_conteudo = ?, status_checkin = ?,
        status_faturado = ?, status_excel_pastas = ?,
        obs = ?, tipo = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      vendedorNomeCanonical,
      vendedorIdCanonical,
      b.data_venda || null, b.cliente || '', b.cnpj || null,
      b.pontos_contratados || null, parseBRLCurrency(b.valor_mensal),
      parseBRLCurrency(b.total_contrato), Number(b.qtde_parcelas || 1),
      b.previsao_veiculacao || null, b.data_emissao_nf || null,
      b.vencimento_boletos || null, b.contato || null, b.email || null,
      b.status_contrato ? 1 : 0, b.status_contrato_assinado ? 1 : 0,
      b.status_conteudo ? 1 : 0, b.status_checkin ? 1 : 0,
      b.status_faturado ? 1 : 0, b.status_excel_pastas ? 1 : 0,
      b.obs || null, b.tipo || 'Nova Venda', id
    );

    // Reverse-sync: update linked vendas record if exists
    try {
      const vc = db.prepare('SELECT venda_id FROM vendas_comercial WHERE id = ?').get(id);
      if (vc && vc.venda_id) {
        const pontosNomes = b.pontos_contratados
          ? JSON.stringify(b.pontos_contratados.split(',').map(s => s.trim()).filter(Boolean))
          : '[]';
        db.prepare(`
          UPDATE vendas SET
            tipo = ?, razao_social = ?, cnpj = ?, pontos_nomes = ?,
            valor_mensal = ?, vendedor_id = ?, vendedor_nome = ?, email = ?, obs = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          b.tipo || 'Nova Venda',
          b.cliente || '', b.cnpj || null, pontosNomes,
          b.valor_mensal || null, vendedorIdCanonical, vendedorNomeCanonical,
          b.email || null, b.obs || null, vc.venda_id
        );
      }
    } catch (syncErr) {
      console.warn('[gestao] reverse-sync to vendas falhou:', syncErr.message);
    }

    res.json({ ok: true });
  } catch (err) {
    internalError(res, err);
  }
});

app.patch('/api/gestao/vendas/:id/status', requireRoles(['admin','gerente_comercial','vendedor']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { field: rawField, value } = req.body;

    // O frontend pode enviar o nome da coluna boolean (status_contrato, …) OU
    // o etapa_key (contrato_enviado, …). Normalizamos para etapa_key.
    const COLUMN_TO_ETAPA = {
      'status_contrato':           'contrato_enviado',
      'status_contrato_assinado':  'contrato_assinado',
      'status_conteudo':           'cobranca_material',
      'status_checkin':            'material_recebido',
      'status_faturado':           'veiculando',
    };
    const ETAPA_KEYS = ['contrato_enviado','contrato_assinado','cobranca_material','material_recebido','veiculando'];
    // Colunas somente-UI sem etapa_key correspondente (atualizamos só o boolean)
    const UI_ONLY_COLUMNS = new Set(['status_excel_pastas']);

    // Normaliza para etapa_key
    const field = COLUMN_TO_ETAPA[rawField] || (ETAPA_KEYS.includes(rawField) ? rawField : null);

    // Mapping etapa key → coluna boolean local em vendas_comercial
    const LOCAL_MAP = {
      'contrato_enviado': 'status_contrato',
      'contrato_assinado': 'status_contrato_assinado',
      'cobranca_material': 'status_conteudo',
      'material_recebido': 'status_checkin',
      'veiculando': 'status_faturado',
    };

    // Campos somente-UI: atualiza apenas o boolean local e retorna
    if (UI_ONLY_COLUMNS.has(rawField)) {
      const row = db.prepare('SELECT id FROM vendas_comercial WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Venda não encontrada' });
      db.prepare(`UPDATE vendas_comercial SET ${rawField} = ?, updated_at = datetime('now') WHERE id = ?`).run(value ? 1 : 0, id);
      return res.json({ ok: true, venda_id: null });
    }

    if (!field) return res.status(400).json({ error: 'Campo inválido' });

    const row = db.prepare('SELECT * FROM vendas_comercial WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Venda não encontrada' });

    let vendaId = row.venda_id;

    // Backfill preguiçoso: vendas adicionadas manualmente (sem venda_id) precisam de
    // um registro em `vendas` para que o lembrete do financeiro e os relatórios
    // baseados em venda_etapas funcionem. Cria a linha + migra os booleans
    // existentes para venda_etapas, preservando o histórico.
    const clienteUpper = String(row.cliente || '').toUpperCase().trim();
    if (!vendaId && !['META BASE','HIPER META','META MÊS','META MES','CLIENTE'].includes(clienteUpper)) {
      try {
        const pontosNomes = row.pontos_contratados
          ? JSON.stringify(String(row.pontos_contratados).split(',').map(s => s.trim()).filter(Boolean))
          : '[]';
        const parcelas = Number(row.qtde_parcelas || 1);
        const periodo = parcelas > 1 ? `${parcelas} meses` : null;
        const sellerIdentity = resolveSellerIdentity({
          userId: row.vendedor_id,
          sellerName: row.vendedor_nome,
        });
        const insertRes = db.prepare(`
          INSERT INTO vendas (tipo, razao_social, cnpj, pontos_nomes, valor_mensal,
            periodo, vendedor_id, vendedor_nome, whatsapp_status, status, obs, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nao_configurado', 'ativa', ?, COALESCE(?, datetime('now')))
        `).run(
          row.tipo || 'Nova Venda',
          row.cliente,
          row.cnpj || null,
          pontosNomes,
          Number(row.valor_mensal || 0),
          periodo,
          sellerIdentity.sellerId || null,
          sellerIdentity.username || String(row.vendedor_nome || ''),
          row.obs || null,
          row.data_venda || null
        );
        vendaId = insertRes.lastInsertRowid;
        db.prepare(`
          UPDATE vendas_comercial
          SET venda_id = ?,
              vendedor_id = COALESCE(vendedor_id, ?),
              vendedor_nome = COALESCE(?, vendedor_nome),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(vendaId, sellerIdentity.sellerId || null, sellerIdentity.username || null, id);

        // Migra status booleanos pré-existentes para venda_etapas
        for (const [etapaKey, col] of Object.entries(LOCAL_MAP)) {
          if (row[col]) {
            const etapa = ETAPAS_VENDA.find(e => e.key === etapaKey);
            if (etapa) {
              db.prepare(`
                INSERT INTO venda_etapas (venda_id, etapa_key, etapa_label, emoji, confirmado_at, confirmado_por, removido)
                VALUES (?, ?, ?, ?, datetime('now'), 'gestao-backfill', 0)
                ON CONFLICT (venda_id, etapa_key) DO NOTHING
              `).run(vendaId, etapa.key, etapa.label, etapa.emoji);
            }
          }
        }
      } catch (linkErr) {
        console.warn(`[gestao→vendas] auto-link on PATCH falhou para vc.id=${id}:`, linkErr.message);
      }
    }

    if (vendaId) {
      const etapa = ETAPAS_VENDA.find(e => e.key === field);
      const etapaLabel = etapa?.label || field;
      const etapaEmoji = etapa?.emoji || '';
      if (value) {
        db.prepare(`
          INSERT INTO venda_etapas (venda_id, etapa_key, etapa_label, emoji, confirmado_at, confirmado_por, removido)
          VALUES (?, ?, ?, ?, datetime('now'), 'gestao', 0)
          ON CONFLICT (venda_id, etapa_key) DO UPDATE SET removido = 0, confirmado_at = datetime('now'), confirmado_por = 'gestao'
        `).run(vendaId, field, etapaLabel, etapaEmoji);
      } else {
        db.prepare(`UPDATE venda_etapas SET removido = 1 WHERE venda_id = ? AND etapa_key = ?`).run(vendaId, field);
      }
    }

    // Sempre mantém o boolean local em sincronia (UI da Gestão Comercial usa
    // estes campos quando não há venda vinculada e mantê-los iguais evita
    // inconsistência caso o backfill falhe).
    const col = LOCAL_MAP[field];
    if (col) {
      db.prepare(`UPDATE vendas_comercial SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`).run(value ? 1 : 0, id);
    }

    res.json({ ok: true, venda_id: vendaId || null });
  } catch (err) {
    internalError(res, err);
  }
});

app.delete('/api/gestao/vendas/:id', requireRoles(['admin','gerente_comercial']), (req, res) => {
  try {
    const vcId = Number(req.params.id);
    // Check if this vendas_comercial record is linked to a vendas record
    const vc = db.prepare('SELECT venda_id FROM vendas_comercial WHERE id = ?').get(vcId);
    db.prepare('DELETE FROM vendas_comercial WHERE id = ?').run(vcId);
    // Cascade: also delete the linked vendas record + dependencies
    if (vc && vc.venda_id) {
      db.prepare('DELETE FROM venda_etapas WHERE venda_id = ?').run(vc.venda_id);
      db.prepare('DELETE FROM whatsapp_send_log WHERE venda_id = ?').run(vc.venda_id);
      db.prepare('DELETE FROM tv_sale_replays WHERE venda_id = ?').run(vc.venda_id);
      db.prepare('DELETE FROM vendas WHERE id = ?').run(vc.venda_id);
    }
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

    // Vendas realizadas agregadas por vendedor/mês (permuta conta pela parte "a receber")
    const vendas = db.prepare(`
      SELECT vendedor_nome, mes,
             COUNT(*) as qtde_vendas,
             COALESCE(SUM(CASE
               WHEN TRIM(LOWER(COALESCE(tipo, 'nova venda'))) LIKE '%permuta%' THEN COALESCE(permuta_valor_receber, 0)
               ELSE COALESCE(valor_mensal, 0)
             END), 0) as total_mensal,
             COALESCE(SUM(CASE
               WHEN TRIM(LOWER(COALESCE(tipo, 'nova venda'))) LIKE '%permuta%' THEN COALESCE(permuta_total_receber, 0)
               ELSE COALESCE(total_contrato, 0)
             END), 0) as total_contrato
      FROM vendas_comercial
      WHERE ano = ?
      GROUP BY vendedor_nome, mes
      ORDER BY vendedor_nome, mes
    `).all(ano);

    // Permutas agregadas por mês (separado das metas)
    const permutas = db.prepare(`
      SELECT mes,
             COUNT(*) as qtde_vendas,
             COALESCE(SUM(valor_mensal), 0) as total_mensal,
             COALESCE(SUM(total_contrato), 0) as total_contrato,
             COALESCE(SUM(permuta_valor_receber), 0) as total_mensal_meta,
             COALESCE(SUM(permuta_total_receber), 0) as total_contrato_meta
      FROM vendas_comercial
      WHERE ano = ?
        AND TRIM(LOWER(COALESCE(tipo, 'nova venda'))) LIKE '%permuta%'
      GROUP BY mes
      ORDER BY mes
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
    res.json({ ano, metas, vendas, renovacoes, permutas, vendedores: vendedoresAtivos, mesesLabel: MESES_LABEL });
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
          (vendedor_nome, vendedor_id, ano, mes, data_venda, cliente, cnpj, pontos_contratados,
           valor_mensal, total_contrato, qtde_parcelas, previsao_veiculacao,
           data_emissao_nf, status_contrato, status_contrato_assinado,
           status_conteudo, status_checkin, status_faturado, status_excel_pastas, obs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of vendas) {
        if (!v.cliente || !v.vendedor_nome || !v.ano || !v.mes) continue;
        const sellerIdentity = resolveSellerIdentity({
          userId: v.vendedor_id,
          sellerName: v.vendedor_nome,
          fallbackUsername: v.vendedor_nome,
        });
        const vendedorNomeCanonical = sellerIdentity.username || String(v.vendedor_nome || '').trim();
        const vendedorIdCanonical = sellerIdentity.sellerId || null;
        stmtV.run(
          vendedorNomeCanonical, vendedorIdCanonical, Number(v.ano), Number(v.mes),
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

      const namedCreator = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.creator_username || '';
      const creatorType = namedCreator
        ? 'vendedor'
        : row.created_by
          ? 'usuario'
          : 'robo';
      const creatorLabel = namedCreator || (creatorType === 'robo' ? 'Robô (Chatbot)' : `Usuário #${row.created_by}`);

      return {
        id: row.id,
        token: row.token,
        clientName: data.clientName || '',
        segmento: data.segmento || '',
        pointsCount: Array.isArray(data.points) ? data.points.length : 0,
        totalValue: data.pricingSummary?.totalComDesconto ?? data.totals?.valorTotal ?? 0,
        created_by_name: creatorLabel,
        created_by_type: creatorType,
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
const PROPOSAL_VIEW_NOTIFY_GROUP_JID = '120363426469902795@g.us';

app.get('/api/p/:token', (req, res) => {
  try {
    const token = String(req.params.token || '').replace(/[^a-f0-9]/g, '');
    if (!token) return res.status(400).json({ error: 'Token inválido.' });
    const row = db.prepare('SELECT * FROM proposta_tokens WHERE token = ?').get(token);
    if (!row) return res.status(404).json({ error: 'Proposta não encontrada ou expirada.' });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Este link expirou.' });
    }
    const markViewed = db.prepare("UPDATE proposta_tokens SET viewed_at = datetime('now') WHERE token = ? AND viewed_at IS NULL").run(token);
    const firstView = Number(markViewed?.changes || 0) > 0;

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

    const proposalData = JSON.parse(row.proposta_data || '{}');

    // Notify commercial WhatsApp number only on first view event.
    if (firstView) {
      try {
        const settings = getEvolutionSettings();
        const destination = PROPOSAL_VIEW_NOTIFY_GROUP_JID || sanitizePhoneForWhatsApp(settings.evolution_dest_number);
        if (settings.evolution_api_url && settings.evolution_api_key && settings.evolution_instance && destination) {
          const vendedor = row.created_by
            ? db.prepare('SELECT first_name, last_name FROM admin_users WHERE id = ?').get(row.created_by)
            : null;
          const vendedorNome = vendedor ? `${vendedor.first_name || ''} ${vendedor.last_name || ''}`.trim() : '';

          const linkedLead = db.prepare(`
            SELECT l.id, l.empresa, l.telefone
            FROM lead_proposta_links lpl
            JOIN leads l ON l.id = lpl.lead_id
            WHERE lpl.proposta_tipo = 'publica' AND lpl.proposta_token_id = ?
            ORDER BY lpl.id DESC
            LIMIT 1
          `).get(row.id);

          const clienteNome = String(proposalData?.clientName || linkedLead?.empresa || 'Cliente').trim();
          const cidades = Array.from(new Set(
            (Array.isArray(proposalData?.points) ? proposalData.points : [])
              .map((point) => String(point?.cidade || '').trim())
              .filter(Boolean)
          ));
          const origin = String(process.env.FRONTEND_ORIGINS || '').split(',')[0].trim()
            || `${req.protocol}://${req.get('host')}`;

          const msgLines = [
            '👀 *Proposta visualizada pelo cliente*',
            `Cliente: *${clienteNome || 'Cliente'}*`,
            cidades.length ? `Praça: ${cidades.join(', ')}` : null,
            linkedLead?.telefone && linkedLead.telefone !== 'nao-informado' ? `Telefone: ${linkedLead.telefone}` : null,
            vendedorNome ? `Vendedor: ${vendedorNome}` : null,
            `Link: ${origin}/p/${token}`,
          ].filter(Boolean);

          sendEvolutionText({
            apiUrl: settings.evolution_api_url,
            instance: settings.evolution_instance,
            apiKey: settings.evolution_api_key,
            number: destination,
            text: msgLines.join('\n')
          }).catch((notifyErr) => {
            console.error('[proposta-publica][view-notify]', notifyErr.message);
          });
        }
      } catch (notifySetupErr) {
        console.error('[proposta-publica][view-notify-setup]', notifySetupErr.message);
      }
    }

    res.json({
      ...proposalData,
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
const VALID_EVENT_TYPES = new Set(['page_view', 'pdf_generate', 'slides_open', 'chatbot_open', 'chatbot_message', 'whatsapp_click', 'instagram_click', 'contact_click', 'proposal_view', 'point_detail_view', 'favorite_add', 'favorite_remove', 'favorites_shared', 'favorites_cleared']);

function isPlaceholderLeadRecord(lead) {
  if (!lead) return true;
  const phone = String(lead.telefone || '').replace(/\D/g, '');
  const company = String(lead.empresa || '').trim().toLowerCase();
  const placeholderPhone = phone.length < 10;
  const placeholderCompany = !company || company.startsWith('lead via ');
  return placeholderPhone || placeholderCompany;
}

function isLeadCapturedForChat(lead) {
  return !!lead && !isPlaceholderLeadRecord(lead);
}

function seedLeadFromContactEvent({ sessionId, eventType, eventData, pageUrl }) {
  if (!['whatsapp_click', 'instagram_click', 'contact_click'].includes(String(eventType || ''))) {
    return;
  }

  const source = String(eventData?.source || eventType || 'contato').slice(0, 120);
  const page = String(pageUrl || '').slice(0, 200);
  const empresa = `Lead via ${source}`.slice(0, 200);
  const notas = `Capturado por clique em CTA (${eventType})${page ? ` em ${page}` : ''}`.slice(0, 500);

  db.prepare(
    `INSERT INTO leads (session_id, telefone, empresa, status, notas)
     VALUES (?, ?, ?, 'novo', ?)
     ON CONFLICT(session_id) DO NOTHING`
  ).run(sessionId.slice(0, 64), 'nao-informado', empresa, notas);
}

app.post('/api/track', (req, res) => {
  try {
    const { sessionId, eventType, eventData, pageUrl } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string' || !VALID_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: 'Invalid tracking data.' });
    }
    db.prepare('INSERT INTO navigation_events (session_id, event_type, event_data, page_url) VALUES (?, ?, ?, ?)').run(
      sessionId.slice(0, 64), eventType, eventData ? JSON.stringify(eventData).slice(0, 2000) : null, (pageUrl || '').slice(0, 500)
    );
    seedLeadFromContactEvent({ sessionId, eventType, eventData, pageUrl });
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err, 'Erro ao registrar evento.');
  }
});

// ── Lead capture (public) ─────────────────────────────────────────────────────
app.post('/api/leads/capture', (req, res) => {
  try {
    const { sessionId, telefone, empresa, orcamento, origem } = req.body || {};
    if (!sessionId || !telefone || !empresa) {
      return res.status(400).json({ error: 'sessionId, telefone e empresa são obrigatórios.' });
    }
    const cleanPhone = String(telefone).replace(/\D/g, '').slice(0, 15);
    if (cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Telefone inválido.' });
    }
    const sessionKey = String(sessionId).slice(0, 64);
    const cleanOrcamento = orcamento ? String(orcamento).trim().slice(0, 200) : null;
    const cleanOrigem = origem ? String(origem).trim().slice(0, 200) : null;
    const result = db.prepare(
      `INSERT INTO leads (session_id, telefone, empresa, orcamento, origem) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET telefone = excluded.telefone, empresa = excluded.empresa,
         orcamento = coalesce(excluded.orcamento, orcamento),
         origem = coalesce(excluded.origem, origem),
         notas = CASE WHEN coalesce(notas, '') LIKE 'Capturado por clique em CTA%' THEN NULL ELSE notas END,
         updated_at = datetime('now')`
    ).run(sessionKey, cleanPhone, String(empresa).trim().slice(0, 200), cleanOrcamento, cleanOrigem);
    try {
      db.prepare('UPDATE chat_sessions SET lead_captured = 1 WHERE id = ?').run(sessionKey);
    } catch { /* session may not exist yet */ }
    res.json({ ok: true, leadId: result.lastInsertRowid || null });
  } catch (err) {
    internalError(res, err, 'Erro ao capturar lead.');
  }
});

app.post('/api/leads/capture-contact', (req, res) => {
  try {
    const { sessionId, source, pageUrl } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId é obrigatório.' });
    }

    const sourceTag = String(source || 'contact_click').slice(0, 120);
    const page = String(pageUrl || '').slice(0, 200);
    const empresa = `Lead via ${sourceTag}`.slice(0, 200);
    const notas = `Capturado por clique em CTA (${sourceTag})${page ? ` em ${page}` : ''}`.slice(0, 500);

    db.prepare(
      `INSERT INTO leads (session_id, telefone, empresa, status, notas)
       VALUES (?, ?, ?, 'novo', ?)
       ON CONFLICT(session_id) DO NOTHING`
    ).run(sessionId.slice(0, 64), 'nao-informado', empresa, notas);

    return res.json({ ok: true });
  } catch (err) {
    return internalError(res, err, 'Erro ao capturar lead por contato.');
  }
});

app.get('/api/leads/check/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionKey = String(sessionId || '').slice(0, 64);
    const lead = db.prepare('SELECT id, telefone, empresa, orcamento, origem FROM leads WHERE session_id = ?').get(sessionKey);
    const captured = isLeadCapturedForChat(lead);
    res.json({ captured, telefone: lead?.telefone, empresa: lead?.empresa, orcamento: lead?.orcamento, origem: lead?.origem });
  } catch (err) {
    internalError(res, err, 'Erro ao verificar lead.');
  }
});

// ── Lead last-message update (public) ────────────────────────────────────────
app.post('/api/leads/last-message', (req, res) => {
  try {
    const { sessionId, mensagem } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string' || !mensagem || typeof mensagem !== 'string') {
      return res.status(400).json({ error: 'sessionId e mensagem são obrigatórios.' });
    }
    db.prepare(
      `UPDATE leads SET ultima_mensagem = ?, updated_at = datetime('now') WHERE session_id = ?`
    ).run(String(mensagem).trim().slice(0, 1000), sessionId.slice(0, 64));
    res.json({ ok: true });
  } catch (err) {
    internalError(res, err, 'Erro ao salvar última mensagem.');
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

// ── Favorites analytics (authenticated) ─────────────────────────────────────
app.get('/api/analytics/favorites', requireRoles(['admin', 'gerente_comercial']), (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));

    // Fetch raw favorite_add events and aggregate in JS (DB-agnostic — works on SQLite and PostgreSQL)
    // Compute cutoff date in JS to avoid SQLite datetime() vs PostgreSQL INTERVAL incompatibility
    const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
    const rawAdds = db.prepare(`
      SELECT session_id, event_data, created_at
      FROM navigation_events
      WHERE event_type = 'favorite_add'
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 5000
    `).all(cutoffDate);

    // Parse event_data JSON and aggregate top points
    const pointMap = new Map(); // pointId -> { point_name, city, type, count, sessions }
    for (const row of rawAdds) {
      try {
        const d = JSON.parse(row.event_data || '{}');
        if (!d.pointId) continue;
        const key = String(d.pointId);
        const entry = pointMap.get(key) || { point_id: d.pointId, point_name: d.pointName || '', city: d.pointCity || '', type: d.pointType || '', favorite_count: 0, sessions: new Set() };
        entry.favorite_count++;
        entry.sessions.add(row.session_id);
        pointMap.set(key, entry);
      } catch { /* skip malformed */ }
    }
    const topPoints = Array.from(pointMap.values())
      .map(e => ({ ...e, unique_sessions: e.sessions.size, sessions: undefined }))
      .sort((a, b) => b.favorite_count - a.favorite_count)
      .slice(0, 50);

    // Total favorites activity
    const totals = db.prepare(`
      SELECT
        SUM(CASE WHEN event_type = 'favorite_add' THEN 1 ELSE 0 END) AS adds,
        SUM(CASE WHEN event_type = 'favorite_remove' THEN 1 ELSE 0 END) AS removes,
        SUM(CASE WHEN event_type = 'favorites_shared' THEN 1 ELSE 0 END) AS shares,
        COUNT(DISTINCT session_id) AS unique_users
      FROM navigation_events
      WHERE event_type IN ('favorite_add', 'favorite_remove', 'favorites_shared')
        AND created_at >= ?
    `).get(cutoffDate);

    // Per-lead favorites (sessions that have a lead record)
    const rawLeadFavs = db.prepare(`
      SELECT
        l.id AS lead_id,
        l.empresa,
        l.telefone,
        l.status,
        ne.event_data,
        ne.created_at
      FROM navigation_events ne
      JOIN leads l ON l.session_id = ne.session_id
      WHERE ne.event_type = 'favorite_add'
        AND ne.created_at >= ?
      ORDER BY ne.created_at DESC
      LIMIT 200
    `).all(cutoffDate);

    const leadFavorites = rawLeadFavs.map(row => {
      try {
        const d = JSON.parse(row.event_data || '{}');
        return { lead_id: row.lead_id, empresa: row.empresa, telefone: row.telefone, status: row.status, point_id: d.pointId, point_name: d.pointName || '', created_at: row.created_at };
      } catch {
        return { lead_id: row.lead_id, empresa: row.empresa, telefone: row.telefone, status: row.status, point_id: null, point_name: '', created_at: row.created_at };
      }
    }).filter(r => r.point_id);

    res.json({ days, topPoints, totals, leadFavorites });
  } catch (err) {
    internalError(res, err, 'Erro ao buscar analytics de favoritos.');
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
    if (err.code === 'LIMIT_FIELD_COUNT') {
      return res.status(400).json({ error: 'Muitos campos enviados no formulário.' });
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

  // Sync missed poll votes from Evolution API on startup
  syncMissedPollVotes().catch(err => console.error('[poll-sync] startup error:', err.message));
});

