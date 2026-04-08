import { useState, useEffect, useMemo } from 'react';
import { Search, Download, RefreshCcw, Loader2, Wifi, WifiOff, AlertTriangle, Layers, EyeOff, Eye } from 'lucide-react';

function authHeaders() {
  const token = typeof window !== 'undefined' && sessionStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

function OccupationBar({ pct, isDark }) {
  const cor = pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-orange-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500/70';
  return (
    <div>
      <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
        <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className={`text-[10px] mt-1 text-right ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{pct}%</div>
    </div>
  );
}

function MonitorRow({ item, onHide, isDark }) {
  const isOnline = item.status === 'online';
  const telas = item.telas || 1;
  const diverge = item.divergente;
  return (
    <tr className={`border-t ${isDark ? 'border-white/10 hover:bg-white/[0.02]' : 'border-neutral-100 hover:bg-neutral-50'} transition-colors ${diverge ? 'bg-yellow-500/[0.03]' : ''}`}>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span title={isOnline ? 'Online' : 'Offline'} className="flex-shrink-0">
            {isOnline
              ? <Wifi size={12} className="text-green-400" />
              : <WifiOff size={12} className="text-red-400/60" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className={`font-medium text-sm flex items-center gap-1.5 flex-wrap ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              {item.local || item.nome}
              {telas > 1 && !diverge && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-brand-orange/15 text-brand-orange rounded px-1.5 py-0.5">
                  <Layers size={9} />{telas} telas
                </span>
              )}
              {diverge && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-yellow-500/15 text-yellow-400 rounded px-1.5 py-0.5" title="Telas com ocupação diferente">
                  <AlertTriangle size={9} />{item.nome}
                </span>
              )}
            </div>
            <div className={`text-[10px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{item.cidade}</div>
          </div>
          <button
            type="button"
            onClick={() => onHide(item)}
            className={`flex-shrink-0 p-1 rounded transition-colors ${isDark ? 'hover:bg-white/10 text-brand-gray-600 hover:text-red-400' : 'hover:bg-neutral-100 text-neutral-400 hover:text-red-500'}`}
            title="Ocultar este monitor da auditoria"
          >
            <EyeOff size={13} />
          </button>
        </div>
      </td>
      <td className="px-3 py-3 text-center">
        <div className={`text-xs font-mono ${isDark ? 'text-white' : 'text-neutral-900'}`}>{fmtSeg(item.ocupado_seg)}</div>
      </td>
      <td className="px-3 py-3 text-center">
        <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{item.insercoes_ativas}</div>
      </td>
      <td className="px-3 py-3 text-center">
        <RiskBadge level={item.risk_level} cotasLivres={item.cotas_livres} />
        <div className={`text-[10px] mt-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{fmtSeg(item.livre_seg)} livres</div>
      </td>
      <td className="px-3 py-3 min-w-[100px]">
        <OccupationBar pct={item.pct_ocupado} isDark={isDark} />
      </td>
    </tr>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AuditoriaLoopTab({ isDark = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exclusions, setExclusions] = useState([]);
  const [showExclusions, setShowExclusions] = useState(false);
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
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchExclusions() {
    try {
      const res = await fetch('/api/loop-audit/exclusions');
      if (res.ok) setExclusions(await res.json());
    } catch { /* ignore */ }
  }

  useEffect(() => { fetchData(); fetchExclusions(); }, []);

  async function hideMonitor(item) {
    const motivo = prompt(`Motivo para ocultar "${item.local || item.nome}" (opcional):`);
    if (motivo === null) return; // cancelou
    try {
      await fetch('/api/loop-audit/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ origin_id: item.origin_id, nome: item.nome, motivo }),
      });
      fetchData();
      fetchExclusions();
    } catch { /* ignore */ }
  }

  async function unhideMonitor(originId) {
    try {
      await fetch(`/api/loop-audit/exclusions/${originId}`, { method: 'DELETE', headers: authHeaders() });
      fetchData();
      fetchExclusions();
    } catch { /* ignore */ }
  }

  const items = data?.items || [];
  const summary = data?.summary || {};
  const hiddenCount = data?.hidden_count || 0;

  const cidades = useMemo(() => ['todas', ...(summary.cidades || [])], [summary.cidades]);

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
      if (sortKey === 'livre') { va = a.cotas_livres; vb = b.cotas_livres; }
      else if (sortKey === 'ocupado') { va = a.pct_ocupado; vb = b.pct_ocupado; }
      else { va = (a[sortKey] ?? ''); vb = (b[sortKey] ?? ''); if (typeof va === 'string') va = va.toLowerCase(); if (typeof vb === 'string') vb = vb.toLowerCase(); }
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

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-20 gap-2 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
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

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Auditoria de Loop</h2>
          <p className={`text-xs mt-1 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
            Dados em tempo real via API de origem — loop padrão 3 min, ciclo_segundos = tempo ocupado.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button type="button" onClick={fetchData} disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs disabled:opacity-50 ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button type="button" onClick={() => setShowJson(v => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
            {showJson ? 'Ocultar JSON' : 'Ver JSON'}
          </button>
          <button type="button" onClick={downloadJson}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${isDark ? 'border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20' : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'}`}>
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Locais', value: filteredStats.total, sub: 'no filtro atual' },
          { label: 'Com espaço', value: filteredStats.comCotasLivres, sub: `de ${filteredStats.total}`, ok: true },
          { label: 'Cotas livres', value: filteredStats.totalCotasLivres, sub: 'total vendável', ok: true },
          { label: 'Lotados', value: filteredStats.lotados, sub: 'sem cotas', warn: true },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-3 ${c.warn && c.value > 0
            ? 'border-red-500/30 bg-red-500/5'
            : c.ok && c.value > 0
              ? 'border-green-500/30 bg-green-500/5'
              : isDark ? 'border-white/10 bg-white/[0.03]' : 'border-neutral-200 bg-white shadow-sm'}`}>
            <div className={`text-xl font-bold ${c.warn && c.value > 0 ? 'text-red-400' : c.ok && c.value > 0 ? 'text-green-400' : isDark ? 'text-white' : 'text-neutral-900'}`}>{c.value}</div>
            <div className={`text-xs font-medium mt-0.5 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{c.label}</div>
            <div className={`text-[10px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`} />
          <input type="text" placeholder="Buscar nome ou local..." value={search} onChange={e => setSearch(e.target.value)}
            className={`w-full pl-8 pr-3 py-2 text-xs rounded-xl focus:outline-none ${isDark
              ? 'bg-white/5 border border-white/10 text-white placeholder:text-brand-gray-600 focus:border-brand-orange/40'
              : 'bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/60'}`} />
        </div>
        <select value={filterCidade} onChange={e => setFilterCidade(e.target.value)}
          className={`px-3 py-2 text-xs rounded-xl focus:outline-none ${isDark
            ? 'bg-white/5 border border-white/10 text-white focus:border-brand-orange/40'
            : 'bg-white border border-neutral-200 text-neutral-900 focus:border-brand-orange/60'}`}>
          {cidades.map(c => <option key={c} value={c} className={isDark ? 'bg-gray-900' : 'bg-white'}>{c === 'todas' ? 'Todas as cidades' : c}</option>)}
        </select>
        <select value={`${sortKey}:${sortDir}`} onChange={e => { const [k, d] = e.target.value.split(':'); setSortKey(k); setSortDir(d); }}
          className={`px-3 py-2 text-xs rounded-xl focus:outline-none ${isDark
            ? 'bg-white/5 border border-white/10 text-white focus:border-brand-orange/40'
            : 'bg-white border border-neutral-200 text-neutral-900 focus:border-brand-orange/60'}`}>
          <option value="nome:asc" className={isDark ? 'bg-gray-900' : 'bg-white'}>Nome A-Z</option>
          <option value="nome:desc" className={isDark ? 'bg-gray-900' : 'bg-white'}>Nome Z-A</option>
          <option value="livre:desc" className={isDark ? 'bg-gray-900' : 'bg-white'}>Mais cotas livres</option>
          <option value="livre:asc" className={isDark ? 'bg-gray-900' : 'bg-white'}>Menos cotas livres</option>
          <option value="ocupado:desc" className={isDark ? 'bg-gray-900' : 'bg-white'}>Mais lotados</option>
          <option value="cidade:asc" className={isDark ? 'bg-gray-900' : 'bg-white'}>Cidade A-Z</option>
        </select>
      </div>

      {/* Tabela */}
      <div className={`rounded-2xl border overflow-x-auto ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
        <table className="w-full text-sm min-w-[560px]">
          <thead className={isDark ? 'bg-white/[0.04]' : 'bg-neutral-50'}>
            <tr>
              <th className={`px-3 py-2 text-left text-xs font-medium ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Local</th>
              <th className={`px-3 py-2 text-center text-xs font-medium ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Ocupado</th>
              <th className={`px-3 py-2 text-center text-xs font-medium ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Inserções ativas</th>
              <th className={`px-3 py-2 text-center text-xs font-medium ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Cotas livres</th>
              <th className={`px-3 py-2 text-center text-xs font-medium ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>Ocupação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className={`px-3 py-10 text-center text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Nenhum monitor encontrado.</td></tr>
            ) : (
              filtered.map(item => <MonitorRow key={item.origin_id} item={item} onHide={hideMonitor} isDark={isDark} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Ocultos */}
      {(hiddenCount > 0 || exclusions.length > 0) && (
        <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          <button type="button" onClick={() => setShowExclusions(v => !v)}
            className={`flex items-center justify-between w-full px-4 py-2.5 transition-colors text-left ${isDark ? 'bg-white/[0.04] hover:bg-white/[0.06]' : 'bg-neutral-50 hover:bg-neutral-100'}`}>
            <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>
              <EyeOff size={12} /> {exclusions.length} monitor{exclusions.length !== 1 ? 'es' : ''} oculto{exclusions.length !== 1 ? 's' : ''}
            </span>
            <span className={`text-[10px] ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{showExclusions ? 'Ocultar' : 'Mostrar'}</span>
          </button>
          {showExclusions && (
            <div className={`divide-y ${isDark ? 'divide-white/5' : 'divide-neutral-100'}`}>
              {exclusions.length === 0 ? (
                <div className={`px-4 py-3 text-xs ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>Nenhum monitor oculto.</div>
              ) : exclusions.map(ex => (
                <div key={ex.origin_id} className={`flex items-center justify-between px-4 py-2.5 ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-neutral-50'}`}>
                  <div>
                    <div className={`text-xs ${isDark ? 'text-brand-gray-300' : 'text-neutral-600'}`}>{ex.nome || `ID ${ex.origin_id}`}</div>
                    {ex.motivo && <div className={`text-[10px] mt-0.5 ${isDark ? 'text-brand-gray-500' : 'text-neutral-400'}`}>{ex.motivo}</div>}
                  </div>
                  <button type="button" onClick={() => unhideMonitor(ex.origin_id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-green-400 hover:bg-green-500/10 transition-colors">
                    <Eye size={11} /> Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview JSON */}
      {showJson && (
        <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
          <div className={`flex items-center justify-between px-4 py-2.5 border-b ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-neutral-50 border-neutral-200'}`}>
            <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>JSON — {filtered.length} ite{filtered.length !== 1 ? 'ns' : 'm'}</span>
            <button type="button" onClick={copyJson} className={`text-xs transition-colors ${isDark ? 'text-brand-gray-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
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
