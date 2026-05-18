import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart3, RefreshCcw, ChevronLeft, ChevronRight, Calculator, X, TrendingUp,
  ArrowLeft, Zap, ClipboardList, Users, FileText, Heart, Settings, Package
} from 'lucide-react';
import Navbar from '../components/Navbar';
import GestaoUnificada from '../components/gestao/GestaoUnificada';
import Renovacoes from '../components/gestao/Renovacoes';
import MeusLeads from '../components/gestao/MeusLeads';
import NovaVendaTab from '../components/admin/NovaVendaTab';
import VendasListTab from '../components/admin/VendasListTab';
import PropostasTab from '../components/admin/PropostasTab';
import FavoritesAnalyticsTab from '../components/admin/FavoritesAnalyticsTab';
import PacotesTab from '../components/admin/PacotesTab';
import ComercialChatBot from '../components/gestao/ComercialChatBot';
import { fetchCurrentUser, fetchAdminPontos } from '../lib/api';

const TABS = [
  { key: 'metas', label: 'Metas', icon: BarChart3 },
  { key: 'nova_venda', label: 'Nova Venda', icon: Zap },
  { key: 'historico', label: 'Vendas', icon: ClipboardList },
  { key: 'renovacoes', label: 'Renovações', icon: RefreshCcw },
  { key: 'leads', label: 'Meus Leads', icon: Users },
  { key: 'propostas', label: 'Propostas', icon: FileText },
  { key: 'favoritos', label: 'Favoritos', icon: Heart },
  { key: 'pacotes', label: 'Pacotes', icon: Package },
];

