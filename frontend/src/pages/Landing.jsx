import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Expand,
  MapPinned,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import SmartMap from '../components/SmartMap';
import ProposalModal from '../components/ProposalModal';
import { fetchAdminSettings, fetchPontos } from '../lib/api';
import { generateMidiaKitPdf } from '../lib/midiaKitPdf';

const DISPLAY_FORMAT_ORDER = [
  'Elevador',
  'Tela Indoor',
  'Video Wall',
  'Vídeo Wall',
  'Painel LED',
  'LED Posto',
  'Totem Digital',
  'Frontlight',
  'Backlight',
];

function formatCompactNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function getPointImages(point) {
  return [point.imagem, point.imagem2].filter(Boolean);
}

function sortFormats(entries) {
  return [...entries].sort(([left], [right]) => {
    const leftIndex = DISPLAY_FORMAT_ORDER.findIndex((item) => item.toLowerCase() === left.toLowerCase());
    const rightIndex = DISPLAY_FORMAT_ORDER.findIndex((item) => item.toLowerCase() === right.toLowerCase());

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right, 'pt-BR');
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}

function AnimatedNumber({ value, formatter, className }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!isInView) {
      return undefined;
    }

    const finalValue = Number(value || 0);
    const duration = 1400;
    let frameId;
    let startTime;

    const tick = (timestamp) => {
      if (!startTime) {
        startTime = timestamp;
      }

      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(finalValue * eased);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [isInView, value]);

  return (
    <span ref={ref} className={className}>
      {formatter(displayValue)}
    </span>
  );
}

