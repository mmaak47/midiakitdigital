import { jsPDF } from 'jspdf';

function formatInt(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function slugify(value) {
  return (value || 'praca')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickImageUrl(ponto) {
  if (Array.isArray(ponto?.imagens) && ponto.imagens.length > 0) {
    const first = ponto.imagens[0];
    if (typeof first === 'string') return first;
    if (first?.url) return first.url;
  }
  return ponto?.imagem || '';
}

async function imageToDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addCoverPage(doc, praca, pontos, resumo) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.setFillColor(4, 4, 4);
  doc.rect(0, 0, w, h, 'F');

  doc.setFillColor(20, 20, 20);
  doc.roundedRect(12, 12, w - 24, h - 24, 4, 4, 'F');

  doc.setFillColor(254, 92, 43);
  doc.roundedRect(12, 12, 90, 16, 4, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('MIDIA KIT INTERMIDIA', 18, 22);

  doc.setFontSize(36);
  doc.text(praca.toUpperCase(), 18, 52);

  doc.setFontSize(13);
  doc.setTextColor(210, 210, 210);
  doc.text('Apresentacao padronizada de inventario e oportunidades', 18, 64);

  doc.setDrawColor(254, 92, 43);
  doc.setLineWidth(0.8);
  doc.line(18, 72, 135, 72);

  const cards = [
    { label: 'PONTOS', value: formatInt(pontos.length) },
    { label: 'TELAS', value: formatInt(resumo.telas) },
    { label: 'FLUXO/MES', value: formatInt(resumo.fluxo) },
    { label: 'TICKET MEDIO', value: formatMoney(resumo.ticketMedio) }
  ];

  let x = 18;
  cards.forEach((card) => {
    doc.setFillColor(12, 12, 12);
    doc.setDrawColor(50, 50, 50);
    doc.roundedRect(x, 82, 62, 34, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(card.label, x + 4, 90);

    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(String(card.value), x + 4, 104);
    x += 67;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(130, 130, 130);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 18, h - 18);

  doc.setTextColor(254, 92, 43);
  doc.text('intermidia', w - 46, h - 18);
}

function addSummaryPage(doc, pontos) {
  doc.addPage('a4', 'landscape');

  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.setFillColor(245, 245, 245);
  doc.rect(0, 0, w, h, 'F');

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 170, h, 'F');

  doc.setFillColor(5, 5, 5);
  doc.rect(0, 0, 12, h, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(24);
  doc.text('INVENTARIO GERAL', 20, 22);

  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  doc.text('Resumo por formato e volume de pontos da praca selecionada', 20, 30);

  const byTipo = pontos.reduce((acc, p) => {
    const tipo = p.tipo || 'Sem tipo';
    if (!acc[tipo]) acc[tipo] = { pontos: 0, telas: 0, fluxo: 0, preco: 0 };
    acc[tipo].pontos += 1;
    acc[tipo].telas += Number(p.telas) || 0;
    acc[tipo].fluxo += Number(p.fluxo) || 0;
    acc[tipo].preco += Number(p.preco) || 0;
    return acc;
  }, {});

  const rows = Object.entries(byTipo)
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => b.pontos - a.pontos);

  doc.setFontSize(10);
  doc.setFillColor(8, 8, 8);
  doc.setTextColor(255, 255, 255);
  doc.roundedRect(20, 40, 140, 10, 2, 2, 'F');
  doc.text('Formato', 24, 47);
  doc.text('Pontos', 90, 47);
  doc.text('Telas', 112, 47);
  doc.text('Fluxo', 130, 47);

  let y = 56;
  rows.slice(0, 14).forEach((row, idx) => {
    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 248);
    doc.rect(20, y - 6, 140, 10, 'F');

    doc.setTextColor(30, 30, 30);
    doc.text(String(row.tipo).slice(0, 30), 24, y);
    doc.text(formatInt(row.pontos), 92, y);
    doc.text(formatInt(row.telas), 113, y);
    doc.text(formatInt(row.fluxo), 130, y);
    y += 10;
  });

  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.3);
  doc.line(170, 0, 170, h);

  doc.setTextColor(230, 230, 230);
  doc.setFillColor(10, 10, 10);
  doc.rect(170, 0, w - 170, h, 'F');

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('DIFERENCIAIS', 178, 24);

  const bullets = [
    'Rede premium com presenca em pontos de alto valor.',
    'Planejamento por publico e jornada urbana.',
    'Inventario vivo para campanhas de cobertura regional.',
    'Execucao orientada por desempenho e frequencia.'
  ];

  let by = 40;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  bullets.forEach((item) => {
    doc.setFillColor(254, 92, 43);
    doc.circle(180, by - 1.5, 1.4, 'F');
    doc.setTextColor(220, 220, 220);
    doc.text(item, 185, by);
    by += 12;
  });
}

async function addPointPage(doc, ponto, index, total) {
  doc.addPage('a4', 'landscape');

  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const leftW = 170;

  doc.setFillColor(245, 245, 245);
  doc.rect(0, 0, leftW, h, 'F');

  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 12, h, 'F');

  doc.setFillColor(12, 12, 12);
  doc.rect(leftW, 0, w - leftW, h, 'F');

  const imgData = await imageToDataUrl(pickImageUrl(ponto));
  if (imgData) {
    try {
      doc.addImage(imgData, 'JPEG', leftW, 0, w - leftW, h, undefined, 'FAST');
    } catch {
      try {
        doc.addImage(imgData, 'PNG', leftW, 0, w - leftW, h, undefined, 'FAST');
      } catch {
        doc.setFillColor(30, 30, 30);
        doc.rect(leftW, 0, w - leftW, h, 'F');
      }
    }
  } else {
    doc.setFillColor(30, 30, 30);
    doc.rect(leftW, 0, w - leftW, h, 'F');
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(11);
    doc.text('Imagem indisponivel', leftW + 16, 20);
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(19);
  doc.text((ponto.tipo || 'FORMATO').toUpperCase(), 20, 22);

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.line(20, 26, leftW - 18, 26);

  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text('FICHA TECNICA PADRONIZADA', 20, 33);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(17);
  doc.text((ponto.nome || 'Ponto sem nome').toUpperCase().slice(0, 40), 20, 45);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`${ponto.endereco || 'Endereco nao informado'} - ${ponto.cidade || 'Cidade nao informada'}`, 20, 52);

  const details = [
    ['Publico', ponto.publico || '-'],
    ['Fluxo mes', formatInt(ponto.fluxo)],
    ['Telas', formatInt(ponto.telas)],
    ['Insercoes', formatInt(ponto.insercoes)],
    ['Tempo', ponto.tempo || '-'],
    ['Loop', ponto.loop || '-'],
    ['Veiculacao', ponto.veiculacao || '-'],
    ['Horario', ponto.horario || '-']
  ];

  let y = 66;
  details.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col === 0 ? 20 : 92;
    const yy = y + row * 14;

    doc.setTextColor(110, 110, 110);
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), x, yy);

    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(String(value).slice(0, 26), x, yy + 5);
    doc.setFont('helvetica', 'normal');
  });

  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.25);
  doc.line(20, 130, leftW - 18, 130);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text('INVESTIMENTO MENSAL', 20, 140);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.text(formatMoney(ponto.preco), 20, 150);

  doc.setFillColor(254, 92, 43);
  doc.roundedRect(20, 158, 95, 14, 2.5, 2.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('INTERMIDIA - REDE PREMIUM', 24, 167);

  doc.setTextColor(255, 255, 255);
  doc.setFillColor(5, 5, 5);
  doc.roundedRect(w - 32, h - 16, 26, 10, 2, 2, 'F');
  doc.setFontSize(9);
  doc.text(`${index}/${total}`, w - 24.5, h - 9.4);
}

