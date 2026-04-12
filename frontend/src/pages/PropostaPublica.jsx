import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { fetchPropostaPublica, aprovarPropostaPublica } from '../lib/api';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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

  // Centroid for map
  const validPoints = points.filter(p => p.lat && p.lng);
  const mapCenter = validPoints.length
    ? [validPoints.reduce((s, p) => s + p.lat, 0) / validPoints.length,
       validPoints.reduce((s, p) => s + p.lng, 0) / validPoints.length]
    : [-23.5, -46.6];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Carregando proposta...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <img src="/logo.png" alt="Logo" className="h-10 mx-auto mb-6 opacity-60" />
          <div className="text-4xl mb-4">⏱️</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Link indisponível</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <img src="/logo.png" alt="Logo" className="h-8 object-contain" />
        <span className="text-xs text-gray-400">Proposta comercial</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Aprovado badge */}
        {approved && (
          <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-green-800 font-semibold text-sm">Proposta aprovada</p>
              {data?.approved_name && (
                <p className="text-green-600 text-xs">por {data.approved_name} em {formatDate(data.approved_at)}</p>
              )}
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="text-center pt-2">
          {data?.clientName && (
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-1">Proposta para</p>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{data?.clientName || 'Proposta de Mídia'}</h1>
          {data?.clientAddress && (
            <p className="text-sm text-gray-400">{data.clientAddress}</p>
          )}
          {data?.segmento && (
            <span className="inline-block mt-3 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-medium border border-orange-100">
              {data.segmento}
            </span>
          )}
        </div>

        {/* Texto estratégico */}
        {(data?.strategicTopics || (data?.strategicText && data.strategicText.length > 0)) && (
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Estratégia</h2>
            {data?.strategicTopics && (
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{data.strategicTopics}</p>
            )}
            {data?.strategicText?.length > 0 && (
              <ul className="mt-3 space-y-1">
                {data.strategicText.map((t, i) => (
                  <li key={i} className="text-gray-600 text-sm flex gap-2">
                    <span className="text-orange-400 shrink-0">•</span>{t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Totais */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Investimento', value: formatCurrency(pricingSummary.finalTotal || totals.valorTotal) },
            { label: 'Impactos/mês', value: formatNumber(totals.fluxoTotal) },
            { label: 'CPM estimado', value: totals.cpmEstimado ? formatCurrency(totals.cpmEstimado) : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <p className="text-lg font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Mapa */}
        {validPoints.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{ height: 280 }}>
            <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
              {validPoints.map(p => (
                <Marker key={p.id} position={[p.lat, p.lng]}>
                  <Popup><strong>{p.nome}</strong><br />{p.cidade}</Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        {/* Lista de pontos */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
            {points.length} ponto{points.length !== 1 ? 's' : ''} selecionado{points.length !== 1 ? 's' : ''}
          </h2>
          <div className="space-y-3">
            {points.map((p, i) => (
              <div key={p.id || i} className="rounded-2xl border border-gray-100 overflow-hidden flex bg-white shadow-sm">
                {(p.imagem || p.imagem2) && (
                  <img
                    src={p.imagem || p.imagem2}
                    alt={p.nome}
                    className="w-24 h-24 object-cover shrink-0"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                )}
                <div className="p-4 flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{p.nome}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.tipo} · {p.cidade}</p>
                  {p.endereco && <p className="text-xs text-gray-400 truncate">{p.endereco}</p>}
                  <div className="flex flex-wrap gap-3 mt-2">
                    {p.fluxo > 0 && (
                      <span className="text-xs text-gray-600">
                        <span className="font-medium">{formatNumber(p.fluxo)}</span> imp/mês
                      </span>
                    )}
                    {(p.telas > 0) && (
                      <span className="text-xs text-gray-600">
                        <span className="font-medium">{p.telas}</span> tela{p.telas !== 1 ? 's' : ''}
                      </span>
                    )}
                    {(p.precoFinal || p.preco) > 0 && (
                      <span className="text-xs font-semibold text-orange-600">
                        {formatCurrency(p.precoFinal || p.preco)}/mês
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expiração */}
        {data?.expires_at && !approved && (
          <p className="text-center text-xs text-gray-400">
            Link válido até {formatDate(data.expires_at)}
          </p>
        )}

        {/* Botão de aprovação */}
        {!approved && (
          <div className="pb-8">
            <button
              onClick={() => setApproveModal(true)}
              className="w-full rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-semibold py-4 text-base transition-colors shadow-lg shadow-orange-200"
            >
              ✅ Aprovar esta proposta
            </button>
          </div>
        )}
      </div>

      {/* Modal de aprovação */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
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
                className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
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
