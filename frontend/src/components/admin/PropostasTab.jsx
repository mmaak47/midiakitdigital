import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, Trash2, Loader2, Eye, CheckCircle, Clock, XCircle, Copy, Check } from 'lucide-react';
import { fetchAdminPropostas, deleteAdminProposta } from '../../lib/api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getStatus(row) {
  if (row.approved_at) return { label: 'Aprovada', color: 'text-green-400', bg: 'bg-green-500/15', icon: CheckCircle };
  if (new Date(row.expires_at) < new Date()) return { label: 'Expirada', color: 'text-red-400', bg: 'bg-red-500/15', icon: XCircle };
  if (row.viewed_at) return { label: 'Visualizada', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: Eye };
  return { label: 'Pendente', color: 'text-yellow-400', bg: 'bg-yellow-500/15', icon: Clock };
}

export default function PropostasTab({ isDark }) {
  const [propostas, setPropostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [filter, setFilter] = useState('todas');

  const th = isDark
    ? { card: 'bg-[#1A1A1A] border-[#2A2A2A]', text: 'text-gray-200', muted: 'text-gray-400', hover: 'hover:bg-[#222]', inp: 'bg-[#111] border-[#333] text-gray-200' }
    : { card: 'bg-white border-gray-200', text: 'text-gray-800', muted: 'text-gray-500', hover: 'hover:bg-gray-50', inp: 'bg-white border-gray-300 text-gray-900' };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminPropostas();
      setPropostas(data.propostas || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta proposta? Esta ação não pode ser desfeita.')) return;
    setDeleting(id);
    try {
      await deleteAdminProposta(id);
      setPropostas(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleCopyLink = (token) => {
    const url = `${window.location.origin}/p/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  const filtered = propostas.filter(p => {
    if (filter === 'todas') return true;
    const status = getStatus(p);
    return status.label.toLowerCase() === filter;
  });

  const stats = {
    total: propostas.length,
    aprovadas: propostas.filter(p => p.approved_at).length,
    visualizadas: propostas.filter(p => p.viewed_at && !p.approved_at && new Date(p.expires_at) >= new Date()).length,
    expiradas: propostas.filter(p => !p.approved_at && new Date(p.expires_at) < new Date()).length,
    pendentes: propostas.filter(p => !p.viewed_at && !p.approved_at && new Date(p.expires_at) >= new Date()).length,
  };

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-300' },
          { label: 'Aprovadas', value: stats.aprovadas, color: 'text-green-400' },
          { label: 'Visualizadas', value: stats.visualizadas, color: 'text-blue-400' },
          { label: 'Pendentes', value: stats.pendentes, color: 'text-yellow-400' },
          { label: 'Expiradas', value: stats.expiradas, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 text-center ${th.card}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className={`text-[10px] uppercase tracking-wide font-semibold ${th.muted}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter + Refresh */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className={`px-3 py-2 rounded-lg text-sm border ${th.inp}`}
        >
          <option value="todas">Todas</option>
          <option value="aprovada">Aprovadas</option>
          <option value="visualizada">Visualizadas</option>
          <option value="pendente">Pendentes</option>
          <option value="expirada">Expiradas</option>
        </select>
        <button onClick={load} disabled={loading} className={`px-3 py-2 rounded-lg text-xs font-medium border ${th.card} ${th.text}`}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Atualizar'}
        </button>
        <span className={`text-xs ${th.muted}`}>{filtered.length} proposta{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading && !propostas.length ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const status = getStatus(p);
            const StatusIcon = status.icon;
            return (
              <div key={p.id} className={`rounded-xl border p-4 ${th.card} transition-colors ${th.hover}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className={`text-sm font-bold truncate ${th.text}`}>
                        {p.clientName || 'Sem cliente'}
                      </h4>
                      <span className={`inline-flex items-center gap-1 h-5 px-2 rounded text-[10px] font-bold ${status.bg} ${status.color}`}>
                        <StatusIcon size={11} />
                        {status.label}
                      </span>
                    </div>
                    <div className={`flex items-center gap-3 flex-wrap text-xs ${th.muted}`}>
                      {p.segmento && <span className="bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded font-medium">{p.segmento}</span>}
                      <span>{p.pointsCount} ponto{p.pointsCount !== 1 ? 's' : ''}</span>
                      {p.totalValue > 0 && <span className="font-semibold">{formatCurrency(p.totalValue)}</span>}
                      <span>Criada: {formatDate(p.created_at)}</span>
                      {p.created_by_name && <span>por {p.created_by_name}</span>}
                    </div>
                    {p.approved_at && (
                      <p className="text-xs text-green-400 mt-1">
                        Aprovada por <strong>{p.approved_name}</strong> em {formatDate(p.approved_at)}
                      </p>
                    )}
                    {p.viewed_at && !p.approved_at && (
                      <p className={`text-xs mt-1 ${th.muted}`}>Visualizada em {formatDate(p.viewed_at)}</p>
                    )}
                    <p className={`text-xs mt-0.5 ${th.muted}`}>Expira: {formatDate(p.expires_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleCopyLink(p.token)}
                      className={`p-2 rounded-lg border ${th.card} ${th.text} ${th.hover}`}
                      title="Copiar link"
                    >
                      {copiedToken === p.token ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                    <a
                      href={`/p/${p.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`p-2 rounded-lg border ${th.card} ${th.text} ${th.hover}`}
                      title="Abrir proposta"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      title="Excluir"
                    >
                      {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {!filtered.length && !loading && (
            <p className={`text-sm text-center py-8 ${th.muted}`}>Nenhuma proposta encontrada.</p>
          )}
        </div>
      )}
    </div>
  );
}
