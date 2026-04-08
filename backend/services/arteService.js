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
// DADOS DE CONTEXTO — DESIGN PROFISSIONAL
// ─────────────────────────────────────────

// Paletas de cor por segmento (cores predominantes para guiar a IA)
const PALETA_SEGMENTO = {
  construtora:    'tons terrosos, dourado, cinza grafite e branco',
  imobiliaria:    'azul marinho, dourado premium e branco',
  clinica:        'verde menta, branco clean e cinza suave',
  hospital:       'azul hospitalar, branco e verde institucional',
  varejo:         'cores vibrantes, vermelho, amarelo e branco',
  restaurante:    'bordô, dourado quente, preto e creme',
  faculdade:      'azul institucional, laranja e branco',
  escola:         'cores primárias vivas, verde, azul e amarelo',
  advocacia:      'azul escuro, dourado, preto e branco',
  industria:      'cinza aço, azul petróleo e amarelo segurança',
  automotivo:     'preto, prata metálico, vermelho e branco',
  fitness:        'preto, verde neon, laranja energético',
  beleza:         'rosa blush, dourado, nude e branco',
  pet:            'verde natural, laranja alegre e branco',
  farmacia:       'verde saúde, azul confiança e branco',
  supermercado:   'vermelho, amarelo, verde fresco e branco',
  financeiro:     'azul escuro, dourado e branco',
  turismo:        'azul céu, turquesa, laranja sunset e branco',
  coworking:      'gradiente moderno, roxo, azul e laranja',
  tecnologia:     'gradiente neon, azul elétrico, roxo e preto',
  contabilidade:  'azul escuro, cinza grafite e dourado',
};

// Elementos visuais sugeridos por segmento
const ELEMENTOS_SEGMENTO = {
  construtora:    'formas geométricas arquitetônicas, linhas de construção, ícones de plantas baixas',
  imobiliaria:    'silhuetas de prédios modernos, chaves estilizadas, skyline minimalista',
  clinica:        'formas orgânicas suaves, ícones médicos abstratos, ondas sutis',
  hospital:       'cruz estilizada, formas clean, elementos de saúde',
  varejo:         'sacolas estilizadas, tags de preço, padrões dinâmicos, setas de oferta',
  restaurante:    'talheres estilizados, texturas de ingredientes, steam lines',
  faculdade:      'capelo acadêmico estilizado, livros abstratos, ícones de conhecimento',
  escola:         'elementos lúdicos geométricos, lápis, livros coloridos',
  advocacia:      'balança da justiça estilizada, linhas firmes, tipografia serif elegante',
  industria:      'engrenagens estilizadas, circuitos, padrões industriais',
  automotivo:     'silhuetas de veículos, velocímetro abstrato, linhas de velocidade',
  fitness:        'silhuetas atléticas abstratas, formas dinâmicas, halteres estilizados',
  beleza:         'formas florais abstratas, espelhos, pinceladas elegantes',
  pet:            'patinhas estilizadas, silhuetas de animais, formas orgânicas',
  farmacia:       'cápsulas estilizadas, folhas medicinais, formas clean',
  supermercado:   'frutas/vegetais estilizados, cestas abstratas, frescor',
  financeiro:     'gráficos ascendentes, moedas estilizadas, setas de crescimento',
  turismo:        'ondas, aviões estilizados, palmeiras abstratas, sol',
  coworking:      'connections abstratas, ícones de colaboração, formas modulares',
  tecnologia:     'circuitos, pixels, formas digitais, ondas de dados',
  contabilidade:  'gráficos estilizados, calculadoras abstratas, números',
};

// Composição por orientação
const COMPOSICAO_DESIGN = {
  landscape: 'layout horizontal com hierarquia visual da esquerda para a direita. Elemento principal à esquerda, área limpa à direita para headline. Grid com respiro.',
  portrait:  'layout vertical com headline impactante no topo, visual principal no centro e CTA na base. Distribuição em terços.',
  square:    'composição centralizada simétrica. Headline topo, visual central, rodapé com CTA. Máximo impacto por equilíbrio.',
};

