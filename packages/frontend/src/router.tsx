/**
 * React Router configuration.
 *
 * Defines all routes for the application with layout nesting:
 *
 *  - Public routes: /server-error, /sso-callback, /invite/:token
 *  - Public-only routes (redirect if authenticated): /login, /setup
 *  - Protected routes (require auth): all app routes inside AuthenticatedLayout
 *  - 404 catch-all
 */

import { createBrowserRouter, useParams, Navigate } from 'react-router';
import { lazy, Suspense } from 'react';

// Auth pages (outside main layout)
import ServerErrorPage from './components/auth/ServerErrorPage.js';
import SsoCallbackPage from './components/auth/SsoCallbackPage.js';
import LoginPage from './components/auth/LoginPage.js';
import SetupWizard from './components/auth/SetupWizard.js';
import AcceptInvitePage from './pages/AcceptInvitePage.js';

// Route guards
import ProtectedRoute from './components/auth/ProtectedRoute.js';
import PublicRoute from './components/auth/PublicRoute.js';
import AdminRoute from './components/auth/AdminRoute.js';
import MarketplaceRouteGuard from './components/auth/MarketplaceRouteGuard.js';

// Authenticated layout
import AuthenticatedLayout from './components/layout/AuthenticatedLayout.js';

// Pages
import NotFoundPage from './components/common/NotFoundPage.js';
import {
  SkillsGridPage,
  SkillDetailPage,
  SkillTestsPageWrapper,
  SkillBuilderPage,
  SkillOptimizerPage,
  DescriptionOptimizerPage,
  SkillContentOptimizerPage,
  SharedSkillPage,
} from './pages/SkillPages.js';
import {
  ProfilePageWrapper,
  OrganizationSettingsPage,
} from './pages/SettingsPages.js';
import { MySubmissionsPage } from './pages/MySubmissionsPage.js';
import { MarketplaceDetailPage } from './pages/MarketplaceDetailPage.js';
import AdminSkillReviewPage from './components/admin/AdminSkillReviewPage.js';

// Lazy-loaded marketplace pages
const MarketplaceHomePage = lazy(() => import('./pages/MarketplaceHomePage.js'));
const MarketplaceBrowsePage = lazy(() => import('./pages/MarketplaceBrowsePage.js'));
const MarketplaceFavoritesPage = lazy(() => import('./pages/MarketplaceFavoritesPage.js'));

// Redirect component for old /marketplace/:skillId URLs
function MarketplaceSkillRedirect() {
  const { skillId } = useParams<{ skillId: string }>();
  return <Navigate to={`/browse/${skillId}`} replace />;
}

export const router = createBrowserRouter([
  // ── Public routes (no auth required, no redirect if authenticated) ──
  { path: '/server-error', element: <ServerErrorPage /> },
  { path: '/sso-callback', element: <SsoCallbackPage /> },
  { path: '/invite/:token', element: <AcceptInvitePage /> },

  // ── Public-only routes (redirect away if authenticated) ──
  {
    element: <PublicRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/setup', element: <SetupWizard /> },
    ],
  },

  // ── Protected routes (require auth) ──
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AuthenticatedLayout />,
        children: [
          // Home (Marketplace Homepage, lazy)
          {
            index: true,
            element: (
              <MarketplaceRouteGuard>
                <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /></div>}>
                  <MarketplaceHomePage />
                </Suspense>
              </MarketplaceRouteGuard>
            ),
          },

          // Skills (unversioned = latest version)
          { path: 'skills', element: <SkillsGridPage /> },
          { path: 'skills/:skillId', element: <SkillDetailPage /> },
          { path: 'skills/:skillId/tests', element: <SkillTestsPageWrapper /> },

          // Skills (versioned = pinned version, e.g. /skills/v3/:skillId)
          { path: 'skills/:version/:skillId', element: <SkillDetailPage /> },
          { path: 'skills/:version/:skillId/tests', element: <SkillTestsPageWrapper /> },

          // Shared skill (read-only, any authenticated same-org user)
          { path: 'skills/share/:skillId/:version', element: <SharedSkillPage /> },

          // Builder & Optimizer
          { path: 'builder', element: <SkillBuilderPage /> },
          { path: 'optimizer/:skillId', element: <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /></div>}><SkillOptimizerPage /></Suspense> },
          { path: 'skills/:skillId/optimize-description', element: <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /></div>}><DescriptionOptimizerPage /></Suspense> },
          { path: 'skills/:skillId/auto-optimize', element: <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /></div>}><SkillContentOptimizerPage /></Suspense> },

          // Browse (All Skills, lazy)
          {
            path: 'browse',
            element: (
              <MarketplaceRouteGuard>
                <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /></div>}>
                  <MarketplaceBrowsePage />
                </Suspense>
              </MarketplaceRouteGuard>
            ),
          },

          // Skill detail page (browse path)
          {
            path: 'browse/:skillId',
            element: (
              <MarketplaceRouteGuard>
                <MarketplaceDetailPage />
              </MarketplaceRouteGuard>
            ),
          },

          // Favorites (lazy)
          {
            path: 'favorites',
            element: (
              <MarketplaceRouteGuard>
                <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /></div>}>
                  <MarketplaceFavoritesPage />
                </Suspense>
              </MarketplaceRouteGuard>
            ),
          },

          // Keep My Submissions (existing URL unchanged)
          {
            path: 'marketplace/my-submissions',
            element: (
              <MarketplaceRouteGuard>
                <MySubmissionsPage />
              </MarketplaceRouteGuard>
            ),
          },

          // Backward-compat redirects — MUST come after marketplace/my-submissions
          { path: 'marketplace', element: <Navigate to="/" replace /> },
          { path: 'marketplace/:skillId', element: <MarketplaceSkillRedirect /> },

          // Settings
          { path: 'profile/:section?/:subsection?', element: <ProfilePageWrapper /> },

          // Admin-only settings (role-guarded at router level)
          {
            element: <AdminRoute />,
            children: [
              { path: 'admin/organization/:section?', element: <OrganizationSettingsPage /> },
              { path: 'admin/review/:submissionId', element: <AdminSkillReviewPage /> },
            ],
          },
        ],
      },
    ],
  },

  // ── 404 catch-all ──
  { path: '*', element: <NotFoundPage /> },
]);
