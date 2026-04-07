import { useState, useEffect, useMemo } from 'react';
import { Search, Download, RefreshCcw, Loader2, Wifi, WifiOff } from 'lucide-react';

/** Formata segundos em mm:ss */
function fmtSeg(seg) {
  if (seg == null || isNaN(seg)) return '--:--';
  const m = Math.floor(Math.abs(seg) / 60);
  const s = Math.abs(seg) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const RISK_STYLES = {
  critical: { bg: 'bg-red-500/15',    text: 'text-red-400',    label: 'Lotado' },
  high:     { bg: 'bg-orange-500/15',  text: 'text-orange-400', label: 'Quase lotado' },
  medium:   { bg: 'bg-yellow-500/15',  text: 'text-yellow-400', label: 'Atenção' },
  low:      { bg: 'bg-green-500/15',   text: 'text-green-400',  label: 'Saudável' },
};

function RiskBadge({ level, cotasLivres }) {
  const style = RISK_STYLES[level] || RISK_STYLES.low;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${style.bg} ${style.text}`}>
      {level === 'critical' ? style.label : `${cotasLivres} cotas`}
    </span>
  );
}

function OccupationBar({ pct }) {
  const cor = pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-orange-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500/70';
  return (
    <div>
      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="text-[10px] text-brand-gray-500 mt-1 text-right">{pct}%</div>
    </div>
  );
}

function MonitorRow({ item }) {
  const isOnline = item.status === 'online';
  return (
    <tr className="border-t border-white/10 hover:bg-white/[0.02] transition-colors">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span title={isOnline ? 'Online' : 'Offline'} className="flex-shrink-0">
            {isOnline
              ? <Wifi size={12} className="text-green-400" />
              : <WifiOff size={12} className="text-red-400/60" />}
          </span>
          <div>
            <div className="font-medium text-white text-sm">{item.nome}</div>
            {item.local && <div className="text-xs text-brand-gray-400 mt-0.5">{item.local}</div>}
            <div className="text-[10px] text-brand-gray-500">{item.cidade}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-center">
        <div className="text-xs font-mono text-white">{fmtSeg(item.ciclo_seg)}</div>
      </td>
      <td className="px-3 py-3 text-center">
        <div className="text-sm font-bold text-white">{item.insercoes_ativas}</div>
        <div className="text-[10px] text-brand-gray-500">~{fmtSeg(item.ocupado_seg)} usado</div>
      </td>
      <td className="px-3 py-3 text-center">
        <RiskBadge level={item.risk_level} cotasLivres={item.cotas_livres} />
        <div className="text-[10px] text-brand-gray-500 mt-0.5">{fmtSeg(item.livre_seg)} livres</div>
      </td>
      <td className="px-3 py-3 min-w-[100px]">
        <OccupationBar pct={item.pct_ocupado} />
      </td>
    </tr>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AuditoriaLoopTab() {
  const [data, setData] = useState(null);     // { summary, items }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCidade, setFilterCidade] = useState('todas');
  const [sortKey, setSortKey] = useState('nome');
  const [sortDir, setSortDir] = useState('asc');
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/loop-audit');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  const items = data?.items || [];
  const summary = data?.summary || {};

  const cidades = useMemo(() => {
    return ['todas', ...(summary.cidades || [])];
  }, [summary.cidades]);

  const filtered = useMemo(() => {
    let list = items;
    if (filterCidade !== 'todas') list = list.filter(i => i.cidade === filterCidade);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        (i.nome || '').toLowerCase().includes(q) ||
        (i.local || '').toLowerCase().includes(q) ||
        (i.cidade || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let va, vb;
      if (sortKey === 'livre') {
        va = a.cotas_livres; vb = b.cotas_livres;
      } else if (sortKey === 'ocupado') {
        va = a.pct_ocupado; vb = b.pct_ocupado;
      } else {
        va = (a[sortKey] ?? ''); vb = (b[sortKey] ?? '');
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, search, filterCidade, sortKey, sortDir]);

  const filteredStats = useMemo(() => {
    const total = filtered.length;
    const comCotasLivres = filtered.filter(i => i.cotas_livres > 0).length;
    const totalCotasLivres = filtered.reduce((s, i) => s + i.cotas_livres, 0);
    const lotados = filtered.filter(i => i.risk_level === 'critical').length;
    return { total, comCotasLivres, totalCotasLivres, lotados };
  }, [filtered]);

  const jsonString = useMemo(() => JSON.stringify(filtered, null, 2), [filtered]);

  function downloadJson() {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `auditoria-loop-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  function copyJson() {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  // Loading / Error
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-brand-gray-400 gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Carregando dados da API de origem...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-red-400 text-sm">Erro ao carregar auditoria: {error}</p>
        <button onClick={fetchData} className="text-xs text-brand-orange hover:underline">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Auditoria de Loop</h2>
          <p className="text-xs text-brand-gray-400 mt-1">
            Dados em tempo real via API de origem — inserções ativas × 15s vs. ciclo do loop.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => setShowJson(v => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
          >
            {showJson ? 'Ocultar JSON' : 'Ver JSON'}
          </button>
          <button
            type="button"
            onClick={downloadJson}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-orange/40 bg-brand-orange/10 px-3 py-2 text-xs font-semibold text-brand-orange hover:bg-brand-orange/20"
          >
            <Download size={13} />
            Exportar
          </button>
        </div>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Monitors', value: filteredStats.total, sub: 'no filtro atual' },
          { label: 'Com espaço', value: filteredStats.comCotasLivres, sub: `de ${filteredStats.total}`, ok: true },
          { label: 'Cotas livres', value: filteredStats.totalCotasLivres, sub: 'total vendável', ok: true },
          { label: 'Lotados', value: filteredStats.lotados, sub: 'sem cotas', warn: true },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-3 ${c.warn && c.value > 0 ? 'border-red-500/30 bg-red-500/5' : c.ok && c.value > 0 ? 'border-green-500/30 bg-green-500/5' : 'border-white/10 bg-white/[0.03]'}`}>
            <div className={`text-xl font-bold ${c.warn && c.value > 0 ? 'text-red-400' : c.ok && c.value > 0 ? 'text-green-400' : 'text-white'}`}>{c.value}</div>
            <div className="text-xs font-medium text-brand-gray-300 mt-0.5">{c.label}</div>
            <div className="text-[10px] text-brand-gray-500">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-500" />
          <input
            type="text"
            placeholder="Buscar nome ou local..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-brand-gray-600 focus:outline-none focus:border-brand-orange/40"
          />
        </div>
        <select
          value={filterCidade}
          onChange={e => setFilterCidade(e.target.value)}
          className="px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-orange/40"
        >
          {cidades.map(c => (
            <option key={c} value={c} className="bg-gray-900">{c === 'todas' ? 'Todas as cidades' : c}</option>
          ))}
        </select>
        <select
          value={`${sortKey}:${sortDir}`}
          onChange={e => { const [k, d] = e.target.value.split(':'); setSortKey(k); setSortDir(d); }}
          className="px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-orange/40"
        >
          <option value="nome:asc" className="bg-gray-900">Nome A-Z</option>
          <option value="nome:desc" className="bg-gray-900">Nome Z-A</option>
          <option value="livre:desc" className="bg-gray-900">Mais cotas livres</option>
          <option value="livre:asc" className="bg-gray-900">Menos cotas livres</option>
          <option value="ocupado:desc" className="bg-gray-900">Mais lotados</option>
          <option value="cidade:asc" className="bg-gray-900">Cidade A-Z</option>
        </select>
      </div>

      {/* ── Tabela ── */}
      <div className="rounded-2xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-white/[0.04]">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-brand-gray-400">Monitor / Local</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-brand-gray-400">Ciclo</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-brand-gray-400">Inserções ativas</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-brand-gray-400">Cotas livres</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-brand-gray-400">Ocupação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-xs text-brand-gray-500">
                  Nenhum monitor encontrado.
                </td>
              </tr>
            ) : (
              filtered.map(item => <MonitorRow key={item.origin_id} item={item} />)
            )}
          </tbody>
        </table>
      </div>

      {/* ── Preview JSON ── */}
      {showJson && (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border-b border-white/10">
            <span className="text-xs font-semibold text-white">
              JSON — {filtered.length} monitor{filtered.length !== 1 ? 'es' : ''}
            </span>
            <button type="button" onClick={copyJson} className="text-xs text-brand-gray-400 hover:text-white transition-colors">
              {copied ? '✓ Copiado!' : 'Copiar'}
            </button>
          </div>
          <pre className="p-4 text-[11px] text-green-300 bg-black/40 overflow-auto max-h-[400px] leading-relaxed font-mono">
            {jsonString}
          </pre>
        </div>
      )}

    </div>
  );
}
