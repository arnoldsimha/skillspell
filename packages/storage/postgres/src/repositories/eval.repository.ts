import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type {
  EvalCase, EvalRun, EvalFeedback, EvalBenchmark,
  EvalAssertion, EvalRunConfig, EvalOutputFile,
  EvalGrading, EvalTiming,
} from '@skillspell/shared';
import type { IEvalRepository } from '@skillspell/shared';
import { EvalCaseEntity } from '../entities/eval-case.entity';
import { EvalRunEntity } from '../entities/eval-run.entity';
import { EvalFeedbackEntity } from '../entities/eval-feedback.entity';
import { EvalBenchmarkEntity } from '../entities/eval-benchmark.entity';

@Injectable()
export class PostgresEvalRepository implements IEvalRepository {
  constructor(
    @InjectRepository(EvalCaseEntity)
    private readonly caseRepo: Repository<EvalCaseEntity>,
    @InjectRepository(EvalRunEntity)
    private readonly runRepo: Repository<EvalRunEntity>,
    @InjectRepository(EvalFeedbackEntity)
    private readonly feedbackRepo: Repository<EvalFeedbackEntity>,
    @InjectRepository(EvalBenchmarkEntity)
    private readonly benchmarkRepo: Repository<EvalBenchmarkEntity>,
  ) {}

  // ─── Eval Cases ─────────────────────────────────────────────────────

  async createEvalCase(evalCase: EvalCase): Promise<EvalCase> {
    const entity = this.caseRepo.create({
      id: evalCase.id || uuidv4(),
      skillId: evalCase.skillId,
      name: evalCase.name,
      prompt: evalCase.prompt,
      expectedOutput: evalCase.expectedOutput ?? null,
      assertions: evalCase.assertions as any[],
      context: evalCase.context ?? null,
      createdAtVersion: evalCase.createdAtVersion ?? 1,
    });
    const saved = await this.caseRepo.save(entity);
    return this.toEvalCase(saved);
  }

  async getEvalCases(skillId: string): Promise<EvalCase[]> {
    const entities = await this.caseRepo.find({
      where: { skillId },
      order: { createdAt: 'ASC' },
    });
    return entities.map(e => this.toEvalCase(e));
  }

  async getEvalCaseBySkillAndId(skillId: string, evalId: string): Promise<EvalCase | null> {
    const entity = await this.caseRepo.findOneBy({ id: evalId, skillId });
    return entity ? this.toEvalCase(entity) : null;
  }

  async updateEvalCase(evalCase: EvalCase): Promise<EvalCase> {
    await this.caseRepo.update(evalCase.id, {
      name: evalCase.name,
      prompt: evalCase.prompt,
      expectedOutput: evalCase.expectedOutput ?? null,
      assertions: evalCase.assertions as any[],
      context: evalCase.context ?? null,
      createdAtVersion: evalCase.createdAtVersion ?? 1,
    });
    const updated = await this.caseRepo.findOneByOrFail({ id: evalCase.id });
    return this.toEvalCase(updated);
  }

  async deleteEvalCaseBySkillAndId(skillId: string, evalId: string): Promise<void> {
    await this.caseRepo.delete({ id: evalId, skillId });
  }

  // ─── Eval Runs ──────────────────────────────────────────────────────

  async createEvalRun(evalRun: EvalRun): Promise<EvalRun> {
    const entity = this.runRepo.create({
      id: evalRun.id || uuidv4(),
      evalId: evalRun.evalId,
      skillId: evalRun.skillId,
      config: evalRun.config as any,
      prompt: evalRun.prompt,
      outputWithSkill: evalRun.outputWithSkill ?? '',
      outputWithoutSkill: evalRun.outputWithoutSkill ?? null,
      outputFiles: evalRun.outputFiles as any[],
      grading: evalRun.grading as any,
      timing: evalRun.timing as any,
      baselineTiming: evalRun.baselineTiming as any ?? null,
      baselineGrading: evalRun.baselineGrading as any ?? null,
      status: evalRun.status,
      error: evalRun.error ?? null,
      iteration: evalRun.iteration ?? 1,
      skillVersion: evalRun.skillVersion ?? null,
    });
    const saved = await this.runRepo.save(entity);
    return this.toEvalRun(saved);
  }

  async getEvalRuns(skillId: string, version?: number): Promise<EvalRun[]> {
    const where: Record<string, unknown> = { skillId };
    if (version != null) where.skillVersion = version;

    const entities = await this.runRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return entities.map(e => this.toEvalRun(e));
  }

  async getEvalRunBySkillAndId(skillId: string, runId: string): Promise<EvalRun | null> {
    const entity = await this.runRepo.findOneBy({ id: runId, skillId });
    return entity ? this.toEvalRun(entity) : null;
  }

  async updateEvalRun(evalRun: EvalRun): Promise<EvalRun> {
    await this.runRepo.update(evalRun.id, {
      config: evalRun.config as any,
      prompt: evalRun.prompt,
      outputWithSkill: evalRun.outputWithSkill,
      outputWithoutSkill: evalRun.outputWithoutSkill ?? null,
      outputFiles: evalRun.outputFiles as any[],
      grading: evalRun.grading as any,
      timing: evalRun.timing as any,
      baselineTiming: evalRun.baselineTiming as any ?? null,
      baselineGrading: evalRun.baselineGrading as any ?? null,
      status: evalRun.status,
      error: evalRun.error ?? null,
      iteration: evalRun.iteration ?? 1,
      skillVersion: evalRun.skillVersion ?? null,
      completedAt: evalRun.completedAt ? new Date(evalRun.completedAt) : null,
    });
    const updated = await this.runRepo.findOneByOrFail({ id: evalRun.id });
    return this.toEvalRun(updated);
  }

