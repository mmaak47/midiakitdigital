/**
 * arteService.js
 * Serviço de geração de arte via IA (Replicate / Flux 1.1 Pro) para pontos DOOH.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────
// CONFIGURAÇÃO
// ─────────────────────────────────────────
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';

// Modelo Flux 1.1 Pro no Replicate
// Documentação: https://replicate.com/black-forest-labs/flux-1.1-pro
const REPLICATE_MODEL = 'black-forest-labs/flux-1.1-pro';
const REPLICATE_PREDICTIONS_URL = `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`;

const TIMEOUT_MS = 120_000; // Replicate pode levar mais tempo (polling)
const POLL_INTERVAL_MS = 2_000;
// Mantemos 1 imagem por chamada para reduzir incidência de rate limit (429).
const NUM_IMAGES = 1;

// ─────────────────────────────────────────
// ORIENTAÇÃO
// ─────────────────────────────────────────
function detectarOrientacao(w, h) {
  const ratio = w / h;
  if (ratio >= 1.5)  return 'landscape';
  if (ratio <= 0.67) return 'portrait';
  return 'square';
}

// ─────────────────────────────────────────
// NORMALIZAÇÃO DE RESOLUÇÃO
// APIs de geração exigem dimensões em múltiplos de 16.
// Flux 1.1 Pro (Replicate) aceita no máximo 1440px por lado.
// Garante MIN 256px, MAX 1440px por lado.
// ─────────────────────────────────────────
function normalizarResolucao(w, h, multiploBase = 16) {
  const MIN = 256;
  const MAX = 1440;

  // Garantir que nenhum lado ultrapasse o MAX
  if (w > MAX || h > MAX) {
    const scale = Math.min(MAX / w, MAX / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  // Garantir mínimo
  if (w < MIN) w = MIN;
  if (h < MIN) h = MIN;

  // Arredondar para múltiplo de 16 (ou multiploBase)
  const snap = (n) => Math.round(n / multiploBase) * multiploBase;
  const nw = snap(w) || multiploBase;
  const nh = snap(h) || multiploBase;
  const normalizado = (nw !== w || nh !== h);
  return { w: nw, h: nh, normalizado, wOriginal: w, hOriginal: h };
}

// ─────────────────────────────────────────
// DADOS DE CONTEXTO
// ─────────────────────────────────────────
const COMPOSICAO_POR_ORIENTACAO = {
  landscape: `
    Wide horizontal composition.
    Bold visual element on the left half.
    Clean empty space on the right half for text overlay.
    Strong horizontal leading lines.
  `,
  portrait: `
    Tall vertical composition.
    Strong visual element in the upper 60% of the frame.
    Clean empty space in the lower 40% for text overlay.
    Subject centered horizontally.
  `,
  square: `
    Centered square composition.
    Subject centered with breathing room on all sides.
    Clean space in lower third for text overlay.
  `
};

const SEGMENTO_VISUAL = {
  // Chaves do sistema (minúsculas)
  construtora:  'luxury residential architecture, modern building facade, construction excellence',
  imobiliaria:  'premium real estate, architectural exterior, modern residential building',
  clinica:      'clean clinical environment, wellness, soft lighting, healthcare',
  hospital:     'modern hospital facility, medical professionals, clean healthcare setting',
  varejo:       'modern retail space, commercial interior, shopping environment',
  restaurante:  'gourmet food, warm restaurant lighting, fine dining atmosphere',
  faculdade:    'modern university campus, academic environment, knowledge and innovation',
  escola:       'bright educational environment, modern school, learning space',
  advocacia:    'premium corporate office, professional legal environment, executive setting',
  industria:    'industrial facility, precision manufacturing, modern production',
  automotivo:   'luxury automotive showroom, car dealership, sleek vehicles',
  fitness:      'modern gym, fitness equipment, energetic athletic environment',
  beleza:       'elegant beauty salon, aesthetic clinic, luxury self-care space',
  pet:          'modern pet shop, veterinary clinic, animal care environment',
  farmacia:     'clean modern pharmacy, healthcare retail, wellness products',
  supermercado: 'modern supermarket, fresh produce display, retail grocery',
  financeiro:   'premium financial institution, modern bank, executive corporate office',
  turismo:      'luxury hotel lobby, tourism destination, travel hospitality',
  coworking:    'modern coworking space, collaborative office, innovative work environment',
  tecnologia:   'modern tech office, innovation lab, digital technology environment',
  contabilidade:'professional corporate office, financial services, modern accounting firm',
  // Fallback para segmentos em português (label)
  'Construtoras':         'luxury residential architecture, modern building facade',
  'Clínicas e Saúde':     'clean clinical environment, wellness, soft lighting',
  'Varejo e Comércio':    'modern retail space, commercial interior',
  'Restaurantes':         'gourmet food, warm restaurant lighting',
  'Faculdades':           'modern university campus, academic environment',
  'Advocacia e Jurídico': 'premium corporate office, professional environment',
  'Imobiliárias':         'premium real estate, architectural exterior',
  'Indústria':            'industrial facility, precision manufacturing',
};

const CONTEXTO_LOCAL = {
  'Londrina':           'Paraná, Brazil, tropical urban context',
  'Maringá':            'Paraná, Brazil, planned modern city',
  'Balneário Camboriú': 'Santa Catarina coast, Brazil, beachside urban',
  'Itajaí':             'Santa Catarina, Brazil, port city urban context',
  'Curitiba':           'Paraná, Brazil, cosmopolitan urban',
  'São Paulo':          'São Paulo, Brazil, metropolitan urban',
  'Florianópolis':      'Santa Catarina, Brazil, island coastal city',
};

// ─────────────────────────────────────────
// GERAÇÃO DE PROMPT
// ─────────────────────────────────────────
function gerarPrompt(ponto, contexto = {}) {
  const w = Number(ponto.arte_largura || ponto.resolucao_nativa?.w || 1920);
  const h = Number(ponto.arte_altura  || ponto.resolucao_nativa?.h || 1080);
  const orientacao = detectarOrientacao(w, h);
  const { w: gw, h: gh } = normalizarResolucao(w, h);

  const segmento = contexto.segmento || ponto.segmento || 'varejo';
  const cidade   = contexto.cidade   || ponto.cidade   || '';
  const nomeCliente = contexto.clientName || contexto.cliente || '';

  const segmentoVisual = SEGMENTO_VISUAL[segmento]
    || SEGMENTO_VISUAL[String(segmento).toLowerCase()]
    || 'modern commercial space, professional environment';

  const contextoLocal = CONTEXTO_LOCAL[cidade] || 'urban Brazil';

  const espacoLogo = orientacao === 'landscape'
    ? 'Reserved space for client logo (top-right corner, 15% of frame width).'
    : 'Reserved space for client logo (top-right or bottom-left corner, 20% of frame height).';

  const espacoTexto = orientacao === 'landscape'
    ? 'Clear space on right side for client text/message overlay (minimum 25% of frame width).'
    : 'Clear space in lower section for client text/message overlay (minimum 35% of frame height).';

  return `
Professional DOOH digital billboard advertisement for client marketing.
${COMPOSICAO_POR_ORIENTACAO[orientacao].trim()}
${espacoLogo}
${espacoTexto}
Theme: ${segmentoVisual}.
Context: ${contextoLocal}.
Style: photorealistic, commercial photography, high contrast, vibrant, professional branding-ready.
${nomeCliente ? `Client: ${nomeCliente}.` : ''}
No people's faces, no competing brands or logos (only client branding space reserved).
Pixel dimensions: ${gw}x${gh}.
Fill the entire frame — no borders, no padding, no letterboxing.
  `.trim();
}

// ─────────────────────────────────────────
// HTTP HELPERS
// ─────────────────────────────────────────
function httpRequest(method, url, body, headers, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (payload) reqHeaders['Content-Length'] = Buffer.byteLength(payload);

    const req = lib.request({
      method,
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: reqHeaders,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`REPLICATE_TIMEOUT: Geração excedeu ${timeoutMs / 1000}s. Tente novamente.`));
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────
// REPLICATE — polling até prediction concluída
// ─────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollPrediction(predictionUrl, authHeaders, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await httpRequest('GET', predictionUrl, null, authHeaders, timeoutMs);

    if (result.status >= 400) {
      throw new Error(`REPLICATE_POLL_ERROR ${result.status}: ${JSON.stringify(result.body)}`);
    }

    const { status, output, error } = result.body;

    if (status === 'succeeded') {
      return result.body;
    }
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`REPLICATE_FAILED: ${error || status}`);
    }

    // starting | processing → aguardar e tentar de novo
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`REPLICATE_TIMEOUT: Prediction não concluída em ${timeoutMs / 1000}s. Tente novamente.`);
}

// ─────────────────────────────────────────
// CHAMADA REPLICATE (Flux 1.1 Pro)
// Dispara predições em sequência para reduzir rate limit (429) na conta.
// ─────────────────────────────────────────
async function callReplicate(prompt, w, h) {
  if (!REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN não configurado. Adicione ao .env do backend.');
  }

  const authHeaders = {
    Authorization: `Token ${REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Flux 1.1 Pro aceita aspect_ratio OU width+height (prefer: wait para resposta síncrona)
  const input = {
    prompt,
    width:          w,
    height:         h,
    output_format:  'jpg',
    output_quality: 95,
    safety_tolerance: 2,
  };

  const RATE_LIMIT_RETRY_MAX = 3;
  const predictions = [];

  for (let i = 0; i < NUM_IMAGES; i++) {
    let tentativa = 0;
    let ultimaResposta = null;

    while (tentativa < RATE_LIMIT_RETRY_MAX) {
      const r = await httpRequest(
        'POST',
        REPLICATE_PREDICTIONS_URL,
        { input },
        { ...authHeaders, Prefer: 'wait' },
        TIMEOUT_MS
      );

      ultimaResposta = r;
      if (r.status !== 429) {
        predictions.push(r);
        break;
      }

      tentativa += 1;
      if (tentativa >= RATE_LIMIT_RETRY_MAX) {
        throw new Error('REPLICATE_RATE_LIMIT: Limite atingido. Aguarde alguns instantes e tente novamente.');
      }

      // Backoff exponencial curto para aliviar bursts.
      await sleep(1500 * (2 ** (tentativa - 1)));
    }

    if (!predictions[i] && ultimaResposta) {
      predictions.push(ultimaResposta);
    }
  }

  // Se alguma prediction foi recusada por dimensão (422), tentar com múltiplo de 32
  const primeiraRejeitada = predictions.find((r) => r.status === 422);
  if (primeiraRejeitada) {
    const { w: w32, h: h32 } = normalizarResolucao(w, h, 32);
    if (w32 !== w || h32 !== h) {
      return callReplicate(prompt, w32, h32);
    }
    throw new Error(`REPLICATE_API_ERROR 422: Dimensão rejeitada. ${JSON.stringify(primeiraRejeitada.body)}`);
  }

  // Verificar erros
  for (const r of predictions) {
    if (r.status === 429) throw new Error('REPLICATE_RATE_LIMIT: Limite atingido. Aguarde alguns instantes.');
    if (r.status >= 400) throw new Error(`REPLICATE_API_ERROR ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // Aguardar predições que ainda não concluíram (status !== 'succeeded')
  const resultados = await Promise.all(
    predictions.map((r) => {
      const pred = r.body;
      if (pred.status === 'succeeded') return pred;
      // Ainda processando — fazer polling
      const pollUrl = pred.urls?.get;
      if (!pollUrl) throw new Error('REPLICATE_NO_POLL_URL: resposta inesperada da API.');
      return pollPrediction(pollUrl, authHeaders, TIMEOUT_MS);
    })
  );

  // Normalizar saída para formato compatível com o restante do código
  // Replicate Flux 1.1 Pro retorna: output = "url_string" (1 imagem por prediction)
  const images = resultados.map((pred) => {
    const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    return { url };
  }).filter((img) => img.url);

  if (!images.length) {
    throw new Error('REPLICATE_NO_IMAGES: API não retornou imagens.');
  }

  return { images };
}

// ─────────────────────────────────────────
// DOWNLOAD E SAVE DE IMAGEM
// ─────────────────────────────────────────
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function salvarImagem(imageUrl, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const buffer = await downloadImage(imageUrl);
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

// ─────────────────────────────────────────
// RESIZE (se resolucao_geracao != resolucao_nativa)
// Usa sharp se disponível, senão salva sem resize
// ─────────────────────────────────────────
async function resizeImagem(srcPath, destPath, wNativo, hNativo) {
  try {
    const sharp = require('sharp');
    await sharp(srcPath)
      .resize(wNativo, hNativo, { fit: 'fill' })
      .jpeg({ quality: 95 })
      .toFile(destPath);
    return true;
  } catch {
    // sharp não instalado — copiar sem resize
    fs.copyFileSync(srcPath, destPath);
    return false;
  }
}

// ─────────────────────────────────────────
// AGRUPAMENTO POR RESOLUÇÃO (para geração em lote)
// ─────────────────────────────────────────
function agruparPorResolucao(pontos) {
  const grupos = new Map();

  for (const ponto of pontos) {
    const w = Number(ponto.arte_largura || 1920);
    const h = Number(ponto.arte_altura  || 1080);
    const { w: gw, h: gh } = normalizarResolucao(w, h);
    const key = `${gw}x${gh}`;

    if (!grupos.has(key)) {
      grupos.set(key, { resolucao: { w: gw, h: gh }, pontos: [] });
    }
    grupos.get(key).pontos.push(ponto);
  }

  return Array.from(grupos.values());
}

// ─────────────────────────────────────────
// FUNÇÃO PRINCIPAL: gerarArte
// ─────────────────────────────────────────
async function gerarArte({ ponto, contexto, promptCustomizado, uploadsDir }) {
  const wNativo  = Number(ponto.arte_largura || 1920);
  const hNativo  = Number(ponto.arte_altura  || 1080);
  const { w: wGer, h: hGer, normalizado } = normalizarResolucao(wNativo, hNativo);

  const promptFinal = promptCustomizado || gerarPrompt(ponto, contexto);

  const tsInicio = Date.now();
  const replicateResult = await callReplicate(promptFinal, wGer, hGer);
  const duracao = Date.now() - tsInicio;

  // Extrair URLs das imagens retornadas
  // callReplicate normaliza para: { images: [{ url }] }
  const imagensRetornadas = replicateResult.images || [];
  if (!imagensRetornadas.length) {
    throw new Error('REPLICATE_NO_IMAGES: API não retornou imagens.');
  }

  const propostaId = contexto.proposta_id || 'sem_proposta';
  const pontoId    = ponto.id || 'ponto';
  const timestamp  = Date.now();

  const variacoes = [];

  for (let i = 0; i < imagensRetornadas.length; i++) {
    const imgInfo = imagensRetornadas[i];
    const varSuffix = `v${i + 1}`;

    // Salvar imagem gerada (na resolução de geração)
    const nomeGerado = `${timestamp}-${varSuffix}-ger.jpg`;
    const pathGerado = path.join(uploadsDir, 'artes', String(propostaId), String(pontoId), nomeGerado);
    await salvarImagem(imgInfo.url, pathGerado);

    let pathFinal = pathGerado;
    let precisouResize = false;

    // Redimensionar se resolução nativa ≠ resolução de geração
    if (normalizado && (wGer !== wNativo || hGer !== hNativo)) {
      const nomeFinal = `${timestamp}-${varSuffix}.jpg`;
      pathFinal = path.join(uploadsDir, 'artes', String(propostaId), String(pontoId), nomeFinal);
      await resizeImagem(pathGerado, pathFinal, wNativo, hNativo);
      precisouResize = true;
    }

    // URL relativa para o frontend
    const urlRelativa = `/uploads/artes/${propostaId}/${pontoId}/${path.basename(pathFinal)}`;

    variacoes.push({
      variacao: i + 1,
      url: urlRelativa,
      url_gerada: imgInfo.url, // URL original da fal.ai (temporária)
      precisouResize,
    });
  }

  return {
    variacoes,
    prompt: promptFinal,
    resolucao_nativa:   { w: wNativo, h: hNativo },
    resolucao_geracao:  { w: wGer, h: hGer },
    normalizado,
    duracao_ms: duracao,
    custo_estimado_usd: 0.12, // Replicate Flux 1.1 Pro ~$0.04/img × 3 imagens
    orientacao: detectarOrientacao(wNativo, hNativo),
  };
}

module.exports = {
  detectarOrientacao,
  normalizarResolucao,
  gerarPrompt,
  gerarArte,
  agruparPorResolucao,
  callReplicate,
};
