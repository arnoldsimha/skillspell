import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { stripHtml } from '../../common/utils/strip-html.js';

export class SaveFeedbackDto {
  @IsString()
  runId!: string;

  @Transform(({ value }) => stripHtml(value))
  @IsString()
  @MaxLength(200)
  feedback!: string;

  @IsOptional()
  @IsEnum(['good', 'bad', 'neutral'])
  rating?: 'good' | 'bad' | 'neutral';

  @IsOptional()
  @Transform(({ value }) => stripHtml(value))
  @IsString()
  @MaxLength(300)
  suggestedFix?: string;
}
