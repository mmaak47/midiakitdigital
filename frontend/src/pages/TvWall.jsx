import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CalendarClock,
  FileWarning,
  Newspaper,
  Radio,
  StickyNote,
  TrendingUp,
} from 'lucide-react';

const POLL_MS = 15000;

function fmtMoney(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function fmtDateTime(value) {
  const date = new Date(value || Date.now());
  return date.toLocaleString('pt-BR', { hour12: false });
}

function statusTone(pct) {
  if (pct >= 100) return 'critical';
  if (pct >= 90) return 'high';
  if (pct >= 75) return 'medium';
  return 'low';
}

function toneClass(tone) {
  if (tone === 'critical') return 'is-critical';
  if (tone === 'high') return 'is-high';
  if (tone === 'medium') return 'is-medium';
  return 'is-low';
}

function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'IC';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

export default function TvWall() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const contractsScrollRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch('/api/tv/dashboard', { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!alive) return;

        setData(payload);
        setUpdatedAt(fmtDateTime(payload.generated_at));
        setError('');
      } catch (err) {
        if (!alive) return;
        setError(err?.message || 'Falha ao atualizar painel');
      }
    }

    load();
    const intervalId = setInterval(load, POLL_MS);

    return () => {
      alive = false;
      clearInterval(intervalId);
    };
  }, []);

  const warnings = useMemo(() => data?.warnings || [], [data]);
  const tickerText =
    (data?.ticker_message || '').trim() ||
    'Intermidia ao vivo: acompanhe contratos, auditoria de loop, ranking de vendas e recados da operação em tempo real.';
  const loop = data?.loop || {};
  const contracts = data?.contracts || { items: [] };
  const ranking = data?.ranking || [];
  const postits = data?.postits || [];

  useEffect(() => {
    const element = contractsScrollRef.current;
    if (!element) return undefined;

    element.scrollTop = 0;
    if (element.scrollHeight <= element.clientHeight + 6) return undefined;

    let pauseUntil = Date.now() + 1600;
    const timer = setInterval(() => {
      const maxScroll = element.scrollHeight - element.clientHeight;
      if (Date.now() < pauseUntil) return;

      const nextTop = element.scrollTop + 1;
      if (nextTop >= maxScroll) {
        element.scrollTop = 0;
        pauseUntil = Date.now() + 1800;
        return;
      }

      element.scrollTop = nextTop;
    }, 45);

    return () => clearInterval(timer);
  }, [contracts.items]);

  return (
    <div className="tv-wall min-h-screen h-screen w-screen overflow-hidden text-slate-900">
      <style>{`
        .tv-wall {
          --bg: #f7f4ef;
          --bg-soft: #fffdfa;
          --bg-panel: rgba(255, 255, 255, 0.88);
          --bg-panel-strong: rgba(255, 255, 255, 0.96);
          --line: rgba(32, 24, 21, 0.08);
          --line-strong: rgba(32, 24, 21, 0.14);
          --text: #161311;
          --muted: #6e635c;
          --brand: #fe5c2b;
          --brand-soft: #fff0e8;
          --ok: #179a6d;
          --warn: #c98509;
          --danger: #d84f4f;
          background:
            radial-gradient(circle at top left, rgba(254, 92, 43, 0.14), transparent 22%),
            radial-gradient(circle at right 16%, rgba(254, 92, 43, 0.08), transparent 18%),
            linear-gradient(180deg, #fcfaf7 0%, var(--bg) 100%);
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        }

        .tv-shell {
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 12px;
          height: 100%;
          padding: 10px;
        }

        .tv-header {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          align-items: center;
          padding: 10px 16px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,0.97), rgba(255,255,255,0.92));
          border: 1px solid rgba(254, 92, 43, 0.16);
          box-shadow: 0 14px 40px rgba(141, 98, 61, 0.09);
        }

        .tv-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }

        .tv-logo-wrap {
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          padding: 8px 12px;
          border-radius: 18px;
          background: linear-gradient(180deg, #fff9f5, #fff2ea);
          border: 1px solid rgba(254, 92, 43, 0.16);
        }

        .tv-logo {
          height: 32px;
          width: auto;
          display: block;
        }

        .tv-kicker {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: var(--brand);
        }

        .tv-title {
          margin: 2px 0 0;
          font-size: clamp(22px, 1.6vw, 30px);
          line-height: 1.02;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: var(--text);
        }

        .tv-subtitle {
          margin-top: 4px;
          font-size: 12px;
          color: var(--muted);
        }

        .tv-status {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          padding: 10px 12px;
          min-width: 220px;
          border-radius: 18px;
          background: linear-gradient(180deg, #fff9f7, #fff2ec);
          border: 1px solid rgba(254, 92, 43, 0.14);
        }

        .tv-status-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--muted);
        }

        .tv-status-value {
          font-size: 20px;
          font-weight: 900;
          color: var(--brand);
          line-height: 1;
        }

        .tv-status-note {
          font-size: 11px;
          color: var(--muted);
        }

        .tv-grid {
          min-height: 0;
          display: grid;
          grid-template-columns: 1.12fr 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          grid-template-areas:
            "loop contracts ranking"
            "loop postits ranking";
          gap: 12px;
        }

        .ga-loop { grid-area: loop; }
        .ga-contracts { grid-area: contracts; }
        .ga-ranking { grid-area: ranking; }
        .ga-postits { grid-area: postits; }

        .tv-card {
          min-height: 0;
          display: flex;
          flex-direction: column;
          padding: 14px;
          border-radius: 22px;
          background: linear-gradient(180deg, var(--bg-panel-strong), var(--bg-panel));
          border: 1px solid var(--line);
          box-shadow: 0 14px 34px rgba(64, 45, 33, 0.08);
          overflow: hidden;
        }

        .tv-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .tv-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: clamp(18px, 1.1vw, 24px);
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--text);
        }

        .tv-card-title svg {
          color: var(--brand);
        }

        .tv-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          background: var(--brand-soft);
          color: var(--brand);
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          border: 1px solid rgba(254, 92, 43, 0.12);
        }

        .tv-kpi-grid {
          display: grid;
          gap: 8px;
          margin-bottom: 10px;
        }

        .tv-kpi-grid.loop {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .tv-kpi-grid.contracts {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .tv-kpi {
          padding: 12px;
          border-radius: 18px;
          background: #fff;
          border: 1px solid var(--line);
        }

        .tv-kpi-value {
          font-size: clamp(24px, 1.8vw, 34px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.05em;
          color: var(--text);
        }

        .tv-kpi-label {
          margin-top: 6px;
          font-size: 10px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .tv-kpi.brand .tv-kpi-value { color: var(--brand); }
        .tv-kpi.success .tv-kpi-value { color: var(--ok); }
        .tv-kpi.warning .tv-kpi-value { color: var(--warn); }
        .tv-kpi.danger .tv-kpi-value { color: var(--danger); }

        .tv-scroll {
          min-height: 0;
          overflow: auto;
          padding-right: 4px;
        }

        .tv-scroll::-webkit-scrollbar {
          width: 6px;
        }

        .tv-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.12);
          border-radius: 999px;
        }

        .tv-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .tv-row {
          padding: 12px;
          border-radius: 18px;
          background: #fff;
          border: 1px solid var(--line);
          border-left-width: 4px;
        }

        .tv-row.is-critical { border-left-color: var(--danger); }
        .tv-row.is-high { border-left-color: var(--brand); }
        .tv-row.is-medium { border-left-color: var(--warn); }
        .tv-row.is-low { border-left-color: var(--ok); }

        .tv-row-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .tv-row-title {
          font-size: 16px;
          font-weight: 800;
          line-height: 1.15;
          margin: 0;
          color: var(--text);
        }

        .tv-row-meta {
          margin-top: 5px;
          color: var(--muted);
          font-size: 12px;
        }

        .tv-metric {
          text-align: right;
          white-space: nowrap;
        }

        .tv-metric-value {
          font-size: 18px;
          line-height: 1;
          font-weight: 900;
          color: var(--text);
        }

        .tv-metric-label {
          margin-top: 4px;
          color: var(--muted);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .tv-contract-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 84px;
          padding: 7px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
        }

        .tv-contract-chip.critical { background: #ffe8e8; color: var(--danger); }
        .tv-contract-chip.warning { background: #fff3dc; color: var(--warn); }
        .tv-contract-chip.ok { background: #e7faf2; color: var(--ok); }

        .tv-ranking-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px;
          border-radius: 18px;
          background: #fff;
          border: 1px solid var(--line);
        }

        .tv-ranking-item.leader {
          background: linear-gradient(135deg, #fff5ef, #fffaf7);
          border-color: rgba(254, 92, 43, 0.18);
        }

        .tv-ranking-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .tv-avatar,
        .tv-avatar-fallback {
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          border-radius: 999px;
          object-fit: cover;
          border: 2px solid rgba(254, 92, 43, 0.16);
          box-shadow: 0 8px 18px rgba(254, 92, 43, 0.12);
        }

        .tv-avatar-fallback {
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #ffd8ca, #fff0e8);
          color: var(--brand);
          font-size: 14px;
          font-weight: 900;
        }

        .tv-ranking-name {
          font-size: 15px;
          font-weight: 800;
          line-height: 1.1;
          color: var(--text);
        }

        .tv-ranking-meta {
          margin-top: 5px;
          font-size: 12px;
          color: var(--muted);
        }

        .tv-ranking-total {
          font-size: 17px;
          font-weight: 900;
          color: var(--ok);
          white-space: nowrap;
        }

        .tv-postit-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .tv-postit {
          position: relative;
          min-height: 152px;
          padding: 16px 14px 14px;
          border-radius: 18px;
          background: linear-gradient(160deg, #fff7d8 0%, #fff0b4 100%);
          color: #403010;
          box-shadow: 0 10px 24px rgba(168, 124, 42, 0.12);
          border: 1px solid rgba(201, 133, 9, 0.12);
        }

        .tv-postit:nth-child(2n) { transform: rotate(-1deg); }
        .tv-postit:nth-child(2n+1) { transform: rotate(1deg); }

        .tv-postit::before {
          content: "";
          position: absolute;
          top: 9px;
          left: 50%;
          transform: translateX(-50%);
          width: 40px;
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.7);
        }

        .tv-postit-author {
          margin-top: 8px;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: rgba(64, 48, 16, 0.62);
        }

        .tv-postit-text {
          margin-top: 10px;
          font-size: 16px;
          font-weight: 800;
          line-height: 1.28;
          white-space: pre-wrap;
        }

        .tv-empty {
          min-height: 140px;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 18px;
          border-radius: 18px;
          color: var(--muted);
          background: rgba(255,255,255,0.65);
          border: 1px dashed var(--line-strong);
        }

        .tv-footer {
          overflow: hidden;
          border-radius: 18px;
          background: linear-gradient(90deg, #ffe4d7, #fff1ea);
          border: 1px solid rgba(254, 92, 43, 0.14);
          box-shadow: 0 12px 28px rgba(128, 87, 54, 0.08);
        }

        .tv-footer-inner {
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: center;
        }

        .tv-footer-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          font-size: 11px;
          font-weight: 900;
          color: var(--brand);
          text-transform: uppercase;
          letter-spacing: 0.18em;
          background: rgba(254, 92, 43, 0.08);
        }

        .tv-ticker {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          color: #7e3a1f;
          font-size: 15px;
          font-weight: 800;
        }

        .tv-ticker-track {
          display: inline-block;
          padding: 12px 0 12px 100%;
          animation: ticker-move 34s linear infinite;
        }

        @keyframes ticker-move {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }

        .tv-alert {
          position: absolute;
          right: 12px;
          top: 12px;
          z-index: 3;
          max-width: 34vw;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(112, 35, 35, 0.95);
          color: #fff2f2;
          border: 1px solid rgba(216, 79, 79, 0.2);
          box-shadow: 0 14px 28px rgba(0, 0, 0, 0.15);
          font-size: 12px;
          font-weight: 700;
        }

        .tv-alert-line + .tv-alert-line { margin-top: 6px; }

        @media (max-width: 1360px) {
          .tv-kpi-grid.loop {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tv-postit-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-aspect-ratio: 1/1) {
          .tv-header {
            grid-template-columns: 1fr;
          }

          .tv-status {
            align-items: flex-start;
          }

          .tv-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto auto;
            grid-template-areas:
              "loop loop"
              "contracts ranking"
              "postits postits";
          }
        }
      `}</style>

      <div className="tv-shell">
        <header className="tv-header">
          <div className="tv-brand">
            <div className="tv-logo-wrap">
              <img src="/logo-light.png" alt="Intermidia" className="tv-logo" />
            </div>

            <div>
              <div className="tv-kicker">
                <Radio size={12} strokeWidth={2.6} /> Painel Operacional
              </div>
              <h1 className="tv-title">Painel Comercial Intermidia</h1>
              <div className="tv-subtitle">
                Mais compacto, claro e com leitura rápida para TV corporativa.
              </div>
            </div>
          </div>

          <div className="tv-status">
            <div className="tv-status-label">Última atualização</div>
            <div className="tv-status-value">{updatedAt || '--/--/---- --:--:--'}</div>
            <div className="tv-status-note">Atualização automática a cada 15 segundos</div>
          </div>
        </header>

        <section className="tv-grid">
          <article className="tv-card ga-loop">
            <div className="tv-card-head">
              <h2 className="tv-card-title">
                <Activity size={20} strokeWidth={2.6} /> Auditoria de Loop
              </h2>
              <div className="tv-pill">Tempo real</div>
            </div>

            <div className="tv-kpi-grid loop">
              <div className="tv-kpi">
                <div className="tv-kpi-value">{loop.total || 0}</div>
                <div className="tv-kpi-label">Locais</div>
              </div>
              <div className="tv-kpi success">
                <div className="tv-kpi-value">{loop.online || 0}</div>
                <div className="tv-kpi-label">Online</div>
              </div>
              <div className="tv-kpi danger">
                <div className="tv-kpi-value">{loop.lotados || 0}</div>
                <div className="tv-kpi-label">Lotados</div>
              </div>
              <div className="tv-kpi brand">
                <div className="tv-kpi-value">{loop.totalCotasLivres || 0}</div>
                <div className="tv-kpi-label">Cotas livres</div>
              </div>
            </div>

            <div className="tv-scroll">
              <div className="tv-list">
                {(loop.itensCriticos || []).map((item) => {
                  const tone = toneClass(statusTone(item.pct_ocupado));
                  return (
                    <div key={String(item.id)} className={`tv-row ${tone}`}>
                      <div className="tv-row-top">
                        <div>
                          <div className="tv-row-title">{item.local || item.nome || 'Monitor'}</div>
                          <div className="tv-row-meta">
                            {item.cidade || 'Sem cidade'} • {item.insercoes_ativas || 0} inserções ativas
                          </div>
                        </div>
                        <div className="tv-metric">
                          <div className="tv-metric-value">{item.pct_ocupado}%</div>
                          <div className="tv-metric-label">ocupado</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!loop.itensCriticos?.length && <div className="tv-empty">Nenhum ponto crítico no momento.</div>}
              </div>
            </div>
          </article>

          <article className="tv-card ga-contracts">
            <div className="tv-card-head">
              <h2 className="tv-card-title">
                <CalendarClock size={20} strokeWidth={2.6} /> Controle de Contratos
              </h2>
              <div className="tv-pill">Auto-scroll</div>
            </div>

            <div className="tv-kpi-grid contracts">
              <div className="tv-kpi">
                <div className="tv-kpi-value">{contracts.total || 0}</div>
                <div className="tv-kpi-label">Total</div>
              </div>
              <div className="tv-kpi warning">
                <div className="tv-kpi-value">{contracts.expiring_15d || 0}</div>
                <div className="tv-kpi-label">Vencem em 15d</div>
              </div>
              <div className="tv-kpi danger">
                <div className="tv-kpi-value">{contracts.expiring_5d || 0}</div>
                <div className="tv-kpi-label">Vencem em 5d</div>
              </div>
            </div>

            <div className="tv-scroll" ref={contractsScrollRef}>
              <div className="tv-list">
                {(contracts.items || []).map((contract, index) => {
                  const chipClass = contract.daysRemaining <= 5 ? 'critical' : contract.daysRemaining <= 15 ? 'warning' : 'ok';
                  const rowTone = contract.daysRemaining <= 5 ? 'is-critical' : contract.daysRemaining <= 15 ? 'is-high' : 'is-low';
                  return (
                    <div
                      key={`${contract.advertiser}-${contract.expirationDate}-${index}`}
                      className={`tv-row ${rowTone}`}
                    >
                      <div className="tv-row-top">
                        <div>
                          <div className="tv-row-title">{contract.advertiser}</div>
                          <div className="tv-row-meta">
                            {contract.vendorName || 'Sem vendedor'} • {fmtMoney(contract.value)}
                          </div>
                        </div>
                        <div className={`tv-contract-chip ${chipClass}`}>
                          {contract.daysRemaining} dia(s)
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!contracts.items?.length && <div className="tv-empty">Sem contratos carregados no momento.</div>}
              </div>
            </div>
          </article>

          <article className="tv-card ga-ranking">
            <div className="tv-card-head">
              <h2 className="tv-card-title">
                <TrendingUp size={20} strokeWidth={2.6} /> Ranking de Vendas
              </h2>
              <div className="tv-pill">Fotos + nomes normalizados</div>
            </div>

            <div className="tv-scroll">
              <div className="tv-list">
                {ranking.map((seller, index) => (
                  <div key={`${seller.vendedor}-${seller.posicao}`} className={`tv-ranking-item ${index === 0 ? 'leader' : ''}`}>
                    <div className="tv-ranking-left">
                      {seller.photo_url ? (
                        <img src={seller.photo_url} alt={seller.vendedor} className="tv-avatar" />
                      ) : (
                        <div className="tv-avatar-fallback">{getInitials(seller.vendedor)}</div>
                      )}

                      <div>
                        <div className="tv-ranking-name">{seller.posicao}. {seller.vendedor}</div>
                        <div className="tv-ranking-meta">{seller.vendas} venda(s) no mês</div>
                      </div>
                    </div>

                    <div className="tv-ranking-total">{fmtMoney(seller.total)}</div>
                  </div>
                ))}

                {!ranking.length && <div className="tv-empty">Nenhuma venda registrada no mês atual.</div>}
              </div>
            </div>
          </article>

          <article className="tv-card ga-postits">
            <div className="tv-card-head">
              <h2 className="tv-card-title">
                <StickyNote size={20} strokeWidth={2.6} /> Mural do Grupo
              </h2>
              <div className="tv-pill">WhatsApp</div>
            </div>

            <div className="tv-scroll">
              {postits.length ? (
                <div className="tv-postit-grid">
                  {postits.map((postit) => (
                    <div key={postit.id} className="tv-postit">
                      <div className="tv-postit-author">
                        {postit.author || 'Equipe'} • {postit.source === 'whatsapp' ? 'WhatsApp' : 'Manual'}
                      </div>
                      <div className="tv-postit-text">{postit.text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tv-empty">Nenhum post-it ainda. Envie mensagens no grupo configurado.</div>
              )}
            </div>
          </article>
        </section>

        <footer className="tv-footer">
          <div className="tv-footer-inner">
            <div className="tv-footer-label">
              <Newspaper size={16} strokeWidth={2.8} /> Flash Intermidia
            </div>
            <div className="tv-ticker">
              <div className="tv-ticker-track">{tickerText} • {tickerText} • {tickerText}</div>
            </div>
          </div>
        </footer>
      </div>

      {warnings.length > 0 || error ? (
        <div className="tv-alert">
          {[...(error ? [`Erro de atualização: ${error}`] : []), ...warnings].map((message, index) => (
            <div key={`${message}-${index}`} className="tv-alert-line">
              <FileWarning size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
              {message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
