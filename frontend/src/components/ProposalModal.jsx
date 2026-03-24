import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, Download, Presentation, Upload } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { campaignTotals, generateCommercialArguments } from '../lib/strategy';
import {
  defaultDisplaySettings,
  generateSimulationPreview,
  normalizeDisplaySettings,
  parseSimulationConfig
} from '../lib/simulation';
import ProposalBuilder from './ProposalBuilder';
import PresentationMode from './PresentationMode';

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
      return {
        ...point,
        proposalSimulationPreview: result?.previewUrl || '',
        proposalSimulationStatus: result?.status || (!simulationArtFile ? 'Envie a arte para gerar' : 'Gerar simulacao pendente')
      };
    });
  }, [favorites, simulationArtFile, simulationResults]);

  const simulationSummary = useMemo(() => {
    const items = Object.values(simulationResults);
    if (!simulationArtFile) {
      return 'A area da tela vem do admin. Envie a arte da campanha neste modal para gerar os previews que entram na proposta.';
    }
    if (!items.length) {
      return 'Arte carregada. Ajuste brilho, reflexo, spill de luz e pixel LED para aproximar o look do simulador antes de gerar.';
    }

    const geradas = items.filter((item) => item.status === 'Gerada').length;
    const semArea = items.filter((item) => item.status === 'Area da tela nao cadastrada no admin').length;
    const semImagem = items.filter((item) => item.status === 'Imagem base do ponto nao cadastrada').length;
    const falhas = items.filter((item) => item.status === 'Falha ao gerar').length;

    return [
      `${geradas} simulacao${geradas === 1 ? '' : 'oes'} gerada${geradas === 1 ? '' : 's'}`,
      semArea ? `${semArea} ponto${semArea === 1 ? '' : 's'} sem area cadastrada` : null,
      semImagem ? `${semImagem} ponto${semImagem === 1 ? '' : 's'} sem imagem base` : null,
      falhas ? `${falhas} falha${falhas === 1 ? '' : 's'} de processamento` : null,
      `brilho ${simulationSettings.brightness.toFixed(2)}`,
      `reflexo ${simulationSettings.reflection.toFixed(2)}`,
      `pixel LED ${simulationSettings.ledPixelIntensity.toFixed(2)}`
    ].filter(Boolean).join(' · ');
  }, [simulationArtFile, simulationResults, simulationSettings]);

  const handleGenerate = () => setStep('generated');

  const handlePrint = () => window.print();

  const handleGenerateSimulations = async () => {
    if (!simulationArtUrl) {
      setSimulationError('Selecione a arte da campanha para gerar as simulacoes.');
      return;
    }

    setSimulationBusy(true);
    setSimulationError('');

    const nextEntries = await Promise.all(favorites.map(async (point) => {
      if (!point.simulacao_tela) {
        return [point.id, { status: 'Area da tela nao cadastrada no admin', previewUrl: '' }];
      }
      if (!point.imagem) {
        return [point.id, { status: 'Imagem base do ponto nao cadastrada', previewUrl: '' }];
      }

      try {
        const config = parseSimulationConfig(point.simulacao_tela);
        if (!config?.corners) {
          return [point.id, { status: 'Area da tela nao cadastrada no admin', previewUrl: '' }];
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
      setSimulationError(failed[1].detail || 'Uma ou mais simulacoes falharam.');
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
          className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-brand-dark border border-white/10 rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/60 hover:text-white transition-all"
          >
            <X size={18} />
          </button>

          <div className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <FileText size={24} className="text-brand-orange" />
              <div>
                <h2 className="text-2xl font-bold text-white">Modo gerar proposta automatica</h2>
                <p className="text-sm text-brand-gray-400">Estrutura pronta para exportacao em PDF e apresentacao comercial.</p>
              </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-gray-400 mb-3">Dados da proposta</h3>
              <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
                <Input label="Nome do cliente" value={form.clientName} onChange={(value) => setForm((s) => ({ ...s, clientName: value }))} />
                <Input label="Cidade" value={form.city} onChange={(value) => setForm((s) => ({ ...s, city: value }))} />
                <Input label="Segmento" value={form.segmento} onChange={(value) => setForm((s) => ({ ...s, segmento: value }))} />
                <Input label="Objetivo" value={form.objetivo} onChange={(value) => setForm((s) => ({ ...s, objetivo: value }))} />
                <Input label="Publico" value={form.publico} onChange={(value) => setForm((s) => ({ ...s, publico: value }))} />
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-5 space-y-4">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-gray-400 mb-1">Arte da campanha</h3>
                  <p className="text-sm text-brand-gray-400">A arte enviada aqui sera aplicada sobre a area de tela cadastrada no admin para cada ponto da proposta.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-brand-gray-300 hover:bg-white/10 cursor-pointer transition-colors">
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
                    className="px-4 py-2.5 rounded-xl bg-brand-orange text-white font-medium hover:bg-brand-orange-hover disabled:opacity-50"
                  >
                    {simulationBusy ? 'Gerando simulacoes...' : 'Gerar simulacoes'}
                  </button>
                </div>
              </div>

              {simulationError && (
                <p className="text-xs text-red-400">{simulationError}</p>
              )}

              <div className="grid lg:grid-cols-[220px_1fr] gap-4 items-start">
                <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                  <p className="text-[11px] text-brand-gray-500 px-1 pb-2">Preview da arte enviada</p>
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
                    label="Simulacoes geradas"
                    value={Object.values(simulationResults).filter((item) => item.status === 'Gerada').length}
                    tone="success"
                  />
                  <StatusCard
                    label="Pendencias de cadastro"
                    value={Object.values(simulationResults).filter((item) => item.status === 'Area da tela nao cadastrada no admin' || item.status === 'Imagem base do ponto nao cadastrada').length}
                    tone="warning"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-brand-gray-400 mb-1">Realismo da tela</p>
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

            {step === 'review' && (
              <ProposalBuilder
                clientName={form.clientName}
                city={form.city}
                points={proposalPoints}
                totals={totals}
                strategicText={argumentos}
                simulationSummary={simulationSummary}
                onGenerate={handleGenerate}
              />
            )}

            {step === 'generated' && (
              <section className="space-y-4">
                <div className="rounded-2xl border border-brand-orange/30 bg-brand-orange/10 p-4">
                  <h3 className="text-lg font-semibold text-white mb-1">Proposta gerada com sucesso</h3>
                  <p className="text-sm text-brand-gray-300">Apresentacao pronta para reuniao comercial, com narrativa estrategica e indicadores executivos.</p>
                </div>

                <ProposalBuilder
                  clientName={form.clientName}
                  city={form.city}
                  points={proposalPoints}
                  totals={totals}
                  strategicText={argumentos}
                  simulationSummary={simulationSummary}
                  onGenerate={() => {}}
                />

                <div className="grid sm:grid-cols-3 gap-3">
                  <button
                    onClick={handlePrint}
                    className="h-11 rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover inline-flex items-center justify-center gap-2"
                  >
                    <Download size={16} />
                    Exportar / Imprimir
                  </button>

                  <button
                    onClick={() => setShowPresentation(true)}
                    className="h-11 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] font-medium inline-flex items-center justify-center gap-2"
                  >
                    <Presentation size={16} />
                    Modo apresentacao
                  </button>

                  <button
                    onClick={() => setStep('review')}
                    className="h-11 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] font-medium"
                  >
                    Voltar para revisao
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
          onClose={() => setShowPresentation(false)}
        />
      )}
    </>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-brand-gray-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-orange/40"
      />
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
      <div className="text-[10px] uppercase tracking-wide text-brand-gray-500">{label}</div>
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
        className="w-full accent-brand-orange"
      />
    </div>
  );
}