function AudienceBar({ label, value, delay }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-slate-200/80">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-orange-500 shadow-[0_0_24px_rgba(251,146,60,0.45)]"
          initial={{ width: 0, opacity: 0.5 }}
          whileInView={{ width: `${value}%`, opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 1.1, delay, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function PointMediaPreview({ point, onExpand }) {
  const images = getPointImages(point);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [point.id]);

  if (!images.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[2rem] border border-white/10 bg-slate-900/70 text-sm text-slate-400">
        Imagem em atualização
      </div>
    );
  }

  const currentImage = images[index];

  const goPrev = (event) => {
    event.stopPropagation();
    setIndex((current) => (current - 1 + images.length) % images.length);
  };

  const goNext = (event) => {
    event.stopPropagation();
    setIndex((current) => (current + 1) % images.length);
  };

  return (
    <div className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80">
      <button type="button" className="relative block h-64 w-full overflow-hidden" onClick={() => onExpand(point, index)}>
        <img
          src={currentImage}
          alt={point.nome}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          style={{
            objectPosition: `${point.imagem_foco_x ?? 50}% ${point.imagem_foco_y ?? 50}%`,
            transform: `scale(${point.imagem_foco_zoom ?? 1})`,
            transformOrigin: `${point.imagem_foco_x ?? 50}% ${point.imagem_foco_y ?? 50}%`,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent px-5 pb-4 pt-10 text-xs uppercase tracking-[0.28em] text-white/70">
          <span>{images.length > 1 ? `Galeria ${index + 1}/${images.length}` : 'Clique para ampliar'}</span>
          <Expand size={14} />
        </div>
      </button>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-slate-950/70 text-white backdrop-blur hover:bg-slate-900"
            aria-label="Foto anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-slate-950/70 text-white backdrop-blur hover:bg-slate-900"
            aria-label="Próxima foto"
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {images.map((image, imageIndex) => (
              <button
                key={`${point.id}-${image}`}
                type="button"
                className={`h-2.5 rounded-full transition-all ${imageIndex === index ? 'w-8 bg-orange-400' : 'w-2.5 bg-white/40'}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setIndex(imageIndex);
                }}
                aria-label={`Abrir foto ${imageIndex + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function LightboxModal({ point, index, onClose, onChangeIndex }) {
  const images = point ? getPointImages(point) : [];

  if (!point || !images.length) {
    return null;
  }

  const currentImage = images[index] || images[0];

  return (
    <AnimatePresence>
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 px-4 py-8 backdrop-blur-md"
      >
        <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Fechar visualização" />
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.22 }}
          className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 shadow-[0_30px_120px_rgba(15,23,42,0.8)]"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-orange-300">Visualização ampliada</p>
              <h3 className="mt-1 text-xl font-semibold text-white">{point.nome}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/10"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.35fr,0.65fr]">
            <div className="relative flex min-h-[340px] items-center justify-center bg-slate-900 p-4 sm:p-6">
              <img
                src={currentImage}
                alt={point.nome}
                className="max-h-[72vh] w-full rounded-[1.5rem] object-contain"
              />
              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => onChangeIndex((index - 1 + images.length) % images.length)}
                    className="absolute left-6 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white backdrop-blur hover:bg-slate-900"
                    aria-label="Imagem anterior"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeIndex((index + 1) % images.length)}
                    className="absolute right-6 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white backdrop-blur hover:bg-slate-900"
                    aria-label="Próxima imagem"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              ) : null}
            </div>

            <div className="space-y-5 border-t border-white/10 px-6 py-6 lg:border-l lg:border-t-0">
              <div className="grid grid-cols-2 gap-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Cidade</p>
                  <p className="mt-2 text-base font-semibold text-white">{point.cidade || 'Curitiba'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Formato</p>
                  <p className="mt-2 text-base font-semibold text-white">{point.tipo}</p>
                </div>
              </div>

              {point.endereco ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Endereço</p>
                  <p className="mt-2 leading-relaxed text-white/90">{point.endereco}</p>
                </div>
              ) : null}

              {point.descricao ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Contexto comercial</p>
                  <p className="mt-2 leading-relaxed text-white/90">{point.descricao}</p>
                </div>
              ) : null}

              {images.length > 1 ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {images.map((image, imageIndex) => (
                    <button
                      key={`${point.id}-${image}`}
                      type="button"
                      onClick={() => onChangeIndex(imageIndex)}
                      className={`overflow-hidden rounded-2xl border ${imageIndex === index ? 'border-orange-400' : 'border-white/10'} bg-slate-900`}
                    >
                      <img src={image} alt={`${point.nome} miniatura ${imageIndex + 1}`} className="h-20 w-24 object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Landing() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [points, setPoints] = useState([]);
  const [selectedPracas, setSelectedPracas] = useState([]);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedMapPoint, setSelectedMapPoint] = useState(null);
  const [lightboxState, setLightboxState] = useState({ point: null, index: 0 });

  useEffect(() => {
    Promise.all([fetchAdminSettings(), fetchPontos()])
      .then(([publicConfig, publicPoints]) => {
        setConfig(publicConfig);
        const visiblePoints = publicPoints.filter((point) => point.ativo);
        setPoints(visiblePoints);
        setSelectedMapPoint(visiblePoints[0] || null);
      })
      .catch((error) => {
        console.error('Erro ao carregar landing page:', error);
      });
  }, []);

  const availablePoints = useMemo(() => points.filter((point) => point.ativo !== false), [points]);

  const groupedPoints = useMemo(() => {
    const grouped = availablePoints.reduce((accumulator, point) => {
      const key = point.tipo || 'Outros';
      accumulator[key] = accumulator[key] || [];
      accumulator[key].push(point);
      return accumulator;
    }, {});

    return sortFormats(Object.entries(grouped));
  }, [availablePoints]);

  const campaignTotals = useMemo(() => {
    if (!selectedPracas.length) {
      return null;
    }

    return selectedPracas.reduce(
      (accumulator, point) => ({
        totalValue: accumulator.totalValue + Number(point.valor_unitario || point.preco || 0),
        impacts: accumulator.impacts + Number(point.impactos_estimados || point.fluxo || 0),
      }),
      { totalValue: 0, impacts: 0 }
    );
  }, [selectedPracas]);

  const landingStats = useMemo(() => {
    const totalImpact = availablePoints.reduce((sum, point) => sum + Number(point.impactos_estimados || 0), 0);
    const totalAudience = availablePoints.reduce((sum, point) => sum + Number(point.audience || 0), 0);
    const totalFormats = groupedPoints.length;
    const cityCount = new Set(availablePoints.map((point) => point.cidade).filter(Boolean)).size || 1;

    return [
      {
        label: 'Impactos mensais estimados',
        value: totalImpact,
        formatter: (value) => `${formatCompactNumber(value)}+`,
      },
      {
        label: 'Audiência combinada',
        value: totalAudience,
        formatter: (value) => `${formatCompactNumber(value)} pessoas`,
      },
      {
        label: 'Formatos ativos',
        value: totalFormats,
        formatter: (value) => formatCompactNumber(value),
      },
      {
        label: 'Cidades cobertas',
        value: cityCount,
        formatter: (value) => formatCompactNumber(value),
      },
    ];
  }, [availablePoints, groupedPoints]);

  const audienceBreakdown = useMemo(() => {
    const rawValues = [
      { label: 'Fluxo urbano e deslocamento diário', value: 92 },
      { label: 'Decisão de compra próxima ao ponto', value: 78 },
      { label: 'Atenção qualificada em ambientes indoor', value: 66 },
    ];

    return rawValues;
  }, []);

  const handleTogglePraca = (point) => {
    setSelectedPracas((current) => {
      if (current.some((item) => item.id === point.id)) {
        return current.filter((item) => item.id !== point.id);
      }

      return [...current, point];
    });
  };

  const handleExportPdf = async () => {
    try {
      await generateMidiaKitPdf(availablePoints, config || {});
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      window.alert('Nao foi possivel gerar o PDF agora.');
    }
  };

  const openLightbox = (point, index = 0) => {
    setLightboxState({ point, index });
  };

  const closeLightbox = () => {
    setLightboxState({ point: null, index: 0 });
  };

  const highlightedPoint = selectedMapPoint || availablePoints[0] || null;

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-12rem] top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-orange-500/18 blur-3xl" />
        <div className="absolute right-[-8rem] top-[8rem] h-[24rem] w-[24rem] rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-[20%] h-[22rem] w-[22rem] rounded-full bg-orange-600/12 blur-3xl" />
      </div>

      <Navbar showNav={false} />

      <main className="relative z-10 pb-24">
        <section className="px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.22),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.97),rgba(10,14,28,0.96))] px-6 py-10 shadow-[0_25px_120px_rgba(15,23,42,0.55)] sm:px-8 lg:px-12 lg:py-14">
              <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />
              <div className="absolute bottom-[-3rem] left-[-2rem] h-56 w-56 rounded-full bg-amber-200/10 blur-3xl" />

              <div className="grid gap-12 lg:grid-cols-[1.1fr,0.9fr] lg:items-center">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.28em] text-orange-200">
                    <Sparkles size={14} />
                    Midia kit publico
                  </div>

                  <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                    Inventario DOOH com leitura comercial clara, visual premium e acesso separado da area interna.
                  </h1>

                  <p className="mt-6 max-w-2xl text-base leading-8 text-slate-200/80 sm:text-lg">
                    Apresente cobertura, contexto e qualidade dos ativos em uma home publica enxuta. O mapa e a galeria ficam disponiveis aqui; a operacao comercial entra por um caminho separado em /comercial.
                  </p>

                  <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowMapModal(true)}
                      className="inline-flex items-center justify-center gap-3 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 px-7 py-4 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(249,115,22,0.35)] transition hover:scale-[1.01]"
                    >
                      <MapPinned size={18} />
                      Abrir mapa da rede
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/comercial')}
                      className="inline-flex items-center justify-center gap-3 rounded-full border border-white/15 bg-white/5 px-7 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      <ShieldCheck size={18} />
                      Entrar na area comercial
                    </button>
                  </div>

                  <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {landingStats.map((stat, index) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ duration: 0.45, delay: index * 0.08 }}
                        className="rounded-[1.7rem] border border-white/10 bg-white/5 p-5 backdrop-blur"
                      >
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-300/75">{stat.label}</p>
                        <AnimatedNumber value={stat.value} formatter={stat.formatter} className="mt-3 block text-2xl font-semibold text-white sm:text-3xl" />
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -right-4 top-10 hidden h-44 w-44 rounded-full bg-orange-400/25 blur-3xl lg:block" />
                  <div className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                    <p className="text-xs uppercase tracking-[0.28em] text-orange-300">Leitura rapida da audiencia</p>
                    <h2 className="mt-3 text-2xl font-semibold text-white">Presenca, contexto e decisao perto do inventario.</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-300/80">
                      As barras abaixo ajudam a explicar o perfil de exposicao percebido no inventario publico sem abrir os modulos internos de exploracao.
                    </p>

                    <div className="mt-8 space-y-5">
                      {audienceBreakdown.map((item, index) => (
                        <AudienceBar key={item.label} label={item.label} value={item.value} delay={index * 0.12} />
                      ))}
                    </div>

                    <div className="mt-8 rounded-[1.8rem] border border-orange-400/20 bg-orange-400/10 p-5 text-sm text-orange-50/90">
                      <p className="text-xs uppercase tracking-[0.24em] text-orange-200/80">Acesso publico</p>
                      <p className="mt-3 leading-7">
                        Aqui o visitante entende a rede, abre o mapa e consulta imagens. Cotacao, planejamento e administracao permanecem protegidos em /comercial.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.95fr,1.05fr]">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-orange-300">Mídia kit em PDF</p>
              <h2 className="mt-3 text-3xl font-semibold text-white">Leve a versao editorial da rede em um clique.</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300/85">
                Gere o material institucional com os pontos ativos e use a selecao abaixo para simular uma proposta comercial antes de entrar no ambiente protegido.
              </p>
              <div className="mt-6 flex flex-col gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-50"
                >
                  Exportar mídia kit
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setProposalModalOpen(true)}
                  className="inline-flex items-center justify-center gap-3 rounded-full border border-white/15 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Montar proposta com a selecao atual
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: 0.08 }}
              className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(249,115,22,0.14),rgba(15,23,42,0.85))] p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-orange-300">Selecao em andamento</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-white/10 bg-slate-950/45 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Pontos marcados</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{selectedPracas.length}</p>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-slate-950/45 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Impactos estimados</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{campaignTotals ? `${formatCompactNumber(campaignTotals.impacts)}+` : '0'}</p>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-slate-950/45 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Investimento total</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{campaignTotals ? formatCurrency(campaignTotals.totalValue) : formatCurrency(0)}</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-7 text-slate-300/80">
                Selecione pontos nas secoes abaixo para abrir a proposta comercial com score, cobertura e impacto ja calculados.
              </p>
            </motion.div>
          </div>
        </section>

        <section className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-10">
            {groupedPoints.map(([format, formatPoints], formatIndex) => (
              <motion.section
                key={format}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.45, delay: formatIndex * 0.04 }}
                className="rounded-[2.25rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8"
              >
                <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-orange-300">Formato</p>
                    <h2 className="mt-2 text-3xl font-semibold text-white">{format}</h2>
                  </div>
                  <p className="max-w-2xl text-sm leading-7 text-slate-300/75">
                    Visual publico com imagens ampliaveis, contexto resumido e selecao rapida para montagem de proposta.
                  </p>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  {formatPoints.map((point) => {
                    const selected = selectedPracas.some((item) => item.id === point.id);
                    return (
                      <article key={point.id} className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/55 shadow-[0_12px_40px_rgba(15,23,42,0.28)]">
                        <PointMediaPreview point={point} onExpand={openLightbox} />
                        <div className="space-y-5 p-6">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-[0.24em] text-orange-300">{point.cidade || 'Curitiba'}</p>
                              <h3 className="mt-2 text-2xl font-semibold text-white">{point.nome}</h3>
                              {point.endereco ? <p className="mt-2 text-sm text-slate-300/75">{point.endereco}</p> : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleTogglePraca(point)}
                              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${selected ? 'bg-orange-400 text-slate-950' : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'}`}
                            >
                              {selected ? 'Selecionado' : 'Selecionar'}
                            </button>
                          </div>

                          {point.descricao ? <p className="text-sm leading-7 text-slate-300/85">{point.descricao}</p> : null}

                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Audiência</p>
                              <p className="mt-3 text-xl font-semibold text-white">{formatCompactNumber(point.audience || 0)}</p>
                            </div>
                            <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Impactos</p>
                              <p className="mt-3 text-xl font-semibold text-white">{formatCompactNumber(point.impactos_estimados || 0)}</p>
                            </div>
                            <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Valor tabela</p>
                              <p className="mt-3 text-xl font-semibold text-white">{formatCurrency(point.valor_unitario || 0)}</p>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </motion.section>
            ))}
          </div>
        </section>
      </main>

      <AnimatePresence>
        {showMapModal ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md"
          >
            <button type="button" className="absolute inset-0" onClick={() => setShowMapModal(false)} aria-label="Fechar mapa" />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.24 }}
              className="relative z-10 flex h-[min(86vh,860px)] w-full max-w-7xl flex-col overflow-hidden rounded-[2.3rem] border border-white/10 bg-[#081120] shadow-[0_30px_120px_rgba(15,23,42,0.8)] lg:flex-row"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 lg:hidden">
                <p className="text-sm font-semibold text-white">Mapa da rede</p>
                <button
                  type="button"
                  onClick={() => setShowMapModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="relative min-h-[340px] flex-1">
                <SmartMap pontos={availablePoints} selectedId={highlightedPoint?.id} onSelect={setSelectedMapPoint} onOpenDetails={setSelectedMapPoint} />
              </div>

              <aside className="w-full border-t border-white/10 bg-slate-950/85 p-6 lg:w-[390px] lg:border-l lg:border-t-0">
                <div className="hidden items-center justify-between lg:flex">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-orange-300">Mapa interativo</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">Rede publica</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMapModal(false)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <X size={18} />
                  </button>
                </div>

                {highlightedPoint ? (
                  <div className="mt-4 space-y-5 lg:mt-8">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-orange-300">{highlightedPoint.tipo}</p>
                      <h4 className="mt-2 text-2xl font-semibold text-white">{highlightedPoint.nome}</h4>
                      {highlightedPoint.endereco ? <p className="mt-3 text-sm leading-6 text-slate-300/80">{highlightedPoint.endereco}</p> : null}
                    </div>

                    {getPointImages(highlightedPoint)[0] ? (
                      <button type="button" className="block w-full overflow-hidden rounded-[1.6rem] border border-white/10" onClick={() => openLightbox(highlightedPoint, 0)}>
                        <img src={getPointImages(highlightedPoint)[0]} alt={highlightedPoint.nome} className="h-48 w-full object-cover" />
                      </button>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Audiência</p>
                        <p className="mt-3 text-lg font-semibold text-white">{formatCompactNumber(highlightedPoint.audience || 0)}</p>
                      </div>
                      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Tabela</p>
                        <p className="mt-3 text-lg font-semibold text-white">{formatCurrency(highlightedPoint.valor_unitario || 0)}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => handleTogglePraca(highlightedPoint)}
                        className="rounded-full bg-gradient-to-r from-orange-400 to-orange-500 px-5 py-3 text-sm font-semibold text-slate-950"
                      >
                        {selectedPracas.some((item) => item.id === highlightedPoint.id) ? 'Remover da proposta' : 'Adicionar a proposta'}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/comercial')}
                        className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                      >
                        Ir para a area comercial
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 rounded-[1.8rem] border border-dashed border-white/15 bg-white/5 p-6 text-sm leading-7 text-slate-300/80">
                    Selecione um ponto no mapa para visualizar o resumo do ativo.
                  </div>
                )}
              </aside>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <LightboxModal
        point={lightboxState.point}
        index={lightboxState.index}
        onClose={closeLightbox}
        onChangeIndex={(index) => setLightboxState((current) => ({ ...current, index }))}
      />

      <ProposalModal
        open={proposalModalOpen}
        onClose={() => setProposalModalOpen(false)}
        selectedPoints={selectedPracas}
      />
    </div>
  );
}

export default Landing;