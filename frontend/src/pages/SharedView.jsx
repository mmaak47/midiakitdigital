import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchPontos, submitClientFavorites } from '../lib/api';
import { getPointDisplayImages } from '../lib/pointImages';
import { normalizeHorarioForPdf } from '../lib/horarioUtils';

const WA_COMERCIAL = '554398450480';

function formatInt(v) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(v) || 0));
}
function formatMoney(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
}

// ── Theme tokens ──
function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('intermidia_shared_theme') === 'dark';
  });
  const toggle = () => setIsDark((v) => {
    const next = !v;
    localStorage.setItem('intermidia_shared_theme', next ? 'dark' : 'light');
    return next;
  });

  const t = isDark ? {
    // Dark
    bg: 'bg-[#050505]', text: 'text-white', textSec: 'text-brand-gray-400', textMuted: 'text-brand-gray-500',
    headerBg: 'bg-[#050505]/95 border-white/10', headerText: 'text-brand-gray-400',
    heroBg: 'from-brand-orange/[0.04] to-transparent', heroBorder: 'border-white/5',
    card: 'border-white/10 bg-[#0A0A0A] hover:border-brand-orange/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
    cardInner: '', chipTag: 'bg-white/[0.04] border-white/10 text-brand-gray-400',
    statsLabel: 'text-brand-gray-500', statsVal: 'text-white',
    metricCell: '', priceBorder: 'border-white/5',
    listMeta: 'text-brand-gray-400',
    separator: 'text-white/15',
    toggleBg: 'bg-white/5 border-white/10', toggleOff: 'text-brand-gray-400 hover:text-white',
    btnSecondary: 'border-white/15 bg-white/5 text-brand-gray-300 hover:bg-white/10 hover:text-white',
    footerBg: 'border-white/10 from-brand-orange/[0.03] to-transparent', footerText: 'text-brand-gray-400', footerMuted: 'text-brand-gray-600',
    emptyText: 'text-brand-gray-500',
    filterChip: 'bg-brand-orange/10 border-brand-orange/25 text-brand-orange',
  } : {
    // Light (default)
    bg: 'bg-[#FFF8F5]', text: 'text-[#1A1008]', textSec: 'text-[#7A6155]', textMuted: 'text-[#9A8579]',
    headerBg: 'bg-white/95 border-[#EFE0D8] shadow-sm', headerText: 'text-[#7A6155]',
    heroBg: 'from-[#FFF0EA] to-[#FFF8F5]', heroBorder: 'border-[#F2DDD4]',
    card: 'border-[#EFE0D8] bg-white hover:border-[#FF6B35]/40 hover:shadow-lg shadow-sm',
    cardInner: '', chipTag: 'bg-[#FDF7F4] border-[#EFE0D8] text-[#7A6155]',
    statsLabel: 'text-[#9A8579]', statsVal: 'text-[#1A1008]',
    metricCell: '', priceBorder: 'border-[#F2DDD4]',
    listMeta: 'text-[#7A6155]',
    separator: 'text-[#DDD0CA]',
    toggleBg: 'bg-white border-[#EFE0D8] shadow-sm', toggleOff: 'text-[#7A6155] hover:text-[#1A1008]',
    btnSecondary: 'border-[#DDD0CA] bg-white text-[#7A6155] hover:bg-[#FDF7F4] shadow-sm',
    footerBg: 'border-[#EFE0D8] from-[#FFF0EA] to-[#FFF8F5]', footerText: 'text-[#7A6155]', footerMuted: 'text-[#B8A69C]',
    emptyText: 'text-[#9A8579]',
    filterChip: 'bg-[#FFF0EA] border-[#FFCFB8] text-[#C94A1A]',
  };

  return { isDark, toggle, t };
}

