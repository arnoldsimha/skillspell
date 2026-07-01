import { Injectable } from '@nestjs/common';
import { SubmissionRequirement, RequirementId } from '@skillspell/shared';

export interface CheckContext {
  evalRuns: Array<{ baselineGrading: unknown | null }>;
}

export interface SubmissionSnapshot {
  snapshotName: string | null;
  snapshotDescription: string | null;
  snapshotCategories: string[];
}

interface RequirementChecker {
  id: RequirementId;
  label: string;
  hint: string;
  required: boolean;
  checkLive(context: CheckContext): boolean;
  checkSnapshot(snapshot: SubmissionSnapshot, context: CheckContext): boolean;
}

class BaselineEvalRunChecker implements RequirementChecker {
  readonly id: RequirementId = 'baseline_eval_run';
  readonly label = 'Run at least one eval with baseline comparison';
  readonly hint = 'Go to Evals → run with Compare Baseline enabled';
  readonly required = true;

  checkLive(context: CheckContext): boolean {
    return context.evalRuns.some((r) => r.baselineGrading != null);
  }

  checkSnapshot(snapshot: SubmissionSnapshot, context: CheckContext): boolean {
    return this.checkLive(context); // eval runs are not content-bound to snapshot
  }
}

@Injectable()
export class RequirementsCheckerService {
  private readonly checkers: RequirementChecker[] = [new BaselineEvalRunChecker()];

  evaluate(context: CheckContext): SubmissionRequirement[] {
    return this.checkers.map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint,
      required: c.required,
      met: c.checkLive(context),
    }));
  }

  evaluateFromSnapshot(
    snapshot: SubmissionSnapshot,
    context: CheckContext,
  ): SubmissionRequirement[] {
    return this.checkers.map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint,
      required: c.required,
      met: c.checkSnapshot(snapshot, context),
    }));
  }
}
