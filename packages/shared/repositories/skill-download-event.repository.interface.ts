export const SKILL_DOWNLOAD_EVENT_REPOSITORY = Symbol('SKILL_DOWNLOAD_EVENT_REPOSITORY');

export interface SkillDownloadEvent {
  id: string;
  skillId: string;
  version: string;
  downloadedAt: string;
}

export interface CreateSkillDownloadEventData {
  skillId: string;
  version: string;
}

export interface ISkillDownloadEventRepository {
  /** Record a download event. */
  create(data: CreateSkillDownloadEventData): Promise<SkillDownloadEvent>;
  /** Find all download events for a skill. */
  findBySkillId(skillId: string): Promise<SkillDownloadEvent[]>;
  /** Find all download events for a skill+version pair. */
  findBySkillIdAndVersion(skillId: string, version: string): Promise<SkillDownloadEvent[]>;
  /**
   * Return download counts grouped by version for the given skillId and versions list.
   * Executes a single GROUP BY query instead of one query per version.
   * Versions not present in the result have a count of 0.
   */
  countBySkillIdGroupedByVersion(skillId: string, versions: string[]): Promise<Map<string, number>>;
}
