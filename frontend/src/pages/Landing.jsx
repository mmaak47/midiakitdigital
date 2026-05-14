import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Heart } from 'lucide-react';
import Navbar from '../components/Navbar';
import FavoritesBar from '../components/FavoritesBar';
import { useFavorites } from '../context/FavoritesContext';
import CustomSelect from '../components/CustomSelect';
import SmartMap from '../components/SmartMap';
import { fetchPontos, fetchLoopAvailability } from '../lib/api';
import { getPointDisplayImages, getPrimaryPointMediaKitImage } from '../lib/pointImages';
import { campaignTotals, sortFormatos, estimateReachFrequency } from '../lib/strategy';
import { normalizeHorarioForPdf } from '../lib/horarioUtils';
import { captureContactLead, trackEvent } from '../lib/tracking';

const MidiaKitSlidesMode = lazy(() => import('../components/MidiaKitSlidesMode'));

// ── WhatsApp comercial ──────────────────────────────────────────────
// Substitua pelo número com DDI+DDD sem espaços ou traços (ex: 554399999999)
const WA_COMERCIAL = '554398450480';
const WA_HREF = `https://wa.me/${WA_COMERCIAL}?text=${encodeURIComponent('Olá! Vim pelo mídia kit digital e gostaria de saber mais sobre a Intermidia.')}`;
// ───────────────────────────────────────────────────────────────────

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

// ── Urgency / scarcity helpers ──────────────────────────────────────────
const STATIC_TYPES = new Set(['Frontlight', 'Backlight']);

function normalizeForMatch(s) {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lookup de disponibilidade: tenta match exato, depois substring e sobreposição de palavras.
 * O mapa é indexado pelo `local` e `nome` normalizado de cada item do loop audit.
 * Os nomes dos pontos no banco seguem convenção diferente da API de origem, por isso
 * o match exato raramente funciona — daí os fallbacks.
 */
function findAvailability(ponto, avMap) {
  if (!avMap || avMap.size === 0 || STATIC_TYPES.has(ponto.tipo)) return null;
  const norm = normalizeForMatch(ponto.nome);

  // 1. Match exato
  const exact = avMap.get(norm);
  if (exact) return exact;

  // 2. Substring: nome do ponto contém a chave da auditoria (ou vice-versa)
  // Exige chave com ao menos 2 palavras para evitar falsos positivos em palavras isoladas
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, val] of avMap) {
    if (key.length < 8) continue; // chaves muito curtas geram falsos positivos

    if (norm.includes(key) || key.includes(norm)) {
      return val; // substring sólida → retorna imediatamente
    }

    // 3. Sobreposição de palavras significativas (>2 chars)
    const keyWords = key.split(' ').filter(w => w.length > 2);
    const normWords = norm.split(' ').filter(w => w.length > 2);
    if (!keyWords.length || !normWords.length) continue;

    const hits = keyWords.filter(w => normWords.includes(w)).length;
    const score = hits / Math.max(keyWords.length, normWords.length);

    if (score > bestScore && score >= 0.55) {
      bestScore = score;
      bestMatch = val;
    }
  }

  return bestMatch;
}

/**
 * Compute an urgency signal for a ponto.
 * Returns { label, sublabel, level, icon } or null.
 * NEVER says "indisponível" — always uses scarcity language.
 */
