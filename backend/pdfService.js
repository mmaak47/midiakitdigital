'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

let _browser = null;

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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  _browser.on('disconnected', () => {
    _browser = null;
  });

  return _browser;
}

async function renderHtmlToPdf(htmlContent) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[puppeteer:console]', msg.text());
  });
  page.on('pageerror', (err) => {
    console.error('[puppeteer:pageerror]', err.message);
  });

  try {
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    const htmlWithFonts = _fontCssInjection
      ? htmlContent.replace('<head>', `<head>${_fontCssInjection}`)
      : htmlContent;

    // DEBUG — remove after diagnosis
    fs.writeFileSync('/tmp/debug-pdf.html', htmlWithFonts);
    console.log('[pdf] HTML salvo em /tmp/debug-pdf.html, tamanho:', htmlWithFonts.length, 'bytes');

    await page.setContent(htmlWithFonts, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for fonts (always embedded base64 — always fast)
    await page.evaluateHandle(() => document.fonts.ready);

    // Wait for images without blocking on failures
    await page.evaluate(() => {
      const imgs = Array.from(document.images);
      if (!imgs.length) return Promise.resolve();
      return Promise.allSettled(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve);
            setTimeout(resolve, 8000);
          });
        })
      );
    });

    // Let layout settle
    await new Promise((resolve) => setTimeout(resolve, 800));

    return await page.pdf({
      width: '1366px',
      height: '768px',
      printBackground: true,
      scale: 1,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await page.close();
  }
}

module.exports = { renderHtmlToPdf };
