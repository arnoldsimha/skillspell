import { Expose, Exclude } from 'class-transformer';

@Exclude()
export class MySubmissionDto {
  @Expose() id!: string;
  @Expose() skillId!: string;
  @Expose() skillName!: string;
  @Expose() version!: string;
  @Expose() status!: string;
  @Expose() submittedBy!: string;
  @Expose() submittedAt!: string;
  @Expose() reviewNote!: string | null;
  @Expose() reviewedAt!: string | null;
  @Expose() removalReason!: string | null;
  @Expose() submitterNote!: string | null;
  // reviewedBy intentionally excluded — internal admin field
}
