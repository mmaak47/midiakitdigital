'use strict';

const puppeteer = require('puppeteer');

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;

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

  try {
    await page.setViewport({ width: 1680, height: 1188, deviceScaleFactor: 1 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.evaluateHandle(() => document.fonts.ready);

    return await page.pdf({
      width: '1680px',
      height: '1188px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await page.close();
  }
}

module.exports = { renderHtmlToPdf };
