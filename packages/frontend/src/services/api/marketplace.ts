import { request, API_BASE } from './client.js';
import { authSDK } from '../auth-sdk.js';
import type { SkillDiagram, SkillFileItem, SubmissionRequirement } from '@skillspell/shared';

const BASE = `${API_BASE}/marketplace`;
const ADMIN_BASE = `${API_BASE}/admin/marketplace`;

// --- Types -----------------------------------------------------------------

export interface MySubmission {
  id: string;
  skillId: string;
  /** Human-readable skill name resolved by the backend via skills table JOIN. */
  skillName: string;
  /** Version string -- e.g. "3". Backend sends string, not number. */
  version: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'removed';
  submittedBy: string;
  /** ISO date string */
  submittedAt: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  /** Populated for removed submissions — the reason provided by the admin. */
  removalReason: string | null;
  /** Populated for downgrade submissions — the reason provided by the submitter. */
  submitterNote: string | null;
}

// --- Submission endpoints --------------------------------------------------

/**
 * Submit a skill version to the marketplace for review.
 * @param skillId UUID of the skill
 * @param version Version string (must be String(), not number)
 * @returns The created submission
 * @throws ApiError with statusCode 409 if version is already pending_review or approved
 */
export function submitSkill(skillId: string, version: string, submitterNote?: string): Promise<MySubmission> {
  return request<MySubmission>(`${BASE}/submit`, {
    method: 'POST',
    body: JSON.stringify({ skillId, version, ...(submitterNote ? { submitterNote } : {}) }),
  });
}

/**
 * Fetch all marketplace submissions for the authenticated user.
 * Response includes skillName for each submission (resolved server-side).
 */
export function fetchMySubmissions(): Promise<MySubmission[]> {
  return request<MySubmission[]>(`${BASE}/my-submissions`);
}

/**
 * Fetch the submission eligibility requirements for a skill.
 * GET /api/marketplace/:skillId/eligibility
 */
export async function fetchSubmissionEligibility(
  skillId: string,
): Promise<SubmissionRequirement[]> {
  return request<SubmissionRequirement[]>(`${BASE}/${skillId}/eligibility`);
}

/**
 * Owner: request marketplace removal for a skill.
 * POST /api/marketplace/:skillId/request-removal
 */
export function requestMarketplaceRemoval(
  skillId: string,
  scope: 'skill' | 'version',
  targetSubmissionId?: string,
  reason?: string,
): Promise<void> {
  return request<void>(`${BASE}/${skillId}/request-removal`, {
    method: 'POST',
    body: JSON.stringify({ scope, targetSubmissionId, reason }),
  });
}

/**
 * Browse: list all approved versions of a skill.
 * GET /api/marketplace/:skillId/versions
 */
export function getMarketplaceVersions(skillId: string): Promise<MarketplaceVersion[]> {
  return request<MarketplaceVersion[]>(`${BASE}/${skillId}/versions`);
}

// ── Browse / Download types (Phase 23) ──────────────────────────────────────

export interface MarketplaceListItem {
  skillId: string;
  submissionId: string;
  version: string;
  name: string;
  description: string;
  categories: string[];  // category slugs
  downloadCount: number;
  upvoteCount: number;
  isUpvoted: boolean;
  isFavorited: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  submittedBy: string;
  submittedByName?: string;
}

export interface MarketplaceSkillDetail extends MarketplaceListItem {
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
  /** ISO date of the first approved submission for this skill. */
  createdAt?: string;
  /** ISO date of the latest approved submission for this skill. */
  updatedAt?: string;
}

export interface MarketplaceVersion {
  id: string;
  skillId: string;
  version: string | null;
  status: 'approved';
  snapshotName: string | null;
  snapshotDescription: string | null;
  snapshotCategories: string[];
  submittedAt: string;
  reviewedAt: string | null;
  downloadCount: number;
}

