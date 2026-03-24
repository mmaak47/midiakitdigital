import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { FavoritesProvider } from './context/FavoritesContext';
import Landing from './pages/Landing';

const Explorer = lazy(() => import('./pages/Explorer'));
const Admin = lazy(() => import('./pages/Admin'));

export default function App() {
  return (
    <FavoritesProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/explorar" element={<Explorer />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </FavoritesProvider>
  );
}
