import { IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GapItemDto {
  @IsIn(['input-length', 'negative-cases', 'edge-cases', 'assertion-diversity', 'expected-output'])
  dimension!: string;

  @IsIn(['high', 'medium'])
  severity!: 'high' | 'medium';

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsString()
  @MaxLength(1000)
  suggestionPrompt!: string;
}

export class SuggestGapCountsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GapItemDto)
  gaps!: GapItemDto[];
}
