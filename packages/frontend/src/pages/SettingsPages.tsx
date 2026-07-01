/**
 * Route wrappers for settings pages (Profile & Organization).
 *
 * These wrappers read route params via useParams() instead of
 * manual URL parsing, eliminating the window.history.pushState
 * calls that previously existed in the components.
 */

import { useNavigate, useParams } from 'react-router';
import ProfilePage from '../components/profile/ProfilePage.js';
import type { ProfileSection } from '../components/profile/ProfilePage.js';
import OrganizationSettings from '../components/admin/OrganizationSettings.js';

// ─── Profile Page ───────────────────────────────────────────────────────

const VALID_PROFILE_SECTIONS = ['details', 'password', 'security', 'preferences'] as const;
const VALID_SECURITY_SUBSECTIONS = ['password', 'tokens'] as const;

export type SecuritySubsection = (typeof VALID_SECURITY_SUBSECTIONS)[number];

export function ProfilePageWrapper() {
  const navigate = useNavigate();
  const { section, subsection } = useParams<{ section?: string; subsection?: string }>();

  const validSection: ProfileSection = VALID_PROFILE_SECTIONS.includes(
    section as ProfileSection,
  )
    ? (section as ProfileSection)
    : 'details';

  const validSubsection: SecuritySubsection = VALID_SECURITY_SUBSECTIONS.includes(
    subsection as SecuritySubsection,
  )
    ? (subsection as SecuritySubsection)
    : 'password';

  return (
    <ProfilePage
      onBack={() => navigate('/')}
      initialSection={validSection}
      initialSubsection={validSubsection}
    />
  );
}

// ─── Organization Settings ──────────────────────────────────────────────

export function OrganizationSettingsPage() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();

  const validSection = (
    ['general', 'sso', 'smtp', 'members', 'taxonomy', 'marketplace-submissions', 'marketplace-settings', 'analytics'] as const
  ).includes(section as 'general' | 'sso' | 'smtp' | 'members' | 'taxonomy' | 'marketplace-submissions' | 'marketplace-settings' | 'analytics')
    ? (section as 'general' | 'sso' | 'smtp' | 'members' | 'taxonomy' | 'marketplace-submissions' | 'marketplace-settings' | 'analytics')
    : 'general';

  return (
    <OrganizationSettings
      onBack={() => navigate('/')}
      initialSection={validSection}
    />
  );
}
