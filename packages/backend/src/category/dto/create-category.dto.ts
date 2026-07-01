import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, numbers, and hyphens' })
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
