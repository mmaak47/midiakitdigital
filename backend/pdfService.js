'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, execFileSync } = require('child_process');

let _browser = null;
let _renderQueue = [];
let _isRendering = false;
let _rendersSinceBrowserLaunch = 0;
const PDF_MAX_QUEUE = Math.max(1, Number(process.env.PDF_MAX_QUEUE || 8));
const PDF_RENDER_TIMEOUT_MS = Math.max(10_000, Number(process.env.PDF_RENDER_TIMEOUT_MS || 180_000));
const PDF_BROWSER_RECYCLE_EVERY = Math.max(1, Number(process.env.PDF_BROWSER_RECYCLE_EVERY || 30));
const PDF_FONT_READY_TIMEOUT_MS = Math.max(500, Number(process.env.PDF_FONT_READY_TIMEOUT_MS || 4000));
const PDF_IMAGE_WAIT_TIMEOUT_MS = Math.max(1000, Number(process.env.PDF_IMAGE_WAIT_TIMEOUT_MS || 7000));
const PDF_LAYOUT_SETTLE_MS = Math.max(0, Number(process.env.PDF_LAYOUT_SETTLE_MS || 120));
const PDF_COMPRESS_TIMEOUT_MS = Math.max(5000, Number(process.env.PDF_COMPRESS_TIMEOUT_MS || 45000));
const PDF_COMPRESS_SKIP_OVER_MB = Math.max(1, Number(process.env.PDF_COMPRESS_SKIP_OVER_MB || 10));
const PDF_DISABLE_GS_COMPRESSION = String(process.env.PDF_DISABLE_GS_COMPRESSION || '').toLowerCase() === 'true';
const PDF_QUEUE_MAX_WAIT_MS = Math.max(5000, Number(process.env.PDF_QUEUE_MAX_WAIT_MS || 120_000));
const PDF_RETRY_TIMEOUT_MS = Math.max(10_000, Number(process.env.PDF_RETRY_TIMEOUT_MS || 90_000));
const LOCAL_ORIGIN = `http://127.0.0.1:${process.env.PORT || 3002}`;
const ALLOWED_HOSTS = new Set(
  String(process.env.PDF_ALLOWED_HOSTS || 'localhost,127.0.0.1,REDACTED_VPS_IP,midiakit.redeintermidia.com,www.midiakit.redeintermidia.com')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

// Load Poppins fonts as base64 once at module startup for PDF injection
const _fontsDir = path.join(__dirname, 'fonts');
function _loadFont(filename) {
  try { return fs.readFileSync(path.join(_fontsDir, filename)).toString('base64'); } catch { return null; }
}
const _fonts = [
  [400, _loadFont('poppins-400.woff2')],
  [500, _loadFont('poppins-500.woff2')],
  [600, _loadFont('poppins-600.woff2')],
  [700, _loadFont('poppins-700.woff2')],
  [900, _loadFont('poppins-900.woff2')],
];
const _fontCssInjection = (() => {
  const faces = _fonts
    .filter(([, b64]) => b64)
    .map(([w, b64]) => `@font-face{font-family:'Poppins';font-style:normal;font-weight:${w};font-display:block;src:url('data:font/woff2;base64,${b64}') format('woff2');}`)
    .join('');
  if (!faces) return '';
  return `<style>${faces}html,body,*{font-family:'Poppins',system-ui,sans-serif!important;}</style>`;
})();

async function getBrowser() {
  if (_browser) {
    try {
      await _browser.version();
      return _browser;
    } catch {
      _browser = null;
    }
  }

  _browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: Math.max(240_000, PDF_RENDER_TIMEOUT_MS + 60_000),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process=false',
      '--memory-pressure-off',
      '--disable-background-networking',
      '--disable-backgroundtimer-throttling',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-extensions',
      '--disable-features=InterestFeedContentSuggestions',
      '--disable-sync',
    ],
  });

  _browser.on('disconnected', () => {
    _browser = null;
  });

  return _browser;
}

