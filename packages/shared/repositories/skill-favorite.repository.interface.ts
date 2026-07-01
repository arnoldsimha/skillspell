export const SKILL_FAVORITE_REPOSITORY = 'SKILL_FAVORITE_REPOSITORY';

export interface SkillFavoriteItem {
  skillId: string;
  createdAt: string;
}

export interface ISkillFavoriteRepository {
  /** Toggle favorite for a user on a skill. Returns true if now favorited, false if removed. */
  toggle(skillId: string, userId: string): Promise<boolean>;
  /** Return up to limit favorites for a user, ordered by created_at DESC. */
  findByUser(userId: string, opts: { limit?: number; offset?: number }): Promise<SkillFavoriteItem[]>;
  /** Count total favorites for a user. */
  countByUser(userId: string): Promise<number>;
  /**
   * Count favorites for a user that have an active marketplace listing.
   * CR-005: use this for pagination total to avoid misleading counts from delisted skills.
   */
  countActiveByUser(userId: string, orgId: string): Promise<number>;
  /** Return skillIds the user has favorited, filtered to the provided list. */
  findSkillIdsByUser(userId: string, skillIds: string[]): Promise<string[]>;
}
