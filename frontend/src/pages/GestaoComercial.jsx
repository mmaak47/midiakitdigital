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
      <Navbar commercial isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />

      <div className="pt-20 max-w-[1600px] mx-auto px-6 pb-12">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Gestão Comercial</h1>
            <p className="text-sm text-brand-gray-500 mt-1">
              {currentUser.first_name} {currentUser.last_name} • {currentUser.role === 'admin' ? 'Administrador' : currentUser.role === 'gerente_comercial' ? 'Gerente Comercial' : 'Vendedor'}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <div className={`flex flex-wrap gap-2 items-center rounded-2xl border p-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-neutral-200 bg-white shadow-sm'}`}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors sm:flex-none flex-[0_0_auto] justify-center sm:justify-start ${
                    active
                      ? 'bg-brand-orange text-white'
                      : isDark
                        ? 'text-brand-gray-300 hover:bg-white/10 hover:text-white'
                        : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
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
                  isDark ? 'text-brand-gray-300 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-base font-bold min-w-[60px] text-center">{ano}</span>
              <button
                onClick={() => setAno(a => a + 1)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'text-brand-gray-300 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
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
