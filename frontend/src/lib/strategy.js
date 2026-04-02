export const SEGMENTOS = [
  'clinica',
  'hospital',
  'escola',
  'faculdade',
  'construtora',
  'imobiliaria',
  'varejo',
  'restaurante',
  'contabilidade',
  'advocacia',
  'industria',
  'automotivo',
  'fitness',
  'beleza',
  'pet',
  'farmacia',
  'supermercado',
  'financeiro',
  'turismo',
  'coworking',
  'tecnologia',
  'outro'
];

const SEGMENTO_LABELS = {
  clinica: 'Clínicas',
  hospital: 'Hospitais',
  escola: 'Escolas',
  faculdade: 'Faculdades',
  construtora: 'Construtoras',
  imobiliaria: 'Imobiliárias',
  varejo: 'Varejo',
  restaurante: 'Restaurantes',
  contabilidade: 'Contabilidade',
  advocacia: 'Advocacia',
  industria: 'Indústria',
  automotivo: 'Automotivo',
  fitness: 'Fitness e Academias',
  beleza: 'Beleza e Estética',
  pet: 'Pet Shop e Veterinário',
  farmacia: 'Farmácias',
  supermercado: 'Supermercados',
  financeiro: 'Financeiro e Bancos',
  turismo: 'Turismo e Hotelaria',
  coworking: 'Coworking',
  tecnologia: 'Tecnologia',
  outro: 'Segmento personalizado'
};

const AUDIENCE_TAG_LABELS = {
  'classe-a': 'Classe A',
  'classe-b': 'Classe B',
  premium: 'Premium',
  familias: 'Familias',
  jovens: 'Jovens',
  executivos: 'Executivos',
  motoristas: 'Motoristas',
  shopper: 'Shopper',
  moradores: 'Moradores',
  turistas: 'Turistas'
};

const AVAILABILITY_PRESETS = {
  all: {
    label: 'Todos os periodos',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    blocks: ['morning', 'afternoon', 'evening']
  },
  comercial: {
    label: 'Horario comercial',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    blocks: ['morning', 'afternoon']
  },
  noturno: {
    label: 'Faixa noturna',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    blocks: ['evening']
  },
  fim_semana: {
    label: 'Finais de semana',
    days: ['sat', 'sun'],
    blocks: ['morning', 'afternoon', 'evening']
  }
};

export const OBJETIVOS = [
  'reconhecimento de marca',
  'presenca premium',
  'cobertura regional',
  'proximidade da decisao de compra',
  'lembranca continua'
];

export const ZONAS_ESTRATEGICAS = [
  {
    id: 'premium',
    nome: 'Zona Premium',
    descricao: 'Maior aderencia para marcas voltadas a publico A/B.',
    center: [-23.332, -51.178],
    radius: 3500,
    color: '#FE5C2B'
  },
  {
    id: 'alto-fluxo',
    nome: 'Zona de Alto Fluxo',
    descricao: 'Ideal para campanhas de ampla lembranca.',
    center: [-23.307, -51.165],
    radius: 4200,
    color: '#ff7a52'
  },
  {
    id: 'comercial',
    nome: 'Zona Comercial',
    descricao: 'Concentracao de tomada de decisao e recorrencia de consumo.',
    center: [-23.320, -51.157],
    radius: 3000,
    color: '#ff9c7d'
  },
  {
    id: 'massivo',
    nome: 'Zona de Alcance Massivo',
    descricao: 'Pontos com alto potencial de volume e frequencia.',
    center: [-23.291, -51.173],
    radius: 5200,
    color: '#ffc1ad'
  }
];

function toNumber(v) {
  return Number(v) || 0;
}

function normalizeArrayInput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  const normalized = String(value || '').trim();
  return normalized ? [normalized] : [];
}

function matchesAnySelection(value, selectedValues = []) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(String(value || '').trim());
}

