'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, execFileSync } = require('child_process');

let _browser = null;
let _renderQueue = [];
let _isRendering = false;
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
    protocolTimeout: 180000,
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

async function _processRenderQueue() {
  if (_isRendering || _renderQueue.length === 0) {
    return;
  }

  _isRendering = true;

  try {
    while (_renderQueue.length > 0) {
      const task = _renderQueue.shift();
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
    _renderQueue.push({ fn, resolve, reject });
    _processRenderQueue().catch((err) => {
      console.error('[pdf-queue] Error:', err);
    });
  });
}

async function renderHtmlToPdf(htmlContent) {
  return _queueRender(async () => {
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

      const htmlWithFonts = _fontCssInjection
        ? htmlContent.replace('<head>', `<head>${_fontCssInjection}`)
        : htmlContent;

      await page.setContent(htmlWithFonts, { waitUntil: 'domcontentloaded', timeout: 120000 });

      // Wait for fonts when available, but do not fail PDF generation if this step hangs.
      try {
        await page.evaluateHandle(() => document.fonts.ready);
      } catch (err) {
        console.warn('[pdf/render] font readiness skipped:', err?.message || err);
      }

      // Wait for images without blocking on failures.
      try {
        await page.evaluate(() => {
          const imgs = Array.from(document.images);
          if (!imgs.length) return Promise.resolve();
          return Promise.allSettled(
            imgs.map((img) => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
                setTimeout(resolve, 15000);
              });
            })
          );
        });
      } catch (err) {
        console.warn('[pdf/render] image wait skipped:', err?.message || err);
      }

      // Let layout settle — imagens já chegam como data URLs, o layout estabiliza rápido
      await new Promise((resolve) => setTimeout(resolve, 350));

      const pdfBuffer = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        scale: 1,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      return pdfBuffer;
    } finally {
      await page.close();
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
      ], { timeout: 120_000 }, (err) => {
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
