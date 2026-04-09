import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Target, Repeat, Loader2, ChevronDown, ChevronUp, Users
} from 'lucide-react';
import { fetchGestaoAcumulado, updateGestaoMetasBatch, fetchGestaoVendedores, fetchGestaoVendas } from '../../lib/api';

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

function SummaryCard({ icon, title, accentClass, meta, real, pct, cardBg, border, text, textMuted, isDark, onEditClick }) {
  const hasGoal = meta > 0;
  const diff = real - meta;
  return (
    <div className={`rounded-xl border-2 ${hasGoal ? accentClass : 'border-orange-400'} ${cardBg} p-5`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className={`font-bold text-base ${text}`}>{title}</span>
      </div>
      {hasGoal ? (
        <>
          <p className={`text-xs mb-0.5 ${textMuted}`}>Meta</p>
          <p className={`text-3xl font-bold mb-3 ${text}`}>{fmtCurrency(meta)}</p>
          <div className="flex justify-between items-center mb-1">
            <span className={`text-sm ${textMuted}`}>Realizado</span>
            <span className={`text-sm font-bold ${pctColor(pct)}`}>{pct}%</span>
          </div>
          <div className={`w-full h-3 rounded-full mb-3 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
            <div className={`h-full rounded-full ${pctBg(pct)} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <p className={`text-xl font-semibold ${real >= meta ? 'text-green-500' : 'text-amber-500'}`}>{fmtCurrency(real)}</p>
          <p className={`text-sm mt-0.5 ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {diff >= 0 ? `+${fmtCurrency(diff)} acima da meta` : `${fmtCurrency(diff)} abaixo da meta`}
          </p>
        </>
      ) : (
        <>
          <p className="text-orange-500 font-semibold text-sm mb-2">⚠ Meta não configurada</p>
          {real > 0 && (
            <p className={`text-xl font-semibold text-green-500 mb-1`}>{fmtCurrency(real)} já realizado</p>
          )}
          <p className={`text-sm ${textMuted} mb-3`}>Defina a meta para ver o progresso.</p>
          <button
            onClick={onEditClick}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition-colors"
          >
            Definir Meta
          </button>
        </>
      )}
    </div>
  );
}

export default function AcumuladoMeta({ isDark, ano }) {
  const [data, setData] = useState(null);
  const [vendedoresInfo, setVendedoresInfo] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editMetas, setEditMetas] = useState(null);
  const [savingMetas, setSavingMetas] = useState(false);
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [expandedCell, setExpandedCell] = useState(null); // {vendedor, mes}
  const [cellSales, setCellSales] = useState([]);
  const [loadingCell, setLoadingCell] = useState(false);
  const [showAllMonths, setShowAllMonths] = useState(new Set());
  const editSectionRef = useRef(null);

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

  const metaRecorrenciaMap = useMemo(() => {
    const m = {};
    (data?.metas || []).forEach(r => {
      if (!m[r.vendedor_nome]) m[r.vendedor_nome] = {};
      m[r.vendedor_nome][r.mes] = Number(r.valor_meta_recorrencia || 0);
    });
    return m;
  }, [data]);

  // All unique vendedor keys across all maps (must be before any early return)
  const currentMonth = new Date().getMonth() + 1;
  const allVendedorKeys = useMemo(() => {
    const keys = new Set([
      ...Object.keys(metaMap),
      ...Object.keys(vendaMap),
      ...Object.keys(metaRecorrenciaMap),
    ]);
    return Array.from(keys);
  }, [metaMap, vendaMap, metaRecorrenciaMap]);

  const handleSaveMetas = async () => {
    if (!editMetas) return;
    setSavingMetas(true);
    // Group edits by vendedor+mes, sending both parcela and recorrencia
    const batchMap = {};
    Object.entries(editMetas).forEach(([vendedor, fields]) => {
      Object.entries(fields).forEach(([key, val]) => {
        const [mesStr, type] = key.split('_');
        const mes = Number(mesStr);
        const k = `${vendedor}__${mes}`;
        if (!batchMap[k]) {
          batchMap[k] = {
            vendedor_nome: vendedor, ano, mes,
            valor_meta: metaMap[vendedor]?.[mes] || 0,
            valor_meta_recorrencia: metaRecorrenciaMap[vendedor]?.[mes] || 0,
          };
        }
        if (type === 'parcela') batchMap[k].valor_meta = Number(val);
        if (type === 'recorrencia') batchMap[k].valor_meta_recorrencia = Number(val);
      });
    });
    const batch = Object.values(batchMap);
    try {
      await updateGestaoMetasBatch(batch);
      setEditMetas(null);
      const fresh = await fetchGestaoAcumulado(ano);
      setData(fresh);
    } catch (err) { alert(err.message); }
    setSavingMetas(false);
  };

  const handleExpandMonth = async (vendedor, mes) => {
    if (expandedCell?.vendedor === vendedor && expandedCell?.mes === mes) {
      setExpandedCell(null);
      setCellSales([]);
      return;
    }
    setExpandedCell({ vendedor, mes });
    setLoadingCell(true);
    try {
      const sales = await fetchGestaoVendas({ ano, mes, vendedor });
      setCellSales(sales || []);
    } catch { setCellSales([]); }
    setLoadingCell(false);
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

  // Keys to use for totals: if filterVendedor is set, restrict; otherwise all
  const activeKeys = filterVendedor === 'todos' ? allVendedorKeys : allVendedorKeys.filter(k => {
    // match by exact key OR by username from vendedoresInfo
    if (k === filterVendedor) return true;
    const info = vendedoresInfo.find(vi => vi.username === filterVendedor);
    if (!info) return false;
    const fullName = [info.first_name, info.last_name].filter(Boolean).join(' ');
    return k === fullName;
  });

  const monthTotals = activeKeys.reduce((acc, v) => {
    acc.metaParcela += metaMap[v]?.[currentMonth] || 0;
    acc.metaRecorrencia += metaRecorrenciaMap[v]?.[currentMonth] || 0;
    acc.realParcela += vendaMap[v]?.[currentMonth]?.mensal || 0;
    acc.realRecorrencia += vendaMap[v]?.[currentMonth]?.contrato || 0;
    return acc;
  }, { metaParcela: 0, metaRecorrencia: 0, realParcela: 0, realRecorrencia: 0 });

  // YTD totals (Jan → current month)
  const ytdTotals = activeKeys.reduce((acc, v) => {
    for (let m = 1; m <= currentMonth; m++) {
      acc.metaParcela += metaMap[v]?.[m] || 0;
      acc.metaRecorrencia += metaRecorrenciaMap[v]?.[m] || 0;
      acc.realParcela += vendaMap[v]?.[m]?.mensal || 0;
      acc.realRecorrencia += vendaMap[v]?.[m]?.contrato || 0;
    }
    return acc;
  }, { metaParcela: 0, metaRecorrencia: 0, realParcela: 0, realRecorrencia: 0 });

  const monthPctParcela = monthTotals.metaParcela > 0 ? Math.round((monthTotals.realParcela / monthTotals.metaParcela) * 100) : 0;
  const monthPctRecorrencia = monthTotals.metaRecorrencia > 0 ? Math.round((monthTotals.realRecorrencia / monthTotals.metaRecorrencia) * 100) : 0;
  const ytdPctParcela = ytdTotals.metaParcela > 0 ? Math.round((ytdTotals.realParcela / ytdTotals.metaParcela) * 100) : 0;
  const ytdPctRecorrencia = ytdTotals.metaRecorrencia > 0 ? Math.round((ytdTotals.realRecorrencia / ytdTotals.metaRecorrencia) * 100) : 0;

  return (
    <div className={`space-y-6 ${text}`}>

      {/* Vendedor filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Users size={14} className={textMuted} />
        <span className={`text-xs font-semibold ${textMuted}`}>Exibir:</span>
        <button
          onClick={() => setFilterVendedor('todos')}
          className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${filterVendedor === 'todos' ? 'bg-blue-600 text-white' : `${cardBg} ${text} border ${border}`}`}
        >
          Todos
        </button>
        {allVendedorKeys.map(v => (
          <button
            key={v}
            onClick={() => setFilterVendedor(v)}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${filterVendedor === v ? 'bg-blue-600 text-white' : `${cardBg} ${text} border ${border}`}`}
          >
            {vendedorDisplayName[v] || v}
          </button>
        ))}
      </div>

      {/* Summary cards — current month */}
      <div>
        <p className={`text-sm font-bold mb-3 ${textMuted}`}>{mesesLabel[currentMonth - 1]} {ano}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard
            icon={<Target size={22} className="text-amber-500" />}
            title="1ª Parcela"
            accentClass="border-amber-400"
            meta={monthTotals.metaParcela}
            real={monthTotals.realParcela}
            pct={monthPctParcela}
            cardBg={cardBg} border={border} text={text} textMuted={textMuted} isDark={isDark}
            onEditClick={() => { setEditMetas({}); setTimeout(() => editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }}
          />
          <SummaryCard
            icon={<Repeat size={22} className="text-purple-500" />}
            title="Recorrência"
            accentClass="border-purple-400"
            meta={monthTotals.metaRecorrencia}
            real={monthTotals.realRecorrencia}
            pct={monthPctRecorrencia}
            cardBg={cardBg} border={border} text={text} textMuted={textMuted} isDark={isDark}
            onEditClick={() => { setEditMetas({}); setTimeout(() => editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }}
          />
        </div>
      </div>

      {/* YTD cards — Jan → current month */}
      <div>
        <p className={`text-sm font-bold mb-3 ${textMuted}`}>Acumulado Jan → {mesesLabel[currentMonth - 1]}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard
            icon={<Target size={22} className="text-amber-400" />}
            title="1ª Parcela"
            accentClass="border-amber-300"
            meta={ytdTotals.metaParcela}
            real={ytdTotals.realParcela}
            pct={ytdPctParcela}
            cardBg={cardBg} border={border} text={text} textMuted={textMuted} isDark={isDark}
            onEditClick={() => { setEditMetas({}); setTimeout(() => editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }}
          />
          <SummaryCard
            icon={<Repeat size={22} className="text-purple-400" />}
            title="Recorrência"
            accentClass="border-purple-300"
            meta={ytdTotals.metaRecorrencia}
            real={ytdTotals.realRecorrencia}
            pct={ytdPctRecorrencia}
            cardBg={cardBg} border={border} text={text} textMuted={textMuted} isDark={isDark}
            onEditClick={() => { setEditMetas({}); setTimeout(() => editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }}
          />
        </div>
      </div>

      {/* Aggregate view for "todos" */}
      {filterVendedor === 'todos' && (() => {
        let acumMetaP = 0, acumRealP = 0, acumMetaR = 0, acumRealR = 0;
        const aggRows = mesesLabel.map((label, idx) => {
          const m = idx + 1;
          const metaP = allVendedorKeys.reduce((s, v) => s + (metaMap[v]?.[m] || 0), 0);
          const metaR = allVendedorKeys.reduce((s, v) => s + (metaRecorrenciaMap[v]?.[m] || 0), 0);
          const realP = allVendedorKeys.reduce((s, v) => s + (vendaMap[v]?.[m]?.mensal || 0), 0);
          const realR = allVendedorKeys.reduce((s, v) => s + (vendaMap[v]?.[m]?.contrato || 0), 0);
          acumMetaP += metaP; acumRealP += realP; acumMetaR += metaR; acumRealR += realR;
          return {
            m, label, metaP, metaR, realP, realR,
            pctMesP: metaP > 0 ? Math.round((realP / metaP) * 100) : 0,
            pctMesR: metaR > 0 ? Math.round((realR / metaR) * 100) : 0,
            acumMetaP, acumRealP, saldoP: acumMetaP - acumRealP,
            pctAcumP: acumMetaP > 0 ? Math.round((acumRealP / acumMetaP) * 100) : 0,
          };
        });
        return (
          <div className={`rounded-xl border ${border} overflow-hidden`}>
            <div className={`flex items-center gap-3 px-5 py-3 ${cardBg}`}>
              <Users size={16} className="text-blue-500" />
              <span className="font-bold text-lg">Consolidado — Todos os Vendedores</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${textMuted} border-b ${border}`}>
                    <th className="px-3 py-2 text-left">Mês</th>
                    <th className="px-3 py-2 text-right">Meta 1ª Parc.</th>
                    <th className="px-3 py-2 text-right">Real. Mensal</th>
                    <th className="px-3 py-2 text-center">%</th>
                    <th className="px-3 py-2 text-right">Meta Recorr.</th>
                    <th className="px-3 py-2 text-right">Real. Contrato</th>
                    <th className="px-3 py-2 text-center">%</th>
                    <th className="px-3 py-2 text-right">Acum. Meta</th>
                    <th className="px-3 py-2 text-right">Acum. Real</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-center">% Acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {aggRows.map(r => {
                    const isCurrent = r.m === currentMonth;
                    return (
                      <tr key={r.m} className={`border-b ${border} ${isCurrent ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50') : ''}`}>
                        <td className={`px-3 py-2 font-medium ${isCurrent ? 'text-blue-400' : ''}`}>{r.label}</td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(r.metaP)}</td>
                        <td className="px-3 py-2 text-right text-green-500 font-medium">{fmtCurrency(r.realP)}</td>
                        <td className="px-3 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${pctBg(r.pctMesP)} text-white`}>{r.pctMesP}%</span></td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(r.metaR)}</td>
                        <td className="px-3 py-2 text-right text-purple-400 font-medium">{fmtCurrency(r.realR)}</td>
                        <td className="px-3 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${pctBg(r.pctMesR)} text-white`}>{r.pctMesR}%</span></td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(r.acumMetaP)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtCurrency(r.acumRealP)}</td>
                        <td className={`px-3 py-2 text-right ${r.saldoP > 0 ? 'text-red-400' : 'text-green-500'}`}>{fmtCurrency(r.saldoP)}</td>
                        <td className="px-3 py-2 text-center"><span className={`text-xs font-bold ${pctColor(r.pctAcumP)}`}>{r.pctAcumP}%</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Per-vendedor tables */}
      {allVendedorKeys.filter(v => filterVendedor === 'todos' || activeKeys.includes(v)).map(vendedor => {
        let acumMetaP = 0, acumRealP = 0, acumMetaR = 0, acumRealR = 0;
        const rows = [];
        for (let m = 1; m <= 12; m++) {
          const metaP = metaMap[vendedor]?.[m] || 0;
          const metaR = metaRecorrenciaMap[vendedor]?.[m] || 0;
          const realP = vendaMap[vendedor]?.[m]?.mensal || 0;
          const realR = vendaMap[vendedor]?.[m]?.contrato || 0;
          acumMetaP += metaP;
          acumRealP += realP;
          acumMetaR += metaR;
          acumRealR += realR;
          const saldoP = acumMetaP - acumRealP;
          const pctMesP = metaP > 0 ? Math.round((realP / metaP) * 100) : 0;
          const pctMesR = metaR > 0 ? Math.round((realR / metaR) * 100) : 0;
          const pctAcumP = acumMetaP > 0 ? Math.round((acumRealP / acumMetaP) * 100) : 0;
          rows.push({ m, metaP, metaR, realP, realR, pctMesP, pctMesR, acumMetaP, acumRealP, saldoP, pctAcumP, acumMetaR, acumRealR });
        }

        const yearMetaP = acumMetaP;
        const yearRealP = acumRealP;
        const yearPctP = yearMetaP > 0 ? Math.round((yearRealP / yearMetaP) * 100) : 0;
        const yearMetaR = acumMetaR;
        const yearRealR = acumRealR;
        const yearPctR = yearMetaR > 0 ? Math.round((yearRealR / yearMetaR) * 100) : 0;

        const isShowingAll = showAllMonths.has(vendedor);
        const visibleRows = isShowingAll ? rows : rows.filter(r => r.m === currentMonth);
        return (
          <div key={vendedor} className={`rounded-xl border ${border} overflow-hidden`}>
            <div className={`flex items-center justify-between px-5 py-3 ${cardBg} flex-wrap gap-2`}>
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg">{vendedorDisplayName[vendedor] || vendedor}</span>
                <span className={`text-sm ${pctColor(yearPctP)} font-semibold`}>{yearPctP}% 1ª Parc.</span>
                <span className={`text-sm ${pctColor(yearPctR)} font-semibold`}>{yearPctR}% Recorr.</span>
              </div>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span>Meta 1ª P.: <strong>{fmtCurrency(yearMetaP)}</strong></span>
                <span>Real.: <strong className="text-green-500">{fmtCurrency(yearRealP)}</strong></span>
                <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>|</span>
                <span>Meta Recorr.: <strong>{fmtCurrency(yearMetaR)}</strong></span>
                <span>Real.: <strong className="text-green-500">{fmtCurrency(yearRealR)}</strong></span>
                <button
                  onClick={() => setShowAllMonths(prev => {
                    const next = new Set(prev);
                    if (next.has(vendedor)) next.delete(vendedor); else next.add(vendedor);
                    return next;
                  })}
                  className={`px-3 py-1 text-xs rounded-full border ${border} ${text} hover:bg-blue-500 hover:text-white transition-colors`}
                >
                  {isShowingAll ? 'Ver menos' : 'Ver todos os meses'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${textMuted} border-b ${border}`}>
                    <th className="px-3 py-2 text-left">Mês</th>
                    <th className="px-3 py-2 text-right">Meta 1ª Parc.</th>
                    <th className="px-3 py-2 text-right">Real. Mensal</th>
                    <th className="px-3 py-2 text-center">%</th>
                    <th className="px-3 py-2 text-right">Meta Recorr.</th>
                    <th className="px-3 py-2 text-right">Real. Contrato</th>
                    <th className="px-3 py-2 text-center">%</th>
                    <th className="px-3 py-2 text-right">Acum. Meta</th>
                    <th className="px-3 py-2 text-right">Acum. Real</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-center">% Acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.flatMap(r => {
                    const isCurrent = r.m === currentMonth;
                    const isExpanded = expandedCell?.vendedor === vendedor && expandedCell?.mes === r.m;
                    const mainRow = (
                      <tr
                        key={r.m}
                        onClick={() => !editMetas && handleExpandMonth(vendedor, r.m)}
                        className={`border-b ${border} ${!editMetas ? 'cursor-pointer hover:bg-opacity-80' : ''} ${isCurrent ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50') : (isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50')}`}
                      >
                        <td className={`px-3 py-2 font-medium ${isCurrent ? 'text-blue-400' : ''}`}>
                          <div className="flex items-center gap-1">
                            {mesesLabel[r.m - 1] || r.m}
                            {!editMetas && (isExpanded ? <ChevronUp size={12} className="text-blue-400" /> : <ChevronDown size={12} className={textMuted} />)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {editMetas ? (
                            <input
                              type="number"
                              value={editMetas[vendedor]?.[`${r.m}_parcela`] ?? r.metaP}
                              onChange={e => {
                                setEditMetas(prev => ({
                                  ...prev,
                                  [vendedor]: { ...(prev?.[vendedor] || {}), [`${r.m}_parcela`]: e.target.value }
                                }));
                              }}
                              onClick={e => e.stopPropagation()}
                              className={`w-24 px-2 py-0.5 rounded text-sm text-right ${inputBg}`}
                            />
                          ) : (
                            fmtCurrency(r.metaP)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-green-500 font-medium">{fmtCurrency(r.realP)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${pctBg(r.pctMesP)} text-white`}>{r.pctMesP}%</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {editMetas ? (
                            <input
                              type="number"
                              value={editMetas[vendedor]?.[`${r.m}_recorrencia`] ?? r.metaR}
                              onChange={e => {
                                setEditMetas(prev => ({
                                  ...prev,
                                  [vendedor]: { ...(prev?.[vendedor] || {}), [`${r.m}_recorrencia`]: e.target.value }
                                }));
                              }}
                              onClick={e => e.stopPropagation()}
                              className={`w-24 px-2 py-0.5 rounded text-sm text-right ${inputBg}`}
                            />
                          ) : (
                            fmtCurrency(r.metaR)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-purple-400 font-medium">{fmtCurrency(r.realR)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${pctBg(r.pctMesR)} text-white`}>{r.pctMesR}%</span>
                        </td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(r.acumMetaP)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtCurrency(r.acumRealP)}</td>
                        <td className={`px-3 py-2 text-right ${r.saldoP > 0 ? 'text-red-400' : 'text-green-500'}`}>
                          {fmtCurrency(r.saldoP)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs font-bold ${pctColor(r.pctAcumP)}`}>{r.pctAcumP}%</span>
                        </td>
                      </tr>
                    );
                    if (!isExpanded) return [mainRow];
                    const expandRow = (
                      <tr key={`${r.m}-exp`} className={isDark ? 'bg-gray-900' : 'bg-gray-50'}>
                        <td colSpan={11} className={`px-4 py-3 border-b ${border}`}>
                          {loadingCell ? (
                            <div className="flex items-center gap-2 justify-center py-2">
                              <Loader2 size={14} className="animate-spin" />
                              <span className={`text-xs ${textMuted}`}>Carregando vendas...</span>
                            </div>
                          ) : cellSales.length === 0 ? (
                            <p className={`text-xs text-center py-2 ${textMuted}`}>Nenhuma venda registrada em {mesesLabel[r.m - 1]}.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className={`${textMuted} border-b ${border}`}>
                                    <th className="px-2 py-1 text-left">Data</th>
                                    <th className="px-2 py-1 text-left">Cliente</th>
                                    <th className="px-2 py-1 text-left">Pontos</th>
                                    <th className="px-2 py-1 text-right">V. Mensal</th>
                                    <th className="px-2 py-1 text-right">Total Contrato</th>
                                    <th className="px-2 py-1 text-center">Parc.</th>
                                    <th className="px-2 py-1 text-left">Obs</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cellSales.map(s => (
                                    <tr key={s.id} className={`border-b ${border}`}>
                                      <td className="px-2 py-1 whitespace-nowrap">{s.data_venda || '—'}</td>
                                      <td className="px-2 py-1 font-medium max-w-[140px] truncate">{s.cliente}</td>
                                      <td className="px-2 py-1 max-w-[160px] truncate">{s.pontos_contratados || '—'}</td>
                                      <td className="px-2 py-1 text-right text-green-500 font-medium whitespace-nowrap">{fmtCurrency(s.valor_mensal)}</td>
                                      <td className="px-2 py-1 text-right whitespace-nowrap">{fmtCurrency(s.total_contrato)}</td>
                                      <td className="px-2 py-1 text-center">{s.qtde_parcelas || 1}</td>
                                      <td className="px-2 py-1 max-w-[120px] truncate">{s.obs || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                    return [mainRow, expandRow];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Edit metas button */}
      <div ref={editSectionRef} className="flex justify-end gap-2">
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
