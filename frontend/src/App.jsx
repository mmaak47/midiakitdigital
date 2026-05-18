import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { FavoritesProvider } from './context/FavoritesContext';
import Landing from './pages/Landing';
import InventarioChatBot from './components/InventarioChatBot';
import ConsentBanner from './components/ConsentBanner';
import AppLoader, { RouteTransitionOverlay } from './components/AppLoader';

const Explorer = lazy(() => import('./pages/Explorer'));
const Admin = lazy(() => import('./pages/Admin'));
const CampaignPlanner = lazy(() => import('./pages/CampaignPlanner'));
const GestaoComercial = lazy(() => import('./pages/GestaoComercial'));
const PropostaPublica = lazy(() => import('./pages/PropostaPublica'));
const SharedView = lazy(() => import('./pages/SharedView'));
const TvWall = lazy(() => import('./pages/TvWall'));
const PacotePublico = lazy(() => import('./pages/PacotePublico'));

function hasAuthHintCookie() {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith('auth_hint=1'));
}

function RequireCommercialAuth({ children }) {
  const hasToken = typeof window !== 'undefined' &&
    (!!sessionStorage.getItem('admin_token') || hasAuthHintCookie());
  return hasToken ? children : <Navigate to="/comercial" replace />;
}

function shouldShowInventoryChat() {
  if (typeof window === 'undefined') return false;
  const path = String(window.location.pathname || '/');
  // Chat is shown ONLY on public areas: Landing ("/") and Planejar ("/planejar").
  // Internal/private areas (/comercial/*, /painel-tv, /p/:token, etc.) never show the chat.
  return path === '/' || path === '/planejar';
}

function shouldShowConsentBanner() {
  if (typeof window === 'undefined') return false;
  const path = String(window.location.pathname || '/');
  // Consent banner on public-facing pages only (not admin/commercial internal areas)
  return path === '/' || path === '/planejar' || path.startsWith('/s/') || path.startsWith('/p/') || path.startsWith('/pacote/');
}

/**
 * Wrapper components that scope FavoritesProvider per area.
 * Landing (public) uses storageKey="landing", Explorer (commercial) uses storageKey="explorer".
 * This keeps their favorites lists completely independent.
 */
function LandingWithFavorites() {
  return (
    <FavoritesProvider storageKey="landing">
      <Landing />
    </FavoritesProvider>
  );
}

function ExplorerWithFavorites() {
  return (
    <FavoritesProvider storageKey="explorer">
      <Explorer />
    </FavoritesProvider>
  );
}

function SharedViewWithFavorites() {
  return (
    <FavoritesProvider storageKey="shared">
      <SharedView />
    </FavoritesProvider>
  );
}

function PlannerWithFavorites() {
  return (
    <FavoritesProvider storageKey="planner">
      <CampaignPlanner />
    </FavoritesProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteTransitionOverlay />
      <Suspense fallback={<AppLoader />}>
        <Routes>
          <Route path="/" element={<LandingWithFavorites />} />
          <Route path="/planejar" element={<PlannerWithFavorites />} />
          <Route path="/comercial" element={<Admin />} />
          <Route path="/comercial/admin" element={<Admin />} />
          <Route path="/comercial/gestao" element={<RequireCommercialAuth><GestaoComercial /></RequireCommercialAuth>} />
          <Route path="/gestao" element={<RequireCommercialAuth><Navigate to="/comercial/gestao" replace /></RequireCommercialAuth>} />
          <Route path="/comercial/explorar" element={<RequireCommercialAuth><ExplorerWithFavorites /></RequireCommercialAuth>} />
          <Route path="/painel-tv" element={<TvWall />} />
          <Route path="/p/:token" element={<PropostaPublica />} />
          <Route path="/s/:code" element={<SharedViewWithFavorites />} />
          <Route path="/pacote/:code" element={<PacotePublico />} />
          <Route path="/explorar" element={<Navigate to="/" replace />} />
          <Route path="/admin" element={<Navigate to="/comercial/admin" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {shouldShowInventoryChat() ? (
        <FavoritesProvider storageKey="landing">
          <InventarioChatBot />
        </FavoritesProvider>
      ) : null}
      {shouldShowConsentBanner() ? <ConsentBanner /> : null}
    </BrowserRouter>
  );
}
