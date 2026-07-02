import { Injectable, Inject, NotFoundException, ConflictException, Logger, InternalServerErrorException } from '@nestjs/common';
import { formatError } from '../common/utils/format-error.js';
import {
  SKILL_REPOSITORY,
  type ISkillRepository,
  type Skill,
  type SkillWithSession,
  type SkillDiagram,
  type GenerateSkillRequest,
  type SuggestionItem,
  type OptimizeDraftResponse,
  type SkillFileItem,
  type SkillGenerationResult,
  isAtLeast,
} from '@skillspell/shared';
import { SkillGenerationService } from './skill/skill-generation.service.js';
import { SkillValidatorService } from './skill/skill-validator.service.js';
import { DiagramService } from './skill/diagram.service.js';
import { SessionService } from './session/session.service.js';
import { RequestContext } from '../common/context/request-context.service.js';
import { OwnershipService } from '../ownership/ownership.service.js';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  /** In-flight diagram generation promises, keyed by `skillId:version`. */
  private readonly diagramInflight = new Map<string, Promise<SkillDiagram>>();

  /** In-flight skill generation dedup map, keyed by `userId:skillName`. */
  private readonly generateInflight = new Map<string, Promise<SkillWithSession>>();

  constructor(
    private readonly skillGenService: SkillGenerationService,
    private readonly skillValidator: SkillValidatorService,
    private readonly diagramService: DiagramService,
    private readonly sessionService: SessionService,
    @Inject(SKILL_REPOSITORY)
    private readonly skillRepo: ISkillRepository,
    private readonly ctx: RequestContext,
    private readonly ownershipService: OwnershipService,
  ) {}

  /**
   * Run validation on a generated/refined skill and attach issues to the result.
   * Non-blocking: validation failures are returned as warnings, not thrown.
   */
  private attachValidation(result: SkillGenerationResult): SkillGenerationResult {
    try {
      const { issues } = this.skillValidator.validate(result);
      if (issues.length > 0) {
        result.validationIssues = issues;
      }
    } catch (error) {
      this.logger.warn(`Skill validation failed unexpectedly: ${formatError(error)}`);
    }
    return result;
  }

  /**
   * Generate a new skill from a user prompt.
   * The skill is automatically saved to the database.
   * Conversation history is saved to PostgreSQL for future refinements.
   */
  async generateSkill(
    request: GenerateSkillRequest,
  ): Promise<SkillWithSession> {
    // Deduplicate concurrent generation requests for the same skill name.
    // If a user double-clicks "Generate", the second request returns the same promise
    // instead of firing a duplicate LLM call.
    const dedupKey = `${this.ctx.userId}:${request.skillName.toLowerCase()}`;
    const inflight = this.generateInflight.get(dedupKey);
    if (inflight) {
      this.logger.log(
        `Deduplicating generation request for "${request.skillName}" (already in-flight)`,
      );
      return inflight;
    }

    const promise = this.doGenerateSkill(request);
    this.generateInflight.set(dedupKey, promise);
    try {
      return await promise;
    } finally {
      this.generateInflight.delete(dedupKey);
    }
  }

  private async doGenerateSkill(
    request: GenerateSkillRequest,
  ): Promise<SkillWithSession> {
    this.logger.log(
      `Generating skill from prompt: "${request.prompt.substring(0, 80)}..."`,
    );

    // Check that the user-provided name is unique (per-owner) BEFORE running the expensive generation.
    // This is a fast-path check; the DB composite unique constraint is the authoritative guard.
    const existing = await this.skillRepo.findByName(request.skillName, this.ctx.userId);
    if (existing) {
      throw new ConflictException(
        `A skill named "${request.skillName}" already exists. Please choose a different name.`,
      );
    }

    // Include the user-chosen skill name in the prompt so the LLM aligns content to it
    const promptWithName = `Skill name: ${request.skillName}\n\n${request.prompt}`;
    const result = this.attachValidation(
      await this.skillGenService.generateSkill(promptWithName, request.signal),
    );

    // Use the user-provided skillName (not the LLM-generated name).
    // Wrap in try/catch to convert DB unique-constraint violations into a friendly 409.
    let saved: Skill;
    try {
      saved = await this.skillRepo.create({
        ownerId: this.ctx.userId,
        name: request.skillName,
        description: result.description,
        skillContent: result.skillContent,
        scripts: result.scripts || [],
        references: result.references || [],
        assets: result.assets || [],
        status: 'ready',
      });
    } catch (error: unknown) {
      // TypeORM throws QueryFailedError with code '23505' for unique-constraint violations (PostgreSQL).
      const err = error as Record<string, unknown>;
      if (err?.code === '23505') {
        throw new ConflictException(
          `A skill named "${request.skillName}" already exists. Please choose a different name.`,
        );
      }
      this.logger.error(`Failed to save skill "${request.skillName}": ${formatError(error)}`);
      throw new InternalServerErrorException('Failed to save generated skill.');
    }

    this.logger.log(`Skill "${saved.name}" auto-saved with id: ${saved.id}`);

    // Save the user prompt as session history for future refinements.
    // The assistant response (skill JSON) is already on the Skill row — no need to duplicate it.
    try {
      await this.sessionService.saveUserPrompt(saved.id, request.prompt);
    } catch (error) {
      // Non-fatal: session history is a nice-to-have for refinement quality
      this.logger.warn(
        `Failed to save session history for skill ${saved.id}: ${formatError(error)}`,
      );
    }

    return {
      ...saved,
      explanation: result.explanation,
      stats: result.stats,
      validationIssues: result.validationIssues,
    };
  }

  /**
   * Refine an existing skill.
   *
   * Loads conversation history from PostgreSQL and injects it into the prompt
   * so Claude has full context of prior interactions. Falls back to injecting
   * the current skill data if no history is available.
   *
   * The skill is automatically updated in the database after refinement.
   * Version is bumped when refining an already-saved skill.
   *
   * Version snapshots are saved both before and after the change,
   * enabling users to compare what changed between versions.
   *
   * Ownership is enforced by SkillOwnerGuard via @CheckOwnership on the route.
   */
  async refineSkill(
    skillId: string,
    refinement: string,
    signal?: AbortSignal,
  ): Promise<SkillWithSession> {
    // Run independent DB reads in parallel to save 20-100ms latency.
    // All three queries are independent — they don't depend on each other's results.
    const [existing, existingSnapshots, conversationHistory] = await Promise.all([
      this.skillRepo.findById(skillId),
      this.skillRepo.getVersionHistory(skillId),
      this.sessionService.loadHistory(skillId).catch((error) => {
        this.logger.warn(
          `Failed to load session history for skill ${skillId}: ${formatError(error)}`,
        );
        return [] as Array<{ role: 'user' | 'assistant'; content: string }>;
      }),
    ]);

    if (!existing) {
      throw new NotFoundException(`Skill with id "${skillId}" not found`);
    }

    this.logger.log(
      `Loaded ${conversationHistory.length} history message(s) for skill "${existing.name}" (${skillId})`,
    );

    // Save a snapshot of the CURRENT (pre-refinement) state if one doesn't exist yet.
    // This ensures we always have a "before" snapshot for comparison, even for
    // skills created before the version snapshot feature was added.
    const hasCurrentVersionSnapshot = existingSnapshots.some(
      (s) => s.version === existing.version,
    );
    if (!hasCurrentVersionSnapshot) {
      await this.skillRepo.saveVersionSnapshot(existing);
    }

    this.logger.log(
      `Refining skill "${existing.name}" (${skillId}), history: ${conversationHistory.length} messages`,
    );

    const result = this.attachValidation(
      await this.skillGenService.refineSkill(
        existing,
        refinement,
        conversationHistory,
        signal,
      ),
    );

    // Atomically update fields AND increment version in a single database call.
    // This eliminates the race condition where two concurrent refinements could
    // each read the same version, both write, then both increment — losing one update.
    const updated = await this.skillRepo.updateAndIncrementVersion(skillId, {
      name: existing.name,
      description: result.description,
      skillContent: result.skillContent,
      scripts: result.scripts || [],
      references: result.references || [],
      assets: result.assets || [],
    });

    // Save a version snapshot of the NEW state (after increment)
    await this.skillRepo.saveVersionSnapshot(updated, result.explanation);

    // Save the refinement prompt to session history.
    // The assistant response is already on the version-snapshot row.
    try {
      await this.sessionService.saveUserPrompt(skillId, refinement);
    } catch (error) {
      this.logger.warn(
        `Failed to save session history for skill ${skillId}: ${formatError(error)}`,
      );
    }

    this.logger.log(
      `Skill "${updated.name}" auto-updated after refinement (v${updated.version})`,
    );

    return {
      ...updated,
      explanation: result.explanation,
      stats: result.stats,
      validationIssues: result.validationIssues,
    };
  }

  /**
   * Generate an optimization draft WITHOUT saving to the database.
   *
   * This is used by the optimizer to let users iterate on refinements
   * in-memory. Only when the user clicks "Approve" is the result saved
   * as a new version (via SkillsService.approveOptimization).
   *
   * If `draftContext` is provided, it represents the current in-memory
   * draft from a previous iteration. Otherwise, the persisted skill is used.
   *
   * Ownership is enforced by SkillOwnerGuard via @CheckOwnership on the route.
   */
  async optimizeDraft(
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
    // Guard provides metadata-only. Fetch full skill for content.
    const existing = await this.skillRepo.findById(skillId);
    if (!existing) {
      throw new NotFoundException(`Skill with id "${skillId}" not found`);
    }

    // Use draft context if provided (subsequent refinement), otherwise use the DB state.
    // We construct a virtual Skill object so the SkillGenerationService can use it interchangeably.
    const skillData: Skill = draftContext
      ? {
          ...existing,
          name: draftContext.name,
          description: draftContext.description,
          skillContent: draftContext.skillContent,
          scripts: draftContext.scripts,
          references: draftContext.references,
          assets: draftContext.assets,
        }
      : existing;

    // Load conversation history from PostgreSQL for context
    let conversationHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
    }> = [];
    try {
      conversationHistory = await this.sessionService.loadHistory(skillId);
      this.logger.log(
        `Loaded ${conversationHistory.length} history message(s) for draft optimization of "${skillData.name}" (${skillId})`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to load session history for skill ${skillId}: ${formatError(error)}`,
      );
    }

    this.logger.log(
      `Generating optimization draft for "${skillData.name}" (${skillId}), history: ${conversationHistory.length} messages`,
    );

    const result = this.attachValidation(
      await this.skillGenService.refineSkill(
        skillData,
        refinement,
        conversationHistory,
        signal,
      ),
    );

    // Return draft result WITHOUT saving to DB or incrementing version
    return {
      name: draftContext?.name ?? existing.name,
      description: result.description,
      skillContent: result.skillContent,
      scripts: result.scripts || [],
      references: result.references || [],
      assets: result.assets || [],
      explanation: result.explanation,
      stats: result.stats,
      validationIssues: result.validationIssues,
    };
  }

  /**
   * Generate smart context-aware suggestions.
   *
   * Always fetches fresh suggestions from the AI — no caching.
   * For optimize mode, passes the full skill context (name, description,
   * skillContent, version) so suggestions are tailored to the specific skill.
   */
  async suggestPrompts(
    mode: 'create' | 'optimize',
    partialInput?: string,
    skillId?: string,
    skillName?: string,
  ): Promise<SuggestionItem[]> {
    let skillContext:
      | {
          name: string;
          description: string;
          skillContent: string;
          version: number;
        }
      | undefined;

    if (mode === 'optimize' && skillId) {
      // Enforce ownership before loading private skill content. Unlike the
      // sibling routes (refine, optimize-draft), skillId arrives in the request
      // body — not a route param — so the @CheckOwnership/SkillOwnerGuard path
      // never fires here. Privileged roles (admin and above — i.e. platform
      // owner) bypass; everyone else must own the skill (throws Forbidden/
      // NotFound otherwise). Uses the role hierarchy (isAtLeast) rather than a
      // raw `=== 'admin'` check so the higher-privileged owner role is not
      // accidentally locked out. Without this, any authenticated user could
      // pass another user's skill id and receive LLM suggestions derived from
      // that skill's private content.
      if (!isAtLeast(this.ctx.userRole, 'admin')) {
        await this.ownershipService.assertOwnership(skillId);
      }
      const existing = await this.skillRepo.findById(skillId);
      if (existing) {
        skillContext = {
          name: existing.name,
          description: existing.description,
          skillContent: existing.skillContent,
          version: existing.version,
        };
        this.logger.log(
          `Generating suggestions for skill "${existing.name}" v${existing.version}`,
        );
      }
    }

    return this.skillGenService.suggestPrompts(
      mode,
      partialInput,
      skillContext,
      skillName,
    );
  }

  /**
   * Get or generate a Mermaid diagram for a skill.
   *
   * Version-aware caching:
   * - Checks PostgreSQL for a cached diagram matching the current skill version
   * - If cached, returns immediately (no LLM call)
   * - If stale or missing, generates via the light model and caches
   *
   * Ownership is enforced by SkillOwnerGuard via @CheckOwnership on the route.
   */
  async generateDiagram(
    skillId: string,
    force = false,
    version?: number,
  ): Promise<SkillDiagram> {
    // Guard provides metadata-only. Fetch full skill for content.
    const existing = await this.skillRepo.findById(skillId);
    if (!existing) {
      throw new NotFoundException(`Skill with id "${skillId}" not found`);
    }

    // Determine which version to generate for
    let targetVersion = existing.version;
    let diagramSkill: Skill = existing;

    if (version != null && version !== existing.version) {
      // Load historical version snapshot for diagram generation
      const snapshot = await this.skillRepo.getVersionSnapshot(skillId, version);
      if (!snapshot) {
        throw new NotFoundException(
          `Version ${version} not found for skill "${skillId}"`,
        );
      }
      targetVersion = version;
      // Build a Skill-like object from the snapshot for diagram generation
      diagramSkill = {
        ...existing,
        skillContent: snapshot.skillContent,
        scripts: snapshot.scripts,
        references: snapshot.references,
        assets: snapshot.assets,
        version: snapshot.version,
        description: snapshot.description,
      };
    }

    // Force-regenerate: skip both cache check and dedup map — generate fresh immediately.
    if (force) {
      this.logger.log(
        `Force-regenerating diagram for skill "${existing.name}" v${targetVersion}`,
      );
      return this.doGenerateDiagram(skillId, diagramSkill);
    }

    // Check for cached diagram at the target version.
    const cached = await this.skillRepo.getDiagram(skillId, targetVersion);
    if (cached) {
      this.logger.log(
        `Returning cached diagram for skill "${existing.name}" v${targetVersion}`,
      );
      return cached;
    }

    // Deduplicate concurrent requests for the same skill version.
    // React StrictMode (and other scenarios) can trigger duplicate calls.
    const inflightKey = `${skillId}:${targetVersion}`;
    const inflight = this.diagramInflight.get(inflightKey);
    if (inflight) {
      this.logger.log(
        `Deduplicating diagram request for skill "${existing.name}" v${targetVersion} — returning in-flight promise`,
      );
      return inflight;
    }

    // Generate a new diagram — wrap in a promise and track it
    const promise = this.doGenerateDiagram(skillId, diagramSkill);
    this.diagramInflight.set(inflightKey, promise);

    try {
      return await promise;
    } finally {
      this.diagramInflight.delete(inflightKey);
    }
  }

  /** Internal: performs the actual diagram generation and caching. */
  private async doGenerateDiagram(
    skillId: string,
    existing: Skill,
  ): Promise<SkillDiagram> {
    this.logger.log(
      `Generating diagram for skill "${existing.name}" v${existing.version}`,
    );

    const { mermaid, summary } = await this.diagramService.generateDiagram({
      name: existing.name,
      description: existing.description,
      skillContent: existing.skillContent,
    });

    const diagram: SkillDiagram = {
      skillId,
      version: existing.version,
      mermaid,
      summary,
      createdAt: new Date().toISOString(),
    };

    // Save to cache (non-blocking — diagram generation succeeded)
    await this.skillRepo.saveDiagram(diagram);

    return diagram;
  }

}
