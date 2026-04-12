import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMap } from 'react-leaflet';
import { fetchPropostaPublica, aprovarPropostaPublica } from '../lib/api';
import { buildAudienceQualification, getSegmentDisplayName } from '../lib/strategy';
import { getPrimaryPointScreenImage } from '../lib/pointImages';
import 'leaflet/dist/leaflet.css';

const ORANGE = '#E8591A';

// ── Census profile colours (matches SmartMap) ────────────────────────────────
const CENSUS_PROFILE_COLORS = {
  alta_renda: '#f59e0b',
  massa_varejo: '#3b82f6',
  jovem_universitario: '#8b5cf6',
  terceira_idade: '#10b981',
  misto: '#a3a3a3',
  indefinido: '#525252',
};
const CENSUS_PROFILE_LABELS = {
  alta_renda: 'Público A/B',
  massa_varejo: 'Massa / Varejo',
  jovem_universitario: 'Jovem / Universitário',
  terceira_idade: 'Terceira Idade',
  misto: 'Perfil Misto',
  indefinido: 'Sem perfil',
};
const PUBLICO_TO_PROFILE = {
  A: 'alta_renda', 'A/B': 'alta_renda', 'A/B+': 'alta_renda',
  B: 'massa_varejo', 'B/C': 'massa_varejo', 'A/B/C': 'massa_varejo',
  C: 'massa_varejo', D: 'massa_varejo',
};

function getProfileKey(publico) {
  if (!publico) return 'indefinido';
  return PUBLICO_TO_PROFILE[publico] || 'misto';
}
function getProfileColor(publico) {
  return CENSUS_PROFILE_COLORS[getProfileKey(publico)] || CENSUS_PROFILE_COLORS.indefinido;
}

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
  return Number(v || 0).toFixed(5);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getPointImage(point) {
  return point?.simulacao_preview
    || point?.proposalSimulationPreview
    || getPrimaryPointScreenImage(point)
    || point?.imagem
    || point?.imagem2
    || '';
}

function getPointType(point) {
  const tipo = point?.tipo || point?.type || '';
  if (!tipo) return '';
  const parts = tipo.split(' - ');
  return parts[0].trim();
}

