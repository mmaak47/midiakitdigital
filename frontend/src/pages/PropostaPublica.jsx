import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { fetchPropostaPublica, aprovarPropostaPublica } from '../lib/api';
import { buildAudienceQualification, getSegmentDisplayName } from '../lib/strategy';
import { getPrimaryPointScreenImage } from '../lib/pointImages';
import 'leaflet/dist/leaflet.css';

const ORANGE = '#E8591A';

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

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = points.map(p => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

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

        {/* Map */}
        {validPoints.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{ height: 340 }}>
            <MapContainer center={[0, 0]} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                subdomains={['a', 'b', 'c', 'd']}
                attribution='&copy; OpenStreetMap &copy; CARTO'
              />
              <FitBounds points={validPoints} />
              {validPoints.map(p => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={8}
                  pathOptions={{ color: ORANGE, fillColor: ORANGE, fillOpacity: 0.85, weight: 2 }}
                >
                  <Tooltip direction="top" offset={[0, -10]} permanent={false}>
                    <strong>{p.nome}</strong><br />{getPointType(p)} · {p.cidade}
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        )}

        {/* Points list */}
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-4">
            {points.length} ponto{points.length !== 1 ? 's' : ''} selecionado{points.length !== 1 ? 's' : ''}
          </h2>
          <div className="space-y-4">
            {points.map((p, i) => {
              const img = getPointImage(p);
              const audience = buildAudienceQualification(p);
              const tipo = getPointType(p);
              const entornoCount = Number(p?.entornoMetrics?.total_estabelecimentos_relacionados) || 0;

              return (
                <div key={p.id || i} className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  {/* Image */}
                  {img && (
                    <div className="relative bg-gray-100" style={{ height: 220 }}>
                      <img
                        src={img}
                        alt={p.nome}
                        className="w-full h-full object-contain"
                        onError={e => { e.target.parentElement.style.display = 'none'; }}
                      />
                      <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{ background: 'rgba(0,0,0,0.55)' }}>
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
          <p className="text-[11px] text-gray-300">Intermidia OOH + DOOH — Desde 2007</p>
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
