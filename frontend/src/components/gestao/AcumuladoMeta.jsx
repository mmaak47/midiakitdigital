import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Target, BarChart3, Calendar, Loader2, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { fetchGestaoAcumulado, updateGestaoMetasBatch, fetchGestaoVendedores } from '../../lib/api';

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

export default function AcumuladoMeta({ isDark, ano }) {
  const [data, setData] = useState(null);
  const [vendedoresInfo, setVendedoresInfo] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editMetas, setEditMetas] = useState(null);
  const [savingMetas, setSavingMetas] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchGestaoAcumulado(ano),
      fetchGestaoVendedores(),
    ]).then(([d, vds]) => { setData(d); setVendedoresInfo(vds || []); }).catch(() => {}).finally(() => setLoading(false));
  }, [ano]);

  const vendedores = data?.vendedores || [];
  const vendedorDisplayName = useMemo(() => {
    const map = {};
    vendedoresInfo.forEach(v => {
      map[v.username] = [v.first_name, v.last_name].filter(Boolean).join(' ') || v.username;
    });
    return map;
  }, [vendedoresInfo]);
  const mesesLabel = data?.mesesLabel || [];

  // Build lookup maps
  const metaMap = useMemo(() => {
    const m = {};
    (data?.metas || []).forEach(r => {
      if (!m[r.vendedor_nome]) m[r.vendedor_nome] = {};
      m[r.vendedor_nome][r.mes] = Number(r.valor_meta || 0);
    });
    return m;
  }, [data]);

  const vendaMap = useMemo(() => {
    const m = {};
    (data?.vendas || []).forEach(r => {
      if (!m[r.vendedor_nome]) m[r.vendedor_nome] = {};
      m[r.vendedor_nome][r.mes] = { qtde: r.qtde_vendas, mensal: Number(r.total_mensal || 0), contrato: Number(r.total_contrato || 0) };
    });
    return m;
  }, [data]);

  const vendaAnteriorMap = useMemo(() => {
    const m = {};
    (data?.vendasAnterior || []).forEach(r => {
      if (!m[r.vendedor_nome]) m[r.vendedor_nome] = {};
      m[r.vendedor_nome][r.mes] = Number(r.total_mensal || 0);
    });
    return m;
  }, [data]);

  const handleSaveMetas = async () => {
    if (!editMetas) return;
    setSavingMetas(true);
    const batch = [];
    Object.entries(editMetas).forEach(([vendedor, meses]) => {
      Object.entries(meses).forEach(([mes, val]) => {
        batch.push({ vendedor_nome: vendedor, ano, mes: Number(mes), valor_meta: Number(val) });
      });
    });
    try {
      await updateGestaoMetasBatch(batch);
      setEditMetas(null);
      const fresh = await fetchGestaoAcumulado(ano);
      setData(fresh);
    } catch (err) { alert(err.message); }
    setSavingMetas(false);
  };

  const bg = isDark ? 'bg-gray-900' : 'bg-white';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-gray-50';
  const border = isDark ? 'border-gray-700' : 'border-gray-200';
  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300';

  if (loading) return (
    <div className="flex items-center gap-2 py-12 justify-center">
      <Loader2 className="animate-spin" size={20} />
      <span className={text}>Carregando acumulado...</span>
    </div>
  );

  if (!data) return null;

  // Compute grand totals for summary cards
  const currentMonth = new Date().getMonth() + 1;
  const grandTotals = vendedores.reduce((acc, v) => {
    let metaTotal = 0, realTotal = 0, anteriorTotal = 0;
    for (let m = 1; m <= 12; m++) {
      metaTotal += metaMap[v]?.[m] || 0;
      realTotal += vendaMap[v]?.[m]?.mensal || 0;
      anteriorTotal += vendaAnteriorMap[v]?.[m] || 0;
    }
    acc.metaTotal += metaTotal;
    acc.realTotal += realTotal;
    acc.anteriorTotal += anteriorTotal;
    return acc;
  }, { metaTotal: 0, realTotal: 0, anteriorTotal: 0 });

  const grandPct = grandTotals.metaTotal > 0 ? Math.round((grandTotals.realTotal / grandTotals.metaTotal) * 100) : 0;
  const grandDiff = grandTotals.realTotal - grandTotals.anteriorTotal;

  return (
    <div className={`space-y-6 ${text}`}>
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`rounded-xl border ${border} ${cardBg} p-4`}>
          <div className="flex items-center gap-2 mb-1">
            <Target size={16} className="text-amber-500" />
            <span className={`text-xs font-semibold ${textMuted}`}>META ANUAL {ano}</span>
          </div>
          <p className="text-2xl font-bold">{fmtCurrency(grandTotals.metaTotal)}</p>
        </div>
        <div className={`rounded-xl border ${border} ${cardBg} p-4`}>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={16} className="text-green-500" />
            <span className={`text-xs font-semibold ${textMuted}`}>REALIZADO {ano}</span>
          </div>
          <p className="text-2xl font-bold text-green-500">{fmtCurrency(grandTotals.realTotal)}</p>
        </div>
        <div className={`rounded-xl border ${border} ${cardBg} p-4`}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-blue-500" />
            <span className={`text-xs font-semibold ${textMuted}`}>ATINGIMENTO</span>
          </div>
          <p className={`text-2xl font-bold ${pctColor(grandPct)}`}>{grandPct}%</p>
          <div className="w-full h-2 rounded-full bg-gray-700 mt-2">
            <div className={`h-full rounded-full ${pctBg(grandPct)} transition-all`} style={{ width: `${Math.min(grandPct, 100)}%` }} />
          </div>
        </div>
        <div className={`rounded-xl border ${border} ${cardBg} p-4`}>
          <div className="flex items-center gap-2 mb-1">
            {grandDiff >= 0 ? <ArrowUpRight size={16} className="text-green-500" /> : <ArrowDownRight size={16} className="text-red-500" />}
            <span className={`text-xs font-semibold ${textMuted}`}>vs. {ano - 1}</span>
          </div>
          <p className={`text-2xl font-bold ${grandDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {grandDiff >= 0 ? '+' : ''}{fmtCurrency(grandDiff)}
          </p>
        </div>
      </div>

      {/* Per-vendedor tables */}
      {vendedores.map(vendedor => {
        let acumMeta = 0, acumReal = 0;
        const rows = [];
        for (let m = 1; m <= 12; m++) {
          const meta = metaMap[vendedor]?.[m] || 0;
          const real = vendaMap[vendedor]?.[m]?.mensal || 0;
          const anterior = vendaAnteriorMap[vendedor]?.[m] || 0;
          acumMeta += meta;
          acumReal += real;
          const saldo = acumMeta - acumReal;
          const pctMes = meta > 0 ? Math.round((real / meta) * 100) : 0;
          const pctAcum = acumMeta > 0 ? Math.round((acumReal / acumMeta) * 100) : 0;
          rows.push({ m, meta, real, anterior, acumMeta, acumReal, saldo, pctMes, pctAcum });
        }

        const yearMeta = acumMeta;
        const yearReal = acumReal;
        const yearPct = yearMeta > 0 ? Math.round((yearReal / yearMeta) * 100) : 0;

        return (
          <div key={vendedor} className={`rounded-xl border ${border} overflow-hidden`}>
            <div className={`flex items-center justify-between px-5 py-3 ${cardBg}`}>
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg">{vendedorDisplayName[vendedor] || vendedor}</span>
                <span className={`text-sm ${pctColor(yearPct)} font-semibold`}>{yearPct}% atingido</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span>Meta: <strong>{fmtCurrency(yearMeta)}</strong></span>
                <span>Realizado: <strong className="text-green-500">{fmtCurrency(yearReal)}</strong></span>
                <span>Saldo: <strong className={yearMeta - yearReal > 0 ? 'text-red-400' : 'text-green-500'}>{fmtCurrency(yearMeta - yearReal)}</strong></span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${textMuted} border-b ${border}`}>
                    <th className="px-3 py-2 text-left">Mês</th>
                    <th className="px-3 py-2 text-right">Meta</th>
                    <th className="px-3 py-2 text-right">Realizado</th>
                    <th className="px-3 py-2 text-center">% Mês</th>
                    <th className="px-3 py-2 text-right">Acum. Meta</th>
                    <th className="px-3 py-2 text-right">Acum. Real</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-center">% Acum.</th>
                    <th className="px-3 py-2 text-right">{ano - 1}</th>
                    <th className="px-3 py-2 text-center">Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const diff = r.real - r.anterior;
                    const isCurrent = r.m === currentMonth;
                    return (
                      <tr key={r.m} className={`border-b ${border} ${isCurrent ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50') : ''}`}>
                        <td className={`px-3 py-2 font-medium ${isCurrent ? 'text-blue-400' : ''}`}>
                          {mesesLabel[r.m - 1] || r.m}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {editMetas ? (
                            <input
                              type="number"
                              value={editMetas[vendedor]?.[r.m] ?? r.meta}
                              onChange={e => {
                                setEditMetas(prev => ({
                                  ...prev,
                                  [vendedor]: { ...(prev?.[vendedor] || {}), [r.m]: e.target.value }
                                }));
                              }}
                              className={`w-24 px-2 py-0.5 rounded text-sm text-right ${inputBg}`}
                            />
                          ) : (
                            fmtCurrency(r.meta)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-green-500 font-medium">{fmtCurrency(r.real)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${pctBg(r.pctMes)} text-white`}>{r.pctMes}%</span>
                        </td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(r.acumMeta)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtCurrency(r.acumReal)}</td>
                        <td className={`px-3 py-2 text-right ${r.saldo > 0 ? 'text-red-400' : 'text-green-500'}`}>
                          {fmtCurrency(r.saldo)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs font-bold ${pctColor(r.pctAcum)}`}>{r.pctAcum}%</span>
                        </td>
                        <td className={`px-3 py-2 text-right ${textMuted}`}>{fmtCurrency(r.anterior)}</td>
                        <td className="px-3 py-2 text-center">
                          {diff > 0 ? (
                            <span className="text-green-500 text-xs flex items-center justify-center gap-0.5">
                              <ArrowUpRight size={12} /> {Math.round((diff / (r.anterior || 1)) * 100)}%
                            </span>
                          ) : diff < 0 ? (
                            <span className="text-red-500 text-xs flex items-center justify-center gap-0.5">
                              <ArrowDownRight size={12} /> {Math.abs(Math.round((diff / (r.anterior || 1)) * 100))}%
                            </span>
                          ) : (
                            <Minus size={12} className={textMuted} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Edit metas button */}
      <div className="flex justify-end gap-2">
        {editMetas ? (
          <>
            <button onClick={() => setEditMetas(null)} className={`px-4 py-2 rounded text-sm ${textMuted}`}>Cancelar</button>
            <button
              onClick={handleSaveMetas}
              disabled={savingMetas}
              className="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1"
            >
              {savingMetas ? <Loader2 size={14} className="animate-spin" /> : null}
              Salvar Metas
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditMetas({})}
            className="px-4 py-2 rounded text-sm bg-amber-600 text-white hover:bg-amber-500 flex items-center gap-1"
          >
            <Target size={14} /> Editar Metas {ano}
          </button>
        )}
      </div>
    </div>
  );
}
