import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Building2, Target, Users, MapPin, Wallet,
  Sparkles, Plus, CheckCircle, Loader2, BarChart3, Eye, Star, TrendingUp, MessageSquareText, Award
} from 'lucide-react';
import Navbar from '../components/Navbar';
import CampaignScore from '../components/CampaignScore';
import PointCard from '../components/PointCard';
import PointModal from '../components/PointModal';
import { fetchPontos } from '../lib/api';
import { useFavorites } from '../context/FavoritesContext';
import {
  SEGMENTOS,
  OBJETIVOS,
  suggestIdealPlan,
  calculateCampaignScore,
  generateStrategicJustification,
  campaignTotals,
} from '../lib/strategy';

const SmartMap = lazy(() => import('../components/SmartMap'));

const SEGMENTO_LABELS = {
  clinica: 'Clínicas e Saúde',
  hospital: 'Hospitais',
  escola: 'Escolas',
  faculdade: 'Faculdades e Ensino Superior',
  construtora: 'Construtoras',
  imobiliaria: 'Imobiliárias',
  varejo: 'Varejo e Comércio',
  restaurante: 'Restaurantes e Alimentação',
  contabilidade: 'Contabilidade',
  advocacia: 'Advocacia e Jurídico',
  industria: 'Indústria',
  outro: 'Outro segmento',
};

const OBJETIVO_LABELS = {
  'reconhecimento de marca': 'Reconhecimento de Marca',
  'presenca premium': 'Presença Premium',
  'cobertura regional': 'Cobertura Regional',
  'proximidade da decisao de compra': 'Proximidade da Decisão de Compra',
  'lembranca continua': 'Lembrança Contínua',
};

const OBJETIVO_DESCRIPTIONS = {
  'reconhecimento de marca': 'Maximizar visibilidade e repetição para acelerar lembrança da marca.',
  'presenca premium': 'Posicionar em ambientes de alto padrão para elevar percepção de marca.',
  'cobertura regional': 'Distribuir pontos em diversas regiões para capilaridade máxima.',
  'proximidade da decisao de compra': 'Impactar perto do ponto de compra para gerar conversão direta.',
  'lembranca continua': 'Garantir exposição constante e frequência ao longo do tempo.',
};

const AUDIENCE_TAGS = [
  { key: 'classe-a', label: 'Classe A' },
  { key: 'classe-b', label: 'Classe B' },
  { key: 'premium', label: 'Premium' },
  { key: 'familias', label: 'Famílias' },
  { key: 'jovens', label: 'Jovens' },
  { key: 'executivos', label: 'Executivos' },
  { key: 'motoristas', label: 'Motoristas' },
  { key: 'shopper', label: 'Shopper' },
  { key: 'moradores', label: 'Moradores' },
  { key: 'turistas', label: 'Turistas' },
];

const BUDGET_OPTIONS = [
  { label: 'Até R$ 5.000', value: 5000 },
  { label: 'R$ 5.000 – 10.000', value: 10000 },
  { label: 'R$ 10.000 – 30.000', value: 30000 },
  { label: 'Acima de R$ 30.000', value: 50000 },
];

const PERIOD_OPTIONS = [
  { label: '2 semanas', value: 2 },
  { label: '4 semanas (1 mês)', value: 4 },
  { label: '8 semanas (2 meses)', value: 8 },
  { label: '12 semanas (trimestral)', value: 12 },
];

const STEPS = [
  { icon: Building2, label: 'Empresa' },
  { icon: Target, label: 'Objetivo' },
  { icon: Users, label: 'Público' },
  { icon: MapPin, label: 'Praça e Investimento' },
  { icon: Sparkles, label: 'Resultado' },
];

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatInt(value) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(value) || 0));
}

/* ───────────── shared ui pieces ───────────── */

function StepIndicator({ current, total, isDark }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
            i < current
              ? 'bg-brand-orange text-white'
              : i === current
                ? isDark
                  ? 'bg-brand-orange/20 text-brand-orange ring-2 ring-brand-orange'
                  : 'bg-brand-orange/15 text-brand-orange ring-2 ring-brand-orange'
                : isDark
                  ? 'bg-white/10 text-white/40'
                  : 'bg-neutral-200 text-neutral-400'
          }`}>
            {i < current ? <CheckCircle size={16} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-8 h-0.5 rounded-full transition-colors ${
              i < current
                ? 'bg-brand-orange'
                : isDark ? 'bg-white/10' : 'bg-neutral-200'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

function StepCard({ children, isDark }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl border p-6 sm:p-8 ${
        isDark
          ? 'bg-white/[0.04] border-white/10'
          : 'bg-white border-neutral-200 shadow-sm'
      }`}
    >
      {children}
    </motion.div>
  );
}

