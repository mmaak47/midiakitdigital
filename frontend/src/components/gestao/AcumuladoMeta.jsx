import { useState, useEffect, useMemo } from 'react';
import {
  Target, Repeat, Loader2, ChevronDown, ChevronUp, Pencil, CheckCircle2, BarChart3, Users, Building2
} from 'lucide-react';
import { fetchGestaoAcumulado, updateGestaoMetasBatch, fetchGestaoVendedores, fetchGestaoVendas } from '../../lib/api';

const GLOBAL_KEY = '__GLOBAL__';
const ESCRITORIO_KEY = '__ESCRITORIO__';
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

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

/* ─── Progress Card ──────────────────────────────────── */
function ProgressCard({ title, subtitle, icon, accentBorder, meta, real, pct, isDark, cardBg, border, text, textMuted }) {
  const hasMeta = meta > 0;
  const diff = real - meta;
  const barBg = isDark ? 'bg-gray-700' : 'bg-gray-200';
  const barColor = pctBg(pct);

  return (
    <div className={`rounded-2xl border-2 ${hasMeta ? accentBorder : 'border-dashed border-gray-400'} ${cardBg} p-6`}>
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <div>
          <p className={`font-bold text-lg ${text}`}>{title}</p>
          <p className={`text-xs ${textMuted}`}>{subtitle}</p>
        </div>
      </div>

      {hasMeta ? (
        <>
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className={`text-xs ${textMuted}`}>Meta</p>
              <p className={`text-2xl font-bold ${text}`}>{fmtCurrency(meta)}</p>
            </div>
            <p className={`text-3xl font-black ${pctColor(pct)}`}>{pct}%</p>
          </div>

          <div className={`w-full h-4 rounded-full ${barBg} mb-3 overflow-hidden`}>
            <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>

          <div className="flex justify-between items-center">
            <div>
              <p className={`text-xs ${textMuted}`}>Realizado</p>
              <p className={`text-xl font-bold ${real >= meta ? 'text-green-500' : text}`}>{fmtCurrency(real)}</p>
            </div>
            <div className="text-right">
              <p className={`text-xs ${textMuted}`}>Diferença</p>
              <p className={`text-base font-semibold ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {diff >= 0 ? '+' : ''}{fmtCurrency(diff)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          {real > 0 && (
            <p className="text-xl font-bold text-green-500 mb-2">{fmtCurrency(real)} já vendido</p>
          )}
          <p className={`text-base ${textMuted}`}>Meta não definida para este mês.</p>
          <p className={`text-sm ${textMuted} mt-1`}>Clique em <strong>"Definir Meta do Mês"</strong> acima.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────── */
export default function AcumuladoMeta({ isDark, ano }) {
  const [data, setData] = useState(null);
  const [vendedoresInfo, setVendedoresInfo] = useState([]);
  const [loading, setLoading] = useState(false);

  // Meta editing
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaParcelaInput, setMetaParcelaInput] = useState('');
  const [metaRecorrenciaInput, setMetaRecorrenciaInput] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  // Vendedor detail
  const [expandedVendedor, setExpandedVendedor] = useState(null);
  const [vendedorSales, setVendedorSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  const currentMonth = new Date().getMonth() + 1;

  /* Fetch data */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchGestaoAcumulado(ano),
      fetchGestaoVendedores(),
    ]).then(([d, vds]) => {
      setData(d);
      setVendedoresInfo(vds || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [ano]);

  /* Display names for vendedores */
  const vendedorDisplayName = useMemo(() => {
    const map = {};
    (vendedoresInfo || []).forEach(v => {
      map[v.username] = [v.first_name, v.last_name].filter(Boolean).join(' ') || v.username;
    });
    return map;
  }, [vendedoresInfo]);

  /* Global meta for current month (stored with vendedor_nome = __GLOBAL__) */
  const globalMeta = useMemo(() => {
    const metas = data?.metas || [];
    const entry = metas.find(r => r.vendedor_nome === GLOBAL_KEY && r.mes === currentMonth);
    return {
      parcela: Number(entry?.valor_meta || 0),
      recorrencia: Number(entry?.valor_meta_recorrencia || 0),
    };
  }, [data, currentMonth]);

  /* YTD global meta (Jan → current month) */
  const ytdGlobalMeta = useMemo(() => {
    const metas = data?.metas || [];
    let parcela = 0, recorrencia = 0;
    for (let m = 1; m <= currentMonth; m++) {
      const entry = metas.find(r => r.vendedor_nome === GLOBAL_KEY && r.mes === m);
      parcela += Number(entry?.valor_meta || 0);
      recorrencia += Number(entry?.valor_meta_recorrencia || 0);
    }
    return { parcela, recorrencia };
  }, [data, currentMonth]);

  /* All vendedor keys from sales data (excluding __GLOBAL__) */
  const allVendedorKeys = useMemo(() => {
    const keys = new Set();
    (data?.vendas || []).forEach(r => { if (r.vendedor_nome && r.vendedor_nome !== GLOBAL_KEY) keys.add(r.vendedor_nome); });
    // Also from metas, in case a vendedor has meta but no sales
    (data?.metas || []).forEach(r => { if (r.vendedor_nome && r.vendedor_nome !== GLOBAL_KEY) keys.add(r.vendedor_nome); });
    // Sort: real vendedores first, __ESCRITORIO__ last
    return Array.from(keys).sort((a, b) => {
      if (a === ESCRITORIO_KEY) return 1;
      if (b === ESCRITORIO_KEY) return -1;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [data]);

  /* Current month totals (all vendedores) */
  const monthRealized = useMemo(() => {
    let parcela = 0, recorrencia = 0;
    (data?.vendas || []).forEach(r => {
      if (r.vendedor_nome === GLOBAL_KEY || r.mes !== currentMonth) return;
      parcela += Number(r.total_mensal || 0);
      recorrencia += Number(r.total_contrato || 0);
    });
    return { parcela, recorrencia };
  }, [data, currentMonth]);

  /* YTD totals */
  const ytdRealized = useMemo(() => {
    let parcela = 0, recorrencia = 0;
    (data?.vendas || []).forEach(r => {
      if (r.vendedor_nome === GLOBAL_KEY || r.mes > currentMonth) return;
      parcela += Number(r.total_mensal || 0);
      recorrencia += Number(r.total_contrato || 0);
    });
    return { parcela, recorrencia };
  }, [data, currentMonth]);

  /* Per-vendedor for current month */
  const vendedorMonthData = useMemo(() => {
    const map = {};
    (data?.vendas || []).forEach(r => {
      if (r.vendedor_nome === GLOBAL_KEY || r.mes !== currentMonth) return;
      map[r.vendedor_nome] = {
        qtde: Number(r.qtde_vendas || 0),
        mensal: Number(r.total_mensal || 0),
        contrato: Number(r.total_contrato || 0),
      };
    });
    return map;
  }, [data, currentMonth]);

  /* Save global meta */
  const handleSaveMeta = async () => {
    setSavingMeta(true);
    try {
      await updateGestaoMetasBatch([{
        vendedor_nome: GLOBAL_KEY,
        ano,
        mes: currentMonth,
        valor_meta: Number(metaParcelaInput) || 0,
        valor_meta_recorrencia: Number(metaRecorrenciaInput) || 0,
      }]);
      setEditingMeta(false);
      const fresh = await fetchGestaoAcumulado(ano);
      setData(fresh);
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    }
    setSavingMeta(false);
  };

  const startEditing = () => {
    setMetaParcelaInput(globalMeta.parcela || '');
    setMetaRecorrenciaInput(globalMeta.recorrencia || '');
    setEditingMeta(true);
  };

  /* Toggle vendedor detail */
  const toggleVendedor = async (vendedor) => {
    if (expandedVendedor === vendedor) {
      setExpandedVendedor(null);
      setVendedorSales([]);
      return;
    }
    setExpandedVendedor(vendedor);
    setLoadingSales(true);
    try {
      const sales = await fetchGestaoVendas({ ano, mes: currentMonth, vendedor });
      setVendedorSales(sales || []);
    } catch { setVendedorSales([]); }
    setLoadingSales(false);
  };

  /* Styles */
  const cardBg = isDark ? 'bg-gray-800' : 'bg-gray-50';
  const border = isDark ? 'border-gray-700' : 'border-gray-200';
  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';

  if (loading) return (
    <div className="flex items-center gap-3 py-16 justify-center">
      <Loader2 className="animate-spin" size={28} />
      <span className={`text-lg ${text}`}>Carregando dados...</span>
    </div>
  );

  if (!data) return null;

  const monthPctP = globalMeta.parcela > 0 ? Math.round((monthRealized.parcela / globalMeta.parcela) * 100) : 0;
  const monthPctR = globalMeta.recorrencia > 0 ? Math.round((monthRealized.recorrencia / globalMeta.recorrencia) * 100) : 0;
  const ytdPctP = ytdGlobalMeta.parcela > 0 ? Math.round((ytdRealized.parcela / ytdGlobalMeta.parcela) * 100) : 0;
  const ytdPctR = ytdGlobalMeta.recorrencia > 0 ? Math.round((ytdRealized.recorrencia / ytdGlobalMeta.recorrencia) * 100) : 0;

  return (
    <div className={`space-y-8 ${text}`}>

      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">{MESES[currentMonth - 1]} {ano}</h2>
        {!editingMeta && (
          <button
            onClick={startEditing}
            className="px-6 py-3 text-base font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg"
          >
            {globalMeta.parcela > 0 || globalMeta.recorrencia > 0 ? <><Pencil size={14} className="inline mr-1" />Alterar Meta do Mês</> : <><Target size={14} className="inline mr-1" />Definir Meta do Mês</>}
          </button>
        )}
      </div>

      {/* ═══════ META EDITOR ═══════ */}
      {editingMeta && (
        <div className={`rounded-2xl border-2 border-blue-500 ${cardBg} p-6 space-y-5`}>
          <p className="text-xl font-bold text-blue-500">
            Meta para {MESES[currentMonth - 1]} {ano}
          </p>
          <p className={`text-sm ${textMuted}`}>
            Defina a meta mensal da equipe. Esses valores valem para todos os vendedores somados.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={`block text-base font-semibold mb-2 ${text}`}>
                Meta 1ª Parcela
              </label>
              <p className={`text-xs mb-2 ${textMuted}`}>Soma do valor mensal de todas as vendas do mês</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">R$</span>
                <input
                  type="number"
                  value={metaParcelaInput}
                  onChange={e => setMetaParcelaInput(e.target.value)}
                  placeholder="Ex: 81500"
                  className={`w-full pl-14 pr-4 py-4 text-xl rounded-xl border-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:border-blue-500 outline-none`}
                />
              </div>
            </div>
            <div>
              <label className={`block text-base font-semibold mb-2 ${text}`}>
                Meta Recorrência
              </label>
              <p className={`text-xs mb-2 ${textMuted}`}>Soma do total de contrato de todas as vendas do mês</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">R$</span>
                <input
                  type="number"
                  value={metaRecorrenciaInput}
                  onChange={e => setMetaRecorrenciaInput(e.target.value)}
                  placeholder="Ex: 355000"
                  className={`w-full pl-14 pr-4 py-4 text-xl rounded-xl border-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:border-blue-500 outline-none`}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            <button
              onClick={handleSaveMeta}
              disabled={savingMeta}
              className="px-8 py-3 text-lg font-bold rounded-xl bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 flex items-center gap-2 shadow-md transition-colors"
            >
              {savingMeta && <Loader2 size={20} className="animate-spin" />}
              <CheckCircle2 size={14} className="inline mr-1" /> Salvar
            </button>
            <button
              onClick={() => setEditingMeta(false)}
              className={`px-8 py-3 text-lg font-bold rounded-xl border-2 ${border} ${text} hover:opacity-70 transition-all`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ═══════ PROGRESS CARDS ═══════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <ProgressCard
          title="1ª Parcela"
          subtitle="Valor mensal vendido"
          icon={<Target size={28} className="text-amber-500" />}
          accentBorder="border-amber-400"
          meta={globalMeta.parcela}
          real={monthRealized.parcela}
          pct={monthPctP}
          isDark={isDark} cardBg={cardBg} border={border} text={text} textMuted={textMuted}
        />
        <ProgressCard
          title="Recorrência"
          subtitle="Total de contratos"
          icon={<Repeat size={28} className="text-purple-500" />}
          accentBorder="border-purple-400"
          meta={globalMeta.recorrencia}
          real={monthRealized.recorrencia}
          pct={monthPctR}
          isDark={isDark} cardBg={cardBg} border={border} text={text} textMuted={textMuted}
        />
      </div>

      {/* ═══════ ACUMULADO DO ANO ═══════ */}
      {currentMonth > 1 && (ytdGlobalMeta.parcela > 0 || ytdRealized.parcela > 0) && (
        <div className={`rounded-2xl border ${border} ${cardBg} p-5`}>
          <p className={`text-base font-bold mb-4 ${text}`}>
            <BarChart3 size={16} className="inline mr-1.5 text-brand-orange" />Acumulado do Ano (Janeiro → {MESES[currentMonth - 1]})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className={`rounded-xl p-3 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
              <p className={`text-xs font-semibold ${textMuted} mb-1`}>Meta 1ª Parcela</p>
              <p className={`text-lg font-bold ${text}`}>{fmtCurrency(ytdGlobalMeta.parcela)}</p>
            </div>
            <div className={`rounded-xl p-3 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
              <p className={`text-xs font-semibold ${textMuted} mb-1`}>Realizado 1ª Parcela</p>
              <p className={`text-lg font-bold ${pctColor(ytdPctP)}`}>{fmtCurrency(ytdRealized.parcela)}</p>
              {ytdGlobalMeta.parcela > 0 && <p className={`text-sm font-bold ${pctColor(ytdPctP)}`}>{ytdPctP}%</p>}
            </div>
            <div className={`rounded-xl p-3 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
              <p className={`text-xs font-semibold ${textMuted} mb-1`}>Meta Recorrência</p>
              <p className={`text-lg font-bold ${text}`}>{fmtCurrency(ytdGlobalMeta.recorrencia)}</p>
            </div>
            <div className={`rounded-xl p-3 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
              <p className={`text-xs font-semibold ${textMuted} mb-1`}>Realizado Recorrência</p>
              <p className={`text-lg font-bold ${pctColor(ytdPctR)}`}>{fmtCurrency(ytdRealized.recorrencia)}</p>
              {ytdGlobalMeta.recorrencia > 0 && <p className={`text-sm font-bold ${pctColor(ytdPctR)}`}>{ytdPctR}%</p>}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ VENDEDORES ═══════ */}
      <div>
        <p className={`text-lg font-bold mb-4 ${text}`}>
          <Users size={16} className="inline mr-1.5 text-brand-orange" />Vendedores — {MESES[currentMonth - 1]}
        </p>
        {allVendedorKeys.length === 0 ? (
          <p className={`text-center py-8 ${textMuted}`}>Nenhum vendedor com dados neste período.</p>
        ) : (
          <div className="space-y-3">
            {allVendedorKeys.map(vendedor => {
              const d = vendedorMonthData[vendedor] || { qtde: 0, mensal: 0, contrato: 0 };
              const isExpanded = expandedVendedor === vendedor;
              const isEscritorio = vendedor === ESCRITORIO_KEY;
              const displayName = isEscritorio ? 'Escritório' : (vendedorDisplayName[vendedor] || vendedor);

              return (
                <div key={vendedor} className={`rounded-xl border ${border} overflow-hidden`}>
                  {/* Vendedor header — clickable */}
                  <button
                    onClick={() => toggleVendedor(vendedor)}
                    className={`w-full flex items-center justify-between px-5 py-4 ${cardBg} hover:opacity-90 transition-all text-left`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold ${
                        isEscritorio
                          ? isDark ? 'bg-amber-900/50 text-amber-400' : 'bg-amber-100 text-amber-600'
                          : isDark ? 'bg-blue-900 text-blue-400' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {isEscritorio ? <Building2 size={20} /> : displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className={`font-bold text-base ${text}`}>{displayName}</p>
                        <p className={`text-sm ${textMuted}`}>
                          {d.qtde} venda{d.qtde !== 1 ? 's' : ''} no mês
                          {isEscritorio ? ' (não atribuída a vendedor)' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-right hidden sm:block">
                        <p className={`text-xs ${textMuted}`}>1ª Parcela</p>
                        <p className="text-base font-bold text-green-500">{fmtCurrency(d.mensal)}</p>
                      </div>
                      <div className="text-right hidden sm:block">
                        <p className={`text-xs ${textMuted}`}>Contratos</p>
                        <p className="text-base font-bold text-purple-500">{fmtCurrency(d.contrato)}</p>
                      </div>
                      <div className={`${textMuted}`}>
                        {isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                      </div>
                    </div>
                  </button>

                  {/* Mobile summary (visible only on small screens) */}
                  {!isExpanded && (d.mensal > 0 || d.contrato > 0) && (
                    <div className={`sm:hidden flex gap-4 px-5 pb-3 ${cardBg}`}>
                      <span className="text-sm"><span className={textMuted}>1ª Parc: </span><strong className="text-green-500">{fmtCurrency(d.mensal)}</strong></span>
                      <span className="text-sm"><span className={textMuted}>Contr: </span><strong className="text-purple-500">{fmtCurrency(d.contrato)}</strong></span>
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className={`px-5 py-4 border-t ${border}`}>
                      {/* Mobile totals */}
                      <div className="sm:hidden flex gap-4 mb-4">
                        <span className="text-sm"><span className={textMuted}>1ª Parcela: </span><strong className="text-green-500">{fmtCurrency(d.mensal)}</strong></span>
                        <span className="text-sm"><span className={textMuted}>Contratos: </span><strong className="text-purple-500">{fmtCurrency(d.contrato)}</strong></span>
                      </div>

                      {loadingSales ? (
                        <div className="flex items-center gap-2 justify-center py-6">
                          <Loader2 size={18} className="animate-spin" />
                          <span className={`${textMuted}`}>Carregando vendas...</span>
                        </div>
                      ) : vendedorSales.length === 0 ? (
                        <p className={`text-center py-6 ${textMuted}`}>
                          Nenhuma venda registrada em {MESES[currentMonth - 1]}.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {vendedorSales.map(s => (
                            <div key={s.id} className={`rounded-lg border ${border} p-4`}>
                              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                <div>
                                  <p className={`font-bold text-base ${text}`}>{s.cliente}</p>
                                  {s.pontos_contratados && (
                                    <p className={`text-sm ${textMuted}`}>{s.pontos_contratados}</p>
                                  )}
                                </div>
                                {s.data_venda && (
                                  <span className={`text-sm ${textMuted}`}>{s.data_venda}</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-4">
                                <div>
                                  <p className={`text-xs ${textMuted}`}>Valor Mensal</p>
                                  <p className="font-bold text-green-500">{fmtCurrency(s.valor_mensal)}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${textMuted}`}>Total Contrato</p>
                                  <p className="font-bold text-purple-500">{fmtCurrency(s.total_contrato)}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${textMuted}`}>Parcelas</p>
                                  <p className={`font-bold ${text}`}>{s.qtde_parcelas || 1}x</p>
                                </div>
                                {s.obs && (
                                  <div>
                                    <p className={`text-xs ${textMuted}`}>Obs</p>
                                    <p className={`text-sm ${text}`}>{s.obs}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
