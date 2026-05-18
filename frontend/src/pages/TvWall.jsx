import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
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
  const celebratedGoalsRef = useRef(new Set());
  const confettiCanvasRef = useRef(null);
  const carnivalStopRef = useRef(null);
  const [carnival, setCarnival] = useState(null); // { label } when active

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
  const permuta = data?.permuta || { total: 0, total_contratos: 0, vendas: 0 };
  const postits = data?.postits || [];

  // Detect new sales and show popup
  useEffect(() => {
    if (!data?.recent_activity?.length) return;
    const activities = data.recent_activity;

    if (isFirstLoadRef.current) {
      // On first load, just record existing sales without popping up
      activities.forEach((item) => {
        const key = item.event_key || `${item.type}-${item.cliente}-${item.data_ref}-${item.vendedor}`;
        seenSalesRef.current.add(key);
      });
      isFirstLoadRef.current = false;
      return;
    }

    for (const item of activities) {
      const key = item.event_key || `${item.type}-${item.cliente}-${item.data_ref}-${item.vendedor}`;
      if (!seenSalesRef.current.has(key) && item.type === 'venda') {
        seenSalesRef.current.add(key);
        setSalePopup({
          vendedor: item.vendedor || 'Vendedor',
          cliente: item.cliente || 'Cliente',
          valor: item.valor_total || item.valor_mensal || 0,
          status: item.status || 'Venda'
        });
        // Play loud attention-grabbing sale alert × 2 rounds (~22 seconds total)
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const SINGLE_DURATION = 10;
          const GAP = 1.5; // pause between rounds
          const ROUNDS = 2;

          const playAlertRound = (t0) => {
            // ── Part 1: Air horn blast (0s–3s) ──
            for (const detune of [-8, 8]) {
              const osc = ctx.createOscillator();
              const g = ctx.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(260, t0);
              osc.frequency.linearRampToValueAtTime(290, t0 + 0.15);
              osc.detune.value = detune;
              g.gain.setValueAtTime(0, t0);
              g.gain.linearRampToValueAtTime(0.45, t0 + 0.08);
              g.gain.setValueAtTime(0.45, t0 + 0.8);
              g.gain.linearRampToValueAtTime(0.05, t0 + 1.0);
              g.gain.linearRampToValueAtTime(0.45, t0 + 1.2);
              g.gain.setValueAtTime(0.45, t0 + 1.9);
              g.gain.linearRampToValueAtTime(0.05, t0 + 2.1);
              g.gain.linearRampToValueAtTime(0.45, t0 + 2.3);
              g.gain.setValueAtTime(0.45, t0 + 2.9);
              g.gain.exponentialRampToValueAtTime(0.001, t0 + 3.2);
              osc.connect(g).connect(ctx.destination);
              osc.start(t0);
              osc.stop(t0 + 3.3);
            }

            // ── Part 2: Rising siren sweep (3s–7s) ──
            for (let i = 0; i < 4; i++) {
              const osc = ctx.createOscillator();
              const g = ctx.createGain();
              osc.type = 'square';
              const base = 3.2 + i * 1.0;
              osc.frequency.setValueAtTime(500, t0 + base);
              osc.frequency.linearRampToValueAtTime(1200, t0 + base + 0.4);
              osc.frequency.linearRampToValueAtTime(500, t0 + base + 0.8);
              g.gain.setValueAtTime(0, t0 + base);
              g.gain.linearRampToValueAtTime(0.22, t0 + base + 0.05);
              g.gain.setValueAtTime(0.22, t0 + base + 0.7);
              g.gain.exponentialRampToValueAtTime(0.001, t0 + base + 0.95);
              osc.connect(g).connect(ctx.destination);
              osc.start(t0 + base);
              osc.stop(t0 + base + 1.0);
            }

            // ── Part 3: Victory fanfare (7s–10s) ──
            const fanfare = [
              { freq: 523, start: 7.0, dur: 0.25 },
              { freq: 659, start: 7.3, dur: 0.25 },
              { freq: 784, start: 7.6, dur: 0.25 },
              { freq: 1047, start: 7.9, dur: 0.6 },
              { freq: 784, start: 8.5, dur: 0.15 },
              { freq: 1047, start: 8.7, dur: 1.1 },
            ];
            for (const note of fanfare) {
              const osc = ctx.createOscillator();
              const g = ctx.createGain();
              osc.type = 'triangle';
              osc.frequency.value = note.freq;
              g.gain.setValueAtTime(0, t0 + note.start);
              g.gain.linearRampToValueAtTime(0.35, t0 + note.start + 0.03);
              g.gain.setValueAtTime(0.35, t0 + note.start + note.dur * 0.7);
              g.gain.exponentialRampToValueAtTime(0.001, t0 + note.start + note.dur);
              osc.connect(g).connect(ctx.destination);
              osc.start(t0 + note.start);
              osc.stop(t0 + note.start + note.dur + 0.05);
            }
          };

          // Fire both rounds
          for (let r = 0; r < ROUNDS; r++) {
            playAlertRound(ctx.currentTime + r * (SINGLE_DURATION + GAP));
          }

          const totalTime = ROUNDS * SINGLE_DURATION + (ROUNDS - 1) * GAP;
          setTimeout(() => { try { ctx.close(); } catch {} }, (totalTime + 1) * 1000);
        } catch { /* audio not available */ }
        break; // show one popup at a time
      }
      // Also track non-venda items so they don't re-trigger if type changes
      seenSalesRef.current.add(key);
    }
  }, [data?.recent_activity]);

  // Auto-dismiss popup after 60 seconds
  useEffect(() => {
    if (!salePopup) return;
    const timer = setTimeout(() => setSalePopup(null), 60000);
    return () => clearTimeout(timer);
  }, [salePopup]);

  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Carnival celebration launcher (META 100%) ──────────────────────────
  const launchCarnival = (label) => {
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    // Stop any previous run
    if (carnivalStopRef.current) {
      try { carnivalStopRef.current(); } catch { /* noop */ }
      carnivalStopRef.current = null;
    }
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.display = 'block';
    const W = window.innerWidth;
    const H = window.innerHeight;

    setCarnival({ label: label || 'META' });

    // Vibrant carnival palette: Brazilian flag + festival neons
    const COLORS = [
      '#fe5c2b', '#ff2d87', '#ffd400', '#22c55e', '#009c3b',
      '#ffdf00', '#3b82f6', '#002776', '#a855f7', '#ef4444',
      '#14b8a6', '#f97316', '#ec4899', '#84cc16', '#06b6d4',
    ];

    /** @type {Array<any>} */
    const pieces = [];
    /** @type {Array<any>} */
    const sparks = [];
    /** @type {Array<any>} */
    const stars = [];

    const addBurst = (cx, cy, count = 80, power = 1) => {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (3 + Math.random() * 9) * power;
        sparks.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.012 + Math.random() * 0.015,
          size: 2 + Math.random() * 3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        });
      }
    };

    const addConfettiBatch = (n) => {
      for (let i = 0; i < n; i += 1) {
        const kind = Math.random();
        const fromLeft = Math.random() < 0.5;
        const long = kind > 0.85; // streamers
        pieces.push({
          x: Math.random() * W,
          y: -20 - Math.random() * H * 0.6,
          w: long ? 3 + Math.random() * 3 : 6 + Math.random() * 8,
          h: long ? 18 + Math.random() * 26 : 5 + Math.random() * 7,
          vx: (fromLeft ? 1 : -1) * (0.5 + Math.random() * 3.5),
          vy: 2.5 + Math.random() * 6,
          rot: Math.random() * Math.PI * 2,
          rotV: (Math.random() - 0.5) * 0.28,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          life: 1,
          shape: long ? 'streamer' : (Math.random() < 0.18 ? 'circle' : 'rect'),
          wobble: Math.random() * Math.PI * 2,
          wobbleV: 0.05 + Math.random() * 0.1,
        });
      }
    };

    const addStarTwinkle = (n) => {
      for (let i = 0; i < n; i += 1) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 1.5 + Math.random() * 2.5,
          phase: Math.random() * Math.PI * 2,
          speed: 0.04 + Math.random() * 0.06,
          color: Math.random() < 0.5 ? '#ffffff' : '#fff5b0',
          life: 1,
          decay: 0.0025 + Math.random() * 0.003,
        });
      }
    };

    // Initial blast
    addConfettiBatch(280);
    addBurst(W * 0.5, H * 0.45, 120, 1.4);
    addBurst(W * 0.2, H * 0.35, 80, 1.1);
    addBurst(W * 0.8, H * 0.35, 80, 1.1);
    addStarTwinkle(80);

    const startTime = performance.now();
    const TOTAL_MS = 18000;
    let lastBatch = 0;
    let lastBurst = 0;
    let raf;
    let running = true;

    const drawStar = (x, y, r, color, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 4);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 4, 0, Math.PI * 2);
      ctx.fill();
      // 4-point sparkle cross
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-r * 3.5, 0); ctx.lineTo(r * 3.5, 0);
      ctx.moveTo(0, -r * 3.5); ctx.lineTo(0, r * 3.5);
      ctx.stroke();
      ctx.restore();
    };

    const animate = (t) => {
      if (!running) return;
      const elapsed = t - startTime;
      ctx.clearRect(0, 0, W, H);

      // Fireworks bursts every ~700ms during active phase
      if (elapsed < TOTAL_MS - 2000 && t - lastBurst > 600) {
        lastBurst = t;
        const bx = W * (0.1 + Math.random() * 0.8);
        const by = H * (0.15 + Math.random() * 0.45);
        addBurst(bx, by, 90 + Math.floor(Math.random() * 60), 1 + Math.random() * 0.6);
      }
      // Top-up confetti every ~450ms during active phase
      if (elapsed < TOTAL_MS - 3000 && t - lastBatch > 420) {
        lastBatch = t;
        addConfettiBatch(120);
      }

      // Twinkling stars (background sparkle layer)
      for (const s of stars) {
        s.phase += s.speed;
        s.life -= s.decay;
        if (s.life <= 0) continue;
        const tw = (Math.sin(s.phase) * 0.5 + 0.5) * s.life;
        drawStar(s.x, s.y, s.r, s.color, tw);
      }

      // Confetti pieces
      for (const p of pieces) {
        if (p.life <= 0) continue;
        p.wobble += p.wobbleV;
        p.x += p.vx + Math.sin(p.wobble) * 0.8;
        p.y += p.vy;
        p.vy += 0.12;
        p.rot += p.rotV;
        if (p.y > H + 40) p.life = 0;
        if (p.life <= 0) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'streamer') {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      // Firework sparks with glow trails
      ctx.globalCompositeOperation = 'lighter';
      for (const sp of sparks) {
        if (sp.life <= 0) continue;
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.08;
        sp.vx *= 0.985;
        sp.life -= sp.decay;
        ctx.save();
        ctx.globalAlpha = Math.max(0, sp.life);
        const r = sp.size * (1 + (1 - sp.life) * 0.6);
        const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, r * 4);
        grad.addColorStop(0, sp.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Cleanup arrays occasionally
      if (pieces.length > 1500) {
        for (let i = pieces.length - 1; i >= 0 && pieces.length > 900; i -= 1) {
          if (pieces[i].life <= 0) pieces.splice(i, 1);
        }
      }
      if (sparks.length > 1500) {
        for (let i = sparks.length - 1; i >= 0 && sparks.length > 900; i -= 1) {
          if (sparks[i].life <= 0) sparks.splice(i, 1);
        }
      }

      if (elapsed < TOTAL_MS) {
        raf = requestAnimationFrame(animate);
      } else {
        // Fade-out tail: keep drawing remaining particles until they die
        let anyAlive = pieces.some((p) => p.life > 0) || sparks.some((s) => s.life > 0);
        if (anyAlive) {
          raf = requestAnimationFrame(animate);
        } else {
          ctx.clearRect(0, 0, W, H);
          canvas.style.display = 'none';
          setCarnival(null);
          running = false;
        }
      }
    };
    raf = requestAnimationFrame(animate);

    // Festive samba audio sequence
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) {
        const audioCtx = new AudioCtor();
        const playNote = (freq, start, dur, type = 'triangle', vol = 0.18) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = type;
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + start);
          gain.gain.exponentialRampToValueAtTime(vol, audioCtx.currentTime + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + dur);
          osc.connect(gain).connect(audioCtx.destination);
          osc.start(audioCtx.currentTime + start);
          osc.stop(audioCtx.currentTime + start + dur + 0.02);
        };
        // Trumpet-ish samba fanfare
        const seq = [
          [523.25, 0.0, 0.18], [659.25, 0.18, 0.18], [783.99, 0.36, 0.22],
          [1046.5, 0.6, 0.32], [783.99, 0.95, 0.18], [1046.5, 1.15, 0.4],
          [1318.5, 1.6, 0.5],
        ];
        for (const [f, s, d] of seq) playNote(f, s, d, 'sawtooth', 0.16);
        // Bass hits
        for (let i = 0; i < 8; i += 1) playNote(110, i * 0.3, 0.12, 'sine', 0.22);
        // Bell sparkle
        playNote(2093, 1.6, 0.6, 'sine', 0.12);
        playNote(2637, 1.85, 0.5, 'sine', 0.1);
      }
    } catch { /* audio not available */ }

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
      canvas.style.display = 'none';
      setCarnival(null);
    };
    carnivalStopRef.current = stop;
    return stop;
  };

  // ── Trigger carnival celebration when goals hit 100% ───────────────────
  useEffect(() => {
    if (!data?.goals) return;
    const g = data.goals;
    const checks = [
      { key: 'pct_mensal', value: Number(g.pct_mensal || 0), label: 'META MENSAL' },
      { key: 'pct_recorrencia', value: Number(g.pct_recorrencia || 0), label: 'META RECORRÊNCIA' },
    ];
    for (const c of checks) {
      if (c.value >= 100 && !celebratedGoalsRef.current.has(c.key)) {
        celebratedGoalsRef.current.add(c.key);
        launchCarnival(c.label);
      }
    }
  }, [data?.goals]);

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
          max-height: 64px;
          overflow: hidden;
        }

        .tv-header-msgs {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          overflow: hidden;
        }

        .tv-header-msgs-label {
          flex: 0 0 auto;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #22c55e;
          background: #e7faf2;
          border: 1px solid rgba(34,197,94,0.18);
          padding: 3px 8px;
          border-radius: 8px;
          white-space: nowrap;
        }

        .tv-header-msgs-track {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          overflow: hidden;
          flex: 1;
        }

        .tv-header-msg {
          flex: 0 1 auto;
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          max-width: 480px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tv-header-msg-author {
          font-weight: 800;
          color: var(--brand);
          margin-right: 5px;
          font-size: 13px;
        }

        .tv-lotados {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          max-width: 100%;
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
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .tv-lotados-list::-webkit-scrollbar { display: none; }

        .tv-lotados-track {
          display: flex;
          align-items: center;
          gap: 5px;
          animation: lotados-scroll 18s linear infinite;
          will-change: transform;
        }

        .tv-lotados-list:hover .tv-lotados-track {
          animation-play-state: paused;
        }

        @keyframes lotados-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
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
          grid-template-rows: auto 1fr;
          grid-template-areas:
            "loop goals contracts"
            "loop ranking contracts";
          gap: 10px;
        }

        .ga-loop { grid-area: loop; }
        .ga-contracts { grid-area: contracts; }
        .ga-ranking {
          grid-area: ranking;
        }
        .ga-insights {
          grid-area: goals;
        }
        .ga-postits { grid-area: postits; display: none; }

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
        .tv-contract-chip.critical.has-countdown { animation: chip-pulse 1.6s ease-in-out infinite; }
        .tv-contract-chip.warning { background: #fff3dc; color: var(--warn); }
        .tv-contract-chip.ok { background: #e7faf2; color: var(--ok); }

        @keyframes chip-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(216,79,79,0.3); }
          50% { transform: scale(1.06); box-shadow: 0 0 12px 2px rgba(216,79,79,0.22); }
        }

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
          left: 50%;
          margin-left: -14px;
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
          color: #22c55e;
          letter-spacing: -0.03em;
        }

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

        .tv-permuta-card {
          margin-top: 12px;
          background: linear-gradient(135deg, rgba(20, 184, 166, 0.08), rgba(20, 184, 166, 0.03));
          border: 1px solid rgba(20, 184, 166, 0.25);
          border-left: 3px solid #14b8a6;
          border-radius: 12px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .tv-permuta-head {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tv-permuta-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: #14b8a6;
        }
        .tv-permuta-subtitle {
          font-size: 0.72rem;
          color: #14b8a6;
        }
        .tv-permuta-values {
          display: flex;
          gap: 24px;
        }
        .tv-permuta-val {
          font-weight: 800;
          font-size: 1.15rem;
          color: #14b8a6;
          letter-spacing: -0.02em;
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
          min-width: 460px;
          max-width: 600px;
          padding: 36px 40px;
          border-radius: 28px;
          background: linear-gradient(160deg, #fff8f4 0%, #fff0e6 100%);
          border: 3px solid rgba(254, 92, 43, 0.5);
          box-shadow: 0 40px 120px rgba(0, 0, 0, 0.3), 0 0 0 8px rgba(254, 92, 43, 0.12), 0 0 60px rgba(254, 92, 43, 0.15);
          text-align: center;
          animation: sale-popup-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), sale-popup-pulse 1.5s ease-in-out 0.5s 6;
        }

        .tv-sale-popup-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(6px);
          animation: sale-fade-in 0.3s ease;
        }

        /* ── GIROFLEX POLICE LED OVERLAY ─────────────────────────────── */
        .tv-sale-giroflex {
          position: fixed;
          inset: 0;
          z-index: 98;
          pointer-events: none;
          overflow: hidden;
        }

        /* Red beam — sweeps from the left */
        .tv-sale-giroflex::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg,
              rgba(255, 0, 0, 0.35) 0%,
              rgba(255, 20, 20, 0.12) 25%,
              transparent 50%,
              transparent 100%);
          animation: giroflex-red 0.35s ease-in-out infinite alternate;
        }

        /* Blue beam — sweeps from the right */
        .tv-sale-giroflex::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(270deg,
              rgba(0, 60, 255, 0.35) 0%,
              rgba(30, 80, 255, 0.12) 25%,
              transparent 50%,
              transparent 100%);
          animation: giroflex-blue 0.35s ease-in-out infinite alternate-reverse;
        }

        @keyframes giroflex-red {
          0% {
            opacity: 1;
            box-shadow: inset 60px 0 140px -20px rgba(255, 0, 0, 0.5), inset 0 50px 80px -30px rgba(255, 0, 0, 0.15), inset 0 -50px 80px -30px rgba(255, 0, 0, 0.15);
          }
          100% {
            opacity: 0.15;
            box-shadow: inset 20px 0 40px -20px rgba(255, 0, 0, 0.1), inset 0 10px 20px -10px rgba(255, 0, 0, 0.05), inset 0 -10px 20px -10px rgba(255, 0, 0, 0.05);
          }
        }

        @keyframes giroflex-blue {
          0% {
            opacity: 1;
            box-shadow: inset -60px 0 140px -20px rgba(0, 60, 255, 0.5), inset 0 50px 80px -30px rgba(0, 60, 255, 0.15), inset 0 -50px 80px -30px rgba(0, 60, 255, 0.15);
          }
          100% {
            opacity: 0.15;
            box-shadow: inset -20px 0 40px -20px rgba(0, 60, 255, 0.1), inset 0 10px 20px -10px rgba(0, 60, 255, 0.05), inset 0 -10px 20px -10px rgba(0, 60, 255, 0.05);
          }
        }

        /* Edge LED strips — top and bottom light bars */
        .tv-giroflex-bar-top,
        .tv-giroflex-bar-bottom {
          position: absolute;
          left: 0;
          right: 0;
          height: 4px;
          z-index: 1;
        }
        .tv-giroflex-bar-top { top: 0; }
        .tv-giroflex-bar-bottom { bottom: 0; }

        .tv-giroflex-bar-top::before,
        .tv-giroflex-bar-bottom::before {
          content: '';
          position: absolute;
          left: 0;
          width: 50%;
          height: 100%;
          background: #ff0000;
          box-shadow: 0 0 20px 8px rgba(255, 0, 0, 0.6), 0 0 60px 20px rgba(255, 0, 0, 0.3);
          animation: led-bar-red 0.3s ease-in-out infinite alternate;
        }

        .tv-giroflex-bar-top::after,
        .tv-giroflex-bar-bottom::after {
          content: '';
          position: absolute;
          right: 0;
          width: 50%;
          height: 100%;
          background: #003cff;
          box-shadow: 0 0 20px 8px rgba(0, 60, 255, 0.6), 0 0 60px 20px rgba(0, 60, 255, 0.3);
          animation: led-bar-blue 0.3s ease-in-out infinite alternate-reverse;
        }

        @keyframes led-bar-red {
          0% { opacity: 1; }
          100% { opacity: 0.2; }
        }
        @keyframes led-bar-blue {
          0% { opacity: 1; }
          100% { opacity: 0.2; }
        }

        /* Side vertical LED strips */
        .tv-giroflex-bar-left,
        .tv-giroflex-bar-right {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 4px;
          z-index: 1;
        }
        .tv-giroflex-bar-left {
          left: 0;
          background: #ff0000;
          box-shadow: 0 0 20px 8px rgba(255, 0, 0, 0.5), 0 0 50px 16px rgba(255, 0, 0, 0.25);
          animation: led-bar-red 0.3s ease-in-out infinite alternate;
        }
        .tv-giroflex-bar-right {
          right: 0;
          background: #003cff;
          box-shadow: 0 0 20px 8px rgba(0, 60, 255, 0.5), 0 0 50px 16px rgba(0, 60, 255, 0.25);
          animation: led-bar-blue 0.3s ease-in-out infinite alternate-reverse;
        }

        @keyframes sale-popup-in {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          50% { transform: translate(-50%, -50%) scale(1.05); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @keyframes sale-popup-pulse {
          0%, 100% { box-shadow: 0 40px 120px rgba(0,0,0,0.3), 0 0 0 8px rgba(254,92,43,0.12), 0 0 60px rgba(254,92,43,0.15); border-color: rgba(254,92,43,0.5); }
          50% { box-shadow: 0 40px 120px rgba(0,0,0,0.3), 0 0 0 14px rgba(254,92,43,0.2), 0 0 90px rgba(254,92,43,0.25); border-color: rgba(254,92,43,0.8); }
        }

        @keyframes sale-fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        .tv-sale-bell {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 76px;
          height: 76px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fe5c2b, #ff8c5a);
          box-shadow: 0 12px 32px rgba(254, 92, 43, 0.45);
          margin-bottom: 16px;
          animation: sale-bell-ring 0.4s ease-in-out 0.3s 24;
        }

        @keyframes sale-bell-ring {
          0%, 100% { transform: rotate(0) scale(1); }
          15% { transform: rotate(18deg) scale(1.05); }
          30% { transform: rotate(-16deg) scale(1.05); }
          45% { transform: rotate(12deg) scale(1.02); }
          60% { transform: rotate(-10deg) scale(1.02); }
          75% { transform: rotate(5deg); }
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

        /* ── CARNIVAL CELEBRATION (META 100%) ─────────────────────────── */
        .tv-carnival-overlay {
          position: fixed;
          inset: 0;
          z-index: 250;
          pointer-events: none;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.55) 100%);
          animation: tv-carn-fade 0.6s ease;
        }
        @keyframes tv-carn-fade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .tv-carnival-spotlights::before,
        .tv-carnival-spotlights::after {
          content: '';
          position: absolute;
          top: -30%;
          left: 50%;
          width: 60vw;
          height: 160vh;
          background: conic-gradient(from 0deg,
            rgba(255, 212, 0, 0.0) 0deg,
            rgba(255, 212, 0, 0.18) 12deg,
            rgba(255, 212, 0, 0.0) 30deg,
            rgba(0, 156, 59, 0.18) 110deg,
            rgba(0, 156, 59, 0.0) 130deg,
            rgba(254, 92, 43, 0.20) 220deg,
            rgba(254, 92, 43, 0.0) 240deg,
            rgba(168, 85, 247, 0.18) 320deg,
            rgba(168, 85, 247, 0.0) 340deg,
            rgba(255, 212, 0, 0.0) 360deg);
          transform-origin: 50% 30%;
          animation: tv-carn-spin 9s linear infinite;
          mix-blend-mode: screen;
          filter: blur(28px);
          opacity: 0.85;
        }
        .tv-carnival-spotlights::after {
          animation-direction: reverse;
          animation-duration: 13s;
          opacity: 0.55;
        }
        @keyframes tv-carn-spin {
          to { transform: translateX(-50%) rotate(360deg); }
        }
        .tv-carnival-stage {
          position: relative;
          padding: 40px 64px;
          border-radius: 36px;
          background: rgba(15, 7, 30, 0.55);
          border: 2px solid rgba(255, 212, 0, 0.45);
          box-shadow:
            0 0 80px 20px rgba(255, 212, 0, 0.35),
            0 0 160px 40px rgba(254, 92, 43, 0.25),
            inset 0 0 60px rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(8px);
          text-align: center;
          animation: tv-carn-pop 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275),
                     tv-carn-samba 1.2s ease-in-out infinite 0.7s;
        }
        @keyframes tv-carn-pop {
          0% { opacity: 0; transform: scale(0.4) rotate(-8deg); }
          60% { opacity: 1; transform: scale(1.12) rotate(3deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        @keyframes tv-carn-samba {
          0%, 100% { transform: translateY(0) rotate(-1.2deg) scale(1); }
          25% { transform: translateY(-8px) rotate(1.5deg) scale(1.02); }
          50% { transform: translateY(0) rotate(-0.8deg) scale(1); }
          75% { transform: translateY(-4px) rotate(1deg) scale(1.015); }
        }
        .tv-carnival-tag {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.45em;
          text-transform: uppercase;
          color: #fff;
          text-shadow: 0 0 12px rgba(255, 212, 0, 0.9), 0 0 24px rgba(254, 92, 43, 0.7);
          margin-bottom: 8px;
          animation: tv-carn-tag-pulse 0.9s ease-in-out infinite;
        }
        @keyframes tv-carn-tag-pulse {
          0%, 100% { opacity: 0.9; letter-spacing: 0.42em; }
          50% { opacity: 1; letter-spacing: 0.5em; }
        }
        .tv-carnival-title {
          font-size: clamp(72px, 12vw, 180px);
          font-weight: 900;
          line-height: 0.9;
          letter-spacing: -0.04em;
          background: linear-gradient(90deg,
            #ff2d87 0%, #ffd400 18%, #22c55e 38%, #06b6d4 58%,
            #a855f7 78%, #fe5c2b 92%, #ff2d87 100%);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          text-shadow: 0 0 30px rgba(255, 255, 255, 0.2);
          animation: tv-carn-rainbow 4s linear infinite, tv-carn-title-bounce 0.6s ease-in-out infinite alternate;
          filter: drop-shadow(0 6px 24px rgba(0, 0, 0, 0.45));
        }
        @keyframes tv-carn-rainbow {
          0% { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
        @keyframes tv-carn-title-bounce {
          0% { transform: translateY(0) scale(1); }
          100% { transform: translateY(-6px) scale(1.015); }
        }
        .tv-carnival-emoji {
          font-size: clamp(56px, 7vw, 110px);
          line-height: 1;
          margin: 0 12px;
          display: inline-block;
          animation: tv-carn-emoji-spin 2.4s ease-in-out infinite;
          filter: drop-shadow(0 4px 16px rgba(255, 212, 0, 0.6));
        }
        .tv-carnival-emoji.delay-1 { animation-delay: 0.2s; }
        .tv-carnival-emoji.delay-2 { animation-delay: 0.4s; }
        .tv-carnival-emoji.delay-3 { animation-delay: 0.6s; }
        @keyframes tv-carn-emoji-spin {
          0%, 100% { transform: rotate(-12deg) scale(1); }
          25% { transform: rotate(10deg) scale(1.15); }
          50% { transform: rotate(-8deg) scale(0.95); }
          75% { transform: rotate(14deg) scale(1.1); }
        }
        .tv-carnival-sub {
          margin-top: 18px;
          font-size: clamp(24px, 3vw, 44px);
          font-weight: 900;
          color: #fff;
          letter-spacing: 0.04em;
          text-shadow: 0 0 12px rgba(255, 45, 135, 0.9), 0 0 24px rgba(255, 212, 0, 0.7);
          animation: tv-carn-sub-glow 1.2s ease-in-out infinite alternate;
        }
        @keyframes tv-carn-sub-glow {
          0% { text-shadow: 0 0 10px rgba(255, 45, 135, 0.7), 0 0 20px rgba(255, 212, 0, 0.5); }
          100% { text-shadow: 0 0 22px rgba(34, 197, 94, 0.95), 0 0 44px rgba(168, 85, 247, 0.85); }
        }
        .tv-carnival-flag {
          margin-top: 14px;
          display: inline-flex;
          gap: 14px;
          font-size: 38px;
          letter-spacing: 0.2em;
          font-weight: 900;
          color: #ffd400;
          text-shadow: 0 0 12px rgba(0, 156, 59, 0.9);
          animation: tv-carn-flag-wave 1.6s ease-in-out infinite;
        }
        @keyframes tv-carn-flag-wave {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(8px) skewX(-4deg); }
        }
        .tv-carnival-emoji-rain {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .tv-carnival-emoji-rain span {
          position: absolute;
          top: -10%;
          font-size: clamp(28px, 3.4vw, 56px);
          animation: tv-carn-rain linear infinite;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
          will-change: transform;
        }
        @keyframes tv-carn-rain {
          0% { transform: translateY(-20vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
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
            grid-template-columns: 1fr;
            grid-template-rows: auto auto auto auto;
            grid-template-areas:
              "goals"
              "ranking"
              "loop"
              "contracts";
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
            if (!postits.length) return <div />;
            return (
              <div className="tv-header-msgs">
                <div className="tv-header-msgs-label">Grupo</div>
                <div className="tv-header-msgs-track">
                  {postits.slice(0, 1).map(p => (
                    <div key={p.id} className="tv-header-msg">
                      <span className="tv-header-msg-author">{(p.author || 'Equipe').split(' ')[0]}:</span>
                      {p.text?.length > 80 ? p.text.slice(0, 80) + '…' : p.text}
                    </div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {(loop.lotadosItems || []).length > 0 && (
                  <div className="tv-lotados" style={{ marginRight: 4 }}>
                    <div className="tv-lotados-label">Lotados ({(loop.lotadosItems || []).length})</div>
                    <div className="tv-lotados-list">
                      <div className="tv-lotados-track">
                        {[...(loop.lotadosItems || []), ...(loop.lotadosItems || [])].map((i, idx) => (
                          <div key={`${i.id}-${idx}`} className="tv-lotados-chip">{i.local || i.nome}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="tv-pill">Tempo real</div>
              </div>
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
                  const isUrgent = contract.daysRemaining <= 5;
                  const chipClass = isUrgent ? 'critical' : contract.daysRemaining <= 15 ? 'warning' : 'ok';
                  const rowTone = isUrgent ? 'is-critical' : contract.daysRemaining <= 15 ? 'is-high' : 'is-low';

                  let chipLabel = `${contract.daysRemaining} dia(s)`;
                  if (isUrgent && contract.expirationDate) {
                    const expMs = new Date(contract.expirationDate).getTime() - nowTime.getTime();
                    if (expMs > 0) {
                      const totalH = Math.floor(expMs / 3600000);
                      const d = Math.floor(totalH / 24);
                      const h = totalH % 24;
                      chipLabel = `${d}d ${h}h`;
                    } else {
                      chipLabel = 'Vencido';
                    }
                  }

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
                        <div className={`tv-contract-chip ${chipClass}${isUrgent ? ' has-countdown' : ''}`}>
                          {chipLabel}
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
                {(() => {
                  return ranking.map((seller, index) => {
                    const isLeader = index === 0;
                    return (
                      <div key={`${seller.vendedor}-${seller.posicao}`} className={`tv-ranking-item ${isLeader ? 'leader' : ''}`}>
                        <div style={{ width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div className="tv-ranking-left">
                              <div style={{ position: 'relative' }}>
                                {isLeader && (
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
                                {seller.photo_url ? (
                                  <img src={seller.photo_url} alt={seller.vendedor} className="tv-avatar" />
                                ) : (
                                  <div className="tv-avatar-fallback">{getInitials(seller.vendedor)}</div>
                                )}
                              </div>

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
                        </div>
                      </div>
                    );
                  });
                })()}

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

            {/* Permuta card */}
            {permuta.vendas > 0 && (
              <div className="tv-permuta-card">
                <div className="tv-permuta-head">
                  <ArrowLeftRight size={20} color="#14b8a6" />
                  <div>
                    <div className="tv-permuta-title">Permutas</div>
                    <div className="tv-permuta-subtitle">{permuta.vendas} permuta(s) no mês — fora da meta</div>
                  </div>
                </div>
                <div className="tv-permuta-values">
                  <div>
                    <div className="tv-goal-label">Valor Mensal</div>
                    <div className="tv-permuta-val">{fmtMoney(permuta.total)}</div>
                  </div>
                  <div>
                    <div className="tv-goal-label">Contratos</div>
                    <div className="tv-permuta-val">{fmtMoney(permuta.total_contratos)}</div>
                  </div>
                </div>
              </div>
            )}

            </div>
          </article>

          {/* Mural do Grupo - temporariamente oculto */}
          {false && <article className="tv-card ga-postits">
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
          </article>}
        </section>

        {/* Flash Intermidia - temporariamente oculto */}
        {false && <footer className="tv-footer">
          <div className="tv-footer-inner">
            <div className="tv-footer-label">
              <Newspaper size={16} strokeWidth={2.8} /> Flash Intermidia
            </div>
            <div className="tv-ticker">
              <div className="tv-ticker-track" style={{ '--ticker-dur': `${Math.max(20, currentTickerText.length * 0.35)}s` }}>{currentTickerText}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{currentTickerText}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{currentTickerText}</div>
            </div>
          </div>
        </footer>}
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

      <canvas ref={confettiCanvasRef} style={{ position: 'fixed', inset: 0, zIndex: 240, pointerEvents: 'none', display: 'none' }} />

      {carnival && (
        <div className="tv-carnival-overlay">
          <div className="tv-carnival-spotlights" />
          <div className="tv-carnival-emoji-rain" aria-hidden="true">
            {Array.from({ length: 36 }).map((_, i) => {
              const emojis = ['🎉', '🎊', '🥳', '🎺', '🥁', '✨', '🌟', '💫', '🎭', '🪅', '🎆', '🎇', '🟢', '🟡', '🔵'];
              const e = emojis[i % emojis.length];
              const left = (i * 2.7 + (i % 5) * 3) % 100;
              const dur = 4 + (i % 7);
              const delay = (i % 11) * 0.35;
              return (
                <span key={i} style={{ left: `${left}%`, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>{e}</span>
              );
            })}
          </div>
          <div className="tv-carnival-stage">
            <div className="tv-carnival-tag">{carnival.label || 'META'} ATINGIDA</div>
            <div>
              <span className="tv-carnival-emoji">🎉</span>
              <span className="tv-carnival-title">100%</span>
              <span className="tv-carnival-emoji delay-2">🎊</span>
            </div>
            <div className="tv-carnival-sub">
              <span className="tv-carnival-emoji delay-1" style={{ fontSize: '0.9em' }}>🥳</span>
              {' É CARNAVAL NA INTERMÍDIA! '}
              <span className="tv-carnival-emoji delay-3" style={{ fontSize: '0.9em' }}>🎺</span>
            </div>
            <div className="tv-carnival-flag">🇧🇷 PARABÉNS, EQUIPE! 🇧🇷</div>
          </div>
        </div>
      )}

      {salePopup && (
        <>
          {/* Giroflex police LED overlay */}
          <div className="tv-sale-giroflex">
            <div className="tv-giroflex-bar-top" />
            <div className="tv-giroflex-bar-bottom" />
            <div className="tv-giroflex-bar-left" />
            <div className="tv-giroflex-bar-right" />
          </div>
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
