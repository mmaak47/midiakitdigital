import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Save, Loader2, ChevronDown, ChevronUp, X,
  CheckSquare, Square, FileText, Target, Repeat, Eye, EyeOff, MapPin
} from 'lucide-react';
import {
  fetchGestaoVendas, createGestaoVenda, updateGestaoVenda,
  deleteGestaoVenda, toggleGestaoVendaStatus,
  fetchGestaoMetas, updateGestaoMeta,
  updateGestaoMetasBatch, fetchGestaoVendedores, fetchPontos
} from '../../lib/api';

const GLOBAL_KEY = '__GLOBAL__';
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Etapas pós-venda — same as vendas page (WhatsApp-tracked)
const ETAPAS_VENDA = [
  { key: 'contrato_enviado',   label: 'Contrato Enviado',    emoji: '📤' },
  { key: 'contrato_assinado',  label: 'Contrato Assinado',   emoji: '✅' },
  { key: 'cobranca_material',  label: 'Cobrança de Material', emoji: '📦' },
  { key: 'material_recebido',  label: 'Material Recebido',    emoji: '🎨' },
  { key: 'veiculando',         label: 'Veiculando',           emoji: '📡' },
];

// For manual vendas (no venda_id): map etapa keys to local boolean columns
const ETAPA_TO_LOCAL = {
  'contrato_enviado': 'status_contrato',
  'contrato_assinado': 'status_contrato_assinado',
  'cobranca_material': 'status_conteudo',
  'material_recebido': 'status_checkin',
  'veiculando': 'status_faturado',
};

function isEtapaDone(venda, etapaKey) {
  if (venda.venda_id && Array.isArray(venda.etapas)) {
    return venda.etapas.some(e => e.etapa_key === etapaKey);
  }
  const col = ETAPA_TO_LOCAL[etapaKey];
  return col ? !!venda[col] : false;
}

const fmtCurrency = (v) => {
  const n = Number(v);
  if (!n && n !== 0) return 'R$ 0';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const pctColor = (pct) => {
  if (pct >= 100) return 'text-green-500';
  if (pct >= 75) return 'text-blue-500';
  if (pct >= 50) return 'text-amber-500';
  return 'text-red-500';
};

const pctBg = (pct) => {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 75) return 'bg-blue-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
};

const emptyVenda = {
  data_venda: '', cliente: '', cnpj: '', pontos_contratados: '',
  valor_mensal: '', total_contrato: '', qtde_parcelas: 1,
  previsao_veiculacao: '', data_emissao_nf: '', vencimento_boletos: '',
  contato: '', email: '', obs: '',
};

