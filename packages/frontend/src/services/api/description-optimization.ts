/**
 * API functions for the Description Optimization feature (Phase 3).
 *
 * Endpoints:
 * - POST /api/generate/:id/optimize-description/trigger-evals
 * - POST /api/generate/:id/optimize-description/run
 * - POST /api/generate/:id/optimize-description/apply
 */

import { API_BASE, request } from './client.js';
import type {
  GenerateTriggerEvalsResponse,
  DescriptionOptimizationResult,
  TriggerEvalQuery,
  Skill,
} from '@skillspell/shared';

/**
 * Step 1: Generate trigger eval queries for a skill.
 */
export async function generateTriggerEvals(
  skillId: string,
  count: number = 20,
): Promise<GenerateTriggerEvalsResponse> {
  return request<GenerateTriggerEvalsResponse>(
    `${API_BASE}/generate/${skillId}/optimize-description/trigger-evals`,
    {
      method: 'POST',
      body: JSON.stringify({ count }),
    },
  );
}

/**
 * Step 3: Run the optimization loop with reviewed eval queries.
 * Accepts an optional AbortSignal for request cancellation.
 */
export async function runDescriptionOptimization(
  skillId: string,
  queries: TriggerEvalQuery[],
  maxIterations: number = 5,
  signal?: AbortSignal,
): Promise<DescriptionOptimizationResult> {
  return request<DescriptionOptimizationResult>(
    `${API_BASE}/generate/${skillId}/optimize-description/run`,
    {
      method: 'POST',
      body: JSON.stringify({ queries, maxIterations }),
      signal,
    },
  );
}

/**
 * Step 4: Apply the optimized description to the skill.
 */
export async function applyOptimizedDescription(
  skillId: string,
  description: string,
): Promise<Skill> {
  return request<Skill>(
    `${API_BASE}/generate/${skillId}/optimize-description/apply`,
    {
      method: 'POST',
      body: JSON.stringify({ description }),
    },
  );
}
