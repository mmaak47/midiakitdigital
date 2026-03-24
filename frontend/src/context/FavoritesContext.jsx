import { createContext, useContext, useState, useCallback } from 'react';

const FavoritesContext = createContext();

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState([]);

  const addFavorite = useCallback((ponto) => {
    setFavorites(prev => {
      if (prev.find(p => p.id === ponto.id)) return prev;
      return [...prev, ponto];
    });
  }, []);

  const removeFavorite = useCallback((id) => {
    setFavorites(prev => prev.filter(p => p.id !== id));
  }, []);

  const isFavorite = useCallback((id) => {
    return favorites.some(p => p.id === id);
  }, [favorites]);

  const clearFavorites = useCallback(() => {
    setFavorites([]);
  }, []);

  const totalPreco = favorites.reduce((sum, p) => sum + (p.preco || 0), 0);
  const totalFluxo = favorites.reduce((sum, p) => sum + (p.fluxo || 0), 0);
  const totalTelas = favorites.reduce((sum, p) => sum + (p.telas || 0), 0);

  return (
    <FavoritesContext.Provider value={{
      favorites, addFavorite, removeFavorite, isFavorite, clearFavorites,
      totalPreco, totalFluxo, totalTelas
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
