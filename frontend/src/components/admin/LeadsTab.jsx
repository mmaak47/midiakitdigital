/**
 * LeadsTab.jsx
 * Admin panel tab for managing collected leads from the DOOH chatbot.
 * Shows summary cards, filterable table, and expandable navigation timeline.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Search, ChevronDown, ChevronUp, Phone, Building2, Calendar,
  MessageCircle, FileText, Monitor, Eye, Globe, Loader2,
  Users, UserPlus, UserCheck, UserX, Save, Link2, CheckCircle2
} from 'lucide-react';
import { fetchLeads, fetchLeadDetail, updateLeadStatus, linkLeadProposta, updateLeadPropostaEtapa, convertLead } from '../../lib/api';

const STATUS_OPTIONS = [
  { key: '',              label: 'Todos' },
  { key: 'novo',         label: 'Novos' },
  { key: 'em_atendimento', label: 'Em atendimento' },
  { key: 'convertido',   label: 'Convertidos' },
  { key: 'descartado',   label: 'Descartados' },
];

const STATUS_BADGE = {
  novo:            { label: 'Novo',           dark: 'bg-blue-500/20 text-blue-300 border-blue-500/30',  light: 'bg-blue-50 text-blue-700 border-blue-200' },
  em_atendimento:  { label: 'Em atendimento', dark: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', light: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  convertido:      { label: 'Convertido',     dark: 'bg-green-500/20 text-green-300 border-green-500/30',  light: 'bg-green-50 text-green-700 border-green-200' },
  descartado:      { label: 'Descartado',     dark: 'bg-red-500/20 text-red-300 border-red-500/30',     light: 'bg-red-50 text-red-700 border-red-200' },
};

const EVENT_ICONS = {
  page_view:          Globe,
  pdf_generate:       FileText,
  slides_open:        Monitor,
  chatbot_open:       MessageCircle,
  chatbot_message:    MessageCircle,
  whatsapp_click:     Phone,
  proposal_view:      Eye,
  point_detail_view:  Eye,
};

const EVENT_LABELS = {
  page_view:          'Visualizou página',
  pdf_generate:       'Gerou PDF',
  slides_open:        'Abriu slides',
  chatbot_open:       'Abriu chatbot',
  chatbot_message:    'Mensagem no chat',
  whatsapp_click:     'Clicou WhatsApp',
  proposal_view:      'Viu proposta',
  point_detail_view:  'Viu detalhe do ponto',
};

const LEAD_ETAPA_OPTIONS = ['criada', 'enviada', 'visualizada', 'aprovada', 'convertida', 'perdida'];
const LEAD_ETAPA_LABELS = {
  criada: 'Criada',
  enviada: 'Enviada',
  visualizada: 'Visualizada',
  aprovada: 'Aprovada',
  convertida: 'Convertida',
  perdida: 'Perdida',
};

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Badge({ status, isDark }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.novo;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${isDark ? cfg.dark : cfg.light}`}>
      {cfg.label}
    </span>
  );
}

function LeadLinkEtapaBadge({ etapa, isDark }) {
  const value = String(etapa || 'enviada');
  const clsMap = {
    criada: isDark ? 'bg-neutral-600/30 text-neutral-200 border-neutral-500/40' : 'bg-neutral-100 text-neutral-700 border-neutral-300',
    enviada: isDark ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-200',
    visualizada: isDark ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-cyan-50 text-cyan-700 border-cyan-200',
    aprovada: isDark ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200',
    convertida: isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
    perdida: isDark ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${clsMap[value] || clsMap.enviada}`}>
      {LEAD_ETAPA_LABELS[value] || value}
    </span>
  );
}

// ── Expandable lead row ────────────────────────────────────────────────────
function LeadRow({ lead, isDark, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState([]);
  const [links, setLinks] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [editStatus, setEditStatus] = useState(lead.status);
  const [editNotas, setEditNotas] = useState(lead.notas || '');
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [savingEtapaId, setSavingEtapaId] = useState(null);
  const [convertingId, setConvertingId] = useState(null);
  const [linkTipo, setLinkTipo] = useState('publica');
  const [linkToken, setLinkToken] = useState('');
  const [linkPropostaId, setLinkPropostaId] = useState('');
  const [linkObservacao, setLinkObservacao] = useState('');

  useEffect(() => {
    if (!expanded) return;
    setLoadingEvents(true);
    fetchLeadDetail(lead.id)
      .then(data => {
        setEvents(data.events || []);
        setLinks(data.links || []);
      })
      .catch(() => {
        setEvents([]);
        setLinks([]);
      })
      .finally(() => setLoadingEvents(false));
  }, [expanded, lead.id]);

  async function reloadLeadDetails() {
    setLoadingEvents(true);
    try {
      const data = await fetchLeadDetail(lead.id);
      setEvents(data.events || []);
      setLinks(data.links || []);
    } catch {
      setEvents([]);
      setLinks([]);
    }
    setLoadingEvents(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateLeadStatus(lead.id, { status: editStatus, notas: editNotas });
      onStatusChange();
    } catch { /* silent */ }
    setSaving(false);
  }

  async function handleLinkProposal() {
    setLinking(true);
    try {
      const payload = {
        proposta_tipo: linkTipo,
        etapa: 'enviada',
        observacao: linkObservacao,
      };
      if (linkTipo === 'publica') payload.token = linkToken;
      if (linkTipo === 'interna') payload.proposta_id = Number(linkPropostaId || 0);
      await linkLeadProposta(lead.id, payload);
      setLinkToken('');
      setLinkPropostaId('');
      setLinkObservacao('');
      await reloadLeadDetails();
      onStatusChange();
    } catch (error) {
      alert(error?.message || 'Erro ao vincular proposta.');
    }
    setLinking(false);
  }

  async function handleUpdateEtapa(linkId, etapa) {
    setSavingEtapaId(linkId);
    try {
      await updateLeadPropostaEtapa(lead.id, linkId, { etapa });
      await reloadLeadDetails();
      onStatusChange();
    } catch (error) {
      alert(error?.message || 'Erro ao atualizar etapa.');
    }
    setSavingEtapaId(null);
  }

  async function handleConvertFromLink(linkId) {
    setConvertingId(linkId);
    try {
      await convertLead(lead.id, { link_id: linkId });
      setEditStatus('convertido');
      await reloadLeadDetails();
      onStatusChange();
    } catch (error) {
      alert(error?.message || 'Erro ao converter lead.');
    }
    setConvertingId(null);
  }

  const rowBg = isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-neutral-50';
  const cellText = isDark ? 'text-brand-gray-300' : 'text-neutral-700';
  const mutedText = isDark ? 'text-brand-gray-500' : 'text-neutral-400';
  const expandBg = isDark ? 'bg-white/[0.02]' : 'bg-neutral-50/70';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500 focus:ring-brand-orange/30'
    : 'bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:ring-brand-orange/30';

  return (
    <>
      <tr className={`${rowBg} cursor-pointer transition-colors`} onClick={() => setExpanded(e => !e)}>
        <td className={`px-4 py-3 text-xs ${mutedText}`}>{fmtDate(lead.created_at)}</td>
        <td className={`px-4 py-3 text-sm font-medium ${cellText}`}>{lead.empresa}</td>
        <td className={`px-4 py-3 text-sm ${cellText}`}>{lead.telefone}</td>
        <td className="px-4 py-3"><Badge status={lead.status} isDark={isDark} /></td>
        <td className={`px-4 py-3 text-xs text-center ${mutedText}`}>{lead.event_count ?? 0}</td>
        <td className="px-4 py-3 text-right">
          {expanded ? <ChevronUp size={14} className={mutedText} /> : <ChevronDown size={14} className={mutedText} />}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={6} className={`px-4 py-4 ${expandBg}`}>
            {/* Lead extra info row */}
            {(lead.orcamento || lead.origem || lead.ultima_mensagem) && (
              <div className={`mb-3 p-3 rounded-xl border grid grid-cols-1 sm:grid-cols-3 gap-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-white'}`}>
                {lead.orcamento && (
                  <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${mutedText}`}>Orçamento</p>
                    <p className={`text-xs ${cellText}`}>{lead.orcamento}</p>
                  </div>
                )}
                {lead.origem && (
                  <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${mutedText}`}>Como soube</p>
                    <p className={`text-xs ${cellText}`}>{lead.origem}</p>
                  </div>
                )}
                {lead.ultima_mensagem && (
                  <div className="sm:col-span-3">
                    <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${mutedText}`}>Última mensagem no chat</p>
                    <p className={`text-xs italic ${cellText}`}>"{lead.ultima_mensagem}"</p>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Status + Notas */}
              <div className="space-y-3">
                <div>
                  <label className={`text-xs font-medium ${mutedText}`}>Status</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {STATUS_OPTIONS.filter(s => s.key).map(s => (
                      <button
                        key={s.key}
                        onClick={(e) => { e.stopPropagation(); setEditStatus(s.key); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          editStatus === s.key
                            ? 'bg-brand-orange text-white border-brand-orange'
                            : isDark
                              ? 'border-white/10 text-brand-gray-400 hover:border-brand-orange/40'
                              : 'border-neutral-200 text-neutral-600 hover:border-brand-orange/40'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={`text-xs font-medium ${mutedText}`}>Notas</label>
                  <textarea
                    value={editNotas}
                    onChange={e => setEditNotas(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    rows={3}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                    placeholder="Anotações sobre este lead..."
                  />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSave(); }}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-orange text-white hover:bg-brand-orange-hover disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Salvar
                </button>

                <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-white'}`} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 size={14} className="text-brand-orange" />
                    <p className={`text-xs font-semibold ${cellText}`}>Vincular proposta</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {['publica', 'interna'].map((tipo) => (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => setLinkTipo(tipo)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            linkTipo === tipo
                              ? 'bg-brand-orange text-white border-brand-orange'
                              : isDark
                                ? 'border-white/10 text-brand-gray-400 hover:border-brand-orange/40'
                                : 'border-neutral-200 text-neutral-600 hover:border-brand-orange/40'
                          }`}
                        >
                          {tipo === 'publica' ? 'Link público' : 'Proposta interna'}
                        </button>
                      ))}
                    </div>

                    {linkTipo === 'publica' ? (
                      <input
                        value={linkToken}
                        onChange={(e) => setLinkToken(e.target.value.replace(/[^a-fA-F0-9]/g, ''))}
                        className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-2 ${inputCls}`}
                        placeholder="Token da proposta pública (hex)"
                      />
                    ) : (
                      <input
                        value={linkPropostaId}
                        onChange={(e) => setLinkPropostaId(e.target.value.replace(/\D/g, ''))}
                        className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-2 ${inputCls}`}
                        placeholder="ID da proposta interna"
                      />
                    )}

                    <input
                      value={linkObservacao}
                      onChange={(e) => setLinkObservacao(e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-2 ${inputCls}`}
                      placeholder="Observação (opcional)"
                    />

                    <button
                      type="button"
                      disabled={linking || (linkTipo === 'publica' ? !linkToken : !linkPropostaId)}
                      onClick={handleLinkProposal}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-brand-orange text-white hover:bg-brand-orange-hover disabled:opacity-50"
                    >
                      {linking ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                      Vincular
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Navigation timeline */}
              <div className="space-y-3">
                <div>
                  <label className={`text-xs font-medium ${mutedText}`}>Propostas vinculadas</label>
                  {links.length === 0 ? (
                    <p className={`text-xs mt-2 ${mutedText}`}>Nenhuma proposta vinculada.</p>
                  ) : (
                    <div className="mt-2 space-y-2 max-h-44 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                      {links.map((link) => {
                        const title = link.proposta_tipo === 'publica'
                          ? `Link /p/${link.proposta_token || link.proposta_token_id || '—'}`
                          : `#${link.proposta_id} ${link.proposta_titulo || 'Proposta interna'}`;

                        return (
                          <div key={link.id} className={`rounded-lg border px-2.5 py-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-white'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-xs font-medium truncate ${cellText}`}>{title}</p>
                              <LeadLinkEtapaBadge etapa={link.etapa} isDark={isDark} />
                            </div>
                            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                              {LEAD_ETAPA_OPTIONS.map((etapa) => (
                                <button
                                  key={etapa}
                                  onClick={() => handleUpdateEtapa(link.id, etapa)}
                                  disabled={savingEtapaId === link.id}
                                  className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                                    String(link.etapa) === etapa
                                      ? 'bg-brand-orange text-white border-brand-orange'
                                      : isDark
                                        ? 'border-white/10 text-brand-gray-400 hover:border-brand-orange/40'
                                        : 'border-neutral-200 text-neutral-600 hover:border-brand-orange/40'
                                  } disabled:opacity-50`}
                                >
                                  {LEAD_ETAPA_LABELS[etapa]}
                                </button>
                              ))}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className={`text-[10px] ${mutedText}`}>{fmtDateShort(link.updated_at)}</span>
                              <button
                                onClick={() => handleConvertFromLink(link.id)}
                                disabled={convertingId === link.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-green-500/40 text-green-500 hover:bg-green-500/10 disabled:opacity-50"
                              >
                                {convertingId === link.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                Converter
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                <label className={`text-xs font-medium ${mutedText}`}>Navegação</label>
                {loadingEvents ? (
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 size={14} className="animate-spin text-brand-orange" />
                    <span className={`text-xs ${mutedText}`}>Carregando...</span>
                  </div>
                ) : events.length === 0 ? (
                  <p className={`text-xs mt-2 ${mutedText}`}>Nenhum evento registrado.</p>
                ) : (
                  <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                    {events.map((ev, i) => {
                      const Icon = EVENT_ICONS[ev.event_type] || Globe;
                      const label = EVENT_LABELS[ev.event_type] || ev.event_type;
                      const extra = ev.page_url ? ` — ${ev.page_url}` : '';
                      return (
                        <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg ${isDark ? 'bg-white/[0.03]' : 'bg-white'}`}>
                          <Icon size={13} className="mt-0.5 text-brand-orange flex-shrink-0" />
                          <div className="min-w-0">
                            <span className={`text-xs ${cellText}`}>{label}{extra}</span>
                            <span className={`block text-[10px] ${mutedText}`}>{fmtDateShort(ev.created_at)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function LeadsTab({ isDark = true }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLeads({ status: statusFilter || undefined, q: search || undefined });
      setLeads(Array.isArray(data.leads) ? data.leads : Array.isArray(data) ? data : []);
    } catch {
      setLeads([]);
    }
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Summary counts (client-side from loaded data)
  const counts = leads.reduce((acc, l) => {
    acc.total++;
    if (l.status === 'novo') acc.novos++;
    if (l.status === 'em_atendimento') acc.atendimento++;
    if (l.status === 'convertido') acc.convertidos++;
    return acc;
  }, { total: 0, novos: 0, atendimento: 0, convertidos: 0 });

  // Theme helpers
  const cardBg = isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-neutral-200';
  const headerText = isDark ? 'text-white' : 'text-neutral-900';
  const mutedText = isDark ? 'text-brand-gray-500' : 'text-neutral-400';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500 focus:ring-brand-orange/30'
    : 'bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:ring-brand-orange/30';
  const tableBorder = isDark ? 'border-white/10' : 'border-neutral-200';
  const theadBg = isDark ? 'bg-white/[0.04]' : 'bg-neutral-50';
  const thText = isDark ? 'text-brand-gray-500' : 'text-neutral-500';

  const summaryCards = [
    { label: 'Total',           value: counts.total,       icon: Users,     color: isDark ? 'text-brand-gray-300' : 'text-neutral-700' },
    { label: 'Novos',           value: counts.novos,       icon: UserPlus,  color: 'text-blue-400' },
    { label: 'Em atendimento',  value: counts.atendimento, icon: UserCheck, color: 'text-yellow-400' },
    { label: 'Convertidos',     value: counts.convertidos, icon: UserCheck, color: 'text-green-400' },
  ];

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryCards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`rounded-2xl border p-4 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={15} className={c.color} />
                <span className={`text-xs ${mutedText}`}>{c.label}</span>
              </div>
              <p className={`text-2xl font-bold ${headerText}`}>{c.value}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className={`rounded-2xl border p-4 ${cardBg}`}>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${mutedText}`} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por empresa ou telefone..."
              className={`w-full pl-9 pr-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 ${inputCls}`}
            />
          </div>

          {/* Status filters */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  statusFilter === s.key
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : isDark
                      ? 'border-white/10 text-brand-gray-400 hover:border-brand-orange/40 hover:text-brand-orange'
                      : 'border-neutral-200 text-neutral-600 hover:border-brand-orange/40 hover:text-brand-orange'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={`overflow-x-auto rounded-2xl border ${tableBorder}`}>
        <table className="w-full text-left">
          <thead className={`${theadBg} border-b ${tableBorder}`}>
            <tr>
              <th className={`text-xs font-medium px-4 py-2.5 ${thText}`}>Data</th>
              <th className={`text-xs font-medium px-4 py-2.5 ${thText}`}>Empresa</th>
              <th className={`text-xs font-medium px-4 py-2.5 ${thText}`}>Telefone</th>
              <th className={`text-xs font-medium px-4 py-2.5 ${thText}`}>Status</th>
              <th className={`text-xs font-medium px-4 py-2.5 text-center ${thText}`}>Eventos</th>
              <th className={`text-xs font-medium px-4 py-2.5 ${thText}`}></th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-neutral-100'}`}>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <Loader2 size={20} className="animate-spin text-brand-orange mx-auto" />
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center text-sm ${mutedText}`}>
                  Nenhum lead encontrado.
                </td>
              </tr>
            ) : (
              leads.map(lead => (
                <LeadRow key={lead.id} lead={lead} isDark={isDark} onStatusChange={load} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
