import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Navbar({ transparent = false, showNav = true, commercial = false }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const links = commercial
    ? [
        { to: '/comercial/explorar', label: 'Explorar Pontos' },
        { to: '/comercial/admin', label: 'Admin' }
      ]
    : [
        { to: '/', label: 'Home' },
        { to: '/comercial', label: 'Comercial' }
      ];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
        transparent ? 'bg-transparent' : 'bg-brand-gray-900/85 backdrop-blur-xl border-b border-white/10'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <img src="/logo.png" alt="Intermidia" className="h-8 transition-transform group-hover:scale-105" />
          {commercial ? (
            <span className="font-logo text-lg leading-none text-transparent bg-clip-text bg-gradient-to-r from-brand-orange via-[#ff8a64] to-brand-orange">
              Comercial
            </span>
          ) : null}
        </Link>

        {/* Desktop Nav */}
        {showNav ? (
          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} label={link.label} current={location.pathname} />
            ))}
          </div>
        ) : <div />}

        {/* Mobile Toggle */}
        {showNav ? (
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden text-white p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Mobile Menu */}
      {showNav && open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-brand-gray-900/95 backdrop-blur-xl border-t border-white/10 px-6 py-4 space-y-3"
        >
          {links.map((link) => (
            <MobileNavLink key={link.to} to={link.to} label={link.label} onClick={() => setOpen(false)} />
          ))}
        </motion.div>
      )}
    </motion.nav>
  );
}

function NavLink({ to, label, current }) {
  const isActive = current === to;
  return (
    <Link
      to={to}
      className={`text-sm font-medium transition-colors duration-200 ${
        isActive ? 'text-brand-orange' : 'text-brand-gray-400 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

function MobileNavLink({ to, label, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block text-white/80 hover:text-brand-orange text-base py-2 transition-colors"
    >
      {label}
    </Link>
  );
}
