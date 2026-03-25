import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, Download, Presentation, Upload, Image as ImageIcon } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { campaignTotals, generateCommercialArguments, getSegmentDisplayName, SEGMENTOS } from '../lib/strategy';
import { generateProposalPdf } from '../lib/midiaKitPdf';
import {
  defaultDisplaySettings,
  generateSimulationPreview,
  normalizeDisplaySettings,
  parseSimulationConfig
} from '../lib/simulation';
import { fetchEntornoJobStatus, fetchEntornoScores } from '../lib/api';
import ProposalBuilder from './ProposalBuilder';
import PresentationMode from './PresentationMode';

const DEFAULT_ENTORNO_RADIUS = 800;

export default function ProposalModal({ onClose }) {
  const { favorites } = useFavorites();
  const [step, setStep] = useState('review');
  const [showPresentation, setShowPresentation] = useState(false);
  const [form, setForm] = useState({
    clientName: '',
    city: '',
    segmento: 'clinica',
    objetivo: 'reconhecimento de marca',
    publico: ''
  });
  const [simulationArtFile, setSimulationArtFile] = useState(null);
  const [simulationArtUrl, setSimulationArtUrl] = useState('');
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [simulationError, setSimulationError] = useState('');
  const [simulationResults, setSimulationResults] = useState({});
  const [simulationSettings, setSimulationSettings] = useState(defaultDisplaySettings);
  const [activePreviewPointId, setActivePreviewPointId] = useState(null);
  const [showPreviewLightbox, setShowPreviewLightbox] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [entorno, setEntorno] = useState({
    loading: false,
    jobId: null,
    coverage: 0,
    scoresByPoint: {},
    updatedAt: null,
    error: ''
  });

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
      if (!favorites.length) {
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
          cidade: form.city,
          raio: DEFAULT_ENTORNO_RADIUS,
          force
        });

        if (!active) return;

        const latest = response.metrics?.[0]?.updated_at || null;
        setEntorno((prev) => ({
          ...prev,
          loading: false,
          coverage: Number(response.coberturaCache || 0),
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
  }, [favorites, form.segmento, form.city]);

  const totals = useMemo(() => campaignTotals(favorites), [favorites]);

  const argumentos = useMemo(() => generateCommercialArguments({
    selected: favorites,
    city: form.city,
    publico: form.publico,
    objetivo: form.objetivo,
    segmento: form.segmento
  }), [favorites, form]);

  const proposalPoints = useMemo(() => {
    return favorites.map((point) => {
      const result = simulationResults[point.id];
      const entornoMetrics = entorno.scoresByPoint[point.id] || entorno.scoresByPoint[String(point.id)] || null;
      return {
        ...point,
        entornoMetrics,
        proposalSimulationPreview: result?.previewUrl || '',
        proposalSimulationStatus: result?.status || (!simulationArtFile ? 'Envie a arte para gerar' : 'Gerar simulação pendente')
      };
    });
  }, [entorno.scoresByPoint, favorites, simulationArtFile, simulationResults]);

  const simulationSummary = useMemo(() => {
    const items = Object.values(simulationResults);
    if (!simulationArtFile) {
      return 'A área da tela vem do admin. Envie a arte da campanha neste modal para gerar os previews que entram na proposta.';
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
    return proposalPoints.filter((point) => point.proposalSimulationPreview || point.simulacao_preview);
  }, [proposalPoints]);

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

  const handleExportProposalPdf = async () => {
    try {
      setPdfBusy(true);
      await generateProposalPdf({
        clientName: form.clientName,
        city: form.city,
        points: proposalPoints,
        totals,
        segmento: form.segmento,
        strategicText: argumentos,
        simulationSummary
      });
    } catch (error) {
      setSimulationError(error?.message || 'Falha ao gerar o PDF da proposta.');
    } finally {
      setPdfBusy(false);
    }
  };

  const handleGenerateSimulations = async () => {
    if (!simulationArtUrl) {
      setSimulationError('Selecione a arte da campanha para gerar as simulações.');
      return;
    }

    setSimulationBusy(true);
    setSimulationError('');

    const nextEntries = await Promise.all(favorites.map(async (point) => {
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
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/15 bg-gradient-to-b from-[#11141b] via-[#0d1016] to-[#090c11] shadow-[0_30px_120px_rgba(0,0,0,0.75)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_5%,rgba(254,92,43,0.12),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(255,255,255,0.07),transparent_28%)]" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2.5 rounded-full border border-white/10 bg-black/35 hover:bg-black/60 text-white/70 hover:text-white transition-all"
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
                  <p className="text-sm text-brand-gray-400 mt-2">Estrutura pronta para exportação em PDF e apresentação comercial, com simulação da criação aplicada por ponto.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-brand-gray-500">Pontos no carrinho</div>
                  <div className="text-lg font-bold text-white">{favorites.length}</div>
                </div>
              </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gray-400 mb-4">Dados da proposta</h3>
              <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
                <Input label="Nome do cliente" value={form.clientName} onChange={(value) => setForm((s) => ({ ...s, clientName: value }))} />
                <Input label="Cidade" value={form.city} onChange={(value) => setForm((s) => ({ ...s, city: value }))} />
                <SelectInput
                  label="Segmento"
                  value={form.segmento}
                  onChange={(value) => setForm((s) => ({ ...s, segmento: value }))}
                  options={SEGMENTOS.map((segmento) => ({
                    value: segmento,
                    label: getSegmentDisplayName(segmento)
                  }))}
                />
                <Input label="Objetivo" value={form.objetivo} onChange={(value) => setForm((s) => ({ ...s, objetivo: value }))} />
                <Input label="Público" value={form.publico} onChange={(value) => setForm((s) => ({ ...s, publico: value }))} />
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-brand-gray-400">
                <div className="flex flex-wrap items-center gap-2 text-brand-gray-300">
                  <span className="font-semibold uppercase tracking-[0.12em]">Análise de entorno</span>
                  {entorno.loading ? <span className="text-brand-orange">Atualizando cache...</span> : null}
                  {entorno.jobId ? <span className="rounded-full border border-brand-orange/25 bg-brand-orange/10 px-2 py-0.5 text-brand-orange">Job #{entorno.jobId}</span> : null}
                </div>
                <p className="mt-1">
                  Cobertura do cache: {(entorno.coverage * 100).toFixed(0)}%
                  {entorno.updatedAt ? ` • atualizado em ${new Date(entorno.updatedAt).toLocaleString('pt-BR')}` : ''}
                </p>
                {entorno.error ? <p className="mt-1 text-red-300">{entorno.error}</p> : null}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
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
                      accept="image/*"
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
                    disabled={simulationBusy || !favorites.length}
                    className="px-5 py-2.5 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover disabled:opacity-50 shadow-[0_10px_24px_rgba(254,92,43,0.28)]"
                  >
                    {simulationBusy ? 'Gerando simulações...' : 'Gerar simulações'}
                  </button>
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
                  <StatusCard
                    label="Pontos na proposta"
                    value={favorites.length}
                    tone="default"
                  />
                  <StatusCard
                    label="Simulações geradas"
                    value={Object.values(simulationResults).filter((item) => item.status === 'Gerada').length}
                    tone="success"
                  />
                  <StatusCard
                    label="Pendências de cadastro"
                    value={Object.values(simulationResults).filter((item) => item.status === 'Área da tela não cadastrada no admin' || item.status === 'Imagem base do ponto não cadastrada').length}
                    tone="warning"
                  />
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
              <PreviewPanel
                proposalPoints={proposalPoints}
                activePreviewPoint={activePreviewPoint}
                onSelect={setActivePreviewPointId}
                onExpand={() => setShowPreviewLightbox(true)}
              />
            )}

            {step === 'review' && (
              <section className="space-y-5">
                <ProposalBuilder
                  clientName={form.clientName}
                  city={form.city}
                  segmento={form.segmento}
                  points={proposalPoints}
                  totals={totals}
                  strategicText={argumentos}
                  simulationSummary={simulationSummary}
                  activePreviewPointId={activePreviewPoint?.id}
                  onSelectPreview={setActivePreviewPointId}
                  onGenerate={handleGenerate}
                />
              </section>
            )}

            {step === 'generated' && (
              <section className="space-y-4">
                <div className="rounded-2xl border border-brand-orange/30 bg-gradient-to-r from-brand-orange/20 to-brand-orange/5 p-4">
                  <h3 className="text-lg font-semibold text-white mb-1">Proposta gerada com sucesso</h3>
                  <p className="text-sm text-brand-gray-300">Apresentação pronta para reunião comercial, com narrativa estratégica e indicadores executivos.</p>
                </div>

                <ProposalBuilder
                  clientName={form.clientName}
                  city={form.city}
                  segmento={form.segmento}
                  points={proposalPoints}
                  totals={totals}
                  strategicText={argumentos}
                  simulationSummary={simulationSummary}
                  activePreviewPointId={activePreviewPoint?.id}
                  onSelectPreview={setActivePreviewPointId}
                  onGenerate={() => {}}
                />

                <div className="grid sm:grid-cols-3 gap-3">
                  <button
                    onClick={handleExportProposalPdf}
                    disabled={pdfBusy}
                    className="h-11 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover inline-flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(254,92,43,0.28)]"
                  >
                    <Download size={16} />
                    {pdfBusy ? 'Gerando PDF...' : 'Exportar PDF da proposta'}
                  </button>

                  <button
                    onClick={() => setShowPresentation(true)}
                    className="h-11 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] font-medium inline-flex items-center justify-center gap-2"
                  >
                    <Presentation size={16} />
                    Modo apresentação
                  </button>

                  <button
                    onClick={() => setStep('review')}
                    className="h-11 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] font-medium"
                  >
                    Voltar para revisão
                  </button>
                </div>
              </section>
            )}
          </div>
        </motion.div>
      </motion.div>

      {showPresentation && (
        <PresentationMode
          points={proposalPoints}
          totals={totals}
          segmento={form.segmento}
          onClose={() => setShowPresentation(false)}
        />
      )}

      {showPreviewLightbox && activePreviewPoint && (
        <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm p-4 md:p-8" onClick={() => setShowPreviewLightbox(false)}>
          <div className="max-w-6xl mx-auto h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray-400">Preview ampliado</p>
                <p className="text-sm text-white font-semibold">{activePreviewPoint.nome} · {activePreviewPoint.cidade}</p>
              </div>
              <button
                onClick={() => setShowPreviewLightbox(false)}
                className="px-3 py-1.5 rounded-lg border border-white/20 text-sm text-white/80 hover:text-white"
              >
                Fechar
              </button>
            </div>

            <div className="rounded-2xl border border-white/15 bg-black/45 flex-1 p-2 md:p-4 min-h-0">
              <img
                src={activePreviewPoint.proposalSimulationPreview || activePreviewPoint.simulacao_preview}
                alt={`Preview ${activePreviewPoint.nome}`}
                className="w-full h-full object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PreviewPanel({ proposalPoints, activePreviewPoint, onSelect, onExpand }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-brand-orange" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gray-400">Preview ampliado da simulação</h3>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-brand-gray-500">Clique nos thumbs para trocar</p>
          <button
            type="button"
            onClick={onExpand}
            disabled={!activePreviewPoint}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-40"
          >
            Ver em tela cheia
          </button>
        </div>
      </div>

      {activePreviewPoint ? (
        <div className="grid xl:grid-cols-[1fr_260px] gap-4">
          <div className="rounded-xl border border-white/10 bg-black/25 p-2">
            <img
              src={activePreviewPoint.proposalSimulationPreview || activePreviewPoint.simulacao_preview}
              alt={`Preview ${activePreviewPoint.nome}`}
              className="w-full h-[260px] md:h-[360px] object-contain rounded-lg bg-black/35"
            />
            <div className="px-2 pt-3">
              <p className="text-sm font-semibold text-white">{activePreviewPoint.nome}</p>
              <p className="text-xs text-brand-gray-400 mt-1">{activePreviewPoint.cidade} · {activePreviewPoint.tipo}</p>
            </div>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {proposalPoints.map((point) => {
              const previewUrl = point.proposalSimulationPreview || point.simulacao_preview;
              const selected = point.id === activePreviewPoint?.id;

              return (
                <button
                  key={point.id}
                  type="button"
                  disabled={!previewUrl}
                  onClick={() => onSelect(point.id)}
                  className={`w-full text-left rounded-xl border p-2 transition-all ${
                    selected
                      ? 'border-brand-orange bg-brand-orange/10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                  } ${!previewUrl ? 'opacity-55 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-12 rounded-md border border-white/10 bg-black/35 overflow-hidden shrink-0">
                      {previewUrl ? (
                        <img src={previewUrl} alt="thumb" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{point.nome}</p>
                      <p className="text-[11px] text-brand-gray-400 mt-1">
                        {previewUrl ? 'Simulação pronta para proposta' : (point.proposalSimulationStatus || 'Sem simulação')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="h-44 rounded-xl border border-dashed border-white/15 flex items-center justify-center text-sm text-brand-gray-500 bg-black/25">
          Gere as simulações para visualizar o preview ampliado.
        </div>
      )}
    </section>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-[0.12em] text-brand-gray-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full bg-white/[0.07] border border-white/15 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-orange/45 focus:bg-white/[0.09] transition-colors"
      />
    </div>
  );
}

function SelectInput({ label, value, onChange, options = [] }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-[0.12em] text-brand-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full bg-white/[0.07] border border-white/15 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-orange/45 focus:bg-white/[0.09] transition-colors"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-brand-dark text-white">
            {option.label}
          </option>
        ))}
      </select>
    </div>
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="proposal-slider w-full"
      />
    </div>
  );
}
