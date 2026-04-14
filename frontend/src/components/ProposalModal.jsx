import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Map,
  MapPinned,
  Presentation,
  QrCode,
  Radio,
  Route,
  Settings2,
  Share2,
  Sparkles,
  Trophy,
  Upload,
  X,
  Zap
} from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { useFavorites } from '../context/FavoritesContext';
import {
  campaignTotals,
  generateStrategicJustification,
  getSegmentDisplayName,
  OBJETIVOS,
  SEGMENTOS
} from '../lib/strategy';
import { buildProposalImagePromptsByFormat, buildProposalPricing } from '../lib/proposal';
import { generateProposalPdf } from '../lib/midiaKitPdf';
import { generateProposalMobilePdf } from '../lib/midiaKitMobilePdf';
import {
  defaultDisplaySettings,
  defaultMediaParams,
  generateSimulationPreview,
  normalizeDisplaySettings,
  parseSimulationConfig
} from '../lib/simulation';
import { criarPropostaPublica, uploadProposalImage, fetchClientAddressAnalysis, fetchEntornoScores, gerarTextoProposta } from '../lib/api';
import { buildSelectionMapDataUrl, downloadSelectionMapPng } from '../lib/mapSnapshot';
import CustomSelect from './CustomSelect';
import ArteAIPanel from './ArteAIPanel';
import PresentationMode from './PresentationMode';
import QuickPresentationMode from './QuickPresentationMode';

const DEFAULT_ENTORNO_RADIUS = 800;

// High-realism preset applied automatically
const REALISM_PRESET = normalizeDisplaySettings({
  ...defaultDisplaySettings,
  brightness: 1.35,
  reflection: 0.32,
  spill: 0.28,
  ledPixelIntensity: 0.30,
  ledPixelSize: 6,
  glare: 0.22
});

const WIZARD_STEPS = [
  { id: 1, label: 'Dados' },
  { id: 2, label: 'Desconto' },
  { id: 3, label: 'Arte' },
  { id: 4, label: 'Revisão' },
  { id: 5, label: 'Gerar' },
];

const STEP_TITLES = {
  1: 'Dados da proposta',
  2: 'Desconto comercial',
  3: 'Arte da campanha',
  4: 'Revisão da proposta',
  5: 'Gerar proposta',
};

function getPointPreviewUrl(point, requireGeneratedPreview = false) {
  if (!point) return '';
  if (requireGeneratedPreview) {
    return point.proposalSimulationPreview || '';
  }
  return point.proposalSimulationPreview || point.simulacao_preview || '';
}

const DRAFT_STORAGE_KEY = 'proposal-draft';

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(data) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

export function clearProposalDraft() {
  try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
}

