import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, CheckCircle2, XCircle, RotateCcw, Clock, ChevronDown, ChevronUp, MessageCircle, Circle } from 'lucide-react';
import { fetchVendas, updateVendaStatus, fetchVendaEtapas } from '../../lib/api';

// Definição ordenada das etapas pós-venda
const ETAPAS_DEF = [
  { key: 'contrato_enviado',  label: 'Contrato Enviado',    emoji: '📤' },
  { key: 'contrato_assinado', label: 'Contrato Assinado',   emoji: '✅' },
  { key: 'cobranca_material', label: 'Cobrança de Material', emoji: '📦' },
  { key: 'material_recebido', label: 'Material Recebido',   emoji: '🎨' },
  { key: 'veiculando',        label: 'Veiculando',          emoji: '📡' },
];

const STATUS_CONFIG = {
  ativa:     { label: 'Ativa',     light: 'bg-green-50 text-green-700 border-green-200',   dark: 'bg-green-500/10 text-green-400 border-green-500/20' },
  renovada:  { label: 'Renovada',  light: 'bg-blue-50 text-blue-700 border-blue-200',     dark: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  cancelada: { label: 'Cancelada', light: 'bg-red-50 text-red-700 border-red-200',        dark: 'bg-red-500/10 text-red-400 border-red-500/20' },
  pendente:  { label: 'Pendente',  light: 'bg-yellow-50 text-yellow-700 border-yellow-200', dark: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
};

const WA_STATUS = {
  enviado:         { label: 'Enviado',        light: 'text-green-600',  dark: 'text-green-400' },
  pendente:        { label: 'Pendente',       light: 'text-yellow-600', dark: 'text-yellow-400' },
  erro:            { label: 'Erro',           light: 'text-red-500',    dark: 'text-red-400' },
  nao_configurado: { label: 'Não config.',    light: 'text-neutral-400',dark: 'text-brand-gray-500' },
};

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function parsePontos(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch { return [str]; }
}

function StatusBadge({ status, isDark }) {
  const cfg = STATUS_CONFIG[status] || { label: status, light: 'bg-neutral-100 text-neutral-600 border-neutral-200', dark: 'bg-white/10 text-brand-gray-400 border-white/10' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${isDark ? cfg.dark : cfg.light}`}>
      {cfg.label}
    </span>
  );
}

function StatusModal({ venda, isDark, onClose, onSaved }) {
  const [status, setStatus] = useState(venda.status || 'ativa');
  const [obs, setObs] = useState(venda.obs || '');
  const [saving, setSaving] = useState(false);

  const overlay = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
  const modal = `w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4 border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`;
  const inp = `w-full rounded-xl border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`;

  async function handleSave() {
    setSaving(true);
    try {
      await updateVendaStatus(venda.id, { status, obs });
      onSaved();
      onClose();
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={overlay}>
      <div className={modal}>
        <div>
          <h3 className="text-base font-semibold">Atualizar venda</h3>
          <p className={`text-sm mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>{venda.razao_social}</p>
        </div>

        <div className="space-y-1.5">
          <label className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Status</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const active = status === key;
              const base = isDark ? cfg.dark : cfg.light;
              return (
                <button
                  key={key}
                  onClick={() => setStatus(key)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                    active
                      ? `${base} ring-2 ring-offset-1 ${isDark ? 'ring-white/20 ring-offset-[#111]' : 'ring-neutral-300 ring-offset-white'}`
                      : isDark
                        ? 'border-white/10 text-brand-gray-400 hover:border-white/20 hover:text-white'
                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Observação (opcional)</label>
          <textarea className={inp} rows={3} placeholder="Ex: Renovação por mais 12 meses, cliente pediu pausa..." value={obs} onChange={e => setObs(e.target.value)} />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className={`flex-1 py-2 rounded-xl border text-sm transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-xl bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function VendaRow({ venda, isDark, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [etapas, setEtapas] = useState([]);
  const pontos = parsePontos(venda.pontos_nomes);

  useEffect(() => {
    if (!expanded) return;
    fetchVendaEtapas(venda.id).then(setEtapas).catch(() => {});
  }, [expanded, venda.id]);
  const waCfg = WA_STATUS[venda.whatsapp_status] || { label: venda.whatsapp_status, light: 'text-neutral-400', dark: 'text-brand-gray-500' };
  const waColor = isDark ? waCfg.dark : waCfg.light;

  const rowBase = `transition-colors ${isDark ? 'border-white/5 hover:bg-white/[0.03]' : 'border-neutral-100 hover:bg-neutral-50'}`;
  const td = `px-4 py-3`;
  const textSm = isDark ? 'text-white' : 'text-neutral-800';
  const textXs = isDark ? 'text-brand-gray-400' : 'text-neutral-500';
  const expandBg = isDark ? 'bg-white/[0.02]' : 'bg-neutral-50';
  const expandBorder = isDark ? 'border-white/5' : 'border-neutral-100';

  return (
    <>
      <tr className={rowBase}>
        <td className={`${td} text-xs ${textXs} whitespace-nowrap`}>{fmtDate(venda.created_at)}</td>
        <td className={td}>
          <div className={`font-medium text-sm ${textSm}`}>{venda.razao_social}</div>
          {venda.cnpj && <div className={`text-xs ${textXs}`}>{venda.cnpj}</div>}
        </td>
        <td className={`${td} text-sm ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'} whitespace-nowrap`}>
          {venda.valor_mensal ? `R$ ${venda.valor_mensal}` : '—'}
        </td>
        <td className={`${td} text-xs ${textXs} whitespace-nowrap`}>{venda.vendedor_nome || '—'}</td>
        <td className={td}><StatusBadge status={venda.status || 'ativa'} isDark={isDark} /></td>
        <td className={td}>
          <span className={`text-xs flex items-center gap-1 ${waColor}`}>
            <MessageCircle size={12} />
            {waCfg.label}
          </span>
        </td>
        <td className={td}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(venda)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${isDark ? 'border-white/10 text-brand-gray-300 hover:bg-white/5 hover:border-white/20' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'}`}
            >
              Atualizar
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className={`p-1 rounded-lg transition-colors ${isDark ? 'text-brand-gray-500 hover:bg-white/5' : 'text-neutral-400 hover:bg-neutral-100'}`}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className={expandBg}>
          <td colSpan={7} className={`px-4 pb-3 pt-0`}>
            <div className={`grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs pt-2.5 border-t mt-1 ${expandBorder}`}>
              {[
                ['Tipo', venda.tipo],
                ['Período', venda.periodo || '—'],
                ['Pagamento', [venda.dia_pagamento, venda.forma_pagamento].filter(Boolean).join(' · ')],
                ['Responsável', [venda.responsavel_nome, venda.responsavel_whatsapp].filter(Boolean).join(' · ')],
              ].map(([label, val]) => (
                <div key={label}>
                  <span className={`font-medium ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{label}: </span>
                  <span className={textXs}>{val || '—'}</span>
                </div>
              ))}
              {pontos.length > 0 && (
                <div className="col-span-2">
                  <span className={`font-medium ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>Pontos: </span>
                  <span className={textXs}>{pontos.join(', ')}</span>
                </div>
              )}
              {venda.obs && (
                <div className="col-span-2">
                  <span className={`font-medium ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>Obs: </span>
                  <span className={textXs}>{venda.obs}</span>
                </div>
              )}
              {venda.whatsapp_error && (
                <div className={`col-span-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  <span className="font-medium">Erro WhatsApp: </span>{venda.whatsapp_error}
                </div>
              )}
            </div>
            {/* Checklist de etapas pós-venda */}
            <div className={`pt-2.5 mt-2 border-t ${expandBorder}`}>
              <p className={`text-xs font-medium mb-1.5 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>Etapas pós-venda</p>
              <div className="flex flex-wrap gap-1.5">
                {ETAPAS_DEF.map(etapa => {
                  const done = etapas.find(e => e.etapa_key === etapa.key);
                  return (
                    <span
                      key={etapa.key}
                      title={done ? `Confirmado em ${fmtDate(done.confirmado_at)}` : 'Pendente'}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border select-none ${
                        done
                          ? isDark
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-green-50 text-green-700 border-green-200'
                          : isDark
                            ? 'bg-white/5 text-brand-gray-500 border-white/10'
                            : 'bg-neutral-100 text-neutral-400 border-neutral-200'
                      }`}
                    >
                      <span>{etapa.emoji}</span>
                      {etapa.label}
                      {done ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                    </span>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const STATUS_FILTERS = [
  { key: 'todas',    label: 'Todas' },
  { key: 'ativa',    label: 'Ativas' },
  { key: 'renovada', label: 'Renovadas' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'cancelada',label: 'Canceladas' },
];

const SUMMARY_ITEMS = [
  { key: 'ativa',    label: 'Ativas',    Icon: CheckCircle2, light: 'text-green-600', dark: 'text-green-400' },
  { key: 'renovada', label: 'Renovadas', Icon: RotateCcw,    light: 'text-blue-600',  dark: 'text-blue-400'  },
  { key: 'pendente', label: 'Pendentes', Icon: Clock,        light: 'text-yellow-600',dark: 'text-yellow-400'},
  { key: 'cancelada',label: 'Canceladas',Icon: XCircle,      light: 'text-red-500',   dark: 'text-red-400'   },
];

export default function VendasListTab({ isDark = true }) {
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('todas');
  const [search, setSearch] = useState('');
  const [editVenda, setEditVenda] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchVendas({ status: statusFilter, q: search.trim() });
      setVendas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const totais = vendas.reduce((acc, v) => {
    const s = v.status || 'ativa';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  // Estilos derivados do isDark
  const card = `rounded-2xl border p-4 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`;
  const tableWrap = `overflow-x-auto rounded-2xl border ${isDark ? 'border-white/10' : 'border-neutral-200 shadow-sm'}`;
  const thead = isDark ? 'bg-white/[0.04] border-b border-white/10' : 'bg-neutral-50 border-b border-neutral-200';
  const thText = `text-xs font-medium px-4 py-2.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`;
  const inp = `w-full pl-8 pr-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-orange/30 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-brand-gray-500' : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'}`;
  const titleText = isDark ? 'text-white' : 'text-neutral-900';
  const subText = isDark ? 'text-brand-gray-500' : 'text-neutral-400';
  const refreshBtn = `p-2 rounded-xl border transition-colors ${isDark ? 'border-white/10 text-brand-gray-400 hover:bg-white/5' : 'border-neutral-200 text-neutral-400 hover:bg-neutral-50'}`;
  const emptyText = isDark ? 'text-brand-gray-500' : 'text-neutral-400';

  return (
    <div className="space-y-4">
      {editVenda && (
        <StatusModal venda={editVenda} isDark={isDark} onClose={() => setEditVenda(null)} onSaved={load} />
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-base font-semibold ${titleText}`}>Histórico de Vendas</h2>
          <p className={`text-xs mt-0.5 ${subText}`}>
            {vendas.length} registro{vendas.length !== 1 ? 's' : ''} encontrado{vendas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={load} className={refreshBtn}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SUMMARY_ITEMS.map(({ key, label, Icon, light, dark }) => (
          <div key={key} className={card}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? dark : light}`}>
              <Icon size={13} />
              {label}
            </div>
            <div className={`text-2xl font-bold mt-1 ${titleText}`}>{totais[key] || 0}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
          <input
            type="text"
            placeholder="Buscar por cliente, CNPJ ou vendedor..."
            className={inp}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                statusFilter === f.key
                  ? 'bg-brand-orange text-white'
                  : isDark
                    ? 'border border-white/10 text-brand-gray-400 hover:bg-white/5 hover:text-white'
                    : 'border border-neutral-200 text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className={tableWrap}>
        <table className="w-full text-left">
          <thead className={thead}>
            <tr>
              {['Data', 'Cliente', 'Valor/mês', 'Vendedor', 'Status', 'WhatsApp', ''].map(h => (
                <th key={h} className={thText}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-neutral-100'}`}>
            {loading ? (
              <tr>
                <td colSpan={7} className={`px-4 py-10 text-center text-sm ${emptyText}`}>
                  <RefreshCw size={16} className="animate-spin inline mr-2" />
                  Carregando...
                </td>
              </tr>
            ) : vendas.length === 0 ? (
              <tr>
                <td colSpan={7} className={`px-4 py-10 text-center text-sm ${emptyText}`}>
                  Nenhuma venda encontrada.
                </td>
              </tr>
            ) : (
              vendas.map(v => (
                <VendaRow key={v.id} venda={v} isDark={isDark} onEdit={setEditVenda} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
