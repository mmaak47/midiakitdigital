import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import Navbar from '../components/Navbar';
import CustomSelect from '../components/CustomSelect';
import SmartMap from '../components/SmartMap';
import PretextSection from '../components/PretextSection';
import { fetchPontos } from '../lib/api';
import { getPointDisplayImages, getPrimaryPointMediaKitImage } from '../lib/pointImages';
import { campaignTotals, sortFormatos } from '../lib/strategy';

const MidiaKitSlidesMode = lazy(() => import('../components/MidiaKitSlidesMode'));

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
  })
};

const PDF_TIPS = [
  'Renderizando as paginas do kit...',
  'Carregando imagens dos pontos...',
  'Aplicando tipografia e layout...',
  'Quase pronto, aguarde...'
];

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

function PointImageGallery({ ponto, onExpand }) {
  const images = getPointDisplayImages(ponto);
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
        loading="lazy"
        width="640"
        height="360"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5 pointer-events-none">
        <span className="flex items-center gap-1 text-[11px] text-brand-orange bg-black/70 rounded-md px-2 py-1 border border-brand-orange/35 shadow-sm">
          <i className="ri-fullscreen-line" style={{ fontSize: 11 }} /> Ampliar
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
            <i className="ri-arrow-left-s-line" style={{ fontSize: 13 }} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % images.length); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/75 border border-white/25 flex items-center justify-center text-white hover:bg-black transition z-10"
            aria-label="Próxima foto"
          >
            <i className="ri-arrow-right-s-line" style={{ fontSize: 13 }} />
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

