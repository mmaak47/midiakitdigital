import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getPointDisplayImages } from '../lib/pointImages';
import { normalizeHorarioForPdf } from '../lib/horarioUtils';
import {
  Sun, Moon, MapPin, Users, TrendingUp, Clock, Check,
  ChevronDown, MessageCircle, Package, X, Share2, Copy,
  ChevronUp, Loader2, AlertCircle, Building2, Eye, Heart,
  Grid3X3, List, Monitor, Navigation, Phone
} from 'lucide-react';

const SmartMap = lazy(() => import('../components/SmartMap'));

// ── Formatters ──────────────────────────────────────────────────────────────
function formatCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatNumber(v) {
  return Number(v || 0).toLocaleString('pt-BR');
}
function formatInt(v) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(v) || 0));
}
function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ── Theme hook ──────────────────────────────────────────────────────────────
function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('intermidia_pacote_theme') === 'dark';
  });

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem('intermidia_pacote_theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const t = isDark
    ? {
        bg: 'bg-[#050505]', text: 'text-white', textSec: 'text-brand-gray-400',
        textMuted: 'text-brand-gray-500',
        headerBg: 'bg-[#050505]/95 border-[#2A2A2A]',
        headerText: 'text-brand-gray-400',
        card: 'bg-[#0A0A0A] border-[#2A2A2A]',
        cardHover: 'hover:border-brand-orange/40 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
        cardSelected: 'border-brand-orange/60 shadow-[0_0_20px_rgba(254,92,43,0.15)]',
        chip: 'bg-white/[0.06] border-[#2A2A2A] text-brand-gray-400',
        chipTag: 'bg-white/[0.04] border-white/10 text-brand-gray-400',
        input: 'bg-white/[0.04] border-[#2A2A2A] text-white placeholder:text-brand-gray-600 focus:border-brand-orange/50',
        pricingBg: 'bg-[#0A0A0A] border-[#2A2A2A]',
        heroBg: 'from-brand-orange/[0.04] to-transparent',
        heroBorder: 'border-[#2A2A2A]',
        sectionBg: 'bg-[#0A0A0A]/50',
        footerBg: 'border-[#2A2A2A] bg-[#0A0A0A]',
        footerText: 'text-brand-gray-500',
        toggleBg: 'bg-white/5 border-white/10',
        toggleOff: 'text-brand-gray-400 hover:text-white',
        toggleBtn: 'bg-white/5 border-[#2A2A2A] text-brand-gray-400 hover:text-white hover:border-brand-gray-500',
        selectAllBtn: 'bg-white/5 border-[#2A2A2A] text-brand-gray-300 hover:bg-white/10',
        btnSecondary: 'border-white/15 bg-white/5 text-brand-gray-300 hover:bg-white/10 hover:text-white',
        strikethrough: 'text-brand-gray-500',
        separator: 'text-white/15',
        statsLabel: 'text-brand-gray-500', statsVal: 'text-white',
        priceBorder: 'border-white/5',
        listMeta: 'text-brand-gray-400',
        successBg: 'bg-emerald-500/10 border-emerald-500/30',
        successText: 'text-emerald-400',
        mapBg: 'bg-[#0A0A0A] border-[#2A2A2A]',
      }
    : {
        bg: 'bg-[#FFF8F5]', text: 'text-[#1A1008]', textSec: 'text-[#7A6155]',
        textMuted: 'text-[#9A8579]',
        headerBg: 'bg-white/95 border-[#EFE0D8] shadow-sm',
        headerText: 'text-[#7A6155]',
        card: 'bg-white border-[#EFE0D8]',
        cardHover: 'hover:border-[#FF6B35]/40 hover:shadow-lg',
        cardSelected: 'border-brand-orange/60 shadow-[0_0_20px_rgba(254,92,43,0.1)]',
        chip: 'bg-[#FDF7F4] border-[#EFE0D8] text-[#7A6155]',
        chipTag: 'bg-[#FDF7F4] border-[#EFE0D8] text-[#7A6155]',
        input: 'bg-neutral-50 border-[#EFE0D8] text-[#1A1008] placeholder:text-[#B8A69C] focus:border-brand-orange/50',
        pricingBg: 'bg-white border-[#EFE0D8] shadow-sm',
        heroBg: 'from-[#FFF0EA] to-[#FFF8F5]',
        heroBorder: 'border-[#F2DDD4]',
        sectionBg: 'bg-[#FFF0EA]/50',
        footerBg: 'border-[#EFE0D8] bg-white',
        footerText: 'text-[#9A8579]',
        toggleBg: 'bg-white border-[#EFE0D8] shadow-sm',
        toggleOff: 'text-[#7A6155] hover:text-[#1A1008]',
        toggleBtn: 'bg-white border-[#EFE0D8] text-[#7A6155] hover:text-[#1A1008] hover:border-[#DDD0CA] shadow-sm',
        selectAllBtn: 'bg-white border-[#EFE0D8] text-[#7A6155] hover:bg-[#FDF7F4] shadow-sm',
        btnSecondary: 'border-[#DDD0CA] bg-white text-[#7A6155] hover:bg-[#FDF7F4] shadow-sm',
        strikethrough: 'text-[#B8A69C]',
        separator: 'text-[#DDD0CA]',
        statsLabel: 'text-[#9A8579]', statsVal: 'text-[#1A1008]',
        priceBorder: 'border-[#F2DDD4]',
        listMeta: 'text-[#7A6155]',
        successBg: 'bg-emerald-50 border-emerald-200',
        successText: 'text-emerald-700',
        mapBg: 'bg-white border-[#EFE0D8] shadow-sm',
      };

  return { isDark, toggle, t };
}

