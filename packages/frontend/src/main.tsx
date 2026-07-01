import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { queryClient } from './lib/queryClient.js';
import { AuthProvider } from './hooks/useAuth.js';
import { PreferencesProvider } from './hooks/useUserPreferences.js';
import { ToastProvider } from './components/common/ToastContext.js';
import ErrorBoundary from './components/common/ErrorBoundary.js';
import Toast from './components/common/Toast.js';
import { SocketStatusMonitor } from './components/common/SocketStatusMonitor.js';
import { router } from './router.js';
import './index.css';

// Lazy-load React Query DevTools only in development
// eslint-disable-next-line react-refresh/only-export-components
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((mod) => ({
        default: mod.ReactQueryDevtools,
      })),
    )
  : () => null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PreferencesProvider>
          <ToastProvider>
            <SocketStatusMonitor />
            <RouterProvider router={router} />
            <Toast />
          </ToastProvider>
          </PreferencesProvider>
        </AuthProvider>
        {import.meta.env.DEV && (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </Suspense>
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
