import { useState, useEffect } from 'react';

const THEME_KEY = 'intermidia_theme';

export default function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(THEME_KEY) !== 'light';
  });

  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem(THEME_KEY) !== 'light');
    window.addEventListener('storage', sync);
    window.addEventListener('theme-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('theme-change', sync);
    };
  }, []);

  return isDark;
}