export default function ProposalModal({ onClose, open = true, selectedPoints = null, isDark = true }) {
  const { favorites } = useFavorites();
  const sourcePoints = selectedPoints ?? favorites;
  const [wizardStep, setWizardStep] = useState(1);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showQuickPresentation, setShowQuickPresentation] = useState(false);
  const [clientModePresentation, setClientModePresentation] = useState(false);

  const draft = useMemo(() => loadDraft(), []);

  const [form, setForm] = useState(() => ({
    clientName: '',
    clientAddress: '',
    proposalSubtitle: '',
    strategicTopics: '',
    segmento: 'clinica',
    objetivo: 'reconhecimento de marca',
    publicos: [],
    selectedCities: [],
    ...(draft?.form || {})
  }));
  const [analysisMode, setAnalysisMode] = useState(draft?.analysisMode || 'segmento');
  const [discountConfig, setDiscountConfig] = useState(() => ({
    mode: 'none',
    percentage: '',
    targetPointIds: [],
    perPoint: {},
    ...(draft?.discountConfig || {})
  }));
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [advancedRealismOpen, setAdvancedRealismOpen] = useState(false);
  const [simulationArtFile, setSimulationArtFile] = useState(null);
  const [simulationArtUrl, setSimulationArtUrl] = useState('');
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [simulationError, setSimulationError] = useState('');
  const [simulationResults, setSimulationResults] = useState({});
  const [simulationSettings, setSimulationSettings] = useState(REALISM_PRESET);
  const [mediaParams, setMediaParams] = useState({ ...defaultMediaParams });
  const [activePreviewPointId, setActivePreviewPointId] = useState(null);
  const [showPreviewLightbox, setShowPreviewLightbox] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFormat, setPdfFormat] = useState('desktop'); // 'desktop' | 'mobile'
  const [showPdfFormatPicker, setShowPdfFormatPicker] = useState(false);
  const pdfFormatPickerRef = useRef(null);
  // FEAT-11: IA text generation
  const [aiTextBusy, setAiTextBusy] = useState(false);
  // FEAT-1: Share / public link
  const [shareModal, setShareModal] = useState(null); // null | { url, token, expires_at }
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [sessionExpiredModal, setSessionExpiredModal] = useState({ open: false, message: '' });
  const [pdfSections, setPdfSections] = useState({ methodology: true, score: true, coverage: true, impact: true, mapPrint: false });
  const [connectMapPoints, setConnectMapPoints] = useState(true);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapStatus, setMapStatus] = useState('');
  const [entornoRefreshKey, setEntornoRefreshKey] = useState(0);
  const [entorno, setEntorno] = useState({
    loading: false,
    jobId: null,
    coverage: 0,
    scoresByPoint: {},
    updatedAt: null,
    error: ''
  });
  const [clientAnalysis, setClientAnalysis] = useState({
    loading: false,
    location: null,
    byPoint: {},
    rankedPoints: [],
    error: ''
  });
  const promptTextareaRef = useRef(null);

  const isSessionExpiredError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return /token|expirad|autentica|unauthoriz|401/.test(message);
  };

  const triggerSessionExpiredModal = (message) => {
    try { sessionStorage.removeItem('admin_token'); } catch { /* ignore */ }
    setSessionExpiredModal({
      open: true,
      message: message || 'Sua sessão expirou. Faça login novamente para continuar.'
    });
  };

  const handleAuthExpired = (error, message) => {
    if (!isSessionExpiredError(error)) return false;
    triggerSessionExpiredModal(message);
    return true;
  };

  const goToCommercialLogin = () => {
    if (typeof window === 'undefined') return;
    window.location.assign('/comercial');
  };

  const mergeEntornoMetrics = (points, scoresByPoint = {}) => {
    const safePoints = Array.isArray(points) ? points : [];
    return safePoints.map((point) => {
      const hit = scoresByPoint?.[point?.id] || scoresByPoint?.[String(point?.id)] || null;
      return {
        ...point,
        entornoMetrics: point?.entornoMetrics || hit || null
      };
    });
  };

  const ensurePointsWithEntorno = async (points) => {
    return mergeEntornoMetrics(points, entorno.scoresByPoint || {});
  };

  const handleRefreshEntorno = () => {
    setEntornoRefreshKey((current) => current + 1);
  };

  const persistSimulationPreview = async (previewBlob, previewUrl = '') => {
    if (previewBlob instanceof Blob) {
      const serverUrl = await uploadProposalImage(previewBlob);
      return serverUrl || '';
    }

    // If we don't have the blob in memory, keep only stable non-blob URLs.
    if (previewUrl && !String(previewUrl).startsWith('blob:')) {
      return previewUrl;
    }
    return '';
  };

  // Auto-save draft whenever form-related state changes
  useEffect(() => {
    saveDraft({ form, discountConfig, analysisMode, pdfSections });
  }, [form, discountConfig, analysisMode, pdfSections]);

  useEffect(() => {
    if (!showPdfFormatPicker) return undefined;
    const handler = (e) => {
      if (pdfFormatPickerRef.current && !pdfFormatPickerRef.current.contains(e.target)) {
        setShowPdfFormatPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPdfFormatPicker]);

  const availableCities = useMemo(() => {
    return Array.from(new Set(sourcePoints.map((point) => point.cidade).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [sourcePoints]);

  const availablePublicos = useMemo(() => {
    return Array.from(new Set(sourcePoints.map((point) => point.publico).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [sourcePoints]);

  const activeCities = form.selectedCities.length ? form.selectedCities : availableCities;

  useEffect(() => {
    setForm((current) => ({
      ...current,
      selectedCities: current.selectedCities.filter((city) => availableCities.includes(city)),
      publicos: current.publicos.filter((publico) => availablePublicos.includes(publico))
    }));
  }, [availableCities, availablePublicos]);

  useEffect(() => {
    setDiscountConfig((current) => ({
      ...current,
      targetPointIds: current.targetPointIds.filter((pointId) => sourcePoints.some((point) => point.id === pointId)),
      perPoint: Object.fromEntries(
        Object.entries(current.perPoint || {}).filter(([pointId]) => sourcePoints.some((point) => String(point.id) === String(pointId)))
      )
    }));
  }, [sourcePoints]);

  const proposalSourcePoints = useMemo(() => {
    if (!form.selectedCities.length) return sourcePoints;
    return sourcePoints.filter((point) => form.selectedCities.includes(point.cidade));
  }, [sourcePoints, form.selectedCities]);

  if (!open) {
    return null;
  }

  const pricing = useMemo(() => buildProposalPricing(proposalSourcePoints, discountConfig), [proposalSourcePoints, discountConfig]);
  const pricingSummary = pricing.summary;
  const totals = useMemo(() => campaignTotals(pricing.points), [pricing.points]);

  const clearSimulationResults = () => {
    setSimulationResults((current) => {
      Object.values(current).forEach((entry) => {
        if (entry?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
      return {};
    });
  };

  useEffect(() => {
    if (!simulationArtFile) {
      setSimulationArtUrl('');
      return;
    }

    const nextUrl = URL.createObjectURL(simulationArtFile);
    setSimulationArtUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [simulationArtFile]);

  // Cleanup blob URLs only on unmount — NOT on every simulationResults change,
  // because revoking mid-batch would invalidate earlier blob URLs.
  const simulationResultsRef = useRef(simulationResults);
  simulationResultsRef.current = simulationResults;
  useEffect(() => {
    return () => {
      Object.values(simulationResultsRef.current).forEach((entry) => {
        if (entry?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (Object.keys(simulationResults).length > 0) {
      clearSimulationResults();
    }
  }, [simulationSettings]);

  useEffect(() => {
    let active = true;
    let pollTimer = null;

    const loadScores = async (force = false) => {
      if (!proposalSourcePoints.length) {
        setEntorno({
          loading: false,
          jobId: null,
          coverage: 0,
          scoresByPoint: {},
          updatedAt: null,
          error: ''
        });
        return;
      }

      try {
        setEntorno((prev) => ({ ...prev, loading: true, error: '' }));
        const response = await fetchEntornoScores({
          segmento: form.segmento,
          cidade: activeCities.length === 1 ? activeCities[0] : '',
          raio: DEFAULT_ENTORNO_RADIUS,
          force
        });

        if (!active) return;

        const scoresByPoint = response.byPoint || {};
        const selectedIds = proposalSourcePoints
          .map((point) => String(point?.id || '').trim())
          .filter(Boolean);
        const matchedCount = selectedIds.filter((id) => Boolean(scoresByPoint[id])).length;

        // If current cache coverage is high but none of the selected points have data,
        // trigger one forced refresh to ensure proposal points receive entorno metrics.
        if (!force && selectedIds.length > 0 && matchedCount === 0) {
          await loadScores(true);
          return;
        }

        const latest = response.metrics?.[0]?.updated_at || null;
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          coverage: Number(response.coverage || response.coberturaCache || 0),
          scoresByPoint,
          updatedAt: latest,
          jobId: response.job?.jobId || null,
          error: ''
        }));

        if (response.job?.jobId) {
          pollTimer = window.setTimeout(() => {
            if (!active) return;
            setEntornoRefreshKey((current) => current + 1);
          }, 4000);
        }
      } catch (err) {
        if (!active) return;
        if (handleAuthExpired(err, 'Sua sessão expirou durante a análise de entorno. Faça login novamente para continuar gerando a proposta.')) {
          setEntorno((prev) => ({ ...prev, loading: false, error: 'Sessão expirada.' }));
          return;
        }
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Erro ao consultar análise de entorno.'
        }));
      }
    };

    if (entornoRefreshKey > 0) {
      loadScores(true);
    }

    return () => {
      active = false;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [entornoRefreshKey]);

  useEffect(() => {
    if (analysisMode !== 'client-address') {
      setClientAnalysis({ loading: false, location: null, byPoint: {}, rankedPoints: [], error: '' });
      return;
    }

    if (!form.clientAddress.trim() || !proposalSourcePoints.length) {
      setClientAnalysis((current) => ({ ...current, loading: false, location: null, byPoint: {}, rankedPoints: [], error: '' }));
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setClientAnalysis((current) => ({ ...current, loading: true, error: '' }));
        const response = await fetchClientAddressAnalysis({
          address: form.clientAddress,
          pointIds: proposalSourcePoints.map((point) => point.id),
          cidade: activeCities
        });

        if (!active) return;

        setClientAnalysis({
          loading: false,
          location: response.location || null,
          byPoint: response.byPoint || {},
          rankedPoints: Array.isArray(response.rankedPoints) ? response.rankedPoints : [],
          error: ''
        });
      } catch (error) {
        if (!active) return;
        if (handleAuthExpired(error, 'Sua sessão expirou durante a análise do endereço do cliente. Faça login novamente para continuar.')) {
          setClientAnalysis({
            loading: false,
            location: null,
            byPoint: {},
            rankedPoints: [],
            error: 'Sessão expirada.'
          });
          return;
        }
        setClientAnalysis({
          loading: false,
          location: null,
          byPoint: {},
          rankedPoints: [],
          error: error.message || 'Falha ao analisar o endereço do cliente.'
        });
      }
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [analysisMode, form.clientAddress, proposalSourcePoints, activeCities]);

  const argumentos = useMemo(() => {
    const strategic = generateStrategicJustification({
      selected: proposalSourcePoints,
      cidade: Array.isArray(activeCities) ? activeCities[0] : activeCities,
      publicoAlvo: form.publicos,
      objetivo: form.objetivo,
      segmento: form.segmento,
      empresa: form.clientName
    });
    return strategic.argumentacaoComercial || [];
  }, [proposalSourcePoints, activeCities, form.publicos, form.objetivo, form.segmento, form.clientName]);

  const imagePromptGroups = useMemo(() => {
    return buildProposalImagePromptsByFormat({
      clientName: form.clientName,
      selectedCities: activeCities,
      selectedPublicos: form.publicos,
      objetivo: form.objetivo,
      segmento: getSegmentDisplayName(form.segmento),
      points: proposalSourcePoints
    });
  }, [form.clientName, activeCities, form.publicos, form.objetivo, form.segmento, proposalSourcePoints]);

  const imagePrompt = useMemo(() => {
    if (!imagePromptGroups.length) return '';
    if (imagePromptGroups.length === 1) return imagePromptGroups[0].prompt;

    const header = `A campanha possui ${imagePromptGroups.length} formatos de tela. Gere uma arte por formato.`;
    const blocks = imagePromptGroups.map((group, index) => {
      const pointNames = group.points
        .map((point) => point.nome)
        .filter(Boolean)
        .slice(0, 4)
        .join(', ');
      const morePoints = group.points.length > 4 ? ` (+${group.points.length - 4})` : '';
      const ratioLabel = group.aspectRatio ? ` | ${group.aspectRatio}` : '';

      return [
        `Prompt ${index + 1} - ${group.width}x${group.height}${ratioLabel}`,
        pointNames ? `Pontos: ${pointNames}${morePoints}` : null,
        group.prompt
      ].filter(Boolean).join('\n');
    });

    return [header, ...blocks].join('\n\n');
  }, [imagePromptGroups]);

  const proposalPoints = useMemo(() => {
    return pricing.points.map((point) => {
      const result = simulationResults[point.id];
      const persistedPreview = point.proposalSimulationPreview || point.simulacao_preview || '';
      const entornoMetrics = entorno.scoresByPoint[point.id] || entorno.scoresByPoint[String(point.id)] || null;
      const clientMetrics = clientAnalysis.byPoint[point.id] || clientAnalysis.byPoint[String(point.id)] || null;
      return {
        ...point,
        entornoMetrics,
        clientDistanceMeters: clientMetrics?.distanceMeters || null,
        clientDistanceKm: clientMetrics?.distanceKm || null,
        clientProximityScore: clientMetrics?.proximityScore || null,
        proposalSimulationPreview: result?.previewUrl || persistedPreview,
        proposalSimulationStatus: result?.status || (!simulationArtFile ? 'Envie a arte para gerar' : 'Gerar simulação pendente')
      };
    });
  }, [pricing.points, simulationResults, entorno.scoresByPoint, clientAnalysis.byPoint, simulationArtFile]);

  const simulationSummary = useMemo(() => {
    const items = Object.values(simulationResults);
    if (!simulationArtFile) {
      return '';
    }
    if (!items.length) {
      return 'Arte carregada. Ajuste brilho, reflexo, spill de luz e pixel LED para aproximar o look do simulador antes de gerar.';
    }

    const geradas = items.filter((item) => String(item.status || '').startsWith('Gerada')).length;
    const semArea = items.filter((item) => item.status === 'Área da tela não cadastrada no admin').length;
    const semImagem = items.filter((item) => item.status === 'Imagem base do ponto não cadastrada').length;
    const falhas = items.filter((item) => item.status === 'Falha ao gerar').length;

    return [
      `${geradas} simulação${geradas === 1 ? '' : 'ões'} gerada${geradas === 1 ? '' : 's'}`,
      semArea ? `${semArea} ponto${semArea === 1 ? '' : 's'} sem área cadastrada` : null,
      semImagem ? `${semImagem} ponto${semImagem === 1 ? '' : 's'} sem imagem base` : null,
      falhas ? `${falhas} falha${falhas === 1 ? '' : 's'} de processamento` : null,
      `brilho ${simulationSettings.brightness.toFixed(2)}`,
      `reflexo ${simulationSettings.reflection.toFixed(2)}`,
      `pixel LED ${simulationSettings.ledPixelIntensity.toFixed(2)}`,
      `mídia ${mediaParams.mediaMode}`
    ].filter(Boolean).join(' · ');
  }, [simulationArtFile, simulationResults, simulationSettings, mediaParams]);

  const previewablePoints = useMemo(() => {
    const requireGeneratedPreview = !!simulationArtFile;
    return proposalPoints.filter((point) => getPointPreviewUrl(point, requireGeneratedPreview));
  }, [proposalPoints, simulationArtFile]);

  useEffect(() => {
    if (!previewablePoints.length) {
      setActivePreviewPointId(null);
      return;
    }

    const stillExists = previewablePoints.some((point) => point.id === activePreviewPointId);
    if (!stillExists) {
      setActivePreviewPointId(previewablePoints[0].id);
    }
  }, [previewablePoints, activePreviewPointId]);

  const activePreviewPoint = useMemo(() => {
    if (!previewablePoints.length) return null;
    return previewablePoints.find((point) => point.id === activePreviewPointId) || previewablePoints[0];
  }, [previewablePoints, activePreviewPointId]);

  const handleGenerate = () => setWizardStep(5);

  const handleCopyPrompt = async () => {
    if (!imagePrompt) return;
    try {
      await navigator.clipboard.writeText(imagePrompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1800);
    } catch {
      // Fallback: seleciona o texto no textarea visível
      const textarea = promptTextareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        setPromptCopied(true);
        window.setTimeout(() => setPromptCopied(false), 1800);
      } else {
        setSimulationError('Copie manualmente o prompt do campo de texto.');
      }
    }
  };

  const handleExportProposalPdf = async (formatOverride) => {
    const format = formatOverride || pdfFormat;
    setShowPdfFormatPicker(false);
    try {
      setPdfBusy(true);
      const pointsWithEntorno = await ensurePointsWithEntorno(proposalPoints);
      const strategicTopics = String(form.strategicTopics || '')
        .split(/\n+/)
        .map((line) => line.replace(/^[-•\d.)\s]+/, '').trim())
        .filter(Boolean);

      if (format === 'mobile') {
        let mobileOverviewMap = null;
        if (proposalPoints.length > 0) {
          try {
            mobileOverviewMap = await buildSelectionMapDataUrl(pointsWithEntorno, {
              connectPoints: true,
              theme: 'light',
              width: 540,
              height: 400
            });
          } catch {
            mobileOverviewMap = null;
          }
        }
        await generateProposalMobilePdf({
          clientName: form.clientName,
          city: activeCities,
          publico: form.publicos,
          points: pointsWithEntorno,
          totals,
          pricingSummary,
          segmento: form.segmento,
          strategicText: argumentos,
          strategicTopics,
          strategicSubtitle: form.proposalSubtitle,
          simulationSummary,
          overviewMapImage: mobileOverviewMap,
          showImpactSection: pdfSections.impact,
        });
        return;
      }

      const pointMapImages = await Promise.all(
        pointsWithEntorno.map(async (point) => {
          try {
            return await buildSelectionMapDataUrl([point], {
              width: 860,
              height: 440,
              theme: 'light',
              connectPoints: false
            });
          } catch {
            return null;
          }
        })
      );

      let overviewMapImage = null;
      if (pointsWithEntorno.length > 0) {
        try {
          overviewMapImage = await buildSelectionMapDataUrl(pointsWithEntorno, {
            connectPoints: true,
            theme: 'light',
            width: 900,
            height: 500
          });
        } catch {
          overviewMapImage = null;
        }
      }

      await generateProposalPdf({
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        city: activeCities,
        publico: form.publicos,
        objective: form.objetivo,
        points: pointsWithEntorno,
        totals,
        pricingSummary,
        segmento: form.segmento,
        strategicText: argumentos,
        strategicTopics,
        strategicSubtitle: form.proposalSubtitle,
        simulationSummary,
        analysisMode,
        pointMapImages,
        overviewMapImage,
        showMetricsMethodology: pdfSections.methodology,
        showCampaignScore: pdfSections.score,
        showCoverageLayer: pdfSections.coverage,
        showImpactSection: pdfSections.impact
      });
    } catch (error) {
      console.error('[ProposalModal] PDF export failed:', error);
      setSimulationError(error?.message || 'Falha ao gerar o PDF da proposta.');
    } finally {
      setPdfBusy(false);
    }
  };

  // FEAT-11: Gerar texto da proposta com IA
  const handleGerarTextoIA = async () => {
    if (!proposalPoints.length) return;
    setAiTextBusy(true);
    try {
      const pointsPayload = proposalPoints.map(p => ({
        nome: p.nome, tipo: p.tipo, cidade: p.cidade, endereco: p.endereco,
        fluxo: p.fluxo, telas: p.telas, preco: p.precoFinal || p.preco,
        entornoScore: p.entornoMetrics?.coverage_pct || null,
        audienceTags: (p.audience_tags || []).slice(0, 5).map(t => t.label || t.key)
      }));
      const result = await gerarTextoProposta({
        segmento: form.segmento, objetivo: form.objetivo,
        clientName: form.clientName,
        cidade: form.selectedCities[0] || proposalPoints[0]?.cidade || '',
        points: pointsPayload,
        totals: { fluxoTotal: totals.fluxoTotal, valorTotal: totals.valorTotal, cpmEstimado: totals.cpmEstimado }
      });
      const lines = [
        result.justificativa,
        result.argumentoAudiencia,
        ...(result.porQueEstesPoints || [])
      ].filter(Boolean);
      setForm(s => ({ ...s, strategicTopics: lines.join('\n') }));
    } catch (err) {
      if (handleAuthExpired(err, 'Sua sessão expirou antes de gerar os argumentos comerciais. Faça login novamente para evitar perda de créditos/tokens.')) {
        return;
      }
      console.error('[ProposalModal] AI text error:', err.message);
      setSimulationError(err?.message || 'Falha ao gerar argumentos comerciais.');
    } finally {
      setAiTextBusy(false);
    }
  };

  // FEAT-1: Criar link público da proposta
  const handleCompartilhar = async () => {
    setShareBusy(true);
    try {
      const pointsWithEntorno = await ensurePointsWithEntorno(proposalPoints);
      const proposalData = {
        clientName: form.clientName, clientAddress: form.clientAddress,
        segmento: form.segmento, objetivo: form.objetivo,
        strategicTopics: form.strategicTopics,
        strategicText: argumentos,
        points: pointsWithEntorno.map(({ custo_operacional: _co, ...p }) => p),
        totals, pricingSummary
      };

      // Upload simulation preview images to server (convert blob: URLs to permanent URLs)
      if (Array.isArray(proposalData.points)) {
        const uploadTasks = proposalData.points.map(async (point) => {
          const previewUrl = point.proposalSimulationPreview || '';
          if (!previewUrl.startsWith('blob:')) return;
          try {
            const resp = await fetch(previewUrl);
            const blob = await resp.blob();
            const serverUrl = await uploadProposalImage(blob);
            point.proposalSimulationPreview = serverUrl;
          } catch (e) {
            console.warn('[ProposalModal] Failed to upload simulation image for point', point.id, e.message);
            // Clear blob URL so the client doesn't receive a broken URL
            point.proposalSimulationPreview = '';
          }
        });
        await Promise.all(uploadTasks);
      }

      const result = await criarPropostaPublica(proposalData, 7);
      setShareModal(result);
    } catch (err) {
      if (handleAuthExpired(err, 'Sua sessão expirou antes de compartilhar a proposta. Faça login novamente para gerar o link público/PDF com segurança.')) {
        return;
      }
      alert(err.message);
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!shareModal?.url) return;
    navigator.clipboard.writeText(shareModal.url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const qrCanvasRef = useRef(null);

  const handleDownloadQRCard = async () => {
    if (!shareModal?.url) return;
    const W = 800, H = 1000;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Subtle border
    ctx.strokeStyle = '#E5E5E5';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Orange accent bar at top
    ctx.fillStyle = '#E8591A';
    ctx.fillRect(0, 0, W, 6);

    // Load logo
    try {
      const logo = await new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = '/logo-light.png';
      });
      const logoH = 44;
      const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
      ctx.drawImage(logo, (W - logoW) / 2, 50, logoW, logoH);
    } catch { /* skip logo if fails */ }

    // Badge "PROPOSTA COMERCIAL"
    ctx.fillStyle = '#E8591A';
    const badgeText = 'PROPOSTA COMERCIAL';
    ctx.font = 'bold 11px "Poppins", system-ui, sans-serif';
    const badgeW = ctx.measureText(badgeText).width + 24;
    const badgeX = (W - badgeW) / 2;
    const badgeY = 115;
    const badgeH = 24;
    const r = badgeH / 2;
    ctx.beginPath();
    ctx.moveTo(badgeX + r, badgeY);
    ctx.lineTo(badgeX + badgeW - r, badgeY);
    ctx.arcTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + r, r);
    ctx.arcTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - r, badgeY + badgeH, r);
    ctx.lineTo(badgeX + r, badgeY + badgeH);
    ctx.arcTo(badgeX, badgeY + badgeH, badgeX, badgeY + r, r);
    ctx.arcTo(badgeX, badgeY, badgeX + r, badgeY, r);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, W / 2, badgeY + badgeH / 2);

    // Client name
    const clientName = form.clientName || 'Proposta de Mídia';
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 28px "Poppins", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(clientName, W / 2, 160);

    // "Escaneie para visualizar"
    ctx.fillStyle = '#888888';
    ctx.font = '14px "Poppins", system-ui, sans-serif';
    ctx.fillText('Escaneie o QR code para visualizar a proposta', W / 2, 205);

    // QR code from hidden canvas
    const qrEl = qrCanvasRef.current;
    if (qrEl) {
      const qrCanvas = qrEl.querySelector('canvas');
      if (qrCanvas) {
        const qrSize = 280;
        const qrX = (W - qrSize) / 2;
        const qrY = 250;
        // White background for QR
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
        // Border around QR
        ctx.strokeStyle = '#F0F0F0';
        ctx.lineWidth = 1;
        ctx.strokeRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
        ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      }
    }

    // URL below QR
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const displayUrl = shareModal.url.length > 60 ? shareModal.url.slice(0, 60) + '…' : shareModal.url;
    ctx.fillText(displayUrl, W / 2, 560);

    // Divider
    ctx.strokeStyle = '#F0F0F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(100, 600);
    ctx.lineTo(W - 100, 600);
    ctx.stroke();

    // Slogan
    ctx.fillStyle = '#333333';
    ctx.font = 'italic 18px "Poppins", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('"O mundo acontece lá fora."', W / 2, 630);

    // Expiry
    if (shareModal.expires_at) {
      const exp = new Date(shareModal.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      ctx.fillStyle = '#BBBBBB';
      ctx.font = '12px "Poppins", system-ui, sans-serif';
      ctx.fillText(`Válido até ${exp}`, W / 2, 670);
    }

    // Footer
    ctx.fillStyle = '#CCCCCC';
    ctx.font = '10px "Poppins", system-ui, sans-serif';
    ctx.fillText('Intermídia OOH + DOOH — Desde 2007', W / 2, H - 30);

    // Download
    const link = document.createElement('a');
    link.download = `proposta-${(form.clientName || 'qrcode').replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleExportSelectionMap = async () => {
    try {
      setMapBusy(true);
      setMapStatus('');
      setSimulationError('');

      // Use coordinates already geocoded by the client-address analysis (if user ran it),
      // otherwise ask the backend to resolve the address (reliable, avoids CORS issues).
      let exportClientCoords = clientAnalysis.location || null;
      const cleanedClientAddress = String(form.clientAddress || '').trim();

      if (!exportClientCoords && cleanedClientAddress) {
        setMapStatus('Localizando endereço do cliente...');
        try {
          const geoResponse = await fetchClientAddressAnalysis({
            address: cleanedClientAddress,
            pointIds: [],
            cidade: []
          });
          exportClientCoords = geoResponse?.location || null;
        } catch {
          exportClientCoords = null;
        }
        if (!exportClientCoords) {
          setSimulationError('Endereço do cliente não localizado — o mapa será gerado sem ele.');
        }
      }

      setMapStatus('Carregando tiles do mapa...');

      const slugClient = String(form.clientName || 'proposta')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'proposta';

      await downloadSelectionMapPng(proposalPoints, {
        connectPoints: connectMapPoints,
        clientCoords: exportClientCoords,
        theme: 'light',
        width: 1800,
        height: 1000,
        fileName: `mapa-selecao-${slugClient}-${new Date().toISOString().slice(0, 10)}.png`
      });

      setMapStatus('');
    } catch (error) {
      setSimulationError(error?.message || 'Falha ao gerar o print do mapa da selecao.');
      setMapStatus('');
    } finally {
      setMapBusy(false);
    }
  };

  const handleGenerateSimulations = async () => {
    if (!simulationArtUrl) {
      setSimulationError('Selecione a arte da campanha para gerar as simulações.');
      return;
    }

    setSimulationBusy(true);
    setSimulationError('');

    const nextEntries = await Promise.all(proposalSourcePoints.map(async (point) => {
      if (!point.simulacao_tela) {
        return [point.id, { status: 'Área da tela não cadastrada no admin', previewUrl: '' }];
      }
      if (!point.imagem) {
        return [point.id, { status: 'Imagem base do ponto não cadastrada', previewUrl: '' }];
      }

      try {
        const config = parseSimulationConfig(point.simulacao_tela);
        if (!config?.corners) {
          return [point.id, { status: 'Área da tela não cadastrada no admin', previewUrl: '' }];
        }
        const result = await generateSimulationPreview({
          baseImageUrl: point.imagem,
          creativeImageUrl: simulationArtUrl,
          screen: config,
          panelType: point.tipo,
          displaySettings: simulationSettings,
          mediaParams
        });
        const persistedPreviewUrl = await persistSimulationPreview(result.blob, result.previewUrl);
        return [point.id, { status: 'Gerada', previewUrl: persistedPreviewUrl }];
      } catch (error) {
        if (handleAuthExpired(error, 'Sua sessão expirou durante o upload da simulação. Faça login novamente para salvar os previews.')) {
          return [point.id, {
            status: 'Sessão expirada durante upload da simulação',
            previewUrl: '',
            detail: error?.message || 'Sessão expirada'
          }];
        }
        return [point.id, {
          status: 'Falha ao gerar',
          previewUrl: '',
          detail: error?.message || 'Erro desconhecido'
        }];
      }
    }));

    const failed = nextEntries.find(([, value]) => value.status === 'Falha ao gerar');
    if (failed) {
      setSimulationError(failed[1].detail || 'Uma ou mais simulações falharam.');
    }

    clearSimulationResults();
    setSimulationResults(Object.fromEntries(nextEntries));
    setSimulationBusy(false);
  };

  const handleAiArteEscolhida = async (pontoId, urlArte, geracaoId, variacao) => {
    console.log('[handleAiArteEscolhida] START pontoId=', pontoId, 'urlArte=', urlArte);
    const point = proposalSourcePoints.find((p) => String(p.id) === String(pontoId));
    if (!point || !urlArte) {
      console.warn('[handleAiArteEscolhida] SKIP — point not found or no urlArte', { pontoId, foundPoint: !!point, urlArte });
      return;
    }

    // Revoke previous blob URL for this point to avoid leaking object URLs.
    const prevEntry = simulationResults[pontoId];
    if (prevEntry?.previewUrl?.startsWith('blob:')) {
      try { URL.revokeObjectURL(prevEntry.previewUrl); } catch { /* ignore */ }
    }

    if (!point.simulacao_tela || !point.imagem) {
      console.warn('[handleAiArteEscolhida] SEM TELA/IMAGEM pontoId=', pontoId, { simulacao_tela: !!point.simulacao_tela, imagem: !!point.imagem });
      // When the point has no screen image (imagem), applying the arte as preview
      // would replace the facade photo (imagem2) with the raw banner — wrong.
      // Leave previewUrl empty so the system falls back to imagem2 naturally.
      setSimulationResults((current) => ({
        ...current,
        [point.id]: {
          status: !point.imagem
            ? 'Arte IA gerada (ponto sem foto da tela — exibindo fachada)'
            : 'Arte IA gerada (sem simulação: área da tela não cadastrada)',
          previewUrl: '',
          geracaoId,
          variacao
        }
      }));
      return;
    }

    try {
      const config = parseSimulationConfig(point.simulacao_tela);
      console.log('[handleAiArteEscolhida] CONFIG pontoId=', pontoId, { hasCorners: !!config?.corners, hasFaces: !!config?.faces });
      if (!config?.corners && !config?.faces) {
        console.warn('[handleAiArteEscolhida] SEM CORNERS/FACES pontoId=', pontoId);
        setSimulationResults((current) => ({
          ...current,
          [point.id]: {
            status: 'Arte IA gerada (sem simulação: área não cadastrada)',
            previewUrl: urlArte,
            geracaoId,
            variacao
          }
        }));
        return;
      }

      console.log('[handleAiArteEscolhida] GENERATING SIMULATION pontoId=', pontoId, { baseImageUrl: point.imagem, creativeImageUrl: urlArte });
      const result = await generateSimulationPreview({
        baseImageUrl: point.imagem,
        creativeImageUrl: urlArte,
        screen: config,
        panelType: point.tipo,
        displaySettings: simulationSettings,
        mediaParams
      });

      const persistedPreviewUrl = await persistSimulationPreview(result.blob, result.previewUrl);

      console.log('[handleAiArteEscolhida] SUCCESS pontoId=', pontoId, { previewUrl: persistedPreviewUrl?.substring(0, 60) });
      setSimulationResults((current) => ({
        ...current,
        [point.id]: {
          status: 'Gerada (IA)',
          previewUrl: persistedPreviewUrl,
          geracaoId,
          variacao
        }
      }));
    } catch (error) {
      if (handleAuthExpired(error, 'Sua sessão expirou durante o upload da simulação IA. Faça login novamente para salvar os previews.')) {
        return;
      }
      console.error('[handleAiArteEscolhida] ERROR pontoId=', pontoId, error?.message || error);
      setSimulationResults((current) => ({
        ...current,
        [point.id]: {
          status: 'Arte IA gerada (falha na simulação)',
          previewUrl: urlArte,
          detail: error?.message || 'Erro desconhecido',
          geracaoId,
          variacao
        }
      }));
      setSimulationError(error?.message || 'Falha ao aplicar arte IA na simulação do ponto.');
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className={`absolute inset-0 backdrop-blur-md ${isDark ? 'bg-black/70' : 'bg-white/45'}`} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={`proposal-modal-shell relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl border ${isDark ? 'border-white/15 bg-gradient-to-b from-[#11141b] via-[#0d1016] to-[#090c11] shadow-[0_30px_120px_rgba(0,0,0,0.75)]' : 'border-neutral-200 bg-gradient-to-b from-[#ffffff] via-[#fbfcfe] to-[#f3f5f8] shadow-[0_26px_80px_rgba(148,163,184,0.28)]'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`pointer-events-none absolute inset-0 rounded-3xl ${isDark ? 'bg-[radial-gradient(circle_at_15%_5%,rgba(254,92,43,0.12),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(255,255,255,0.07),transparent_28%)]' : 'bg-[radial-gradient(circle_at_12%_4%,rgba(254,92,43,0.16),transparent_36%),radial-gradient(circle_at_94%_0%,rgba(254,92,43,0.10),transparent_32%)]'}`} />

          <button
            onClick={onClose}
            className={`absolute top-4 right-4 z-10 p-2.5 rounded-full border transition-all ${isDark ? 'border-white/10 bg-black/35 hover:bg-black/60 text-white/70 hover:text-white' : 'border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'}`}
          >
            <X size={18} />
          </button>

          {/* ── Header + Stepper ── */}
          <div className="relative flex-shrink-0 p-6 md:px-8 md:pt-8 md:pb-0 space-y-5">
            <div className="flex flex-wrap items-start gap-4 pr-10">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-brand-orange/15 border border-brand-orange/30 shadow-[0_8px_30px_rgba(254,92,43,0.2)]' : 'bg-orange-50 border border-orange-200'}`}>
                <FileText size={22} className={isDark ? 'text-brand-orange' : 'text-orange-600'} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className={`text-xl md:text-2xl leading-tight font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  Proposta Comercial
                </h2>
                <p className={`text-sm mt-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                  {STEP_TITLES[wizardStep]}
                </p>
              </div>
              <div className={`rounded-xl border px-3 py-2 text-right ${isDark ? 'border-white/10 bg-black/30' : 'border-neutral-200 bg-neutral-50'}`}>
                <div className={`text-[10px] uppercase tracking-wide ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Pontos</div>
                <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{proposalSourcePoints.length}</div>
              </div>
            </div>

            {/* ── Stepper ── */}
            <div className="flex items-center gap-1">
              {WIZARD_STEPS.map((ws, idx) => {
                const done = wizardStep > ws.id;
                const active = wizardStep === ws.id;
                return (
                  <div key={ws.id} className="flex items-center flex-1 last:flex-initial">
                    <button
                      type="button"
                      onClick={() => { if (done) setWizardStep(ws.id); }}
                      className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-brand-orange text-white shadow-[0_4px_16px_rgba(254,92,43,0.35)]'
                          : done
                            ? isDark
                              ? 'bg-brand-orange/15 text-brand-orange cursor-pointer hover:bg-brand-orange/25'
                              : 'bg-orange-50 text-orange-700 cursor-pointer hover:bg-orange-100'
                            : isDark
                              ? 'bg-white/[0.06] text-brand-gray-500'
                              : 'bg-neutral-100 text-neutral-400'
                      }`}
                    >
                      {done ? <Check size={13} /> : <span>{ws.id}</span>}
                      <span className="hidden sm:inline">{ws.label}</span>
                    </button>
                    {idx < WIZARD_STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-1.5 ${done ? (isDark ? 'bg-brand-orange/40' : 'bg-orange-300') : isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Step content (scrollable) ── */}
          <div className="relative flex-1 overflow-y-auto p-6 md:px-8 md:pb-4 space-y-6">
            <AnimatePresence mode="wait">
              {/* ═══ STEP 1 — Dados da proposta ═══ */}
              {wizardStep === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* CARD 1 — Informações do cliente */}
                  <Card isDark={isDark} title="Informações do cliente">
                    <div className="grid md:grid-cols-2 gap-3">
                      <Input isDark={isDark} label="Nome do cliente" value={form.clientName} onChange={(v) => setForm((s) => ({ ...s, clientName: v }))} />
                      <Input isDark={isDark} label="Endereço do cliente" value={form.clientAddress} onChange={(v) => setForm((s) => ({ ...s, clientAddress: v }))} />
                    </div>
                    <Input isDark={isDark} label="Subtítulo da capa (opcional)" value={form.proposalSubtitle} onChange={(v) => setForm((s) => ({ ...s, proposalSubtitle: v }))} />
                  </Card>

                  {/* CARD 2 — Configuração da campanha */}
                  <Card isDark={isDark} title="Configuração da campanha">
                    <div className="grid md:grid-cols-2 gap-3">
                      <CustomSelect isDark={isDark} label="Praças" value={form.selectedCities} onChange={(v) => setForm((s) => ({ ...s, selectedCities: v }))} options={availableCities} multiple placeholder="Todas as praças" />
                      <CustomSelect isDark={isDark} label="Segmento" value={form.segmento} onChange={(v) => setForm((s) => ({ ...s, segmento: v }))} options={SEGMENTOS.map((seg) => ({ value: seg, label: getSegmentDisplayName(seg) }))} allowCustom customPlaceholder="Segmento personalizado" />
                      <CustomSelect isDark={isDark} label="Objetivo" value={form.objetivo} onChange={(v) => setForm((s) => ({ ...s, objetivo: v }))} options={OBJETIVOS} allowCustom customPlaceholder="Objetivo personalizado" />
                      <CustomSelect isDark={isDark} label="Públicos" value={form.publicos} onChange={(v) => setForm((s) => ({ ...s, publicos: v }))} options={availablePublicos} multiple placeholder="Públicos estratégicos" />
                    </div>
                  </Card>

                  {/* CARD 3 — Estratégia da campanha */}
                  <Card isDark={isDark} title="Estratégia da campanha">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Esses tópicos aparecem na narrativa estratégica do PDF.</p>
                      <button
                        type="button"
                        onClick={handleGerarTextoIA}
                        disabled={aiTextBusy || !proposalPoints.length}
                        className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${isDark ? 'bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25 border border-brand-orange/25' : 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'}`}
                      >
                        {aiTextBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {aiTextBusy ? 'Gerando...' : 'Gerar com IA'}
                      </button>
                    </div>
                    <textarea
                      value={form.strategicTopics}
                      onChange={(e) => setForm((s) => ({ ...s, strategicTopics: e.target.value }))}
                      rows={3}
                      placeholder={argumentos.join('\n')}
                      className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'border-white/15 bg-white/[0.07] text-brand-gray-200 focus:border-brand-orange/45 focus:bg-white/[0.09]' : 'border-neutral-200 bg-white text-neutral-800 focus:border-brand-orange/50'}`}
                    />
                    <p className={`text-[11px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Se vazio, usaremos os argumentos gerados automaticamente.</p>
                  </Card>

                  {/* CARD 4 — Análise de entorno */}
                  <Card isDark={isDark} title="Análise de entorno">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <ScopeButton isDark={isDark} active={analysisMode === 'segmento'} onClick={() => setAnalysisMode('segmento')}>Entorno padrão</ScopeButton>
                      <ScopeButton isDark={isDark} active={analysisMode === 'client-address'} onClick={() => setAnalysisMode('client-address')}>Entorno personalizado</ScopeButton>
                      <button
                        type="button"
                        onClick={handleRefreshEntorno}
                        disabled={entorno.loading}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
                      >
                        {entorno.loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        {entorno.loading ? 'Atualizando...' : 'Atualizar agora'}
                      </button>
                      {entorno.loading && <span className="text-xs text-brand-orange">Atualizando...</span>}
                    </div>

                    {analysisMode === 'segmento' && (
                      <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                        Atualização manual · Score por segmento · Cache {(entorno.coverage * 100).toFixed(0)}%
                        {entorno.updatedAt ? ` · ${new Date(entorno.updatedAt).toLocaleString('pt-BR')}` : ''}
                      </p>
                    )}

                    {analysisMode === 'client-address' && (
                      <div className={`text-xs space-y-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                        {clientAnalysis.loading && <p className="text-brand-orange">Analisando proximidade...</p>}
                        {clientAnalysis.error && <p className="text-red-300">{clientAnalysis.error}</p>}
                        {!clientAnalysis.loading && !clientAnalysis.error && form.clientAddress.trim() && clientAnalysis.rankedPoints.length > 0 && (
                          <div className="space-y-1">
                            <p className={`font-semibold uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Pontos mais próximos</p>
                            {clientAnalysis.rankedPoints.slice(0, 3).map((pt) => (
                              <p key={pt.id}>{pt.nome} · {pt.distanceKm.toFixed(1).replace('.', ',')} km</p>
                            ))}
                          </div>
                        )}
                        {!form.clientAddress.trim() && <p>Preencha o endereço do cliente acima.</p>}
                      </div>
                    )}
                    {entorno.error && <p className="text-xs text-red-300">{entorno.error}</p>}
                  </Card>
                </motion.div>
              )}

              {/* ═══ STEP 2 — Desconto comercial ═══ */}
              {wizardStep === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">
                  <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
                    {/* LEFT — Tipo de desconto */}
                    <Card isDark={isDark} title="Tipo de desconto">
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['none', 'Sem desconto'],
                          ['total', 'No total da proposta'],
                          ['specific', 'Em pontos específicos'],
                          ['individual', 'Individual por ponto']
                        ].map(([mode, label]) => (
                          <ScopeButton isDark={isDark} key={mode} active={discountConfig.mode === mode} onClick={() => setDiscountConfig((c) => ({ ...c, mode }))}>{label}</ScopeButton>
                        ))}
                      </div>

                      {(discountConfig.mode === 'total' || discountConfig.mode === 'specific') && (
                        <div className="space-y-3 mt-3">
                          <Input isDark={isDark} label="Percentual de desconto" value={discountConfig.percentage} onChange={(v) => setDiscountConfig((c) => ({ ...c, percentage: v.replace(',', '.') }))} />

                          {discountConfig.mode === 'specific' && (
                            <div className={`rounded-xl border p-3 space-y-2 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
                              <p className={`text-[11px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Pontos com desconto</p>
                              {proposalSourcePoints.map((pt) => (
                                <label key={pt.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-white/10 text-brand-gray-300' : 'border-neutral-200 text-neutral-600'}`}>
                                  <span>{pt.nome}</span>
                                  <input
                                    type="checkbox"
                                    checked={discountConfig.targetPointIds.includes(pt.id)}
                                    onChange={(e) => {
                                      setDiscountConfig((c) => ({
                                        ...c,
                                        targetPointIds: e.target.checked
                                          ? [...c.targetPointIds, pt.id]
                                          : c.targetPointIds.filter((i) => i !== pt.id)
                                      }));
                                    }}
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {discountConfig.mode === 'individual' && (
                        <div className="grid md:grid-cols-2 gap-3 mt-3">
                          {proposalSourcePoints.map((pt) => (
                            <div key={pt.id} className={`rounded-xl border px-3 py-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{pt.nome}</p>
                                  <p className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Tabela: {formatCurrency(pt.preco)}</p>
                                </div>
                                <input
                                  type="number" min={0} max={100} step={0.1}
                                  value={discountConfig.perPoint[pt.id] || ''}
                                  onChange={(e) => setDiscountConfig((c) => ({ ...c, perPoint: { ...c.perPoint, [pt.id]: e.target.value } }))}
                                  className={`w-24 rounded-lg border px-3 py-2 text-sm outline-none ${isDark ? 'border-white/10 bg-white/5 text-white focus:border-brand-orange/40' : 'border-neutral-200 bg-white text-neutral-800 focus:border-brand-orange/50'}`}
                                  placeholder="0%"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>

                    {/* RIGHT — Resumo financeiro */}
                    <div className={`rounded-2xl border p-5 space-y-4 sticky top-0 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
                      <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Resumo financeiro</h3>
                      <div className="space-y-3">
                        <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-white'}`}>
                          <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Tabela cheia</div>
                          <div className={`text-xl font-bold mt-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>{formatCurrency(pricingSummary.originalTotal)}</div>
                        </div>
                        <div className={`rounded-xl border p-3 ${isDark ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-yellow-200 bg-yellow-50'}`}>
                          <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Desconto total</div>
                          <div className={`text-xl font-bold mt-1 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>{formatCurrency(pricingSummary.discountTotal)}</div>
                        </div>
                        <div className={`rounded-2xl border-2 p-4 ${isDark ? 'border-green-500/30 bg-green-500/5' : 'border-green-300 bg-green-50'}`}>
                          <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Valor final</div>
                          <div className={`text-3xl font-extrabold mt-1 ${isDark ? 'text-green-400' : 'text-green-600'}`}>{formatCurrency(pricingSummary.finalTotal)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ═══ STEP 3 — Arte da campanha ═══ */}
              {wizardStep === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* BLOCO 1 — Prompt da arte (colapsável) */}
                  <Card isDark={isDark}>
                    <button type="button" onClick={() => setPromptExpanded(!promptExpanded)} className="w-full flex items-center justify-between gap-3">
                      <div className="text-left">
                        <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Prompt da arte</h3>
                        <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                          A campanha possui {imagePromptGroups.length} formato{imagePromptGroups.length !== 1 ? 's' : ''} de tela. Um prompt foi gerado automaticamente para cada formato.
                        </p>
                      </div>
                      <ChevronDown size={18} className={`shrink-0 transition-transform ${isDark ? 'text-brand-gray-400' : 'text-neutral-400'} ${promptExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {promptExpanded && (
                      <div className="mt-4 space-y-3">
                        {imagePromptGroups.map((group, idx) => (
                          <div key={idx} className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
                            <p className={`text-[11px] uppercase tracking-wide font-semibold mb-2 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                              {group.width}x{group.height}{group.aspectRatio ? ` · ${group.aspectRatio}` : ''}
                            </p>
                            <textarea ref={idx === 0 ? promptTextareaRef : undefined} value={group.prompt} readOnly rows={4} className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${isDark ? 'border-white/10 bg-white/5 text-brand-gray-200' : 'border-neutral-200 bg-white text-neutral-700'}`} />
                          </div>
                        ))}
                        <button type="button" onClick={handleCopyPrompt} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-white/[0.08] transition-colors ${isDark ? 'border-white/15 bg-white/[0.03] text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}>
                          {promptCopied ? <Check size={15} /> : <Copy size={15} />}
                          {promptCopied ? 'Copiado!' : 'Copiar prompt'}
                        </button>
                      </div>
                    )}
                  </Card>

                  {/* BLOCO 2 — Arte e preview (2 colunas) */}
                  <div className="grid lg:grid-cols-2 gap-5">
                    {/* Coluna esquerda — Upload */}
                    <Card isDark={isDark} title="Arte da campanha">
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const file = e.dataTransfer.files?.[0];
                          if (file && file.type.startsWith('image/')) {
                            setSimulationArtFile(file);
                            setSimulationError('');
                            clearSimulationResults();
                          }
                        }}
                        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${isDark ? 'border-white/15 hover:border-brand-orange/30' : 'border-neutral-300 hover:border-brand-orange/40'}`}
                      >
                        <Upload size={24} className={`mx-auto mb-2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
                        <p className={`text-sm mb-3 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Arraste a arte ou clique para selecionar</p>
                        <label className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm cursor-pointer transition-colors ${isDark ? 'border-white/15 bg-white/5 text-brand-gray-300 hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                          <ImageIcon size={16} />
                          {simulationArtFile ? simulationArtFile.name : 'Escolher arte da campanha'}
                          <input type="file" accept="image/*" onChange={(e) => { setSimulationArtFile(e.target.files?.[0] || null); setSimulationError(''); clearSimulationResults(); }} className="hidden" />
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={handleGenerateSimulations}
                        disabled={simulationBusy || !proposalSourcePoints.length}
                        className="w-full orange-solid-btn h-11 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover disabled:opacity-50 shadow-[0_10px_24px_rgba(254,92,43,0.28)] mt-3"
                      >
                        {simulationBusy ? 'Gerando simulações...' : 'Gerar simulações'}
                      </button>
                    </Card>

                    {/* Coluna direita — Preview */}
                    <Card isDark={isDark} title="Preview da arte">
                      {simulationArtUrl ? (
                        <img src={simulationArtUrl} alt="Arte da campanha" className="w-full h-56 object-contain rounded-lg" />
                      ) : (
                        <div className={`h-56 rounded-xl border border-dashed flex items-center justify-center text-sm ${isDark ? 'border-white/15 text-brand-gray-500 bg-black/20' : 'border-neutral-300 text-neutral-400 bg-neutral-50'}`}>
                          Nenhuma arte selecionada
                        </div>
                      )}
                    </Card>
                  </div>

                  {simulationError && (
                    <p className={`text-xs rounded-lg border px-3 py-2 ${isDark ? 'text-red-300 border-red-500/20 bg-red-500/10' : 'text-red-600 border-red-300 bg-red-50'}`}>{simulationError}</p>
                  )}

                  {/* Geração de arte IA por ponto (usa a área de tela já marcada no admin) */}
                  <ArteAIPanel
                    points={proposalPoints}
                    segmento={form.segmento}
                    cidade={activeCities}
                    clientName={form.clientName}
                    propostaId={null}
                    isDark={isDark}
                    onArteEscolhida={handleAiArteEscolhida}
                  />

                  {/* BLOCO 3 — Status da campanha */}
                  <div className="grid sm:grid-cols-3 gap-3">
                    <StatusCard isDark={isDark} label="Pontos na proposta" value={proposalSourcePoints.length} tone="default" />
                    <StatusCard isDark={isDark} label="Simulações geradas" value={Object.values(simulationResults).filter((i) => String(i.status || '').startsWith('Gerada')).length} tone="success" />
                    <StatusCard isDark={isDark} label="Pendências de cadastro" value={Object.values(simulationResults).filter((i) => i.status === 'Área da tela não cadastrada no admin' || i.status === 'Imagem base do ponto não cadastrada').length} tone="warning" />
                  </div>

                  {/* ── Seletor de Tipo de Mídia ── */}
                  <Card isDark={isDark}>
                    <div className="flex items-center gap-2 mb-3">
                      <Radio size={15} className={isDark ? 'text-brand-gray-400' : 'text-neutral-500'} />
                      <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Tipo de mídia</h3>
                    </div>

                    {/* Botões LED / Backlight / Frontlight */}
                    <div className="flex gap-2 mb-4">
                      {[
                        { key: 'led',        label: 'LED',        desc: 'Emissão direta de luz' },
                        { key: 'backlight',  label: 'Backlight',  desc: 'Lona iluminada por trás' },
                        { key: 'frontlight', label: 'Frontlight', desc: 'Lona com holofote frontal' }
                      ].map(({ key, label, desc }) => {
                        const active = mediaParams.mediaMode === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setMediaParams((p) => ({ ...p, mediaMode: key }))}
                            className={`flex-1 rounded-xl border px-3 py-2.5 text-center transition-all ${
                              active
                                ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                                : isDark
                                  ? 'border-white/10 bg-white/[0.03] text-brand-gray-400 hover:border-white/20 hover:text-white'
                                  : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 hover:text-neutral-800'
                            }`}
                          >
                            <div className="text-xs font-semibold">{label}</div>
                            <div className={`text-[10px] mt-0.5 ${active ? 'text-brand-orange/80' : isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{desc}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Parâmetros comuns a backlight e frontlight */}
                    {mediaParams.mediaMode !== 'led' && (
                      <div className="space-y-4">
                        {/* Temperatura de cor */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <label className={`text-[11px] uppercase tracking-wide ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Temperatura de cor</label>
                            <div className="flex gap-1.5">
                              {[
                                { k: 3000, label: 'Quente', color: '#ffb347' },
                                { k: 4000, label: 'Neutro', color: '#ffe0b0' },
                                { k: 6500, label: 'Frio',   color: '#b0c8ff' }
                              ].map(({ k, label, color }) => (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() => setMediaParams((p) => ({ ...p, colorTemp: k }))}
                                  className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                                    mediaParams.colorTemp === k
                                      ? 'border-transparent text-black'
                                      : isDark
                                        ? 'border-white/10 text-brand-gray-400 bg-white/[0.04] hover:border-white/20'
                                        : 'border-neutral-200 text-neutral-500 bg-neutral-50 hover:border-neutral-300'
                                  }`}
                                  style={mediaParams.colorTemp === k ? { backgroundColor: color } : {}}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <SliderField
                            isDark={isDark}
                            label="Intensidade da luz"
                            value={Math.round(mediaParams.lightIntensity * 100)}
                            min={0} max={100} step={1}
                            onChange={(v) => setMediaParams((p) => ({ ...p, lightIntensity: v / 100 }))}
                          />
                          <SliderField
                            isDark={isDark}
                            label="Textura do tecido"
                            value={Math.round(mediaParams.textureIntensity * 100)}
                            min={0} max={100} step={1}
                            onChange={(v) => setMediaParams((p) => ({ ...p, textureIntensity: v / 100 }))}
                          />
                        </div>

                        {/* Ângulo da luz — apenas frontlight */}
                        {mediaParams.mediaMode === 'frontlight' && (
                          <div className="grid md:grid-cols-2 gap-4">
                            <SliderField
                              isDark={isDark}
                              label="Ângulo da luz (°)"
                              value={mediaParams.lightAngle}
                              min={0} max={180} step={5}
                              onChange={(v) => setMediaParams((p) => ({ ...p, lightAngle: v }))}
                            />
                            <div className="flex items-center gap-3 pt-5">
                              <button
                                type="button"
                                onClick={() => setMediaParams((p) => ({ ...p, worn: !p.worn }))}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${mediaParams.worn ? 'bg-brand-orange' : isDark ? 'bg-white/10' : 'bg-neutral-200'}`}
                              >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${mediaParams.worn ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                              <label className={`text-[11px] uppercase tracking-wide cursor-pointer ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} onClick={() => setMediaParams((p) => ({ ...p, worn: !p.worn }))}>
                                Material usado
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>

                  {/* Ajustes avançados (colapsável) */}
                  <Card isDark={isDark}>
                    <button type="button" onClick={() => setAdvancedRealismOpen(!advancedRealismOpen)} className="w-full flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Settings2 size={16} className={isDark ? 'text-brand-gray-400' : 'text-neutral-500'} />
                        <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Ajustes avançados{mediaParams.mediaMode !== 'led' ? ' (LED)' : ''}</h3>
                      </div>
                      <ChevronDown size={18} className={`shrink-0 transition-transform ${isDark ? 'text-brand-gray-400' : 'text-neutral-400'} ${advancedRealismOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {advancedRealismOpen && (
                      <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                        <SliderField isDark={isDark} label="Brilho da tela" value={simulationSettings.brightness} min={0.7} max={1.8} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, brightness: v }))} />
                        <SliderField isDark={isDark} label="Reflexo do vidro" value={simulationSettings.reflection} min={0} max={0.55} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, reflection: v }))} />
                        <SliderField isDark={isDark} label="Vazamento de luz" value={simulationSettings.spill} min={0} max={0.45} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, spill: v }))} />
                        <SliderField isDark={isDark} label="Intensidade dos pixels" value={simulationSettings.ledPixelIntensity} min={0} max={0.45} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, ledPixelIntensity: v }))} />
                        <SliderField isDark={isDark} label="Tamanho do pixel LED" value={simulationSettings.ledPixelSize} min={3} max={14} step={1} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, ledPixelSize: v }))} />
                        <SliderField isDark={isDark} label="Glare / luz especular" value={simulationSettings.glare} min={0} max={0.4} step={0.01} onChange={(v) => setSimulationSettings((c) => normalizeDisplaySettings({ ...c, glare: v }))} />
                      </div>
                    )}
                  </Card>
                </motion.div>
              )}

              {/* ═══ STEP 4 — Revisão ═══ */}
              {wizardStep === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* Resumo da proposta */}
                  <Card isDark={isDark} title="Resumo da proposta">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <MiniStat isDark={isDark} label="Cliente" value={form.clientName || '—'} />
                      <MiniStat isDark={isDark} label="Cidades" value={activeCities.join(', ') || 'Todas'} />
                      <MiniStat isDark={isDark} label="Segmento" value={getSegmentDisplayName(form.segmento)} />
                      <MiniStat isDark={isDark} label="Públicos" value={form.publicos.length ? form.publicos.join(', ') : 'Todos'} />
                      <MiniStat isDark={isDark} label="Pontos" value={proposalPoints.length} />
                    </div>
                  </Card>

                  {/* Tabela de pontos */}
                  <Card isDark={isDark} title="Pontos da campanha">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={`text-[11px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
                            <th className="text-left pb-3 pr-3">Ponto</th>
                            <th className="text-left pb-3 pr-3">Simulação</th>
                            <th className="text-left pb-3 pr-3">Cidade</th>
                            <th className="text-left pb-3 pr-3">Tipo</th>
                            <th className="text-right pb-3">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {proposalPoints.map((pt) => {
                            const previewUrl = getPointPreviewUrl(pt, !!simulationArtFile);
                            const hasPreview = !!previewUrl;
                            return (
                              <tr key={pt.id} className={`border-t ${!hasPreview ? (isDark ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-yellow-200 bg-yellow-50') : (isDark ? 'border-white/[0.06]' : 'border-neutral-100')}`}>
                                <td className={`py-2.5 pr-3 font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>{pt.nome}</td>
                                <td className="py-2.5 pr-3">
                                  {hasPreview ? (
                                    <div className={`w-16 h-10 rounded-md overflow-hidden border ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
                                      <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                                    </div>
                                  ) : (
                                    <span className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>Sem simulação</span>
                                  )}
                                </td>
                                <td className={`py-2.5 pr-3 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{pt.cidade}</td>
                                <td className={`py-2.5 pr-3 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{pt.tipo}</td>
                                <td className={`py-2.5 text-right font-semibold ${isDark ? 'text-brand-orange' : 'text-brand-orange'}`}>{formatCurrency(pt.finalPrice ?? pt.preco)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  {/* Preview ampliado */}
                  <PreviewPanel proposalPoints={proposalPoints} activePreviewPoint={activePreviewPoint} onSelect={setActivePreviewPointId} onExpand={() => setShowPreviewLightbox(true)} requireGeneratedPreview={!!simulationArtFile} isDark={isDark} />
                </motion.div>
              )}

              {/* ═══ STEP 5 — Gerar proposta ═══ */}
              {wizardStep === 5 && (
                <motion.div key="step5" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* Seções opcionais do PDF (cards selecionáveis) */}
                  <Card isDark={isDark} title="Seções do PDF">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {[
                        { key: 'methodology', label: 'Como ler as métricas', Icon: BarChart3 },
                        { key: 'score', label: 'Score da campanha', Icon: Trophy },
                        { key: 'coverage', label: 'Cobertura e presença', Icon: Radio },
                        { key: 'impact', label: 'Impacto da campanha', Icon: Zap },
                        { key: 'mapPrint', label: 'Print do mapa da seleção', Icon: Map }
                      ].map(({ key, label, Icon }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPdfSections((s) => ({ ...s, [key]: !s[key] }))}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition-all ${
                            pdfSections[key]
                              ? isDark
                                ? 'border-brand-orange/40 bg-brand-orange/10 text-brand-orange shadow-[0_2px_8px_rgba(254,92,43,0.12)]'
                                : 'border-orange-300 bg-orange-50 text-orange-700 shadow-[0_2px_8px_rgba(254,92,43,0.08)]'
                              : isDark
                                ? 'border-white/10 bg-white/[0.03] text-brand-gray-400 hover:bg-white/[0.06]'
                                : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                          }`}
                        >
                          <Icon size={18} className={pdfSections[key] ? (isDark ? 'text-brand-orange' : 'text-orange-600') : isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />
                          <span>{label}</span>
                          {pdfSections[key] && <Check size={14} className={`ml-auto ${isDark ? 'text-brand-orange' : 'text-orange-600'}`} />}
                        </button>
                      ))}
                    </div>
                  </Card>

                  {/* Mapa */}
                  <Card isDark={isDark} title="Print do mapa">
                    <div className="flex flex-wrap items-center gap-4">
                      <label className={`inline-flex items-center gap-2 text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                        <input type="checkbox" checked={connectMapPoints} onChange={(e) => setConnectMapPoints(e.target.checked)} className={`h-4 w-4 rounded ${isDark ? 'border-white/20 bg-white/5' : 'border-neutral-300 bg-white'}`} />
                        Linhas de conexão entre pontos
                      </label>
                      <button
                        onClick={handleExportSelectionMap}
                        disabled={mapBusy || !proposalPoints.length}
                        className={`h-10 px-4 rounded-xl border font-medium inline-flex items-center gap-2 disabled:opacity-50 transition-colors ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange' : 'border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700'}`}
                      >
                        <Route size={16} />
                        {mapBusy ? 'Aguarde...' : 'Baixar print do mapa'}
                      </button>
                    </div>
                    {mapBusy && mapStatus && (
                      <p className="text-xs text-brand-orange/80 flex items-center gap-1.5 mt-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-brand-orange/60 border-t-brand-orange animate-spin" />
                        {mapStatus}
                      </p>
                    )}
                  </Card>

                  {/* Ações principais */}
                  <div className="space-y-3">
                    {simulationError && (
                      <p className={`text-xs rounded-lg border px-3 py-2 ${isDark ? 'text-red-300 border-red-500/20 bg-red-500/10' : 'text-red-600 border-red-300 bg-red-50'}`}>{simulationError}</p>
                    )}

                    {/* PDF export — split button with format picker */}
                    <div className="relative" ref={pdfFormatPickerRef}>
                      <div className={`flex h-12 rounded-xl overflow-hidden shadow-[0_10px_24px_rgba(254,92,43,0.28)] ${pdfBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                        {/* Main generate button */}
                        <button
                          onClick={() => handleExportProposalPdf()}
                          disabled={pdfBusy}
                          className="flex-1 orange-solid-btn bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-base inline-flex items-center justify-center gap-2 transition-colors"
                        >
                          <Download size={18} />
                          {pdfBusy
                            ? 'Gerando PDF...'
                            : pdfFormat === 'mobile' ? 'Exportar PDF mobile' : 'Exportar PDF da proposta'}
                        </button>
                        {/* Format picker toggle */}
                        <button
                          onClick={() => setShowPdfFormatPicker((v) => !v)}
                          disabled={pdfBusy}
                          className="px-3 bg-brand-orange hover:bg-brand-orange-hover text-white transition-colors"
                          style={{ borderLeft: '1px solid rgba(255,255,255,0.20)' }}
                          aria-label="Escolher formato do PDF"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>

                      {/* Dropdown */}
                      {showPdfFormatPicker && (
                        <div
                          className="absolute left-0 right-0 mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden"
                          style={{ background: isDark ? '#1A1A1A' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB'}` }}
                        >
                          <div className="px-4 pt-3 pb-1">
                            <p className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>Formato do PDF</p>
                          </div>
                          {[
                            { value: 'desktop', label: 'Versão padrão', sub: 'Layout horizontal — desktop e apresentações' },
                            { value: 'mobile', label: 'Versão mobile', sub: 'Layout vertical 9:16 — leitura no celular' },
                          ].map(({ value, label, sub }) => {
                            const sel = pdfFormat === value;
                            return (
                              <button
                                key={value}
                                onClick={() => { setPdfFormat(value); setShowPdfFormatPicker(false); handleExportProposalPdf(value); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${sel ? (isDark ? 'bg-brand-orange/10' : 'bg-orange-50') : ''}`}
                              >
                                <span className={`text-sm font-semibold ${sel ? 'text-brand-orange' : isDark ? 'text-white' : 'text-neutral-800'}`}>{label}</span>
                                <span className={`text-xs ml-1 ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>{sub}</span>
                                {sel && <Check size={14} className="ml-auto text-brand-orange flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Modo cliente toggle */}
                    <label className={`inline-flex items-center gap-2 text-sm cursor-pointer select-none ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
                      <div
                        onClick={() => setClientModePresentation(v => !v)}
                        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${clientModePresentation ? 'bg-brand-orange' : isDark ? 'bg-white/15' : 'bg-neutral-300'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${clientModePresentation ? 'translate-x-4' : ''}`} />
                      </div>
                      Modo cliente <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>(oculta dados internos)</span>
                    </label>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <button onClick={() => setShowPresentation(true)} className={`h-11 rounded-xl border font-medium inline-flex items-center justify-center gap-2 transition-colors ${isDark ? 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                        <Presentation size={16} />
                        Modo apresentação
                      </button>
                      <button onClick={() => setShowQuickPresentation(true)} className={`h-11 rounded-xl border font-medium inline-flex items-center justify-center gap-2 transition-colors ${isDark ? 'border-brand-orange/35 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange' : 'border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700'}`}>
                        <Presentation size={16} />
                        Apresentação rápida
                      </button>
                    </div>

                    {/* Compartilhar — link público */}
                    <button
                      onClick={handleCompartilhar}
                      disabled={shareBusy || !proposalPoints.length}
                      className={`w-full h-11 rounded-xl border font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${isDark ? 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                    >
                      {shareBusy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                      {shareBusy ? 'Gerando link...' : 'Compartilhar proposta'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Navigation footer ── */}
          <div className={`relative flex-shrink-0 flex items-center justify-between gap-3 border-t p-4 md:px-8 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-neutral-50/80'}`}>
            <button
              type="button"
              onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
              disabled={wizardStep === 1}
              className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-medium transition-colors disabled:opacity-30 ${isDark ? 'border-white/15 text-white hover:bg-white/[0.06]' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'}`}
            >
              <ChevronLeft size={16} />
              Voltar
            </button>

            <div className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
              {wizardStep} de {WIZARD_STEPS.length}
            </div>

            {wizardStep < 4 && (
              <button
                type="button"
                onClick={() => setWizardStep((s) => Math.min(5, s + 1))}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-hover shadow-[0_6px_20px_rgba(254,92,43,0.25)] transition-colors"
              >
                Próximo
                <ChevronRight size={16} />
              </button>
            )}

            {wizardStep === 4 && (
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-hover shadow-[0_6px_20px_rgba(254,92,43,0.25)] transition-colors"
              >
                <FileText size={16} />
                Gerar proposta
              </button>
            )}

            {wizardStep === 5 && (
              <button
                type="button"
                onClick={() => setWizardStep(4)}
                className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-medium ${isDark ? 'border-white/15 text-white hover:bg-white/[0.06]' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'}`}
              >
                Voltar para revisão
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>

      {showPresentation && (
        <PresentationMode
          points={proposalPoints}
          totals={totals}
          segmento={form.segmento}
          clientName={form.clientName}
          pricingSummary={pricingSummary}
          onClose={() => setShowPresentation(false)}
          clientMode={clientModePresentation}
          proposalToken={shareModal?.token ?? null}
        />
      )}

      {showQuickPresentation && (
        <QuickPresentationMode points={proposalPoints} totals={totals} segmento={form.segmento} clientName={form.clientName} pricingSummary={pricingSummary} onClose={() => setShowQuickPresentation(false)} />
      )}

      {/* Share modal — link público + QR code */}
      {shareModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={() => setShareModal(null)}>
          <div
            className={`rounded-3xl shadow-2xl w-full max-w-sm p-6 ${isDark ? 'bg-[#141414] border border-white/10' : 'bg-white border border-neutral-200'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Compartilhar proposta</h3>
              <button onClick={() => setShareModal(null)} className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors ${isDark ? 'text-white/50 hover:bg-white/10 hover:text-white' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'}`}>
                <X size={16} />
              </button>
            </div>

            {/* QR code */}
            <div className="flex justify-center mb-5">
              <div className={`p-3 rounded-2xl ${isDark ? 'bg-white' : 'bg-neutral-50 border border-neutral-200'}`}>
                <QRCodeSVG value={shareModal.url} size={160} bgColor="#ffffff" fgColor="#111111" />
              </div>
            </div>
            {/* Hidden canvas QR for image generation */}
            <div ref={qrCanvasRef} style={{ position: 'absolute', left: -9999, top: -9999 }}>
              <QRCodeCanvas value={shareModal.url} size={280} bgColor="#ffffff" fgColor="#111111" />
            </div>

            {/* URL + copy */}
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 mb-3 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-neutral-50'}`}>
              <span className={`flex-1 text-xs truncate font-mono ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{shareModal.url}</span>
              <button
                onClick={handleCopyShareLink}
                className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${shareCopied ? 'text-green-500' : isDark ? 'text-brand-orange hover:bg-brand-orange/10' : 'text-orange-600 hover:bg-orange-50'}`}
              >
                {shareCopied ? <Check size={12} /> : <Link2 size={12} />}
                {shareCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>

            <p className={`text-center text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>
              Link válido por 7 dias · O cliente pode aprovar diretamente
            </p>

            <button
              onClick={handleDownloadQRCard}
              className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
              style={{ background: '#E8591A' }}
            >
              <Download size={15} />
              Baixar cartão QR
            </button>
          </div>
        </div>
      )}

      {sessionExpiredModal.open && (
        <div className="fixed inset-0 z-[95] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSessionExpiredModal({ open: false, message: '' })}>
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${isDark ? 'bg-[#141414] border-white/10' : 'bg-white border-neutral-200'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Sessão expirada</h3>
            <p className={`mt-2 text-sm leading-relaxed ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
              {sessionExpiredModal.message}
            </p>
            <p className={`mt-2 text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
              Para evitar perda de trabalho e consumo desnecessário de tokens, faça login novamente antes de continuar.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSessionExpiredModal({ open: false, message: '' })}
                className={`h-10 px-4 rounded-xl border text-sm font-medium ${isDark ? 'border-white/15 text-white hover:bg-white/[0.06]' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'}`}
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={goToCommercialLogin}
                className="h-10 px-4 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-hover"
              >
                Fazer login novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreviewLightbox && activePreviewPoint && (
        <div className={`fixed inset-0 z-[70] backdrop-blur-sm p-4 md:p-8 ${isDark ? 'bg-black/90' : 'bg-white/70'}`} onClick={() => setShowPreviewLightbox(false)}>
          <div className="max-w-6xl mx-auto h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className={`text-xs uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Preview ampliado</p>
                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{activePreviewPoint.nome} · {activePreviewPoint.cidade}</p>
              </div>
              <button onClick={() => setShowPreviewLightbox(false)} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'border-white/20 text-white/80 hover:text-white' : 'border-neutral-300 text-neutral-600 hover:text-neutral-900 bg-white'}`}>Fechar</button>
            </div>

            <div className={`rounded-2xl border flex-1 p-2 md:p-4 min-h-0 ${isDark ? 'border-white/15 bg-black/45' : 'border-neutral-200 bg-white'}`}>
              <img src={getPointPreviewUrl(activePreviewPoint, !!simulationArtFile)} alt={`Preview ${activePreviewPoint.nome}`} className="w-full h-full object-contain rounded-xl" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PreviewPanel({ proposalPoints, activePreviewPoint, onSelect, onExpand, requireGeneratedPreview = false, isDark = true }) {
  return (
    <section className={`rounded-2xl border p-4 md:p-5 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-brand-orange" />
          <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Preview da simulação</h3>
        </div>
        <button type="button" onClick={onExpand} disabled={!activePreviewPoint} className={`px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 bg-white/[0.03] hover:bg-white/[0.08] text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>Ver em tela cheia</button>
      </div>

      {activePreviewPoint ? (
        <div className="grid xl:grid-cols-[1fr_240px] gap-4">
          <div className={`rounded-xl border p-2 ${isDark ? 'border-white/10 bg-black/25' : 'border-neutral-200 bg-white'}`}>
            <img src={getPointPreviewUrl(activePreviewPoint, requireGeneratedPreview)} alt={`Preview ${activePreviewPoint.nome}`} className="w-full h-[240px] md:h-[320px] object-contain rounded-lg bg-black/35" />
            <div className="px-2 pt-3">
              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{activePreviewPoint.nome}</p>
              <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{activePreviewPoint.cidade} · {activePreviewPoint.tipo}</p>
            </div>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {proposalPoints.map((point) => {
              const previewUrl = getPointPreviewUrl(point, requireGeneratedPreview);
              const selected = point.id === activePreviewPoint?.id;
              return (
                <button
                  key={point.id}
                  type="button"
                  disabled={!previewUrl}
                  onClick={() => onSelect(point.id)}
                  className={`w-full text-left rounded-xl border p-2 transition-all ${selected ? (isDark ? 'border-brand-orange bg-brand-orange/10' : 'border-orange-400 bg-orange-50') : isDark ? 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]' : 'border-neutral-200 bg-white hover:bg-neutral-50'} ${!previewUrl ? 'opacity-55 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-16 h-10 rounded-md border overflow-hidden shrink-0 ${isDark ? 'border-white/10 bg-black/35' : 'border-neutral-200 bg-neutral-100'}`}>
                      {previewUrl ? <img src={previewUrl} alt="thumb" className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{point.nome}</p>
                      <p className={`text-[11px] mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{previewUrl ? 'Simulação pronta' : (point.proposalSimulationStatus || 'Sem simulação')}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`h-36 rounded-xl border border-dashed flex items-center justify-center text-sm ${isDark ? 'border-white/15 text-brand-gray-500 bg-black/25' : 'border-neutral-300 text-neutral-400 bg-neutral-50'}`}>Gere as simulações para visualizar o preview.</div>
      )}
    </section>
  );
}

function Card({ isDark = true, title, children }) {
  return (
    <section className={`rounded-2xl border p-5 space-y-3 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-neutral-50'}`}>
      {title && <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{title}</h3>}
      {children}
    </section>
  );
}

function MiniStat({ isDark = true, label, value }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-white'}`}>
      <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{label}</div>
      <div className={`text-sm font-semibold mt-0.5 truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{value}</div>
    </div>
  );
}

function Input({ isDark = true, label, value, onChange }) {
  return (
    <div>
      <label className={`text-[11px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${isDark ? 'bg-white/[0.07] border-white/15 focus:border-brand-orange/45 focus:bg-white/[0.09] text-white' : 'bg-white border-neutral-200 focus:border-brand-orange/50 text-neutral-800'}`} />
    </div>
  );
}

function ScopeButton({ isDark = true, active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm transition-colors ${active ? (isDark ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-orange-300 bg-orange-50 text-orange-700') : isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300 hover:bg-white/[0.08]' : 'border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100'}`}
    >
      {children}
    </button>
  );
}

function StatusCard({ isDark = true, label, value, tone }) {
  const toneClass = tone === 'success'
    ? 'text-green-400 border-green-500/20 bg-green-500/5'
    : tone === 'warning'
      ? 'text-yellow-300 border-yellow-500/20 bg-yellow-500/5'
      : isDark
        ? 'text-white border-white/10 bg-black/20'
        : 'text-neutral-900 border-neutral-200 bg-white';

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className={`text-[10px] uppercase tracking-[0.12em] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SliderField({ isDark = true, label, value, min, max, step, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className={`text-[11px] uppercase tracking-wide ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{label}</label>
        <span className={`text-xs ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{Number(value).toFixed(step >= 1 ? 0 : 2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="proposal-slider w-full" />
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}
