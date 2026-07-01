/**
 * Auth SDK — client-side token management for SkillSpell.
 *
 * Handles:
 * - Access token held in-memory only (never persisted — XSS cannot exfiltrate it)
 * - Refresh token stored server-side in httpOnly cookie (XSS-safe)
 * - Silent session restore on boot via the refresh cookie (restoreSession)
 * - Auto-refresh of expired access tokens
 * - Auth state change subscriptions
 * - User info decoded from JWT payload (no full User object stored)
 *
 * Security note: the access token is deliberately kept in a module-scoped
 * in-memory variable, never in localStorage/sessionStorage. On page reload the
 * in-memory token is gone, so restoreSession() exchanges the httpOnly refresh
 * cookie for a fresh access token before any authenticated request runs.
 *
 * Usage:
 *   import { authSDK } from './auth-sdk';
 *   const user = await authSDK.restoreSession();
 *   const loggedIn = await authSDK.login(email, password);
 *   const token = await authSDK.getAccessToken();
 *   authSDK.onAuthChange((user) => { ... });
 */

import type { AuthUser, LoginResponse, SetupRequest } from '@skillspell/shared';

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * In-memory session state. Never persisted to localStorage/sessionStorage —
 * the access token must remain inaccessible to injected scripts (XSS). The
 * refresh token lives only in an httpOnly cookie managed by the backend.
 */
interface AuthState {
  accessToken: string;
  /** Epoch ms when the access token expires (decoded from JWT `exp`). */
  expiresAt: number;
}

type AuthChangeCallback = (user: AuthUser | null) => void;

// ─── Constants ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'skillspell_auth';
/**
 * API base URL. In dev mode, Vite injects the full backend URL
 * (e.g. "http://api.skillspell.localhost:1355/api").
 * In production, this resolves to "/api" (same-origin).
 */
const API_BASE = `${__BACKEND_URL__}/api`;
/** Refresh the token if it expires within this many ms. */
const REFRESH_BUFFER_MS = 60_000;

// ─── Storage helpers ─────────────────────────────────────────────────────

/**
 * Remove any access token persisted by a previous version of the SDK.
 *
 * Earlier builds stored the access token in localStorage (with a
 * sessionStorage fallback). The token is now held in memory only, so on boot
 * we proactively wipe any stale persisted token to close the XSS exposure for
 * users upgrading from an older build.
 */
function clearLegacyStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// ─── JWT helpers ─────────────────────────────────────────────────────────

/** Decode the payload from a JWT without a library. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    // Convert base64url → base64, add padding
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Extract the `exp` claim from a JWT (epoch ms). */
function getTokenExpiry(token: string): number {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return 0;
  return (payload.exp as number) * 1000;
}

/** Extract AuthUser from a JWT payload. */
function getUserFromToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.sub !== 'string') return null;
  return {
    id: payload.sub as string,
    email: (payload.email as string) ?? '',
    firstName: (payload.firstName as string) ?? '',
    lastName: (payload.lastName as string) ?? '',
    role: (payload.role as AuthUser['role']) ?? 'user',
  };
}

// ─── API helpers (internal, no auth header — used for auth endpoints) ────

/** Error class for auth SDK requests with status and error code info. */
export class AuthApiError extends Error {
  readonly statusCode: number;
  readonly errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.name = 'AuthApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/** Sentinel error code returned by the backend SetupGuard when setup is incomplete. */
export const SETUP_REQUIRED_ERROR = 'SETUP_REQUIRED';

async function authRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    // Include credentials so httpOnly cookies are sent/received
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const obj = body as Record<string, unknown>;
    const message = obj.message
      ? String(obj.message)
      : `Request failed with status ${res.status}`;
    const errorCode = typeof obj.errorCode === 'string' ? obj.errorCode : undefined;
    throw new AuthApiError(message, res.status, errorCode);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── Auth SDK Class ──────────────────────────────────────────────────────

class AuthSDK {
  private state: AuthState | null = null;
  private listeners: Set<AuthChangeCallback> = new Set();
  private refreshPromise: Promise<string> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private checkSessionPromise: Promise<{ setupRequired: boolean; user: AuthUser | null }> | null = null;
  /** Full user object from API responses (login, setup, checkSession). */
  private fullUser: AuthUser | null = null;
  /** Tracks the initial session restoration on app boot. Gates getAccessToken() until complete. */
  private restorePromise: Promise<AuthUser | null> | null = null;

