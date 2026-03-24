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
  const custoPorPonto = quantidade > 0 ? totals.valorTotal / quantidade : 0;
  const mediaFluxoPorPonto = quantidade > 0 ? totals.fluxoTotal / quantidade : 0;

  return {
    ...totals,
    quantidade,
    cpmEstimado,
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
  let mensagem = 'Base inicial montada. Inclua mais pontos para elevar cobertura e frequencia.';

  if (coveragePct >= 50 || presencePct >= 55) {
    nivel = 'Dominio regional';
    mensagem = 'Plano forte com alta cobertura e presenca recorrente na praca.';
  } else if (coveragePct >= 25 || presencePct >= 30) {
    nivel = 'Estrategico';
    mensagem = 'Boa cobertura em areas-chave. Com poucos pontos adicionais, chega ao dominio regional.';
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
  if (!value) return '';
  const v = String(value).trim();
  if (!v) return '';
  if (v.toLowerCase() === String(allLabel).toLowerCase()) return '';
  return v;
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
  if (!publicoDesejado) return 0;
  const target = String(publicoDesejado).toUpperCase();
  const pointPublico = String(point.publico || '').toUpperCase();

  if (!pointPublico) return -2;
  if (pointPublico === target) return 16;

  const targetParts = target.split('/').map((p) => p.trim()).filter(Boolean);
  const pointParts = pointPublico.split('/').map((p) => p.trim()).filter(Boolean);
  const overlap = targetParts.filter((part) => pointParts.includes(part)).length;
  if (overlap > 0) return 8 + overlap * 3;
  if (pointPublico.includes(target) || target.includes(pointPublico)) return 8;

  return -5;
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

function buildCandidate(point, { objetivo, publico, segmento, medianPrice, maxPrice }) {
  const preco = Math.max(0, toNumber(point.preco));
  const objectiveScore = scorePointByObjective(point, objetivo);
  const efficiencyScore = scoreCostEfficiency(point);
  const publicoScore = scorePublicoAffinity(point, publico);
  const segmentoScore = scoreSegmentAffinity(point, segmento);
  const formatBoost = getObjectiveFormatBoost(point.tipo, objetivo);
  const premiumPenalty = preco > medianPrice * 2.4 ? -8 : 0;
  const hugePenalty = maxPrice > 0 && preco > maxPrice * 0.85 ? -4 : 0;

  return {
    ...point,
    _preco: preco,
    _baseScore:
      objectiveScore * 1.25 +
      efficiencyScore * 0.9 +
      publicoScore +
      segmentoScore +
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
  objetivo,
  segmento,
  investimentoMensal = 0
}) {
  const budget = Math.max(0, toNumber(investimentoMensal));
  const cidadeNormalizada = normalizeFilterValue(cidade, 'Todas');
  const publicoNormalizado = normalizeFilterValue(publico, 'Todos');

  const filtered = pontos
    .filter((p) => !cidadeNormalizada || p.cidade === cidadeNormalizada)
    .filter((p) => !publicoNormalizado || String(p.publico || '').toUpperCase().includes(publicoNormalizado.toUpperCase()));

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
      maxPrice
    }))
    .sort((a, b) => b._baseScore - a._baseScore);

  const targetCount = budget > 0
    ? Math.min(14, Math.max(4, Math.round(budget / Math.max(medianPrice || 1, 900))))
    : 7;

  const selected = [];
  let spend = 0;
  const used = new Set();

  // Seed phase: guarantee at least one strong candidate per key format.
  for (const candidate of candidates) {
    if (selected.length >= Math.min(3, targetCount)) break;
    if (used.has(candidate.id)) continue;

    const formatoJaExiste = selected.some((p) => p.tipo === candidate.tipo);
    if (formatoJaExiste && selected.length > 0) continue;

    if (budget > 0 && spend + candidate._preco > budget * 1.06 && selected.length > 0) continue;

    selected.push(candidate);
    used.add(candidate.id);
    spend += candidate._preco;
  }

  // Iterative improvement: choose point with highest marginal gain each round.
  while (selected.length < targetCount) {
    let best = null;
    let bestGain = -Infinity;

    for (const candidate of candidates) {
      if (used.has(candidate.id)) continue;

      const gain = marginalGain(candidate, selected, budget, spend, objetivo);
      if (gain > bestGain) {
        bestGain = gain;
        best = candidate;
      }
    }

    if (!best) break;

    const projectedSpend = spend + best._preco;
    const allowOverBudget = budget > 0 && selected.length < 3 && projectedSpend <= budget * 1.12;
    const withinBudget = budget <= 0 || projectedSpend <= budget;

    if (!withinBudget && !allowOverBudget) {
      const hasAnyAffordable = candidates.some((c) => !used.has(c.id) && (budget <= 0 || spend + c._preco <= budget));
      if (!hasAnyAffordable) break;
      used.add(best.id);
      continue;
    }

    if (bestGain < 8 && selected.length >= Math.max(4, Math.floor(targetCount * 0.7))) {
      break;
    }

    selected.push(best);
    used.add(best.id);
    spend = projectedSpend;
  }

  if (!selected.length && candidates.length) {
    selected.push(candidates[0]);
    spend = candidates[0]._preco;
  }

  const cleaned = selected.map(({ _baseScore, _preco, ...point }) => point);
  const totals = campaignTotals(cleaned);
  const formatos = new Set(cleaned.map((p) => p.tipo).filter(Boolean)).size;
  const orcamentoUsoPct = budget > 0 ? Math.round((totals.valorTotal / budget) * 100) : null;

  let foco = 'equilibrio entre frequencia, eficiencia de custo e cobertura.';
  if (objetivo === 'presenca premium') {
    foco = 'ambientes premium com alta recorrencia para elevar percepcao de marca.';
  } else if (objetivo === 'reconhecimento de marca') {
    foco = 'volume de impacto e repeticao para acelerar lembranca.';
  } else if (objetivo === 'cobertura regional') {
    foco = 'capilaridade de formatos e distribuicao por praca.';
  } else if (objetivo === 'proximidade da decisao de compra') {
    foco = 'pontos proximos de decisao com maior propensao de conversao.';
  } else if (objetivo === 'lembranca continua') {
    foco = 'continuidade de exposicao com bom ritmo de insercoes.';
  }

  const justificativa = [
    `Plano recomendado com ${totals.quantidade} ponto${totals.quantidade > 1 ? 's' : ''} e ${formatos} formato${formatos > 1 ? 's' : ''}, priorizando ${foco}`,
    `Fluxo potencial de ${new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)} impactos/mensais e CPM estimado em R$ ${totals.cpmEstimado.toFixed(2)}.`,
    budget > 0
      ? `Uso de orçamento em ${orcamentoUsoPct}% (R$ ${new Intl.NumberFormat('pt-BR').format(totals.valorTotal)} de R$ ${new Intl.NumberFormat('pt-BR').format(budget)}), com seleção por ganho marginal para evitar pontos redundantes.`
      : 'Sem limite de orçamento informado, o motor priorizou eficiência e diversidade para um plano-base robusto.'
  ].join(' ');

  return {
    pontos: cleaned,
    totals,
    justificativa
  };
}