// ── Image carousel per card ──
function CardGallery({ ponto, onExpand }) {
  const images = getPointDisplayImages(ponto);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [ponto.id]);

  if (!images.length) {
    return <div className="aspect-[16/10] bg-gray-100 flex items-center justify-center text-gray-400 text-xs">Sem imagem</div>;
  }
  const hasMultiple = images.length > 1;
  return (
    <div className="relative group aspect-[16/10] overflow-hidden bg-black cursor-pointer" onClick={() => onExpand?.(ponto, idx)}>
      <img src={images[idx]} alt={ponto.nome}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        style={{ objectPosition: `${ponto.imagem_foco_x ?? 50}% ${ponto.imagem_foco_y ?? 50}%` }}
        loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      {hasMultiple && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + images.length) % images.length); }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-black z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <i className="ri-arrow-left-s-line text-white" style={{ fontSize: 12 }} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % images.length); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-black z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <i className="ri-arrow-right-s-line text-white" style={{ fontSize: 12 }} />
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

// ── Lightbox ──
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
        <i className="ri-close-line" style={{ fontSize: 20 }} />
      </button>
      <img src={images[imageIndex]} alt={ponto.nome} className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); onChangeIndex((imageIndex - 1 + images.length) % images.length); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20">
            <i className="ri-arrow-left-s-line" style={{ fontSize: 20 }} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onChangeIndex((imageIndex + 1) % images.length); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20">
            <i className="ri-arrow-right-s-line" style={{ fontSize: 20 }} />
          </button>
        </>
      )}
    </motion.div>
  );
}

// ── Filter chips ──
function FilterChips({ filters, className }) {
  const chips = [];
  (filters.cidade || []).forEach((c) => chips.push({ icon: 'ri-map-pin-line', label: c }));
  (filters.tipo || []).forEach((tp) => chips.push({ icon: 'ri-layers-line', label: tp }));
  (filters.publico || []).forEach((p) => chips.push({ icon: 'ri-group-line', label: p }));
  (filters.elevador || []).forEach((e) => chips.push({ icon: e === 'Comercial' ? 'ri-building-2-line' : 'ri-home-4-line', label: `Elevador ${e}` }));
  if (filters.q) chips.push({ icon: 'ri-search-line', label: `"${filters.q}"` });
  if (!chips.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className || ''}`}>
      {chips.map((c, i) => (
        <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${className || ''}`}>
          <i className={c.icon} style={{ fontSize: 10 }} />{c.label}
        </span>
      ))}
    </div>
  );
}

