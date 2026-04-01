const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const db = require('../database');
const { extractBearerToken, parseAuthToken } = require('../auth');
const { slugifyCity, invalidateCityCaches } = require('../services/pdfCacheService');

const router = express.Router();
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const cityUploadsDir = path.join(uploadsRoot, 'cidades');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function ensureCityUploadsDir() {
  if (!fs.existsSync(cityUploadsDir)) {
    fs.mkdirSync(cityUploadsDir, { recursive: true });
  }
}

function extFromMime(mimeType) {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '';
}

function buildPublicUrl(filePath) {
  const fileName = path.basename(filePath || '');
  return fileName ? `/uploads/cidades/${fileName}` : null;
}

function requireAdminAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação obrigatório.' });
  }

  let claims;
  try {
    claims = parseAuthToken(token);
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const user = db.prepare(`
    SELECT id, username, role
    FROM admin_users
    WHERE id = ? AND lower(username) = lower(?)
    LIMIT 1
  `).get(Number(claims.sub), String(claims.username || ''));

  if (!user || !['admin', 'gerente_comercial'].includes(user.role)) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  req.adminUser = user;
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      ensureCityUploadsDir();
      cb(null, cityUploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = extFromMime(file.mimetype);
      if (!ext) {
        return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      }
      cb(null, `${randomUUID()}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou WEBP.'));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 10
  }
});

function normalizeCidade(rawCidade, rawSlug) {
  const cidade = String(rawCidade || '').trim();
  const slug = slugifyCity(rawSlug || cidade);
  return {
    cidade,
    slug
  };
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('[cidade-fotos] Falha ao remover arquivo antigo:', error?.message || error);
  }
}

router.get('/cidade-fotos', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT cidade, cidade_slug, imagem_path, updated_at
      FROM cidade_fotos
      ORDER BY cidade ASC
    `).all();

    const data = rows.map((row) => ({
      cidade: row.cidade,
      cidade_slug: row.cidade_slug,
      imagem_url: buildPublicUrl(row.imagem_path),
      updated_at: row.updated_at
    }));

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro ao listar fotos das cidades.' });
  }
});

router.get('/cidade-fotos/:slug', (req, res) => {
  try {
    const slug = slugifyCity(req.params.slug);
    if (!slug) {
      return res.status(400).json({ error: 'Slug da cidade inválido.' });
    }

    const row = db.prepare(`
      SELECT cidade, cidade_slug, imagem_path, updated_at
      FROM cidade_fotos
      WHERE cidade_slug = ?
      LIMIT 1
    `).get(slug);

    if (!row) {
      return res.status(404).json({ error: 'Foto da cidade não encontrada.' });
    }

    res.json({
      cidade: row.cidade,
      cidade_slug: row.cidade_slug,
      imagem_url: buildPublicUrl(row.imagem_path),
      updated_at: row.updated_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro ao buscar foto da cidade.' });
  }
});

router.post('/cidade-fotos/upload', requireAdminAuth, (req, res) => {
  upload.single('image')(req, res, (uploadError) => {
    if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. O limite é 15MB.' });
    }

    if (uploadError) {
      return res.status(400).json({ error: uploadError.message || 'Falha no upload da imagem.' });
    }

    try {
      const { cidade, slug } = normalizeCidade(req.body?.cidade, req.body?.cidade_slug);
      if (!cidade || !slug) {
        safeUnlink(req.file?.path);
        return res.status(400).json({ error: 'Cidade é obrigatória para upload da foto.' });
      }

      if (!req.file?.path) {
        return res.status(400).json({ error: 'Envie uma imagem válida.' });
      }

      const existing = db.prepare(`
        SELECT imagem_path
        FROM cidade_fotos
        WHERE cidade_slug = ?
        LIMIT 1
      `).get(slug);

      const stmt = db.prepare(`
        INSERT INTO cidade_fotos (cidade, cidade_slug, imagem_path, original_name, mime_type, size_bytes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(cidade_slug) DO UPDATE SET
          cidade = excluded.cidade,
          imagem_path = excluded.imagem_path,
          original_name = excluded.original_name,
          mime_type = excluded.mime_type,
          size_bytes = excluded.size_bytes,
          updated_at = datetime('now')
      `);

      stmt.run(
        cidade,
        slug,
        req.file.path,
        req.file.originalname || null,
        req.file.mimetype || null,
        Number(req.file.size) || 0
      );

      if (existing?.imagem_path && path.resolve(existing.imagem_path) !== path.resolve(req.file.path)) {
        safeUnlink(existing.imagem_path);
      }

      invalidateCityCaches(slug, db);

      return res.json({
        cidade,
        cidade_slug: slug,
        imagem_url: buildPublicUrl(req.file.path),
        updated_at: new Date().toISOString()
      });
    } catch (error) {
      safeUnlink(req.file?.path);
      return res.status(500).json({ error: error.message || 'Erro ao salvar foto da cidade.' });
    }
  });
});

router.delete('/cidade-fotos/:slug', requireAdminAuth, (req, res) => {
  try {
    const slug = slugifyCity(req.params.slug);
    if (!slug) {
      return res.status(400).json({ error: 'Slug da cidade inválido.' });
    }

    const existing = db.prepare(`
      SELECT imagem_path
      FROM cidade_fotos
      WHERE cidade_slug = ?
      LIMIT 1
    `).get(slug);

    if (!existing) {
      return res.status(404).json({ error: 'Foto da cidade não encontrada.' });
    }

    db.prepare('DELETE FROM cidade_fotos WHERE cidade_slug = ?').run(slug);
    safeUnlink(existing.imagem_path);
    invalidateCityCaches(slug, db);

    res.json({ success: true, cidade_slug: slug });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro ao remover foto da cidade.' });
  }
});

module.exports = router;
