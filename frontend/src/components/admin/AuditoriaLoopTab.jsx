import { useState, useMemo, Fragment } from 'react';
import { Search, Download, ChevronDown, ChevronRight, Layers } from 'lucide-react';

// Tipos que não participam da auditoria de loop
const EXCLUDED_TIPOS = new Set(['Backlight', 'Frontlight', 'Totem Digital', 'Circuito Muffato']);

/** Converte string tipo "3 min", "90s", "1:30", "2 min 30s" → segundos */
function parseDuracao(str) {
  if (!str) return 0;
  const s = String(str).trim().toLowerCase();

  // formato mm:ss
  const mmss = s.match(/^(\d+):(\d{2})$/);
  if (mmss) return parseInt(mmss[1]) * 60 + parseInt(mmss[2]);

  let total = 0;
  const min = s.match(/(\d+(?:[.,]\d+)?)\s*min/);
  const sec = s.match(/(\d+(?:[.,]\d+)?)\s*s(?:eg)?(?:\b|$)/);
  if (min) total += parseFloat(min[1].replace(',', '.')) * 60;
  if (sec) total += parseFloat(sec[1].replace(',', '.'));
  if (!min && !sec) {
    const num = parseFloat(s.replace(',', '.'));
    if (!isNaN(num)) total = num; // assume segundos se número puro
  }
  return Math.round(total);
}

