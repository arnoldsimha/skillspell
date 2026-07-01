import type {
  Skill,
  SkillSummary,
  SkillFileItem,
  UpdateSkillData,
} from '@skillspell/shared';
import { API_BASE, request } from './client.js';

/** Create a new skill (e.g. from zip upload). */
export interface CreateSkillRequest {
  name: string;
  description: string;
  skillContent?: string;
  scripts?: SkillFileItem[];
  references?: SkillFileItem[];
  assets?: SkillFileItem[];
  status?: 'draft' | 'ready';
}

/** Create a new skill. */
export async function createSkill(data: CreateSkillRequest): Promise<Skill> {
  return request<Skill>(`${API_BASE}/skills`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** List all skills (metadata only). */
export async function fetchSkills(): Promise<SkillSummary[]> {
  return request<SkillSummary[]>(`${API_BASE}/skills`);
}

/** Get full skill detail by id. */
export async function fetchSkill(id: string): Promise<Skill> {
  return request<Skill>(`${API_BASE}/skills/${id}`);
}

/**
 * Get skill metadata only (no content fields).
 * Lightweight — does not load skillContent, scripts, references, assets.
 * Use fetchVersionSnapshot() for version-specific content.
 */
export async function fetchSkillMetadata(id: string): Promise<SkillSummary> {
  return request<SkillSummary>(`${API_BASE}/skills/${id}/metadata`);
}

/** Update a skill. */
export async function updateSkill(id: string, data: UpdateSkillData): Promise<Skill> {
  return request<Skill>(`${API_BASE}/skills/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Delete a skill. */
export async function deleteSkill(id: string): Promise<void> {
  return request<void>(`${API_BASE}/skills/${id}`, { method: 'DELETE' });
}

/** Toggle a skill's public visibility. */
export async function publishSkill(id: string, isPublished: boolean): Promise<void> {
  return request<void>(`${API_BASE}/skills/${id}/publish`, {
    method: 'PATCH',
    body: JSON.stringify({ isPublished }),
  });
}

/**
 * Check whether a skill name is already taken for the current user.
 * Optionally pass `excludeId` to ignore a specific skill (e.g. when renaming).
 */
export async function checkSkillNameExists(
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const body: { name: string; excludeId?: string } = { name };
  if (excludeId) body.excludeId = excludeId;
  const { exists } = await request<{ exists: boolean }>(
    `${API_BASE}/skills/check-name`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  return exists;
}
