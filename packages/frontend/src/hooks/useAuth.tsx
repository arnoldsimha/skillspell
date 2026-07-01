/**
 * Auth context and useAuth hook.
 *
 * Wraps the Auth SDK in a React context so any component can access
 * the current user, login/logout, and auth state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authSDK } from '../services/auth-sdk.js';
import { connectStreamingSocket, closeStreamingSocket } from '../utils/streamingSocket.js';
import type { AuthUser, Organization, SetupRequest } from '@skillspell/shared';
import { getOrganization } from '../services/api/organization.js';

// ─── Context shape ───────────────────────────────────────────────────────

interface AuthContextValue {
  /** Current authenticated user (decoded from JWT), or null. */
  user: AuthUser | null;
  /** Organization data including marketplace settings. */
  organization: Organization | null;
  /** Whether the initial auth check is still loading. */
  loading: boolean;
  /** Whether the first-run setup is still required. */
  setupRequired: boolean | null;
  /** Whether the server is unreachable or returned an error during init. */
  serverError: boolean;
  /** Login with email/password. */
  login: (email: string, password: string) => Promise<void>;
  /** First-run setup. Returns the newly created AuthUser. */
  setup: (data: SetupRequest) => Promise<AuthUser>;
  /** Logout. */
  logout: () => Promise<void>;
  /** SSO status info. */
  ssoStatus: {
    samlEnabled: boolean;
    oidcEnabled: boolean;
    activeSsoProtocol: 'saml' | 'oidc' | null;
    passwordLoginEnabled: boolean;
    samlProviderName?: string;
    samlIconUrl?: string;
  } | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState(false);
  const [ssoStatus, setSsoStatus] = useState<AuthContextValue['ssoStatus']>(null);

  // True once the initial checkSession() has fully resolved. Used to prevent
  // onAuthChange from touching the socket during the session-restore flow —
  // token refresh fires notifyListeners() before /auth/me is re-confirmed,
  // which would start a WebSocket connection that gets immediately closed.
  const sessionInitialized = useRef(false);

  // Initialize on mount
  useEffect(() => {
    async function init() {
      try {
        // Exchange the httpOnly refresh cookie for a fresh in-memory access
        // token (the access token is never persisted — XSS hardening). After
        // this, checkSession() can send the JWT on /auth/me.
        await authSDK.restoreSession();

        // Single call that checks both setup status and session validity.
        // The backend's SetupGuard returns 503 SETUP_REQUIRED if setup is
        // not complete; otherwise /api/auth/me returns the user or 401.
        const { setupRequired: needsSetup, user: sessionUser } =
          await authSDK.checkSession();

        setSetupRequired(needsSetup);

        if (sessionUser) {
          setUser(sessionUser);

          // Fetch organization data once on successful authentication
          try {
            const orgResponse = await getOrganization();
            setOrganization(orgResponse.organization);
          } catch {
            // If org fetch fails, default marketplace to enabled
            setOrganization({
              id: '',
              name: '',
              passwordLoginEnabled: true,
              ssoLoginEnabled: true,
              marketplaceEnabled: true,
              marketplaceAllowSelfApproval: false,
              createdAt: '',
              updatedAt: '',
            });
          }

          connectStreamingSocket().catch(() => {}); // non-critical — stream ops will throw if they run before reconnect
        }

        // Only fetch SSO status when not authenticated (needed for login page)
        if (!needsSetup && !sessionUser) {
          try {
            const sso = await authSDK.getSsoStatus();
            setSsoStatus(sso);
          } catch {
            // SSO status check is non-critical
          }
        }
      } catch {
        // If the check fails (server unreachable / unexpected error), show
        // server error page instead of incorrectly redirecting to setup.
        setServerError(true);
      } finally {
        // Mark session check complete before releasing the loading gate so
        // onAuthChange can safely manage the socket from this point on.
        sessionInitialized.current = true;
        setLoading(false);
      }
    }

    init();
  }, []);

  // Subscribe to auth state changes (login, logout, token refresh, SSO callback).
  // Socket management is skipped during the initial session-restore flow to
  // avoid a race where token refresh fires notifyListeners() before /auth/me
  // is re-confirmed — which would open a WebSocket only to close it immediately.
  useEffect(() => {
    const unsubscribe = authSDK.onAuthChange((newUser) => {
      setUser(newUser);

      // Fetch organization when user changes (login/SSO callback/token refresh)
      if (newUser) {
        getOrganization()
          .then((orgResponse) => {
            setOrganization(orgResponse.organization);
          })
          .catch(() => {
            // Default to enabled if fetch fails
            setOrganization({
              id: '',
              name: '',
              passwordLoginEnabled: true,
              ssoLoginEnabled: true,
              marketplaceEnabled: true,
              marketplaceAllowSelfApproval: false,
              createdAt: '',
              updatedAt: '',
            });
          });
      } else {
        // Clear organization on logout
        setOrganization(null);
      }

      if (!sessionInitialized.current) return;
      if (newUser) {
        // Close any stale socket before reconnecting with the new JWT.
        // Handles login-after-logout, SSO callback, and token-refresh-issued-new-token.
        closeStreamingSocket();
        connectStreamingSocket().catch(() => {});
      } else {
        // Session cleared (explicit logout, token refresh failure, forced sign-out).
        // Disconnect immediately — don't leave an authenticated socket open.
        closeStreamingSocket();
      }
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await authSDK.login(email, password);
  }, []);

  const setup = useCallback(async (data: SetupRequest): Promise<AuthUser> => {
    const user = await authSDK.setup(data);
    setSetupRequired(false);
    return user;
  }, []);

  const logout = useCallback(async () => {
    closeStreamingSocket(); // disconnect WS before token is invalidated
    await authSDK.logout();
    // Fetch SSO status so the login page shows the SSO button immediately
    // without requiring a hard reload (ssoStatus is null during authenticated sessions).
    try {
      const sso = await authSDK.getSsoStatus();
      setSsoStatus(sso);
    } catch {
      // non-critical — login page will work without SSO button if this fails
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      organization,
      loading,
      setupRequired,
      serverError,
      login,
      setup,
      logout,
      ssoStatus,
    }),
    [user, organization, loading, setupRequired, serverError, login, setup, logout, ssoStatus],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