// ─────────────────────────────────────────
// GERAÇÃO DE PROMPT — DESIGNER PROFISSIONAL
// ─────────────────────────────────────────
function gerarPrompt(ponto, contexto = {}) {
  const w = Number(ponto.arte_largura || ponto.resolucao_nativa?.w || 1920);
  const h = Number(ponto.arte_altura  || ponto.resolucao_nativa?.h || 1080);
  const orientacao = detectarOrientacao(w, h);

  const segmento    = contexto.segmento || ponto.segmento || 'segmento comercial';
  const cidade      = contexto.cidade   || ponto.cidade   || '';
  const nomeCliente = contexto.clientName || contexto.cliente || 'cliente';
  const objetivo    = contexto.objetivo || 'reconhecimento de marca';

  const segKey = String(segmento).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const paleta    = PALETA_SEGMENTO[segKey]    || 'cores premium com alto contraste';
  const elementos = ELEMENTOS_SEGMENTO[segKey] || 'elementos gráficos modernos e abstratos';
  const composicao = COMPOSICAO_DESIGN[orientacao] || COMPOSICAO_DESIGN.landscape;

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  const g = gcd(w, h);
  const ratioStr = `${w / g}:${h / g}`;

  const logoInstrucao = contexto.logo_url
    ? 'O logo da marca foi fornecido como imagem de referência — integre-o organicamente no design, com destaque mas sem dominar a composição.'
    : '';

  const prompt = [
    // PERSONA
    `Você é um diretor de arte sênior especializado em campanhas OOH (Out of Home) digital.`,
    `Crie uma peça publicitária profissional de alto impacto para exibição em painel LED.`,
    '',
    // BRIEFING
    `BRIEFING:`,
    `• Marca/Cliente: ${nomeCliente}`,
    `• Segmento: ${segmento}`,
    `• Objetivo da campanha: ${objetivo}`,
    cidade ? `• Praça: ${cidade}` : '',
    `• Formato: ${ratioStr} (${w}×${h}px) — ${orientacao}`,
    '',
    // DIREÇÃO DE ARTE
    `DIREÇÃO DE ARTE:`,
    `• Composição: ${composicao}`,
    `• Paleta de cores: ${paleta}`,
    `• Elementos gráficos sugeridos: ${elementos}`,
    `• Tipografia: headline bold sans-serif de alto impacto (máximo 7 palavras), legível a distância`,
    `• Hierarquia visual: logo → headline → visual de apoio → CTA`,
    `• Acabamento: gradientes sutis, sombras suaves, bordas limpas — nível agência premium`,
    '',
    // REGRAS TÉCNICAS
    `REGRAS OBRIGATÓRIAS:`,
    `• Arte FLAT 2D pronta para exibição — NÃO gerar mockup, foto de outdoor, totem, monitor ou cena 3D`,
    `• Preencher 100% do canvas sem bordas, margens ou letterboxing`,
    `• Sem marca d'água, sem watermark, sem texto "sample"`,
    `• Sem rostos humanos ou fotografias — usar apenas grafismo, ilustração e tipografia`,
    `• Resultado final deve parecer criado por uma agência de design profissional`,
    '',
    logoInstrucao,
  ].filter(Boolean).join('\n');

  return prompt;
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
async function callReplicate(prompt, w, h, options = {}) {
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

  // Se logoPublicUrl fornecida, envia como input_images para o modelo incorporar na arte
  if (options.logoPublicUrl) {
    input.input_images = [options.logoPublicUrl];
    console.log('[arte/replicate] Enviando logo como input_images:', options.logoPublicUrl);
  }

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

  // Construir URL pública do logo para enviar ao Replicate via input_images
  let logoPublicUrl = null;
  if (contexto?.logo_url) {
    // logo_url é relativo como /uploads/artes/logos/logo-xxx.png
    // Construir URL absoluta acessível publicamente
    const baseUrl = process.env.PUBLIC_URL || process.env.BASE_URL || '';
    if (baseUrl) {
      logoPublicUrl = `${baseUrl.replace(/\/$/, '')}${contexto.logo_url}`;
    } else {
      // Fallback: ler o arquivo local e converter para data URI
      const logoLocalPath = path.join(uploadsDir, contexto.logo_url.replace(/^\/uploads\//, ''));
      if (fs.existsSync(logoLocalPath)) {
        const logoBuffer = fs.readFileSync(logoLocalPath);
        const ext = path.extname(logoLocalPath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        logoPublicUrl = `data:${mime};base64,${logoBuffer.toString('base64')}`;
        console.log('[arte/gerar] Logo convertido para data URI (base64), tamanho:', logoBuffer.length);
      } else {
        console.warn('[arte/gerar] Logo não encontrado localmente:', logoLocalPath);
      }
    }
    console.log('[arte/gerar] Logo público URL:', logoPublicUrl ? 'OK' : 'não disponível');
  }

  const tsInicio = Date.now();
  const replicateResult = await callReplicate(promptFinal, wGer, hGer, { logoPublicUrl });
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

    // Logo já é enviado via input_images ao modelo — sem necessidade de composição pós-geração
    if (contexto?.logo_url) {
      console.log('[arte/gerar] Logo foi enviado ao modelo via input_images — composição nativa.');
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
