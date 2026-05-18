import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, RefreshCcw, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronUp, CalendarClock, FileText
} from 'lucide-react';
import { fetchGestaoRenovacoes, updateGestaoRenovacao } from '../../lib/api';

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente', color: 'amber', icon: Clock },
  { value: 'em_andamento', label: 'Em Andamento', color: 'blue', icon: RefreshCcw },
  { value: 'concluida', label: 'Concluída', color: 'green', icon: CheckCircle2 },
  { value: 'perdida', label: 'Perdida', color: 'red', icon: AlertCircle },
];

const fmtCurrency = (v) => {
  const n = Number(v);
  if (!n && n !== 0) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export default function Renovacoes({ isDark, ano }) {
  const [renovacoes, setRenovacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterMes, setFilterMes] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(new Date().getMonth() + 1);
  const [editObs, setEditObs] = useState(null); // { id, obs }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchGestaoRenovacoes({ ano, mes: filterMes });
      setRenovacoes(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [ano, filterMes]);

  useEffect(() => { loadData(); }, [loadData]);

  const byMonth = useMemo(() => {
    const map = {};
    for (let m = 1; m <= 12; m++) map[m] = [];
    renovacoes.forEach(r => {
      const m = Number(r.mes) || 1;
      if (!map[m]) map[m] = [];
      map[m].push(r);
    });
    return map;
  }, [renovacoes]);

  const summary = useMemo(() => {
    const total = renovacoes.length;
    const concluidas = renovacoes.filter(r => r.status === 'concluida').length;
    const pendentes = renovacoes.filter(r => r.status === 'pendente' || r.status === 'em_andamento').length;
    const perdidas = renovacoes.filter(r => r.status === 'perdida').length;
    const valorTotal = renovacoes.reduce((s, r) => s + Number(r.valor_mensal || 0), 0);
    const valorConcluidas = renovacoes.filter(r => r.status === 'concluida').reduce((s, r) => s + Number(r.valor_mensal || 0), 0);
    return { total, concluidas, pendentes, perdidas, valorTotal, valorConcluidas };
  }, [renovacoes]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      const ren = renovacoes.find(r => r.id === id);
      if (!ren) return;
      await updateGestaoRenovacao(id, { status: newStatus, obs: ren.obs || '' });
      setRenovacoes(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch (err) { alert(err.message); }
  };

  const handleObsSave = async (id) => {
    if (!editObs || editObs.id !== id) return;
    try {
      const ren = renovacoes.find(r => r.id === id);
      await updateGestaoRenovacao(id, { status: ren?.status || 'pendente', obs: editObs.obs });
      setRenovacoes(prev => prev.map(r => r.id === id ? { ...r, obs: editObs.obs } : r));
      setEditObs(null);
    } catch (err) { alert(err.message); }
  };

  const cardBg = isDark ? 'bg-white/[0.03] shadow-md' : 'bg-white shadow-sm';
  const border = isDark ? 'border-white/10' : 'border-neutral-200';
  const text = isDark ? 'text-white' : 'text-neutral-900';
  const textMuted = isDark ? 'text-brand-gray-400' : 'text-neutral-500';
  const inputBg = isDark ? 'bg-white/5 text-white border-white/10 placeholder:text-brand-gray-500' : 'bg-white text-neutral-900 border-neutral-200 placeholder:text-neutral-400';
  const hoverBg = isDark ? 'hover:bg-white/5' : 'hover:bg-neutral-50';

  return (
    <div className={`space-y-5 ${text}`}>
      {/* Info banner */}
      <div className={`flex items-start gap-3 p-4 rounded-xl border ${isDark ? 'border-blue-500/20 bg-blue-500/5' : 'border-blue-200 bg-blue-50'}`}>
        <CalendarClock size={18} className={isDark ? 'text-blue-400 mt-0.5 shrink-0' : 'text-blue-600 mt-0.5 shrink-0'} />
        <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
          Contratos com vencimento em <strong>{ano}</strong> — calculados automaticamente pela data da venda + duração do contrato.
          Altere o status para acompanhar cada renovação.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className={`rounded-xl border ${border} ${cardBg} p-4 text-center`}>
          <p className={`text-xs ${textMuted} mb-1`}>Total</p>
          <p className="text-2xl font-bold">{summary.total}</p>
        </div>
        <div className={`rounded-xl border ${border} ${cardBg} p-4 text-center`}>
          <p className={`text-xs ${textMuted} mb-1`}>Concluídas</p>
          <p className="text-2xl font-bold text-green-500">{summary.concluidas}</p>
        </div>
        <div className={`rounded-xl border ${border} ${cardBg} p-4 text-center`}>
          <p className={`text-xs ${textMuted} mb-1`}>Pendentes</p>
          <p className="text-2xl font-bold text-amber-500">{summary.pendentes}</p>
        </div>
        <div className={`rounded-xl border ${border} ${cardBg} p-4 text-center`}>
          <p className={`text-xs ${textMuted} mb-1`}>Perdidas</p>
          <p className="text-2xl font-bold text-red-500">{summary.perdidas}</p>
        </div>
        <div className={`rounded-xl border ${border} ${cardBg} p-4 text-center`}>
          <p className={`text-xs ${textMuted} mb-1`}>Valor Renovado</p>
          <p className="text-xl font-bold text-green-500">{fmtCurrency(summary.valorConcluidas)}</p>
          <p className={`text-xs ${textMuted}`}>de {fmtCurrency(summary.valorTotal)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold">Filtro:</span>
        <button
          onClick={() => setFilterMes(null)}
          className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
            filterMes === null ? 'bg-brand-orange text-white' : `${cardBg} ${text} ${hoverBg} border ${border}`
          }`}
        >
          TODOS
        </button>
        {MESES.map((m, i) => (
          <button
            key={m}
            onClick={() => setFilterMes(i + 1)}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
              filterMes === i + 1 ? 'bg-brand-orange text-white' : `${cardBg} ${text} ${hoverBg} border ${border}`
            }`}
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 className="animate-spin" size={20} />
          <span>Carregando renovações...</span>
        </div>
      )}

      {/* Monthly sections */}
      {!loading && (filterMes ? [filterMes] : Array.from({ length: 12 }, (_, i) => i + 1)).map(m => {
        const items = byMonth[m] || [];
        if (!filterMes && items.length === 0) return null;
        const isExpanded = expandedMonth === m;
        const conc = items.filter(r => r.status === 'concluida').length;
        const pend = items.filter(r => r.status !== 'concluida' && r.status !== 'perdida').length;

        return (
          <div key={m} className={`rounded-xl border ${border} overflow-hidden`}>
            <button
              onClick={() => setExpandedMonth(isExpanded ? null : m)}
              className={`w-full flex items-center justify-between px-5 py-3 ${cardBg} ${hoverBg}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-bold">{MESES[m - 1]}</span>
                <span className={`text-sm ${textMuted}`}>{items.length} renovaç{items.length !== 1 ? 'ões' : 'ão'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-500">{conc} concluída{conc !== 1 ? 's' : ''}</span>
                <span className="text-amber-500">{pend} pendente{pend !== 1 ? 's' : ''}</span>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {items.length === 0 ? (
                    <p className={`text-center py-4 ${textMuted}`}>Nenhum contrato vence neste mês.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={`${textMuted} border-b ${border}`}>
                            <th className="px-3 py-2 text-left">Cliente</th>
                            <th className="px-3 py-2 text-left">Pontos</th>
                            <th className="px-3 py-2 text-right">V. Mensal</th>
                            <th className="px-3 py-2 text-center">Contrato</th>
                            <th className="px-3 py-2 text-left">Vendedor</th>
                            <th className="px-3 py-2 text-center">Status</th>
                            <th className="px-3 py-2 text-left">Obs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(r => (
                            <tr key={r.id} className={`border-b ${border} ${hoverBg}`}>
                              <td className="px-3 py-2">
                                <p className="font-medium">{r.cliente}</p>
                                {r.cnpj && <p className={`text-xs ${textMuted}`}>{r.cnpj}</p>}
                              </td>
                              <td className="px-3 py-2 text-xs max-w-[140px] truncate" title={r.pontos}>{r.pontos || '—'}</td>
                              <td className="px-3 py-2 text-right text-green-500 font-medium">{fmtCurrency(r.valor_mensal)}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                                  isDark ? 'border-white/10 bg-white/5 text-brand-gray-300' : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                                }`}>
                                  <FileText size={11} />
                                  {r.qtde_parcelas || '?'} {(r.qtde_parcelas || 0) === 1 ? 'mês' : 'meses'}
                                  <span className={`ml-1 ${textMuted}`}>
                                    ({MESES[(r.venda_mes || 1) - 1]?.slice(0,3)}/{r.venda_ano})
                                  </span>
                                </span>
                              </td>
                              <td className="px-3 py-2">{r.vendedor_nome || '—'}</td>
                              <td className="px-3 py-2 text-center">
                                <select
                                  value={r.status}
                                  onChange={e => handleStatusChange(r.id, e.target.value)}
                                  className={`text-xs px-2 py-1 rounded ${inputBg} cursor-pointer`}
                                >
                                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2 min-w-[140px]">
                                {editObs?.id === r.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      value={editObs.obs}
                                      onChange={e => setEditObs({ id: r.id, obs: e.target.value })}
                                      onKeyDown={e => e.key === 'Enter' && handleObsSave(r.id)}
                                      className={`w-full text-xs px-2 py-1 rounded ${inputBg}`}
                                      autoFocus
                                    />
                                    <button onClick={() => handleObsSave(r.id)} className="text-green-500 text-xs font-bold shrink-0">OK</button>
                                    <button onClick={() => setEditObs(null)} className={`${textMuted} text-xs shrink-0`}>✕</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditObs({ id: r.id, obs: r.obs || '' })}
                                    className={`text-xs ${r.obs ? text : textMuted} hover:text-brand-orange transition-colors text-left w-full truncate`}
                                    title={r.obs || 'Clique para adicionar observação'}
                                  >
                                    {r.obs || '+ obs'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {!loading && renovacoes.length === 0 && (
        <div className={`text-center py-12 ${textMuted}`}>
          <CalendarClock size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhum contrato vence em {ano}</p>
          <p className="text-sm mt-1">Quando uma venda for registrada com período definido, ela aparecerá aqui automaticamente no mês de vencimento.</p>
        </div>
      )}
    </div>
  );
}
