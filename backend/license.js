'use strict';

/**
 * license.js — Remote license verification module
 *
 * Config via environment variables:
 *   LICENSE_URL      GitHub Raw URL to the JSON license file
 *   LICENSE_CLIENT   client_id key to look up in the JSON
 *   LICENSE_GRACE_H  hours to keep operating if server is unreachable (default: 24)
 */

const https = require('https');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LICENSE_URL    = process.env.LICENSE_URL    || '';
const CLIENT_ID      = process.env.LICENSE_CLIENT || '';
const GRACE_HOURS    = Number(process.env.LICENSE_GRACE_H || '24');
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in ms
const FETCH_TIMEOUT  = 10_000;          // 10 seconds

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _licensed        = false;   // current verdict
let _lastSuccess     = null;    // Date of last successful remote check
let _intervalHandle  = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch JSON from an HTTPS URL with a hard timeout.
 * Returns parsed object or throws.
 */
function _fetchJson(url) {
  return new Promise((resolve, reject) => {
    if (!url.startsWith('https://')) {
      return reject(new Error('LICENSE_URL must use https://'));
    }

    const req = https.get(url, { timeout: FETCH_TIMEOUT }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`License server returned HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('License server returned invalid JSON'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('License server request timed out'));
    });

    req.on('error', reject);
  });
}

/**
 * Evaluate a license entry object.
 * Returns { valid: bool, reason: string }
 */
function _evaluate(entry) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, reason: 'client_id not found in license file' };
  }
  if (entry.active !== true) {
    return { valid: false, reason: 'License is inactive' };
  }
  if (entry.expires) {
    const expiry = new Date(entry.expires);
    if (isNaN(expiry.getTime())) {
      return { valid: false, reason: 'License has an invalid expiry date' };
    }
    if (Date.now() > expiry.getTime()) {
      return { valid: false, reason: `License expired on ${entry.expires}` };
    }
  }
  return { valid: true, reason: 'OK' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform a single remote license check.
 * Updates internal state and returns { valid, reason, cached }.
 */
async function checkLicense() {
  if (!LICENSE_URL) {
    console.warn('[license] LICENSE_URL not set — skipping remote check');
    _licensed = true;
    return { valid: true, reason: 'no-url', cached: false };
  }
  if (!CLIENT_ID) {
    console.warn('[license] LICENSE_CLIENT not set — skipping remote check');
    _licensed = true;
    return { valid: true, reason: 'no-client', cached: false };
  }

  try {
    const data = await _fetchJson(LICENSE_URL);
    const entry = data[CLIENT_ID];
    const result = _evaluate(entry);

    _licensed    = result.valid;
    _lastSuccess = new Date();

    if (!result.valid) {
      console.error(`[license] INVALID — ${result.reason}`);
    } else {
      console.log(`[license] Valid — expires: ${entry?.expires || 'never'}`);
    }

    return { ...result, cached: false };

  } catch (err) {
    // License server unreachable — apply grace period
    console.warn(`[license] Server unreachable: ${err.message}`);

    if (_lastSuccess) {
      const elapsedHours = (Date.now() - _lastSuccess.getTime()) / 3_600_000;
      if (elapsedHours < GRACE_HOURS) {
        const remaining = (GRACE_HOURS - elapsedHours).toFixed(1);
        console.warn(`[license] Using cached result. Grace period: ${remaining}h remaining`);
        return { valid: _licensed, reason: 'server-unreachable (grace)', cached: true };
      } else {
        console.error(`[license] Grace period of ${GRACE_HOURS}h exceeded — treating as invalid`);
        _licensed = false;
        return { valid: false, reason: `Grace period exceeded (${GRACE_HOURS}h)`, cached: true };
      }
    }

    // No prior successful check and server is down
    console.error('[license] No cached state and server unreachable — treating as invalid');
    _licensed = false;
    return { valid: false, reason: 'server-unreachable (no cache)', cached: true };
  }
}

/**
 * Returns the current in-memory license status without a network call.
 */
function isLicensed() {
  return _licensed;
}

/**
 * Throw / exit if the license is currently invalid.
 * Call this at the top of critical paths.
 */
function requireLicense() {
  if (!_licensed) {
    const msg = '[license] Operation blocked — no valid license';
    console.error(msg);
    throw new Error(msg);
  }
}

/**
 * Perform initial check, then schedule hourly rechecks.
 * Call once at application startup.
 * If the initial check fails and there is no grace period available, exits the process.
 */
async function startLicenseWatcher() {
  const result = await checkLicense();

  if (!result.valid) {
    console.error('[license] Startup license check failed. Shutting down.');
    process.exit(1);
  }

  if (_intervalHandle) clearInterval(_intervalHandle);

  _intervalHandle = setInterval(async () => {
    const r = await checkLicense();
    if (!r.valid) {
      console.error('[license] Periodic check failed. Shutting down.');
      process.exit(1);
    }
  }, CHECK_INTERVAL);

  // Allow Node to exit even if the interval is pending
  if (_intervalHandle.unref) _intervalHandle.unref();
}

/**
 * Stop the periodic watcher (useful in tests).
 */
function stopLicenseWatcher() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

module.exports = {
  checkLicense,
  requireLicense,
  isLicensed,
  startLicenseWatcher,
  stopLicenseWatcher,
};
