import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const FavoritesContext = createContext();

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem('intermidia:favorites');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem('intermidia:history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('intermidia:favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('intermidia:history', JSON.stringify(history.slice(-80)));
  }, [history]);

  const pushHistory = useCallback((item) => {
    setHistory((prev) => ([...prev, { id: `${Date.now()}-${Math.random()}`, at: Date.now(), ...item }].slice(-80)));
  }, []);

  const addFavorite = useCallback((ponto) => {
    setFavorites(prev => {
      if (prev.find(p => p.id === ponto.id)) return prev;
      pushHistory({ type: 'added', pointId: ponto.id, city: ponto.cidade, label: ponto.nome });
      return [...prev, ponto];
    });
  }, [pushHistory]);

  const addFavorites = useCallback((pontos) => {
    if (!Array.isArray(pontos) || !pontos.length) return;
    setFavorites((prev) => {
      const existing = new Set(prev.map((p) => p.id));
      const addList = pontos.filter((p) => !existing.has(p.id));
      if (!addList.length) return prev;
      const next = [...prev, ...addList];
      pushHistory({
        type: 'combo',
        label: 'Combinacao popular',
        points: addList,
        city: addList[0]?.cidade || ''
      });
      return next;
    });
  }, [pushHistory]);

  const removeFavorite = useCallback((id) => {
    setFavorites(prev => prev.filter(p => p.id !== id));
  }, []);

  const isFavorite = useCallback((id) => {
    return favorites.some(p => p.id === id);
  }, [favorites]);

  const clearFavorites = useCallback(() => {
    setFavorites([]);
  }, []);

  const registerView = useCallback((ponto) => {
    if (!ponto?.id) return;
    pushHistory({ type: 'viewed', pointId: ponto.id, label: ponto.nome, city: ponto.cidade });
  }, [pushHistory]);

  const totalPreco = favorites.reduce((sum, p) => sum + (p.preco || 0), 0);
  const totalFluxo = favorites.reduce((sum, p) => sum + (p.fluxo || 0), 0);
  const totalTelas = favorites.reduce((sum, p) => sum + (p.telas || 0), 0);
  const totalInsercoes = favorites.reduce((sum, p) => sum + (p.insercoes || 0), 0);

  return (
    <FavoritesContext.Provider value={{
      favorites, history,
      addFavorite, addFavorites, removeFavorite, isFavorite, clearFavorites,
      registerView,
      totalPreco, totalFluxo, totalTelas, totalInsercoes
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
}