  /**
   * Restore a session on app startup using the httpOnly refresh cookie.
   *
   * The access token is never persisted, so on a cold load there is nothing in
   * memory. This exchanges the refresh cookie for a fresh access token (the
   * backend reads the cookie and, with no Authorization header, falls back to
   * the refresh-token path — see auth.service.ts refreshTokens()).
   *
   * Call once on app startup, before any authenticated request. Returns the
   * AuthUser if the cookie is valid, or null if there is no live session.
   *
   * Concurrent calls to getAccessToken() will wait for this restoration to
   * complete before proceeding, preventing 401 errors during session restore.
   */
  async restoreSession(): Promise<AuthUser | null> {
    // Deduplicate concurrent restores (e.g. React StrictMode double-mount).
    if (this.restorePromise) return this.restorePromise;

    this.restorePromise = this._doRestoreSession().finally(() => {
      this.restorePromise = null;
    });
    return this.restorePromise;
  }

  private async _doRestoreSession(): Promise<AuthUser | null> {
    // Wipe any access token left in storage by an older build (XSS hardening).
    clearLegacyStorage();

    try {
      const response = await authRequest<{ accessToken: string }>(
        `${API_BASE}/auth/refresh`,
        {
          method: 'POST',
          // No Authorization header — the refresh cookie carries the identity.
          body: JSON.stringify({}),
        },
      );
      this.setSession(response.accessToken);
      return getUserFromToken(response.accessToken);
    } catch {
      // No valid refresh cookie (or it expired) — not authenticated.
      return null;
    }
  }

  /**
   * Check the current session and setup status in a single call.
   *
   * Attempts to call /api/auth/me:
   * - If it returns 200 → user is authenticated, setup is complete
   * - If it returns 401 → user is not authenticated, but setup is complete
   * - If it returns 503 with SETUP_REQUIRED → setup is not complete
   * - If it throws a network error → server is unreachable
   *
   * Returns { setupRequired, user }.
   */
  async checkSession(): Promise<{ setupRequired: boolean; user: AuthUser | null }> {
    // Deduplicate concurrent calls (e.g. React StrictMode double-mount).
    // If a check is already in-flight, return the same promise — one network request.
    if (this.checkSessionPromise) return this.checkSessionPromise;
    this.checkSessionPromise = this._doCheckSession().finally(() => {
      this.checkSessionPromise = null;
    });
    return this.checkSessionPromise;
  }

