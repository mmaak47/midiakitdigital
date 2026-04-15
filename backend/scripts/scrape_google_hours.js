require('dotenv').config();

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const opts = {
    format: 'both',
    limit: 0,
    offset: 0,
    outDir: path.resolve(__dirname, '..', 'exports'),
    headless: true,
    delayMs: 2500,
    retry: 2,
    apiBase: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--format=')) opts.format = arg.split('=')[1] || 'both';
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.split('=')[1] || 0);
    else if (arg.startsWith('--offset=')) opts.offset = Number(arg.split('=')[1] || 0);
    else if (arg.startsWith('--outDir=')) opts.outDir = path.resolve(process.cwd(), arg.split('=')[1] || 'backend/exports');
    else if (arg.startsWith('--delay=')) opts.delayMs = Math.max(0, Number(arg.split('=')[1] || 0));
    else if (arg.startsWith('--retry=')) opts.retry = Math.max(0, Number(arg.split('=')[1] || 0));
    else if (arg.startsWith('--apiBase=')) opts.apiBase = String(arg.split('=')[1] || '').trim();
    else if (arg === '--headless=false') opts.headless = false;
  }

  if (!['json', 'csv', 'both'].includes(opts.format)) {
    throw new Error("--format must be json, csv or both");
  }

  return opts;
}

function getPontos(limit, offset) {
  const db = require('../database');
  const where = ['ativo = 1'];
  const params = [];

  let sql = `SELECT id, nome, endereco, cidade, lat, lng FROM pontos WHERE ${where.join(' AND ')} ORDER BY cidade, nome`;
  if (limit > 0) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  return db.prepare(sql).all(...params);
}

async function getPontosFromApi(apiBase, limit, offset) {
  const base = String(apiBase || '').replace(/\/$/, '');
  if (!base) throw new Error('Invalid --apiBase value');

  const url = `${base}/api/pontos`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`API request failed (${res.status}): ${url}`);
  }

  const all = await res.json();
  const normalized = (Array.isArray(all) ? all : []).map((p) => ({
    id: p.id,
    nome: p.nome || '',
    endereco: p.endereco || '',
    cidade: p.cidade || '',
    lat: p.lat || null,
    lng: p.lng || null,
  }));

  if (limit > 0) {
    return normalized.slice(offset, offset + limit);
  }
  return normalized;
}

async function tryAcceptConsent(page) {
  const labels = ['Aceitar tudo', 'I agree', 'Accept all', 'Rejeitar tudo', 'Reject all'];
  for (const label of labels) {
    const clicked = await page.evaluate((btnLabel) => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const target = buttons.find((el) => (el.textContent || '').trim().toLowerCase() === btnLabel.toLowerCase());
      if (!target) return false;
      target.click();
      return true;
    }, label);
    if (clicked) {
      await sleep(1200);
      return true;
    }
  }
  return false;
}

// ─── Day extraction ──────────────────────────────────────────────────────────

const DAY_MATCHERS = [
  { key: 'segunda', re: /segundas?(?:-feiras?)?/i },
  { key: 'terca', re: /ter[cç]as?(?:-feiras?)?/i },
  { key: 'quarta', re: /quartas?(?:-feiras?)?/i },
  { key: 'quinta', re: /quintas?(?:-feiras?)?/i },
  { key: 'sexta', re: /sextas?(?:-feiras?)?/i },
  { key: 'sabado', re: /s[aá]bados?/i },
  { key: 'domingo', re: /domingos?/i },
  // English fallback
  { key: 'segunda', re: /\bmondays?\b/i },
  { key: 'terca', re: /\btuesdays?\b/i },
  { key: 'quarta', re: /\bwednesdays?\b/i },
  { key: 'quinta', re: /\bthursdays?\b/i },
  { key: 'sexta', re: /\bfridays?\b/i },
  { key: 'sabado', re: /\bsaturdays?\b/i },
  { key: 'domingo', re: /\bsundays?\b/i },
];

