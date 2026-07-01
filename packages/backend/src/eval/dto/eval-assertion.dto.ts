import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

export class EvalAssertionDto {
  @IsEnum(['contains', 'not_contains', 'regex', 'semantic', 'custom'])
  type!: 'contains' | 'not_contains' | 'regex' | 'semantic' | 'custom';

  @IsString()
  @MaxLength(1_000)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