/** Formata segundos em mm:ss */
function fmtSeg(seg) {
  if (!seg || isNaN(seg)) return '00:00';
  const m = Math.floor(Math.abs(seg) / 60);
  const s = Math.abs(seg) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const DEFAULT_CICLO_SEG = 180; // 3 minutos
const DEFAULT_TEMPO_SEG = 15;  // 15 segundos por inserção

/**
 * Calcula estatísticas de loop para um ponto.
 * insercoes_por_tela = floor(ponto.insercoes / telas)
 * cotas_livres = max(0, cotas_por_loop - insercoes_por_tela)
 */
function calcStats(ponto) {
  const cicloSeg = parseDuracao(ponto.loop) || DEFAULT_CICLO_SEG;
  const tempoSeg = parseDuracao(ponto.tempo) || DEFAULT_TEMPO_SEG;
  const telas = Math.max(1, parseInt(ponto.telas) || 1);
  const insercoesTotal = parseInt(ponto.insercoes) || 0;
  const insercoesPorTela = Math.floor(insercoesTotal / telas);
  const cotasPorLoop = Math.floor(cicloSeg / tempoSeg);
  const cotasLivres = Math.max(0, cotasPorLoop - insercoesPorTela);
  const ocupadoSeg = Math.min(cicloSeg, tempoSeg * insercoesPorTela);
  const livreSeg = Math.max(0, cicloSeg - ocupadoSeg);
  const pctOcupado = cicloSeg > 0 ? Math.min(100, Math.round((ocupadoSeg / cicloSeg) * 100)) : 0;
  const usandoPadrao = !parseDuracao(ponto.loop);
  return { cicloSeg, tempoSeg, telas, insercoesTotal, insercoesPorTela, cotasPorLoop, cotasLivres, livreSeg, pctOcupado, usandoPadrao };
}

function StatusBadge({ cotasLivres, pctOcupado }) {
  if (cotasLivres === 0)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400">Lotado</span>;
  if (pctOcupado >= 70)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500/15 text-yellow-400">{cotasLivres} cotas</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/15 text-green-400">{cotasLivres} cotas</span>;
}

function OccupationBar({ pctOcupado }) {
  const barCor = pctOcupado >= 100 ? 'bg-red-500' : pctOcupado >= 70 ? 'bg-yellow-500' : 'bg-brand-orange/70';
  return (
    <div>
      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barCor}`} style={{ width: `${pctOcupado}%` }} />
      </div>
      <div className="text-[10px] text-brand-gray-500 mt-1 text-right">{pctOcupado}%</div>
    </div>
  );
}

// ─── Linha simples (ponto com 1 tela) ────────────────────────────────────────

function SingleRow({ ponto }) {
  const s = calcStats(ponto);
  return (
    <tr className="border-t border-white/10 hover:bg-white/[0.02] transition-colors">
      <td className="px-3 py-3">
        <div className="font-medium text-white text-sm">{ponto.nome}</div>
        <div className="text-xs text-brand-gray-400 mt-0.5">{ponto.cidade} · {ponto.tipo}</div>
        {ponto.endereco && <div className="text-xs text-brand-gray-500 truncate max-w-xs mt-0.5">{ponto.endereco}</div>}
      </td>
      <td className="px-3 py-3 text-center">
        <div className="text-xs font-mono text-white">{fmtSeg(s.cicloSeg)}</div>
        {s.usandoPadrao && <div className="text-[10px] text-brand-gray-600">padrão</div>}
      </td>
      <td className="px-3 py-3 text-center">
        <div className="text-sm font-bold text-white">{s.insercoesPorTela}</div>
        <div className="text-[10px] text-brand-gray-500">de {s.cotasPorLoop} cotas</div>
      </td>
      <td className="px-3 py-3 text-center">
        <StatusBadge cotasLivres={s.cotasLivres} pctOcupado={s.pctOcupado} />
        <div className="text-[10px] text-brand-gray-500 mt-0.5">{fmtSeg(s.livreSeg)} livres</div>
      </td>
      <td className="px-3 py-3 min-w-[100px]">
        <OccupationBar pctOcupado={s.pctOcupado} />
      </td>
    </tr>
  );
}

// ─── Linha agrupada (ponto com N telas, collapsed por padrão) ────────────────

function GroupRow({ ponto, expanded, onToggle }) {
  const s = calcStats(ponto);
  return (
    <tr className="border-t border-white/10 bg-white/[0.025] hover:bg-white/[0.04] transition-colors cursor-pointer" onClick={onToggle}>
      <td className="px-3 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex-shrink-0 text-brand-gray-400">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <div>
            <div className="font-medium text-white text-sm flex items-center gap-1.5 flex-wrap">
              {ponto.nome}
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-brand-orange/15 text-brand-orange rounded px-1.5 py-0.5 flex-shrink-0">
                <Layers size={9} />{s.telas} telas
              </span>
            </div>
            <div className="text-xs text-brand-gray-400 mt-0.5">{ponto.cidade} · {ponto.tipo}</div>
            {ponto.endereco && <div className="text-xs text-brand-gray-500 truncate max-w-xs mt-0.5">{ponto.endereco}</div>}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-center">
        <div className="text-xs font-mono text-white">{fmtSeg(s.cicloSeg)}</div>
        {s.usandoPadrao && <div className="text-[10px] text-brand-gray-600">padrão</div>}
      </td>
      <td className="px-3 py-3 text-center">
        <div className="text-sm font-bold text-white">{s.insercoesPorTela}</div>
        <div className="text-[10px] text-brand-gray-500">de {s.cotasPorLoop} / tela</div>
        <div className="text-[10px] text-brand-gray-600">{s.insercoesTotal} total</div>
      </td>
      <td className="px-3 py-3 text-center">
        <StatusBadge cotasLivres={s.cotasLivres} pctOcupado={s.pctOcupado} />
        <div className="text-[10px] text-brand-gray-500 mt-0.5">por tela · {fmtSeg(s.livreSeg)}</div>
      </td>
      <td className="px-3 py-3 min-w-[100px]">
        <OccupationBar pctOcupado={s.pctOcupado} />
      </td>
    </tr>
  );
}

// Sub-linha de tela individual (quando expandido)
function TelaSubRow({ ponto, telaNum }) {
  const s = calcStats(ponto);
  return (
    <tr className="border-t border-dashed border-white/5 bg-black/20">
      <td className="pl-10 pr-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold bg-white/5 text-brand-gray-400 rounded px-1 py-0.5">T{telaNum}/{s.telas}</span>
          <span className="text-xs text-brand-gray-300">{ponto.nome} — Tela {telaNum}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <span className="text-[11px] font-mono text-brand-gray-400">{fmtSeg(s.cicloSeg)}</span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className="text-xs text-brand-gray-300">{s.insercoesPorTela} de {s.cotasPorLoop}</span>
      </td>
      <td className="px-3 py-2 text-center">
        <StatusBadge cotasLivres={s.cotasLivres} pctOcupado={s.pctOcupado} />
      </td>
      <td className="px-3 py-2 min-w-[100px]">
        <OccupationBar pctOcupado={s.pctOcupado} />
      </td>
    </tr>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AuditoriaLoopTab({ pontos = [], isDark }) {
  const [search, setSearch] = useState('');
  const [filterCidade, setFilterCidade] = useState('todas');
  const [sortKey, setSortKey] = useState('nome');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const cidades = useMemo(() => {
    const s = new Set(
      pontos.filter(p => !EXCLUDED_TIPOS.has(p.tipo)).map(p => p.cidade).filter(Boolean)
    );
    return ['todas', ...Array.from(s).sort()];
  }, [pontos]);

  const filtered = useMemo(() => {
    let list = pontos.filter(p => Number(p.ativo) !== 0 && !EXCLUDED_TIPOS.has(p.tipo));
    if (filterCidade !== 'todas') list = list.filter(p => p.cidade === filterCidade);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.nome || '').toLowerCase().includes(q) ||
        (p.endereco || '').toLowerCase().includes(q) ||
        (p.tipo || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let va, vb;
      if (sortKey === 'livre') {
        va = calcStats(a).cotasLivres;
        vb = calcStats(b).cotasLivres;
      } else if (sortKey === 'ocupado') {
        va = calcStats(a).pctOcupado;
        vb = calcStats(b).pctOcupado;
      } else {
        va = (a[sortKey] ?? '');
        vb = (b[sortKey] ?? '');
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [pontos, search, filterCidade, sortKey, sortDir]);

  function toggleGroup(id) {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filtered.length;
    const comCotasLivres = filtered.filter(p => calcStats(p).cotasLivres > 0).length;
    const totalCotasLivres = filtered.reduce((acc, p) => acc + calcStats(p).cotasLivres, 0);
    const semEspaco = total - comCotasLivres;
    return { total, comCotasLivres, totalCotasLivres, semEspaco };
  }, [filtered]);

  // ── JSON export ────────────────────────────────────────────────────────────
  const jsonData = useMemo(() => filtered.map(p => {
    const s = calcStats(p);
    return {
      ponto_id: p.id,
      nome: p.nome,
      cidade: p.cidade,
      tipo: p.tipo,
      telas: s.telas,
      ciclo_seg: s.cicloSeg,
      ciclo_padrao: s.usandoPadrao,
      tempo_insercao_seg: s.tempoSeg,
      insercoes_por_tela: s.insercoesPorTela,
      cotas_por_loop: s.cotasPorLoop,
      cotas_livres: s.cotasLivres,
      pct_ocupado: s.pctOcupado,
      gerado_em: new Date().toISOString(),
    };
  }), [filtered]);

  const jsonString = useMemo(() => JSON.stringify(jsonData, null, 2), [jsonData]);

  function downloadJson() {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-loop-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyJson() {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Auditoria de Loop</h2>
          <p className="text-xs text-brand-gray-400 mt-1">
            Cotas disponíveis por player — loop padrão 3 min, calculado a partir das inserções ativas do banco.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
            Exportar JSON
          </button>
        </div>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Players', value: stats.total, sub: 'no filtro atual' },
          { label: 'Com espaço livre', value: stats.comCotasLivres, sub: `de ${stats.total}`, ok: stats.comCotasLivres > 0 },
          { label: 'Cotas livres', value: stats.totalCotasLivres, sub: 'total disponível', ok: stats.totalCotasLivres > 0 },
          { label: 'Lotados', value: stats.semEspaco, sub: 'sem cotas', warn: stats.semEspaco > 0 },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-3 ${c.warn && c.value > 0 ? 'border-yellow-500/30 bg-yellow-500/5' : c.ok && c.value > 0 ? 'border-green-500/30 bg-green-500/5' : 'border-white/10 bg-white/[0.03]'}`}>
            <div className={`text-xl font-bold ${c.warn && c.value > 0 ? 'text-yellow-400' : c.ok && c.value > 0 ? 'text-green-400' : 'text-white'}`}>{c.value}</div>
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
            placeholder="Buscar nome, endereço ou tipo..."
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
          <option value="nome:asc" className="bg-gray-900">Nome A→Z</option>
          <option value="nome:desc" className="bg-gray-900">Nome Z→A</option>
          <option value="livre:desc" className="bg-gray-900">Mais cotas livres</option>
          <option value="livre:asc" className="bg-gray-900">Menos cotas livres</option>
          <option value="ocupado:desc" className="bg-gray-900">Mais lotados primeiro</option>
          <option value="cidade:asc" className="bg-gray-900">Cidade A→Z</option>
        </select>
      </div>

      {/* ── Tabela ── */}
      <div className="rounded-2xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-white/[0.04]">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-brand-gray-400">Ponto / Local</th>
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
                  Nenhum ponto encontrado.
                </td>
              </tr>
            ) : (
              filtered.map(p => {
                const telas = Math.max(1, parseInt(p.telas) || 1);
                if (telas === 1) {
                  return <SingleRow key={p.id} ponto={p} />;
                }
                const isExpanded = expandedGroups.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <GroupRow ponto={p} expanded={isExpanded} onToggle={() => toggleGroup(p.id)} />
                    {isExpanded && Array.from({ length: telas }, (_, i) => (
                      <TelaSubRow key={`${p.id}_t${i + 1}`} ponto={p} telaNum={i + 1} />
                    ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Preview JSON ── */}
      {showJson && (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border-b border-white/10">
            <span className="text-xs font-semibold text-white">
              JSON — {jsonData.length} player{jsonData.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={copyJson}
              className="text-xs text-brand-gray-400 hover:text-white transition-colors"
            >
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
