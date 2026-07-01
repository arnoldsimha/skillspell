import type {
  EvalCase,
  EvalRun,
  EvalFeedback,
  EvalBenchmark,
} from '@skillspell/shared';

export interface IEvalRepository {
  // Eval Cases
  createEvalCase(evalCase: EvalCase): Promise<EvalCase>;
  getEvalCases(skillId: string): Promise<EvalCase[]>;
  /** Get a single eval case by composite key (skillId + evalId). */
  getEvalCaseBySkillAndId(
    skillId: string,
    evalId: string,
  ): Promise<EvalCase | null>;
  updateEvalCase(evalCase: EvalCase): Promise<EvalCase>;
  /** Delete an eval case by composite key (skillId + evalId). */
  deleteEvalCaseBySkillAndId(skillId: string, evalId: string): Promise<void>;

  // Eval Runs
  createEvalRun(evalRun: EvalRun): Promise<EvalRun>;
  getEvalRuns(skillId: string, version?: number): Promise<EvalRun[]>;
  /** Get a single eval run by composite key (skillId + runId). */
  getEvalRunBySkillAndId(
    skillId: string,
    runId: string,
  ): Promise<EvalRun | null>;
  updateEvalRun(evalRun: EvalRun): Promise<EvalRun>;
  /** Delete an eval run by composite key (skillId + runId). */
  deleteEvalRunBySkillAndId(skillId: string, runId: string): Promise<void>;
  /** Get eval runs for a specific eval case within a skill. */
  getEvalRunsByEvalIdAndSkill(
    skillId: string,
    evalId: string,
  ): Promise<EvalRun[]>;

  // Feedback
  saveFeedback(feedback: EvalFeedback): Promise<EvalFeedback>;
  /** Get feedback by composite key (skillId + runId). */
  getFeedbackBySkillAndRun(
    skillId: string,
    runId: string,
  ): Promise<EvalFeedback | null>;
  getFeedbackBySkill(skillId: string): Promise<EvalFeedback[]>;
  /** Delete feedback by composite key (skillId + runId). */
  deleteFeedbackBySkillAndRun(skillId: string, runId: string): Promise<void>;

  // Benchmark Snapshots (aggregation-on-write cache)
  /** Persist a pre-computed benchmark snapshot for a skill. */
  saveBenchmarkSnapshot(
    skillId: string,
    benchmark: EvalBenchmark,
    version?: number,
  ): Promise<void>;

  /** Read a cached benchmark snapshot. Returns null on cache miss. */
  getBenchmarkSnapshot(
    skillId: string,
    version?: number,
  ): Promise<EvalBenchmark | null>;

  /** Delete all benchmark snapshots for a skill (used on skill deletion). */
  deleteBenchmarkSnapshots(skillId: string): Promise<void>;

  /** Delete all eval cases for a skill (used on skill deletion). */
  deleteEvalCasesBySkill(skillId: string): Promise<void>;
  /** Delete all eval runs for a skill (used on skill deletion). */
  deleteEvalRunsBySkill(skillId: string): Promise<void>;
  /** Delete all feedback for a skill (used on skill deletion). */
  deleteFeedbackBySkill(skillId: string): Promise<void>;
}

export const EVAL_REPOSITORY = Symbol('EVAL_REPOSITORY');
