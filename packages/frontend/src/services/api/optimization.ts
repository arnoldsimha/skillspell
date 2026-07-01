import type {
  Skill,
  SkillFileItem,
  OptimizeDraftResponse,
  ApproveOptimizationRequest,
} from '@skillspell/shared';
import { API_BASE, request } from './client.js';
import { emitStream } from '../../utils/streamingSocket.js';

/**
 * Generate an optimization draft WITHOUT saving to the database.
 * The frontend holds the draft until the user approves.
 */
export async function optimizeDraft(
  skillId: string,
  refinement: string,
  draftContext?: {
    name: string;
    description: string;
    skillContent: string;
    scripts: SkillFileItem[];
    references: SkillFileItem[];
    assets: SkillFileItem[];
  },
  signal?: AbortSignal,
): Promise<OptimizeDraftResponse> {
  const result = await emitStream<{ data: OptimizeDraftResponse }>(
    'optimize-draft',
    { skillId, refinement, ...(draftContext ? { draftContext } : {}) },
    signal,
  );
  return result.data;
}

/**
 * Approve an optimization draft and save it as a new skill version.
 * This is the "commit" step of the draft-based optimization flow.
 */
export async function approveOptimization(
  skillId: string,
  data: ApproveOptimizationRequest,
): Promise<Skill> {
  return request<Skill>(
    `${API_BASE}/skills/${skillId}/approve-optimization`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}
