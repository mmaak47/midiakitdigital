import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Save, Loader2, X, RefreshCcw,
  CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  fetchGestaoRenovacoes, createGestaoRenovacao,
  updateGestaoRenovacao, deleteGestaoRenovacao, fetchGestaoVendedores
} from '../../lib/api';

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

const emptyRenovacao = {
  cliente: '', cnpj: '', pontos: '', valor_mensal: '',
  vendedor_nome: '', status: 'pendente', obs: '',
};

export default function Renovacoes({ isDark, ano }) {
  const [renovacoes, setRenovacoes] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterMes, setFilterMes] = useState(null); // null = ALL
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyRenovacao);
  const [formMes, setFormMes] = useState(new Date().getMonth() + 1);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(new Date().getMonth() + 1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [data, vds] = await Promise.all([
        fetchGestaoRenovacoes({ ano, mes: filterMes }),
        fetchGestaoVendedores(),
      ]);
      setRenovacoes(data);
      setVendedores(vds || []);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateGestaoRenovacao(editingId, { ...formData });
      } else {
        await createGestaoRenovacao({ ...formData, ano, mes: formMes });
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyRenovacao);
      await loadData();
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const handleEdit = (r) => {
    setEditingId(r.id);
    setFormMes(r.mes);
    setFormData({
      cliente: r.cliente || '', cnpj: r.cnpj || '', pontos: r.pontos || '',
      valor_mensal: r.valor_mensal || '', vendedor_nome: r.vendedor_nome || '',
      status: r.status || 'pendente', obs: r.obs || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    try {
      await deleteGestaoRenovacao(id);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) { alert(err.message); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const ren = renovacoes.find(r => r.id === id);
      if (!ren) return;
      await updateGestaoRenovacao(id, { ...ren, status: newStatus });
      setRenovacoes(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch (err) { alert(err.message); }
  };

  const bg = isDark ? 'bg-gray-900' : 'bg-white';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-gray-50';
  const border = isDark ? 'border-gray-700' : 'border-gray-200';
  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300';
  const hoverBg = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

  const statusBadge = (status) => {
    const s = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];
    const Icon = s.icon;
    const colors = {
      amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      green: 'bg-green-500/20 text-green-400 border-green-500/30',
      red: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colors[s.color]}`}>
        <Icon size={12} /> {s.label}
      </span>
    );
  };

  return (
    <div className={`space-y-5 ${text}`}>
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
            filterMes === null ? 'bg-blue-600 text-white' : `${cardBg} ${text} ${hoverBg} border ${border}`
          }`}
        >
          TODOS
        </button>
        {MESES.map((m, i) => (
          <button
            key={m}
            onClick={() => setFilterMes(i + 1)}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
              filterMes === i + 1 ? 'bg-blue-600 text-white' : `${cardBg} ${text} ${hoverBg} border ${border}`
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

      {/* Add button */}
      <button
        onClick={() => { setShowForm(true); setEditingId(null); setFormData(emptyRenovacao); }}
        className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-400"
      >
        <Plus size={14} /> Nova Renovação
      </button>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`p-4 rounded-lg border ${border} ${cardBg} space-y-3`}
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">{editingId ? 'Editar Renovação' : 'Nova Renovação'}</h4>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}>
                <X size={16} className={textMuted} />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {!editingId && (
                <div>
                  <label className={`block text-xs mb-1 ${textMuted}`}>Mês *</label>
                  <select
                    value={formMes}
                    onChange={e => setFormMes(Number(e.target.value))}
                    className={`w-full px-3 py-1.5 rounded text-sm ${inputBg}`}
                  >
                    {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={`block text-xs mb-1 ${textMuted}`}>Cliente *</label>
                <input
                  value={formData.cliente}
                  onChange={e => setFormData(prev => ({ ...prev, cliente: e.target.value }))}
                  className={`w-full px-3 py-1.5 rounded text-sm ${inputBg}`}
                />
              </div>
              <div>
                <label className={`block text-xs mb-1 ${textMuted}`}>CNPJ</label>
                <input
                  value={formData.cnpj}
                  onChange={e => setFormData(prev => ({ ...prev, cnpj: e.target.value }))}
                  className={`w-full px-3 py-1.5 rounded text-sm ${inputBg}`}
                />
              </div>
              <div>
                <label className={`block text-xs mb-1 ${textMuted}`}>Pontos</label>
                <input
                  value={formData.pontos}
                  onChange={e => setFormData(prev => ({ ...prev, pontos: e.target.value }))}
                  className={`w-full px-3 py-1.5 rounded text-sm ${inputBg}`}
                />
              </div>
              <div>
                <label className={`block text-xs mb-1 ${textMuted}`}>Valor Mensal</label>
                <input
                  type="number"
                  value={formData.valor_mensal}
                  onChange={e => setFormData(prev => ({ ...prev, valor_mensal: e.target.value }))}
                  className={`w-full px-3 py-1.5 rounded text-sm ${inputBg}`}
                />
              </div>
              <div>
                <label className={`block text-xs mb-1 ${textMuted}`}>Vendedor</label>
                <select
                  value={formData.vendedor_nome}
                  onChange={e => setFormData(prev => ({ ...prev, vendedor_nome: e.target.value }))}
                  className={`w-full px-3 py-1.5 rounded text-sm ${inputBg}`}
                >
                  <option value="">— Selecione —</option>
                  {vendedores.map(v => <option key={v.username} value={v.username}>{[v.first_name, v.last_name].filter(Boolean).join(' ') || v.username}</option>)}
                </select>
              </div>
              <div>
                <label className={`block text-xs mb-1 ${textMuted}`}>Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                  className={`w-full px-3 py-1.5 rounded text-sm ${inputBg}`}
                >
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="col-span-2 md:col-span-4">
                <label className={`block text-xs mb-1 ${textMuted}`}>Observações</label>
                <textarea
                  value={formData.obs}
                  onChange={e => setFormData(prev => ({ ...prev, obs: e.target.value }))}
                  rows={2}
                  className={`w-full px-3 py-1.5 rounded text-sm ${inputBg}`}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className={`px-4 py-1.5 rounded text-sm ${textMuted}`}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.cliente}
                className="flex items-center gap-1 px-4 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    <p className={`text-center py-4 ${textMuted}`}>Nenhuma renovação neste mês.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={`${textMuted} border-b ${border}`}>
                            <th className="px-3 py-2 text-left">Cliente</th>
                            <th className="px-3 py-2 text-left">CNPJ</th>
                            <th className="px-3 py-2 text-left">Pontos</th>
                            <th className="px-3 py-2 text-right">V. Mensal</th>
                            <th className="px-3 py-2 text-left">Vendedor</th>
                            <th className="px-3 py-2 text-center">Status</th>
                            <th className="px-3 py-2 text-left">Obs</th>
                            <th className="px-3 py-2 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(r => (
                            <tr key={r.id} className={`border-b ${border} ${hoverBg}`}>
                              <td className="px-3 py-2 font-medium">{r.cliente}</td>
                              <td className="px-3 py-2 text-xs">{r.cnpj || '—'}</td>
                              <td className="px-3 py-2 text-xs max-w-[120px] truncate">{r.pontos || '—'}</td>
                              <td className="px-3 py-2 text-right text-green-500 font-medium">{fmtCurrency(r.valor_mensal)}</td>
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
                              <td className={`px-3 py-2 text-xs max-w-[150px] truncate ${textMuted}`} title={r.obs}>{r.obs || '—'}</td>
                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                <button onClick={() => handleEdit(r)} className="text-blue-500 hover:text-blue-400 mr-2 text-xs">Editar</button>
                                {deleteConfirm === r.id ? (
                                  <span className="text-xs">
                                    <button onClick={() => handleDelete(r.id)} className="text-red-500 font-bold mr-1">Sim</button>
                                    <button onClick={() => setDeleteConfirm(null)} className={textMuted}>Não</button>
                                  </span>
                                ) : (
                                  <button onClick={() => setDeleteConfirm(r.id)} className="text-red-500 hover:text-red-400 text-xs">Excluir</button>
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
    </div>
  );
}
