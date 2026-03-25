export const PDF_LAYOUT = {
  midiaKit: {
    cover: {
      outOfHomeMinHeight: 48,
      outOfHomePaddingX: 18,
      showAllCitiesOnConsolidated: true
    },
    formatDivider: {
      leftRailWidth: 170,
      cityVerticalTop: 240,
      cityVerticalBottom: 40,
      cityVerticalFontSize: 26,
      cityVerticalLetterSpacing: 0.08,
      titleFontSize: 96
    },
    pointPage: {
      leftRailWidth: 56,
      imagePanelWidth: 670,
      contentLeft: 76,
      contentRight: 710,
      typeFontSize: 62,
      nameTop: 156,
      nameFontSize: 52,
      nameMaxWidthOffset: 110,
      addressTop: 286,
      metricsBoxTop: 352,
      metricsGridTop: 378,
      metricLabelFontSize: 18,
      metricValueFontSize: 30,
      footerLineBottom: 168,
      footerBottom: 54,
      priceLabelMarginBottom: 10,
      priceValueFontSize: 68
    }
  },
  proposal: {
    cover: {
      badgeMinHeight: 48,
      badgePaddingX: 20,
      chipMinHeight: 58,
      chipPaddingX: 24,
      metricLabelSize: 14,
      metricValueSize: 22,
      metricGap: 14,
      metricPadding: '22px 18px',
      strategicHeaderIconSize: 34,
      strategicDotSize: 8
    },
    point: {
      counterMinWidth: 102,
      counterMinHeight: 56,
      counterPaddingX: 16,
      counterGap: 8
    }
  }
};

export const PDF_LAYOUT_STORAGE_KEY = 'intermidia-pdf-layout-overrides';

export const PDF_CALIBRATION_GROUPS = [
  {
    key: 'midiaKit.pointPage',
    title: 'Midia Kit · Página de ponto',
    fields: [
      { path: 'midiaKit.pointPage.nameFontSize', label: 'Fonte do nome', min: 32, max: 80, step: 1 },
      { path: 'midiaKit.pointPage.nameTop', label: 'Topo do nome', min: 100, max: 260, step: 1 },
      { path: 'midiaKit.pointPage.typeFontSize', label: 'Fonte do tipo', min: 38, max: 80, step: 1 },
      { path: 'midiaKit.pointPage.addressTop', label: 'Topo do endereço', min: 220, max: 360, step: 1 },
      { path: 'midiaKit.pointPage.metricsBoxTop', label: 'Topo da caixa de métricas', min: 280, max: 460, step: 1 },
      { path: 'midiaKit.pointPage.metricsGridTop', label: 'Topo do grid de métricas', min: 300, max: 500, step: 1 },
      { path: 'midiaKit.pointPage.metricLabelFontSize', label: 'Fonte do label métrica', min: 12, max: 30, step: 1 },
      { path: 'midiaKit.pointPage.metricValueFontSize', label: 'Fonte do valor métrica', min: 18, max: 42, step: 1 },
      { path: 'midiaKit.pointPage.footerLineBottom', label: 'Linha superior do rodapé', min: 120, max: 240, step: 1 },
      { path: 'midiaKit.pointPage.footerBottom', label: 'Base do rodapé', min: 20, max: 120, step: 1 },
      { path: 'midiaKit.pointPage.priceValueFontSize', label: 'Fonte do preço', min: 42, max: 88, step: 1 }
    ]
  },
  {
    key: 'midiaKit.cover',
    title: 'Midia Kit · Capa',
    fields: [
      { path: 'midiaKit.cover.outOfHomeMinHeight', label: 'Altura do chip Out of Home', min: 30, max: 80, step: 1 },
      { path: 'midiaKit.cover.outOfHomePaddingX', label: 'Padding horizontal do chip', min: 8, max: 40, step: 1 }
    ]
  },
  {
    key: 'proposal.cover',
    title: 'Proposta · Capa',
    fields: [
      { path: 'proposal.cover.badgeMinHeight', label: 'Altura do badge Proposta comercial', min: 32, max: 80, step: 1 },
      { path: 'proposal.cover.badgePaddingX', label: 'Padding horizontal do badge', min: 8, max: 40, step: 1 },
      { path: 'proposal.cover.chipMinHeight', label: 'Altura dos chips', min: 36, max: 80, step: 1 },
      { path: 'proposal.cover.chipPaddingX', label: 'Padding horizontal dos chips', min: 8, max: 40, step: 1 },
      { path: 'proposal.cover.metricLabelSize', label: 'Fonte do label do card', min: 10, max: 24, step: 1 },
      { path: 'proposal.cover.metricValueSize', label: 'Fonte do valor do card', min: 16, max: 42, step: 1 },
      { path: 'proposal.cover.metricGap', label: 'Gap entre cards', min: 6, max: 30, step: 1 },
      { path: 'proposal.cover.strategicHeaderIconSize', label: 'Tamanho do ícone estratégico', min: 20, max: 48, step: 1 },
      { path: 'proposal.cover.strategicDotSize', label: 'Tamanho do ponto interno', min: 4, max: 14, step: 1 }
    ]
  },
  {
    key: 'proposal.point',
    title: 'Proposta · Página de ponto',
    fields: [
      { path: 'proposal.point.counterMinWidth', label: 'Largura mínima do contador', min: 70, max: 180, step: 1 },
      { path: 'proposal.point.counterMinHeight', label: 'Altura mínima do contador', min: 36, max: 90, step: 1 },
      { path: 'proposal.point.counterPaddingX', label: 'Padding horizontal do contador', min: 4, max: 30, step: 1 },
      { path: 'proposal.point.counterGap', label: 'Gap interno do contador', min: 2, max: 16, step: 1 }
    ]
  }
];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const output = deepClone(base);

  function mergeInto(target, source) {
    Object.entries(source || {}).forEach(([key, value]) => {
      if (isPlainObject(value) && isPlainObject(target[key])) {
        mergeInto(target[key], value);
        return;
      }
      target[key] = value;
    });
  }

  mergeInto(output, override);
  return output;
}

export function getDefaultPdfLayoutConfig() {
  return deepClone(PDF_LAYOUT);
}

export function getStoredPdfLayoutOverrides() {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(PDF_LAYOUT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getPdfLayoutConfig() {
  return deepMerge(PDF_LAYOUT, getStoredPdfLayoutOverrides());
}

export function savePdfLayoutOverrides(overrides) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PDF_LAYOUT_STORAGE_KEY, JSON.stringify(overrides));
}

export function resetPdfLayoutOverrides() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PDF_LAYOUT_STORAGE_KEY);
}
