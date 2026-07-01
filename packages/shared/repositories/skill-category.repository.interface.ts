export const SKILL_CATEGORY_REPOSITORY = Symbol('SKILL_CATEGORY_REPOSITORY');

export interface SkillCategory {
  skillId: string;
  categoryId: string;
}

export interface ISkillCategoryRepository {
  /** Associate a skill with a category. No-op if already associated. */
  add(skillId: string, categoryId: string): Promise<void>;
  /** Remove association between a skill and a category. */
  remove(skillId: string, categoryId: string): Promise<void>;
  /** Get all category IDs associated with a skill. */
  findBySkillId(skillId: string): Promise<SkillCategory[]>;
  /** Get all skill IDs associated with a category. */
  findByCategoryId(categoryId: string): Promise<SkillCategory[]>;
  /** Replace all categories for a skill with the given list. */
  setForSkill(skillId: string, categoryIds: string[]): Promise<void>;
}