function Lightbox({ ponto, imageIndex, onClose, onChangeIndex }) {
  const images = ponto ? getPointDisplayImages(ponto) : [];

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
            <i className="ri-close-line" style={{ fontSize: 16 }} />
          </button>
        </div>
        <div className="relative rounded-2xl overflow-hidden bg-[#0d0d0d] border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
          <img src={current} alt={ponto.nome} className="w-full max-h-[72vh] object-contain" loading="lazy" width="1280" height="720" />
          {hasMultiple && (
            <>
              <button onClick={() => onChangeIndex((imageIndex - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white hover:bg-black transition" aria-label="Imagem anterior">
                <i className="ri-arrow-left-s-line" style={{ fontSize: 20 }} />
              </button>
              <button onClick={() => onChangeIndex((imageIndex + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white hover:bg-black transition" aria-label="Próxima imagem">
                <i className="ri-arrow-right-s-line" style={{ fontSize: 20 }} />
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

function MapModal({ pontos, onClose, isDark }) {
  const pointsWithCoords = useMemo(
    () => pontos.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))),
    [pontos]
  );
  const cityOptions = useMemo(
    () => Array.from(new Set(pointsWithCoords.map((p) => p.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [pointsWithCoords]
  );
  const [selectedCity, setSelectedCity] = useState('');
  const mapPoints = useMemo(
    () => (selectedCity ? pointsWithCoords.filter((p) => p.cidade === selectedCity) : pointsWithCoords),
    [pointsWithCoords, selectedCity]
  );
  const [selectedPoint, setSelectedPoint] = useState(mapPoints[0] || null);

  useEffect(() => {
    setSelectedPoint((current) => {
      if (current && mapPoints.some((p) => p.id === current.id)) return current;
      return mapPoints[0] || null;
    });
  }, [mapPoints]);

  const focusCoords = useMemo(() => {
    if (!selectedPoint) return null;
    const lat = Number(selectedPoint.lat);
    const lng = Number(selectedPoint.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [selectedPoint]);

  const m = {
    wrap: isDark ? 'bg-[#0a0a0a] border-white/10' : 'bg-white border-neutral-200',
    sidebar: isDark ? 'bg-[#0d0d0d]' : 'bg-neutral-50',
    headerBorder: isDark ? 'border-b border-white/10' : 'border-b border-neutral-200',
    sidePanel: isDark ? 'border-white/10' : 'border-neutral-200',
    closeBtn: isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/15' : 'border-neutral-200 bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
    title: isDark ? 'text-white' : 'text-neutral-900',
    subtitle: isDark ? 'text-brand-gray-400' : 'text-neutral-500',
    label: isDark ? 'text-brand-gray-500' : 'text-neutral-400',
    addr: isDark ? 'text-brand-gray-300' : 'text-neutral-600',
    miniCell: isDark ? 'rounded-xl bg-white/[0.03] border border-white/10 p-3' : 'rounded-xl bg-neutral-50 border border-neutral-200 p-3',
    imgBorder: isDark ? 'border-white/10' : 'border-neutral-200',
    empty: isDark ? 'text-brand-gray-500' : 'text-neutral-400',
  };

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
        className={`relative w-full max-w-6xl flex flex-col lg:flex-row overflow-hidden rounded-2xl border shadow-[0_30px_100px_rgba(0,0,0,0.85)] ${m.wrap}`}
        style={{ height: 'min(82vh, 700px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-h-[320px]">
          <SmartMap
            pontos={mapPoints}
            selectedId={selectedPoint?.id}
            onSelect={setSelectedPoint}
            onOpenDetails={setSelectedPoint}
            focusCoords={focusCoords}
          />
        </div>
        <aside className={`w-full lg:w-[300px] border-t lg:border-t-0 lg:border-l flex flex-col overflow-y-auto ${m.sidePanel} ${m.sidebar}`}>
          <div className={`flex items-center justify-between px-5 py-4 shrink-0 ${m.headerBorder}`}>
            <div>
              <div className="text-xs uppercase tracking-wider text-brand-orange mb-0.5">Mapa da rede</div>
              <h3 className={`text-sm font-semibold ${m.title}`}>{mapPoints.length} pontos no mapa</h3>
            </div>
            <button onClick={onClose} className={`h-8 w-8 flex items-center justify-center rounded-full border transition ${m.closeBtn}`} aria-label="Fechar mapa">
              <i className="ri-close-line" style={{ fontSize: 15 }} />
            </button>
          </div>
          {cityOptions.length > 1 ? (
            <div className={`px-4 pb-3 ${m.headerBorder}`}>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCity('')}
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${selectedCity === '' ? 'border-brand-orange bg-brand-orange/20 text-brand-orange' : 'border-white/10 text-brand-gray-400 hover:text-white'}`}
                >
                  Todas
                </button>
                {cityOptions.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => {
                      setSelectedCity(city);
                      const firstCityPoint = pointsWithCoords.find((p) => p.cidade === city);
                      if (firstCityPoint) setSelectedPoint(firstCityPoint);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${selectedCity === city ? 'border-brand-orange bg-brand-orange/20 text-brand-orange' : 'border-white/10 text-brand-gray-400 hover:text-white'}`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {selectedPoint ? (
            <div className="flex-1 p-4 space-y-3">
              {getPrimaryPointMediaKitImage(selectedPoint) && (
                <div className={`rounded-xl overflow-hidden h-32 border ${m.imgBorder}`}>
                  <img src={getPrimaryPointMediaKitImage(selectedPoint)} alt={selectedPoint.nome} className="w-full h-full object-cover" loading="lazy" width="640" height="360" />
                </div>
              )}
              <div>
                <span className="text-[11px] uppercase tracking-wider text-brand-orange">{selectedPoint.tipo}</span>
                <h4 className={`text-base font-semibold mt-1 ${m.title}`}>{selectedPoint.nome}</h4>
                {selectedPoint.cidade && <p className={`text-sm mt-0.5 ${m.subtitle}`}>{selectedPoint.cidade}</p>}
                {selectedPoint.endereco && (
                  <p className={`text-sm mt-2 flex items-start gap-1.5 ${m.addr}`}>
                    <i className="ri-map-pin-line text-brand-orange mt-0.5 shrink-0" style={{ fontSize: 13 }} />{selectedPoint.endereco}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className={m.miniCell}>
                  <div className={`text-[11px] uppercase flex items-center gap-1 ${m.label}`}><i className="ri-group-line" style={{ fontSize: 11 }} /> Fluxo</div>
                  <div className={`font-semibold mt-1 ${m.title}`}>{formatInt(Number(selectedPoint.fluxo) || 0)}<span className={`text-xs ${m.label}`}>/mês</span></div>
                </div>
                <div className={m.miniCell}>
                  <div className={`text-[11px] uppercase flex items-center gap-1 ${m.label}`}><i className="ri-tv-2-line" style={{ fontSize: 11 }} /> Telas</div>
                  <div className={`font-semibold mt-1 ${m.title}`}>{formatInt(Number(selectedPoint.telas) || 0)}</div>
                </div>
              </div>
              <div className={m.miniCell}>
                <div className={`text-[11px] uppercase flex items-center gap-1 ${m.label}`}><i className="ri-money-dollar-line" style={{ fontSize: 11 }} /> Investimento mensal</div>
                <div className={`text-lg font-bold mt-1 ${m.title}`}>{formatMoney(Number(selectedPoint.preco) || 0)}</div>
              </div>
            </div>
          ) : (
            <div className={`flex-1 flex items-center justify-center text-sm p-5 text-center ${m.empty}`}>
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
  const [selectedTipos, setSelectedTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pdfStatus, setPdfStatus] = useState(null);
  const [pdfTipIndex, setPdfTipIndex] = useState(0);
  const [pdfToast, setPdfToast] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showSlidesMode, setShowSlidesMode] = useState(false);
  const [lightbox, setLightbox] = useState({ ponto: null, imageIndex: 0 });
  const [isDark, setIsDark] = useState(true);
  const [showCommercialShortcut, setShowCommercialShortcut] = useState(false);

  const t = {
    bg: isDark ? 'bg-[#050505]' : 'bg-[#f4f5f7]',
    text: isDark ? 'text-white' : 'text-neutral-900',
    textSec: isDark ? 'text-brand-gray-400' : 'text-neutral-500',
    textMuted: isDark ? 'text-brand-gray-500' : 'text-neutral-400',
    textLight: isDark ? 'text-brand-gray-300' : 'text-neutral-600',
    sectionBorder: isDark ? 'border-white/5' : 'border-neutral-200',
    card: isDark ? 'bg-[#090909]/95 border-white/10' : 'bg-white border-neutral-200 shadow-md',
    statsCard: isDark ? 'border-white/10 bg-white/[0.025] hover:border-brand-orange/25 hover:bg-white/[0.04]' : 'border-neutral-200 bg-white shadow-sm hover:border-brand-orange/40 hover:shadow-md',
    tableHead: isDark ? 'text-brand-gray-500 border-b border-white/10 bg-white/[0.02]' : 'text-neutral-500 border-b border-neutral-200 bg-neutral-50',
    tableRow: isDark ? 'border-b border-white/5 hover:bg-white/[0.02]' : 'border-b border-neutral-100 hover:bg-neutral-50',
    tableCell: isDark ? 'text-white' : 'text-neutral-900',
    tableCellSec: isDark ? 'text-brand-gray-300' : 'text-neutral-600',
    audienceCard: isDark ? 'rounded-xl border border-white/10 p-3' : 'rounded-xl border border-neutral-200 bg-white p-3 shadow-sm',
    vizBar: isDark ? 'h-2 rounded-full bg-white/10 overflow-hidden' : 'h-2 rounded-full bg-neutral-200 overflow-hidden',
    stickyNav: isDark ? 'border-white/10 bg-[#090909]/95' : 'border-neutral-200 bg-white/95 shadow-sm',
    navChip: isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300 hover:text-white hover:border-brand-orange/40' : 'border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900 hover:border-brand-orange/40 shadow-sm',
    chipOrange: isDark ? 'bg-brand-orange/15 text-brand-orange border-brand-orange/30' : 'bg-orange-50 text-orange-600 border-orange-200',
    chipGray: isDark ? 'bg-white/[0.04] text-brand-gray-300 border-white/10' : 'bg-neutral-100 text-neutral-600 border-neutral-200',
    miniCell: isDark ? 'rounded-lg bg-white/[0.03] p-2 border border-white/5' : 'rounded-lg bg-neutral-50 p-2 border border-neutral-200',
    miniLabel: isDark ? 'text-brand-gray-500' : 'text-neutral-500',
    priceCard: isDark ? 'rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 min-w-[160px]' : 'rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 min-w-[160px]',
    priceLabel: isDark ? 'text-brand-gray-500' : 'text-orange-600/80',
    metaRow: isDark ? 'border-t border-white/10 text-brand-gray-500' : 'border-t border-neutral-200 text-neutral-500',
    controlPanel: isDark ? 'from-white/[0.06] to-white/[0.02] border-white/10' : 'from-neutral-100 to-white border-neutral-300 shadow-sm',
    vizDisplay: isDark ? 'from-white/10 to-white/5 border-white/15' : 'from-neutral-100 to-white border-neutral-300',
    heroOverlay: isDark ? 'from-black/90 via-black/80 to-[#050505]' : 'from-[#fff7f3]/90 via-[#ffefe8]/72 to-[#f4f5f7]',
    pdfBtn: isDark ? 'bg-white/5 border-white/15 text-white hover:bg-white/10' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 shadow-sm',
    pracaChip: isDark ? 'bg-white/[0.03] text-brand-gray-400 border-white/10 hover:text-white' : 'bg-white text-neutral-500 border-neutral-200 hover:text-neutral-900 shadow-sm',
    toggleBtn: isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 shadow-sm',
    footerBg: isDark ? 'bg-[#050505]/95' : 'bg-white/97',
    footerBorder: isDark ? 'border-white/10' : 'border-neutral-200',
    footerText: isDark ? 'text-brand-gray-500' : 'text-neutral-500',
    footerLink: isDark ? 'hover:text-white' : 'hover:text-neutral-900',
    ctaOverlay: isDark ? 'bg-black/65' : 'bg-white/88',
  };

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
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasToken = !!sessionStorage.getItem('admin_token');
    const fromManualCommercial = sessionStorage.getItem('comercial_manual_login') === '1';
    setShowCommercialShortcut(hasToken && fromManualCommercial);
  }, []);

  useEffect(() => {
    if (pdfStatus !== 'generating') return undefined;
    setPdfTipIndex(0);
    const timer = setInterval(() => {
      setPdfTipIndex((current) => (current + 1) % PDF_TIPS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [pdfStatus]);

  useEffect(() => {
    if (!pdfToast) return undefined;
    const timer = setTimeout(() => setPdfToast(null), 3000);
    return () => clearTimeout(timer);
  }, [pdfToast]);

  const pracas = useMemo(() => {
    const unique = new Set(allPontos.map((p) => p.cidade).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allPontos]);

  const quickPracas = useMemo(() => pracas.slice(0, 5), [pracas]);

  const tiposDisponiveis = useMemo(() => {
    const source = selectedPracas.length
      ? allPontos.filter((point) => selectedPracas.includes(point.cidade))
      : allPontos;
    return Array.from(new Set(source.map((point) => point.tipo).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allPontos, selectedPracas]);

  useEffect(() => {
    setSelectedTipos((current) => current.filter((tipo) => tiposDisponiveis.includes(tipo)));
  }, [tiposDisponiveis]);

  const selectedPracaLabel = useMemo(() => {
    if (!selectedPracas.length) return 'Todas as praças';
    if (selectedPracas.length === 1) return selectedPracas[0];
    return `${selectedPracas.length} praças selecionadas`;
  }, [selectedPracas]);

  const pontos = useMemo(() => {
    let result = allPontos;
    if (selectedPracas.length) {
      result = result.filter((point) => selectedPracas.includes(point.cidade));
    }
    if (selectedTipos.length) {
      result = result.filter((point) => selectedTipos.includes(point.tipo));
    }
    return result;
  }, [allPontos, selectedPracas, selectedTipos]);

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
      if (!map.has(tipo)) map.set(tipo, { tipo, quantidade: 0, telas: 0, fluxo: 0 });
      const current = map.get(tipo);
      current.quantidade += 1;
      current.telas += Number(p.telas) || 0;
      current.fluxo += Number(p.fluxo) || 0;
    });
    return sortFormatos(Array.from(map.values()));
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
    return formatos.map((f) => ({ ...f, anchorId: anchorIdFromTipo(f.tipo) }));
  }, [formatos]);

  const pontosPorTipo = useMemo(() => {
    const map = new Map();
    pontos.forEach((p) => {
      const tipo = p.tipo || 'Sem tipo';
      if (!map.has(tipo)) map.set(tipo, []);
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
    if (selectedTipos.length === 1) params.set('tipo', selectedTipos[0]);
    const query = params.toString();
    return `/explorar${query ? `?${query}` : ''}`;
  }, [selectedPracas, selectedTipos]);

  const handleExportPdf = async () => {
    if (!pontos.length || pdfStatus === 'generating') return;
    setPdfStatus('generating');
    try {
      const { generateMidiaKitPdf } = await import('../lib/midiaKitPdf');
      await generateMidiaKitPdf({ praca: selectedPracaLabel, pracas: selectedPracas, pontos });
      setPdfStatus('ready');
      setPdfToast({ type: 'success', message: 'PDF gerado com sucesso ✓' });
      setTimeout(() => setPdfStatus(null), 120);
    } catch (err) {
      console.error(err);
      setPdfStatus('error');
      setPdfToast({ type: 'error', message: 'Erro ao gerar PDF. Tente novamente.' });
      setTimeout(() => setPdfStatus(null), 120);
    }
  };

  const openLightbox = (ponto, imageIndex = 0) => setLightbox({ ponto, imageIndex });
  const closeLightbox = () => setLightbox({ ponto: null, imageIndex: 0 });

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.bg} ${t.text}`} data-theme={isDark ? 'dark' : 'light'}>

      {/* Ambient background – dark mode only */}
      <div className={`fixed inset-0 pointer-events-none overflow-hidden ${isDark ? '' : 'hidden'}`} aria-hidden="true">
        <div className="absolute inset-0 bg-[#050505]" />
        <div className="absolute top-0 right-0 w-[55vw] h-[100vh] opacity-[0.05] bg-cover"
          style={{ backgroundImage: "url('/audience.jpg')", backgroundPosition: 'right top', filter: 'blur(3px)', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 80% 30%, black 20%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 70% at 80% 30%, black 20%, transparent 80%)' }}
        />
        <div className="absolute top-[55vh] left-0 w-[50vw] h-[70vh] opacity-[0.045] bg-cover"
          style={{ backgroundImage: "url('/about-1.jpg')", backgroundPosition: 'left center', filter: 'blur(3px)', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 20% 50%, black 20%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 70% at 20% 50%, black 20%, transparent 80%)' }}
        />
        <div className="absolute top-[130vh] right-0 w-[48vw] h-[60vh] opacity-[0.045] bg-cover"
          style={{ backgroundImage: "url('/showcase.png')", backgroundPosition: 'right center', filter: 'blur(2px)', WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 75% 50%, black 20%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 65% at 75% 50%, black 20%, transparent 80%)' }}
        />
        <div className="absolute top-[210vh] left-0 w-full h-[80vh] opacity-[0.03] bg-cover"
          style={{ backgroundImage: "url('/wallpaper.jpg')", backgroundPosition: 'center', filter: 'blur(4px)', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 20%, transparent 80%)', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 20%, transparent 80%)' }}
        />
        <div className="absolute top-[290vh] left-0 w-[50vw] h-[60vh] opacity-[0.035] bg-cover"
          style={{ backgroundImage: "url('/about-2.jpg')", backgroundPosition: 'left center', filter: 'blur(3px)', WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 20% 50%, black 20%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 65% at 20% 50%, black 20%, transparent 80%)' }}
        />
        <div className="absolute top-[300vh] right-0 w-[55vw] h-[60vh] opacity-[0.03] bg-cover"
          style={{ backgroundImage: "url('/stock-wallpaper.jpg')", backgroundPosition: 'right center', filter: 'blur(4px)', WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 75% 50%, black 20%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 65% at 75% 50%, black 20%, transparent 80%)' }}
        />
        <div className="absolute -top-20 -left-16 w-[500px] h-[500px] bg-[#FE5C2B]/14 rounded-full blur-[130px]" />
        <div className="absolute top-[38vh] right-[-60px] w-[420px] h-[420px] bg-[#FE5C2B]/8 rounded-full blur-[120px]" />
        <div className="absolute top-[100vh] left-[10%] w-[380px] h-[380px] bg-[#FE5C2B]/7 rounded-full blur-[120px]" />
        <div className="absolute top-[165vh] right-[8%] w-[360px] h-[360px] bg-[#FE5C2B]/6 rounded-full blur-[110px]" />
        <div className="absolute top-[240vh] left-[5%] w-[420px] h-[420px] bg-[#FE5C2B]/5 rounded-full blur-[130px]" />
        <div className="absolute top-[310vh] right-[12%] w-[350px] h-[350px] bg-[#FE5C2B]/5 rounded-full blur-[120px]" />
      </div>

      <Navbar showNav={false} isDark={isDark} />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className={`pt-20 pb-10 border-b relative overflow-visible ${t.sectionBorder}`}>
        <div
          className={`absolute inset-0 bg-cover bg-center ${isDark ? 'opacity-35' : 'opacity-[0.08] saturate-[0.75]'}`}
          style={{
            backgroundImage: "url('/city-bg.jpg')",
            filter: isDark ? 'none' : 'blur(1.8px)'
          }}
        />
        {!isDark && (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#fff7f2_0%,#ffe8dc_46%,#fff8f3_100%)]" />
            <div className="absolute -top-14 -left-16 w-[260px] h-[260px] rounded-full bg-brand-orange/14" />
            <div className="absolute -top-20 right-[-42px] w-[320px] h-[320px] rounded-full bg-brand-orange/16" />
            <div className="absolute top-[58%] right-[7%] w-[168px] h-[168px] rounded-full bg-brand-orange/12" />
            <div className="absolute top-[68%] left-[11%] w-[118px] h-[118px] rounded-full bg-brand-orange/10" />
            <div
              className="absolute inset-0 bg-cover bg-center opacity-[0.055]"
              style={{
                backgroundImage: "url('/about-1.jpg')",
                filter: 'blur(2.4px) saturate(0.75)'
              }}
            />
          </>
        )}
        <div className={`absolute inset-0 bg-gradient-to-b ${t.heroOverlay}`} />
        <div className="absolute -top-16 left-10 w-64 h-64 bg-brand-orange/20 rounded-full blur-[90px]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-6">
            <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-orange/30 bg-brand-orange/10 text-xs font-semibold tracking-wide text-brand-orange">
                MIDIA KIT DIGITAL INTERMIDIA 2026
              </span>
            </motion.div>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={() => setIsDark(!isDark)}
              className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-all duration-200 ${t.toggleBtn}`}
              aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              <i className={isDark ? 'ri-sun-line' : 'ri-moon-line'} style={{ fontSize: 16 }} />
            </motion.button>
          </div>

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
            className={`text-base md:text-lg max-w-3xl mb-8 ${t.textSec}`}
          >
            Selecione uma praça para gerar um mídia kit focado na cidade ou visualize o consolidado de todas as praças.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className={`grid lg:grid-cols-[1fr_auto_auto_auto] items-end gap-4 p-6 bg-gradient-to-br ${t.controlPanel} border rounded-2xl backdrop-blur-xl shadow-xl shadow-black/30`}
          >
            <div className="grid sm:grid-cols-3 gap-4 lg:col-span-4">
              <CustomSelect
                label="Praça"
                value={selectedPracas}
                onChange={setSelectedPracas}
                options={pracas}
                placeholder="Selecionar uma ou mais praças"
                multiple
              />
              <CustomSelect
                label="Formato"
                value={selectedTipos}
                onChange={setSelectedTipos}
                options={tiposDisponiveis}
                placeholder="Selecionar um ou mais formatos"
                multiple
              />
              <div>
                <label className={`text-xs uppercase tracking-wide font-semibold block mb-2 ${t.textMuted}`}>Visualização</label>
                <div className={`h-[50px] rounded-xl bg-gradient-to-r ${t.vizDisplay} border px-4 flex items-center text-sm font-medium`}>
                  {!selectedPracas.length ? 'Consolidado multirregional' : `Foco em ${selectedPracaLabel}`}
                </div>
              </div>
            </div>

            <motion.div
              animate={{
                boxShadow: [
                  '0 0 0px #E8591A',
                  '0 0 18px rgba(232,89,26,0.5)',
                  '0 0 0px #E8591A'
                ]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="w-full self-end rounded-2xl border border-[#E8591A]/25 bg-black/35 p-3 lg:w-auto lg:max-w-[360px]"
            >
              <div className="mb-2 inline-flex rounded-full border border-[#E8591A]/35 bg-[#E8591A]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E8591A]">
                ✦ Ver apresentação
              </div>
              <button
                onClick={() => setShowSlidesMode(true)}
                className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#E8591A] px-5 text-sm font-bold text-white transition-colors hover:bg-brand-orange-hover"
              >
                <Play size={16} />
                Abrir apresentação em slides
              </button>
              <p className="mt-1.5 text-xs leading-tight text-gray-400">Apresentação visual dos pontos selecionados</p>
            </motion.div>

            <button
              onClick={() => setShowMapModal(true)}
              className="landing-orange-btn group h-[50px] self-end px-6 bg-gradient-to-r from-brand-orange to-brand-orange-hover text-white font-bold rounded-xl hover:shadow-lg hover:shadow-brand-orange/50 transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <i className="ri-pin-distance-line" style={{ fontSize: 16 }} />
              Abrir mapa
            </button>

            <button
              onClick={handleExportPdf}
              disabled={pdfStatus === 'generating' || pontos.length === 0}
              className={`h-[50px] self-end px-6 border font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${t.pdfBtn}`}
            >
              {pdfStatus === 'generating' ? 'Gerando PDF...' : 'Gerar PDF da praça'}
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
                    ? 'landing-orange-btn bg-brand-orange text-white border-brand-orange'
                    : t.pracaChip
                }`}
              >
                {praca}
              </button>
            ))}
            <button
              onClick={() => setSelectedPracas([])}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedPracas.length === 0
                  ? 'landing-orange-btn bg-brand-orange text-white border-brand-orange'
                  : t.pracaChip
              }`}
            >
              Todas as praças
            </button>
          </div>

          {showCommercialShortcut && (
            <div className="mt-4">
              <button
                onClick={() => navigate('/comercial/explorar')}
                className="landing-orange-btn inline-flex items-center gap-2 px-5 h-[44px] rounded-xl bg-brand-orange text-white font-semibold hover:bg-brand-orange-hover hover:shadow-lg hover:shadow-brand-orange/40 transition-all duration-200"
              >
                <i className="ri-briefcase-4-line" style={{ fontSize: 16 }} />
                Continuar no explorador comercial
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className={`py-10 border-b relative ${t.sectionBorder}`}>
        <div className="max-w-7xl mx-auto px-6">
          {loading ? (
            <div className={`text-sm ${t.textMuted}`}>Carregando inventário...</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {[
                { label: 'Pontos', raw: resumo.pontos, iconClass: 'ri-pin-distance-line', fmt: formatInt },
                { label: 'Telas', raw: resumo.telas, iconClass: 'ri-tv-2-line', fmt: formatInt },
                { label: 'Fluxo estimado', raw: resumo.fluxo, iconClass: 'ri-group-line', fmt: formatInt },
                { label: 'Inserções', raw: resumo.insercoes, iconClass: 'ri-pulse-line', fmt: formatInt },
                { label: 'Ticket médio', raw: resumo.ticketMedio, iconClass: 'ri-coins-line', fmt: formatMoney },
                { label: 'CPM médio', raw: resumo.cpm, iconClass: 'ri-focus-3-line', fmt: (v) => `R$ ${formatInt(v)}` },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className={`rounded-2xl border p-4 transition-colors group ${t.statsCard}`}
                >
                  <i className={`${card.iconClass} text-brand-orange mb-3 group-hover:scale-110 transition-transform inline-block`} style={{ fontSize: 18 }} />
                  <div className="text-lg md:text-2xl font-bold mb-1">
                    <AnimatedCounter value={card.raw} formatter={card.fmt} />
                  </div>
                  <div className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{card.label}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PretextSection />

      {/* ── Inventário + Público ──────────────────────────────── */}
      <section className={`py-12 border-b relative ${t.sectionBorder}`}>
        {isDark && <div className="absolute inset-0 opacity-[0.03] bg-cover bg-top" style={{ backgroundImage: "url('/about-2.jpg')", filter: 'blur(1px)' }} />}
        <div className="relative max-w-7xl mx-auto px-6 grid lg:grid-cols-3 gap-6">

          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`lg:col-span-2 rounded-2xl border backdrop-blur overflow-hidden ${t.card}`}
          >
            <div className={`p-5 flex items-center justify-between ${isDark ? 'border-b border-white/10' : 'border-b border-neutral-200'}`}>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <i className="ri-layers-line text-brand-orange" style={{ fontSize: 18 }} />
                Inventário por formato
              </h2>
              <span className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{selectedPracaLabel}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={t.tableHead}>
                  <tr>
                    <th className="text-left font-medium px-5 py-3">Formato</th>
                    <th className="text-left font-medium px-5 py-3">Pontos</th>
                    <th className="text-left font-medium px-5 py-3">Telas</th>
                    <th className="text-left font-medium px-5 py-3">Fluxo</th>
                  </tr>
                </thead>
                <tbody>
                  {formatos.map((f) => (
                    <tr key={f.tipo} className={t.tableRow}>
                      <td className={`px-5 py-3 ${t.tableCell}`}>{f.tipo}</td>
                      <td className={`px-5 py-3 ${t.tableCellSec}`}>{formatInt(f.quantidade)}</td>
                      <td className={`px-5 py-3 ${t.tableCellSec}`}>{formatInt(f.telas)}</td>
                      <td className={`px-5 py-3 ${t.tableCellSec}`}>{formatInt(f.fluxo)}</td>
                    </tr>
                  ))}
                  {!loading && formatos.length === 0 && (
                    <tr>
                      <td colSpan={4} className={`px-5 py-4 ${t.textMuted}`}>Nenhum formato encontrado para esta seleção.</td>
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
            className={`rounded-2xl border backdrop-blur p-5 ${t.card}`}
          >
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <i className="ri-bar-chart-2-line text-brand-orange" style={{ fontSize: 18 }} />
              Perfil de público
            </h3>
            <div className="space-y-3">
              {publicos.length === 0 && (
                <div className={`text-sm ${t.textMuted}`}>Sem dados de público para esta seleção.</div>
              )}
              {publicos.map((item, i) => {
                const pct = resumo.pontos ? Math.round((item.total / resumo.pontos) * 100) : 0;
                return (
                  <div key={item.label} className={t.audienceCard}>
                    <div className={`flex items-center justify-between text-sm mb-2`}>
                      <span>{item.label}</span>
                      <span className={t.textSec}>{item.total} pontos</span>
                    </div>
                    <div className={t.vizBar}>
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

      {/* ── Catálogo ─────────────────────────────────────────── */}
      <section className={`py-12 border-b relative ${t.sectionBorder}`}>
        {isDark && <div className="absolute inset-0 opacity-[0.022] bg-cover" style={{ backgroundImage: "url('/stock-wallpaper.jpg')", filter: 'blur(2px)' }} />}
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold">Catálogo completo da seleção</h2>
            <span className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{formatInt(pontos.length)} pontos</span>
          </div>

          {!loading && tiposComAncora.length > 0 && (
            <div className={`sticky top-16 z-20 mb-5 rounded-xl border backdrop-blur-xl p-3 ${t.stickyNav}`}>
              <div className={`text-[11px] uppercase tracking-wide mb-2 ${t.textMuted}`}>Ancoragem por formato</div>
              <div className="flex flex-wrap gap-2">
                {tiposComAncora.map((tipoInfo) => (
                  <a
                    key={tipoInfo.anchorId}
                    href={`#${tipoInfo.anchorId}`}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${t.navChip}`}
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
                  <h3 className="text-lg font-semibold">{grupo.tipo}</h3>
                  <span className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{formatInt(grupo.quantidade)} pontos</span>
                </div>

                <div className="space-y-4">
                  {grupo.pontos.map((ponto, itemIndex) => (
                    <motion.article
                      key={ponto.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: Math.min((groupIndex + itemIndex) * 0.02, 0.45), duration: 0.4 }}
                      className={`rounded-2xl border backdrop-blur p-4 lg:p-5 transition-colors ${t.card} ${isDark ? 'hover:border-white/20' : 'hover:border-brand-orange/30'}`}
                    >
                      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
                        <PointImageGallery ponto={ponto} onExpand={openLightbox} />

                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className={`text-[11px] uppercase tracking-wide rounded-md px-2 py-1 border ${t.chipOrange}`}>
                                  {ponto.tipo}
                                </span>
                                <span className={`text-[11px] uppercase tracking-wide rounded-md px-2 py-1 border ${t.chipGray}`}>
                                  Público {ponto.publico || 'N/I'}
                                </span>
                              </div>
                              <h4 className="text-xl font-semibold leading-tight">{ponto.nome}</h4>
                              <p className={`text-sm mt-1 ${t.textMuted}`}>{ponto.cidade}</p>
                            </div>
                            <div className={t.priceCard}>
                              <div className={`flex items-center gap-1 text-[11px] uppercase tracking-wide mb-1 ${t.priceLabel}`}>
                                <i className="ri-money-dollar-line text-brand-orange" style={{ fontSize: 12 }} />
                                Investimento mensal
                              </div>
                              <div className="text-xl font-bold">{formatMoney(Number(ponto.preco) || 0)}</div>
                            </div>
                          </div>

                          {ponto.endereco && (
                            <p className={`text-sm mb-2 flex items-start gap-2 ${t.textLight}`}>
                              <i className="ri-map-pin-line text-brand-orange mt-0.5 shrink-0" style={{ fontSize: 14 }} />
                              {ponto.endereco}
                            </p>
                          )}

                          {ponto.descricao && (
                            <p className={`text-sm mb-3 ${t.textSec}`}>{ponto.descricao}</p>
                          )}

                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                            <div className={t.miniCell}>
                              <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${t.miniLabel}`}><i className="ri-group-line" style={{ fontSize: 12 }} /> Fluxo</div>
                              <div className="font-medium">{formatInt(Number(ponto.fluxo) || 0)} / mês</div>
                            </div>
                            <div className={t.miniCell}>
                              <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${t.miniLabel}`}><i className="ri-hashtag" style={{ fontSize: 12 }} /> Inserções</div>
                              <div className="font-medium">{formatInt(Number(ponto.insercoes) || 0)} / mês</div>
                            </div>
                            <div className={t.miniCell}>
                              <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${t.miniLabel}`}><i className="ri-tv-2-line" style={{ fontSize: 12 }} /> Telas</div>
                              <div className="font-medium">{formatInt(Number(ponto.telas) || 0)}</div>
                            </div>
                            <div className={t.miniCell}>
                              <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${t.miniLabel}`}><i className="ri-time-line" style={{ fontSize: 12 }} /> Horário</div>
                              <div className="font-medium">{ponto.horario || 'N/I'}</div>
                            </div>
                            <div className={t.miniCell}>
                              <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${t.miniLabel}`}><i className="ri-play-line" style={{ fontSize: 12 }} /> Tempo</div>
                              <div className="font-medium">{ponto.tempo || 'N/I'}</div>
                            </div>
                            <div className={t.miniCell}>
                              <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${t.miniLabel}`}><i className="ri-loop-left-line" style={{ fontSize: 12 }} /> Loop</div>
                              <div className="font-medium">{ponto.loop || 'N/I'}</div>
                            </div>
                          </div>

                          <div className={`mt-3 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs ${t.metaRow}`}>
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
              <div className={`text-sm ${t.textMuted}`}>Nenhum ponto disponível para a seleção atual.</div>
            )}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className={`py-16 border-b relative overflow-hidden ${t.sectionBorder}`}>
        <div className="absolute inset-0 opacity-12 bg-cover bg-center" style={{ backgroundImage: "url('/city-bg.jpg')" }} />
        <div className={`absolute inset-0 ${t.ctaOverlay}`} />
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
              <p className={t.textSec}>
                Continue para o explorador com filtros aplicados e selecione os pontos para montar sua proposta comercial.
              </p>
            </div>
            <button
              onClick={() => navigate(explorerPath)}
              className="landing-orange-btn group inline-flex items-center justify-center gap-2 px-8 h-[52px] bg-brand-orange text-white font-semibold rounded-xl hover:bg-brand-orange-hover hover:shadow-lg hover:shadow-brand-orange/40 transition-all duration-200"
            >
              Explorar inventário completo
              <i className="ri-arrow-right-line group-hover:translate-x-1 transition-transform inline-block" style={{ fontSize: 18 }} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className={`py-12 border-t relative ${t.footerBorder}`}>
        <div className={`absolute inset-0 ${t.footerBg}`} />
        <div className="relative max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={isDark ? '/logo.png' : '/logo-light.png'} alt="Intermidia" className="h-6" />
            <span className={`text-sm ${t.footerText}`}>© {new Date().getFullYear()}</span>
          </div>
          <div className={`flex items-center gap-6 text-sm ${t.footerText}`}>
            <Link to="/explorar" className={`transition-colors ${t.footerLink}`}>Pontos</Link>
            <button onClick={() => setSelectedPracas([])} className={`transition-colors ${t.footerLink}`}>Todas as praças</button>
            <span className="inline-flex items-center gap-2">
              <i className="ri-building-2-line" style={{ fontSize: 14 }} /> {formatInt(pracas.length)} praças
            </span>
            <span className={`inline-flex items-center gap-1.5 ${t.footerText}`}>
              <span>Desenvolvido por</span>
              <span className="font-semibold text-brand-orange animate-pulse">Maitê Doin</span>
            </span>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {showMapModal && (
          <MapModal key="map-modal" pontos={pontos} onClose={() => setShowMapModal(false)} isDark={isDark} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSlidesMode && (
          <Suspense fallback={null}>
            <MidiaKitSlidesMode
              key="slides-mode"
              open={showSlidesMode}
              onClose={() => setShowSlidesMode(false)}
              allPontos={allPontos}
              selectedPracas={selectedPracas}
              setSelectedPracas={setSelectedPracas}
              selectedTipos={selectedTipos}
              setSelectedTipos={setSelectedTipos}
              isDark={isDark}
            />
          </Suspense>
        )}
      </AnimatePresence>

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

      <AnimatePresence>
        {pdfStatus === 'generating' ? (
          <motion.div
            key="pdf-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          >
            <div className="relative flex flex-col items-center px-6 text-center">
              <div className="h-12 w-12 rounded-full border-[3px] border-white/20 border-t-[#E8591A] animate-spin" />
              <p className="mt-4 text-[18px] font-semibold text-white">Gerando PDF...</p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={pdfTipIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mt-2 text-[13px] text-white/55"
                >
                  {PDF_TIPS[pdfTipIndex]}
                </motion.p>
              </AnimatePresence>
            </div>

            <p className="absolute bottom-8 text-[11px] text-white/30">A geração leva entre 15 e 30 segundos</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {pdfToast ? (
          <motion.div
            key="pdf-toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`fixed bottom-6 right-6 z-[10000] rounded-xl border px-4 py-3 text-sm font-medium shadow-xl ${pdfToast.type === 'success' ? 'border-green-500/40 bg-green-600/20 text-green-100' : 'border-red-500/40 bg-red-600/20 text-red-100'}`}
          >
            {pdfToast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