export default function SharedView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { isDark, toggle, t } = useTheme();
  const [filters, setFilters] = useState(null);
  const [shareData, setShareData] = useState(null);
  const [allPontos, setAllPontos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [lightbox, setLightbox] = useState({ ponto: null, imageIndex: 0 });
  const [copyToast, setCopyToast] = useState(false);

  // Commercial mode: client favorites
  const [clientFavs, setClientFavs] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitToast, setSubmitToast] = useState(false);

  const isCommercial = shareData?.shareType === 'commercial';
  const clientName = shareData?.clientName || '';
  const vendedor = shareData?.vendedor || null;

  const toggleClientFav = useCallback((ponto) => {
    setClientFavs((prev) => {
      const next = new Set(prev);
      if (next.has(ponto.id)) next.delete(ponto.id);
      else next.add(ponto.id);
      return next;
    });
  }, []);

  const handleSubmitFavorites = useCallback(async () => {
    if (!clientFavs.size || !code) return;
    setSubmitting(true);
    try {
      const favArr = [...clientFavs].map((id) => {
        const p = allPontos.find((pt) => pt.id === id);
        return { point_id: id, point_name: p?.nome || '' };
      });
      await submitClientFavorites(code, favArr);
      setSubmitted(true);
      setSubmitToast(true);
      setTimeout(() => setSubmitToast(false), 4000);
    } catch {
      alert('Erro ao enviar favoritos. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }, [clientFavs, code, allPontos]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [shareRes, pontosData] = await Promise.all([
          fetch(`/api/share/${code}`).then((r) => { if (!r.ok) throw new Error(r.status === 404 ? 'not_found' : 'error'); return r.json(); }),
          fetchPontos(),
        ]);
        if (!active) return;
        setShareData(shareRes);
        setFilters(shareRes.filters);
        setAllPontos(pontosData);
      } catch (err) {
        if (!active) return;
        setError(err.message === 'not_found' ? 'Este link expirou ou foi removido.' : 'Erro ao carregar os pontos.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [code]);

  const isFavoritesLink = Boolean(filters?.pointIds?.length);

  const pontos = useMemo(() => {
    if (!filters || !allPontos.length) return [];
    let result = [...allPontos];

    // Favorites link: filter ONLY by specific point IDs (ignores other filters)
    if (filters.pointIds?.length) {
      const idSet = new Set(filters.pointIds);
      return result.filter((p) => idSet.has(p.id));
    }

    if (filters.cidade?.length) result = result.filter((p) => filters.cidade.includes(p.cidade));
    if (filters.tipo?.length) result = result.filter((p) => filters.tipo.includes(p.tipo));
    if (filters.publico?.length) result = result.filter((p) => filters.publico.includes(p.publico));
    if (filters.elevador?.length) {
      result = result.filter((p) => {
        if (p.tipo !== 'Elevador') return true;
        const cat = (p.elevador_categoria || '').trim() || (p.publico === 'Classe A/B' ? 'Comercial' : 'Residencial');
        return filters.elevador.includes(cat);
      });
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      result = result.filter((p) =>
        (p.nome || '').toLowerCase().includes(q) ||
        (p.endereco || '').toLowerCase().includes(q) ||
        (p.cidade || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [allPontos, filters]);

  const pontosPorTipo = useMemo(() => {
    const map = new Map();
    pontos.forEach((p) => {
      const tipo = p.tipo || 'Outros';
      if (!map.has(tipo)) map.set(tipo, []);
      map.get(tipo).push(p);
    });
    return Array.from(map.entries()).map(([tipo, pts]) => ({ tipo, pontos: pts, count: pts.length }));
  }, [pontos]);

  const stats = useMemo(() => {
    const totalPreco = pontos.reduce((s, p) => s + (Number(p.preco) || 0), 0);
    const disc = filters?.discount;
    let discountAmount = 0;
    if (disc && disc.value > 0) {
      discountAmount = disc.mode === 'percent'
        ? totalPreco * Math.min(disc.value, 100) / 100
        : Math.min(disc.value, totalPreco);
    }
    return {
      totalPontos: pontos.length,
      totalFluxo: pontos.reduce((s, p) => s + (Number(p.fluxo) || 0), 0),
      totalInsercoes: pontos.reduce((s, p) => s + (Number(p.insercoes) || 0), 0),
      totalPreco,
      discountAmount,
      finalPreco: Math.max(0, totalPreco - discountAmount),
      hasDiscount: discountAmount > 0,
    };
  }, [pontos, filters]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2500);
    } catch { window.prompt('Copie o link:', window.location.href); }
  };

  const waText = encodeURIComponent(
    filters?.cidade?.length
      ? `Olá! Vi a seleção de mídia OOH em ${filters.cidade.join(', ')} e gostaria de saber mais.`
      : 'Olá! Vi o mídia kit digital da Intermidia e gostaria de saber mais.'
  );

  // ── Loading ──
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#050505]' : 'bg-[#FFF8F5]'}`}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin mx-auto mb-4" />
          <p className={`text-sm ${t.textMuted}`}>Carregando seleção...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-6 ${isDark ? 'bg-[#050505]' : 'bg-[#FFF8F5]'}`}>
        <div className="text-center max-w-md">
          <i className="ri-link-unlink text-brand-orange mb-4 block" style={{ fontSize: 48 }} />
          <h1 className={`text-xl font-bold mb-2 ${t.text}`}>Link indisponível</h1>
          <p className={`text-sm mb-6 ${t.textMuted}`}>{error}</p>
          <button onClick={() => navigate('/')} className="px-5 py-2.5 rounded-full bg-brand-orange text-white font-semibold text-sm hover:bg-[#E85A25] transition-colors">
            <i className="ri-arrow-left-line mr-1.5" style={{ fontSize: 14 }} />Ver catálogo completo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.bg} ${t.text}`}>
      {/* ── Header ── */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-300 ${t.headerBg}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/')} className={`shrink-0 flex items-center gap-2 transition-colors text-sm ${t.headerText}`}>
              <img src={isDark ? '/logo.png' : '/logo-light.png'} alt="Intermidia" className="h-6"
                onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }} />
            </button>
            <span className={`hidden sm:block ${t.separator}`}>|</span>
            <span className={`text-xs hidden sm:block truncate ${t.textMuted}`}>
              {shareData?.label || (filters?.cidade?.length ? `Seleção em ${filters.cidade.join(', ')}` : 'Pontos selecionados')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button onClick={toggle} title={isDark ? 'Modo claro' : 'Modo escuro'}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${t.btnSecondary}`}>
              <i className={isDark ? 'ri-sun-line' : 'ri-moon-line'} style={{ fontSize: 14 }} />
            </button>
            <button onClick={handleCopyLink}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${t.btnSecondary}`}>
              <i className="ri-link" style={{ fontSize: 12 }} />
              <span className="hidden sm:inline">Copiar link</span>
            </button>
            <a href={`https://wa.me/${isCommercial && vendedor?.whatsapp ? vendedor.whatsapp.replace(/\D/g, '') : WA_COMERCIAL}?text=${waText}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors shadow-sm">
              <i className="ri-whatsapp-line" style={{ fontSize: 13 }} />
              <span className="hidden sm:inline">{isCommercial && vendedor ? `Falar com ${vendedor.firstName}` : 'Falar com especialista'}</span>
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero strip ── */}
      <div className={`border-b bg-gradient-to-b transition-colors duration-300 ${t.heroBorder} ${t.heroBg}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              {isCommercial && clientName && (
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-3 ${isDark ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                  <i className="ri-user-smile-line" style={{ fontSize: 13 }} />
                  Preparado especialmente para {clientName}
                </div>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                {isCommercial
                  ? `Seleção para ${clientName || 'Você'}`
                  : shareData?.label || (isFavoritesLink ? 'Seleção de Pontos' : filters?.cidade?.length === 1 ? `Mídia OOH em ${filters.cidade[0]}` : 'Seleção de Pontos')}
              </h1>
              <div className={`flex flex-wrap items-center gap-3 text-sm ${t.textSec}`}>
                <span className="inline-flex items-center gap-1.5">
                  <i className={`${isFavoritesLink || isCommercial ? 'ri-heart-3-fill' : 'ri-map-pin-2-fill'} text-brand-orange`} style={{ fontSize: 14 }} />{formatInt(pontos.length)} {isFavoritesLink || isCommercial ? 'pontos selecionados' : 'pontos'}
                </span>
                <span className={t.separator}>|</span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="ri-tv-2-line text-brand-orange" style={{ fontSize: 14 }} />{formatInt(stats.totalPontos)} pontos de impacto
                </span>
                <span className={t.separator}>|</span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="ri-group-line text-brand-orange" style={{ fontSize: 14 }} />{formatInt(stats.totalFluxo)} fluxo/mês
                </span>
              </div>
              {isCommercial && !submitted && (
                <p className={`text-xs mt-3 ${t.textMuted}`}>
                  <i className="ri-information-line mr-1" style={{ fontSize: 12 }} />
                  Clique no <i className="ri-heart-3-line text-brand-orange" style={{ fontSize: 11 }} /> dos pontos que mais gostou e envie sua seleção
                </p>
              )}
              {/* Vendedor signature */}
              {isCommercial && vendedor && (
                <div className={`mt-4 inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-[#EFE0D8] bg-white/60'}`}>
                  {vendedor.photoUrl ? (
                    <img src={vendedor.photoUrl} alt={vendedor.name} className="w-9 h-9 rounded-full object-cover border-2 border-brand-orange/30" />
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${isDark ? 'bg-brand-orange/20 text-brand-orange' : 'bg-[#FFF0EA] text-[#C94A1A]'}`}>
                      {(vendedor.firstName || 'C')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className={`text-xs font-semibold ${t.text}`}>{vendedor.name}</div>
                    <div className={`text-[10px] ${t.textMuted}`}>Seu consultor Intermidia</div>
                  </div>
                  {vendedor.whatsapp && (
                    <a
                      href={`https://wa.me/${vendedor.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${vendedor.firstName}! Vi a seleção de pontos que você preparou para mim.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors"
                    >
                      <i className="ri-whatsapp-line" style={{ fontSize: 12 }} />Falar
                    </a>
                  )}
                </div>
              )}
              {filters && !isFavoritesLink && !isCommercial && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[...(filters.cidade || []).map((c) => ({ icon: 'ri-map-pin-line', label: c })),
                    ...(filters.tipo || []).map((tp) => ({ icon: 'ri-layers-line', label: tp })),
                    ...(filters.publico || []).map((p) => ({ icon: 'ri-group-line', label: p })),
                    ...(filters.elevador || []).map((e) => ({ icon: e === 'Comercial' ? 'ri-building-2-line' : 'ri-home-4-line', label: `Elevador ${e}` })),
                    ...(filters.q ? [{ icon: 'ri-search-line', label: `"${filters.q}"` }] : []),
                  ].map((c, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${t.filterChip}`}>
                      <i className={c.icon} style={{ fontSize: 10 }} />{c.label}
                    </span>
                  ))}
                </div>
              )}
              {(isFavoritesLink && !isCommercial) && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${t.filterChip}`}>
                    <i className="ri-heart-3-fill" style={{ fontSize: 10 }} />{formatInt(pontos.length)} pontos favoritos
                  </span>
                </div>
              )}
            </div>
            {/* View toggle */}
            <div className={`flex items-center gap-1 shrink-0 border rounded-lg p-0.5 ${t.toggleBg}`}>
              <button onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'grid' ? 'bg-brand-orange text-white shadow-sm' : t.toggleOff}`}>
                <i className="ri-grid-fill mr-1" style={{ fontSize: 12 }} />Grid
              </button>
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-brand-orange text-white shadow-sm' : t.toggleOff}`}>
                <i className="ri-list-check mr-1" style={{ fontSize: 12 }} />Lista
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pricing strip (with discount) ── */}
      {stats.hasDiscount && (
        <div className={`border-b transition-colors duration-300 ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-[#F2DDD4] bg-[#FFF0EA]/50'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm">
              <div className="text-center">
                <div className={`text-[10px] uppercase tracking-wider ${t.textMuted}`}>Valor original</div>
                <div className={`font-semibold line-through ${t.textSec}`}>{formatMoney(stats.totalPreco)}</div>
              </div>
              <div className="text-center">
                <div className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-green-400' : 'text-green-600'}`}>Desconto {filters?.discount?.mode === 'percent' ? `${filters.discount.value}%` : ''}</div>
                <div className={`font-semibold ${isDark ? 'text-green-400' : 'text-green-600'}`}>-{formatMoney(stats.discountAmount)}</div>
              </div>
              <div className="text-center">
                <div className={`text-[10px] uppercase tracking-wider text-brand-orange`}>Investimento mensal</div>
                <div className="text-xl font-bold text-brand-orange">{formatMoney(stats.finalPreco)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Points ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {pontos.length === 0 ? (
          <div className={`text-center py-16 ${t.emptyText}`}>
            <i className="ri-search-eye-line block mb-3" style={{ fontSize: 40 }} />
            <p>Nenhum ponto corresponde a esta seleção.</p>
          </div>
        ) : pontosPorTipo.map((grupo) => (
          <section key={grupo.tipo} className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{grupo.tipo}</h2>
              <span className={`text-xs uppercase tracking-wide ${t.textMuted}`}>{formatInt(grupo.count)} pontos</span>
            </div>

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grupo.pontos.map((ponto, i) => (
                  <motion.article key={ponto.id}
                    initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.35 }}
                    className={`rounded-2xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 group ${t.card}`}>
                    <div className="relative">
                      <CardGallery ponto={ponto} onExpand={(p, idx) => setLightbox({ ponto: p, imageIndex: idx })} />
                      {isCommercial && !submitted && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleClientFav(ponto); }}
                          className={`absolute top-2 right-2 z-10 p-2 rounded-full backdrop-blur-sm transition-all ${
                            clientFavs.has(ponto.id)
                              ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30 scale-110'
                              : 'bg-black/40 text-white/60 hover:text-white hover:bg-black/60'
                          }`}
                          title={clientFavs.has(ponto.id) ? 'Remover dos favoritos' : 'Marcar como favorito'}
                        >
                          <i className={clientFavs.has(ponto.id) ? 'ri-heart-3-fill' : 'ri-heart-3-line'} style={{ fontSize: 14 }} />
                        </button>
                      )}
                      {isCommercial && submitted && clientFavs.has(ponto.id) && (
                        <div className="absolute top-2 right-2 z-10 p-2 rounded-full bg-brand-orange text-white">
                          <i className="ri-heart-3-fill" style={{ fontSize: 14 }} />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-1 mb-2">
                        <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border font-semibold bg-brand-orange/10 border-brand-orange/25 text-brand-orange">{ponto.tipo}</span>
                        {ponto.cidade && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.cidade}</span>}
                      </div>
                      <h3 className="font-semibold text-sm leading-tight mb-1.5 line-clamp-2">{ponto.nome}</h3>
                      {ponto.endereco && (
                        <p className={`text-xs mb-3 flex items-start gap-1 line-clamp-1 ${t.textMuted}`}>
                          <i className="ri-map-pin-line text-brand-orange shrink-0 mt-0.5" style={{ fontSize: 11 }} />{ponto.endereco}
                        </p>
                      )}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[['Impactos', ponto.telas], ['Fluxo', ponto.fluxo], ['Inserções', ponto.insercoes]].map(([label, val]) => (
                          <div key={label} className="text-center">
                            <div className={`text-[10px] uppercase ${t.statsLabel}`}>{label}</div>
                            <div className={`text-sm font-bold ${t.statsVal}`}>{formatInt(val || 0)}</div>
                          </div>
                        ))}
                      </div>
                      <div className={`pt-3 border-t flex items-center justify-between ${t.priceBorder}`}>
                        <span className="text-brand-orange font-bold text-lg">{formatMoney(ponto.preco)}</span>
                        <span className={`text-[10px] uppercase ${t.statsLabel}`}>/ mês</span>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {grupo.pontos.map((ponto, i) => (
                  <motion.article key={ponto.id}
                    initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.03, 0.25), duration: 0.3 }}
                    className={`rounded-xl border p-4 transition-all duration-200 ${t.card}`}>
                    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-4 items-center">
                      <div className="rounded-lg overflow-hidden">
                        <CardGallery ponto={ponto} onExpand={(p, idx) => setLightbox({ ponto: p, imageIndex: idx })} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border font-semibold bg-brand-orange/10 border-brand-orange/25 text-brand-orange">{ponto.tipo}</span>
                          {ponto.cidade && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.cidade}</span>}
                          {ponto.publico && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border ${t.chipTag}`}>{ponto.publico}</span>}
                        </div>
                        <h3 className="font-semibold leading-tight mb-1">{ponto.nome}</h3>
                        {ponto.endereco && (
                          <p className={`text-xs flex items-start gap-1 mb-2 ${t.textMuted}`}>
                            <i className="ri-map-pin-line text-brand-orange shrink-0 mt-0.5" style={{ fontSize: 11 }} />{ponto.endereco}
                          </p>
                        )}
                        <div className={`flex flex-wrap gap-4 text-xs ${t.listMeta}`}>
                          <span><i className="ri-tv-2-line text-brand-orange mr-1" style={{ fontSize: 11 }} />{formatInt(ponto.telas || 0)} impactos</span>
                          <span><i className="ri-group-line text-brand-orange mr-1" style={{ fontSize: 11 }} />{formatInt(ponto.fluxo || 0)} fluxo</span>
                          <span><i className="ri-hashtag text-brand-orange mr-1" style={{ fontSize: 11 }} />{formatInt(ponto.insercoes || 0)} inserç.</span>
                          <span><i className="ri-time-line text-brand-orange mr-1" style={{ fontSize: 11 }} />{normalizeHorarioForPdf(ponto.horario, 'N/I')}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-brand-orange font-bold text-xl">{formatMoney(ponto.preco)}</div>
                          <div className={`text-[10px] uppercase ${t.statsLabel}`}>/ mês</div>
                        </div>
                        {isCommercial && !submitted && (
                          <button
                            onClick={() => toggleClientFav(ponto)}
                            className={`p-2 rounded-full transition-all ${
                              clientFavs.has(ponto.id)
                                ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/30'
                                : isDark ? 'bg-white/10 text-brand-gray-400 hover:text-white hover:bg-white/20' : 'bg-neutral-100 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200'
                            }`}
                            title={clientFavs.has(ponto.id) ? 'Remover dos favoritos' : 'Marcar como favorito'}
                          >
                            <i className={clientFavs.has(ponto.id) ? 'ri-heart-3-fill' : 'ri-heart-3-line'} style={{ fontSize: 16 }} />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            )}
          </section>
        ))}
      </main>

      {/* ── Commercial floating submit bar ── */}
      {isCommercial && !submitted && (
        <div className={`fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-xl transition-all ${isDark ? 'bg-[#050505]/95 border-white/10' : 'bg-white/95 border-[#EFE0D8]'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className={`text-sm ${t.textSec}`}>
              {clientFavs.size > 0 ? (
                <span className="flex items-center gap-2">
                  <i className="ri-heart-3-fill text-brand-orange" style={{ fontSize: 16 }} />
                  <span><strong className={t.text}>{clientFavs.size}</strong> ponto{clientFavs.size > 1 ? 's' : ''} selecionado{clientFavs.size > 1 ? 's' : ''}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <i className="ri-heart-3-line" style={{ fontSize: 16 }} />
                  Selecione os pontos que mais gostou
                </span>
              )}
            </div>
            <button
              onClick={handleSubmitFavorites}
              disabled={submitting || !clientFavs.size}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                clientFavs.size
                  ? 'bg-brand-orange text-white hover:bg-[#E85A25] shadow-lg shadow-brand-orange/20'
                  : isDark ? 'bg-white/10 text-brand-gray-500 cursor-not-allowed' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
              ) : (
                <><i className="ri-send-plane-fill" style={{ fontSize: 14 }} /> Enviar meus favoritos</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Commercial submitted state ── */}
      {isCommercial && submitted && (
        <div className={`border-t bg-gradient-to-t transition-colors duration-300 ${t.footerBg}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-center">
            <div className={`w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center ${isDark ? 'bg-green-500/20' : 'bg-green-50'}`}>
              <i className="ri-check-double-line text-green-400" style={{ fontSize: 28 }} />
            </div>
            <h3 className="text-lg font-bold mb-2">Obrigado, {clientName}!</h3>
            <p className={`text-sm mb-5 ${t.footerText}`}>
              Sua seleção de {clientFavs.size} ponto{clientFavs.size > 1 ? 's' : ''} favorito{clientFavs.size > 1 ? 's' : ''} foi enviada com sucesso.
              {vendedor ? ` ${vendedor.firstName} já foi notificado e entrará em contato em breve!` : ' Nossa equipe entrará em contato em breve!'}
            </p>
            {vendedor?.whatsapp ? (
              <a href={`https://wa.me/${vendedor.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${vendedor.firstName}! Sou ${clientName}, acabei de selecionar meus pontos favoritos na seleção que você preparou. Gostaria de conversar sobre a campanha!`)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors shadow-lg shadow-[#25D366]/20">
                <i className="ri-whatsapp-line" style={{ fontSize: 16 }} />Falar com {vendedor.firstName}
              </a>
            ) : (
              <a href={`https://wa.me/${WA_COMERCIAL}?text=${encodeURIComponent(`Olá! Sou ${clientName} e acabei de enviar meus pontos favoritos na seleção que recebi. Gostaria de conversar sobre a campanha!`)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors shadow-lg shadow-[#25D366]/20">
                <i className="ri-whatsapp-line" style={{ fontSize: 16 }} />Falar pelo WhatsApp
              </a>
            )}
            <div className={`mt-8 pt-6 border-t text-[11px] ${isDark ? 'border-white/5' : 'border-[#F2DDD4]'} ${t.footerMuted}`}>
              Intermidia Digital OOH | Mídia Kit Digital
            </div>
          </div>
        </div>
      )}

      {/* ── Footer CTA (non-commercial) ── */}
      {!isCommercial && (
        <div className={`border-t bg-gradient-to-t transition-colors duration-300 ${t.footerBg}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-center">
            <h3 className="text-lg font-bold mb-2">Interessado nesta seleção?</h3>
            <p className={`text-sm mb-5 ${t.footerText}`}>Fale com um especialista para montar sua campanha personalizada.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a href={`https://wa.me/${WA_COMERCIAL}?text=${waText}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors shadow-lg shadow-[#25D366]/20">
                <i className="ri-whatsapp-line" style={{ fontSize: 16 }} />Falar pelo WhatsApp
              </a>
              <button onClick={() => navigate('/')}
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold border transition-colors ${t.btnSecondary}`}>
                <i className="ri-compass-3-line" style={{ fontSize: 16 }} />Ver catálogo completo
              </button>
            </div>
            <div className={`mt-8 pt-6 border-t text-[11px] ${isDark ? 'border-white/5' : 'border-[#F2DDD4]'} ${t.footerMuted}`}>
              Intermidia Digital OOH | Mídia Kit Digital
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightbox.ponto && (
          <Lightbox ponto={lightbox.ponto} imageIndex={lightbox.imageIndex}
            onClose={() => setLightbox({ ponto: null, imageIndex: 0 })}
            onChangeIndex={(i) => setLightbox((s) => ({ ...s, imageIndex: i }))} />
        )}
      </AnimatePresence>

      {/* ── Toasts ── */}
      <AnimatePresence>
        {copyToast && (
          <motion.div key="copy-toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] rounded-xl border border-green-500/40 bg-green-600/90 backdrop-blur-sm px-5 py-3 text-sm font-semibold text-white shadow-xl flex items-center gap-2">
            <i className="ri-checkbox-circle-fill" style={{ fontSize: 16 }} />Link copiado!
          </motion.div>
        )}
        {submitToast && (
          <motion.div key="submit-toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] rounded-xl border border-green-500/40 bg-green-600/90 backdrop-blur-sm px-5 py-3 text-sm font-semibold text-white shadow-xl flex items-center gap-2">
            <i className="ri-heart-3-fill text-brand-orange" style={{ fontSize: 16 }} />Seus favoritos foram enviados!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom padding when commercial submit bar is showing */}
      {isCommercial && !submitted && <div className="h-16" />}
    </div>
  );
}
