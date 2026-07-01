import type {
  SkillVersionSnapshot,
  SkillVersionSummary,
} from '@skillspell/shared';
import { API_BASE, request } from './client.js';

/** List all version summaries for a skill. */
export async function fetchVersionHistory(skillId: string): Promise<SkillVersionSummary[]> {
  return request<SkillVersionSummary[]>(`${API_BASE}/skills/${skillId}/versions`);
}

/** Get a full version snapshot by skill id and version number. */
export async function fetchVersionSnapshot(
  skillId: string,
  version: number,
): Promise<SkillVersionSnapshot> {
  return request<SkillVersionSnapshot>(`${API_BASE}/skills/v${version}/${skillId}`);
}
