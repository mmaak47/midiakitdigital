import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CalendarClock,
  Clock3,
  FileWarning,
  Newspaper,
  Radio,
  Repeat,
  StickyNote,
  Target,
  Thermometer,
  TrendingUp,
} from 'lucide-react';

const POLL_MS = 15000;

const FRASES_MOTIVACIONAIS = [
  '"O sucesso é a soma de pequenos esforços repetidos dia após dia." — Robert Collier',
  '"A persistência é o caminho do êxito." — Albert Einstein',
  '"Nunca é tarde demais para ser o que você poderia ter sido." — George Eliot',
  '"O sucesso é tropeçar de falha em falha sem perder o entusiasmo." — Winston Churchill',
  '"É sempre cedo demais para desistir." — Norman Vincent Peale',
  '"A única maneira de fazer um excelente trabalho é amar o que você faz." — Steve Jobs',
  '"Foco é dizer não a 1.000 coisas." — Steve Jobs',
  '"O segredo do sucesso é a constância do propósito." — Benjamin Disraeli',
  '"Foco no cliente acima de tudo mais. O sucesso virá como consequência natural." — Michael Dell',
  '"Quanto maior o obstáculo, mais glorioso é superá-lo." — Molière',
  '"Sozinhos vamos mais rápido, juntos vamos mais longe." — Provérbio Africano',
  '"O talento vence jogos, mas o trabalho em equipe e a inteligência vencem campeonatos." — Michael Jordan',
  '"Nenhum de nós é tão bom quanto todos nós juntos." — Ray Kroc',
  '"A confiança em si mesmo é o primeiro segredo do sucesso." — Ralph Waldo Emerson',
  '"Não importa o quão devagar você vá, desde que você não pare." — Confúcio',
  '"Grandes realizações não são feitas por impulso, mas por uma soma de pequenas realizações." — Van Gogh',
  '"Acredite em si mesmo e em tudo que você é." — Christian D. Larson',
  '"A determinação é o que transforma o sonho em realidade."',
  '"O todo é mais do que a soma das partes." — Aristóteles',
  '"A força de um time está em cada membro. A força de cada membro é o time." — Phil Jackson',
];

