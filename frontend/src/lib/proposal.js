function toNumber(value) {
  return Number(value) || 0;
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
  const globalPercentage = clampDiscount(discountConfig?.percentage);
  const specificPointIds = new Set(normalizeValues(discountConfig?.targetPointIds));
  const perPointDiscounts = discountConfig?.perPoint || {};

  const pricedPoints = points.map((point) => {
    const originalPrice = toNumber(point.preco);
    let discountPercent = 0;

    if (mode === 'total') {
      discountPercent = globalPercentage;
    } else if (mode === 'specific') {
      discountPercent = specificPointIds.has(point.id) ? globalPercentage : 0;
    } else if (mode === 'individual') {
      discountPercent = clampDiscount(perPointDiscounts[point.id]);
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

  return {
    mode,
    points: pricedPoints,
    summary: {
      originalTotal,
      discountTotal,
      finalTotal,
      hasDiscount: discountTotal > 0,
      appliedPoints: pricedPoints.filter((point) => point.discountPercent > 0).length
    }
  };
}

export function buildProposalImagePrompt({
  clientName,
  selectedCities = [],
  selectedPublicos = [],
  objetivo,
  segmento,
  points = []
}) {
  const advertiser = String(clientName || '').trim() || 'cliente';
  const cityText = formatList(selectedCities, 'múltiplas praças');
  const publicoText = formatList(selectedPublicos, 'públicos estratégicos');
  const pointNames = points.slice(0, 3).map((point) => point.nome).filter(Boolean);
  const supportText = pointNames.length ? `Referência visual de contexto: ${pointNames.join(', ')}.` : '';

  return [
    `Crie uma arte publicitária para OOH digital da marca ${advertiser}.`,
    `Objetivo principal: ${objetivo || 'reconhecimento de marca'}.`,
    `Segmento do anunciante: ${segmento || 'segmento comercial'}.`,
    `Praças da campanha: ${cityText}.`,
    `Públicos prioritários: ${publicoText}.`,
    `Direção visual: impacto imediato, alto contraste, composição premium e legibilidade em até 7 palavras.`,
    `Regras: sem mockup, sem foto de ponto, sem marca d'água, sem texto pequeno, entregar arte estática pronta para simulação em mídia digital.`,
    supportText
  ].filter(Boolean).join(' ');
}