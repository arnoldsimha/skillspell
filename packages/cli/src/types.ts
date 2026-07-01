// Re-export from shared — type-only, no runtime dep
export type ExportFormat = 'claude' | 'cursor' | 'windsurf' | 'copilot' | 'roo';

export interface CliConfig {
  baseUrl: string;
}

export interface PublicSkillSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  isPublished?: boolean;
}

export interface PublicSkillDownload {
  name: string;
  slug: string;
  content: string;
}

export interface CreatePatResponse {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  rawToken: string;
}

export interface PatListItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; name: string };
}

// Phase 7: SSO credential file structure (~/.skillspell/sso-credentials)
// D-01: stored as JSON after `skillspell login --sso`
// D-13: userId required by POST /api/auth/cli/refresh (token rotation needs userId)
// D-18: email shown in "Authenticated as <email>" success message
export interface SsoCredential {
  type: 'sso';
  accessToken: string;
  refreshToken: string;
  expiresAt: number;   // epoch ms — when the access token expires
  userId: string;      // from JWT sub claim; needed by /api/auth/cli/refresh
  email: string;       // from JWT email claim; shown in success/session-expired messages
}

// Phase 6: Install receipt types — D-02, D-03
export interface InstalledReceiptEntry {
  slug: string;
  target: ExportFormat;
  workspace: boolean;
  installedPath: string;
  installedAt: string;       // ISO 8601
  skillUpdatedAt: string;    // from PublicSkillSummary.updatedAt at install time
}

export type InstalledReceipt = Record<string, InstalledReceiptEntry[]>;