function fmtMoney(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
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

function goalPctColorClass(pct) {
  if (pct >= 100) return 'tv-goal-pct-ok';
  if (pct >= 75) return 'tv-goal-pct-high';
  if (pct >= 50) return 'tv-goal-pct-medium';
  return 'tv-goal-pct-low';
}

function goalPctBarClass(pct) {
  if (pct >= 100) return 'tv-goal-bar-ok';
  if (pct >= 75) return 'tv-goal-bar-high';
  if (pct >= 50) return 'tv-goal-bar-medium';
  return 'tv-goal-bar-low';
}

export default function TvWall() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [nowTime, setNowTime] = useState(() => new Date());
  const [temperature, setTemperature] = useState(null);
  const [salePopup, setSalePopup] = useState(null);
  const loopScrollRef = useRef(null);
  const contractsScrollRef = useRef(null);
  const seenSalesRef = useRef(new Set());
  const [tickerIdx, setTickerIdx] = useState(0);
  const isFirstLoadRef = useRef(true);

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

  // Build rotating ticker messages: last sale info + motivational phrases
  const tickerMessages = useMemo(() => {
    const msgs = [];
    const activities = data?.recent_activity || [];
    const lastSale = activities.find((a) => a.type === 'venda');
    if (lastSale) {
      msgs.push(`🏆 Última venda: dia ${lastSale.data_ref} para o cliente ${lastSale.cliente} pelo vendedor ${lastSale.vendedor}`);
    }
    // Add shuffled motivational phrases
    const shuffled = [...FRASES_MOTIVACIONAIS].sort(() => Math.random() - 0.5);
    msgs.push(...shuffled);
    return msgs.length ? msgs : ['Intermidia ao vivo: acompanhe contratos, auditoria de loop, ranking de vendas e recados da operação em tempo real.'];
  }, [data?.recent_activity]);

  // Rotate ticker message every 12 seconds
  useEffect(() => {
    if (tickerMessages.length <= 1) return;
    const timer = setInterval(() => {
      setTickerIdx((prev) => (prev + 1) % tickerMessages.length);
    }, 12000);
    return () => clearInterval(timer);
  }, [tickerMessages.length]);

  const currentTickerText = tickerMessages[tickerIdx % tickerMessages.length] || tickerMessages[0];

  const loop = data?.loop || {};
  const contracts = data?.contracts || { items: [] };
  const ranking = data?.ranking || [];
  const goals = data?.goals || {};
  const postits = data?.postits || [];

  // Detect new sales and show popup
  useEffect(() => {
    if (!data?.recent_activity?.length) return;
    const activities = data.recent_activity;

    if (isFirstLoadRef.current) {
      // On first load, just record existing sales without popping up
      activities.forEach((item) => {
        const key = `${item.type}-${item.cliente}-${item.data_ref}-${item.vendedor}`;
        seenSalesRef.current.add(key);
      });
      isFirstLoadRef.current = false;
      return;
    }

    for (const item of activities) {
      const key = `${item.type}-${item.cliente}-${item.data_ref}-${item.vendedor}`;
      if (!seenSalesRef.current.has(key) && item.type === 'venda') {
        seenSalesRef.current.add(key);
        setSalePopup({
          vendedor: item.vendedor || 'Vendedor',
          cliente: item.cliente || 'Cliente',
          valor: item.valor_total || item.valor_mensal || 0,
          status: item.status || 'Venda'
        });
        // Play bell sound
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const playTone = (freq, start, dur) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + start);
            osc.stop(audioCtx.currentTime + start + dur);
          };
          playTone(830, 0, 0.3);
          playTone(1050, 0.15, 0.3);
          playTone(1320, 0.35, 0.5);
        } catch { /* audio not available */ }
        break; // show one popup at a time
      }
      // Also track non-venda items so they don't re-trigger if type changes
      seenSalesRef.current.add(key);
    }
  }, [data?.recent_activity]);

  // Auto-dismiss popup after 8 seconds
  useEffect(() => {
    if (!salePopup) return;
    const timer = setTimeout(() => setSalePopup(null), 8000);
    return () => clearTimeout(timer);
  }, [salePopup]);

  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadTemp() {
      try {
        const response = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=-23.3045&longitude=-51.1696&current=temperature_2m'
        );
        if (!response.ok) return;
        const json = await response.json();
        const value = Number(json?.current?.temperature_2m);
        if (!alive) return;
        if (Number.isFinite(value)) {
          setTemperature(Math.round(value));
        }
      } catch {
        // Sem temperatura não bloqueia o painel
      }
    }

    loadTemp();
    const interval = setInterval(loadTemp, 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let pauseUntil = Date.now() + 2000;
    const timer = setInterval(() => {
      const element = loopScrollRef.current;
      if (!element) return;
      const maxScroll = element.scrollHeight - element.clientHeight;
      if (maxScroll <= 6) return;
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
  }, []);

  useEffect(() => {
    let pauseUntil = Date.now() + 2000;
    const timer = setInterval(() => {
      const element = contractsScrollRef.current;
      if (!element) return;
      const maxScroll = element.scrollHeight - element.clientHeight;
      if (maxScroll <= 6) return;
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
  }, []);

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
          gap: 8px;
          height: 100%;
          padding: 8px;
        }

        .tv-header {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 6px 14px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255,255,255,0.97), rgba(255,255,255,0.92));
          border: 1px solid rgba(254, 92, 43, 0.16);
          box-shadow: 0 14px 40px rgba(141, 98, 61, 0.09);
        }

        .tv-lotados {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          overflow: hidden;
        }

        .tv-lotados-label {
          flex: 0 0 auto;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--danger);
          background: #fff0f0;
          border: 1px solid rgba(216,79,79,0.18);
          padding: 3px 8px;
          border-radius: 8px;
          white-space: nowrap;
        }

        .tv-lotados-list {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          overflow: hidden;
          flex-wrap: nowrap;
        }

        .tv-lotados-chip {
          flex: 0 0 auto;
          font-size: 10px;
          font-weight: 700;
          color: #b33;
          background: #fff5f5;
          border: 1px solid rgba(216,79,79,0.12);
          padding: 2px 8px;
          border-radius: 8px;
          white-space: nowrap;
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
          padding: 6px 10px;
          border-radius: 14px;
          background: linear-gradient(180deg, #fff9f5, #fff2ea);
          border: 1px solid rgba(254, 92, 43, 0.16);
        }

        .tv-logo {
          height: 26px;
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
          margin: 1px 0 0;
          font-size: clamp(18px, 1.3vw, 24px);
          line-height: 1.05;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: var(--text);
        }

        .tv-status {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          min-width: 250px;
        }

        .tv-status-card {
          padding: 6px 10px;
          border-radius: 14px;
          background: linear-gradient(180deg, #fff9f7, #fff2ec);
          border: 1px solid rgba(254, 92, 43, 0.14);
          text-align: right;
        }

        .tv-status-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--muted);
        }

        .tv-status-value {
          font-size: 16px;
          font-weight: 900;
          color: var(--brand);
          line-height: 1;
          margin-top: 2px;
        }

        .tv-status-note {
          margin-top: 2px;
          font-size: 10px;
          color: var(--muted);
        }

        .tv-grid {
          min-height: 0;
          display: grid;
          grid-template-columns: 1fr 1.3fr 1fr;
          grid-template-rows: 1fr 1fr;
          grid-template-areas:
            "loop goals contracts"
            "postits postits ranking";
          gap: 10px;
        }

        .ga-loop { grid-area: loop; }
        .ga-contracts { grid-area: contracts; }
        .ga-ranking {
          grid-area: ranking;
        }
        .ga-insights { grid-area: goals; }
        .ga-postits { grid-area: postits; }

        .ga-ranking .tv-scroll {
          overflow: auto;
          padding-right: 4px;
        }

        .tv-card {
          min-height: 0;
          display: flex;
          flex-direction: column;
          padding: 12px;
          border-radius: 20px;
          background: linear-gradient(180deg, var(--bg-panel-strong), var(--bg-panel));
          border: 1px solid var(--line);
          box-shadow: 0 14px 34px rgba(64, 45, 33, 0.08);
          overflow: hidden;
        }

        .tv-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
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
          gap: 6px;
          margin-bottom: 8px;
        }

        .tv-kpi-grid.loop {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .tv-kpi-grid.contracts {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .tv-kpi {
          padding: 8px 10px;
          border-radius: 14px;
          background: #fff;
          border: 1px solid var(--line);
        }

        .tv-kpi-value {
          font-size: clamp(20px, 1.5vw, 28px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.05em;
          color: var(--text);
        }

        .tv-kpi-label {
          margin-top: 4px;
          font-size: 9px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.14em;
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
          gap: 5px;
        }

        .tv-row {
          padding: 8px 10px;
          border-radius: 14px;
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
          font-size: 13px;
          font-weight: 800;
          line-height: 1.15;
          margin: 0;
          color: var(--text);
        }

        .tv-row-meta {
          margin-top: 3px;
          color: var(--muted);
          font-size: 11px;
        }

        .tv-metric {
          text-align: right;
          white-space: nowrap;
        }

        .tv-metric-value {
          font-size: 16px;
          line-height: 1;
          font-weight: 900;
          color: var(--text);
        }

        .tv-metric-label {
          margin-top: 2px;
          color: var(--muted);
          font-size: 9px;
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
          position: relative;
        }

        .tv-ranking-item.leader {
          background: linear-gradient(135deg, #fff5ef, #fffaf7);
          border-color: rgba(254, 92, 43, 0.24);
          box-shadow: 0 8px 24px rgba(254, 92, 43, 0.12);
        }

        .tv-crown {
          position: absolute;
          top: -14px;
          left: 16px;
          font-size: 0;
          animation: crown-bounce 2s ease-in-out infinite;
          filter: drop-shadow(0 2px 6px rgba(234, 179, 8, 0.5));
          z-index: 2;
        }

        @keyframes crown-bounce {
          0%, 100% { transform: translateY(0) rotate(-6deg); }
          50% { transform: translateY(-3px) rotate(-6deg); }
        }

        @keyframes crown-glow {
          0%, 100% { filter: drop-shadow(0 2px 6px rgba(234, 179, 8, 0.5)); }
          50% { filter: drop-shadow(0 4px 14px rgba(234, 179, 8, 0.8)); }
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
          text-align: right;
          white-space: nowrap;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .tv-ranking-val {
          font-size: 15px;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
        }

        .tv-ranking-val.parcela { color: var(--ok); }
        .tv-ranking-val.contratos { color: #a855f7; }

        .tv-ranking-val-label {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
        }

        .tv-goals-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-bottom: 0;
          min-height: 0;
          overflow: auto;
        }

        .tv-goal {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: #fff;
          padding: 8px 10px;
        }

        .tv-goal.is-recorrencia {
          border-color: rgba(168, 85, 247, 0.55);
        }

        .tv-goal.is-parcela {
          border-color: rgba(245, 158, 11, 0.6);
        }

        .tv-goal-head {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }

        .tv-goal-head svg {
          flex: 0 0 auto;
        }

        .tv-goal-name {
          font-size: 15px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.02em;
          color: #0f172a;
        }

        .tv-goal-subtitle {
          font-size: 10px;
          color: var(--muted);
        }

        .tv-goal-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 8px;
          margin-bottom: 3px;
        }

        .tv-goal-label {
          font-size: 10px;
          color: var(--muted);
        }

        .tv-goal-main {
          margin-top: 2px;
          font-size: 22px;
          font-weight: 800;
          color: var(--text);
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .tv-goal-pct {
          font-size: 22px;
          line-height: 1;
          font-weight: 900;
        }

        .tv-goal-pct.tv-goal-pct-ok { color: #22c55e; }
        .tv-goal-pct.tv-goal-pct-high { color: #fe5c2b; }
        .tv-goal-pct.tv-goal-pct-medium { color: #f59e0b; }
        .tv-goal-pct.tv-goal-pct-low { color: #ef4444; }

        .tv-goal-progress {
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: #e5e7eb;
          margin-bottom: 4px;
          overflow: hidden;
        }

        .tv-goal-progress-fill {
          height: 100%;
          border-radius: 999px;
          transition: width 400ms ease;
        }

        .tv-goal-progress-fill.tv-goal-bar-ok { background: #22c55e; }
        .tv-goal-progress-fill.tv-goal-bar-high { background: #3b82f6; }
        .tv-goal-progress-fill.tv-goal-bar-medium { background: #f59e0b; }
        .tv-goal-progress-fill.tv-goal-bar-low { background: #ef4444; }

        .tv-goal-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .tv-goal-meta {
          font-size: 10px;
          color: var(--muted);
        }

        .tv-goal-real {
          margin-top: 1px;
          font-size: 17px;
          line-height: 1;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.03em;
        }

        .tv-goal-real.is-hit { color: #22c55e; }

        .tv-goal-diff {
          text-align: right;
        }

        .tv-goal-diff-value {
          margin-top: 1px;
          font-size: 14px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .tv-goal-diff-value.is-ok { color: #22c55e; }
        .tv-goal-diff-value.is-miss { color: #ef4444; }

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
          animation: ticker-move var(--ticker-dur, 34s) linear infinite;
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

        .tv-sale-popup {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 100;
          min-width: 420px;
          max-width: 560px;
          padding: 32px 36px;
          border-radius: 28px;
          background: linear-gradient(160deg, #fff8f4 0%, #fff0e6 100%);
          border: 2px solid rgba(254, 92, 43, 0.3);
          box-shadow: 0 40px 120px rgba(0, 0, 0, 0.25), 0 0 0 6px rgba(254, 92, 43, 0.08);
          text-align: center;
          animation: sale-popup-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .tv-sale-popup-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99;
          background: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(4px);
          animation: sale-fade-in 0.3s ease;
        }

        @keyframes sale-popup-in {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @keyframes sale-fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        .tv-sale-bell {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fe5c2b, #ff8c5a);
          box-shadow: 0 12px 32px rgba(254, 92, 43, 0.35);
          margin-bottom: 16px;
          animation: sale-bell-ring 0.6s ease 0.3s;
        }

        @keyframes sale-bell-ring {
          0%, 100% { transform: rotate(0); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(3deg); }
        }

        .tv-sale-title {
          font-size: 14px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--brand);
          margin-bottom: 8px;
        }

        .tv-sale-vendedor {
          font-size: 28px;
          font-weight: 900;
          color: var(--text);
          line-height: 1.12;
          letter-spacing: -0.03em;
        }

        .tv-sale-detail {
          margin-top: 10px;
          font-size: 15px;
          color: var(--muted);
          font-weight: 600;
        }

        .tv-sale-valor {
          margin-top: 14px;
          display: inline-block;
          padding: 8px 20px;
          border-radius: 999px;
          background: linear-gradient(135deg, #e7faf2, #d0f5e4);
          color: var(--ok);
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.02em;
          border: 1px solid rgba(23, 154, 109, 0.18);
        }

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
            grid-template-columns: 1fr;
          }

          .tv-status-card {
            text-align: left;
          }

          .tv-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto auto auto auto;
            grid-template-areas:
              "goals goals"
              "loop loop"
              "contracts contracts"
              "postits postits"
              "ranking ranking";
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
            </div>
          </div>

          {(() => {
            const lotados = loop.lotadosItems || [];
            if (!lotados.length) return <div />;
            return (
              <div className="tv-lotados">
                <div className="tv-lotados-label">Lotados ({lotados.length})</div>
                <div className="tv-lotados-list">
                  {lotados.map(i => (
                    <div key={i.id} className="tv-lotados-chip">{i.local || i.nome}</div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="tv-status">
            <div className="tv-status-card">
              <div className="tv-status-label"><Clock3 size={11} style={{ display: 'inline', verticalAlign: 'text-top', marginRight: 4 }} /> Horário</div>
              <div className="tv-status-value">{nowTime.toLocaleTimeString('pt-BR', { hour12: false })}</div>
              <div className="tv-status-note">{nowTime.toLocaleDateString('pt-BR')}</div>
            </div>
            <div className="tv-status-card">
              <div className="tv-status-label"><Thermometer size={11} style={{ display: 'inline', verticalAlign: 'text-top', marginRight: 4 }} /> Temperatura</div>
              <div className="tv-status-value">{temperature != null ? `${temperature}°C` : '--°C'}</div>
              <div className="tv-status-note">Londrina</div>
            </div>
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

            <div className="tv-scroll" ref={loopScrollRef}>
              <div className="tv-list">
                {(loop.itensCriticos || []).map((item) => {
                  const tone = toneClass(statusTone(item.pct_ocupado));
                  const isLotado = item.pct_ocupado >= 100;
                  const cicloMin = Math.floor((item.ciclo_ocupado_seg || 0) / 60);
                  const cicloSec = (item.ciclo_ocupado_seg || 0) % 60;
                  const cicloTotalMin = Math.floor((item.ciclo_total_seg || 180) / 60);
                  const telas = item.telas || 1;
                  const diverge = item.divergente;
                  return (
                    <div key={String(item.id)} className={`tv-row ${tone}`}>
                      <div className="tv-row-top">
                        <div style={{ minWidth: 0 }}>
                          <div className="tv-row-title">
                            {item.local || item.nome || 'Monitor'}
                            {telas > 1 && !diverge && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#fe5c2b', background: 'rgba(254,92,43,0.13)', padding: '2px 7px', borderRadius: 6, verticalAlign: 'middle' }}>{telas} telas</span>}
                            {diverge && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#eab308', background: 'rgba(234,179,8,0.13)', padding: '2px 7px', borderRadius: 6, verticalAlign: 'middle' }}>⚠ divergente</span>}
                            {isLotado && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 900, color: 'var(--danger)', background: '#ffe8e8', padding: '2px 6px', borderRadius: 6, verticalAlign: 'middle' }}>LOTADO</span>}
                          </div>
                          <div className="tv-row-meta">
                            {item.cidade || 'Sem cidade'} · {item.insercoes_ativas || 0} cotas ocupadas · {item.cotas_livres ?? '?'} livres · ciclo {cicloMin}:{String(cicloSec).padStart(2, '0')}/{cicloTotalMin}:00
                          </div>
                        </div>
                        <div className="tv-metric">
                          <div className="tv-metric-value" style={isLotado ? { color: 'var(--danger)' } : undefined}>{item.pct_ocupado}%</div>
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
              <div className="tv-pill">Top performance do mês</div>
            </div>

            <div className="tv-scroll">
              <div className="tv-list">
                {ranking.map((seller, index) => (
                  <div key={`${seller.vendedor}-${seller.posicao}`} className={`tv-ranking-item ${index === 0 ? 'leader' : ''}`}>
                    {index === 0 && (
                      <div className="tv-crown">
                        <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
                          <path d="M2 18L5 6L10 12L14 2L18 12L23 6L26 18H2Z" fill="#facc15" stroke="#eab308" strokeWidth="1.5" strokeLinejoin="round"/>
                          <rect x="2" y="18" width="24" height="3" rx="1.5" fill="#eab308"/>
                          <circle cx="5" cy="6" r="2" fill="#fde047"/>
                          <circle cx="14" cy="2" r="2" fill="#fde047"/>
                          <circle cx="23" cy="6" r="2" fill="#fde047"/>
                        </svg>
                      </div>
                    )}
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

                    <div className="tv-ranking-total">
                      <div>
                        <span className="tv-ranking-val-label">1ª Parcela</span>
                        <div className="tv-ranking-val parcela">{fmtMoney(seller.total)}</div>
                      </div>
                      <div>
                        <span className="tv-ranking-val-label">Contratos</span>
                        <div className="tv-ranking-val contratos">{fmtMoney(seller.total_contratos)}</div>
                      </div>
                    </div>
                  </div>
                ))}

                {!ranking.length && <div className="tv-empty">Nenhuma venda registrada no mês atual.</div>}
              </div>
            </div>
          </article>

          <article className="tv-card ga-insights">
            <div className="tv-card-head">
              <h2 className="tv-card-title">
                <Target size={20} strokeWidth={2.6} /> Metas do Mês
              </h2>
              <div className="tv-pill">Progresso</div>
            </div>

            <div className="tv-scroll">
            <div className="tv-goals-grid">
              {(() => {
                const cards = [
                  {
                    key: 'recorrencia',
                    title: 'Recorrência',
                    subtitle: 'Total de contratos',
                    icon: <Repeat size={22} color="#a855f7" />,
                    cardClass: 'is-recorrencia',
                    meta: Number(goals.meta_recorrencia || 0),
                    real: Number(goals.realizado_recorrencia || 0),
                    pct: Number(goals.pct_recorrencia || 0),
                  },
                  {
                    key: 'parcela',
                    title: '1ª Parcela',
                    subtitle: 'Valor mensal vendido',
                    icon: <Target size={22} color="#f59e0b" />,
                    cardClass: 'is-parcela',
                    meta: Number(goals.meta_mensal || 0),
                    real: Number(goals.realizado_mensal || 0),
                    pct: Number(goals.pct_mensal || 0),
                  },
                ];

                return cards.map((card) => {
                  const diff = card.real - card.meta;
                  const hasMeta = card.meta > 0;
                  return (
                    <div key={card.key} className={`tv-goal ${card.cardClass}`}>
                      <div className="tv-goal-head">
                        {card.icon}
                        <div>
                          <div className="tv-goal-name">{card.title}</div>
                          <div className="tv-goal-subtitle">{card.subtitle}</div>
                        </div>
                      </div>

                      {hasMeta ? (
                        <>
                          <div className="tv-goal-top">
                            <div>
                              <div className="tv-goal-label">Meta</div>
                              <div className="tv-goal-main">{fmtMoney(card.meta)}</div>
                            </div>
                            <div className={`tv-goal-pct ${goalPctColorClass(card.pct)}`}>{Math.max(0, Math.round(card.pct))}%</div>
                          </div>

                          <div className="tv-goal-progress">
                            <div
                              className={`tv-goal-progress-fill ${goalPctBarClass(card.pct)}`}
                              style={{ width: `${Math.min(Math.max(card.pct, 0), 100)}%` }}
                            />
                          </div>

                          <div className="tv-goal-foot">
                            <div>
                              <div className="tv-goal-label">Realizado</div>
                              <div className={`tv-goal-real ${card.real >= card.meta ? 'is-hit' : ''}`}>{fmtMoney(card.real)}</div>
                            </div>
                            <div className="tv-goal-diff">
                              <div className="tv-goal-label">Diferença</div>
                              <div className={`tv-goal-diff-value ${diff >= 0 ? 'is-ok' : 'is-miss'}`}>{diff >= 0 ? '+' : ''}{fmtMoney(diff)}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="tv-goal-meta">Meta não definida</div>
                      )}
                    </div>
                  );
                });
              })()}
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
              <div className="tv-ticker-track" style={{ '--ticker-dur': `${Math.max(20, currentTickerText.length * 0.35)}s` }}>{currentTickerText}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{currentTickerText}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{currentTickerText}</div>
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

      {salePopup && (
        <>
          <div className="tv-sale-popup-backdrop" onClick={() => setSalePopup(null)} />
          <div className="tv-sale-popup">
            <div className="tv-sale-bell">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </div>
            <div className="tv-sale-title">Nova Venda Registrada!</div>
            <div className="tv-sale-vendedor">{salePopup.vendedor}</div>
            <div className="tv-sale-detail">Cliente: {salePopup.cliente}</div>
            <div className="tv-sale-valor">{fmtMoney(salePopup.valor)}</div>
          </div>
        </>
      )}
    </div>
  );
}