export default function GestaoComercial() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('intermidia_theme') === 'dark';
  });
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const search = new URLSearchParams(window.location.search);
      const requested = search.get('tab');
      if (requested && TABS.find(t => t.key === requested)) return requested;
    } catch {}
    return 'metas';
  });
  const [ano, setAno] = useState(new Date().getFullYear());
  const [currentUser, setCurrentUser] = useState(null);
  const [pontos, setPontos] = useState([]);
  const [welcome, setWelcome] = useState(null); // { nome, pct, realizado, meta }

  useEffect(() => {
    const token = sessionStorage.getItem('admin_token');
    if (!token) { navigate('/comercial'); return; }
    fetchCurrentUser().then((u) => {
      setCurrentUser(u);
      // Mensagem de boas-vindas 1x por sessão (prioridade para Diretor, mas aparece para todos).
      try {
        const flagKey = 'welcome_shown_' + new Date().toISOString().slice(0,10);
        if (!sessionStorage.getItem(flagKey)) {
          fetch('/api/gestao/monthly-summary', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then((snap) => {
              if (!snap) return;
              setWelcome({
                nome: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
                role: u.role,
                pct: Number(snap.pct_mensal || 0),
                realizado: Number(snap.realizado_mensal || 0),
                meta: Number(snap.meta_mensal || 0),
              });
              sessionStorage.setItem(flagKey, '1');
            })
            .catch(() => {});
        }
      } catch {}
    }).catch(() => navigate('/comercial'));
    // Carrega pontos para Nova Venda / Vendas
    fetchAdminPontos().then(setPontos).catch(() => {});
  }, [navigate]);

  // Respeita ?tab= na URL quando muda
  useEffect(() => {
    try {
      const search = new URLSearchParams(location.search);
      const requested = search.get('tab');
      if (requested && TABS.find(t => t.key === requested)) setActiveTab(requested);
    } catch {}
  }, [location.search]);

  useEffect(() => {
    const cls = isDark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('intermidia_theme', cls);
    window.dispatchEvent(new Event('theme-change'));
  }, [isDark]);

  if (!currentUser) return null;

  return (
    <div
      className={`min-h-screen ${isDark ? 'bg-black text-white' : 'commercial-light bg-[#f4f5f7] text-neutral-900'}`}
      data-theme={isDark ? 'dark' : 'light'}
    >
      {/* Accent line + atmospheric radial gradients (consistent with Landing/Explorer) */}
      {!isDark && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#FE5C2B] to-transparent opacity-80 z-20" />
          <div className="pointer-events-none fixed -left-40 top-20 w-[520px] h-[520px] rounded-full opacity-60" style={{ background: 'radial-gradient(circle, rgba(254,92,43,0.10) 0%, rgba(254,92,43,0.03) 45%, transparent 72%)' }} />
          <div className="pointer-events-none fixed -right-40 top-1/2 w-[480px] h-[480px] rounded-full opacity-60" style={{ background: 'radial-gradient(circle, rgba(232,89,26,0.08) 0%, rgba(232,89,26,0.02) 48%, transparent 74%)' }} />
        </>
      )}

      <Navbar commercial isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />

      <div className="relative z-10 pt-20 max-w-[1600px] mx-auto px-6 pb-12">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center justify-center w-11 h-11 rounded-2xl ${isDark ? 'bg-white/10' : 'bg-gradient-to-br from-[#FE5C2B] to-[#C94A1A] shadow-lg shadow-[#FE5C2B]/25'}`}>
              <BarChart3 size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Gestão Comercial</h1>
              <p className={`text-sm mt-0.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-500'}`}>
                {currentUser.first_name} {currentUser.last_name} <span className="opacity-40 mx-1">•</span> {currentUser.role === 'admin' ? 'Administrador' : currentUser.role === 'diretor' ? 'Diretor' : currentUser.role === 'gerente_comercial' ? 'Gerente Comercial' : 'Vendedor'}
              </p>
            </div>
          </div>

          {/* Quick action: painel admin (only for admin/diretor) */}
          {(currentUser.role === 'admin' || currentUser.role === 'diretor') && (
            <button
              type="button"
              onClick={() => navigate('/comercial')}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all ${
                isDark
                  ? 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 shadow-sm'
              }`}
              title="Painel administrativo"
            >
              <Settings size={16} />
              Painel Admin
            </button>
          )}
        </div>

        {welcome && (
          <WelcomeBanner welcome={welcome} isDark={isDark} onClose={() => setWelcome(null)} />
        )}

        <div className="mb-6">
          <div className={`flex flex-wrap gap-2 items-center rounded-2xl border p-2 transition-shadow ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200/80 bg-white shadow-[0_2px_12px_-4px_rgba(254,92,43,0.08)] hover:shadow-[0_4px_18px_-6px_rgba(254,92,43,0.14)]'}`}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 sm:flex-none flex-[0_0_auto] justify-center sm:justify-start ${
                    active
                      ? isDark
                        ? 'bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white shadow-lg shadow-[#FE5C2B]/30'
                        : 'bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] text-white shadow-md shadow-[#FE5C2B]/25 -translate-y-px'
                      : isDark
                        ? 'text-brand-gray-300 hover:bg-white/10 hover:text-white'
                        : 'text-neutral-600 hover:bg-[#FFF1EA] hover:text-[#C94A1A]'
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}

            <div className="flex items-center gap-2 ml-auto w-full sm:w-auto mt-2 sm:mt-0 justify-center">
              <button
                onClick={() => setAno(a => a - 1)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'text-brand-gray-300 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-[#FFF1EA] hover:text-[#C94A1A]'
                }`}
              >
                <ChevronLeft size={18} />
              </button>
              <span className={`text-base font-bold min-w-[60px] text-center tabular-nums ${isDark ? '' : 'text-[#C94A1A]'}`}>{ano}</span>
              <button
                onClick={() => setAno(a => a + 1)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'text-brand-gray-300 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-[#FFF1EA] hover:text-[#C94A1A]'
                }`}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        <div>
          {activeTab === 'metas' && <GestaoUnificada isDark={isDark} ano={ano} />}
          {activeTab === 'nova_venda' && <NovaVendaTab isDark={isDark} pontos={pontos.filter(p => Number(p.ativo) === 1)} currentUser={currentUser} />}
          {activeTab === 'historico' && <VendasListTab isDark={isDark} pontos={pontos.filter(p => Number(p.ativo) === 1)} currentUser={currentUser} />}
          {activeTab === 'renovacoes' && <Renovacoes isDark={isDark} ano={ano} />}
          {activeTab === 'leads' && <MeusLeads isDark={isDark} currentUser={currentUser} />}
          {activeTab === 'propostas' && <PropostasTab isDark={isDark} />}
          {activeTab === 'favoritos' && <FavoritesAnalyticsTab isDark={isDark} />}
          {activeTab === 'pacotes' && <PacotesTab isDark={isDark} currentUser={currentUser} pontos={pontos.filter(p => Number(p.ativo) === 1)} />}
        </div>
      </div>

      <ComercialChatBot isDark={isDark} />
    </div>
  );
}