export interface RemovalRequest {
  id: string;
  skillId: string;
  skillName?: string;
  scope: 'skill' | 'version';
  targetSubmissionId: string | null;
  targetVersion?: string | null;
  submittedBy: string;
  submitterName?: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface BrowseMarketplaceParams {
  search?: string;
  categories?: string[];  // slugs
  sort?: 'popular' | 'newest' | 'downloads' | 'upvotes' | 'name';
  page?: number;          // 1-indexed; sent directly to the backend
  limit?: number;         // default 30
}

export interface ToggleUpvoteResponse {
  upvoteCount: number;
  isUpvoted: boolean;
}

export interface ToggleFavoriteResponse {
  isFavorited: boolean;
}

export interface BrowseMarketplaceResponse {
  items: MarketplaceListItem[];
  total: number;
}

/**
 * Browse approved marketplace skills with server-side search/filter/pagination.
 * D-03: server-side only — no client-side filter.
 * D-10: 30 items per page; page is 1-indexed and sent directly to the backend.
 */
export async function browseMarketplace(
  params: BrowseMarketplaceParams,
): Promise<BrowseMarketplaceResponse> {
  const qs = new URLSearchParams();
  if (params.search)            qs.set('search', params.search);
  if (params.sort)              qs.set('sort', params.sort);
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  if (params.limit)             qs.set('limit', String(params.limit));
  if (params.categories?.length) {
    qs.set('categories', params.categories.join(','));
  }
  return request<BrowseMarketplaceResponse>(`${BASE}?${qs.toString()}`);
}

/**
 * Toggle upvote for a marketplace skill. Returns updated count and upvote state.
 * POST /api/marketplace/:skillId/upvote
 */
export async function toggleUpvote(skillId: string): Promise<ToggleUpvoteResponse> {
  return request<ToggleUpvoteResponse>(`${BASE}/${skillId}/upvote`, { method: 'POST' });
}

/**
 * Toggle favorite for a marketplace skill. Returns updated favorite state.
 * POST /api/marketplace/:skillId/favorite
 */
export async function toggleFavorite(skillId: string): Promise<ToggleFavoriteResponse> {
  return request<ToggleFavoriteResponse>(`${BASE}/${skillId}/favorite`, { method: 'POST' });
}

/**
 * Fetch the authenticated user's favorited marketplace skills.
 * GET /api/marketplace/favorites
 */
export async function fetchFavorites(
  params: { limit?: number; page?: number } = {},
): Promise<BrowseMarketplaceResponse> {
  const qs = new URLSearchParams();
  if (params.limit)          qs.set('limit', String(params.limit));
  if (params.page != null)   qs.set('page', String(params.page));
  const query = qs.toString();
  return request<BrowseMarketplaceResponse>(`${BASE}/favorites${query ? `?${query}` : ''}`);
}

/**
 * Fetch full detail for a single approved marketplace skill.
 * D-09: returns JSON content (not zip stream).
 */
export function getMarketplaceSkill(skillId: string): Promise<MarketplaceSkillDetail> {
  return request<MarketplaceSkillDetail>(`${BASE}/${skillId}`);
}

// ── Admin endpoints (Phase 23 gap closure) ─────────────────────────────────

/**
 * A pending marketplace submission as seen by an org admin.
 * The backend returns the raw MarketplaceSubmission shape.
 */
export interface PendingSubmissionItem {
  id: string;
  skillId: string;
  skillName?: string;       // resolved server-side by listPendingSubmissions() enrichment
  submitterName?: string;   // resolved server-side — full name of the submitting user
  version: string;
  status: 'pending_review';
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
}

/**
 * Fetch all pending_review submissions scoped to the admin's org.
 * Requires admin role — enforced by RolesGuard on the server.
 */
export function getAdminPendingSubmissions(): Promise<PendingSubmissionItem[]> {
  return request<PendingSubmissionItem[]>(`${ADMIN_BASE}/pending`);
}

/**
 * Approve a marketplace submission with an optional review note.
 * POST /api/admin/marketplace/:submissionId/approve
 */
export function approveSubmission(submissionId: string, reviewNote?: string): Promise<void> {
  return request<void>(`${ADMIN_BASE}/${submissionId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reviewNote }),
  });
}

/**
 * Reject a marketplace submission with an optional review note.
 * POST /api/admin/marketplace/:submissionId/reject
 */
export function rejectSubmission(submissionId: string, reviewNote?: string): Promise<void> {
  return request<void>(`${ADMIN_BASE}/${submissionId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reviewNote }),
  });
}