function extractDayHours(line) {
  const daySpec = DAY_MATCHERS.find((d) => d.re.test(line));
  if (!daySpec) return null;

  const dayMatch = line.match(daySpec.re);
  if (!dayMatch || dayMatch.index == null) {
    return { day: daySpec.key, hours: line.replace(/\s+/g, ' ').trim() };
  }

  const afterDay = line
    .slice(dayMatch.index + dayMatch[0].length)
    .replace(/^[\s:,\-\u2013\u2014]+/g, '')
    .trim();

  return {
    day: daySpec.key,
    hours: (afterDay || line).replace(/\s+/g, ' ').trim(),
  };
}

function matchDayKey(text) {
  const normalized = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/segunda/.test(normalized)) return 'segunda';
  if (/terca/.test(normalized)) return 'terca';
  if (/quarta/.test(normalized)) return 'quarta';
  if (/quinta/.test(normalized)) return 'quinta';
  if (/sexta/.test(normalized)) return 'sexta';
  if (/sabado/.test(normalized)) return 'sabado';
  if (/domingo/.test(normalized)) return 'domingo';
  return null;
}

// ─── Strategy 1: Google Maps (primary) ───────────────────────────────────────

async function scrapeFromMaps(page, ponto, retry) {
  const parts = [ponto.nome, ponto.endereco, ponto.cidade].filter(Boolean);
  const query = parts.join(', ');
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  for (let attempt = 0; attempt <= retry; attempt += 1) {
    try {
      await page.goto(mapsUrl, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(1500);
      await tryAcceptConsent(page);
      await sleep(800);

      // Click first result if search showed a list
      const clickedResult = await page.evaluate(() => {
        const link = document.querySelector('a.hfpxzc, a[href*="/maps/place/"], div.Nv2PK a');
        if (link) { link.click(); return true; }
        return false;
      });
      if (clickedResult) await sleep(2500);

      // Try to expand hours section
      await page.evaluate(() => {
        const btns = document.querySelectorAll(
          'button[data-item-id="oh"], [aria-label*="hor\u00e1rio" i], [aria-label*="hours" i]'
        );
        btns.forEach((b) => b.click());
      });
      await sleep(800);

      const payload = await page.evaluate(() => {
        const title =
          document.querySelector('h1.DUwDvf')?.textContent?.trim() ||
          document.querySelector('h1.fontHeadlineLarge')?.textContent?.trim() ||
          document.querySelector('h1')?.textContent?.trim() || '';

        const hourRows = [];

        // A: Structured hour containers
        const containers = document.querySelectorAll(
          '[aria-label*="hor\u00e1rio" i], [aria-label*="hours" i], ' +
          'table.eK4R0e, table.WgFkxc, div.t39EBf, div.OqCZI, ' +
          '[data-attrid*="hours"]'
        );
        for (const c of containers) {
          const rows = c.querySelectorAll('tr, [role="row"]');
          for (const row of rows) {
            const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
            if (txt && txt.length <= 180 && !hourRows.includes(txt)) hourRows.push(txt);
          }
          if (!rows.length) {
            const txt = (c.textContent || '').replace(/\s+/g, ' ').trim();
            if (txt && txt.length <= 300 && !hourRows.includes(txt)) hourRows.push(txt);
          }
        }

        // B: aria-label with time patterns
        const ariaEls = document.querySelectorAll('[aria-label]');
        for (const el of ariaEls) {
          const label = el.getAttribute('aria-label') || '';
          if (/\d{1,2}:\d{2}/.test(label) &&
              /(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(label)) {
            if (label.length <= 600 && !hourRows.includes(label)) hourRows.push(label);
          }
        }

        // C: Scan visible text for day+time patterns
        const lines = (document.body?.innerText || '').split('\n')
          .map((l) => l.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        const dayRe = /(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
        const timeRe = /(\d{1,2}:\d{2}|24\s*h|fechado|closed)/i;
        for (const line of lines) {
          if (!dayRe.test(line) || !timeRe.test(line)) continue;
          if (line.length > 200 || line.length < 5) continue;
          if (!hourRows.includes(line)) hourRows.push(line);
        }

        // D: JSON-LD structured data
        let jsonLdHours = null;
        for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const data = JSON.parse(script.textContent);
            for (const item of (Array.isArray(data) ? data : [data])) {
              if (item?.openingHoursSpecification || item?.openingHours) {
                jsonLdHours = item.openingHours || item.openingHoursSpecification;
                break;
              }
            }
          } catch { /* ignore */ }
          if (jsonLdHours) break;
        }

        const hasCaptcha = /unusual traffic|captcha|n\u00e3o sou um rob\u00f4/i.test(document.body?.innerText || '');

        return { title, mapUrl: window.location.href, hourRows, jsonLdHours, hasCaptcha };
      });

      if (payload.hasCaptcha) {
        return { status: 'blocked', query, google_title: payload.title, map_url: payload.mapUrl,
          hours_raw: '', hours_by_day: {}, error: 'Google blocked with captcha' };
      }

      // Parse JSON-LD hours
      const hoursByDay = {};
      if (payload.jsonLdHours) {
        const ldList = Array.isArray(payload.jsonLdHours) ? payload.jsonLdHours : [payload.jsonLdHours];
        for (const spec of ldList) {
          if (typeof spec === 'string') {
            Object.assign(hoursByDay, parseOpeningHoursSpec(spec));
          } else if (spec?.dayOfWeek) {
            const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
            const opens = spec.opens || '';
            const closes = spec.closes || '';
            const timeStr = opens && closes ? `${opens}\u2013${closes}` : '';
            for (const dow of days) {
              const dayKey = schemaDayToKey(dow);
              if (dayKey && timeStr) hoursByDay[dayKey] = timeStr;
            }
          }
        }
      }

      // Parse text-based rows
      for (const line of payload.hourRows) {
        // Handle "Segunda a Sexta: 08:00-18:00" range format
        const rangeMatch = line.match(/(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)\s*(?:a|[àá]|at[eé]|-)\s*(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)\s*[:,-]?\s*(\d{1,2}[:.]\d{2}.*)/i);
        if (rangeMatch) {
          const startDay = matchDayKey(rangeMatch[1]);
          const endDay = matchDayKey(rangeMatch[2]);
          const timeStr = rangeMatch[3].replace(/\s+/g, ' ').trim();
          if (startDay && endDay) {
            const allDays = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
            const si = allDays.indexOf(startDay);
            const ei = allDays.indexOf(endDay);
            if (si >= 0 && ei >= 0) {
              for (let di = si; di <= ei; di++) {
                if (!hoursByDay[allDays[di]]) hoursByDay[allDays[di]] = timeStr;
              }
              continue;
            }
          }
        }

        const parsed = extractDayHours(line);
        if (parsed && !hoursByDay[parsed.day]) hoursByDay[parsed.day] = parsed.hours;
      }

      const raw = payload.hourRows.join(' | ');
      const hasHours = Object.keys(hoursByDay).length > 0 || /aberto|fechado|24\s*h/i.test(raw);

      return {
        status: hasHours ? 'ok' : 'not_found', query,
        google_title: payload.title, map_url: payload.mapUrl,
        hours_raw: raw, hours_by_day: hoursByDay,
        error: hasHours ? '' : 'No hours found on Google Maps for this location',
      };
    } catch (err) {
      if (attempt >= retry) {
        return { status: 'error', query, google_title: '', map_url: '', hours_raw: '',
          hours_by_day: {}, error: String(err?.message || err) };
      }
      await sleep(2000 + attempt * 1500);
    }
  }
  return { status: 'error', query, google_title: '', map_url: '', hours_raw: '',
    hours_by_day: {}, error: 'Unknown error' };
}

// ─── Strategy 2: Coordinates-based Maps search ──────────────────────────────

async function scrapeFromCoords(page, ponto) {
  const lat = Number(ponto.lat);
  const lng = Number(ponto.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

  const query = encodeURIComponent(ponto.nome || '');
  const mapsUrl = `https://www.google.com/maps/search/${query}/@${lat},${lng},18z`;

  try {
    await page.goto(mapsUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(2000);
    await tryAcceptConsent(page);

    const clickedResult = await page.evaluate(() => {
      const link = document.querySelector('a.hfpxzc, div.Nv2PK a');
      if (link) { link.click(); return true; }
      return false;
    });
    if (clickedResult) await sleep(2500);

    await page.evaluate(() => {
      document.querySelectorAll('button[data-item-id="oh"], [aria-label*="hor\u00e1rio" i]')
        .forEach((b) => b.click());
    });
    await sleep(800);

    const payload = await page.evaluate(() => {
      const title = (document.querySelector('h1.DUwDvf, h1') || {}).textContent?.trim() || '';
      const hourRows = [];
      const lines = (document.body?.innerText || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const dayRe = /(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
      const timeRe = /(\d{1,2}:\d{2}|24\s*h|fechado|closed)/i;
      for (const line of lines) {
        if (!dayRe.test(line) || !timeRe.test(line)) continue;
        if (line.length > 200 || line.length < 5) continue;
        if (!hourRows.includes(line)) hourRows.push(line);
      }
      return { title, hourRows, mapUrl: window.location.href };
    });

    const hoursByDay = {};
    for (const line of payload.hourRows) {
      const parsed = extractDayHours(line);
      if (parsed && !hoursByDay[parsed.day]) hoursByDay[parsed.day] = parsed.hours;
    }

    if (Object.keys(hoursByDay).length > 0) {
      return {
        status: 'ok', query: ponto.nome,
        google_title: payload.title, map_url: payload.mapUrl,
        hours_raw: payload.hourRows.join(' | '), hours_by_day: hoursByDay, error: '',
      };
    }
    return null;
  } catch { return null; }
}

// ─── Strategy 3: Google Search (fallback) ────────────────────────────────────

async function scrapeFromSearch(page, ponto, retry) {
  const query = [ponto.nome, ponto.cidade, 'hor\u00e1rio'].filter(Boolean).join(' ');
  const url = `https://www.google.com/search?hl=pt-BR&gl=br&q=${encodeURIComponent(query)}`;

  for (let attempt = 0; attempt <= retry; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await tryAcceptConsent(page);
      await sleep(1200);

      const payload = await page.evaluate(() => {
        const title =
          document.querySelector('#rhs h2 span')?.textContent?.trim() ||
          document.querySelector('div[data-attrid="title"] span')?.textContent?.trim() || '';

        const hourRows = [];
        const selectors = [
          'div[data-attrid*="hours"]', 'div[data-attrid*="kc:/local"]',
          '[aria-label*="Hor\u00e1rio" i]', '[aria-label*="Hours" i]',
          'table.WgFkxc', 'div.OqCZI', 'div.t39EBf',
        ];
        const seen = new Set();
        for (const sel of selectors) {
          for (const el of document.querySelectorAll(sel)) {
            for (const row of el.querySelectorAll('tr, [role="row"], li')) {
              const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
              if (txt && txt.length <= 180 && !seen.has(txt)) { seen.add(txt); hourRows.push(txt); }
            }
            if (!el.querySelectorAll('tr, [role="row"], li').length) {
              const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
              if (txt && txt.length <= 300 && !seen.has(txt)) { seen.add(txt); hourRows.push(txt); }
            }
          }
        }

        // Text scan
        const lines = (document.body?.innerText || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const dayRe = /(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)/i;
        const timeRe = /(\d{1,2}:\d{2}|24\s*h|fechado)/i;
        for (const line of lines) {
          if (!dayRe.test(line) || !timeRe.test(line)) continue;
          if (line.length > 200 || line.length < 5) continue;
          if (!seen.has(line)) { seen.add(line); hourRows.push(line); }
        }

        // JSON-LD
        let jsonLdHours = null;
        for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const data = JSON.parse(script.textContent);
            for (const item of (Array.isArray(data) ? data : [data])) {
              if (item?.openingHoursSpecification || item?.openingHours) {
                jsonLdHours = item.openingHours || item.openingHoursSpecification;
                break;
              }
            }
          } catch { /* ignore */ }
          if (jsonLdHours) break;
        }

        const hasCaptcha = /unusual traffic|captcha/i.test(document.body?.innerText || '');
        return { title, hourRows, jsonLdHours, hasCaptcha };
      });

      if (payload.hasCaptcha) {
        return { status: 'blocked', query, google_title: payload.title, map_url: '',
          hours_raw: '', hours_by_day: {}, error: 'Google blocked with captcha' };
      }

      const hoursByDay = {};
      if (payload.jsonLdHours) {
        const ldList = Array.isArray(payload.jsonLdHours) ? payload.jsonLdHours : [payload.jsonLdHours];
        for (const spec of ldList) {
          if (typeof spec === 'string') Object.assign(hoursByDay, parseOpeningHoursSpec(spec));
        }
      }
      for (const line of payload.hourRows) {
        const parsed = extractDayHours(line);
        if (parsed && !hoursByDay[parsed.day]) hoursByDay[parsed.day] = parsed.hours;
      }

      const raw = payload.hourRows.join(' | ');
      const hasHours = Object.keys(hoursByDay).length > 0 || /aberto|fechado|24\s*h/i.test(raw);

      return {
        status: hasHours ? 'ok' : 'not_found', query,
        google_title: payload.title, map_url: '',
        hours_raw: raw, hours_by_day: hoursByDay,
        error: hasHours ? '' : 'No hours in Google Search results',
      };
    } catch (err) {
      if (attempt >= retry) {
        return { status: 'error', query, google_title: '', map_url: '', hours_raw: '',
          hours_by_day: {}, error: String(err?.message || err) };
      }
      await sleep(1500 + attempt * 1000);
    }
  }
  return { status: 'error', query, google_title: '', map_url: '', hours_raw: '',
    hours_by_day: {}, error: 'Unknown error' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseOpeningHoursSpec(spec) {
  const map = { mo: 'segunda', tu: 'terca', we: 'quarta', th: 'quinta', fr: 'sexta', sa: 'sabado', su: 'domingo' };
  const result = {};
  for (const part of String(spec).split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Za-z, -]+)\s+(\d{1,2}:\d{2}\s*[-\u2013]\s*\d{1,2}:\d{2})/);
    if (!m) continue;
    const dayRange = m[1].trim().toLowerCase();
    const time = m[2];
    const rm = dayRange.match(/^(\w{2})\s*-\s*(\w{2})$/);
    if (rm) {
      const allDays = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
      const si = allDays.indexOf(rm[1]);
      const ei = allDays.indexOf(rm[2]);
      if (si >= 0 && ei >= 0) {
        for (let i = si; i <= ei; i++) { if (map[allDays[i]]) result[map[allDays[i]]] = time; }
      }
    } else {
      for (const d of dayRange.split(',').map((x) => x.trim())) {
        if (map[d]) result[map[d]] = time;
      }
    }
  }
  return result;
}

function schemaDayToKey(dow) {
  const map = { monday: 'segunda', tuesday: 'terca', wednesday: 'quarta', thursday: 'quinta',
    friday: 'sexta', saturday: 'sabado', sunday: 'domingo' };
  return map[String(dow || '').toLowerCase().replace(/https?:\/\/schema\.org\//i, '')] || null;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

async function scrapeOne(page, ponto, retry) {
  // 1. Google Maps by name + address
  const mapsResult = await scrapeFromMaps(page, ponto, retry);
  if (mapsResult.status === 'ok' || mapsResult.status === 'blocked') return mapsResult;

  // 2. Google Maps near coordinates
  if (ponto.lat && ponto.lng) {
    const coordResult = await scrapeFromCoords(page, ponto);
    if (coordResult?.status === 'ok') return coordResult;
  }

  // 3. Google Search
  const searchResult = await scrapeFromSearch(page, ponto, Math.min(retry, 1));
  if (searchResult.status === 'ok' || searchResult.status === 'blocked') return searchResult;

  return { ...mapsResult, error: 'No hours found via Google Maps or Google Search' };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function toCsv(rows) {
  const headers = ['id', 'nome', 'endereco', 'cidade', 'status', 'query', 'google_title', 'map_url', 'hours_raw', 'hours_by_day_json', 'error', 'scraped_at'];
  const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.nome, r.endereco, r.cidade, r.status, r.query, r.google_title, r.map_url, r.hours_raw, JSON.stringify(r.hours_by_day || {}), r.error, r.scraped_at].map(esc).join(','));
  }
  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.outDir, { recursive: true });

  let pontos = [];
  if (opts.apiBase) {
    pontos = await getPontosFromApi(opts.apiBase, opts.limit, opts.offset);
  } else {
    try {
      pontos = getPontos(opts.limit, opts.offset);
    } catch (err) {
      throw new Error(`Could not load pontos from local DB (${err.message}). Use --apiBase=http://HOST to read via API.`);
    }
  }

  if (!pontos.length) {
    console.log('[scrape-google-hours] no active pontos found.');
    return;
  }

  console.log(`[scrape-google-hours] pontos: ${pontos.length} | headless: ${opts.headless} | outDir: ${opts.outDir}`);

  const browser = await puppeteer.launch({
    headless: opts.headless ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--lang=pt-BR'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.3' });

  const results = [];
  try {
    for (let i = 0; i < pontos.length; i += 1) {
      const ponto = pontos[i];
      process.stdout.write(`[${i + 1}/${pontos.length}] ${ponto.nome} (${ponto.cidade}) ... `);

      const scraped = await scrapeOne(page, ponto, opts.retry);
      const row = { id: ponto.id, nome: ponto.nome, endereco: ponto.endereco || '', cidade: ponto.cidade || '', scraped_at: new Date().toISOString(), ...scraped };
      results.push(row);

      const dayCount = Object.keys(row.hours_by_day || {}).length;
      process.stdout.write(`${row.status === 'ok' ? `ok (${dayCount} days)` : row.status}\n`);
      if (row.status === 'ok') process.stdout.write(`  \u2192 ${JSON.stringify(row.hours_by_day)}\n`);

      await sleep(opts.delayMs + Math.floor(Math.random() * 2000));
    }
  } finally {
    await browser.close();
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `google_hours_${stamp}`;

  if (opts.format === 'json' || opts.format === 'both') {
    const jsonPath = path.join(opts.outDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`[scrape-google-hours] JSON: ${jsonPath}`);
  }
  if (opts.format === 'csv' || opts.format === 'both') {
    const csvPath = path.join(opts.outDir, `${baseName}.csv`);
    fs.writeFileSync(csvPath, toCsv(results), 'utf8');
    console.log(`[scrape-google-hours] CSV: ${csvPath}`);
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const notFound = results.filter((r) => r.status === 'not_found').length;
  const blocked = results.filter((r) => r.status === 'blocked').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log(`\n[scrape-google-hours] DONE: ok=${ok} not_found=${notFound} blocked=${blocked} error=${errors}`);

  if (notFound > 0) {
    console.log(`\n[!] ${notFound} pontos sem hor\u00e1rio no Google.`);
    console.log('    - Edif\u00edcios/condom\u00ednios residenciais raramente t\u00eam hor\u00e1rios no Google');
    console.log('    - Para esses, defina o hor\u00e1rio manualmente no painel admin');
  }
}

main().catch((err) => {
  console.error('[scrape-google-hours] fatal:', err);
  process.exit(1);
});