function buildResumo(pontos) {
  const totals = pontos.reduce((acc, p) => {
    acc.telas += Number(p.telas) || 0;
    acc.fluxo += Number(p.fluxo) || 0;
    acc.preco += Number(p.preco) || 0;
    return acc;
  }, { telas: 0, fluxo: 0, preco: 0 });

  const ticketMedio = pontos.length ? Math.round(totals.preco / pontos.length) : 0;
  return { ...totals, ticketMedio };
}

export async function generateMidiaKitPdf({ praca, pontos }) {
  const cidade = praca && praca !== 'Todas as praças' ? praca : 'Consolidado';
  const kitPontos = Array.isArray(pontos) ? pontos : [];

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const resumo = buildResumo(kitPontos);

  addCoverPage(doc, cidade, kitPontos, resumo);
  addSummaryPage(doc, kitPontos);

  for (let i = 0; i < kitPontos.length; i += 1) {
    await addPointPage(doc, kitPontos[i], i + 1, kitPontos.length);
  }

  const fileName = `midia-kit-${slugify(cidade)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

function normalizeLines(values = []) {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function generateProposalPdf({
  clientName,
  city,
  points,
  totals,
  strategicText,
  simulationSummary
}) {
  const proposalPoints = Array.isArray(points) ? points : [];
  const proposalTotals = totals || { valorTotal: 0, fluxoTotal: 0, cpmEstimado: 0, insercoesTotal: 0 };
  const proposalCity = city || 'Multiplas pracas';
  const proposalClient = clientName || 'Cliente nao informado';

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.setFillColor(7, 9, 12);
  doc.rect(0, 0, w, h, 'F');

  doc.setFillColor(254, 92, 43);
  doc.roundedRect(16, 16, 98, 14, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PROPOSTA COMERCIAL', 21, 25);

  doc.setFontSize(27);
  doc.text('INTERMIDIA', 16, 47);

  doc.setFontSize(11);
  doc.setTextColor(190, 190, 190);
  doc.text(`Cliente: ${proposalClient}`, 16, 60);
  doc.text(`Praca: ${proposalCity}`, 16, 67);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 16, 74);

  const cards = [
    { label: 'Pontos', value: formatInt(proposalPoints.length) },
    { label: 'Fluxo total', value: formatInt(proposalTotals.fluxoTotal) },
    { label: 'Valor total', value: formatMoney(proposalTotals.valorTotal) },
    { label: 'CPM', value: `R$ ${(Number(proposalTotals.cpmEstimado) || 0).toFixed(2)}` }
  ];

  let cx = 16;
  cards.forEach((card) => {
    doc.setFillColor(20, 22, 26);
    doc.setDrawColor(56, 58, 62);
    doc.roundedRect(cx, 84, 64, 30, 3, 3, 'FD');

    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text(card.label.toUpperCase(), cx + 4, 91);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(String(card.value), cx + 4, 104);
    cx += 68;
  });

  const highlights = normalizeLines(strategicText?.slice?.(0, 4) || []);
  doc.setFillColor(14, 15, 19);
  doc.setDrawColor(60, 62, 68);
  doc.roundedRect(16, 124, w - 32, 72, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('DIRECIONAMENTO ESTRATEGICO', 22, 133);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  if (highlights.length) {
    let hy = 143;
    highlights.forEach((line) => {
      doc.text(`- ${line}`, 22, hy);
      hy += 10;
    });
  } else {
    doc.text('- Argumentos estrategicos serao definidos na reuniao comercial.', 22, 143);
  }

  if (simulationSummary) {
    const summary = String(simulationSummary).slice(0, 180);
    doc.setTextColor(170, 170, 170);
    doc.text(`Simulacao: ${summary}`, 22, 188);
  }

  for (let i = 0; i < proposalPoints.length; i += 1) {
    const point = proposalPoints[i];
    doc.addPage('a4', 'landscape');

    doc.setFillColor(248, 248, 248);
    doc.rect(0, 0, w, h, 'F');

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(10, 10, w - 20, h - 20, 4, 4, 'F');

    doc.setFillColor(8, 8, 8);
    doc.roundedRect(14, 14, w - 28, 14, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${i + 1}/${proposalPoints.length}  ${String(point.nome || 'Ponto').slice(0, 65)}`, 18, 23);

    const imageUrl = point.proposalSimulationPreview || point.simulacao_preview || pickImageUrl(point);
    const imageData = await imageToDataUrl(imageUrl);
    if (imageData) {
      try {
        doc.addImage(imageData, 'JPEG', 14, 34, 188, 106, undefined, 'FAST');
      } catch {
        try {
          doc.addImage(imageData, 'PNG', 14, 34, 188, 106, undefined, 'FAST');
        } catch {
          doc.setFillColor(35, 35, 35);
          doc.rect(14, 34, 188, 106, 'F');
        }
      }
    } else {
      doc.setFillColor(35, 35, 35);
      doc.rect(14, 34, 188, 106, 'F');
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(10);
      doc.text('Simulacao/imagem indisponivel', 22, 88);
    }

    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(String(point.nome || 'Ponto sem nome').slice(0, 45), 210, 44);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`${point.cidade || '-'} | ${point.tipo || '-'}`, 210, 52);
    doc.text(String(point.endereco || 'Endereco nao informado').slice(0, 70), 210, 60);

    const info = [
      ['Publico', point.publico || '-'],
      ['Fluxo', formatInt(point.fluxo)],
      ['Telas', formatInt(point.telas)],
      ['Insercoes', formatInt(point.insercoes)],
      ['Investimento', formatMoney(point.preco)]
    ];

    let iy = 74;
    info.forEach(([label, value]) => {
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(8);
      doc.text(String(label).toUpperCase(), 210, iy);

      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(String(value).slice(0, 40), 210, iy + 6);

      doc.setFont('helvetica', 'normal');
      iy += 16;
    });
  }

  const fileName = `proposta-${slugify(proposalClient)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