// ── Map: FitBounds ───────────────────────────────────────────────────────────
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = points.map(p => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

// ── PointMiniMap ─────────────────────────────────────────────────────────────
function PointMiniMap({ lat, lng, publico }) {
  const validLat = Number.isFinite(Number(lat)) ? Number(lat) : null;
  const validLng = Number.isFinite(Number(lng)) ? Number(lng) : null;
  if (!validLat || !validLng) return null;

  const profileColor = getProfileColor(publico);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100" style={{ height: 200 }}>
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
          pathOptions={{ color: profileColor, fillColor: profileColor, fillOpacity: 0.12, weight: 1.2 }}
        />
        <CircleMarker
          center={[validLat, validLng]}
          radius={7}
          pathOptions={{ color: '#fff', fillColor: ORANGE, fillOpacity: 1, weight: 2 }}
        />
      </MapContainer>
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

  useEffect(() => {
    if (!token) return;
    fetchPropostaPublica(token)
      .then(data => {
        setState({ loading: false, error: null, data });
        if (data.approved_at) setApproved(true);
      })
      .catch(err => setState({ loading: false, error: err.message, data: null }));
  }, [token]);

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

  // Determine which audience profiles are present for legend
  const activeProfiles = useMemo(() => {
    const keys = new Set();
    points.forEach(p => keys.add(getProfileKey(p.publico)));
    return Object.entries(CENSUS_PROFILE_LABELS).filter(([k]) => keys.has(k));
  }, [points]);

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
    { label: 'Pontos', value: String(points.length) },
  ].filter(c => c.value && c.value !== '—' && c.value !== '0');

  return (
    <div className="min-h-screen bg-[#FAFAFA]" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
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
              <span className="inline-flex items-center h-7 px-3 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">{cityLabel}</span>
            )}
            {segmentLabel && (
              <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-bold text-white" style={{ background: ORANGE }}>{segmentLabel}</span>
            )}
            <span className="inline-flex items-center h-7 px-3 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">{points.length} ponto{points.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Strategic text */}
        {(data?.strategicTopics || data?.strategicText?.length > 0) && (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 sm:p-6">
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
            <div key={label} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 text-center" style={{ borderTop: `3px solid ${ORANGE}` }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 mb-1">{label}</p>
              <p className="text-lg sm:text-xl font-extrabold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Plano de Investimento & Impacto ────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: ORANGE }} />
              <h2 className="text-base font-bold text-gray-900">Plano de Investimento & Impacto</h2>
            </div>
            <span className="inline-flex items-center h-6 px-3 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
              Total de {points.length} pontos
            </span>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-0">
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Ponto</th>
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
                        <td className="px-3 py-2.5 text-gray-500">{getPointType(p)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600 font-medium">{formatCurrency(precoOriginal)}</td>
                        <td className="px-5 py-2.5 text-right font-bold" style={{ color: hasDiscount ? ORANGE : '#111' }}>{formatCurrency(precoFinal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sidebar — metrics + financial */}
            <div className="border-t lg:border-t-0 lg:border-l border-gray-100 p-5 space-y-4">
              {/* Impact estimates */}
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

              {/* Financial summary */}
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
                  Negociação válida exclusivamente para o plano e quantidade de pontos apresentados. Para outras condições de compra, os valores deverão ser consultados.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Map Overview with Audience Circles ─────────────────────────── */}
        {validPoints.length > 0 && (
          <div className="relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{ height: 440 }}>
            <MapContainer center={[0, 0]} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={true} scrollWheelZoom={false}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                subdomains={['a', 'b', 'c', 'd']}
                attribution='&copy; OpenStreetMap &copy; CARTO'
              />
              <FitBounds points={validPoints} />
              {/* Audience radius circles */}
              {validPoints.map(p => (
                <Circle
                  key={`circle-${p.id}`}
                  center={[p.lat, p.lng]}
                  radius={800}
                  pathOptions={{
                    color: getProfileColor(p.publico),
                    fillColor: getProfileColor(p.publico),
                    fillOpacity: 0.15,
                    weight: 1.2,
                  }}
                />
              ))}
              {/* Point markers */}
              {validPoints.map(p => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={7}
                  pathOptions={{ color: '#fff', fillColor: ORANGE, fillOpacity: 1, weight: 2 }}
                >
                  <Tooltip direction="top" offset={[0, -10]} permanent={false}>
                    <strong>{p.nome}</strong><br />{getPointType(p)} · {p.cidade}
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>

            {/* Legend */}
            {activeProfiles.length > 0 && (
              <div className="absolute bottom-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl border border-gray-200 shadow-md px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Perfil Censitário (800 m)</p>
                {activeProfiles.map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2 py-0.5">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: CENSUS_PROFILE_COLORS[key] }} />
                    <span className="text-[11px] text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Points list ────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-4">
            {points.length} ponto{points.length !== 1 ? 's' : ''} selecionado{points.length !== 1 ? 's' : ''}
          </h2>
          <div className="space-y-5">
            {points.map((p, i) => {
              const img = getPointImage(p);
              const audience = buildAudienceQualification(p);
              const tipo = getPointType(p);
              const entornoCount = Number(p?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;
              const hasCoords = p.lat && p.lng;

              return (
                <div key={p.id || i} className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  {/* Image with blur background */}
                  {img && (
                    <div className="relative bg-gray-100" style={{ aspectRatio: '16/10', minHeight: 300, maxHeight: 420 }}>
                      {/* Blurred background */}
                      <img
                        src={img}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ filter: 'blur(24px) brightness(0.7)', transform: 'scale(1.1)' }}
                      />
                      {/* Main image */}
                      <img
                        src={img}
                        alt={p.nome}
                        className="relative w-full h-full object-contain z-[1]"
                        onError={e => { e.target.closest('[style*="aspect-ratio"]').style.display = 'none'; }}
                      />
                      <div className="absolute top-3 right-3 z-[2] inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{ background: 'rgba(0,0,0,0.55)' }}>
                        {i + 1}/{points.length}
                      </div>
                    </div>
                  )}

                  <div className="p-5 space-y-4">
                    {/* Name + meta */}
                    <div>
                      <div className="flex items-start gap-3 flex-wrap">
                        <h3 className="text-xl font-extrabold text-gray-900 tracking-tight leading-tight">{p.nome}</h3>
                        {tipo && (
                          <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wide" style={{ background: ORANGE }}>{tipo}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {[p.cidade, p.endereco].filter(Boolean).join(' · ')}
                      </p>
                      {/* Coordinates */}
                      {hasCoords && (
                        <p className="text-xs text-gray-300 mt-0.5 font-mono">
                          {formatCoord(p.lat)}, {formatCoord(p.lng)}
                        </p>
                      )}
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {p.fluxo > 0 && (
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Fluxo/mês</p>
                          <p className="text-base font-bold text-gray-900 mt-0.5">{formatNumber(p.fluxo)}</p>
                        </div>
                      )}
                      {p.telas > 0 && (
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Pontos Impacto</p>
                          <p className="text-base font-bold text-gray-900 mt-0.5">{p.telas}</p>
                        </div>
                      )}
                      {p.insercoes > 0 && (
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Inserções</p>
                          <p className="text-base font-bold text-gray-900 mt-0.5">{formatNumber(p.insercoes)}</p>
                        </div>
                      )}
                      {(p.precoFinal || p.preco) > 0 && (
                        <div className="rounded-xl border p-3" style={{ background: 'rgba(232,89,26,0.06)', borderColor: 'rgba(232,89,26,0.18)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ORANGE }}>Valor/mês</p>
                          <p className="text-base font-bold mt-0.5" style={{ color: ORANGE }}>{formatCurrency(p.precoFinal || p.preco)}</p>
                        </div>
                      )}
                    </div>

                    {/* Mini map */}
                    {hasCoords && (
                      <PointMiniMap lat={p.lat} lng={p.lng} publico={p.publico} />
                    )}

                    {/* Audience qualification */}
                    {audience.badge && (
                      <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[10px] font-bold uppercase" style={{ background: 'rgba(232,89,26,0.12)', border: '1px solid rgba(232,89,26,0.24)', color: ORANGE }}>{audience.badge}</span>
                          {entornoCount > 0 && (
                            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-gray-200/60 text-[10px] font-semibold text-gray-500">{formatNumber(entornoCount)} locais no entorno</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-gray-800 mt-2">{audience.headline}</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{audience.summary}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
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
