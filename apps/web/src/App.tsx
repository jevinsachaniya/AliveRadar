import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { api, setCsrf, HttpError } from './api';
import type { Auth } from './types';
import { AppLayout } from './components/AppLayout';
import { LoadingSkeleton, ErrorState } from './components/ui';
import { authPath, returnTarget } from './authNavigation';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { PublicOverview } from './pages/PublicOverview';
import { NotFound } from './pages/NotFound';
import { pageMetadata, useSeo } from './seo';
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })));
const Websites = lazy(() => import('./pages/Websites').then((m) => ({ default: m.Websites })));
const WebsiteDetails = lazy(() =>
  import('./pages/Websites').then((m) => ({ default: m.WebsiteDetails })),
);
const MonitorDetails = lazy(() =>
  import('./pages/MonitorDetails').then((m) => ({ default: m.MonitorDetails })),
);
const Incidents = lazy(() => import('./pages/Incidents').then((m) => ({ default: m.Incidents })));
const IncidentDetails = lazy(() =>
  import('./pages/Incidents').then((m) => ({ default: m.IncidentDetails })),
);
const StatusPages = lazy(() =>
  import('./pages/StatusPages').then((m) => ({ default: m.StatusPages })),
);
const PublicStatus = lazy(() =>
  import('./pages/StatusPages').then((m) => ({ default: m.PublicStatus })),
);
const Notifications = lazy(() =>
  import('./pages/Notifications').then((m) => ({ default: m.Notifications })),
);
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const AuthPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.AuthPage })));
const VerifyOtp = lazy(() => import('./pages/VerifyOtp').then((m) => ({ default: m.VerifyOtp })));
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 10000, refetchOnWindowFocus: true } },
  });
}
function App() {
  const location = useLocation();
  const known = !pageMetadata(location.pathname).notFound;
  const isPublic = location.pathname.startsWith('/status/');
  const isAuth = [
    '/login',
    '/register',
    '/login/otp',
    '/register/otp',
    '/forgot-password',
    '/reset-password',
  ].includes(location.pathname);
  const auth = useQuery({
    queryKey: ['auth'],
    retry: false,
    enabled: known && !isPublic,
    queryFn: async () => {
      try {
        const data = await api<Auth>('/auth/me');
        setCsrf(data.csrfToken);
        return data;
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          setCsrf('');
          return null;
        }
        throw error;
      }
    },
  });
  useSeo(location.pathname, !!auth.data?.user);
  if (!known) return <NotFound />;
  if (isPublic)
    return (
      <Routes>
        <Route path="/status/:slug" element={<PublicStatus />} />
      </Routes>
    );
  if (['/', '/overview', '/about', '/contact'].includes(location.pathname)) {
    const user = auth.error ? undefined : auth.data?.user;
    return (
      <Routes>
        <Route element={<AppLayout user={user} />}>
          <Route index element={<Home user={user} />} />
          <Route path="/overview" element={user ? <Overview user={user} /> : <PublicOverview />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
        </Route>
      </Routes>
    );
  }
  if (isAuth && !auth.isPending && !auth.error) {
    if (auth.data && !['/forgot-password', '/reset-password'].includes(location.pathname))
      return (
        <Navigate to={returnTarget(new URLSearchParams(location.search).get('next'))} replace />
      );
    return (
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/login/otp" element={<VerifyOtp key="login" purpose="login" />} />
        <Route path="/register/otp" element={<VerifyOtp key="register" purpose="register" />} />
        <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
        <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      </Routes>
    );
  }
  if (auth.isPending)
    return (
      <div className="boot-loading">
        <LoadingSkeleton />
      </div>
    );
  if (auth.error)
    return (
      <div className="boot-loading">
        <ErrorState error={auth.error} onRetry={() => void auth.refetch()} />
      </div>
    );
  if (!auth.data)
    return (
      <Navigate
        to={authPath('/login', `${location.pathname}${location.search}${location.hash}`)}
        replace
      />
    );
  const user = auth.data.user;
  return (
    <Routes>
      <Route element={<AppLayout user={user} />}>
        <Route index element={<Home user={user} />} />
        <Route path="/overview" element={<Overview user={user} />} />
        <Route path="/websites" element={<Websites />} />
        <Route path="/websites/:id" element={<WebsiteDetails />} />
        <Route path="/monitors" element={<Overview user={user} monitorsOnly />} />
        <Route path="/monitors/:id" element={<MonitorDetails />} />
        <Route path="/incidents" element={<Incidents />} />
        <Route path="/incidents/:id" element={<IncidentDetails />} />
        <Route path="/status-pages" element={<StatusPages />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings user={user} />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
export function AppContent() {
  return (
    <>
      <Suspense
        fallback={
          <div className="boot-loading">
            <LoadingSkeleton />
          </div>
        }
      >
        <App />
      </Suspense>
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