  private async _doCheckSession(): Promise<{ setupRequired: boolean; user: AuthUser | null }> {
    // If we don't have a stored token, we still need to know if setup is required.
    // Call a lightweight guarded endpoint that goes through SetupGuard.
    // /api/auth/me is protected (requires JWT) and goes through SetupGuard,
    // so it will return:
    //   - 503 SETUP_REQUIRED if setup is not done
    //   - 401 if setup is done but user is not authenticated
    //   - 200 + user if setup is done and user is authenticated
    const token = this.state?.accessToken;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/auth/me`, {
        headers,
        credentials: 'include',
      });

      if (res.ok) {
        // Authenticated — update session with fresh user data
        const user = await res.json() as AuthUser;
        this.fullUser = user;
        return { setupRequired: false, user };
      }

      // Parse error body for errorCode
      const body = await res.json().catch(() => ({}));
      const obj = body as Record<string, unknown>;
      const errorCode = typeof obj.errorCode === 'string' ? obj.errorCode : undefined;

      if (res.status === 503 && errorCode === SETUP_REQUIRED_ERROR) {
        return { setupRequired: true, user: null };
      }

      if (res.status === 401) {
        // Setup is complete, but user is not authenticated (or token expired)
        // Try to refresh the token if we have a stored session
        if (this.state) {
          try {
            await this.refreshAccessToken();
            this.notifyListeners();
            this.scheduleRefresh();
            // After refresh, try /me again
            const retryRes = await fetch(`${API_BASE}/auth/me`, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.state.accessToken}`,
              },
              credentials: 'include',
            });
            if (retryRes.ok) {
              const user = await retryRes.json() as AuthUser;
              this.fullUser = user;
              return { setupRequired: false, user };
            }
          } catch {
            // Refresh failed — session is invalid
            this.clearSession();
          }
        }
        return { setupRequired: false, user: null };
      }

      // Any other error — treat as server error
      throw new AuthApiError(
        typeof obj.message === 'string' ? obj.message : `Server returned ${res.status}`,
        res.status,
        errorCode,
      );
    } catch (error) {
      // Re-throw AuthApiError (already handled)
      if (error instanceof AuthApiError) throw error;
      // Network error — server unreachable
      throw new Error(
        error instanceof Error
          ? `Network error: ${error.message}`
          : 'Network error: unable to reach the server',
      );
    }
  }

  /**
   * Check if SAML SSO is available.
   */
  async getSsoStatus(): Promise<{
    samlEnabled: boolean;
    oidcEnabled: boolean;
    activeSsoProtocol: 'saml' | 'oidc' | null;
    passwordLoginEnabled: boolean;
    samlProviderName?: string;
    samlIconUrl?: string;
  }> {
    return authRequest<{
      samlEnabled: boolean;
      oidcEnabled: boolean;
      activeSsoProtocol: 'saml' | 'oidc' | null;
      passwordLoginEnabled: boolean;
      samlProviderName?: string;
      samlIconUrl?: string;
    }>(`${API_BASE}/auth/sso-status`);
  }

  /**
   * First-run setup — create the initial admin user.
   * The refresh token is set as an httpOnly cookie by the backend.
   */
  async setup(data: SetupRequest): Promise<AuthUser> {
    const response = await authRequest<LoginResponse>(
      `${API_BASE}/auth/setup`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );

    this.fullUser = response.user as AuthUser;
    this.setSession(response.accessToken);
    return this.fullUser;
  }

  /**
   * Login with email and password.
   * The refresh token is set as an httpOnly cookie by the backend.
   */
  async login(email: string, password: string): Promise<AuthUser> {
    const response = await authRequest<LoginResponse>(
      `${API_BASE}/auth/login`,
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );

    this.fullUser = response.user as AuthUser;
    this.setSession(response.accessToken);
    return this.fullUser;
  }

  /**
   * Get the current access token, auto-refreshing if expired or near expiry.
   * Returns null if not authenticated.
   *
   * On app startup, waits for the initial session restoration to complete
   * before returning, ensuring a consistent state for all requests.
   *
   * @param forceRefresh  When true, skip the expiry check and always refresh.
   */
  async getAccessToken(forceRefresh = false): Promise<string | null> {
    // Gate on initial session restoration. This ensures that on page load,
    // any request that tries to get a token will wait for the refresh cookie
    // exchange to complete, instead of immediately failing with a missing token.
    if (this.restorePromise) {
      await this.restorePromise;
    }

    if (!this.state) return null;

    if (!forceRefresh) {
      const now = Date.now();
      // If token is still valid (with buffer), return it
      if (this.state.expiresAt - now > REFRESH_BUFFER_MS) {
        return this.state.accessToken;
      }
    }

    // Token is expired or near expiry — refresh it
    try {
      return await this.refreshAccessToken();
    } catch {
      // Refresh failed — if the token is known expired, return null so
      // callers get a clear signal instead of a dead token that will 401.
      // We do NOT clear the session here so that a transient refresh
      // failure doesn't immediately destroy the user's session.
      if (this.state && this.state.expiresAt <= Date.now()) {
        return null;
      }
      return this.state?.accessToken ?? null;
    }
  }

  /**
   * Get the cached user profile (decoded from the JWT).
   */
  getUser(): AuthUser | null {
    if (!this.state) return null;
    return this.fullUser ?? getUserFromToken(this.state.accessToken);
  }

  /**
   * Check if the user is authenticated.
   */
  isAuthenticated(): boolean {
    return this.state !== null;
  }

  /**
   * Logout — revoke refresh token server-side (via cookie) and clear local storage.
   */
  async logout(): Promise<void> {
    if (this.state) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.state.accessToken}`,
          },
          // Include credentials so the httpOnly refresh token cookie is sent
          credentials: 'include',
          body: JSON.stringify({}),
        });
      } catch {
        // Ignore errors — we're logging out anyway
      }
    }

    this.clearSession();
  }

  /**
   * Subscribe to auth state changes (login/logout/token refresh).
   * Returns an unsubscribe function.
   */
  onAuthChange(callback: AuthChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get the redirect URL for SAML SSO login.
   */
  getSamlLoginUrl(): string {
    return `${API_BASE}/auth/saml/login`;
  }

  /**
   * Get the redirect URL for OIDC SSO login.
   */
  getOidcLoginUrl(): string {
    return `${API_BASE}/auth/oidc/login`;
  }

  /**
   * Handle SSO callback — store the access token received from the
   * SAML redirect and notify listeners.
   *
   * Called by the /sso-callback page after reading the token from
   * the URL fragment hash.
   */
  handleSsoCallback(accessToken: string): AuthUser | null {
    if (!accessToken || accessToken.split('.').length !== 3) return null;
    if (getTokenExpiry(accessToken) <= Date.now()) return null;
    this.setSession(accessToken);
    return getUserFromToken(accessToken);
  }

  // ─── Internal methods ────────────────────────────────────────────────

  private setSession(accessToken: string): void {
    const expiresAt = getTokenExpiry(accessToken);
    // In-memory only — never persisted to storage (XSS hardening).
    this.state = { accessToken, expiresAt };
    this.notifyListeners();
    this.scheduleRefresh();
  }

  private clearSession(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.state = null;
    this.fullUser = null;
    // Defensively clear any token left by an older build.
    clearLegacyStorage();
    this.notifyListeners();
  }

  /**
   * Refresh the access token using the httpOnly refresh token cookie.
   * De-duplicates concurrent refresh requests.
   */
  private async refreshAccessToken(): Promise<string> {
    // If a refresh is already in flight, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<string> {
    if (!this.state) {
      throw new Error('No session to refresh');
    }

    // The refresh token is sent automatically via the httpOnly cookie.
    // We only need to send the expired access token in the Authorization header
    // so the backend can extract the userId.
    const response = await authRequest<{
      accessToken: string;
    }>(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.state.accessToken}`,
      },
      // credentials: 'include' is already set in authRequest
      body: JSON.stringify({}),
    });

    const expiresAt = getTokenExpiry(response.accessToken);
    // In-memory only — never persisted to storage (XSS hardening).
    this.state = {
      accessToken: response.accessToken,
      expiresAt,
    };
    this.scheduleRefresh();
    this.notifyListeners();

    return response.accessToken;
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (!this.state) return;
    const delay = this.state.expiresAt - Date.now() - REFRESH_BUFFER_MS;
    if (delay <= 0) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshAccessToken().catch(() => {});
    }, delay);
  }

  private notifyListeners(): void {
    const user = this.getUser();
    for (const listener of this.listeners) {
      try {
        listener(user);
      } catch {
        // Don't let listener errors break the SDK
      }
    }
  }
}

/** Singleton Auth SDK instance. */
export const authSDK = new AuthSDK();
export type { AuthState, AuthUser };
