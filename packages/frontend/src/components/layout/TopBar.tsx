/**
 * Authenticated top navigation bar.
 *
 * Horizontal replacement for the old left Sidebar: brand on the left,
 * three flat nav links, a prominent Create button and the user menu on
 * the right. Below `md`, the nav links collapse behind a hamburger that
 * opens a dropdown panel below the bar.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import Header from './Header.js';
import UserMenu from './UserMenu.js';
import { useAuth } from '../../hooks/useAuth.js';

interface TopBarProps {
  onCreateNew: () => void;
  onTitleClick: () => void;
  onNavigateProfile?: () => void;
  onNavigateOrgSettings?: () => void;
}

export default function TopBar({
  onCreateNew,
  onTitleClick,
  onNavigateProfile,
  onNavigateOrgSettings,
}: TopBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { organization } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLElement>(null);

  const marketplaceEnabled = organization?.marketplaceEnabled ?? true;

  const isMarketplaceActive =
    marketplaceEnabled &&
    (pathname === '/' || pathname.startsWith('/browse') || pathname.startsWith('/favorites'));
  const isAllSkillsActive = pathname.startsWith('/skills');
  const isMySubmissionsActive = marketplaceEnabled && pathname === '/marketplace/my-submissions';

  // Close the mobile dropdown on click-outside or Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileOpen]);

  const navClass = (active: boolean) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
      active
        ? 'bg-indigo-500/15 text-indigo-300'
        : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
    }`;

  const go = (path: string) => {
    setMobileOpen(false);
    navigate(path);
  };

  const navLinks = (
    <>
      {marketplaceEnabled && (
        <button type="button" onClick={() => go('/')} className={navClass(isMarketplaceActive)}>
          Marketplace
        </button>
      )}
      <button type="button" onClick={() => go('/skills')} className={navClass(isAllSkillsActive)}>
        My Skills
      </button>
      {marketplaceEnabled && (
        <button
          type="button"
          onClick={() => go('/marketplace/my-submissions')}
          className={navClass(isMySubmissionsActive)}
        >
          My Submissions
        </button>
      )}
    </>
  );

  return (
    <header
      ref={mobileRef}
      className="relative flex h-14 shrink-0 items-center gap-2 px-4"
      style={{ background: 'var(--sidebar-bg)' }}
    >
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white md:hidden"
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Brand */}
      <Header onTitleClick={onTitleClick} />

      {/* Desktop nav links */}
      <nav className="hidden md:flex md:items-center md:gap-1 md:pl-2">{navLinks}</nav>

      {/* Right zone */}
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onCreateNew}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="hidden sm:inline">Create / Upload Skill</span>
        </button>
        <UserMenu onNavigateProfile={onNavigateProfile} onNavigateOrgSettings={onNavigateOrgSettings} />
      </div>

      {/* Mobile dropdown panel */}
      {mobileOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-px w-56 rounded-b-xl border-b border-white/[0.08] py-2 shadow-xl md:hidden"
          style={{ background: 'var(--sidebar-bg)' }}
        >
          <nav className="flex flex-col gap-0.5 px-2">{navLinks}</nav>
        </div>
      )}
    </header>
  );
}