/* ─── Progress Card ──────────────────────────────────── */
function ProgressCard({ title, subtitle, icon, accentBorder, meta, real, pct, isDark, cardBg, text, textMuted }) {
  const hasMeta = meta > 0;
  const diff = real - meta;
  const barBg = isDark ? 'bg-gray-700' : 'bg-gray-200';

  return (
    <div className={`rounded-2xl border-2 ${hasMeta ? accentBorder : 'border-dashed border-gray-400'} ${cardBg} p-5`}>
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <div>
          <p className={`font-bold text-base ${text}`}>{title}</p>
          <p className={`text-xs ${textMuted}`}>{subtitle}</p>
        </div>
      </div>
      {hasMeta ? (
        <>
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className={`text-xs ${textMuted}`}>Meta</p>
              <p className={`text-xl font-bold ${text}`}>{fmtCurrency(meta)}</p>
            </div>
            <p className={`text-2xl font-black ${pctColor(pct)}`}>{pct}%</p>
          </div>
          <div className={`w-full h-4 rounded-full ${barBg} mb-3 overflow-hidden`}>
            <div className={`h-full rounded-full ${pctBg(pct)} transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className={`text-xs ${textMuted}`}>Realizado</p>
              <p className={`text-lg font-bold ${real >= meta ? 'text-green-500' : text}`}>{fmtCurrency(real)}</p>
            </div>
            <div className="text-right">
              <p className={`text-xs ${textMuted}`}>Diferença</p>
              <p className={`text-sm font-semibold ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {diff >= 0 ? '+' : ''}{fmtCurrency(diff)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-3">
          {real > 0 && <p className="text-lg font-bold text-green-500 mb-1">{fmtCurrency(real)} vendido</p>}
          <p className={`text-sm ${textMuted}`}>Meta não definida</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/*         MAIN UNIFIED COMPONENT                        */
/* ═══════════════════════════════════════════════════════ */
export default function GestaoUnificada({ isDark, ano }) {
  const currentMonth = new Date().getMonth() + 1;
  const [mes, setMes] = useState(currentMonth);
  const [vendas, setVendas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [metas, setMetas] = useState({});       // {vendedor_nome: {mes: valor}}
  const [metasRecorr, setMetasRecorr] = useState({});
  const [loading, setLoading] = useState(false);

  // CRUD
  const [expandedVendedor, setExpandedVendedor] = useState(null);
  const [showForm, setShowForm] = useState(null);
  const [formData, setFormData] = useState(emptyVenda);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Global meta editing
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaParcelaInput, setMetaParcelaInput] = useState('');
  const [metaRecorrInput, setMetaRecorrInput] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  // Sale detail expand
  const [detailSaleId, setDetailSaleId] = useState(null);

  // Pontos
  const [availablePontos, setAvailablePontos] = useState([]);
  const [pontoSearch, setPontoSearch] = useState('');
  const [showPontoDropdown, setShowPontoDropdown] = useState(false);
  const pontoDropdownRef = useRef(null);

  /* ─── Load Data ─── */
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
      const metaMap = {}, metaRecorrMap = {};
      (m || []).forEach(row => {
        if (!metaMap[row.vendedor_nome]) metaMap[row.vendedor_nome] = {};
        metaMap[row.vendedor_nome][row.mes] = Number(row.valor_meta || 0);
        if (!metaRecorrMap[row.vendedor_nome]) metaRecorrMap[row.vendedor_nome] = {};
        metaRecorrMap[row.vendedor_nome][row.mes] = Number(row.valor_meta_recorrencia || 0);
      });
      setMetas(metaMap);
      setMetasRecorr(metaRecorrMap);
    } catch { /* ignore */ }
    setLoading(false);
  }, [ano, mes]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { fetchPontos().then(pts => setAvailablePontos(pts || [])).catch(() => {}); }, []);

  /* ─── Derived ─── */
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

  // Global meta for selected month
  const globalMeta = useMemo(() => ({
    parcela: Number(metas?.[GLOBAL_KEY]?.[mes] || 0),
    recorrencia: Number(metasRecorr?.[GLOBAL_KEY]?.[mes] || 0),
  }), [metas, metasRecorr, mes]);

  // Totals for selected month
  const monthTotals = useMemo(() => {
    let mensal = 0, contrato = 0;
    vendas.forEach(v => { mensal += Number(v.valor_mensal || 0); contrato += Number(v.total_contrato || 0); });
    return { mensal, contrato };
  }, [vendas]);

  const pctP = globalMeta.parcela > 0 ? Math.round((monthTotals.mensal / globalMeta.parcela) * 100) : 0;
  const pctR = globalMeta.recorrencia > 0 ? Math.round((monthTotals.contrato / globalMeta.recorrencia) * 100) : 0;

  /* ─── Meta Save ─── */
  const startEditMeta = () => {
    setMetaParcelaInput(globalMeta.parcela || '');
    setMetaRecorrInput(globalMeta.recorrencia || '');
    setEditingMeta(true);
  };

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    try {
      await updateGestaoMetasBatch([{
        vendedor_nome: GLOBAL_KEY, ano, mes,
        valor_meta: Number(metaParcelaInput) || 0,
        valor_meta_recorrencia: Number(metaRecorrInput) || 0,
      }]);
      setEditingMeta(false);
      await loadData();
    } catch (err) { alert('Erro ao salvar: ' + err.message); }
    setSavingMeta(false);
  };

  /* ─── Venda CRUD ─── */
  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateGestaoVenda(editingId, { ...formData, vendedor_nome: showForm, ano, mes });
      } else {
        await createGestaoVenda({ ...formData, vendedor_nome: showForm, ano, mes });
      }
      setShowForm(null); setEditingId(null); setFormData(emptyVenda);
      await loadData();
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const handleEdit = (v) => {
    setShowForm(v.vendedor_nome); setEditingId(v.id);
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
    try { await deleteGestaoVenda(id); setDeleteConfirm(null); await loadData(); } catch (err) { alert(err.message); }
  };

  const handleToggleStatus = async (vendaId, etapaKey, currentValue) => {
    try {
      await toggleGestaoVendaStatus(vendaId, etapaKey, !currentValue);
      // Optimistic update
      setVendas(prev => prev.map(v => {
        if (v.id !== vendaId) return v;
        if (v.venda_id && Array.isArray(v.etapas)) {
          // Linked venda: toggle in etapas array
          const exists = v.etapas.some(e => e.etapa_key === etapaKey);
          const newEtapas = exists
            ? v.etapas.filter(e => e.etapa_key !== etapaKey)
            : [...v.etapas, { etapa_key: etapaKey, etapa_label: etapaKey }];
          return { ...v, etapas: newEtapas };
        }
        // Manual venda: toggle local boolean
        const col = ETAPA_TO_LOCAL[etapaKey];
        return col ? { ...v, [col]: !currentValue ? 1 : 0 } : v;
      }));
    } catch (err) { alert(err.message); }
  };

  const togglePonto = (nome) => {
    const names = formData.pontos_contratados ? formData.pontos_contratados.split(',').map(s => s.trim()).filter(Boolean) : [];
    const idx = names.indexOf(nome);
    const newNames = idx === -1 ? [...names, nome] : names.filter((_, i) => i !== idx);
    setFormData(prev => ({ ...prev, pontos_contratados: newNames.join(', ') }));
  };

  /* ─── Styles ─── */
  const cardBg = isDark ? 'bg-gray-800' : 'bg-gray-50';
  const border = isDark ? 'border-gray-700' : 'border-gray-200';
  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300';
  const hoverBg = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

  /* ═══════ RENDER ═══════ */
  return (
    <div className={`space-y-6 ${text}`}>

      {/* ─── MONTH SELECTOR ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-bold ${text}`}>Mês:</span>
        {MESES.map((m, i) => (
          <button key={m} onClick={() => setMes(i + 1)}
            className={`px-3 py-1.5 text-sm font-bold rounded-full transition-all ${mes === i + 1 ? 'bg-blue-600 text-white shadow' : `${cardBg} ${text} ${hoverBg} border ${border}`}`}
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>

      {/* ─── META GLOBAL + PROGRESS ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">{MESES[mes - 1]} {ano}</h2>
        {!editingMeta && (
          <button onClick={startEditMeta}
            className="px-5 py-2.5 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg"
          >
            {globalMeta.parcela > 0 || globalMeta.recorrencia > 0 ? '✏️ Alterar Meta' : '🎯 Definir Meta'}
          </button>
        )}
      </div>

      {/* Meta editor */}
      {editingMeta && (
        <div className={`rounded-2xl border-2 border-blue-500 ${cardBg} p-6 space-y-4`}>
          <p className="text-lg font-bold text-blue-500">Meta da Equipe — {MESES[mes - 1]} {ano}</p>
          <p className={`text-sm ${textMuted}`}>Valores da meta mensal somando todos os vendedores.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={`block text-sm font-semibold mb-1.5 ${text}`}>Meta Recorrência</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                <input type="number" value={metaRecorrInput} onChange={e => setMetaRecorrInput(e.target.value)}
                  placeholder="Ex: 355000"
                  className={`w-full pl-12 pr-4 py-3 text-lg rounded-xl border-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:border-blue-500 outline-none`}
                />
              </div>
            </div>
            <div>
              <label className={`block text-sm font-semibold mb-1.5 ${text}`}>Meta 1ª Parcela</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                <input type="number" value={metaParcelaInput} onChange={e => setMetaParcelaInput(e.target.value)}
                  placeholder="Ex: 81500"
                  className={`w-full pl-12 pr-4 py-3 text-lg rounded-xl border-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:border-blue-500 outline-none`}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSaveMeta} disabled={savingMeta}
              className="px-6 py-2.5 text-base font-bold rounded-xl bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 flex items-center gap-2 shadow-md">
              {savingMeta && <Loader2 size={18} className="animate-spin" />} ✅ Salvar
            </button>
            <button onClick={() => setEditingMeta(false)}
              className={`px-6 py-2.5 text-base font-bold rounded-xl border-2 ${border} ${text} hover:opacity-70`}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Progress cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProgressCard
          title="Recorrência" subtitle="Total de contratos"
          icon={<Repeat size={24} className="text-purple-500" />}
          accentBorder="border-purple-400"
          meta={globalMeta.recorrencia} real={monthTotals.contrato} pct={pctR}
          isDark={isDark} cardBg={cardBg} text={text} textMuted={textMuted}
        />
        <ProgressCard
          title="1ª Parcela" subtitle="Valor mensal vendido"
          icon={<Target size={24} className="text-amber-500" />}
          accentBorder="border-amber-400"
          meta={globalMeta.parcela} real={monthTotals.mensal} pct={pctP}
          isDark={isDark} cardBg={cardBg} text={text} textMuted={textMuted}
        />
      </div>

      {/* ─── LOADING ─── */}
      {loading && (
        <div className="flex items-center gap-3 py-12 justify-center">
          <Loader2 className="animate-spin" size={24} />
          <span className={`text-lg ${text}`}>Carregando vendas...</span>
        </div>
      )}

      {/* ─── VENDEDORES ─── */}
      {!loading && (
        <div className="space-y-3">
          <p className={`text-lg font-bold ${text}`}>👥 Vendedores — {MESES[mes - 1]}</p>

          {vendedorUsernames.length === 0 && (
            <p className={`text-center py-8 ${textMuted}`}>Nenhum vendedor cadastrado.</p>
          )}

          {vendedorUsernames.map(vendedor => {
            const items = vendasByVendedor[vendedor] || [];
            const totalMensal = items.reduce((s, v) => s + Number(v.valor_mensal || 0), 0);
            const totalContrato = items.reduce((s, v) => s + Number(v.total_contrato || 0), 0);
            const isExpanded = expandedVendedor === vendedor;
            const displayName = vendedorDisplayName[vendedor] || vendedor;

            return (
              <div key={vendedor} className={`rounded-xl border ${border} overflow-hidden`}>
                {/* ── Vendedor Header ── */}
                <button onClick={() => { setExpandedVendedor(isExpanded ? null : vendedor); setShowForm(null); setEditingId(null); }}
                  className={`w-full flex items-center justify-between px-5 py-4 ${cardBg} ${hoverBg} transition-colors text-left`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 ${isDark ? 'bg-blue-900 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className={`font-bold text-base ${text}`}>{displayName}</p>
                      <p className={`text-sm ${textMuted}`}>{items.length} venda{items.length !== 1 ? 's' : ''} no mês</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className={`text-xs ${textMuted}`}>1ª Parcela</p>
                      <p className="text-base font-bold text-green-500">{fmtCurrency(totalMensal)}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className={`text-xs ${textMuted}`}>Contratos</p>
                      <p className="text-base font-bold text-purple-500">{fmtCurrency(totalContrato)}</p>
                    </div>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {/* Mobile values when collapsed */}
                {!isExpanded && (totalMensal > 0 || totalContrato > 0) && (
                  <div className={`sm:hidden flex gap-4 px-5 pb-3 ${cardBg}`}>
                    <span className="text-sm"><span className={textMuted}>1ª Parc: </span><strong className="text-green-500">{fmtCurrency(totalMensal)}</strong></span>
                    <span className="text-sm"><span className={textMuted}>Contr: </span><strong className="text-purple-500">{fmtCurrency(totalContrato)}</strong></span>
                  </div>
                )}

                {/* ── Expanded Content ── */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className={`px-5 py-4 border-t ${border} space-y-3`}>

                        {/* Mobile totals */}
                        <div className="sm:hidden flex gap-4 mb-2">
                          <span className="text-sm"><span className={textMuted}>1ª Parcela: </span><strong className="text-green-500">{fmtCurrency(totalMensal)}</strong></span>
                          <span className="text-sm"><span className={textMuted}>Contratos: </span><strong className="text-purple-500">{fmtCurrency(totalContrato)}</strong></span>
                        </div>

                        {/* Sales list */}
                        {items.length === 0 && (
                          <p className={`text-center py-4 ${textMuted}`}>Nenhuma venda em {MESES[mes - 1]}.</p>
                        )}

                        {items.map(v => {
                          const isDetail = detailSaleId === v.id;
                          return (
                            <div key={v.id} className={`rounded-lg border ${border} ${isDark ? 'bg-gray-900' : 'bg-white'} overflow-hidden`}>
                              {/* Sale card top */}
                              <div className="p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-bold text-base ${text} truncate`}>{v.cliente}</p>
                                    {v.pontos_contratados && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {v.pontos_contratados.split(',').map(s => s.trim()).filter(Boolean).map(nome => (
                                          <span key={nome} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isDark ? 'bg-orange-900/40 text-orange-300 border border-orange-700/50' : 'bg-orange-100 text-orange-700 border border-orange-200'}`}>
                                            <MapPin size={10} className="shrink-0" />{nome}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {v.data_venda && <span className={`text-sm ${textMuted}`}>{v.data_venda}</span>}
                                    {deleteConfirm === v.id ? (
                                      <span className="text-xs flex items-center gap-1">
                                        <button onClick={() => handleDelete(v.id)} className="text-red-500 hover:text-red-400 font-bold">Sim</button>
                                        <button onClick={() => setDeleteConfirm(null)} className={textMuted}>Não</button>
                                      </span>
                                    ) : (
                                      <button onClick={() => setDeleteConfirm(v.id)} className="text-red-500 hover:text-red-400 p-1" title="Excluir">
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Main values */}
                                <div className="flex flex-wrap gap-4 mb-2">
                                  <div>
                                    <p className={`text-xs ${textMuted}`}>Valor Mensal</p>
                                    <p className="font-bold text-green-500 text-lg">{fmtCurrency(v.valor_mensal)}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${textMuted}`}>Total Contrato</p>
                                    <p className="font-bold text-purple-500 text-lg">{fmtCurrency(v.total_contrato)}</p>
                                  </div>
                                  <div>
                                    <p className={`text-xs ${textMuted}`}>Parcelas</p>
                                    <p className={`font-bold text-lg ${text}`}>{v.qtde_parcelas || 1}x</p>
                                  </div>
                                </div>

                                {/* Etapas pós-venda (same as vendas page) */}
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {ETAPAS_VENDA.map(et => {
                                    const done = isEtapaDone(v, et.key);
                                    return (
                                      <button key={et.key} onClick={() => handleToggleStatus(v.id, et.key, done)}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                          done
                                            ? (isDark ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-green-100 text-green-700 border border-green-300')
                                            : (isDark ? 'bg-gray-800 text-gray-500 border border-gray-700' : 'bg-gray-100 text-gray-400 border border-gray-300')
                                        }`}
                                        title={done ? `${et.label}: Concluído` : `${et.label}: Pendente`}
                                      >
                                        <span>{et.emoji}</span>
                                        {done ? <CheckSquare size={12} /> : <Square size={12} />}
                                        {et.label}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Ver mais / menos */}
                                <button onClick={() => setDetailSaleId(isDetail ? null : v.id)}
                                  className={`flex items-center gap-1.5 text-sm font-semibold ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'} transition-colors`}
                                >
                                  {isDetail ? <EyeOff size={14} /> : <Eye size={14} />}
                                  {isDetail ? 'Ver Menos' : 'Ver Mais Detalhes'}
                                </button>
                              </div>

                              {/* ── Detail panel ── */}
                              <AnimatePresence>
                                {isDetail && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <div className={`px-4 pb-4 pt-2 border-t ${border} space-y-3`}>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        <DetailField label="CNPJ" value={v.cnpj} textMuted={textMuted} text={text} />
                                        <DetailField label="Previsão Veiculação" value={v.previsao_veiculacao} textMuted={textMuted} text={text} />
                                        <DetailField label="Data Emissão NF" value={v.data_emissao_nf} textMuted={textMuted} text={text} />
                                        <DetailField label="Vencimento Boletos" value={v.vencimento_boletos} textMuted={textMuted} text={text} />
                                        <DetailField label="Contato" value={v.contato} textMuted={textMuted} text={text} />
                                        <DetailField label="Email" value={v.email} textMuted={textMuted} text={text} />
                                      </div>
                                      {v.obs && (
                                        <div>
                                          <p className={`text-xs font-semibold ${textMuted} mb-0.5`}>Observações</p>
                                          <p className={`text-sm ${text}`}>{v.obs}</p>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}

                        {/* ── Add / Edit Form ── */}
                        {showForm === vendedor ? (
                          <VendaForm
                            editingId={editingId}
                            formData={formData} setFormData={setFormData}
                            saving={saving} onSave={handleSave}
                            onCancel={() => { setShowForm(null); setEditingId(null); setFormData(emptyVenda); }}
                            inputBg={inputBg} textMuted={textMuted} cardBg={cardBg} border={border} isDark={isDark}
                            availablePontos={availablePontos}
                            pontoSearch={pontoSearch} setPontoSearch={setPontoSearch}
                            showPontoDropdown={showPontoDropdown} setShowPontoDropdown={setShowPontoDropdown}
                            pontoDropdownRef={pontoDropdownRef} togglePonto={togglePonto}
                          />
                        ) : (
                          <button onClick={() => { setShowForm(vendedor); setEditingId(null); setFormData(emptyVenda); }}
                            className="flex items-center gap-2 text-sm font-semibold text-blue-500 hover:text-blue-400 py-2"
                          >
                            <Plus size={16} /> Adicionar venda
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
      )}
    </div>
  );
}

/* ─── Detail Field ─── */
function DetailField({ label, value, textMuted, text }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${textMuted}`}>{label}</p>
      <p className={`text-sm ${text}`}>{value || '—'}</p>
    </div>
  );
}

/* ─── Venda Form (extracted) ─── */
function VendaForm({
  editingId, formData, setFormData, saving, onSave, onCancel,
  inputBg, textMuted, cardBg, border, isDark,
  availablePontos, pontoSearch, setPontoSearch,
  showPontoDropdown, setShowPontoDropdown, pontoDropdownRef, togglePonto,
}) {
  const fields = [
    { key: 'data_venda', label: 'Data da Venda', type: 'date' },
    { key: 'cliente', label: 'Cliente', required: true },
    { key: 'cnpj', label: 'CNPJ' },
    { key: 'valor_mensal', label: 'Valor Mensal (R$)', type: 'number' },
    { key: 'total_contrato', label: 'Total Contrato (R$)', type: 'number' },
    { key: 'qtde_parcelas', label: 'Parcelas', type: 'number' },
    { key: 'previsao_veiculacao', label: 'Previsão Veiculação' },
    { key: 'data_emissao_nf', label: 'Data Emissão NF', type: 'date' },
    { key: 'vencimento_boletos', label: 'Vencimento Boletos' },
    { key: 'contato', label: 'Contato' },
    { key: 'email', label: 'Email', type: 'email' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className={`p-5 rounded-xl border-2 border-blue-500 ${cardBg} space-y-4`}
    >
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-lg">{editingId ? '✏️ Editar Venda' : '➕ Nova Venda'}</h4>
        <button onClick={onCancel}><X size={18} className={textMuted} /></button>
      </div>

      {/* Pontos multiselect */}
      <div>
        <label className={`block text-sm font-semibold mb-1 ${textMuted}`}>Pontos Contratados</label>
        {formData.pontos_contratados && (
          <div className="flex flex-wrap gap-1 mb-2">
            {formData.pontos_contratados.split(',').map(s => s.trim()).filter(Boolean).map(nome => (
              <span key={nome} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                {nome}
                <button type="button" onClick={() => togglePonto(nome)} className="hover:text-red-400 ml-0.5"><X size={10}/></button>
              </span>
            ))}
          </div>
        )}
        <div className="relative" ref={pontoDropdownRef}>
          <input type="text" placeholder="Pesquisar ponto..." value={pontoSearch}
            onChange={e => { setPontoSearch(e.target.value); setShowPontoDropdown(true); }}
            onFocus={() => setShowPontoDropdown(true)}
            onBlur={() => setTimeout(() => setShowPontoDropdown(false), 150)}
            className={`w-full px-3 py-2 rounded-lg text-sm ${inputBg} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
          />
          {showPontoDropdown && availablePontos.length > 0 && (
            <div className={`absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border ${border} ${cardBg} shadow-xl`}>
              {availablePontos
                .filter(p => !pontoSearch || p.nome.toLowerCase().includes(pontoSearch.toLowerCase()) || (p.cidade || '').toLowerCase().includes(pontoSearch.toLowerCase()))
                .slice(0, 60)
                .map(p => {
                  const selNames = formData.pontos_contratados ? formData.pontos_contratados.split(',').map(s => s.trim()).filter(Boolean) : [];
                  const isSel = selNames.includes(p.nome);
                  return (
                    <button key={p.id} type="button" onMouseDown={e => e.preventDefault()}
                      onClick={() => { togglePonto(p.nome); setPontoSearch(''); }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${isSel ? (isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700') : (isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50')}`}
                    >
                      {isSel ? <CheckSquare size={12} className="text-blue-400" /> : <Square size={12} className={textMuted} />}
                      <span className="font-medium truncate">{p.nome}</span>
                      <span className={`${textMuted} ml-auto flex-shrink-0 pl-2`}>{p.cidade}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {fields.map(f => (
          <div key={f.key}>
            <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>{f.label}{f.required ? ' *' : ''}</label>
            <input type={f.type || 'text'} value={formData[f.key]}
              onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
              className={`w-full px-3 py-2 rounded-lg text-sm ${inputBg} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
            />
          </div>
        ))}
      </div>

      <div>
        <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Observações</label>
        <textarea value={formData.obs} onChange={e => setFormData(prev => ({ ...prev, obs: e.target.value }))} rows={2}
          className={`w-full px-3 py-2 rounded-lg text-sm ${inputBg} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className={`px-4 py-2 rounded-lg text-sm ${textMuted} ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>Cancelar</button>
        <button onClick={onSave} disabled={saving || !formData.cliente}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 shadow-md"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {editingId ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </motion.div>
  );
}
