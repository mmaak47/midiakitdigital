/**
 * MeusLeads.jsx
 * Tab "Meus Leads" na Gestão Comercial — mostra os links comerciais do vendedor
 * (ou todos, para admin/diretor) com favoritos dos clientes, status e ações rápidas.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Heart, Users, Send, ExternalLink, Eye, Loader2, RefreshCcw,
  ChevronDown, ChevronUp, Building2, Copy, Check, Link2,
  MessageCircle, Clock, Filter, Search, Percent, DollarSign,
  Megaphone, Phone, User, Package
} from 'lucide-react';
import { fetchCommercialShares, fetchClientFavorites, fetchPacoteCommercialLeads } from '../../lib/api';

function formatInt(n) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
}
function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
}
function fmtDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return str; }
}
function fmtDateTime(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return str; }
}
function timeAgo(str) {
  if (!str) return '';
  try {
    const diff = Date.now() - new Date(str).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h atrás`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'ontem';
    if (days < 7) return `${days} dias atrás`;
    return fmtDate(str);
  } catch { return ''; }
}

export default function MeusLeads({ isDark, currentUser }) {
  const [shares, setShares] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedCode, setExpandedCode] = useState(null);
  const [clientFavsData, setClientFavsData] = useState({});
  const [copiedCode, setCopiedCode] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | responded | waiting

  const isAdmin = currentUser && ['admin', 'diretor', 'gerente_comercial'].includes(currentUser.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [commercialData, pacoteData] = await Promise.all([
        fetchCommercialShares().catch(() => []),
        fetchPacoteCommercialLeads().catch(() => []),
      ]);
      // Merge and sort by date (newest first)
      const merged = [...commercialData, ...pacoteData].sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
      setShares(merged);
    } catch { setShares([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = useCallback(async (code, shareType) => {
    if (expandedCode === code) { setExpandedCode(null); return; }
    setExpandedCode(code);
    // Pacote leads have data embedded in the share object — no separate fetch needed
    if (shareType === 'pacote') return;
    if (!clientFavsData[code]) {
      try {
        const data = await fetchClientFavorites(code);
        setClientFavsData((prev) => ({ ...prev, [code]: data }));
      } catch { setClientFavsData((prev) => ({ ...prev, [code]: { favorites: [] } })); }
    }
  }, [expandedCode, clientFavsData]);

  const copyLink = useCallback(async (code, shareType) => {
    try {
      const path = shareType === 'pacote' ? `/pacote/${code}` : `/s/${code}`;
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  }, []);

  // Filter + search
  const filtered = useMemo(() => {
    if (!shares) return [];
    let result = [...shares];
    if (statusFilter === 'responded') result = result.filter(s => s.clientFavoritesCount > 0);
    if (statusFilter === 'waiting') result = result.filter(s => s.clientFavoritesCount === 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(s => (s.clientName || '').toLowerCase().includes(q) || (s.vendedorName || '').toLowerCase().includes(q) || (s.pacoteNome || '').toLowerCase().includes(q) || (s.shareType === 'broadcast' && 'disparo em massa'.includes(q)) || (s.shareType === 'pacote' && 'pacote'.includes(q)));
    }
    return result;
  }, [shares, statusFilter, search]);

  // Stats
  const stats = useMemo(() => {
    if (!shares?.length) return { total: 0, responded: 0, waiting: 0, totalViews: 0, totalFavs: 0 };
    const responded = shares.filter(s => s.clientFavoritesCount > 0).length;
    return {
      total: shares.length,
      responded,
      waiting: shares.length - responded,
      totalViews: shares.reduce((acc, s) => acc + (s.views || 0), 0),
      totalFavs: shares.reduce((acc, s) => acc + (s.clientFavoritesCount || 0), 0),
    };
  }, [shares]);

  const t = isDark ? {
    card: 'border-white/10 bg-white/[0.02]',
    cardHover: 'hover:bg-white/[0.04]',
    sub: 'text-brand-gray-400',
    sub2: 'text-brand-gray-500',
    badge: 'bg-white/5 border-white/10 text-brand-gray-400',
    badgeGreen: 'bg-green-500/15 text-green-300 border-green-500/30',
    badgeOrange: 'bg-brand-orange/15 text-brand-orange border-brand-orange/30',
    input: 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-600',
    expanded: 'bg-white/[0.01]',
  } : {
    card: 'border-neutral-200/80 bg-white shadow-sm',
    cardHover: 'hover:bg-neutral-50',
    sub: 'text-neutral-500',
    sub2: 'text-neutral-400',
    badge: 'bg-neutral-50 border-neutral-200 text-neutral-500',
    badgeGreen: 'bg-green-50 text-green-700 border-green-200',
    badgeOrange: 'bg-orange-50 text-[#C94A1A] border-orange-200',
    input: 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400',
    expanded: 'bg-neutral-50/50',
  };

  if (loading && !shares) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={28} className="animate-spin text-brand-orange" />
        <span className={`text-sm ${t.sub}`}>Carregando seus leads...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Links Enviados', value: stats.total, icon: Send, color: 'text-blue-400' },
          { label: 'Respondidos', value: stats.responded, icon: Heart, color: 'text-green-400' },
          { label: 'Aguardando', value: stats.waiting, icon: Clock, color: 'text-yellow-400' },
          { label: 'Visualizações', value: stats.totalViews, icon: Eye, color: 'text-purple-400' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl border p-4 ${t.card}`}>
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={15} className={stat.color} />
              <span className={`text-xs font-medium ${t.sub}`}>{stat.label}</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              {formatInt(stat.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Filters bar */}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${t.card}`}>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.sub2}`} />
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm ${t.input} focus:outline-none focus:ring-2 focus:ring-brand-orange/40`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'responded', label: 'Respondidos' },
            { key: 'waiting', label: 'Aguardando' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === f.key
                  ? 'bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white shadow-sm'
                  : isDark ? 'text-brand-gray-400 hover:bg-white/5' : 'text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-400' : 'hover:bg-neutral-100 text-neutral-500'}`}
          title="Atualizar"
        >
          <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className={`rounded-xl border p-10 text-center ${t.card}`}>
          <Send size={36} className={`mx-auto mb-3 ${t.sub2}`} />
          <h3 className={`text-base font-bold mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {shares?.length === 0 ? 'Nenhum link comercial enviado' : 'Nenhum lead encontrado'}
          </h3>
          <p className={`text-sm ${t.sub}`}>
            {shares?.length === 0
              ? 'Vá até o Explorador, selecione pontos de mídia e clique em "Enviar para cliente" para começar.'
              : 'Tente ajustar os filtros ou busca.'}
          </p>
        </div>
      )}

      {/* Leads list */}
      {filtered.length > 0 && (
        <div className={`rounded-xl border overflow-hidden ${t.card}`}>
          <div className="divide-y divide-inherit">
            {filtered.map((share) => {
              const hasResponse = share.clientFavoritesCount > 0;
              const isExpanded = expandedCode === share.code;

              return (
                <div key={share.code}>
                  <button
                    onClick={() => toggleExpand(share.code, share.shareType)}
                    className={`w-full px-5 py-4 flex items-center gap-4 text-left transition-colors ${t.cardHover}`}
                  >
                    {/* Status indicator */}
                    <div className={`shrink-0 w-2.5 h-2.5 rounded-full ${hasResponse ? 'bg-green-400 shadow-sm shadow-green-400/40' : 'bg-neutral-400/50'}`} />

                    {/* Client info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                          {share.shareType === 'broadcast' ? 'Disparo em massa' : (share.clientName || 'Cliente N/I')}
                        </span>
                        {share.shareType === 'pacote' && (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${t.badgeOrange}`}>
                            <Package size={9} />{share.pacoteNome || 'Pacote'}
                          </span>
                        )}
                        {share.shareType === 'broadcast' && (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${isDark ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                            <Megaphone size={9} />Massa
                          </span>
                        )}
                        {share.discount && (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${t.badgeOrange}`}>
                            {share.discount.mode === 'percent' ? <Percent size={9} /> : <DollarSign size={9} />}
                            {share.discount.mode === 'percent' ? `${share.discount.value}%` : fmtBRL(share.discount.value)}
                          </span>
                        )}
                        {isAdmin && share.vendedorName && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${t.badge}`}>
                            {share.vendedorName}
                          </span>
                        )}
                      </div>
                      <div className={`text-xs mt-1 flex items-center gap-2.5 flex-wrap ${t.sub2}`}>
                        <span className="inline-flex items-center gap-1"><Link2 size={10} />{share.pointCount} pontos</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1"><Eye size={10} />{share.views || 0} views</span>
                        <span>·</span>
                        <span>{timeAgo(share.createdAt)}</span>
                      </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2 shrink-0">
                      {hasResponse ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${t.badgeGreen}`}>
                          <Heart size={10} fill="currentColor" />{share.clientFavoritesCount} {share.shareType === 'broadcast' ? 'respostas' : 'favoritos'}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${t.badge}`}>
                          <Clock size={10} />Aguardando
                        </span>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); copyLink(share.code, share.shareType); }}
                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500' : 'hover:bg-neutral-100 text-neutral-400'}`}
                        title="Copiar link"
                      >
                        {copiedCode === share.code ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                      </button>
                      <a
                        href={share.shareType === 'pacote' ? `/pacote/${share.code}` : `/s/${share.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-500' : 'hover:bg-neutral-100 text-neutral-400'}`}
                        title="Abrir link"
                      >
                        <ExternalLink size={13} />
                      </a>
                      {isExpanded ? <ChevronUp size={14} className={t.sub2} /> : <ChevronDown size={14} className={t.sub2} />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && share.shareType === 'pacote' && (
                    <div className={`px-5 pb-5 pt-2 ${t.expanded}`}>
                      <div className={`flex flex-wrap gap-4 mb-4 text-xs ${t.sub}`}>
                        <span>Criado: <strong className={isDark ? 'text-white' : 'text-neutral-800'}>{fmtDateTime(share.createdAt)}</strong></span>
                        <span>Código: <strong className={isDark ? 'text-white' : 'text-neutral-800'}>{share.code}</strong></span>
                      </div>

                      {!share.leads?.length ? (
                        <div className={`rounded-lg border p-5 text-center ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'}`}>
                          <Clock size={20} className={`mx-auto mb-2 ${t.sub2}`} />
                          <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-700'}`}>Aguardando interesse</p>
                          <p className={`text-xs mt-1 ${t.sub}`}>O cliente ainda não demonstrou interesse neste pacote.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {share.leads.map((lead, li) => (
                            <div key={li} className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-neutral-50'}`}>
                              {/* Lead header */}
                              <div className={`px-4 py-3 flex items-center justify-between border-b ${isDark ? 'border-white/5' : 'border-neutral-100'}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDark ? 'bg-brand-orange/20 text-brand-orange' : 'bg-orange-50 text-[#C94A1A]'}`}>
                                    {(lead.nome || 'C')[0].toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{lead.nome}</div>
                                    <div className={`text-xs flex items-center gap-3 ${t.sub2}`}>
                                      {lead.empresa && <span className="flex items-center gap-1"><Building2 size={10} />{lead.empresa}</span>}
                                      {lead.telefone && <span className="flex items-center gap-1"><Phone size={10} />{lead.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {lead.duracao_meses && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${t.badge}`}>{lead.duracao_meses} meses</span>}
                                  {lead.valor_estimado > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${t.badgeGreen}`}>{fmtBRL(lead.valor_estimado)}/mês</span>}
                                  <span className={`text-[10px] ${t.sub2}`}>{timeAgo(lead.created_at)}</span>
                                  {lead.telefone && (
                                    <a
                                      href={`https://wa.me/55${lead.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${lead.nome}! Vi que você demonstrou interesse no pacote "${share.pacoteNome}". Vamos conversar?`)}`}
                                      target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors"
                                    >
                                      <MessageCircle size={10} />Falar
                                    </a>
                                  )}
                                </div>
                              </div>
                              {/* Favorite points */}
                              {share.favorites?.length > 0 && (
                                <div className="px-4 py-2 space-y-1">
                                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${t.sub2}`}>
                                    Pontos selecionados ({share.favorites.length})
                                  </p>
                                  {share.favorites.map((fav, fi) => (
                                    <div key={fi} className={`flex items-center justify-between py-1.5 text-xs ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                                      <span className="flex items-center gap-2">
                                        <Heart size={10} className="text-brand-orange shrink-0" fill="currentColor" />
                                        {fav.point_name || `Ponto #${fav.point_id}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isExpanded && share.shareType !== 'pacote' && (
                    <div className={`px-5 pb-5 pt-2 ${t.expanded}`}>
                      {/* Meta info */}
                      <div className={`flex flex-wrap gap-4 mb-4 text-xs ${t.sub}`}>
                        <span>Criado: <strong className={isDark ? 'text-white' : 'text-neutral-800'}>{fmtDateTime(share.createdAt)}</strong></span>
                        <span>Código: <strong className={isDark ? 'text-white' : 'text-neutral-800'}>{share.code}</strong></span>
                      </div>

                      {/* Client favorites */}
                      {!clientFavsData[share.code] ? (
                        <div className="flex items-center gap-2 py-4">
                          <Loader2 size={14} className="animate-spin text-brand-orange" />
                          <span className={`text-xs ${t.sub}`}>Carregando favoritos do cliente...</span>
                        </div>
                      ) : (clientFavsData[share.code].favorites || clientFavsData[share.code]).length === 0 ? (
                        <div className={`rounded-lg border p-5 text-center ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'}`}>
                          <Clock size={20} className={`mx-auto mb-2 ${t.sub2}`} />
                          <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-700'}`}>
                            Aguardando resposta {share.shareType === 'broadcast' ? 'dos clientes' : 'do cliente'}
                          </p>
                          <p className={`text-xs mt-1 ${t.sub}`}>
                            {share.shareType === 'broadcast'
                              ? 'Nenhum cliente respondeu ainda. Compartilhe o link para receber as seleções.'
                              : 'O cliente ainda não enviou seus favoritos. Envie o link por WhatsApp para agilizar.'}
                          </p>
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(`Confira nossa seleção de pontos de mídia: ${window.location.origin}/s/${share.code}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600 transition-colors"
                          >
                            <MessageCircle size={13} />
                            Enviar por WhatsApp
                          </a>
                        </div>
                      ) : share.shareType === 'broadcast' && clientFavsData[share.code].clients ? (
                        /* ── Broadcast: grouped by client ── */
                        <div className="space-y-4">
                          <p className={`text-[10px] uppercase tracking-wider font-semibold flex items-center gap-2 ${t.sub2}`}>
                            <Users size={11} className="text-purple-400" />
                            {clientFavsData[share.code].clients.length} cliente{clientFavsData[share.code].clients.length > 1 ? 's' : ''} responderam
                          </p>
                          {clientFavsData[share.code].clients.map((client, ci) => (
                            <div key={ci} className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-neutral-50'}`}>
                              {/* Client header */}
                              <div className={`px-4 py-3 flex items-center justify-between border-b ${isDark ? 'border-white/5' : 'border-neutral-100'}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-50 text-purple-700'}`}>
                                    {(client.clientName || 'C')[0].toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                      {client.clientName}
                                    </div>
                                    {client.clientContact && (
                                      <div className={`text-xs flex items-center gap-1 ${t.sub2}`}>
                                        <Phone size={10} />{client.clientContact}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-[10px] ${t.sub2}`}>{timeAgo(client.submittedAt)}</span>
                                  {client.clientContact && (
                                    <a
                                      href={`https://wa.me/${client.clientContact.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${client.clientName}! Vi que você selecionou ${client.favorites.length} pontos de mídia. Vamos conversar sobre a proposta?`)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#25D366] text-white hover:bg-[#1EB954] transition-colors"
                                    >
                                      <MessageCircle size={10} />Falar
                                    </a>
                                  )}
                                </div>
                              </div>
                              {/* Client's favorites */}
                              <div className="px-4 py-2 space-y-1">
                                {client.favorites.map((fav, fi) => (
                                  <div key={fi} className={`flex items-center justify-between py-1.5 text-xs ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                                    <span className="flex items-center gap-2">
                                      <Heart size={10} className="text-brand-orange shrink-0" fill="currentColor" />
                                      {fav.point_name || `Ponto #${fav.point_id}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* ── Commercial: flat favorites list ── */
                        <div className="space-y-2">
                          <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 flex items-center gap-2 ${t.sub2}`}>
                            <Heart size={11} className="text-brand-orange" fill="currentColor" />
                            Pontos escolhidos pelo cliente ({(clientFavsData[share.code].favorites || clientFavsData[share.code]).length})
                          </p>
                          {(clientFavsData[share.code].favorites || clientFavsData[share.code]).map((fav, i) => (
                            <div
                              key={i}
                              className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm ${
                                isDark ? 'bg-white/[0.03] border border-white/5' : 'bg-white border border-neutral-100 shadow-sm'
                              }`}
                            >
                              <span className="flex items-center gap-2.5">
                                <Heart size={12} className="text-brand-orange shrink-0" fill="currentColor" />
                                <span className={`font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                  {fav.point_name || `Ponto #${fav.point_id}`}
                                </span>
                              </span>
                              <span className={`text-xs ${t.sub2}`}>{timeAgo(fav.created_at)}</span>
                            </div>
                          ))}

                          {/* Quick WhatsApp follow-up */}
                          <div className="pt-3 flex justify-end">
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`Olá ${share.clientName || ''}! Vi que você selecionou ${(clientFavsData[share.code].favorites || clientFavsData[share.code]).length} pontos de mídia. Vamos conversar sobre a proposta?`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600 transition-colors"
                            >
                              <MessageCircle size={13} />
                              Dar follow-up no WhatsApp
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
