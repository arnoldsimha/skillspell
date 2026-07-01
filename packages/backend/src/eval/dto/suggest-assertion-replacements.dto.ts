import { IsArray, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Aligned with EvalAssertionDto (the canonical create/update limits) so an
// assertion that was validly saved can always be sent back here for "Fix with AI".
const ASSERTION_VALUE_MAX = 1_000;
const ASSERTION_DESCRIPTION_MAX = 500;

class NonDiscriminatingAssertionDto {
  @IsString()
  @MaxLength(ASSERTION_VALUE_MAX, {
    message: `Assertion value is too long (maximum ${ASSERTION_VALUE_MAX} characters).`,
  })
  assertionValue!: string;

  @IsString()
  @MaxLength(50)
  assertionType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ASSERTION_DESCRIPTION_MAX, {
    message: `Assertion description is too long (maximum ${ASSERTION_DESCRIPTION_MAX} characters).`,
  })
  description?: string;

  @IsNumber()
  withSkillPassRate!: number;

  @IsNumber()
  baselinePassRate!: number;
}

export class SuggestAssertionReplacementsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NonDiscriminatingAssertionDto)
  assertions!: NonDiscriminatingAssertionDto[];
}
