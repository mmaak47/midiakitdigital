import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Circle, useMap } from 'react-leaflet';
import { fetchPropostaPublica, aprovarPropostaPublica, fetchCensusProfiles } from '../lib/api';
import { buildAudienceQualification, getSegmentDisplayName } from '../lib/strategy';
import { normalizeHorarioForPdf } from '../lib/horarioUtils';
import { computeCityBoundingBoxes } from '../lib/geo';
import { getPrimaryPointScreenImage } from '../lib/pointImages';
import { trackEvent } from '../lib/tracking';
import 'leaflet/dist/leaflet.css';

const SmartMap = lazy(() => import('../components/SmartMap'));

const ORANGE = '#E8591A';

// ── Formatters ───────────────────────────────────────────────────────────────
function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function formatCoord(v) {
  return Number(v || 0).toFixed(6);
}

function normalizeSellerSignature(signature = {}) {
  const source = signature && typeof signature === 'object' ? signature : {};
  const photoRaw = source.photoUrl || source.photo_url || source.photo || source.avatar || source.image || source.foto || '';
  return {
    name: String(source.name || source.nome || '').trim(),
    email: String(source.email || source.mail || '').trim(),
    phone: String(source.phone || source.telefone || source.whatsapp || '').trim(),
    photoUrl: normalizeSellerPhotoUrl(photoRaw)
  };
}

function normalizeSellerPhotoUrl(value) {
  const source = String(value || '').trim();
  if (!source || source.startsWith('blob:')) return '';
  if (/^(https?:)?\/\//i.test(source) || source.startsWith('data:image/')) return source;
  if (source.startsWith('/')) return source;
  return `/${source.replace(/^\/+/, '')}`;
}

function normalizeProposalOptions(options = []) {
  const source = Array.isArray(options) ? options : [];
  return source
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => {
      const pointsRaw = Number(entry.points ?? entry.quantidade_pontos);
      const pricePerPointRaw = Number(entry.pricePerPoint ?? entry.valor_por_ponto);
      const totalValueRaw = Number(entry.totalValue ?? entry.valor_total);
      const monthsRaw = Number(entry.months ?? entry.duracao_meses);
      return {
        title: String(entry.title || entry.titulo || `Proposta ${index + 1}`).trim() || `Proposta ${index + 1}`,
        points: Number.isFinite(pointsRaw) ? Math.max(0, Math.round(pointsRaw)) : null,
        pricePerPoint: Number.isFinite(pricePerPointRaw) ? Math.max(0, pricePerPointRaw) : null,
        totalValue: Number.isFinite(totalValueRaw) ? Math.max(0, totalValueRaw) : null,
        months: Number.isFinite(monthsRaw) ? Math.max(1, Math.round(monthsRaw)) : null,
        note: String(entry.note || entry.observacao || '').trim()
      };
    })
    .filter((entry) => entry.points || entry.pricePerPoint || entry.totalValue || entry.months || entry.note);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalizePricingSummary(pricingSummary = {}, fallbackFinalTotal = 0) {
  const base = pricingSummary && typeof pricingSummary === 'object' ? pricingSummary : {};
  const fallbackFinal = Number(fallbackFinalTotal) || 0;
  const finalTotalRaw = Number(base.finalTotal);
  const originalTotalRaw = Number(base.originalTotal);
  const discountTotalRaw = Number(base.discountTotal);
  const agencyCommissionPercentRaw = Number(base.agencyCommissionPercent);
  const agencyCommissionAmountRaw = Number(base.agencyCommissionAmount);
  const finalTotalWithCommissionRaw = Number(base.finalTotalWithCommission);

  const finalTotal = Number.isFinite(finalTotalRaw) ? Math.max(0, finalTotalRaw) : Math.max(0, fallbackFinal);
  const originalTotal = Number.isFinite(originalTotalRaw) ? Math.max(0, originalTotalRaw) : finalTotal;
  const discountTotal = Number.isFinite(discountTotalRaw) ? Math.max(0, discountTotalRaw) : Math.max(0, originalTotal - finalTotal);
  const hasDiscount = Boolean(base.hasDiscount) || discountTotal > 0.0001;
  const agencyCommissionPercent = Number.isFinite(agencyCommissionPercentRaw)
    ? Math.min(100, Math.max(0, agencyCommissionPercentRaw))
    : 0;
  const hasAgencyCommissionFlag = Boolean(base.agencyCommissionEnabled || base.hasAgencyCommission);
  const agencyCommissionAmount = Number.isFinite(agencyCommissionAmountRaw)
    ? Math.max(0, agencyCommissionAmountRaw)
    : (hasAgencyCommissionFlag && agencyCommissionPercent > 0 ? finalTotal * (agencyCommissionPercent / 100) : 0);
  const hasAgencyCommission = hasAgencyCommissionFlag || agencyCommissionAmount > 0.0001;
  const finalTotalWithCommission = Number.isFinite(finalTotalWithCommissionRaw)
    ? Math.max(0, finalTotalWithCommissionRaw)
    : finalTotal + agencyCommissionAmount;

  return {
    ...base,
    finalTotal,
    originalTotal,
    discountTotal,
    hasDiscount,
    agencyCommissionPercent,
    agencyCommissionAmount,
    hasAgencyCommission,
    finalTotalWithCommission
  };
}

function getPointImage(point) {
  // Never serve blob: URLs — they only exist in the creator's browser session
  const candidates = [
    point?.proposalSimulationPreview,
    point?.simulacao_preview,
    getPrimaryPointScreenImage(point),
    point?.imagem,
    point?.imagem2,
  ];
  return candidates.find(url => url && !String(url).startsWith('blob:')) || '';
}

function getPointType(point) {
  const tipo = point?.tipo || point?.type || '';
  if (!tipo) return '';
  return tipo;
}

function getPointTypeShort(point) {
  const tipo = getPointType(point);
  if (!tipo) return '';
  const parts = tipo.split(' - ');
  return parts[0].trim();
}

function normalizeTypeForRules(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isStaticPrintPoint(point) {
  const normalized = normalizeTypeForRules(getPointType(point));
  return normalized.includes('frontlight') || normalized.includes('backlight');
}

// ── PointMiniMap (react-leaflet) ─────────────────────────────────────────────
function PointMiniMap({ lat, lng }) {
  const validLat = Number.isFinite(Number(lat)) ? Number(lat) : null;
  const validLng = Number.isFinite(Number(lng)) ? Number(lng) : null;
  if (!validLat || !validLng) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 180 }}>
      <MapContainer
        center={[validLat, validLng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={true}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
        />
        <Circle
          center={[validLat, validLng]}
          radius={800}
          pathOptions={{ color: ORANGE, fillColor: ORANGE, fillOpacity: 0.10, weight: 1 }}
        />
        <CircleMarker
          center={[validLat, validLng]}
          radius={7}
          pathOptions={{ color: '#fff', fillColor: ORANGE, fillOpacity: 1, weight: 2.5 }}
        />
      </MapContainer>
    </div>
  );
}

// ── SVG icons for detail rows ────────────────────────────────────────────────
const IconLocation = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
);
const IconCoord = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
);

