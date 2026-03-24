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

export function suggestIdealPlan({
  pontos = [],
  cidade,
  publico,
  objetivo,
  investimentoMensal = 0
}) {
  const budget = Math.max(0, toNumber(investimentoMensal));

  const base = pontos
    .filter((p) => !cidade || p.cidade === cidade)
    .filter((p) => !publico || p.publico === publico)
    .map((p) => ({ ...p, _score: scorePointByObjective(p, objetivo) }))
    .sort((a, b) => b._score - a._score);

  const selected = [];
  let running = 0;

  for (const point of base) {
    const preco = toNumber(point.preco);
    const shouldPick = budget <= 0 ? selected.length < 6 : running + preco <= budget || selected.length < 3;
    if (shouldPick) {
      selected.push(point);
      running += preco;
    }
    if (selected.length >= 10) break;
  }

  if (selected.length === 0 && base.length > 0) {
    selected.push(base[0]);
    running = toNumber(base[0].preco);
  }

  const totals = campaignTotals(selected);

  let justificativa = 'Plano equilibrado com foco em frequencia e alcance.';
  if (objetivo === 'presenca premium') {
    justificativa = 'Combinacao orientada para autoridade de marca, privilegiando ambientes premium e recorrentes.';
  } else if (objetivo === 'reconhecimento de marca') {
    justificativa = 'Plano focado em volume de impactos para ampliar lembranca da marca na praca.';
  } else if (objetivo === 'cobertura regional') {
    justificativa = 'Distribuicao multiformato para aumentar capilaridade e presenca regional.';
  } else if (objetivo === 'proximidade da decisao de compra') {
    justificativa = 'Selecao de pontos com alta intencao e proximidade de conversao no momento de compra.';
  }

  return {
    pontos: selected,
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
