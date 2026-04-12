import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { FavoritesProvider } from './context/FavoritesContext';
import Landing from './pages/Landing';
import InventarioChatBot from './components/InventarioChatBot';

const Explorer = lazy(() => import('./pages/Explorer'));
const Admin = lazy(() => import('./pages/Admin'));
const CampaignPlanner = lazy(() => import('./pages/CampaignPlanner'));
const GestaoComercial = lazy(() => import('./pages/GestaoComercial'));

function hasAuthHintCookie() {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith('auth_hint=1'));
}

function RequireCommercialAuth({ children }) {
  const hasToken = typeof window !== 'undefined' &&
    (!!sessionStorage.getItem('admin_token') || hasAuthHintCookie());
  return hasToken ? children : <Navigate to="/comercial" replace />;
}

export default function App() {
  return (
    <FavoritesProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/planejar" element={<CampaignPlanner />} />
            <Route path="/comercial" element={<Admin />} />
            <Route path="/comercial/admin" element={<Admin />} />
            <Route path="/comercial/gestao" element={<RequireCommercialAuth><GestaoComercial /></RequireCommercialAuth>} />
            <Route path="/comercial/explorar" element={<RequireCommercialAuth><Explorer /></RequireCommercialAuth>} />
            <Route path="/explorar" element={<Navigate to="/" replace />} />
            <Route path="/admin" element={<Navigate to="/comercial/admin" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <InventarioChatBot />
      </BrowserRouter>
    </FavoritesProvider>
  );
}