// ── Point Card (mídia kit style — split layout) ─────────────────────────────
function PointCard({ point, index, total }) {
  const img = getPointImage(point);
  const audience = buildAudienceQualification(point);
  const tipo = getPointType(point);
  const tipoShort = getPointTypeShort(point);
  const hasCoords = point.lat && point.lng;
  const entornoCount = Number(point?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
  const insertionMetric = isStaticPrintPoint(point)
    ? { label: 'Exibição', value: 'Contínua' }
    : (point.insercoes > 0 ? { label: 'Inserções', value: formatNumber(point.insercoes) } : null);

  const metrics = [
    point.publico && { label: 'Público', value: point.publico },
    point.fluxo > 0 && { label: 'Pessoas / mês', value: formatNumber(point.fluxo) },
    point.telas > 0 && { label: 'Telas', value: String(point.telas) },
    insertionMetric,
    point.tempo && { label: 'Tempo', value: point.tempo },
    point.loop && { label: 'Loop', value: typeof point.loop === 'number' ? `Mín. ${point.loop} min` : point.loop },
  ].filter(Boolean);

  return (
    <div className="rounded-[28px] border border-gray-200/80 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="grid md:grid-cols-[1fr_42%]" style={{ minHeight: img ? 420 : 'auto' }}>
        {/* ── Left: Info panel ─────────────────────────────── */}
        <div className="relative flex flex-col p-6 sm:p-8">
          {/* Orange accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 md:right-auto md:bottom-0 md:h-auto md:w-1.5" style={{ background: ORANGE }} />

          {/* Logo + counter */}
          <div className="flex items-start justify-between mb-4 md:pl-3">
            <img src="/logo-light.png" alt="Intermídia" className="h-6 opacity-60" />
            <span className="inline-flex items-center h-6 px-3 rounded-full text-[11px] font-bold" style={{ background: 'rgba(232,89,26,0.08)', border: '1px solid rgba(232,89,26,0.2)', color: ORANGE }}>
              {index + 1}/{total}
            </span>
          </div>

          {/* Type badge */}
          {tipo && (
            <div className="mb-2 md:pl-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center h-7 px-3 rounded-lg text-[11px] font-bold text-white uppercase tracking-wide" style={{ background: ORANGE }}>
                {tipo}
              </span>
              {(tipo === 'Frontlight' || tipo === 'Backlight') && (
                <span className={`inline-flex items-center h-7 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wide ${
                  point.disponibilidade === 'indisponivel'
                    ? 'bg-red-50 text-red-500 border border-red-200'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                }`}>
                  {point.disponibilidade === 'indisponivel' ? 'Indisponível' : 'Disponível'}
                </span>
              )}
            </div>
          )}

          {/* Point name */}
          <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight leading-tight mb-3 md:pl-3">
            {point.nome}
          </h3>

          {/* Address row */}
          {(point.cidade || point.endereco) && (
            <div className="flex items-center gap-2.5 mb-1.5 md:pl-3">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FFF7ED', border: '1px solid rgba(232,89,26,0.2)', color: ORANGE }}>
                <IconLocation />
              </span>
              <p className="text-sm text-gray-600">{[point.cidade, point.endereco].filter(Boolean).join(' · ')}</p>
            </div>
          )}

          {/* Coordinates row */}
          {hasCoords && (
            <div className="flex items-center gap-2.5 mb-4 md:pl-3">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FFF7ED', border: '1px solid rgba(232,89,26,0.2)', color: ORANGE }}>
                <IconCoord />
              </span>
              <p className="text-sm text-gray-500 font-mono">{formatCoord(point.lat)}, {formatCoord(point.lng)}</p>
            </div>
          )}

          {/* Metrics grid */}
          {metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4 md:pl-3">
              {metrics.map(m => (
                <div key={m.label} className="rounded-lg p-2.5" style={{ background: '#F7F6F3', border: '1px solid #E8E8E8' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">{m.label}</p>
                  <p className="text-base font-bold text-gray-900">{m.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Audience card */}
          {audience.badge && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5 mb-4 md:ml-3">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="inline-flex items-center h-5 px-2 rounded text-[10px] font-bold uppercase" style={{ background: 'rgba(232,89,26,0.1)', border: '1px solid rgba(232,89,26,0.2)', color: ORANGE }}>{audience.badge}</span>
                {entornoCount > 0 && (
                  <span className="text-[10px] text-gray-400 font-medium">{formatNumber(entornoCount)} locais no entorno</span>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-800">{audience.headline}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{audience.summary}</p>
            </div>
          )}

          {/* Bottom bar: veiculacao + horario + valor */}
          <div className="mt-auto pt-3 border-t border-gray-200 md:ml-3">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="flex gap-6">
                {point.veiculacao && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Veiculação</p>
                    <p className="text-sm font-semibold text-gray-700">{point.veiculacao}</p>
                  </div>
                )}
                {point.horario && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Horário</p>
                    <p className="text-sm font-semibold text-gray-700">{normalizeHorarioForPdf(point.horario)}</p>
                  </div>
                )}
              </div>
              {(point.precoFinal || point.preco) > 0 && (
                <div className="text-right pl-3 border-l border-gray-200">
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ORANGE }}>Valor Mensal</p>
                  <p className="text-2xl font-extrabold" style={{ color: ORANGE }}>{formatCurrency(point.precoFinal || point.preco)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Image + mini map ─────────────────────── */}
        <div className="flex flex-col">
          {img && (
            <div className="relative flex-1 min-h-[280px] bg-gray-900 overflow-hidden">
              <img
                src={img}
                alt=""
                className="absolute inset-0 w-full h-full object-cover blur-[22px] saturate-[1.1] scale-[1.06] opacity-40"
                style={{ objectPosition: point.foto_focal_point || 'center center' }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/35" />
              <img
                src={img}
                alt={point.nome}
                className="absolute inset-0 w-full h-full object-contain drop-shadow-lg"
                style={{ objectPosition: point.foto_focal_point || 'center center' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            </div>
          )}
          {hasCoords && (
            <div className="p-3">
              <PointMiniMap lat={point.lat} lng={point.lng} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Compact Point Card (used when proposal has >= 30 points — grid layout) ──
function CompactPointCard({ point, index, total }) {
  const img = getPointImage(point);
  const audience = buildAudienceQualification(point);
  const tipo = getPointTypeShort(point);
  const insertionMetric = isStaticPrintPoint(point)
    ? { label: 'Exibição', value: 'Contínua' }
    : (point.insercoes > 0 ? { label: 'Inserções', value: formatNumber(point.insercoes) } : null);
  const value = point.precoFinal || point.preco || 0;

  const stats = [
    point.fluxo > 0 && { label: 'Pessoas/mês', value: formatNumber(point.fluxo) },
    point.telas > 0 && { label: 'Telas', value: String(point.telas) },
    insertionMetric,
    audience.badge && { label: 'Público', value: audience.badge },
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.05)] overflow-hidden grid grid-cols-[1fr_140px]" style={{ borderLeft: `4px solid ${ORANGE}`, minHeight: 200 }}>
      {/* Left: content */}
      <div className="p-4 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          {tipo && (
            <span className="inline-flex items-center h-5 px-2 rounded text-[10px] font-bold uppercase tracking-wide text-white truncate max-w-[60%]" style={{ background: ORANGE }}>
              {tipo}
            </span>
          )}
          <span className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full" style={{ background: 'rgba(232,89,26,0.10)', border: '1px solid rgba(232,89,26,0.22)', color: ORANGE }}>
            {index + 1}/{total}
          </span>
        </div>
        <h3 className="text-sm font-extrabold text-gray-900 leading-tight tracking-tight line-clamp-2 break-words">{point.nome}</h3>
        <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 break-words">
          {[point.cidade, point.endereco].filter(Boolean).join(' · ') || '—'}
        </p>
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-1 mt-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded px-2 py-1" style={{ background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)' }}>
                <p className="text-[8px] font-bold uppercase tracking-wide text-gray-400 truncate">{s.label}</p>
                <p className="text-[12px] font-bold text-gray-900 truncate">{s.value}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: ORANGE }}>Valor mensal</p>
          {value > 0 && (
            <p className="text-lg font-extrabold leading-none" style={{ color: ORANGE }}>{formatCurrency(value)}</p>
          )}
        </div>
      </div>
      {/* Right: image */}
      <div className="relative bg-gray-100 overflow-hidden">
        {img ? (
          <>
            <img src={img} alt={point.nome} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: point.foto_focal_point || 'center 38%' }} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/25" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wider text-gray-400">sem foto</div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function PropostaPublica() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [approving, setApproving] = useState(false);
  const [approveModal, setApproveModal] = useState(false);
  const [approveName, setApproveName] = useState('');
  const [approved, setApproved] = useState(false);
  const [censusProfiles, setCensusProfiles] = useState(null);

  useEffect(() => {
    if (!token) return;
    trackEvent('proposal_view', { token });
    fetchPropostaPublica(token)
      .then(data => {
        setState({ loading: false, error: null, data });
        if (data.approved_at) setApproved(true);
      })
      .catch(err => setState({ loading: false, error: err.message, data: null }));
  }, [token]);

  // Fetch census profiles for SmartMap overlay
  useEffect(() => {
    fetchCensusProfiles()
      .then(result => {
        const map = {};
        for (const p of (result.profiles || [])) {
          if (p?.ponto_id) map[p.ponto_id] = p;
        }
        setCensusProfiles(map);
      })
      .catch(() => {}); // silent — census overlay is optional
  }, []);

  const handleAprovar = useCallback(async () => {
    const nome = approveName.trim();
    if (!nome) return;
    setApproving(true);
    try {
      await aprovarPropostaPublica(token, nome);
      setApproved(true);
      setApproveModal(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setApproving(false);
    }
  }, [token, approveName]);

  const { loading, error, data } = state;
  const points = data?.points || [];
  const totals = data?.totals || {};
  const pricingSummary = useMemo(
    () => normalizePricingSummary(data?.pricingSummary, totals.valorTotal || 0),
    [data?.pricingSummary, totals.valorTotal]
  );
  const useCompactGrid = points.length >= 30;
  const validPoints = useMemo(() => points.filter(p => p.lat && p.lng), [points]);
  const hasDigitalInsertionPoints = useMemo(
    () => points.some((point) => !isStaticPrintPoint(point)),
    [points]
  );
  const digitalInsercoesTotal = useMemo(
    () => points.reduce((sum, point) => {
      if (isStaticPrintPoint(point)) return sum;
      const numeric = Number(point?.insercoes);
      return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0),
    [points]
  );
  const segmentLabel = data?.segmento ? getSegmentDisplayName(data.segmento) : data?.segmento || '';
  const cityLabel = useMemo(() => {
    const cities = [...new Set(points.map(p => p.cidade).filter(Boolean))];
    return cities.join(', ') || '';
  }, [points]);

  const cityBounds = useMemo(() => computeCityBoundingBoxes(validPoints), [validPoints]);
  const proposalOptions = useMemo(() => normalizeProposalOptions(data?.proposalOptions), [data?.proposalOptions]);
  const sellerSignature = useMemo(() => normalizeSellerSignature(data?.sellerSignature), [data?.sellerSignature]);
  const hasSellerSignatureInfo = Boolean(sellerSignature.name || sellerSignature.email || sellerSignature.phone);
  const sellerInitials = useMemo(() => {
    const parts = String(sellerSignature.name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'VC';
    const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
    return initials || 'VC';
  }, [sellerSignature.name]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Carregando proposta...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-6">
        <div className="text-center max-w-sm">
          <img src="/logo-light.png" alt="Logo" className="h-10 mx-auto mb-6 opacity-60" />
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Link indisponível</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const finalTotal = pricingSummary.finalTotalWithCommission || pricingSummary.finalTotal || totals.valorTotal || 0;
  const summaryCards = [
    { label: 'Investimento', value: formatCurrency(finalTotal) },
    { label: 'Impactos/mês', value: formatNumber(totals.fluxoTotal) },
    { label: 'CPM estimado', value: totals.cpmEstimado ? formatCurrency(totals.cpmEstimado) : '—' },
    ...(hasDigitalInsertionPoints
      ? [{ label: 'Inserções/mês', value: digitalInsercoesTotal ? formatNumber(digitalInsercoesTotal) : '—' }]
      : [{ label: 'Veiculação', value: 'Contínua' }]),
    { label: 'Endereços', value: String(points.length) },
  ].filter(c => c.value && c.value !== '—' && c.value !== '0');

  return (
    <div className="min-h-screen bg-[#ECEFF3] relative" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
      {/* Decorative orange gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-[520px] overflow-hidden"
        style={{
          background: 'radial-gradient(ellipse at 20% 0%, rgba(254,92,43,0.10) 0%, rgba(254,92,43,0.04) 35%, transparent 70%), radial-gradient(ellipse at 85% 15%, rgba(232,89,26,0.08) 0%, transparent 55%)',
        }}
      />
      {/* Accent line */}
      <div aria-hidden className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent 0%, ${ORANGE} 30%, #FE5C2B 50%, ${ORANGE} 70%, transparent 100%)` }} />

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-gray-100 px-5 py-3 flex items-center justify-between shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-3">
          <img src="/logo-light.png" alt="Intermídia" className="h-7 object-contain" />
          <span
            className="hidden sm:inline-flex items-center gap-1.5 h-6 px-3 rounded-full text-[10px] font-bold uppercase tracking-widest text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, #FE5C2B 0%, ${ORANGE} 100%)`, boxShadow: `0 4px 10px -2px rgba(232,89,26,0.35)` }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
            Proposta Comercial
          </span>
        </div>
        {approved && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Aprovada
          </span>
        )}
      </header>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Approved banner */}
        {approved && data?.approved_name && (
          <div className="rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 px-5 py-4 shadow-sm">
            <p className="text-green-800 font-semibold text-sm">✓ Proposta aprovada por {data.approved_name}</p>
            <p className="text-green-600 text-xs mt-0.5">{formatDate(data.approved_at)}</p>
          </div>
        )}

        {/* Hero */}
        <div className="text-center pt-4 pb-2 relative">
          {data?.clientName && data.clientName !== 'Cliente não informado' && (
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] mb-3 inline-flex items-center gap-2" style={{ color: ORANGE }}>
              <span className="w-6 h-[1px]" style={{ background: ORANGE }} />
              Preparado para
              <span className="w-6 h-[1px]" style={{ background: ORANGE }} />
            </p>
          )}
          <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-[1.05]">
            {data?.clientName || 'Proposta de Mídia'}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            {cityLabel && (
              <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-white border border-gray-200 text-gray-700 text-xs font-semibold shadow-sm">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {cityLabel}
              </span>
            )}
            {segmentLabel && (
              <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-bold text-white shadow-sm" style={{ background: `linear-gradient(135deg, #FE5C2B 0%, ${ORANGE} 100%)` }}>{segmentLabel}</span>
            )}
            <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-white border border-gray-200 text-gray-700 text-xs font-semibold shadow-sm">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              {points.length} endereço{points.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Strategic text */}
        {(data?.strategicTopics || data?.strategicText?.length > 0) && (
          <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)] p-5 sm:p-6 relative overflow-hidden">
            <div aria-hidden className="absolute top-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(90deg, ${ORANGE} 0%, #FE5C2B 100%)` }} />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3 inline-flex items-center gap-2" style={{ color: ORANGE }}>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ background: 'rgba(232,89,26,0.12)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              </span>
              Direcionamento Estratégico
            </h2>
            {data?.strategicTopics && (
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{data.strategicTopics}</p>
            )}
            {data?.strategicText?.length > 0 && (
              <ul className="mt-3 space-y-2">
                {data.strategicText.map((t, i) => (
                  <li key={i} className="flex gap-3 items-start text-sm text-gray-700 leading-relaxed">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0 shadow-sm" style={{ background: ORANGE }} />
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {summaryCards.map(({ label, value }) => (
            <div
              key={label}
              className="group relative rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_0_rgba(0,0,0,0.02),0_6px_20px_-12px_rgba(0,0,0,0.12)] p-4 text-center transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(0,0,0,0.02),0_14px_30px_-14px_rgba(232,89,26,0.25)] overflow-hidden"
            >
              <div aria-hidden className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, #FE5C2B 0%, ${ORANGE} 100%)` }} />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-1.5 mt-1">{label}</p>
              <p className="text-lg sm:text-xl font-extrabold text-gray-900 leading-tight">{value}</p>
            </div>
          ))}
        </div>

        {hasSellerSignatureInfo && (
          <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-14px_rgba(0,0,0,0.1)] p-5 relative overflow-hidden">
            <div aria-hidden className="absolute top-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(90deg, ${ORANGE} 0%, #FE5C2B 100%)` }} />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              Assinatura Comercial
            </h2>
            <div className="flex items-start gap-4">
              {sellerSignature.photoUrl ? (
                <img
                  src={sellerSignature.photoUrl}
                  alt={sellerSignature.name ? `Foto de ${sellerSignature.name}` : 'Foto do vendedor'}
                  className="w-16 h-16 rounded-2xl object-cover border border-orange-200 shadow-sm"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl border border-orange-200 bg-orange-50 flex items-center justify-center text-orange-700 font-bold text-sm shadow-sm">
                  {sellerInitials}
                </div>
              )}
              <div className="grid sm:grid-cols-3 gap-3 text-sm text-gray-700 flex-1">
                {sellerSignature.name && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Vendedor</p>
                    <p className="mt-1 font-semibold text-gray-900">{sellerSignature.name}</p>
                  </div>
                )}
                {sellerSignature.email && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">E-mail</p>
                    <p className="mt-1 font-semibold text-gray-900 break-all">{sellerSignature.email}</p>
                  </div>
                )}
                {sellerSignature.phone && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Telefone</p>
                    <p className="mt-1 font-semibold text-gray-900">{sellerSignature.phone}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {proposalOptions.length > 0 && (
          <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)] p-5 sm:p-6 relative overflow-hidden">
            <div aria-hidden className="absolute top-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(90deg, ${ORANGE} 0%, #FE5C2B 100%)` }} />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4 inline-flex items-center gap-2" style={{ color: ORANGE }}>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ background: 'rgba(232,89,26,0.12)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
              </span>
              Condições de Proposta
            </h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {proposalOptions.map((option, index) => (
                <div key={`${option.title}-${index}`} className="rounded-[24px] border-2 border-orange-500/90 bg-orange-50/40 p-4 shadow-[0_8px_24px_-14px_rgba(232,89,26,0.45)]">
                  <h3 className="text-2xl font-extrabold leading-none" style={{ color: ORANGE }}>{option.title || `Proposta ${index + 1}`}</h3>
                  <div className="mt-3 h-px bg-orange-200" />
                  <div className="mt-3 space-y-1.5 text-sm text-gray-700">
                    <p><span className="font-semibold">Pontos:</span> {option.points ? formatNumber(option.points) : '—'}</p>
                    <p><span className="font-semibold">Valor por ponto:</span> {option.pricePerPoint !== null ? option.pricePerPoint.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</p>
                    <p><span className="font-semibold">Valor total:</span> {option.totalValue !== null ? formatCurrency(option.totalValue) : '—'}</p>
                    <p><span className="font-semibold">Duração:</span> {option.months ? `${option.months} ${option.months === 1 ? 'mês' : 'meses'}` : '—'}</p>
                  </div>
                  {option.note && (
                    <div className="mt-3 rounded-xl border border-orange-200 bg-white/90 px-3 py-2 text-xs text-gray-600 leading-relaxed">
                      <span className="font-semibold" style={{ color: ORANGE }}>Observação:</span> {option.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Plano de Investimento & Impacto ────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_30px_-15px_rgba(0,0,0,0.1)] overflow-hidden relative">
          <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${ORANGE} 0%, #FE5C2B 50%, ${ORANGE} 100%)` }} />
          <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-5 rounded-full" style={{ background: `linear-gradient(180deg, #FE5C2B 0%, ${ORANGE} 100%)` }} />
              <h2 className="text-base font-bold text-gray-900">Plano de Investimento & Impacto</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 h-6 px-3 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ORANGE }} />
              Total de {points.length} endereços
            </span>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-0">
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Endereço</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Cidade</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Tipo</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Valor Tabela</th>
                    <th className="text-right px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 whitespace-nowrap">Valor Negociado</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => {
                    const precoOriginal = p.precoOriginal || p.preco || 0;
                    const precoFinal = p.precoFinal || p.preco || 0;
                    const hasDiscount = precoFinal < precoOriginal;
                    return (
                      <tr key={p.id || i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-5 py-2.5 font-semibold text-gray-800 max-w-[200px] truncate">{p.nome}</td>
                        <td className="px-3 py-2.5 text-gray-500">{p.cidade}</td>
                        <td className="px-3 py-2.5 text-gray-500">{getPointTypeShort(p)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600 font-medium">{formatCurrency(precoOriginal)}</td>
                        <td className="px-5 py-2.5 text-right font-bold" style={{ color: hasDiscount ? ORANGE : '#111' }}>{formatCurrency(precoFinal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sidebar */}
            <div className="border-t lg:border-t-0 lg:border-l border-gray-100 p-5 space-y-4">
              {!useCompactGrid && (
              <div className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ background: ORANGE }} />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Estimativas de Impacto</p>
                </div>
                {hasDigitalInsertionPoints ? (
                  digitalInsercoesTotal > 0 && (
                    <div className="mb-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Inserções (mensais)</p>
                      <p className="text-2xl font-extrabold text-gray-900">{formatNumber(digitalInsercoesTotal)}</p>
                    </div>
                  )
                ) : (
                  <div className="mb-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Veiculação</p>
                    <p className="text-2xl font-extrabold text-gray-900">Contínua</p>
                  </div>
                )}
                {totals.fluxoTotal > 0 && (
                  <div className="mb-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Fluxo de Pessoas (mensal)</p>
                    <p className="text-2xl font-extrabold text-gray-900">{formatNumber(totals.fluxoTotal)}</p>
                  </div>
                )}
                {totals.cpmEstimado > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">CPM Estimado</p>
                    <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(totals.cpmEstimado)}</p>
                  </div>
                )}
              </div>
              )}

              <div className="rounded-xl p-4 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, rgba(254,92,43,0.06) 0%, rgba(232,89,26,0.02) 100%)', border: '1px solid rgba(232,89,26,0.18)' }}>
                <div aria-hidden className="absolute -top-8 -right-8 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(circle, rgba(254,92,43,0.12) 0%, transparent 70%)' }} />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded text-[9px] font-bold uppercase tracking-wide text-white shadow-sm" style={{ background: `linear-gradient(135deg, #FE5C2B 0%, ${ORANGE} 100%)` }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z"/></svg>
                      Resumo Financeiro
                    </span>
                  </div>
                  {pricingSummary.hasDiscount && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-gray-500">Valor Original</p>
                        <p className="text-sm text-gray-400 line-through">{formatCurrency(pricingSummary.originalTotal)}</p>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500">Desconto Aplicado</p>
                        <p className="text-sm font-bold text-green-600">-{formatCurrency(pricingSummary.discountTotal)}</p>
                      </div>
                    </>
                  )}
                  {pricingSummary.hasAgencyCommission && pricingSummary.agencyCommissionAmount > 0 && (
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500">
                        Comissão de Agência ({pricingSummary.agencyCommissionPercent.toLocaleString('pt-BR', {
                          minimumFractionDigits: Number.isInteger(pricingSummary.agencyCommissionPercent) ? 0 : 1,
                          maximumFractionDigits: 2
                        })}%)
                      </p>
                      <p className="text-sm font-bold text-blue-700">+{formatCurrency(pricingSummary.agencyCommissionAmount)}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'rgba(232,89,26,0.2)' }}>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Total Mensal</p>
                    <p className="text-2xl font-extrabold" style={{ color: ORANGE, textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>{formatCurrency(finalTotal)}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
                    {data.duracao_meses ? `Valores válidos para o contrato de ${data.duracao_meses} meses. ` : ''}Negociação válida exclusivamente para o plano e quantidade de endereços apresentados. Para outras condições, os valores deverão ser consultados.
                  </p>
                </div>
              </div>
              {hasSellerSignatureInfo && (
                <div className="rounded-xl border border-orange-200/80 bg-orange-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700 mb-2">Assinatura comercial</p>
                  <div className="flex items-start gap-2.5">
                    {sellerSignature.photoUrl ? (
                      <img
                        src={sellerSignature.photoUrl}
                        alt={sellerSignature.name ? `Foto de ${sellerSignature.name}` : 'Foto do vendedor'}
                        className="w-11 h-11 rounded-xl object-cover border border-orange-200 bg-white"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl border border-orange-200 bg-white flex items-center justify-center text-[11px] font-bold text-orange-700">
                        {sellerInitials}
                      </div>
                    )}
                    <div className="text-[11px] leading-relaxed text-gray-700">
                      {sellerSignature.name && <p><strong>Vendedor:</strong> {sellerSignature.name}</p>}
                      {sellerSignature.email && <p className="break-all"><strong>E-mail:</strong> {sellerSignature.email}</p>}
                      {sellerSignature.phone && <p><strong>Telefone:</strong> {sellerSignature.phone}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SmartMap Overview ───────────────────────────────────────────── */}
        {validPoints.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-gray-200/60 shadow-sm" style={{ height: 480 }}>
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <SmartMap
                pontos={validPoints}
                isDark={false}
                cityBounds={cityBounds}
                censusProfiles={censusProfiles}
              />
            </Suspense>
          </div>
        )}

        {/* ── Points list (mídia kit style cards) ────────────────────────── */}
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500 mb-5 inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ background: 'rgba(232,89,26,0.12)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            Endereços de Mídia
          </h2>
          <div className={useCompactGrid ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-6'}>
            {points.map((p, i) => (
              useCompactGrid
                ? <CompactPointCard key={p.id || i} point={p} index={i} total={points.length} />
                : <PointCard key={p.id || i} point={p} index={i} total={points.length} />
            ))}
          </div>
        </div>

        {/* Expiration */}
        {data?.expires_at && !approved && (
          <p className="text-center text-xs text-gray-400 pt-2">
            Link válido até {formatDate(data.expires_at)}
          </p>
        )}

        {/* Approve button */}
        {!approved && (
          <div className="pb-10">
            <button
              onClick={() => setApproveModal(true)}
              className="group relative w-full rounded-2xl text-white font-bold py-4 text-base transition-all duration-300 active:scale-[0.99] overflow-hidden"
              style={{
                background: `linear-gradient(135deg, #FE5C2B 0%, ${ORANGE} 50%, #C94A1A 100%)`,
                boxShadow: '0 10px 30px -10px rgba(232,89,26,0.55), 0 4px 12px -3px rgba(232,89,26,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              <span aria-hidden className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(135deg, #FE5C2B 0%, #FF6B35 50%, #E85A1A 100%)' }} />
              <span className="relative inline-flex items-center justify-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Aprovar esta proposta
              </span>
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pb-8 space-y-3">
          <img src="/logo-light.png" alt="Intermídia" className="h-6 mx-auto opacity-40" />
          <p className="text-[11px] text-gray-400">Intermídia OOH + DOOH — Desde 2007</p>
          <div className="flex items-center justify-center gap-1.5 opacity-40">
            <span className="w-1 h-1 rounded-full" style={{ background: ORANGE }} />
            <span className="w-1 h-1 rounded-full" style={{ background: ORANGE }} />
            <span className="w-1 h-1 rounded-full" style={{ background: ORANGE }} />
          </div>
        </div>
      </div>

      {/* Approval modal */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Confirmar aprovação</h3>
            <p className="text-sm text-gray-500 mb-4">Digite seu nome para registrar a aprovação.</p>
            <input
              type="text"
              value={approveName}
              onChange={e => setApproveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAprovar()}
              placeholder="Seu nome completo"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setApproveModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleAprovar}
                disabled={!approveName.trim() || approving}
                className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                style={{ background: ORANGE }}
              >
                {approving ? 'Aprovando...' : 'Aprovar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
