import { Expose, Exclude } from 'class-transformer';
import type { SkillFileItem } from '@skillspell/shared';

@Exclude()
export class MarketplaceSkillDetailDto {
  @Expose() skillId!: string;
  @Expose() submissionId!: string;
  @Expose() version!: string;
  @Expose() name!: string;
  @Expose() description!: string;
  @Expose() categories!: string[];
  @Expose() downloadCount!: number;
  @Expose() submittedAt!: string;
  @Expose() reviewedAt!: string | null;
  @Expose() submittedBy!: string;
  @Expose() submittedByName?: string;
  @Expose() upvoteCount!: number;
  @Expose() isUpvoted!: boolean;
  @Expose() isFavorited!: boolean;
  @Expose() skillContent!: string;
  @Expose() scripts!: SkillFileItem[];
  @Expose() references!: SkillFileItem[];
  @Expose() assets!: SkillFileItem[];
  @Expose() createdAt?: string;
  @Expose() updatedAt?: string;
}
