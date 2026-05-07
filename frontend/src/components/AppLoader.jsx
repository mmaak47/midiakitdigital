import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

function detectIsDark() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('intermidia_theme') === 'dark';
  } catch {
    return false;
  }
}

function LoaderVisual() {
  const [isDark, setIsDark] = useState(detectIsDark);

  useEffect(() => {
    const onTheme = () => setIsDark(detectIsDark());
    window.addEventListener('theme-change', onTheme);
    window.addEventListener('storage', onTheme);
    return () => {
      window.removeEventListener('theme-change', onTheme);
      window.removeEventListener('storage', onTheme);
    };
  }, []);

  const bg = isDark
    ? 'radial-gradient(circle at 50% 40%, #1f1209 0%, #0a0a0a 60%, #050505 100%)'
    : 'radial-gradient(circle at 50% 40%, #FFF5EE 0%, #FDF7F4 60%, #F8EFE8 100%)';

  const logoSrc = isDark ? '/logo.png' : '/logo-light.png';

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 28,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <motion.div
        aria-hidden
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0.25, 0.55, 0.25], scale: [0.95, 1.1, 0.95] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,107,53,0.22) 0%, rgba(255,107,53,0) 70%)',
          filter: 'blur(8px)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src={logoSrc}
        alt="Intermidia"
        initial={{ opacity: 0, y: 12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        onError={(e) => { e.currentTarget.src = '/logo.png'; }}
        style={{
          height: 92,
          width: 'auto',
          objectFit: 'contain',
          zIndex: 1,
          filter: isDark ? 'drop-shadow(0 6px 24px rgba(255,107,53,0.35))' : 'drop-shadow(0 6px 18px rgba(255,107,53,0.25))',
        }}
      />

      <div
        style={{
          width: 180,
          height: 3,
          borderRadius: 999,
          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '120%' }}
          transition={{ duration: 1.0, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            height: '100%',
            width: '60%',
            background: 'linear-gradient(90deg, #FF6B35 0%, #FF8F5E 100%)',
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Overlay de transição entre rotas (e montagem inicial).
 * HARD CAP de tempo: nunca fica infinito.
 */
export function RouteTransitionOverlay({ duration = 650 }) {
  const location = useLocation();
  const [visible, setVisible] = useState(true); // visible on mount (cobre Landing)
  const lastPathRef = useRef(location.pathname);
  const timerRef = useRef(null);
  const isFirstRef = useRef(true);

  // useLayoutEffect garante que o overlay aparece ANTES do paint da nova rota
  useLayoutEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), duration);
      return;
    }
    if (location.pathname === lastPathRef.current) return;
    lastPathRef.current = location.pathname;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), duration);
  }, [location.pathname, duration]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="route-transition"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            pointerEvents: 'auto',
          }}
        >
          <LoaderVisual />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Fallback do <Suspense>. Fica em branco por 250ms (evita flash) e
 * só revela o LoaderVisual se o chunk realmente demorar.
 */
export default function AppLoader() {
  return (
    <div style={{ minHeight: '100vh', width: '100%' }}>
      <LoaderVisual />
    </div>
  );
}
