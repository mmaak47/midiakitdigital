import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Navbar({ transparent = false, showNav = true, showCta = false, commercial = false, isDark = true, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const logoSrc = isDark ? '/logo.png' : '/logo-light.png';
  const links = commercial
    ? [
        { to: '/planejar', label: 'Planejar Campanha' },
        { to: '/comercial/explorar', label: 'Explorar Pontos' },
        { to: '/comercial/admin', label: 'Admin' }
      ]
    : [
        { to: '/', label: 'Home' },
        { to: '/planejar', label: 'Planejar Campanha' },
        { to: '/comercial', label: 'Comercial' }
      ];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        transparent
          ? 'bg-transparent'
          : isDark
            ? 'bg-brand-gray-900/70 backdrop-blur-2xl shadow-xl shadow-black/40 border-b border-white/5'
            : 'bg-white/70 backdrop-blur-2xl shadow-md border-b border-white/50'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <img src={logoSrc} alt="Intermidia" className="h-8 transition-transform group-hover:scale-105" />
          {commercial ? (
            <span className={`font-logo text-lg leading-none text-transparent bg-clip-text bg-gradient-to-r from-brand-orange via-[#ff8a64] to-brand-orange ${isDark ? '' : 'drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]'}`}>
              Comercial
            </span>
          ) : null}
        </Link>

        {/* Desktop Nav */}
        {showNav ? (
          <div className="hidden md:flex items-center gap-5">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} label={link.label} current={location.pathname} commercial={commercial} isDark={isDark} />
            ))}
            {commercial && onToggleTheme ? (
              <button
                type="button"
                onClick={onToggleTheme}
                className={`h-9 w-9 flex items-center justify-center rounded-lg border transition ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'}`}
                aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
                title={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              >
                <i className={isDark ? 'ri-sun-line' : 'ri-moon-line'} style={{ fontSize: 16 }} />
              </button>
            ) : null}
          </div>
        ) : <div />}

        {/* CTA Button (landing, sem nav completo) */}
        {showCta && (
          <Link
            to="/planejar"
            className="hidden md:inline-flex items-center gap-2 px-5 h-9 bg-brand-orange text-white text-sm font-semibold rounded-lg hover:bg-brand-orange-hover hover:shadow-lg hover:shadow-brand-orange/40 transition-all duration-200"
          >
            Planejar campanha
            <i className="ri-magic-line" style={{ fontSize: 15 }} />
          </Link>
        )}

        {/* Mobile Toggle */}
        {showNav || showCta ? (
          <button
            onClick={() => setOpen(!open)}
            className={`md:hidden p-2 rounded-lg transition-colors ${commercial && !isDark ? 'text-neutral-800 hover:bg-neutral-200' : 'text-white hover:bg-white/10'}`}
            aria-label="Menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Mobile Menu */}
      {(showNav || showCta) && open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`md:hidden backdrop-blur-xl border-t px-6 py-4 space-y-3 ${commercial && !isDark ? 'bg-[#f1f2f4]/98 border-neutral-300' : 'bg-brand-gray-900/95 border-white/10'}`}
        >
          {showNav && links.map((link) => (
            <MobileNavLink key={link.to} to={link.to} label={link.label} onClick={() => setOpen(false)} commercial={commercial} isDark={isDark} />
          ))}
          {showCta && (
            <Link
              to="/planejar"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-brand-orange text-white text-sm font-semibold rounded-lg"
            >
              Planejar campanha
              <i className="ri-magic-line" style={{ fontSize: 15 }} />
            </Link>
          )}
          {commercial && onToggleTheme ? (
            <button
              type="button"
              onClick={() => {
                onToggleTheme();
                setOpen(false);
              }}
              className={`mt-1 w-full flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-white/15 bg-white/5 text-white' : 'border-neutral-300 bg-white text-neutral-800'}`}
            >
              <i className={isDark ? 'ri-sun-line' : 'ri-moon-line'} style={{ fontSize: 16 }} />
              {isDark ? 'Modo claro' : 'Modo escuro'}
            </button>
          ) : null}
        </motion.div>
      )}
    </motion.nav>
  );
}

function NavLink({ to, label, current, commercial, isDark }) {
  const isActive = current === to;
  return (
    <Link
      to={to}
      className={`text-sm font-medium transition-colors duration-200 ${
        isActive
          ? 'text-brand-orange'
          : commercial && !isDark
            ? 'text-neutral-700 hover:text-black'
            : 'text-brand-gray-400 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

function MobileNavLink({ to, label, onClick, commercial, isDark }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`block text-base py-2 transition-colors ${commercial && !isDark ? 'text-neutral-700 hover:text-brand-orange' : 'text-white/80 hover:text-brand-orange'}`}
    >
      {label}
    </Link>
  );
}
