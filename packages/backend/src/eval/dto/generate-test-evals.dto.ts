import { IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

export class GenerateTestEvalsDto {
  @IsInt()
  @Min(1)
  @Max(50)
  count!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverageHint?: string;
}