function WelcomeBanner({ welcome, isDark, onClose }) {
  const { nome, pct, realizado, meta, role } = welcome;
  const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

  const primeiroNome = String(nome || '').split(' ')[0] || 'chefe';
  const saudacao = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  let frase;
  if (meta <= 0) {
    frase = 'A meta mensal ainda não foi cadastrada — que tal já começar faturando?';
  } else if (pct >= 100) {
    frase = `Meta batida: ${pct}% da meta mensal conquistados! Vamos passar dos 120%?`;
  } else if (pct >= 75) {
    frase = `Você já está com ${pct}% da meta mensal. Falta pouco, bora fechar!`;
  } else if (pct >= 40) {
    frase = `A meta mensal está ${pct}% concluída. Ritmo bom, bora acelerar!`;
  } else if (pct > 0) {
    frase = `A meta mensal está ${pct}% concluída. Bora vender, ${primeiroNome}!`;
  } else {
    frase = `Meta mensal zerada por enquanto. Bora abrir o mês com chave de ouro, ${primeiroNome}!`;
  }

  const roleLabel = role === 'diretor' ? 'diretor' : role === 'admin' ? 'chefe' : role === 'gerente_comercial' ? 'gerente' : 'vendedor(a)';

  return (
    <div
      className={`relative mb-6 rounded-2xl border overflow-hidden ${
        isDark
          ? 'border-white/10 bg-gradient-to-r from-[#2A1610] via-[#1F100B] to-[#150A06]'
          : 'border-[#FFD9C6] bg-gradient-to-r from-[#FFF4EC] via-[#FFEAD8] to-[#FFF4EC]'
      }`}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(254,92,43,0.18) 0%, transparent 70%)' }} />
      <div className="relative flex items-start gap-4 p-5">
        <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FE5C2B] to-[#C94A1A] text-white shadow-lg shadow-[#FE5C2B]/30">
          <TrendingUp size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`text-lg sm:text-xl font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {saudacao}, {nome || 'chefe'}! Seja bem-vindo(a) de volta.
          </h2>
          <p className={`text-sm mt-1 ${isDark ? 'text-brand-gray-300' : 'text-neutral-700'}`}>
            {frase}
          </p>
          {meta > 0 && (
            <div className="mt-3">
              <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-white'}`}>
                <div
                  className="h-full bg-gradient-to-r from-[#FE5C2B] to-[#E85A1A] transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
              <div className={`flex justify-between text-xs mt-1.5 ${isDark ? 'text-brand-gray-400' : 'text-neutral-600'}`}>
                <span>Realizado: <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtBRL(realizado)}</strong></span>
                <span>Meta: <strong className={isDark ? 'text-white' : 'text-neutral-900'}>{fmtBRL(meta)}</strong></span>
              </div>
            </div>
          )}
          <p className={`text-[11px] mt-2 opacity-60 ${isDark ? 'text-brand-gray-500' : 'text-neutral-500'}`}>
            Dados do mês atual · perfil: {roleLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`shrink-0 rounded-lg p-1.5 transition-colors ${isDark ? 'text-brand-gray-400 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-white hover:text-neutral-800'}`}
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
