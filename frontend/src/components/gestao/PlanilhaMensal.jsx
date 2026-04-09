import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Save, Loader2, ChevronDown, ChevronUp, X,
  CheckSquare, Square, FileText, Calendar, DollarSign, Users, Target
} from 'lucide-react';
import {
  fetchGestaoVendas, createGestaoVenda, updateGestaoVenda,
  deleteGestaoVenda, toggleGestaoVendaStatus, fetchGestaoMetas,
  updateGestaoMeta, fetchGestaoVendedores
} from '../../lib/api';

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

const STATUS_FIELDS = [
  { key: 'status_contrato', label: 'Contrato' },
  { key: 'status_contrato_assinado', label: 'Contrato Assinado' },
  { key: 'status_conteudo', label: 'Conteúdo' },
  { key: 'status_checkin', label: 'Check-in' },
  { key: 'status_faturado', label: 'Faturado' },
  { key: 'status_excel_pastas', label: 'Excel/Pastas' },
];

const fmtCurrency = (v) => {
  const n = Number(v);
  if (!n && n !== 0) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const emptyVenda = {
  data_venda: '', cliente: '', cnpj: '', pontos_contratados: '',
  valor_mensal: '', total_contrato: '', qtde_parcelas: 1,
  previsao_veiculacao: '', data_emissao_nf: '', vencimento_boletos: '',
  contato: '', email: '', obs: '',
};

export default function PlanilhaMensal({ isDark, ano }) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [vendas, setVendas] = useState([]);
  const [vendedores, setVendedores] = useState([]); // [{username, first_name, last_name}]
  const [metas, setMetas] = useState({});
  const [loading, setLoading] = useState(false);
  const [expandedVendedor, setExpandedVendedor] = useState(null);
  const [showForm, setShowForm] = useState(null); // vendedor name
  const [formData, setFormData] = useState(emptyVenda);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingMeta, setEditingMeta] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [v, m, vds] = await Promise.all([
        fetchGestaoVendas({ ano, mes }),
        fetchGestaoMetas(ano),
        fetchGestaoVendedores(),
      ]);
      setVendas(v);
      setVendedores(vds || []);
      const metaMap = {};
      (m || []).forEach(row => {
        if (!metaMap[row.vendedor_nome]) metaMap[row.vendedor_nome] = {};
        metaMap[row.vendedor_nome][row.mes] = row.valor_meta;
      });
      setMetas(metaMap);
    } catch { /* ignore */ }
    setLoading(false);
  }, [ano, mes]);

  useEffect(() => { loadData(); }, [loadData]);

  const vendedorUsernames = useMemo(() => vendedores.map(v => v.username), [vendedores]);
  const vendedorDisplayName = useMemo(() => {
    const map = {};
    vendedores.forEach(v => {
      map[v.username] = [v.first_name, v.last_name].filter(Boolean).join(' ') || v.username;
    });
    return map;
  }, [vendedores]);

  const vendasByVendedor = useMemo(() => {
    const map = {};
    vendedorUsernames.forEach(v => { map[v] = []; });
    vendas.forEach(v => {
      const key = v.vendedor_nome || '';
      if (!map[key]) map[key] = [];
      map[key].push(v);
    });
    return map;
  }, [vendas, vendedorUsernames]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateGestaoVenda(editingId, { ...formData, vendedor_nome: showForm, ano, mes });
      } else {
        await createGestaoVenda({ ...formData, vendedor_nome: showForm, ano, mes });
      }
      setShowForm(null);
      setEditingId(null);
      setFormData(emptyVenda);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
    setSaving(false);
  };

  const handleEdit = (v) => {
    setShowForm(v.vendedor_nome);
    setEditingId(v.id);
    setFormData({
      data_venda: v.data_venda || '', cliente: v.cliente || '', cnpj: v.cnpj || '',
      pontos_contratados: v.pontos_contratados || '', valor_mensal: v.valor_mensal || '',
      total_contrato: v.total_contrato || '', qtde_parcelas: v.qtde_parcelas || 1,
      previsao_veiculacao: v.previsao_veiculacao || '', data_emissao_nf: v.data_emissao_nf || '',
      vencimento_boletos: v.vencimento_boletos || '', contato: v.contato || '',
      email: v.email || '', obs: v.obs || '',
    });
    setExpandedVendedor(v.vendedor_nome);
  };

  const handleDelete = async (id) => {
    try {
      await deleteGestaoVenda(id);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) { alert(err.message); }
  };

  const handleToggleStatus = async (vendaId, field, currentValue) => {
    try {
      await toggleGestaoVendaStatus(vendaId, field, !currentValue);
      setVendas(prev => prev.map(v =>
        v.id === vendaId ? { ...v, [field]: !currentValue ? 1 : 0 } : v
      ));
    } catch (err) { alert(err.message); }
  };

  const handleMetaSave = async (vendedor_nome) => {
    const val = editingMeta[vendedor_nome];
    if (val === undefined) return;
    try {
      await updateGestaoMeta({ vendedor_nome, ano, mes, valor_meta: Number(val) });
      setMetas(prev => ({
        ...prev,
        [vendedor_nome]: { ...(prev[vendedor_nome] || {}), [mes]: Number(val) }
      }));
      setEditingMeta(prev => { const n = { ...prev }; delete n[vendedor_nome]; return n; });
    } catch (err) { alert(err.message); }
  };

  const bg = isDark ? 'bg-gray-900' : 'bg-white';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-gray-50';
  const border = isDark ? 'border-gray-700' : 'border-gray-200';
  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300';
  const hoverBg = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

  return (
    <div className={`space-y-4 ${text}`}>
      {/* Month selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold">Mês:</span>
        {MESES.map((m, i) => (
          <button
            key={m}
            onClick={() => setMes(i + 1)}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
              mes === i + 1
                ? 'bg-blue-600 text-white'
                : `${cardBg} ${text} ${hoverBg} border ${border}`
            }`}
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 className="animate-spin" size={20} />
          <span>Carregando...</span>
        </div>
      )}

      {!loading && vendedorUsernames.map(vendedor => {
        const items = vendasByVendedor[vendedor] || [];
        const totalMensal = items.reduce((s, v) => s + Number(v.valor_mensal || 0), 0);
        const totalContrato = items.reduce((s, v) => s + Number(v.total_contrato || 0), 0);
        const meta = metas?.[vendedor]?.[mes] || 0;
        const pct = meta > 0 ? Math.round((totalMensal / meta) * 100) : 0;
        const isExpanded = expandedVendedor === vendedor;

        return (
          <div key={vendedor} className={`rounded-xl border ${border} overflow-hidden`}>
            {/* Vendedor header */}
            <button
              onClick={() => setExpandedVendedor(isExpanded ? null : vendedor)}
              className={`w-full flex items-center justify-between px-5 py-4 ${cardBg} ${hoverBg} transition-colors`}
            >
              <div className="flex items-center gap-3">
                <Users size={18} className="text-blue-500" />
                <span className="font-bold text-lg">{vendedorDisplayName[vendedor] || vendedor}</span>
                <span className={`text-sm ${textMuted}`}>
                  {items.length} venda{items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {/* Meta */}
                <div className="flex items-center gap-1 text-sm">
                  <Target size={14} className="text-amber-500" />
                  {editingMeta[vendedor] !== undefined ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        type="number"
                        value={editingMeta[vendedor]}
                        onChange={e => setEditingMeta(prev => ({ ...prev, [vendedor]: e.target.value }))}
                        className={`w-28 px-2 py-0.5 rounded text-sm ${inputBg}`}
                        onKeyDown={e => e.key === 'Enter' && handleMetaSave(vendedor)}
                      />
                      <button onClick={() => handleMetaSave(vendedor)} className="text-green-500 hover:text-green-400">
                        <Save size={14} />
                      </button>
                    </div>
                  ) : (
                    <span
                      className="cursor-pointer hover:underline"
                      onClick={e => { e.stopPropagation(); setEditingMeta(prev => ({ ...prev, [vendedor]: meta })); }}
                    >
                      Meta: {fmtCurrency(meta)}
                    </span>
                  )}
                </div>
                {/* Totals */}
                <div className="text-sm">
                  <span className="text-green-500 font-semibold">{fmtCurrency(totalMensal)}</span>
                  {meta > 0 && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      pct >= 100 ? 'bg-green-600 text-white' : pct >= 50 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                      {pct}%
                    </span>
                  )}
                </div>
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
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
                  <div className="p-4 space-y-3">
                    {/* Table */}
                    {items.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className={`${textMuted} border-b ${border}`}>
                              {STATUS_FIELDS.map(sf => (
                                <th key={sf.key} className="px-1 py-2 text-center whitespace-nowrap" title={sf.label}>
                                  {sf.label.slice(0, 5)}
                                </th>
                              ))}
                              <th className="px-2 py-2 text-left">Data</th>
                              <th className="px-2 py-2 text-left">Cliente</th>
                              <th className="px-2 py-2 text-left">CNPJ</th>
                              <th className="px-2 py-2 text-left">Pontos</th>
                              <th className="px-2 py-2 text-right">V. Mensal</th>
                              <th className="px-2 py-2 text-right">Total</th>
                              <th className="px-2 py-2 text-center">Parc.</th>
                              <th className="px-2 py-2 text-left">Veiculação</th>
                              <th className="px-2 py-2 text-left">NF</th>
                              <th className="px-2 py-2 text-left">Boletos</th>
                              <th className="px-2 py-2 text-left">Contato</th>
                              <th className="px-2 py-2 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(v => (
                              <tr key={v.id} className={`border-b ${border} ${hoverBg} transition-colors`}>
                                {STATUS_FIELDS.map(sf => (
                                  <td key={sf.key} className="px-1 py-2 text-center">
                                    <button onClick={() => handleToggleStatus(v.id, sf.key, v[sf.key])} className="transition-colors">
                                      {v[sf.key] ? (
                                        <CheckSquare size={16} className="text-green-500" />
                                      ) : (
                                        <Square size={16} className={textMuted} />
                                      )}
                                    </button>
                                  </td>
                                ))}
                                <td className="px-2 py-2 whitespace-nowrap">{v.data_venda || '—'}</td>
                                <td className="px-2 py-2 font-medium max-w-[150px] truncate">{v.cliente}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-xs">{v.cnpj || '—'}</td>
                                <td className="px-2 py-2 max-w-[120px] truncate text-xs">{v.pontos_contratados || '—'}</td>
                                <td className="px-2 py-2 text-right text-green-500 font-medium whitespace-nowrap">{fmtCurrency(v.valor_mensal)}</td>
                                <td className="px-2 py-2 text-right whitespace-nowrap">{fmtCurrency(v.total_contrato)}</td>
                                <td className="px-2 py-2 text-center">{v.qtde_parcelas || 1}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-xs">{v.previsao_veiculacao || '—'}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-xs">{v.data_emissao_nf || '—'}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-xs">{v.vencimento_boletos || '—'}</td>
                                <td className="px-2 py-2 max-w-[120px] truncate text-xs" title={v.email ? `${v.contato} / ${v.email}` : v.contato}>
                                  {v.contato || '—'}
                                </td>
                                <td className="px-2 py-2 text-center whitespace-nowrap">
                                  <button onClick={() => handleEdit(v)} className="text-blue-500 hover:text-blue-400 mr-2" title="Editar">
                                    <FileText size={14} />
                                  </button>
                                  {deleteConfirm === v.id ? (
                                    <span className="text-xs">
                                      <button onClick={() => handleDelete(v.id)} className="text-red-500 hover:text-red-400 font-bold mr-1">Sim</button>
                                      <button onClick={() => setDeleteConfirm(null)} className={textMuted}>Não</button>
                                    </span>
                                  ) : (
                                    <button onClick={() => setDeleteConfirm(v.id)} className="text-red-500 hover:text-red-400" title="Excluir">
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className={`font-bold border-t-2 ${border}`}>
                              <td colSpan={10} className="px-2 py-2 text-right">TOTAL:</td>
                              <td className="px-2 py-2 text-right text-green-500 whitespace-nowrap">{fmtCurrency(totalMensal)}</td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">{fmtCurrency(totalContrato)}</td>
                              <td colSpan={5}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {items.length === 0 && (
                      <p className={`text-center py-4 ${textMuted}`}>Nenhuma venda registrada neste mês.</p>
                    )}

                    {/* Add / Edit form */}
                    {showForm === vendedor ? (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 rounded-lg border ${border} ${cardBg} space-y-3`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{editingId ? 'Editar Venda' : 'Nova Venda'}</h4>
                          <button onClick={() => { setShowForm(null); setEditingId(null); setFormData(emptyVenda); }}>
                            <X size={16} className={textMuted} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { key: 'data_venda', label: 'Data da Venda', type: 'date' },
                            { key: 'cliente', label: 'Cliente', required: true },
                            { key: 'cnpj', label: 'CNPJ' },
                            { key: 'pontos_contratados', label: 'Pontos Contratados' },
                            { key: 'valor_mensal', label: 'Valor Mensal', type: 'number' },
                            { key: 'total_contrato', label: 'Total Contrato', type: 'number' },
                            { key: 'qtde_parcelas', label: 'Qtde Parcelas', type: 'number' },
                            { key: 'previsao_veiculacao', label: 'Previsão Veiculação' },
                            { key: 'data_emissao_nf', label: 'Data Emissão NF', type: 'date' },
                            { key: 'vencimento_boletos', label: 'Vencimento Boletos' },
                            { key: 'contato', label: 'Contato' },
                            { key: 'email', label: 'Email', type: 'email' },
                          ].map(f => (
                            <div key={f.key}>
                              <label className={`block text-xs mb-1 ${textMuted}`}>{f.label}{f.required && ' *'}</label>
                              <input
                                type={f.type || 'text'}
                                value={formData[f.key]}
                                onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                                className={`w-full px-3 py-1.5 rounded text-sm ${inputBg} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
                              />
                            </div>
                          ))}
                          <div className="col-span-2 md:col-span-4">
                            <label className={`block text-xs mb-1 ${textMuted}`}>Observações</label>
                            <textarea
                              value={formData.obs}
                              onChange={e => setFormData(prev => ({ ...prev, obs: e.target.value }))}
                              rows={2}
                              className={`w-full px-3 py-1.5 rounded text-sm ${inputBg} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setShowForm(null); setEditingId(null); setFormData(emptyVenda); }} className={`px-4 py-1.5 rounded text-sm ${textMuted} ${hoverBg}`}>
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
                    ) : (
                      <button
                        onClick={() => { setShowForm(vendedor); setEditingId(null); setFormData(emptyVenda); }}
                        className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-400"
                      >
                        <Plus size={14} /> Adicionar venda
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
