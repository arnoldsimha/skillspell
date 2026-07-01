export const SKILL_UPVOTE_REPOSITORY = 'SKILL_UPVOTE_REPOSITORY';

export interface ISkillUpvoteRepository {
  /** Toggle upvote for a user on a skill. Returns true if now upvoted, false if removed. */
  toggle(skillId: string, userId: string): Promise<boolean>;
  /** Count all upvotes for a skill. */
  countBySkillId(skillId: string): Promise<number>;
  /** Return skillIds the user has upvoted, filtered to the provided list. */
  findSkillIdsByUser(userId: string, skillIds: string[]): Promise<string[]>;
}
