import { RequirementsCheckerService } from './requirements-checker.service';

describe('RequirementsCheckerService', () => {
  let service: RequirementsCheckerService;

  beforeEach(() => {
    service = new RequirementsCheckerService();
  });

  describe('evaluate — baseline_eval_run', () => {
    it('returns met=true when at least one run has baselineGrading', () => {
      const result = service.evaluate({
        evalRuns: [{ baselineGrading: { overall: 'pass', score: 90 } }],
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'baseline_eval_run', met: true, required: true });
    });

    it('returns met=false when a run has baselineGrading=null', () => {
      const result = service.evaluate({
        evalRuns: [{ baselineGrading: null }],
      });
      expect(result[0]).toMatchObject({ id: 'baseline_eval_run', met: false });
    });

    it('returns met=false when evalRuns is empty', () => {
      const result = service.evaluate({ evalRuns: [] });
      expect(result[0]).toMatchObject({ id: 'baseline_eval_run', met: false });
    });
  });

  describe('evaluateFromSnapshot', () => {
    it('produces same result as evaluate for eval-based requirements', () => {
      const snapshot = {
        snapshotName: 'My Skill',
        snapshotDescription: null,
        snapshotCategories: [] as string[],
      };
      const context = { evalRuns: [{ baselineGrading: { overall: 'pass' } }] };

      expect(service.evaluateFromSnapshot(snapshot, context)).toEqual(
        service.evaluate(context),
      );
    });
  });
});
