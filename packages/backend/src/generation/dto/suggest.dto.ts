import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SuggestDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['create', 'optimize'])
  mode!: 'create' | 'optimize';

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  partialInput?: string;

  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  skillName?: string;
}