  async deleteEvalRunBySkillAndId(skillId: string, runId: string): Promise<void> {
    await this.runRepo.delete({ id: runId, skillId });
  }

  async getEvalRunsByEvalIdAndSkill(skillId: string, evalId: string): Promise<EvalRun[]> {
    const entities = await this.runRepo.find({
      where: { skillId, evalId },
      order: { createdAt: 'DESC' },
    });
    return entities.map(e => this.toEvalRun(e));
  }

  // ─── Feedback ───────────────────────────────────────────────────────

  async saveFeedback(feedback: EvalFeedback): Promise<EvalFeedback> {
    // Upsert: check if feedback for this run+skill already exists
    const existing = await this.feedbackRepo.findOneBy({
      runId: feedback.runId,
      skillId: feedback.skillId,
    });

    if (existing) {
      existing.feedback = feedback.feedback;
      existing.rating = feedback.rating ?? null;
      existing.suggestedFix = feedback.suggestedFix ?? null;
      const saved = await this.feedbackRepo.save(existing);
      return this.toEvalFeedback(saved);
    }

    const entity = this.feedbackRepo.create({
      id: feedback.id || uuidv4(),
      runId: feedback.runId,
      skillId: feedback.skillId,
      feedback: feedback.feedback,
      rating: feedback.rating ?? null,
      suggestedFix: feedback.suggestedFix ?? null,
    });
    const saved = await this.feedbackRepo.save(entity);
    return this.toEvalFeedback(saved);
  }

  async getFeedbackBySkillAndRun(skillId: string, runId: string): Promise<EvalFeedback | null> {
    const entity = await this.feedbackRepo.findOneBy({ skillId, runId });
    return entity ? this.toEvalFeedback(entity) : null;
  }

  async getFeedbackBySkill(skillId: string): Promise<EvalFeedback[]> {
    const entities = await this.feedbackRepo.find({
      where: { skillId },
      order: { createdAt: 'DESC' },
    });
    return entities.map(e => this.toEvalFeedback(e));
  }

  async deleteFeedbackBySkillAndRun(skillId: string, runId: string): Promise<void> {
    await this.feedbackRepo.delete({ skillId, runId });
  }

  // ─── Benchmark Snapshots ────────────────────────────────────────────

  async saveBenchmarkSnapshot(skillId: string, benchmark: EvalBenchmark, version?: number): Promise<void> {
    await this.benchmarkRepo.upsert(
      {
        skillId,
        version: version ?? 0,
        data: benchmark as any,
      },
      ['skillId', 'version'],
    );
  }

  async getBenchmarkSnapshot(skillId: string, version?: number): Promise<EvalBenchmark | null> {
    const entity = await this.benchmarkRepo.findOneBy({
      skillId,
      version: version ?? 0,
    });
    return entity ? (entity.data as EvalBenchmark) : null;
  }

  async deleteBenchmarkSnapshots(skillId: string): Promise<void> {
    await this.benchmarkRepo.delete({ skillId });
  }

  // ─── Bulk Delete by Skill (cascade on skill deletion) ─────────────

  async deleteEvalCasesBySkill(skillId: string): Promise<void> {
    await this.caseRepo.delete({ skillId });
  }

  async deleteEvalRunsBySkill(skillId: string): Promise<void> {
    await this.runRepo.delete({ skillId });
  }

  async deleteFeedbackBySkill(skillId: string): Promise<void> {
    await this.feedbackRepo.delete({ skillId });
  }

  // ─── Mappers ────────────────────────────────────────────────────────

  private toEvalCase(entity: EvalCaseEntity): EvalCase {
    return {
      id: entity.id,
      skillId: entity.skillId,
      name: entity.name,
      prompt: entity.prompt,
      expectedOutput: entity.expectedOutput ?? undefined,
      assertions: entity.assertions as EvalAssertion[],
      context: entity.context ?? undefined,
      createdAtVersion: entity.createdAtVersion ?? undefined,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private toEvalRun(entity: EvalRunEntity): EvalRun {
    return {
      id: entity.id,
      evalId: entity.evalId,
      skillId: entity.skillId,
      config: entity.config as EvalRunConfig,
      prompt: entity.prompt,
      outputWithSkill: entity.outputWithSkill,
      outputWithoutSkill: entity.outputWithoutSkill ?? undefined,
      outputFiles: entity.outputFiles as EvalOutputFile[],
      grading: entity.grading as EvalGrading,
      timing: entity.timing as EvalTiming,
      baselineTiming: entity.baselineTiming as EvalTiming | undefined,
      baselineGrading: entity.baselineGrading as EvalGrading | undefined,
      status: entity.status,
      error: entity.error ?? undefined,
      iteration: entity.iteration ?? undefined,
      skillVersion: entity.skillVersion ?? undefined,
      createdAt: entity.createdAt.toISOString(),
      completedAt: entity.completedAt?.toISOString(),
    };
  }

  private toEvalFeedback(entity: EvalFeedbackEntity): EvalFeedback {
    return {
      id: entity.id,
      runId: entity.runId,
      skillId: entity.skillId,
      feedback: entity.feedback,
      rating: entity.rating ?? undefined,
      suggestedFix: entity.suggestedFix ?? undefined,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
