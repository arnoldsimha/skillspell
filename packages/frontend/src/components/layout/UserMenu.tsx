/**
 * User avatar + name with dropdown menu in the sidebar footer.
 *
 * Shows initials circle, full name, and a dropdown with user actions.
 * Dropdown opens upward since the component sits at the bottom.
 */

import { useState, useRef, useEffect } from 'react';
import type { UserRole } from '@skillspell/shared';
import { useAuth } from '../../hooks/useAuth.js';

// Inlined to avoid importing a runtime value from the shared CJS dist (Vite requires ESM).
const ROLE_HIERARCHY: Record<UserRole, number> = { owner: 3, admin: 2, user: 1 };
const isAtLeast = (userRole: UserRole, required: UserRole) => ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[required];

interface UserMenuProps {
  onNavigateProfile?: () => void;
  onNavigateOrgSettings?: () => void;
}

export default function UserMenu({ onNavigateProfile, onNavigateOrgSettings }: UserMenuProps) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!user) return null;

  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  const fullName = `${user.firstName} ${user.lastName}`.trim();

  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Dropdown — opens downward */}
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1.5 w-56 rounded-xl border border-white/[0.08] bg-slate-800 py-1.5 shadow-xl animate-scale-in origin-top-right"
        >
          {/* Profile link */}
          {onNavigateProfile && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigateProfile();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-colors duration-150"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                />
              </svg>
              Profile
            </button>
          )}

          {/* Organization Settings (admin / owner only) */}
          {onNavigateOrgSettings && isAtLeast(user.role, 'admin') && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigateOrgSettings();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-colors duration-150"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
                />
              </svg>
              Organization
            </button>
          )}

          {/* Divider */}
          {(onNavigateProfile || (onNavigateOrgSettings && isAtLeast(user.role, 'admin'))) && (
            <div className="my-1 border-t border-white/[0.06]" />
          )}

          <button
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-red-400 hover:bg-white/[0.06] transition-colors duration-150"
          >
            {/* Logout icon */}
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
              />
            </svg>
            Sign out
          </button>
        </div>
      )}

      {/* Trigger — avatar + name */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.06] transition-colors duration-200"
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {/* Avatar circle with initials */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm">
          {initials}
        </div>
        {/* Name */}
        <span className="truncate text-sm font-medium text-slate-300">
          {fullName}
        </span>
        {/* Chevron */}
        <svg
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}
