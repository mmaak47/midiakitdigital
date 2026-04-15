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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

  const metrics = [
    point.publico && { label: 'Público', value: point.publico },
    point.fluxo > 0 && { label: 'Pessoas / mês', value: formatNumber(point.fluxo) },
    point.telas > 0 && { label: 'Telas', value: String(point.telas) },
    point.insercoes > 0 && { label: 'Inserções', value: formatNumber(point.insercoes) },
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
            <div className="mb-2 md:pl-3">
              <span className="inline-flex items-center h-7 px-3 rounded-lg text-[11px] font-bold text-white uppercase tracking-wide" style={{ background: ORANGE }}>
                {tipo}
              </span>
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
                alt={point.nome}
                className="w-full h-full object-cover"
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
  const pricingSummary = data?.pricingSummary || {};
  const validPoints = useMemo(() => points.filter(p => p.lat && p.lng), [points]);
  const segmentLabel = data?.segmento ? getSegmentDisplayName(data.segmento) : data?.segmento || '';
  const cityLabel = useMemo(() => {
    const cities = [...new Set(points.map(p => p.cidade).filter(Boolean))];
    return cities.join(', ') || '';
  }, [points]);

  const cityBounds = useMemo(() => computeCityBoundingBoxes(validPoints), [validPoints]);

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

  const finalTotal = pricingSummary.finalTotal || totals.valorTotal || 0;
  const summaryCards = [
    { label: 'Investimento', value: formatCurrency(finalTotal) },
    { label: 'Impactos/mês', value: formatNumber(totals.fluxoTotal) },
    { label: 'CPM estimado', value: totals.cpmEstimado ? formatCurrency(totals.cpmEstimado) : '—' },
    { label: 'Inserções/mês', value: totals.insercoesTotal ? formatNumber(totals.insercoesTotal) : '—' },
    { label: 'Endereços', value: String(points.length) },
  ].filter(c => c.value && c.value !== '—' && c.value !== '0');

  return (
    <div className="min-h-screen bg-[#ECEFF3]" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-5 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo-light.png" alt="Intermídia" className="h-7 object-contain" />
          <span className="hidden sm:inline-flex items-center h-6 px-3 rounded-full text-[10px] font-bold uppercase tracking-widest text-white" style={{ background: ORANGE }}>Proposta Comercial</span>
        </div>
        {approved && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold">
            Aprovada
          </span>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Approved banner */}
        {approved && data?.approved_name && (
          <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4">
            <p className="text-green-800 font-semibold text-sm">Proposta aprovada por {data.approved_name}</p>
            <p className="text-green-600 text-xs mt-0.5">{formatDate(data.approved_at)}</p>
          </div>
        )}

        {/* Hero */}
        <div className="text-center pt-2 pb-2">
          {data?.clientName && data.clientName !== 'Cliente não informado' && (
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: ORANGE }}>Preparado para</p>
          )}
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
            {data?.clientName || 'Proposta de Mídia'}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            {cityLabel && (
              <span className="inline-flex items-center h-7 px-3 rounded-full bg-white/80 border border-gray-200 text-gray-600 text-xs font-medium">{cityLabel}</span>
            )}
            {segmentLabel && (
              <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-bold text-white" style={{ background: ORANGE }}>{segmentLabel}</span>
            )}
            <span className="inline-flex items-center h-7 px-3 rounded-full bg-white/80 border border-gray-200 text-gray-600 text-xs font-medium">{points.length} endereço{points.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Strategic text */}
        {(data?.strategicTopics || data?.strategicText?.length > 0) && (
          <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-5 sm:p-6">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: ORANGE }}>Direcionamento Estratégico</h2>
            {data?.strategicTopics && (
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{data.strategicTopics}</p>
            )}
            {data?.strategicText?.length > 0 && (
              <ul className="mt-3 space-y-2">
                {data.strategicText.map((t, i) => (
                  <li key={i} className="flex gap-3 items-start text-sm text-gray-700 leading-relaxed">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: ORANGE }} />
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
            <div key={label} className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-4 text-center" style={{ borderTop: `3px solid ${ORANGE}` }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 mb-1">{label}</p>
              <p className="text-lg sm:text-xl font-extrabold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Plano de Investimento & Impacto ────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: ORANGE }} />
              <h2 className="text-base font-bold text-gray-900">Plano de Investimento & Impacto</h2>
            </div>
            <span className="inline-flex items-center h-6 px-3 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
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
              <div className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ background: ORANGE }} />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Estimativas de Impacto</p>
                </div>
                {totals.insercoesTotal > 0 && (
                  <div className="mb-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Inserções (mensais)</p>
                    <p className="text-2xl font-extrabold text-gray-900">{formatNumber(totals.insercoesTotal)}</p>
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

              <div className="rounded-xl p-4" style={{ background: 'rgba(232,89,26,0.04)', border: '1px solid rgba(232,89,26,0.12)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center h-5 px-2 rounded text-[9px] font-bold uppercase tracking-wide text-white" style={{ background: ORANGE }}>Resumo Financeiro</span>
                </div>
                {pricingSummary.hasDiscount && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-500">Valor Original</p>
                      <p className="text-sm text-gray-400 line-through">{formatCurrency(pricingSummary.originalTotal)}</p>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500">Desconto Aplicado</p>
                      <p className="text-sm font-semibold text-green-600">-{formatCurrency(pricingSummary.discountTotal)}</p>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'rgba(232,89,26,0.15)' }}>
                  <p className="text-xs font-bold text-gray-700">TOTAL MENSAL</p>
                  <p className="text-2xl font-extrabold" style={{ color: ORANGE }}>{formatCurrency(finalTotal)}</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                  Negociação válida exclusivamente para o plano e quantidade de endereços apresentados. Para outras condições, os valores deverão ser consultados.
                </p>
              </div>
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
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-5">
            Endereços de Mídia
          </h2>
          <div className="space-y-6">
            {points.map((p, i) => (
              <PointCard key={p.id || i} point={p} index={i} total={points.length} />
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
              className="w-full rounded-2xl text-white font-bold py-4 text-base transition-all shadow-lg hover:shadow-xl active:scale-[0.99]"
              style={{ background: ORANGE }}
            >
              Aprovar esta proposta
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pb-8 space-y-3">
          <img src="/logo-light.png" alt="Intermídia" className="h-6 mx-auto opacity-40" />
          <p className="text-[11px] text-gray-300">Intermídia OOH + DOOH — Desde 2007</p>
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
