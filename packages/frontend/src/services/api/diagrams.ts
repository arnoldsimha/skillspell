import type { SkillDiagram } from '@skillspell/shared';
import { API_BASE, request } from './client.js';

/**
 * Get or generate a Mermaid diagram for a skill.
 * Returns cached diagram if available for the current version,
 * otherwise generates a new one via the light model.
 */
export async function generateDiagram(
  skillId: string,
  force = false,
  version?: number,
): Promise<SkillDiagram> {
  const vPrefix = version != null ? `v${version}/` : '';
  const forceQs = force ? '?force=true' : '';
  return request<SkillDiagram>(
    `${API_BASE}/skills/${vPrefix}${skillId}/diagram${forceQs}`,
    { method: 'POST' },
  );
}
