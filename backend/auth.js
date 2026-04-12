'use strict';

const crypto = require('crypto');

const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 12 * 60 * 60);
const DEFAULT_ITERATIONS = 16384;
const KEY_LEN = 64;
const DIGEST = 'sha512';

const runtimeSecret = process.env.AUTH_SECRET || crypto.randomBytes(48).toString('hex');

if (!process.env.AUTH_SECRET) {
  console.warn('[auth] AUTH_SECRET not set. Using ephemeral runtime secret; active sessions will reset on restart.');
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', runtimeSecret).update(payload).digest('base64url');
}

function createAuthToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: Number(user.id),
    username: String(user.username || ''),
    role: String(user.role || 'vendedor'),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseAuthToken(token) {
  const raw = String(token || '').trim();
  const [payloadPart, signaturePart] = raw.split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('Token malformado');
  }

  const expected = signPayload(payloadPart);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signaturePart);

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error('Assinatura inválida');
  }

  const parsed = JSON.parse(base64UrlDecode(payloadPart));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Payload inválido');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(parsed.exp)) || Number(parsed.exp) < now) {
    throw new Error('Token expirado');
  }

  return parsed;
}

function extractBearerToken(authHeader) {
  const header = String(authHeader || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return header.slice(7).trim();
}

function hashPassword(password) {
  const normalized = String(password || '');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(normalized, salt, KEY_LEN, { N: DEFAULT_ITERATIONS }).toString('hex');
  return `scrypt$${DEFAULT_ITERATIONS}$${salt}$${hash}`;
}

function isPasswordHash(value) {
  return String(value || '').startsWith('scrypt$');
}

function verifyPassword(password, storedValue) {
  const candidate = String(password || '');
  const stored = String(storedValue || '');

  if (!stored) return false;

  if (!isPasswordHash(stored)) {
    const candidateBuf = Buffer.from(candidate);
    const storedBuf = Buffer.from(stored);
    if (candidateBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(candidateBuf, storedBuf);
  }

  const [, nRaw, salt, expectedHex] = stored.split('$');
  const iterations = Number(nRaw);
  if (!iterations || !salt || !expectedHex) return false;

  const actualHex = crypto.scryptSync(candidate, salt, KEY_LEN, { N: iterations }).toString('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf = Buffer.from(actualHex, 'hex');

  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

module.exports = {
  TOKEN_TTL_SECONDS,
  createAuthToken,
  parseAuthToken,
  extractBearerToken,
  hashPassword,
  verifyPassword,
  isPasswordHash
};
