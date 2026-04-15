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
    delayMs: 2200,
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

  let sql = `SELECT id, nome, endereco, cidade FROM pontos WHERE ${where.join(' AND ')} ORDER BY cidade, nome`;
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
  }));

  if (limit > 0) {
    return normalized.slice(offset, offset + limit);
  }
  return normalized;
}

async function tryAcceptConsent(page) {
  const labels = ['Aceitar tudo', 'I agree', 'Accept all'];
  for (const label of labels) {
    const clicked = await page.evaluate((btnLabel) => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const target = buttons.find((el) => (el.textContent || '').trim() === btnLabel);
      if (!target) return false;
      target.click();
      return true;
    }, label);
    if (clicked) {
      await sleep(800);
      return true;
    }
  }
  return false;
}

function normalizeHoursText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDayHours(line) {
  const dayMatchers = [
    { key: 'segunda', re: /segundas?(?:-feiras?)?/i },
    { key: 'terca', re: /tercas?(?:-feiras?)?|terças?(?:-feiras?)?/i },
    { key: 'quarta', re: /quartas?(?:-feiras?)?/i },
    { key: 'quinta', re: /quintas?(?:-feiras?)?/i },
    { key: 'sexta', re: /sextas?(?:-feiras?)?/i },
    { key: 'sabado', re: /sabados?|sábados?/i },
    { key: 'domingo', re: /domingos?/i },
  ];

  const daySpec = dayMatchers.find((d) => d.re.test(line));
  if (!daySpec) return null;

  const dayMatch = line.match(daySpec.re);
  if (!dayMatch || dayMatch.index == null) {
    return { day: daySpec.key, hours: normalizeHoursText(line) };
  }

  const afterDay = line
    .slice(dayMatch.index + dayMatch[0].length)
    .replace(/^[\s:,-]+/g, '')
    .trim();

  return {
    day: daySpec.key,
    hours: normalizeHoursText(afterDay || line),
  };
}

async function scrapeOne(page, ponto, retry) {
  const query = [ponto.nome, ponto.endereco, ponto.cidade, 'horario de funcionamento'].filter(Boolean).join(' ');
  const url = `https://www.google.com/search?hl=pt-BR&gl=br&q=${encodeURIComponent(query)}`;

  for (let attempt = 0; attempt <= retry; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 });
      await tryAcceptConsent(page);
      await page.waitForSelector('body', { timeout: 12000 });
      await sleep(900);

      const payload = await page.evaluate(() => {
        const title =
          document.querySelector('#rhs h2 span')?.textContent?.trim() ||
          document.querySelector('div[data-attrid="title"] span')?.textContent?.trim() ||
          document.querySelector('h3')?.textContent?.trim() ||
          '';

        const mapLink =
          document.querySelector('a[href*="google.com/maps/place"]')?.href ||
          document.querySelector('a[href*="google.com/maps/search"]')?.href ||
          '';

        const hourContainers = Array.from(document.querySelectorAll('div[data-attrid*="hours"], [aria-label*="Horário" i], [aria-label*="Hours" i]'));
        const rowTexts = [];

        for (const container of hourContainers) {
          const rows = Array.from(container.querySelectorAll('tr, [role="row"], div'));
          for (const row of rows) {
            const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
            if (!txt) continue;
            if (!rowTexts.includes(txt) && txt.length <= 140) rowTexts.push(txt);
          }
        }

        const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ');
        const hasCaptcha = /unusual traffic|captcha|nao sou um robo|não sou um robô/i.test(bodyText);

        return {
          title,
          mapLink,
          rowTexts,
          hasCaptcha,
        };
      });

      if (payload.hasCaptcha) {
        return {
          status: 'blocked',
          query,
          google_title: payload.title,
          map_url: payload.mapLink,
          hours_raw: '',
          hours_by_day: {},
          error: 'Google blocked request with captcha/traffic check',
        };
      }

      const hoursByDay = {};
      for (const line of payload.rowTexts) {
        const parsed = extractDayHours(line);
        if (parsed && !hoursByDay[parsed.day]) {
          hoursByDay[parsed.day] = parsed.hours;
        }
      }

      const raw = payload.rowTexts.join(' | ');
      const hasHours = Object.keys(hoursByDay).length > 0 || /aberto|fechado|24 horas/i.test(raw);

      if (!hasHours) {
        const mapsFallback = await scrapeFromMaps(page, query);
        if (mapsFallback.status === 'ok') {
          return {
            status: 'ok',
            query,
            google_title: mapsFallback.google_title || payload.title,
            map_url: mapsFallback.map_url || payload.mapLink,
            hours_raw: mapsFallback.hours_raw,
            hours_by_day: mapsFallback.hours_by_day,
            error: '',
          };
        }
      }

      return {
        status: hasHours ? 'ok' : 'not_found',
        query,
        google_title: payload.title,
        map_url: payload.mapLink,
        hours_raw: raw,
        hours_by_day: hoursByDay,
        error: hasHours ? '' : 'Could not parse detailed hours from Google result',
      };
    } catch (err) {
      if (attempt >= retry) {
        return {
          status: 'error',
          query,
          google_title: '',
          map_url: '',
          hours_raw: '',
          hours_by_day: {},
          error: String(err?.message || err),
        };
      }
      await sleep(1300 + attempt * 900);
    }
  }

  return {
    status: 'error',
    query,
    google_title: '',
    map_url: '',
    hours_raw: '',
    hours_by_day: {},
    error: 'Unknown error',
  };
}

