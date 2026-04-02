import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Building2, Target, Users, MapPin, Wallet,
  Sparkles, Plus, CheckCircle, Loader2, BarChart3, Eye, Star, TrendingUp,
  MessageSquareText, Award, ListOrdered, Map as MapIcon, FileText, SlidersHorizontal,
  ChevronDown, ChevronUp, Zap, Trophy, Check,
  Cross, Hospital, GraduationCap, BookOpen, HardHat, Home, ShoppingBag,
  UtensilsCrossed, Calculator, Scale, Cog, MoreHorizontal
} from 'lucide-react';
import Navbar from '../components/Navbar';
import CampaignScore from '../components/CampaignScore';
import PointCard from '../components/PointCard';
import PointModal from '../components/PointModal';
import { fetchPontos, fetchGeoAudienceProfiles, fetchCensusProfiles } from '../lib/api';
import { useFavorites } from '../context/FavoritesContext';
import {
  SEGMENTOS,
  OBJETIVOS,
  suggestIdealPlan,
  calculateCampaignScore,
  generateStrategicJustification,
  rankPointsWithScore,
  RECOMMENDATION_WEIGHTS,
  estimateReachFrequency,
  campaignTotals,
  buildGeoAudienceNarrative,
  CENSUS_PROFILE_LABELS,
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

const SEGMENTO_ICONS = {
  clinica: Cross,
  hospital: Hospital,
  escola: GraduationCap,
  faculdade: BookOpen,
  construtora: HardHat,
  imobiliaria: Home,
  varejo: ShoppingBag,
  restaurante: UtensilsCrossed,
  contabilidade: Calculator,
  advocacia: Scale,
  industria: Cog,
  outro: MoreHorizontal,
};

const OBJETIVO_LABELS = {
  'reconhecimento de marca': 'Reconhecimento de Marca',
  'presenca premium': 'Presença Premium',
  'cobertura regional': 'Cobertura Regional',
  'proximidade da decisao de compra': 'Proximidade da Decisão de Compra',
  'lembranca continua': 'Lembrança Contínua',
};

const OBJETIVO_DESCRIPTIONS = {
  'reconhecimento de marca': 'Prioriza pontos de alto fluxo e visibilidade para maximizar impressões e repetição de marca no menor prazo.',
  'presenca premium': 'Seleciona locais em bairros de alta renda e formatos de grande impacto visual para associar a marca a um ambiente premium.',
  'cobertura regional': 'Distribui pontos em múltiplos bairros e vias para garantir cobertura geográfica ampla e reduzir sobreposição.',
  'proximidade da decisao de compra': 'Concentra mídia próxima a PDVs, shoppings e centros comerciais para impactar no momento da decisão.',
  'lembranca continua': 'Equilibra frequência e permanência: prioriza contratos longos e pontos com fluxo estável ao longo do mês.',
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

function toNumber(v) {
  return Number(v) || 0;
}

/* ───────────── shared ui pieces ───────────── */

const STEP_LABELS = ['Empresa', 'Objetivo', 'Público', 'Praça', 'Resultado'];

function StepIndicator({ current, total, isDark }) {
  return (
    <div className="flex items-start gap-2 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1.5">
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
              {i < current ? <Check size={16} strokeWidth={2.5} /> : i + 1}
            </div>
            <span className={`text-[11px] leading-tight transition-colors duration-300 ${
              i < current
                ? isDark ? 'text-white/50' : 'text-neutral-500'
                : i === current
                  ? 'text-brand-orange font-semibold'
                  : isDark ? 'text-white/30' : 'text-neutral-400'
            }`}>
              {STEP_LABELS[i]}
            </span>
          </div>
          {i < total - 1 && (
            <div className={`w-8 h-0.5 rounded-full transition-colors mt-[-18px] ${
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
  const [geoProfiles, setGeoProfiles] = useState(null); // { [pontoId]: profile }
  const [censusProfiles, setCensusProfiles] = useState(null); // { [pontoId]: censusProfile }
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

  // load pontos and geoaudience profiles on mount
  useEffect(() => {
    setLoadingPontos(true);
    Promise.all([
      fetchPontos(),
      fetchGeoAudienceProfiles().catch(() => ({ profiles: {} })),
      fetchCensusProfiles().catch(() => ({ profiles: [] }))
    ])
      .then(([data, geo, census]) => {
        setAllPontos(data);
        setGeoProfiles(geo?.profiles || null);
        // Convert census profiles array to a map by ponto_id
        const censusMap = {};
        if (Array.isArray(census?.profiles)) {
          for (const p of census.profiles) {
            if (p?.ponto_id) censusMap[p.ponto_id] = p;
          }
        }
        setCensusProfiles(Object.keys(censusMap).length ? censusMap : null);
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
          geoProfilesByPoint: geoProfiles,
          censusProfilesByPoint: censusProfiles,
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
          geoProfilesByPoint: geoProfiles,
          censusProfilesByPoint: censusProfiles,
        });

        // Rank ALL city inventory with 0-100 compatibility scores
        const ranked = rankPointsWithScore({
          pontos: allPontos,
          cidade: cidade || undefined,
          publico: publicoAlvo.length ? publicoAlvo : undefined,
          audienceTags: audienceTags.map((key) => ({ key, weight: 1 })),
          objetivo,
          segmento,
          budget: budget || 0,
          geoProfilesByPoint: geoProfiles,
          censusProfilesByPoint: censusProfiles,
        });

        setResult({ plan, scoreInfo, strategic, ranked });
        setComputing(false);
        setStep(4);
      }, 100);
    });
  }, [allPontos, cidade, publicoAlvo, audienceTags, objetivo, segmento, budget, period, empresa, geoProfiles, censusProfiles]);

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
            {SEGMENTOS.map((seg) => {
              const SegIcon = SEGMENTO_ICONS[seg] || MoreHorizontal;
              const isSel = segmento === seg;
              return (
                <button
                  key={seg}
                  type="button"
                  onClick={() => setSegmento(seg)}
                  className={`rounded-xl border p-4 text-left transition-all duration-200 flex items-center gap-3 ${
                    isSel
                      ? 'border-brand-orange bg-[#FFF5F2] ring-1 ring-brand-orange/40'
                      : isDark
                        ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#FFCFB8]'
                        : 'border-neutral-200 bg-white hover:bg-[#FFFAF8] hover:border-[#FFCFB8]'
                  }`}
                >
                  <SegIcon size={18} className={isSel ? 'text-brand-orange flex-shrink-0' : isDark ? 'text-white/40 flex-shrink-0' : 'text-neutral-400 flex-shrink-0'} />
                  <span className={`text-sm ${isSel ? 'text-brand-orange font-semibold' : isDark ? 'text-white/70' : 'text-neutral-600'}`}>
                    {SEGMENTO_LABELS[seg] || seg}
                  </span>
                </button>
              );
            })}
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

      <div className={`rounded-xl border p-5 space-y-5 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-white'}`}>
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

        {publicos.length > 0 && (
          <div className={`border-t ${isDark ? 'border-white/10' : 'border-neutral-100'}`} />
        )}

        <p className={`text-xs italic ${isDark ? 'text-white/35' : 'text-[#9E8378]'}`}>
          As tags abaixo refinam a seleção com base no perfil comportamental e demográfico da audiência de cada ponto.
        </p>

        <div className="space-y-2">
          <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-neutral-600'}`}>Tags de audiência</span>
          <div className="flex flex-wrap gap-2">
            {AUDIENCE_TAGS.map((tag) => (
              <TagToggle key={tag.key} label={tag.label} selected={audienceTags.includes(tag.key)} onClick={() => handleToggleTag(tag.key)} isDark={isDark} />
            ))}
          </div>
          {audienceTags.length > 0 && (
            <span className="text-xs font-medium text-brand-orange">
              {audienceTags.length} tag{audienceTags.length !== 1 ? 's' : ''} selecionada{audienceTags.length !== 1 ? 's' : ''}
            </span>
          )}
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

  // results view state
  const [resultTab, setResultTab] = useState('ranking');
  const [rankExpanded, setRankExpanded] = useState(10);
  const [strategyTextExpanded, setStrategyTextExpanded] = useState(false);

  const renderResults = () => {
    if (!result) return null;
    const { plan, scoreInfo, strategic, ranked } = result;
    const totals = plan.totals;
    const top10 = (ranked || []).slice(0, 10);
    const rankVisible = (ranked || []).slice(0, rankExpanded);
    const selectedIds = new Set(plan.pontos.map((p) => p.id));

    const TABS = [
      { key: 'ranking', icon: ListOrdered, label: 'Ranking' },
      { key: 'strategic', icon: FileText, label: 'Estratégia' },
      { key: 'map', icon: MapIcon, label: 'Mapa' },
    ];

    const DIM_LABELS = {
      objetivo: 'Objetivo',
      publico: 'Público',
      eficiencia: 'Eficiência',
      entorno: 'Entorno',
      geoaudience: 'GeoAudiência',
      segmento: 'Segmento',
      formato: 'Formato',
      disponibilidade: 'Disponibilidade',
      censusProfile: 'Perfil Censo'
    };

    const DIM_COLORS = {
      objetivo: 'bg-brand-orange',
      publico: 'bg-blue-500',
      eficiencia: 'bg-emerald-500',
      entorno: 'bg-purple-500',
      geoaudience: 'bg-indigo-500',
      segmento: 'bg-amber-500',
      formato: 'bg-cyan-500',
      disponibilidade: 'bg-rose-400',
      censusProfile: 'bg-violet-500'
    };

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
                Recomendação inteligente para {empresa}
              </h2>
              <p className={`text-sm mt-1 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>
                {SEGMENTO_LABELS[segmento]} — {OBJETIVO_LABELS[objetivo]} — {cidade}
                {ranked?.length ? ` — ${ranked.length} pontos analisados` : ''}
              </p>
            </div>
            <CampaignScore scoreInfo={scoreInfo} isDark={isDark} />
          </div>
        </div>

        {/* Stats grid — expanded */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Pontos selecionados" value={totals.quantidade} isDark={isDark} />
          <StatCard label="Fluxo mensal" value={formatInt(totals.fluxoTotal)} isDark={isDark} />
          <StatCard label="Investimento" value={formatMoney(totals.valorTotal)} isDark={isDark} />
          <StatCard label="CPM" value={`R$ ${totals.cpmEstimado?.toFixed(2) || '0,00'}`} isDark={isDark} />
          <StatCard label="Alcance estimado" value={plan.reachFrequency ? `${plan.reachFrequency.effectiveReachPct?.toFixed(1) || 0}%` : '—'} isDark={isDark} />
          <StatCard label="Frequência média" value={plan.reachFrequency ? plan.reachFrequency.avgFrequency?.toFixed(2) || '0' : '—'} isDark={isDark} />
        </div>

        {/* Tab bar */}
        <div className={`flex gap-1 p-1 rounded-xl ${isDark ? 'bg-white/[0.04]' : 'bg-neutral-100'}`}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setResultTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                resultTab === t.key
                  ? 'bg-brand-orange text-white shadow-sm'
                  : isDark
                    ? 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                    : 'text-neutral-500 hover:text-neutral-700 hover:bg-white'
              }`}
            >
              <t.icon size={15} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ─── TAB: RANKING ─── */}
        {resultTab === 'ranking' && (
          <div className="space-y-4">
            {/* Top 10 banner */}
            {top10.length > 0 && (
              <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <Trophy size={16} className="text-brand-orange" />
                  <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>
                    Top {Math.min(10, top10.length)} — Pontos mais compatíveis
                  </h3>
                </div>

                <div className="space-y-3">
                  {rankVisible.map((pt, i) => {
                    const isInPlan = selectedIds.has(pt.id);
                    return (
                      <motion.div
                        key={pt.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => setSelectedPoint(pt)}
                        className={`rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.005] ${
                          isInPlan
                            ? isDark
                              ? 'border-brand-orange/30 bg-brand-orange/[0.06]'
                              : 'border-brand-orange/30 bg-brand-orange/5'
                            : isDark
                              ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                              : 'border-neutral-100 bg-white hover:bg-neutral-50'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Rank badge */}
                          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                            i === 0 ? 'bg-brand-orange text-white' :
                            i < 3 ? (isDark ? 'bg-brand-orange/20 text-brand-orange' : 'bg-brand-orange/10 text-brand-orange') :
                            isDark ? 'bg-white/10 text-white/60' : 'bg-neutral-100 text-neutral-500'
                          }`}>
                            {i + 1}º
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Name + score */}
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>{pt.nome}</span>
                                {isInPlan && (
                                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-orange/20 text-brand-orange">
                                    No plano
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-2xl font-bold ${
                                  pt.compatibilidade >= 80 ? 'text-emerald-500' :
                                  pt.compatibilidade >= 60 ? 'text-brand-orange' :
                                  pt.compatibilidade >= 40 ? 'text-amber-500' :
                                  isDark ? 'text-white/40' : 'text-neutral-400'
                                }`}>
                                  {pt.compatibilidade}
                                </span>
                                <span className={`text-xs ${isDark ? 'text-white/30' : 'text-neutral-400'}`}>/100</span>
                              </div>
                            </div>

                            {/* Meta */}
                            <div className={`flex flex-wrap gap-x-3 gap-y-1 text-xs mb-2.5 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>
                              <span>{pt.tipo || 'Formato'}</span>
                              <span>•</span>
                              <span>Público {pt.publico || '—'}</span>
                              <span>•</span>
                              <span>{formatInt(pt.fluxo || 0)} impactos/mês</span>
                              <span>•</span>
                              <span>{formatMoney(pt.preco || 0)}/mês</span>
                              {pt.cpmPonto > 0 && (
                                <>
                                  <span>•</span>
                                  <span>CPM R$ {pt.cpmPonto.toFixed(2)}</span>
                                </>
                              )}
                            </div>

                            {/* Score breakdown bars */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5">
                              {Object.entries(pt.dimensoes || {})
                                .filter(([, v]) => v > 0)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 4)
                                .map(([dim, val]) => (
                                  <div key={dim} className="flex items-center gap-2">
                                    <span className={`text-[10px] w-16 flex-shrink-0 ${isDark ? 'text-white/30' : 'text-neutral-400'}`}>
                                      {DIM_LABELS[dim] || dim}
                                    </span>
                                    <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
                                      <div
                                        className={`h-full rounded-full transition-all ${DIM_COLORS[dim] || 'bg-brand-orange'}`}
                                        style={{ width: `${Math.round(val)}%` }}
                                      />
                                    </div>
                                    <span className={`text-[10px] w-6 text-right ${isDark ? 'text-white/30' : 'text-neutral-400'}`}>{Math.round(val)}</span>
                                  </div>
                                ))}
                            </div>

                            {/* Justificativa estruturada */}
                            {pt.justificativaCompleta ? (
                              <div className={`text-xs mt-2 space-y-0.5 ${isDark ? 'text-white/45' : 'text-neutral-500'}`}>
                                {pt.justificativaCompleta.demografico && (
                                  <p>{pt.justificativaCompleta.demografico}</p>
                                )}
                                {pt.justificativaCompleta.entorno && (
                                  <p>{pt.justificativaCompleta.entorno}</p>
                                )}
                                {pt.justificativaCompleta.comparativo && (
                                  <p className="font-medium">{pt.justificativaCompleta.comparativo}</p>
                                )}
                                {pt.justificativaCompleta.limitacao && (
                                  <p className={`italic ${isDark ? 'text-white/25' : 'text-neutral-400'}`}>{pt.justificativaCompleta.limitacao}</p>
                                )}
                              </div>
                            ) : (
                              <p className={`text-xs mt-2 ${isDark ? 'text-white/35' : 'text-neutral-400'}`}>
                                {pt.motivoPrincipal}
                              </p>
                            )}

                            {/* GeoAudience Profile Badge */}
                            {pt.geoProfile && pt.geoProfile.neighborhood_type !== 'indefinido' && (
                              <div className={`flex flex-wrap items-center gap-2 mt-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-neutral-100'}`}>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  isDark ? 'bg-indigo-500/15 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
                                }`}>
                                  <MapPin size={10} />
                                  {pt.geoProfile.neighborhood_label}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  pt.geoProfile.socioeconomic_level === 'alto'
                                    ? isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700'
                                    : pt.geoProfile.socioeconomic_level === 'medio-alto'
                                      ? isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                                      : isDark ? 'bg-white/10 text-white/50' : 'bg-neutral-100 text-neutral-600'
                                }`}>
                                  {pt.geoProfile.socioeconomic_level === 'alto' ? 'Nível Alto' :
                                   pt.geoProfile.socioeconomic_level === 'medio-alto' ? 'Nível Médio-Alto' :
                                   pt.geoProfile.socioeconomic_level === 'medio' ? 'Nível Médio' :
                                   'Nível Médio-Baixo'}
                                </span>
                                {pt.geoProfile.urban_density && (
                                  <span className={`text-[10px] ${isDark ? 'text-white/25' : 'text-neutral-400'}`}>
                                    Densidade {pt.geoProfile.urban_density} • {pt.geoProfile.total_pois || 0} POIs
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Census Audience Profile Badge */}
                            {pt.censusProfile && pt.censusProfile.perfil_dominante && (
                              <div className={`flex flex-wrap items-center gap-2 mt-1.5 ${!pt.geoProfile ? `pt-2 border-t ${isDark ? 'border-white/5' : 'border-neutral-100'}` : ''}`}>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  isDark ? 'bg-violet-500/15 text-violet-300' : 'bg-violet-50 text-violet-700'
                                }`}>
                                  <Users size={10} />
                                  {CENSUS_PROFILE_LABELS[pt.censusProfile.perfil_dominante] || pt.censusProfile.perfil_dominante}
                                </span>
                                {pt.censusProfile.score_geral > 0 && (
                                  <span className={`text-[10px] ${isDark ? 'text-white/25' : 'text-neutral-400'}`}>
                                    Score {Math.round(pt.censusProfile.score_geral * 100)}%
                                    {pt.censusProfile.total_pois > 0 && ` • ${pt.censusProfile.total_pois} POIs`}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Show more / less */}
                {(ranked || []).length > 10 && (
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => setRankExpanded((prev) => prev <= 10 ? Math.min(ranked.length, 25) : 10)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                        isDark
                          ? 'border-white/10 text-white/50 hover:text-white hover:bg-white/[0.04]'
                          : 'border-neutral-200 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      {rankExpanded <= 10 ? (
                        <><ChevronDown size={14} /> Ver mais pontos ({Math.min(ranked.length, 25)} de {ranked.length})</>
                      ) : (
                        <><ChevronUp size={14} /> Mostrar apenas Top 10</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Estimates panel */}
            {top10.length > 0 && (
              <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={16} className="text-brand-orange" />
                  <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>
                    Estimativas do Top 10
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`rounded-xl p-3 text-center ${isDark ? 'bg-white/[0.03]' : 'bg-neutral-50'}`}>
                    <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                      {formatInt(top10.reduce((s, p) => s + (p.estimatedReach || 0), 0))}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>Alcance estimado/mês</div>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${isDark ? 'bg-white/[0.03]' : 'bg-neutral-50'}`}>
                    <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                      {formatInt(top10.reduce((s, p) => s + toNumber(p.fluxo), 0))}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>Impactos potenciais/mês</div>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${isDark ? 'bg-white/[0.03]' : 'bg-neutral-50'}`}>
                    <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                      {formatMoney(top10.reduce((s, p) => s + toNumber(p.preco), 0))}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>Investimento Top 10</div>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${isDark ? 'bg-white/[0.03]' : 'bg-neutral-50'}`}>
                    <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                      {(() => {
                        const f = top10.reduce((s, p) => s + toNumber(p.fluxo), 0);
                        const v = top10.reduce((s, p) => s + toNumber(p.preco), 0);
                        return f > 0 ? `R$ ${(v / (f / 1000)).toFixed(2)}` : '—';
                      })()}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>CPM médio Top 10</div>
                  </div>
                </div>
              </div>
            )}

            {/* Recommended plan point cards */}
            {plan.pontos.length > 0 && (
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>
                  Pontos do plano otimizado ({plan.pontos.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plan.pontos.map((ponto, i) => (
                    <PointCard key={ponto.id} ponto={ponto} onSelect={setSelectedPoint} index={i} isDark={isDark} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: STRATEGIC ─── */}
        {resultTab === 'strategic' && (
          <div className="space-y-5">
            {/* 1. Alcance e Frequência */}
            <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={16} className="text-brand-orange" />
                <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>Alcance e frequência</h3>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
                <span className="text-2xl font-bold text-brand-orange">
                  {plan.reachFrequency ? `${plan.reachFrequency.effectiveReachPct?.toFixed(1) || 0}%` : '—'}
                </span>
                <span className={`text-sm ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>alcance efetivo</span>
                <span className={`text-lg font-semibold ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>·</span>
                <span className="text-2xl font-bold text-brand-orange">
                  {plan.reachFrequency ? plan.reachFrequency.avgFrequency?.toFixed(1) || '0' : '—'}×
                </span>
                <span className={`text-sm ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>freq. média</span>
              </div>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>
                Com {totals.quantidade} ponto{totals.quantidade !== 1 ? 's' : ''} selecionado{totals.quantidade !== 1 ? 's' : ''} e {formatInt(totals.fluxoTotal)} impactos/mês, a campanha gera uma exposição estimada de {formatInt(top10.reduce((s, p) => s + (p.estimatedReach || 0), 0))} pessoas alcançadas mensalmente.
              </p>
            </div>

            {/* 2. Composição do Plano */}
            <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
              <div className="flex items-center gap-2 mb-4">
                <SlidersHorizontal size={16} className="text-brand-orange" />
                <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>Composição do plano</h3>
              </div>
              {(() => {
                const formatMap = {};
                plan.pontos.forEach((p) => {
                  const key = p.tipo || 'Outros';
                  if (!formatMap[key]) formatMap[key] = { count: 0, value: 0 };
                  formatMap[key].count += 1;
                  formatMap[key].value += toNumber(p.preco);
                });
                const totalVal = plan.pontos.reduce((s, p) => s + toNumber(p.preco), 0) || 1;
                return (
                  <div className="space-y-2">
                    {Object.entries(formatMap).sort((a, b) => b[1].count - a[1].count).map(([fmt, data]) => {
                      const pct = Math.round((data.value / totalVal) * 100);
                      return (
                        <div key={fmt} className="flex items-center gap-3">
                          <span className={`text-sm w-32 flex-shrink-0 font-medium ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>{fmt}</span>
                          <span className="text-sm font-semibold text-brand-orange w-8 text-right">{data.count}×</span>
                          <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`}>
                            <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-xs w-10 text-right ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* 3. Por que esses pontos */}
            <div className={`rounded-2xl border p-5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-neutral-200 shadow-sm'}`}>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquareText size={16} className="text-brand-orange" />
                <h3 className={`text-sm font-semibold uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>Por que esses pontos</h3>
              </div>

              {/* Collapsible justification text */}
              <div className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-neutral-600'} ${!strategyTextExpanded ? 'line-clamp-3' : ''}`}>
                {strategic?.justificativaEstrategica && (
                  <p className="mb-2">{strategic.justificativaEstrategica}</p>
                )}
                {strategic?.qualidadeSelecao && strategyTextExpanded && (
                  <p className="mb-2">{strategic.qualidadeSelecao}</p>
                )}
                {strategic?.argumentacaoComercial?.length > 0 && strategyTextExpanded && (
                  <ul className="space-y-1.5 mt-2">
                    {strategic.argumentacaoComercial.map((arg, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-brand-orange font-bold flex-shrink-0">•</span>
                        <span>{arg}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => setStrategyTextExpanded((v) => !v)}
                className={`flex items-center gap-1 mt-2 text-xs font-medium text-brand-orange hover:underline`}
              >
                {strategyTextExpanded ? <><ChevronUp size={14} /> Recolher texto</> : <><ChevronDown size={14} /> Ver texto completo</>}
              </button>

              {/* Highlights (top points) */}
              {strategic?.destaquesPlano?.length > 0 && (
                <div className={`mt-4 pt-4 border-t space-y-3 ${isDark ? 'border-white/10' : 'border-neutral-100'}`}>
                  {strategic.destaquesPlano.map((h, i) => (
                    <div key={i} className={`rounded-xl border p-4 ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Star size={14} className="text-brand-orange" />
                        <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{h.nome}</span>
                      </div>
                      <div className={`flex flex-wrap gap-3 text-xs mb-2 ${isDark ? 'text-white/40' : 'text-neutral-500'}`}>
                        <span>{h.tipo}</span>
                        <span>•</span>
                        <span className="text-brand-orange font-semibold">{h.fluxo} impactos/mês</span>
                      </div>
                      <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-neutral-600'}`}>{h.motivo}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB: MAP ─── */}
        {resultTab === 'map' && (
          <div className="space-y-4">
            {plan.pontos.length > 0 && (
              <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-white/10' : 'border-neutral-200 shadow-sm'}`}>
                <div className="h-[450px] sm:h-[550px]">
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

            {/* Point cards below map */}
            {plan.pontos.length > 0 && (
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-white/70' : 'text-neutral-700'}`}>
                  Pontos no mapa ({plan.pontos.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plan.pontos.map((ponto, i) => (
                    <PointCard key={ponto.id} ponto={ponto} onSelect={setSelectedPoint} index={i} isDark={isDark} />
                  ))}
                </div>
              </div>
            )}
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