function InputField({ label, value, onChange, placeholder, isDark, type = 'text' }) {
  return (
    <label className="block space-y-1.5">
      <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition border ${
          isDark
            ? 'bg-white/[0.06] border-white/10 text-white placeholder:text-white/30 focus:border-brand-orange/50 focus:ring-1 focus:ring-brand-orange/30'
            : 'bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-brand-orange/50 focus:ring-1 focus:ring-brand-orange/30'
        }`}
      />
    </label>
  );
}

function OptionCard({ selected, onClick, children, isDark }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-all duration-200 ${
        selected
          ? isDark
            ? 'border-brand-orange bg-brand-orange/10 ring-1 ring-brand-orange/40'
            : 'border-brand-orange bg-brand-orange/10 ring-1 ring-brand-orange/40'
          : isDark
            ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'
            : 'border-neutral-200 bg-white hover:bg-neutral-50 hover:border-neutral-300'
      }`}
    >
      {children}
    </button>
  );
}

function TagToggle({ label, selected, onClick, isDark }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
        selected
          ? 'bg-brand-orange text-white border-brand-orange'
          : isDark
            ? 'border-white/15 text-white/60 hover:text-white hover:border-white/30 bg-white/[0.03]'
            : 'border-neutral-200 text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 bg-white'
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value, isDark }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${
      isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-neutral-50'
    }`}>
      <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{value}</div>
      <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>{label}</div>
    </div>
  );
}

/* ───────────── main component ───────────── */

export default function CampaignPlanner() {
  const navigate = useNavigate();
  const { addFavorites, clearFavorites } = useFavorites();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('intermidia_theme') !== 'light';
  });
  const [step, setStep] = useState(0);

  // form state
  const [empresa, setEmpresa] = useState('');
  const [segmento, setSegmento] = useState('');
  const [contato, setContato] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [publicoAlvo, setPublicoAlvo] = useState([]);
  const [audienceTags, setAudienceTags] = useState([]);
  const [cidade, setCidade] = useState('');
  const [budget, setBudget] = useState(null);
  const [period, setPeriod] = useState(4);

  // data
  const [allPontos, setAllPontos] = useState([]);
  const [cidades, setCidades] = useState([]);
  const [publicos, setPublicos] = useState([]);
  const [loadingPontos, setLoadingPontos] = useState(false);

  // results
  const [result, setResult] = useState(null);
  const [computing, setComputing] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [addedToProposal, setAddedToProposal] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('intermidia_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // load pontos on mount to get cities and publicos
  useEffect(() => {
    setLoadingPontos(true);
    fetchPontos()
      .then((data) => {
        setAllPontos(data);
        const uniqueCidades = Array.from(new Set(data.map((p) => p.cidade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const uniquePublicos = Array.from(new Set(data.map((p) => p.publico).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        setCidades(uniqueCidades);
        setPublicos(uniquePublicos);
      })
      .catch(() => {})
      .finally(() => setLoadingPontos(false));
  }, []);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return empresa.trim().length >= 2 && segmento;
      case 1: return !!objetivo;
      case 2: return publicoAlvo.length > 0 || audienceTags.length > 0;
      case 3: return !!cidade && budget !== null;
      default: return false;
    }
  }, [step, empresa, segmento, objetivo, publicoAlvo, audienceTags, cidade, budget]);

  const runRecommendation = useCallback(() => {
    setComputing(true);
    // give the UI a frame to show the loading state
    requestAnimationFrame(() => {
      setTimeout(() => {
        const cityPontos = allPontos.filter((p) =>
          !cidade || p.cidade === cidade
        );
        const plan = suggestIdealPlan({
          pontos: allPontos,
          cidade: cidade || undefined,
          publico: publicoAlvo.length ? publicoAlvo : undefined,
          audienceTags: audienceTags.map((key) => ({ key, weight: 1 })),
          objetivo,
          segmento,
          periodWeeks: period,
          investimentoMensal: budget || 0,
          cityInventory: cityPontos,
        });

        const scoreInfo = calculateCampaignScore({
          selected: plan.pontos,
          objective: objetivo,
          desiredPublico: publicoAlvo,
          cityInventory: cityPontos,
        });

        const strategic = generateStrategicJustification({
          selected: plan.pontos,
          totals: plan.totals,
          reachFrequency: plan.reachFrequency,
          optimizer: plan.optimizer,
          empresa,
          segmento,
          objetivo,
          cidade,
          budget: budget || 0,
          periodWeeks: period,
          publicoAlvo,
          cityInventory: cityPontos,
        });

        setResult({ plan, scoreInfo, strategic });
        setComputing(false);
        setStep(4);
      }, 100);
    });
  }, [allPontos, cidade, publicoAlvo, audienceTags, objetivo, segmento, budget, period]);

  const handleNext = useCallback(() => {
    if (step === 3) {
      runRecommendation();
    } else if (step < 4) {
      setStep((s) => s + 1);
    }
  }, [step, runRecommendation]);

  const handleBack = useCallback(() => {
    if (step === 4) {
      setResult(null);
      setAddedToProposal(false);
    }
    setStep((s) => Math.max(0, s - 1));
  }, [step]);

  const handleTogglePublico = useCallback((pub) => {
    setPublicoAlvo((prev) =>
      prev.includes(pub) ? prev.filter((p) => p !== pub) : [...prev, pub]
    );
  }, []);

  const handleToggleTag = useCallback((key) => {
    setAudienceTags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const handleAddToProposal = useCallback(() => {
    if (!result?.plan?.pontos?.length) return;
    clearFavorites();
    addFavorites(result.plan.pontos);
    setAddedToProposal(true);
  }, [result, addFavorites, clearFavorites]);

  const handleGoToExplorer = useCallback(() => {
    if (result?.plan?.pontos?.length && !addedToProposal) {
      clearFavorites();
      addFavorites(result.plan.pontos);
    }
    navigate('/comercial/explorar' + (cidade ? `?cidade=${encodeURIComponent(cidade)}` : ''));
  }, [result, addedToProposal, cidade, navigate, addFavorites, clearFavorites]);

  /* ───── step renderers ───── */

  const renderStep0 = () => (
    <StepCard isDark={isDark}>
      <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>Sobre a empresa</h2>
      <p className={`text-sm mb-6 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>Informações básicas do anunciante para personalizar o plano.</p>

      <div className="space-y-4">
        <InputField label="Nome da empresa *" value={empresa} onChange={setEmpresa} placeholder="Ex: Clínica Vida" isDark={isDark} />

        <div className="space-y-1.5">
          <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>Segmento *</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SEGMENTOS.map((seg) => (
              <OptionCard key={seg} selected={segmento === seg} onClick={() => setSegmento(seg)} isDark={isDark}>
                <span className={`text-sm ${segmento === seg ? 'text-brand-orange font-semibold' : isDark ? 'text-white/70' : 'text-neutral-600'}`}>
                  {SEGMENTO_LABELS[seg] || seg}
                </span>
              </OptionCard>
            ))}
          </div>
        </div>

        <InputField label="Website ou Instagram (opcional)" value={contato} onChange={setContato} placeholder="Ex: @clinicavida" isDark={isDark} />
      </div>
    </StepCard>
  );

  const renderStep1 = () => (
    <StepCard isDark={isDark}>
      <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>Objetivo da campanha</h2>
      <p className={`text-sm mb-6 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>Qual o principal objetivo comercial desta campanha?</p>

      <div className="space-y-3">
        {OBJETIVOS.map((obj) => (
          <OptionCard key={obj} selected={objetivo === obj} onClick={() => setObjetivo(obj)} isDark={isDark}>
            <div className="flex items-start gap-3">
              <Target size={18} className={`mt-0.5 flex-shrink-0 ${objetivo === obj ? 'text-brand-orange' : isDark ? 'text-white/40' : 'text-neutral-400'}`} />
              <div>
                <div className={`text-sm font-semibold ${objetivo === obj ? 'text-brand-orange' : isDark ? 'text-white' : 'text-neutral-800'}`}>
                  {OBJETIVO_LABELS[obj] || obj}
                </div>
                <div className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>
                  {OBJETIVO_DESCRIPTIONS[obj] || ''}
                </div>
              </div>
            </div>
          </OptionCard>
        ))}
      </div>
    </StepCard>
  );

  const renderStep2 = () => (
    <StepCard isDark={isDark}>
      <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>Público-alvo</h2>
      <p className={`text-sm mb-6 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>Selecione o perfil de público e características de audiência desejados.</p>

      <div className="space-y-6">
        {publicos.length > 0 && (
          <div className="space-y-2">
            <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>Classe / Público</span>
            <div className="flex flex-wrap gap-2">
              {publicos.map((pub) => (
                <TagToggle key={pub} label={pub} selected={publicoAlvo.includes(pub)} onClick={() => handleTogglePublico(pub)} isDark={isDark} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>Tags de audiência</span>
          <div className="flex flex-wrap gap-2">
            {AUDIENCE_TAGS.map((tag) => (
              <TagToggle key={tag.key} label={tag.label} selected={audienceTags.includes(tag.key)} onClick={() => handleToggleTag(tag.key)} isDark={isDark} />
            ))}
          </div>
        </div>
      </div>
    </StepCard>
  );

  const renderStep3 = () => (
    <StepCard isDark={isDark}>
      <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>Praça e investimento</h2>
      <p className={`text-sm mb-6 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>Defina a cidade e o orçamento da campanha.</p>

      <div className="space-y-6">
        <div className="space-y-2">
          <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>Cidade *</span>
          {loadingPontos ? (
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>
              <Loader2 size={14} className="animate-spin" /> Carregando cidades...
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {cidades.map((c) => (
                <OptionCard key={c} selected={cidade === c} onClick={() => setCidade(c)} isDark={isDark}>
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className={cidade === c ? 'text-brand-orange' : isDark ? 'text-white/40' : 'text-neutral-400'} />
                    <span className={`text-sm ${cidade === c ? 'text-brand-orange font-semibold' : isDark ? 'text-white/70' : 'text-neutral-600'}`}>{c}</span>
                  </div>
                </OptionCard>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>Investimento mensal *</span>
          <div className="grid grid-cols-2 gap-2">
            {BUDGET_OPTIONS.map((opt) => (
              <OptionCard key={opt.value} selected={budget === opt.value} onClick={() => setBudget(opt.value)} isDark={isDark}>
                <div className="flex items-center gap-2">
                  <Wallet size={14} className={budget === opt.value ? 'text-brand-orange' : isDark ? 'text-white/40' : 'text-neutral-400'} />
                  <span className={`text-sm ${budget === opt.value ? 'text-brand-orange font-semibold' : isDark ? 'text-white/70' : 'text-neutral-600'}`}>{opt.label}</span>
                </div>
              </OptionCard>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>Período da campanha</span>
          <div className="grid grid-cols-2 gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <OptionCard key={opt.value} selected={period === opt.value} onClick={() => setPeriod(opt.value)} isDark={isDark}>
                <span className={`text-sm ${period === opt.value ? 'text-brand-orange font-semibold' : isDark ? 'text-white/70' : 'text-neutral-600'}`}>{opt.label}</span>
              </OptionCard>
            ))}
          </div>
        </div>
      </div>
    </StepCard>
  );

  const renderResults = () => {
    if (!result) return null;
    const { plan, scoreInfo, strategic } = result;
    const totals = plan.totals;

    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className={`rounded-2xl border p-6 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                Plano recomendado para {empresa}
              </h2>
              <p className={`text-sm mt-1 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>
                {SEGMENTO_LABELS[segmento]} — {OBJETIVO_LABELS[objetivo]} — {cidade}
              </p>
            </div>
            <CampaignScore scoreInfo={scoreInfo} isDark={isDark} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Pontos" value={totals.quantidade} isDark={isDark} />
          <StatCard label="Fluxo mensal" value={formatInt(totals.fluxoTotal)} isDark={isDark} />
          <StatCard label="Investimento" value={formatMoney(totals.valorTotal)} isDark={isDark} />
          <StatCard label="CPM" value={`R$ ${totals.cpmEstimado?.toFixed(2) || '0,00'}`} isDark={isDark} />
        </div>

        {/* 1. Qualidade da Seleção */}
        {strategic?.qualidadeSelecao && (
          <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={16} className="text-brand-orange" />
              <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>Qualidade da seleção</h3>
            </div>
            <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-neutral-600'}`}>
              {strategic.qualidadeSelecao}
            </p>
          </div>
        )}

        {/* 2. Justificativa Estratégica */}
        {strategic?.justificativaEstrategica && (
          <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-brand-orange" />
              <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>Justificativa estratégica</h3>
            </div>
            <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-neutral-600'}`}>
              {strategic.justificativaEstrategica}
            </p>
          </div>
        )}

        {/* 3. Argumentação Comercial */}
        {strategic?.argumentacaoComercial?.length > 0 && (
          <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquareText size={16} className="text-brand-orange" />
              <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>Argumentação comercial</h3>
            </div>
            <ul className="space-y-2.5">
              {strategic.argumentacaoComercial.map((arg, i) => (
                <li key={i} className={`text-sm flex gap-2.5 ${isDark ? 'text-white/60' : 'text-neutral-600'}`}>
                  <span className="text-brand-orange mt-0.5 flex-shrink-0 font-bold">•</span>
                  <span className="leading-relaxed">{arg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 4. Destaques do Plano */}
        {strategic?.destaquesPlano?.length > 0 && (
          <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 mb-3">
              <Award size={16} className="text-brand-orange" />
              <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>Destaques do plano</h3>
            </div>
            <div className="space-y-4">
              {strategic.destaquesPlano.map((h, i) => (
                <div key={i} className={`rounded-xl border p-4 ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Star size={14} className="text-brand-orange" />
                    <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{h.nome}</span>
                  </div>
                  <div className={`flex flex-wrap gap-3 text-xs mb-2 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>
                    <span>{h.tipo}</span>
                    <span>•</span>
                    <span>{h.fluxo} impactos/mês</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-neutral-600'}`}>{h.motivo}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Map */}
        {plan.pontos.length > 0 && (
          <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-white/10' : 'border-neutral-200 shadow-sm'}`}>
            <div className="h-[350px] sm:h-[420px]">
              <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-white/30">Carregando mapa...</div>}>
                <SmartMap
                  pontos={plan.pontos}
                  onSelect={setSelectedPoint}
                  onOpenDetails={setSelectedPoint}
                  isDark={isDark}
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* Point cards */}
        {plan.pontos.length > 0 && (
          <div>
            <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>
              Pontos recomendados ({plan.pontos.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plan.pontos.map((ponto, i) => (
                <PointCard key={ponto.id} ponto={ponto} onSelect={setSelectedPoint} index={i} isDark={isDark} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {plan.pontos.length === 0 && (
          <div className={`rounded-2xl border p-8 text-center ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200'}`}>
            <p className={`text-sm ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>
              {plan.justificativa || 'Nenhum ponto encontrado para os critérios selecionados. Tente ajustar os filtros.'}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleAddToProposal}
            disabled={addedToProposal || !plan.pontos.length}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
              addedToProposal
                ? 'bg-green-600/20 text-green-400 border border-green-500/30 cursor-default'
                : 'bg-brand-orange text-white hover:bg-brand-orange/90 active:scale-[0.98]'
            }`}
          >
            {addedToProposal ? <CheckCircle size={16} /> : <Plus size={16} />}
            {addedToProposal ? 'Adicionado à proposta' : 'Adicionar à proposta'}
          </button>
          <button
            type="button"
            onClick={handleGoToExplorer}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border transition-all ${
              isDark
                ? 'border-white/15 text-white bg-white/[0.04] hover:bg-white/[0.08]'
                : 'border-neutral-200 text-neutral-700 bg-white hover:bg-neutral-50'
            }`}
          >
            <Eye size={16} />
            Ver no Explorador
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div
      className={`min-h-screen ${isDark ? 'bg-black text-white' : 'commercial-light bg-[#f4f5f7] text-neutral-900'}`}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <Navbar commercial isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />

      <main className="pt-20 pb-16 px-4 sm:px-6">
        <div className={`mx-auto ${step === 4 ? 'max-w-5xl' : 'max-w-2xl'}`}>
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              Planejador de Campanha
            </h1>
            <p className={`text-sm mt-2 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>
              Responda algumas perguntas e receba um plano de mídia personalizado com os melhores pontos.
            </p>
          </div>

          {/* Step indicator */}
          <StepIndicator current={step} total={STEPS.length} isDark={isDark} />

          {/* Step content */}
          <AnimatePresence mode="wait">
            <div key={step}>
              {step === 0 && renderStep0()}
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              {step === 4 && renderResults()}
            </div>
          </AnimatePresence>

          {/* Navigation buttons */}
          {step < 4 && (
            <div className="flex items-center justify-between mt-6">
              <button
                type="button"
                onClick={handleBack}
                disabled={step === 0}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  step === 0
                    ? 'opacity-30 cursor-not-allowed'
                    : isDark
                      ? 'border-white/15 text-white hover:bg-white/[0.06]'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <ArrowLeft size={16} />
                Voltar
              </button>

              <button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance || computing}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  canAdvance && !computing
                    ? 'bg-brand-orange text-white hover:bg-brand-orange/90 active:scale-[0.98]'
                    : isDark
                      ? 'bg-white/10 text-white/30 cursor-not-allowed'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                }`}
              >
                {computing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Calculando...
                  </>
                ) : step === 3 ? (
                  <>
                    <Sparkles size={16} />
                    Gerar plano
                  </>
                ) : (
                  <>
                    Próximo
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Back to edit on results page */}
          {step === 4 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleBack}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  isDark
                    ? 'border-white/15 text-white hover:bg-white/[0.06]'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <ArrowLeft size={16} />
                Ajustar critérios
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Point modal */}
      <AnimatePresence>
        {selectedPoint && (
          <PointModal
            ponto={selectedPoint}
            onClose={() => setSelectedPoint(null)}
            isDark={isDark}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
