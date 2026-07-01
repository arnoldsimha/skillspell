import { Expose, Exclude } from 'class-transformer';

@Exclude()
export class MarketplaceListItemDto {
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
}
