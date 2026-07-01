import { request, API_BASE } from './client.js';
import { authSDK } from '../auth-sdk.js';
import type { SkillDiagram, SkillVersionSnapshot } from '@skillspell/shared';

export interface SharedSkillResponse {
  name: string;
  description: string;
  snapshot: SkillVersionSnapshot;
}

/**
 * Resolve a shared skill by ID + version.
 * Calls GET /api/skills/share/:skillId/v:version (e.g. /v2).
 * Requires authentication. 403 if private or cross-org, 404 if not found.
 */
export async function resolveSharedSkill(
  skillId: string,
  version: number,
): Promise<SharedSkillResponse> {
  return request<SharedSkillResponse>(`${API_BASE}/skills/share/${skillId}/v${version}`);
}

/**
 * Download a shared skill as a zip file.
 * Calls GET /api/skills/share/:skillId/v:version/export?format=...
 * Org-scoped (not ownership-gated) — works for any authenticated same-org viewer.
 */
export async function downloadSharedSkillZip(
  skillId: string,
  version: number,
  format = 'claude',
): Promise<void> {
  const url = `${API_BASE}/skills/share/${skillId}/v${version}/export?format=${encodeURIComponent(format)}`;
  const token = await authSDK.getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  a.download = match?.[1] ?? `skill-${format}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Generate or return cached diagram for a shared skill.
 * Calls POST /api/skills/share/:skillId/v:version/diagram
 * Org-scoped — does not require ownership.
 */
export async function generateSharedDiagram(
  skillId: string,
  force = false,
  version?: number,
): Promise<SkillDiagram> {
  if (!version) throw new Error('Version required for shared diagram');
  const forceQs = force ? '?force=true' : '';
  return request<SkillDiagram>(
    `${API_BASE}/skills/share/${skillId}/v${version}/diagram${forceQs}`,
    { method: 'POST' },
  );
}
