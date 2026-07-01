/**
 * Profile page — left settings menu + right content panel.
 *
 * Sections:
 *   /profile/details              — Account details
 *   /profile/security/password    — Change password (sub-item under Security)
 *   /profile/security/tokens      — Personal access tokens (sub-item under Security)
 *   /profile/preferences          — Timezone and date format
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth.js';
import SecuritySection from './tokens/SecuritySection.js';
import type { SecurityView } from './tokens/SecuritySection.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import type { DateFormat } from '../../hooks/useUserPreferences.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';

// ─── Types ───────────────────────────────────────────────────────────────

export type ProfileSection = 'details' | 'password' | 'security' | 'preferences';

interface ProfilePageProps {
  onBack: () => void;
  initialSection?: ProfileSection;
  initialSubsection?: SecurityView;
}

interface MenuItem {
  key: ProfileSection;
  label: string;
  icon: React.ReactNode;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: 'details',
    label: 'Account Details',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
  },
  {
    key: 'security',
    label: 'Security',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    key: 'preferences',
    label: 'Preferences',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
];

const SECURITY_SUB_ITEMS: { key: SecurityView; label: string }[] = [
  { key: 'password', label: 'Change Password' },
  { key: 'tokens',   label: 'Personal Tokens' },
];

// ─── Main Component ──────────────────────────────────────────────────────

export default function ProfilePage({
  onBack,
  initialSection = 'details',
  initialSubsection = 'password',
}: ProfilePageProps) {
  const { user: authUser } = useAuth();
  const navigate = useNavigate();

  const [section, setSection] = useState<ProfileSection>(initialSection);
  const [subsection, setSubsection] = useState<SecurityView>(initialSubsection);

  // Keep section/subsection in sync on browser navigation
  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => { setSubsection(initialSubsection); }, [initialSubsection]);

  const navigateSection = useCallback((s: ProfileSection) => {
    setSection(s);
    if (s === 'security') {
      navigate(`/profile/security/${subsection}`, { replace: true });
    } else {
      navigate(`/profile/${s}`, { replace: true });
    }
  }, [navigate, subsection]);

  const navigateSubsection = useCallback((sub: SecurityView) => {
    setSection('security');
    setSubsection(sub);
    navigate(`/profile/security/${sub}`, { replace: true });
  }, [navigate]);

  const initials = authUser
    ? `${authUser.firstName.charAt(0)}${authUser.lastName.charAt(0)}`.toUpperCase()
    : '';

  return (
    <div className="flex h-full animate-fade-in-up">
      {/* ─── Left Settings Menu ─────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-slate-200/80 bg-white px-3 py-6">
        <div className="mb-6 flex items-center gap-2 px-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Go back"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-slate-800">Settings</h2>
        </div>

        <nav className="space-y-0.5">
          {MENU_ITEMS.map((item) => {
            const isActive = section === item.key;
            return (
              <div key={item.key}>
                <button
                  type="button"
                  onClick={() => navigateSection(item.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <span className={isActive ? 'text-indigo-500' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>

                {/* Security sub-items */}
                {item.key === 'security' && isActive && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-indigo-100 pl-3">
                    {SECURITY_SUB_ITEMS.map((sub) => (
                      <button
                        key={sub.key}
                        type="button"
                        onClick={() => navigateSubsection(sub.key)}
                        className={`flex w-full items-center rounded-lg px-2 py-1.5 text-sm transition-all duration-150 ${
                          subsection === sub.key
                            ? 'text-indigo-700 font-medium'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ─── Right Content Panel ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {section === 'details' && (
          <div className="mx-auto max-w-xl">
            <DetailsSection
              authUser={authUser}
              initials={initials}
            />
          </div>
        )}

        {(section === 'security' || section === 'password') && (
          <SecuritySection view={section === 'password' ? 'password' : subsection} />
        )}

        {section === 'preferences' && (
          <div className="mx-auto max-w-xl">
            <PreferencesSection />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Details Section ─────────────────────────────────────────────────────

interface DetailsSectionProps {
  authUser: { firstName: string; lastName: string; email: string; role: string; createdAt?: string } | null;
  initials: string;
}

function DetailsSection({ authUser, initials }: DetailsSectionProps) {
  const { prefs } = useUserPreferences();

  return (
    <>
      <h1 className="mb-6 text-xl font-bold text-slate-800">Account Details</h1>

      <div className="mb-8 flex items-center gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-bold text-white shadow-lg shadow-indigo-500/20">
          {initials}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-800">
            {authUser?.firstName} {authUser?.lastName}
          </p>
          <p className="text-sm text-slate-500">{authUser?.email}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <dl className="space-y-5">
          <div className="grid grid-cols-2 gap-6">
            <DetailField label="First Name" value={authUser?.firstName ?? '—'} />
            <DetailField label="Last Name" value={authUser?.lastName ?? '—'} />
          </div>
          <DetailField label="Email Address" value={authUser?.email ?? '—'} />
          <div className="grid grid-cols-2 gap-6">
            <DetailField label="Role" value={authUser?.role ?? '—'} />
            <DetailField
              label="Member Since"
              value={authUser?.createdAt ? formatDateWithPrefs(authUser.createdAt, prefs) : '—'}
            />
          </div>
        </dl>
      </div>
    </>
  );
}

// ─── Preferences Section ──────────────────────────────────────────────────

const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY  (e.g. 31/01/2025)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY  (e.g. 01/31/2025)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD  (e.g. 2025-01-31)' },
];

function PreferencesSection() {
  const { prefs, saving, save } = useUserPreferences();
  const [timezone, setTimezone] = useState(prefs.timezone);
  const [dateFormat, setDateFormat] = useState<DateFormat>(prefs.dateFormat);
  const [saved, setSaved] = useState(false);

  // Keep local state in sync if prefs load after mount
  useEffect(() => { setTimezone(prefs.timezone); }, [prefs.timezone]);
  useEffect(() => { setDateFormat(prefs.dateFormat); }, [prefs.dateFormat]);

  const allTimezones = Intl.supportedValuesOf('timeZone');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await save({ timezone, dateFormat });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <h1 className="mb-6 text-xl font-bold text-slate-800">Preferences</h1>

      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <form onSubmit={handleSave} className="space-y-5">
          {/* Timezone */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="pref-timezone">
              Timezone
            </label>
            <select
              id="pref-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {allTimezones.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Dates in the app will display in this timezone.
            </p>
          </div>

          {/* Date format */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="pref-dateformat">
              Date Format
            </label>
            <select
              id="pref-dateformat"
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as DateFormat)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {DATE_FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Preferences'}
            </button>
            {saved && (
              <span className="text-sm text-emerald-600 font-medium">Saved</span>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Helper ──────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
