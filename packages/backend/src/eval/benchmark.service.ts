import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  EVAL_REPOSITORY,
  type IEvalRepository,
  type EvalBenchmark,
  type EvalAssertionStats,
  type EvalAssertionValueStats,
  type EvalCaseStats,
  type EvalRun,
  type EvalCase,
  type StatsSummary,
  type ConfigStats,
  type IterationStats,
} from '@skillspell/shared';

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger(BenchmarkService.name);

  constructor(
    @Inject(EVAL_REPOSITORY)
    private readonly evalRepository: IEvalRepository,
  ) {}

  /**
   * Aggregate benchmark statistics for a skill.
   *
   * Fetches all eval cases and completed runs, then computes:
   * - Overall pass rate, average score, duration, and token usage
   * - Per-assertion-type pass rates
   * - Per-eval-case pass rates and average scores
   * - Variance statistics (mean ± stddev, min, max) for with-skill and baseline
   * - Delta between with-skill and baseline
   */
  async aggregateBenchmark(
    skillId: string,
    version?: number,
  ): Promise<EvalBenchmark> {
    this.logger.log(
      `Aggregating benchmark for skill ${skillId}` +
        (version ? ` (version ${version})` : ''),
    );

    // Fetch all data in parallel.
    // NOTE: getEvalRuns fetches ALL versions intentionally — computeBenchmark
    // filters to the requested version for summary stats but uses the full set
    // for the cross-version byIteration timeline. Passing version here would
    // require a second unfiltered query for byIteration, which is worse overall.
    const [evalCases, evalRuns] = await Promise.all([
      this.evalRepository.getEvalCases(skillId),
      this.evalRepository.getEvalRuns(skillId),
    ]);

    return this.computeBenchmark(skillId, evalCases, evalRuns, version);
  }

  /**
   * Compute benchmark from pre-fetched data. Avoids redundant DB queries when
   * the caller needs both global and version-specific benchmarks.
   */
  computeBenchmark(
    skillId: string,
    evalCases: EvalCase[],
    evalRuns: EvalRun[],
    version?: number,
  ): EvalBenchmark {
    // Filter to completed runs only. Runs whose AI grading failed due to an
    // infrastructure error (gradingError) aren't skill-quality failures, so they
    // are excluded from all quality metrics below — but they ARE counted (within
    // the displayed version scope) so the count can be surfaced in a note.
    const completedStatusRuns = evalRuns.filter(
      (r) => r.status === 'completed',
    );

    // Version scope applies to the summary stats; the iteration timeline stays
    // cross-version. Compute the grading-error count within the SAME scope as the
    // benchmark being returned, so a version-scoped view doesn't report errors
    // from other versions.
    const scopedStatusRuns =
      version != null
        ? completedStatusRuns.filter((r) => r.skillVersion === version)
        : completedStatusRuns;
    const gradingErrorRuns = scopedStatusRuns.filter(
      (r) => r.grading?.gradingError,
    );

    // Quality runs: completed, grading-error-free. allCompletedRuns is the
    // cross-version set used for the iteration timeline; completedRuns is the
    // version-scoped set used for summary stats.
    const allCompletedRuns = completedStatusRuns.filter(
      (r) => !r.grading?.gradingError,
    );
    const completedRuns = scopedStatusRuns.filter(
      (r) => !r.grading?.gradingError,
    );

    if (completedRuns.length === 0) {
      this.logger.warn(
        `No gradeable completed runs for skill ${skillId}` +
          (gradingErrorRuns.length > 0
            ? ` (${gradingErrorRuns.length} excluded for grading errors)`
            : '') +
          `, returning empty benchmark`,
      );
      const empty = this.emptyBenchmark(skillId);
      // Don't let an all-grading-failed run set masquerade as "never run".
      if (gradingErrorRuns.length > 0) {
        empty.notes = [
          `${gradingErrorRuns.length} run(s) had AI grading errors (API/timeout/parse failures) and could not be scored. Re-run them to get a quality signal.`,
        ];
      }
      return empty;
    }

    // Calculate overall stats (backward-compatible averages)
    const totalRuns = completedRuns.length;
    const passedRuns = completedRuns.filter(
      (r) => r.grading.overall === 'pass',
    ).length;
    const passRate = (passedRuns / totalRuns) * 100;

    const averageScore =
      completedRuns.reduce((sum, r) => sum + r.grading.score, 0) / totalRuns;

    const averageDurationMs =
      completedRuns.reduce((sum, r) => sum + r.timing.durationMs, 0) /
      totalRuns;

    const averageTokens =
      completedRuns.reduce((sum, r) => sum + r.timing.totalTokens, 0) /
      totalRuns;

    // Calculate per-assertion-type stats
    const byAssertion = this.calculateAssertionStats(completedRuns);

    // Calculate per-eval-case stats
    const byEvalCase = this.calculateEvalCaseStats(completedRuns, evalCases);

    // Calculate variance statistics for with-skill runs
    const withSkillStats = this.calculateConfigStats(completedRuns, 'withSkill');

    // Calculate variance statistics for baseline runs (only if baseline data exists)
    const runsWithBaseline = completedRuns.filter(
      (r) => r.baselineGrading && r.baselineTiming,
    );
    const baselineStats =
      runsWithBaseline.length > 0
        ? this.calculateConfigStats(runsWithBaseline, 'baseline')
        : undefined;

    // Calculate delta between with-skill and baseline
    const delta =
      withSkillStats && baselineStats
        ? this.calculateDelta(withSkillStats, baselineStats)
        : undefined;

    // Calculate per-assertion-value stats with discrimination analysis (Phase 2)
    const byAssertionValue = this.calculateAssertionValueStats(completedRuns);

    // Apply discrimination analysis to by-type stats as well
    this.applyDiscriminationToTypeStats(byAssertion, byAssertionValue);

    // Generate analyst notes (Phase 2.2)
    const notes = this.generateAnalystNotes(
      completedRuns,
      byAssertion,
      byAssertionValue,
      byEvalCase,
      withSkillStats,
      baselineStats,
    );

    // Surface grading-infrastructure errors that were excluded from the metrics
    // so they don't masquerade as a clean run set.
    if (gradingErrorRuns.length > 0) {
      notes.unshift(
        `${gradingErrorRuns.length} run(s) had AI grading errors (API/timeout/parse failures) and were excluded from pass rate and scores. Re-run them to get a quality signal.`,
      );
    }

    // Calculate per-iteration stats (Phase 4)
    // Use version-scoped data (completedRuns) when viewing a specific version,
    // or cross-version data (allCompletedRuns) when viewing all versions.
    // Grading-error runs are excluded from the iteration history.
    const byIteration = this.calculateIterationStats(
      version != null ? completedRuns : allCompletedRuns,
    );

    const benchmark: EvalBenchmark = {
      skillId,
      totalRuns,
      passRate: this.round2(passRate),
      averageScore: this.round2(averageScore),
      averageDurationMs: Math.round(averageDurationMs),
      averageTokens: Math.round(averageTokens),
      byAssertion,
      byEvalCase,
      byAssertionValue:
        byAssertionValue.length > 0 ? byAssertionValue : undefined,
      withSkillStats,
      baselineStats,
      delta,
      notes: notes.length > 0 ? notes : undefined,
      byIteration: byIteration.length > 0 ? byIteration : undefined,
      generatedAt: new Date().toISOString(),
    };

    this.logger.log(
      `Benchmark for skill ${skillId}: ${totalRuns} runs, ` +
        `${this.round2(passRate)}% pass rate, avg score ${this.round2(averageScore)}` +
        (baselineStats
          ? `, baseline: ${this.round2(baselineStats.passRate.mean)}% pass rate`
          : '') +
        (notes.length > 0 ? `, ${notes.length} analyst notes` : '') +
        (byIteration.length > 0
          ? `, ${byIteration.length} iterations`
          : ''),
    );

    return benchmark;
  }

  /**
   * Calculate ConfigStats for either with-skill or baseline data.
   */
  private calculateConfigStats(
    runs: EvalRun[],
    config: 'withSkill' | 'baseline',
  ): ConfigStats {
    const isBaseline = config === 'baseline';

    // Extract per-run values
    const scores = runs.map((r) =>
      isBaseline ? (r.baselineGrading?.score ?? 0) : r.grading.score,
    );
    const durations = runs.map((r) =>
      isBaseline
        ? (r.baselineTiming?.durationMs ?? 0)
        : r.timing.durationMs,
    );
    const tokens = runs.map((r) =>
      isBaseline
        ? (r.baselineTiming?.totalTokens ?? 0)
        : r.timing.totalTokens,
    );
    const passRates = runs.map((r) => {
      const grading = isBaseline ? r.baselineGrading : r.grading;
      return grading?.overall === 'pass' ? 100 : 0;
    });

    return {
      passRate: this.calculateStats(passRates),
      durationMs: this.calculateStats(durations),
      tokens: this.calculateStats(tokens),
      score: this.calculateStats(scores),
    };
  }

  /**
   * Calculate mean, sample standard deviation, min, and max for a set of values.
   */
  private calculateStats(values: number[]): StatsSummary {
    if (values.length === 0) {
      return { mean: 0, stddev: 0, min: 0, max: 0 };
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    // Use reduce instead of Math.min/max(...values) to avoid
    // stack overflow on large arrays (>65k elements hit V8 argument limit).
    const min = values.reduce((a, b) => Math.min(a, b), Infinity);
    const max = values.reduce((a, b) => Math.max(a, b), -Infinity);

    // Sample standard deviation (n-1 denominator for unbiased estimate)
    let stddev = 0;
    if (values.length > 1) {
      const squaredDiffs = values.reduce(
        (sum, v) => sum + (v - mean) ** 2,
        0,
      );
      stddev = Math.sqrt(squaredDiffs / (values.length - 1));
    }

    return {
      mean: this.round2(mean),
      stddev: this.round2(stddev),
      min: this.round2(min),
      max: this.round2(max),
    };
  }

  /**
   * Calculate delta between with-skill and baseline stats.
   * Positive delta means with-skill is better (higher score/pass rate,
   * lower duration/tokens).
   */
  private calculateDelta(
    withSkill: ConfigStats,
    baseline: ConfigStats,
  ): EvalBenchmark['delta'] {
    const formatDelta = (a: number, b: number, invertBetter = false): string => {
      const diff = invertBetter ? b - a : a - b;
      const sign = diff >= 0 ? '+' : '';
      return `${sign}${this.round2(diff)}`;
    };

    return {
      passRate: formatDelta(withSkill.passRate.mean, baseline.passRate.mean),
      score: formatDelta(withSkill.score.mean, baseline.score.mean),
      // For duration and tokens, lower is better, so invert
      durationMs: formatDelta(
        withSkill.durationMs.mean,
        baseline.durationMs.mean,
        true,
      ),
      tokens: formatDelta(
        withSkill.tokens.mean,
        baseline.tokens.mean,
        true,
      ),
    };
  }

  /**
   * Calculate pass rates grouped by assertion type (contains, semantic, etc.).
   */
  private calculateAssertionStats(runs: EvalRun[]): EvalAssertionStats[] {
    const byType: Record<string, { total: number; passed: number }> = {};

    for (const run of runs) {
      for (const result of run.grading.assertionResults) {
        const type = result.assertion.type;
        if (!byType[type]) {
          byType[type] = { total: 0, passed: 0 };
        }
        byType[type].total++;
        if (result.passed) {
          byType[type].passed++;
        }
      }
    }

    return Object.entries(byType).map(([assertionType, stats]) => ({
      assertionType,
      totalChecks: stats.total,
      passCount: stats.passed,
      passRate: stats.total > 0 ? this.round2((stats.passed / stats.total) * 100) : 0,
    }));
  }

  /**
   * Calculate pass rates and average scores grouped by eval case.
   */
  private calculateEvalCaseStats(
    runs: EvalRun[],
    evalCases: EvalCase[],
  ): EvalCaseStats[] {
    // Group runs by eval case ID
    const byEvalId: Record<string, EvalRun[]> = {};

    for (const run of runs) {
      if (!byEvalId[run.evalId]) {
        byEvalId[run.evalId] = [];
      }
      byEvalId[run.evalId].push(run);
    }

    // Create a map of eval cases for name lookup
    const evalCaseMap = new Map(evalCases.map((ec) => [ec.id, ec]));

    return Object.entries(byEvalId).map(([evalId, caseRuns]) => {
      const evalCase = evalCaseMap.get(evalId);
      const passedRuns = caseRuns.filter(
        (r) => r.grading.overall === 'pass',
      ).length;
      const totalScores = caseRuns.reduce((sum, r) => sum + r.grading.score, 0);

      return {
        evalId,
        evalName: evalCase?.name ?? 'Unknown',
        runCount: caseRuns.length,
        passCount: passedRuns,
        passRate: caseRuns.length > 0 ? this.round2((passedRuns / caseRuns.length) * 100) : 0,
        averageScore: caseRuns.length > 0 ? this.round2(totalScores / caseRuns.length) : 0,
      };
    });
  }

  /**
   * Calculate per-assertion-value stats with discrimination analysis.
   * Groups by unique assertion value+type and computes pass rates for with-skill and baseline.
   */
  private calculateAssertionValueStats(
    runs: EvalRun[],
  ): EvalAssertionValueStats[] {
    const valueMap: Record<
      string,
      {
        value: string;
        type: string;
        description?: string;
        withSkillPass: number;
        withSkillTotal: number;
        baselinePass: number;
        baselineTotal: number;
      }
    > = {};

    for (const run of runs) {
      // With-skill assertion results
      for (const result of run.grading.assertionResults) {
        const key = `${result.assertion.type}::${result.assertion.value}`;
        if (!valueMap[key]) {
          valueMap[key] = {
            value: result.assertion.value,
            type: result.assertion.type,
            description: result.assertion.description,
            withSkillPass: 0,
            withSkillTotal: 0,
            baselinePass: 0,
            baselineTotal: 0,
          };
        }
        valueMap[key].withSkillTotal++;
        if (result.passed) valueMap[key].withSkillPass++;
      }

      // Baseline assertion results (if available)
      if (run.baselineGrading) {
        for (const result of run.baselineGrading.assertionResults) {
          const key = `${result.assertion.type}::${result.assertion.value}`;
          if (!valueMap[key]) {
            valueMap[key] = {
              value: result.assertion.value,
              type: result.assertion.type,
              description: result.assertion.description,
              withSkillPass: 0,
              withSkillTotal: 0,
              baselinePass: 0,
              baselineTotal: 0,
            };
          }
          valueMap[key].baselineTotal++;
          if (result.passed) valueMap[key].baselinePass++;
        }
      }
    }

    return Object.values(valueMap).map((v) => {
      const withSkillPassRate =
        v.withSkillTotal > 0
          ? this.round2((v.withSkillPass / v.withSkillTotal) * 100)
          : 0;
      const baselinePassRate =
        v.baselineTotal > 0
          ? this.round2((v.baselinePass / v.baselineTotal) * 100)
          : 0;

      return {
        assertionValue: v.value,
        assertionType: v.type,
        description: v.description,
        withSkillPassRate,
        baselinePassRate,
        totalWithSkillChecks: v.withSkillTotal,
        totalBaselineChecks: v.baselineTotal,
        discrimination: this.classifyDiscrimination(
          withSkillPassRate,
          baselinePassRate,
          v.baselineTotal,
        ),
      };
    });
  }

  /**
   * Classify discrimination status for an assertion based on with-skill vs baseline pass rates.
   */
  private classifyDiscrimination(
    withSkillPassRate: number,
    baselinePassRate: number,
    baselineTotal: number,
  ): EvalAssertionValueStats['discrimination'] {
    // No baseline data — inconclusive
    if (baselineTotal === 0) return 'inconclusive';

    const bothHigh = withSkillPassRate >= 95 && baselinePassRate >= 95;
    const bothLow = withSkillPassRate <= 5 && baselinePassRate <= 5;
    const skillBetter = withSkillPassRate > baselinePassRate + 10;
    const baselineBetter = baselinePassRate > withSkillPassRate + 10;

    if (bothHigh) return 'non-discriminating';
    if (bothLow) return 'broken';
    if (skillBetter) return 'skill-adds-value';
    if (baselineBetter) return 'skill-hurts';
    return 'inconclusive';
  }

  /**
   * Apply discrimination results from per-value stats to per-type stats.
   * If all values of a type share the same discrimination, apply it to the type.
   */
  private applyDiscriminationToTypeStats(
    byAssertion: EvalAssertionStats[],
    byAssertionValue: EvalAssertionValueStats[],
  ): void {
    for (const typeStat of byAssertion) {
      const valuesOfType = byAssertionValue.filter(
        (v) => v.assertionType === typeStat.assertionType,
      );
      if (valuesOfType.length === 0) continue;

      const discriminations = valuesOfType
        .map((v) => v.discrimination)
        .filter((d) => d && d !== 'inconclusive');

      if (discriminations.length === 0) {
        typeStat.discrimination = 'inconclusive';
      } else if (discriminations.every((d) => d === discriminations[0])) {
        typeStat.discrimination = discriminations[0];
      } else {
        // Mixed — check majority
        const counts: Record<string, number> = {};
        for (const d of discriminations) {
          counts[d!] = (counts[d!] || 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        typeStat.discrimination = sorted[0][0] as EvalAssertionStats['discrimination'];
      }
    }
  }

  /**
   * Generate freeform analyst notes about patterns in the data.
   * Detects non-discriminating assertions, high variance, outliers, etc.
   */
  private generateAnalystNotes(
    runs: EvalRun[],
    byAssertion: EvalAssertionStats[],
    byAssertionValue: EvalAssertionValueStats[],
    byEvalCase: EvalCaseStats[],
    withSkillStats?: ConfigStats,
    baselineStats?: ConfigStats,
  ): string[] {
    const notes: string[] = [];

    // 1. Non-discriminating assertions
    const nonDisc = byAssertionValue.filter(
      (v) => v.discrimination === 'non-discriminating',
    );
    if (nonDisc.length > 0) {
      notes.push(
        `${nonDisc.length} of ${byAssertionValue.length} assertion(s) are non-discriminating — they pass regardless of whether the skill is applied. Consider replacing them with more specific checks.`,
      );
    }

    // 2. Skill-hurts assertions
    const skillHurts = byAssertionValue.filter(
      (v) => v.discrimination === 'skill-hurts',
    );
    if (skillHurts.length > 0) {
      const examples = skillHurts
        .slice(0, 3)
        .map((v) => `"${v.assertionValue}"`)
        .join(', ');
      notes.push(
        `⚠️ ${skillHurts.length} assertion(s) perform worse with the skill applied (${examples}). The skill may be interfering with these outputs.`,
      );
    }

    // 3. Broken assertions
    const broken = byAssertionValue.filter(
      (v) => v.discrimination === 'broken',
    );
    if (broken.length > 0) {
      notes.push(
        `${broken.length} assertion(s) fail in both configs — they may be testing beyond the model's capability or have incorrect expected values.`,
      );
    }

    // 4. High variance in pass rate (flaky tests)
    if (withSkillStats && withSkillStats.passRate.stddev > 20) {
      notes.push(
        `High variance in pass rate (σ = ${withSkillStats.passRate.stddev}%). Results may be inconsistent — consider running more iterations or investigating flaky assertions.`,
      );
    }

    // 5. Score variance
    if (withSkillStats && withSkillStats.score.stddev > 15) {
      notes.push(
        `Score variance is high (σ = ${withSkillStats.score.stddev}). Some runs score significantly differently than others.`,
      );
    }

    // 6. Cross-eval consistency — find consistently hard/easy cases
    const hardCases = byEvalCase.filter(
      (c) => c.passRate < 30 && c.runCount >= 2,
    );
    if (hardCases.length > 0) {
      const names = hardCases
        .slice(0, 3)
        .map((c) => `"${c.evalName}"`)
        .join(', ');
      notes.push(
        `${hardCases.length} eval case(s) have consistently low pass rates (<30%): ${names}. These may need simpler assertions or the skill may need improvement for these prompts.`,
      );
    }

    const easyCases = byEvalCase.filter(
      (c) => c.passRate === 100 && c.runCount >= 2,
    );
    if (easyCases.length > 0 && easyCases.length === byEvalCase.length) {
      notes.push(
        `All eval cases pass 100% of the time. Consider adding harder test cases or more specific assertions to better test the skill.`,
      );
    }

    // 7. Duration/token tradeoff
    if (withSkillStats && baselineStats) {
      const durationRatio =
        withSkillStats.durationMs.mean / Math.max(baselineStats.durationMs.mean, 1);
      if (durationRatio > 2) {
        notes.push(
          `With-skill runs take ${this.round2(durationRatio)}x longer than baseline. The skill adds significant processing time.`,
        );
      }
      const tokenRatio =
        withSkillStats.tokens.mean / Math.max(baselineStats.tokens.mean, 1);
      if (tokenRatio > 1.5) {
        notes.push(
          `With-skill runs use ${this.round2(tokenRatio)}x more tokens than baseline.`,
        );
      }
    }

    // 8. Outlier detection — runs with scores far from mean
    if (runs.length >= 3 && withSkillStats && withSkillStats.score.stddev > 0) {
      const outliers = runs.filter((r) => {
        const zScore = Math.abs(
          (r.grading.score - withSkillStats.score.mean) /
            withSkillStats.score.stddev,
        );
        return zScore > 2;
      });
      if (outliers.length > 0) {
        notes.push(
          `${outliers.length} run(s) are statistical outliers (>2σ from mean score). These may skew aggregate statistics.`,
        );
      }
    }

    return notes;
  }

  /**
   * Calculate per-iteration statistics for tracking improvement over time.
   * Groups runs by iteration number and computes pass rate, score, and delta vs previous.
   */
  private calculateIterationStats(runs: EvalRun[]): IterationStats[] {
    // Only include runs that have iteration data
    const iteratedRuns = runs.filter((r) => r.iteration != null);
    if (iteratedRuns.length === 0) return [];

    // Group by iteration
    const byIteration: Record<number, EvalRun[]> = {};
    for (const run of iteratedRuns) {
      const iter = run.iteration!;
      if (!byIteration[iter]) byIteration[iter] = [];
      byIteration[iter].push(run);
    }

    // Sort by iteration number
    const iterations = Object.keys(byIteration)
      .map(Number)
      .sort((a, b) => a - b);

    const results: IterationStats[] = [];

    for (let i = 0; i < iterations.length; i++) {
      const iter = iterations[i];
      const iterRuns = byIteration[iter];
      const passedRuns = iterRuns.filter(
        (r) => r.grading.overall === 'pass',
      ).length;
      const passRate = this.round2((passedRuns / iterRuns.length) * 100);
      const averageScore = this.round2(
        iterRuns.reduce((sum, r) => sum + r.grading.score, 0) /
          iterRuns.length,
      );

      // Determine skill version (use the first run's version)
      // Default to 1 (not 0) — skill versions start at 1; legacy runs without
      // skillVersion predate the version tracking feature and belong to v1
      const skillVersion = iterRuns[0].skillVersion ?? 1;

      // Calculate delta vs previous iteration
      let delta: IterationStats['delta'];
      let gradingResult: IterationStats['gradingResult'];

      if (i === 0) {
        gradingResult = 'baseline';
      } else {
        const prev = results[i - 1];
        const passRateDiff = passRate - prev.passRate;
        const scoreDiff = averageScore - prev.averageScore;

        delta = {
          passRate: `${passRateDiff >= 0 ? '+' : ''}${this.round2(passRateDiff)}`,
          score: `${scoreDiff >= 0 ? '+' : ''}${this.round2(scoreDiff)}`,
        };

        // Determine win/loss/tie
        if (passRate > prev.passRate + 1 || averageScore > prev.averageScore + 1) {
          gradingResult = 'won';
        } else if (passRate < prev.passRate - 1 || averageScore < prev.averageScore - 1) {
          gradingResult = 'lost';
        } else {
          gradingResult = 'tie';
        }
      }

      results.push({
        iteration: iter,
        skillVersion,
        runCount: iterRuns.length,
        passRate,
        averageScore,
        gradingResult,
        delta,
      });
    }

    return results;
  }

  /**
   * Return an empty benchmark structure when there are no completed runs.
   */
  private emptyBenchmark(skillId: string): EvalBenchmark {
    return {
      skillId,
      totalRuns: 0,
      passRate: 0,
      averageScore: 0,
      averageDurationMs: 0,
      averageTokens: 0,
      byAssertion: [],
      byEvalCase: [],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Round a number to 2 decimal places.
   */
  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
