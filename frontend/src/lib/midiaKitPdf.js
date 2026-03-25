import { jsPDF } from 'jspdf';
import { campaignTotals, getSegmentDisplayName } from './strategy';

function formatInt(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value) || 0);
}

function slugify(value) {
  return (value || 'arquivo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickImageUrl(ponto) {
  return ponto?.proposalSimulationPreview || ponto?.simulacao_preview || ponto?.imagem || '';
}

async function imageToDataUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addPageBackground(doc, dark = true) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  if (dark) {
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, width, height, 'F');
  } else {
    doc.setFillColor(248, 248, 248);
    doc.rect(0, 0, width, height, 'F');
  }
}

function addMetricCard(doc, { x, y, width, height, label, value, dark = true }) {
  doc.setFillColor(dark ? 20 : 255, dark ? 20 : 255, dark ? 20 : 255);
  doc.setDrawColor(dark ? 45 : 230, dark ? 45 : 230, dark ? 45 : 230);
  doc.roundedRect(x, y, width, height, 3, 3, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(dark ? 150 : 110, dark ? 150 : 110, dark ? 150 : 110);
  doc.setFontSize(9);
  doc.text(label.toUpperCase(), x + 4, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(dark ? 255 : 10, dark ? 255 : 10, dark ? 255 : 10);
  doc.setFontSize(15);
  doc.text(String(value), x + 4, y + 16);
}

function addTextBlock(doc, { x, y, label, value, dark = false }) {
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(dark ? 150 : 110, dark ? 150 : 110, dark ? 150 : 110);
  doc.setFontSize(8);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(dark ? 255 : 20, dark ? 255 : 20, dark ? 255 : 20);
  doc.setFontSize(11);
  doc.text(String(value || '-'), x, y + 5);
}

function addWrappedLines(doc, text, x, y, width, lineHeight = 5, dark = true) {
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(dark ? 220 : 60, dark ? 220 : 60, dark ? 220 : 60);
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(String(text || ''), width);
  doc.text(lines, x, y, { baseline: 'top' });
  return y + lines.length * lineHeight;
}

function buildMediaKitCoverSummary(pontos = []) {
  const totals = campaignTotals(pontos);
  return {
    pontos: totals.quantidade,
    telas: totals.telasTotal,
    fluxo: totals.fluxoTotal,
    ticketMedio: totals.ticketMedio,
    cpm: totals.cpmEstimado
  };
}

function addMidiaKitCoverPage(doc, pracaLabel, pontos) {
  addPageBackground(doc, true);
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const resumo = buildMediaKitCoverSummary(pontos);

  doc.setFillColor(254, 92, 43);
  doc.roundedRect(16, 14, 78, 14, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('MIDIA KIT INTERMIDIA', 22, 23);

  doc.setFontSize(34);
  doc.text(String(pracaLabel || 'Consolidado').toUpperCase(), 18, 52);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(210, 210, 210);
  doc.setFontSize(12);
  doc.text('Inventário e dados comerciais consolidados para a seleção atual.', 18, 63);

  addMetricCard(doc, { x: 18, y: 82, width: 58, height: 24, label: 'Pontos', value: formatInt(resumo.pontos) });
  addMetricCard(doc, { x: 82, y: 82, width: 58, height: 24, label: 'Telas', value: formatInt(resumo.telas) });
  addMetricCard(doc, { x: 146, y: 82, width: 58, height: 24, label: 'Fluxo/mês', value: formatInt(resumo.fluxo) });
  addMetricCard(doc, { x: 210, y: 82, width: 58, height: 24, label: 'Ticket médio', value: formatMoney(resumo.ticketMedio) });

  doc.setFontSize(10);
  doc.setTextColor(140, 140, 140);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 18, height - 16);
  doc.text('intermidia', width - 34, height - 16);
}

function addMidiaKitSummaryPage(doc, pontos) {
  doc.addPage('a4', 'landscape');
  addPageBackground(doc, false);

  const totals = campaignTotals(pontos);
  const byTipo = pontos.reduce((acc, point) => {
    const tipo = point.tipo || 'Sem tipo';
    if (!acc[tipo]) {
      acc[tipo] = { quantidade: 0, telas: 0, fluxo: 0 };
    }
    acc[tipo].quantidade += 1;
    acc[tipo].telas += Number(point.telas) || 0;
    acc[tipo].fluxo += Number(point.fluxo) || 0;
    return acc;
  }, {});

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 10, 10);
  doc.setFontSize(24);
  doc.text('RESUMO EXECUTIVO', 18, 22);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(11);
  doc.text('Composição por formato, escala de cobertura e principais indicadores financeiros.', 18, 30);

  addMetricCard(doc, { x: 18, y: 40, width: 58, height: 24, label: 'Valor total', value: formatMoney(totals.valorTotal), dark: false });
  addMetricCard(doc, { x: 82, y: 40, width: 58, height: 24, label: 'Fluxo total', value: formatInt(totals.fluxoTotal), dark: false });
  addMetricCard(doc, { x: 146, y: 40, width: 58, height: 24, label: 'CPM médio', value: `R$ ${totals.cpmEstimado.toFixed(2).replace('.', ',')}`, dark: false });
  addMetricCard(doc, { x: 210, y: 40, width: 58, height: 24, label: 'Ticket médio', value: formatMoney(totals.ticketMedio), dark: false });

  doc.setFillColor(10, 10, 10);
  doc.roundedRect(18, 74, 128, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('Formato', 22, 81);
  doc.text('Pontos', 78, 81);
  doc.text('Telas', 98, 81);
  doc.text('Fluxo', 118, 81);

  let y = 92;
  Object.entries(byTipo).forEach(([tipo, values], index) => {
    doc.setFillColor(index % 2 === 0 ? 255 : 243, index % 2 === 0 ? 255 : 243, index % 2 === 0 ? 255 : 243);
    doc.rect(18, y - 6, 128, 10, 'F');
    doc.setTextColor(20, 20, 20);
    doc.text(tipo, 22, y);
    doc.text(formatInt(values.quantidade), 80, y);
    doc.text(formatInt(values.telas), 100, y);
    doc.text(formatInt(values.fluxo), 118, y);
    y += 10;
  });
}

async function addInventoryPointPage(doc, ponto, index, total) {
  doc.addPage('a4', 'landscape');
  addPageBackground(doc, false);

  const width = doc.internal.pageSize.getWidth();
  const imageWidth = 140;
  const imageHeight = 110;
  const imageData = await imageToDataUrl(pickImageUrl(ponto));

  doc.setFillColor(15, 15, 15);
  doc.rect(width - 150, 0, 150, doc.internal.pageSize.getHeight(), 'F');

  if (imageData) {
    try {
      doc.addImage(imageData, 'JPEG', 18, 32, imageWidth, imageHeight, undefined, 'FAST');
    } catch {
      try {
        doc.addImage(imageData, 'PNG', 18, 32, imageWidth, imageHeight, undefined, 'FAST');
      } catch {
        doc.setFillColor(225, 225, 225);
        doc.rect(18, 32, imageWidth, imageHeight, 'F');
      }
    }
  } else {
    doc.setFillColor(225, 225, 225);
    doc.rect(18, 32, imageWidth, imageHeight, 'F');
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 10, 10);
  doc.setFontSize(19);
  doc.text((ponto.nome || 'Ponto').slice(0, 46), 18, 22);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 90);
  doc.setFontSize(10);
  doc.text(`${ponto.cidade || '-'} • ${ponto.tipo || '-'}`, 18, 28);

  addTextBlock(doc, { x: 170, y: 42, label: 'Investimento', value: formatMoney(ponto.precoOriginal ?? ponto.preco) });
  addTextBlock(doc, { x: 170, y: 56, label: 'Público', value: ponto.publico || '-' });
  addTextBlock(doc, { x: 170, y: 70, label: 'Fluxo mensal', value: formatInt(ponto.fluxo) });
  addTextBlock(doc, { x: 170, y: 84, label: 'Inserções', value: formatInt(ponto.insercoes) });
  addTextBlock(doc, { x: 170, y: 98, label: 'Tempo', value: ponto.tempo || '-' });
  addTextBlock(doc, { x: 170, y: 112, label: 'Loop', value: ponto.loop || '-' });
  addTextBlock(doc, { x: 170, y: 126, label: 'Veiculação', value: ponto.veiculacao || '-' });
  addTextBlock(doc, { x: 170, y: 140, label: 'Endereço', value: ponto.endereco || '-' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(`Ficha técnica ${index}/${total}`, width - 86, 22);
}

export async function generateMidiaKitPdf({ praca, pontos }) {
  const kitPontos = Array.isArray(pontos) ? pontos : [];
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  addMidiaKitCoverPage(doc, praca || 'Consolidado', kitPontos);
  addMidiaKitSummaryPage(doc, kitPontos);

  for (let index = 0; index < kitPontos.length; index += 1) {
    await addInventoryPointPage(doc, kitPontos[index], index + 1, kitPontos.length);
  }

  doc.save(`midia-kit-${slugify(praca)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function addProposalCoverPage(doc, payload) {
  addPageBackground(doc, true);
  const width = doc.internal.pageSize.getWidth();
  const totals = payload.totals || campaignTotals(payload.points || []);
  const pricingSummary = payload.pricingSummary || { discountTotal: 0, finalTotal: totals.valorTotal, hasDiscount: false };

  doc.setFillColor(254, 92, 43);
  doc.roundedRect(16, 14, 92, 14, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('PROPOSTA COMERCIAL', 22, 23);

  doc.setFontSize(28);
  doc.text((payload.clientName || 'Cliente').toUpperCase(), 18, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(210, 210, 210);
  doc.text(`Praças: ${(payload.city || []).join(', ') || 'Múltiplas praças'}`, 18, 58);
  doc.text(`Públicos: ${(payload.publico || []).join(', ') || 'Públicos estratégicos'}`, 18, 65);
  doc.text(`Segmento: ${getSegmentDisplayName(payload.segmento)} • Objetivo: ${payload.objective || '-'}`, 18, 72);
  if (payload.clientAddress) {
    const addressLines = doc.splitTextToSize(`Endereço do cliente: ${payload.clientAddress}`, 115);
    doc.text(addressLines, 18, 79);
  }

  addMetricCard(doc, { x: 18, y: 100, width: 58, height: 24, label: 'Valor final', value: formatMoney(pricingSummary.finalTotal) });
  addMetricCard(doc, { x: 82, y: 100, width: 58, height: 24, label: 'Desconto', value: formatMoney(pricingSummary.discountTotal || 0) });
  addMetricCard(doc, { x: 146, y: 100, width: 58, height: 24, label: 'CPM', value: `R$ ${totals.cpmEstimado.toFixed(2).replace('.', ',')}` });
  addMetricCard(doc, { x: 210, y: 100, width: 58, height: 24, label: 'Ticket médio', value: formatMoney(totals.ticketMedio) });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Argumentação estratégica', 18, 136);
  const strategyText = Array.isArray(payload.strategicText) ? payload.strategicText.join(' ') : String(payload.strategicText || '');
  addWrappedLines(doc, strategyText, 18, 142, 118, 5, true);

  doc.setFont('helvetica', 'bold');
  doc.text('Resumo operacional', 160, 136);
  const operational = [
    payload.simulationSummary,
    payload.analysisMode === 'client-address'
      ? 'A proposta considera leitura personalizada pelo endereço do cliente.'
      : 'A proposta usa a leitura padrão de entorno por segmento e praça.'
  ].filter(Boolean).join(' ');
  addWrappedLines(doc, operational, 160, 142, 110, 5, true);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(140, 140, 140);
  doc.setFontSize(10);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 18, doc.internal.pageSize.getHeight() - 16);
  doc.text('intermidia', width - 34, doc.internal.pageSize.getHeight() - 16);
}

async function addProposalPointPage(doc, point, index, total) {
  doc.addPage('a4', 'landscape');
  addPageBackground(doc, false);

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const imageData = await imageToDataUrl(pickImageUrl(point));

  if (imageData) {
    try {
      doc.addImage(imageData, 'JPEG', 16, 18, 158, 110, undefined, 'FAST');
    } catch {
      try {
        doc.addImage(imageData, 'PNG', 16, 18, 158, 110, undefined, 'FAST');
      } catch {
        doc.setFillColor(225, 225, 225);
        doc.rect(16, 18, 158, 110, 'F');
      }
    }
  } else {
    doc.setFillColor(225, 225, 225);
    doc.rect(16, 18, 158, 110, 'F');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(10, 10, 10);
  doc.text((point.nome || 'Ponto').slice(0, 48), 16, 138);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`${point.cidade || '-'} • ${point.tipo || '-'}`, 16, 145);

  addTextBlock(doc, { x: 186, y: 28, label: 'Tabela', value: formatMoney(point.precoOriginal ?? point.preco) });
  addTextBlock(doc, { x: 186, y: 42, label: 'Desconto', value: point.discountPercent ? `${point.discountPercent}%` : 'Sem desconto' });
  addTextBlock(doc, { x: 186, y: 56, label: 'Valor final', value: formatMoney(point.precoFinal ?? point.preco) });
  addTextBlock(doc, { x: 186, y: 70, label: 'Público', value: point.publico || '-' });
  addTextBlock(doc, { x: 186, y: 84, label: 'Fluxo mensal', value: formatInt(point.fluxo) });
  addTextBlock(doc, { x: 186, y: 98, label: 'Inserções', value: formatInt(point.insercoes) });
  addTextBlock(doc, { x: 186, y: 112, label: 'Telas', value: formatInt(point.telas) });
  addTextBlock(doc, { x: 186, y: 126, label: 'Tempo', value: point.tempo || '-' });
  addTextBlock(doc, { x: 186, y: 140, label: 'Loop', value: point.loop || '-' });
  addTextBlock(doc, { x: 186, y: 154, label: 'Veiculação', value: point.veiculacao || '-' });
  addTextBlock(doc, { x: 16, y: 160, label: 'Endereço', value: point.endereco || '-' });
  addTextBlock(doc, { x: 16, y: 174, label: 'Descrição técnica', value: point.descricao || '-' });
  if (point.clientDistanceKm) {
    addTextBlock(doc, { x: 186, y: 168, label: 'Distância do cliente', value: `${point.clientDistanceKm.toFixed(1).replace('.', ',')} km` });
  }

  doc.setFillColor(10, 10, 10);
  doc.roundedRect(width - 30, height - 16, 22, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(`${index}/${total}`, width - 23, height - 10);
}

export async function generateProposalPdf(payload) {
  const proposalPoints = Array.isArray(payload.points) ? payload.points : [];
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  addProposalCoverPage(doc, payload);

  for (let index = 0; index < proposalPoints.length; index += 1) {
    await addProposalPointPage(doc, proposalPoints[index], index + 1, proposalPoints.length);
  }

  doc.save(`proposta-${slugify(payload.clientName || 'cliente')}-${new Date().toISOString().slice(0, 10)}.pdf`);
}