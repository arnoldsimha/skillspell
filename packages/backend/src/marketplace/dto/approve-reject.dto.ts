import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveRejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
