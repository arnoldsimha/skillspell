/**
 * User display preferences — timezone and date format.
 *
 * Architecture: PreferencesProvider reads timezone + dateFormat directly from
 * the AuthUser already in the auth context (populated by checkSession's single
 * /auth/me call). No additional API calls are made.
 *
 * localStorage is used as a cold-start cache so components render with the
 * last-known prefs before the auth context resolves.
 *
 * Preference lifecycle:
 *   - Page load     → read from localStorage (instant), then sync from user
 *   - Login         → sync from user object (user.id changes)
 *   - Logout        → reset to defaults (user becomes null)
 *   - save()        → update context + localStorage + persist to backend
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth.js';
import { updateProfile } from '../services/api/index.js';

export type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

export interface UserPreferences {
  timezone: string;
  dateFormat: DateFormat;
}

interface PreferencesContextValue {
  prefs: UserPreferences;
  saving: boolean;
  save: (next: Partial<UserPreferences>) => Promise<void>;
}

const DEFAULT_PREFS: UserPreferences = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dateFormat: 'DD/MM/YYYY',
};

function storageKey(userId: string) {
  return `skillspell_prefs_${userId}`;
}

function readFromStorage(userId: string): UserPreferences {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeToStorage(userId: string, prefs: UserPreferences) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>(
    user ? readFromStorage(user.id) : DEFAULT_PREFS,
  );
  const [saving, setSaving] = useState(false);

  // Sync preferences from the auth user object — no extra API call needed.
  // user already contains timezone + dateFormat from the checkSession /auth/me call.
  useEffect(() => {
    if (!user) {
      setPrefs(DEFAULT_PREFS);
      return;
    }
    const merged: UserPreferences = {
      timezone: user.timezone ?? readFromStorage(user.id).timezone,
      dateFormat: (user.dateFormat as DateFormat) ?? readFromStorage(user.id).dateFormat,
    };
    writeToStorage(user.id, merged);
    setPrefs(merged);
  }, [user?.id, user?.timezone, user?.dateFormat]);

  const save = useCallback(async (next: Partial<UserPreferences>) => {
    if (!user) return;
    const merged = { ...prefs, ...next };
    setSaving(true);
    try {
      await updateProfile(merged);
      writeToStorage(user.id, merged);
      setPrefs(merged);
    } finally {
      setSaving(false);
    }
  }, [user, prefs]);

  return (
    <PreferencesContext.Provider value={{ prefs, saving, save }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function useUserPreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('useUserPreferences must be used within PreferencesProvider');
  return ctx;
}
