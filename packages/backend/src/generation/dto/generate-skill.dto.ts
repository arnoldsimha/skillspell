import {
  IsString,
  IsNotEmpty,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeSkillName } from '../../common/utils/normalize-skill-name.js';

export class GenerateSkillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  prompt!: string;

  @Transform(({ value }) => normalizeSkillName(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9-]*$/, {
    message:
      'skillName must be lowercase, start with a letter, and contain only lowercase letters, numbers, and hyphens',
  })
  skillName!: string;
}
