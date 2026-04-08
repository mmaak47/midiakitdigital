/**
 * arteService.js
 * Serviço de geração de arte via IA (Replicate / OpenAI GPT-4 Vision Image) para pontos DOOH.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────
// CONFIGURAÇÃO
// ─────────────────────────────────────────
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';

// Modelo OpenAI GPT-4 Vision Image no Replicate
// Documentação: https://replicate.com/openai/gpt-image-1.5
const REPLICATE_MODEL = 'openai/gpt-image-1.5';
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
// OpenAI GPT-4 Vision Image (Replicate) aceita no máximo 1440px por lado.
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

function escolherAspectRatio(w, h) {
  const presets = [
    { ratio: '1:1', val: 1 },
    { ratio: '16:9', val: 16 / 9 },
    { ratio: '9:16', val: 9 / 16 },
    { ratio: '4:3', val: 4 / 3 },
    { ratio: '3:4', val: 3 / 4 },
    { ratio: '3:2', val: 3 / 2 },
    { ratio: '2:3', val: 2 / 3 },
  ];

  const target = Number(w) / Number(h || 1);
  let best = presets[0];
  let bestDist = Number.POSITIVE_INFINITY;

  for (const p of presets) {
    const dist = Math.abs(target - p.val);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }

  return best.ratio;
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
  const objetivo = contexto.objetivo || 'brand awareness';

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
CRITICAL INSTRUCTION — READ EVERY WORD:
Generate ONLY a pure flat 2D advertising artwork (banner/flyer/poster).
The ENTIRE image must be the creative design itself — FULL FRAME, NOTHING ELSE.
Output must NOT include ANY physical structure, frame, stand, or mockup element.

**ABSOLUTE PROHIBITIONS (DO NOT GENERATE THESE):**
❌ NO outdoor scene, street, sky, cityscape, landscape, or nature background
❌ NO billboard, totem, outdoor panel, advertising display, stand, or structure
❌ NO frame, border, mounting, edge, or border around artwork
❌ NO pedestal, base, mounting bracket, support structure, or stand
❌ NO wall, floor, ground, environment, surroundings, or perspective view
❌ NO monitor, TV screen, digital display, device screen, device, or bezel
❌ NO photograph, 3D render, realistic representation, mockup, or composition of physical display
❌ NO artistic rendering of artwork-mounted-on-a-structure (forbidden)
❌ NO human figures, faces, people, bodies, hands, portraits, or expressions
❌ NO realistic photographic textures or environments
❌ NO depth, shadows, 3D perspective, or realistic lighting

**NEGATIVE PROMPT (invert these completely):**
{outdoor, street scene, sky, clouds, landscape, park, cityscape, building, architecture, wall, floor, pedestal, stand, pole, structure, totem, billboard, frame, border, device, screen, monitor, TV, photo, 3D render, mockup, realistic rendering, depth-of-field, perspective, human, face, people, body, hands, camera view, environment}

**WHAT TO CREATE (positive focus):**
✓ Pure 2D graphic composition only
✓ Abstract shapes, icons, patterns, colors, typography
✓ Product imagery, graphic elements, design patterns
✓ Flat illustration style
✓ No environmental context or surroundings
✓ Premium advertising-ready creative
✓ Bold colors, strong typography, clear hierarchy

**COMPOSITION:**
${COMPOSICAO_POR_ORIENTACAO[orientacao].trim()}
${espacoLogo}
${espacoTexto}

**CONTEXT:**
Theme: ${segmentoVisual}.
Location: ${contextoLocal}.
Objective: ${objetivo}.
${nomeCliente ? `Client: ${nomeCliente}.` : 'Space for brand.'}

**STYLE:**
Premium flat graphic design. Print-ready. Bold. Professional. High contrast.

**TECHNICAL REQUIREMENTS:**
Dimensions: ${gw}x${gh} pixels exactly.
Full-bleed format — entire frame is artwork.
No watermarks, signatures, UI elements.
No photo-realism.
No 3D rendering.

**ULTRA-CRITICAL CHECKLIST:**
✓ Is 100% of the image flat 2D graphic design?
✓ Are there ZERO physical structures, stands, frames, or environments?
✓ Are there ZERO human figures or faces?
✓ Is this ready to display directly on a digital screen?
✓ Is there ZERO outdoor scenery or sky?
If any answer is NO, RESTART and generate again.
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
// CHAMADA REPLICATE (OpenAI GPT-4 Vision Image)
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

  // openai/gpt-image-1.5 usa aspect_ratio no schema (não width/height).
  const aspectRatio = escolherAspectRatio(w, h);
  const input = {
    prompt,
    output_format:  'jpeg',
    output_compression: 90,
    number_of_images: 1,
    quality: 'medium',
    moderation: 'low',
    aspect_ratio: aspectRatio,
  };

  const RATE_LIMIT_RETRY_MAX = 5;
  const BASE_BACKOFF_MS = 3000; // Começar com 3 segundos (aumentado de 1500ms)
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
      if (r.status >= 200 && r.status < 300) {
        console.log(`[arte/replicate] Tentativa ${tentativa + 1}: sucesso (status ${r.status})`);
        predictions.push(r);
        
        // Pequeno delay entre sucessos para não sobrecarregar
        if (i < NUM_IMAGES - 1) {
          await sleep(2000);
        }
        break;
      }

      if (r.status >= 400 && r.status !== 429) {
        throw new Error(`REPLICATE_API_ERROR ${r.status}: ${JSON.stringify(r.body)}`);
      }

      tentativa += 1;
      console.warn(`[arte/replicate] 429 Rate Limit na tentativa ${tentativa}/${RATE_LIMIT_RETRY_MAX}`);
      
      if (tentativa >= RATE_LIMIT_RETRY_MAX) {
        throw new Error('REPLICATE_RATE_LIMIT: Limite atingido após 5 tentativas. Aguarde alguns minutos e tente novamente.');
      }

      // Backoff exponencial mais longo: 3s, 6s, 12s, 24s, 48s
      const delayMs = BASE_BACKOFF_MS * (2 ** (tentativa - 1));
      console.warn(`[arte/replicate] Aguardando ${delayMs}ms antes de tentar de novo...`);
      await sleep(delayMs);
    }

    if (!predictions[i] && ultimaResposta) {
      predictions.push(ultimaResposta);
    }
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
  // Replicate OpenAI GPT-4 Vision Image retorna: output = "url_string" (1 imagem por prediction)
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

function resolveLogoPath(logoUrl, uploadsDir) {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  if (!logoUrl.startsWith('/uploads/')) return null;

  const relative = logoUrl.replace(/^\/uploads\//, '');
  const abs = path.resolve(uploadsDir, relative);
  const base = path.resolve(uploadsDir);
  if (!abs.startsWith(base)) return null;
  return abs;
}

async function aplicarLogoNaArte(pathArte, logoUrl, uploadsDir, orientacao = 'landscape') {
  if (!logoUrl) {
    console.log('[arte/logo] Nenhuma logo_url fornecida, pulando composição.');
    return false;
  }

  const logoAbs = resolveLogoPath(logoUrl, uploadsDir);
  if (!logoAbs) {
    console.warn('[arte/logo] Caminho do logo inválido ou não autorizado:', logoUrl);
    return false;
  }
  if (!fs.existsSync(logoAbs)) {
    console.warn('[arte/logo] Arquivo de logo não encontrado:', logoAbs);
    return false;
  }
  if (!fs.existsSync(pathArte)) {
    console.error('[arte/logo] Arquivo de arte não encontrado:', pathArte);
    return false;
  }

  try {
    const sharp = require('sharp');
    if (!sharp) {
      console.error('[arte/logo] Sharp não está instalado!');
      return false;
    }

    console.log('[arte/logo] Iniciando composição de logo. Arte:', pathArte, 'Logo:', logoAbs, 'Orientação:', orientacao);

    const arteMeta = await sharp(pathArte).metadata();
    const arteW = Number(arteMeta.width || 0);
    const arteH = Number(arteMeta.height || 0);
    console.log('[arte/logo] Dimensões da arte:', arteW, 'x', arteH);

    if (!arteW || !arteH) {
      console.error('[arte/logo] Dimensões da arte inválidas');
      return false;
    }

    const margin = Math.max(12, Math.round(Math.min(arteW, arteH) * 0.03));
    const targetW = orientacao === 'portrait'
      ? Math.round(arteW * 0.46)
      : Math.round(arteW * 0.26);
    const targetH = orientacao === 'portrait'
      ? Math.round(arteH * 0.14)
      : Math.round(arteH * 0.16);

    console.log('[arte/logo] Redimensionando logo para:', targetW, 'x', targetH);

    const logoBuf = await sharp(logoAbs)
      .resize({ width: targetW, height: targetH, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoBuf).metadata();
    const logoW = Number(logoMeta.width || 0);
    const logoH = Number(logoMeta.height || 0);

    if (!logoW || !logoH) {
      console.error('[arte/logo] Logo redimensionado tem dimensões inválidas');
      return false;
    }

    console.log('[arte/logo] Logo redimensionado:', logoW, 'x', logoH);

    const left = Math.max(0, arteW - logoW - margin);
    const top = margin;
    const outPath = `${pathArte}.logo.tmp.jpg`;

    console.log('[arte/logo] Posicionando logo em:', left, ',', top);

    await sharp(pathArte)
      .composite([{ input: logoBuf, left, top }])
      .jpeg({ quality: 95 })
      .toFile(outPath);

    fs.renameSync(outPath, pathArte);
    console.log('[arte/logo] ✓ Logo composto com sucesso!');
    return true;
  } catch (err) {
    console.error('[arte/logo] ERRO ao compor logo:', err.message, err.stack);
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
  const orientacaoArte = detectarOrientacao(wNativo, hNativo);

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

    // Compor logo se fornecido
    if (contexto?.logo_url) {
      console.log('[arte/gerar] Logo URL recebida:', contexto.logo_url);
      const logoCompostoOk = await aplicarLogoNaArte(pathFinal, contexto.logo_url, uploadsDir, orientacaoArte);
      console.log('[arte/gerar] Resultado da composição de logo:', logoCompostoOk);
    } else {
      console.log('[arte/gerar] Nenhuma logo_url no contexto. Contexto:', JSON.stringify(contexto));
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
    custo_estimado_usd: 0.05, // Replicate openai/gpt-image-1.5 quality=medium ~$0.05/img
    orientacao: orientacaoArte,
  };
}

module.exports = {
  detectarOrientacao,
  normalizarResolucao,
  escolherAspectRatio,
  gerarPrompt,
  gerarArte,
  agruparPorResolucao,
  callReplicate,
};
