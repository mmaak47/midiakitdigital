import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  DollarSign,
  Expand,
  Hash,
  Layers3,
  MapPin,
  MapPinned,
  Monitor,
  Play,
  RotateCcw,
  Target,
  Users,
  X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import CustomSelect from '../components/CustomSelect';
import SmartMap from '../components/SmartMap';
import { fetchPontos } from '../lib/api';
import { campaignTotals } from '../lib/strategy';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
  })
};

function formatInt(value) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(value) || 0));
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function anchorIdFromTipo(tipo) {
  const base = (tipo || 'sem-tipo').toLowerCase().trim();
  return `tipo-${base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

// ─── AnimatedCounter ──────────────────────────────────────────────────────────
function AnimatedCounter({ value, formatter = formatInt, className = '' }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView || !value) return;
    const finalValue = Number(value);
    const duration = 1100;
    let frameId;
    let startTime;

    const tick = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(finalValue * eased);
      if (progress < 1) frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isInView, value]);

  return <span ref={ref} className={className}>{formatter(display)}</span>;
}

// ─── PointImageGallery ────────────────────────────────────────────────────────
function PointImageGallery({ ponto, onExpand }) {
  const images = [ponto.imagem, ponto.imagem2].filter(Boolean);
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [ponto.id]);

  if (!images.length) {
    return (
      <div className="rounded-xl overflow-hidden bg-white/[0.03] min-h-[180px] flex items-center justify-center text-brand-gray-600 text-sm border border-white/5">
        Sem imagem
      </div>
    );
  }

  const current = images[idx];
  const hasMultiple = images.length > 1;

  return (
    <div className="relative group rounded-xl overflow-hidden bg-black min-h-[180px] border border-white/10">
      <img
        src={current}
        alt={ponto.nome}
        className="w-full h-full object-cover min-h-[180px] transition-transform duration-500 group-hover:scale-[1.03] cursor-pointer"
        onClick={() => onExpand(ponto, idx)}
        style={{ objectPosition: `${ponto.imagem_foco_x ?? 50}% ${ponto.imagem_foco_y ?? 50}%` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5 pointer-events-none">
        <span className="flex items-center gap-1 text-[11px] text-white/80 bg-black/50 rounded-md px-2 py-1">
          <Expand size={11} /> Ampliar
        </span>
      </div>
      <button className="absolute inset-0 w-full h-full opacity-0" onClick={() => onExpand(ponto, idx)} aria-label="Ampliar imagem" />
      {hasMultiple && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + images.length) % images.length); }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/75 border border-white/25 flex items-center justify-center text-white hover:bg-black transition z-10"
            aria-label="Foto anterior"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % images.length); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/75 border border-white/25 flex items-center justify-center text-white hover:bg-black transition z-10"
            aria-label="Próxima foto"
          >
            <ChevronRight size={13} />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`rounded-full transition-all duration-200 ${i === idx ? 'w-5 h-2 bg-brand-orange' : 'w-2 h-2 bg-white/50 hover:bg-white/80'}`}
                aria-label={`Foto ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Lightbox ────────────────────────────────────────────────────────────────
function Lightbox({ ponto, imageIndex, onClose, onChangeIndex }) {
  const images = ponto ? [ponto.imagem, ponto.imagem2].filter(Boolean) : [];

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && images.length > 1) onChangeIndex((imageIndex - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight' && images.length > 1) onChangeIndex((imageIndex + 1) % images.length);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [imageIndex, images.length, onClose, onChangeIndex]);

  if (!ponto || !images.length) return null;
  const current = images[imageIndex] || images[0];
  const hasMultiple = images.length > 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/93 backdrop-blur-xl px-4 py-8"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <span className="text-xs uppercase tracking-wider text-brand-orange">{ponto.tipo}</span>
            <h3 className="text-lg font-semibold text-white">{ponto.nome}</h3>
            {ponto.endereco && <p className="text-xs text-brand-gray-400 mt-0.5">{ponto.endereco}</p>}
          </div>
          <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-full border border-white/20 bg-white/5 text-white hover:bg-white/15 transition" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="relative rounded-2xl overflow-hidden bg-[#0d0d0d] border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
          <img src={current} alt={ponto.nome} className="w-full max-h-[72vh] object-contain" />
          {hasMultiple && (
            <>
              <button onClick={() => onChangeIndex((imageIndex - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white hover:bg-black transition" aria-label="Imagem anterior">
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => onChangeIndex((imageIndex + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white hover:bg-black transition" aria-label="Próxima imagem">
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>
        {hasMultiple && (
          <div className="flex justify-center gap-2 mt-4">
            {images.map((_, i) => (
              <button key={i} onClick={() => onChangeIndex(i)} className={`h-2 rounded-full transition-all duration-200 ${i === imageIndex ? 'w-8 bg-brand-orange' : 'w-2 bg-white/30 hover:bg-white/60'}`} aria-label={`Ir para imagem ${i + 1}`} />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── MapModal ────────────────────────────────────────────────────────────────
function MapModal({ pontos, onClose }) {
  const [selectedPoint, setSelectedPoint] = useState(pontos.find((p) => p.lat && p.lng) || null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/88 backdrop-blur-md px-4 py-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-6xl flex flex-col lg:flex-row overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_30px_100px_rgba(0,0,0,0.85)]"
        style={{ height: 'min(82vh, 700px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-h-[320px]">
          <SmartMap pontos={pontos} selectedId={selectedPoint?.id} onSelect={setSelectedPoint} onOpenDetails={setSelectedPoint} />
        </div>
        <aside className="w-full lg:w-[300px] border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0d0d0d] flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <div>
              <div className="text-xs uppercase tracking-wider text-brand-orange mb-0.5">Mapa da rede</div>
              <h3 className="text-sm font-semibold text-white">{pontos.filter((p) => p.lat && p.lng).length} pontos no mapa</h3>
            </div>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/15 transition" aria-label="Fechar mapa">
              <X size={15} />
            </button>
          </div>
          {selectedPoint ? (
            <div className="flex-1 p-4 space-y-3">
              {selectedPoint.imagem && (
                <div className="rounded-xl overflow-hidden h-32 border border-white/10">
                  <img src={selectedPoint.imagem} alt={selectedPoint.nome} className="w-full h-full object-cover" />
                </div>
              )}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-brand-orange">{selectedPoint.tipo}</span>
                <h4 className="text-base font-semibold text-white mt-1">{selectedPoint.nome}</h4>
                {selectedPoint.cidade && <p className="text-sm text-brand-gray-400 mt-0.5">{selectedPoint.cidade}</p>}
                {selectedPoint.endereco && (
                  <p className="text-sm text-brand-gray-300 mt-2 flex items-start gap-1.5">
                    <MapPin size={13} className="text-brand-orange mt-0.5 shrink-0" />{selectedPoint.endereco}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                  <div className="text-[11px] text-brand-gray-500 uppercase flex items-center gap-1"><Users size={11} /> Fluxo</div>
                  <div className="font-semibold mt-1">{formatInt(Number(selectedPoint.fluxo) || 0)}<span className="text-xs text-brand-gray-500">/mês</span></div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                  <div className="text-[11px] text-brand-gray-500 uppercase flex items-center gap-1"><Monitor size={11} /> Telas</div>
                  <div className="font-semibold mt-1">{formatInt(Number(selectedPoint.telas) || 0)}</div>
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                <div className="text-[11px] text-brand-gray-500 uppercase flex items-center gap-1"><DollarSign size={11} /> Investimento mensal</div>
                <div className="text-lg font-bold mt-1">{formatMoney(Number(selectedPoint.preco) || 0)}</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-brand-gray-500 text-sm p-5 text-center">
              Clique em um ponto no mapa para ver os detalhes
            </div>
          )}
        </aside>
      </motion.div>
    </motion.div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [allPontos, setAllPontos] = useState([]);
  const [selectedPracas, setSelectedPracas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [lightbox, setLightbox] = useState({ ponto: null, imageIndex: 0 });

  useEffect(() => {
    let active = true;

    async function loadPontos() {
      try {
        const data = await fetchPontos();
        if (active) setAllPontos(data);
      } catch {
        if (active) setAllPontos([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPontos();

    return () => {
      active = false;
    };
  }, []);

  const pracas = useMemo(() => {
    const unique = new Set(allPontos.map((p) => p.cidade).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allPontos]);

  const quickPracas = useMemo(() => pracas.slice(0, 5), [pracas]);

  const selectedPracaLabel = useMemo(() => {
    if (!selectedPracas.length) return 'Todas as praças';
    if (selectedPracas.length === 1) return selectedPracas[0];
    return `${selectedPracas.length} praças selecionadas`;
  }, [selectedPracas]);

  const pontos = useMemo(() => {
    if (!selectedPracas.length) return allPontos;
    return allPontos.filter((p) => selectedPracas.includes(p.cidade));
  }, [allPontos, selectedPracas]);

  const resumo = useMemo(() => {
    const totals = campaignTotals(pontos);

    return {
      pontos: totals.quantidade,
      telas: totals.telasTotal,
      fluxo: totals.fluxoTotal,
      insercoes: totals.insercoesTotal,
      ticketMedio: Math.round(totals.ticketMedio),
      cpm: totals.cpmEstimado
    };
  }, [pontos]);

  const formatos = useMemo(() => {
    const map = new Map();

    pontos.forEach((p) => {
      const tipo = p.tipo || 'Sem tipo';
      if (!map.has(tipo)) {
        map.set(tipo, { tipo, quantidade: 0, telas: 0, fluxo: 0 });
      }
      const current = map.get(tipo);
      current.quantidade += 1;
      current.telas += Number(p.telas) || 0;
      current.fluxo += Number(p.fluxo) || 0;
    });

    return Array.from(map.values()).sort((a, b) => b.quantidade - a.quantidade);
  }, [pontos]);

  const publicos = useMemo(() => {
    const map = new Map();

    pontos.forEach((p) => {
      const label = p.publico || 'Não informado';
      map.set(label, (map.get(label) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total);
  }, [pontos]);

  const tiposComAncora = useMemo(() => {
    return formatos.map((f) => ({
      ...f,
      anchorId: anchorIdFromTipo(f.tipo)
    }));
  }, [formatos]);

  const pontosPorTipo = useMemo(() => {
    const map = new Map();

    pontos.forEach((p) => {
      const tipo = p.tipo || 'Sem tipo';
      if (!map.has(tipo)) {
        map.set(tipo, []);
      }
      map.get(tipo).push(p);
    });

    return tiposComAncora.map((tipoInfo) => ({
      ...tipoInfo,
      pontos: (map.get(tipoInfo.tipo) || []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    }));
  }, [pontos, tiposComAncora]);

  const explorerPath = useMemo(() => {
    const params = new URLSearchParams();
    selectedPracas.forEach((praca) => params.append('cidade', praca));
    const query = params.toString();
    return `/explorar${query ? `?${query}` : ''}`;
  }, [selectedPracas]);

  const handleExportPdf = async () => {
    if (!pontos.length || generatingPdf) return;
    setGeneratingPdf(true);
    try {
      const { generateMidiaKitPdf } = await import('../lib/midiaKitPdf');
      await generateMidiaKitPdf({
        praca: selectedPracaLabel,
        pracas: selectedPracas,
        pontos
      });
    } catch (err) {
      console.error(err);
      window.alert('Nao foi possivel gerar o PDF agora. Tente novamente.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const openLightbox = (ponto, imageIndex = 0) => setLightbox({ ponto, imageIndex });
  const closeLightbox = () => setLightbox({ ponto: null, imageIndex: 0 });

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* ─── AMBIENT BACKGROUND ───────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[#050505]" />
        <div className="absolute top-0 right-0 w-[55vw] h-[100vh] opacity-[0.04] bg-cover bg-center" style={{ backgroundImage: "url('/audience.jpg')", filter: 'blur(2px)' }} />
        <div className="absolute top-[55vh] left-0 w-[50vw] h-[70vh] opacity-[0.035] bg-cover bg-center" style={{ backgroundImage: "url('/about-1.jpg')", filter: 'blur(3px)' }} />
        <div className="absolute top-[130vh] right-0 w-[48vw] h-[60vh] opacity-[0.04] bg-cover bg-top" style={{ backgroundImage: "url('/showcase.png')", filter: 'blur(2px)' }} />
        <div className="absolute top-[210vh] left-0 w-full h-[80vh] opacity-[0.025] bg-cover bg-center" style={{ backgroundImage: "url('/wallpaper.jpg')", filter: 'blur(4px)' }} />
        <div className="absolute top-[290vh] left-0 w-[50vw] h-[60vh] opacity-[0.03] bg-cover bg-center" style={{ backgroundImage: "url('/about-2.jpg')", filter: 'blur(3px)' }} />
        <div className="absolute top-[300vh] right-0 w-[55vw] h-[60vh] opacity-[0.025] bg-cover" style={{ backgroundImage: "url('/stock-wallpaper.jpg')", filter: 'blur(4px)' }} />
        {/* Orange glow blobs */}
        <div className="absolute -top-20 -left-16 w-[500px] h-[500px] bg-[#FE5C2B]/14 rounded-full blur-[130px]" />
        <div className="absolute top-[38vh] right-[-60px] w-[420px] h-[420px] bg-[#FE5C2B]/8 rounded-full blur-[120px]" />
        <div className="absolute top-[100vh] left-[10%] w-[380px] h-[380px] bg-[#FE5C2B]/7 rounded-full blur-[120px]" />
        <div className="absolute top-[165vh] right-[8%] w-[360px] h-[360px] bg-[#FE5C2B]/6 rounded-full blur-[110px]" />
        <div className="absolute top-[240vh] left-[5%] w-[420px] h-[420px] bg-[#FE5C2B]/5 rounded-full blur-[130px]" />
        <div className="absolute top-[310vh] right-[12%] w-[350px] h-[350px] bg-[#FE5C2B]/5 rounded-full blur-[120px]" />
      </div>

      <Navbar showNav={false} />

      <section className="pt-20 pb-10 border-b border-white/5 relative overflow-visible">
        <div
          className="absolute inset-0 opacity-35 bg-cover bg-center"
          style={{ backgroundImage: "url('/city-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/80 to-[#050505]" />
        <div className="absolute -top-16 left-10 w-64 h-64 bg-brand-orange/20 rounded-full blur-[90px]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-orange/30 bg-brand-orange/10 text-xs font-semibold tracking-wide text-brand-orange mb-6">
              MIDIA KIT DIGITAL INTERMIDIA 2026
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="text-3xl sm:text-4xl md:text-5xl font-bold leading-[1.05] tracking-tight mb-4 max-w-4xl"
          >
            Planejamento por praça com inventário real, audiência e oportunidades de mídia.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="text-base md:text-lg text-brand-gray-400 max-w-3xl mb-8"
          >
            Selecione uma praça para gerar um mídia kit focado na cidade ou visualize o consolidado de todas as praças.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="grid lg:grid-cols-[1fr_auto_auto_auto] gap-4 p-6 bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 rounded-2xl backdrop-blur-xl shadow-xl shadow-black/30"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <CustomSelect 
                label="Praça"
                value={selectedPracas}
                onChange={setSelectedPracas}
                options={pracas}
                placeholder="Selecionar uma ou mais praças"
                multiple
              />

              <div>
                <label className="text-xs text-brand-gray-500 uppercase tracking-wide font-semibold block mb-2">Visualização</label>
                <div className="h-[50px] rounded-xl bg-gradient-to-r from-white/10 to-white/5 border border-white/15 px-4 flex items-center text-sm font-medium text-white">
                  {!selectedPracas.length ? 'Consolidado multirregional' : `Foco em ${selectedPracaLabel}`}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowMapModal(true)}
              className="group h-[50px] self-end px-6 bg-gradient-to-r from-brand-orange to-brand-orange-hover text-white font-bold rounded-xl hover:shadow-lg hover:shadow-brand-orange/50 transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <MapPinned size={16} />
              Abrir mapa
            </button>

            <button
              onClick={handleExportPdf}
              disabled={generatingPdf || pontos.length === 0}
              className="h-[50px] self-end px-6 bg-white/5 border border-white/15 text-white font-semibold rounded-xl hover:bg-white/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {generatingPdf ? 'Gerando PDF...' : 'Gerar PDF da praça'}
            </button>
          </motion.div>

          <div className="flex flex-wrap gap-2 mt-4">
            {quickPracas.map((praca) => (
              <button
                key={praca}
                onClick={() => setSelectedPracas((current) => current.includes(praca)
                  ? current.filter((item) => item !== praca)
                  : [...current, praca])}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedPracas.includes(praca)
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : 'bg-white/[0.03] text-brand-gray-400 border-white/10 hover:text-white'
                }`}
              >
                {praca}
              </button>
            ))}
            <button
              onClick={() => setSelectedPracas([])}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedPracas.length === 0
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : 'bg-white/[0.03] text-brand-gray-400 border-white/10 hover:text-white'
              }`}
            >
              Todas as praças
            </button>
          </div>
        </div>
      </section>

      <section className="py-10 border-b border-white/5 relative">
        <div className="max-w-7xl mx-auto px-6">
          {loading ? (
            <div className="text-sm text-brand-gray-500">Carregando inventário...</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {[
                { label: 'Pontos', raw: resumo.pontos, icon: MapPinned, fmt: formatInt },
                { label: 'Telas', raw: resumo.telas, icon: Monitor, fmt: formatInt },
                { label: 'Fluxo estimado', raw: resumo.fluxo, icon: Users, fmt: formatInt },
                { label: 'Inserções', raw: resumo.insercoes, icon: Activity, fmt: formatInt },
                { label: 'Ticket médio', raw: resumo.ticketMedio, icon: CircleDollarSign, fmt: formatMoney },
                { label: 'CPM médio', raw: resumo.cpm, icon: Target, fmt: (v) => `R$ ${formatInt(v)}` },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 hover:border-brand-orange/25 hover:bg-white/[0.04] transition-colors group"
                >
                  <card.icon className="text-brand-orange mb-3 group-hover:scale-110 transition-transform" size={18} />
                  <div className="text-lg md:text-2xl font-bold mb-1">
                    <AnimatedCounter value={card.raw} formatter={card.fmt} />
                  </div>
                  <div className="text-xs text-brand-gray-500 uppercase tracking-wide">{card.label}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 border-b border-white/5 relative">
        <div className="absolute inset-0 opacity-[0.03] bg-cover bg-top" style={{ backgroundImage: "url('/about-2.jpg')", filter: 'blur(1px)' }} />
        <div className="relative max-w-7xl mx-auto px-6 grid lg:grid-cols-3 gap-6">
          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#090909]/95 backdrop-blur overflow-hidden"
          >
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Layers3 size={18} className="text-brand-orange" />
                Inventário por formato
              </h2>
              <span className="text-xs text-brand-gray-500 uppercase tracking-wide">{selectedPracaLabel}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-brand-gray-500 border-b border-white/10 bg-white/[0.02]">
                  <tr>
                    <th className="text-left font-medium px-5 py-3">Formato</th>
                    <th className="text-left font-medium px-5 py-3">Pontos</th>
                    <th className="text-left font-medium px-5 py-3">Telas</th>
                    <th className="text-left font-medium px-5 py-3">Fluxo</th>
                  </tr>
                </thead>
                <tbody>
                  {formatos.map((f) => (
                    <tr key={f.tipo} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-white">{f.tipo}</td>
                      <td className="px-5 py-3 text-brand-gray-300">{formatInt(f.quantidade)}</td>
                      <td className="px-5 py-3 text-brand-gray-300">{formatInt(f.telas)}</td>
                      <td className="px-5 py-3 text-brand-gray-300">{formatInt(f.fluxo)}</td>
                    </tr>
                  ))}
                  {!loading && formatos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-4 text-brand-gray-500">Nenhum formato encontrado para esta seleção.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-white/10 bg-[#090909]/95 backdrop-blur p-5"
          >
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-brand-orange" />
              Perfil de público
            </h3>
            <div className="space-y-3">
              {publicos.length === 0 && (
                <div className="text-sm text-brand-gray-500">Sem dados de público para esta seleção.</div>
              )}
              {publicos.map((item, i) => {
                const pct = resumo.pontos ? Math.round((item.total / resumo.pontos) * 100) : 0;
                return (
                  <div key={item.label} className="rounded-xl border border-white/10 p-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>{item.label}</span>
                      <span className="text-brand-gray-400">{item.total} pontos</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-brand-orange to-[#ff7a4d]"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${pct}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.85, delay: i * 0.07, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.article>
        </div>
      </section>

      <section className="py-12 border-b border-white/5 relative">
        <div className="absolute inset-0 opacity-[0.022] bg-cover" style={{ backgroundImage: "url('/stock-wallpaper.jpg')", filter: 'blur(2px)' }} />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold">Catálogo completo da seleção</h2>
            <span className="text-xs uppercase tracking-wide text-brand-gray-500">{formatInt(pontos.length)} pontos</span>
          </div>

          {!loading && tiposComAncora.length > 0 && (
            <div className="sticky top-16 z-20 mb-5 rounded-xl border border-white/10 bg-[#090909]/95 backdrop-blur-xl p-3">
              <div className="text-[11px] uppercase tracking-wide text-brand-gray-500 mb-2">Ancoragem por formato</div>
              <div className="flex flex-wrap gap-2">
                {tiposComAncora.map((tipoInfo) => (
                  <a
                    key={tipoInfo.anchorId}
                    href={`#${tipoInfo.anchorId}`}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-white/[0.03] text-brand-gray-300 hover:text-white hover:border-brand-orange/40 transition-colors"
                  >
                    {tipoInfo.tipo} ({tipoInfo.quantidade})
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-8">
            {pontosPorTipo.map((grupo, groupIndex) => (
              <section key={grupo.anchorId} id={grupo.anchorId} className="scroll-mt-24">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-white">{grupo.tipo}</h3>
                  <span className="text-xs text-brand-gray-500 uppercase tracking-wide">{formatInt(grupo.quantidade)} pontos</span>
                </div>

                <div className="space-y-4">
                  {grupo.pontos.map((ponto, itemIndex) => (
                    <motion.article
                      key={ponto.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: Math.min((groupIndex + itemIndex) * 0.02, 0.45), duration: 0.4 }}
                      className="rounded-2xl border border-white/10 bg-[#090909]/95 backdrop-blur p-4 lg:p-5 hover:border-white/20 transition-colors"
                    >
                      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
                        <PointImageGallery ponto={ponto} onExpand={openLightbox} />

                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="text-[11px] uppercase tracking-wide rounded-md px-2 py-1 bg-brand-orange/15 text-brand-orange border border-brand-orange/30">
                                  {ponto.tipo}
                                </span>
                                <span className="text-[11px] uppercase tracking-wide rounded-md px-2 py-1 bg-white/[0.04] text-brand-gray-300 border border-white/10">
                                  Público {ponto.publico || 'N/I'}
                                </span>
                              </div>
                              <h4 className="text-xl font-semibold leading-tight">{ponto.nome}</h4>
                              <p className="text-sm text-brand-gray-500 mt-1">{ponto.cidade}</p>
                            </div>
                            <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 min-w-[160px]">
                              <div className="flex items-center gap-1 text-[11px] text-brand-gray-500 uppercase tracking-wide mb-1">
                                <DollarSign size={12} className="text-brand-orange" />
                                Investimento mensal
                              </div>
                              <div className="text-xl font-bold">{formatMoney(Number(ponto.preco) || 0)}</div>
                            </div>
                          </div>

                          {ponto.endereco && (
                            <p className="text-sm text-brand-gray-300 mb-2 flex items-start gap-2">
                              <MapPin size={14} className="text-brand-orange mt-0.5 shrink-0" />
                              {ponto.endereco}
                            </p>
                          )}

                          {ponto.descricao && (
                            <p className="text-sm text-brand-gray-400 mb-3">
                              {ponto.descricao}
                            </p>
                          )}

                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Users size={12} /> Fluxo</div>
                              <div className="font-medium">{formatInt(Number(ponto.fluxo) || 0)} / mês</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Hash size={12} /> Inserções</div>
                              <div className="font-medium">{formatInt(Number(ponto.insercoes) || 0)} / mês</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Monitor size={12} /> Telas</div>
                              <div className="font-medium">{formatInt(Number(ponto.telas) || 0)}</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Clock size={12} /> Horário</div>
                              <div className="font-medium">{ponto.horario || 'N/I'}</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><Play size={12} /> Tempo</div>
                              <div className="font-medium">{ponto.tempo || 'N/I'}</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] p-2 border border-white/5">
                              <div className="text-brand-gray-500 text-[11px] uppercase tracking-wide flex items-center gap-1"><RotateCcw size={12} /> Loop</div>
                              <div className="font-medium">{ponto.loop || 'N/I'}</div>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-gray-500">
                            <span>Veiculação: {ponto.veiculacao || 'N/I'}</span>
                            {(ponto.lat && ponto.lng) && <span>Coordenadas: {ponto.lat}, {ponto.lng}</span>}
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </section>
            ))}
            {!loading && pontos.length === 0 && (
              <div className="text-sm text-brand-gray-500">Nenhum ponto disponível para a seleção atual.</div>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-white/10 relative overflow-hidden">
        <div className="absolute inset-0 opacity-12 bg-cover bg-center" style={{ backgroundImage: "url('/city-bg.jpg')" }} />
        <div className="absolute inset-0 bg-black/65" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-orange/10 via-transparent to-transparent" />
        <div className="absolute top-0 left-[20%] w-[40vw] h-full bg-brand-orange/9 blur-[100px] rounded-full" />
        <div className="relative max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid lg:grid-cols-[1fr_auto] gap-6 items-center"
          >
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-3">Quer fechar o plano desta seleção?</h2>
              <p className="text-brand-gray-400 max-w-2xl">
                Continue para o explorador com filtros aplicados e selecione os pontos para montar sua proposta comercial.
              </p>
            </div>
            <button
              onClick={() => navigate(explorerPath)}
              className="group inline-flex items-center justify-center gap-2 px-8 h-[52px] bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover hover:shadow-lg hover:shadow-brand-orange/40 transition-all duration-200"
            >
              Explorar inventário completo
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      <footer className="py-12 border-t border-white/10 relative">
        <div className="absolute inset-0 bg-[#050505]/95" />
        <div className="relative max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Intermidia" className="h-6" />
            <span className="text-sm text-brand-gray-500">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-brand-gray-500">
            <Link to="/explorar" className="hover:text-white transition-colors">Pontos</Link>
            <button onClick={() => setSelectedPracas([])} className="hover:text-white transition-colors">Todas as praças</button>
            <span className="inline-flex items-center gap-2">
              <Building2 size={14} /> {formatInt(pracas.length)} praças
            </span>
          </div>
        </div>
      </footer>

      {/* ─── MAP MODAL ───────────────────────────────────────── */}
      <AnimatePresence>
        {showMapModal && (
          <MapModal key="map-modal" pontos={allPontos} onClose={() => setShowMapModal(false)} />
        )}
      </AnimatePresence>

      {/* ─── LIGHTBOX ──────────────────────────────────────────── */}
      <AnimatePresence>
        {lightbox.ponto && (
          <Lightbox
            key="lightbox"
            ponto={lightbox.ponto}
            imageIndex={lightbox.imageIndex}
            onClose={closeLightbox}
            onChangeIndex={(i) => setLightbox((prev) => ({ ...prev, imageIndex: i }))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