async function scrapeFromMaps(page, query) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  try {
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 50000 });
    await page.waitForSelector('body', { timeout: 12000 });
    await sleep(1700);

    const clickedFirstResult = await page.evaluate(() => {
      const first = document.querySelector('a.hfpxzc, a[href*="/maps/place/"]');
      if (!first) return false;
      first.click();
      return true;
    });

    if (clickedFirstResult) {
      await sleep(1800);
    }

    const payload = await page.evaluate(() => {
      const title =
        document.querySelector('h1.DUwDvf')?.textContent?.trim() ||
        document.querySelector('h1')?.textContent?.trim() ||
        '';

      const lines = (document.body?.innerText || '')
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const dayRe = /(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)/i;
      const timeRe = /(\d{1,2}:\d{2}|24 horas|fechado)/i;
      const hourLines = [];
      for (const line of lines) {
        if (!dayRe.test(line)) continue;
        if (!timeRe.test(line) && !/aberto|fecha/i.test(line)) continue;
        if (line.length > 170) continue;
        if (!hourLines.includes(line)) hourLines.push(line);
      }

      return {
        title,
        mapUrl: window.location.href,
        hourLines,
      };
    });

    const hoursByDay = {};
    for (const line of payload.hourLines) {
      const parsed = extractDayHours(line);
      if (parsed && !hoursByDay[parsed.day]) {
        hoursByDay[parsed.day] = parsed.hours;
      }
    }

    const raw = payload.hourLines.join(' | ');
    const hasHours = Object.keys(hoursByDay).length > 0 || /aberto|fechado|24 horas/i.test(raw);

    return {
      status: hasHours ? 'ok' : 'not_found',
      google_title: payload.title,
      map_url: payload.mapUrl,
      hours_raw: raw,
      hours_by_day: hoursByDay,
      error: hasHours ? '' : 'Google Maps fallback did not expose parsable hour rows',
    };
  } catch (err) {
    return {
      status: 'error',
      google_title: '',
      map_url: '',
      hours_raw: '',
      hours_by_day: {},
      error: String(err?.message || err),
    };
  }
}

function toCsv(rows) {
  const headers = [
    'id',
    'nome',
    'endereco',
    'cidade',
    'status',
    'query',
    'google_title',
    'map_url',
    'hours_raw',
    'hours_by_day_json',
    'error',
    'scraped_at',
  ];

  const esc = (value) => {
    const v = String(value == null ? '' : value);
    if (!/[",\n]/.test(v)) return v;
    return '"' + v.replace(/"/g, '""') + '"';
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      row.nome,
      row.endereco,
      row.cidade,
      row.status,
      row.query,
      row.google_title,
      row.map_url,
      row.hours_raw,
      JSON.stringify(row.hours_by_day || {}),
      row.error,
      row.scraped_at,
    ].map(esc).join(','));
  }
  return lines.join('\n');
}

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
      throw new Error(
        `Could not load pontos from local DB (${err.message}). ` +
        'Use --apiBase=http://SEU_HOST to read pontos via API.'
      );
    }
  }

  if (!pontos.length) {
    console.log('[scrape-google-hours] no active pontos found.');
    return;
  }

  console.log(`[scrape-google-hours] pontos loaded: ${pontos.length}`);
  console.log(`[scrape-google-hours] output dir: ${opts.outDir}`);

  const browser = await puppeteer.launch({
    headless: opts.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  const results = [];
  try {
    for (let i = 0; i < pontos.length; i += 1) {
      const ponto = pontos[i];
      process.stdout.write(`[${i + 1}/${pontos.length}] ${ponto.nome} ... `);

      const scraped = await scrapeOne(page, ponto, opts.retry);
      const row = {
        id: ponto.id,
        nome: ponto.nome,
        endereco: ponto.endereco || '',
        cidade: ponto.cidade || '',
        scraped_at: new Date().toISOString(),
        ...scraped,
      };
      results.push(row);

      process.stdout.write(`${row.status}\n`);
      await sleep(opts.delayMs + Math.floor(Math.random() * 1100));
    }
  } finally {
    await browser.close();
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `google_hours_${stamp}`;

  if (opts.format === 'json' || opts.format === 'both') {
    const jsonPath = path.join(opts.outDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`[scrape-google-hours] JSON saved: ${jsonPath}`);
  }

  if (opts.format === 'csv' || opts.format === 'both') {
    const csvPath = path.join(opts.outDir, `${baseName}.csv`);
    fs.writeFileSync(csvPath, toCsv(results), 'utf8');
    console.log(`[scrape-google-hours] CSV saved: ${csvPath}`);
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const notFound = results.filter((r) => r.status === 'not_found').length;
  const blocked = results.filter((r) => r.status === 'blocked').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log(`[scrape-google-hours] done. ok=${ok} not_found=${notFound} blocked=${blocked} error=${errors}`);
}

main().catch((err) => {
  console.error('[scrape-google-hours] fatal:', err);
  process.exit(1);
});