export function calculateCampaignScore({ selected = [], objective, desiredPublico, cityInventory = [] }) {
  if (selected.length === 0) {
    return {
      score: 0,
      explanation: 'Score 0,0: selecione pontos para iniciar a avaliacao da campanha.'
    };
  }

  const totals = campaignTotals(selected);
  const coverage = calculateCoverageLevel(selected, cityInventory);

  const formats = new Set(selected.map((p) => p.tipo).filter(Boolean)).size;
  const publicoMatches = selected.filter((p) => !desiredPublico || p.publico === desiredPublico).length;
  const objectiveBoost = selected.filter((p) => scorePointByObjective(p, objective) > 45).length;

  const scoreRaw =
    Math.min(2.2, formats / 3) +
    Math.min(2.4, totals.fluxoTotal / 700000) +
    Math.min(2.0, coverage.coveragePct / 25) +
    Math.min(1.8, coverage.presencePct / 28) +
    Math.min(1.6, publicoMatches / Math.max(1, selected.length) * 1.6) +
    Math.min(1.4, objectiveBoost / Math.max(1, selected.length) * 1.4);

  const score = Math.min(10, Number(scoreRaw.toFixed(1)));

  let explanation = `Score ${score.toFixed(1)}: campanha com boa base de frequencia e cobertura.`;
  if (score >= 8.5) {
    explanation = `Score ${score.toFixed(1)}: campanha forte em impacto e presenca premium, com perfil comercial robusto.`;
  } else if (score >= 7) {
    explanation = `Score ${score.toFixed(1)}: plano consistente, com oportunidade de ampliar cobertura para dominio regional.`;
  } else if (score >= 5) {
    explanation = `Score ${score.toFixed(1)}: campanha funcional, mas ainda com espaco para reforcar formatos e capilaridade.`;
  }

  return { score, explanation };
}

export function generateCommercialArguments({ selected = [], city, publico, objetivo, segmento }) {
  if (!selected.length) {
    return ['Selecione pontos para gerar argumentacao comercial automatica.'];
  }

  const totals = campaignTotals(selected);
  const formatos = Array.from(new Set(selected.map((p) => p.tipo).filter(Boolean))).slice(0, 3);
  const focoPublico = publico || 'publicos estrategicos da praca';

  return [
    `A combinacao selecionada em ${city || 'multiplas pracas'} reforca presenca em ambientes de alta recorrencia e atencao qualificada.`,
    `Com ${totals.quantidade} pontos e fluxo estimado de ${new Intl.NumberFormat('pt-BR').format(totals.fluxoTotal)} impactos/mensais, o plano equilibra alcance e frequencia.`,
    `A estrategia privilegia ${formatos.join(', ') || 'formatos complementares'}, favorecendo ${objetivo || 'lembranca continua'} para o segmento ${segmento || 'anunciante'}.`,
    `O recorte de publico (${focoPublico}) aumenta aderencia comercial e potencial de conversao no territorio de interesse.`
  ];
}
