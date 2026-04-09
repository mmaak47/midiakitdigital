import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarDays, BarChart3, RefreshCcw, LogOut, ChevronLeft, ChevronRight, Sun, Moon
} from 'lucide-react';
import Navbar from '../components/Navbar';
import PlanilhaMensal from '../components/gestao/PlanilhaMensal';
import AcumuladoMeta from '../components/gestao/AcumuladoMeta';
import Renovacoes from '../components/gestao/Renovacoes';
import { fetchCurrentUser } from '../lib/api';

const TABS = [
  { key: 'planilha', label: 'Planilha Mensal', icon: CalendarDays },
  { key: 'acumulado', label: 'Acumulado – Meta', icon: BarChart3 },
  { key: 'renovacoes', label: 'Renovações', icon: RefreshCcw },
];

export default function GestaoComercial() {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('intermidia_theme') !== 'light';
  });
  const [activeTab, setActiveTab] = useState('planilha');
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
  }, [isDark]);

  const bg = isDark ? 'bg-gray-950' : 'bg-gray-50';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-white';
  const border = isDark ? 'border-gray-700' : 'border-gray-200';
  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';
  const hoverBg = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

  if (!currentUser) return null;

  return (
    <div className={`min-h-screen ${bg} ${text}`}>
      <Navbar isDark={isDark} setIsDark={setIsDark} />

      <div className="max-w-[1600px] mx-auto px-4 pt-20 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Gestão Comercial</h1>
            <p className={`text-sm ${textMuted}`}>
              {currentUser.first_name} {currentUser.last_name} • {currentUser.role === 'admin' ? 'Administrador' : currentUser.role === 'gerente_comercial' ? 'Gerente Comercial' : 'Vendedor'}
            </p>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2">
            <button onClick={() => setAno(a => a - 1)} className={`p-1 rounded ${hoverBg}`}>
              <ChevronLeft size={18} />
            </button>
            <span className="text-lg font-bold min-w-[60px] text-center">{ano}</span>
            <button onClick={() => setAno(a => a + 1)} className={`p-1 rounded ${hoverBg}`}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 p-1 rounded-xl ${cardBg} border ${border} mb-6`}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : `${text} ${hoverBg}`
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'planilha' && <PlanilhaMensal isDark={isDark} ano={ano} />}
          {activeTab === 'acumulado' && <AcumuladoMeta isDark={isDark} ano={ano} />}
          {activeTab === 'renovacoes' && <Renovacoes isDark={isDark} ano={ano} />}
        </motion.div>
      </div>
    </div>
  );
}