function getUrgencySignal(ponto, avMap) {
  const av = findAvailability(ponto, avMap);
  if (!av) return null;

  const { cotas_livres, pct_ocupado } = av;

  if (cotas_livres <= 0) {
    return {
      level: 'critical',
      label: 'Procura altíssima',
      sublabel: 'Últimas vagas na programação — fale com especialista',
      icon: 'ri-fire-fill',
    };
  }
  if (cotas_livres <= 2) {
    return {
      level: 'high',
      label: `Apenas ${cotas_livres} espaço${cotas_livres > 1 ? 's' : ''} disponíve${cotas_livres > 1 ? 'is' : 'l'}`,
      sublabel: 'Alta demanda — garanta agora',
      icon: 'ri-flashlight-fill',
    };
  }
  if (cotas_livres <= 4 || pct_ocupado >= 75) {
    return {
      level: 'medium',
      label: 'Poucos espaços disponíveis',
      sublabel: `Restam ${cotas_livres} vagas na grade de exibição`,
      icon: 'ri-timer-flash-line',
    };
  }
  if (pct_ocupado >= 50) {
    return {
      level: 'moderate',
      label: 'Boa procura',
      sublabel: `${cotas_livres} espaços livres na programação`,
      icon: 'ri-bar-chart-fill',
    };
  }
  // Healthy availability — show positively
  return {
    level: 'available',
    label: `${cotas_livres} espaços disponíveis`,
    sublabel: 'Programação com vagas',
    icon: 'ri-checkbox-circle-line',
  };
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

function PointImageGallery({ ponto, onExpand, compact = false }) {
  const images = getPointDisplayImages(ponto);
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [ponto.id]);

  if (!images.length) {
    return (
      <div className={`overflow-hidden bg-white/[0.03] flex items-center justify-center text-brand-gray-600 text-sm border border-white/5 ${compact ? 'aspect-[16/10] rounded-none' : 'rounded-xl min-h-[180px]'}`}>
        Sem imagem
      </div>
    );
  }

  const current = images[idx];
  const hasMultiple = images.length > 1;

  return (
    <div className={`relative group overflow-hidden bg-black ${compact ? 'aspect-[16/10] rounded-none border-0' : 'rounded-xl min-h-[180px] border border-white/10'}`}>
      <img
        src={current}
        alt={ponto.nome}
        className={`w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] cursor-pointer ${compact ? 'h-full' : 'h-full min-h-[180px]'}`}
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
            className="absolute left-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/75 border border-white/25 flex items-center justify-center hover:bg-black transition z-10"
            aria-label="Foto anterior"
          >
            <i className="ri-arrow-left-s-line" style={{ fontSize: 13, color: '#fff' }} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % images.length); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/75 border border-white/25 flex items-center justify-center hover:bg-black transition z-10"
            aria-label="Próxima foto"
          >
            <i className="ri-arrow-right-s-line" style={{ fontSize: 13, color: '#fff' }} />
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
              <button onClick={() => onChangeIndex((imageIndex - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-black transition" aria-label="Imagem anterior">
                <i className="ri-arrow-left-s-line" style={{ fontSize: 20, color: '#fff' }} />
              </button>
              <button onClick={() => onChangeIndex((imageIndex + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-black transition" aria-label="Próxima imagem">
                <i className="ri-arrow-right-s-line" style={{ fontSize: 20, color: '#fff' }} />
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
  // Default to first available city from the filtered points (not hardcoded)
  const [selectedCity, setSelectedCity] = useState(() => {
    const first = pontos.find((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
    return first?.cidade || '';
  });
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
              <h3 className={`text-sm font-semibold ${m.title}`}>{mapPoints.length} endereços no mapa</h3>
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
                  <div className={`text-[11px] uppercase flex items-center gap-1 ${m.label}`}><i className="ri-tv-2-line" style={{ fontSize: 11 }} /> Pontos de Impacto</div>
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
  const [searchParams] = useSearchParams();

  // ── Inicializa filtros a partir da URL (para links compartilhados) ──
  const [allPontos, setAllPontos] = useState([]);
  const [selectedPracas, setSelectedPracas] = useState(() => searchParams.getAll('cidade').filter(Boolean));
  const [selectedTipos, setSelectedTipos] = useState(() => searchParams.getAll('tipo').filter(Boolean));
  const [selectedPublicos, setSelectedPublicos] = useState(() => searchParams.getAll('publico').filter(Boolean));
  const [selectedElevadorCategorias, setSelectedElevadorCategorias] = useState(() => searchParams.getAll('elevador').filter(Boolean));
  const [loading, setLoading] = useState(true);
  const [pdfStatus, setPdfStatus] = useState(null);
  const [pdfTipIndex, setPdfTipIndex] = useState(0);
  const [pdfToast, setPdfToast] = useState(null);
  const [pdfFormat, setPdfFormat] = useState('desktop'); // 'desktop' | 'mobile'
  const [showMapModal, setShowMapModal] = useState(false);
  const [showSlidesMode, setShowSlidesMode] = useState(false);
  const [lightbox, setLightbox] = useState({ ponto: null, imageIndex: 0 });
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('intermidia_theme') === 'dark';
  });
  const [showCommercialShortcut, setShowCommercialShortcut] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [sortBy, setSortBy] = useState('tipo');
  const [shareToast, setShareToast] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('intermidia_welcome_seen');
  });
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [leadForm, setLeadForm] = useState({ nome: '', email: '', telefone: '', empresa: '' });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const { favorites, addFavorite, removeFavorite, isFavorite, totalPreco, totalFluxo, totalTelas } = useFavorites();
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [favoritesHintDismissed, setFavoritesHintDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !!sessionStorage.getItem('intermidia_fav_hint_seen');
  });
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [tableSortKey, setTableSortKey] = useState('tipo');
  const [tableSortDir, setTableSortDir] = useState('asc');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState(null); // Map<normalizedLocal, { cotas_livres, pct_ocupado, risk_level }>
  const pontosListRef = useRef(null);
  const isInitialMount = useRef(true);

  // ── Sincroniza filtros → URL (replaceState para não criar histórico a cada clique) ──
  useEffect(() => {
    // Pula a primeira execução (mount) — a URL já tem os params corretos
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    const params = new URLSearchParams();
    selectedPracas.forEach((c) => params.append('cidade', c));
    selectedTipos.forEach((t) => params.append('tipo', t));
    selectedPublicos.forEach((p) => params.append('publico', p));
    selectedElevadorCategorias.forEach((e) => params.append('elevador', e));
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [selectedPracas, selectedTipos, selectedPublicos, selectedElevadorCategorias, searchQuery]);

  // ── Cria short link via API e compartilha ──
  const [shareLoading, setShareLoading] = useState(false);

  const handleShareFilters = useCallback(async () => {
    const filters = {
      cidade: selectedPracas,
      tipo: selectedTipos,
      publico: selectedPublicos,
      elevador: selectedElevadorCategorias,
      q: searchQuery.trim(),
    };
    const hasAny = filters.cidade.length || filters.tipo.length || filters.publico.length || filters.elevador.length || filters.q;
    if (!hasAny) {
      // Sem filtros — compartilha a landing diretamente
      const url = window.location.origin;
      try { await navigator.clipboard.writeText(url); setShareToast(true); setTimeout(() => setShareToast(false), 2500); }
      catch { window.prompt('Copie o link:', url); }
      return;
    }

    setShareLoading(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      });
      if (!res.ok) throw new Error('Falha ao gerar link');
      const { url: shortPath } = await res.json();
      const fullUrl = `${window.location.origin}${shortPath}`;

      // Tenta Web Share API (mobile) primeiro
      if (navigator.share) {
        await navigator.share({
          title: 'Intermidia — Midia Kit Digital',
          text: `Veja esta selecao de pontos de midia OOH`,
          url: fullUrl,
        });
        return;
      }
      // Desktop: copia para clipboard
      await navigator.clipboard.writeText(fullUrl);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    } catch {
      // Fallback: URL com query params
      const params = new URLSearchParams();
      selectedPracas.forEach((c) => params.append('cidade', c));
      selectedTipos.forEach((t) => params.append('tipo', t));
      const fallback = `${window.location.origin}/?${params.toString()}`;
      try { await navigator.clipboard.writeText(fallback); setShareToast(true); setTimeout(() => setShareToast(false), 2500); }
      catch { window.prompt('Copie o link:', fallback); }
    } finally {
      setShareLoading(false);
    }
  }, [selectedPracas, selectedTipos, selectedPublicos, selectedElevadorCategorias, searchQuery]);

  const [favShareLoading, setFavShareLoading] = useState(false);
  const handleShareFavorites = useCallback(async () => {
    if (!favorites.length) return;
    setFavShareLoading(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: { pointIds: favorites.map(p => p.id) } }),
      });
      if (!res.ok) throw new Error('Falha ao gerar link');
      const { url: shortPath } = await res.json();
      const fullUrl = `${window.location.origin}${shortPath}`;

      if (navigator.share) {
        try {
          await navigator.share({ title: 'Intermidia — Minha Seleção', text: `${favorites.length} pontos selecionados`, url: fullUrl });
        } catch { /* user cancelled share sheet */ }
        return;
      }
      await navigator.clipboard.writeText(fullUrl);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
      trackEvent('favorites_shared', { count: favorites.length });
    } catch {
      // Silently fail — toast system handles feedback
    } finally {
      setFavShareLoading(false);
    }
  }, [favorites]);

  const hasActiveFilters = selectedPracas.length > 0 || selectedTipos.length > 0 || selectedPublicos.length > 0 || selectedElevadorCategorias.length > 0 || searchQuery;

  const t = {
    bg: isDark ? 'bg-[#050505]' : 'bg-[#FFF8F5]',
    text: isDark ? 'text-white' : 'text-[#1A1008]',
    textSec: isDark ? 'text-brand-gray-400' : 'text-[#7A6155]',
    textMuted: isDark ? 'text-brand-gray-500' : 'text-[#7A6155]',
    textLight: isDark ? 'text-brand-gray-300' : 'text-[#7A6155]',
    sectionBorder: isDark ? 'border-white/5' : 'border-[#F2DDD4]',
    card: isDark ? 'bg-[#090909]/95 border-white/10' : 'bg-white border-[#EFE0D8] shadow-md',
    statsCard: isDark ? 'border-white/10 bg-white/[0.025] hover:border-brand-orange/25 hover:bg-white/[0.04]' : 'border-[#EFE0D8] bg-white shadow-sm hover:border-[#FF6B35]/40 hover:shadow-md',
    tableHead: isDark ? 'text-brand-gray-500 border-b border-white/10 bg-white/[0.02]' : 'text-[#7A6155] border-b border-[#EFE0D8] bg-[#FDF7F4]',
    tableRow: isDark ? 'border-b border-white/5 hover:bg-white/[0.02]' : 'border-b border-[#F2DDD4]/60 hover:bg-[#FDF7F4]',
    tableCell: isDark ? 'text-white' : 'text-[#1A1008]',
    tableCellSec: isDark ? 'text-brand-gray-300' : 'text-[#7A6155]',
    audienceCard: isDark ? 'rounded-xl border border-white/10 p-3' : 'rounded-xl border border-[#EFE0D8] bg-white p-3 shadow-sm',
    vizBar: isDark ? 'h-2 rounded-full bg-white/10 overflow-hidden' : 'h-2 rounded-full bg-[#F2DDD4] overflow-hidden',
    stickyNav: isDark ? 'border-white/10 bg-[#090909]/95' : 'border-[#EFE0D8] bg-white/95 shadow-sm',
    navChip: isDark ? 'border-white/10 bg-white/[0.03] text-brand-gray-300 hover:text-white hover:border-brand-orange/40' : 'border-[#EFE0D8] bg-white text-[#7A6155] hover:text-[#1A1008] hover:border-[#FF6B35]/40 shadow-sm',
    navChipActive: isDark ? 'border-brand-orange/50 bg-brand-orange/15 text-brand-orange font-semibold shadow-sm shadow-brand-orange/10' : 'border-[#FF6B35] bg-[#FFF0EA] text-[#C94A1A] font-semibold shadow-sm shadow-[#FF6B35]/15',
    chipOrange: isDark ? 'bg-brand-orange/15 text-brand-orange border-brand-orange/30' : 'bg-[#FFF0EA] text-[#C94A1A] border-[#FFCFB8]',
    chipGray: isDark ? 'bg-white/[0.04] text-brand-gray-300 border-white/10' : 'bg-[#FDF7F4] text-[#7A6155] border-[#EFE0D8]',
    miniCell: isDark ? 'rounded-lg bg-white/[0.03] p-2 border border-white/5' : 'rounded-lg bg-[#FDF7F4] p-2 border border-[#EFE0D8]',
    miniLabel: isDark ? 'text-brand-gray-500' : 'text-[#7A6155]',
    priceCard: isDark ? 'rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 min-w-[160px]' : 'rounded-xl bg-[#FFF0EA] border border-[#FFCFB8] px-4 py-3 min-w-[160px]',
    priceLabel: isDark ? 'text-brand-gray-500' : 'text-[#C94A1A]',
    metaRow: isDark ? 'border-t border-white/10 text-brand-gray-500' : 'border-t border-[#EFE0D8] text-[#7A6155]',
    controlPanel: isDark ? 'from-white/[0.06] to-white/[0.02] border-white/10' : 'from-white to-white border-[#EFE0D8]',
    vizDisplay: isDark ? 'from-white/10 to-white/5 border-white/15' : 'from-[#FDF7F4] to-[#FDF7F4] border-[#EFE0D8]',
    heroOverlay: isDark ? 'from-black/90 via-black/80 to-[#050505]' : 'from-[#FFF8F5]/90 via-[#FFF8F5]/72 to-[#FFF8F5]',
    pdfBtn: isDark ? 'bg-white/5 border-white/15 text-white hover:bg-white/10' : 'bg-transparent border-[#DDD0CA] text-[#7A6155] hover:bg-[#FDF7F4]',
    pracaChip: isDark ? 'bg-white/[0.03] text-brand-gray-400 border-white/10 hover:text-white' : 'bg-white text-[#7A6155] border-[#DDD0CA] hover:text-[#C94A1A] hover:border-[#FF6B35]',
    toggleBtn: isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-[#DDD0CA] bg-white text-[#7A6155] hover:bg-[#FDF7F4] shadow-sm',
    footerBg: isDark ? 'bg-[#050505]/95' : 'bg-white/97',
    footerBorder: isDark ? 'border-white/10' : 'border-[#EFE0D8]',
    footerText: isDark ? 'text-brand-gray-500' : 'text-[#7A6155]',
    footerLink: isDark ? 'hover:text-white' : 'hover:text-[#1A1008]',
    ctaOverlay: isDark ? 'bg-black/65' : 'bg-white/88',
    // Grid view tokens
    toggleBg: isDark ? 'bg-white/5 border-white/10' : 'bg-white border-[#EFE0D8] shadow-sm',
    toggleOff: isDark ? 'text-brand-gray-400 hover:text-white' : 'text-[#7A6155] hover:text-[#1A1008]',
    gridStatsLabel: isDark ? 'text-brand-gray-500' : 'text-[#9A8579]',
    gridStatsVal: isDark ? 'text-white' : 'text-[#1A1008]',
    gridPriceBorder: isDark ? 'border-white/5' : 'border-[#F2DDD4]',
    favHint: isDark ? 'bg-brand-orange/[0.06] border-brand-orange/20 text-brand-gray-300' : 'bg-[#FFF8F3] border-[#FFCFB8]/50 text-[#7A6155]',
  };

  useEffect(() => {
    document.title = 'Intermidia — Mídia Kit Digital | OOH e DOOH';
    trackEvent('page_view', { page: 'landing' });
  }, []);

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
    async function loadAvailability() {
      try {
        const data = await fetchLoopAvailability();
        if (!active || !data?.items) return;
        const map = new Map();
        for (const item of data.items) {
          const entry = { cotas_livres: item.cotas_livres, pct_ocupado: item.pct_ocupado, risk_level: item.risk_level };
          // Index by local (group name)
          const localKey = normalizeForMatch(item.local || item.nome);
          const existing = map.get(localKey);
          if (!existing || item.cotas_livres < existing.cotas_livres) {
            map.set(localKey, entry);
          }
          // Also index by individual monitor name for fallback matching
          const nomeKey = normalizeForMatch(item.nome);
          if (nomeKey !== localKey) {
            const existingNome = map.get(nomeKey);
            if (!existingNome || item.cotas_livres < existingNome.cotas_livres) {
              map.set(nomeKey, entry);
            }
          }
        }
        if (active) setAvailabilityMap(map);
      } catch { /* graceful — no urgency signals if API fails */ }
    }
    loadPontos();
    loadAvailability();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasToken = !!sessionStorage.getItem('admin_token');
    const fromManualCommercial = sessionStorage.getItem('comercial_manual_login') === '1';
    setShowCommercialShortcut(hasToken && fromManualCommercial);
  }, []);

  // Auto-scroll para o catálogo quando chega com filtros na URL (link compartilhado)
  const hasUrlFilters = useRef(
    searchParams.getAll('cidade').length > 0 ||
    searchParams.getAll('tipo').length > 0 ||
    searchParams.getAll('publico').length > 0 ||
    searchParams.getAll('elevador').length > 0 ||
    !!searchParams.get('q')
  );
  useEffect(() => {
    if (!hasUrlFilters.current || loading) return;
    // Espera um frame para o DOM renderizar os pontos
    const raf = requestAnimationFrame(() => {
      pontosListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]);

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

  const publicosDisponiveis = useMemo(() => {
    let source = allPontos;
    if (selectedPracas.length) source = source.filter((p) => selectedPracas.includes(p.cidade));
    if (selectedTipos.length) source = source.filter((p) => selectedTipos.includes(p.tipo));
    return Array.from(new Set(source.map((p) => p.publico).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allPontos, selectedPracas, selectedTipos]);

  useEffect(() => {
    setSelectedPublicos((current) => current.filter((pub) => publicosDisponiveis.includes(pub)));
  }, [publicosDisponiveis]);

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
    if (selectedPublicos.length) {
      result = result.filter((point) => selectedPublicos.includes(point.publico));
    }
    if (selectedElevadorCategorias.length) {
      result = result.filter((point) => {
        if (point.tipo !== 'Elevador') return true;
        const cat = String(point.elevador_categoria || '').trim().toLowerCase();
        const normalized = cat === 'residencial' ? 'Residencial' : 'Comercial';
        return selectedElevadorCategorias.includes(normalized);
      });
    }
    return result;
  }, [allPontos, selectedPracas, selectedTipos, selectedPublicos, selectedElevadorCategorias]);

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

  const reachFrequency = useMemo(() => {
    if (!pontos.length) return { estimatedUnique: 0, effectiveReachPct: 0, grps: 0, avgFrequency: 0 };
    return estimateReachFrequency({ selected: pontos, cityInventory: allPontos });
  }, [pontos, allPontos]);

  const formatos = useMemo(() => {
    const map = new Map();
    pontos.forEach((p) => {
      const tipo = p.tipo || 'Sem tipo';
      if (!map.has(tipo)) map.set(tipo, { tipo, quantidade: 0, telas: 0, fluxo: 0, preco: 0 });
      const current = map.get(tipo);
      current.quantidade += 1;
      current.telas += Number(p.telas) || 0;
      current.fluxo += Number(p.fluxo) || 0;
      current.preco += Number(p.preco) || 0;
    });
    return sortFormatos(Array.from(map.values()).map((f) => ({
      ...f,
      cpm: f.fluxo > 0 ? f.preco / (f.fluxo / 1000) : 0,
    })));
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

  // All formats available per praça (ignoring tipo filter) — keeps sticky nav chips visible even when a tipo is active
  const formatosParaNav = useMemo(() => {
    const source = selectedPracas.length
      ? allPontos.filter((p) => selectedPracas.includes(p.cidade))
      : allPontos;
    const map = new Map();
    source.forEach((p) => {
      const tipo = p.tipo || 'Sem tipo';
      if (!map.has(tipo)) map.set(tipo, 0);
      map.set(tipo, map.get(tipo) + 1);
    });
    return sortFormatos(
      Array.from(map.entries()).map(([tipo, quantidade]) => ({ tipo, quantidade }))
    );
  }, [allPontos, selectedPracas]);

  // Sorted table data with max values for mini bars
  const formatosTabela = useMemo(() => {
    const maxFluxo = Math.max(1, ...formatos.map((f) => f.fluxo || 0));
    const maxEnderecos = Math.max(1, ...formatos.map((f) => f.quantidade || 0));
    const maxTelas = Math.max(1, ...formatos.map((f) => f.telas || 0));
    const cpmsValid = formatos.map((f) => f.cpm).filter((v) => v > 0);
    const cpmMin = cpmsValid.length ? Math.min(...cpmsValid) : 0;
    const cpmMax = cpmsValid.length ? Math.max(...cpmsValid) : 0;
    const sortable = formatos.map((f) => ({ ...f, _maxFluxo: maxFluxo, _maxEnderecos: maxEnderecos, _maxTelas: maxTelas, _cpmMin: cpmMin, _cpmMax: cpmMax }));
    const comparators = {
      tipo: (a, b) => (a.tipo || '').localeCompare(b.tipo || '', 'pt-BR'),
      quantidade: (a, b) => (a.quantidade || 0) - (b.quantidade || 0),
      telas: (a, b) => (a.telas || 0) - (b.telas || 0),
      fluxo: (a, b) => (a.fluxo || 0) - (b.fluxo || 0),
      cpm: (a, b) => (a.cpm || 0) - (b.cpm || 0),
    };
    const cmp = comparators[tableSortKey] || comparators.tipo;
    sortable.sort((a, b) => (tableSortDir === 'asc' ? cmp(a, b) : -cmp(a, b)));
    return sortable;
  }, [formatos, tableSortKey, tableSortDir]);

  const toggleTableSort = (key) => {
    if (tableSortKey === key) {
      setTableSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setTableSortKey(key);
      setTableSortDir(key === 'tipo' ? 'asc' : 'desc');
    }
  };

  const pontosFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return pontos;
    const q = searchQuery.toLowerCase();
    return pontos.filter((p) =>
      (p.nome || '').toLowerCase().includes(q) ||
      (p.endereco || '').toLowerCase().includes(q) ||
      (p.cidade || '').toLowerCase().includes(q)
    );
  }, [pontos, searchQuery]);

  const pontosPorTipo = useMemo(() => {
    const map = new Map();
    pontosFiltrados.forEach((p) => {
      const tipo = p.tipo || 'Sem tipo';
      if (!map.has(tipo)) map.set(tipo, []);
      map.get(tipo).push(p);
    });
    const comparators = {
      tipo: (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'),
      fluxo_desc: (a, b) => (Number(b.fluxo) || 0) - (Number(a.fluxo) || 0),
      preco_asc: (a, b) => (Number(a.preco) || 0) - (Number(b.preco) || 0),
      preco_desc: (a, b) => (Number(b.preco) || 0) - (Number(a.preco) || 0),
      nome: (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'),
    };
    const cmp = comparators[sortBy] || comparators.tipo;
    return tiposComAncora
      .map((tipoInfo) => ({
        ...tipoInfo,
        pontos: (map.get(tipoInfo.tipo) || []).sort(cmp),
      }))
      .filter((g) => g.pontos.length > 0);
  }, [pontosFiltrados, tiposComAncora, sortBy]);

  const explorerPath = useMemo(() => {
    const params = new URLSearchParams();
    selectedPracas.forEach((praca) => params.append('cidade', praca));
    if (selectedTipos.length === 1) params.set('tipo', selectedTipos[0]);
    const query = params.toString();
    return `/explorar${query ? `?${query}` : ''}`;
  }, [selectedPracas, selectedTipos]);

  const handleSubmitLead = useCallback(async () => {
    const { nome, email, telefone, empresa } = leadForm;
    if (!nome.trim() && !email.trim() && !telefone.trim()) return;
    setLeadSubmitting(true);
    try {
      const sessionId = localStorage.getItem('dooh_chat_session_id') || crypto.randomUUID();
      localStorage.setItem('dooh_chat_session_id', sessionId);
      await fetch('/api/leads/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          telefone: telefone.trim() || nome.trim(),
          empresa: empresa.trim() || `Lead PDF - ${nome.trim() || email.trim()}`,
          origem: 'pdf_modal_landing',
        }),
        credentials: 'include',
      });
      trackEvent('lead_capture', { source: 'pdf_modal', hasEmail: !!email.trim(), hasPhone: !!telefone.trim() });
    } catch { /* fire and forget */ }
    setLeadSubmitting(false);
  }, [leadForm]);

  const handleExportPdf = async (formatOverride) => {
    if (!pontos.length || pdfStatus === 'generating') return;
    const format = formatOverride || pdfFormat;
    setPdfStatus('generating');
    setShowPdfModal(false);
    // Submit lead data if any filled
    if (leadForm.nome.trim() || leadForm.email.trim() || leadForm.telefone.trim()) {
      handleSubmitLead();
    }
    try {
      if (format === 'mobile') {
        const { generateMidiaKitMobilePdf } = await import('../lib/midiaKitMobilePdf');
        await generateMidiaKitMobilePdf({ praca: selectedPracaLabel, pracas: selectedPracas, pontos });
      } else {
        const { generateMidiaKitPdf } = await import('../lib/midiaKitPdf');
        await generateMidiaKitPdf({ praca: selectedPracaLabel, pracas: selectedPracas, pontos });
      }
      setPdfStatus('ready');
      setPdfToast({ type: 'success', message: 'PDF gerado com sucesso ✓' });
      trackEvent('pdf_generate', { format, source: 'pdf_modal' });
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

      <Navbar showNav={false} showCta isDark={isDark} />

      {/* ── Welcome modal ────────────────────────────────────── */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { sessionStorage.setItem('intermidia_welcome_seen', '1'); setShowWelcome(false); }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={`relative w-full max-w-lg rounded-2xl border p-8 text-center shadow-2xl ${
                isDark
                  ? 'border-white/10 bg-[#0a0a0a]'
                  : 'border-[#EFE0D8] bg-white'
              }`}
            >
              {/* Logo / brand */}
              <div className={`mx-auto mb-5 flex h-16 w-auto px-4 items-center justify-center rounded-2xl py-3 ${
                isDark
                  ? 'bg-brand-orange/10 border border-brand-orange/20'
                  : 'bg-[#FFF0EA] border border-[#FFCFB8]'
              }`}>
                <img src={isDark ? '/logo.png' : '/logo-light.png'} alt="Intermidia" className="h-8 w-auto" />
              </div>
              <h2
                className="text-2xl font-bold mb-1"
                style={{ fontFamily: "'Poppins', system-ui, sans-serif", letterSpacing: '-0.02em', color: isDark ? '#fff' : '#1A1008' }}
              >
                Bem-vindo ao<br />
                <span style={{ color: '#FF6B35' }}>Mídia Kit Digital</span>
              </h2>
              <p
                className="text-sm mb-8 leading-relaxed max-w-sm mx-auto"
                style={{ fontFamily: "'Poppins', system-ui, sans-serif", color: isDark ? 'rgba(255,255,255,0.55)' : '#7A6155' }}
              >
                Escolha o que deseja fazer para direcionarmos você à melhor experiência.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Option 1: View Mídia Kit */}
                <button
                  type="button"
                  onClick={() => { sessionStorage.setItem('intermidia_welcome_seen', '1'); setShowWelcome(false); }}
                  className={`group flex flex-col items-center gap-3 rounded-xl border p-5 transition-all ${
                    isDark
                      ? 'border-white/10 bg-white/[0.03] hover:border-brand-orange/40 hover:bg-brand-orange/[0.06]'
                      : 'border-[#EFE0D8] bg-white hover:border-[#FF6B35]/40 hover:bg-[#FFF8F3] shadow-sm hover:shadow'
                  }`}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    isDark ? 'bg-brand-orange/10 group-hover:bg-brand-orange/20' : 'bg-[#FFF0EA] group-hover:bg-[#FFCFB8]'
                  }`}>
                    <i className="ri-presentation-line text-brand-orange" style={{ fontSize: 22 }} />
                  </div>
                  <div style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
                    <div className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-[#1A1008]'}`}>Visualizar o Mídia Kit</div>
                    <div className={`text-[11px] leading-snug ${isDark ? 'text-brand-gray-500' : 'text-[#7A6155]'}`}>
                      Conheça nosso inventário de pontos de impacto, formatos e praças disponíveis.
                    </div>
                  </div>
                </button>

                {/* Option 2: Plan Campaign */}
                <button
                  type="button"
                  onClick={() => { sessionStorage.setItem('intermidia_welcome_seen', '1'); setShowWelcome(false); navigate('/planejar'); }}
                  className={`group flex flex-col items-center gap-3 rounded-xl border p-5 transition-all ${
                    isDark
                      ? 'border-white/10 bg-white/[0.03] hover:border-brand-orange/40 hover:bg-brand-orange/[0.06]'
                      : 'border-[#EFE0D8] bg-white hover:border-[#FF6B35]/40 hover:bg-[#FFF8F3] shadow-sm hover:shadow'
                  }`}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    isDark ? 'bg-brand-orange/10 group-hover:bg-brand-orange/20' : 'bg-[#FFF0EA] group-hover:bg-[#FFCFB8]'
                  }`}>
                    <i className="ri-route-line text-brand-orange" style={{ fontSize: 22 }} />
                  </div>
                  <div style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
                    <div className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-[#1A1008]'}`}>Planejar uma Campanha</div>
                    <div className={`text-[11px] leading-snug ${isDark ? 'text-brand-gray-500' : 'text-[#7A6155]'}`}>
                      Monte seu plano com recomendações inteligentes de pontos de impacto e audiência.
                    </div>
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => { sessionStorage.setItem('intermidia_welcome_seen', '1'); setShowWelcome(false); }}
                className={`mt-5 text-xs transition-colors ${isDark ? 'text-brand-gray-600 hover:text-brand-gray-400' : 'text-[#7A6155]/70 hover:text-[#7A6155]'}`}
                style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}
              >
                Pular e continuar navegando
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className={`pt-20 pb-10 border-b landing-divider relative overflow-visible ${t.sectionBorder}`} style={{ background: isDark ? undefined : '#FFF8F5' }}>
        <div
          className={`absolute inset-0 bg-cover bg-center ${isDark ? 'opacity-50' : 'opacity-[0.08] saturate-[0.75]'}`}
          style={{
            backgroundImage: "url('/city-bg.jpg')",
            filter: isDark ? 'none' : 'blur(1.8px)'
          }}
        />
        {!isDark && (
          <>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #FFF8F5 0%, #FFEEE4 46%, #FFF8F5 100%)' }} />
            <div className="absolute -top-14 -left-16 w-[260px] h-[260px] rounded-full" style={{ background: 'rgba(255,107,53,0.14)' }} />
            <div className="absolute -top-20 right-[-42px] w-[360px] h-[360px] rounded-full" style={{ background: 'rgba(255,107,53,0.08)', filter: 'blur(80px)' }} />
            <div className="absolute top-[58%] right-[7%] w-[168px] h-[168px] rounded-full" style={{ background: 'rgba(255,107,53,0.12)' }} />
            <div className="absolute top-[68%] left-[11%] w-[118px] h-[118px] rounded-full" style={{ background: 'rgba(255,107,53,0.10)' }} />
            <div
              className="absolute inset-0 bg-cover bg-center opacity-[0.045]"
              style={{
                backgroundImage: "url('/about-1.jpg')",
                filter: 'blur(2.4px) saturate(0.75)'
              }}
            />
          </>
        )}
        <div className={`absolute inset-0 bg-gradient-to-b ${t.heroOverlay}`} />
        <div className="absolute -top-16 left-10 w-64 h-64 bg-brand-orange/20 rounded-full blur-[90px]" />
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-brand-orange/8 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-4">
            <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
              <span
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-semibold tracking-[0.08em] uppercase"
                style={{
                  background: isDark ? 'rgba(255,107,53,0.10)' : '#FFF0EA',
                  border: `1px solid ${isDark ? 'rgba(255,107,53,0.30)' : '#FFCFB8'}`,
                  color: isDark ? '#FF6B35' : '#C94A1A',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B35]" />
                Mídia Kit Digital 2026
              </span>
            </motion.div>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={() => { setIsDark(!isDark); localStorage.setItem('intermidia_theme', isDark ? 'light' : 'dark'); window.dispatchEvent(new Event('theme-change')); }}
              className={`h-9 w-9 flex items-center justify-center rounded-[10px] border transition-all duration-200 ${t.toggleBtn}`}
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
            custom={0.5}
            className="max-w-3xl mb-6"
            style={{ fontFamily: "'Poppins', system-ui, sans-serif", fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', color: isDark ? '#fff' : '#1A1008' }}
          >
            Explore nosso inventário de{' '}
            <span style={{ color: '#FF6B35' }}>Mídia Externa</span>
          </motion.h1>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="p-6 rounded-[16px] backdrop-blur-xl"
            style={{
              background: isDark
                ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)'
                : '#FFFFFF',
              border: `1px solid ${isDark ? 'rgba(255,107,53,0.15)' : '#EFE0D8'}`,
              boxShadow: isDark
                ? '0 24px 64px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.08)'
                : '0 4px 24px rgba(0,0,0,0.06)',
            }}
          >
            {/* ── Filter fields ── */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              <CustomSelect
                label="Praça"
                value={selectedPracas}
                onChange={setSelectedPracas}
                options={pracas}
                placeholder="Selecionar praça"
                multiple
                isDark={isDark}
              />
              <CustomSelect
                label="Formato"
                value={selectedTipos}
                onChange={setSelectedTipos}
                options={tiposDisponiveis}
                placeholder="Selecionar formato"
                multiple
                isDark={isDark}
              />
              <CustomSelect
                label="Público"
                value={selectedPublicos}
                onChange={setSelectedPublicos}
                options={publicosDisponiveis}
                placeholder={publicosDisponiveis.length ? 'Selecionar público' : 'Nenhum disponível'}
                multiple
                isDark={isDark}
              />
            </div>

            {tiposDisponiveis.includes('Elevador') && (selectedTipos.length === 0 || selectedTipos.includes('Elevador')) && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span
                  className="font-semibold uppercase mr-1"
                  style={{ fontSize: '10px', letterSpacing: '0.08em', color: isDark ? '#737373' : '#7A6155' }}
                >
                  Categoria do elevador
                </span>
                {['Comercial', 'Residencial'].map((categoria) => {
                  const selected = selectedElevadorCategorias.includes(categoria);
                  return (
                    <button
                      key={categoria}
                      type="button"
                      onClick={() => setSelectedElevadorCategorias((cur) =>
                        cur.includes(categoria) ? cur.filter((c) => c !== categoria) : [...cur, categoria]
                      )}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        selected
                          ? 'bg-brand-orange text-white border border-brand-orange'
                          : (isDark
                              ? 'bg-white/5 text-brand-gray-300 border border-white/10 hover:bg-white/10'
                              : 'bg-white text-[#7A6155] border border-[#DDD0CA] hover:border-[#FF6B35] hover:text-[#C94A1A]')
                      }`}
                    >
                      <i className={categoria === 'Comercial' ? 'ri-building-2-line' : 'ri-home-4-line'} style={{ fontSize: 12 }} />
                      {categoria}
                    </button>
                  );
                })}
                {selectedElevadorCategorias.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedElevadorCategorias([])}
                    className={`text-[11px] font-semibold underline ${isDark ? 'text-brand-gray-400 hover:text-white' : 'text-[#7A6155] hover:text-[#1A1008]'}`}
                  >
                    limpar
                  </button>
                )}
              </div>
            )}

            {/* ── Action buttons row ── */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowMapModal(true)}
                className="landing-orange-btn group h-[46px] px-6 text-white font-bold rounded-[10px] transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                style={{ background: '#FF6B35', boxShadow: '0 4px 16px rgba(255,107,53,0.36)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#E85A25'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(255,107,53,0.50)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FF6B35'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,107,53,0.36)'; }}
              >
                <i className="ri-pin-distance-line" style={{ fontSize: 16 }} />
                Mapa interativo
              </button>

              <button
                onClick={() => { setShowSlidesMode(true); trackEvent('slides_open'); }}
                className="inline-flex h-[46px] items-center justify-center gap-2 rounded-[10px] px-5 text-sm font-semibold transition-all duration-200 whitespace-nowrap"
                style={{
                  background: 'transparent',
                  border: `1px solid ${isDark ? 'rgba(255,107,53,0.40)' : '#FFCFB8'}`,
                  color: isDark ? '#FF9466' : '#C94A1A',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,107,53,0.10)' : '#FFF0EA'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Play size={14} />
                Apresentação
              </button>

              <button
                onClick={() => { setShowPdfModal(true); trackEvent('pdf_modal_open'); }}
                className="inline-flex h-[46px] items-center justify-center gap-2 rounded-[10px] px-5 text-sm font-semibold transition-all duration-200 whitespace-nowrap"
                style={{
                  background: 'transparent',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : '#DDD0CA'}`,
                  color: isDark ? '#fff' : '#7A6155',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : '#FDF7F4'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <i className="ri-file-pdf-2-line" style={{ fontSize: 15 }} />
                Baixar PDF
              </button>

              <button
                onClick={handleShareFilters}
                disabled={shareLoading}
                className="inline-flex h-[46px] items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:opacity-60"
                style={{
                  background: 'transparent',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#DDD0CA'}`,
                  color: isDark ? 'rgba(255,255,255,0.55)' : '#9C877B',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#FDF7F4'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                title={hasActiveFilters ? 'Compartilhar link com estes filtros' : 'Compartilhar mídia kit'}
              >
                {shareLoading
                  ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <i className="ri-share-forward-line" style={{ fontSize: 15 }} />
                }
              </button>
            </div>
          </motion.div>

          {/* ── Praça tags — quick filters with header ── */}
          <div className="mt-5">
            <div className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-2 ${t.textMuted}`}>
              <i className="ri-flashlight-line mr-1" style={{ fontSize: 12 }} />
              Filtros rápidos por praça
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedPracas([])}
                className="px-4 py-2 rounded-full text-sm font-semibold transition-colors min-h-[36px]"
                style={
                  selectedPracas.length === 0
                    ? { background: '#FF6B35', color: '#fff', border: '1px solid #FF6B35' }
                    : { background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? '#A3A3A3' : '#7A6155', border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#DDD0CA'}` }
                }
              >
                Todas
              </button>
              {quickPracas.map((praca) => {
                const active = selectedPracas.includes(praca);
                return (
                  <button
                    key={praca}
                    onClick={() => setSelectedPracas((current) => active
                      ? current.filter((item) => item !== praca)
                      : [...current, praca])}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[36px]"
                    style={
                      active
                        ? { background: '#FF6B35', color: '#fff', border: '1px solid #FF6B35' }
                        : { background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? '#A3A3A3' : '#7A6155', border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : '#DDD0CA'}` }
                    }
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = '#FF6B35'; e.currentTarget.style.color = isDark ? '#fff' : '#C94A1A'; } }}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.10)' : '#DDD0CA'; e.currentTarget.style.color = isDark ? '#A3A3A3' : '#7A6155'; } }}
                  >
                    {active && <i className="ri-check-line" style={{ fontSize: 13 }} />}
                    {praca}
                  </button>
                );
              })}
            </div>
          </div>

          {showCommercialShortcut && (
            <div className="mt-4">
              <button
                onClick={() => navigate('/comercial/explorar')}
                className="landing-orange-btn inline-flex items-center gap-2 px-5 h-[44px] rounded-[10px] text-white font-semibold transition-all duration-200"
                style={{ background: '#FF6B35' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#E85A25'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,107,53,0.40)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FF6B35'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <i className="ri-arrow-right-line" style={{ fontSize: 16 }} />
                Continuar no explorador comercial
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className={`py-10 border-b landing-divider relative ${t.sectionBorder}`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span
                className="text-[11px] font-bold tracking-[0.18em] uppercase"
                style={{ color: isDark ? 'rgba(255,107,53,0.75)' : '#C94A1A' }}
              >Visão geral</span>
              <h2 className="text-xl font-bold mt-0.5">Inventário em números</h2>
            </div>
            <span className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{selectedPracaLabel}</span>
          </div>
          {loading ? (
            <div className={`text-sm ${t.textMuted}`}>Carregando inventário...</div>
          ) : (
            <>
              {/* Primary stats — always visible, bigger */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Pontos de Impacto', raw: resumo.telas, iconClass: 'ri-tv-2-line', fmt: formatInt, primary: true },
                  { label: 'Fluxo mensal', raw: resumo.fluxo, iconClass: 'ri-group-line', fmt: formatInt, primary: true },
                  { label: 'Alcance estimado', raw: reachFrequency.estimatedUnique, iconClass: 'ri-user-star-line', fmt: formatInt, primary: true },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    className={`rounded-2xl border p-5 transition-colors group ${t.statsCard}`}
                  >
                    <div className="mb-3 w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ background: isDark ? 'rgba(255,107,53,0.12)' : '#FFF0EA', border: `1px solid ${isDark ? 'rgba(255,107,53,0.25)' : '#FFCFB8'}` }}>
                      <i className={`${card.iconClass} text-brand-orange group-hover:scale-110 transition-transform inline-block`} style={{ fontSize: 22 }} />
                    </div>
                    <div className="text-2xl md:text-4xl font-bold mb-1">
                      <AnimatedCounter value={card.raw} formatter={card.fmt} />
                    </div>
                    <div className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{card.label}</div>
                  </motion.div>
                ))}
              </div>

              {/* Secondary stats — progressive disclosure */}
              <AnimatePresence initial={false}>
                {showMoreStats && (
                  <motion.div
                    key="more-stats"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      {[
                        { label: 'Endereços', raw: resumo.pontos, iconClass: 'ri-pin-distance-line', fmt: formatInt },
                        { label: 'Ticket médio', raw: resumo.ticketMedio, iconClass: 'ri-coins-line', fmt: formatMoney },
                        { label: 'CPM médio', raw: resumo.cpm, iconClass: 'ri-focus-3-line', fmt: (v) => `R$ ${formatInt(v)}` },
                      ].map((card) => (
                        <div key={card.label} className={`rounded-2xl border p-4 transition-colors group ${t.statsCard}`}>
                          <div className="mb-2 w-9 h-9 rounded-lg flex items-center justify-center"
                            style={{ background: isDark ? 'rgba(255,107,53,0.10)' : '#FFF0EA', border: `1px solid ${isDark ? 'rgba(255,107,53,0.20)' : '#FFCFB8'}` }}>
                            <i className={`${card.iconClass} text-brand-orange`} style={{ fontSize: 16 }} />
                          </div>
                          <div className="text-lg md:text-2xl font-bold mb-0.5">
                            <AnimatedCounter value={card.raw} formatter={card.fmt} />
                          </div>
                          <div className={`text-[11px] uppercase tracking-wide ${t.textMuted}`}>{card.label}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Toggle */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setShowMoreStats((v) => !v)}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full transition-colors ${
                    isDark
                      ? 'text-brand-gray-400 hover:text-white border border-white/10 hover:border-brand-orange/40'
                      : 'text-[#7A6155] hover:text-[#C94A1A] border border-[#EFE0D8] hover:border-[#FF6B35]/40 bg-white'
                  }`}
                  aria-expanded={showMoreStats}
                >
                  <i className={showMoreStats ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} style={{ fontSize: 14 }} />
                  {showMoreStats ? 'Mostrar menos métricas' : 'Ver mais métricas (Endereços, Ticket, CPM)'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Inventário + Público ──────────────────────────────── */}
      <section className={`py-12 border-b landing-divider relative ${t.sectionBorder}`}>
        {isDark && <div className="absolute inset-0 opacity-[0.03] bg-cover bg-top" style={{ backgroundImage: "url('/about-2.jpg')", filter: 'blur(1px)' }} />}
        <div className="relative max-w-7xl mx-auto px-6 grid lg:grid-cols-3 gap-6">

          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`lg:col-span-2 rounded-2xl border backdrop-blur overflow-hidden ${t.card}`}
          >
            <div className={`p-5 flex items-center justify-between ${isDark ? 'border-b border-white/10' : 'border-b border-neutral-200'}`}>
              <div>
                <span
                  className="text-[11px] font-bold tracking-[0.18em] uppercase block mb-0.5"
                  style={{ color: isDark ? 'rgba(255,107,53,0.75)' : '#C94A1A' }}
                >Formatos disponíveis</span>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <i className="ri-layers-line text-brand-orange" style={{ fontSize: 18 }} />
                  Inventário por formato
                </h2>
              </div>
              <span className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{selectedPracaLabel}</span>
            </div>
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead className={t.tableHead}>
                  <tr>
                    {[
                      { key: 'tipo', label: 'Formato', align: 'left' },
                      { key: 'quantidade', label: 'Endereços', align: 'left' },
                      { key: 'telas', label: 'Pontos de Impacto', align: 'left' },
                      { key: 'fluxo', label: 'Fluxo', align: 'left' },
                      { key: 'cpm', label: 'CPM est.', align: 'left' },
                    ].map((col) => {
                      const active = tableSortKey === col.key;
                      return (
                        <th key={col.key} className="font-medium px-5 py-3 text-left select-none">
                          <button
                            onClick={() => toggleTableSort(col.key)}
                            className={`inline-flex items-center gap-1 uppercase tracking-wide text-[11px] transition-colors ${
                              active ? 'text-brand-orange' : (isDark ? 'hover:text-white' : 'hover:text-[#1A1008]')
                            }`}
                          >
                            {col.label}
                            <i
                              className={active
                                ? (tableSortDir === 'asc' ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line')
                                : 'ri-expand-up-down-line'}
                              style={{ fontSize: 12, opacity: active ? 1 : 0.45 }}
                            />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {formatosTabela.map((f, idx) => {
                    const fluxoPct = f._maxFluxo ? Math.min(100, (f.fluxo / f._maxFluxo) * 100) : 0;
                    const endPct = f._maxEnderecos ? Math.min(100, (f.quantidade / f._maxEnderecos) * 100) : 0;
                    const telasPct = f._maxTelas ? Math.min(100, (f.telas / f._maxTelas) * 100) : 0;
                    // CPM color: lower = better (green), higher = warmer
                    let cpmColor = t.tableCellSec;
                    let cpmBg = 'transparent';
                    if (f.cpm > 0 && f._cpmMax > f._cpmMin) {
                      const ratio = (f.cpm - f._cpmMin) / (f._cpmMax - f._cpmMin);
                      if (ratio < 0.34) { cpmColor = isDark ? 'text-emerald-400' : 'text-emerald-600'; cpmBg = isDark ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.08)'; }
                      else if (ratio < 0.67) { cpmColor = isDark ? 'text-amber-400' : 'text-amber-600'; cpmBg = isDark ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.08)'; }
                      else { cpmColor = 'text-brand-orange'; cpmBg = isDark ? 'rgba(255,107,53,0.12)' : 'rgba(255,107,53,0.10)'; }
                    } else if (f.cpm > 0) {
                      cpmColor = 'text-brand-orange';
                    }
                    return (
                      <tr key={f.tipo} className={`${t.tableRow} ${idx % 2 === 1 ? (isDark ? 'bg-white/[0.012]' : 'bg-[#FDF7F4]/40') : ''}`}>
                        <td className={`px-5 py-3 font-medium ${t.tableCell}`}>
                          <span className="inline-flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                            {f.tipo}
                          </span>
                        </td>
                        <td className={`px-5 py-3 ${t.tableCellSec}`}>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums min-w-[40px]">{formatInt(f.quantidade)}</span>
                            <span className={`${t.vizBar} flex-1 max-w-[90px]`}><span className="block h-full rounded-full bg-brand-orange/60" style={{ width: `${endPct}%` }} /></span>
                          </div>
                        </td>
                        <td className={`px-5 py-3 ${t.tableCellSec}`}>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums min-w-[40px]">{formatInt(f.telas)}</span>
                            <span className={`${t.vizBar} flex-1 max-w-[90px]`}><span className="block h-full rounded-full bg-brand-orange/45" style={{ width: `${telasPct}%` }} /></span>
                          </div>
                        </td>
                        <td className={`px-5 py-3 ${t.tableCellSec}`}>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums min-w-[64px]">{formatInt(f.fluxo)}</span>
                            <span className={`${t.vizBar} flex-1 max-w-[120px]`}><span className="block h-full rounded-full bg-gradient-to-r from-brand-orange to-[#ff9466]" style={{ width: `${fluxoPct}%` }} /></span>
                          </div>
                        </td>
                        <td className={`px-5 py-3 font-semibold ${cpmColor}`}>
                          {f.cpm > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] tabular-nums" style={{ background: cpmBg }}>
                              R$ {formatInt(f.cpm)}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && formatos.length === 0 && (
                    <tr>
                      <td colSpan={5} className={`px-5 py-4 ${t.textMuted}`}>Nenhum formato encontrado para esta seleção.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile: render as cards instead of table */}
            <div className="md:hidden divide-y divide-white/5">
              {formatosTabela.length === 0 && !loading && (
                <div className={`px-5 py-4 text-sm ${t.textMuted}`}>Nenhum formato encontrado para esta seleção.</div>
              )}
              {formatosTabela.map((f) => {
                const fluxoPct = f._maxFluxo ? Math.min(100, (f.fluxo / f._maxFluxo) * 100) : 0;
                return (
                  <div key={f.tipo} className={`px-5 py-4 ${isDark ? '' : 'border-b border-[#F2DDD4]/60'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brand-orange" />
                        <span className="font-semibold text-sm">{f.tipo}</span>
                      </div>
                      {f.cpm > 0 && (
                        <span className="text-[11px] font-semibold text-brand-orange px-2 py-0.5 rounded-md border border-brand-orange/25 bg-brand-orange/5">
                          CPM R$ {formatInt(f.cpm)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <div className={`uppercase tracking-wide ${t.textMuted}`}>Endereços</div>
                        <div className="font-semibold text-sm tabular-nums">{formatInt(f.quantidade)}</div>
                      </div>
                      <div>
                        <div className={`uppercase tracking-wide ${t.textMuted}`}>Pontos</div>
                        <div className="font-semibold text-sm tabular-nums">{formatInt(f.telas)}</div>
                      </div>
                      <div>
                        <div className={`uppercase tracking-wide ${t.textMuted}`}>Fluxo</div>
                        <div className="font-semibold text-sm tabular-nums">{formatInt(f.fluxo)}</div>
                      </div>
                    </div>
                    <div className={`${t.vizBar} mt-2`}>
                      <span className="block h-full rounded-full bg-gradient-to-r from-brand-orange to-[#ff9466]" style={{ width: `${fluxoPct}%` }} />
                    </div>
                  </div>
                );
              })}
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
                      <span className="font-medium">{item.label}</span>
                      <span className={`tabular-nums ${t.textSec}`}>{item.total} endereços · <span className="text-brand-orange font-semibold">{pct}%</span></span>
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
      <section className={`py-12 border-b landing-divider relative ${t.sectionBorder}`}>
        {isDark && <div className="absolute inset-0 opacity-[0.022] bg-cover" style={{ backgroundImage: "url('/stock-wallpaper.jpg')", filter: 'blur(2px)' }} />}
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div>
              <span
                className="text-[11px] font-bold tracking-[0.18em] uppercase block mb-0.5"
                style={{ color: isDark ? 'rgba(255,107,53,0.75)' : '#C94A1A' }}
              >Inventário completo</span>
              <h2 className="text-2xl font-bold">Catálogo da seleção atual</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs uppercase tracking-wide ${t.textMuted}`}>
                {searchQuery ? `${formatInt(pontosFiltrados.length)} de ${formatInt(pontos.length)}` : formatInt(pontos.length)} endereços
              </span>
              <div className={`flex items-center gap-1 shrink-0 border rounded-lg p-0.5 ${t.toggleBg}`}>
                <button onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-brand-orange text-white shadow-sm' : t.toggleOff}`}>
                  <i className="ri-list-check mr-1" style={{ fontSize: 12 }} />Lista
                </button>
                <button onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'grid' ? 'bg-brand-orange text-white shadow-sm' : t.toggleOff}`}>
                  <i className="ri-grid-fill mr-1" style={{ fontSize: 12 }} />Grid
                </button>
              </div>
            </div>
          </div>

          {/* Favorites hint — shown once per session, dismissed after first favorite or manual close */}
          <AnimatePresence>
            {!favoritesHintDismissed && favorites.length === 0 && !loading && pontos.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                className={`mb-4 rounded-xl border px-4 py-3 flex items-center gap-3 text-sm ${t.favHint}`}
              >
                <Heart size={16} className="text-brand-orange shrink-0" fill="none" />
                <span className="flex-1">
                  Clique no <Heart size={12} className="inline text-brand-orange -mt-0.5 mx-0.5" fill="none" /> de cada ponto para salvar seus favoritos e compartilhar uma seleção personalizada.
                </span>
                <button
                  onClick={() => { setFavoritesHintDismissed(true); sessionStorage.setItem('intermidia_fav_hint_seen', '1'); }}
                  className={`shrink-0 p-1 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500' : 'hover:bg-neutral-200 text-neutral-400'}`}
                  aria-label="Fechar dica"
                >
                  <i className="ri-close-line" style={{ fontSize: 14 }} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Applied filters summary — shows count + quick clear */}
          {(selectedPracas.length > 0 || selectedTipos.length > 0 || selectedPublicos.length > 0 || selectedElevadorCategorias.length > 0 || searchQuery) && (
            <div className={`mb-4 rounded-xl border p-3 flex flex-wrap items-center gap-2 ${
              isDark ? 'bg-brand-orange/[0.05] border-brand-orange/25' : 'bg-[#FFF0EA] border-[#FFCFB8]'
            }`}>
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${
                isDark ? 'text-brand-orange' : 'text-[#C94A1A]'
              }`}>
                <i className="ri-filter-3-fill" style={{ fontSize: 13 }} />
                {selectedPracas.length + selectedTipos.length + selectedPublicos.length + selectedElevadorCategorias.length + (searchQuery ? 1 : 0)} filtro{selectedPracas.length + selectedTipos.length + selectedPublicos.length + selectedElevadorCategorias.length + (searchQuery ? 1 : 0) > 1 ? 's' : ''} aplicado{selectedPracas.length + selectedTipos.length + selectedPublicos.length + selectedElevadorCategorias.length + (searchQuery ? 1 : 0) > 1 ? 's' : ''}
              </span>
              <span className={`text-xs ${t.textMuted}`}>·</span>
              {selectedPracas.map((p) => (
                <button key={`p-${p}`} onClick={() => setSelectedPracas((cur) => cur.filter((x) => x !== p))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 dark:bg-white/10 border border-brand-orange/30 text-[#C94A1A] dark:text-brand-orange hover:bg-brand-orange hover:text-white transition-colors">
                  <i className="ri-map-pin-line" style={{ fontSize: 10 }} />
                  {p}
                  <i className="ri-close-line" style={{ fontSize: 11 }} />
                </button>
              ))}
              {selectedTipos.map((tp) => (
                <button key={`t-${tp}`} onClick={() => setSelectedTipos((cur) => cur.filter((x) => x !== tp))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 dark:bg-white/10 border border-brand-orange/30 text-[#C94A1A] dark:text-brand-orange hover:bg-brand-orange hover:text-white transition-colors">
                  <i className="ri-layers-line" style={{ fontSize: 10 }} />
                  {tp}
                  <i className="ri-close-line" style={{ fontSize: 11 }} />
                </button>
              ))}
              {selectedPublicos.map((pb) => (
                <button key={`pub-${pb}`} onClick={() => setSelectedPublicos((cur) => cur.filter((x) => x !== pb))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 dark:bg-white/10 border border-brand-orange/30 text-[#C94A1A] dark:text-brand-orange hover:bg-brand-orange hover:text-white transition-colors">
                  <i className="ri-group-line" style={{ fontSize: 10 }} />
                  {pb}
                  <i className="ri-close-line" style={{ fontSize: 11 }} />
                </button>
              ))}
              {selectedElevadorCategorias.map((ec) => (
                <button key={`ec-${ec}`} onClick={() => setSelectedElevadorCategorias((cur) => cur.filter((x) => x !== ec))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 dark:bg-white/10 border border-brand-orange/30 text-[#C94A1A] dark:text-brand-orange hover:bg-brand-orange hover:text-white transition-colors">
                  <i className={ec === 'Comercial' ? 'ri-building-2-line' : 'ri-home-4-line'} style={{ fontSize: 10 }} />
                  Elevador {ec}
                  <i className="ri-close-line" style={{ fontSize: 11 }} />
                </button>
              ))}
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 dark:bg-white/10 border border-brand-orange/30 text-[#C94A1A] dark:text-brand-orange hover:bg-brand-orange hover:text-white transition-colors">
                  <i className="ri-search-line" style={{ fontSize: 10 }} />
                  "{searchQuery.slice(0, 18)}{searchQuery.length > 18 ? '…' : ''}"
                  <i className="ri-close-line" style={{ fontSize: 11 }} />
                </button>
              )}
              <button
                onClick={() => { setSelectedPracas([]); setSelectedTipos([]); setSelectedPublicos([]); setSelectedElevadorCategorias([]); setSearchQuery(''); }}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full text-white bg-brand-orange hover:bg-[#E85A25] transition-colors"
              >
                <i className="ri-close-circle-line" style={{ fontSize: 13 }} />
                Limpar tudo
              </button>
            </div>
          )}

          {/* Search + sort controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-500" style={{ fontSize: 14 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, endereço ou cidade..."
                className={`w-full h-[42px] pl-9 pr-9 rounded-[10px] border text-sm transition-colors outline-none ${
                  isDark
                    ? 'bg-white/[0.04] border-white/10 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40 focus:bg-white/[0.06]'
                    : 'bg-white border-[#EFE0D8] text-[#1A1008] placeholder:text-[#9A8178] focus:border-brand-orange/50'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-brand-gray-500 hover:text-white' : 'text-[#9A8178] hover:text-[#1A1008]'}`}
                  aria-label="Limpar busca"
                >
                  <i className="ri-close-line" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
            <div className="w-full sm:w-56 shrink-0">
              <CustomSelect
                value={sortBy}
                onChange={setSortBy}
                isDark={isDark}
                placeholder="Ordenar"
                options={[
                  { value: 'tipo', label: 'Ordenar: por tipo' },
                  { value: 'fluxo_desc', label: 'Maior fluxo' },
                  { value: 'preco_asc', label: 'Menor preço' },
                  { value: 'preco_desc', label: 'Maior preço' },
                  { value: 'nome', label: 'Nome A–Z' },
                ]}
              />
            </div>
          </div>

          {!loading && (
            <div className={`sticky top-16 z-20 mb-5 rounded-xl border backdrop-blur-xl p-4 shadow-xl ${t.stickyNav} flex flex-col md:flex-row items-start md:items-center gap-4 transition-all`}>
              <div className="w-full lg:w-64 shrink-0 -mt-1 relative z-50">
                <CustomSelect
                  label="Praça"
                  value={selectedPracas}
                  onChange={setSelectedPracas}
                  options={pracas}
                  placeholder="Selecionar praça"
                  multiple
                  isDark={isDark}
                />
              </div>

              {formatosParaNav.length > 0 && (
                <div className="flex-1 w-full min-w-0">
                  <div className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${t.textMuted}`}>
                    Filtrar por formato
                  </div>
                  <div className="flex flex-nowrap overflow-x-auto gap-2 pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <button
                      onClick={() => {
                        setSelectedTipos([]);
                        pontosListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        selectedTipos.length === 0 ? t.navChipActive : t.navChip
                      }`}
                    >
                      Todos <span className="opacity-60 ml-0.5">({allPontos.length > 0 ? (selectedPracas.length ? allPontos.filter(p => selectedPracas.includes(p.cidade)).length : allPontos.length) : 0})</span>
                    </button>
                    {formatosParaNav.map((f) => {
                      const isActive = selectedTipos.length === 1 && selectedTipos[0] === f.tipo;
                      return (
                        <button
                          key={f.tipo}
                          onClick={() => {
                            if (isActive) {
                              setSelectedTipos([]);
                            } else {
                              setSelectedTipos([f.tipo]);
                            }
                            pontosListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            isActive ? t.navChipActive : t.navChip
                          }`}
                        >
                          {f.tipo} <span className="opacity-60 ml-0.5">({f.quantidade})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={pontosListRef} className="space-y-8 scroll-mt-40">
            {pontosPorTipo.map((grupo, groupIndex) => (
              <section key={grupo.anchorId} id={grupo.anchorId} className="scroll-mt-40">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{grupo.tipo}</h3>
                  <span className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{formatInt(grupo.quantidade)} endereços</span>
                </div>

                {/* ── GRID VIEW ── */}
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {grupo.pontos.map((ponto, itemIndex) => (
                      <motion.article
                        key={ponto.id}
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: Math.min(itemIndex * 0.04, 0.3), duration: 0.35 }}
                        className={`rounded-2xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 group ${t.card}`}
                      >
                        <div className="relative">
                          <PointImageGallery ponto={ponto} onExpand={openLightbox} compact />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isFavorite(ponto.id)) {
                                removeFavorite(ponto.id);
                                trackEvent('favorite_remove', { pointId: ponto.id, pointName: ponto.nome, pointCity: ponto.cidade, pointType: ponto.tipo });
                              } else {
                                addFavorite(ponto);
                                trackEvent('favorite_add', { pointId: ponto.id, pointName: ponto.nome, pointCity: ponto.cidade, pointType: ponto.tipo });
                                if (!favoritesHintDismissed) { setFavoritesHintDismissed(true); sessionStorage.setItem('intermidia_fav_hint_seen', '1'); }
                              }
                            }}
                            className={`absolute top-2 right-2 z-10 p-2 rounded-full backdrop-blur-sm transition-all duration-200 ${
                              isFavorite(ponto.id)
                                ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30'
                                : isDark ? 'bg-black/40 text-white/60 hover:text-white hover:bg-black/60' : 'bg-white/80 text-neutral-400 hover:text-neutral-700 hover:bg-white'
                            }`}
                            title={isFavorite(ponto.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                          >
                            <Heart size={14} fill={isFavorite(ponto.id) ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                        <div className="p-4">
                          <div className="flex flex-wrap gap-1 mb-2">
                            <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border font-semibold ${t.chipOrange}`}>{ponto.tipo}</span>
                            {ponto.cidade && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipGray}`}>{ponto.cidade}</span>}
                            {ponto.publico && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipGray}`}>{ponto.publico}</span>}
                          </div>
                          <h4 className="font-semibold text-sm leading-tight mb-1.5 line-clamp-2">{ponto.nome}</h4>
                          {ponto.endereco && (
                            <p className={`text-xs mb-3 flex items-start gap-1 line-clamp-1 ${t.textMuted}`}>
                              <i className="ri-map-pin-line text-brand-orange shrink-0 mt-0.5" style={{ fontSize: 11 }} />{ponto.endereco}
                            </p>
                          )}
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {[['Telas', ponto.telas], ['Fluxo', ponto.fluxo], ['Inserções', ponto.insercoes]].map(([label, val]) => (
                              <div key={label} className="text-center">
                                <div className={`text-[10px] uppercase ${t.gridStatsLabel}`}>{label}</div>
                                <div className={`text-sm font-bold ${t.gridStatsVal}`}>{formatInt(val || 0)}</div>
                              </div>
                            ))}
                          </div>
                          <div className={`pt-3 border-t flex items-center justify-between ${t.gridPriceBorder}`}>
                            <span className="text-brand-orange font-bold text-lg">{formatMoney(Number(ponto.preco) || 0)}</span>
                            <span className={`text-[10px] uppercase ${t.gridStatsLabel}`}>/ mês</span>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                ) : (
                /* ── LIST VIEW (original) ── */
                <div className="space-y-4">
                  {grupo.pontos.map((ponto, itemIndex) => (
                    <motion.article
                      key={ponto.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: Math.min((groupIndex + itemIndex) * 0.02, 0.45), duration: 0.4 }}
                      className={`rounded-2xl border backdrop-blur p-4 lg:p-5 transition-all duration-200 ${t.card} ${isDark ? 'hover:border-brand-orange/35 hover:shadow-[0_10px_30px_rgba(0,0,0,0.45)] hover:-translate-y-0.5' : 'hover:border-brand-orange/40 hover:shadow-lg hover:-translate-y-0.5'}`}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                        <div className="relative">
                          <PointImageGallery ponto={ponto} onExpand={openLightbox} />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isFavorite(ponto.id)) {
                                removeFavorite(ponto.id);
                                trackEvent('favorite_remove', { pointId: ponto.id, pointName: ponto.nome, pointCity: ponto.cidade, pointType: ponto.tipo });
                              } else {
                                addFavorite(ponto);
                                trackEvent('favorite_add', { pointId: ponto.id, pointName: ponto.nome, pointCity: ponto.cidade, pointType: ponto.tipo });
                                if (!favoritesHintDismissed) { setFavoritesHintDismissed(true); sessionStorage.setItem('intermidia_fav_hint_seen', '1'); }
                              }
                            }}
                            className={`absolute top-2 right-2 z-10 p-2 rounded-full backdrop-blur-sm transition-all duration-200 ${
                              isFavorite(ponto.id)
                                ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30'
                                : isDark ? 'bg-black/40 text-white/60 hover:text-white hover:bg-black/60' : 'bg-white/80 text-neutral-400 hover:text-neutral-700 hover:bg-white'
                            }`}
                            title={isFavorite(ponto.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                          >
                            <Heart size={14} fill={isFavorite(ponto.id) ? 'currentColor' : 'none'} />
                          </button>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                <span className={`text-[11px] uppercase tracking-wide rounded-md px-2 py-1 border font-semibold ${t.chipOrange}`}>
                                  <i className="ri-layers-line mr-1" style={{ fontSize: 11 }} />
                                  {ponto.tipo}
                                </span>
                                <span className={`text-[11px] uppercase tracking-wide rounded-md px-2 py-1 border ${t.chipGray}`}>
                                  <i className="ri-user-line mr-1" style={{ fontSize: 11 }} />
                                  {ponto.publico || 'N/I'}
                                </span>
                                {ponto.cidade && (
                                  <span className={`text-[11px] uppercase tracking-wide rounded-md px-2 py-1 border ${t.chipGray}`}>
                                    <i className="ri-map-pin-2-line mr-1" style={{ fontSize: 11 }} />
                                    {ponto.cidade}
                                  </span>
                                )}
                                {/* Static types: availability badge (never say "indisponível") */}
                                {(ponto.tipo === 'Frontlight' || ponto.tipo === 'Backlight') && (
                                  <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wide rounded-md px-2 py-1 border font-bold ${
                                    ponto.disponibilidade === 'indisponivel'
                                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                      : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${ponto.disponibilidade === 'indisponivel' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
                                    {ponto.disponibilidade === 'indisponivel' ? 'Sob consulta' : 'Disponível'}
                                  </span>
                                )}

                                {/* Digital types: urgency signal from loop audit */}
                                {(() => {
                                  const signal = getUrgencySignal(ponto, availabilityMap);
                                  if (!signal) return null;
                                  const styles = {
                                    critical: 'bg-red-500/10 text-red-500 border-red-500/30',
                                    high:     'bg-amber-500/10 text-amber-600 border-amber-500/30',
                                    medium:   'bg-orange-500/10 text-orange-600 border-orange-400/30',
                                    moderate: 'bg-blue-500/10 text-blue-500 border-blue-500/25',
                                    available:'bg-emerald-500/10 text-emerald-600 border-emerald-500/25',
                                  };
                                  const pulseOn = signal.level === 'critical' || signal.level === 'high';
                                  return (
                                    <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wide rounded-md px-2 py-1 border font-bold ${styles[signal.level] || styles.available}`}>
                                      {pulseOn && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                                      <i className={`${signal.icon}`} style={{ fontSize: 11 }} />
                                      {signal.label}
                                    </span>
                                  );
                                })()}
                              </div>
                              <h4 className="text-xl font-semibold leading-tight break-words">{ponto.nome}</h4>
                            </div>
                            <div className={`${t.priceCard} shrink-0`} style={isDark ? { boxShadow: '0 2px 14px rgba(255,107,53,0.12)' } : { boxShadow: '0 2px 14px rgba(255,107,53,0.15)' }}>
                              <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wide mb-0.5 font-semibold ${t.priceLabel}`}>
                                <i className="ri-money-dollar-line text-brand-orange" style={{ fontSize: 12 }} />
                                Investimento / mês
                              </div>
                              <div className="text-2xl font-bold text-brand-orange">{formatMoney(Number(ponto.preco) || 0)}</div>
                            </div>
                          </div>

                          {/* Urgency scarcity strip for high-demand points */}
                          {(() => {
                            const signal = getUrgencySignal(ponto, availabilityMap);
                            if (!signal || (signal.level !== 'critical' && signal.level !== 'high' && signal.level !== 'medium')) return null;
                            const stripColors = {
                              critical: isDark ? 'bg-red-500/[0.08] border-red-500/20' : 'bg-red-50 border-red-200/60',
                              high:     isDark ? 'bg-amber-500/[0.08] border-amber-500/20' : 'bg-amber-50 border-amber-200/60',
                              medium:   isDark ? 'bg-orange-500/[0.06] border-orange-500/15' : 'bg-orange-50/60 border-orange-200/40',
                            };
                            const textColors = {
                              critical: isDark ? 'text-red-400' : 'text-red-600',
                              high:     isDark ? 'text-amber-400' : 'text-amber-700',
                              medium:   isDark ? 'text-orange-400' : 'text-orange-600',
                            };
                            return (
                              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${stripColors[signal.level]}`}>
                                <i className={`${signal.icon} ${textColors[signal.level]}`} style={{ fontSize: 14 }} />
                                <span className={`font-semibold ${textColors[signal.level]}`}>{signal.sublabel}</span>
                              </div>
                            );
                          })()}

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
                              <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${t.miniLabel}`}><i className="ri-tv-2-line" style={{ fontSize: 12 }} /> Pontos de Impacto</div>
                              <div className="font-medium">{formatInt(Number(ponto.telas) || 0)}</div>
                            </div>
                            <div className={t.miniCell}>
                              <div className={`text-[11px] uppercase tracking-wide flex items-center gap-1 ${t.miniLabel}`}><i className="ri-time-line" style={{ fontSize: 12 }} /> Horário</div>
                              <div className="font-medium">{normalizeHorarioForPdf(ponto.horario, 'N/I')}</div>
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
                )}
              </section>
            ))}
            {!loading && pontos.length === 0 && (
              <div className={`text-sm ${t.textMuted}`}>Nenhum ponto disponível para a seleção atual.</div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className={`py-10 border-t relative ${t.footerBorder}`}>
        <div className={`absolute inset-0 ${t.footerBg}`} />
        <div className="relative max-w-6xl mx-auto px-6">
          {/* Row 1: Logo + tagline / nav links */}
          <div
            className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 mb-6"
            style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#EFE0D8'}` }}
          >
            <div className="flex items-center gap-3">
              <img src={isDark ? '/logo.png' : '/logo-light.png'} alt="Intermidia" className="h-7" />
              <span className={`text-sm font-medium ${t.footerText}`}>Publicidade Out-of-Home</span>
            </div>
            <div className={`flex items-center gap-6 text-sm ${t.footerText}`}>
              <button onClick={() => setSelectedPracas([])} className={`transition-colors ${t.footerLink}`}>Todas as praças</button>
              <button onClick={() => navigate('/planejar')} className={`transition-colors ${t.footerLink}`}>Planejar Campanha</button>
            </div>
          </div>
          {/* Row 2: Copyright + metadata */}
          <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs ${t.footerText}`}>
            <span>© {new Date().getFullYear()} Intermidia · Todos os direitos reservados</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <i className="ri-building-2-line" style={{ fontSize: 13 }} />
                {formatInt(pracas.length)} praças atendidas
              </span>
              <span className="flex items-center gap-1">
                Desenvolvido por{' '}
                <span className="font-semibold text-brand-orange animate-pulse ml-1">Maitê Doin</span>
              </span>
            </span>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {showMapModal && (
          <MapModal key="map-modal" pontos={pontos} onClose={() => setShowMapModal(false)} isDark={isDark} />
        )}
      </AnimatePresence>

      {/* ── PDF Export Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {showPdfModal && (
          <motion.div
            key="pdf-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 backdrop-blur-md px-4 py-6"
            onClick={() => setShowPdfModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={`relative w-full max-w-lg rounded-2xl border overflow-hidden ${
                isDark ? 'border-white/10 bg-[#0a0a0a]' : 'border-[#EFE0D8] bg-white'
              }`}
              style={{ boxShadow: '0 30px 100px rgba(0,0,0,0.7)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="px-6 pt-6 pb-5"
                style={{
                  background: isDark
                    ? 'linear-gradient(135deg, rgba(255,107,53,0.12) 0%, rgba(255,107,53,0.04) 100%)'
                    : 'linear-gradient(135deg, #FFF0EA 0%, #FFF8F5 100%)',
                  borderBottom: `1px solid ${isDark ? 'rgba(255,107,53,0.15)' : '#FFCFB8'}`,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{
                        background: isDark ? 'rgba(255,107,53,0.15)' : '#FFE4D6',
                        border: `1px solid ${isDark ? 'rgba(255,107,53,0.30)' : '#FFCFB8'}`,
                      }}
                    >
                      <i className="ri-file-pdf-2-line text-brand-orange" style={{ fontSize: 20 }} />
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold"
                        style={{ fontFamily: "'Poppins', system-ui, sans-serif", color: isDark ? '#fff' : '#1A1008' }}
                      >
                        Gerar Mídia Kit PDF
                      </h3>
                      <p className="text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : '#7A6155' }}>
                        {formatInt(pontos.length)} endereços · {selectedPracaLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPdfModal(false)}
                    className={`h-8 w-8 flex items-center justify-center rounded-full border transition ${
                      isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/15' : 'border-[#DDD0CA] bg-white text-[#7A6155] hover:bg-[#FDF7F4]'
                    }`}
                    aria-label="Fechar"
                  >
                    <i className="ri-close-line" style={{ fontSize: 15 }} />
                  </button>
                </div>
              </div>

              {/* Lead capture */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <i className="ri-user-star-line text-brand-orange" style={{ fontSize: 15 }} />
                    <span
                      className="text-xs font-bold uppercase tracking-[0.12em]"
                      style={{ color: isDark ? 'rgba(255,107,53,0.75)' : '#C94A1A' }}
                    >
                      Receba novidades e ofertas
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { key: 'nome', placeholder: 'Seu nome', icon: 'ri-user-line', colSpan: false },
                      { key: 'empresa', placeholder: 'Empresa', icon: 'ri-building-2-line', colSpan: false },
                      { key: 'email', placeholder: 'E-mail', icon: 'ri-mail-line', colSpan: false },
                      { key: 'telefone', placeholder: 'Telefone / WhatsApp', icon: 'ri-phone-line', colSpan: false },
                    ].map((field) => (
                      <div key={field.key} className={`relative ${field.colSpan ? 'col-span-2' : ''}`}>
                        <i
                          className={`${field.icon} absolute left-3 top-1/2 -translate-y-1/2`}
                          style={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.25)' : '#9A8178' }}
                        />
                        <input
                          type={field.key === 'email' ? 'email' : field.key === 'telefone' ? 'tel' : 'text'}
                          value={leadForm[field.key]}
                          onChange={(e) => setLeadForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className={`w-full h-[40px] pl-9 pr-3 rounded-lg border text-sm transition-colors outline-none ${
                            isDark
                              ? 'bg-white/[0.04] border-white/10 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40'
                              : 'bg-[#FDF7F4] border-[#EFE0D8] text-[#1A1008] placeholder:text-[#9A8178] focus:border-brand-orange/50'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] mt-2" style={{ color: isDark ? 'rgba(255,255,255,0.25)' : '#9A8178' }}>
                    <i className="ri-lock-line mr-0.5" style={{ fontSize: 10 }} />
                    Opcional — seus dados ficam seguros conosco.
                  </p>
                </div>

                {/* Divider */}
                <div
                  className="h-px"
                  style={{ background: isDark ? 'rgba(255,255,255,0.07)' : '#EFE0D8' }}
                />

                {/* Format toggle */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.12em] mb-2.5" style={{ color: isDark ? '#737373' : '#7A6155' }}>
                    Formato do PDF
                  </div>
                  <div
                    className="flex rounded-xl overflow-hidden"
                    style={{ border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#EFE0D8'}` }}
                  >
                    {[
                      {
                        value: 'desktop',
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
                        label: 'Padrão (Landscape)',
                        desc: 'Ideal para apresentação em tela',
                      },
                      {
                        value: 'mobile',
                        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"/></svg>,
                        label: 'Mobile (9:16)',
                        desc: 'Ideal para enviar por WhatsApp',
                      },
                    ].map(({ value, icon, label, desc }) => {
                      const active = pdfFormat === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setPdfFormat(value)}
                          className="flex-1 flex items-center gap-3 px-4 py-3 text-left transition-all duration-150"
                          style={{
                            background: active
                              ? isDark ? 'rgba(255,107,53,0.12)' : '#FFF0EA'
                              : 'transparent',
                            borderRight: value === 'desktop' ? `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#EFE0D8'}` : 'none',
                          }}
                        >
                          <div style={{ color: active ? '#FF6B35' : isDark ? 'rgba(255,255,255,0.35)' : '#9C877B' }}>
                            {icon}
                          </div>
                          <div>
                            <div className="text-xs font-semibold" style={{ color: active ? (isDark ? '#fff' : '#1A1008') : (isDark ? 'rgba(255,255,255,0.55)' : '#7A6155') }}>
                              {label}
                            </div>
                            <div className="text-[10px]" style={{ color: isDark ? 'rgba(255,255,255,0.30)' : '#9A8178' }}>
                              {desc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer / CTA */}
              <div
                className="px-6 py-4 flex items-center justify-between gap-3"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.02)' : '#FDF7F4',
                  borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#EFE0D8'}`,
                }}
              >
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="text-sm font-medium transition-colors"
                  style={{ color: isDark ? 'rgba(255,255,255,0.45)' : '#7A6155' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleExportPdf()}
                  disabled={pdfStatus === 'generating' || pontos.length === 0}
                  className="h-[44px] px-7 text-white font-bold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                  style={{
                    background: '#FF6B35',
                    boxShadow: '0 4px 16px rgba(255,107,53,0.36)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#E85A25'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(255,107,53,0.50)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FF6B35'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,107,53,0.36)'; }}
                >
                  <i className="ri-download-2-line" style={{ fontSize: 16 }} />
                  {pdfStatus === 'generating' ? 'Gerando...' : 'Gerar e baixar PDF'}
                </button>
              </div>
            </motion.div>
          </motion.div>
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

      {/* ── Toast "Link copiado" ──── */}
      <AnimatePresence>
        {shareToast && (
          <motion.div
            key="share-toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] rounded-xl border border-green-500/40 bg-green-600/90 backdrop-blur-sm px-5 py-3 text-sm font-semibold text-white shadow-xl flex items-center gap-2"
          >
            <i className="ri-checkbox-circle-fill" style={{ fontSize: 16 }} />
            Link copiado! Cole e envie para compartilhar.
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FavoritesBar (sidebar direita) ──── */}
      {!showSlidesMode && <FavoritesBar isDark={isDark} showProposalCta={false} onShareFavorites={handleShareFavorites} shareLoading={favShareLoading} />}

      {/* ── Botão flutuante WhatsApp (hidden during slides) ──── */}
      {!showSlidesMode && <motion.a
        href={WA_HREF}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com o comercial pelo WhatsApp"
        onClick={() => {
          trackEvent('whatsapp_click', { source: 'landing_floating_whatsapp' });
          captureContactLead('landing_floating_whatsapp');
        }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ scale: 1.06, y: -2 }}
        whileTap={{ scale: 0.94 }}
        className="group fixed bottom-6 left-6 z-[9990] flex items-center gap-0 rounded-full flex-row-reverse"
        style={{
          filter: 'drop-shadow(0 4px 24px rgba(37,211,102,0.55))',
        }}
      >
        {/* label desliza para a esquerda no hover */}
        <span
          className="max-w-0 overflow-hidden whitespace-nowrap text-white text-sm font-semibold group-hover:max-w-[180px] transition-all duration-300 ease-out"
          style={{
            background: '#1da851',
            borderRadius: '0 999px 999px 0',
            paddingTop: '0.6rem',
            paddingBottom: '0.6rem',
            paddingLeft: 0,
            paddingRight: 0,
          }}
        >
          <span className="pr-5 pl-1 group-hover:pr-5 group-hover:pl-3 block transition-all duration-300">
            Falar com comercial
          </span>
        </span>

        {/* ícone com pulse */}
        <span
          className="relative flex items-center justify-center w-14 h-14 rounded-full flex-shrink-0"
          style={{ background: '#25D366' }}
        >
          {/* anel de pulso */}
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: 'rgba(37,211,102,0.35)', animationDuration: '2s' }}
          />
          <svg viewBox="0 0 24 24" width="27" height="27" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', zIndex: 1 }}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </span>
      </motion.a>}
    </div>
  );
}
