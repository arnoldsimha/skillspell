import type {
  Skill,
  SkillSummary,
  CreateSkillData,
  UpdateSkillData,
  SkillVersionSnapshot,
  SkillVersionSummary,
  SkillDiagram,
} from '@skillspell/shared';

export const SKILL_REPOSITORY = Symbol('SKILL_REPOSITORY');

export interface SkillWithOwnerOrgId {
  skill: Skill;
  ownerOrgId: string;
}

export interface ISkillRepository {
  create(skill: CreateSkillData): Promise<Skill>;
  findById(id: string): Promise<Skill | null>;
  /**
   * Fetch a skill and its owner's orgId in a single JOIN query.
   * Returns null if the skill does not exist.
   * Used by assertSkillBelongsToOrg to replace two serial queries.
   */
  findSkillWithOwnerOrgId(skillId: string): Promise<SkillWithOwnerOrgId | null>;
  /**
   * Find a skill by ID returning only lightweight metadata.
   *
   * Only includes summary fields (id, ownerId, name, description, status,
   * version, timestamps). Heavy content fields (skillContent, scripts,
   * references, assets) are NOT loaded from the database.
   */
  findMetadataById(id: string): Promise<SkillSummary | null>;
  /**
   * Find a skill by name scoped to a specific owner.
   *
   * Names are unique per-owner (not globally). The DB enforces this via
   * a UNIQUE constraint on (ownerId, name).
   */
  findByName(name: string, ownerId: string): Promise<Skill | null>;
  /**
   * List all skills as lightweight summaries.
   *
   * Only includes summary fields (id, name, description, status, version,
   * timestamps). Heavy content fields (skillContent, scripts, references,
   * assets) are NOT available on the returned objects.
   */
  findAll(): Promise<SkillSummary[]>;
  /**
   * List skills owned by a specific user as lightweight summaries.
   */
  findByOwner(userId: string): Promise<SkillSummary[]>;
  update(id: string, data: UpdateSkillData): Promise<Skill>;
  delete(id: string): Promise<void>;
  incrementVersion(id: string): Promise<Skill>;
  /** Atomically update skill fields AND increment version in a single atomic operation. */
  updateAndIncrementVersion(id: string, data: UpdateSkillData): Promise<Skill>;

  /** Save a snapshot of the current skill state before mutation. */
  saveVersionSnapshot(skill: Skill, explanation?: string): Promise<void>;
  /** List all version summaries for a skill, ordered by version ascending. */
  getVersionHistory(skillId: string): Promise<SkillVersionSummary[]>;
  /** Get a full version snapshot by skill ID and version number. */
  getVersionSnapshot(
    skillId: string,
    version: number,
  ): Promise<SkillVersionSnapshot | null>;
  /** Delete all version snapshots for a skill (used when deleting a skill). */
  deleteVersionSnapshots(skillId: string): Promise<void>;

  /** Get cached diagram for a specific skill version. */
  getDiagram(skillId: string, version: number): Promise<SkillDiagram | null>;
  /** Save/overwrite a diagram for a specific skill version. */
  saveDiagram(diagram: SkillDiagram): Promise<void>;
  /** Delete all diagrams for a skill (used when deleting a skill). */
  deleteDiagrams(skillId: string): Promise<void>;

  /**
   * List published skills with optional name search and offset/limit pagination.
   * Returns only skills where isPublished = true.
   */
  findPublished(limit: number, offset: number, search?: string): Promise<SkillSummary[]>;

  /** Return the category slugs associated with a skill. */
  findCategorySlugsBySkillId(skillId: string): Promise<string[]>;
}
