import { useEffect, useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, FileWarning, Newspaper, StickyNote } from 'lucide-react';

const POLL_MS = 15000;

function fmtMoney(value) {
  const num = Number(value || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtDateTime(iso) {
  const d = new Date(iso || Date.now());
  return d.toLocaleString('pt-BR', { hour12: false });
}

function statusTone(pct) {
  if (pct >= 100) return 'critical';
  if (pct >= 90) return 'high';
  if (pct >= 75) return 'medium';
  return 'low';
}

export default function TvWall() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch('/api/tv/dashboard', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        setData(json);
        setUpdatedAt(fmtDateTime(json.generated_at));
        setError('');
      } catch (err) {
        if (!alive) return;
        setError(err.message || 'Falha ao atualizar painel');
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const warnings = useMemo(() => data?.warnings || [], [data]);
  const tickerText = (data?.ticker_message || '').trim() || 'Painel Intermidia ao vivo. Configure o texto no Admin para mensagens de destaque.';
  const loop = data?.loop || {};
  const contracts = data?.contracts || { items: [] };
  const ranking = data?.ranking || [];
  const postits = data?.postits || [];

  return (
    <div className="tv-wall min-h-screen h-screen w-screen overflow-hidden text-slate-100">
      <style>{`
        .tv-wall {
          --bg-1: #081018;
          --bg-2: #111d2c;
          --panel: rgba(7, 12, 21, 0.72);
          --panel-border: rgba(153, 166, 194, 0.24);
          --accent: #ff6b2e;
          --ok: #18c08f;
          --warn: #ffb020;
          --danger: #ff4d4f;
          background:
            radial-gradient(1200px 500px at 10% 10%, rgba(24, 192, 143, 0.15), transparent 60%),
            radial-gradient(1200px 500px at 95% 90%, rgba(255, 107, 46, 0.14), transparent 55%),
            linear-gradient(120deg, var(--bg-1), var(--bg-2));
          font-family: "Segoe UI", "Tahoma", sans-serif;
        }

        .tv-shell {
          display: grid;
          grid-template-rows: auto 1fr auto;
          height: 100%;
          padding: 14px;
          gap: 10px;
        }

        .tv-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid var(--panel-border);
          background: var(--panel);
          backdrop-filter: blur(8px);
          border-radius: 14px;
          padding: 10px 14px;
        }

        .tv-title {
          font-size: clamp(16px, 2vw, 32px);
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .tv-grid {
          min-height: 0;
          display: grid;
          grid-template-columns: 1.15fr 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          grid-template-areas:
            "loop contracts ranking"
            "loop postits ranking";
          gap: 10px;
        }

        .tv-card {
          min-height: 0;
          border: 1px solid var(--panel-border);
          background: var(--panel);
          backdrop-filter: blur(7px);
          border-radius: 14px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .tv-card h2 {
          font-size: clamp(12px, 1.1vw, 20px);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 7px;
          color: #e9eefb;
        }

        .tv-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          margin-top: 8px;
        }

        .kpi {
          border: 1px solid rgba(153, 166, 194, 0.24);
          border-radius: 10px;
          padding: 6px;
          background: rgba(9, 17, 31, 0.45);
        }

        .kpi .n {
          font-size: clamp(14px, 1.4vw, 26px);
          font-weight: 700;
          line-height: 1.1;
        }

        .kpi .l {
          font-size: clamp(10px, 0.82vw, 14px);
          color: #b8c1d6;
        }

        .tv-list {
          margin-top: 8px;
          overflow: auto;
          padding-right: 4px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 0;
        }

        .tv-row {
          border: 1px solid rgba(153, 166, 194, 0.24);
          border-radius: 10px;
          padding: 7px 8px;
          background: rgba(8, 15, 27, 0.55);
          font-size: clamp(10px, 0.9vw, 15px);
        }

        .tone-low { border-left: 4px solid var(--ok); }
        .tone-medium { border-left: 4px solid var(--warn); }
        .tone-high { border-left: 4px solid #ff8a00; }
        .tone-critical { border-left: 4px solid var(--danger); }

        .rank-top {
          color: #ffd57a;
          font-weight: 700;
        }

        .postit {
          background: linear-gradient(180deg, #fff7c5, #f8e98a);
          color: #2b2400;
          border-radius: 10px;
          padding: 8px;
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.18);
          font-size: clamp(10px, 0.92vw, 15px);
          line-height: 1.3;
        }

        .tv-ticker {
          border: 1px solid var(--panel-border);
          background: rgba(7, 12, 21, 0.88);
          border-radius: 10px;
          overflow: hidden;
          white-space: nowrap;
          padding: 6px 0;
        }

        .tv-ticker-track {
          display: inline-block;
          padding-left: 100%;
          animation: ticker-move 30s linear infinite;
          font-size: clamp(12px, 1.05vw, 20px);
          color: #ffe1d1;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        @keyframes ticker-move {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }

        .ga-loop { grid-area: loop; }
        .ga-contracts { grid-area: contracts; }
        .ga-ranking { grid-area: ranking; }
        .ga-postits { grid-area: postits; }

        @media (max-aspect-ratio: 1/1) {
          .tv-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 0.92fr 0.92fr 1fr;
            grid-template-areas:
              "loop loop"
              "contracts ranking"
              "postits ranking";
          }

          .tv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>

      <div className="tv-shell">
        <header className="tv-top">
          <div>
            <div className="tv-title">Painel de Operação Comercial</div>
            <div className="text-xs text-slate-300">Atualização automática a cada 15s</div>
          </div>
          <div className="text-right text-sm text-slate-300">
            <div>Última atualização</div>
            <div className="font-semibold text-slate-100">{updatedAt || '--/--/---- --:--:--'}</div>
          </div>
        </header>

        <section className="tv-grid">
          <article className="tv-card ga-loop">
            <h2><Activity size={16} /> Auditoria de Loop</h2>
            <div className="tv-kpis">
              <div className="kpi"><div className="n">{loop.total || 0}</div><div className="l">Locais</div></div>
              <div className="kpi"><div className="n">{loop.online || 0}</div><div className="l">Online</div></div>
              <div className="kpi"><div className="n">{loop.lotados || 0}</div><div className="l">Lotados</div></div>
              <div className="kpi"><div className="n">{loop.totalCotasLivres || 0}</div><div className="l">Cotas livres</div></div>
            </div>

            <div className="tv-list">
              {(loop.itensCriticos || []).map((item) => (
                <div key={String(item.id)} className={`tv-row tone-${statusTone(item.pct_ocupado)}`}>
                  <div className="font-semibold truncate">{item.local || item.nome || 'Monitor'}</div>
                  <div className="text-slate-300">
                    {item.cidade || 'Sem cidade'} • {item.pct_ocupado}% ocupado • {item.insercoes_ativas} inserções
                  </div>
                </div>
              ))}
              {!loop.itensCriticos?.length && <div className="tv-row">Nenhum ponto crítico no momento.</div>}
            </div>
          </article>

          <article className="tv-card ga-contracts">
            <h2><FileWarning size={16} /> Controle de Contratos</h2>
            <div className="tv-kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
              <div className="kpi"><div className="n">{contracts.total || 0}</div><div className="l">Total</div></div>
              <div className="kpi"><div className="n">{contracts.expiring_15d || 0}</div><div className="l">Vence em 15d</div></div>
              <div className="kpi"><div className="n" style={{ color: '#ff8e8e' }}>{contracts.expiring_5d || 0}</div><div className="l">Vence em 5d</div></div>
            </div>
            <div className="tv-list">
              {(contracts.items || []).map((c, idx) => (
                <div key={`${c.advertiser}-${c.expirationDate}-${idx}`} className={`tv-row tone-${c.daysRemaining <= 5 ? 'critical' : c.daysRemaining <= 15 ? 'high' : 'low'}`}>
                  <div className="font-semibold truncate">{c.advertiser}</div>
                  <div className="text-slate-300">
                    {c.vendorName || 'N/A'} • {fmtMoney(c.value)} • vence em {c.daysRemaining} dia(s)
                  </div>
                </div>
              ))}
              {!contracts.items?.length && <div className="tv-row">Sem dados de contrato no momento.</div>}
            </div>
          </article>

          <article className="tv-card ga-ranking">
            <h2><BadgeDollarSign size={16} /> Ranking de Vendedores (Mês)</h2>
            <div className="tv-list">
              {ranking.map((r) => (
                <div key={r.vendedor} className="tv-row">
                  <div className="flex items-center justify-between gap-2">
                    <div className={`truncate ${r.posicao === 1 ? 'rank-top' : ''}`}>
                      {r.posicao}. {r.vendedor}
                    </div>
                    <div className="font-semibold">{fmtMoney(r.total)}</div>
                  </div>
                  <div className="text-slate-300">{r.vendas} venda(s) no mês</div>
                </div>
              ))}
              {!ranking.length && <div className="tv-row">Ainda sem vendas no mês atual.</div>}
            </div>
          </article>

          <article className="tv-card ga-postits">
            <h2><StickyNote size={16} /> Post-its do Grupo</h2>
            <div className="tv-list">
              {postits.map((p) => (
                <div key={p.id} className="postit">
                  <div className="font-semibold truncate">{p.author || 'Equipe'} • {p.source === 'whatsapp' ? 'WhatsApp' : 'Manual'}</div>
                  <div className="mt-1">{p.text}</div>
                </div>
              ))}
              {!postits.length && <div className="tv-row">Nenhum post-it ainda. Envie mensagens no grupo configurado.</div>}
            </div>
          </article>
        </section>

        <footer className="tv-ticker">
          <div className="tv-ticker-track">
            <Newspaper size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {tickerText} • {tickerText}
          </div>
        </footer>
      </div>

      {warnings.length > 0 || error ? (
        <div className="absolute left-3 bottom-14 text-[11px] text-orange-200 bg-black/45 border border-orange-300/25 rounded px-2 py-1 max-w-[70vw]">
          {[...(error ? [`Erro de atualização: ${error}`] : []), ...warnings].join(' | ')}
        </div>
      ) : null}
    </div>
  );
}
