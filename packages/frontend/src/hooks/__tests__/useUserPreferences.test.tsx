// @vitest-environment jsdom
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useUserPreferences, PreferencesProvider } from '../useUserPreferences.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdateProfile = vi.fn().mockResolvedValue({});
vi.mock('../../services/api/index.js', () => ({
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

// useAuth returns whatever mockUser holds
let mockUser: { id: string; timezone?: string; dateFormat?: string } | null = null;
vi.mock('../useAuth.js', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Consumer() {
  const { prefs } = useUserPreferences();
  return (
    <div>
      <span data-testid="tz">{prefs.timezone}</span>
      <span data-testid="fmt">{prefs.dateFormat}</span>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <PreferencesProvider>
      <Consumer />
    </PreferencesProvider>,
  );
}

function storageKey(userId: string) {
  return `skillspell_prefs_${userId}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PreferencesProvider', () => {
  beforeEach(() => {
    mockUser = null;
    mockUpdateProfile.mockReset();
    mockUpdateProfile.mockResolvedValue({});
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── No API calls ─────────────────────────────────────────────────────────

  it('never calls getProfile — prefs come from the auth user object directly', async () => {
    mockUser = { id: 'user-1', timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY' };
    renderWithProvider();
    await act(async () => {});
    // updateProfile should not be called just to read prefs
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  // ── Default prefs ────────────────────────────────────────────────────────

  it('renders default prefs when no user is logged in', () => {
    mockUser = null;
    renderWithProvider();
    expect(screen.getByTestId('fmt').textContent).toBe('DD/MM/YYYY');
  });

  it('renders default dateFormat when user has no dateFormat set', async () => {
    mockUser = { id: 'user-1', timezone: 'Europe/London' };
    renderWithProvider();
    await act(async () => {});
    expect(screen.getByTestId('fmt').textContent).toBe('DD/MM/YYYY');
    expect(screen.getByTestId('tz').textContent).toBe('Europe/London');
  });

  // ── Prefs from auth user ─────────────────────────────────────────────────

  it('applies timezone and dateFormat from the auth user object', async () => {
    mockUser = { id: 'user-1', timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY' };
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('fmt').textContent).toBe('MM/DD/YYYY');
      expect(screen.getByTestId('tz').textContent).toBe('America/New_York');
    });
  });

  it('writes auth user prefs to localStorage for cold-start cache', async () => {
    mockUser = { id: 'user-1', timezone: 'Australia/Sydney', dateFormat: 'DD/MM/YYYY' };
    renderWithProvider();
    await act(async () => {});
    const stored = JSON.parse(localStorage.getItem(storageKey('user-1'))!);
    expect(stored.timezone).toBe('Australia/Sydney');
    expect(stored.dateFormat).toBe('DD/MM/YYYY');
  });

  it('serves localStorage cache instantly before auth user resolves', () => {
    localStorage.setItem(
      storageKey('user-cached'),
      JSON.stringify({ timezone: 'Asia/Tokyo', dateFormat: 'YYYY-MM-DD' }),
    );
    // user is set synchronously — localStorage is read before effect fires
    mockUser = { id: 'user-cached' };
    renderWithProvider();
    // Initial render uses localStorage (no tz/dateFormat on user yet)
    expect(screen.getByTestId('tz').textContent).toBe('Asia/Tokyo');
    expect(screen.getByTestId('fmt').textContent).toBe('YYYY-MM-DD');
  });

  // ── Logout / re-login ────────────────────────────────────────────────────

  it('resets prefs to defaults when user logs out', async () => {
    mockUser = { id: 'user-1', timezone: 'America/Chicago', dateFormat: 'MM/DD/YYYY' };
    const { rerender } = renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('fmt').textContent).toBe('MM/DD/YYYY'));

    mockUser = null;
    rerender(<PreferencesProvider><Consumer /></PreferencesProvider>);
    expect(screen.getByTestId('fmt').textContent).toBe('DD/MM/YYYY');
  });

  it('picks up new user prefs on re-login without any API call', async () => {
    mockUser = { id: 'user-1', timezone: 'UTC', dateFormat: 'DD/MM/YYYY' };
    const { rerender } = renderWithProvider();
    await act(async () => {});

    mockUser = null;
    rerender(<PreferencesProvider><Consumer /></PreferencesProvider>);

    mockUser = { id: 'user-2', timezone: 'Asia/Seoul', dateFormat: 'YYYY-MM-DD' };
    rerender(<PreferencesProvider><Consumer /></PreferencesProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('tz').textContent).toBe('Asia/Seoul');
      expect(screen.getByTestId('fmt').textContent).toBe('YYYY-MM-DD');
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('does not mix prefs between different users', async () => {
    localStorage.setItem(
      storageKey('user-1'),
      JSON.stringify({ timezone: 'Europe/Paris', dateFormat: 'DD/MM/YYYY' }),
    );
    mockUser = { id: 'user-2', timezone: 'America/Toronto', dateFormat: 'MM/DD/YYYY' };
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('fmt').textContent).toBe('MM/DD/YYYY');
      expect(screen.getByTestId('tz').textContent).toBe('America/Toronto');
    });
  });

  // ── Pref updates react to user object changes ────────────────────────────

  it('updates prefs when user.timezone changes (e.g. after profile save)', async () => {
    mockUser = { id: 'user-1', timezone: 'UTC', dateFormat: 'DD/MM/YYYY' };
    const { rerender } = renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('tz').textContent).toBe('UTC'));

    mockUser = { id: 'user-1', timezone: 'Pacific/Auckland', dateFormat: 'DD/MM/YYYY' };
    rerender(<PreferencesProvider><Consumer /></PreferencesProvider>);
    await waitFor(() => expect(screen.getByTestId('tz').textContent).toBe('Pacific/Auckland'));
  });

  // ── save() ───────────────────────────────────────────────────────────────

  it('save() persists to backend via updateProfile and updates context', async () => {
    mockUser = { id: 'user-1', timezone: 'UTC', dateFormat: 'DD/MM/YYYY' };

    function SaveConsumer() {
      const { prefs, save } = useUserPreferences();
      return (
        <div>
          <span data-testid="fmt">{prefs.dateFormat}</span>
          <button type="button" onClick={() => save({ dateFormat: 'MM/DD/YYYY' })}>save</button>
        </div>
      );
    }

    render(<PreferencesProvider><SaveConsumer /></PreferencesProvider>);
    await act(async () => {});

    await act(async () => {
      screen.getByRole('button', { name: 'save' }).click();
    });

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ dateFormat: 'MM/DD/YYYY' }),
    );
    expect(screen.getByTestId('fmt').textContent).toBe('MM/DD/YYYY');
  });

  it('save() writes updated prefs to localStorage', async () => {
    mockUser = { id: 'user-1', timezone: 'UTC', dateFormat: 'DD/MM/YYYY' };

    function SaveConsumer() {
      const { save } = useUserPreferences();
      return <button type="button" onClick={() => save({ timezone: 'America/Denver' })}>save</button>;
    }

    render(<PreferencesProvider><SaveConsumer /></PreferencesProvider>);
    await act(async () => {});
    await act(async () => { screen.getByRole('button', { name: 'save' }).click(); });

    const stored = JSON.parse(localStorage.getItem(storageKey('user-1'))!);
    expect(stored.timezone).toBe('America/Denver');
  });

  // ── useUserPreferences outside provider ──────────────────────────────────

  it('throws when used outside PreferencesProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow('useUserPreferences must be used within PreferencesProvider');
    consoleError.mockRestore();
  });
});
