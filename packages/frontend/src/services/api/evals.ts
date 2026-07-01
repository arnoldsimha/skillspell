import type {
  EvalCase,
  EvalRun,
  EvalBenchmark,
  EvalFeedback,
  FailureExplanation,
  CreateEvalCaseRequest,
  UpdateEvalCaseRequest,
  RunEvalsRequest,
  SaveFeedbackRequest,
  TestPromptSuggestion,
  AssertionReplacementSuggestion,
  EvalAssertionValueStats,
  CoverageGap,
} from '@skillspell/shared';
import { API_BASE, request } from './client.js';
import { connectStreamingSocket, getStreamingSocket, emitStream, onStreamEvent } from '../../utils/streamingSocket.js';

/** Create a new eval case for a skill. */
export async function createEvalCase(
  skillId: string,
  data: CreateEvalCaseRequest,
): Promise<EvalCase> {
  return request<EvalCase>(`${API_BASE}/skills/${skillId}/evals`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** List all eval cases for a skill. */
export async function fetchEvalCases(skillId: string): Promise<EvalCase[]> {
  return request<EvalCase[]>(`${API_BASE}/skills/${skillId}/evals`);
}

/** Update an existing eval case. */
export async function updateEvalCase(
  skillId: string,
  evalId: string,
  data: UpdateEvalCaseRequest,
): Promise<EvalCase> {
  return request<EvalCase>(`${API_BASE}/skills/${skillId}/evals/${evalId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Delete an eval case. */
export async function deleteEvalCase(
  skillId: string,
  evalId: string,
): Promise<void> {
  return request<void>(`${API_BASE}/skills/${skillId}/evals/${evalId}`, {
    method: 'DELETE',
  });
}

/** Run eval cases for a skill. */
export async function runEvals(
  skillId: string,
  data: RunEvalsRequest,
): Promise<EvalRun[]> {
  return request<EvalRun[]>(`${API_BASE}/skills/${skillId}/evals/run`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Get all eval runs for a skill, optionally filtered by version. */
export async function fetchEvalRuns(skillId: string, version?: number): Promise<EvalRun[]> {
  const url = version != null
    ? `${API_BASE}/skills/${skillId}/evals/runs?version=${version}`
    : `${API_BASE}/skills/${skillId}/evals/runs`;
  return request<EvalRun[]>(url);
}

/** Delete an eval run. */
export async function deleteEvalRun(
  skillId: string,
  runId: string,
): Promise<void> {
  return request<void>(`${API_BASE}/skills/${skillId}/evals/runs/${runId}`, {
    method: 'DELETE',
  });
}

/** Get all feedback for a skill's eval runs. */
export async function fetchFeedback(skillId: string): Promise<EvalFeedback[]> {
  return request<EvalFeedback[]>(`${API_BASE}/skills/${skillId}/evals/feedback`);
}

/** Save feedback on an eval run. */
export async function saveFeedback(
  skillId: string,
  data: SaveFeedbackRequest,
): Promise<EvalFeedback> {
  return request<EvalFeedback>(`${API_BASE}/skills/${skillId}/evals/feedback`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Get aggregated benchmark stats for a skill. Optionally filter by version. */
export async function fetchBenchmark(skillId: string, version?: number): Promise<EvalBenchmark> {
  const vSuffix = version != null ? `/v${version}` : '';
  return request<EvalBenchmark>(`${API_BASE}/skills/${skillId}/evals/benchmark${vSuffix}`);
}

/** Get AI-generated test prompt suggestions for eval cases. */
export async function fetchTestPromptSuggestions(
  skillId: string,
  existingPrompt?: string,
  signal?: AbortSignal,
  testCaseName?: string,
): Promise<TestPromptSuggestion[]> {
  const body: Record<string, string> = {};
  if (existingPrompt) body.existingPrompt = existingPrompt;
  if (testCaseName) body.testCaseName = testCaseName;

  const result = await request<{ suggestions: TestPromptSuggestion[] }>(
    `${API_BASE}/skills/${skillId}/evals/suggest-prompts`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    },
  );
  return result.suggestions;
}

/** Progress callback for test case generation stream. */
export type GenerateProgressCallback = (phase: 'analyzing' | 'generating', current: number, total: number) => void;

/**
 * AI-generate test eval cases via WebSocket stream. Returns generated cases.
 *
 * Uses `emitStream` for socket-based streaming with progress events.
 */
export async function generateTestEvals(
  skillId: string,
  count: number,
  onProgress?: GenerateProgressCallback,
  signal?: AbortSignal,
  coverageHint?: string,
): Promise<TestPromptSuggestion[]> {
  if (signal?.aborted) return [];

  await connectStreamingSocket();
  const sock = getStreamingSocket();
  const requestId = crypto.randomUUID();

  let unsubProgress: (() => void) | undefined;
  if (onProgress) {
    unsubProgress = onStreamEvent(requestId, (ev) => {
      if (ev.type === 'generate-progress') {
        onProgress(
          ev['phase'] as 'analyzing' | 'generating',
          ev['current'] as number,
          ev['total'] as number,
        );
      }
    }, sock);
  }

  try {
    const result = await emitStream<{ cases: TestPromptSuggestion[] }>(
      'generate-evals',
      { skillId, count, requestId, ...(coverageHint ? { coverageHint } : {}) },
      signal,
    );
    return result.cases;
  } finally {
    unsubProgress?.();
  }
}

/** Bulk-create multiple eval cases in a single request. */
export async function bulkCreateEvalCases(
  skillId: string,
  cases: CreateEvalCaseRequest[],
): Promise<EvalCase[]> {
  return request<EvalCase[]>(`${API_BASE}/skills/${skillId}/evals/bulk`, {
    method: 'POST',
    body: JSON.stringify({ cases }),
  });
}

/** C3: Explain why an eval run failed — returns plain-language explanation with fix suggestions. */
export async function explainFailure(
  skillId: string,
  runId: string,
): Promise<FailureExplanation> {
  return request<FailureExplanation>(
    `${API_BASE}/skills/${skillId}/evals/runs/${runId}/explain`,
  );
}

export type SuggestCountBreakdown = {
  coreBehaviors: number;
  edgeCasesAndErrors: number;
  referenceFileScenarios: number;
  scriptPathScenarios: number;
};

/** AI-suggest recommended test case count for a skill. */
export async function suggestTestCaseCount(
  skillId: string,
  signal?: AbortSignal,
): Promise<{ count: number; reasoning: string; breakdown: SuggestCountBreakdown | null }> {
  return request<{ count: number; reasoning: string; breakdown: SuggestCountBreakdown | null }>(
    `${API_BASE}/skills/${skillId}/evals/suggest-count`,
    { method: 'POST', body: JSON.stringify({}), signal },
  );
}

/** AI-suggest test case counts per coverage gap dimension. */
export async function suggestGapCounts(
  skillId: string,
  gaps: CoverageGap[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const result = await request<{ counts: Record<string, number> }>(
    `${API_BASE}/skills/${skillId}/evals/suggest-gap-counts`,
    {
      method: 'POST',
      body: JSON.stringify({ gaps }),
      signal,
    },
  );
  return result.counts;
}

/** AI-suggest replacements for non-discriminating assertions. */
export async function suggestAssertionReplacements(
  skillId: string,
  assertions: Array<Pick<EvalAssertionValueStats, 'assertionValue' | 'assertionType' | 'description' | 'withSkillPassRate' | 'baselinePassRate'>>,
  signal?: AbortSignal,
): Promise<AssertionReplacementSuggestion[]> {
  const result = await request<{ suggestions: AssertionReplacementSuggestion[] }>(
    `${API_BASE}/skills/${skillId}/evals/suggest-assertions`,
    {
      method: 'POST',
      body: JSON.stringify({ assertions }),
      signal,
    },
  );
  return result.suggestions;
}
