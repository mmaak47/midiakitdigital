import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  MapPinned,
  Presentation,
  Route,
  Upload,
  X
} from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import {
  campaignTotals,
  generateCommercialArguments,
  getSegmentDisplayName,
  OBJETIVOS,
  SEGMENTOS
} from '../lib/strategy';
import { buildProposalImagePromptsByFormat, buildProposalPricing } from '../lib/proposal';
import { generateProposalPdf } from '../lib/midiaKitPdf';
import {
  defaultDisplaySettings,
  generateSimulationPreview,
  normalizeDisplaySettings,
  parseSimulationConfig
} from '../lib/simulation';
import { fetchClientAddressAnalysis, fetchEntornoJobStatus, fetchEntornoScores } from '../lib/api';
import { buildSelectionMapDataUrl, downloadSelectionMapPng } from '../lib/mapSnapshot';
import CustomSelect from './CustomSelect';
import ProposalBuilder from './ProposalBuilder';
import PresentationMode from './PresentationMode';
import QuickPresentationMode from './QuickPresentationMode';

const DEFAULT_ENTORNO_RADIUS = 800;

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
  const [step, setStep] = useState('review');
  const [showPresentation, setShowPresentation] = useState(false);
  const [showQuickPresentation, setShowQuickPresentation] = useState(false);

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
  const [simulationArtFile, setSimulationArtFile] = useState(null);
  const [simulationArtUrl, setSimulationArtUrl] = useState('');
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [simulationError, setSimulationError] = useState('');
  const [simulationResults, setSimulationResults] = useState({});
  const [simulationSettings, setSimulationSettings] = useState(defaultDisplaySettings);
  const [activePreviewPointId, setActivePreviewPointId] = useState(null);
  const [showPreviewLightbox, setShowPreviewLightbox] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapStatus, setMapStatus] = useState('');
  const [connectMapPoints, setConnectMapPoints] = useState(false);
  const [pdfSections, setPdfSections] = useState(() => ({
    methodology: true, score: true, coverage: true, impact: true,
    ...(draft?.pdfSections || {})
  }));
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

  // Auto-save draft whenever form-related state changes
  useEffect(() => {
    saveDraft({ form, discountConfig, analysisMode, pdfSections });
  }, [form, discountConfig, analysisMode, pdfSections]);

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

  useEffect(() => {
    return () => {
      Object.values(simulationResults).forEach((entry) => {
        if (entry?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
    };
  }, [simulationResults]);

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

        const latest = response.metrics?.[0]?.updated_at || null;
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          coverage: Number(response.coverage || response.coberturaCache || 0),
          scoresByPoint: response.byPoint || {},
          updatedAt: latest,
          jobId: response.job?.jobId || null,
          error: ''
        }));

        if (response.job?.jobId) {
          pollJob(response.job.jobId);
        }
      } catch (err) {
        if (!active) return;
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Erro ao consultar análise de entorno.'
        }));
      }
    };

    const pollJob = (jobId) => {
      const poll = async () => {
        try {
          const job = await fetchEntornoJobStatus(jobId);
          if (!active) return;

          if (job.status === 'completed' || job.status === 'failed') {
            await loadScores(false);
            return;
          }

          pollTimer = window.setTimeout(poll, 3500);
        } catch {
          if (!active) return;
          pollTimer = window.setTimeout(poll, 5000);
        }
      };

      poll();
    };

    loadScores(false);

    return () => {
      active = false;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [proposalSourcePoints, form.segmento, activeCities]);

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

  const argumentos = useMemo(() => generateCommercialArguments({
    selected: proposalSourcePoints,
    city: activeCities,
    publico: form.publicos,
    objetivo: form.objetivo,
    segmento: form.segmento
  }), [proposalSourcePoints, activeCities, form.publicos, form.objetivo, form.segmento]);

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
      const entornoMetrics = entorno.scoresByPoint[point.id] || entorno.scoresByPoint[String(point.id)] || null;
      const clientMetrics = clientAnalysis.byPoint[point.id] || clientAnalysis.byPoint[String(point.id)] || null;
      return {
        ...point,
        entornoMetrics,
        clientDistanceMeters: clientMetrics?.distanceMeters || null,
        clientDistanceKm: clientMetrics?.distanceKm || null,
        clientProximityScore: clientMetrics?.proximityScore || null,
        proposalSimulationPreview: result?.previewUrl || '',
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

    const geradas = items.filter((item) => item.status === 'Gerada').length;
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
      `pixel LED ${simulationSettings.ledPixelIntensity.toFixed(2)}`
    ].filter(Boolean).join(' · ');
  }, [simulationArtFile, simulationResults, simulationSettings]);

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

  const handleGenerate = () => setStep('generated');

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

  const handleExportProposalPdf = async () => {
    try {
      setPdfBusy(true);
      const strategicTopics = String(form.strategicTopics || '')
        .split(/\n+/)
        .map((line) => line.replace(/^[-•\d.)\s]+/, '').trim())
        .filter(Boolean);

      const pointMapImages = await Promise.all(
        proposalPoints.map(async (point) => {
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

      await generateProposalPdf({
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        city: activeCities,
        publico: form.publicos,
        objective: form.objetivo,
        points: proposalPoints,
        totals,
        pricingSummary,
        segmento: form.segmento,
        strategicText: argumentos,
        strategicTopics,
        strategicSubtitle: form.proposalSubtitle,
        simulationSummary,
        analysisMode,
        pointMapImages,
        showMetricsMethodology: pdfSections.methodology,
        showCampaignScore: pdfSections.score,
        showCoverageLayer: pdfSections.coverage,
        showImpactSection: pdfSections.impact
      });
    } catch (error) {
      setSimulationError(error?.message || 'Falha ao gerar o PDF da proposta.');
    } finally {
      setPdfBusy(false);
    }
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
          displaySettings: simulationSettings
        });
        return [point.id, { status: 'Gerada', previewUrl: result.previewUrl }];
      } catch (error) {
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
          className={`proposal-modal-shell relative w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-3xl border ${isDark ? 'border-white/15 bg-gradient-to-b from-[#11141b] via-[#0d1016] to-[#090c11] shadow-[0_30px_120px_rgba(0,0,0,0.75)]' : 'border-neutral-200 bg-gradient-to-b from-[#ffffff] via-[#fbfcfe] to-[#f3f5f8] shadow-[0_26px_80px_rgba(148,163,184,0.28)]'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`pointer-events-none absolute inset-0 ${isDark ? 'bg-[radial-gradient(circle_at_15%_5%,rgba(254,92,43,0.12),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(255,255,255,0.07),transparent_28%)]' : 'bg-[radial-gradient(circle_at_12%_4%,rgba(254,92,43,0.16),transparent_36%),radial-gradient(circle_at_94%_0%,rgba(254,92,43,0.10),transparent_32%)]'}`} />

          <button
            onClick={onClose}
            className={`absolute top-4 right-4 z-10 p-2.5 rounded-full border transition-all ${isDark ? 'border-white/10 bg-black/35 hover:bg-black/60 text-white/70 hover:text-white' : 'border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'}`}
          >
            <X size={18} />
          </button>

          <div className="relative p-6 md:p-8 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:p-6">
              <div className="flex flex-wrap items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-brand-orange/15 border border-brand-orange/30 flex items-center justify-center shadow-[0_8px_30px_rgba(254,92,43,0.2)]">
                  <FileText size={22} className="text-brand-orange" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-brand-gray-500 mb-1">Proposta Comercial</p>
                  <h2 className="text-2xl md:text-[30px] leading-tight font-bold text-white">Modo gerar proposta automática</h2>
                  <p className="text-sm text-brand-gray-400 mt-2">Estrutura pronta para exportação em PDF e apresentação comercial, com desconto configurável, prompt de arte no modal, simulação aplicada por ponto e análise opcional pelo endereço do cliente.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-brand-gray-500">Pontos na proposta</div>
                  <div className="text-lg font-bold text-white">{proposalSourcePoints.length}</div>
                </div>
              </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gray-400">Dados da proposta</h3>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                <Input label="Nome do cliente" value={form.clientName} onChange={(value) => setForm((s) => ({ ...s, clientName: value }))} />
                <Input label="Endereço do cliente" value={form.clientAddress} onChange={(value) => setForm((s) => ({ ...s, clientAddress: value }))} />
                <Input label="Subtítulo da capa (opcional)" value={form.proposalSubtitle} onChange={(value) => setForm((s) => ({ ...s, proposalSubtitle: value }))} />
                <CustomSelect label="Praças" value={form.selectedCities} onChange={(value) => setForm((s) => ({ ...s, selectedCities: value }))} options={availableCities} multiple placeholder="Todas as praças dos pontos selecionados" />
                <CustomSelect label="Segmento" value={form.segmento} onChange={(value) => setForm((s) => ({ ...s, segmento: value }))} options={SEGMENTOS.map((segmento) => ({ value: segmento, label: getSegmentDisplayName(segmento) }))} />
                <CustomSelect label="Objetivo" value={form.objetivo} onChange={(value) => setForm((s) => ({ ...s, objetivo: value }))} options={OBJETIVOS} allowCustom customPlaceholder="Digite um objetivo personalizado" />
                <CustomSelect label="Públicos" value={form.publicos} onChange={(value) => setForm((s) => ({ ...s, publicos: value }))} options={availablePublicos} multiple placeholder="Públicos estratégicos" />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-[0.12em] text-brand-gray-500">Tópicos estratégicos (1 por linha)</label>
                <textarea
                  value={form.strategicTopics}
                  onChange={(event) => setForm((state) => ({ ...state, strategicTopics: event.target.value }))}
                  rows={4}
                  placeholder={argumentos.join('\n')}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2.5 text-sm text-brand-gray-200 outline-none focus:border-brand-orange/45 focus:bg-white/[0.09] transition-colors"
                />
                <p className="mt-1 text-xs text-brand-gray-500">Se ficar vazio, usamos os argumentos estratégicos gerados automaticamente.</p>
              </div>

              <div className="grid lg:grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-brand-gray-400">
                  <div className="flex flex-wrap items-center gap-2 text-brand-gray-300">
                    <span className="font-semibold uppercase tracking-[0.12em]">Análise de entorno da praça</span>
                    {entorno.loading ? <span className="text-brand-orange">Atualizando cache...</span> : null}
                    {entorno.jobId ? <span className="rounded-full border border-brand-orange/25 bg-brand-orange/10 px-2 py-0.5 text-brand-orange">Job #{entorno.jobId}</span> : null}
                  </div>
                  <p className="mt-1">
                    Cobertura do cache: {(entorno.coverage * 100).toFixed(0)}%
                    {entorno.updatedAt ? ` • atualizado em ${new Date(entorno.updatedAt).toLocaleString('pt-BR')}` : ''}
                  </p>
                  {entorno.error ? <p className="mt-1 text-red-300">{entorno.error}</p> : null}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-brand-gray-400 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ScopeButton active={analysisMode === 'segmento'} onClick={() => setAnalysisMode('segmento')}>Entorno padrão</ScopeButton>
                    <ScopeButton active={analysisMode === 'client-address'} onClick={() => setAnalysisMode('client-address')}>Entorno personalizado</ScopeButton>
                  </div>

                  {analysisMode === 'client-address' ? (
                    <>
                      {clientAnalysis.loading ? <p className="text-brand-orange">Analisando proximidade dos pontos em relação ao endereço do cliente...</p> : null}
                      {clientAnalysis.error ? <p className="text-red-300">{clientAnalysis.error}</p> : null}
                      {!clientAnalysis.loading && !clientAnalysis.error && form.clientAddress.trim() && clientAnalysis.rankedPoints.length > 0 ? (
                        <div className="space-y-1.5 text-brand-gray-300">
                          <p className="font-semibold uppercase tracking-[0.12em] text-brand-gray-400">Pontos mais próximos do cliente</p>
                          {clientAnalysis.rankedPoints.slice(0, 3).map((point) => (
                            <p key={point.id}>{point.nome} • {point.distanceKm.toFixed(1).replace('.', ',')} km</p>
                          ))}
                        </div>
                      ) : null}
                      {!form.clientAddress.trim() ? <p>Preencha o endereço do cliente para gerar a análise personalizada em tempo real.</p> : null}
                    </>
                  ) : (
                    <p>Usa o score de entorno já calculado por segmento para os pontos filtrados desta proposta.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gray-400 mb-1">Desconto comercial</h3>
                <p className="text-sm text-brand-gray-400">Defina se o desconto será no total, em pontos específicos ou individual por ponto.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ['none', 'Sem desconto'],
                  ['total', 'No total da proposta'],
                  ['specific', 'Em pontos específicos'],
                  ['individual', 'Individual por ponto']
                ].map(([mode, label]) => (
                  <ScopeButton key={mode} active={discountConfig.mode === mode} onClick={() => setDiscountConfig((current) => ({ ...current, mode }))}>{label}</ScopeButton>
                ))}
              </div>

              {(discountConfig.mode === 'total' || discountConfig.mode === 'specific') && (
                <div className="grid md:grid-cols-[220px_1fr] gap-4 items-start">
                  <Input label="Percentual de desconto" value={discountConfig.percentage} onChange={(value) => setDiscountConfig((current) => ({ ...current, percentage: value.replace(',', '.') }))} />

                  {discountConfig.mode === 'specific' ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-brand-gray-500">Pontos com desconto</p>
                      {proposalSourcePoints.map((point) => (
                        <label key={point.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-brand-gray-300">
                          <span>{point.nome}</span>
                          <input
                            type="checkbox"
                            checked={discountConfig.targetPointIds.includes(point.id)}
                            onChange={(event) => {
                              setDiscountConfig((current) => ({
                                ...current,
                                targetPointIds: event.target.checked
                                  ? [...current.targetPointIds, point.id]
                                  : current.targetPointIds.filter((item) => item !== point.id)
                              }));
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {discountConfig.mode === 'individual' && (
                <div className="grid md:grid-cols-2 gap-3">
                  {proposalSourcePoints.map((point) => (
                    <div key={point.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{point.nome}</p>
                          <p className="text-xs text-brand-gray-500">Tabela: {formatCurrency(point.preco)}</p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={discountConfig.perPoint[point.id] || ''}
                          onChange={(event) => setDiscountConfig((current) => ({
                            ...current,
                            perPoint: {
                              ...current.perPoint,
                              [point.id]: event.target.value
                            }
                          }))}
                          className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange/40"
                          placeholder="0%"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-3">
                <StatusCard label="Tabela cheia" value={formatCurrency(pricingSummary.originalTotal)} tone="default" />
                <StatusCard label="Desconto total" value={formatCurrency(pricingSummary.discountTotal)} tone="warning" />
                <StatusCard label="Valor final" value={formatCurrency(pricingSummary.finalTotal)} tone="success" />
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
              <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-4 items-start">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gray-400 mb-1">Prompt da arte da campanha</h3>
                      <p className="text-sm text-brand-gray-400">O prompt agora nasce neste modal e usa o nome do cliente para gerar a arte que entra na simulação. Quando houver formatos diferentes, o sistema separa um prompt por formato.</p>
                    </div>
                    <button type="button" onClick={handleCopyPrompt} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white hover:bg-white/[0.08]">
                      {promptCopied ? <Check size={15} /> : <Copy size={15} />}
                      {promptCopied ? 'Prompt copiado' : 'Copiar prompt'}
                    </button>
                  </div>

                  <textarea ref={promptTextareaRef} value={imagePrompt} readOnly rows={Math.min(18, Math.max(6, imagePromptGroups.length * 7))} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-brand-gray-200 outline-none" />
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gray-400 mb-1">Arte da campanha</h3>
                    <p className="text-sm text-brand-gray-400">A arte enviada aqui será aplicada sobre a área de tela cadastrada no admin para cada ponto da proposta.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/15 rounded-xl text-sm text-brand-gray-300 hover:bg-white/10 cursor-pointer transition-colors">
                      <Upload size={16} />
                      {simulationArtFile ? simulationArtFile.name : 'Escolher arte da campanha'}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          setSimulationArtFile(e.target.files?.[0] || null);
                          setSimulationError('');
                          clearSimulationResults();
                        }}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleGenerateSimulations}
                      disabled={simulationBusy || !proposalSourcePoints.length}
                      className="orange-solid-btn px-5 py-2.5 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover disabled:opacity-50 shadow-[0_10px_24px_rgba(254,92,43,0.28)]"
                    >
                      {simulationBusy ? 'Gerando simulações...' : 'Gerar simulações'}
                    </button>
                  </div>
                </div>
              </div>

              {simulationError && (
                <p className="text-xs text-red-300 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">{simulationError}</p>
              )}

              <div className="grid lg:grid-cols-[220px_1fr] gap-4 items-start">
                <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                  <p className="text-[11px] text-brand-gray-500 px-1 pb-2 uppercase tracking-wide">Preview da arte enviada</p>
                  {simulationArtUrl ? (
                    <img src={simulationArtUrl} alt="Arte da campanha" className="w-full h-40 object-cover rounded-lg" />
                  ) : (
                    <div className="h-40 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-xs text-brand-gray-500">
                      Nenhuma arte selecionada
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <StatusCard label="Pontos na proposta" value={proposalSourcePoints.length} tone="default" />
                  <StatusCard label="Simulações geradas" value={Object.values(simulationResults).filter((item) => item.status === 'Gerada').length} tone="success" />
                  <StatusCard label="Pendências de cadastro" value={Object.values(simulationResults).filter((item) => item.status === 'Área da tela não cadastrada no admin' || item.status === 'Imagem base do ponto não cadastrada').length} tone="warning" />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-brand-gray-400 mb-1">Realismo da tela</p>
                  <p className="text-sm text-brand-gray-400">Esses controles aproximam o resultado do simulador com brilho, reflexo, vazamento de luz e textura de LED.</p>
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <SliderField label="Brilho da tela" value={simulationSettings.brightness} min={0.7} max={1.8} step={0.01} onChange={(value) => setSimulationSettings((current) => normalizeDisplaySettings({ ...current, brightness: value }))} />
                  <SliderField label="Reflexo do vidro" value={simulationSettings.reflection} min={0} max={0.55} step={0.01} onChange={(value) => setSimulationSettings((current) => normalizeDisplaySettings({ ...current, reflection: value }))} />
                  <SliderField label="Vazamento de luz" value={simulationSettings.spill} min={0} max={0.45} step={0.01} onChange={(value) => setSimulationSettings((current) => normalizeDisplaySettings({ ...current, spill: value }))} />
                  <SliderField label="Intensidade dos pixels" value={simulationSettings.ledPixelIntensity} min={0} max={0.45} step={0.01} onChange={(value) => setSimulationSettings((current) => normalizeDisplaySettings({ ...current, ledPixelIntensity: value }))} />
                  <SliderField label="Tamanho do pixel LED" value={simulationSettings.ledPixelSize} min={3} max={14} step={1} onChange={(value) => setSimulationSettings((current) => normalizeDisplaySettings({ ...current, ledPixelSize: value }))} />
                  <SliderField label="Glare / luz especular" value={simulationSettings.glare} min={0} max={0.4} step={0.01} onChange={(value) => setSimulationSettings((current) => normalizeDisplaySettings({ ...current, glare: value }))} />
                </div>
              </div>
            </section>

            {(step === 'review' || step === 'generated') && (
              <PreviewPanel proposalPoints={proposalPoints} activePreviewPoint={activePreviewPoint} onSelect={setActivePreviewPointId} onExpand={() => setShowPreviewLightbox(true)} requireGeneratedPreview={!!simulationArtFile} />
            )}

            {step === 'review' && (
              <section className="space-y-5">
                <ProposalBuilder clientName={form.clientName} city={activeCities} publico={form.publicos} segmento={getSegmentDisplayName(form.segmento)} points={proposalPoints} totals={totals} pricingSummary={pricingSummary} strategicText={argumentos} simulationSummary={simulationSummary} activePreviewPointId={activePreviewPoint?.id} onSelectPreview={setActivePreviewPointId} onGenerate={handleGenerate} isDark={isDark} />
              </section>
            )}

            {step === 'generated' && (
              <section className="space-y-4">
                <div className="rounded-2xl border border-brand-orange/30 bg-gradient-to-r from-brand-orange/20 to-brand-orange/5 p-4">
                  <h3 className="text-lg font-semibold text-white mb-1">Proposta gerada com sucesso</h3>
                  <p className="text-sm text-brand-gray-300">Apresentação pronta para reunião comercial, com narrativa estratégica, desconto aplicado e indicadores executivos.</p>
                </div>

                <ProposalBuilder clientName={form.clientName} city={activeCities} publico={form.publicos} segmento={getSegmentDisplayName(form.segmento)} points={proposalPoints} totals={totals} pricingSummary={pricingSummary} strategicText={argumentos} simulationSummary={simulationSummary} activePreviewPointId={activePreviewPoint?.id} onSelectPreview={setActivePreviewPointId} onGenerate={() => {}} isDark={isDark} />

                <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-brand-gray-400">Seções opcionais do PDF</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'methodology', label: 'Como ler as métricas' },
                      { key: 'score', label: 'Score da campanha' },
                      { key: 'coverage', label: 'Cobertura e presença' },
                      { key: 'impact', label: 'Impacto da campanha' }
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPdfSections((s) => ({ ...s, [key]: !s[key] }))}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${pdfSections[key] ? 'border-brand-orange/40 bg-brand-orange/12 text-brand-orange' : 'border-white/15 text-brand-gray-400 hover:bg-white/[0.06]'}`}
                      >
                        {pdfSections[key] ? '✓ ' : ''}{label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-brand-gray-400">Print do mapa da seleção</p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-brand-gray-500">
                      <MapPinned size={13} />
                      PNG de alta resolução
                    </span>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-brand-gray-300">
                    <input
                      type="checkbox"
                      checked={connectMapPoints}
                      onChange={(event) => setConnectMapPoints(event.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5"
                    />
                    Desenhar linha de conexão entre os pontos
                  </label>

                  <button
                    onClick={handleExportSelectionMap}
                    disabled={mapBusy || !proposalPoints.length}
                    className="h-11 px-4 rounded-xl border border-brand-orange/35 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange font-medium inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Route size={16} />
                    {mapBusy ? 'Aguarde...' : 'Baixar print do mapa'}
                  </button>

                  {mapBusy && mapStatus && (
                    <p className="text-xs text-brand-orange/80 flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-brand-orange/60 border-t-brand-orange animate-spin" />
                      {mapStatus}
                    </p>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <button onClick={handleExportProposalPdf} disabled={pdfBusy} className="orange-solid-btn h-11 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover inline-flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(254,92,43,0.28)]">
                    <Download size={16} />
                    {pdfBusy ? 'Gerando PDF...' : 'Exportar PDF da proposta'}
                  </button>

                  <button onClick={() => setShowPresentation(true)} className="h-11 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] font-medium inline-flex items-center justify-center gap-2">
                    <Presentation size={16} />
                    Modo apresentação
                  </button>

                  <button onClick={() => setShowQuickPresentation(true)} className="h-11 rounded-xl border border-brand-orange/35 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange font-medium inline-flex items-center justify-center gap-2">
                    <Presentation size={16} />
                    Apresentação rápida
                  </button>

                  <button onClick={() => setStep('review')} className="h-11 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] font-medium">
                    Voltar para revisão
                  </button>
                </div>
              </section>
            )}
          </div>
        </motion.div>
      </motion.div>

      {showPresentation && (
        <PresentationMode points={proposalPoints} totals={totals} segmento={form.segmento} clientName={form.clientName} pricingSummary={pricingSummary} onClose={() => setShowPresentation(false)} />
      )}

      {showQuickPresentation && (
        <QuickPresentationMode points={proposalPoints} totals={totals} segmento={form.segmento} clientName={form.clientName} pricingSummary={pricingSummary} onClose={() => setShowQuickPresentation(false)} />
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

function PreviewPanel({ proposalPoints, activePreviewPoint, onSelect, onExpand, requireGeneratedPreview = false }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-brand-orange" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gray-400">Preview ampliado da simulação</h3>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-brand-gray-500">Clique nos thumbs para trocar</p>
          <button type="button" onClick={onExpand} disabled={!activePreviewPoint} className="px-3 py-1.5 text-xs rounded-lg border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-40">Ver em tela cheia</button>
        </div>
      </div>

      {activePreviewPoint ? (
        <div className="grid xl:grid-cols-[1fr_260px] gap-4">
          <div className="rounded-xl border border-white/10 bg-black/25 p-2">
            <img src={getPointPreviewUrl(activePreviewPoint, requireGeneratedPreview)} alt={`Preview ${activePreviewPoint.nome}`} className="w-full h-[260px] md:h-[360px] object-contain rounded-lg bg-black/35" />
            <div className="px-2 pt-3">
              <p className="text-sm font-semibold text-white">{activePreviewPoint.nome}</p>
              <p className="text-xs text-brand-gray-400 mt-1">{activePreviewPoint.cidade} · {activePreviewPoint.tipo}</p>
            </div>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {proposalPoints.map((point) => {
              const previewUrl = getPointPreviewUrl(point, requireGeneratedPreview);
              const selected = point.id === activePreviewPoint?.id;

              return (
                <button
                  key={point.id}
                  type="button"
                  disabled={!previewUrl}
                  onClick={() => onSelect(point.id)}
                  className={`w-full text-left rounded-xl border p-2 transition-all ${selected ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'} ${!previewUrl ? 'opacity-55 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-12 rounded-md border border-white/10 bg-black/35 overflow-hidden shrink-0">
                      {previewUrl ? <img src={previewUrl} alt="thumb" className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{point.nome}</p>
                      <p className="text-[11px] text-brand-gray-400 mt-1">{previewUrl ? 'Simulação pronta para proposta' : (point.proposalSimulationStatus || 'Sem simulação')}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="h-44 rounded-xl border border-dashed border-white/15 flex items-center justify-center text-sm text-brand-gray-500 bg-black/25">Gere as simulações para visualizar o preview ampliado.</div>
      )}
    </section>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-[0.12em] text-brand-gray-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full bg-white/[0.07] border border-white/15 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-orange/45 focus:bg-white/[0.09] transition-colors" />
    </div>
  );
}

function ScopeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm transition-colors ${active ? 'border-brand-orange/40 bg-brand-orange/15 text-brand-orange' : 'border-white/10 bg-white/[0.03] text-brand-gray-300 hover:bg-white/[0.08]'}`}
    >
      {children}
    </button>
  );
}

function StatusCard({ label, value, tone }) {
  const toneClass = tone === 'success'
    ? 'text-green-400 border-green-500/20 bg-green-500/5'
    : tone === 'warning'
      ? 'text-yellow-300 border-yellow-500/20 bg-yellow-500/5'
      : 'text-white border-white/10 bg-black/20';

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-brand-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SliderField({ label, value, min, max, step, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[11px] uppercase tracking-wide text-brand-gray-500">{label}</label>
        <span className="text-xs text-brand-gray-300">{Number(value).toFixed(step >= 1 ? 0 : 2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="proposal-slider w-full" />
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}
