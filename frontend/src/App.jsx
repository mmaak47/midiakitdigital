import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { FavoritesProvider } from './context/FavoritesContext';
import Landing from './pages/Landing';
import Explorer from './pages/Explorer';
import Admin from './pages/Admin';

export default function App() {
  return (
    <FavoritesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/explorar" element={<Explorer />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </FavoritesProvider>
  );
}