function normalizePublicoParts(value) {
  return String(value || '')
    .toUpperCase()
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTagKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseJsonLike(value, fallbackValue) {
  if (value === null || value === undefined || value === '') return fallbackValue;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function fallbackTagsFromPublico(publico) {
  const normalized = String(publico || '').toUpperCase();
  const tags = [];

  if (normalized.includes('A')) tags.push({ key: 'classe-a', label: 'Classe A', weight: 1.1 });
  if (normalized.includes('B')) tags.push({ key: 'classe-b', label: 'Classe B', weight: 1 });

  return tags;
}

export function normalizeAudienceTags(value, fallbackPublico = '') {
  const parsed = parseJsonLike(value, value);
  const list = Array.isArray(parsed)
    ? parsed
    : String(parsed || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const source = list.length ? list : fallbackTagsFromPublico(fallbackPublico);
  const seen = new Set();
  const normalized = [];

  source.forEach((item) => {
    const rawKey = typeof item === 'object' ? (item.key || item.value || item.label) : item;
    const key = normalizeTagKey(rawKey);
    if (!key || seen.has(key)) return;

    const fallbackLabel = typeof item === 'object' ? (item.label || item.value || item.key) : item;
    const label = AUDIENCE_TAG_LABELS[key] || String(fallbackLabel || key)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

    const rawWeight = typeof item === 'object' ? Number(item.weight) : Number.NaN;
    const weight = Number.isFinite(rawWeight) ? Math.min(2, Math.max(0.4, rawWeight)) : 1;

    normalized.push({ key, label, weight: Number(weight.toFixed(2)) });
    seen.add(key);
  });

  return normalized;
}

function defaultAvailabilityCalendar(horario = '') {
  const is24h = String(horario || '').toLowerCase().includes('24');
  return {
    defaultPct: is24h ? 0.92 : 0.78,
    dayFactors: {
      mon: 1,
      tue: 1,
      wed: 1,
      thu: 1,
      fri: 1,
      sat: 0.95,
      sun: 0.9
    },
    blockFactors: {
      morning: 0.95,
      afternoon: 1,
      evening: is24h ? 1 : 0.82
    }
  };
}

export function normalizeAvailabilityCalendar(value, horarioFallback = '') {
  const base = defaultAvailabilityCalendar(horarioFallback);
  const parsed = parseJsonLike(value, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return base;
  }

  const next = {
    defaultPct: Number.isFinite(Number(parsed.defaultPct))
      ? Math.min(1, Math.max(0.2, Number(parsed.defaultPct)))
      : base.defaultPct,
    dayFactors: { ...base.dayFactors },
    blockFactors: { ...base.blockFactors }
  };

  Object.keys(next.dayFactors).forEach((day) => {
    if (Number.isFinite(Number(parsed.dayFactors?.[day]))) {
      next.dayFactors[day] = Math.min(1.5, Math.max(0.2, Number(parsed.dayFactors[day])));
    }
  });

  Object.keys(next.blockFactors).forEach((block) => {
    if (Number.isFinite(Number(parsed.blockFactors?.[block]))) {
      next.blockFactors[block] = Math.min(1.5, Math.max(0.2, Number(parsed.blockFactors[block])));
    }
  });

  return next;
}

export function getAvailabilityPresetOptions() {
  return Object.entries(AVAILABILITY_PRESETS).map(([value, preset]) => ({
    value,
    label: preset.label
  }));
}

export function getAudienceTagCatalog(points = []) {
  const map = new Map();

  Object.entries(AUDIENCE_TAG_LABELS).forEach(([key, label]) => {
    map.set(key, { value: key, label, count: 0 });
  });

  points.forEach((point) => {
    normalizeAudienceTags(point.audience_tags, point.publico).forEach((tag) => {
      const current = map.get(tag.key) || { value: tag.key, label: tag.label, count: 0 };
      map.set(tag.key, {
        value: tag.key,
        label: tag.label,
        count: (current.count || 0) + 1
      });
    });
  });

  return Array.from(map.values())
    .filter((item) => item.count > 0)
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label, 'pt-BR'));
}

function formatList(values = [], fallback = '') {
  const normalized = normalizeArrayInput(values);
  if (!normalized.length) return fallback;
  if (normalized.length === 1) return normalized[0];
  if (normalized.length === 2) return `${normalized[0]} e ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(', ')} e ${normalized[normalized.length - 1]}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(toNumber(value));
}

function formatDistance(distance) {
  const numeric = Number(distance);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'próximo ao ponto';
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(numeric)} m`;
}

export function getSegmentDisplayName(segmento) {
  return SEGMENTO_LABELS[String(segmento || '').toLowerCase()] || 'Segmento comercial';
}

export function buildAudienceQualification(point = {}) {
  const publico = String(point.publico || 'A/B').toUpperCase();
  const fluxo = toNumber(point.fluxo);
  const tipo = String(point.tipo || 'formato').toLowerCase();

  let headline = 'Público com boa mistura entre alcance e tomada de decisão.';
  if (publico === 'A') {
    headline = 'Perfil premium, com maior aderência a marcas de valor agregado.';
  } else if (publico === 'B') {
    headline = 'Perfil massivo com boa resposta para campanhas de volume e frequência.';
  } else if (publico.includes('A/B')) {
    headline = 'Recorte equilibrado entre prestígio, recorrência e escala urbana.';
  }

  let formatContext = 'Formato útil para presença recorrente ao longo da jornada.';
  if (tipo.includes('elevador')) {
    formatContext = 'Ambiente de permanência e leitura próxima, com atenção mais qualificada.';
  } else if (tipo.includes('indoor')) {
    formatContext = 'Formato indoor com exposição próxima ao consumidor em contexto de decisão.';
  } else if (tipo.includes('painel') || tipo.includes('frontlight') || tipo.includes('backlight')) {
    formatContext = 'Formato de impacto visual forte, adequado para reforço de lembrança e cobertura.';
  }

  const fluxoContext = fluxo >= 120000
    ? 'Alta circulação mensal para sustentar frequência de marca.'
    : fluxo >= 45000
      ? 'Boa base de circulação para equilíbrio entre alcance e repetição.'
      : 'Fluxo seletivo, útil para mensagens de precisão e presença contextual.';

  return {
    badge: `Público ${publico}`,
    headline,
    summary: `${formatContext} ${fluxoContext}`,
    bullets: [
      `${formatNumber(fluxo)} impactos mensais estimados`,
      `Recorte predominante ${publico}`,
      formatContext
    ]
  };
}

export function buildEntornoSummary(metrics = null, segmento = '') {
  const total = Number(metrics?.total_estabelecimentos_relacionados) || 0;
  const score = Number(metrics?.score_relevancia) || 0;
  const affinityScore = Number(metrics?.affinity_score) || 0;
  const categories = Array.isArray(metrics?.categorias_encontradas) ? metrics.categorias_encontradas : [];
  const categoryBreakdown = Array.isArray(metrics?.category_breakdown) ? metrics.category_breakdown : [];
  const places = Array.isArray(metrics?.places) ? metrics.places : [];
  const segmentLabel = getSegmentDisplayName(segmento);

  const nearestPlaces = [...places]
    .sort((a, b) => (Number(a?.distance) || Infinity) - (Number(b?.distance) || Infinity))
    .filter((place) => place?.name)
    .slice(0, 4)
    .map((place) => ({
      name: place.name,
      category: place.category,
      distanceLabel: formatDistance(place.distance)
    }));

  if (!total) {
    return {
      headline: `Entorno do segmento ${segmentLabel} ainda sem evidências suficientes.`,
      summary: 'Não há locais de público-alvo em cache para destacar neste ponto agora.',
      places: [],
      categories: [],
      categoryBreakdown: [],
      affinityScore: 0
    };
  }

  // Build human-readable description from category breakdown
  const topContributions = categoryBreakdown
    .filter((c) => c.count > 0)
    .slice(0, 4)
    .map((c) => `${c.count} ${c.category.replace(/_/g, ' ')}`)
    .join(', ');

  const affinityLabel = affinityScore >= 60 ? 'alta' : affinityScore >= 30 ? 'moderada' : 'baixa';

  return {
    headline: `Este ponto possui ${affinityLabel} afinidade com o público-alvo da campanha.`,
    summary: topContributions
      ? `Presença de ${topContributions} no raio analisado (score de afinidade: ${affinityScore.toFixed(0)}).`
      : `${total} locais de público potencial no raio analisado (score: ${score.toFixed(1).replace('.', ',')}).`,
    places: nearestPlaces,
    categories,
    categoryBreakdown,
    affinityScore
  };
}

export function campaignTotals(points = []) {
  const totals = points.reduce((acc, p) => {
    acc.valorTotal += toNumber(p.preco);
    acc.fluxoTotal += toNumber(p.fluxo);
    acc.insercoesTotal += toNumber(p.insercoes);
    acc.telasTotal += toNumber(p.telas);
    return acc;
  }, {
    valorTotal: 0,
    fluxoTotal: 0,
    insercoesTotal: 0,
    telasTotal: 0
  });

  const quantidade = points.length;
  const cpmEstimado = totals.fluxoTotal > 0 ? totals.valorTotal / (totals.fluxoTotal / 1000) : 0;
  const ticketMedio = quantidade > 0 ? totals.valorTotal / quantidade : 0;
  const custoPorPonto = quantidade > 0 ? totals.valorTotal / quantidade : 0;
  const mediaFluxoPorPonto = quantidade > 0 ? totals.fluxoTotal / quantidade : 0;

  return {
    ...totals,
    quantidade,
    cpmEstimado,
    ticketMedio,
    custoPorPonto,
    mediaFluxoPorPonto
  };
}

export function calculateCoverageLevel(selected = [], cityInventory = []) {
  const selectedTotals = campaignTotals(selected);
  const cityTotals = campaignTotals(cityInventory);

  const coveragePct = cityTotals.quantidade > 0
    ? Math.min(100, (selectedTotals.quantidade / cityTotals.quantidade) * 100)
    : 0;

  const presencePct = cityTotals.fluxoTotal > 0
    ? Math.min(100, (selectedTotals.fluxoTotal / cityTotals.fluxoTotal) * 100)
    : 0;

  let nivel = 'Essencial';
  let mensagem = 'Base inicial montada. Inclua mais pontos para elevar cobertura e frequência.';

  if (coveragePct >= 50 || presencePct >= 55) {
    nivel = 'Domínio regional';
    mensagem = 'Plano forte com alta cobertura e presença recorrente na praça.';
  } else if (coveragePct >= 25 || presencePct >= 30) {
    nivel = 'Estratégico';
    mensagem = 'Boa cobertura em áreas-chave. Com poucos pontos adicionais, chega ao domínio regional.';
  }

  return {
    coveragePct,
    presencePct,
    nivel,
    mensagem,
    faltamParaProximoNivel: coveragePct >= 25 ? Math.max(0, Math.ceil(cityTotals.quantidade * 0.5 - selectedTotals.quantidade)) : Math.max(0, Math.ceil(cityTotals.quantidade * 0.25 - selectedTotals.quantidade))
  };
}

function scorePointByObjective(point, objective) {
  const fluxo = toNumber(point.fluxo);
  const preco = toNumber(point.preco);
  const publico = (point.publico || '').toUpperCase();
  const tipo = (point.tipo || '').toLowerCase();

  let score = 0;

  if (objective === 'presenca premium') {
    if (publico.includes('A/B')) score += 35;
    if (tipo.includes('elevador') || tipo.includes('painel led')) score += 25;
    score += Math.min(30, fluxo / 15000);
  } else if (objective === 'reconhecimento de marca' || objective === 'cobertura regional') {
    score += Math.min(60, fluxo / 12000);
    if (tipo.includes('painel') || tipo.includes('frontlight') || tipo.includes('backlight')) score += 20;
  } else if (objective === 'proximidade da decisao de compra') {
    if (tipo.includes('indoor') || tipo.includes('posto') || tipo.includes('muffato')) score += 30;
    score += Math.min(40, fluxo / 18000);
  } else {
    score += Math.min(45, fluxo / 15000);
    if (tipo.includes('elevador') || tipo.includes('indoor')) score += 20;
    if (publico.includes('A/B')) score += 10;
  }

  if (preco > 0) {
    score += Math.max(0, 25 - (preco / 250));
  }

  return score;
}

function normalizeFilterValue(value, allLabel) {
  return normalizeArrayInput(value)
    .filter((item) => item.toLowerCase() !== String(allLabel).toLowerCase());
}

function scoreSegmentAffinity(point, segmento) {
  if (!segmento) return 0;
  const text = `${point.nome || ''} ${point.tipo || ''} ${point.descricao || ''} ${point.endereco || ''}`.toLowerCase();
  const lookup = {
    clinica: ['hospital', 'lab', 'saude', 'clinica', 'uniorte'],
    hospital: ['hospital', 'lab', 'saude', 'clinica'],
    escola: ['escola', 'colegio', 'universidade', 'faculdade'],
    faculdade: ['faculdade', 'universidade', 'campus'],
    construtora: ['premium', 'residence', 'palhano', 'elevador', 'residencial'],
    imobiliaria: ['residence', 'residencial', 'palhano', 'elevador'],
    varejo: ['muffato', 'posto', 'mercad', 'indoor', 'painel'],
    restaurante: ['restaurante', 'boteco', 'grill', 'panetteria', 'cafeteria'],
    contabilidade: ['comercial', 'business', 'centro', 'elevador'],
    advocacia: ['comercial', 'business', 'premium', 'elevador'],
    industria: ['rod', 'frontlight', 'backlight', 'painel', 'posto'],
    outro: []
  };

  const terms = lookup[String(segmento).toLowerCase()] || [];
  if (!terms.length) return 0;
  const hits = terms.filter((term) => text.includes(term)).length;
  return Math.min(18, hits * 4.5);
}

function scorePublicoAffinity(point, publicoDesejado) {
  const pointPublico = String(point.publico || '').toUpperCase();
  const desiredPublicos = normalizeArrayInput(publicoDesejado);

  if (!desiredPublicos.length) return 0;

  if (!pointPublico) return -2;

  const scores = desiredPublicos.map((value) => {
    const target = String(value).toUpperCase();
    if (pointPublico === target) return 16;

    const targetParts = normalizePublicoParts(target);
    const pointParts = normalizePublicoParts(pointPublico);
    const overlap = targetParts.filter((part) => pointParts.includes(part)).length;
    if (overlap > 0) return 8 + overlap * 3;
    if (pointPublico.includes(target) || target.includes(pointPublico)) return 8;

    return -5;
  });

  return Math.max(...scores);
}

function scoreAudienceTagAffinity(point, targetTags = []) {
  const normalizedTargets = normalizeArrayInput(targetTags).map((tag) => normalizeTagKey(tag)).filter(Boolean);
  if (!normalizedTargets.length) return 0;

  const pointTags = normalizeAudienceTags(point.audience_tags, point.publico);
  if (!pointTags.length) return -2;

  const byKey = new Map(pointTags.map((tag) => [tag.key, tag]));
  const overlapScore = normalizedTargets.reduce((acc, key) => {
    const tag = byKey.get(key);
    if (!tag) return acc;
    return acc + (8 * (Number(tag.weight) || 1));
  }, 0);

  return Math.min(24, overlapScore);
}

function scoreAvailabilityFit(point, availabilityPreference = 'all') {
  const preset = AVAILABILITY_PRESETS[availabilityPreference] || AVAILABILITY_PRESETS.all;
  const calendar = normalizeAvailabilityCalendar(point.availability_calendar, point.horario);

  const dayAvg = preset.days.reduce((acc, day) => acc + (Number(calendar.dayFactors?.[day]) || 1), 0) / Math.max(1, preset.days.length);
  const blockAvg = preset.blocks.reduce((acc, block) => acc + (Number(calendar.blockFactors?.[block]) || 1), 0) / Math.max(1, preset.blocks.length);
  const availabilityPct = Math.min(1, Math.max(0.2, Number(calendar.defaultPct) || 0.75));

  return Math.max(-4, Math.min(22, ((dayAvg * blockAvg * availabilityPct) - 0.6) * 40));
}

export function estimateReachFrequency({ selected = [], cityInventory = [], periodWeeks = 4 }) {
  const totals = campaignTotals(selected);
  if (!selected.length || totals.fluxoTotal <= 0) {
    return {
      grossReachPct: 0,
      effectiveReachPct: 0,
      avgFrequency: 0,
      grps: 0,
      estimatedUnique: 0,
      periodWeeks
    };
  }

  const inventory = cityInventory.length ? cityInventory : selected;
  const cityTotals = campaignTotals(inventory);
  const formatDiversity = new Set(selected.map((point) => point.tipo).filter(Boolean)).size;
  const cityDiversity = new Set(selected.map((point) => point.cidade).filter(Boolean)).size;

  const shareOfVoice = totals.fluxoTotal / Math.max(1, cityTotals.fluxoTotal || totals.fluxoTotal);
  const grossReachPct = 100 * (1 - Math.exp(-2.65 * shareOfVoice));
  const qualityMultiplier = Math.min(1.15, 0.72 + formatDiversity * 0.055 + cityDiversity * 0.03);
  const effectiveReachPct = Math.min(96, grossReachPct * qualityMultiplier);

  const marketUniqueBase = Math.max(45000, Math.round((cityTotals.fluxoTotal || totals.fluxoTotal) / 6.8));
  const estimatedUnique = Math.max(1, Math.round(marketUniqueBase * (effectiveReachPct / 100)));
  const avgFrequency = totals.fluxoTotal / estimatedUnique;
  const grps = (effectiveReachPct * avgFrequency) / 100;

  return {
    grossReachPct: Number(grossReachPct.toFixed(1)),
    effectiveReachPct: Number(effectiveReachPct.toFixed(1)),
    avgFrequency: Number(avgFrequency.toFixed(2)),
    grps: Number(grps.toFixed(2)),
    estimatedUnique,
    periodWeeks
  };
}

export function optimizeBudgetAllocation({
  candidates = [],
  budget = 0,
  objective,
  maxSharePerFormat = 0.48,
  minPoints = 4
}) {
  const selected = [];
  const formatSpend = new Map();
  const sorted = [...candidates].sort((a, b) => {
    const effA = a._preco > 0 ? a._baseScore / a._preco : a._baseScore;
    const effB = b._preco > 0 ? b._baseScore / b._preco : b._baseScore;
    return effB - effA;
  });

  let spend = 0;
  let remaining = sorted;

  while (remaining.length) {
    const next = remaining.shift();
    if (!next) break;

    const projected = spend + next._preco;
    if (budget > 0 && projected > budget && selected.length >= minPoints) {
      continue;
    }

    const formatSpendCurrent = Number(formatSpend.get(next.tipo) || 0);
    const formatShareProjected = budget > 0
      ? (formatSpendCurrent + next._preco) / Math.max(1, budget)
      : 0;

    if (budget > 0 && formatShareProjected > maxSharePerFormat && selected.length >= minPoints) {
      continue;
    }

    selected.push(next);
    spend = projected;
    formatSpend.set(next.tipo, formatSpendCurrent + next._preco);

    if (budget > 0 && spend >= budget * 0.985) break;

    // Objective-driven expansion: allow extra points for regional coverage.
    if (objective === 'cobertura regional' && selected.length < 12) {
      remaining = remaining.sort((a, b) => {
        const cityBonusA = selected.some((item) => item.cidade === a.cidade) ? 0 : 10;
        const cityBonusB = selected.some((item) => item.cidade === b.cidade) ? 0 : 10;
        return (b._baseScore + cityBonusB) - (a._baseScore + cityBonusA);
      });
    }
  }

  if (!selected.length && sorted.length) {
    selected.push(sorted[0]);
    spend = sorted[0]._preco;
  }

  const spendByFormat = Array.from(formatSpend.entries())
    .map(([tipo, valor]) => ({ tipo, valor, pct: budget > 0 ? Number(((valor / budget) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.valor - a.valor);

  return {
    selected,
    spend,
    spendByFormat,
    budgetUsagePct: budget > 0 ? Number(((spend / budget) * 100).toFixed(1)) : 0
  };
}

function scoreCostEfficiency(point) {
  const fluxo = toNumber(point.fluxo);
  const insercoes = toNumber(point.insercoes);
  const preco = Math.max(1, toNumber(point.preco));

  const fluxoPerCost = fluxo / preco;
  const insercoesPerCost = insercoes / preco;

  return (
    Math.min(34, fluxoPerCost / 14) +
    Math.min(16, insercoesPerCost / 60)
  );
}

function getObjectiveFormatBoost(tipo, objetivo) {
  const normalized = String(tipo || '').toLowerCase();

  if (objetivo === 'presenca premium') {
    if (normalized.includes('elevador')) return 12;
    if (normalized.includes('indoor') || normalized.includes('video wall')) return 10;
    if (normalized.includes('painel led')) return 6;
    return 0;
  }

  if (objetivo === 'reconhecimento de marca' || objetivo === 'cobertura regional') {
    if (normalized.includes('painel led') || normalized.includes('frontlight') || normalized.includes('backlight')) return 12;
    if (normalized.includes('totem') || normalized.includes('indoor')) return 6;
    return 0;
  }

  if (objetivo === 'proximidade da decisao de compra') {
    if (normalized.includes('indoor') || normalized.includes('muffato') || normalized.includes('posto')) return 12;
    if (normalized.includes('elevador')) return 7;
    return 0;
  }

  if (objetivo === 'lembranca continua') {
    if (normalized.includes('elevador') || normalized.includes('indoor')) return 10;
    if (normalized.includes('painel led') || normalized.includes('frontlight')) return 7;
    return 0;
  }

  return 0;
}

function scoreSegmentEnvironment(point, entornoByPoint = null) {
  if (!entornoByPoint || !point?.id) return 0;

  const metrics = entornoByPoint[point.id] || entornoByPoint[String(point.id)];
  if (!metrics) return 0;

  const total = Number(metrics.total_estabelecimentos_relacionados) || 0;
  const score = Number(metrics.score_relevancia) || 0;
  const affinityScore = Number(metrics.affinity_score) || 0;
  const categories = Array.isArray(metrics.categorias_encontradas)
    ? metrics.categorias_encontradas.length
    : 0;

  // Affinity-based scoring (audience-location model) takes priority
  if (affinityScore > 0) {
    return Math.min(48, affinityScore * 0.45 + categories * 2.0 + total * 0.5);
  }

  // Legacy fallback
  return Math.min(48, score * 0.62 + total * 1.35 + categories * 2.8);
}

// ─── GeoAudience Intelligence Scoring ─────────────────────────────────────
// Segment ↔ Neighbourhood affinity matrix (mirrors backend SEGMENT_NEIGHBORHOOD_AFFINITY)
const GEO_SEGMENT_AFFINITY = {
  clinica:       { polo_saude: 1.8, residencial_premium: 1.4, centro_corporativo: 1.2 },
  hospital:      { polo_saude: 1.9, residencial_medio: 1.2 },
  escola:        { polo_educacional: 1.8, residencial_medio: 1.5, residencial_premium: 1.3 },
  faculdade:     { zona_universitaria: 1.9, zona_lazer: 1.2, polo_educacional: 1.4 },
  construtora:   { residencial_premium: 1.6, centro_corporativo: 1.3, residencial_medio: 1.2 },
  imobiliaria:   { residencial_premium: 1.7, centro_corporativo: 1.3, zona_comercial: 1.2 },
  varejo:        { zona_comercial: 1.8, zona_popular_densa: 1.4, residencial_medio: 1.2 },
  restaurante:   { zona_lazer: 1.7, zona_comercial: 1.4, centro_corporativo: 1.3 },
  contabilidade: { centro_corporativo: 1.8, zona_comercial: 1.3 },
  advocacia:     { centro_corporativo: 1.8, zona_comercial: 1.2 },
  industria:     { zona_popular_densa: 1.3, zona_comercial: 1.2 },
  outro:         {}
};

// Audience class ↔ socioeconomic level affinity
const PUBLICO_SOCIO_AFFINITY = {
  'A':     { alto: 1.5, 'medio-alto': 1.2 },
  'A/B':   { alto: 1.3, 'medio-alto': 1.3 },
  'A/B+':  { alto: 1.4, 'medio-alto': 1.3 },
  'B':     { 'medio-alto': 1.2, medio: 1.1 },
  'B/C':   { medio: 1.2, 'medio-baixo': 1.1 },
  'A/B/C': { 'medio-alto': 1.15, medio: 1.1 }
};

/**
 * Score a point based on its GeoAudience neighbourhood profile and the target campaign.
 * Returns 0-50 (raw score, will be normalized).
 */
function scoreGeoAudienceAffinity(point, { segmento, publico, geoProfilesByPoint } = {}) {
  if (!geoProfilesByPoint || !point?.id) return 0;

  const profile = geoProfilesByPoint[point.id] || geoProfilesByPoint[String(point.id)];
  if (!profile || profile.neighborhood_type === 'indefinido') return 0;

  let score = 0;

  // 1. Segment ↔ neighbourhood affinity (0-20)
  if (segmento) {
    const affinityMap = GEO_SEGMENT_AFFINITY[segmento] || {};
    const multiplier = affinityMap[profile.neighborhood_type] || 1.0;
    score += Math.min(20, (profile.confidence || 0) * 0.15 * multiplier);
  }

  // 2. Audience class ↔ socioeconomic level (0-12)
  if (publico) {
    const targetPublico = (Array.isArray(publico) ? publico[0] : publico || '').toUpperCase();
    const socioMap = PUBLICO_SOCIO_AFFINITY[targetPublico] || {};
    const socioMultiplier = socioMap[profile.socioeconomic_level] || 1.0;
    score += Math.min(12, (profile.socioeconomic_score || 0) * 0.1 * socioMultiplier);
  }

  // 3. Urban density bonus (0-8) — higher density = more impressions potential
  const densityBonus = { 'muito alta': 8, alta: 6, media: 4, baixa: 2, 'muito baixa': 0 };
  score += densityBonus[profile.urban_density] || 0;

  // 4. POI richness bonus (0-10)
  const poisNorm = Math.min(1, (profile.total_pois || 0) / 80);
  score += poisNorm * 10;

  return Math.min(50, score);
}

export function buildGeoAudienceNarrative(profile) {
  if (!profile) return null;
  return {
    type: profile.neighborhood_type,
    label: profile.neighborhood_label,
    confidence: profile.confidence,
    socioeconomic: profile.socioeconomic_level,
    environment: profile.environment_type,
    dominantActivity: profile.dominant_activity,
    urbanDensity: profile.urban_density,
    poisPerKm2: profile.pois_per_km2,
    lifestyle: profile.lifestyle_indicators || [],
    narrative: profile.audience_narrative || '',
    poiSummary: profile.poi_summary || {},
    totalPois: profile.total_pois || 0,
    demographic: profile.demographic_data || {}
  };
}

// ─── Census Audience Profile Scoring ──────────────────────────────────────

const CENSUS_PROFILE_LABELS = {
  alta_renda: 'Alta Renda',
  massa_varejo: 'Massa / Varejo',
  jovem_universitario: 'Jovem / Universitário',
  terceira_idade: 'Terceira Idade'
};

// Map audience tags + público → census profiles
const TAG_TO_CENSUS = {
  'classe-a': ['alta_renda'],
  premium: ['alta_renda'],
  executivos: ['alta_renda'],
  'classe-b': ['massa_varejo'],
  shopper: ['massa_varejo'],
  jovens: ['jovem_universitario'],
  moradores: ['massa_varejo', 'terceira_idade'],
  familias: ['massa_varejo'],
  turistas: ['alta_renda', 'jovem_universitario'],
  motoristas: ['massa_varejo']
};

const PUBLICO_TO_CENSUS = {
  A: ['alta_renda'],
  'A/B': ['alta_renda', 'massa_varejo'],
  'A/B+': ['alta_renda'],
  B: ['massa_varejo'],
  'B/C': ['massa_varejo'],
  'A/B/C': ['alta_renda', 'massa_varejo']
};

/**
 * Score a point's census audience profile against the campaign's target audience.
 * Returns 0-40 (raw score, normalised later to 0-100 within the dimension).
 */
function scoreCensusProfileAffinity(point, { publico, audienceTags, censusProfilesByPoint } = {}) {
  if (!censusProfilesByPoint || !point?.id) return 0;

  const profile = censusProfilesByPoint[point.id] || censusProfilesByPoint[String(point.id)];
  if (!profile || !profile.perfis) return 0;

  const perfis = profile.perfis;
  let score = 0;

  // Audience tag affinity (0-20)
  const tags = Array.isArray(audienceTags) ? audienceTags.map(t => typeof t === 'string' ? t : t.key) : [];
  for (const tag of tags) {
    const boosted = TAG_TO_CENSUS[tag] || [];
    for (const bp of boosted) score += (perfis[bp] || 0) * 10;
  }

  // Público class affinity (0-12)
  const pubArr = Array.isArray(publico) ? publico : publico ? [publico] : [];
  for (const pub of pubArr) {
    const target = String(pub).toUpperCase();
    const boosted = PUBLICO_TO_CENSUS[target] || [];
    for (const bp of boosted) score += (perfis[bp] || 0) * 8;
  }

  // General census quality bonus (0-8)
  score += (profile.score_geral || 0) * 8;

  return Math.min(40, score);
}

export { CENSUS_PROFILE_LABELS };

function buildCandidate(point, {
  objetivo,
  publico,
  segmento,
  medianPrice,
  maxPrice,
  maxFluxo,
  entornoByPoint,
  audienceTags,
  availabilityPreference,
  geoProfilesByPoint,
  censusProfilesByPoint
}) {
  const preco = Math.max(0, toNumber(point.preco));
  const objectiveScore = scorePointByObjective(point, objetivo);
  const efficiencyScore = scoreCostEfficiency(point);
  const publicoScore = scorePublicoAffinity(point, publico);
  const audienceTagScore = scoreAudienceTagAffinity(point, audienceTags);
  const availabilityScore = scoreAvailabilityFit(point, availabilityPreference);
  const segmentoScore = scoreSegmentAffinity(point, segmento);
  const entornoScore = scoreSegmentEnvironment(point, entornoByPoint);
  const geoAudienceScore = scoreGeoAudienceAffinity(point, { segmento, publico, geoProfilesByPoint });
  const censusScore = scoreCensusProfileAffinity(point, { publico, audienceTags, censusProfilesByPoint });
  const formatBoost = getObjectiveFormatBoost(point.tipo, objetivo);
  const premiumPenalty = preco > medianPrice * 2.4 ? -8 : 0;
  const hugePenalty = maxPrice > 0 && preco > maxPrice * 0.85 ? -4 : 0;

  return {
    ...point,
    _preco: preco,
    _entornoScore: entornoScore,
    _geoAudienceScore: geoAudienceScore,
    _censusScore: censusScore,
    _screenScore: computeScreenScore(point, {
      geoProfile: geoProfilesByPoint?.[point.id] || geoProfilesByPoint?.[String(point.id)] || null,
      censusProfile: censusProfilesByPoint?.[point.id] || censusProfilesByPoint?.[String(point.id)] || null,
      entornoMetrics: entornoByPoint?.[point.id] || entornoByPoint?.[String(point.id)] || null,
      maxFluxo: maxFluxo || 500000,
      medianPrice
    }),
    _baseScore:
      objectiveScore * 1.25 +
      efficiencyScore * 0.9 +
      publicoScore +
      audienceTagScore +
      availabilityScore +
      segmentoScore +
      entornoScore +
      geoAudienceScore +
      censusScore +
      formatBoost +
      premiumPenalty +
      hugePenalty
  };
}

function marginalGain(candidate, selected, budget, spend, objetivo) {
  const formatos = new Set(selected.map((p) => p.tipo).filter(Boolean));
  const cidades = new Set(selected.map((p) => p.cidade).filter(Boolean));

  const sameTypeCount = selected.filter((p) => p.tipo === candidate.tipo).length;
  const sameCityCount = selected.filter((p) => p.cidade === candidate.cidade).length;

  const diversidadeFormato = formatos.has(candidate.tipo) ? 0 : 14;
  const diversidadeCidade = cidades.has(candidate.cidade) ? 0 : 8;
  const saturacaoTipo = sameTypeCount * 5.2;
  const saturacaoCidade = sameCityCount * 1.2;

  const projected = spend + candidate._preco;
  let budgetPenalty = 0;
  if (budget > 0 && projected > budget) {
    const overflowRatio = (projected - budget) / Math.max(budget, 1);
    budgetPenalty = 52 * overflowRatio;
  }

  const cpm = candidate._preco > 0 && toNumber(candidate.fluxo) > 0
    ? candidate._preco / (toNumber(candidate.fluxo) / 1000)
    : 9999;
  const cpmBonus = cpm < 18 ? 10 : cpm < 28 ? 5 : cpm < 40 ? 1 : -3;

  const objetivoCapilaridade = objetivo === 'cobertura regional' ? (diversidadeFormato * 0.45 + diversidadeCidade * 0.75) : 0;

  return (
    candidate._baseScore +
    diversidadeFormato +
    diversidadeCidade +
    cpmBonus +
    objetivoCapilaridade -
    saturacaoTipo -
    saturacaoCidade -
    budgetPenalty
  );
}

export function suggestIdealPlan({
  pontos = [],
  cidade,
  publico,
  audienceTags = [],
  availabilityPreference = 'all',
  objetivo,
  segmento,
  periodWeeks = 4,
  investimentoMensal = 0,
  entornoByPoint = null,
  geoProfilesByPoint = null,
  censusProfilesByPoint = null,
  cityInventory = []
}) {
  const budget = Math.max(0, toNumber(investimentoMensal));
  const cidadeNormalizada = normalizeFilterValue(cidade, 'Todas');
  const publicoNormalizado = normalizeFilterValue(publico, 'Todos');

  const filtered = pontos
    .filter((p) => matchesAnySelection(p.cidade, cidadeNormalizada))
    .filter((p) => {
      if (!publicoNormalizado.length) return true;

      const pointPublico = String(p.publico || '').toUpperCase();
      return publicoNormalizado.some((target) => {
        const normalizedTarget = String(target).toUpperCase();
        return pointPublico.includes(normalizedTarget) || normalizedTarget.includes(pointPublico);
      });
    });

  if (!filtered.length) {
    return {
      pontos: [],
      totals: campaignTotals([]),
      justificativa: 'Nao encontramos pontos para os filtros selecionados. Ajuste praca, publico ou objetivo para gerar um plano ideal.'
    };
  }

  const prices = filtered.map((p) => Math.max(0, toNumber(p.preco))).sort((a, b) => a - b);
  const medianPrice = prices[Math.floor(prices.length / 2)] || 0;
  const maxPrice = prices[prices.length - 1] || 0;
  const maxFluxo = Math.max(1, ...filtered.map((p) => toNumber(p.fluxo)));

  const candidates = filtered
    .map((point) => buildCandidate(point, {
      objetivo,
      publico: publicoNormalizado,
      segmento,
      medianPrice,
      maxPrice,
      maxFluxo,
      entornoByPoint,
      audienceTags,
      availabilityPreference,
      geoProfilesByPoint,
      censusProfilesByPoint
    }))
    .sort((a, b) => b._baseScore - a._baseScore);

  const targetCount = budget > 0
    ? Math.min(14, Math.max(4, Math.round(budget / Math.max(medianPrice || 1, 900))))
    : 7;

  const seeded = [];
  for (const candidate of candidates) {
    if (seeded.length >= Math.min(3, targetCount)) break;
    const formatoJaExiste = seeded.some((item) => item.tipo === candidate.tipo);
    if (formatoJaExiste && seeded.length > 0) continue;
    seeded.push(candidate);
  }

  const nonSeeded = candidates.filter((candidate) => !seeded.some((item) => item.id === candidate.id));
  const optimized = optimizeBudgetAllocation({
    candidates: [...seeded, ...nonSeeded],
    budget,
    objective: objetivo,
    minPoints: Math.min(4, targetCount)
  });

  const selected = optimized.selected.length
    ? optimized.selected.slice(0, targetCount)
    : [];

  const cleaned = selected.map(({ _baseScore, _preco, _entornoScore, ...point }) => point);
  const totals = campaignTotals(cleaned);
  const reachFrequency = estimateReachFrequency({
    selected: cleaned,
    cityInventory: cityInventory.length ? cityInventory : filtered,
    periodWeeks
  });
  const formatos = new Set(cleaned.map((p) => p.tipo).filter(Boolean)).size;
  const orcamentoUsoPct = budget > 0 ? Math.round((totals.valorTotal / budget) * 100) : null;
  const withEntorno = selected.filter((point) => point._entornoScore > 0).length;

  let foco = 'equilíbrio entre frequência, eficiência de custo e cobertura.';
  if (objetivo === 'presenca premium') {
    foco = 'ambientes premium com alta recorrência para elevar percepção de marca.';
  } else if (objetivo === 'reconhecimento de marca') {
    foco = 'volume de impacto e repetição para acelerar lembrança.';
  } else if (objetivo === 'cobertura regional') {
    foco = 'capilaridade de formatos e distribuição por praça.';
  } else if (objetivo === 'proximidade da decisao de compra') {
    foco = 'pontos próximos de decisão com maior propensão de conversão.';
  } else if (objetivo === 'lembranca continua') {
    foco = 'continuidade de exposição com bom ritmo de inserções.';
  }

  const justificativa = [
    `Plano recomendado com ${totals.quantidade} ponto${totals.quantidade > 1 ? 's' : ''} e ${formatos} formato${formatos > 1 ? 's' : ''}, priorizando ${foco}`,
    `Fluxo potencial de ${new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)} impactos/mensais e CPM estimado em R$ ${totals.cpmEstimado.toFixed(2)}.`,
    withEntorno > 0
      ? `${withEntorno} ponto${withEntorno > 1 ? 's' : ''} recebeu ganho de afinidade por presença de público-alvo potencial no entorno analisado.`
      : 'Sem dados de entorno suficientes no momento, o plano foi calculado apenas com comportamento, público e eficiência.',
    `Reach efetivo estimado em ${reachFrequency.effectiveReachPct.toFixed(1).replace('.', ',')}% com frequência média ${reachFrequency.avgFrequency.toFixed(2).replace('.', ',')} no período de ${reachFrequency.periodWeeks} semanas (R&F).`,
    budget > 0
      ? `Uso de orçamento em ${orcamentoUsoPct}% (R$ ${new Intl.NumberFormat('pt-BR').format(totals.valorTotal)} de R$ ${new Intl.NumberFormat('pt-BR').format(budget)}), com seleção por ganho marginal para evitar pontos redundantes.`
      : 'Sem limite de orçamento informado, o motor priorizou eficiência e diversidade para um plano-base robusto.'
  ].join(' ');

  return {
    pontos: cleaned,
    totals,
    reachFrequency,
    optimizer: {
      budgetUsagePct: optimized.budgetUsagePct,
      spendByFormat: optimized.spendByFormat
    },
    justificativa
  };
}

export function calculateCampaignScore({ selected = [], objective, desiredPublico, cityInventory = [] }) {
  if (selected.length === 0) {
    return {
      score: 0,
      explanation: 'Score 0,0: selecione pontos para iniciar a avaliação da campanha.'
    };
  }

  const totals = campaignTotals(selected);
  const coverage = calculateCoverageLevel(selected, cityInventory);
  const desiredPublicos = normalizeArrayInput(desiredPublico).map((value) => String(value).toUpperCase());

  const formats = new Set(selected.map((p) => p.tipo).filter(Boolean)).size;
  const publicoMatches = selected.filter((p) => {
    if (!desiredPublicos.length) return true;
    const pointPublico = String(p.publico || '').toUpperCase();
    return desiredPublicos.some((target) => pointPublico.includes(target) || target.includes(pointPublico));
  }).length;
  const objectiveBoost = selected.filter((p) => scorePointByObjective(p, objective) > 45).length;

  const scoreRaw =
    Math.min(2.2, formats / 3) +
    Math.min(2.4, totals.fluxoTotal / 700000) +
    Math.min(2.0, coverage.coveragePct / 25) +
    Math.min(1.8, coverage.presencePct / 28) +
    Math.min(1.6, publicoMatches / Math.max(1, selected.length) * 1.6) +
    Math.min(1.4, objectiveBoost / Math.max(1, selected.length) * 1.4);

  const score = Math.min(10, Number(scoreRaw.toFixed(1)));

  let explanation = `Score ${score.toFixed(1)}: campanha com boa base de frequência e cobertura.`;
  if (score >= 8.5) {
    explanation = `Score ${score.toFixed(1)}: campanha forte em impacto e presença premium, com perfil comercial robusto.`;
  } else if (score >= 7) {
    explanation = `Score ${score.toFixed(1)}: plano consistente, com oportunidade de ampliar cobertura para domínio regional.`;
  } else if (score >= 5) {
    explanation = `Score ${score.toFixed(1)}: campanha funcional, mas ainda com espaço para reforçar formatos e capilaridade.`;
  }

  return { score, explanation };
}

export function generateCommercialArguments({ selected = [], city, publico, objetivo, segmento }) {
  if (!selected.length) {
    return ['Selecione pontos para gerar argumentação comercial automática.'];
  }

  const totals = campaignTotals(selected);
  const formatos = Array.from(new Set(selected.map((p) => p.tipo).filter(Boolean))).slice(0, 3);
  const focoPublico = formatList(publico, 'públicos estratégicos da praça');
  const focoCidade = formatList(city, 'múltiplas praças');
  const segmentLabel = getSegmentDisplayName(segmento);

  return [
    `A combinação selecionada em ${focoCidade} reforça presença em ambientes de alta recorrência e atenção qualificada.`,
    `Com ${totals.quantidade} pontos e fluxo estimado de ${new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)} impactos mensais, o plano equilibra alcance e frequência.`,
    `A estratégia privilegia ${formatos.join(', ') || 'formatos complementares'}, favorecendo ${objetivo || 'lembrança contínua'} para o segmento ${segmentLabel || 'anunciante'}.`,
    `O recorte de público (${focoPublico}) aumenta aderência comercial e potencial de conversão no território de interesse.`
  ];
}

/**
 * Define a ordem padrão de formatos para o sistema todo
 * @constant
 */
export const FORMAT_SORT_ORDER = [
  'Elevador',
  'Tela Indoor',
  'Painel LED',
  // Todos os outros formatos vão nesta posição (em ordem alfabética)
  'Backlight',
  'Frontlight'
];

/**
 * Compara dois formatos de acordo com a ordem definida no sistema
 * @param {string} formatoA - Primeiro formato
 * @param {string} formatoB - Segundo formato
 * @returns {number} -1 se A vem antes, 1 se B vem antes, 0 se iguais
 */
export function compareFormatos(formatoA, formatoB) {
  const a = String(formatoA || 'Sem tipo').trim();
  const b = String(formatoB || 'Sem tipo').trim();

  const indexA = FORMAT_SORT_ORDER.indexOf(a);
  const indexB = FORMAT_SORT_ORDER.indexOf(b);

  // Se ambos estão na lista de ordenação conhecida
  if (indexA !== -1 && indexB !== -1) {
    return indexA - indexB;
  }

  // Se A está na lista mas B não (B é "outro")
  if (indexA !== -1 && indexB === -1) {
    return FORMAT_SORT_ORDER.indexOf('Backlight') > indexA ? -1 : 1;
  }

  // Se B está na lista mas A não (A é "outro")
  if (indexA === -1 && indexB !== -1) {
    return FORMAT_SORT_ORDER.indexOf('Backlight') > indexB ? 1 : -1;
  }

  // Se ambos são "outros", ordena alfabeticamente
  return a.localeCompare(b, 'pt-BR');
}

/**
 * Ordena um array de formatos ou objetos com propriedade 'tipo' de acordo com a ordem definida
 * @param {Array} items - Array de strings (formatos) ou objetos com propriedade 'tipo'
 * @param {string} [typeKey='tipo'] - Propriedade que contém o tipo (para objetos)
 * @returns {Array} Array ordenado
 */
export function sortFormatos(items, typeKey = 'tipo') {
  if (!Array.isArray(items)) return items;

  return [...items].sort((a, b) => {
    const formatoA = typeof a === 'string' ? a : a[typeKey];
    const formatoB = typeof b === 'string' ? b : b[typeKey];
    return compareFormatos(formatoA, formatoB);
  });
}

/* ──────────────────────────────────────────────────────────
   STRATEGIC JUSTIFICATION GENERATOR
   Generates 4-section professional media plan justification
   ────────────────────────────────────────────────────────── */

export function generateStrategicJustification({
  selected = [],
  totals: _totals,
  reachFrequency = {},
  optimizer = {},
  empresa = '',
  segmento = '',
  objetivo = '',
  cidade = '',
  budget = 0,
  periodWeeks = 4,
  publicoAlvo = [],
  cityInventory = [],
  entornoByPoint = null,
  geoProfilesByPoint = null,
  censusProfilesByPoint = null
}) {
  const totals = _totals || campaignTotals(selected);
  const coverage = calculateCoverageLevel(selected, cityInventory);
  const segmentLabel = getSegmentDisplayName(segmento);
  const fmt = (n) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
  const fmtDec = (n, d = 1) => Number(n || 0).toFixed(d).replace('.', ',');
  const fmtMoney = (n) => `R$ ${fmt(n)}`;

  const formatos = Array.from(new Set(selected.map((p) => p.tipo).filter(Boolean)));
  const formatosList = formatos.length <= 3
    ? formatos.join(', ')
    : `${formatos.slice(0, 3).join(', ')} e mais ${formatos.length - 3}`;

  const tiposAmbiente = {};
  selected.forEach((p) => {
    const t = p.tipo || 'Outros';
    tiposAmbiente[t] = (tiposAmbiente[t] || 0) + 1;
  });
  const tiposRanked = Object.entries(tiposAmbiente).sort((a, b) => b[1] - a[1]);

  const publicoValues = normalizeArrayInput(publicoAlvo);
  const publicoLabel = publicoValues.length ? formatList(publicoValues) : 'diversos perfis';

  const matchedPublico = selected.filter((p) => {
    if (!publicoValues.length) return true;
    const pp = String(p.publico || '').toUpperCase();
    return publicoValues.some((v) => pp.includes(String(v).toUpperCase()));
  });
  const publicoMatchPct = selected.length > 0
    ? Math.round((matchedPublico.length / selected.length) * 100)
    : 0;

  const avgFluxo = totals.quantidade > 0 ? Math.round(totals.fluxoTotal / totals.quantidade) : 0;
  const cpm = totals.cpmEstimado || 0;
  const budgetUsage = optimizer.budgetUsagePct || (budget > 0 ? Math.round((totals.valorTotal / budget) * 100) : 0);
  const freq = reachFrequency.avgFrequency || 0;
  const reach = reachFrequency.effectiveReachPct || 0;
  const grps = reachFrequency.grps || 0;

  // Entorno data aggregation
  let entornoCount = 0;
  let topEntornoPoint = null;
  if (entornoByPoint) {
    selected.forEach((p) => {
      const m = entornoByPoint[p.id] || entornoByPoint[String(p.id)];
      if (m && (Number(m.affinity_score) > 0 || Number(m.score_relevancia) > 0)) {
        entornoCount++;
        const as = Number(m.affinity_score) || Number(m.score_relevancia) || 0;
        if (!topEntornoPoint || as > topEntornoPoint.score) {
          topEntornoPoint = { nome: p.nome, score: as, tipo: p.tipo };
        }
      }
    });
  }

  /* ────── 1. QUALIDADE DA SELEÇÃO ────── */

  const qualityParts = [];

  // Reach vs frequency balance — with concrete numbers
  if (reach > 0 && freq > 0) {
    qualityParts.push(`O plano atinge reach efetivo de ${fmtDec(reach)}% com frequência média de ${fmtDec(freq, 2)} exposições por pessoa em ${periodWeeks} semanas. Total de ${fmt(totals.fluxoTotal)} impactos/mês distribuídos em ${totals.quantidade} ponto${totals.quantidade > 1 ? 's' : ''} (estimativa via modelo de reach DOOH indoor).`);
  }

  // Investment efficiency — concrete CPM + comparison
  if (cpm > 0) {
    const cityAvgCpm = cityInventory.length > 0
      ? (() => {
          const cpms = cityInventory.map(pt => { const f = toNumber(pt.fluxo); return f > 0 ? toNumber(pt.preco) / (f / 1000) : Infinity; }).filter(v => v < Infinity);
          return cpms.length > 0 ? cpms.reduce((a, b) => a + b, 0) / cpms.length : 0;
        })()
      : 0;

    let cpmComparison = '';
    if (cityAvgCpm > 0) {
      const diff = Math.round(((cpm - cityAvgCpm) / cityAvgCpm) * 100);
      cpmComparison = diff <= 0
        ? ` — ${Math.abs(diff)}% abaixo da média do inventário em ${cidade || 'a praça'} (média R$ ${cityAvgCpm.toFixed(2)}, ${cityInventory.length} pontos)`
        : ` — ${diff}% acima da média (R$ ${cityAvgCpm.toFixed(2)}), priorizando qualidade de contexto sobre volume`;
    }
    qualityParts.push(`CPM do plano: ${fmtMoney(cpm)}${cpmComparison}. Investimento de ${fmtMoney(totals.valorTotal)} gera ${fmt(totals.fluxoTotal)} impactos mensais.`);
  }

  // Geographic + audience composition — use real percentages
  const geoAndAudience = [];
  if (coverage.coveragePct > 0) {
    geoAndAudience.push(`cobertura de ${fmtDec(coverage.coveragePct)}% do inventário disponível (${totals.quantidade} de ${cityInventory.length} pontos em ${cidade || 'a praça'})`);
  }
  if (publicoMatchPct > 0) {
    geoAndAudience.push(`${publicoMatchPct}% dos pontos selecionados com público ${publicoLabel} — aderência ${publicoMatchPct >= 80 ? 'alta' : publicoMatchPct >= 50 ? 'moderada' : 'parcial'} ao target`);
  }
  if (formatos.length >= 2) {
    const fmtBreakdown = tiposRanked.slice(0, 4).map(([t, c]) => `${c}× ${t}`).join(', ');
    geoAndAudience.push(`${formatos.length} formatos (${fmtBreakdown})`);
  }
  if (geoAndAudience.length) {
    qualityParts.push(`Composição: ${geoAndAudience.join('; ')}.`);
  }

  /* ────── 2. JUSTIFICATIVA ESTRATÉGICA ────── */

  const strategyParts = [];

  // Objective alignment — concrete numbers
  strategyParts.push(`Campanha para ${empresa || 'o anunciante'} (${segmentLabel}) com objetivo de ${objetivo || 'mídia OOH'} em ${cidade || 'múltiplas praças'}. Seleção de ${totals.quantidade} pontos em ${formatos.length} formato${formatos.length > 1 ? 's' : ''} otimizada por algoritmo de 9 dimensões (objetivo, público, eficiência, entorno, geoaudiência, censo, segmento, formato, disponibilidade).`);

  // Frequency logic — with precise numbers and model reference
  if (freq >= 3) {
    strategyParts.push(`Frequência média de ${fmtDec(freq, 2)} exposições/pessoa excede o threshold de 3× recomendado para fixação em DOOH (modelo de reach indoor com decaimento logarítmico). GRPs estimados: ${fmtDec(grps, 1)}.`);
  } else if (freq >= 1.5) {
    strategyParts.push(`Frequência de ${fmtDec(freq, 2)} exposições/pessoa em ${periodWeeks} semanas. GRPs: ${fmtDec(grps, 1)}. Suficiente para construir reconhecimento progressivo (estimativa via modelo de reach indoor).`);
  } else if (freq > 0) {
    strategyParts.push(`Frequência estimada de ${fmtDec(freq, 2)} — plano focado em alcance amplo com repetição limitada. GRPs: ${fmtDec(grps, 1)} (modelo de reach indoor).`);
  }

  // Environment composition — concrete counts, not vague quality statements
  if (tiposRanked.length) {
    const envDesc = tiposRanked.map(([t, c]) => `${c}× ${t}`).join(', ');
    strategyParts.push(`Distribuição por formato: ${envDesc}. Ticket médio/ponto: ${fmtMoney(totals.ticketMedio || (totals.valorTotal / totals.quantidade))} · fluxo médio/ponto: ${fmt(avgFluxo)} imp/mês.`);
  }

  // GeoAudience enrichment — neighborhood-level data with source
  if (geoProfilesByPoint) {
    const neighborhoodCounts = {};
    const socioLevels = { alto: 0, 'medio-alto': 0, medio: 0, 'medio-baixo': 0 };
    let totalPoisAll = 0;
    selected.forEach((pt) => {
      const gp = geoProfilesByPoint[pt.id] || geoProfilesByPoint[String(pt.id)];
      if (gp && gp.neighborhood_type !== 'indefinido') {
        neighborhoodCounts[gp.neighborhood_label || gp.neighborhood_type] = (neighborhoodCounts[gp.neighborhood_label || gp.neighborhood_type] || 0) + 1;
        if (gp.socioeconomic_level) socioLevels[gp.socioeconomic_level] = (socioLevels[gp.socioeconomic_level] || 0) + 1;
        totalPoisAll += gp.total_pois || 0;
      }
    });
    const topNeighborhoods = Object.entries(neighborhoodCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topNeighborhoods.length > 0) {
      const nbText = topNeighborhoods.map(([n, c]) => `${c}× ${n}`).join(', ');
      const premiumCount = (socioLevels.alto || 0) + (socioLevels['medio-alto'] || 0);
      strategyParts.push(`Perfil de bairros (raio 400m, OpenStreetMap): ${nbText}. ${premiumCount > 0 ? `${premiumCount} ponto${premiumCount > 1 ? 's' : ''} em nível alto/médio-alto. ` : ''}Total de ${fmt(totalPoisAll)} POIs mapeados no entorno dos pontos selecionados.`);
    }
  }

  // Census-level data — with IBGE source
  if (censusProfilesByPoint) {
    const censusPoints = selected.filter(pt => {
      const cp = censusProfilesByPoint[pt.id] || censusProfilesByPoint[String(pt.id)];
      return cp && cp.perfil_dominante;
    });
    if (censusPoints.length > 0) {
      const profileCounts = {};
      censusPoints.forEach(pt => {
        const cp = censusProfilesByPoint[pt.id] || censusProfilesByPoint[String(pt.id)];
        const label = CENSUS_PROFILE_LABELS[cp.perfil_dominante] || cp.perfil_dominante;
        profileCounts[label] = (profileCounts[label] || 0) + 1;
      });
      const profileText = Object.entries(profileCounts).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${c}× ${l}`).join(', ');
      strategyParts.push(`Perfil demográfico dominante dos pontos (IBGE Censo 2022, tabelas 9606/9514/9529): ${profileText}. ${censusPoints.length} de ${totals.quantidade} pontos com dados censitários disponíveis.`);
    }
  }

  // Entorno relevance — concrete scores
  if (entornoCount > 0) {
    const entornoPct = Math.round((entornoCount / selected.length) * 100);
    strategyParts.push(`Análise de entorno: ${entornoCount} de ${totals.quantidade} pontos (${entornoPct}%) com afinidade confirmada para ${segmentLabel}${topEntornoPoint ? ` — destaque: ${topEntornoPoint.nome} (afinidade ${topEntornoPoint.score.toFixed(0)}/100)` : ''} (categorias-alvo mapeadas via OpenStreetMap Overpass API).`);
  }

  /* ────── 3. ARGUMENTAÇÃO COMERCIAL ────── */

  const bullets = [];

  // Audience quality — real percentage
  if (publicoMatchPct > 0) {
    bullets.push(`${publicoMatchPct}% dos pontos com público ${publicoLabel} aderente ao target — ${matchedPublico.length} de ${selected.length} pontos.`);
  }

  // Frequency — concrete number + model source
  if (freq > 0) {
    bullets.push(`Frequência média: ${fmtDec(freq, 2)}×/pessoa em ${periodWeeks} semanas (${fmt(grps)} GRPs). Estimativa via modelo de reach DOOH indoor.`);
  }

  // CPM + investment — full breakdown
  if (cpm > 0) {
    bullets.push(`CPM: ${fmtMoney(cpm)} · investimento: ${fmtMoney(totals.valorTotal)}/mês · ${fmt(totals.fluxoTotal)} impactos mensais · ticket médio/ponto: ${fmtMoney(totals.ticketMedio || (totals.valorTotal / totals.quantidade))}.`);
  }

  // Capillarity — concrete format counts
  if (formatos.length >= 2 || totals.quantidade >= 3) {
    const fmtBreakdown = tiposRanked.map(([t, c]) => `${c}× ${t}`).join(', ');
    bullets.push(`${totals.quantidade} pontos em ${formatos.length} formato${formatos.length > 1 ? 's' : ''}: ${fmtBreakdown}${cidade ? ` em ${cidade}` : ''}.`);
  }

  // Entorno — concrete score + source
  if (entornoCount > 0 && topEntornoPoint) {
    bullets.push(`Afinidade de entorno confirmada em ${entornoCount} ponto${entornoCount > 1 ? 's' : ''}: ${topEntornoPoint.nome} lidera com score ${topEntornoPoint.score.toFixed(0)}/100. Categorias-alvo mapeadas via OpenStreetMap Overpass API (raio 400m).`);
  }

  // Budget usage — real percentage
  if (budget > 0 && budgetUsage > 0) {
    bullets.push(`Uso do orçamento: ${budgetUsage}% (${fmtMoney(totals.valorTotal)} de ${fmtMoney(budget)}). Margem restante: ${fmtMoney(budget - totals.valorTotal)}.`);
  }

  // GeoAudience summary
  if (geoProfilesByPoint) {
    const premiumPoints = selected.filter(pt => {
      const gp = geoProfilesByPoint[pt.id] || geoProfilesByPoint[String(pt.id)];
      return gp && (gp.socioeconomic_level === 'alto' || gp.socioeconomic_level === 'medio-alto');
    });
    if (premiumPoints.length > 0) {
      bullets.push(`${premiumPoints.length} de ${totals.quantidade} pontos em bairros de nível socioeconômico alto ou médio-alto (inferido via concentração de POIs premium — OpenStreetMap).`);
    }
  }

  // Census summary
  if (censusProfilesByPoint) {
    const withCensus = selected.filter(pt => {
      const cp = censusProfilesByPoint[pt.id] || censusProfilesByPoint[String(pt.id)];
      return cp && cp.score_geral > 0;
    });
    if (withCensus.length > 0) {
      const avgScore = Math.round(withCensus.reduce((s, pt) => {
        const cp = censusProfilesByPoint[pt.id] || censusProfilesByPoint[String(pt.id)];
        return s + (cp.score_geral || 0);
      }, 0) / withCensus.length * 100);
      bullets.push(`Score censitário médio: ${avgScore}% nos ${withCensus.length} pontos com dados IBGE (Censo 2022, tabelas 9606/9514/9529).`);
    }
  }

  // Limitation disclaimer
  bullets.push(`Nota: dados de fluxo são declarados pelo inventário — sem medição direta de audiência. Dados de entorno e POIs extraídos via OpenStreetMap (atualização contínua). Dados censitários: IBGE Censo 2022.`);

  /* ────── 4. DESTAQUES DO PLANO ────── */

  const highlights = [];
  if (selected.length > 0) {
    const scored = selected.map((p) => {
      const fluxo = toNumber(p.fluxo);
      const objScore = scorePointByObjective(p, objetivo);
      const entornoMetrics = entornoByPoint
        ? (entornoByPoint[p.id] || entornoByPoint[String(p.id)])
        : null;
      const affinityScore = Number(entornoMetrics?.affinity_score) || Number(entornoMetrics?.score_relevancia) || 0;
      const gp = geoProfilesByPoint ? (geoProfilesByPoint[p.id] || geoProfilesByPoint[String(p.id)]) : null;
      const cp = censusProfilesByPoint ? (censusProfilesByPoint[p.id] || censusProfilesByPoint[String(p.id)]) : null;
      const relevance = objScore + affinityScore * 0.3 + (fluxo / 10000);
      return { ...p, _relevance: relevance, _affinityScore: affinityScore, _geoProfile: gp, _censusProfile: cp };
    }).sort((a, b) => b._relevance - a._relevance);

    // Pre-compute city-level stats for comparatives
    const allFluxos = cityInventory.map(pt => toNumber(pt.fluxo)).filter(f => f > 0);
    const avgCityFluxo = allFluxos.length > 0 ? allFluxos.reduce((a, b) => a + b, 0) / allFluxos.length : 0;
    const allCpms = cityInventory.map(pt => { const f = toNumber(pt.fluxo); return f > 0 ? toNumber(pt.preco) / (f / 1000) : Infinity; }).filter(v => v < Infinity);
    const avgCityCpm = allCpms.length > 0 ? allCpms.reduce((a, b) => a + b, 0) / allCpms.length : 0;

    scored.slice(0, 3).forEach((p, idx) => {
      const fluxo = toNumber(p.fluxo);
      const tipo = p.tipo || 'Ponto';
      const publico = p.publico || '';
      const ptCpm = fluxo > 0 ? toNumber(p.preco) / (fluxo / 1000) : 0;

      const motivoParts = [];

      // [Dado demográfico principal com número + fonte]
      if (p._censusProfile && p._censusProfile.perfis) {
        const perfis = p._censusProfile.perfis;
        const best = [
          ['Alta Renda', perfis.alta_renda],
          ['Massa/Varejo', perfis.massa_varejo],
          ['Jovem/Universitário', perfis.jovem_universitario],
          ['Terceira Idade', perfis.terceira_idade],
        ].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        if (best.length > 0) {
          motivoParts.push(`Perfil censitário ${best[0][0]} ${(best[0][1] * 100).toFixed(0)}% (IBGE Censo 2022, tabelas 9606/9514).`);
        }
      } else if (p._geoProfile && p._geoProfile.socioeconomic_score > 0) {
        motivoParts.push(`Nível socioeconômico ${p._geoProfile.socioeconomic_level} (score ${p._geoProfile.socioeconomic_score}/100, inferido via POIs — OpenStreetMap).`);
      }

      // [Dado de POIs/entorno com distância + fonte]
      if (p._geoProfile && p._geoProfile.total_pois > 0) {
        const poiSummary = p._geoProfile.poi_summary || {};
        const topCats = Object.entries(poiSummary).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
        const catLabels = {
          corporate: 'escritórios', commercial: 'comércio', food: 'alimentação',
          health: 'saúde', education: 'educação', leisure: 'lazer', fitness: 'fitness',
          transport: 'transporte', residential: 'residencial', beauty: 'estética',
          hospitality: 'hotelaria', religious: 'religioso', green: 'áreas verdes'
        };
        const catText = topCats.map(([cat, count]) => `${count} ${catLabels[cat] || cat}`).join(', ');
        motivoParts.push(`Raio 400m: ${p._geoProfile.total_pois} POIs${catText ? ` (${catText})` : ''} · ${p._geoProfile.neighborhood_label || p._geoProfile.neighborhood_type} (OpenStreetMap).`);
      } else if (p._affinityScore > 0) {
        motivoParts.push(`Score de afinidade com ${segmentLabel}: ${p._affinityScore.toFixed(0)}/100 (categorias-alvo no raio — OpenStreetMap Overpass API).`);
      }

      // [Comparativo com outros pontos ou média da cidade]
      const comparatives = [];
      if (fluxo > 0 && avgCityFluxo > 0) {
        const fluxoPct = Math.round(((fluxo - avgCityFluxo) / avgCityFluxo) * 100);
        if (fluxoPct > 10) {
          comparatives.push(`fluxo ${fluxoPct}% acima da média da praça (${fmt(fluxo)} vs ${fmt(avgCityFluxo)})`);
        } else if (fluxoPct < -10) {
          comparatives.push(`fluxo ${Math.abs(fluxoPct)}% abaixo da média, compensado por qualidade de contexto`);
        }
      }
      if (ptCpm > 0 && avgCityCpm > 0) {
        const cpmDiff = Math.round(((ptCpm - avgCityCpm) / avgCityCpm) * 100);
        if (cpmDiff <= -15) {
          comparatives.push(`CPM R$ ${ptCpm.toFixed(2)} — ${Math.abs(cpmDiff)}% abaixo da média (R$ ${avgCityCpm.toFixed(2)})`);
        }
      }
      // Rank among top 3 label
      if (idx === 0) {
        comparatives.push(`maior relevância entre os ${selected.length} pontos do plano`);
      }
      if (comparatives.length > 0) {
        motivoParts.push(comparatives.join('; ') + '.');
      }

      // [Limitação ou ressalva, se houver]
      if (!p._geoProfile && !p._censusProfile) {
        motivoParts.push('Sem dados de entorno georreferenciados — justificativa baseada em atributos cadastrais.');
      }

      // Fallback if no enrichment at all
      if (motivoParts.length === 0) {
        motivoParts.push(`${fmt(fluxo)} imp/mês (${tipo}), público ${publico || 'N/D'}, ${fmtMoney(toNumber(p.preco))}/mês. Dados de entorno não disponíveis para este ponto.`);
      }

      highlights.push({
        nome: p.nome || 'Ponto sem nome',
        tipo,
        fluxo: fmt(fluxo),
        motivo: motivoParts.join(' ')
      });
    });
  }

  return {
    qualidadeSelecao: qualityParts.join(' '),
    justificativaEstrategica: strategyParts.join(' '),
    argumentacaoComercial: bullets,
    destaquesPlano: highlights
  };
}

/* ──────────────────────────────────────────────────────────
   RANKING ENGINE — 0-100 per-point compatibility scoring
   ────────────────────────────────────────────────────────── */

const DEFAULT_WEIGHTS = {
  objetivo: 20,
  publico: 16,
  eficiencia: 12,
  entorno: 11,
  geoaudience: 10,
  censusProfile: 10,
  segmento: 8,
  formato: 8,
  disponibilidade: 5
};

/**
 * Score and rank ALL points in inventory.
 * Returns array sorted by compatibilidade DESC, each with 0-100 score + breakdown.
 */
export function rankPointsWithScore({
  pontos = [],
  cidade,
  publico,
  audienceTags = [],
  objetivo,
  segmento,
  entornoByPoint = null,
  geoProfilesByPoint = null,
  censusProfilesByPoint = null,
  availabilityPreference = 'all',
  budget = 0,
  weights = DEFAULT_WEIGHTS
}) {
  const cidadeNormalizada = normalizeFilterValue(cidade, 'Todas');

  // Filter by city (hard filter — only score points in target geography)
  const filtered = pontos.filter((p) => matchesAnySelection(p.cidade, cidadeNormalizada));
  if (!filtered.length) return [];

  const publicoNormalizado = normalizeFilterValue(publico, 'Todos');
  const prices = filtered.map((p) => Math.max(0, toNumber(p.preco))).sort((a, b) => a - b);
  const medianPrice = prices[Math.floor(prices.length / 2)] || 1;
  const fluxos = filtered.map((p) => toNumber(p.fluxo)).sort((a, b) => a - b);
  const maxFluxo = fluxos[fluxos.length - 1] || 1;

  // Compute raw scores for each dimension, then normalize to 0-100 per dimension
  const rawScores = filtered.map((p) => {
    const objRaw = scorePointByObjective(p, objetivo);
    const pubRaw = scorePublicoAffinity(p, publicoNormalizado) + scoreAudienceTagAffinity(p, audienceTags);
    const effRaw = scoreCostEfficiency(p);
    const entRaw = scoreSegmentEnvironment(p, entornoByPoint);
    const geoRaw = scoreGeoAudienceAffinity(p, { segmento, publico: publicoNormalizado, geoProfilesByPoint });
    const segRaw = scoreSegmentAffinity(p, segmento);
    const fmtRaw = getObjectiveFormatBoost(p.tipo, objetivo);
    const availRaw = scoreAvailabilityFit(p, availabilityPreference);
    const censusRaw = scoreCensusProfileAffinity(p, { publico: publicoNormalizado, audienceTags, censusProfilesByPoint });

    return { point: p, objRaw, pubRaw, effRaw, entRaw, geoRaw, segRaw, fmtRaw, availRaw, censusRaw };
  });

  // Find max of each dimension for normalization
  const maxObj = Math.max(1, ...rawScores.map((r) => r.objRaw));
  const maxPub = Math.max(1, ...rawScores.map((r) => r.pubRaw));
  const maxEff = Math.max(1, ...rawScores.map((r) => r.effRaw));
  const maxEnt = Math.max(1, ...rawScores.map((r) => r.entRaw));
  const maxGeo = Math.max(1, ...rawScores.map((r) => r.geoRaw));
  const maxSeg = Math.max(1, ...rawScores.map((r) => r.segRaw));
  const maxFmt = Math.max(1, ...rawScores.map((r) => r.fmtRaw));
  const maxAvail = Math.max(1, ...rawScores.map((r) => r.availRaw));
  const maxCensus = Math.max(1, ...rawScores.map((r) => r.censusRaw));

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 100;

  return rawScores.map((r) => {
    // Normalize each dimension to 0-100, clamped
    const dims = {
      objetivo: Math.max(0, Math.min(100, (r.objRaw / maxObj) * 100)),
      publico: Math.max(0, Math.min(100, (r.pubRaw / maxPub) * 100)),
      eficiencia: Math.max(0, Math.min(100, (r.effRaw / maxEff) * 100)),
      entorno: Math.max(0, Math.min(100, (r.entRaw / maxEnt) * 100)),
      geoaudience: Math.max(0, Math.min(100, (r.geoRaw / maxGeo) * 100)),
      segmento: Math.max(0, Math.min(100, (r.segRaw / maxSeg) * 100)),
      formato: Math.max(0, Math.min(100, (r.fmtRaw / maxFmt) * 100)),
      disponibilidade: Math.max(0, Math.min(100, (r.availRaw / maxAvail) * 100)),
      censusProfile: Math.max(0, Math.min(100, (r.censusRaw / maxCensus) * 100))
    };

    // Weighted average → 0-100 final score
    const compatibilidade = Math.round(
      Object.entries(dims).reduce((sum, [key, val]) => {
        return sum + (val * ((weights[key] || 0) / totalWeight));
      }, 0)
    );

    const p = r.point;
    const fluxo = toNumber(p.fluxo);

    // Attach geoaudience profile if available
    const geoProfile = geoProfilesByPoint?.[p.id] || geoProfilesByPoint?.[String(p.id)] || null;

    // Attach census audience profile if available
    const censusProfile = censusProfilesByPoint?.[p.id] || censusProfilesByPoint?.[String(p.id)] || null;

    // ── JUSTIFICATIVA OBRIGATÓRIA (dados reais, fontes, comparativos) ──
    const _fmt = (n) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
    const cpmVal = fluxo > 0 ? toNumber(p.preco) / (fluxo / 1000) : 0;

    // Rank position among all city points (1-based)
    // (will be set after sorting, so use dims for comparative context)
    const totalCityPoints = filtered.length;

    // ── Piece 1: Dado demográfico principal com número + fonte ──
    let pieceDemografico = '';
    if (censusProfile && censusProfile.perfis) {
      const perfis = censusProfile.perfis;
      const dominante = censusProfile.perfil_dominante;
      const scoreGeral = censusProfile.score_geral;

      // Best profile score
      const perfilEntries = [
        ['alta_renda', perfis.alta_renda, 'Alta Renda'],
        ['massa_varejo', perfis.massa_varejo, 'Massa/Varejo'],
        ['jovem_universitario', perfis.jovem_universitario, 'Jovem/Universitário'],
        ['terceira_idade', perfis.terceira_idade, 'Terceira Idade'],
      ].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

      if (perfilEntries.length > 0) {
        const [, topScore, topLabel] = perfilEntries[0];
        pieceDemografico = `Perfil ${topLabel} ${(topScore * 100).toFixed(0)}%`;
      }

      // Enrich with specific IBGE data if available via demographic_data on geoProfile
      if (geoProfile?.demographic_data) {
        const demo = geoProfile.demographic_data;
        if (demo.pibPerCapita > 0) {
          pieceDemografico += ` · PIB/capita R$ ${_fmt(demo.pibPerCapita)} (IBGE, tabela 5938, ref. 2021)`;
        }
      }

      // If no specific IBGE data but we have census score
      if (!pieceDemografico && scoreGeral > 0) {
        pieceDemografico = `Score censo ${(scoreGeral * 100).toFixed(0)}% (IBGE Censo 2022)`;
      }
    }

    // Fallback to geoProfile socioeconomic if no census
    if (!pieceDemografico && geoProfile) {
      if (geoProfile.socioeconomic_score > 0) {
        pieceDemografico = `Nível socioeconômico ${geoProfile.socioeconomic_level} (score ${geoProfile.socioeconomic_score}/100, inferido via POIs — OpenStreetMap)`;
      }
    }

    // ── Piece 2: Dado de POIs/entorno com distância + fonte ──
    let pieceEntorno = '';
    if (geoProfile && geoProfile.total_pois > 0) {
      const poiSummary = geoProfile.poi_summary || {};
      // Pick top 2 POI categories by count
      const topCats = Object.entries(poiSummary)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);

      const catLabels = {
        corporate: 'escritórios/corporativo', commercial: 'comércio', food: 'alimentação',
        health: 'saúde', education: 'educação', leisure: 'lazer', fitness: 'fitness',
        transport: 'transporte', residential: 'residencial', beauty: 'estética',
        hospitality: 'hotelaria', religious: 'religioso', green: 'áreas verdes'
      };

      if (topCats.length > 0) {
        const parts = topCats.map(([cat, count]) => `${count} ${catLabels[cat] || cat}`);
        pieceEntorno = `Raio 400m: ${geoProfile.total_pois} POIs (${parts.join(', ')}) · ${geoProfile.neighborhood_label || geoProfile.neighborhood_type} (OpenStreetMap)`;
        if (geoProfile.pois_per_km2 > 0) {
          pieceEntorno += ` · ${_fmt(geoProfile.pois_per_km2)} POIs/km²`;
        }
      } else {
        pieceEntorno = `Raio 400m: ${geoProfile.total_pois} POIs · ${geoProfile.neighborhood_label || 'ambiente urbano'} (OpenStreetMap)`;
      }
    } else if (p.endereco) {
      pieceEntorno = p.endereco.length > 60 ? p.endereco.slice(0, 57) + '...' : p.endereco;
    }

    // ── Piece 3: Comparativo com outros pontos ──
    let pieceComparativo = '';
    {
      // CPM comparison
      const allCpms = filtered
        .map(pt => { const f = toNumber(pt.fluxo); return f > 0 ? toNumber(pt.preco) / (f / 1000) : Infinity; })
        .filter(v => v < Infinity)
        .sort((a, b) => a - b);
      const medianCpm = allCpms.length > 0 ? allCpms[Math.floor(allCpms.length / 2)] : 0;

      if (cpmVal > 0 && medianCpm > 0) {
        const pctVsMedian = Math.round(((cpmVal - medianCpm) / medianCpm) * 100);
        if (pctVsMedian <= -20) {
          pieceComparativo = `CPM R$ ${cpmVal.toFixed(2)} — ${Math.abs(pctVsMedian)}% abaixo da mediana (R$ ${medianCpm.toFixed(2)}) entre ${totalCityPoints} pontos`;
        } else if (pctVsMedian >= 20) {
          pieceComparativo = `CPM R$ ${cpmVal.toFixed(2)} — ${pctVsMedian}% acima da mediana, priorizando qualidade de contexto`;
        } else {
          pieceComparativo = `CPM R$ ${cpmVal.toFixed(2)} — alinhado à mediana da praça (R$ ${medianCpm.toFixed(2)}, ${totalCityPoints} pontos)`;
        }
      } else if (fluxo > 0) {
        // Fluxo comparison
        const fluxoPercentile = filtered.filter(pt => toNumber(pt.fluxo) <= fluxo).length;
        const pctile = Math.round((fluxoPercentile / totalCityPoints) * 100);
        pieceComparativo = `${_fmt(fluxo)} imp/mês — percentil ${pctile} entre ${totalCityPoints} pontos da praça`;
      }

      // Score comparison
      if (compatibilidade >= 80) {
        pieceComparativo += pieceComparativo ? ` · score ${compatibilidade}/100` : `Score ${compatibilidade}/100 entre ${totalCityPoints} pontos avaliados`;
      }
    }

    // ── Piece 4: Limitação ou ressalva ──
    let pieceLimitacao = '';
    if (!geoProfile && !censusProfile) {
      pieceLimitacao = 'Sem dados de entorno georreferenciados — justificativa baseada em atributos cadastrais do ponto.';
    } else if (geoProfile && (!geoProfile.poi_summary || geoProfile.total_pois < 5)) {
      pieceLimitacao = 'Poucos POIs mapeados no raio — densidade de dados limitada.';
    }

    // ── Montagem do motivoPrincipal (resumo compacto para card) ──
    const motivoParts = [
      pieceDemografico,
      pieceEntorno,
      pieceComparativo,
    ].filter(Boolean);
    const motivoPrincipal = motivoParts.length > 0
      ? motivoParts.join(' · ')
      : `${_fmt(fluxo)} imp/mês (${p.tipo || 'N/D'}) · ${p.endereco || p.cidade || 'localização não especificada'}`;

    // ── justificativaCompleta (objeto estruturado para exibição expandida) ──
    const justificativaCompleta = {
      demografico: pieceDemografico || null,
      entorno: pieceEntorno || null,
      comparativo: pieceComparativo || null,
      limitacao: pieceLimitacao || null,
    };

    // Estimated monthly reach for this single point
    const estimatedReach = Math.round(fluxo * 0.38);

    return {
      ...p,
      compatibilidade,
      dimensoes: dims,
      motivoPrincipal,
      justificativaCompleta,
      estimatedReach,
      estimatedInvestment: toNumber(p.preco),
      cpmPonto: fluxo > 0 ? toNumber(p.preco) / (fluxo / 1000) : 0,
      geoProfile,
      censusProfile
    };
  }).sort((a, b) => b.compatibilidade - a.compatibilidade);
}

export { DEFAULT_WEIGHTS as RECOMMENDATION_WEIGHTS };

// ---------------------------------------------------------------------------
// ScreenScore — 0-100 composite quality metric per DOOH point
// ---------------------------------------------------------------------------

const SCREEN_SCORE_WEIGHTS = {
  fluxo: 25,
  eficiencia: 20,
  entorno: 15,
  geoaudience: 15,
  census: 10,
  formato: 10,
  cobertura: 5
};

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * Compute a 0-100 ScreenScore for a single DOOH point.
 * Aggregates traffic, cost-efficiency, entorno, geo-audience neighourhood,
 * census demographic, format quality and coverage signals.
 *
 * @param {object} point — ponto row (id, fluxo, preco, insercoes, tipo, publico, ...)
 * @param {object} opts
 * @param {object|null} opts.geoProfile — geo_audience_profiles row for this point
 * @param {object|null} opts.censusProfile — census_audience_profiles row for this point
 * @param {object|null} opts.entornoMetrics — entorno_cache metrics for this point
 * @param {number}      opts.maxFluxo — max fluxo across inventory (for normalisation)
 * @param {number}      opts.medianPrice — median price across inventory
 * @returns {{ score: number, breakdown: Record<string, number>, grade: string }}
 */
export function computeScreenScore(point, {
  geoProfile = null,
  censusProfile = null,
  entornoMetrics = null,
  maxFluxo = 1,
  medianPrice = 1
} = {}) {
  const fluxo = toNumber(point.fluxo);
  const preco = Math.max(1, toNumber(point.preco));
  const insercoes = toNumber(point.insercoes);
  const tipo = String(point.tipo || '').toLowerCase();

  // ── Dimension 1: Traffic volume (0-1)
  const dimFluxo = clamp01(fluxo / Math.max(maxFluxo, 1));

  // ── Dimension 2: Cost-efficiency (0-1)
  const cpm = fluxo > 0 ? preco / (fluxo / 1000) : 999;
  const cpmNorm = clamp01(1 - (cpm / 80)); // CPM < 80 = good
  const insercoesPerReal = insercoes / preco;
  const insNorm = clamp01(insercoesPerReal / 200);
  const dimEficiencia = cpmNorm * 0.65 + insNorm * 0.35;

  // ── Dimension 3: Entorno / POI affinity (0-1)
  let dimEntorno = 0;
  if (entornoMetrics) {
    const affinity = Number(entornoMetrics.affinity_score) || Number(entornoMetrics.score_relevancia) || 0;
    dimEntorno = clamp01(affinity / 100);
  }

  // ── Dimension 4: GeoAudience neighbourhood quality (0-1)
  let dimGeo = 0;
  if (geoProfile && geoProfile.neighborhood_type !== 'indefinido') {
    const conf = clamp01((geoProfile.confidence || 0) / 100);
    const socio = clamp01((geoProfile.socioeconomic_score || 0) / 100);
    const density = { 'muito alta': 1, alta: 0.8, media: 0.55, baixa: 0.3, 'muito baixa': 0.1 };
    const densNorm = density[geoProfile.urban_density] || 0.3;
    const poisNorm = clamp01((geoProfile.total_pois || 0) / 80);
    dimGeo = conf * 0.3 + socio * 0.3 + densNorm * 0.2 + poisNorm * 0.2;
  }

  // ── Dimension 5: Census demographic (0-1)
  let dimCensus = 0;
  if (censusProfile && censusProfile.perfis) {
    const perfis = censusProfile.perfis;
    const maxPerfil = Math.max(
      perfis.alta_renda || 0,
      perfis.massa_varejo || 0,
      perfis.jovem_universitario || 0,
      perfis.terceira_idade || 0
    );
    const scoreGeral = censusProfile.score_geral || 0;
    dimCensus = clamp01(maxPerfil * 0.6 + scoreGeral * 0.4);
  }

  // ── Dimension 6: Format quality (0-1)
  let dimFormato = 0.4; // default baseline
  if (tipo.includes('elevador'))  dimFormato = 0.85;
  else if (tipo.includes('painel led')) dimFormato = 0.90;
  else if (tipo.includes('indoor') || tipo.includes('video wall')) dimFormato = 0.75;
  else if (tipo.includes('frontlight') || tipo.includes('backlight')) dimFormato = 0.80;
  else if (tipo.includes('totem')) dimFormato = 0.60;

  // ── Dimension 7: Coverage / price positioning (0-1)
  const priceFactor = medianPrice > 0 ? preco / medianPrice : 1;
  const dimCobertura = clamp01(1.2 - priceFactor * 0.4); // cheaper = better coverage potential

  // Weighted average → 0-100
  const w = SCREEN_SCORE_WEIGHTS;
  const totalW = Object.values(w).reduce((s, v) => s + v, 0);
  const raw = (
    dimFluxo * w.fluxo +
    dimEficiencia * w.eficiencia +
    dimEntorno * w.entorno +
    dimGeo * w.geoaudience +
    dimCensus * w.census +
    dimFormato * w.formato +
    dimCobertura * w.cobertura
  ) / totalW;

  const score = Math.round(raw * 100);

  const breakdown = {
    fluxo: Math.round(dimFluxo * 100),
    eficiencia: Math.round(dimEficiencia * 100),
    entorno: Math.round(dimEntorno * 100),
    geoaudience: Math.round(dimGeo * 100),
    census: Math.round(dimCensus * 100),
    formato: Math.round(dimFormato * 100),
    cobertura: Math.round(dimCobertura * 100)
  };

  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';

  return { score, breakdown, grade };
}

export { SCREEN_SCORE_WEIGHTS };
