import { useState, useEffect, useCallback } from 'react';
import { RefreshCcw, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, Send, FileText, MessageCircle, BarChart3 } from 'lucide-react';
import { fetchWhatsappLogs } from '../../lib/api';

const STATUS_BADGE = {
  enviado:  { label: 'Enviado',  dark: 'bg-green-500/20 text-green-300 border-green-500/30',  light: 'bg-green-50 text-green-700 border-green-200',  Icon: CheckCircle2 },
  falha:    { label: 'Falha',    dark: 'bg-red-500/20 text-red-300 border-red-500/30',        light: 'bg-red-50 text-red-700 border-red-200',        Icon: XCircle },
  ignorado: { label: 'Ignorado', dark: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', light: 'bg-yellow-50 text-yellow-700 border-yellow-200', Icon: AlertTriangle },
  pendente: { label: 'Pendente', dark: 'bg-blue-500/20 text-blue-300 border-blue-500/30',     light: 'bg-blue-50 text-blue-700 border-blue-200',     Icon: Clock },
};

const TIPO_LABELS = {
  notificacao_grupo: { label: 'Notificação Grupo', Icon: MessageCircle },
  enquete_etapas:    { label: 'Enquete Etapas',    Icon: BarChart3 },
  pdf_desktop:       { label: 'PDF Desktop',        Icon: FileText },
  pdf_mobile:        { label: 'PDF Mobile',         Icon: FileText },
  pdf_geracao:       { label: 'Geração PDF',        Icon: FileText },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatPhone(phone) {
  if (!phone) return '—';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 13) return `+${clean.slice(0,2)} (${clean.slice(2,4)}) ${clean.slice(4,9)}-${clean.slice(9)}`;
  if (clean.length === 12) return `+${clean.slice(0,2)} (${clean.slice(2,4)}) ${clean.slice(4,8)}-${clean.slice(8)}`;
  return phone;
}

export default function WhatsappLogsTab({ isDark }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTipo, setFilterTipo] = useState('');

  const th = isDark
    ? { card: 'bg-[#1e1e2e] border-white/10', sectionTitle: 'text-white/50', text: 'text-white/80', textMuted: 'text-white/40', inp: 'bg-white/5 border border-white/10 text-white placeholder-white/30', btn: 'bg-white/10 hover:bg-white/20 text-white', tbl: 'divide-white/10', rowHover: 'hover:bg-white/5' }
    : { card: 'bg-white border-gray-200', sectionTitle: 'text-gray-500', text: 'text-gray-700', textMuted: 'text-gray-400', inp: 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400', btn: 'bg-gray-100 hover:bg-gray-200 text-gray-700', tbl: 'divide-gray-200', rowHover: 'hover:bg-gray-50' };

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWhatsappLogs(200);
      setLogs(data.logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const filtered = logs.filter(l => {
    if (filterStatus && l.status !== filterStatus) return false;
    if (filterTipo && l.tipo !== filterTipo) return false;
    return true;
  });

  const stats = {
    total: logs.length,
    enviado: logs.filter(l => l.status === 'enviado').length,
    falha: logs.filter(l => l.status === 'falha').length,
    ignorado: logs.filter(l => l.status === 'ignorado').length,
  };

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${th.card}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={`text-sm font-semibold uppercase tracking-wide ${th.sectionTitle}`}>
            <Send className="inline w-4 h-4 mr-1.5 -mt-0.5" />
            Log de Envios WhatsApp
          </h3>
          <p className={`text-xs mt-1 ${th.textMuted}`}>
            Acompanhe o status de cada envio automático (notificações, PDFs técnicos, enquetes).
          </p>
        </div>
        <button
          onClick={loadLogs}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${th.btn}`}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
          Atualizar
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total', value: stats.total, color: isDark ? 'text-white' : 'text-gray-900' },
          { label: 'Enviados', value: stats.enviado, color: 'text-green-500' },
          { label: 'Falhas', value: stats.falha, color: 'text-red-500' },
          { label: 'Ignorados', value: stats.ignorado, color: 'text-yellow-500' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 text-center ${th.card}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className={`text-xs mt-0.5 ${th.textMuted}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className={`px-3 py-1.5 rounded-lg text-xs ${th.inp}`}
        >
          <option value="">Todos os status</option>
          <option value="enviado">Enviado</option>
          <option value="falha">Falha</option>
          <option value="ignorado">Ignorado</option>
          <option value="pendente">Pendente</option>
        </select>
        <select
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value)}
          className={`px-3 py-1.5 rounded-lg text-xs ${th.inp}`}
        >
          <option value="">Todos os tipos</option>
          <option value="notificacao_grupo">Notificação Grupo</option>
          <option value="enquete_etapas">Enquete Etapas</option>
          <option value="pdf_desktop">PDF Desktop</option>
          <option value="pdf_mobile">PDF Mobile</option>
          <option value="pdf_geracao">Geração PDF</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          {error}
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className={`text-center py-12 ${th.textMuted}`}>
          <Send className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum registro encontrado.</p>
          <p className="text-xs mt-1">Os logs aparecerão aqui quando uma nova venda for registrada.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full text-xs divide-y ${th.tbl}`}>
            <thead>
              <tr className={th.textMuted}>
                <th className="py-2 px-2 text-left font-medium">Data</th>
                <th className="py-2 px-2 text-left font-medium">Tipo</th>
                <th className="py-2 px-2 text-left font-medium">Venda</th>
                <th className="py-2 px-2 text-left font-medium">Destino</th>
                <th className="py-2 px-2 text-left font-medium">Status</th>
                <th className="py-2 px-2 text-left font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${th.tbl}`}>
              {filtered.map(log => {
                const badge = STATUS_BADGE[log.status] || STATUS_BADGE.pendente;
                const tipoInfo = TIPO_LABELS[log.tipo] || { label: log.tipo, Icon: Send };
                const TipoIcon = tipoInfo.Icon;
                const BadgeIcon = badge.Icon;
                return (
                  <tr key={log.id} className={`${th.rowHover} transition-colors`}>
                    <td className={`py-2.5 px-2 whitespace-nowrap ${th.text}`}>
                      {formatDate(log.created_at)}
                    </td>
                    <td className={`py-2.5 px-2 whitespace-nowrap ${th.text}`}>
                      <span className="flex items-center gap-1.5">
                        <TipoIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        {tipoInfo.label}
                      </span>
                    </td>
                    <td className={`py-2.5 px-2 ${th.text}`}>
                      {log.razao_social ? (
                        <div>
                          <div className="font-medium">{log.razao_social}</div>
                          {log.vendedor_nome && <div className={`text-[10px] ${th.textMuted}`}>por {log.vendedor_nome}</div>}
                        </div>
                      ) : (
                        <span className={th.textMuted}>#{log.venda_id || '—'}</span>
                      )}
                    </td>
                    <td className={`py-2.5 px-2 whitespace-nowrap ${th.text}`}>
                      {formatPhone(log.destino)}
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${isDark ? badge.dark : badge.light}`}>
                        <BadgeIcon className="w-3 h-3" />
                        {badge.label}
                      </span>
                    </td>
                    <td className={`py-2.5 px-2 max-w-[250px] ${th.text}`}>
                      {log.erro ? (
                        <span className="text-red-400" title={log.erro}>
                          {log.erro.length > 60 ? log.erro.slice(0, 60) + '…' : log.erro}
                        </span>
                      ) : log.detalhes ? (
                        <span className={th.textMuted}>{log.detalhes}</span>
                      ) : (
                        <span className={th.textMuted}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
