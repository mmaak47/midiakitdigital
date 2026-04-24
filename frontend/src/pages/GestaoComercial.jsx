import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, RefreshCcw, ChevronLeft, ChevronRight, Calculator
} from 'lucide-react';
import Navbar from '../components/Navbar';
import GestaoUnificada from '../components/gestao/GestaoUnificada';
import Renovacoes from '../components/gestao/Renovacoes';
import ComercialChatBot from '../components/gestao/ComercialChatBot';
import { fetchCurrentUser } from '../lib/api';

const TABS = [
  { key: 'vendas', label: 'Vendas & Metas', icon: BarChart3 },
  { key: 'renovacoes', label: 'Renovações', icon: RefreshCcw },
];

export default function GestaoComercial() {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('intermidia_theme') === 'dark';
  });
  const [activeTab, setActiveTab] = useState('vendas');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem('admin_token');
    if (!token) { navigate('/comercial'); return; }
    fetchCurrentUser().then(setCurrentUser).catch(() => navigate('/comercial'));
  }, [navigate]);

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
        </div>

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
          {activeTab === 'vendas' && <GestaoUnificada isDark={isDark} ano={ano} />}
          {activeTab === 'renovacoes' && <Renovacoes isDark={isDark} ano={ano} />}
        </div>
      </div>

      <ComercialChatBot isDark={isDark} />
    </div>
  );
}
