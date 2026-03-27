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
  const categories = Array.isArray(metrics?.categorias_encontradas) ? metrics.categorias_encontradas : [];
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
      summary: 'Não há locais aderentes em cache para destacar neste ponto agora.',
      places: [],
      categories: []
    };
  }

  return {
    headline: `${total} locais aderentes ao segmento ${segmentLabel} no raio analisado.`,
    summary: `Score de relevância ${score.toFixed(1).replace('.', ',')} com ${categories.length} categoria${categories.length === 1 ? '' : 's'} relacionada${categories.length === 1 ? '' : 's'} ao redor do ponto.`,
    places: nearestPlaces,
    categories
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
  const categories = Array.isArray(metrics.categorias_encontradas)
    ? metrics.categorias_encontradas.length
    : 0;

  return Math.min(48, score * 0.62 + total * 1.35 + categories * 2.8);
}

function buildCandidate(point, {
  objetivo,
  publico,
  segmento,
  medianPrice,
  maxPrice,
  entornoByPoint,
  audienceTags,
  availabilityPreference
}) {
  const preco = Math.max(0, toNumber(point.preco));
  const objectiveScore = scorePointByObjective(point, objetivo);
  const efficiencyScore = scoreCostEfficiency(point);
  const publicoScore = scorePublicoAffinity(point, publico);
  const audienceTagScore = scoreAudienceTagAffinity(point, audienceTags);
  const availabilityScore = scoreAvailabilityFit(point, availabilityPreference);
  const segmentoScore = scoreSegmentAffinity(point, segmento);
  const entornoScore = scoreSegmentEnvironment(point, entornoByPoint);
  const formatBoost = getObjectiveFormatBoost(point.tipo, objetivo);
  const premiumPenalty = preco > medianPrice * 2.4 ? -8 : 0;
  const hugePenalty = maxPrice > 0 && preco > maxPrice * 0.85 ? -4 : 0;

  return {
    ...point,
    _preco: preco,
    _entornoScore: entornoScore,
    _baseScore:
      objectiveScore * 1.25 +
      efficiencyScore * 0.9 +
      publicoScore +
      audienceTagScore +
      availabilityScore +
      segmentoScore +
      entornoScore +
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

  const candidates = filtered
    .map((point) => buildCandidate(point, {
      objetivo,
      publico: publicoNormalizado,
      segmento,
      medianPrice,
      maxPrice,
      entornoByPoint,
      audienceTags,
      availabilityPreference
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
      ? `${withEntorno} ponto${withEntorno > 1 ? 's' : ''} recebeu ganho de aderência por entorno relevante ao segmento selecionado.`
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
