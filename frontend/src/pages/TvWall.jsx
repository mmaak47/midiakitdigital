import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeDollarSign,
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

export default function TvWall() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

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

  return (
    <div className="tv-wall min-h-screen h-screen w-screen overflow-hidden text-white">
      <style>{`
        .tv-wall {
          --bg: #05070b;
          --bg-soft: #0b1018;
          --panel: rgba(9, 15, 24, 0.76);
          --panel-strong: rgba(13, 19, 31, 0.92);
          --panel-border: rgba(255, 255, 255, 0.1);
          --brand: #fe5c2b;
          --brand-2: #ff7d45;
          --text-soft: #95a0b5;
          --line: rgba(255, 255, 255, 0.08);
          --ok: #21c98a;
          --warn: #ffb11f;
          --danger: #ff5656;
          background:
            radial-gradient(circle at 12% 18%, rgba(254, 92, 43, 0.28), transparent 24%),
            radial-gradient(circle at 88% 16%, rgba(254, 92, 43, 0.14), transparent 20%),
            radial-gradient(circle at 50% 120%, rgba(33, 201, 138, 0.1), transparent 26%),
            linear-gradient(180deg, #071018 0%, var(--bg) 100%);
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        }

        .tv-noise {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.12;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 24px 24px;
          mask-image: radial-gradient(circle at center, black 45%, transparent 100%);
        }

        .tv-shell {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-rows: auto 1fr auto;
          height: 100%;
          gap: 14px;
          padding: 12px;
        }

        .tv-header {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 18px;
          padding: 18px 22px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(12, 20, 31, 0.84), rgba(8, 13, 21, 0.94));
          border: 1px solid rgba(254, 92, 43, 0.2);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.04),
            0 24px 60px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(18px);
        }

        .tv-brandline {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .tv-brandbadge {
          width: 54px;
          height: 54px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          color: #111;
          background: linear-gradient(135deg, var(--brand), var(--brand-2));
          box-shadow: 0 14px 30px rgba(254, 92, 43, 0.35);
        }

        .tv-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          line-height: 1;
          text-transform: uppercase;
          letter-spacing: 0.28em;
          color: rgba(255, 255, 255, 0.55);
          margin-bottom: 8px;
        }

        .tv-title {
          font-size: clamp(28px, 2.2vw, 40px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.04em;
          margin: 0;
        }

        .tv-title-accent {
          color: var(--brand);
          text-shadow: 0 0 24px rgba(254, 92, 43, 0.2);
        }

        .tv-subtitle {
          margin-top: 8px;
          font-size: 14px;
          color: var(--text-soft);
          max-width: 760px;
        }

        .tv-status {
          min-width: 250px;
          padding: 14px 16px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-end;
          gap: 6px;
        }

        .tv-status-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: rgba(255, 255, 255, 0.56);
        }

        .tv-status-value {
          font-size: clamp(22px, 1.6vw, 28px);
          font-weight: 900;
          color: #fff;
        }

        .tv-status-note {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .tv-grid {
          min-height: 0;
          display: grid;
          grid-template-columns: 1.18fr 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          grid-template-areas:
            "loop contracts ranking"
            "loop postits ranking";
          gap: 14px;
        }

        .ga-loop { grid-area: loop; }
        .ga-contracts { grid-area: contracts; }
        .ga-ranking { grid-area: ranking; }
        .ga-postits { grid-area: postits; }

        .tv-card {
          min-height: 0;
          display: flex;
          flex-direction: column;
          padding: 16px;
          border-radius: 22px;
          background:
            linear-gradient(180deg, rgba(12, 18, 28, 0.92), rgba(8, 12, 20, 0.82));
          border: 1px solid var(--panel-border);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.04),
            0 18px 44px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(18px);
          overflow: hidden;
        }

        .tv-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .tv-card-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          font-size: clamp(20px, 1.35vw, 28px);
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .tv-card-title svg {
          color: var(--brand);
        }

        .tv-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(254, 92, 43, 0.12);
          color: #ffd2c2;
          font-size: 11px;
          line-height: 1;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          border: 1px solid rgba(254, 92, 43, 0.18);
        }

        .tv-kpi-grid {
          display: grid;
          gap: 10px;
          margin-bottom: 14px;
        }

        .tv-kpi-grid.loop {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .tv-kpi-grid.contracts {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .tv-kpi {
          position: relative;
          overflow: hidden;
          padding: 14px 14px 12px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.025));
          border: 1px solid var(--line);
        }

        .tv-kpi::after {
          content: "";
          position: absolute;
          inset: auto -16px -26px auto;
          width: 92px;
          height: 92px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.03);
        }

        .tv-kpi-value {
          position: relative;
          z-index: 1;
          font-size: clamp(28px, 2vw, 40px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.05em;
        }

        .tv-kpi-label {
          position: relative;
          z-index: 1;
          margin-top: 7px;
          font-size: 11px;
          color: var(--text-soft);
          text-transform: uppercase;
          letter-spacing: 0.18em;
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
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
        }

        .tv-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .tv-row {
          padding: 14px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018));
          border: 1px solid var(--line);
        }

        .tv-row.is-critical {
          border-left: 4px solid var(--danger);
          box-shadow: inset 0 0 0 1px rgba(255, 86, 86, 0.12);
        }

        .tv-row.is-high {
          border-left: 4px solid var(--brand);
          box-shadow: inset 0 0 0 1px rgba(254, 92, 43, 0.12);
        }

        .tv-row.is-medium {
          border-left: 4px solid var(--warn);
          box-shadow: inset 0 0 0 1px rgba(255, 177, 31, 0.12);
        }

        .tv-row.is-low {
          border-left: 4px solid var(--ok);
          box-shadow: inset 0 0 0 1px rgba(33, 201, 138, 0.12);
        }

        .tv-row-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .tv-row-title {
          font-size: 18px;
          font-weight: 800;
          line-height: 1.1;
          margin: 0;
        }

        .tv-row-meta {
          margin-top: 6px;
          color: var(--text-soft);
          font-size: 13px;
        }

        .tv-metric {
          text-align: right;
          white-space: nowrap;
        }

        .tv-metric-value {
          font-size: 22px;
          line-height: 1;
          font-weight: 900;
        }

        .tv-metric-label {
          margin-top: 5px;
          color: var(--text-soft);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .tv-contract-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 88px;
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 800;
        }

        .tv-contract-chip.critical {
          background: rgba(255, 86, 86, 0.12);
          color: #ff9f9f;
        }

        .tv-contract-chip.warning {
          background: rgba(255, 177, 31, 0.12);
          color: #ffd57d;
        }

        .tv-contract-chip.ok {
          background: rgba(33, 201, 138, 0.12);
          color: #86efc1;
        }

        .tv-ranking-item {
          position: relative;
          padding: 16px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018));
          border: 1px solid var(--line);
        }

        .tv-ranking-item.leader {
          background: linear-gradient(135deg, rgba(254, 92, 43, 0.16), rgba(255, 177, 31, 0.08));
          border-color: rgba(254, 92, 43, 0.24);
        }

        .tv-ranking-badge {
          position: absolute;
          top: -8px;
          right: 14px;
          padding: 6px 10px;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--brand), var(--brand-2));
          color: #111;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .tv-ranking-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }

        .tv-ranking-name {
          font-size: 18px;
          font-weight: 800;
          line-height: 1.1;
        }

        .tv-ranking-index {
          color: rgba(255, 255, 255, 0.45);
          width: 28px;
          display: inline-block;
        }

        .tv-ranking-total {
          color: #9ef2cb;
          font-size: 19px;
          font-weight: 900;
          white-space: nowrap;
        }

        .tv-ranking-meta {
          margin-top: 7px;
          font-size: 13px;
          color: var(--text-soft);
        }

        .tv-postit-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .tv-postit {
          position: relative;
          min-height: 160px;
          padding: 18px 16px 16px;
          border-radius: 18px;
          color: #fff9f6;
          background: linear-gradient(160deg, #ff6d38 0%, #fe5c2b 58%, #d74618 100%);
          box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.28),
            0 8px 18px rgba(254, 92, 43, 0.24);
        }

        .tv-postit:nth-child(2n) {
          transform: rotate(-1.2deg);
        }

        .tv-postit:nth-child(2n+1) {
          transform: rotate(1deg);
        }

        .tv-postit::before {
          content: "";
          position: absolute;
          top: 10px;
          left: 50%;
          width: 44px;
          height: 10px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.28);
        }

        .tv-postit-author {
          margin-top: 8px;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: rgba(24, 8, 2, 0.62);
        }

        .tv-postit-text {
          margin-top: 12px;
          font-size: 18px;
          font-weight: 800;
          line-height: 1.3;
          white-space: pre-wrap;
          color: #fffdfa;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.16);
        }

        .tv-empty {
          min-height: 160px;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 18px;
          border-radius: 18px;
          border: 1px dashed rgba(255, 255, 255, 0.12);
          color: var(--text-soft);
          background: rgba(255, 255, 255, 0.02);
        }

        .tv-footer {
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(254, 92, 43, 0.24);
          background: linear-gradient(90deg, rgba(254, 92, 43, 0.98), rgba(255, 129, 71, 0.96));
          box-shadow: 0 18px 34px rgba(254, 92, 43, 0.24);
        }

        .tv-footer-inner {
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: center;
        }

        .tv-footer-label {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 18px;
          font-size: 12px;
          font-weight: 900;
          color: #151515;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          background: rgba(0, 0, 0, 0.08);
        }

        .tv-ticker {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          color: #1d110c;
          font-size: clamp(16px, 1.1vw, 20px);
          font-weight: 800;
        }

        .tv-ticker-track {
          display: inline-block;
          padding: 14px 0 14px 100%;
          animation: ticker-move 34s linear infinite;
        }

        @keyframes ticker-move {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }

        .tv-alert {
          position: absolute;
          right: 16px;
          top: 16px;
          z-index: 3;
          max-width: 34vw;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(86, 12, 18, 0.94);
          color: #ffd7db;
          border: 1px solid rgba(255, 86, 86, 0.2);
          box-shadow: 0 16px 28px rgba(0, 0, 0, 0.3);
          font-size: 12px;
          font-weight: 700;
        }

        .tv-alert-line + .tv-alert-line {
          margin-top: 6px;
        }

        @media (max-width: 1360px) {
          .tv-title {
            font-size: 28px;
          }

          .tv-row-title,
          .tv-ranking-name,
          .tv-postit-text {
            font-size: 16px;
          }
        }

        @media (max-aspect-ratio: 1/1) {
          .tv-shell {
            height: auto;
            min-height: 100%;
          }

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

          .tv-postit-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="tv-noise" />

      <div className="tv-shell">
        <header className="tv-header">
          <div>
            <div className="tv-kicker">
              <Radio size={14} /> Intermidia Live Dashboard
            </div>

            <div className="tv-brandline">
              <div className="tv-brandbadge">
                <BadgeDollarSign size={28} strokeWidth={2.6} />
              </div>

              <div>
                <h1 className="tv-title">
                  Painel <span className="tv-title-accent">Intermidia</span>
                </h1>
                <div className="tv-subtitle">
                  Contratos, auditoria de loop, performance comercial e recados da operação em uma tela com identidade visual da marca.
                </div>
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
                <Activity size={22} strokeWidth={2.6} /> Auditoria de Loop
              </h2>
              <div className="tv-pill">Operação em tempo real</div>
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

                {!loop.itensCriticos?.length && (
                  <div className="tv-empty">Nenhum ponto crítico no momento.</div>
                )}
              </div>
            </div>
          </article>

          <article className="tv-card ga-contracts">
            <div className="tv-card-head">
              <h2 className="tv-card-title">
                <CalendarClock size={22} strokeWidth={2.6} /> Controle de Contratos
              </h2>
              <div className="tv-pill">Renovações e risco</div>
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

            <div className="tv-scroll">
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

                {!contracts.items?.length && (
                  <div className="tv-empty">Sem contratos carregados no momento.</div>
                )}
              </div>
            </div>
          </article>

          <article className="tv-card ga-ranking">
            <div className="tv-card-head">
              <h2 className="tv-card-title">
                <TrendingUp size={22} strokeWidth={2.6} /> Ranking de Vendas
              </h2>
              <div className="tv-pill">Mês atual</div>
            </div>

            <div className="tv-scroll">
              <div className="tv-list">
                {ranking.map((seller, index) => (
                  <div
                    key={`${seller.vendedor}-${seller.posicao}`}
                    className={`tv-ranking-item ${index === 0 ? 'leader' : ''}`}
                  >
                    {index === 0 ? <div className="tv-ranking-badge">Líder</div> : null}

                    <div className="tv-ranking-line">
                      <div className="tv-ranking-name">
                        <span className="tv-ranking-index">{seller.posicao}º</span>
                        {seller.vendedor}
                      </div>
                      <div className="tv-ranking-total">{fmtMoney(seller.total)}</div>
                    </div>

                    <div className="tv-ranking-meta">{seller.vendas} venda(s) no mês</div>
                  </div>
                ))}

                {!ranking.length && (
                  <div className="tv-empty">Nenhuma venda registrada no mês atual.</div>
                )}
              </div>
            </div>
          </article>

          <article className="tv-card ga-postits">
            <div className="tv-card-head">
              <h2 className="tv-card-title">
                <StickyNote size={22} strokeWidth={2.6} /> Mural do Grupo
              </h2>
              <div className="tv-pill">WhatsApp sincronizado</div>
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
              <Newspaper size={18} strokeWidth={2.8} /> Flash Intermidia
            </div>
            <div className="tv-ticker">
              <div className="tv-ticker-track">
                {tickerText} • {tickerText} • {tickerText}
              </div>
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
