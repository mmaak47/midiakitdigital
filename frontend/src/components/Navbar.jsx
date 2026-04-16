import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { captureContactLead, trackEvent } from '../lib/tracking';

export default function Navbar({ transparent = false, showNav = true, showCta = false, commercial = false, plannerMode = false, isDark = true, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const logoSrc = isDark ? '/logo.png' : '/logo-light.png';
  const WA_HREF = `https://wa.me/554398450480?text=${encodeURIComponent('Olá! Vim pelo Mídia Kit Digital da Intermidia e gostaria de receber uma proposta.')}`;
  const INSTAGRAM_PATH = 'M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm8.5 1.9h-8.5A3.85 3.85 0 0 0 3.9 7.75v8.5a3.85 3.85 0 0 0 3.85 3.85h8.5a3.85 3.85 0 0 0 3.85-3.85v-8.5a3.85 3.85 0 0 0-3.85-3.85Zm-4.25 2.6a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm0 1.9a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm5.9-2.05a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7Z';

  const markContactClick = (eventType, source) => {
    trackEvent(eventType, { source });
    captureContactLead(source);
  };

  const links = commercial
    ? [
        { to: '/comercial/explorar', label: 'Explorar Pontos', icon: 'ri-map-pin-line' },
        { to: '/comercial/admin', label: 'Admin', icon: 'ri-settings-3-line' }
      ]
    : plannerMode
      ? [] // no internal links for public campaign planner
      : [
          { to: '/', label: 'Home', icon: 'ri-home-5-line' },
          { to: '/planejar', label: 'Planejar Campanha', icon: 'ri-magic-line' },
          { to: '/comercial', label: 'Comercial', icon: 'ri-building-4-line' }
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
        {showNav && !plannerMode ? (
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
        ) : showNav && plannerMode ? (
          <div className="hidden md:flex items-center gap-3">
            {onToggleTheme ? (
              <button
                type="button"
                onClick={onToggleTheme}
                className={`h-9 w-9 flex items-center justify-center rounded-lg border transition ${isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'}`}
                aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              >
                <i className={isDark ? 'ri-sun-line' : 'ri-moon-line'} style={{ fontSize: 16 }} />
              </button>
            ) : null}
            <a
              href={WA_HREF}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => markContactClick('whatsapp_click', 'navbar_planner_desktop')}
              className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold text-white transition-all bg-[#25D366] hover:bg-[#22c55e] shadow-sm"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Falar com a equipe
            </a>
          </div>
        ) : <div />}

        {/* CTA Button (landing, sem nav completo) */}
        {showCta && (
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/planejar"
              onClick={() => markContactClick('contact_click', 'navbar_landing_plan_desktop')}
              className="inline-flex items-center gap-2 px-5 h-9 bg-brand-orange text-white text-sm font-semibold rounded-lg hover:bg-brand-orange-hover hover:shadow-lg hover:shadow-brand-orange/40 transition-all duration-200"
            >
              Planejar campanha
              <i className="ri-magic-line" style={{ fontSize: 15 }} />
            </Link>
            <a
              href="https://www.instagram.com/intermidiadigitalooh/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => markContactClick('instagram_click', 'navbar_landing_instagram_desktop')}
              className="flex items-center justify-center w-9 h-9 rounded-lg border-2 transition-all duration-200 border-brand-orange bg-white hover:bg-[#fff3ed]"
              aria-label="Instagram"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <path d={INSTAGRAM_PATH} fill="#fe5c2b" />
              </svg>
            </a>
          </div>
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
          {showNav && !plannerMode && links.map((link) => (
            <MobileNavLink key={link.to} to={link.to} label={link.label} icon={link.icon} onClick={() => setOpen(false)} commercial={commercial} isDark={isDark} />
          ))}
          {showNav && plannerMode && (
            <a
              href={WA_HREF}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                markContactClick('whatsapp_click', 'navbar_planner_mobile');
                setOpen(false);
              }}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-[#25D366] active:bg-[#1db954]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Falar com a equipe
            </a>
          )}
          {showCta && (
            <div className="flex items-center gap-3">
              <Link
                to="/planejar"
                onClick={() => {
                  markContactClick('contact_click', 'navbar_landing_plan_mobile');
                  setOpen(false);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-brand-orange text-white text-sm font-semibold rounded-xl active:bg-brand-orange-hover"
              >
                <i className="ri-magic-line" style={{ fontSize: 16 }} />
                Planejar campanha
              </Link>
              <a
                href="https://www.instagram.com/intermidiadigitalooh/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  markContactClick('instagram_click', 'navbar_landing_instagram_mobile');
                  setOpen(false);
                }}
                className="flex items-center justify-center w-12 h-12 rounded-xl border-2 transition-colors border-brand-orange bg-white hover:bg-[#fff3ed]"
                aria-label="Instagram"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                  <path d={INSTAGRAM_PATH} fill="#fe5c2b" />
                </svg>
              </a>
            </div>
          )}
          {(commercial || plannerMode) && onToggleTheme ? (
            <button
              type="button"
              onClick={() => {
                onToggleTheme();
                setOpen(false);
              }}
              className={`mt-1 w-full flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm ${isDark ? 'border-white/15 bg-white/5 text-white' : 'border-neutral-300 bg-white text-neutral-800'}`}
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

function MobileNavLink({ to, label, icon, onClick, commercial, isDark }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 py-3 px-1 text-base font-medium transition-colors active:opacity-70 ${commercial && !isDark ? 'text-neutral-700 hover:text-brand-orange' : 'text-white/85 hover:text-brand-orange'}`}
    >
      {icon && (
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${commercial && !isDark ? 'bg-neutral-100' : 'bg-white/[0.07]'}`}>
          <i className={icon} style={{ fontSize: 18 }} />
        </span>
      )}
      {label}
    </Link>
  );
}