async function closeBrowser() {
  if (!_browser) return;
  const browserRef = _browser;
  _browser = null;
  try {
    await browserRef.close();
  } catch {
    // Best effort cleanup.
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timeout after ${timeoutMs}ms`);
      error.code = 'PDF_RENDER_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function _processRenderQueue() {
  if (_isRendering || _renderQueue.length === 0) {
    return;
  }

  _isRendering = true;

  try {
    while (_renderQueue.length > 0) {
      const task = _renderQueue.shift();
      // Reject tasks that have been waiting too long in the queue
      const waitedMs = Date.now() - (task.enqueuedAt || Date.now());
      if (waitedMs > PDF_QUEUE_MAX_WAIT_MS) {
        const err = new Error(`PDF queue wait exceeded ${Math.round(waitedMs / 1000)}s`);
        err.code = 'PDF_RENDER_TIMEOUT';
        task.reject(err);
        continue;
      }
      try {
        const result = await task.fn();
        task.resolve(result);
      } catch (err) {
        task.reject(err);
      }
      // Small delay between renders to allow memory cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } finally {
    _isRendering = false;
  }
}

function _queueRender(fn) {
  return new Promise((resolve, reject) => {
    if (_renderQueue.length >= PDF_MAX_QUEUE) {
      const err = new Error(`PDF queue is full (${_renderQueue.length}/${PDF_MAX_QUEUE})`);
      err.code = 'PDF_QUEUE_FULL';
      reject(err);
      return;
    }
    _renderQueue.push({ fn, resolve, reject, enqueuedAt: Date.now() });
    _processRenderQueue().catch((err) => {
      console.error('[pdf-queue] Error:', err);
    });
  });
}

async function renderHtmlToPdf(htmlContent) {
  return _queueRender(async () => {
    const startedAt = Date.now();
    const runRender = async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[puppeteer:console]', msg.text());
    });
    page.on('pageerror', (err) => {
      console.error('[puppeteer:pageerror]', err.message);
    });

    try {
      await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
      page.setDefaultTimeout(120000);
      page.setDefaultNavigationTimeout(120000);
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = String(request.url() || '');

        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
          request.continue();
          return;
        }

        try {
          const parsed = new URL(url);
          const host = String(parsed.hostname || '').toLowerCase();
          if (ALLOWED_HOSTS.has(host)) {
            request.continue();
            return;
          }
        } catch {
          // Fall through to abort on malformed URL.
        }

        request.abort();
      });

      // Rewrite <base href> to localhost to avoid HTTPS loopback through public DNS/nginx
      let htmlReady = htmlContent.replace(
        /<base\s+href="[^"]*"/i,
        `<base href="${LOCAL_ORIGIN}"`
      );
      if (_fontCssInjection) {
        htmlReady = htmlReady.replace('<head>', `<head>${_fontCssInjection}`);
      }

      // Use networkidle0 to wait for all resources (images, fonts) to finish loading.
      // This replaces manual page.evaluate() waits which hang when JS is disabled on the page.
      await page.setContent(htmlReady, { waitUntil: 'networkidle0', timeout: 120000 });
      console.log(`[pdf/render] setContent+networkidle done (${(htmlReady.length / 1024).toFixed(0)} KB)`);

      // Let layout settle after all resources loaded
      if (PDF_LAYOUT_SETTLE_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, PDF_LAYOUT_SETTLE_MS));
      }

      const pdfBuffer = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        scale: 1,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      _rendersSinceBrowserLaunch += 1;
      if (_rendersSinceBrowserLaunch >= PDF_BROWSER_RECYCLE_EVERY) {
        console.log(`[pdf/render] Recycling browser after ${_rendersSinceBrowserLaunch} render(s).`);
        _rendersSinceBrowserLaunch = 0;
        await closeBrowser();
      }

      return pdfBuffer;
    } finally {
      try {
        await page.close();
      } catch {
        // Ignore page close race conditions.
      }
    }

    };

    try {
      const buffer = await withTimeout(runRender(), PDF_RENDER_TIMEOUT_MS, 'PDF render');
      console.log(`[pdf/render] done in ${Date.now() - startedAt}ms`);
      return buffer;
    } catch (err) {
      const message = String(err?.message || err);
      const isTransient =
        err?.code === 'PDF_RENDER_TIMEOUT'
        || /Target closed|Protocol error|Session closed|Connection closed|Page crashed|Execution context/i.test(message);

      if (!isTransient) throw err;

      console.warn('[pdf/render] transient failure, recycling browser and retrying once:', message);
      _rendersSinceBrowserLaunch = 0;
      await closeBrowser();

      const retriedBuffer = await withTimeout(runRender(), PDF_RETRY_TIMEOUT_MS, 'PDF render retry');
      console.log(`[pdf/render] done on retry in ${Date.now() - startedAt}ms`);
      return retriedBuffer;
    }
  });
}

// ─────────────────────────────────────────
// COMPRESSÃO GHOSTSCRIPT (segundo nível)
// Aplica após o Puppeteer gerar o PDF.
// Reduz imagens embutidas para 150 DPI e subseta fontes.
// Silenciosamente ignorado se o `gs` não estiver instalado na VPS.
// ─────────────────────────────────────────
let _gsAvailable = null;
function isGsAvailable() {
  if (_gsAvailable !== null) return _gsAvailable;
  try {
    execFileSync('gs', ['--version'], { timeout: 3000 });
    _gsAvailable = true;
  } catch {
    _gsAvailable = false;
    console.warn('[pdf/compress] Ghostscript não encontrado — compressão de segundo nível desabilitada.');
    console.warn('[pdf/compress] Para instalar: sudo apt-get install ghostscript');
  }
  return _gsAvailable;
}

async function comprimirPdfComGs(inputBuffer) {
  if (PDF_DISABLE_GS_COMPRESSION) {
    return inputBuffer;
  }

  const sizeMb = inputBuffer.length / 1024 / 1024;
  if (sizeMb > PDF_COMPRESS_SKIP_OVER_MB) {
    console.log(
      `[pdf/compress] Skipping Ghostscript for large PDF (${sizeMb.toFixed(1)} MB > ${PDF_COMPRESS_SKIP_OVER_MB} MB).`
    );
    return inputBuffer;
  }

  if (!isGsAvailable()) return inputBuffer;

  const tmpIn  = path.join(os.tmpdir(), `pdf-in-${Date.now()}.pdf`);
  const tmpOut = path.join(os.tmpdir(), `pdf-out-${Date.now()}.pdf`);

  try {
    fs.writeFileSync(tmpIn, inputBuffer);

    await new Promise((resolve, reject) => {
      execFile('gs', [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/ebook',   // 150 DPI — ótimo para tela, bem menor que /printer (300 DPI)
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        `-sOutputFile=${tmpOut}`,
        tmpIn,
      ], { timeout: PDF_COMPRESS_TIMEOUT_MS }, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const outputBuffer = fs.readFileSync(tmpOut);
    const reducao = (((inputBuffer.length - outputBuffer.length) / inputBuffer.length) * 100).toFixed(1);
    console.log(`[pdf/compress] Ghostscript: ${(inputBuffer.length / 1024 / 1024).toFixed(1)} MB → ${(outputBuffer.length / 1024 / 1024).toFixed(1)} MB (−${reducao}%)`);
    return outputBuffer;

  } catch (err) {
    console.warn('[pdf/compress] Ghostscript falhou, retornando PDF original:', err.message);
    return inputBuffer;
  } finally {
    try { fs.unlinkSync(tmpIn);  } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

async function renderHtmlToPdfCompressed(htmlContent) {
  const rawBuffer = await renderHtmlToPdf(htmlContent);
  return comprimirPdfComGs(rawBuffer);
}

module.exports = { renderHtmlToPdf, renderHtmlToPdfCompressed, comprimirPdfComGs };
