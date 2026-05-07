function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampDiscount(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeValues(values) {
  return Array.isArray(values) ? values.filter(Boolean) : [];
}

function formatList(values = [], fallback = '') {
  const normalized = normalizeValues(values);
  if (!normalized.length) return fallback;
  if (normalized.length === 1) return normalized[0];
  if (normalized.length === 2) return `${normalized[0]} e ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(', ')} e ${normalized[normalized.length - 1]}`;
}

export function buildProposalPricing(points = [], discountConfig = {}) {
  const mode = discountConfig?.mode || 'none';
  const valueType = discountConfig?.valueType === 'amount' ? 'amount' : 'percentage';
  const globalPercentage = clampDiscount(discountConfig?.percentage);
  const globalAmount = Math.max(0, toNumber(discountConfig?.amount));
  const specificPointIds = new Set(normalizeValues(discountConfig?.targetPointIds).map((id) => String(id)));
  const perPointDiscounts = discountConfig?.perPoint || {};

  // For amount-based discount, convert the entered value to an equivalent
  // percentage inside the selected scope (all points or specific points).
  const scopedOriginalTotal = points.reduce((sum, point) => {
    const originalPrice = toNumber(point.preco);

    if (mode === 'total') return sum + originalPrice;
    if (mode === 'specific') {
      return specificPointIds.has(String(point.id)) ? sum + originalPrice : sum;
    }
    return sum;
  }, 0);

  const cappedGlobalAmount = Math.min(globalAmount, scopedOriginalTotal);
  const globalEquivalentPercentage = scopedOriginalTotal > 0
    ? clampDiscount((cappedGlobalAmount / scopedOriginalTotal) * 100)
    : 0;
  const effectiveGlobalPercentage = valueType === 'amount'
    ? globalEquivalentPercentage
    : globalPercentage;

  const pricedPoints = points.map((point) => {
    const originalPrice = toNumber(point.preco);
    let discountPercent = 0;

    if (mode === 'total') {
      discountPercent = effectiveGlobalPercentage;
    } else if (mode === 'specific') {
      discountPercent = specificPointIds.has(String(point.id)) ? effectiveGlobalPercentage : 0;
    } else if (mode === 'individual') {
      const rawValue = perPointDiscounts[point.id];
      if (valueType === 'amount') {
        // No modo "Valor (R$)" individual o usuário digita o PREÇO FINAL desejado
        // para o ponto, e o sistema calcula o desconto correspondente.
        // Se o campo estiver vazio, considera sem desconto (mantém preço de tabela).
        const hasInput = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '';
        if (hasInput && originalPrice > 0) {
          const finalDesired = Math.max(0, Math.min(toNumber(rawValue), originalPrice));
          const computedDiscount = originalPrice - finalDesired;
          discountPercent = clampDiscount((computedDiscount / originalPrice) * 100);
        } else {
          discountPercent = 0;
        }
      } else {
        discountPercent = clampDiscount(rawValue);
      }
    }

    const discountAmount = originalPrice * (discountPercent / 100);
    const finalPrice = Math.max(0, originalPrice - discountAmount);

    return {
      ...point,
      precoOriginal: originalPrice,
      preco: finalPrice,
      discountPercent,
      discountAmount,
      precoFinal: finalPrice
    };
  });

  const originalTotal = pricedPoints.reduce((sum, point) => sum + toNumber(point.precoOriginal), 0);
  const discountTotal = pricedPoints.reduce((sum, point) => sum + toNumber(point.discountAmount), 0);
  const finalTotal = pricedPoints.reduce((sum, point) => sum + toNumber(point.precoFinal), 0);
  const discountPercent = originalTotal > 0 ? (discountTotal / originalTotal) * 100 : 0;

  return {
    mode,
    valueType,
    points: pricedPoints,
    summary: {
      originalTotal,
      discountTotal,
      finalTotal,
      discountPercent,
      hasDiscount: discountTotal > 0,
      appliedPoints: pricedPoints.filter((point) => point.discountPercent > 0).length
    }
  };
}

function calculateAspectRatio(width, height) {
  if (!width || !height) return '';
  const w = Number(width);
  const h = Number(height);
  if (!w || !h) return '';
  
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(w, h);
  const simplifiedW = w / divisor;
  const simplifiedH = h / divisor;
  
  return `${Math.round(simplifiedW)}:${Math.round(simplifiedH)}`;
}

function normalizeDimension(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.round(numeric);
}

function resolvePointFormat(point = {}) {
  const width = normalizeDimension(point.arte_largura, 1920);
  const height = normalizeDimension(point.arte_altura, 1080);
  return {
    width,
    height,
    key: `${width}x${height}`,
    aspectRatio: calculateAspectRatio(width, height)
  };
}

export function buildProposalImagePrompt({
  clientName,
  selectedCities = [],
  selectedPublicos = [],
  objetivo,
  segmento,
  arteWidth = '1920',
  arteHeight = '1080',
  points = []
}) {
  const advertiser = String(clientName || '').trim() || 'cliente';
  const cityText = formatList(selectedCities, 'múltiplas praças');
  const publicoText = formatList(selectedPublicos, 'públicos estratégicos');
  const aspectRatio = calculateAspectRatio(arteWidth, arteHeight);
  const w = Number(arteWidth);
  const h = Number(arteHeight);
  const orientacao = w / h >= 1.5 ? 'horizontal' : w / h <= 0.67 ? 'vertical' : 'quadrado';
  const dimensionText = aspectRatio ? `${aspectRatio} (${w}×${h}px) — ${orientacao}` : `${w}×${h}px`;

  return [
    `Você é um diretor de arte sênior especializado em campanhas OOH digital.`,
    `Crie uma peça publicitária profissional de alto impacto para exibição em painel LED.`,
    ``,
    `BRIEFING:`,
    `• Marca/Cliente: ${advertiser}`,
    `• Segmento: ${segmento || 'segmento comercial'}`,
    `• Objetivo: ${objetivo || 'reconhecimento de marca'}`,
    `• Praças: ${cityText}`,
    `• Públicos: ${publicoText}`,
    `• Formato: ${dimensionText}`,
    ``,
    `DIREÇÃO DE ARTE:`,
    `• Tipografia: headline bold sans-serif de alto impacto (máximo 7 palavras), legível a distância`,
    `• Hierarquia visual: logo → headline → visual de apoio → CTA`,
    `• Acabamento: gradientes sutis, sombras suaves, bordas limpas — nível agência premium`,
    ``,
    `REGRAS OBRIGATÓRIAS:`,
    `• Arte FLAT 2D pronta para exibição — NÃO gerar mockup, foto de outdoor, totem ou cena 3D`,
    `• Preencher 100% do canvas sem bordas ou margens`,
    `• Sem marca d'água, sem rostos humanos — usar apenas grafismo, ilustração e tipografia`,
    `• Resultado final deve parecer criado por uma agência de design profissional`,
  ].filter(Boolean).join('\n');
}

export function buildProposalImagePromptsByFormat({
  clientName,
  selectedCities = [],
  selectedPublicos = [],
  objetivo,
  segmento,
  points = []
}) {
  const groupsMap = new Map();

  points.forEach((point) => {
    const format = resolvePointFormat(point);
    const existing = groupsMap.get(format.key);
    if (existing) {
      existing.points.push(point);
      return;
    }

    groupsMap.set(format.key, {
      ...format,
      points: [point]
    });
  });

  if (!groupsMap.size) {
    const fallbackPrompt = buildProposalImagePrompt({
      clientName,
      selectedCities,
      selectedPublicos,
      objetivo,
      segmento,
      arteWidth: 1920,
      arteHeight: 1080,
      points: []
    });

    return [
      {
        key: '1920x1080',
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        points: [],
        prompt: fallbackPrompt
      }
    ];
  }

  return Array.from(groupsMap.values())
    .sort((a, b) => b.points.length - a.points.length)
    .map((group) => ({
      ...group,
      prompt: buildProposalImagePrompt({
        clientName,
        selectedCities,
        selectedPublicos,
        objetivo,
        segmento,
        arteWidth: group.width,
        arteHeight: group.height,
        points: group.points
      })
    }));
}