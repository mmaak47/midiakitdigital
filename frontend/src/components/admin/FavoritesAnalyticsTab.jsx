/**
 * FavoritesAnalyticsTab.jsx
 * Admin panel tab showing favorites analytics — which points visitors like most,
 * total activity, and per-lead favorite data for commercial follow-up.
 */

import { useState, useEffect, useCallback } from 'react';
import { Heart, TrendingUp, Users, Share2, Loader2, RefreshCcw, MapPin, Building2, Phone, ChevronDown, ChevronUp, Send, ExternalLink, Eye } from 'lucide-react';
import { fetchFavoritesAnalytics, fetchCommercialShares, fetchClientFavorites } from '../../lib/api';

function formatInt(n) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FavoritesAnalyticsTab({ isDark }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);
  const [expandedLead, setExpandedLead] = useState(null);

  const t = {
    card: isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-neutral-200 shadow-sm',
    cardHover: isDark ? 'hover:border-brand-orange/30 hover:bg-white/[0.05]' : 'hover:border-[#FF6B35]/40 hover:shadow-md',
    text: isDark ? 'text-white' : 'text-neutral-900',
    textSec: isDark ? 'text-brand-gray-400' : 'text-neutral-500',
    textMuted: isDark ? 'text-brand-gray-500' : 'text-neutral-400',
    tableHead: isDark ? 'bg-white/[0.02] border-white/10' : 'bg-neutral-50 border-neutral-200',
    tableRow: isDark ? 'border-white/5 hover:bg-white/[0.02]' : 'border-neutral-100 hover:bg-neutral-50',
    badge: isDark ? 'bg-brand-orange/15 text-brand-orange border-brand-orange/30' : 'bg-[#FFF0EA] text-[#C94A1A] border-[#FFCFB8]',
    select: isDark ? 'bg-white/[0.04] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900',
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFavoritesAnalytics(days);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Group leadFavorites by lead_id
  const leadsGrouped = data?.leadFavorites?.reduce((acc, item) => {
    const key = item.lead_id;
    if (!acc[key]) acc[key] = { ...item, points: [] };
    acc[key].points.push({ point_id: item.point_id, point_name: item.point_name, created_at: item.created_at });
    return acc;
  }, {});
  const leadsList = leadsGrouped ? Object.values(leadsGrouped) : [];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-brand-orange" />
        <span className={`ml-3 text-sm ${t.textSec}`}>Carregando analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button onClick={load} className="text-sm text-brand-orange hover:underline">Tentar novamente</button>
      </div>
    );
  }

  const totals = data?.totals || {};

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Heart size={20} className="text-brand-orange" fill="currentColor" />
            Analytics de Favoritos
          </h2>
          <p className={`text-sm mt-0.5 ${t.textSec}`}>
            Pontos mais favoritados pelos visitantes do midia kit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className={`rounded-lg border px-3 py-1.5 text-sm outline-none ${t.select}`}
          >
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className={`p-2 rounded-lg border transition-colors ${t.card} ${t.cardHover}`}
            title="Atualizar"
          >
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Heart, label: 'Favoritados', value: formatInt(totals.adds || 0), color: 'text-brand-orange' },
          { icon: Users, label: 'Visitantes', value: formatInt(totals.unique_users || 0), color: 'text-blue-400' },
          { icon: Share2, label: 'Links gerados', value: formatInt(totals.shares || 0), color: 'text-emerald-400' },
          { icon: TrendingUp, label: 'Removidos', value: formatInt(totals.removes || 0), color: isDark ? 'text-brand-gray-400' : 'text-neutral-500' },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${t.card}`}>
            <div className="flex items-center gap-2 mb-2">
              <card.icon size={16} className={card.color} />
              <span className={`text-xs uppercase tracking-wide font-semibold ${t.textMuted}`}>{card.label}</span>
            </div>
            <div className={`text-2xl font-bold ${t.text}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Top favorited points — ranking */}
      <div className={`rounded-xl border overflow-hidden ${t.card}`}>
        <div className={`px-5 py-3 border-b flex items-center gap-2 ${t.tableHead}`}>
          <TrendingUp size={15} className="text-brand-orange" />
          <h3 className="text-sm font-bold">Ranking — Pontos mais favoritados</h3>
          <span className={`ml-auto text-xs ${t.textMuted}`}>{data?.topPoints?.length || 0} pontos</span>
        </div>

        {(!data?.topPoints?.length) ? (
          <div className={`py-10 text-center text-sm ${t.textMuted}`}>
            Nenhum favorito registrado neste periodo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left text-xs uppercase tracking-wide border-b ${t.tableHead}`}>
                  <th className="px-5 py-2.5 font-semibold w-10">#</th>
                  <th className="px-5 py-2.5 font-semibold">Ponto</th>
                  <th className="px-5 py-2.5 font-semibold">Cidade</th>
                  <th className="px-5 py-2.5 font-semibold">Formato</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Favoritos</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Sessoes</th>
                </tr>
              </thead>
              <tbody>
                {data.topPoints.map((pt, i) => (
                  <tr key={pt.point_id || i} className={`border-b ${t.tableRow}`}>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        i < 3
                          ? 'bg-brand-orange text-white'
                          : isDark ? 'bg-white/10 text-brand-gray-400' : 'bg-neutral-100 text-neutral-500'
                      }`}>{i + 1}</span>
                    </td>
                    <td className={`px-5 py-3 font-medium ${t.text}`}>{pt.point_name || `ID ${pt.point_id}`}</td>
                    <td className={`px-5 py-3 ${t.textSec}`}>
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} className="text-brand-orange" />{pt.city || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${t.badge}`}>
                        {pt.type || '—'}
                      </span>
                    </td>
                    <td className={`px-5 py-3 text-right font-bold tabular-nums ${t.text}`}>{formatInt(pt.favorite_count)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums ${t.textSec}`}>{formatInt(pt.unique_sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-lead favorites */}
      {leadsList.length > 0 && (
        <div className={`rounded-xl border overflow-hidden ${t.card}`}>
          <div className={`px-5 py-3 border-b flex items-center gap-2 ${t.tableHead}`}>
            <Users size={15} className="text-brand-orange" />
            <h3 className="text-sm font-bold">Favoritos por Lead</h3>
            <span className={`ml-auto text-xs ${t.textMuted}`}>{leadsList.length} leads</span>
          </div>

          <div className="divide-y divide-inherit">
            {leadsList.map((lead) => (
              <div key={lead.lead_id}>
                <button
                  onClick={() => setExpandedLead(expandedLead === lead.lead_id ? null : lead.lead_id)}
                  className={`w-full px-5 py-3 flex items-center gap-4 text-left transition-colors ${t.tableRow}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${t.text}`}>
                      <Building2 size={13} className="inline mr-1.5 text-brand-orange" />
                      {lead.empresa || 'Empresa N/I'}
                    </div>
                    <div className={`text-xs mt-0.5 ${t.textMuted}`}>
                      <Phone size={11} className="inline mr-1" />{lead.telefone || 'N/I'}
                      <span className="mx-2">·</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                        lead.status === 'convertido'
                          ? isDark ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200'
                          : lead.status === 'em_atendimento'
                          ? isDark ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          : isDark ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>{lead.status || 'novo'}</span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${t.textSec}`}>
                    <Heart size={14} className="text-brand-orange" fill="currentColor" />
                    <span className="font-bold">{lead.points.length}</span>
                    {expandedLead === lead.lead_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {expandedLead === lead.lead_id && (
                  <div className={`px-5 pb-4 pt-1 ${isDark ? 'bg-white/[0.01]' : 'bg-neutral-50/50'}`}>
                    <div className="space-y-1.5">
                      {lead.points.map((pt, i) => (
                        <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-white/[0.03]' : 'bg-white border border-neutral-100'}`}>
                          <span className={`font-medium ${t.text}`}>{pt.point_name || `Ponto ${pt.point_id}`}</span>
                          <span className={t.textMuted}>{fmtDate(pt.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commercial shares section */}
      <CommercialSharesSection isDark={isDark} t={t} />
    </div>
  );
}

/* ─── Commercial Shares Section ─── */
function CommercialSharesSection({ isDark, t }) {
  const [shares, setShares] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedCode, setExpandedCode] = useState(null);
  const [clientFavsData, setClientFavsData] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCommercialShares();
      setShares(data);
    } catch { setShares([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = useCallback(async (code) => {
    if (expandedCode === code) { setExpandedCode(null); return; }
    setExpandedCode(code);
    if (!clientFavsData[code]) {
      try {
        const data = await fetchClientFavorites(code);
        setClientFavsData((prev) => ({ ...prev, [code]: data.favorites || [] }));
      } catch { setClientFavsData((prev) => ({ ...prev, [code]: [] })); }
    }
  }, [expandedCode, clientFavsData]);

  if (loading && !shares) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-blue-400" />
        <span className={`ml-2 text-sm ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Carregando links comerciais...</span>
      </div>
    );
  }

  if (!shares?.length) return null;

  return (
    <div className={`rounded-xl border overflow-hidden ${t.card}`}>
      <div className={`px-5 py-3 border-b flex items-center gap-2 ${t.tableHead}`}>
        <Send size={15} className="text-blue-400" />
        <h3 className="text-sm font-bold">Links Comerciais (enviados para clientes)</h3>
        <span className={`ml-auto text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{shares.length} links</span>
      </div>

      <div className="divide-y divide-inherit">
        {shares.map((share) => (
          <div key={share.code}>
            <button
              onClick={() => toggleExpand(share.code)}
              className={`w-full px-5 py-3 flex items-center gap-4 text-left transition-colors ${t.tableRow}`}
            >
              <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  <Building2 size={13} className="inline mr-1.5 text-blue-400" />
                  {share.clientName || 'Cliente N/I'}
                </div>
                <div className={`text-xs mt-0.5 flex items-center gap-3 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                  <span>{formatInt(share.pointCount)} pontos</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><Eye size={10} />{share.views || 0} views</span>
                  <span>·</span>
                  <span>{fmtDate(share.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {share.clientFavoritesCount > 0 ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${isDark ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200'}`}>
                    <Heart size={10} fill="currentColor" />{share.clientFavoritesCount} fav.
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${isDark ? 'bg-white/5 text-brand-gray-500 border-white/10' : 'bg-neutral-50 text-neutral-400 border-neutral-200'}`}>
                    Aguardando
                  </span>
                )}
                <a
                  href={share.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500' : 'hover:bg-neutral-100 text-neutral-400'}`}
                  title="Abrir link"
                >
                  <ExternalLink size={13} />
                </a>
                {expandedCode === share.code ? <ChevronUp size={14} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} /> : <ChevronDown size={14} className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'} />}
              </div>
            </button>

            {expandedCode === share.code && (
              <div className={`px-5 pb-4 pt-1 ${isDark ? 'bg-white/[0.01]' : 'bg-neutral-50/50'}`}>
                {!clientFavsData[share.code] ? (
                  <div className="flex items-center gap-2 py-3">
                    <Loader2 size={14} className="animate-spin text-blue-400" />
                    <span className={`text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>Carregando favoritos...</span>
                  </div>
                ) : clientFavsData[share.code].length === 0 ? (
                  <p className={`text-xs py-3 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
                    O cliente ainda não enviou seus favoritos.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${isDark ? 'text-brand-gray-600' : 'text-neutral-400'}`}>
                      Pontos favoritos do cliente ({clientFavsData[share.code].length})
                    </p>
                    {clientFavsData[share.code].map((fav, i) => (
                      <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-white/[0.03]' : 'bg-white border border-neutral-100'}`}>
                        <span className="flex items-center gap-2">
                          <Heart size={11} className="text-brand-orange" fill="currentColor" />
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>{fav.point_name || `Ponto ${fav.point_id}`}</span>
                        </span>
                        <span className={isDark ? 'text-brand-gray-500' : 'text-neutral-400'}>{fmtDate(fav.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