// ── Analytics helper ────────────────────────────────────────────────────────
function useTracking(code) {
  const sessionRef = useRef(null);
  useEffect(() => {
    let sid = sessionStorage.getItem('pacote_session_id');
    if (!sid) {
      sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('pacote_session_id', sid);
    }
    sessionRef.current = sid;
  }, []);
  const track = useCallback(
    (event_type, event_data = {}) => {
      if (!code || !sessionRef.current) return;
      fetch(`/api/pacote/${code}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionRef.current, event_type, event_data }),
      }).catch(() => {});
    },
    [code]
  );
  return track;
}

// ── Debounce hook ───────────────────────────────────────────────────────────
function useDebouncedCallback(fn, delay) {
  const timer = useRef(null);
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback(
    (...args) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(...args), delay);
    },
    [delay]
  );
}

// ── Image carousel per card (from SharedView) ───────────────────────────────
function CardGallery({ ponto, onExpand }) {
  const images = getPointDisplayImages(ponto);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [ponto.ponto_id || ponto.id]);

  if (!images.length) {
    return (
      <div className="aspect-[16/10] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
        <Package className="w-8 h-8 text-gray-300" />
      </div>
    );
  }
  const hasMultiple = images.length > 1;
  return (
    <div className="relative group aspect-[16/10] overflow-hidden bg-black cursor-pointer"
      onClick={() => onExpand?.(ponto, idx)}>
      <img src={images[idx]} alt={ponto.nome}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        style={{ objectPosition: `${ponto.imagem_foco_x ?? 50}% ${ponto.imagem_foco_y ?? 50}%` }}
        loading="lazy"
        onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      {hasMultiple && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + images.length) % images.length); }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-black z-10 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
            &#9664;
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % images.length); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-black z-10 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
            &#9654;
          </button>
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {images.map((_, i) => (
              <button key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`rounded-full transition-all ${i === idx ? 'w-4 h-1.5 bg-brand-orange' : 'w-1.5 h-1.5 bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Lightbox (fullscreen image viewer) ──────────────────────────────────────
function Lightbox({ ponto, imageIndex, onClose, onChangeIndex }) {
  const images = ponto ? getPointDisplayImages(ponto) : [];
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && images.length > 1) onChangeIndex((imageIndex - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight' && images.length > 1) onChangeIndex((imageIndex + 1) % images.length);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [imageIndex, images.length, onClose, onChangeIndex]);
  if (!ponto || !images.length) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 z-10" onClick={onClose}>
        <X className="w-5 h-5" />
      </button>
      <div className="relative max-w-full max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <img src={images[imageIndex]} alt={ponto.nome} className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-full font-medium">
          {ponto.nome}
        </div>
      </div>
      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); onChangeIndex((imageIndex - 1 + images.length) % images.length); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20">
            &#9664;
          </button>
          <button onClick={(e) => { e.stopPropagation(); onChangeIndex((imageIndex + 1) % images.length); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20">
            &#9654;
          </button>
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {images.map((_, i) => (
              <button key={i} onClick={(e) => { e.stopPropagation(); onChangeIndex(i); }}
                className={`rounded-full transition-all ${i === imageIndex ? 'w-5 h-2 bg-brand-orange' : 'w-2 h-2 bg-white/40'}`} />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── Interactive map (same SmartMap used in /comercial/explorar) ──────────────
function PointsMapPreview({ pontos, isDark, t }) {
  const validPontos = pontos.filter(p => p.lat && p.lng && Math.abs(p.lat) > 0.1 && Math.abs(p.lng) > 0.1);
  if (!validPontos.length) return null;

  // SmartMap expects `id` — pacote pontos use `ponto_id`
  const mapPontos = useMemo(() =>
    validPontos.map(p => ({ ...p, id: p.ponto_id || p.id })),
    [validPontos]
  );

  return (
    <div className={`rounded-2xl border overflow-hidden ${t.mapBg}`}>
      <div className="px-5 py-3 flex items-center gap-2">
        <Navigation className="w-4 h-4 text-brand-orange" />
        <h3 className="text-base font-bold">Localização dos pontos</h3>
        <span className={`text-xs ml-auto ${t.textMuted}`}>{validPontos.length} ponto{validPontos.length > 1 ? 's' : ''} no mapa</span>
      </div>
      <div className="relative" style={{ height: 420 }}>
        <Suspense fallback={
          <div className={`h-full w-full flex items-center justify-center text-sm ${isDark ? 'bg-neutral-900 text-neutral-400' : 'bg-neutral-100 text-neutral-500'}`}>
            Carregando mapa…
          </div>
        }>
          <SmartMap
            pontos={mapPontos}
            isDark={isDark}
          />
        </Suspense>
      </div>
      {/* Points legend */}
      <div className="px-5 py-3 flex flex-wrap gap-2">
        {validPontos.slice(0, 8).map(p => (
          <span key={p.ponto_id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${t.chipTag}`}>
            <MapPin className="w-2.5 h-2.5 text-brand-orange" />{p.nome?.slice(0, 30) || 'Ponto'}
          </span>
        ))}
        {validPontos.length > 8 && (
          <span className={`text-[10px] px-2 py-0.5 ${t.textMuted}`}>+{validPontos.length - 8} pontos</span>
        )}
      </div>
    </div>
  );
}

// ── Duration presets ────────────────────────────────────────────────────────
const DURATION_PRESETS = [3, 6, 12, 24];

// ── Animation variants ─────────────────────────────────────────────────────
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const sectionVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function PacotePublico() {
  const { code } = useParams();
  const { isDark, toggle, t } = useTheme();
  const track = useTracking(code);

  // ── Data state ──
  const [pacote, setPacote] = useState(null);
  const [vendedor, setVendedor] = useState(null);
  const [compartilhamentoId, setCompartilhamentoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── View state ──
  const [viewMode, setViewMode] = useState('grid');

  // ── Selection state (hearts = selection when permite_escolha, otherwise all pre-selected) ──
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [duracao, setDuracao] = useState(12);
  const [customDuracao, setCustomDuracao] = useState('');
  const [showCustomDuracao, setShowCustomDuracao] = useState(false);

  // ── Pricing state ──
  const [pricing, setPricing] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  // ── Lead form state (simplified: nome, telefone, empresa) ──
  const [leadForm, setLeadForm] = useState({ nome: '', empresa: '', telefone: '' });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadError, setLeadError] = useState(null);

  // ── Lightbox ──
  const [lightbox, setLightbox] = useState({ ponto: null, imageIndex: 0 });

  // ── Mobile pricing panel ──
  const [pricingExpanded, setPricingExpanded] = useState(false);

  // ── Refs ──
  const interesseRef = useRef(null);
  const pricingSectionRef = useRef(null);

  // ── Copy toast ──
  const [copyToast, setCopyToast] = useState(false);

  // ── Derived: can client choose points? ──
  // When there's only 1 active point, treat as "não permite escolha" (auto-selected)
  const activePointCount = useMemo(() => pacote?.pontos?.filter(p => p.ativo !== false).length || 0, [pacote]);
  const permiteEscolha = pacote?.permite_escolha_pontos !== false && activePointCount > 1;

  // ── Load package data ──
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/pacote/${code}`);
        if (!res.ok) throw new Error(res.status === 404 ? 'not_found' : 'server_error');
        const data = await res.json();
        if (!active) return;

        setPacote(data.pacote);
        setVendedor(data.vendedor);
        setCompartilhamentoId(data.compartilhamento_id);

        // When permite_escolha: start empty (client picks via hearts)
        // When NOT permite_escolha OR only 1 point: pre-select all
        const activePoints = (data.pacote.pontos || []).filter((p) => p.ativo !== false);
        if (data.pacote.permite_escolha_pontos === false || activePoints.length === 1) {
          setSelectedIds(new Set(activePoints.map((p) => p.ponto_id)));
        }
      } catch (err) {
        if (!active) return;
        setError(err.message === 'not_found' ? 'not_found' : 'server_error');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [code]);

  // ── Track page view ──
  useEffect(() => {
    if (!loading && !error && pacote) {
      track('page_view', { pacote_id: pacote.id, pontos_total: pacote.pontos?.length });
    }
  }, [loading, error, pacote, track]);

  // ── Active points ──
  const pontos = useMemo(() => {
    if (!pacote?.pontos) return [];
    return pacote.pontos.filter((p) => p.ativo !== false).sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
  }, [pacote]);

  const showDualImages = pontos.length > 0 && pontos.length < 10;

  // ── Group by tipo ──
  const pontosPorTipo = useMemo(() => {
    const map = new Map();
    pontos.forEach((p) => {
      const tipo = p.tipo || 'Outros';
      if (!map.has(tipo)) map.set(tipo, []);
      map.get(tipo).push(p);
    });
    return Array.from(map.entries()).map(([tipo, pts]) => ({ tipo, pontos: pts, count: pts.length }));
  }, [pontos]);

  // ── Computed stats ──
  const stats = useMemo(() => {
    const cidades = new Set(pontos.map((p) => p.cidade).filter(Boolean));
    const fluxoTotal = pontos.reduce((sum, p) => sum + (Number(p.fluxo_mensal) || 0), 0);
    const telasTotal = pontos.reduce((sum, p) => sum + (Number(p.telas) || 0), 0);
    return { totalPontos: pontos.length, totalCidades: cidades.size, fluxoTotal, telasTotal };
  }, [pontos]);

  const allSelected = pontos.length > 0 && selectedIds.size === pontos.length;

  // ── Toggle heart (single mechanism for selection + favorites) ──
  const toggleHeart = useCallback((pontoId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pontoId)) next.delete(pontoId);
      else next.add(pontoId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(pontos.map((p) => p.ponto_id)));
  }, [allSelected, pontos]);

  // ── Fetch pricing (debounced) ──
  const fetchPricing = useCallback(
    async (ids, dur) => {
      if (!code || ids.size === 0) { setPricing(null); return; }
      setPricingLoading(true);
      try {
        const idsParam = [...ids].join(',');
        const res = await fetch(`/api/pacote/${code}/preco?ponto_ids=${idsParam}&duracao=${dur}`);
        if (res.ok) setPricing(await res.json());
      } catch { /* silent */ }
      finally { setPricingLoading(false); }
    },
    [code]
  );
  const debouncedFetchPricing = useDebouncedCallback(fetchPricing, 300);

  useEffect(() => {
    debouncedFetchPricing(selectedIds, duracao);
  }, [selectedIds, duracao, debouncedFetchPricing]);

  // ── Track selection changes ──
  const debouncedTrackSelection = useDebouncedCallback(
    (ids) => track('selection_change', { ponto_ids: [...ids], count: ids.size }), 500
  );
  useEffect(() => { if (pacote) debouncedTrackSelection(selectedIds); }, [selectedIds, pacote, debouncedTrackSelection]);

  const debouncedTrackDuration = useDebouncedCallback(
    (dur) => track('duration_change', { duracao_meses: dur }), 500
  );
  useEffect(() => { if (pacote) debouncedTrackDuration(duracao); }, [duracao, pacote, debouncedTrackDuration]);

  // ── Duration handlers ──
  const handleDuracaoPreset = useCallback((months) => {
    setDuracao(months);
    setShowCustomDuracao(false);
    setCustomDuracao('');
  }, []);

  const handleCustomDuracao = useCallback((val) => {
    const num = parseInt(val, 10);
    setCustomDuracao(val);
    if (num >= 1 && num <= 60) setDuracao(num);
  }, []);

  // ── Lead form handlers ──
  const handleLeadField = useCallback((field, value) => {
    if (field === 'telefone') {
      setLeadForm((prev) => ({ ...prev, [field]: formatPhone(value) }));
    } else {
      setLeadForm((prev) => ({ ...prev, [field]: value }));
    }
  }, []);

  const handleLeadSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!leadForm.nome.trim()) return;

      setLeadSubmitting(true);
      setLeadError(null);
      try {
        // 1) Save favorites first (so they exist in DB when interesse notification fires)
        if (permiteEscolha && selectedIds.size > 0) {
          const favArr = [...selectedIds].map((id) => {
            const p = pontos.find((pt) => (pt.ponto_id || pt.id) === id);
            return { point_id: id, point_name: p?.nome || '' };
          });
          await fetch(`/api/pacote/${code}/favoritos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_name: leadForm.nome.trim(),
              client_phone: leadForm.telefone.replace(/\D/g, ''),
              client_empresa: leadForm.empresa.trim(),
              favorites: favArr,
            }),
          }).catch(() => {}); // non-blocking if fails
        }

        // 2) Send interesse (triggers single unified WhatsApp with favorites included)
        const res = await fetch(`/api/pacote/${code}/interesse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: leadForm.nome.trim(),
            empresa: leadForm.empresa.trim(),
            telefone: leadForm.telefone.replace(/\D/g, ''),
            pontos_selecionados: [...selectedIds],
            duracao_meses: duracao,
            valor_estimado: pricing?.preco_final_mensal || 0,
          }),
        });
        if (!res.ok) throw new Error('submit_error');

        setLeadSubmitted(true);
        track('interesse_submit', { pontos_count: selectedIds.size, duracao_meses: duracao });
      } catch {
        setLeadError('Erro ao enviar. Tente novamente.');
      } finally {
        setLeadSubmitting(false);
      }
    },
    [code, leadForm, selectedIds, duracao, pricing, pontos, permiteEscolha, track]
  );

  // ── Share handler ──
  const handleShareClick = useCallback(async () => {
    track('whatsapp_click', { pacote_nome: pacote?.nome });
    const shareUrl = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: pacote?.nome, text: `Confira: ${pacote?.nome}`, url: shareUrl }); } catch { }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopyToast(true);
        setTimeout(() => setCopyToast(false), 2500);
      } catch { window.prompt('Copie o link:', shareUrl); }
    }
  }, [pacote, track]);

  // ── Lightbox handlers ──
  const openLightbox = useCallback((ponto, idx) => {
    setLightbox({ ponto, imageIndex: idx || 0 });
    track('point_expand', { ponto_id: ponto.ponto_id || ponto.id, ponto_nome: ponto.nome });
  }, [track]);

  const closeLightbox = useCallback(() => setLightbox({ ponto: null, imageIndex: 0 }), []);

  // ── Scroll to interesse ──
  const scrollToInteresse = useCallback(() => {
    interesseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── WhatsApp link for vendedor ──
  const vendedorWaLink = useMemo(() => {
    if (!vendedor?.whatsapp) return null;
    const phone = vendedor.whatsapp.replace(/\D/g, '');
    const text = encodeURIComponent(`Olá ${vendedor.first_name || vendedor.nome}! Estou vendo o pacote "${pacote?.nome}" e gostaria de saber mais.`);
    return `https://wa.me/${phone}?text=${text}`;
  }, [vendedor, pacote]);

  const vendedorInitial = vendedor?.first_name?.[0] || vendedor?.nome?.[0] || 'I';

  // ══════════════════════════════════════════════════════════════════════════
  // LOADING
  // ══════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#050505]' : 'bg-[#FFF8F5]'}`}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin mx-auto mb-4" />
          <p className={`text-sm ${t.textMuted}`}>Carregando pacote...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ERROR
  // ══════════════════════════════════════════════════════════════════════════
  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-6 ${isDark ? 'bg-[#050505]' : 'bg-[#FFF8F5]'}`}>
        <div className="text-center max-w-md">
          <Package className="w-12 h-12 text-brand-orange mx-auto mb-4 opacity-60" />
          <h1 className={`text-xl font-bold mb-2 ${t.text}`}>
            {error === 'not_found' ? 'Pacote não encontrado' : 'Erro ao carregar'}
          </h1>
          <p className={`text-sm mb-6 ${t.textMuted}`}>
            {error === 'not_found'
              ? 'Este link pode ter expirado ou o pacote foi removido.'
              : 'Não foi possível carregar o pacote. Tente novamente mais tarde.'}
          </p>
          <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand-orange text-white font-semibold text-sm hover:bg-[#E85A25] transition-colors">
            Ir para o site
          </a>
        </div>
      </div>
    );
  }

  const hasDiscount = pricing && pricing.desconto_total_pct > 0;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.bg} ${t.text}`}>

      {/* ═══ HEADER ═══════════════════════════════════════════════════════ */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-300 ${t.headerBg}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <a href="/" className="shrink-0">
            <img src={isDark ? '/logo h-09.png' : '/logo h-11.png'} alt="Intermidia" className="h-7"
              onError={(e) => { e.target.onerror = null; e.target.src = isDark ? '/logo.png' : '/logo-light.png'; }} />
          </a>

          <div className="flex-1 min-w-0 text-center hidden sm:block">
            <span className={`text-sm font-semibold truncate block ${t.textSec}`}>{pacote.nome}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button onClick={toggle} title={isDark ? 'Modo claro' : 'Modo escuro'}
              className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${t.toggleBtn}`}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {/* Copy link */}
            <button onClick={handleShareClick}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${t.btnSecondary}`}>
              <Copy className="w-3 h-3" />
              <span className="hidden sm:inline">Copiar link</span>
            </button>
            {/* WhatsApp vendedor */}
            {vendedorWaLink && (
              <a href={vendedorWaLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors shadow-sm">
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Falar com {vendedor.first_name || vendedor.nome}</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ═══ HERO ═════════════════════════════════════════════════════════ */}
      <motion.section initial="hidden" animate="visible" variants={sectionVariants}
        className={`border-b bg-gradient-to-b transition-colors duration-300 ${t.heroBorder} ${t.heroBg}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-3">{pacote.nome}</h1>

              {pacote.descricao && (
                <p className={`text-base sm:text-lg mb-5 max-w-2xl leading-relaxed ${t.textSec}`}>{pacote.descricao}</p>
              )}

              {/* Vendedor card */}
              {vendedor && (
                <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-2xl border mb-5 ${t.card}`}>
                  {vendedor.photo_url ? (
                    <img src={vendedor.photo_url} alt={vendedor.nome} className="w-11 h-11 rounded-full object-cover border-2 border-brand-orange/30" />
                  ) : (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold bg-brand-orange/15 text-brand-orange">
                      {vendedorInitial.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className={`text-xs ${t.textMuted}`}>Seu consultor</p>
                    <p className="text-sm font-semibold">{vendedor.first_name || vendedor.nome}</p>
                  </div>
                  {vendedorWaLink && (
                    <a href={vendedorWaLink} target="_blank" rel="noopener noreferrer"
                      className="ml-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors">
                      <MessageCircle className="w-3 h-3" />Falar
                    </a>
                  )}
                </div>
              )}

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-brand-orange" />
                  <strong>{stats.totalPontos}</strong> pontos
                </span>
                <span className={t.separator}>|</span>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-brand-orange" />
                  <strong>{stats.totalCidades}</strong> cidade{stats.totalCidades > 1 ? 's' : ''}
                </span>
                <span className={t.separator}>|</span>
                <span className="inline-flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-brand-orange" />
                  <strong>{formatInt(stats.telasTotal)}</strong> pontos de impacto
                </span>
                <span className={t.separator}>|</span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-brand-orange" />
                  <strong>{formatInt(stats.fluxoTotal)}</strong> fluxo/mês
                </span>
              </div>

              {/* Favorites instruction */}
              {permiteEscolha && !leadSubmitted && (
                <p className={`text-xs mt-4 ${t.textMuted}`}>
                  <Heart className="w-3 h-3 inline-block text-brand-orange mr-1" />
                  Clique no coração dos pontos que mais gostou e envie sua seleção
                </p>
              )}
            </div>

            {/* View toggle */}
            <div className={`flex items-center gap-1 shrink-0 border rounded-lg p-0.5 ${t.toggleBg}`}>
              <button onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${viewMode === 'grid' ? 'bg-brand-orange text-white shadow-sm' : t.toggleOff}`}>
                <Grid3X3 className="w-3.5 h-3.5" />Grid
              </button>
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${viewMode === 'list' ? 'bg-brand-orange text-white shadow-sm' : t.toggleOff}`}>
                <List className="w-3.5 h-3.5" />Lista
              </button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ═══ MAIN CONTENT ═════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-10">
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">

          {/* ═══ LEFT: Points + Map + Lead form ════════════════════════════ */}
          <div className="min-w-0">

            {/* ── POINTS SECTION ──────────────────────────────────────── */}
            <motion.section initial="hidden" animate="visible" variants={sectionVariants}>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold mb-1">
                    {permiteEscolha ? 'Escolha seus pontos favoritos' : 'Endereços do pacote'}
                  </h2>
                  <p className={`text-sm ${t.textMuted}`}>
                    {permiteEscolha
                      ? 'Toque no coração para selecionar os pontos que mais gostou'
                      : 'Conheça os endereços incluídos neste pacote'}
                  </p>
                </div>
                {permiteEscolha && !leadSubmitted && (
                  <button onClick={toggleAll}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors shrink-0 ${t.selectAllBtn}`}>
                    {allSelected ? <><X className="w-3.5 h-3.5" /> Limpar seleção</> : <><Heart className="w-3.5 h-3.5" /> Selecionar todos</>}
                  </button>
                )}
              </div>

              {/* ── GRID VIEW ──────────────────────────────────────── */}
              {viewMode === 'grid' ? (
                <motion.div variants={containerVariants} initial="hidden" animate="visible"
                  className={`grid grid-cols-1 sm:grid-cols-2 ${showDualImages ? 'xl:grid-cols-2' : 'xl:grid-cols-3'} gap-4`}>
                  {pontos.map((ponto) => {
                    const isSelected = selectedIds.has(ponto.ponto_id);
                    const dualImages = showDualImages ? getPointDisplayImages(ponto) : [];
                    const hasExtraImage = showDualImages && dualImages.length > 1;
                    const isSinglePoint = pontos.length === 1 && hasExtraImage;
                    return (
                      <motion.div key={ponto.ponto_id} variants={cardVariants} layout
                        className={`group relative rounded-2xl border overflow-hidden transition-all duration-200 ${isSinglePoint ? 'col-span-full' : ''} ${t.card} ${isSelected ? t.cardSelected : t.cardHover}`}>
                        {hasExtraImage ? (
                          <>
                            {/* ── DUAL IMAGES: side by side when single point, hero when multiple ── */}
                            <div className={isSinglePoint ? 'grid grid-cols-2 gap-0.5 bg-black/20' : ''}>
                              <div className={`relative overflow-hidden bg-black cursor-pointer group/hero ${
                                isSinglePoint
                                  ? 'aspect-[3/4] ring-1 ring-brand-orange/25'
                                  : 'aspect-[3/4] rounded-t-2xl ring-1 ring-brand-orange/25 shadow-[0_0_30px_rgba(254,92,43,0.18),0_0_80px_rgba(254,92,43,0.07)]'
                              }`}
                                onClick={() => openLightbox(ponto, 1)}>
                                <img src={dualImages[1]} alt={`${ponto.nome} - Ponto de Impacto`}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover/hero:scale-[1.03] brightness-110 contrast-105 saturate-105"
                                  loading="lazy" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
                                <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10" />
                                <span className="absolute bottom-3 left-3 text-[11px] uppercase tracking-wider font-bold text-white bg-brand-orange/90 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg shadow-brand-orange/30">
                                  <Monitor className="w-3.5 h-3.5" /> Ponto de Impacto
                                </span>
                                {/* Heart overlay */}
                                {permiteEscolha && !leadSubmitted && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleHeart(ponto.ponto_id); }}
                                    className={`absolute top-3 right-3 z-10 p-2.5 rounded-full backdrop-blur-sm transition-all ${
                                      isSelected
                                        ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30 scale-110'
                                        : 'bg-black/40 text-white/60 hover:text-white hover:bg-black/60'
                                    }`}
                                    title={isSelected ? 'Remover dos favoritos' : 'Favoritar'}
                                  >
                                    <Heart className="w-5 h-5" fill={isSelected ? 'currentColor' : 'none'} />
                                  </button>
                                )}
                                {permiteEscolha && leadSubmitted && isSelected && (
                                  <div className="absolute top-3 right-3 z-10 p-2.5 rounded-full bg-brand-orange text-white">
                                    <Heart className="w-5 h-5" fill="currentColor" />
                                  </div>
                                )}
                              </div>
                              {/* Street view — side by side when single, thumbnail when multiple */}
                              {isSinglePoint && (
                                <div className="relative aspect-[3/4] overflow-hidden bg-black cursor-pointer group/street"
                                  onClick={() => openLightbox(ponto, 0)}>
                                  <img src={dualImages[0]} alt={`${ponto.nome} - localização`}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/street:scale-[1.03]"
                                    loading="lazy" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                                  <span className="absolute bottom-3 left-3 text-[11px] uppercase tracking-wider font-bold text-white/80 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                                    <Navigation className="w-3.5 h-3.5" /> Localização
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Card body */}
                            <div className="p-4">
                              <div className={`flex gap-3 mb-3 ${isSinglePoint ? '' : ''}`}>
                                {/* Street view thumbnail — only when multiple points */}
                                {!isSinglePoint && (
                                  <div className="w-24 h-[4.5rem] shrink-0 rounded-lg overflow-hidden cursor-pointer group/thumb border border-white/10"
                                    onClick={() => openLightbox(ponto, 0)}>
                                    <img src={dualImages[0]} alt={`${ponto.nome} - localização`}
                                      className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                                      loading="lazy" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap gap-1 mb-1">
                                    {ponto.tipo && (
                                      <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border font-semibold bg-brand-orange/10 border-brand-orange/25 text-brand-orange">
                                        {ponto.tipo}
                                      </span>
                                    )}
                                    {ponto.cidade && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.cidade}</span>}
                                    {ponto.publico && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.publico}</span>}
                                  </div>
                                  <h3 className={`font-bold leading-tight mb-1 ${isSinglePoint ? 'text-base' : 'text-sm'} line-clamp-2`}>{ponto.nome}</h3>
                                  {ponto.endereco && (
                                    <p className={`text-xs flex items-start gap-1 line-clamp-1 ${t.textMuted}`}>
                                      <MapPin className="w-3 h-3 text-brand-orange shrink-0 mt-0.5" />{ponto.endereco}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Metrics grid */}
                              <div className="grid grid-cols-3 gap-2 mb-3">
                                {[
                                  ['Impactos', ponto.telas],
                                  ['Fluxo', ponto.fluxo_mensal],
                                  ['Inserções', ponto.insercoes],
                                ].map(([label, val]) => (
                                  <div key={label} className="text-center">
                                    <div className={`text-[10px] uppercase ${t.statsLabel}`}>{label}</div>
                                    <div className={`text-sm font-bold ${t.statsVal}`}>{formatInt(val || 0)}</div>
                                  </div>
                                ))}
                              </div>

                              {ponto.horario && (
                                <div className={`flex items-center gap-1 text-[11px] mb-3 ${t.textMuted}`}>
                                  <Clock className="w-3 h-3 text-brand-orange" />
                                  {normalizeHorarioForPdf(ponto.horario, 'N/I')}
                                </div>
                              )}

                              <div className={`pt-3 border-t flex items-center justify-between ${t.priceBorder}`}>
                                <span className="text-brand-orange font-bold text-lg">{formatCurrency(ponto.preco_mensal)}</span>
                                <span className={`text-[10px] uppercase ${t.statsLabel}`}>/ mês</span>
                              </div>
                            </div>
                          </>
                        ) : (
                        <div className="relative">
                          <CardGallery ponto={ponto} onExpand={openLightbox} />
                          {/* Heart overlay — only when permite_escolha */}
                          {permiteEscolha && !leadSubmitted && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleHeart(ponto.ponto_id); }}
                              className={`absolute top-3 right-3 z-10 p-2 rounded-full backdrop-blur-sm transition-all ${
                                isSelected
                                  ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30 scale-110'
                                  : 'bg-black/40 text-white/60 hover:text-white hover:bg-black/60'
                              }`}
                              title={isSelected ? 'Remover dos favoritos' : 'Favoritar'}
                            >
                              <Heart className="w-4 h-4" fill={isSelected ? 'currentColor' : 'none'} />
                            </button>
                          )}
                          {permiteEscolha && leadSubmitted && isSelected && (
                            <div className="absolute top-3 right-3 z-10 p-2 rounded-full bg-brand-orange text-white">
                              <Heart className="w-4 h-4" fill="currentColor" />
                            </div>
                          )}
                        </div>
                        )}

                        {/* Card body (normal cards without dual images) */}
                        {!hasExtraImage && (
                        <div className="p-4">
                          <div className="flex flex-wrap gap-1 mb-2">
                            {ponto.tipo && (
                              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border font-semibold bg-brand-orange/10 border-brand-orange/25 text-brand-orange">
                                {ponto.tipo}
                              </span>
                            )}
                            {ponto.cidade && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.cidade}</span>}
                            {ponto.publico && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.publico}</span>}
                          </div>
                          <h3 className="font-bold text-sm leading-tight mb-1.5 line-clamp-2">{ponto.nome}</h3>
                          {ponto.endereco && (
                            <p className={`text-xs mb-3 flex items-start gap-1 line-clamp-1 ${t.textMuted}`}>
                              <MapPin className="w-3 h-3 text-brand-orange shrink-0 mt-0.5" />{ponto.endereco}
                            </p>
                          )}

                          {/* Metrics grid */}
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {[
                              ['Impactos', ponto.telas],
                              ['Fluxo', ponto.fluxo_mensal],
                              ['Inserções', ponto.insercoes],
                            ].map(([label, val]) => (
                              <div key={label} className="text-center">
                                <div className={`text-[10px] uppercase ${t.statsLabel}`}>{label}</div>
                                <div className={`text-sm font-bold ${t.statsVal}`}>{formatInt(val || 0)}</div>
                              </div>
                            ))}
                          </div>

                          {/* Horário */}
                          {ponto.horario && (
                            <div className={`flex items-center gap-1 text-[11px] mb-3 ${t.textMuted}`}>
                              <Clock className="w-3 h-3 text-brand-orange" />
                              {normalizeHorarioForPdf(ponto.horario, 'N/I')}
                            </div>
                          )}

                          {/* Price */}
                          <div className={`pt-3 border-t flex items-center justify-between ${t.priceBorder}`}>
                            <span className="text-brand-orange font-bold text-lg">{formatCurrency(ponto.preco_mensal)}</span>
                            <span className={`text-[10px] uppercase ${t.statsLabel}`}>/ mês</span>
                          </div>
                        </div>
                        )}
                      </motion.div>
                    );
                  })}
                </motion.div>
              ) : (
                /* ── LIST VIEW ──────────────────────────────────────── */
                <div className="space-y-3">
                  {pontos.map((ponto, i) => {
                    const isSelected = selectedIds.has(ponto.ponto_id);
                    const dualImages = showDualImages ? getPointDisplayImages(ponto) : [];
                    const hasExtraImage = showDualImages && dualImages.length > 1;
                    return (
                      <motion.article key={ponto.ponto_id}
                        initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                        transition={{ delay: Math.min(i * 0.03, 0.25), duration: 0.3 }}
                        className={`rounded-xl border p-4 transition-all duration-200 ${t.card} ${isSelected ? t.cardSelected : t.cardHover}`}>
                        <div className={`grid grid-cols-1 ${hasExtraImage ? 'md:grid-cols-[320px_100px_1fr_auto]' : 'md:grid-cols-[200px_1fr_auto]'} gap-4 items-center`}>
                          {/* OOH screen image — large, prominent */}
                          {hasExtraImage && (
                            <div
                              className="relative rounded-xl overflow-hidden cursor-pointer group/hero aspect-[4/5] shadow-[0_0_25px_rgba(254,92,43,0.15),0_4px_20px_rgba(0,0,0,0.3)] ring-1 ring-brand-orange/25"
                              onClick={() => openLightbox(ponto, 1)}
                            >
                              <img src={dualImages[1]} alt={`${ponto.nome} - Ponto de Impacto`}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover/hero:scale-[1.03] brightness-110 contrast-105 saturate-105"
                                loading="lazy" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                              <div className="absolute inset-0 pointer-events-none rounded-xl ring-1 ring-inset ring-white/10" />
                              <span className="absolute bottom-2 left-2 text-[9px] uppercase tracking-wider font-bold text-white bg-brand-orange/90 backdrop-blur-sm px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md shadow-brand-orange/25">
                                <Monitor className="w-2.5 h-2.5" /> Ponto de Impacto
                              </span>
                            </div>
                          )}
                          {/* Street view / secondary image */}
                          <div className={`rounded-lg overflow-hidden ${hasExtraImage ? 'aspect-[16/10]' : ''}`}>
                            {hasExtraImage ? (
                              <div className="w-full h-full cursor-pointer group/thumb" onClick={() => openLightbox(ponto, 0)}>
                                <img src={dualImages[0]} alt={`${ponto.nome} - localização`}
                                  className="w-full h-full object-cover rounded-lg transition-transform duration-300 group-hover/thumb:scale-105"
                                  loading="lazy" />
                              </div>
                            ) : (
                              <CardGallery ponto={ponto} onExpand={openLightbox} />
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {ponto.tipo && (
                                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border font-semibold bg-brand-orange/10 border-brand-orange/25 text-brand-orange">
                                  {ponto.tipo}
                                </span>
                              )}
                              {ponto.cidade && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.cidade}</span>}
                              {ponto.publico && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.publico}</span>}
                            </div>
                            <h3 className="font-semibold leading-tight mb-1">{ponto.nome}</h3>
                            {ponto.endereco && (
                              <p className={`text-xs flex items-start gap-1 mb-2 ${t.textMuted}`}>
                                <MapPin className="w-3 h-3 text-brand-orange shrink-0 mt-0.5" />{ponto.endereco}
                              </p>
                            )}
                            <div className={`flex flex-wrap gap-4 text-xs ${t.listMeta}`}>
                              <span><Monitor className="w-3 h-3 text-brand-orange inline mr-1" />{formatInt(ponto.telas || 0)} impactos</span>
                              <span><Users className="w-3 h-3 text-brand-orange inline mr-1" />{formatInt(ponto.fluxo_mensal || 0)} fluxo</span>
                              {ponto.insercoes > 0 && <span>{formatInt(ponto.insercoes)} inserç.</span>}
                              {ponto.horario && <span><Clock className="w-3 h-3 text-brand-orange inline mr-1" />{normalizeHorarioForPdf(ponto.horario, 'N/I')}</span>}
                            </div>
                          </div>

                          {/* Right: Price + Heart */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-brand-orange font-bold text-xl">{formatCurrency(ponto.preco_mensal)}</div>
                              <div className={`text-[10px] uppercase ${t.statsLabel}`}>/ mês</div>
                            </div>
                            {permiteEscolha && !leadSubmitted && (
                              <button
                                onClick={() => toggleHeart(ponto.ponto_id)}
                                className={`p-2 rounded-full transition-all ${
                                  isSelected
                                    ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30'
                                    : isDark ? 'bg-white/10 text-brand-gray-400 hover:text-white hover:bg-white/20' : 'bg-neutral-100 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200'
                                }`}
                                title={isSelected ? 'Remover dos favoritos' : 'Favoritar'}
                              >
                                <Heart className="w-4 h-4" fill={isSelected ? 'currentColor' : 'none'} />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              )}

              {pontos.length === 0 && (
                <div className={`text-center py-16 ${t.textMuted}`}>
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nenhum ponto disponível neste pacote.</p>
                </div>
              )}
            </motion.section>

            {/* ── MAP SECTION ─────────────────────────────────────────── */}
            <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
              variants={sectionVariants} className="mt-8">
              <PointsMapPreview pontos={pontos} isDark={isDark} t={t} />
            </motion.section>

            {/* ── LEAD CAPTURE ────────────────────────────────────────── */}
            <motion.section ref={interesseRef} initial="hidden" whileInView="visible"
              viewport={{ once: true, margin: '-50px' }} variants={sectionVariants}
              className="mt-10 lg:mt-14">
              <div className={`rounded-2xl border p-6 sm:p-8 ${t.card}`}>
                {leadSubmitted ? (
                  <div className={`text-center py-6 rounded-xl border ${t.successBg}`}>
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
                      <Check className={`w-7 h-7 ${t.successText}`} />
                    </div>
                    <h3 className={`text-lg font-bold mb-2 ${t.successText}`}>Recebemos seu interesse!</h3>
                    <p className={`text-sm ${t.textSec}`}>
                      {vendedor?.first_name
                        ? `${vendedor.first_name} entrará em contato em breve.`
                        : 'Nossa equipe entrará em contato em breve.'}
                    </p>
                    {vendedorWaLink && (
                      <a href={vendedorWaLink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full text-sm font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors">
                        <MessageCircle className="w-4 h-4" />Falar com {vendedor.first_name || vendedor.nome}
                      </a>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mb-6">
                      <h2 className="text-xl sm:text-2xl font-bold mb-1">Ficou interessado?</h2>
                      <p className={`text-sm ${t.textMuted}`}>
                        Preencha seus dados e nosso consultor entrará em contato
                      </p>
                    </div>

                    <form onSubmit={handleLeadSubmit} className="space-y-4">
                      {/* Nome */}
                      <div>
                        <label className={`text-xs font-semibold mb-1.5 block ${t.textSec}`}>
                          Seu nome <span className="text-brand-orange">*</span>
                        </label>
                        <input type="text" required value={leadForm.nome}
                          onChange={(e) => handleLeadField('nome', e.target.value)}
                          placeholder="Como quer ser chamado?"
                          className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${t.input}`} />
                      </div>

                      {/* WhatsApp + Empresa row */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className={`text-xs font-semibold mb-1.5 block ${t.textSec}`}>
                            WhatsApp
                          </label>
                          <input type="tel" value={leadForm.telefone}
                            onChange={(e) => handleLeadField('telefone', e.target.value)}
                            placeholder="(XX) XXXXX-XXXX"
                            className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${t.input}`} />
                        </div>
                        <div>
                          <label className={`text-xs font-semibold mb-1.5 block ${t.textSec}`}>
                            Empresa
                          </label>
                          <input type="text" value={leadForm.empresa}
                            onChange={(e) => handleLeadField('empresa', e.target.value)}
                            placeholder="Nome da empresa (opcional)"
                            className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${t.input}`} />
                        </div>
                      </div>

                      {leadError && (
                        <div className="flex items-center gap-2 text-sm text-red-500">
                          <AlertCircle className="w-4 h-4 shrink-0" />{leadError}
                        </div>
                      )}

                      <button type="submit" disabled={leadSubmitting || !leadForm.nome.trim()}
                        className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-200 ${
                          leadSubmitting || !leadForm.nome.trim()
                            ? 'opacity-50 cursor-not-allowed bg-brand-orange/60'
                            : 'bg-gradient-to-r from-brand-orange to-[#E85A25] hover:from-[#E85A25] hover:to-[#D04A18] shadow-lg shadow-brand-orange/20 hover:shadow-brand-orange/30 hover:scale-[1.01] active:scale-[0.99]'
                        }`}>
                        {leadSubmitting
                          ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                          : <><Heart className="w-4 h-4" fill="currentColor" />Tenho interesse</>}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </motion.section>
          </div>

          {/* ═══ RIGHT: Pricing Sidebar ═══════════════════════════════════ */}
          <aside ref={pricingSectionRef} className="hidden lg:block">
            <div className="sticky top-20">
              <PricingPanel
                pricing={pricing} pricingLoading={pricingLoading}
                hasDiscount={hasDiscount} duracao={duracao}
                customDuracao={customDuracao} showCustomDuracao={showCustomDuracao}
                selectedCount={selectedIds.size}
                onPreset={handleDuracaoPreset} onCustomDuracao={handleCustomDuracao}
                onShowCustom={() => setShowCustomDuracao(true)}
                onHideCustom={() => { setShowCustomDuracao(false); setCustomDuracao(''); }}
                onScrollToInteresse={scrollToInteresse}
                t={t} isDark={isDark}
              />
            </div>
          </aside>
        </div>
      </div>

      {/* ═══ MOBILE PRICING BAR ═══════════════════════════════════════════ */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40">
        <div className={`border-t backdrop-blur-xl transition-colors ${t.pricingBg} ${pricingExpanded ? 'rounded-t-2xl' : ''}`}>
          <button onClick={() => setPricingExpanded(!pricingExpanded)}
            className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-orange/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-brand-orange" />
              </div>
              <div className="text-left">
                <p className={`text-[10px] font-medium uppercase tracking-wide ${t.textMuted}`}>
                  {selectedIds.size} {selectedIds.size === 1 ? 'ponto' : 'pontos'} &middot; {duracao} meses
                </p>
                <p className="text-lg font-bold text-brand-orange">
                  {pricing ? formatCurrency(pricing.preco_final_mensal) : '--'}{' '}
                  <span className={`text-xs font-medium ${t.textMuted}`}>/mês</span>
                </p>
              </div>
            </div>
            <ChevronUp className={`w-5 h-5 transition-transform ${t.textMuted} ${pricingExpanded ? '' : 'rotate-180'}`} />
          </button>

          <AnimatePresence>
            {pricingExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden">
                <div className="px-4 pb-4 pt-1">
                  <PricingPanel
                    pricing={pricing} pricingLoading={pricingLoading}
                    hasDiscount={hasDiscount} duracao={duracao}
                    customDuracao={customDuracao} showCustomDuracao={showCustomDuracao}
                    selectedCount={selectedIds.size}
                    onPreset={handleDuracaoPreset} onCustomDuracao={handleCustomDuracao}
                    onShowCustom={() => setShowCustomDuracao(true)}
                    onHideCustom={() => { setShowCustomDuracao(false); setCustomDuracao(''); }}
                    onScrollToInteresse={() => { setPricingExpanded(false); setTimeout(() => scrollToInteresse(), 300); }}
                    t={t} isDark={isDark} isMobile
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ═══ FLOATING WHATSAPP ═══════════════════════════════════════════ */}
      {vendedorWaLink && (
        <a href={vendedorWaLink} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-24 lg:bottom-6 right-4 sm:right-6 z-30 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 flex items-center justify-center hover:bg-[#1EB954] hover:scale-110 active:scale-95 transition-all duration-200"
          title={`Falar com ${vendedor?.first_name || vendedor?.nome}`}>
          <MessageCircle className="w-6 h-6" />
        </a>
      )}

      {/* ═══ TOASTS ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {copyToast && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-36 lg:bottom-24 right-4 sm:right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1008] text-white text-sm font-medium shadow-xl">
            <Copy className="w-4 h-4" />Link copiado!
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ LIGHTBOX ════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {lightbox.ponto && (
          <Lightbox ponto={lightbox.ponto} imageIndex={lightbox.imageIndex}
            onClose={closeLightbox}
            onChangeIndex={(idx) => setLightbox((prev) => ({ ...prev, imageIndex: idx }))} />
        )}
      </AnimatePresence>

      {/* ═══ FOOTER ══════════════════════════════════════════════════════ */}
      <footer className={`border-t mt-10 lg:mt-16 ${t.footerBg}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="shrink-0">
              <img src={isDark ? '/logo.png' : '/logo-light.png'} alt="Intermidia" className="h-6 opacity-60 hover:opacity-100 transition-opacity duration-300" />
            </a>
            <span className={`text-sm ${t.footerText}`}>Publicidade Out-of-Home</span>
          </div>
          <div className={`flex items-center gap-4 text-xs ${t.footerText}`}>
            <span>&copy; {new Date().getFullYear()} Intermidia</span>
            <a href="https://redeintermidia.com" target="_blank" rel="noopener noreferrer"
              className="font-medium hover:text-brand-orange transition-colors">
              redeintermidia.com
            </a>
          </div>
        </div>
      </footer>

      {/* Bottom spacer for mobile fixed bars */}
      <div className="lg:hidden h-24" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PRICING PANEL
// ═════════════════════════════════════════════════════════════════════════════
function PricingPanel({
  pricing, pricingLoading, hasDiscount, duracao, customDuracao, showCustomDuracao,
  selectedCount, onPreset, onCustomDuracao, onShowCustom, onHideCustom,
  onScrollToInteresse, t, isDark, isMobile = false,
}) {
  return (
    <div className={isMobile ? '' : `rounded-2xl border p-6 ${t.pricingBg}`}>
      {!isMobile && (
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-brand-orange" />
          <h3 className="text-lg font-bold">Resumo do pacote</h3>
        </div>
      )}

      {/* Duration selector */}
      <div className="mb-5">
        <p className={`text-xs font-semibold mb-2.5 uppercase tracking-wide ${t.textMuted}`}>
          <Clock className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />Duração do contrato
        </p>
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((m) => (
            <button key={m} onClick={() => onPreset(m)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                duracao === m && !showCustomDuracao
                  ? 'bg-brand-orange text-white border-brand-orange shadow-sm'
                  : t.selectAllBtn
              }`}>
              {m} meses
            </button>
          ))}
          {!showCustomDuracao ? (
            <button onClick={onShowCustom} className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 ${t.selectAllBtn}`}>
              Outro
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input type="number" min="1" max="60" value={customDuracao}
                onChange={(e) => onCustomDuracao(e.target.value)} placeholder="Ex: 9" autoFocus
                className={`w-20 px-3 py-2 rounded-xl border text-sm font-semibold outline-none ${t.input}`} />
              <span className={`text-xs ${t.textMuted}`}>meses</span>
              <button onClick={onHideCustom} className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.textMuted} hover:text-brand-orange transition-colors`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`border-t mb-5 ${isDark ? 'border-[#2A2A2A]' : 'border-[#EFE0D8]'}`} />

      {selectedCount === 0 ? (
        <div className={`text-center py-4 ${t.textMuted}`}>
          <Eye className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Selecione ao menos um ponto para ver o preço</p>
        </div>
      ) : pricingLoading && !pricing ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-brand-orange" />
        </div>
      ) : pricing ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className={t.textSec}>Pontos selecionados</span>
            <span className="font-bold">{pricing.qtd_pontos}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className={t.textSec}>Duração</span>
            <span className="font-bold">{pricing.duracao_meses} meses</span>
          </div>

          <div className={`border-t ${isDark ? 'border-[#2A2A2A]' : 'border-[#EFE0D8]'}`} />

          <div className="flex items-center justify-between text-sm">
            <span className={t.textSec}>Preço base mensal</span>
            <span className={hasDiscount ? `line-through ${t.strikethrough}` : 'font-bold'}>
              {formatCurrency(pricing.preco_base_mensal)}
            </span>
          </div>

          {hasDiscount && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className={t.textSec}>Desconto aplicado</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  -{pricing.desconto_total_pct}%
                </span>
              </div>
              <div className={`text-xs px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-[#FFF8F5]'}`}>
                <span className={t.textMuted}>
                  {pricing.desconto_quantidade_pct > 0 && <>Quantidade: {pricing.desconto_quantidade_pct}%</>}
                  {pricing.desconto_quantidade_pct > 0 && pricing.desconto_duracao_pct > 0 && ' · '}
                  {pricing.desconto_duracao_pct > 0 && <>Duração: {pricing.desconto_duracao_pct}%</>}
                  {pricing.empilhavel && <span className="ml-1 opacity-60">(acumulativo)</span>}
                </span>
              </div>
            </>
          )}

          <div className={`border-t ${isDark ? 'border-[#2A2A2A]' : 'border-[#EFE0D8]'}`} />

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Preço final mensal</span>
            <span className="text-2xl font-extrabold text-brand-orange">
              {formatCurrency(pricing.preco_final_mensal)}
            </span>
          </div>

          <div className={`rounded-xl p-4 text-center ${isDark ? 'bg-brand-orange/[0.08]' : 'bg-[#FFF0EA]'}`}>
            <p className={`text-xs font-medium mb-1 ${t.textMuted}`}>
              Total do contrato ({pricing.duracao_meses} meses)
            </p>
            <p className="text-xl font-extrabold text-brand-orange">
              {formatCurrency(pricing.preco_total_contrato)}
            </p>
          </div>

          {pricingLoading && (
            <div className="flex items-center justify-center pt-1">
              <Loader2 className="w-4 h-4 animate-spin text-brand-orange opacity-50" />
            </div>
          )}
        </div>
      ) : null}

      {selectedCount > 0 && (
        <button onClick={onScrollToInteresse}
          className="w-full mt-5 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-brand-orange to-[#E85A25] hover:from-[#E85A25] hover:to-[#D04A18] shadow-lg shadow-brand-orange/20 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]">
          <Heart className="w-4 h-4" fill="currentColor" />Tenho interesse
        </button>
      )}
    </div>
  );
}
