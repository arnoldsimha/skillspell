import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  IAdminAnalyticsRepository,
  AnalyticsGranularity,
  AnalyticsDatePoint,
  AnalyticsFunnel,
  AnalyticsTopSkill,
  AnalyticsCategoryCount,
  AnalyticsKpiRaw,
} from '@skillspell/shared';

@Injectable()
export class PostgresAdminAnalyticsRepository implements IAdminAnalyticsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async getSkillsCreatedByDay(
    orgId: string,
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<AnalyticsDatePoint[]> {
    const rows: Array<{ date: string; count: string }> =
      await this.dataSource.manager.query(
        `SELECT DATE_TRUNC($1, s."createdAt")::text AS date, COUNT(*)::int AS count
         FROM skills s
         INNER JOIN users u ON u.id = s."ownerId"
         WHERE u."orgId" = $2
           AND s."createdAt" >= $3
           AND s."createdAt" < $4
         GROUP BY 1
         ORDER BY 1`,
        [granularity, orgId, from, to],
      );
    return rows.map(r => ({ date: r.date, count: Number(r.count) }));
  }

  async getDownloadsByDay(
    orgId: string,
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<AnalyticsDatePoint[]> {
    const rows: Array<{ date: string; count: string }> =
      await this.dataSource.manager.query(
        `SELECT DATE_TRUNC($1, de."downloadedAt")::text AS date, COUNT(*)::int AS count
         FROM skill_download_events de
         INNER JOIN skills s ON s.id = de."skillId"
         INNER JOIN users u ON u.id = s."ownerId"
         WHERE u."orgId" = $2
           AND de."downloadedAt" >= $3
           AND de."downloadedAt" < $4
         GROUP BY 1
         ORDER BY 1`,
        [granularity, orgId, from, to],
      );
    return rows.map(r => ({ date: r.date, count: Number(r.count) }));
  }

  async getSubmissionFunnel(
    orgId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsFunnel> {
    const rows: Array<{
      submitted: string;
      approved: string;
      rejected: string;
      pending: string;
    }> = await this.dataSource.manager.query(
      `SELECT
         COUNT(*)::int                                                       AS submitted,
         COUNT(*) FILTER (WHERE ms.status = 'approved')::int                AS approved,
         COUNT(*) FILTER (WHERE ms.status = 'rejected')::int                AS rejected,
         COUNT(*) FILTER (WHERE ms.status = 'pending_review')::int          AS pending
       FROM marketplace_submissions ms
       INNER JOIN users u ON u.id = ms."submittedBy"
       WHERE u."orgId" = $1
         AND ms."submittedAt" >= $2
         AND ms."submittedAt" < $3`,
      [orgId, from, to],
    );
    const r = rows[0] ?? { submitted: '0', approved: '0', rejected: '0', pending: '0' };
    return {
      submitted: Number(r.submitted),
      approved: Number(r.approved),
      rejected: Number(r.rejected),
      pending: Number(r.pending),
    };
  }

  async getTopSkills(
    orgId: string,
    from: Date,
    to: Date,
    limit: number,
  ): Promise<AnalyticsTopSkill[]> {
    const rows: Array<{ name: string; downloads: string }> =
      await this.dataSource.manager.query(
        `SELECT s.name, COUNT(de.id)::int AS downloads
         FROM skill_download_events de
         INNER JOIN skills s ON s.id = de."skillId"
         INNER JOIN users u ON u.id = s."ownerId"
         WHERE u."orgId" = $1
           AND de."downloadedAt" >= $2
           AND de."downloadedAt" < $3
         GROUP BY s.id, s.name
         ORDER BY downloads DESC
         LIMIT $4`,
        [orgId, from, to, limit],
      );
    return rows.map(r => ({ name: r.name, downloads: Number(r.downloads) }));
  }

  async getUserGrowthByDay(
    orgId: string,
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<AnalyticsDatePoint[]> {
    const rows: Array<{ date: string; count: string }> =
      await this.dataSource.manager.query(
        `SELECT DATE_TRUNC($1, u."createdAt")::text AS date, COUNT(*)::int AS count
         FROM users u
         WHERE u."orgId" = $2
           AND u."createdAt" >= $3
           AND u."createdAt" < $4
         GROUP BY 1
         ORDER BY 1`,
        [granularity, orgId, from, to],
      );
    return rows.map(r => ({ date: r.date, count: Number(r.count) }));
  }

  async getCategoryBreakdown(orgId: string): Promise<AnalyticsCategoryCount[]> {
    const rows: Array<{ name: string; count: string }> =
      await this.dataSource.manager.query(
        `SELECT c.name, COUNT(DISTINCT sc."skillId")::int AS count
         FROM categories c
         INNER JOIN skill_categories sc ON sc."categoryId" = c.id
         INNER JOIN skills s ON s.id = sc."skillId"
         INNER JOIN users u ON u.id = s."ownerId"
         WHERE u."orgId" = $1
           AND c."orgId" = $1
         GROUP BY c.id, c.name
         ORDER BY count DESC`,
        [orgId],
      );
    return rows.map(r => ({ name: r.name, count: Number(r.count) }));
  }

  async getKpiTotals(
    orgId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsKpiRaw> {
    const rows: Array<{
      totalSkillsCreated: string;
      totalDownloads: string;
      totalMembers: string;
      avgReviewHours: string | null;
    }> = await this.dataSource.manager.query(
      `SELECT
         (SELECT COUNT(*)::int
          FROM skills s INNER JOIN users u ON u.id = s."ownerId"
          WHERE u."orgId" = $1 AND s."createdAt" >= $2 AND s."createdAt" < $3
         ) AS "totalSkillsCreated",
         (SELECT COUNT(*)::int
          FROM skill_download_events de
          INNER JOIN skills s ON s.id = de."skillId"
          INNER JOIN users u ON u.id = s."ownerId"
          WHERE u."orgId" = $1 AND de."downloadedAt" >= $2 AND de."downloadedAt" < $3
         ) AS "totalDownloads",
         (SELECT COUNT(*)::int FROM users WHERE "orgId" = $1) AS "totalMembers",
         (SELECT COALESCE(
            EXTRACT(EPOCH FROM AVG(ms."reviewedAt" - ms."submittedAt")) / 3600, 0
          )
          FROM marketplace_submissions ms
          INNER JOIN users u ON u.id = ms."submittedBy"
          WHERE u."orgId" = $1
            AND ms."submittedAt" >= $2
            AND ms."submittedAt" < $3
            AND ms."reviewedAt" IS NOT NULL
         ) AS "avgReviewHours"`,
      [orgId, from, to],
    );
    const r = rows[0] ?? {
      totalSkillsCreated: '0',
      totalDownloads: '0',
      totalMembers: '0',
      avgReviewHours: '0',
    };
    return {
      totalSkillsCreated: Number(r.totalSkillsCreated),
      totalDownloads: Number(r.totalDownloads),
      totalMembers: Number(r.totalMembers),
      avgReviewHours: Number(r.avgReviewHours ?? 0),
    };
  }
}