/**
 * Generate or return cached Mermaid diagram for a marketplace skill.
 * POST /api/marketplace/:skillId/diagram?force=true|false
 */
export function getMarketplaceSkillDiagram(skillId: string, force: boolean): Promise<SkillDiagram> {
  return request<SkillDiagram>(`${BASE}/${skillId}/diagram?force=${force}`, {
    method: 'POST',
  });
}

/**
 * Remove a skill from the marketplace (admin/owner only).
 * Calls DELETE /api/admin/marketplace/:skillId.
 * IMPORTANT: takes skillId (skill UUID), NOT submissionId.
 */
export function removeMarketplaceSkill(skillId: string, reason: string): Promise<void> {
  return request<void>(`${ADMIN_BASE}/${skillId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Fetch approved marketplace skills scoped to the admin's org.
 * NOTE: Backend defaults to limit=100. Orgs with >100 skills will receive a
 * truncated list. Pass explicit limit/offset params or use a paginated approach.
 */
export function getAdminApprovedSkills(limit = 100, offset = 0): Promise<{ items: MarketplaceListItem[]; total: number }> {
  return request<{ items: MarketplaceListItem[]; total: number }>(`${ADMIN_BASE}/approved?limit=${limit}&offset=${offset}`);
}

export interface AdminSubmissionPreview {
  id: string;
  skillId: string;
  version: string;
  status: string;
  submittedBy: string;
  submitterName: string;
  submittedAt: string;
  skillName: string;
  description?: string;
  snapshotCreatedAt?: string;
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
  submitterNote: string | null;
  requirementsMet?: SubmissionRequirement[] | null;
}

/**
 * Fetch a pending submission's full detail (including skill content) for the admin preview modal.
 * Uses the admin-only endpoint — works for pending submissions unlike getMarketplaceSkill().
 */
export function getAdminSubmissionPreview(submissionId: string): Promise<AdminSubmissionPreview> {
  return request<AdminSubmissionPreview>(`${ADMIN_BASE}/submissions/${submissionId}`);
}

/**
 * Admin: list all approved versions for a skill without requiring an active
 * marketplace listing. Returns [] when the skill has never been published
 * (first-time submission). Use this instead of getMarketplaceVersions() in
 * admin flows to avoid 404 on unreviewed skills.
 */
export function getAdminApprovedVersions(skillId: string): Promise<MarketplaceVersion[]> {
  return request<MarketplaceVersion[]>(`${ADMIN_BASE}/skills/${skillId}/approved-versions`);
}

/**
 * Download the skill export zip.
 * MUST use fetch() + res.blob() — NOT request<T>() which calls res.json().
 * Mirrors downloadSharedSkillZip() in sharing.ts exactly.
 */
export async function downloadMarketplaceSkill(skillId: string, version: string): Promise<void> {
  const url = `${BASE}/${skillId}/download?version=${encodeURIComponent(version)}`;
  const token = await authSDK.getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  a.download = match?.[1] ?? 'skill.zip';
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Admin: list pending owner removal requests.
 * GET /api/admin/marketplace/removal-requests
 */
export function getAdminRemovalRequests(): Promise<RemovalRequest[]> {
  return request<RemovalRequest[]>(`${ADMIN_BASE}/removal-requests`);
}

/**
 * Admin: approve owner's removal request.
 * POST /api/admin/marketplace/removal-requests/:id/approve
 */
export function approveRemovalRequest(id: string): Promise<void> {
  return request<void>(`${ADMIN_BASE}/removal-requests/${id}/approve`, {
    method: 'POST',
  });
}

/**
 * Admin: reject owner's removal request.
 * POST /api/admin/marketplace/removal-requests/:id/reject
 */
export function rejectRemovalRequest(id: string): Promise<void> {
  return request<void>(`${ADMIN_BASE}/removal-requests/${id}/reject`, {
    method: 'POST',
  });
}

/**
 * Admin: remove a specific version of a skill from marketplace.
 * DELETE /api/admin/marketplace/submissions/:submissionId
 */
export function removeMarketplaceVersion(submissionId: string): Promise<void> {
  return request<void>(`${ADMIN_BASE}/submissions/${submissionId}`, {
    method: 'DELETE',
  });
}
