import { useState, useEffect } from 'react';

const THEME_KEY = 'intermidia_theme';

export default function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(THEME_KEY) === 'dark';
  });

  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem(THEME_KEY) === 'dark');
    window.addEventListener('storage', sync);
    window.addEventListener('theme-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('theme-change', sync);
    };
  }, []);

  return isDark;
}
